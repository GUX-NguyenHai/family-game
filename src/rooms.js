// Quản lý phòng + sự kiện socket, dùng chung cho mọi game. Mọi dữ liệu chỉ nằm trong RAM, tắt server là mất.
// Luật chơi nằm trong games/<id>/service; ở đây chỉ chạy vòng lặp và chuyển tin giữa game, màn hình chung và điện thoại:
//   điện thoại → 'game:input' (type, data) → match.input()
//   match.hostState() → 'game:state' (màn hình chung), match.playerState() → 'game:me' (từng điện thoại)
//   api.toHost()/api.toPlayer() → 'game:event'; api.finish(results) → kết thúc ván
const crypto = require('crypto');
const C = require('./config');
const games = require('./games');
const license = require('./license');
const manifest = require('../public/assets/animals.json');

const ANIMAL_IDS = manifest.animals.map(a => a.id);
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const BOT_NAMES = ['Bot Tèo', 'Bot Tí', 'Bot Sửu', 'Bot Dần', 'Bot Mão', 'Bot Thìn', 'Bot Tỵ', 'Bot Ngọ'];
const PLAYING = new Set(['countdown', 'playing']);

const rooms = new Map();
const licenseRooms = new Map(); // mã Pro (id) → mã phòng đang dùng nó; mỗi mã chỉ cho 1 phòng

function makeCode() {
  let code;
  do {
    code = Array.from({ length: 4 }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join('');
  } while (rooms.has(code));
  return code;
}

function cleanCode(code) {
  const c = String(code || '').trim().toUpperCase();
  return /^[A-Z]{4}$/.test(c) ? c : null;
}

function cleanId(id) {
  const s = String(id || '');
  return /^[A-Za-z0-9-]{8,64}$/.test(s) ? s : null;
}

function cleanName(name) {
  return String(name || '').replace(/\s+/g, ' ').trim().slice(0, 14) || 'Người chơi';
}

function cleanAnimal(animal) {
  return ANIMAL_IDS.includes(animal) ? animal : ANIMAL_IDS[0];
}

function createRoom(code, token) {
  const room = {
    code,
    token,
    state: 'lobby', // lobby | countdown | playing | finished
    players: new Map(),
    gameId: games.defaultId(),
    options: {}, // tuỳ chọn đã chọn cho từng game: { race: { difficulty: 'easy' }, ... }
    match: null, // ván đang chơi (do game tạo)
    matchGame: null,
    matchSeq: 0, // tăng mỗi ván, để tin nhắn của ván cũ không lọt sang ván mới
    startAt: 0,
    results: null,
    loop: null,
    tick: 0,
    lastTick: 0,
    finishedAt: 0,
    lastActive: Date.now(),
    license: null, // { id, expiresAt, players } khi đã nhập mã Pro
    tierMax: C.FREE_MAX_PLAYERS, // giới hạn theo gói; giới hạn thật = min(gói, game)
  };
  rooms.set(code, room);
  return room;
}

// Game đang chọn của phòng. Game vừa bị xoá ở /admin thì phòng chuyển về game mặc định.
function gameOf(room) {
  let game = games.get(room.gameId);
  if (!game) {
    room.gameId = games.defaultId();
    game = games.get(room.gameId);
  }
  return game;
}

function optionsOf(room) {
  room.options[room.gameId] ??= games.defaultOptions(gameOf(room));
  return room.options[room.gameId];
}

function maxPlayersOf(room) {
  return Math.min(room.tierMax, gameOf(room).maxPlayers || C.PRO_MAX_PLAYERS);
}

function releaseLicense(room) {
  if (!room.license) return;
  if (licenseRooms.get(room.license.id) === room.code) licenseRooms.delete(room.license.id);
  room.license = null;
  room.tierMax = C.FREE_MAX_PLAYERS;
}

// Gắn mã Pro cho phòng. Mã đang ở phòng khác mà màn hình phòng đó vẫn mở thì từ chối;
// phòng kia đã đóng màn hình thì chuyển mã sang phòng này.
function applyLicense(io, room, input) {
  const v = license.verifyCode(input);
  if (!v.ok) return v;
  const holder = licenseRooms.get(v.id);
  if (holder && holder !== room.code) {
    const other = rooms.get(holder);
    if (other && hostCount(io, other) > 0) return { ok: false, error: 'in-use' };
    if (other) {
      releaseLicense(other);
      broadcastRoom(io, other);
    }
  }
  if (room.license && room.license.id !== v.id) releaseLicense(room);
  room.license = { id: v.id, expiresAt: v.expiresAt, players: v.players };
  room.tierMax = Math.min(C.PRO_MAX_PLAYERS, Math.max(C.FREE_MAX_PLAYERS, v.players));
  licenseRooms.set(v.id, room.code);
  broadcastRoom(io, room);
  return { ok: true, code: v.code, expiresAt: v.expiresAt, maxPlayers: room.tierMax };
}

// Mã hết hạn giữa chừng thì phòng trở về bản miễn phí.
function checkLicenseExpiry(io, room, now = Date.now()) {
  if (room.license?.expiresAt && now >= room.license.expiresAt) {
    releaseLicense(room);
    broadcastRoom(io, room);
    return true;
  }
  return false;
}

function pickColor(room) {
  const used = new Set([...room.players.values()].map(p => p.color));
  return C.COLORS.find(c => !used.has(c)) || C.COLORS[room.players.size % C.COLORS.length];
}

// teamCount: số đội game đang dùng; người đang ở đội ngoài số đó (VD đội Vàng khi game chỉ có Đỏ/Xanh) coi như chưa chọn đội.
function publicPlayer(p, teamCount = C.TEAMS.length) {
  return {
    id: p.id,
    name: p.name,
    animal: p.animal,
    color: p.color,
    bot: !!p.bot,
    connected: !!(p.bot || p.connected),
    inGame: !!p.inGame,
    team: p.team != null && p.team < teamCount ? p.team : null,
    prefs: p.prefs || {},
  };
}

// ---------- Đội ----------

function teamModeOf(room) {
  return games.teamMode(gameOf(room), optionsOf(room));
}

function cleanTeam(team, count = C.TEAMS.length) {
  const n = Number(team);
  return Number.isInteger(n) && n >= 0 && n < count ? n : null;
}

// Người đang ở đội mà game hiện tại không dùng thì bỏ chọn đội.
function normalizeTeams(list, rule) {
  for (const p of list) if (p.team != null && p.team >= rule.count) p.team = null;
}

// Lựa chọn riêng của người chơi cho từng game (VD loại thuyền). Chỉ nhận chuỗi ngắn, game tự kiểm tra giá trị.
function cleanPrefs(input) {
  const out = {};
  if (!input || typeof input !== 'object') return out;
  for (const [k, v] of Object.entries(input).slice(0, 12)) {
    if (/^[a-zA-Z0-9_-]{1,24}$/.test(k) && typeof v === 'string' && v.length <= 32) out[k] = v;
  }
  return out;
}

function teamSizes(list) {
  const sizes = C.TEAMS.map(() => 0);
  for (const p of list) if (p.team != null) sizes[p.team]++;
  return sizes;
}

// Người chưa chọn đội thì cho vào đội đang ít người nhất. Số đội dùng = max(2, số đội đã có người,
// số đội cần để không đội nào quá đông), VD 5 người → 3 + 2, 9 người → 3 + 3 + 3.
// list: những người tính vào đội; targets: những người cần xếp (mặc định cả list).
function fillTeams(list, rule, targets = list) {
  normalizeTeams(list, rule);
  const sizes = teamSizes(list).slice(0, rule.count);
  const used = sizes.map((n, t) => (n > 0 ? t : -1)).filter(t => t >= 0);
  const want = Math.min(rule.count, Math.max(2, used.length, Math.ceil(list.length / rule.max)));
  const active = [...used];
  for (let t = 0; t < sizes.length && active.length < want; t++) if (!active.includes(t)) active.push(t);
  for (const p of targets) {
    if (p.team != null) continue;
    let best = active[0];
    for (const t of active) if (sizes[t] < sizes[best]) best = t;
    p.team = best;
    sizes[best]++;
  }
}

// Chia ngẫu nhiên: số đội ít nhất có thể sao cho mỗi đội không quá max người (tối thiểu 2 đội).
function shuffleTeams(list, rule) {
  const order = [...list].sort(() => Math.random() - 0.5);
  const count = Math.min(rule.count, Math.max(2, Math.ceil(order.length / rule.max)));
  order.forEach((p, i) => (p.team = i % count));
}

// Kiểm tra đội trước khi bắt đầu. Trả về null nếu ổn, hoặc lỗi để báo chủ phòng.
function teamProblem(list, rule) {
  const sizes = teamSizes(list).filter(n => n > 0);
  const info = { error: 'teams', min: rule.min, max: rule.max };
  if (sizes.length < 2) return { ...info, reason: 'need-two' };
  if (sizes.some(n => n < rule.min || n > rule.max)) return { ...info, reason: 'size' };
  if (rule.equal && sizes.some(n => n !== sizes[0])) return { ...info, reason: 'equal' };
  return null;
}

function teamRuleOf(room) {
  const t = gameOf(room).teams || {};
  return {
    min: t.min || 1,
    max: t.max || C.PRO_MAX_PLAYERS,
    count: Math.min(C.TEAMS.length, t.count || C.TEAMS.length),
    equal: !!t.equal,
  };
}

function roomInfo(room) {
  const game = gameOf(room);
  const options = optionsOf(room);
  const rule = teamRuleOf(room);
  return {
    code: room.code,
    state: room.state,
    game: game.id,
    gameName: game.name,
    gameEmoji: game.emoji || '🎮',
    sensors: !!game.sensors,
    goText: game.goText || 'BẮT ĐẦU!',
    options,
    optionsText: games.optionsText(game, options),
    preview: game.preview ? game.preview(options) : null,
    startIn: room.state === 'countdown' ? Math.max(0, room.startAt - Date.now()) : 0,
    teamMode: teamModeOf(room),
    teamRule: rule,
    teams: C.TEAMS.slice(0, rule.count),
    maxPlayers: maxPlayersOf(room),
    tier: room.license ? 'pro' : 'free',
    proUntil: room.license?.expiresAt ?? null,
    players: [...room.players.values()].map(p => publicPlayer(p, rule.count)),
    results: room.results,
  };
}

function hostCount(io, room) {
  return io.sockets.adapter.rooms.get(`h:${room.code}`)?.size || 0;
}

function broadcastRoom(io, room) {
  const info = roomInfo(room);
  io.to(`h:${room.code}`).emit('room', info);
  io.to(`p:${room.code}`).emit('room', info);
}

// Lỗi trong code của một game không được làm sập cả server.
function safe(room, what, fn) {
  try {
    return fn();
  } catch (err) {
    console.error(`[${room.code}] Lỗi game ${room.matchGame?.id || room.gameId} (${what}):`, err);
    return undefined;
  }
}

function stopLoop(room) {
  if (room.loop) clearInterval(room.loop);
  room.loop = null;
}

function endMatch(room) {
  stopLoop(room);
  if (room.match) safe(room, 'stop', () => room.match.stop?.());
  room.match = null;
  room.matchGame = null;
  room.matchSeq++;
}

// Cổng để game gửi tin ra ngoài. Ván đã kết thúc/bị thay thì mọi lời gọi bị bỏ qua.
function makeApi(io, room, seq) {
  const live = () => room.matchSeq === seq;
  return {
    toHost(msg) {
      if (live()) io.to(`h:${room.code}`).emit('game:event', msg);
    },
    toPlayer(pid, msg) {
      if (!live()) return;
      const p = room.players.get(pid);
      if (p?.socketId) io.to(p.socketId).emit('game:event', msg);
    },
    toPlayers(msg) {
      if (live()) io.to(`p:${room.code}`).emit('game:event', msg);
    },
    finish(results) {
      if (live() && room.state !== 'finished') finishMatch(io, room, results);
    },
  };
}

function startGame(io, room) {
  if (PLAYING.has(room.state)) return { ok: false, error: 'busy' };
  checkLicenseExpiry(io, room);
  const game = gameOf(room);
  const list = [...room.players.values()].filter(p => p.bot || p.connected);
  if (!list.length) return { ok: false, error: 'empty' };
  if (list.length < (game.minPlayers || 1)) return { ok: false, error: 'too-few', minPlayers: game.minPlayers };
  if (list.length > maxPlayersOf(room)) return { ok: false, error: 'too-many', maxPlayers: maxPlayersOf(room) };
  const teamMode = teamModeOf(room);
  const rule = teamRuleOf(room);
  if (teamMode) {
    fillTeams(list, rule);
    const problem = teamProblem(list, rule);
    if (problem) {
      broadcastRoom(io, room); // cho thấy đội vừa được tự xếp
      return { ok: false, ...problem };
    }
  }

  endMatch(room);
  for (const p of room.players.values()) p.inGame = false;
  for (const p of list) p.inGame = true;
  const now = Date.now();
  room.startAt = now + (game.countdownMs ?? C.DEFAULT_COUNTDOWN_MS);
  room.state = 'countdown';
  room.results = null;
  room.tick = 0;
  room.lastTick = now;
  room.lastSent = new Map(); // tin gửi lần trước (để bỏ tin trùng), làm mới mỗi ván
  room.matchGame = game;
  const match = safe(room, 'createMatch', () =>
    game.createMatch({
      players: list.map(p => publicPlayer(p, teamMode ? rule.count : 0)),
      options: { ...optionsOf(room) },
      teams: teamMode ? C.TEAMS.slice(0, rule.count) : null, // null = không chơi theo đội
      now,
      startAt: room.startAt,
      api: makeApi(io, room, room.matchSeq),
    }),
  );
  if (!match) {
    backToLobby(io, room);
    return { ok: false, error: 'game-error' };
  }
  room.match = match;

  io.to(`h:${room.code}`).emit('game:setup', safe(room, 'setup', () => match.setup?.()) ?? null);
  broadcastRoom(io, room);
  room.loop = setInterval(() => tick(io, room), 1000 / (game.tickHz || C.DEFAULT_TICK_HZ));
  return { ok: true };
}

function backToLobby(io, room) {
  endMatch(room);
  room.state = 'lobby';
  room.results = null;
  for (const p of room.players.values()) p.inGame = false;
  broadcastRoom(io, room);
}

function finishMatch(io, room, results) {
  const now = Date.now();
  room.state = 'finished';
  room.finishedAt = now;
  room.results = (Array.isArray(results) ? results : []).map((r, i) => ({
    id: r.id,
    name: r.name,
    animal: r.animal,
    color: r.color,
    bot: !!r.bot,
    place: r.place ?? i + 1,
    detail: r.detail ?? '',
    members: Array.isArray(r.members) ? r.members : undefined, // kết quả theo đội: id các thành viên
  }));
  broadcastRoom(io, room);
}

// Không gửi lại tin giống hệt lần trước (VD mọi người đứng yên, đã về đích); vẫn gửi lại mỗi RESEND_MS
// để máy vừa nối lại chắc chắn có dữ liệu. data là Buffer (nhị phân) hoặc object (JSON).
const RESEND_MS = 1000;
function shouldSend(room, key, data, now) {
  room.lastSent ??= new Map();
  const prev = room.lastSent.get(key);
  const body = Buffer.isBuffer(data) ? data : JSON.stringify(data);
  const same = prev && (Buffer.isBuffer(body) ? Buffer.isBuffer(prev.body) && body.equals(prev.body) : body === prev.body);
  if (same && now - prev.at < RESEND_MS) return false;
  room.lastSent.set(key, { body, at: now });
  return true;
}

function tick(io, room) {
  const match = room.match;
  const game = room.matchGame;
  if (!match || !game) return stopLoop(room);

  const now = Date.now();
  const dt = Math.min(0.1, (now - room.lastTick) / 1000);
  room.lastTick = now;
  room.tick++;

  if (room.state === 'countdown' && now >= room.startAt) {
    room.state = 'playing';
    safe(room, 'begin', () => match.begin?.(now));
    broadcastRoom(io, room);
  }

  safe(room, 'tick', () => match.tick?.(now, dt));
  if (room.match !== match) return; // ván bị huỷ trong lúc tick

  if (match.hostState && room.tick % (game.hostEvery || 1) === 0) {
    const s = safe(room, 'hostState', () => match.hostState(now));
    if (s && shouldSend(room, 'host', s, now)) io.to(`h:${room.code}`).emit('game:state', s);
  }
  if (match.playerState && room.tick % (game.playerEvery || 1) === 0) {
    for (const p of room.players.values()) {
      if (!p.inGame || !p.socketId) continue;
      const m = safe(room, 'playerState', () => match.playerState(p.id, now));
      if (m && shouldSend(room, `p:${p.id}`, m, now)) io.to(p.socketId).emit('game:me', m);
    }
  }

  if (room.state === 'finished' && now - room.finishedAt >= (game.coastMs || 0)) stopLoop(room);
}

function addBot(io, room) {
  if (!gameOf(room).bots || room.players.size >= maxPlayersOf(room)) return;
  const used = new Set([...room.players.values()].map(p => p.name));
  const name = BOT_NAMES.find(n => !used.has(n)) || `Bot ${room.players.size + 1}`;
  const id = 'bot-' + crypto.randomUUID();
  const bot = {
    id,
    name,
    animal: ANIMAL_IDS[Math.floor(Math.random() * ANIMAL_IDS.length)],
    color: pickColor(room),
    bot: true,
    connected: true,
    socketId: null,
    inGame: false,
    team: null,
    prefs: {},
  };
  room.players.set(id, bot);
  if (teamModeOf(room)) fillTeams([...room.players.values()], teamRuleOf(room), [bot]);
  broadcastRoom(io, room);
}

function removeBots(room) {
  for (const [id, p] of room.players) if (p.bot) room.players.delete(id);
}

function attach(io) {
  io.on('connection', socket => {
    const reply = (ack, data) => typeof ack === 'function' && ack(data);

    function joinAsHost(room) {
      socket.join(`h:${room.code}`);
      socket.data = { role: 'host', code: room.code };
      room.lastActive = Date.now();
    }

    function hostRoom() {
      if (socket.data?.role !== 'host') return null;
      return rooms.get(socket.data.code) || null;
    }

    function playerCtx() {
      if (socket.data?.role !== 'player') return {};
      const room = rooms.get(socket.data.code);
      const p = room?.players.get(socket.data.playerId);
      return room && p ? { room, p } : {};
    }

    function hostReply(room, licenseError) {
      return {
        ok: true,
        code: room.code,
        token: room.token,
        games: games.catalog(),
        categories: C.GAME_CATEGORIES,
        room: roomInfo(room),
        setup: room.match ? safe(room, 'setup', () => room.match.setup?.()) ?? null : null,
        licenseError,
      };
    }

    // Màn hình host đã từng nhập mã Pro (lưu ở trình duyệt) thì gắn lại cho phòng mới/phòng dựng lại.
    function restoreLicense(room, input) {
      if (!input || room.license) return null;
      const r = applyLicense(io, room, input);
      return r.ok ? null : r.error;
    }

    socket.on('host:create', (payload, ack) => {
      if (rooms.size >= C.MAX_ROOMS) return reply(ack, { ok: false, error: 'busy' });
      const room = createRoom(makeCode(), crypto.randomUUID());
      if (games.get(payload?.game)) room.gameId = payload.game;
      joinAsHost(room);
      reply(ack, hostReply(room, restoreLicense(room, payload?.license)));
    });

    // Màn hình host tải lại trang, hoặc server vừa khởi động lại: dựng lại phòng với mã cũ.
    socket.on('host:resume', (payload, ack) => {
      const code = cleanCode(payload?.code);
      const token = String(payload?.token || '');
      if (!code || !token) return reply(ack, { ok: false });
      let room = rooms.get(code);
      if (room && room.token !== token) return reply(ack, { ok: false });
      if (!room) {
        if (rooms.size >= C.MAX_ROOMS) return reply(ack, { ok: false, error: 'busy' });
        room = createRoom(code, token);
        if (games.get(payload?.game)) room.gameId = payload.game;
      }
      joinAsHost(room);
      reply(ack, hostReply(room, restoreLicense(room, payload?.license)));
    });

    // Nhập mã Pro; gửi mã rỗng để gỡ mã (về bản miễn phí).
    socket.on('host:license', (payload, ack) => {
      const room = hostRoom();
      if (!room) return reply(ack, { ok: false, error: 'no-room' });
      const input = String(payload?.code || '').trim();
      if (!input) {
        releaseLicense(room);
        broadcastRoom(io, room);
        return reply(ack, { ok: true, removed: true });
      }
      reply(ack, applyLicense(io, room, input));
    });

    socket.on('host:start', (_payload, ack) => {
      const room = hostRoom();
      reply(ack, room ? startGame(io, room) : { ok: false, error: 'no-room' });
    });

    // Chủ phòng chọn game (ở phòng chờ hoặc lúc xem kết quả; đang xem kết quả thì về phòng chờ).
    socket.on('host:game', id => {
      const room = hostRoom();
      const game = games.get(String(id));
      if (!room || !game || PLAYING.has(room.state)) return;
      if (room.state !== 'lobby') backToLobby(io, room);
      room.gameId = game.id;
      if (!game.bots) removeBots(room);
      broadcastRoom(io, room);
    });

    // Chủ phòng chọn tuỳ chọn của game (VD độ khó). Không đổi được khi đang chơi.
    socket.on('host:option', payload => {
      const room = hostRoom();
      const key = String(payload?.key || '');
      const value = String(payload?.value ?? '');
      if (!room || PLAYING.has(room.state) || !games.isChoice(gameOf(room), key, value)) return;
      optionsOf(room)[key] = value;
      broadcastRoom(io, room);
    });

    socket.on('host:lobby', () => {
      const room = hostRoom();
      if (room) backToLobby(io, room);
    });

    socket.on('host:addBot', () => {
      const room = hostRoom();
      if (room && room.state === 'lobby') addBot(io, room);
    });

    socket.on('host:clearBots', () => {
      const room = hostRoom();
      if (!room || room.state !== 'lobby') return;
      removeBots(room);
      broadcastRoom(io, room);
    });

    socket.on('host:kick', id => {
      const room = hostRoom();
      const p = room?.players.get(String(id));
      if (!p || room.state !== 'lobby') return;
      room.players.delete(p.id);
      if (p.socketId) io.to(p.socketId).emit('kicked');
      broadcastRoom(io, room);
    });

    // Chủ phòng đổi đội cho 1 người (VD bot): team = số đội, hoặc null để bỏ chọn.
    socket.on('host:team', payload => {
      const room = hostRoom();
      const p = room?.players.get(String(payload?.id));
      if (!p || room.state !== 'lobby') return;
      p.team = cleanTeam(payload?.team, teamRuleOf(room).count);
      broadcastRoom(io, room);
    });

    socket.on('host:shuffleTeams', () => {
      const room = hostRoom();
      if (!room || room.state !== 'lobby' || !teamModeOf(room)) return;
      shuffleTeams([...room.players.values()].filter(p => p.bot || p.connected), teamRuleOf(room));
      broadcastRoom(io, room);
    });

    // Người chơi tự chọn đội (ở phòng chờ).
    socket.on('player:team', team => {
      const { room, p } = playerCtx();
      if (!p || room.state !== 'lobby') return;
      p.team = cleanTeam(team, teamRuleOf(room).count);
      broadcastRoom(io, room);
    });

    // Lựa chọn riêng cho game (VD loại thuyền). Gửi cả bộ, ghép vào bộ cũ.
    socket.on('player:prefs', prefs => {
      const { room, p } = playerCtx();
      if (!p) return;
      p.prefs = { ...(p.prefs || {}), ...cleanPrefs(prefs) };
      broadcastRoom(io, room);
    });

    socket.on('player:join', (payload, ack) => {
      const code = cleanCode(payload?.code);
      const room = code && rooms.get(code);
      if (!room) return reply(ack, { ok: false, error: 'no-room' });

      const id = cleanId(payload?.playerId) || crypto.randomUUID();
      const name = cleanName(payload?.name);
      const animal = cleanAnimal(payload?.animal);
      let p = room.players.get(id);

      if (!p) {
        if (room.players.size >= maxPlayersOf(room)) {
          return reply(ack, { ok: false, error: 'full', tier: room.license ? 'pro' : 'free', maxPlayers: maxPlayersOf(room) });
        }
        p = { id, name, animal, color: pickColor(room), bot: false, inGame: false, team: null, prefs: {} };
        room.players.set(id, p);
      } else if (!p.inGame || room.state === 'lobby') {
        p.name = name;
        p.animal = animal;
      }
      p.prefs = { ...(p.prefs || {}), ...cleanPrefs(payload?.prefs) };

      if (p.socketId && p.socketId !== socket.id) io.to(p.socketId).emit('replaced');
      p.socketId = socket.id;
      p.connected = true;
      p.leftAt = 0;
      room.lastActive = Date.now();

      socket.join(`p:${room.code}`);
      socket.data = { role: 'player', code: room.code, playerId: p.id };
      reply(ack, { ok: true, playerId: p.id, color: p.color, room: roomInfo(room) });
      broadcastRoom(io, room);
    });

    // Mọi thao tác trong game đi qua đây; game tự hiểu type/data.
    socket.on('game:input', (type, data) => {
      const { room, p } = playerCtx();
      if (!p || !p.inGame || !room.match || typeof type !== 'string' || type.length > 24) return;
      const match = room.match;
      safe(room, 'input', () => match.input?.(p.id, type, data, Date.now()));
    });

    socket.on('disconnect', () => {
      if (socket.data?.role !== 'player') return;
      const room = rooms.get(socket.data.code);
      const p = room?.players.get(socket.data.playerId);
      if (!p || p.socketId !== socket.id) return;
      p.socketId = null;
      p.connected = false;
      p.leftAt = Date.now();
      if (p.inGame && room.match) {
        const match = room.match;
        safe(room, 'leave', () => match.leave?.(p.id));
      }
      broadcastRoom(io, room);
    });
  });

  // Dọn dẹp: người rời phòng chờ quá lâu, phòng không còn ai.
  setInterval(() => {
    const now = Date.now();
    for (const room of rooms.values()) {
      let changed = false;
      for (const [id, p] of room.players) {
        if (!p.bot && !p.connected && !p.inGame && now - p.leftAt > C.PLAYER_DROP_MS) {
          room.players.delete(id);
          changed = true;
        }
      }
      const anyone = hostCount(io, room) > 0 || [...room.players.values()].some(p => !p.bot && p.connected);
      if (anyone) room.lastActive = now;
      else if (now - room.lastActive > C.ROOM_IDLE_MS) {
        endMatch(room);
        releaseLicense(room);
        rooms.delete(room.code);
        continue;
      }
      if (checkLicenseExpiry(io, room, now)) changed = false; // đã broadcast rồi
      if (changed) broadcastRoom(io, room);
    }
  }, 30000).unref();
}

module.exports = { attach };

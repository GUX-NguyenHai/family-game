// Quản lý phòng + sự kiện socket. Mọi dữ liệu chỉ nằm trong RAM, tắt server là mất.
const crypto = require('crypto');
const C = require('./config');
const game = require('./game');
const license = require('./license');
const manifest = require('../public/assets/animals.json');

const ANIMAL_IDS = manifest.animals.map(a => a.id);
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const BOT_NAMES = ['Bot Tèo', 'Bot Tí', 'Bot Sửu', 'Bot Dần', 'Bot Mão', 'Bot Thìn', 'Bot Tỵ', 'Bot Ngọ'];

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
    state: 'lobby', // lobby | countdown | racing | finished
    players: new Map(),
    race: null,
    results: null,
    loop: null,
    tick: 0,
    lastTick: 0,
    finishedAt: 0,
    lastActive: Date.now(),
    license: null, // { id, expiresAt, players } khi đã nhập mã Pro
    maxPlayers: C.FREE_MAX_PLAYERS,
    difficulty: C.DEFAULT_DIFFICULTY,
  };
  rooms.set(code, room);
  return room;
}

function releaseLicense(room) {
  if (!room.license) return;
  if (licenseRooms.get(room.license.id) === room.code) licenseRooms.delete(room.license.id);
  room.license = null;
  room.maxPlayers = C.FREE_MAX_PLAYERS;
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
  room.maxPlayers = Math.min(C.PRO_MAX_PLAYERS, Math.max(C.FREE_MAX_PLAYERS, v.players));
  licenseRooms.set(v.id, room.code);
  broadcastRoom(io, room);
  return { ok: true, code: v.code, expiresAt: v.expiresAt, maxPlayers: room.maxPlayers };
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

function publicPlayer(p) {
  return {
    id: p.id,
    name: p.name,
    animal: p.animal,
    color: p.color,
    bot: !!p.bot,
    connected: !!(p.bot || p.connected),
    inRace: !!p.inRace,
  };
}

function roomInfo(room) {
  return {
    code: room.code,
    state: room.state,
    trackLen: room.race?.trackLen ?? C.DIFFICULTIES[room.difficulty].TRACK_LEN,
    difficulty: room.difficulty,
    maxPlayers: room.maxPlayers,
    tier: room.license ? 'pro' : 'free',
    proUntil: room.license?.expiresAt ?? null,
    players: [...room.players.values()].map(publicPlayer),
    results: room.results,
  };
}

function raceInfo(room) {
  const r = room.race;
  if (!r) return null;
  return {
    level: r.level,
    width: r.width,
    trackLen: r.trackLen,
    jumpMs: C.JUMP_MS,
    obstacles: r.obstacles,
    taken: [...r.taken],
    racers: racersOf(room).map(p => p.id),
  };
}

function racersOf(room) {
  return [...room.players.values()].filter(p => p.inRace);
}

function hostCount(io, room) {
  return io.sockets.adapter.rooms.get(`h:${room.code}`)?.size || 0;
}

function broadcastRoom(io, room) {
  const info = roomInfo(room);
  io.to(`h:${room.code}`).emit('room', info);
  io.to(`p:${room.code}`).emit('room', info);
}

function stopLoop(room) {
  if (room.loop) clearInterval(room.loop);
  room.loop = null;
}

function startRace(io, room) {
  if (room.state === 'countdown' || room.state === 'racing') return { ok: false, error: 'busy' };
  checkLicenseExpiry(io, room);
  const racers = [...room.players.values()].filter(p => p.bot || p.connected);
  if (!racers.length) return { ok: false, error: 'empty' };
  if (racers.length > room.maxPlayers) return { ok: false, error: 'too-many', maxPlayers: room.maxPlayers };

  for (const p of room.players.values()) p.inRace = false;
  const now = Date.now();
  room.race = game.createRace(racers, now, room.difficulty);
  room.state = 'countdown';
  room.results = null;
  room.tick = 0;
  room.lastTick = now;

  io.to(`h:${room.code}`).emit('race', raceInfo(room));
  broadcastRoom(io, room);
  stopLoop(room);
  room.loop = setInterval(() => tick(io, room), 1000 / C.TICK_HZ);
  return { ok: true };
}

function backToLobby(io, room) {
  stopLoop(room);
  room.state = 'lobby';
  room.race = null;
  room.results = null;
  for (const p of room.players.values()) p.inRace = false;
  broadcastRoom(io, room);
}

function finishRace(io, room, now) {
  const racers = racersOf(room);
  room.race.endedAt = now;
  room.state = 'finished';
  room.finishedAt = now;
  room.results = game.results(racers, room.race.trackLen);
  broadcastRoom(io, room);
}

function tick(io, room) {
  const race = room.race;
  if (!race) return stopLoop(room);

  const now = Date.now();
  const dt = Math.min(0.1, (now - room.lastTick) / 1000);
  room.lastTick = now;
  room.tick++;
  const racers = racersOf(room);

  if (room.state === 'countdown' && now >= race.startAt) {
    room.state = 'racing';
    broadcastRoom(io, room);
  }

  for (const p of racers) {
    if (p.bot && game.botThink(race, p, now, dt, racers)) io.to(`h:${room.code}`).emit('fx', { pid: p.id, type: 'turbo' });
  }

  const events = game.step(race, racers, now, dt);
  for (const e of events) {
    if (e.type !== 'manaFull') io.to(`h:${room.code}`).emit('fx', e);
    const p = room.players.get(e.pid);
    if (p && p.socketId) io.to(p.socketId).emit('hit', e);
  }

  if (room.state === 'racing' && game.isOver(race, racers, now)) finishRace(io, room, now);

  io.to(`h:${room.code}`).emit('state', {
    state: room.state,
    cd: Math.max(0, race.startAt - now),
    el: Math.max(0, now - race.startAt),
    taken: race.taken.size ? [...race.taken] : undefined,
    p: racers.map(p => ({
      id: p.id,
      x: Math.round(p.x * 100) / 100,
      z: Math.round(p.z * 100) / 100,
      sp: Math.round(p.speed * 10) / 10,
      f: game.flagsOf(p, now),
      r: p.rank,
    })),
  });

  if (room.tick % C.PLAYER_UPDATE_EVERY === 0) {
    const order = game.standings(racers);
    order.forEach((p, i) => {
      if (!p.socketId) return;
      io.to(p.socketId).emit('me', {
        state: room.state,
        cd: Math.max(0, race.startAt - now),
        pos: i + 1,
        total: order.length,
        prog: Math.min(1, p.z / race.trackLen),
        pw: Math.round(p.power * 100) / 100,
        mn: Math.round(p.mana * 100) / 100,
        f: game.flagsOf(p, now),
        rank: p.rank,
      });
    });
  }

  if (room.state === 'finished' && now - room.finishedAt > C.COAST_MS) stopLoop(room);
}

function addBot(io, room) {
  if (room.players.size >= room.maxPlayers) return;
  const used = new Set([...room.players.values()].map(p => p.name));
  const name = BOT_NAMES.find(n => !used.has(n)) || `Bot ${room.players.size + 1}`;
  const id = 'bot-' + crypto.randomUUID();
  room.players.set(id, {
    id,
    name,
    animal: ANIMAL_IDS[Math.floor(Math.random() * ANIMAL_IDS.length)],
    color: pickColor(room),
    bot: true,
    botSkill: 0.45 + Math.random() * 0.45,
    botLane: 0,
    connected: true,
    socketId: null,
    inRace: false,
  });
  broadcastRoom(io, room);
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

    // Màn hình host đã từng nhập mã Pro (lưu ở trình duyệt) thì gắn lại cho phòng mới/phòng dựng lại.
    function restoreLicense(room, input) {
      if (!input || room.license) return null;
      const r = applyLicense(io, room, input);
      return r.ok ? null : r.error;
    }

    socket.on('host:create', (payload, ack) => {
      if (rooms.size >= C.MAX_ROOMS) return reply(ack, { ok: false, error: 'busy' });
      const room = createRoom(makeCode(), crypto.randomUUID());
      joinAsHost(room);
      const licenseError = restoreLicense(room, payload?.license);
      reply(ack, { ok: true, code: room.code, token: room.token, room: roomInfo(room), race: null, licenseError });
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
      }
      joinAsHost(room);
      const licenseError = restoreLicense(room, payload?.license);
      reply(ack, { ok: true, code: room.code, token: room.token, room: roomInfo(room), race: raceInfo(room), licenseError });
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
      reply(ack, room ? startRace(io, room) : { ok: false, error: 'no-room' });
    });

    // Chủ phòng chọn độ khó (chỉ đổi được ở phòng chờ hoặc lúc xem kết quả).
    socket.on('host:difficulty', level => {
      const room = hostRoom();
      if (!room || !game.isLevel(level)) return;
      if (room.state === 'countdown' || room.state === 'racing') return;
      room.difficulty = level;
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
      for (const [id, p] of room.players) if (p.bot) room.players.delete(id);
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

    socket.on('player:join', (payload, ack) => {
      const code = cleanCode(payload?.code);
      const room = code && rooms.get(code);
      if (!room) return reply(ack, { ok: false, error: 'no-room' });

      const id = cleanId(payload?.playerId) || crypto.randomUUID();
      const name = cleanName(payload?.name);
      const animal = cleanAnimal(payload?.animal);
      let p = room.players.get(id);

      if (!p) {
        if (room.players.size >= room.maxPlayers) {
          return reply(ack, { ok: false, error: 'full', tier: room.license ? 'pro' : 'free', maxPlayers: room.maxPlayers });
        }
        p = { id, name, animal, color: pickColor(room), bot: false, inRace: false };
        room.players.set(id, p);
      } else if (!p.inRace || room.state === 'lobby') {
        p.name = name;
        p.animal = animal;
      }

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

    socket.on('steer', v => {
      const { p } = playerCtx();
      if (!p || !p.inRace) return;
      const n = Number(v);
      p.steer = Number.isFinite(n) ? Math.max(-1, Math.min(1, n)) : 0;
    });

    socket.on('shake', strength => {
      const { room, p } = playerCtx();
      if (!p || !p.inRace) return;
      game.shake(room.race, p, strength, Date.now());
    });

    socket.on('turbo', () => {
      const { room, p } = playerCtx();
      if (!p || !p.inRace) return;
      if (game.turbo(room.race, p, Date.now())) io.to(`h:${room.code}`).emit('fx', { pid: p.id, type: 'turbo' });
    });

    socket.on('jump', () => {
      const { room, p } = playerCtx();
      if (!p || !p.inRace) return;
      if (game.jump(room.race, p, Date.now())) io.to(`h:${room.code}`).emit('fx', { pid: p.id, type: 'jump' });
    });

    socket.on('disconnect', () => {
      if (socket.data?.role !== 'player') return;
      const room = rooms.get(socket.data.code);
      const p = room?.players.get(socket.data.playerId);
      if (!p || p.socketId !== socket.id) return;
      p.socketId = null;
      p.connected = false;
      p.steer = 0;
      p.leftAt = Date.now();
      broadcastRoom(io, room);
    });
  });

  // Dọn dẹp: người rời phòng chờ quá lâu, phòng không còn ai.
  setInterval(() => {
    const now = Date.now();
    for (const room of rooms.values()) {
      let changed = false;
      for (const [id, p] of room.players) {
        if (!p.bot && !p.connected && !p.inRace && now - p.leftAt > C.PLAYER_DROP_MS) {
          room.players.delete(id);
          changed = true;
        }
      }
      const anyone = hostCount(io, room) > 0 || [...room.players.values()].some(p => !p.bot && p.connected);
      if (anyone) room.lastActive = now;
      else if (now - room.lastActive > C.ROOM_IDLE_MS) {
        stopLoop(room);
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

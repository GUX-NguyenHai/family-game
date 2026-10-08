// Mô phỏng một ván nhảy dây. Không biết gì về socket hay đồ hoạ.
// Mọi người nhảy chung 1 sợi dây. rev = số vòng dây đã quay (số nguyên = dây đang chạm đất).
// Mỗi lần dây chạm đất (lúc T) xét từng người: có nhảy trong khoảng an toàn quanh T thì qua, không thì bị loại (1 mạng).
// Ván chia màn: countdown → playing (màn) → break (nghỉ, sang màn khó hơn) → playing … → finished.
const CONFIG = require('./config');

const DIFFICULTY_META = new Set(['label', 'desc']);

function rand(a, b) {
  return a + Math.random() * (b - a);
}

function randInt(a, b) {
  return Math.floor(rand(a, b + 1));
}

function isLevel(level) {
  return Object.prototype.hasOwnProperty.call(CONFIG.DIFFICULTIES, level);
}

// Tham số chung + phần ghi đè của mức độ.
function settingsFor(level) {
  const key = isLevel(level) ? level : CONFIG.DEFAULT_DIFFICULTY;
  const over = Object.fromEntries(Object.entries(CONFIG.DIFFICULTIES[key]).filter(([k]) => !DIFFICULTY_META.has(k)));
  return { ...CONFIG, ...over, difficulty: key };
}

// Cách quay dây của màn `level` (1, 2, …). Quá danh sách thì lấy màn cuối, nhanh thêm mỗi màn.
function levelSpec(C, level) {
  const base = C.LEVELS[Math.min(level, C.LEVELS.length) - 1];
  const faster = Math.max(0, level - C.LEVELS.length) * C.FASTER_PER_LEVEL;
  return {
    title: level > C.LEVELS.length ? 'Nhanh hơn nữa' : base.title,
    periods: base.periods.map(p => Math.max(C.MIN_PERIOD, p - faster)),
    changeEvery: base.changeEvery || null,
    holdChance: base.holdChance || 0,
    holdMs: base.holdMs || 0,
  };
}

// Tên các màn từ màn bắt đầu tới màn cuối (TV hiện lúc nghỉ giữa màn).
function levelTitles(C) {
  const out = {};
  for (let l = 1; l <= C.MAX_LEVEL; l++) out[l] = levelSpec(C, l).title;
  return out;
}

// players: [{ id, name, animal, color, bot }].
function createGame({ players, difficulty, now, startAt }) {
  const C = settingsFor(difficulty);
  const jumpers = players.map(p => ({
    id: p.id,
    name: p.name,
    animal: p.animal,
    color: p.color,
    bot: !!p.bot,
    jumps: [], // các lần nhảy gần nhất (lúc server nhận)
    lastJumpAt: -Infinity,
    count: 0, // số lần nhảy qua dây
    out: false,
    outPass: 0, // bị loại ở lần dây chạm đất thứ mấy (để xếp hạng)
    outLevel: 0,
    botMiss: rand(0.6, 1.4), // bot: hệ số hay hụt
    botPass: -1, // bot: đã xử lý lần dây chạm đất nào
    botAim: null, // bot: nhảy khi còn bấy nhiêu ms nữa dây chạm đất
    botSkip: false,
  }));
  return {
    cfg: C,
    phase: 'countdown',
    startAt: startAt ?? now + C.COUNTDOWN_MS,
    level: C.START_LEVEL,
    spec: levelSpec(C, C.START_LEVEL),
    levelEndAt: 0,
    breakUntil: 0,
    stopAfterPass: 0, // hết giờ màn: xét xong lần chạm đất này thì nghỉ
    rev: 0,
    period: 1.6,
    factor: 1, // 1 = quay thường; HOLD_FACTOR = đang "dừng hẫng"
    holdUntil: 0,
    changeLeft: 0, // còn bấy nhiêu vòng nữa thì đổi nhịp
    pass: 0, // số lần dây đã chạm đất
    pending: [], // [{ T, pass }] lần chạm đất chờ xét (đợi SAFE_AFTER_MS cho tin nhảy tới trễ)
    jumpers,
    byId: new Map(jumpers.map(p => [p.id, p])),
    endedAt: null,
  };
}

function aliveOf(g) {
  return g.jumpers.filter(p => !p.out);
}

// Tốc độ dây hiện tại (vòng/giây).
function rateOf(g) {
  return g.phase === 'playing' ? g.factor / g.period : 0;
}

function startLevel(g, now) {
  const C = g.cfg;
  g.phase = 'playing';
  g.spec = levelSpec(C, g.level);
  g.levelEndAt = now + C.LEVEL_MS;
  g.stopAfterPass = 0;
  g.period = g.spec.periods[0];
  g.changeLeft = g.spec.changeEvery ? randInt(...g.spec.changeEvery) : 0;
  g.factor = 1;
  g.holdUntil = 0;
}

// Dây vừa lên tới đỉnh đầu: lúc đổi nhịp hoặc "dừng hẫng" (người chơi thấy trước nửa vòng).
function atTop(g, now) {
  const s = g.spec;
  if (s.periods.length > 1 && s.changeEvery && --g.changeLeft <= 0) {
    const others = s.periods.filter(p => p !== g.period);
    g.period = others[Math.floor(Math.random() * others.length)] ?? g.period;
    g.changeLeft = randInt(...s.changeEvery);
  }
  if (s.holdChance && Math.random() < s.holdChance) {
    g.factor = g.cfg.HOLD_FACTOR;
    g.holdUntil = now + s.holdMs;
  }
}

function finish(g, now, events) {
  if (g.phase === 'finished') return;
  g.phase = 'finished';
  g.endedAt = now;
  events.push({ type: 'end' });
}

function eliminate(g, p, events) {
  p.out = true;
  p.outPass = g.pass;
  p.outLevel = g.level;
  events.push({ type: 'out', pid: p.id });
}

// Còn ≤ 1 người (chơi đông) hoặc hết người (chơi một mình) thì hết ván.
function checkEnd(g, now, events) {
  const alive = aliveOf(g).length;
  if (g.jumpers.length >= 2 ? alive <= 1 : alive === 0) finish(g, now, events);
}

// Xét một lần dây chạm đất lúc T.
function judge(g, item, now, events) {
  const C = g.cfg;
  for (const p of aliveOf(g)) {
    const ok = p.jumps.some(t => t >= item.T - C.SAFE_BEFORE_MS && t <= item.T + C.SAFE_AFTER_MS);
    if (ok) p.count++;
    else eliminate(g, p, events);
  }
  checkEnd(g, now, events);
  if (g.phase !== 'playing' || item.pass !== g.stopAfterPass) return;
  // Hết giờ màn mà vẫn còn người.
  if (g.level >= C.MAX_LEVEL) {
    finish(g, now, events);
  } else {
    g.phase = 'break';
    g.breakUntil = now + C.BREAK_MS;
    g.level++;
    g.spec = levelSpec(C, g.level);
    events.push({ type: 'level', level: g.level });
  }
}

function step(g, now, dt) {
  const C = g.cfg;
  const events = [];

  if (g.phase === 'countdown' && now >= g.startAt) startLevel(g, now);
  else if (g.phase === 'break' && now >= g.breakUntil) startLevel(g, now);

  if (g.phase === 'playing') {
    if (g.holdUntil && now >= g.holdUntil) {
      g.factor = 1;
      g.holdUntil = 0;
    }
    const before = g.rev;
    const rate = rateOf(g);
    g.rev += rate * dt;
    if (Math.floor(g.rev - 0.5) > Math.floor(before - 0.5)) atTop(g, now);
    if (Math.floor(g.rev) > Math.floor(before)) {
      // Dây chạm đất giữa 2 tick: tính ngược lúc chạm.
      const T = now - ((g.rev - Math.floor(g.rev)) / rate) * 1000;
      g.pass++;
      g.pending.push({ T, pass: g.pass });
      if (!g.stopAfterPass && now >= g.levelEndAt) g.stopAfterPass = g.pass;
    }
  }

  while (g.pending.length && now >= g.pending[0].T + C.SAFE_AFTER_MS && g.phase === 'playing') {
    judge(g, g.pending.shift(), now, events);
  }
  if (g.phase !== 'playing') g.pending = [];
  if (g.phase === 'playing' || g.phase === 'break') checkEnd(g, now, events); // có người rời phòng
  return events;
}

// Người chơi nhảy (hất/giật máy lên). Trả về true nếu được tính.
function jump(g, p, now) {
  if (p.out || g.phase !== 'playing') return false;
  if (now - p.lastJumpAt < g.cfg.JUMP_COOLDOWN_MS) return false;
  p.lastJumpAt = now;
  p.jumps.push(now);
  if (p.jumps.length > 4) p.jumps.shift();
  return true;
}

// Người chơi rời phòng giữa ván: coi như bị loại lúc đó.
function leave(g, p) {
  if (p.out || g.phase === 'finished') return [];
  const events = [];
  eliminate(g, p, events);
  return events;
}

// Bot: mỗi lần dây sắp chạm đất thì nhảy trước một chút, thỉnh thoảng hụt (màn càng khó càng hay hụt).
// Trả về true nếu bot vừa nhảy.
function botThink(g, p, now) {
  if (g.phase !== 'playing' || p.out) return false;
  const next = Math.floor(g.rev) + 1;
  if (p.botPass === next) return false;
  if (p.botAim == null) {
    const B = g.cfg.BOT;
    p.botAim = rand(120, 320);
    p.botSkip = Math.random() < (B.missBase + B.missPerLevel * (g.level - 1)) * p.botMiss;
  }
  const msLeft = ((next - g.rev) / rateOf(g)) * 1000;
  if (msLeft > p.botAim) return false;
  p.botPass = next;
  p.botAim = null;
  return p.botSkip ? false : jump(g, p, now);
}

// Kết quả: người bị loại sau đứng trên; ai còn trụ đứng đầu. Bị loại cùng một lần dây thì đồng hạng.
function results(g) {
  const score = p => (p.out ? p.outPass : Infinity);
  const sorted = [...g.jumpers].sort((a, b) => score(b) - score(a));
  return sorted.map(p => ({
    id: p.id,
    name: p.name,
    animal: p.animal,
    color: p.color,
    bot: p.bot,
    place: 1 + sorted.filter(q => score(q) > score(p)).length,
    detail: p.out
      ? `Vướng dây ở màn ${p.outLevel} · ${p.count} lần nhảy`
      : `Trụ đến cùng (màn ${g.level}) · ${p.count} lần nhảy`,
  }));
}

module.exports = { createGame, settingsFor, isLevel, levelTitles, step, jump, leave, botThink, results, aliveOf, rateOf };

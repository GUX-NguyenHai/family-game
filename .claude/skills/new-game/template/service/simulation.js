// Mô phỏng một ván __NAME__. Không biết gì về socket hay đồ hoạ (hàm thuần, dễ thử).
// Mỗi người lắc điện thoại để đổ đầy thanh của mình; ai đầy trước thì thắng, hết giờ thì xếp theo mức đã đổ.
const CONFIG = require('./config');

const DIFFICULTY_META = new Set(['label', 'desc']);

function rand(a, b) {
  return a + Math.random() * (b - a);
}

function clamp(v, a, b) {
  return v < a ? a : v > b ? b : v;
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

// players: [{ id, name, animal, color, bot }] (bản sao từ nền tảng).
function createGame({ players, difficulty, now, startAt }) {
  const C = settingsFor(difficulty);
  const list = players.map(p => ({
    id: p.id,
    name: p.name,
    animal: p.animal,
    color: p.color,
    bot: !!p.bot,
    fill: 0, // 0..1
    drive: 0, // mức lắc gửi lên (0..1.5)
    driveAt: 0,
    driveEff: 0, // mức lắc sau vùng chết (0..1), để hiển thị
    doneAt: null,
    rank: null,
    botSkill: rand(C.BOT.skillMin, C.BOT.skillMax),
  }));
  return {
    cfg: C,
    phase: 'countdown', // countdown → playing → finished
    startAt: startAt ?? now + C.COUNTDOWN_MS,
    endedAt: null,
    doneCount: 0,
    list,
    byId: new Map(list.map(p => [p.id, p])),
  };
}

// Điện thoại gửi mức lắc hiện tại ~10 lần/giây.
function move(g, p, level, now) {
  if (g.phase === 'finished') return;
  p.drive = clamp(Number(level) || 0, 0, 1.5);
  p.driveAt = now;
}

function finish(g, now, events) {
  g.phase = 'finished';
  g.endedAt = now;
  events.push({ type: 'end' });
}

function step(g, now, dt) {
  const C = g.cfg;
  const events = [];
  if (g.phase === 'countdown' && now >= g.startAt) g.phase = 'playing';
  for (const p of g.list) {
    const fresh = now - p.driveAt <= C.MOVE_STALE_MS;
    const raw = fresh ? p.drive : 0;
    p.driveEff = raw < C.MIN_DRIVE ? 0 : Math.min(1, raw); // vùng chết: rung tay nhẹ = không lắc
    if (g.phase !== 'playing' || p.doneAt != null) continue;
    p.fill = Math.min(1, p.fill + p.driveEff * C.FILL_RATE * dt);
    if (p.fill >= 1) {
      p.doneAt = now;
      p.rank = ++g.doneCount;
      events.push({ type: 'full', pid: p.id, rank: p.rank });
    }
  }
  if (g.phase === 'playing' && (g.doneCount > 0 || now - g.startAt >= C.ROUND_MS)) finish(g, now, events); // người đầu tiên đầy là hết ván
  return events;
}

// Bot: "lắc" theo tay nghề, phong độ dao động.
function botThink(g, p, now) {
  if (g.phase !== 'playing') return;
  p.drive = clamp((0.4 + 0.6 * p.botSkill) * rand(0.85, 1.1), 0, 1);
  p.driveAt = now;
}

// Kết quả: ai đầy trước đứng trước, còn lại xếp theo mức đã đổ.
function results(g) {
  const sorted = [...g.list].sort((a, b) => (a.rank ?? Infinity) - (b.rank ?? Infinity) || b.fill - a.fill);
  return sorted.map((p, i) => ({
    id: p.id,
    name: p.name,
    animal: p.animal,
    color: p.color,
    bot: p.bot,
    place: i + 1,
    detail: p.doneAt != null ? `Đầy sau ${((p.doneAt - g.startAt) / 1000).toFixed(1)}s` : `${Math.round(p.fill * 100)}%`,
  }));
}

module.exports = { createGame, settingsFor, isLevel, move, step, botThink, results };

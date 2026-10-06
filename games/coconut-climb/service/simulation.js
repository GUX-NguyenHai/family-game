// Mô phỏng một ván leo cây hái dừa. Không biết gì về socket hay đồ hoạ.
// Mỗi người một cây; y = độ cao đã leo (0 → HEIGHT mét). Lắc để leo, ngừng lắc thì tụt.
// Đoạn thân trơn (SLIP_START..SLIP_END phần chiều cao): phải lắc mạnh hơn SLIP_NEED mới leo được.
// Các giai đoạn: countdown → climb → done.
const CONFIG = require('./config');

const DIFFICULTY_META = new Set(['label', 'desc']);
const FLAG_SLIP = 1; // đang ở đoạn trơn
const FLAG_SLIDING = 2; // đang tụt xuống
const FLAG_TOP = 4; // đã lên ngọn

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
  return { ...CONFIG, ...over, level: key };
}

// players: [{ id, name, animal, color, bot }].
function createGame({ players, level, now, startAt }) {
  const C = settingsFor(level);
  const start = startAt ?? now + C.COUNTDOWN_MS;
  const climbers = players.map(p => ({
    id: p.id,
    name: p.name,
    animal: p.animal,
    color: p.color,
    bot: !!p.bot,
    y: 0,
    v: 0,
    drive: 0, // mức lắc gửi lên (0..1.5)
    driveAt: 0,
    driveEff: 0, // mức lắc sau khi nhân độ khó (0..1)
    inSlip: false,
    finishMs: null,
    rank: null,
    // Bot: tay nghề, phản xạ lúc bắt đầu, phong độ lên xuống, thỉnh thoảng nghỉ tay.
    botSkill: rand(C.BOT.skillMin, C.BOT.skillMax),
    botDelay: start + rand(150, 1000),
    botForm: 1,
    botFormAt: 0,
    botRestUntil: 0,
  }));
  return {
    cfg: C,
    level: C.level,
    height: C.HEIGHT,
    slipFrom: C.HEIGHT * C.SLIP_START,
    slipTo: C.HEIGHT * C.SLIP_END,
    phase: 'countdown',
    startAt: start,
    firstTopAt: null,
    topCount: 0,
    climbers,
    byId: new Map(climbers.map(c => [c.id, c])),
    endedAt: null,
  };
}

// Điện thoại gửi mức lắc hiện tại (0 = không lắc) khoảng 10 lần/giây.
function move(g, c, level, now) {
  if (g.phase !== 'countdown' && g.phase !== 'climb') return;
  c.drive = clamp(Number(level) || 0, 0, 1.5);
  c.driveAt = now;
}

function step(g, now, dt) {
  const C = g.cfg;
  const events = [];

  for (const c of g.climbers) {
    const fresh = now - c.driveAt <= C.MOVE_STALE_MS;
    const raw = fresh ? c.drive * C.DRIVE_GAIN : 0;
    c.driveEff = raw < C.MIN_DRIVE ? 0 : Math.min(1, raw); // vùng chết: rung tay nhẹ = không lắc
  }

  if (g.phase === 'countdown') {
    if (now >= g.startAt) g.phase = 'climb';
    return events;
  }
  if (g.phase !== 'climb') return events;

  for (const c of g.climbers) {
    if (c.finishMs != null) continue;
    const wasSlip = c.inSlip;
    c.inSlip = c.y >= g.slipFrom && c.y < g.slipTo;
    if (c.inSlip && !wasSlip) events.push({ pid: c.id, type: 'slip' });

    // Tốc độ mục tiêu: dương = leo lên, âm = tụt xuống.
    const d = c.driveEff;
    let target;
    if (c.inSlip) {
      target = d > C.SLIP_NEED ? ((d - C.SLIP_NEED) / (1 - C.SLIP_NEED)) * C.MAX_CLIMB * C.SLIP_CLIMB : -C.SLIP_SLIDE * (1 - d / C.SLIP_NEED);
    } else {
      target = d > 0 ? d * C.MAX_CLIMB : -C.SLIDE;
    }
    c.v = target > c.v ? Math.min(target, c.v + C.ACCEL * dt) : Math.max(target, c.v - C.ACCEL * dt);
    c.y = Math.max(0, c.y + c.v * dt);
    if (c.y === 0 && c.v < 0) c.v = 0;

    if (c.y >= g.height) {
      c.y = g.height;
      c.v = 0;
      c.finishMs = now - g.startAt;
      c.rank = ++g.topCount;
      if (!g.firstTopAt) g.firstTopAt = now;
      events.push({ pid: c.id, type: 'top', rank: c.rank });
    }
  }

  const everyone = g.climbers.every(c => c.finishMs != null);
  const timeUp = now - g.startAt >= C.ROUND_MS;
  const waitedEnough = g.firstTopAt != null && now - g.firstTopAt >= C.FINISH_TIMEOUT_MS;
  if (everyone || timeUp || waitedEnough) {
    g.phase = 'done';
    g.endedAt = now;
  }
  return events;
}

// Bot: lắc theo tay nghề + phong độ; tới đoạn trơn thì cố lắc mạnh hơn (bot kém có khi không đủ sức);
// bot kém thỉnh thoảng nghỉ tay một chút nên bị tụt.
function botThink(g, c, now) {
  if (g.phase !== 'climb' || c.finishMs != null || now < c.botDelay || now < c.botRestUntil) {
    c.drive = 0;
    c.driveAt = now;
    return;
  }
  if (now >= c.botFormAt) {
    c.botForm = rand(0.85, 1.15);
    c.botFormAt = now + rand(1500, 3000);
    if (Math.random() < (1 - c.botSkill) * 0.25) c.botRestUntil = now + rand(400, 1200);
  }
  let desired = (0.35 + 0.6 * c.botSkill) * c.botForm * rand(0.92, 1.05);
  if (c.inSlip) desired = Math.max(desired, g.cfg.SLIP_NEED + 0.05 + 0.4 * c.botSkill * Math.random());
  c.drive = clamp(desired, 0, 1) / g.cfg.DRIVE_GAIN; // chia DRIVE_GAIN để độ khó chỉ ảnh hưởng người chơi
  c.driveAt = now;
}

// Thứ hạng: ai lên ngọn trước đứng trước, còn lại xếp theo độ cao.
function standings(climbers) {
  return [...climbers].sort((a, b) => {
    if (a.rank != null && b.rank != null) return a.rank - b.rank;
    if (a.rank != null) return -1;
    if (b.rank != null) return 1;
    return b.y - a.y;
  });
}

function results(g) {
  return standings(g.climbers).map((c, i) => ({
    id: c.id,
    name: c.name,
    animal: c.animal,
    color: c.color,
    bot: c.bot,
    place: i + 1,
    detail: c.finishMs != null ? `🥥 ${(c.finishMs / 1000).toFixed(2)}s` : `${c.y.toFixed(1)}m / ${g.height}m`,
  }));
}

function flagsOf(c) {
  let f = 0;
  if (c.inSlip) f |= FLAG_SLIP;
  if (c.v < -0.05) f |= FLAG_SLIDING;
  if (c.finishMs != null) f |= FLAG_TOP;
  return f;
}

module.exports = {
  createGame,
  settingsFor,
  isLevel,
  step,
  move,
  botThink,
  standings,
  results,
  flagsOf,
  FLAGS: { SLIP: FLAG_SLIP, SLIDING: FLAG_SLIDING, TOP: FLAG_TOP },
};

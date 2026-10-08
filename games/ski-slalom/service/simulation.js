// Mô phỏng một lượt trượt tuyết vượt cổng. Không biết gì về socket hay đồ hoạ.
// Toạ độ: z = quãng đường xuống dốc (0 → courseLen), x = lệch ngang (âm = trái). Mọi người trượt chung một dốc,
// đi xuyên qua nhau (không va chạm người với người). Hướng trượt `heading` = góc lệch khỏi đường thẳng xuống dốc.
const CONFIG = require('./config');

const DIFFICULTY_META = new Set(['label', 'desc']);
const FLAG_FALL = 1;
const FLAG_FINISHED = 2;

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

function courseLength(C) {
  return C.FIRST_GATE_Z + (C.GATES - 1) * C.GATE_GAP + C.FINISH_AFTER;
}

// Vị trí x của "đường lý tưởng" (nối giữa các cổng) tại quãng đường z: để đặt cây tránh đường chính.
function lineX(gates, z) {
  if (z <= gates[0].z) return gates[0].x;
  for (let i = 1; i < gates.length; i++) {
    if (z <= gates[i].z) {
      const a = gates[i - 1];
      const b = gates[i];
      return a.x + ((b.x - a.x) * (z - a.z)) / (b.z - a.z);
    }
  }
  return gates[gates.length - 1].x;
}

// Cổng xen kẽ trái/phải (đỏ/xanh), cây và đá rải rác ngoài đường nối các cổng.
function createCourse(C) {
  const half = C.COURSE_WIDTH / 2;
  const gates = [];
  for (let i = 0; i < C.GATES; i++) {
    const side = i % 2 ? 1 : -1;
    const x = clamp(side * rand(...C.GATE_OFFSET), -half + C.GATE_HALF_WIDTH + 1, half - C.GATE_HALF_WIDTH - 1);
    gates.push({ id: i, z: C.FIRST_GATE_Z + i * C.GATE_GAP, x: Math.round(x * 100) / 100, w: C.GATE_HALF_WIDTH, color: i % 2 ? 'blue' : 'red' });
  }
  const obstacles = [];
  const len = courseLength(C);
  const count = Math.round(C.TREES * C.GATES);
  for (let tries = 0; obstacles.length < count && tries < count * 30; tries++) {
    const z = rand(C.FIRST_GATE_Z - 15, len - 15);
    const x = rand(-half + 1, half - 1);
    if (Math.abs(x - lineX(gates, z)) < C.TREE_CLEARANCE) continue;
    if (gates.some(g => Math.abs(g.z - z) < 4 && Math.abs(g.x - x) < g.w + 1.5)) continue; // không chắn ngay cổng
    if (obstacles.some(o => Math.hypot(o.x - x, o.z - z) < 3)) continue;
    const tree = Math.random() < 0.65;
    obstacles.push({ id: obstacles.length, type: tree ? 'tree' : 'rock', x: Math.round(x * 100) / 100, z: Math.round(z * 100) / 100, r: tree ? 0.6 : 0.8 });
  }
  return { gates, obstacles, length: len };
}

function createRace(racers, now, level, startAt = null) {
  const C = settingsFor(level);
  const course = createCourse(C);
  const n = racers.length;
  racers.forEach((p, i) => {
    p.x = (i - (n - 1) / 2) * C.START_SPACING;
    p.startX = p.x;
    p.z = 0;
    p.heading = 0;
    p.speed = 0;
    p.steer = 0;
    p.steerAt = 0;
    p.nextGate = 0; // cổng sắp tới
    p.passed = 0;
    p.missed = 0;
    p.penaltyMs = 0;
    p.fallUntil = 0;
    p.hits = new Set();
    p.finishMs = null;
    p.totalMs = null;
    p.rank = null;
    if (p.bot) {
      p.botSkill = rand(C.BOT.skillMin, C.BOT.skillMax);
      p.botDelay = rand(0, 600);
      p.botAim = 0; // lệch ngắm trong cổng hiện tại
      p.botAimGate = -1;
    }
  });
  return {
    cfg: C,
    level: C.level,
    width: C.COURSE_WIDTH,
    courseLen: course.length,
    gates: course.gates,
    obstacles: course.obstacles,
    startAt: startAt ?? now + C.COUNTDOWN_MS,
    firstFinishAt: null,
    finishCount: 0,
    endedAt: null,
  };
}

function isRunning(race, p, now) {
  return !race.endedAt && now >= race.startAt && p.finishMs == null;
}

// Điện thoại gửi mức lái -1..1 (nghiêng trái/phải) khi đổi hoặc mỗi 0,5 giây.
function steer(race, p, value, now) {
  if (race.endedAt || p.finishMs != null) return;
  p.steer = clamp(Number(value) || 0, -1, 1);
  p.steerAt = now;
}

function step(race, racers, now, dt) {
  const C = race.cfg;
  const events = [];
  if (now < race.startAt || race.endedAt) return events;
  const half = race.width / 2;

  for (const p of racers) {
    if (p.finishMs != null) {
      // Qua vạch đích: thắng dần lại cho đẹp.
      p.speed = Math.max(0, p.speed - 6 * dt);
      p.heading *= 0.9;
      p.z += p.speed * dt;
      continue;
    }
    if (p.speed === 0 && p.z === 0) p.speed = C.START_SPEED;
    const fallen = now < p.fallUntil;
    const wanted = now - p.steerAt <= C.STEER_STALE_MS ? p.steer : 0;
    if (!fallen) {
      p.heading += (wanted * C.MAX_ANGLE - p.heading) * Math.min(1, C.TURN_RESPONSE * dt);
      p.speed += C.ACCEL * dt;
      p.speed -= C.TURN_DRAG * Math.abs(p.heading) * p.speed * dt;
      p.speed = clamp(p.speed, 0, C.MAX_SPEED);
    }
    const prevZ = p.z;
    const move = fallen ? 0 : p.speed;
    p.z += Math.cos(p.heading) * move * dt;
    p.x += Math.sin(p.heading) * move * dt;
    // Lưới chắn 2 bên mép dốc.
    if (Math.abs(p.x) > half - 0.5) {
      p.x = clamp(p.x, -half + 0.5, half - 0.5);
      p.speed *= Math.pow(C.EDGE_SLOW, dt * 4);
      p.heading *= 0.8;
    }

    // Qua cổng: vượt z của cổng thì xét x lúc đó.
    while (p.nextGate < race.gates.length && p.z >= race.gates[p.nextGate].z) {
      const g = race.gates[p.nextGate];
      const k = p.z > prevZ ? (g.z - prevZ) / (p.z - prevZ) : 1;
      const xAt = p.x - Math.sin(p.heading) * move * dt * (1 - k);
      if (Math.abs(xAt - g.x) <= g.w) {
        p.passed++;
        events.push({ type: 'pass', pid: p.id, gate: g.id });
      } else {
        p.missed++;
        p.penaltyMs += C.MISS_PENALTY_MS;
        events.push({ type: 'miss', pid: p.id, gate: g.id });
      }
      p.nextGate++;
    }

    // Đâm cây/đá: ngã.
    if (!fallen) {
      for (const o of race.obstacles) {
        if (p.hits.has(o.id) || Math.abs(o.z - p.z) > o.r + C.BODY_RADIUS) continue;
        if (Math.abs(o.x - p.x) > o.r + C.BODY_RADIUS) continue;
        p.hits.add(o.id);
        p.fallUntil = now + C.FALL_MS;
        p.speed = C.FALL_SPEED;
        p.heading = 0;
        events.push({ type: 'crash', pid: p.id, obstacle: o.type });
        break;
      }
    }

    if (p.z >= race.courseLen) {
      p.z = race.courseLen;
      p.finishMs = now - race.startAt;
      p.totalMs = p.finishMs + p.penaltyMs;
      if (!race.firstFinishAt) race.firstFinishAt = now;
      race.finishCount++;
      events.push({ type: 'finish', pid: p.id });
    }
  }
  // Hạng của người đã về: theo tổng thời gian (kể cả phạt), nên tính lại mỗi lần có người về.
  if (events.some(e => e.type === 'finish')) {
    const done = racers.filter(p => p.finishMs != null).sort((a, b) => a.totalMs - b.totalMs);
    done.forEach((p, i) => (p.rank = i + 1));
    for (const e of events) if (e.type === 'finish') e.rank = racers.find(p => p.id === e.pid).rank;
  }
  return events;
}

function isOver(race, racers, now) {
  if (!racers.length || racers.every(p => p.finishMs != null)) return true;
  if (now - race.startAt > race.cfg.MAX_RACE_MS) return true;
  return race.firstFinishAt != null && now - race.firstFinishAt > race.cfg.FINISH_TIMEOUT_MS;
}

// Thứ hạng: người đã về xếp theo tổng thời gian (kể cả phạt); chưa về xếp theo quãng đường.
function standings(racers) {
  return [...racers].sort((a, b) => {
    if (a.totalMs != null && b.totalMs != null) return a.totalMs - b.totalMs;
    if (a.totalMs != null) return -1;
    if (b.totalMs != null) return 1;
    return b.z - a.z;
  });
}

function results(race, racers) {
  const total = race.gates.length;
  return standings(racers).map((p, i) => {
    const sec = p.penaltyMs / 1000;
    const pen = { vi: sec ? ` (+${sec}s phạt)` : '', en: sec ? ` (+${sec}s penalty)` : '' };
    const pct = Math.round((p.z / race.courseLen) * 100);
    const time = p.totalMs != null ? `${(p.totalMs / 1000).toFixed(2)}s` : null;
    return {
      id: p.id,
      name: p.name,
      animal: p.animal,
      color: p.color,
      bot: !!p.bot,
      place: i + 1,
      detail: time
        ? { vi: `${time}${pen.vi} · qua ${p.passed}/${total} cổng`, en: `${time}${pen.en} · ${p.passed}/${total} gates` }
        : { vi: `chưa về đích (${pct}%)${pen.vi}`, en: `did not finish (${pct}%)${pen.en}` },
    };
  });
}

function flagsOf(p, now) {
  let f = 0;
  if (now < p.fallUntil) f |= FLAG_FALL;
  if (p.finishMs != null) f |= FLAG_FINISHED;
  return f;
}

// Bot: ngắm vào trong cổng sắp tới (bot giỏi ngắm sát giữa, bot kém lệch nhiều), lái theo góc tới đó.
function botThink(race, p, now) {
  if (!isRunning(race, p, now)) return;
  const C = race.cfg;
  if (now < race.startAt + p.botDelay) {
    steer(race, p, 0, now);
    return;
  }
  const g = race.gates[p.nextGate];
  let targetX = 0;
  let ahead = 20;
  if (g) {
    if (p.botAimGate !== g.id) {
      p.botAimGate = g.id;
      // Lệch ngắm: bot kém đôi khi ngắm ra ngoài cổng.
      p.botAim = rand(-1, 1) * g.w * (0.2 + (1 - p.botSkill) * 1.1);
    }
    targetX = g.x + p.botAim;
    ahead = Math.max(4, g.z - p.z);
  }
  const desired = Math.atan2(targetX - p.x, ahead);
  const value = clamp((desired / C.MAX_ANGLE) * (1.2 + p.botSkill), -1, 1);
  steer(race, p, value + rand(-0.05, 0.05), now);
}

module.exports = {
  createRace,
  settingsFor,
  isLevel,
  courseLength,
  steer,
  step,
  isOver,
  standings,
  results,
  flagsOf,
  botThink,
  FLAGS: { FALL: FLAG_FALL, FINISHED: FLAG_FINISHED },
};

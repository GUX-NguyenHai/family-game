// Mô phỏng cuộc đua. Không biết gì về socket hay đồ hoạ.
// Toạ độ: z = quãng đường đã chạy (0 → TRACK_LEN), x = lệch ngang so với tim đường.
const C = require('./config');

const FLAG_STUN = 1;
const FLAG_JUMP = 2;
const FLAG_MUD = 4;
const FLAG_FINISHED = 8;
const FLAG_CARROT = 16;

function rand(a, b) {
  return a + Math.random() * (b - a);
}

function clamp(v, a, b) {
  return v < a ? a : v > b ? b : v;
}

function trackWidthFor(count) {
  return clamp(4 + count * 1.2, 8, 18);
}

function makeObstacle(id, type, x, z) {
  if (type === 'mud') return { id, type, x, z, w: rand(1.2, 2.2), d: rand(1.8, 2.8) };
  if (type === 'fence') return { id, type, x, z, w: rand(1.5, 2.8), d: 0.25 };
  return { id, type: 'carrot', x, z, w: 0.35, d: 0.35 };
}

function createObstacles(width) {
  const half = width / 2;
  const obstacles = [];
  let id = 0;
  let z = 35;
  while (z < C.TRACK_LEN - 25) {
    const r = Math.random();
    const type = r < 0.4 ? 'mud' : r < 0.8 ? 'fence' : 'carrot';
    const first = makeObstacle(id++, type, rand(-half + 1.5, half - 1.5), z);
    obstacles.push(first);

    // Thỉnh thoảng thêm 1 vật cản ở nửa bên kia, nhưng luôn chừa khe đủ rộng để lách qua.
    if (type !== 'carrot' && Math.random() < 0.35) {
      const x2 = first.x > 0 ? rand(-half + 1.5, -0.5) : rand(0.5, half - 1.5);
      const second = makeObstacle(id, Math.random() < 0.5 ? 'mud' : 'fence', x2, z);
      if (Math.abs(second.x - first.x) - first.w - second.w >= 2.2) {
        obstacles.push(second);
        id++;
      }
    }

    if (Math.random() < 0.3) {
      obstacles.push(makeObstacle(id++, 'carrot', rand(-half + 1, half - 1), z + rand(6, 10)));
    }
    z += rand(18, 32);
  }
  return obstacles;
}

function resetRacer(p, x) {
  p.inRace = true;
  p.x = x;
  p.z = 0;
  p.speed = 0;
  p.power = 0;
  p.steer = 0;
  p.stunUntil = 0;
  p.jumpUntil = 0;
  p.nextJumpAt = 0;
  p.boostUntil = 0;
  p.inMud = false;
  p.hits = new Set();
  p.finishMs = null;
  p.rank = null;
  p.lastBoostAt = 0;
  p.botPlan = new Map();
  if (p.bot) p.botLane = x;
}

function createRace(racers, now) {
  const width = trackWidthFor(racers.length);
  const lane = width / racers.length;
  racers.forEach((p, i) => resetRacer(p, -width / 2 + lane * (i + 0.5)));
  return {
    width,
    trackLen: C.TRACK_LEN,
    obstacles: createObstacles(width),
    taken: new Set(),
    startAt: now + C.COUNTDOWN_MS,
    firstFinishAt: null,
    finishCount: 0,
    endedAt: null,
  };
}

function isRunning(race, p, now) {
  return race && !race.endedAt && now >= race.startAt && p.finishMs == null;
}

function boost(race, p, kind, strength, now) {
  if (!isRunning(race, p, now)) return;
  if (now - p.lastBoostAt < C.BOOST_MIN_INTERVAL_MS) return;
  p.lastBoostAt = now;
  const s = clamp(Number(strength) || 0, 0, 1);
  const impulse = kind === 'shake' ? C.SHAKE_IMPULSE + C.SHAKE_IMPULSE_STRENGTH * s : C.TAP_IMPULSE;
  p.power = Math.min(1, p.power + impulse);
}

function jump(race, p, now) {
  if (!isRunning(race, p, now)) return false;
  if (now < p.nextJumpAt || now < p.stunUntil) return false;
  p.jumpUntil = now + C.JUMP_MS;
  p.nextJumpAt = now + C.JUMP_MS + C.JUMP_COOLDOWN_MS;
  return true;
}

function step(race, racers, now, dt) {
  const events = [];
  if (now < race.startAt) return events;
  const halfWidth = race.width / 2 - 0.6;

  for (const p of racers) {
    if (p.finishMs != null) {
      // Đã về đích: chạy chậm dần cho đẹp.
      p.speed = Math.max(0, p.speed - 6 * dt);
      p.z += p.speed * dt;
      continue;
    }
    if (race.endedAt) continue;

    p.power *= Math.exp(-dt / C.POWER_TAU);
    const stunned = now < p.stunUntil;
    const jumping = now < p.jumpUntil;
    if (!stunned) p.x = clamp(p.x + p.steer * C.LATERAL_SPEED * dt, -halfWidth, halfWidth);

    let speed = stunned ? 0 : C.BASE_SPEED + p.power * C.BOOST_SPEED;
    if (!stunned && now < p.boostUntil) speed += C.CARROT_BONUS;

    p.inMud = false;
    for (const o of race.obstacles) {
      if (Math.abs(p.z - o.z) > o.d + C.BODY_HALF_LEN) continue;
      if (Math.abs(p.x - o.x) > o.w + C.BODY_HALF_WIDTH) continue;

      if (o.type === 'mud') {
        if (!jumping) p.inMud = true;
      } else if (o.type === 'fence') {
        if (p.hits.has(o.id)) continue;
        p.hits.add(o.id);
        if (jumping) {
          events.push({ pid: p.id, type: 'clear' });
        } else {
          p.stunUntil = now + C.STUN_MS;
          p.power = 0;
          speed = 0;
          events.push({ pid: p.id, type: 'fence', side: p.x < o.x ? 'left' : 'right' });
        }
      } else if (o.type === 'carrot' && !race.taken.has(o.id)) {
        race.taken.add(o.id);
        p.power = 1;
        p.boostUntil = now + C.CARROT_BOOST_MS;
        events.push({ pid: p.id, type: 'carrot', oid: o.id });
      }
    }

    if (p.inMud) speed *= C.MUD_FACTOR;
    p.speed = speed;
    p.z += speed * dt;

    if (p.z >= race.trackLen) {
      p.z = race.trackLen;
      p.finishMs = now - race.startAt;
      p.rank = ++race.finishCount;
      if (!race.firstFinishAt) race.firstFinishAt = now;
      events.push({ pid: p.id, type: 'finish', rank: p.rank });
    }
  }
  return events;
}

function isOver(race, racers, now) {
  if (!racers.length) return true;
  if (racers.every(p => p.finishMs != null)) return true;
  return race.firstFinishAt != null && now - race.firstFinishAt > C.FINISH_TIMEOUT_MS;
}

// Thứ hạng hiện tại: ai về đích trước đứng trước, còn lại xếp theo quãng đường.
function standings(racers) {
  return [...racers].sort((a, b) => {
    if (a.rank != null && b.rank != null) return a.rank - b.rank;
    if (a.rank != null) return -1;
    if (b.rank != null) return 1;
    return b.z - a.z;
  });
}

function results(racers, trackLen) {
  return standings(racers).map((p, i) => ({
    id: p.id,
    name: p.name,
    animal: p.animal,
    color: p.color,
    bot: !!p.bot,
    place: i + 1,
    finished: p.finishMs != null,
    timeMs: p.finishMs,
    progress: Math.min(1, p.z / trackLen),
  }));
}

function flagsOf(p, now) {
  let f = 0;
  if (now < p.stunUntil) f |= FLAG_STUN;
  if (now < p.jumpUntil) f |= FLAG_JUMP;
  if (p.inMud) f |= FLAG_MUD;
  if (p.finishMs != null) f |= FLAG_FINISHED;
  if (now < p.boostUntil) f |= FLAG_CARROT;
  return f;
}

// Bot đơn giản: lắc theo "tay nghề", né bùn/rào, nhảy rào nếu may mắn, săn cà rốt gần.
function botThink(race, p, now, dt) {
  if (!isRunning(race, p, now)) return;
  if (Math.random() < p.botSkill * 5 * dt) boost(race, p, 'shake', 0.3 + Math.random() * 0.5, now);

  const halfWidth = race.width / 2 - 0.8;
  let target = p.botLane;
  let nearest = Infinity;
  for (const o of race.obstacles) {
    const ahead = o.z - p.z;
    if (ahead < 0 || ahead > 16) continue;
    if (o.type === 'carrot') {
      if (!race.taken.has(o.id) && Math.abs(o.x - p.x) < 3 && ahead < nearest) {
        nearest = ahead;
        target = o.x;
      }
      continue;
    }
    if (Math.abs(p.x - o.x) > o.w + C.BODY_HALF_WIDTH + 0.6) continue;
    if (ahead >= nearest) continue;
    nearest = ahead;

    if (!p.botPlan.has(o.id)) {
      const canJump = o.type === 'fence' && Math.random() < p.botSkill;
      p.botPlan.set(o.id, canJump ? 'jump' : 'dodge');
    }
    if (p.botPlan.get(o.id) === 'jump') {
      target = p.x;
      if (ahead < 2.4) jump(race, p, now);
    } else {
      target = p.x < o.x ? o.x - o.w - 1.3 : o.x + o.w + 1.3;
    }
  }
  target = clamp(target, -halfWidth, halfWidth);
  p.steer = clamp((target - p.x) * 1.5, -1, 1);
}

module.exports = {
  createRace,
  step,
  boost,
  jump,
  isOver,
  standings,
  results,
  flagsOf,
  botThink,
  FLAGS: { STUN: FLAG_STUN, JUMP: FLAG_JUMP, MUD: FLAG_MUD, FINISHED: FLAG_FINISHED, CARROT: FLAG_CARROT },
};

// Mô phỏng cuộc đua. Không biết gì về socket hay đồ hoạ.
// Toạ độ: z = quãng đường đã chạy (0 → trackLen), x = lệch ngang so với tim đường.
// Mỗi cuộc đua mang bộ tham số riêng (race.cfg) theo độ khó của phòng.
const CONFIG = require('./config');

const FLAG_STUN = 1;
const FLAG_JUMP = 2;
const FLAG_MUD = 4;
const FLAG_FINISHED = 8;
const FLAG_TURBO = 16;
const FLAG_BUMP = 32;

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
  return { ...CONFIG, ...CONFIG.DIFFICULTIES[key], level: key };
}

function cfgOf(race) {
  return race?.cfg || CONFIG;
}

function trackWidthFor(count) {
  return clamp(4 + count * 1.2, 8, 18);
}

function makeObstacle(C, id, type, x, z) {
  if (type === 'mud') {
    const k = C.OBSTACLES.mudScale;
    return { id, type, x, z, w: rand(1.2, 2.2) * k, d: rand(1.8, 2.8) * k };
  }
  if (type === 'fence') return { id, type, x, z, w: rand(1.5, 2.8), d: 0.25 };
  return { id, type: 'carrot', x, z, w: 0.35, d: 0.35 };
}

function createObstacles(C, width) {
  const O = C.OBSTACLES;
  const half = width / 2;
  const obstacles = [];
  let id = 0;
  let z = 35;
  while (z < C.TRACK_LEN - 25) {
    const r = Math.random();
    const type = r < O.mud ? 'mud' : r < O.mud + O.fence ? 'fence' : 'carrot';
    const first = makeObstacle(C, id++, type, rand(-half + 1.5, half - 1.5), z);
    obstacles.push(first);

    // Thỉnh thoảng thêm 1 vật cản ở nửa bên kia, nhưng luôn chừa khe đủ rộng để lách qua.
    if (type !== 'carrot' && Math.random() < O.pairChance) {
      const x2 = first.x > 0 ? rand(-half + 1.5, -0.5) : rand(0.5, half - 1.5);
      const second = makeObstacle(C, id, Math.random() < 0.5 ? 'mud' : 'fence', x2, z);
      if (Math.abs(second.x - first.x) - first.w - second.w >= 2.2) {
        obstacles.push(second);
        id++;
      }
    }

    if (Math.random() < O.extraCarrot) {
      obstacles.push(makeObstacle(C, id++, 'carrot', rand(-half + 1, half - 1), z + rand(6, 10)));
    }
    z += rand(O.gapMin, O.gapMax);
  }
  return obstacles;
}

function resetRacer(C, p, x) {
  p.inRace = true;
  p.x = x;
  p.z = 0;
  p.speed = 0;
  p.power = 0;
  p.steer = 0;
  p.stunUntil = 0;
  p.jumpUntil = 0;
  p.nextJumpAt = 0;
  p.mana = 0;
  p.turboUntil = 0;
  p.inMud = false;
  p.hits = new Set();
  p.finishMs = null;
  p.rank = null;
  p.lastShakeAt = 0;
  p.lastBumpAt = 0;
  p.bumpSlowUntil = 0;
  p.botPlan = new Map();
  if (p.bot) {
    p.botLane = x;
    p.botSkill = rand(C.BOT.skillMin, C.BOT.skillMax);
  }
}

function createRace(racers, now, level) {
  const C = settingsFor(level);
  const width = trackWidthFor(racers.length);
  const lane = width / racers.length;
  racers.forEach((p, i) => resetRacer(C, p, -width / 2 + lane * (i + 0.5)));
  return {
    cfg: C,
    level: C.level,
    width,
    trackLen: C.TRACK_LEN,
    obstacles: createObstacles(C, width),
    taken: new Set(),
    contacts: new Set(), // các cặp đang chạm nhau ở tick trước
    startAt: now + C.COUNTDOWN_MS,
    firstFinishAt: null,
    finishCount: 0,
    endedAt: null,
  };
}

function isRunning(race, p, now) {
  return race && !race.endedAt && now >= race.startAt && p.finishMs == null;
}

function shake(race, p, strength, now) {
  if (!isRunning(race, p, now)) return;
  const C = cfgOf(race);
  if (now - p.lastShakeAt < C.SHAKE_MIN_INTERVAL_MS) return;
  p.lastShakeAt = now;
  const s = clamp(Number(strength) || 0, 0, 1);
  p.power = Math.min(1, p.power + C.SHAKE_IMPULSE + C.SHAKE_IMPULSE_STRENGTH * s);
}

// Nút PHI!: có mana là dùng được, dùng hết mana đang có; mana càng nhiều TURBO càng lâu.
function turbo(race, p, now) {
  if (!isRunning(race, p, now)) return false;
  if (p.mana <= 0 || now < p.turboUntil) return false;
  p.turboUntil = now + cfgOf(race).TURBO_MS * p.mana;
  p.mana = 0;
  return true;
}

function jump(race, p, now) {
  if (!isRunning(race, p, now)) return false;
  if (now < p.nextJumpAt || now < p.stunUntil) return false;
  const C = cfgOf(race);
  p.jumpUntil = now + C.JUMP_MS;
  p.nextJumpAt = now + C.JUMP_MS + C.JUMP_COOLDOWN_MS;
  return true;
}

function step(race, racers, now, dt) {
  const C = cfgOf(race);
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
    const turboOn = now < p.turboUntil;
    if (!turboOn && p.mana < 1) {
      p.mana = Math.min(1, p.mana + (dt * 1000) / C.MANA_FILL_MS);
      if (p.mana >= 1) events.push({ pid: p.id, type: 'manaFull' });
    }
    if (!stunned) p.x = clamp(p.x + p.steer * C.LATERAL_SPEED * dt, -halfWidth, halfWidth);

    // Tốc độ mục tiêu do lắc quyết định; tốc độ thật đuổi dần theo (tăng tốc dần, phanh nhanh).
    let target = stunned ? 0 : C.BASE_SPEED + p.power * C.BOOST_SPEED;
    if (turboOn) target *= C.TURBO_FACTOR;
    let crashed = false;

    p.inMud = false;
    for (const o of race.obstacles) {
      if (Math.abs(p.z - o.z) > o.d + C.BODY_HALF_LEN) continue;
      if (Math.abs(p.x - o.x) > o.w + C.BODY_HALF_WIDTH) continue;

      if (o.type === 'mud') {
        if (!jumping && !turboOn) p.inMud = true;
      } else if (o.type === 'fence') {
        if (p.hits.has(o.id)) continue;
        p.hits.add(o.id);
        if (jumping) {
          events.push({ pid: p.id, type: 'clear' });
        } else {
          p.stunUntil = now + C.STUN_MS;
          p.power = 0;
          p.mana = Math.max(0, p.mana - C.FENCE_MANA_LOSS);
          crashed = true;
          events.push({ pid: p.id, type: 'fence', side: p.x < o.x ? 'left' : 'right' });
        }
      } else if (o.type === 'carrot' && !race.taken.has(o.id)) {
        race.taken.add(o.id);
        const wasFull = p.mana >= 1;
        p.mana = Math.min(1, p.mana + C.CARROT_MANA);
        events.push({ pid: p.id, type: 'carrot', oid: o.id });
        if (!wasFull && p.mana >= 1) events.push({ pid: p.id, type: 'manaFull' });
      }
    }

    if (p.inMud) target *= C.MUD_FACTOR;
    else if (!turboOn && now < p.bumpSlowUntil) target *= C.BUMP_SLOW_FACTOR;
    if (crashed) {
      // Đâm rào: dừng hẳn, hết khựng thì tăng tốc lại từ 0.
      p.speed = 0;
    } else if (target > p.speed) {
      const accel = turboOn ? C.ACCEL * C.TURBO_ACCEL_MULT : C.ACCEL;
      p.speed = Math.min(target, p.speed + accel * dt);
    } else {
      p.speed = Math.max(target, p.speed - C.BRAKE * dt);
    }
    p.z += p.speed * dt;

    if (p.z >= race.trackLen) {
      p.z = race.trackLen;
      p.finishMs = now - race.startAt;
      p.rank = ++race.finishCount;
      if (!race.firstFinishAt) race.firstFinishAt = now;
      events.push({ pid: p.id, type: 'finish', rank: p.rank });
    }
  }
  if (C.COLLIDE && !race.endedAt) resolveCollisions(race, racers, now, events);
  return events;
}

// Mỗi cặp chồng lên nhau: đẩy ra hai bên (con TURBO hất mạnh hơn).
// Con phía sau đang tông đuôi thì không cho xuyên qua, phải lách sang bên mới vượt được.
function resolveCollisions(race, racers, now, events) {
  const C = cfgOf(race);
  const active = racers.filter(p => p.finishMs == null);
  const minDx = C.BODY_HALF_WIDTH * 2;
  const minDz = C.BODY_HALF_LEN * 2;
  const halfWidth = race.width / 2 - 0.6;
  const contacts = new Set();

  for (let i = 0; i < active.length; i++) {
    for (let j = i + 1; j < active.length; j++) {
      const a = active[i];
      const b = active[j];
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const overlapX = minDx - Math.abs(dx);
      const overlapZ = minDz - Math.abs(dz);
      if (overlapX <= 0 || overlapZ <= 0) continue;

      const key = a.id < b.id ? `${a.id}|${b.id}` : `${b.id}|${a.id}`;
      contacts.add(key);

      // Va nhau: cả hai chậm lại (con đang TURBO thì không).
      for (const p of [a, b]) {
        if (now >= p.turboUntil) p.bumpSlowUntil = now + C.BUMP_SLOW_MS;
      }

      const aTurbo = now < a.turboUntil;
      const bTurbo = now < b.turboUntil;
      let shareA = 0.5;
      if (aTurbo && !bTurbo) shareA = 1 - C.TURBO_PUSH_SHARE;
      else if (bTurbo && !aTurbo) shareA = C.TURBO_PUSH_SHARE;

      // Đẩy ngang. Đứng thẳng hàng thì chọn hướng ngẫu nhiên nhưng cố định theo cặp.
      const dir = Math.abs(dx) > 0.01 ? Math.sign(dx) : key.length % 2 ? 1 : -1;
      const push = overlapX * C.BUMP_PUSH;
      a.x = clamp(a.x - dir * push * shareA, -halfWidth, halfWidth);
      b.x = clamp(b.x + dir * push * (1 - shareA), -halfWidth, halfWidth);

      // Tông đuôi: con phía sau rõ ràng (không phải đi song song) và không TURBO thì bị chặn lại.
      if (Math.abs(dz) > minDz * 0.5) {
        const back = dz > 0 ? a : b;
        const front = dz > 0 ? b : a;
        if (now >= back.turboUntil) {
          back.z = Math.min(back.z, front.z - minDz);
          back.speed = Math.min(back.speed, front.speed);
        }
      }

      if (!race.contacts.has(key)) {
        for (const p of [a, b]) {
          if (now - p.lastBumpAt < C.BUMP_FX_GAP_MS) continue;
          p.lastBumpAt = now;
          events.push({ pid: p.id, type: 'bump' });
        }
      }
    }
  }
  race.contacts = contacts;
}

function isOver(race, racers, now) {
  if (!racers.length) return true;
  if (racers.every(p => p.finishMs != null)) return true;
  return race.firstFinishAt != null && now - race.firstFinishAt > cfgOf(race).FINISH_TIMEOUT_MS;
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
  if (now < p.turboUntil) f |= FLAG_TURBO;
  if (now < p.bumpSlowUntil) f |= FLAG_BUMP;
  return f;
}

// Bot: lắc theo "tay nghề" (theo độ khó), né bùn/rào, nhảy rào nếu đủ giỏi, săn cà rốt gần,
// né con chậm phía trước; TURBO khi đầy, thỉnh thoảng dùng sớm (bot dễ hay phí), nước rút thì dùng ngay.
function botThink(race, p, now, dt, racers = []) {
  if (!isRunning(race, p, now)) return false;
  const C = cfgOf(race);
  if (Math.random() < p.botSkill * 5 * dt) shake(race, p, 0.3 + Math.random() * 0.5, now);
  const sprint = p.z > race.trackLen * 0.7;
  const early = p.mana >= C.BOT.turboMin && Math.random() < C.BOT.turboRate * dt;
  const wantTurbo = sprint ? p.mana >= 0.3 : p.mana >= 1 || early;
  const usedTurbo = wantTurbo && turbo(race, p, now);

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

  // Có con chậm hơn chắn ngay phía trước (và gần hơn vật cản) thì lách sang bên còn chỗ.
  for (const q of racers) {
    if (q === p || q.finishMs != null) continue;
    const ahead = q.z - p.z;
    if (ahead <= 0 || ahead > 6 || ahead >= nearest) continue;
    if (Math.abs(q.x - p.x) > C.BODY_HALF_WIDTH * 2 + 0.3 || q.speed >= p.speed) continue;
    nearest = ahead;
    const left = q.x - 1.4;
    const right = q.x + 1.4;
    const preferLeft = p.x <= q.x;
    if (preferLeft && left >= -halfWidth) target = left;
    else if (!preferLeft && right <= halfWidth) target = right;
    else target = left >= -halfWidth ? left : right;
  }

  target = clamp(target, -halfWidth, halfWidth);
  p.steer = clamp((target - p.x) * 1.5, -1, 1);
  return usedTurbo;
}

module.exports = {
  createRace,
  settingsFor,
  isLevel,
  step,
  shake,
  turbo,
  jump,
  isOver,
  standings,
  results,
  flagsOf,
  botThink,
  FLAGS: { STUN: FLAG_STUN, JUMP: FLAG_JUMP, MUD: FLAG_MUD, FINISHED: FLAG_FINISHED, TURBO: FLAG_TURBO, BUMP: FLAG_BUMP },
};

// Mô phỏng cuộc đua. Không biết gì về socket hay đồ hoạ.
// Toạ độ: z = quãng đường đã chạy (0 → trackLen), x = vị trí làn (mỗi con chạy thẳng trong làn riêng).
// Chỉ có lắc để chạy và nhảy qua rào/bùn; không có năng lượng, TURBO hay cà rốt.
// Mỗi cuộc đua mang bộ tham số riêng (race.cfg) theo độ khó của phòng.
const CONFIG = require('./config');
const DIFFICULTY_META = new Set(['label', 'desc']);

const FLAG_STUN = 1;
const FLAG_JUMP = 2;
const FLAG_MUD = 4;
const FLAG_FINISHED = 8;

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

function cfgOf(race) {
  return race?.cfg || CONFIG;
}

function trackWidthFor(count) {
  return clamp(4 + count * 1.2, 8, 18);
}

// Không lái trái/phải được nên mỗi làn có CÙNG một dãy vật cản ở cùng khoảng cách (công bằng cho mọi người).
// Vật cản nằm gọn trong làn của nó (w = nửa bề ngang).
function makeObstacle(C, id, type, x, z, laneW, size) {
  const fit = laneW * 0.42; // nửa bề ngang tối đa để không lấn sang làn bên
  if (type === 'mud') {
    const k = C.OBSTACLES.mudScale;
    return { id, type, x, z, w: Math.min(fit, 1.2 * k), d: size.mudD * k };
  }
  return { id, type: 'fence', x, z, w: Math.min(fit, 1.4), d: 0.25 };
}

// lanes: toạ độ x giữa mỗi làn.
function createObstacles(C, lanes, laneW) {
  const O = C.OBSTACLES;
  const obstacles = [];
  let id = 0;
  // Một hàng vật cản: cùng loại, cùng khoảng cách, mỗi làn một cái.
  const row = (type, z) => {
    const size = { mudD: rand(1.8, 2.8) }; // bùn mọi làn dài như nhau
    for (const x of lanes) obstacles.push(makeObstacle(C, id++, type, x, z, laneW, size));
  };
  let z = 35;
  while (z < C.TRACK_LEN - 25) {
    const type = Math.random() < O.fence ? 'fence' : 'mud';
    row(type, z);
    // Thỉnh thoảng thêm 1 hàng vật cản nữa ngay sau (rào rồi bùn, bùn rồi rào…) cho khó hơn.
    if (Math.random() < O.pairChance) row(type === 'mud' ? 'fence' : 'mud', z + rand(6, 9));
    z += rand(O.gapMin, O.gapMax);
  }
  return obstacles;
}

// starter: xuất phát nhanh rồi đuối; finisher: chậm đầu, bứt tốc cuối; wobbly: phong độ thất thường.
const BOT_STYLES = ['steady', 'starter', 'finisher', 'wobbly'];

function resetRacer(C, p, x) {
  p.inRace = true;
  p.lane = x; // làn cố định: không lái trái/phải
  p.x = x;
  p.z = 0;
  p.speed = 0;
  p.drive = 0; // mức lắc điện thoại gửi lên (0..1)
  p.driveAt = 0;
  p.driveEff = 0; // mức lắc sau khi nhân theo độ khó, để hiển thị
  p.stunUntil = 0;
  p.jumpUntil = 0;
  p.nextJumpAt = 0;
  p.inMud = false;
  p.hits = new Set();
  p.finishMs = null;
  p.rank = null;
  p.botPlan = new Map();
  if (p.bot) {
    // Mỗi ván random lại để thứ tự về đích không lặp lại.
    p.botSkill = rand(C.BOT.skillMin, C.BOT.skillMax);
    p.botDelay = rand(0, 1500); // phản xạ lúc xuất phát
    p.botStyle = BOT_STYLES[Math.floor(Math.random() * BOT_STYLES.length)];
    p.botForm = 1; // phong độ lên xuống trong lúc chạy
    p.botFormAt = 0;
  }
}

function botPace(p, progress) {
  if (p.botStyle === 'starter') return progress < 0.4 ? 1.3 : 0.8;
  if (p.botStyle === 'finisher') return progress < 0.5 ? 0.8 : 1.3;
  return 1;
}

function createRace(racers, now, level, startAt = null) {
  const C = settingsFor(level);
  const width = trackWidthFor(racers.length);
  const laneW = width / racers.length;
  const lanes = racers.map((_, i) => -width / 2 + laneW * (i + 0.5));
  racers.forEach((p, i) => resetRacer(C, p, lanes[i]));
  return {
    cfg: C,
    level: C.level,
    width,
    trackLen: C.TRACK_LEN,
    obstacles: createObstacles(C, lanes, laneW),
    startAt: startAt ?? now + C.COUNTDOWN_MS,
    firstFinishAt: null,
    finishCount: 0,
    endedAt: null,
  };
}

function isRunning(race, p, now) {
  return race && !race.endedAt && now >= race.startAt && p.finishMs == null;
}

// Điện thoại gửi mức lắc hiện tại (0 = đứng yên, 1 = lắc hết cỡ) khoảng 10 lần/giây.
// (Được gửi tới 1.5: lắc mạnh hơn mức "đủ" vẫn có ích ở độ khó cao, vì drive = level × DRIVE_GAIN, tối đa 1.)
function move(race, p, level, now) {
  if (!isRunning(race, p, now)) return;
  p.drive = clamp(Number(level) || 0, 0, 1.5);
  p.driveAt = now;
}

// Nhảy (điện thoại hất đầu máy hoặc giật máy lên).
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

  for (const p of racers) {
    if (p.finishMs != null) {
      // Đã về đích: chạy chậm dần cho đẹp.
      p.speed = Math.max(0, p.speed - 6 * dt);
      p.z += p.speed * dt;
      continue;
    }
    if (race.endedAt) continue;

    const stunned = now < p.stunUntil;
    const jumping = now < p.jumpUntil;
    p.x = p.lane; // chạy thẳng trong làn của mình

    // Tốc độ mục tiêu = mức lắc × tốc độ tối đa (không lắc thì 0); tốc độ thật đuổi dần theo.
    const fresh = now - p.driveAt <= C.MOVE_STALE_MS;
    const raw = fresh ? p.drive * C.DRIVE_GAIN : 0;
    const drive = raw < C.MIN_DRIVE ? 0 : Math.min(1, raw); // vùng chết: rung tay nhẹ = đứng yên
    p.driveEff = drive;
    let target = stunned ? 0 : drive * C.MAX_SPEED;
    let crashed = false;

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
          crashed = true;
          events.push({ pid: p.id, type: 'fence', side: p.x < o.x ? 'left' : 'right' });
        }
      }
    }

    if (p.inMud) target *= C.MUD_FACTOR;
    if (crashed) {
      // Đâm rào: dừng hẳn, hết khựng thì tăng tốc lại từ 0.
      p.speed = 0;
    } else if (target > p.speed) {
      p.speed = Math.min(target, p.speed + C.ACCEL * dt);
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
  return events;
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
  return f;
}

// Bot: "lắc" liên tục theo "tay nghề" (theo độ khó), nhảy qua rào/bùn trong làn mình nếu đủ giỏi (bot kém hay quên nhảy).
function botThink(race, p, now) {
  if (!isRunning(race, p, now)) return;
  const C = cfgOf(race);
  const progress = p.z / race.trackLen;

  // Phong độ đổi mỗi 2–4 giây; bot thất thường thì dao động mạnh hơn.
  if (now >= p.botFormAt) {
    p.botForm = p.botStyle === 'wobbly' ? rand(0.5, 1.4) : rand(0.8, 1.2);
    p.botFormAt = now + rand(2000, 4000);
  }

  if (now < race.startAt + p.botDelay) {
    p.drive = 0; // chưa phản xạ kịp: đứng yên như người chưa lắc
  } else {
    // "Lắc" liên tục theo tay nghề, phong độ, kiểu chạy; chia DRIVE_GAIN để độ khó chỉ ảnh hưởng người chơi.
    const desired = (0.35 + 0.6 * p.botSkill) * p.botForm * botPace(p, progress) * rand(0.92, 1.05);
    p.drive = clamp(desired, 0, 1) / C.DRIVE_GAIN;
  }
  p.driveAt = now;

  // Vật cản gần nhất phía trước trong làn mình: rào thì nhảy (bot giỏi hay nhảy đúng), bùn thì thỉnh thoảng nhảy qua.
  let nearest = null;
  for (const o of race.obstacles) {
    if (Math.abs(o.x - p.lane) > o.w) continue;
    const ahead = o.z - o.d - p.z;
    if (ahead < 0 || ahead > 12) continue;
    if (!nearest || ahead < nearest.ahead) nearest = { o, ahead };
  }
  if (nearest) {
    const { o, ahead } = nearest;
    if (!p.botPlan.has(o.id)) {
      const chance = o.type === 'fence' ? 0.25 + 0.7 * p.botSkill : 0.6 * p.botSkill;
      p.botPlan.set(o.id, Math.random() < chance ? 'jump' : 'miss');
    }
    // Nhảy sớm hay muộn tuỳ tốc độ: chạy nhanh thì nhảy từ xa hơn.
    if (p.botPlan.get(o.id) === 'jump' && ahead < Math.max(1.5, p.speed * 0.25) * rand(0.9, 1.2)) jump(race, p, now);
  }
}

module.exports = {
  createRace,
  settingsFor,
  isLevel,
  step,
  move,
  jump,
  isOver,
  standings,
  results,
  flagsOf,
  botThink,
  FLAGS: { STUN: FLAG_STUN, JUMP: FLAG_JUMP, MUD: FLAG_MUD, FINISHED: FLAG_FINISHED },
};

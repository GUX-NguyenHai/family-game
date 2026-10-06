// Mô phỏng cuộc đua thuyền. Không biết gì về socket hay đồ hoạ.
// Toạ độ: z = quãng đường đã đi (0 → trackLen), x = lệch ngang so với giữa sông.
// Người chơi (rower) gửi mức lắc + độ nghiêng. Mỗi thuyền chở 1 người (thi đơn) hoặc cả đội (theo đội):
// thuyền lấy TRUNG BÌNH mức chèo và độ nghiêng của những người trên thuyền.
// Kiểu "basic": mỗi thuyền một làn, không lái, không vật cản. Kiểu "pro": nghiêng để lái, có khúc gỗ + đảo hải đăng.
const CONFIG = require('./config');

const DIFFICULTY_META = new Set(['label', 'desc']);
const FLAG_STUN = 1;
const FLAG_BUMP = 2;
const FLAG_FINISHED = 4;
const FLAG_BLOCKED = 8;

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

function riverWidthFor(course, boatCount) {
  if (course === 'basic') return Math.max(10, boatCount * CONFIG.LANE_WIDTH);
  return clamp(10 + boatCount * 2.5, 14, 24);
}

// Vật cản kiểu Pro. Đảo hải đăng sát một bờ, chắn gần nửa lòng sông; bên kia luôn còn ít nhất nửa sông để đi.
function createObstacles(C, width) {
  const O = C.OBSTACLES;
  const half = width / 2;
  const list = [];
  let id = 0;
  let z = 40;
  while (z < C.TRACK_LEN - 35) {
    if (Math.random() < O.island) {
      const w = half * rand(0.35, 0.5); // nửa bề ngang của đảo
      const side = Math.random() < 0.5 ? -1 : 1;
      list.push({ id: id++, type: 'island', x: side * (half - w), z, w, d: rand(2.2, 3.2) });
    } else {
      const w = rand(0.9, 1.7); // nửa chiều dài khúc gỗ (nằm ngang sông)
      const x = rand(-half + w + 0.5, half - w - 0.5);
      list.push({ id: id++, type: 'log', x, z, w, d: 0.4, variant: Math.random() < 0.5 ? 0 : 1 });
      if (Math.random() < O.pairChance) {
        const w2 = rand(0.9, 1.5);
        const x2 = x > 0 ? rand(-half + w2 + 0.5, -0.5) : rand(0.5, half - w2 - 0.5);
        if (Math.abs(x2 - x) - w - w2 >= 2.4) {
          list.push({ id: id++, type: 'log', x: x2, z: z + rand(-2, 2), w: w2, d: 0.4, variant: Math.random() < 0.5 ? 0 : 1 });
        }
      }
    }
    z += rand(O.gapMin, O.gapMax);
  }
  return list;
}

function makeRower(p) {
  return {
    id: p.id,
    name: p.name,
    animal: p.animal,
    color: p.color,
    bot: !!p.bot,
    team: p.team ?? null,
    boatPref: p.prefs?.boat || null,
    boat: null, // id thuyền đang ngồi
    drive: 0, // mức lắc gửi lên (0..1.5)
    driveAt: 0,
    driveEff: 0, // mức chèo sau khi nhân độ khó (0..1), để hiển thị
    steer: 0, // -1..1
  };
}

function makeBoat(C, id, crew, name, color, team) {
  return {
    id,
    crew, // các rower trên thuyền, người đầu tiên là đội trưởng
    name,
    color,
    team: team ? team.id : null,
    teamEmoji: team ? team.emoji : null,
    boatType: crew[0]?.boatPref || null,
    halfLen: C.BOAT_HALF_LEN_BASE + C.BOAT_HALF_LEN_PER_SEAT * crew.length,
    lane: 0,
    x: 0,
    z: 0,
    speed: 0,
    drive: 0,
    steer: 0,
    stunUntil: 0,
    bumpSlowUntil: 0,
    lastBumpAt: 0,
    islandAt: 0,
    blocked: false,
    hits: new Set(),
    finishMs: null,
    rank: null,
  };
}

const BOT_STYLES = ['steady', 'starter', 'finisher', 'wobbly'];

function setupBot(C, r) {
  r.botSkill = rand(C.BOT.skillMin, C.BOT.skillMax);
  r.botDelay = rand(0, 1200); // phản xạ lúc xuất phát
  r.botStyle = BOT_STYLES[Math.floor(Math.random() * BOT_STYLES.length)];
  r.botForm = 1;
  r.botFormAt = 0;
  r.botLaneX = null;
  r.botLaneAt = 0;
  r.botPlan = new Map();
}

// players: [{ id, name, animal, color, bot, team, prefs }]; teams: danh sách đội (theo đội) hoặc null (thi đơn).
function createRace({ players, course, level, teams, now, startAt = null }) {
  const C = settingsFor(level);
  const pro = course === 'pro';
  const rowers = players.map(makeRower);
  const boats = [];
  if (teams) {
    for (const t of teams) {
      const crew = rowers.filter(r => r.team === t.id);
      if (crew.length) boats.push(makeBoat(C, `t${t.id}`, crew, `Đội ${t.name}`, t.color, t));
    }
  } else {
    for (const r of rowers) boats.push(makeBoat(C, `b-${r.id}`, [r], r.name, r.color, null));
  }

  // Xếp ngẫu nhiên thứ tự làn cho công bằng.
  boats.sort(() => Math.random() - 0.5);
  const width = riverWidthFor(course, boats.length);
  const laneW = width / boats.length;
  boats.forEach((b, i) => {
    b.lane = -width / 2 + laneW * (i + 0.5);
    b.x = b.lane;
    for (const r of b.crew) r.boat = b.id;
  });
  for (const r of rowers) if (r.bot) setupBot(C, r);

  return {
    cfg: C,
    level: C.level,
    course: pro ? 'pro' : 'basic',
    pro,
    width,
    trackLen: C.TRACK_LEN,
    obstacles: pro ? createObstacles(C, width) : [],
    rowers,
    boats,
    rowerById: new Map(rowers.map(r => [r.id, r])),
    boatById: new Map(boats.map(b => [b.id, b])),
    contacts: new Set(),
    startAt: startAt ?? now + C.COUNTDOWN_MS,
    firstFinishAt: null,
    finishCount: 0,
    endedAt: null,
  };
}

function boatOf(race, r) {
  return race.boatById.get(r.boat);
}

function isRunning(race, b, now) {
  return race && b && !race.endedAt && now >= race.startAt && b.finishMs == null;
}

// Điện thoại gửi mức lắc hiện tại (0 = không chèo) khoảng 10 lần/giây.
function move(race, r, level, now) {
  if (!isRunning(race, boatOf(race, r), now)) return;
  r.drive = clamp(Number(level) || 0, 0, 1.5);
  r.driveAt = now;
}

function steer(race, r, value) {
  const n = Number(value);
  r.steer = race.pro && Number.isFinite(n) ? clamp(n, -1, 1) : 0;
}

function step(race, now, dt) {
  const C = race.cfg;
  const events = [];
  if (now < race.startAt) return events;
  const half = race.width / 2 - C.BOAT_HALF_WIDTH - 0.2;

  for (const b of race.boats) {
    if (b.finishMs != null) {
      // Đã về đích: trôi chậm dần cho đẹp.
      b.speed = Math.max(0, b.speed - 4 * dt);
      b.z += b.speed * dt;
      continue;
    }
    if (race.endedAt) continue;

    // Mức chèo và hướng lái của thuyền = trung bình của những người trên thuyền.
    let driveSum = 0;
    let steerSum = 0;
    for (const r of b.crew) {
      const fresh = now - r.driveAt <= C.MOVE_STALE_MS;
      const raw = fresh ? r.drive * C.DRIVE_GAIN : 0;
      r.driveEff = raw < C.MIN_DRIVE ? 0 : Math.min(1, raw); // vùng chết: rung tay nhẹ = không chèo
      driveSum += r.driveEff;
      steerSum += r.steer;
    }
    b.drive = driveSum / b.crew.length;
    b.steer = race.pro ? steerSum / b.crew.length : 0;

    const stunned = now < b.stunUntil;
    if (race.pro) b.x = clamp(b.x + b.steer * C.LATERAL_SPEED * dt, -half, half);
    else b.x = b.lane;

    let target = stunned ? 0 : b.drive * C.MAX_SPEED;
    if (now < b.bumpSlowUntil) target *= C.BUMP_SLOW_FACTOR;
    b.speed = target > b.speed ? Math.min(target, b.speed + C.ACCEL * dt) : Math.max(target, b.speed - C.DRAG * dt);

    let nz = b.z + b.speed * dt;
    b.blocked = false;
    for (const o of race.obstacles) {
      if (Math.abs(b.x - o.x) > o.w + C.BOAT_HALF_WIDTH) continue;
      if (o.type === 'island') {
        // Đảo là vật rắn: mũi thuyền chạm mép đảo thì dừng, phải lái sang bên mới đi tiếp.
        const front = o.z - o.d - b.halfLen;
        if (b.z <= front + 0.01 && nz > front) {
          nz = front;
          b.speed = 0;
          b.blocked = true;
          if (now - b.islandAt > C.ISLAND_BUMP_GAP_MS) {
            b.islandAt = now;
            events.push({ bid: b.id, type: 'island', oid: o.id });
          }
        } else if (Math.abs(nz - o.z) < o.d + b.halfLen) {
          // Đang đi dọc cạnh đảo mà lái lấn vào: đẩy ra phía lòng sông.
          const dir = o.x > 0 ? -1 : 1;
          b.x = clamp(o.x + dir * (o.w + C.BOAT_HALF_WIDTH + 0.01), -half, half);
        }
      } else if (o.type === 'log') {
        if (Math.abs(nz - o.z) > o.d + b.halfLen || b.hits.has(o.id)) continue;
        b.hits.add(o.id);
        b.stunUntil = now + C.LOG_STUN_MS;
        b.speed *= C.LOG_SLOW;
        events.push({ bid: b.id, type: 'log', oid: o.id });
      }
    }
    b.z = nz;

    if (b.z >= race.trackLen) {
      b.z = race.trackLen;
      b.finishMs = now - race.startAt;
      b.rank = ++race.finishCount;
      if (!race.firstFinishAt) race.firstFinishAt = now;
      events.push({ bid: b.id, type: 'finish', rank: b.rank });
    }
  }
  if (race.pro && !race.endedAt) resolveCollisions(race, now, events);
  return events;
}

// Kiểu Pro: thuyền chồng lên nhau thì đẩy sang hai bên và cùng chậm lại.
// Thuyền phía sau tông đuôi thì không nhanh hơn thuyền phía trước (không kéo lùi vị trí).
function resolveCollisions(race, now, events) {
  const C = race.cfg;
  const active = race.boats.filter(b => b.finishMs == null);
  const minDx = C.BOAT_HALF_WIDTH * 2;
  const half = race.width / 2 - C.BOAT_HALF_WIDTH - 0.2;
  const contacts = new Set();

  for (let i = 0; i < active.length; i++) {
    for (let j = i + 1; j < active.length; j++) {
      const a = active[i];
      const b = active[j];
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const overlapX = minDx - Math.abs(dx);
      const overlapZ = a.halfLen + b.halfLen - Math.abs(dz);
      if (overlapX <= 0 || overlapZ <= 0) continue;

      const key = a.id < b.id ? `${a.id}|${b.id}` : `${b.id}|${a.id}`;
      contacts.add(key);
      a.bumpSlowUntil = now + C.BUMP_SLOW_MS;
      b.bumpSlowUntil = now + C.BUMP_SLOW_MS;

      const dir = Math.abs(dx) > 0.01 ? Math.sign(dx) : key.length % 2 ? 1 : -1;
      const push = overlapX * C.BUMP_PUSH * 0.5;
      a.x = clamp(a.x - dir * push, -half, half);
      b.x = clamp(b.x + dir * push, -half, half);

      if (Math.abs(dz) > Math.min(a.halfLen, b.halfLen)) {
        const back = dz > 0 ? a : b;
        const front = dz > 0 ? b : a;
        back.speed = Math.min(back.speed, front.speed);
      }

      if (!race.contacts.has(key)) {
        for (const p of [a, b]) {
          if (now - p.lastBumpAt < C.BUMP_FX_GAP_MS) continue;
          p.lastBumpAt = now;
          events.push({ bid: p.id, type: 'bump' });
        }
      }
    }
  }
  race.contacts = contacts;
}

function isOver(race, now) {
  if (race.boats.every(b => b.finishMs != null)) return true;
  return race.firstFinishAt != null && now - race.firstFinishAt > race.cfg.FINISH_TIMEOUT_MS;
}

// Thứ hạng hiện tại: về đích trước đứng trước, còn lại xếp theo quãng đường.
function standings(boats) {
  return [...boats].sort((a, b) => {
    if (a.rank != null && b.rank != null) return a.rank - b.rank;
    if (a.rank != null) return -1;
    if (b.rank != null) return 1;
    return b.z - a.z;
  });
}

function timeText(b, trackLen) {
  return b.finishMs != null ? `${(b.finishMs / 1000).toFixed(2)}s` : `chưa về đích (${Math.round(Math.min(1, b.z / trackLen) * 100)}%)`;
}

// Kết quả: thi đơn mỗi người một dòng; theo đội mỗi đội một dòng (members = id các thành viên).
function results(race) {
  return standings(race.boats).map((b, i) => {
    if (b.team == null) {
      const r = b.crew[0];
      return { id: r.id, name: r.name, animal: r.animal, color: r.color, bot: r.bot, place: i + 1, detail: timeText(b, race.trackLen) };
    }
    return {
      id: b.id,
      name: `${b.teamEmoji} ${b.name}`,
      animal: b.crew[0].animal,
      color: b.color,
      bot: false,
      place: i + 1,
      members: b.crew.map(r => r.id),
      detail: `${b.crew.map(r => r.name).join(', ')} · ${timeText(b, race.trackLen)}`,
    };
  });
}

function flagsOf(b, now) {
  let f = 0;
  if (now < b.stunUntil) f |= FLAG_STUN;
  if (now < b.bumpSlowUntil) f |= FLAG_BUMP;
  if (b.finishMs != null) f |= FLAG_FINISHED;
  if (b.blocked) f |= FLAG_BLOCKED;
  return f;
}

// Bot: chèo đều theo tay nghề + phong độ lên xuống; kiểu Pro thì né đảo, khúc gỗ và thuyền chậm phía trước.
// Bot trong đội chỉ góp phần của mình (trung bình với người thật).
function botThink(race, r, now) {
  const b = boatOf(race, r);
  if (!isRunning(race, b, now)) return;
  const C = race.cfg;
  const progress = b.z / race.trackLen;

  if (now >= r.botFormAt) {
    r.botForm = r.botStyle === 'wobbly' ? rand(0.5, 1.4) : rand(0.8, 1.2);
    r.botFormAt = now + rand(2000, 4000);
  }
  let pace = 1;
  if (r.botStyle === 'starter') pace = progress < 0.4 ? 1.25 : 0.85;
  else if (r.botStyle === 'finisher') pace = progress < 0.5 ? 0.85 : 1.25;

  if (now < race.startAt + r.botDelay) {
    r.drive = 0;
  } else {
    const desired = (0.35 + 0.6 * r.botSkill) * r.botForm * pace * rand(0.92, 1.05);
    r.drive = clamp(desired, 0, 1) / C.DRIVE_GAIN; // chia DRIVE_GAIN để độ khó chỉ ảnh hưởng người chơi
  }
  r.driveAt = now;

  if (!race.pro) {
    r.steer = 0;
    return;
  }

  const half = race.width / 2 - C.BOAT_HALF_WIDTH - 0.6;
  if (now >= r.botLaneAt) {
    r.botLaneX = rand(-half, half);
    r.botLaneAt = now + rand(3000, 7000);
  }
  let target = r.botLaneX ?? b.x;
  let nearest = Infinity;
  for (const o of race.obstacles) {
    const ahead = o.z - o.d - (b.z + b.halfLen);
    if (ahead < -o.d * 2 || ahead > 20) continue;
    if (Math.abs(b.x - o.x) > o.w + C.BOAT_HALF_WIDTH + 0.8) continue;
    if (ahead >= nearest) continue;
    nearest = ahead;
    if (!r.botPlan.has(o.id)) {
      // Bot kém thỉnh thoảng không để ý khúc gỗ (đảo thì luôn thấy).
      const miss = o.type === 'log' && Math.random() < (1 - r.botSkill) * 0.4;
      r.botPlan.set(o.id, miss ? 'miss' : 'dodge');
    }
    if (r.botPlan.get(o.id) === 'miss') {
      target = b.x;
    } else if (o.type === 'island') {
      target = o.x > 0 ? o.x - o.w - C.BOAT_HALF_WIDTH - 1.2 : o.x + o.w + C.BOAT_HALF_WIDTH + 1.2;
    } else {
      const left = o.x - o.w - C.BOAT_HALF_WIDTH - 0.8;
      const right = o.x + o.w + C.BOAT_HALF_WIDTH + 0.8;
      target = (b.x <= o.x && left >= -half) || right > half ? left : right;
    }
  }

  // Thuyền chậm hơn chắn ngay phía trước thì lách sang bên.
  for (const q of race.boats) {
    if (q === b || q.finishMs != null) continue;
    const ahead = q.z - b.z;
    if (ahead <= 0 || ahead > 7 || ahead >= nearest) continue;
    if (Math.abs(q.x - b.x) > C.BOAT_HALF_WIDTH * 2 + 0.3 || q.speed >= b.speed) continue;
    nearest = ahead;
    const left = q.x - 1.8;
    const right = q.x + 1.8;
    target = b.x <= q.x ? (left >= -half ? left : right) : right <= half ? right : left;
  }

  target = clamp(target, -half, half);
  r.steer = clamp((target - b.x) * 1.2, -1, 1);
}

module.exports = {
  createRace,
  settingsFor,
  isLevel,
  step,
  move,
  steer,
  isOver,
  standings,
  results,
  flagsOf,
  botThink,
  boatOf,
  FLAGS: { STUN: FLAG_STUN, BUMP: FLAG_BUMP, FINISHED: FLAG_FINISHED, BLOCKED: FLAG_BLOCKED },
};

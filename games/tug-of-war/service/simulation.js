// Mô phỏng một ván kéo co. Không biết gì về socket hay đồ hoạ.
// Hai đội: đội 0 (Đỏ) đứng bên trái, đội 1 (Xanh) bên phải. rope = vị trí dấu giữa dây (mét):
// âm = lệch về đội Đỏ, dương = lệch về đội Xanh. Kéo qua -WIN_DISTANCE thì Đỏ thắng, qua +WIN_DISTANCE thì Xanh thắng.
// Mỗi lần bắt đầu chỉ đấu 1 ván: countdown → pull → end (xem đội thua rơi xuống sông) → done.
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
  return { ...CONFIG, ...over, level: key };
}

// players: [{ id, name, animal, color, bot, team }]; teams: [đội 0, đội 1].
function createGame({ players, teams, level, now, startAt }) {
  const C = settingsFor(level);
  const start = startAt ?? now + C.COUNTDOWN_MS;
  const pullers = players.map(p => ({
    id: p.id,
    name: p.name,
    animal: p.animal,
    color: p.color,
    bot: !!p.bot,
    team: p.team === 1 ? 1 : 0,
    drive: 0, // mức lắc gửi lên (0..1.5)
    driveAt: 0,
    driveEff: 0, // mức kéo sau khi nhân độ khó (0..1)
    botSkill: rand(C.BOT.skillMin, C.BOT.skillMax),
    botForm: 1,
    botFormAt: 0,
    botDelay: start + rand(150, 900), // phản xạ lúc bắt đầu
  }));
  const sides = [0, 1].map(i => ({
    team: teams[i],
    members: pullers.filter(p => p.team === i),
    force: 0, // lực hiện tại = trung bình mức kéo
    forceSum: 0, // cộng dồn cả ván, để phân thắng thua nếu hết giờ mà dây đứng giữa
  }));
  return {
    cfg: C,
    level: C.level,
    phase: 'countdown',
    startAt: start,
    endAt: 0, // lúc phân thắng thua
    rope: 0,
    ropeV: 0,
    sides,
    pullers,
    byId: new Map(pullers.map(p => [p.id, p])),
    winner: null,
    byTime: false,
    endedAt: null, // lúc kết thúc hẳn (sau khi xem đội thua rơi xuống sông)
  };
}

// Điện thoại gửi mức lắc hiện tại (0 = không kéo) khoảng 10 lần/giây.
function move(g, p, level, now) {
  if (g.phase !== 'countdown' && g.phase !== 'pull') return;
  p.drive = clamp(Number(level) || 0, 0, 1.5);
  p.driveAt = now;
}

function decide(g, winner, now, byTime, events) {
  g.winner = winner;
  g.byTime = byTime;
  g.phase = 'end';
  g.endAt = now;
  g.ropeV = 0;
  events.push({ type: 'win', team: winner, byTime });
}

function step(g, now, dt) {
  const C = g.cfg;
  const events = [];

  // Mức kéo của từng người (tính cả lúc đếm ngược để điện thoại hiện thanh lắc).
  for (const p of g.pullers) {
    const fresh = now - p.driveAt <= C.MOVE_STALE_MS;
    const raw = fresh ? p.drive * C.DRIVE_GAIN : 0;
    p.driveEff = raw < C.MIN_DRIVE ? 0 : Math.min(1, raw); // vùng chết: rung tay nhẹ = không kéo
  }
  for (const s of g.sides) {
    s.force = s.members.length ? s.members.reduce((sum, p) => sum + p.driveEff, 0) / s.members.length : 0;
  }

  if (g.phase === 'countdown' && now >= g.startAt) {
    g.phase = 'pull';
  } else if (g.phase === 'pull') {
    const [red, blue] = g.sides;
    red.forceSum += red.force * dt;
    blue.forceSum += blue.force * dt;
    // Đội Xanh mạnh hơn thì dây chạy sang phải (dương), Đỏ mạnh hơn thì sang trái (âm).
    const target = (blue.force - red.force) * C.PULL_SPEED;
    g.ropeV += (target - g.ropeV) * Math.min(1, dt * C.ROPE_RESPONSE);
    g.rope += g.ropeV * dt;
    if (g.rope <= -C.WIN_DISTANCE) {
      g.rope = -C.WIN_DISTANCE;
      decide(g, 0, now, false, events);
    } else if (g.rope >= C.WIN_DISTANCE) {
      g.rope = C.WIN_DISTANCE;
      decide(g, 1, now, false, events);
    } else if (now - g.startAt >= C.ROUND_MS) {
      // Hết giờ: dây lệch bên nào bên đó thắng; đứng đúng giữa thì đội kéo nhiều hơn cả ván thắng.
      let winner;
      if (Math.abs(g.rope) > 0.05) winner = g.rope < 0 ? 0 : 1;
      else winner = red.forceSum === blue.forceSum ? (Math.random() < 0.5 ? 0 : 1) : red.forceSum > blue.forceSum ? 0 : 1;
      decide(g, winner, now, true, events);
    }
  } else if (g.phase === 'end' && now - g.endAt >= C.END_SHOW_MS) {
    g.phase = 'done';
    g.endedAt = now;
  }
  return events;
}

// Bot: kéo đều theo tay nghề, phong độ lên xuống mỗi 1,5–3 giây.
function botThink(g, p, now) {
  if (g.phase !== 'pull' || now < p.botDelay) {
    p.drive = 0;
    p.driveAt = now;
    return;
  }
  if (now >= p.botFormAt) {
    p.botForm = rand(0.8, 1.2);
    p.botFormAt = now + rand(1500, 3000);
  }
  const desired = (0.4 + 0.55 * p.botSkill) * p.botForm * rand(0.92, 1.05);
  p.drive = clamp(desired, 0, 1) / g.cfg.DRIVE_GAIN; // chia DRIVE_GAIN để độ khó chỉ ảnh hưởng người chơi
  p.driveAt = now;
}

// Kết quả: mỗi đội một dòng, đội thắng đứng trước.
function results(g) {
  const winner = g.winner ?? 0;
  return [winner, 1 - winner].map((i, place) => {
    const s = g.sides[i];
    return {
      id: `t${s.team.id}`,
      name: `${s.team.emoji} Đội ${s.team.name}`,
      animal: s.members[0]?.animal,
      color: s.team.color,
      bot: false,
      place: place + 1,
      members: s.members.map(p => p.id),
      detail: `${place === 0 ? 'Thắng' : 'Thua'}${g.byTime ? ' (hết giờ)' : ''} · ${s.members.map(p => p.name).join(', ')}`,
    };
  });
}

module.exports = { createGame, settingsFor, isLevel, step, move, botThink, results };

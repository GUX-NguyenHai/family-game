// Mô phỏng cuộc đua nhảy bao bố. Không biết gì về socket hay đồ hoạ.
// Toạ độ: z = quãng đường (0 → trackLen), mỗi người một làn cố định (x).
// Mỗi lần hất máy = 1 bước nhảy bay HOP_MS. Hất ngay sau khi đáp (đúng nhịp) thì bước dài dần;
// hất lúc còn đang bay (quá sớm) thì đáp xuống bị ngã, nằm FALL_MS rồi nhảy lại từ bước ngắn.
const CONFIG = require('./config');

const DIFFICULTY_META = new Set(['label', 'desc']);
const FLAG_HOP = 1;
const FLAG_FALL = 2;
const FLAG_FINISHED = 4;

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

function trackWidthFor(count) {
  return clamp(4 + count * 1.2, 8, 18);
}

function createRace(racers, now, level, startAt = null) {
  const C = settingsFor(level);
  const width = trackWidthFor(racers.length);
  const laneW = width / Math.max(1, racers.length);
  racers.forEach((p, i) => {
    p.lane = -width / 2 + laneW * (i + 0.5);
    p.z = 0;
    p.hopAt = 0; // lúc bắt đầu bước nhảy hiện tại (0 = chưa nhảy)
    p.landAt = 0; // lúc đáp của bước nhảy hiện tại
    p.hopFrom = 0;
    p.hopLen = 0;
    p.landed = true;
    p.combo = 0; // số nhịp đúng liên tiếp
    p.queued = false; // hất sớm một chút: nhảy tiếp ngay khi đáp
    p.willFall = false; // hất quá sớm: đáp xuống thì ngã
    p.fallUntil = 0;
    p.hops = 0;
    p.falls = 0;
    p.finishMs = null;
    p.rank = null;
    if (p.bot) {
      p.botSkill = rand(C.BOT.skillMin, C.BOT.skillMax);
      p.botNextAt = null;
      p.botEarlyAt = null;
      p.botStart = rand(150, 700); // phản xạ lúc xuất phát
    }
  });
  return {
    cfg: C,
    level: C.level,
    width,
    trackLen: C.TRACK_LEN,
    startAt: startAt ?? now + C.COUNTDOWN_MS,
    firstFinishAt: null,
    finishCount: 0,
    endedAt: null,
  };
}

function isRunning(race, p, now) {
  return !race.endedAt && now >= race.startAt && p.finishMs == null;
}

function startHop(race, p, now, good, events) {
  const C = race.cfg;
  p.combo = good ? p.combo + 1 : 0;
  p.hopLen = Math.min(C.HOP_MAX, C.HOP_BASE + C.HOP_PER_COMBO * p.combo);
  p.hopFrom = p.z;
  p.hopAt = now;
  p.landAt = now + C.HOP_MS;
  p.landed = false;
  p.hops++;
  events.push({ type: 'hop', pid: p.id, len: Math.round(p.hopLen * 100) / 100, c: p.combo });
}

// Người chơi hất/giật máy lên.
function hop(race, p, now, events) {
  if (!isRunning(race, p, now)) return;
  if (now < p.fallUntil || p.willFall) return; // đang nằm hoặc đã hất hỏng: bỏ qua
  const C = race.cfg;
  if (!p.landed) {
    // Còn đang bay: sớm một chút thì xếp hàng nhảy tiếp, quá sớm thì đáp xuống sẽ ngã.
    if (p.landAt - now <= C.EARLY_GRACE_MS) p.queued = true;
    else {
      p.willFall = true;
      p.queued = false;
    }
    return;
  }
  // Đang đứng: đúng nhịp nếu vừa đáp (không tính bước đầu tiên và lúc vừa đứng dậy sau khi ngã).
  const good = p.hopAt > 0 && p.landAt > p.fallUntil && now - p.landAt <= C.GOOD_WINDOW_MS;
  startHop(race, p, now, good, events);
}

function step(race, racers, now) {
  const C = race.cfg;
  const events = [];
  if (now < race.startAt || race.endedAt) return events;
  for (const p of racers) {
    if (p.finishMs != null) continue;
    if (!p.landed) {
      if (now < p.landAt) {
        p.z = p.hopFrom + (p.hopLen * (now - p.hopAt)) / C.HOP_MS;
      } else {
        p.z = p.hopFrom + p.hopLen;
        p.landed = true;
        if (p.willFall) {
          p.willFall = false;
          p.queued = false;
          p.combo = 0;
          p.falls++;
          p.fallUntil = p.landAt + C.FALL_MS;
          events.push({ type: 'fall', pid: p.id });
        } else if (p.queued) {
          p.queued = false;
          startHop(race, p, now, true, events);
        }
      }
    }
    if (p.z >= race.trackLen) {
      p.z = race.trackLen;
      p.landed = true;
      p.finishMs = now - race.startAt;
      p.rank = ++race.finishCount;
      if (!race.firstFinishAt) race.firstFinishAt = now;
      events.push({ type: 'finish', pid: p.id, rank: p.rank });
    }
  }
  return events;
}

function isOver(race, racers, now) {
  if (!racers.length || racers.every(p => p.finishMs != null)) return true;
  if (now - race.startAt > race.cfg.MAX_RACE_MS) return true;
  return race.firstFinishAt != null && now - race.firstFinishAt > race.cfg.FINISH_TIMEOUT_MS;
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
    detail:
      p.finishMs != null
        ? `${(p.finishMs / 1000).toFixed(2)}s · ngã ${p.falls} lần`
        : `chưa về đích (${Math.floor(p.z)}/${trackLen}m) · ngã ${p.falls} lần`,
  }));
}

function flagsOf(p, now) {
  let f = 0;
  if (!p.landed) f |= FLAG_HOP;
  if (now < p.fallUntil) f |= FLAG_FALL;
  if (p.finishMs != null) f |= FLAG_FINISHED;
  return f;
}

// Bot: đáp xong chờ một chút (giỏi thì chờ ít) rồi nhảy tiếp; thỉnh thoảng hất sớm quá và bị ngã.
function botThink(race, p, now, events) {
  if (!isRunning(race, p, now) || now < race.startAt + p.botStart || now < p.fallUntil) return;
  const C = race.cfg;
  if (!p.landed) {
    if (p.botEarlyAt != null && now >= p.botEarlyAt) {
      p.botEarlyAt = null;
      hop(race, p, now, events);
    }
    return;
  }
  if (p.botNextAt == null) p.botNextAt = Math.max(now, p.landAt) + rand(60, 140 + (1 - p.botSkill) * 450);
  if (now < p.botNextAt) return;
  p.botNextAt = null;
  hop(race, p, now, events);
  // Lần sau có hất hỏng (quá sớm, lúc còn đang bay) không.
  p.botEarlyAt = Math.random() < C.BOT.fallChance ? p.landAt - rand(C.EARLY_GRACE_MS + 60, C.HOP_MS - 60) : null;
}

module.exports = {
  createRace,
  settingsFor,
  isLevel,
  hop,
  step,
  isOver,
  standings,
  results,
  flagsOf,
  botThink,
  FLAGS: { HOP: FLAG_HOP, FALL: FLAG_FALL, FINISHED: FLAG_FINISHED },
};

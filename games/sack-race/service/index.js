// Game Nhảy bao bố: khai báo cho nền tảng + nối các sự kiện chung với phần mô phỏng (simulation.js).
const C = require('./config');
const simulation = require('./simulation');
const codec = require('../../../src/state-codec');

// Trạng thái gửi cho TV mã hoá nhị phân theo schema (TV giải mã bằng cùng file).
const stateCodec = codec.compile(require('../assets/schema.json'));

function createMatch({ players, options, now, startAt, api }) {
  // Bản sao riêng của game; nền tảng giữ đối tượng người chơi gốc.
  const racers = players.map(p => ({ id: p.id, name: p.name, animal: p.animal, color: p.color, bot: p.bot }));
  const byId = new Map(racers.map(r => [r.id, r]));
  const race = simulation.createRace(racers, now, options.difficulty, startAt);

  // Thứ hạng tính 1 lần cho mỗi tick rồi dùng cho mọi điện thoại.
  let orderAt = -1;
  let order = new Map();

  function phase(now) {
    if (now < race.startAt) return 'countdown';
    return race.endedAt ? 'finished' : 'racing';
  }

  // hop: TV vẽ bước nhảy ngay; điện thoại của người đó hẹn giờ rung báo lúc đáp.
  // fall/finish: TV + điện thoại của người đó.
  function send(events) {
    for (const e of events) {
      api.toHost(e);
      if (byId.get(e.pid)?.bot) continue;
      api.toPlayer(e.pid, e.type === 'hop' ? { type: 'hop', cueMs: race.cfg.HOP_MS - race.cfg.LAND_CUE_LEAD_MS, c: e.c } : e);
    }
  }

  return {
    // Gửi cho màn hình chung lúc bắt đầu (và khi màn hình tải lại giữa chừng).
    setup() {
      return {
        level: race.level,
        width: race.width,
        trackLen: race.trackLen,
        hopMs: race.cfg.HOP_MS,
        racers: racers.map(p => p.id), // thứ tự các hàng trong trạng thái nhị phân = thứ tự làn trái → phải
        lanes: racers.map(p => Math.round(p.lane * 100) / 100),
      };
    },

    input(pid, type, data, now) {
      const p = byId.get(pid);
      if (!p || type !== 'jump') return;
      const events = [];
      simulation.hop(race, p, now, events);
      send(events);
    },

    tick(now) {
      const events = [];
      for (const p of racers) if (p.bot) simulation.botThink(race, p, now, events);
      events.push(...simulation.step(race, racers, now));
      send(events);
      if (!race.endedAt && now >= race.startAt && simulation.isOver(race, racers, now)) {
        race.endedAt = now;
        api.finish(simulation.results(racers, race.trackLen));
      }
    },

    // Nhị phân ~5 byte mỗi người.
    hostState(now) {
      return codec.encode(stateCodec, {
        state: phase(now),
        p: racers.map(p => ({ z: p.z, f: simulation.flagsOf(p, now), c: p.combo, r: p.rank })),
      });
    },

    playerState(pid, now) {
      const p = byId.get(pid);
      if (!p) return null;
      if (orderAt !== now) {
        orderAt = now;
        order = new Map(simulation.standings(racers).map((q, i) => [q.id, i + 1]));
      }
      return {
        state: phase(now),
        pos: order.get(pid),
        total: racers.length,
        prog: Math.round(Math.min(1, p.z / race.trackLen) * 100) / 100,
        c: p.combo,
        f: simulation.flagsOf(p, now),
        rank: p.rank,
      };
    },
  };
}

module.exports = {
  id: 'sack-race', // trùng tên thư mục games/sack-race
  name: { vi: 'Nhảy bao bố', en: 'Sack Race' },
  category: 'folk', // nhóm trên thanh chọn game (xem GAME_CATEGORIES trong src/config.js)
  emoji: '🛍️',
  description: {
    vi: 'Mỗi lần hất hoặc giật máy lên là nhảy một bước. Hất ngay khi vừa đáp (điện thoại rung) thì bước dài dần; hất vội lúc còn đang bay là ngã! Không có nút bấm.',
    en: 'Every flick or jerk of your phone is one hop. Flick right as you land (the phone buzzes) and your hops get longer; flick while still in the air and you fall! No buttons.',
  },
  maxPlayers: 12,
  bots: true,
  sensors: true,
  tickHz: C.TICK_HZ,
  hostEvery: C.HOST_UPDATE_EVERY,
  playerEvery: C.PLAYER_UPDATE_EVERY,
  countdownMs: C.COUNTDOWN_MS,
  goText: { vi: 'NHẢY!', en: 'HOP!' },
  coastMs: C.COAST_MS,
  options: [
    {
      key: 'difficulty',
      label: { vi: 'Độ khó', en: 'Difficulty' },
      default: C.DEFAULT_DIFFICULTY,
      choices: Object.entries(C.DIFFICULTIES).map(([value, d]) => ({ value, label: d.label, desc: d.desc })),
    },
  ],
  // Phòng chờ: cảnh 3D dựng sẵn đường đua đúng độ dài theo độ khó.
  preview: options => ({ trackLen: simulation.settingsFor(options.difficulty).TRACK_LEN }),
  createMatch,
};

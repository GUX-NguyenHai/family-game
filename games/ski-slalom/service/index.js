// Game Trượt tuyết vượt cổng: khai báo cho nền tảng + nối các sự kiện chung với phần mô phỏng (simulation.js).
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

  return {
    // Gửi cho màn hình chung lúc bắt đầu (và khi màn hình tải lại giữa chừng).
    setup() {
      return {
        level: race.level,
        width: race.width,
        courseLen: race.courseLen,
        gates: race.gates,
        obstacles: race.obstacles,
        racers: racers.map(p => p.id), // thứ tự các hàng trong trạng thái nhị phân = thứ tự đứng ở vạch xuất phát (trái → phải)
      };
    },

    input(pid, type, data, now) {
      const p = byId.get(pid);
      if (p && type === 'steer') simulation.steer(race, p, data, now);
    },

    leave(pid) {
      const p = byId.get(pid);
      if (p) p.steer = 0;
    },

    tick(now, dt) {
      for (const p of racers) if (p.bot) simulation.botThink(race, p, now);
      for (const e of simulation.step(race, racers, now, dt)) {
        if (e.type !== 'pass') api.toHost(e); // qua cổng thì TV không cần báo, chỉ điện thoại
        if (!byId.get(e.pid)?.bot) api.toPlayer(e.pid, e);
      }
      if (!race.endedAt && now >= race.startAt && simulation.isOver(race, racers, now)) {
        race.endedAt = now;
        api.finish(simulation.results(race, racers));
      }
    },

    // Nhị phân ~10 byte mỗi người.
    hostState(now) {
      return codec.encode(stateCodec, {
        state: phase(now),
        p: racers.map(p => ({
          x: p.x,
          z: p.z,
          h: p.heading,
          sp: p.speed,
          f: simulation.flagsOf(p, now),
          pen: p.penaltyMs / 1000,
          r: p.rank,
        })),
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
        prog: Math.round(Math.min(1, p.z / race.courseLen) * 100) / 100,
        gate: p.nextGate,
        gates: race.gates.length,
        pen: p.penaltyMs / 1000,
        f: simulation.flagsOf(p, now),
        rank: p.rank,
        time: p.totalMs,
      };
    },
  };
}

module.exports = {
  id: 'ski-slalom', // trùng tên thư mục games/ski-slalom
  name: { vi: 'Trượt tuyết vượt cổng', en: 'Ski Slalom' },
  category: 'motion', // nhóm trên thanh chọn game (xem GAME_CATEGORIES trong src/config.js)
  emoji: '⛷️',
  description: {
    vi: 'Nghiêng điện thoại trái/phải để lái xuống dốc tuyết, đi qua giữa các cổng cờ. Trượt cổng bị phạt 3 giây, đâm cây là ngã. Ít thời gian nhất thì thắng. Không cần lắc.',
    en: 'Tilt your phone left and right to steer down the snowy slope through the flag gates. A missed gate costs 3 seconds, hitting a tree makes you fall. Fastest time wins. No shaking.',
  },
  maxPlayers: 12,
  bots: true,
  sensors: true,
  tickHz: C.TICK_HZ,
  hostEvery: C.HOST_UPDATE_EVERY,
  playerEvery: C.PLAYER_UPDATE_EVERY,
  countdownMs: C.COUNTDOWN_MS,
  goText: { vi: 'TRƯỢT!', en: 'SKI!' },
  coastMs: C.COAST_MS,
  options: [
    {
      key: 'difficulty',
      label: { vi: 'Độ khó', en: 'Difficulty' },
      default: C.DEFAULT_DIFFICULTY,
      choices: Object.entries(C.DIFFICULTIES).map(([value, d]) => ({ value, label: d.label, desc: d.desc })),
    },
  ],
  // Phòng chờ: cảnh 3D dựng sẵn dốc đúng độ dài theo độ khó.
  preview: options => ({ courseLen: simulation.courseLength(simulation.settingsFor(options.difficulty)), width: C.COURSE_WIDTH }),
  createMatch,
};

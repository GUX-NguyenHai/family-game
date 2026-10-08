// Game __NAME__: khai báo cho nền tảng + nối các sự kiện chung với phần mô phỏng (simulation.js).
// Hợp đồng đầy đủ: games/README.md mục 3.
const C = require('./config');
const simulation = require('./simulation');
const codec = require('../../../src/state-codec');

// Trạng thái gửi cho TV mã hoá nhị phân theo schema (TV giải mã bằng cùng file).
const stateCodec = codec.compile(require('../assets/schema.json'));

function createMatch({ players, options, now, startAt, api }) {
  const g = simulation.createGame({ players, difficulty: options.difficulty, now, startAt });

  function timeLeft(now) {
    return g.phase === 'playing' ? Math.max(0, g.cfg.ROUND_MS - (now - g.startAt)) : 0;
  }

  return {
    setup() {
      return { players: g.list.map(p => p.id), roundMs: g.cfg.ROUND_MS }; // thứ tự các hàng trong trạng thái nhị phân
    },

    input(pid, type, data, now) {
      const p = g.byId.get(pid);
      if (p && type === 'move') simulation.move(g, p, data, now);
    },

    leave(pid) {
      const p = g.byId.get(pid);
      if (p) p.drive = 0;
    },

    tick(now, dt) {
      for (const p of g.list) if (p.bot) simulation.botThink(g, p, now);
      for (const e of simulation.step(g, now, dt)) {
        if (e.type === 'end') {
          api.finish(simulation.results(g));
          continue;
        }
        api.toHost(e);
        if (e.pid) api.toPlayer(e.pid, e);
      }
    },

    // Nhị phân: vài byte đầu + 3 byte mỗi người, theo thứ tự setup().players.
    hostState(now) {
      return codec.encode(stateCodec, {
        phase: g.phase,
        timeLeft: timeLeft(now),
        p: g.list.map(p => ({ v: p.fill, d: p.driveEff, r: p.rank })),
      });
    },

    playerState(pid, now) {
      const p = g.byId.get(pid);
      if (!p) return null;
      return {
        phase: g.phase,
        fill: Math.round(p.fill * 100) / 100,
        drive: Math.round(p.driveEff * 100) / 100,
        rank: p.rank,
        timeLeft: Math.ceil(timeLeft(now) / 1000),
      };
    },
  };
}

module.exports = {
  id: '__ID__', // trùng tên thư mục games/__ID__
  // Chữ người chơi thấy: { vi, en } (xem games/README.md mục "Hai thứ tiếng").
  name: { vi: '__NAME__', en: '__NAME_EN__' },
  category: 'motion', // motion | reflex | mind | secret | folk (GAME_CATEGORIES trong src/config.js)
  emoji: '__EMOJI__',
  description: {
    vi: 'Lắc điện thoại lên xuống để đổ đầy thanh của mình. Ai đầy trước thì thắng! Không có nút bấm.',
    en: 'Shake your phone up and down to fill your bar. First to fill it wins! No buttons.',
  },
  maxPlayers: 12,
  minPlayers: 1,
  bots: true,
  sensors: true,
  tickHz: C.TICK_HZ,
  hostEvery: C.HOST_UPDATE_EVERY,
  playerEvery: C.PLAYER_UPDATE_EVERY,
  countdownMs: C.COUNTDOWN_MS,
  goText: { vi: 'LẮC!', en: 'SHAKE!' },
  coastMs: C.COAST_MS,
  options: [
    {
      key: 'difficulty',
      label: { vi: 'Độ khó', en: 'Difficulty' },
      default: C.DEFAULT_DIFFICULTY,
      choices: Object.entries(C.DIFFICULTIES).map(([value, d]) => ({ value, label: d.label, desc: d.desc })),
    },
  ],
  createMatch,
};

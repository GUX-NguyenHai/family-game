// Game Kéo co: khai báo cho nền tảng + nối các sự kiện chung với phần mô phỏng (simulation.js).
// Mỗi lần bắt đầu là 1 ván; chủ phòng muốn đấu tiếp thì bấm "Chơi lại" (ván nào tính ván đó).
const C = require('./config');
const simulation = require('./simulation');
const codec = require('../../../src/state-codec');

// Trạng thái gửi cho TV mã hoá nhị phân theo schema (TV giải mã bằng cùng file).
const stateCodec = codec.compile(require('../assets/schema.json'));

function round(v, k) {
  return Math.round(v * k) / k;
}

function createMatch({ players, options, teams, now, startAt, api }) {
  const g = simulation.createGame({ players, teams, level: options.difficulty, now, startAt });

  function timeLeft(now) {
    return g.phase === 'pull' ? Math.max(0, g.cfg.ROUND_MS - (now - g.startAt)) : 0;
  }

  return {
    setup() {
      return {
        win: g.cfg.WIN_DISTANCE,
        riverHalf: g.cfg.RIVER_HALF,
        teams: g.sides.map(s => ({ ...s.team, members: s.members.map(p => p.id) })),
        order: g.pullers.map(p => p.id), // thứ tự các hàng trong trạng thái nhị phân
      };
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
      for (const p of g.pullers) if (p.bot) simulation.botThink(g, p, now);
      for (const e of simulation.step(g, now, dt)) {
        api.toHost(e);
        api.toPlayers(e);
      }
      if (g.phase === 'done' && g.endedAt === now) api.finish(simulation.results(g));
    },

    // Nhị phân ~10 byte + 1 byte mỗi người, theo thứ tự setup().order.
    hostState(now) {
      return codec.encode(stateCodec, {
        phase: g.phase,
        rope: g.rope,
        forces: g.sides.map(s => s.force),
        winner: g.winner,
        byTime: g.byTime,
        timeLeft: timeLeft(now),
        p: g.pullers.map(p => ({ d: p.driveEff })),
      });
    },

    playerState(pid, now) {
      const p = g.byId.get(pid);
      if (!p) return null;
      return {
        phase: g.phase,
        team: p.team,
        rope: round(g.rope / g.cfg.WIN_DISTANCE, 100), // -1 (Đỏ thắng) .. 1 (Xanh thắng)
        pw: round(p.driveEff, 100), // mức kéo của mình
        tw: round(g.sides[p.team].force, 100), // lực đội mình
        ow: round(g.sides[1 - p.team].force, 100), // lực đội kia
        winner: g.winner,
        timeLeft: timeLeft(now),
      };
    },
  };
}

module.exports = {
  id: 'tug-of-war', // trùng tên thư mục games/tug-of-war
  name: 'Kéo co',
  category: 'motion', // nhóm trên thanh chọn game (xem GAME_CATEGORIES trong src/config.js)
  emoji: '🪢',
  description: 'Hai đội thi lắc máy để kéo dây qua sông. Đội nào kéo được dấu giữa dây về phía mình thì đội kia rơi xuống sông!',
  maxPlayers: 12,
  bots: true,
  sensors: true,
  teams: { min: 1, max: 6, count: 2, equal: true }, // luôn 2 đội Đỏ/Xanh, phải bằng người
  tickHz: C.TICK_HZ,
  hostEvery: C.HOST_UPDATE_EVERY,
  playerEvery: C.PLAYER_UPDATE_EVERY,
  countdownMs: C.COUNTDOWN_MS,
  goText: 'KÉO!',
  coastMs: C.COAST_MS,
  options: [
    {
      key: 'difficulty',
      label: 'Độ khó',
      default: C.DEFAULT_DIFFICULTY,
      choices: Object.entries(C.DIFFICULTIES).map(([value, d]) => ({ value, label: d.label, desc: d.desc })),
    },
  ],
  preview: options => ({ win: simulation.settingsFor(options.difficulty).WIN_DISTANCE, riverHalf: C.RIVER_HALF }),
  createMatch,
};

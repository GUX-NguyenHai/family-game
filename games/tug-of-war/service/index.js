// Game Kéo co: khai báo cho nền tảng + nối các sự kiện chung với phần mô phỏng (simulation.js).
const C = require('./config');
const simulation = require('./simulation');

function round(v, k) {
  return Math.round(v * k) / k;
}

function createMatch({ players, options, teams, now, startAt, api }) {
  const g = simulation.createGame({ players, teams, level: options.difficulty, rounds: options.rounds, now, startAt });

  // Thời gian còn lại của giai đoạn hiện tại (ms), để màn hình và điện thoại đếm ngược.
  function timers(now) {
    return {
      timeLeft: g.phase === 'pull' ? Math.max(0, g.cfg.ROUND_MS - (now - g.roundStartAt)) : 0,
      phaseLeft: g.phase === 'ready' || g.phase === 'roundEnd' ? Math.max(0, g.phaseUntil - now) : 0,
    };
  }

  return {
    setup() {
      return {
        win: g.cfg.WIN_DISTANCE,
        riverHalf: g.cfg.RIVER_HALF,
        totalRounds: g.totalRounds,
        teams: g.sides.map(s => ({ ...s.team, members: s.members.map(p => p.id) })),
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

    hostState(now) {
      return {
        phase: g.phase,
        round: g.round,
        totalRounds: g.totalRounds,
        wins: g.sides.map(s => s.wins),
        rope: round(g.rope, 100),
        win: g.cfg.WIN_DISTANCE,
        forces: g.sides.map(s => round(s.force, 100)),
        lastWinner: g.lastWinner,
        lastByTime: g.lastByTime,
        ...timers(now),
        p: g.pullers.map(p => ({ id: p.id, d: round(p.driveEff, 10) })),
      };
    },

    playerState(pid, now) {
      const p = g.byId.get(pid);
      if (!p) return null;
      return {
        phase: g.phase,
        round: g.round,
        totalRounds: g.totalRounds,
        wins: g.sides.map(s => s.wins),
        team: p.team,
        rope: round(g.rope / g.cfg.WIN_DISTANCE, 100), // -1 (Đỏ thắng) .. 1 (Xanh thắng)
        pw: round(p.driveEff, 100), // mức kéo của mình
        tw: round(g.sides[p.team].force, 100), // lực đội mình
        ow: round(g.sides[1 - p.team].force, 100), // lực đội kia
        lastWinner: g.lastWinner,
        ...timers(now),
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
  playerEvery: C.PLAYER_UPDATE_EVERY,
  countdownMs: C.COUNTDOWN_MS,
  goText: 'KÉO!',
  coastMs: C.COAST_MS,
  options: [
    {
      key: 'rounds',
      label: 'Số ván',
      default: '3',
      choices: [
        { value: '1', label: '1 ván', desc: 'Một ván quyết định.' },
        { value: '3', label: 'Thắng 2/3', desc: 'Đấu tối đa 3 ván, đội nào thắng 2 ván trước thì thắng trận.' },
      ],
    },
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

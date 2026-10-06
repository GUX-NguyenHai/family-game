// Game Leo cây hái dừa: khai báo cho nền tảng + nối các sự kiện chung với phần mô phỏng (simulation.js).
// Chơi cá nhân, mỗi lần bắt đầu là 1 ván.
const C = require('./config');
const simulation = require('./simulation');
const catalog = require('../assets/figures.json');

const FIGURE_IDS = catalog.figures.map(f => f.id);

function round(v, k) {
  return Math.round(v * k) / k;
}

// Con vật leo cây của người chơi: lựa chọn ở phòng chờ (prefs.figure); chưa chọn thì lấy theo id người chơi
// (cố định cho mỗi người). Phải khớp với defaultFigure() trong screen/index.js.
function figureOf(player) {
  const pick = player.prefs?.figure;
  if (FIGURE_IDS.includes(pick)) return pick;
  let h = 0;
  for (const ch of String(player.id)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return FIGURE_IDS[h % FIGURE_IDS.length];
}

function createMatch({ players, options, now, startAt, api }) {
  const g = simulation.createGame({ players, level: options.difficulty, now, startAt });
  const figures = Object.fromEntries(players.map(p => [p.id, figureOf(p)]));

  // Thứ hạng tính 1 lần cho mỗi tick rồi dùng cho mọi điện thoại.
  let orderAt = -1;
  let order = new Map();

  function timeLeft(now) {
    return g.phase === 'climb' ? Math.max(0, g.cfg.ROUND_MS - (now - g.startAt)) : 0;
  }

  return {
    setup() {
      return {
        height: g.height,
        slipFrom: g.slipFrom,
        slipTo: g.slipTo,
        players: g.climbers.map(c => c.id),
        figures, // id người chơi → con vật leo cây
      };
    },

    input(pid, type, data, now) {
      const c = g.byId.get(pid);
      if (c && type === 'move') simulation.move(g, c, data, now);
    },

    leave(pid) {
      const c = g.byId.get(pid);
      if (c) c.drive = 0;
    },

    tick(now, dt) {
      for (const c of g.climbers) if (c.bot) simulation.botThink(g, c, now);
      for (const e of simulation.step(g, now, dt)) {
        if (e.type === 'top') api.toHost(e); // lên ngọn: màn hình chung báo + thả quả dừa
        api.toPlayer(e.pid, e);
      }
      if (g.phase === 'done' && g.endedAt === now) api.finish(simulation.results(g));
    },

    hostState(now) {
      return {
        phase: g.phase,
        timeLeft: timeLeft(now),
        p: g.climbers.map(c => ({
          id: c.id,
          y: round(c.y, 100),
          d: round(c.driveEff, 10),
          f: simulation.flagsOf(c),
          r: c.rank,
        })),
      };
    },

    playerState(pid, now) {
      const c = g.byId.get(pid);
      if (!c) return null;
      if (orderAt !== now) {
        orderAt = now;
        order = new Map(simulation.standings(g.climbers).map((q, i) => [q.id, i + 1]));
      }
      return {
        phase: g.phase,
        pos: order.get(pid),
        total: g.climbers.length,
        y: round(c.y, 10),
        height: g.height,
        slip: [g.slipFrom / g.height, g.slipTo / g.height], // đoạn trơn (phần chiều cao) để vẽ
        pw: round(c.driveEff, 100),
        need: g.cfg.SLIP_NEED, // trên đoạn trơn phải lắc quá mức này
        f: simulation.flagsOf(c),
        rank: c.rank,
        timeLeft: timeLeft(now),
      };
    },
  };
}

module.exports = {
  id: 'coconut-climb', // trùng tên thư mục games/coconut-climb
  name: 'Leo cây hái dừa',
  category: 'motion', // nhóm trên thanh chọn game (xem GAME_CATEGORIES trong src/config.js)
  emoji: '🌴',
  description: 'Chọn một chú khỉ, lắc máy để leo cây dừa, ngừng lắc là tụt xuống. Qua đoạn thân trơn phải lắc thật mạnh. Ai lên ngọn hái dừa trước thì thắng!',
  maxPlayers: 12,
  bots: true,
  sensors: true,
  tickHz: C.TICK_HZ,
  playerEvery: C.PLAYER_UPDATE_EVERY,
  countdownMs: C.COUNTDOWN_MS,
  goText: 'LEO!',
  coastMs: C.COAST_MS,
  options: [
    {
      key: 'difficulty',
      label: 'Độ khó',
      default: C.DEFAULT_DIFFICULTY,
      choices: Object.entries(C.DIFFICULTIES).map(([value, d]) => ({ value, label: d.label, desc: d.desc })),
    },
  ],
  preview: options => {
    const s = simulation.settingsFor(options.difficulty);
    return { height: s.HEIGHT, slipFrom: s.HEIGHT * s.SLIP_START, slipTo: s.HEIGHT * s.SLIP_END };
  },
  createMatch,
};

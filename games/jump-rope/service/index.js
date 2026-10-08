// Game Nhảy dây: khai báo cho nền tảng + nối các sự kiện chung với phần mô phỏng (simulation.js).
// Chơi cá nhân, 1 mạng: dây vướng chân là bị loại. Ván chia màn, mỗi màn khó hơn; người cuối cùng còn trụ thắng.
const C = require('./config');
const simulation = require('./simulation');
const codec = require('../../../src/state-codec');

// Trạng thái gửi cho TV mã hoá nhị phân theo schema (TV giải mã bằng cùng file).
const stateCodec = codec.compile(require('../assets/schema.json'));

const FLAG = { OUT: 1 };

function createMatch({ players, options, now, startAt, api }) {
  const g = simulation.createGame({ players, difficulty: options.difficulty, now, startAt });

  function send(events) {
    for (const e of events) {
      if (e.type === 'out') {
        api.toHost(e);
        api.toPlayer(e.pid, e);
      } else if (e.type === 'level') {
        api.toHost(e);
        api.toPlayers(e);
      } else if (e.type === 'end') {
        api.finish(simulation.results(g));
      }
    }
  }

  function jumped(p, now) {
    if (simulation.jump(g, p, now)) api.toHost({ type: 'jump', pid: p.id }); // TV cho con vật bật lên ngay
  }

  function timeLeft(now) {
    return g.phase === 'playing' ? Math.max(0, g.levelEndAt - now) : 0;
  }

  return {
    setup() {
      return {
        players: g.jumpers.map(p => p.id), // thứ tự các hàng trong trạng thái nhị phân
        airMs: g.cfg.AIR_MS,
        levelMs: g.cfg.LEVEL_MS,
        maxLevel: g.cfg.MAX_LEVEL,
        titles: simulation.levelTitles(g.cfg),
      };
    },

    input(pid, type, data, now) {
      const p = g.byId.get(pid);
      if (p && type === 'jump') jumped(p, now);
    },

    leave(pid) {
      const p = g.byId.get(pid);
      if (p) send(simulation.leave(g, p));
    },

    tick(now, dt) {
      for (const p of g.jumpers) if (p.bot && simulation.botThink(g, p, now)) api.toHost({ type: 'jump', pid: p.id });
      send(simulation.step(g, now, dt));
    },

    // Nhị phân ~16 byte + 3 byte mỗi người, theo thứ tự setup().players.
    // TV tự quay dây theo rev + rate giữa 2 lần nhận, nên dây trên TV khớp nhịp server dùng để xét.
    hostState(now) {
      return codec.encode(stateCodec, {
        phase: g.phase,
        level: g.level,
        rev: g.rev,
        rate: simulation.rateOf(g),
        timeLeft: timeLeft(now),
        alive: simulation.aliveOf(g).length,
        p: g.jumpers.map(p => ({ f: p.out ? FLAG.OUT : 0, n: p.count })),
      });
    },

    playerState(pid, now) {
      const p = g.byId.get(pid);
      if (!p) return null;
      return {
        phase: g.phase,
        level: g.level,
        title: g.spec.title,
        n: p.count,
        out: p.out,
        outLevel: p.outLevel,
        alive: simulation.aliveOf(g).length,
        total: g.jumpers.length,
        tf: Math.round((timeLeft(now) / g.cfg.LEVEL_MS) * 100) / 100, // phần thời gian màn còn lại (0..1)
      };
    },
  };
}

module.exports = {
  id: 'jump-rope', // trùng tên thư mục games/jump-rope
  name: 'Nhảy dây',
  category: 'motion', // nhóm trên thanh chọn game (xem GAME_CATEGORIES trong src/config.js)
  emoji: '🤸',
  description: 'Cả nhà nhảy chung một sợi dây. Hất hoặc giật máy lên để nhảy đúng lúc dây chạm đất, vướng là bị loại! Mỗi màn dây quay khó hơn, ai trụ cuối cùng thì thắng. Không có nút bấm.',
  maxPlayers: 12,
  minPlayers: 1,
  bots: true,
  sensors: true,
  tickHz: C.TICK_HZ,
  hostEvery: C.HOST_UPDATE_EVERY,
  playerEvery: C.PLAYER_UPDATE_EVERY,
  countdownMs: C.COUNTDOWN_MS,
  goText: 'NHẢY!',
  coastMs: C.COAST_MS,
  options: [
    {
      key: 'difficulty',
      label: 'Độ khó',
      default: C.DEFAULT_DIFFICULTY,
      choices: Object.entries(C.DIFFICULTIES).map(([value, d]) => ({ value, label: d.label, desc: d.desc })),
    },
  ],
  createMatch,
};

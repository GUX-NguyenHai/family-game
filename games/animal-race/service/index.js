// Game Đua thú: khai báo cho nền tảng + nối các sự kiện chung với phần mô phỏng (simulation.js).
const C = require('./config');
const simulation = require('./simulation');
const codec = require('../../../src/state-codec');

// Trạng thái gửi cho TV mã hoá nhị phân theo schema (TV giải mã bằng cùng file).
const stateCodec = codec.compile(require('../assets/schema.json'));

function round(v, k) {
  return Math.round(v * k) / k;
}

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
        trackLen: race.trackLen,
        jumpMs: race.cfg.JUMP_MS,
        obstacles: race.obstacles,
        racers: racers.map(p => p.id),
      };
    },

    input(pid, type, data, now) {
      const p = byId.get(pid);
      if (!p) return;
      if (type === 'move') {
        simulation.move(race, p, data, now);
      } else if (type === 'jump') {
        if (simulation.jump(race, p, now)) api.toHost({ pid, type: 'jump' });
      }
    },

    leave(pid) {
      const p = byId.get(pid);
      if (p) p.drive = 0;
    },

    tick(now, dt) {
      for (const p of racers) if (p.bot) simulation.botThink(race, p, now);
      for (const e of simulation.step(race, racers, now, dt)) {
        api.toHost(e);
        api.toPlayer(e.pid, e);
      }
      if (!race.endedAt && now >= race.startAt && simulation.isOver(race, racers, now)) {
        race.endedAt = now;
        api.finish(
          simulation.results(racers, race.trackLen).map(r => {
            const pct = Math.round(r.progress * 100);
            return {
              ...r,
              detail: r.finished
                ? `${(r.timeMs / 1000).toFixed(2)}s`
                : { vi: `chưa về đích (${pct}%)`, en: `did not finish (${pct}%)` },
            };
          }),
        );
      }
    },

    // Nhị phân ~7 byte mỗi con (JSON cũ ~95 byte, chủ yếu vì id).
    hostState(now) {
      return codec.encode(stateCodec, {
        state: phase(now),
        p: racers.map(p => ({ x: p.x, z: p.z, sp: p.speed, f: simulation.flagsOf(p, now), r: p.rank })),
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
        prog: Math.min(1, p.z / race.trackLen),
        pw: round(p.driveEff, 100),
        f: simulation.flagsOf(p, now),
        rank: p.rank,
      };
    },
  };
}

module.exports = {
  id: 'animal-race', // trùng tên thư mục games/animal-race
  name: { vi: 'Đua thú', en: 'Animal Race' },
  category: 'motion', // nhóm trên thanh chọn game (xem GAME_CATEGORIES trong src/config.js)
  emoji: '🏁',
  description: {
    vi: 'Mỗi con chạy thẳng một làn. Lắc máy lên xuống để chạy, hất hoặc giật máy lên để nhảy qua rào và bùn. Không có nút bấm.',
    en: 'Each animal runs in its own lane. Shake your phone up and down to run, flick or jerk it up to jump over fences and mud. No buttons.',
  },
  maxPlayers: 12,
  bots: true,
  sensors: true, // chỉ điều khiển bằng cảm biến (lắc, hất máy); máy không có cảm biến thì không chơi được
  tickHz: C.TICK_HZ,
  hostEvery: C.HOST_UPDATE_EVERY,
  playerEvery: C.PLAYER_UPDATE_EVERY,
  countdownMs: C.COUNTDOWN_MS,
  goText: { vi: 'CHẠY!', en: 'RUN!' },
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

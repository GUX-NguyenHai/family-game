// Game Đua thuyền: khai báo cho nền tảng + nối các sự kiện chung với phần mô phỏng (simulation.js).
const C = require('./config');
const simulation = require('./simulation');
const catalog = require('../assets/boats.json');
const codec = require('../../../src/state-codec');

// Trạng thái gửi cho TV mã hoá nhị phân theo schema (TV giải mã bằng cùng file).
const stateCodec = codec.compile(require('../assets/schema.json'));

const BOAT_IDS = catalog.boats.map(b => b.id);

function round(v, k) {
  return Math.round(v * k) / k;
}

function createMatch({ players, options, teams, now, startAt, api }) {
  const race = simulation.createRace({
    players,
    course: options.course,
    level: options.difficulty,
    teams, // null = thi đơn
    now,
    startAt,
  });
  // Loại thuyền: lấy lựa chọn của người chơi (đội thì của đội trưởng), sai thì dùng thuyền đầu tiên.
  for (const b of race.boats) if (!BOAT_IDS.includes(b.boatType)) b.boatType = BOAT_IDS[0];

  // Thứ hạng tính 1 lần cho mỗi tick rồi dùng cho mọi điện thoại.
  let orderAt = -1;
  let order = new Map();

  function phase(now) {
    if (now < race.startAt) return 'countdown';
    return race.endedAt ? 'finished' : 'racing';
  }

  // Sự kiện của 1 thuyền: gửi cho màn hình chung + mọi người trên thuyền đó.
  function emit(e) {
    api.toHost(e);
    const b = race.boatById.get(e.bid);
    if (b) for (const r of b.crew) api.toPlayer(r.id, e);
  }

  return {
    setup() {
      return {
        level: race.level,
        course: race.course,
        width: race.width,
        trackLen: race.trackLen,
        obstacles: race.obstacles,
        boats: race.boats.map(b => ({
          id: b.id,
          name: b.name,
          color: b.color,
          team: b.team,
          teamEmoji: b.teamEmoji,
          boat: b.boatType,
          lane: b.lane,
          halfLen: b.halfLen,
          crew: b.crew.map(r => r.id),
        })),
      };
    },

    input(pid, type, data, now) {
      const r = race.rowerById.get(pid);
      if (!r) return;
      if (type === 'move') simulation.move(race, r, data, now);
      else if (type === 'steer') simulation.steer(race, r, data);
    },

    leave(pid) {
      const r = race.rowerById.get(pid);
      if (r) {
        r.steer = 0;
        r.drive = 0;
      }
    },

    tick(now, dt) {
      for (const r of race.rowers) if (r.bot) simulation.botThink(race, r, now);
      for (const e of simulation.step(race, now, dt)) emit(e);
      if (!race.endedAt && now >= race.startAt && simulation.isOver(race, now)) {
        race.endedAt = now;
        api.finish(simulation.results(race));
      }
    },

    // Nhị phân ~11 byte mỗi thuyền, theo thứ tự setup().boats.
    hostState(now) {
      return codec.encode(stateCodec, {
        state: phase(now),
        p: race.boats.map(b => ({
          x: b.x,
          z: b.z,
          sp: b.speed,
          f: simulation.flagsOf(b, now),
          r: b.rank,
          c: b.crew.map(r => r.driveEff), // mức chèo từng người, để vẽ ai đang chèo
        })),
      });
    },

    playerState(pid, now) {
      const r = race.rowerById.get(pid);
      const b = r && simulation.boatOf(race, r);
      if (!b) return null;
      if (orderAt !== now) {
        orderAt = now;
        order = new Map(simulation.standings(race.boats).map((q, i) => [q.id, i + 1]));
      }
      return {
        state: phase(now),
        pos: order.get(b.id),
        total: race.boats.length,
        prog: Math.min(1, b.z / race.trackLen),
        pw: round(r.driveEff, 100), // mức chèo của mình
        tw: round(b.drive, 100), // mức chèo cả thuyền (trung bình)
        st: round(b.steer, 100), // hướng lái của thuyền
        crew: b.crew.length,
        f: simulation.flagsOf(b, now),
        rank: b.rank,
      };
    },
  };
}

module.exports = {
  id: 'boat-race', // trùng tên thư mục games/boat-race
  name: { vi: 'Đua thuyền', en: 'Boat Race' },
  category: 'motion', // nhóm trên thanh chọn game (xem GAME_CATEGORIES trong src/config.js)
  emoji: '🚣',
  description: {
    vi: 'Lắc máy lên xuống để chèo: lắc nhanh thì thuyền đi nhanh, ngừng lắc thì thuyền dừng. Chơi đơn hoặc theo đội.',
    en: 'Shake your phone up and down to paddle: faster shaking, faster boat; stop and the boat stops. Solo or in teams.',
  },
  maxPlayers: 12,
  bots: true,
  sensors: true,
  teams: { min: 2, max: 4, enabled: options => options.mode === 'team' },
  tickHz: C.TICK_HZ,
  hostEvery: C.HOST_UPDATE_EVERY,
  playerEvery: C.PLAYER_UPDATE_EVERY,
  countdownMs: C.COUNTDOWN_MS,
  goText: { vi: 'CHÈO!', en: 'PADDLE!' },
  coastMs: C.COAST_MS,
  options: [
    {
      key: 'mode',
      label: { vi: 'Chế độ', en: 'Mode' },
      default: 'solo',
      choices: [
        { value: 'solo', label: { vi: '👤 Thi đơn', en: '👤 Solo' }, desc: { vi: 'Mỗi người một thuyền.', en: 'One boat per player.' } },
        {
          value: 'team',
          label: { vi: '👥 Theo đội', en: '👥 Teams' },
          desc: {
            vi: 'Mỗi đội 2–4 người chung một thuyền, cả đội cùng lắc để chèo.',
            en: 'Teams of 2–4 share a boat, the whole team shakes to paddle.',
          },
        },
      ],
    },
    {
      key: 'course',
      label: { vi: 'Kiểu đua', en: 'Course' },
      default: 'basic',
      choices: [
        {
          value: 'basic',
          label: 'Basic',
          desc: {
            vi: 'Basic: đường thẳng, mỗi thuyền một làn, không vật cản, chỉ cần lắc để chèo.',
            en: 'Basic: straight lanes, no obstacles, just shake to paddle.',
          },
        },
        {
          value: 'pro',
          label: 'Pro',
          desc: {
            vi: 'Pro: nghiêng máy để lái (theo đội thì cả đội cùng nghiêng), né khúc gỗ và đảo hải đăng. Đây là kiểu đua, không phải gói trả phí.',
            en: 'Pro: tilt to steer (in teams the whole team tilts), dodge logs and lighthouse islands. This is a course type, not the paid plan.',
          },
        },
      ],
    },
    {
      key: 'difficulty',
      label: { vi: 'Độ khó', en: 'Difficulty' },
      default: C.DEFAULT_DIFFICULTY,
      choices: Object.entries(C.DIFFICULTIES).map(([value, d]) => ({ value, label: d.label, desc: d.desc })),
    },
  ],
  // Phòng chờ: cảnh sông dựng sẵn đúng độ dài theo độ khó.
  preview: options => ({ trackLen: simulation.settingsFor(options.difficulty).TRACK_LEN, course: options.course }),
  createMatch,
};

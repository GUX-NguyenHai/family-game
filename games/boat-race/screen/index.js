// Đua thuyền – màn hình chung: cảnh sông 3D, bảng xếp hạng, thanh tiến độ, khung nhỏ cho thuyền bị tụt lại.
// Ở phòng chờ cảnh 3D làm nền: các thuyền (theo người hoặc theo đội) xếp hàng ở vạch xuất phát.
import { BoatScene } from './scene.js';
import { compile, decode } from '/js/core/state-codec.js';

const catalog = await fetch('/games/boat-race/assets/boats.json').then(r => r.json());
// Trạng thái từ server là nhị phân, giải mã theo cùng schema với server.
const stateCodec = compile(await fetch('/games/boat-race/assets/schema.json').then(r => r.json()));

// Phải khớp với BOAT_HALF_LEN_BASE / BOAT_HALF_LEN_PER_SEAT trong service/config.js.
const halfLenFor = seats => 1.3 + 0.35 * seats;

// Các thuyền để xếp ở phòng chờ, cùng id với thuyền lúc đua để chuyển cảnh mượt.
// Tên đội lấy theo ngôn ngữ của màn hình (t.names là { vi, en }).
function lobbyBoats(info, ctx) {
  const boats = [];
  if (info.teamMode) {
    for (const t of info.teams) {
      const crew = info.players.filter(p => p.team === t.id);
      if (!crew.length) continue;
      const name = ctx.t('teamBoat', { name: ctx.pick(t.names || t.name) });
      boats.push({ id: `t${t.id}`, name, color: t.color, boat: crew[0].prefs?.boat, crew: crew.map(p => p.id), halfLen: halfLenFor(crew.length) });
    }
    const loose = info.players.filter(p => p.team == null);
    if (loose.length) {
      boats.push({
        id: 'no-team',
        name: ctx.t('noTeam'),
        color: '#9aa5bd',
        boat: loose[0].prefs?.boat,
        crew: loose.map(p => p.id),
        halfLen: halfLenFor(Math.min(4, loose.length)),
      });
    }
  } else {
    for (const p of info.players) {
      boats.push({ id: `b-${p.id}`, name: p.name, color: p.color, boat: p.prefs?.boat, crew: [p.id], halfLen: halfLenFor(1) });
    }
  }
  return boats;
}

export function create(ctx) {
  const { root, esc, toast, beep, fanfare } = ctx;
  root.innerHTML = `
    <canvas class="boat-scene"></canvas>
    <div class="boat-hud" hidden>
      <ol class="boat-standings"></ol>
      <div class="boat-progress"><div class="finish">🏁</div></div>
    </div>`;
  const q = sel => root.querySelector(sel);
  const scene = new BoatScene(q('.boat-scene'), ctx.manifest, catalog, ctx.quality, id => ctx.player(id), q('.boat-hud'), {
    finishBanner: ctx.t('finishBanner'),
  });
  let trackLen = 400;
  let boatInfo = new Map(); // id thuyền → { name, color } của ván đang chơi
  let boatIds = []; // thứ tự các hàng trong trạng thái nhị phân (từ setup)
  let hudAt = 0;
  let areaAt = 0;
  const islandToastAt = new Map();

  // Chỗ trống 2 bên màn hình để đặt khung nhỏ cho thuyền bị tụt lại:
  // bên trái từ dưới bảng xếp hạng tới đáy, bên phải cả chiều cao màn hình
  // (thanh tiến độ nằm giữa phía trên, không đụng 2 cột này).
  // Làm tròn để chỗ cố định của khung không bị tính lại vì lệch vài phần px.
  function updateMiniArea() {
    const standings = q('.boat-standings').getBoundingClientRect();
    scene.setMiniArea({
      left: { top: Math.round(standings.bottom + 12), bottom: window.innerHeight - 16 },
      right: { top: 16, bottom: window.innerHeight - 16 },
    });
  }

  function boatName(id) {
    return boatInfo.get(id)?.name || '?';
  }

  function renderHud(s) {
    const order = [...s.p].sort((a, b) => {
      if (a.r != null && b.r != null) return a.r - b.r;
      if (a.r != null) return -1;
      if (b.r != null) return 1;
      return b.z - a.z;
    });
    q('.boat-standings').innerHTML = order
      .map((p, i) => {
        const b = boatInfo.get(p.id);
        return `<li style="--c:${b?.color || '#fff'}">
          <span class="pos">${i + 1}.</span><span class="dot"></span>
          <span>${esc(b?.name || '?')}</span>${p.r ? '<span class="fin">🏁</span>' : ''}
        </li>`;
      })
      .join('');

    const bar = q('.boat-progress');
    const seen = new Set();
    for (const p of s.p) {
      seen.add(p.id);
      let m = bar.querySelector(`[data-id="${CSS.escape(p.id)}"]`);
      if (!m) {
        m = document.createElement('div');
        m.className = 'marker';
        m.dataset.id = p.id;
        bar.append(m);
      }
      m.style.setProperty('--c', boatInfo.get(p.id)?.color || '#fff');
      m.style.left = `${Math.min(1, Math.max(0, p.z / trackLen)) * 100}%`;
    }
    for (const m of bar.querySelectorAll('.marker')) if (!seen.has(m.dataset.id)) m.remove();
  }

  return {
    onRoom(info) {
      q('.boat-hud').hidden = info.state === 'lobby';
      if (info.state !== 'lobby') return;
      trackLen = info.preview?.trackLen || trackLen;
      scene.setLobby(lobbyBoats(info, ctx),trackLen, info.preview?.course || 'basic');
    },

    onSetup(info) {
      if (!info) return;
      // Tên thuyền đội là { vi, en }: đổi ra đúng ngôn ngữ trước khi vẽ.
      info = { ...info, boats: info.boats.map(b => ({ ...b, name: ctx.pick ? ctx.pick(b.name) : b.name })) };
      trackLen = info.trackLen;
      boatInfo = new Map(info.boats.map(b => [b.id, b]));
      boatIds = info.boats.map(b => b.id);
      scene.setupRace(info);
      q('.boat-progress').querySelectorAll('.marker').forEach(m => m.remove());
    },

    onState(raw) {
      if (!boatIds.length) return; // chưa có setup thì chưa biết hàng nào là thuyền nào
      const s = decode(stateCodec, raw, boatIds);
      scene.pushSnapshot(s);
      // Bảng xếp hạng vẽ lại ~5 lần/giây.
      const t = performance.now();
      if (t - hudAt > 200) {
        hudAt = t;
        renderHud(s);
      }
      if (t - areaAt > 500) {
        areaAt = t;
        updateMiniArea(); // bảng xếp hạng dài/ngắn theo số thuyền, cửa sổ đổi cỡ…
      }
    },

    onEvent(ev) {
      scene.fx(ev);
      const name = boatName(ev.bid);
      if (ev.type === 'log') {
        toast(ctx.t('hitLog', { name }));
        beep(160, 0.2, 'sawtooth', 0.05);
      } else if (ev.type === 'island') {
        const now = performance.now();
        if (now - (islandToastAt.get(ev.bid) || 0) > 3000) {
          islandToastAt.set(ev.bid, now);
          toast(ctx.t('hitIsland', { name }));
        }
        beep(120, 0.15, 'sawtooth', 0.04);
      } else if (ev.type === 'finish') {
        toast(ctx.t('finished', { name, n: ev.rank }));
        if (ev.rank === 1) fanfare();
        else beep(660, 0.2, 'triangle');
      }
    },

    destroy() {
      scene.destroy();
      root.innerHTML = '';
    },
  };
}

// Nhảy bao bố – màn hình chung: cảnh 3D, bảng xếp hạng (kèm nhịp đúng liên tiếp 🔥), thanh tiến độ ngang ở giữa phía trên,
// khung nhỏ cho người bị tụt lại. Ở phòng chờ cảnh 3D làm nền (mọi người đứng trong bao bố ở vạch xuất phát).
import { SackScene, FLAG } from './scene.js';
import { compile, decode } from '/js/core/state-codec.js';

// Trạng thái từ server là nhị phân, giải mã theo cùng schema với server.
const stateCodec = compile(await fetch('/games/sack-race/assets/schema.json').then(r => r.json()));

export function create(ctx) {
  const { root, esc, toast, beep, fanfare } = ctx;
  root.innerHTML = `
    <canvas class="sack-scene"></canvas>
    <div class="sack-hud" hidden>
      <ol class="sack-standings"></ol>
      <div class="sack-progress"><div class="finish">🏁</div></div>
    </div>`;
  const q = sel => root.querySelector(sel);
  const scene = new SackScene(q('.sack-scene'), ctx.manifest, ctx.quality, q('.sack-hud'));
  let trackLen = 40;
  let racerIds = []; // thứ tự các hàng trong trạng thái nhị phân (từ setup)
  let hudAt = 0;
  let areaAt = 0;

  // Chỗ trống 2 bên màn hình để đặt khung nhỏ: bên trái dưới bảng xếp hạng, bên phải cả chiều cao.
  function updateMiniArea() {
    const standings = q('.sack-standings').getBoundingClientRect();
    scene.setMiniArea({
      left: { top: Math.round(standings.bottom + 12), bottom: window.innerHeight - 16 },
      right: { top: 16, bottom: window.innerHeight - 16 },
    });
  }

  function onKey(e) {
    if (e.target.closest?.('input, textarea')) return;
    if (e.key === 'y' || e.key === 'Y') {
      const yaw = scene.rotateModels(Math.PI / 2);
      toast(`Xoay model: modelYaw = ${yaw.toFixed(4)} (ghi số này vào animals.json)`);
    }
  }
  window.addEventListener('keydown', onKey);

  function renderHud(s) {
    const order = [...s.p].sort((a, b) => {
      if (a.r != null && b.r != null) return a.r - b.r;
      if (a.r != null) return -1;
      if (b.r != null) return 1;
      return b.z - a.z;
    });
    q('.sack-standings').innerHTML = order
      .map((p, i) => {
        const pl = ctx.player(p.id);
        const tag = p.r ? '<span class="fin">🏁</span>' : p.f & FLAG.FALL ? '<span class="fall">🤕</span>' : p.c >= 3 ? `<span class="combo">🔥${p.c}</span>` : '';
        return `<li style="--c:${pl?.color || '#fff'}">
          <span class="pos">${i + 1}.</span><span class="dot"></span>
          <span>${esc(pl?.name || '?')}</span>${tag}
        </li>`;
      })
      .join('');

    const bar = q('.sack-progress');
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
      m.style.setProperty('--c', ctx.player(p.id)?.color || '#fff');
      m.style.left = `${Math.min(1, Math.max(0, p.z / trackLen)) * 100}%`;
    }
    for (const m of bar.querySelectorAll('.marker')) if (!seen.has(m.dataset.id)) m.remove();
  }

  return {
    onRoom(info) {
      if (info.state === 'lobby' && info.preview?.trackLen) trackLen = info.preview.trackLen;
      scene.setPlayers(info.players, info.state, trackLen);
      q('.sack-hud').hidden = info.state === 'lobby';
    },

    onSetup(info) {
      if (!info) return;
      trackLen = info.trackLen;
      racerIds = info.racers;
      scene.setupRace(info);
    },

    onState(raw) {
      if (!racerIds.length) return; // chưa có setup thì chưa biết hàng nào là ai
      const s = decode(stateCodec, raw, racerIds);
      scene.setState(s);
      const t = performance.now();
      if (t - hudAt > 200) {
        hudAt = t;
        renderHud(s);
      }
      if (t - areaAt > 500) {
        areaAt = t;
        updateMiniArea(); // bảng xếp hạng dài/ngắn theo số người, cửa sổ đổi cỡ…
      }
    },

    onEvent(ev) {
      scene.fx(ev);
      const pl = ctx.player(ev.pid);
      if (ev.type === 'fall') {
        beep(160, 0.18, 'sawtooth', 0.04);
        if (!pl?.bot) toast(`${pl?.name || '?'} ngã rồi! 🤕`);
      } else if (ev.type === 'finish') {
        toast(`${pl?.name || '?'} về đích hạng ${ev.rank}! 🏁`);
        if (ev.rank === 1) fanfare();
        else beep(660, 0.2, 'triangle');
      }
    },

    destroy() {
      window.removeEventListener('keydown', onKey);
      scene.destroy();
      root.innerHTML = '';
    },
  };
}

// Đua thú – màn hình chung: cảnh 3D, bảng xếp hạng, thanh tiến độ, khung nhỏ cho người bị tụt lại.
// Ở phòng chờ cảnh 3D làm nền (các con vật đứng ở vạch xuất phát).
// Chữ hiện ra lấy từ assets/i18n.json qua ctx.t (2 thứ tiếng).
import { RaceScene, FLAG } from './scene.js';
import { compile, decode } from '/js/core/state-codec.js';

// Trạng thái từ server là nhị phân, giải mã theo cùng schema với server.
const stateCodec = compile(await fetch('/games/animal-race/assets/schema.json').then(r => r.json()));

export function create(ctx) {
  const { root, esc, toast, beep, fanfare, t } = ctx;
  root.innerHTML = `
    <canvas class="race-scene"></canvas>
    <div class="race-hud" hidden>
      <ol class="race-standings"></ol>
      <div class="race-progress"><div class="finish">🏁</div></div>
    </div>`;
  const q = sel => root.querySelector(sel);
  const scene = new RaceScene(q('.race-scene'), ctx.manifest, ctx.quality, q('.race-hud'), {
    finishBanner: t('scene.finishBanner'),
  });
  let trackLen = 400;
  let racerIds = []; // thứ tự các hàng trong trạng thái nhị phân (từ setup)
  let hudAt = 0;
  let areaAt = 0;

  // Chỗ trống 2 bên màn hình để đặt khung nhỏ cho người bị tụt lại:
  // bên trái từ dưới bảng xếp hạng tới đáy, bên phải cả chiều cao màn hình
  // (thanh tiến độ nằm giữa phía trên, không đụng 2 cột này).
  // Làm tròn để chỗ cố định của khung không bị tính lại vì lệch vài phần px.
  function updateMiniArea() {
    const standings = q('.race-standings').getBoundingClientRect();
    scene.setMiniArea({
      left: { top: Math.round(standings.bottom + 12), bottom: window.innerHeight - 16 },
      right: { top: 16, bottom: window.innerHeight - 16 },
    });
  }

  function onKey(e) {
    if (e.target.closest?.('input, textarea')) return;
    if (e.key === 'y' || e.key === 'Y') {
      const yaw = scene.rotateModels(Math.PI / 2);
      toast(t('toast.modelYaw', { yaw: yaw.toFixed(4) }));
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
    q('.race-standings').innerHTML = order
      .map((p, i) => {
        const pl = ctx.player(p.id);
        return `<li style="--c:${pl?.color || '#fff'}">
          <span class="pos">${i + 1}.</span><span class="dot"></span>
          <span>${esc(pl?.name || '?')}</span>${p.r ? '<span class="fin">🏁</span>' : ''}
        </li>`;
      })
      .join('');

    const bar = q('.race-progress');
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
      q('.race-hud').hidden = info.state === 'lobby';
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
      scene.pushSnapshot(s);
      // Bảng xếp hạng vẽ lại ~5 lần/giây.
      const now = performance.now();
      if (now - hudAt > 200) {
        hudAt = now;
        renderHud(s);
      }
      if (now - areaAt > 500) {
        areaAt = now;
        updateMiniArea(); // bảng xếp hạng dài/ngắn theo số người, cửa sổ đổi cỡ…
      }
    },

    onEvent(ev) {
      scene.fx(ev);
      const name = ctx.player(ev.pid)?.name || '?';
      if (ev.type === 'fence') {
        toast(t('toast.fence', { name }));
        beep(140, 0.2, 'sawtooth', 0.05);
      } else if (ev.type === 'finish') {
        toast(t('toast.finish', { name, rank: ev.rank }));
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

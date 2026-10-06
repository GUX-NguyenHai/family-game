// Đua thú – màn hình chung: cảnh 3D, bảng xếp hạng, thanh tiến độ, bản đồ nhỏ.
// Ở phòng chờ cảnh 3D làm nền (các con vật đứng ở vạch xuất phát).
import { RaceScene, FLAG } from './scene.js';
import { Minimap } from './minimap.js';

export function create(ctx) {
  const { root, esc, toast, beep, fanfare } = ctx;
  root.innerHTML = `
    <canvas class="race-scene"></canvas>
    <div class="race-hud" hidden>
      <ol class="race-standings"></ol>
      <div class="race-progress"><div class="finish">🏁</div></div>
      <canvas class="race-minimap" aria-label="Bản đồ đường đua"></canvas>
    </div>`;
  const q = sel => root.querySelector(sel);
  const scene = new RaceScene(q('.race-scene'), ctx.manifest, ctx.quality);
  const minimap = new Minimap(q('.race-minimap'));
  let trackLen = 400;
  let minimapAt = 0;
  let hudAt = 0;

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
    q('.race-standings').innerHTML = order
      .map((p, i) => {
        const pl = ctx.player(p.id);
        return `<li style="--c:${pl?.color || '#fff'}">
          <span class="pos">${i + 1}.</span><span class="dot"></span>
          <span>${esc(pl?.name || '?')}</span>${p.r ? '<span class="fin">🏁</span>' : p.f & FLAG.TURBO ? '<span class="fin">🔥</span>' : ''}
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
      m.style.top = `${(1 - Math.min(1, p.z / trackLen)) * 100}%`;
    }
    for (const m of bar.querySelectorAll('.marker')) if (!seen.has(m.dataset.id)) m.remove();
  }

  return {
    onRoom(info) {
      if (info.state === 'lobby' && info.preview?.trackLen) trackLen = info.preview.trackLen;
      minimap.setColors(info.players);
      scene.setPlayers(info.players, info.state, trackLen);
      q('.race-hud').hidden = info.state === 'lobby';
    },

    onSetup(info) {
      if (!info) return;
      trackLen = info.trackLen;
      scene.setupRace(info);
      minimap.setRace(info);
    },

    onState(s) {
      scene.pushSnapshot(s);
      // Bản đồ nhỏ vẽ lại ~10 lần/giây, bảng xếp hạng ~5 lần/giây.
      if (s.taken) for (const id of s.taken) minimap.markTaken(id);
      const t = performance.now();
      if (t - minimapAt > 100) {
        minimapAt = t;
        minimap.draw(s.p, scene.focus);
      }
      if (t - hudAt > 200) {
        hudAt = t;
        renderHud(s);
      }
    },

    onEvent(ev) {
      scene.fx(ev);
      const name = ctx.player(ev.pid)?.name || '?';
      if (ev.type === 'fence') {
        toast(`${name} vấp rào! 💥`);
        beep(140, 0.2, 'sawtooth', 0.05);
      } else if (ev.type === 'carrot') {
        toast(`${name} ăn cà rốt! +10% năng lượng 🥕`);
        beep(990, 0.12, 'triangle');
      } else if (ev.type === 'turbo') {
        toast(`${name} dùng TURBO! 🔥`);
        beep(220, 0.1, 'sawtooth', 0.05);
        setTimeout(() => beep(440, 0.12, 'sawtooth', 0.05), 90);
        setTimeout(() => beep(880, 0.18, 'sawtooth', 0.05), 180);
      } else if (ev.type === 'finish') {
        toast(`${name} về đích hạng ${ev.rank}! 🏁`);
        if (ev.rank === 1) fanfare();
        else beep(660, 0.2, 'triangle');
      }
    },

    destroy() {
      window.removeEventListener('keydown', onKey);
      scene.destroy();
      minimap.destroy();
      root.innerHTML = '';
    },
  };
}

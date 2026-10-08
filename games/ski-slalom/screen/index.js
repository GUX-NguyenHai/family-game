// Trượt tuyết vượt cổng – màn hình chung: cảnh 3D, bảng xếp hạng (giây phạt, thời gian về đích),
// thanh tiến độ ngang ở giữa phía trên, khung nhỏ cho người bị tụt lại.
// Ở phòng chờ cảnh 3D làm nền (mọi người đứng ở vạch xuất phát trên đỉnh dốc).
import { SkiScene, FLAG } from './scene.js';
import { compile, decode } from '/js/core/state-codec.js';

// Trạng thái từ server là nhị phân, giải mã theo cùng schema với server.
const stateCodec = compile(await fetch('/games/ski-slalom/assets/schema.json').then(r => r.json()));

export function create(ctx) {
  const { root, esc, toast, beep, fanfare } = ctx;
  root.innerHTML = `
    <canvas class="ski-scene"></canvas>
    <div class="ski-hud" hidden>
      <ol class="ski-standings"></ol>
      <div class="ski-progress"><div class="finish">🏁</div></div>
    </div>`;
  const q = sel => root.querySelector(sel);
  const scene = new SkiScene(q('.ski-scene'), ctx.manifest, ctx.quality, q('.ski-hud'));
  let courseLen = 400;
  let racerIds = []; // thứ tự các hàng trong trạng thái nhị phân (từ setup)
  let hudAt = 0;
  let areaAt = 0;

  // Chỗ trống 2 bên màn hình để đặt khung nhỏ: bên trái dưới bảng xếp hạng, bên phải cả chiều cao.
  function updateMiniArea() {
    const standings = q('.ski-standings').getBoundingClientRect();
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
    q('.ski-standings').innerHTML = order
      .map((p, i) => {
        const pl = ctx.player(p.id);
        const tags = [];
        if (p.pen) tags.push(`<span class="pen">+${p.pen}s</span>`);
        if (p.r) tags.push('<span class="fin">🏁</span>');
        else if (p.f & FLAG.FALL) tags.push('<span>🤕</span>');
        return `<li style="--c:${pl?.color || '#fff'}">
          <span class="pos">${i + 1}.</span><span class="dot"></span>
          <span class="name">${esc(pl?.name || '?')}</span>${tags.join('')}
        </li>`;
      })
      .join('');

    const bar = q('.ski-progress');
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
      m.style.left = `${Math.min(1, Math.max(0, p.z / courseLen)) * 100}%`;
    }
    for (const m of bar.querySelectorAll('.marker')) if (!seen.has(m.dataset.id)) m.remove();
  }

  return {
    onRoom(info) {
      scene.setPlayers(info.players, info.state, info.state === 'lobby' ? info.preview : null);
      q('.ski-hud').hidden = info.state === 'lobby';
    },

    onSetup(info) {
      if (!info) return;
      courseLen = info.courseLen;
      racerIds = info.racers;
      scene.setupRace(info);
    },

    onState(raw) {
      if (!racerIds.length) return; // chưa có setup thì chưa biết hàng nào là ai
      const s = decode(stateCodec, raw, racerIds);
      scene.pushSnapshot(s);
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
      if (ev.type === 'miss') {
        beep(220, 0.15, 'square', 0.04);
        if (!pl?.bot) toast(`${pl?.name || '?'} trượt cổng! +3s`);
      } else if (ev.type === 'crash') {
        beep(140, 0.22, 'sawtooth', 0.05);
        if (!pl?.bot) toast(`${pl?.name || '?'} đâm ${ev.obstacle === 'rock' ? 'đá' : 'cây'}! 💥`);
      } else if (ev.type === 'finish') {
        toast(`${pl?.name || '?'} về đích! 🏁`);
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

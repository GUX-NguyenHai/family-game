// Nhảy dây – màn hình chung: cảnh 3D (hàng người nhảy, dây quay), bảng màn chơi ở giữa phía trên,
// chữ lớn lúc nghỉ giữa các màn. Dây chạm đất thì kêu "tách" để mọi người bắt nhịp.
// Ở phòng chờ cảnh 3D làm nền: mọi người đứng sẵn thành hàng, dây nằm dưới đất.
import { RopeScene } from './scene.js';
import { compile, decode } from '/js/core/state-codec.js';

// Trạng thái từ server là nhị phân, giải mã theo cùng schema với server.
const stateCodec = compile(await fetch('/games/jump-rope/assets/schema.json').then(r => r.json()));

export function create(ctx) {
  const { root, toast, beep } = ctx;
  root.innerHTML = `
    <canvas class="rope-scene"></canvas>
    <div class="rope-hud" hidden>
      <div class="rope-board">
        <div class="rope-level"><b></b><span></span></div>
        <div class="rope-time"><i></i></div>
        <div class="rope-info"></div>
      </div>
      <div class="rope-banner" hidden><b></b><span></span></div>
    </div>`;
  const q = sel => root.querySelector(sel);
  const scene = new RopeScene(q('.rope-scene'), ctx.manifest, ctx.quality);
  scene.onBottom = () => beep(1250, 0.035, 'square', 0.05); // "tách"
  let order = []; // thứ tự các hàng trong trạng thái nhị phân (từ setup)
  let titles = {};
  let levelMs = 30000;
  let hudAt = 0;

  function onKey(e) {
    if (e.target.closest?.('input, textarea')) return;
    if (e.key === 'y' || e.key === 'Y') {
      const yaw = scene.rotateModels(Math.PI / 2);
      toast(`Xoay model thêm ${Math.round((yaw * 180) / Math.PI)}° (chỉ để thử, chưa lưu)`);
    }
  }
  window.addEventListener('keydown', onKey);

  function banner(level) {
    const el = q('.rope-banner');
    if (!level) {
      el.hidden = true;
      return;
    }
    el.querySelector('b').textContent = `MÀN ${level}`;
    el.querySelector('span').textContent = titles[level] || '';
    el.hidden = false;
  }

  function renderHud(s) {
    q('.rope-level b').textContent = `Màn ${s.level}`;
    q('.rope-level span').textContent = titles[s.level] || '';
    q('.rope-time i').style.width = `${s.phase === 'playing' ? (s.timeLeft / levelMs) * 100 : s.phase === 'break' ? 100 : 0}%`;
    const jumps = Math.max(0, ...s.p.filter(p => !(p.f & 1)).map(p => p.n));
    q('.rope-info').textContent = `Còn ${s.alive}/${s.p.length} người · ${jumps} lần nhảy`;
    banner(s.phase === 'break' ? s.level : null);
  }

  return {
    onRoom(info) {
      q('.rope-hud').hidden = info.state === 'lobby';
      if (info.state !== 'lobby') return;
      // Phòng chờ: mọi người đứng thành hàng theo thứ tự vào phòng.
      scene.setJumpers(info.players.map(p => p.id), id => ctx.player(id));
      scene.reset();
      scene.setPhase('lobby');
      banner(null);
    },

    onSetup(info) {
      if (!info) return;
      order = info.players;
      titles = info.titles || {};
      levelMs = info.levelMs || levelMs;
      scene.setJumpers(order, id => ctx.player(id));
      scene.reset(info.airMs);
      banner(null);
    },

    onState(raw) {
      if (!order.length) return; // chưa có setup thì chưa biết hàng nào là ai
      const s = decode(stateCodec, raw, order);
      const now = performance.now();
      scene.setState(s, now);
      if (now - hudAt > 150) {
        hudAt = now;
        renderHud(s);
      }
    },

    onEvent(e) {
      if (e.type === 'jump') {
        scene.jump(e.pid);
      } else if (e.type === 'out') {
        scene.trip(e.pid);
        toast(`${ctx.player(e.pid)?.name || '?'} vướng dây! 💥`);
        beep(150, 0.25, 'sawtooth', 0.06);
      } else if (e.type === 'level') {
        banner(e.level);
        beep(660, 0.15, 'triangle');
        setTimeout(() => beep(880, 0.2, 'triangle'), 160);
      }
    },

    destroy() {
      window.removeEventListener('keydown', onKey);
      scene.destroy();
      root.innerHTML = '';
    },
  };
}

// Leo cây hái dừa – màn hình chung: hàng cây dừa 3D, bảng xếp hạng theo độ cao, đồng hồ.
// Ở phòng chờ cảnh 3D làm nền: mỗi người một cây, con vật đứng sẵn dưới gốc.
import { ClimbScene, FLAG } from './scene.js';

export function create(ctx) {
  const { root, esc, toast, beep } = ctx;
  root.innerHTML = `
    <canvas class="cc-scene"></canvas>
    <div class="cc-hud" hidden>
      <ol class="cc-standings"></ol>
      <div class="cc-timer"></div>
    </div>`;
  const q = sel => root.querySelector(sel);
  const scene = new ClimbScene(q('.cc-scene'), ctx.manifest, ctx.quality);
  let hudAt = 0;

  function renderHud(s) {
    const order = [...s.p].sort((a, b) => {
      if (a.r != null && b.r != null) return a.r - b.r;
      if (a.r != null) return -1;
      if (b.r != null) return 1;
      return b.y - a.y;
    });
    q('.cc-standings').innerHTML = order
      .map((p, i) => {
        const pl = ctx.player(p.id);
        const mark = p.f & FLAG.TOP ? '🥥' : p.f & FLAG.SLIDING ? '⬇️' : p.f & FLAG.SLIP ? '🟩' : '';
        return `<li style="--c:${pl?.color || '#fff'}">
          <span class="pos">${i + 1}.</span><span class="dot"></span>
          <span class="name">${esc(pl?.name || '?')}</span>
          <span class="h">${p.y.toFixed(1)}m</span><span class="mark">${mark}</span>
        </li>`;
      })
      .join('');
    q('.cc-timer').textContent = s.phase === 'climb' ? `${Math.ceil(s.timeLeft / 1000)}s` : '';
  }

  return {
    onRoom(info) {
      q('.cc-hud').hidden = info.state === 'lobby';
      if (info.state !== 'lobby') return;
      scene.setPhase('lobby');
      scene.setPlayers(
        info.players.map(p => p.id),
        id => ctx.player(id),
        info.preview,
      );
    },

    onSetup(info) {
      if (!info) return;
      scene.setPhase('play');
      scene.setPlayers(info.players, id => ctx.player(id), info);
    },

    onState(s) {
      scene.setState(s);
      const t = performance.now();
      if (t - hudAt > 200) {
        hudAt = t;
        renderHud(s);
      }
    },

    onEvent(e) {
      if (e.type === 'top') {
        scene.topReached(e.pid);
        toast(`${ctx.player(e.pid)?.name || '?'} hái được dừa! Hạng ${e.rank} 🥥`);
        beep(e.rank === 1 ? 990 : 660, 0.25, 'triangle');
      }
    },

    destroy() {
      scene.destroy();
      root.innerHTML = '';
    },
  };
}

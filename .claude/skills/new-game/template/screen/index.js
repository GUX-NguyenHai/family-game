// __NAME__ – màn hình chung (TV): mỗi người một thanh dọc, đổ đầy dần theo mức lắc.
// Giao diện 2D bằng HTML/CSS. Muốn làm cảnh 3D: xem /js/core/scene-kit.js và games/tug-of-war/screen/scene.js.
// Ở phòng chờ vẫn vẽ (làm nền phía sau bảng phòng chờ): thanh trống của từng người.
import { compile, decode } from '/js/core/state-codec.js';

// Trạng thái từ server là nhị phân, giải mã theo cùng schema với server.
const stateCodec = compile(await fetch('/games/__ID__/assets/schema.json').then(r => r.json()));

export function create(ctx) {
  const { root, esc, toast, beep, fanfare } = ctx;
  root.innerHTML = `
    <div class="__PREFIX__-stage">
      <div class="__PREFIX__-timer" hidden></div>
      <div class="__PREFIX__-bars"></div>
    </div>`;
  const q = sel => root.querySelector(sel);
  let order = []; // thứ tự các hàng trong trạng thái nhị phân (từ setup)
  let roundMs = 30000;

  function renderBars(list) {
    q('.__PREFIX__-bars').innerHTML = list
      .map(p => {
        const pl = ctx.player(p.id);
        return `<div class="__PREFIX__-col" style="--c:${pl?.color || '#fff'}">
          <div class="__PREFIX__-bar"><i style="height:${Math.round((p.v || 0) * 100)}%"></i></div>
          <b>${p.r ? `#${p.r}` : `${Math.round((p.v || 0) * 100)}%`}</b>
          <span>${esc(pl?.name || '?')}</span>
        </div>`;
      })
      .join('');
  }

  return {
    onRoom(info) {
      if (info.state !== 'lobby') return;
      order = [];
      q('.__PREFIX__-timer').hidden = true;
      renderBars(info.players.map(p => ({ id: p.id, v: 0 })));
    },

    onSetup(info) {
      if (!info) return;
      order = info.players;
      roundMs = info.roundMs || roundMs;
      renderBars(order.map(id => ({ id, v: 0 })));
    },

    onState(raw) {
      if (!order.length) return; // chưa có setup thì chưa biết hàng nào là ai
      const s = decode(stateCodec, raw, order);
      renderBars(s.p);
      const timer = q('.__PREFIX__-timer');
      timer.hidden = s.phase !== 'playing';
      timer.textContent = `${Math.ceil(s.timeLeft / 1000)}s`;
      timer.classList.toggle('low', s.timeLeft < roundMs * 0.2);
    },

    onEvent(e) {
      if (e.type === 'full') {
        toast(`${ctx.player(e.pid)?.name || '?'} đổ đầy thanh! 🏆`);
        if (e.rank === 1) fanfare();
        else beep(660, 0.2, 'triangle');
      }
    },

    destroy() {
      root.innerHTML = '';
    },
  };
}

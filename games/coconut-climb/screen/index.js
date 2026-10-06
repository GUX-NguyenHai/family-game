// Leo cây hái dừa – màn hình chung: hàng cây dừa 3D, khỉ của từng người, bảng xếp hạng theo độ cao, đồng hồ.
// Ở phòng chờ cảnh 3D làm nền: mỗi người một cây, khỉ (theo lựa chọn trên điện thoại) bám sẵn dưới gốc.
// Phím Y: xoay thử khỉ 90° nếu model quay sai hướng.
import { ClimbScene, FLAG } from './scene.js';

const catalog = await fetch('/games/coconut-climb/assets/figures.json').then(r => r.json());
const FIGURE_IDS = catalog.figures.map(f => f.id);

// Khỉ của người chơi: lựa chọn ở phòng chờ, chưa chọn thì lấy theo id. Phải khớp với figureOf() trong service/index.js.
function defaultFigure(player) {
  const pick = player?.prefs?.figure;
  if (FIGURE_IDS.includes(pick)) return pick;
  let h = 0;
  for (const ch of String(player?.id || '')) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return FIGURE_IDS[h % FIGURE_IDS.length];
}

export function create(ctx) {
  const { root, esc, toast, beep } = ctx;
  root.innerHTML = `
    <canvas class="cc-scene"></canvas>
    <div class="cc-hud" hidden>
      <ol class="cc-standings"></ol>
      <div class="cc-timer"></div>
    </div>`;
  const q = sel => root.querySelector(sel);
  const scene = new ClimbScene(q('.cc-scene'), catalog, ctx.quality);
  let hudAt = 0;

  function onKey(e) {
    if (e.target.closest?.('input, textarea')) return;
    if (e.key === 'y' || e.key === 'Y') {
      const yaw = scene.rotateFigures(Math.PI / 2);
      toast(`Xoay khỉ: yaw = ${yaw.toFixed(4)} (ghi số này vào figures.json nếu đúng hướng)`);
    }
  }
  window.addEventListener('keydown', onKey);

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
      const byId = new Map(info.players.map(p => [p.id, p]));
      scene.setPlayers(
        info.players.map(p => p.id),
        id => ctx.player(id),
        info.preview,
        id => defaultFigure(byId.get(id)),
      );
    },

    onSetup(info) {
      if (!info) return;
      scene.setPhase('play');
      scene.setPlayers(info.players, id => ctx.player(id), info, id => info.figures?.[id] || defaultFigure(ctx.player(id)));
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
      window.removeEventListener('keydown', onKey);
      scene.destroy();
      root.innerHTML = '';
    },
  };
}

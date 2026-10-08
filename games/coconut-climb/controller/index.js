// Leo cây hái dừa – tay cầm trên điện thoại: lắc lên xuống để leo, ngừng lắc là tụt.
// Phòng chờ: chọn khỉ (con vật leo cây) + thử lắc.
// Bên trái màn chơi là "cây" dọc: chấm = mình đang ở đâu, khúc xanh rêu = đoạn thân trơn, 🥥 = ngọn.
const FLAG = { SLIP: 1, SLIDING: 2, TOP: 4 };
const catalog = await fetch('/games/coconut-climb/assets/figures.json').then(r => r.json());

// Chưa chọn thì lấy theo id người chơi. Phải khớp với figureOf() trong service/index.js.
function defaultFigure(id) {
  let h = 0;
  for (const ch of String(id)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return catalog.figures[h % catalog.figures.length].id;
}

export function create(ctx) {
  const { lobbyRoot, playRoot, sensors, send, vibrate, esc } = ctx;
  const tx = (key, params) => esc(ctx.t(key, params)); // chữ đã dịch, an toàn để chèn vào HTML

  lobbyRoot.innerHTML = `
    <div class="box">
      <h3>${tx('pickFigure')}</h3>
      <div class="cc-figures" data-r="figurePicker"></div>
    </div>
    <div class="box">
      <h3>${tx('tryClimb')}</h3>
      <div class="meter">
        <span>${tx('shake')}</span>
        <div class="bar"><i data-r="shakeBar"></i></div>
      </div>
      <label class="row">
        <span>${tx('sensitivity')}</span>
        <select data-r="selSens">
          <option value="14">${tx('low')}</option>
          <option value="10">${tx('mid')}</option>
          <option value="7">${tx('high')}</option>
        </select>
      </label>
      <p class="hint">${tx('hint1')}<b>${tx('hint2')}</b>${tx('hint3')}<b>${tx('hint4')}</b>${tx('hint5')}</p>
    </div>`;

  playRoot.innerHTML = `
    <div class="cc-play">
      <div class="cc-top">
        <div data-r="pos" class="cc-pos">–</div>
        <div data-r="height" class="cc-height"></div>
        <div data-r="timer" class="cc-timer"></div>
      </div>
      <div class="cc-main">
        <div class="cc-tree">
          <span class="cc-nut">🥥</span>
          <div data-r="slipZones"></div>
          <i data-r="marker"></i>
        </div>
        <div class="cc-right">
          <div data-r="status" class="cc-status"></div>
          <div class="cc-power"><span>${tx('power')}</span><div class="bar"><i data-r="powerBar"></i><b data-r="needMark" hidden></b></div></div>
          <p data-r="noShake" class="cc-noshake" hidden></p>
          <div class="cc-shake" data-r="shake"><span>🧗</span><b>${tx('shakeToClimb')}</b></div>
        </div>
      </div>
    </div>`;

  const el = {}; // các phần tử có data-r, tra theo tên
  for (const node of [...lobbyRoot.querySelectorAll('[data-r]'), ...playRoot.querySelectorAll('[data-r]')]) el[node.dataset.r] = node;

  el.selSens.value = String(sensors.range);
  el.selSens.onchange = e => sensors.setRange(e.target.value);

  // ---------- Chọn khỉ ----------
  function currentFigure() {
    const pick = ctx.pref('figure');
    if (catalog.figures.some(f => f.id === pick)) return pick;
    return defaultFigure(ctx.me()?.id || '');
  }

  function renderFigures() {
    const sel = currentFigure();
    el.figurePicker.innerHTML = catalog.figures
      .map(f => `<button type="button" data-id="${esc(f.id)}" class="${f.id === sel ? 'sel' : ''}"><span class="e">${f.emoji}</span>${esc(ctx.pick(f.name))}</button>`)
      .join('');
  }

  el.figurePicker.onclick = e => {
    const btn = e.target.closest('button[data-id]');
    if (!btn) return;
    ctx.setPref('figure', btn.dataset.id);
    renderFigures();
  };
  renderFigures();

  function updateNoShake() {
    if (sensors.enabled && sensors.gotMotion) {
      el.noShake.hidden = true;
      return;
    }
    const canEnable = sensors.secure && !sensors.enabled && ctx.sensorError()?.message !== 'unsupported';
    el.noShake.textContent = canEnable ? ctx.t('noSensorEnable') : ctx.t('noSensor');
    el.noShake.hidden = false;
  }

  function resetPlay() {
    el.pos.textContent = '–';
    el.height.textContent = '';
    el.timer.textContent = '';
    el.status.textContent = '';
    el.marker.style.bottom = '0%';
    el.powerBar.style.width = '0%';
    playRoot.querySelector('.cc-play').classList.remove('slip', 'sliding', 'top');
  }

  // Gửi mức lắc 10 lần/giây khi đang ở màn chơi.
  const sendTimer = setInterval(() => {
    if (ctx.screen() !== 'game') return;
    const level = sensors.enabled ? sensors.level : 0;
    send('move', Math.round(level * 100) / 100);
    el.shake.style.setProperty('--lv', Math.min(1, level).toFixed(2));
  }, 100);

  return {
    onRoom() {
      renderFigures(); // lúc mới vào phòng chưa biết id của mình thì vẽ lại khi đã biết
    },

    onShow(screen, prev) {
      if (screen === 'game' && prev !== 'game') resetPlay();
    },

    onMe(m) {
      el.pos.textContent = `${m.pos}/${m.total}`;
      el.height.textContent = `${m.y.toFixed(1)} / ${m.height}m`;
      el.timer.textContent = m.phase === 'climb' ? `${Math.ceil(m.timeLeft / 1000)}s` : '';
      el.marker.style.bottom = `${Math.min(1, m.y / m.height) * 100}%`;
      // Các khúc rêu trơn trên thanh "cây" (chỉ vẽ lại khi đổi).
      const key = JSON.stringify(m.slips);
      if (el.slipZones.dataset.key !== key) {
        el.slipZones.dataset.key = key;
        el.slipZones.innerHTML = m.slips
          .map(([a, b]) => `<div class="cc-slip" style="bottom:${a * 100}%;height:${(b - a) * 100}%"></div>`)
          .join('');
      }
      el.powerBar.style.width = `${m.pw * 100}%`;
      el.needMark.style.left = `${m.need * 100}%`;
      updateNoShake();

      const f = m.f;
      const root = playRoot.querySelector('.cc-play');
      root.classList.toggle('slip', !!(f & FLAG.SLIP) && !(f & FLAG.TOP));
      root.classList.toggle('sliding', !!(f & FLAG.SLIDING));
      root.classList.toggle('top', !!(f & FLAG.TOP));
      el.needMark.hidden = !(f & FLAG.SLIP);

      let status = '';
      if (f & FLAG.TOP) status = ctx.t('statusTop', { n: m.rank });
      else if (f & FLAG.SLIP) status = ctx.t(m.pw > m.need ? 'statusSlipOk' : 'statusSlipWeak');
      else if (f & FLAG.SLIDING) status = ctx.t('statusSliding');
      else if (m.phase === 'climb') status = ctx.t('statusClimb');
      el.status.textContent = status;
    },

    onEvent(e) {
      if (e.type === 'slip') vibrate([60, 40, 60]);
      else if (e.type === 'top') vibrate([100, 50, 100, 50, 300]);
    },

    frame() {
      if (ctx.screen() !== 'lobby') return;
      el.shakeBar.style.width = `${Math.min(1, sensors.level) * 100}%`;
    },

    destroy() {
      clearInterval(sendTimer);
      lobbyRoot.innerHTML = '';
      playRoot.innerHTML = '';
    },
  };
}

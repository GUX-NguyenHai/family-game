// __NAME__ – tay cầm trên điện thoại: KHÔNG có nút bấm, lắc máy lên xuống để đổ đầy thanh.
// Phòng chờ: thử lắc + chỉnh độ nhạy. Hợp đồng đầy đủ: games/README.md mục 5, cảm biến mục 8.
// Chữ hiện ra lấy từ assets/i18n.json qua ctx.t (2 thứ tiếng).
export function create(ctx) {
  const { lobbyRoot, playRoot, sensors, send, vibrate, esc, t } = ctx;

  lobbyRoot.innerHTML = `
    <div class="box">
      <h3>${esc(t('tryShake'))}</h3>
      <div class="meter">
        <span>${esc(t('shake'))}</span>
        <div class="bar"><i data-r="shakeBar"></i></div>
      </div>
      <label class="row">
        <span>${esc(t('sensitivity'))}</span>
        <select data-r="selSens">
          <option value="14">${esc(t('low'))}</option>
          <option value="10">${esc(t('mid'))}</option>
          <option value="7">${esc(t('high'))}</option>
        </select>
      </label>
      <p class="hint">${esc(t('hint'))}</p>
    </div>`;

  playRoot.innerHTML = `
    <div class="__PREFIX__-play">
      <div data-r="status" class="__PREFIX__-status">${esc(t('go'))}</div>
      <div class="__PREFIX__-gauge"><i data-r="fill"></i></div>
      <div class="bar __PREFIX__-drive"><i data-r="drive"></i></div>
      <p data-r="noSensor" class="__PREFIX__-nosensor" hidden></p>
    </div>`;

  const el = {}; // các phần tử có data-r, tra theo tên
  for (const node of [...lobbyRoot.querySelectorAll('[data-r]'), ...playRoot.querySelectorAll('[data-r]')]) el[node.dataset.r] = node;

  el.selSens.value = String(sensors.range);
  el.selSens.onchange = e => sensors.setRange(e.target.value);

  // Máy không đọc được cảm biến thì không chơi được: báo rõ cho người chơi.
  function updateNoSensor() {
    if (sensors.enabled && sensors.gotMotion) {
      el.noSensor.hidden = true;
      return;
    }
    const canEnable = sensors.secure && !sensors.enabled && ctx.sensorError()?.message !== 'unsupported';
    el.noSensor.textContent = t(canEnable ? 'noSensorEnable' : 'noSensor');
    el.noSensor.hidden = false;
  }

  // Mức lắc gửi đều 10 lần/giây (kể cả 0) khi đang ở màn chơi: server không nhận được nữa thì coi như ngừng lắc.
  const sendTimer = setInterval(() => {
    if (ctx.screen() !== 'game') return;
    send('move', Math.round((sensors.enabled ? sensors.level : 0) * 100) / 100);
  }, 100);

  return {
    onShow(screen, prev) {
      if (screen === 'game' && prev !== 'game') {
        el.fill.style.height = '0%';
        el.status.textContent = t('go');
      }
    },

    onMe(m) {
      updateNoSensor();
      el.fill.style.height = `${m.fill * 100}%`;
      el.drive.style.width = `${m.drive * 100}%`;
      if (m.rank) el.status.textContent = t('done', { n: m.rank });
      else if (m.phase === 'playing') el.status.textContent = t('status', { pct: Math.round(m.fill * 100), s: m.timeLeft });
    },

    onEvent(e) {
      if (e.type === 'full') vibrate([100, 50, 100, 50, 300]);
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

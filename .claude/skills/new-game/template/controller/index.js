// __NAME__ – tay cầm trên điện thoại: KHÔNG có nút bấm, lắc máy lên xuống để đổ đầy thanh.
// Phòng chờ: thử lắc + chỉnh độ nhạy. Hợp đồng đầy đủ: games/README.md mục 5, cảm biến mục 8.
export function create(ctx) {
  const { lobbyRoot, playRoot, sensors, send, vibrate } = ctx;

  lobbyRoot.innerHTML = `
    <div class="box">
      <h3>__EMOJI__ Thử lắc</h3>
      <div class="meter">
        <span>Lắc ↕</span>
        <div class="bar"><i data-r="shakeBar"></i></div>
      </div>
      <label class="row">
        <span>Độ nhạy lắc</span>
        <select data-r="selSens">
          <option value="14">Thấp</option>
          <option value="10">Vừa</option>
          <option value="7">Cao</option>
        </select>
      </label>
      <p class="hint">Cầm máy dọc, lắc lên xuống thật nhanh để đổ đầy thanh. Không có nút bấm.</p>
    </div>`;

  playRoot.innerHTML = `
    <div class="__PREFIX__-play">
      <div data-r="status" class="__PREFIX__-status">LẮC!</div>
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
    el.noSensor.textContent = canEnable
      ? 'Chưa bật cảm biến nên chưa lắc được. Bấm "Bật cảm biến" ở dưới.'
      : 'Máy này không có cảm biến chuyển động nên không chơi được.';
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
        el.status.textContent = 'LẮC!';
      }
    },

    onMe(m) {
      updateNoSensor();
      el.fill.style.height = `${m.fill * 100}%`;
      el.drive.style.width = `${m.drive * 100}%`;
      if (m.rank) el.status.textContent = `Đầy rồi! Hạng ${m.rank} 🏆`;
      else if (m.phase === 'playing') el.status.textContent = `${Math.round(m.fill * 100)}% · còn ${m.timeLeft}s`;
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

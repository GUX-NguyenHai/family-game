// Trượt tuyết vượt cổng – tay cầm trên điện thoại: KHÔNG có nút bấm, chỉ NGHIÊNG máy trái/phải để lái.
// Phòng chờ: thử nghiêng, "Cân chỉnh" (lấy tư thế đang cầm làm thẳng), đảo chiều, độ nhạy lái.
const FLAG = { FALL: 1, FINISHED: 2 };
const STEER_GAINS = { low: 0.7, mid: 1, high: 1.4 }; // độ nhạy lái: nhân với mức nghiêng

export function create(ctx) {
  const { lobbyRoot, playRoot, sensors, send, vibrate } = ctx;

  lobbyRoot.innerHTML = `
    <div class="box ski-lobby">
      <h3>⛷️ Thử lái</h3>
      <div class="meter">
        <span>Nghiêng</span>
        <div class="tilt"><i data-r="tiltDot"></i></div>
      </div>
      <div class="row">
        <button data-r="btnCalib">Cân chỉnh</button>
        <label class="check"><input type="checkbox" data-r="chkInvert"> Đảo chiều</label>
      </div>
      <label class="row">
        <span>Độ nhạy lái</span>
        <select data-r="selGain">
          <option value="low">Thấp</option>
          <option value="mid">Vừa</option>
          <option value="high">Cao</option>
        </select>
      </label>
      <p class="hint">Không có nút bấm, không cần lắc. Cầm máy dọc trước mặt, <b>nghiêng sang trái/phải</b> như cầm vô lăng để lái; nghiêng nhiều thì cua gắt. Cầm máy thẳng rồi bấm <b>"Cân chỉnh"</b>. Đi qua giữa 2 lá cờ của mỗi cổng, trượt cổng bị phạt 3 giây, đâm cây là ngã.</p>
    </div>`;

  playRoot.innerHTML = `
    <div class="ski">
      <div class="ski-top">
        <div data-r="pos" class="ski-pos">–</div>
        <div class="bar ski-prog"><i data-r="progBar"></i></div>
      </div>
      <div class="ski-info">
        <span data-r="gates">Cổng 0/0</span>
        <span data-r="pen" class="ski-pen"></span>
      </div>
      <div data-r="status" class="ski-status"></div>
      <p data-r="noSensor" class="ski-nosensor" hidden></p>
      <div class="ski-pad" data-r="pad">
        <span data-r="arrow" class="ski-arrow">⬆</span>
        <b>NGHIÊNG ĐỂ LÁI</b>
        <div class="tilt ski-tilt"><i data-r="steerDot"></i></div>
      </div>
    </div>`;

  const el = {}; // các phần tử có data-r, tra theo tên
  for (const node of [...lobbyRoot.querySelectorAll('[data-r]'), ...playRoot.querySelectorAll('[data-r]')]) el[node.dataset.r] = node;

  // ---------- Phòng chờ ----------
  el.btnCalib.onclick = () => {
    sensors.calibrate();
    vibrate(30);
  };
  el.chkInvert.checked = sensors.invert;
  el.chkInvert.onchange = e => sensors.setInvert(e.target.checked);
  const gainKey = () => (STEER_GAINS[ctx.pref('skiSteer')] ? ctx.pref('skiSteer') : 'mid');
  el.selGain.value = gainKey();
  el.selGain.onchange = e => ctx.setPref('skiSteer', e.target.value);

  function steerValue() {
    if (!sensors.enabled) return 0;
    return Math.max(-1, Math.min(1, sensors.steer * STEER_GAINS[gainKey()]));
  }

  // Máy không đọc được cảm biến thì không chơi được: báo rõ cho người chơi.
  function updateNoSensor() {
    if (sensors.enabled && (sensors.gotOrientation || sensors.gotMotion)) {
      el.noSensor.hidden = true;
      return;
    }
    const canEnable = sensors.secure && !sensors.enabled && ctx.sensorError()?.message !== 'unsupported';
    el.noSensor.textContent = canEnable
      ? 'Chưa bật cảm biến nên chưa lái được. Bấm "Bật cảm biến" ở dưới.'
      : 'Máy này không có cảm biến nghiêng nên không chơi được Trượt tuyết.';
    el.noSensor.hidden = false;
  }

  let statusTimer = null;
  function flashStatus(text, cls) {
    el.status.textContent = text;
    el.status.className = `ski-status ${cls || ''}`;
    clearTimeout(statusTimer);
    statusTimer = setTimeout(() => {
      el.status.textContent = '';
      el.status.className = 'ski-status';
    }, 1400);
  }

  function resetPlay() {
    el.pos.textContent = '–';
    el.progBar.style.width = '0%';
    el.gates.textContent = 'Cổng 0/0';
    el.pen.textContent = '';
    el.status.textContent = '';
    el.pad.className = 'ski-pad';
  }

  // Gửi mức lái khi đổi (bước 0.05) hoặc mỗi 0,5 giây, kiểm tra 20 lần/giây.
  let lastSent = null;
  let lastSentAt = 0;
  const sendTimer = setInterval(() => {
    const v = steerValue();
    el.steerDot.style.left = `${50 + v * 45}%`;
    el.arrow.style.transform = `rotate(${v * 55}deg)`;
    if (ctx.screen() !== 'game') return;
    const r = Math.round(v * 20) / 20;
    const now = Date.now();
    if (r !== lastSent || now - lastSentAt > 500) {
      send('steer', r);
      lastSent = r;
      lastSentAt = now;
    }
  }, 50);

  return {
    onShow(screen, prev) {
      if (screen === 'game' && prev !== 'game') resetPlay();
      if (screen !== 'game') lastSent = null;
    },

    onMe(m) {
      updateNoSensor();
      el.pos.textContent = `${m.pos}/${m.total}`;
      el.progBar.style.width = `${m.prog * 100}%`;
      el.gates.textContent = `Cổng ${Math.min(m.gate + 1, m.gates)}/${m.gates}`;
      el.pen.textContent = m.pen ? `Phạt +${m.pen}s` : '';
      if (m.f & FLAG.FINISHED) {
        el.pad.className = 'ski-pad done';
        el.status.textContent = `Về đích: ${(m.time / 1000).toFixed(2)}s${m.pen ? ` (gồm ${m.pen}s phạt)` : ''} 🏁`;
      } else {
        el.pad.className = m.f & FLAG.FALL ? 'ski-pad fall' : 'ski-pad';
      }
    },

    onEvent(e) {
      if (e.type === 'pass') {
        vibrate(15);
        flashStatus('Qua cổng ✅', 'ok');
      } else if (e.type === 'miss') {
        vibrate([120, 60, 120]);
        flashStatus('Trượt cổng! +3s ❌', 'bad');
      } else if (e.type === 'crash') {
        vibrate([250, 80, 250]);
        flashStatus(`Đâm ${e.obstacle === 'rock' ? 'đá' : 'cây'}! 💥`, 'bad');
      } else if (e.type === 'finish') {
        vibrate([100, 50, 100, 50, 300]);
      }
    },

    frame() {
      if (ctx.screen() !== 'lobby') return;
      el.tiltDot.style.left = `${50 + steerValue() * 45}%`;
    },

    destroy() {
      clearInterval(sendTimer);
      clearTimeout(statusTimer);
      lobbyRoot.innerHTML = '';
      playRoot.innerHTML = '';
    },
  };
}

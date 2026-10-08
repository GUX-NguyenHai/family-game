// Nhảy dây – tay cầm trên điện thoại: KHÔNG có nút bấm. Hất đầu máy về phía mình hoặc giật mạnh máy lên để NHẢY.
// Nhìn dây trên TV (nghe tiếng "tách" lúc dây chạm đất) để nhảy đúng nhịp. Vướng dây 1 lần là bị loại.
// Phòng chờ có phần thử cử chỉ nhảy + chỉnh độ nhạy.
export function create(ctx) {
  const { lobbyRoot, playRoot, sensors, send, vibrate } = ctx;

  lobbyRoot.innerHTML = `
    <div class="box rope-lobby">
      <h3>🤸 Thử nhảy</h3>
      <div class="meter">
        <span>Nhảy ⤴</span>
        <div class="bar"><i data-r="jumpBar" class="rope-jump-bar"></i></div>
        <b data-r="jumpHit" class="rope-jump-hit" hidden>NHẢY!</b>
      </div>
      <label class="row">
        <span>Độ nhạy nhảy</span>
        <select data-r="selJump">
          <option value="22">Thấp</option>
          <option value="15">Vừa</option>
          <option value="10">Cao</option>
        </select>
      </label>
      <p data-r="jumpDbg" class="hint"></p>
      <p class="hint">Không có nút bấm. Cầm máy dọc, <b>hất nhanh đầu máy về phía mình</b> hoặc <b>giật mạnh cả máy lên</b> để nhảy. Thanh "Nhảy ⤴" đầy là đủ mạnh. Lúc chơi nhìn dây trên TV, nghe tiếng "tách" khi dây chạm đất để bắt nhịp. Vướng dây 1 lần là bị loại!</p>
    </div>`;

  playRoot.innerHTML = `
    <div class="rope">
      <div class="rope-top">
        <b data-r="level">Màn 1</b>
        <span data-r="title"></span>
      </div>
      <div class="bar rope-time"><i data-r="timeBar"></i></div>
      <div data-r="info" class="rope-info"></div>
      <p data-r="noSensor" class="rope-nosensor" hidden></p>
      <div class="rope-pad" data-r="pad">
        <span data-r="padIcon">🤸</span>
        <b data-r="padText">HẤT MÁY ĐỂ NHẢY</b>
        <small data-r="padSub">Nhảy đúng lúc dây chạm đất</small>
      </div>
    </div>`;

  const el = {}; // các phần tử có data-r, tra theo tên
  for (const node of [...lobbyRoot.querySelectorAll('[data-r]'), ...playRoot.querySelectorAll('[data-r]')]) el[node.dataset.r] = node;

  let out = false;

  // Máy không đọc được cảm biến thì không chơi được: báo rõ cho người chơi.
  function updateNoSensor() {
    if (sensors.enabled && (sensors.gotMotion || sensors.gotOrientation)) {
      el.noSensor.hidden = true;
      return;
    }
    const canEnable = sensors.secure && !sensors.enabled && ctx.sensorError()?.message !== 'unsupported';
    el.noSensor.textContent = canEnable
      ? 'Chưa bật cảm biến nên chưa nhảy được. Bấm "Bật cảm biến" ở dưới.'
      : 'Máy này không có cảm biến chuyển động nên không chơi được Nhảy dây.';
    el.noSensor.hidden = false;
  }

  function setPad(icon, text, sub, cls = '') {
    el.padIcon.textContent = icon;
    el.padText.textContent = text;
    el.padSub.textContent = sub;
    el.pad.className = `rope-pad ${cls}`;
  }

  function resetPlay() {
    out = false;
    el.timeBar.style.width = '100%';
    el.info.textContent = '';
    setPad('🤸', 'HẤT MÁY ĐỂ NHẢY', 'Nhảy đúng lúc dây chạm đất');
  }

  // Nhảy: gửi lên server + nháy khung lớn để người chơi biết đã nhận.
  let padTimer = null;
  function doJump() {
    if (out) return;
    send('jump');
    vibrate(20);
    el.pad.classList.add('jumping');
    clearTimeout(padTimer);
    padTimer = setTimeout(() => el.pad.classList.remove('jumping'), 300);
  }

  // ---------- Phòng chờ: thử cử chỉ nhảy ----------
  // Không có nút nhảy nên không cho tắt cử chỉ nhảy; máy đang lưu "tắt" thì đưa về Vừa.
  if (!sensors.jumpDeg) sensors.setJumpDeg(15);
  el.selJump.value = String(sensors.jumpDeg);
  el.selJump.onchange = e => sensors.setJumpDeg(e.target.value);

  let jumpHitTimer = null;
  let uiAt = 0;

  return {
    onShow(screen, prev) {
      if (screen === 'game' && prev !== 'game') resetPlay();
    },

    onMe(m) {
      updateNoSensor();
      el.level.textContent = `Màn ${m.level}`;
      el.title.textContent = m.title || '';
      el.timeBar.style.width = `${m.phase === 'playing' ? m.tf * 100 : m.phase === 'break' ? 100 : 0}%`;
      el.info.textContent = `Còn ${m.alive}/${m.total} người · Bạn nhảy qua ${m.n} lần`;
      if (m.out) {
        if (!out) {
          out = true;
          setPad('💥', 'BỊ VƯỚNG DÂY!', `Bạn trụ đến màn ${m.outLevel}. Xem mọi người nhảy tiếp nhé.`, 'out');
        }
      } else if (m.phase === 'break') {
        setPad('⏸️', `SẮP SANG MÀN ${m.level}`, m.title || '');
      } else if (m.phase === 'finished') {
        setPad('🏆', 'BẠN TRỤ ĐẾN CÙNG!', `${m.n} lần nhảy`, 'win');
      } else if (el.padText.textContent !== 'HẤT MÁY ĐỂ NHẢY') {
        setPad('🤸', 'HẤT MÁY ĐỂ NHẢY', 'Nhảy đúng lúc dây chạm đất');
      }
    },

    onEvent(e) {
      if (e.type === 'out') vibrate([300, 100, 300]);
      else if (e.type === 'level') vibrate([60, 60, 60]);
    },

    // Hất đầu máy về phía mình hoặc giật máy lên: đang chơi thì nhảy, ở phòng chờ thì báo đã nhận để thử.
    onGesture(name) {
      if (name !== 'jump') return;
      if (ctx.screen() === 'game') {
        doJump();
      } else if (ctx.screen() === 'lobby') {
        el.jumpHit.hidden = false;
        vibrate(20);
        clearTimeout(jumpHitTimer);
        jumpHitTimer = setTimeout(() => (el.jumpHit.hidden = true), 600);
      }
    },

    frame(t) {
      if (ctx.screen() !== 'lobby') return;
      // Thanh "Nhảy ⤴": đầy = đủ mạnh để nhảy (hất đầu máy hoặc giật máy lên, cách nào mạnh hơn thì tính).
      const jd = sensors.jumpDeg || 15;
      const jerkNeed = sensors.jerkNeed();
      el.jumpBar.style.width = `${Math.min(1, Math.max(sensors.pitchSwing / jd, sensors.jerkPeak / jerkNeed)) * 100}%`;
      if (t - uiAt > 150) {
        uiAt = t;
        const swing = sensors.gotOrientation ? `Hất đầu máy: ${Math.round(sensors.pitchSwing)}°/${jd}°` : 'Không đo được góc nghiêng';
        el.jumpDbg.textContent = `${swing} · Giật lên: ${Math.round(sensors.jerkPeak)}/${Math.round(jerkNeed)}`;
      }
    },

    destroy() {
      clearTimeout(jumpHitTimer);
      clearTimeout(padTimer);
      lobbyRoot.innerHTML = '';
      playRoot.innerHTML = '';
    },
  };
}

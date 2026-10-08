// Nhảy dây – tay cầm trên điện thoại: KHÔNG có nút bấm. Hất đầu máy về phía mình hoặc giật mạnh máy lên để NHẢY.
// Nhìn dây trên TV (nghe tiếng "tách" lúc dây chạm đất) để nhảy đúng nhịp. Vướng dây 1 lần là bị loại.
// Phòng chờ có phần thử cử chỉ nhảy + chỉnh độ nhạy.
export function create(ctx) {
  const { lobbyRoot, playRoot, sensors, send, vibrate, t, pick, esc } = ctx;

  lobbyRoot.innerHTML = `
    <div class="box rope-lobby">
      <h3>${esc(t('tryJump'))}</h3>
      <div class="meter">
        <span>${esc(t('jumpMeter'))}</span>
        <div class="bar"><i data-r="jumpBar" class="rope-jump-bar"></i></div>
        <b data-r="jumpHit" class="rope-jump-hit" hidden>${esc(t('jumpHit'))}</b>
      </div>
      <label class="row">
        <span>${esc(t('jumpSensitivity'))}</span>
        <select data-r="selJump">
          <option value="22">${esc(t('low'))}</option>
          <option value="15">${esc(t('mid'))}</option>
          <option value="10">${esc(t('high'))}</option>
        </select>
      </label>
      <p data-r="jumpDbg" class="hint"></p>
      <p class="hint">${esc(t('hintStart'))}<b>${esc(t('hintFlick'))}</b>${esc(t('hintOr'))}<b>${esc(t('hintJerk'))}</b>${esc(t('hintEnd'))}</p>
    </div>`;

  playRoot.innerHTML = `
    <div class="rope">
      <div class="rope-top">
        <b data-r="level">${esc(t('level', { n: 1 }))}</b>
        <span data-r="title"></span>
      </div>
      <div class="bar rope-time"><i data-r="timeBar"></i></div>
      <div data-r="info" class="rope-info"></div>
      <p data-r="noSensor" class="rope-nosensor" hidden></p>
      <div class="rope-pad" data-r="pad">
        <span data-r="padIcon">🤸</span>
        <b data-r="padText">${esc(t('padJump'))}</b>
        <small data-r="padSub">${esc(t('padJumpSub'))}</small>
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
    el.noSensor.textContent = canEnable ? t('noSensorEnable') : t('noSensor');
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
    setPad('🤸', t('padJump'), t('padJumpSub'));
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
      const title = pick(m.title); // tên màn từ server là { vi, en }
      el.level.textContent = t('level', { n: m.level });
      el.title.textContent = title;
      el.timeBar.style.width = `${m.phase === 'playing' ? m.tf * 100 : m.phase === 'break' ? 100 : 0}%`;
      el.info.textContent = t('phoneInfo', { alive: m.alive, total: m.total, n: m.n });
      if (m.out) {
        if (!out) {
          out = true;
          setPad('💥', t('caught'), t('caughtSub', { n: m.outLevel }), 'out');
        }
      } else if (m.phase === 'break') {
        setPad('⏸️', t('nextLevel', { n: m.level }), title);
      } else if (m.phase === 'finished') {
        setPad('🏆', t('survived'), t('jumps', { n: m.n }), 'win');
      } else if (el.padText.textContent !== t('padJump')) {
        setPad('🤸', t('padJump'), t('padJumpSub'));
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

    // now: thời điểm khung hình (không đặt tên t để khỏi che hàm dịch t).
    frame(now) {
      if (ctx.screen() !== 'lobby') return;
      // Thanh "Nhảy ⤴": đầy = đủ mạnh để nhảy (hất đầu máy hoặc giật máy lên, cách nào mạnh hơn thì tính).
      const jd = sensors.jumpDeg || 15;
      const jerkNeed = sensors.jerkNeed();
      el.jumpBar.style.width = `${Math.min(1, Math.max(sensors.pitchSwing / jd, sensors.jerkPeak / jerkNeed)) * 100}%`;
      if (now - uiAt > 150) {
        uiAt = now;
        const swing = sensors.gotOrientation ? t('flickDbg', { now: Math.round(sensors.pitchSwing), need: jd }) : t('noTilt');
        el.jumpDbg.textContent = `${swing} · ${t('jerkDbg', { now: Math.round(sensors.jerkPeak), need: Math.round(jerkNeed) })}`;
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

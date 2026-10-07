// Đua thú – tay cầm trên điện thoại: KHÔNG có nút bấm, chỉ cử động máy.
//   Lắc lên xuống để chạy (lắc càng nhanh chạy càng nhanh); hất đầu máy về phía mình hoặc giật mạnh máy lên để NHẢY.
// Mỗi con chạy thẳng trong làn của mình. Máy không có cảm biến thì không chơi được (hiện thông báo).
// Phòng chờ có phần thử cảm biến + chỉnh độ nhạy.
const FLAG = { STUN: 1, JUMP: 2, MUD: 4, FINISHED: 8 };

export function create(ctx) {
  const { lobbyRoot, playRoot, sensors, send, vibrate } = ctx;

  lobbyRoot.innerHTML = `
    <div class="box race-lobby">
      <h3>🏁 Thử điều khiển</h3>
      <div class="meter">
        <span>Lắc ↕</span>
        <div class="bar"><i data-r="shakeBar"></i></div>
      </div>
      <div class="meter">
        <span>Nhảy ⤴</span>
        <div class="bar"><i data-r="jumpBar" class="jump-bar"></i></div>
        <b data-r="jumpHit" class="jump-hit" hidden>NHẢY!</b>
      </div>
      <label class="row">
        <span>Độ nhạy lắc</span>
        <select data-r="selSens">
          <option value="14">Thấp</option>
          <option value="10">Vừa</option>
          <option value="7">Cao</option>
        </select>
      </label>
      <label class="row">
        <span>Độ nhạy nhảy</span>
        <select data-r="selJump">
          <option value="22">Thấp</option>
          <option value="15">Vừa</option>
          <option value="10">Cao</option>
        </select>
      </label>
      <p data-r="jumpDbg" class="hint"></p>
      <p class="hint">Không có nút bấm, chỉ cử động điện thoại. Cầm máy dọc. <b>Lắc lên xuống</b> để chạy: không lắc là đứng yên, lắc càng nhanh càng chạy nhanh. <b>Nhảy</b> qua rào và bùn: hất nhanh đầu máy về phía mình (như giật cương) hoặc giật mạnh cả máy lên trên. Thanh "Nhảy ⤴" đầy là đủ mạnh.</p>
    </div>`;

  playRoot.innerHTML = `
    <div class="race">
      <div class="race-top">
        <div data-r="pos" class="pos">–</div>
        <div class="bar prog"><i data-r="progBar"></i></div>
      </div>
      <div data-r="status" class="status"></div>
      <div class="bar power"><i data-r="powerBar"></i></div>
      <p data-r="noShake" class="noshake" hidden></p>
      <div class="race-pad" data-r="pad">
        <span data-r="padIcon">🏃</span>
        <b>LẮC ĐỂ CHẠY</b>
        <small>Hất hoặc giật máy lên để nhảy</small>
      </div>
    </div>`;

  const el = {}; // các phần tử có data-r, tra theo tên
  for (const node of [...lobbyRoot.querySelectorAll('[data-r]'), ...playRoot.querySelectorAll('[data-r]')]) el[node.dataset.r] = node;

  // Máy không đọc được cảm biến thì không chơi được: báo rõ cho người chơi.
  function updateNoShake() {
    if (sensors.enabled && sensors.gotMotion) {
      el.noShake.hidden = true;
      return;
    }
    const canEnable = sensors.secure && !sensors.enabled && ctx.sensorError()?.message !== 'unsupported';
    el.noShake.textContent = canEnable
      ? 'Chưa bật cảm biến nên chưa chạy được. Bấm "Bật cảm biến" ở dưới.'
      : 'Máy này không có cảm biến chuyển động nên không chơi được Đua thú.';
    el.noShake.hidden = false;
  }

  function resetPlay() {
    el.status.textContent = '';
    el.powerBar.style.width = '0%';
    el.pos.textContent = '–';
    el.progBar.style.width = '0%';
    el.pad.classList.remove('jumping');
  }

  // Nhảy: gửi lên server + nháy khung lớn để người chơi biết đã nhận.
  let padTimer = null;
  function doJump() {
    send('jump');
    vibrate(20);
    el.pad.classList.add('jumping');
    el.padIcon.textContent = '🦘';
    clearTimeout(padTimer);
    padTimer = setTimeout(() => {
      el.pad.classList.remove('jumping');
      el.padIcon.textContent = '🏃';
    }, 400);
  }

  // Mức lắc gửi đều 10 lần/giây (kể cả 0) khi đang ở màn chơi: server không nhận được nữa thì con vật dừng.
  const sendTimer = setInterval(() => {
    if (ctx.screen() !== 'game') return;
    const level = sensors.enabled ? sensors.level : 0;
    send('move', Math.round(level * 100) / 100);
  }, 100);

  // ---------- Phòng chờ: thử cảm biến ----------
  el.selSens.value = String(sensors.range);
  el.selSens.onchange = e => sensors.setRange(e.target.value);
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
      el.pos.textContent = `${m.pos}/${m.total}`;
      el.progBar.style.width = `${m.prog * 100}%`;
      el.powerBar.style.width = `${m.pw * 100}%`;
      updateNoShake();

      const f = m.f;
      let status = '';
      if (f & FLAG.FINISHED) status = `Về đích hạng ${m.rank}! 🏁`;
      else if (f & FLAG.STUN) status = 'Vấp rào! 💫';
      else if (f & FLAG.JUMP) status = 'Nhảy! ⤴';
      else if (f & FLAG.MUD) status = 'Lội bùn… 🟫';
      el.status.textContent = status;
    },

    onEvent(e) {
      if (e.type === 'fence') vibrate([200, 80, 200]);
      else if (e.type === 'finish') vibrate([100, 50, 100, 50, 300]);
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
      // Thanh "Lắc ↕" = tốc độ con vật sẽ chạy (đầy = tối đa ở độ khó Trung bình).
      el.shakeBar.style.width = `${Math.min(1, sensors.level) * 100}%`;
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
      clearInterval(sendTimer);
      clearTimeout(jumpHitTimer);
      clearTimeout(padTimer);
      lobbyRoot.innerHTML = '';
      playRoot.innerHTML = '';
    },
  };
}

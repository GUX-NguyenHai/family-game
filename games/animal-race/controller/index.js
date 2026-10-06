// Đua thú – tay cầm trên điện thoại: nghiêng để lái, lắc lên xuống để chạy, PHI! (TURBO), NHẢY.
// Phòng chờ có phần thử cảm biến + chỉnh độ nhạy.
const FLAG = { STUN: 1, JUMP: 2, MUD: 4, FINISHED: 8, TURBO: 16, BUMP: 32 };

export function create(ctx) {
  const { lobbyRoot, playRoot, sensors, send, vibrate } = ctx;

  lobbyRoot.innerHTML = `
    <div class="box race-lobby">
      <h3>🏁 Thử điều khiển</h3>
      <div class="meter">
        <span>Nghiêng</span>
        <div class="tilt"><i data-r="tiltDot"></i></div>
      </div>
      <div class="meter">
        <span>Lắc ↕</span>
        <div class="bar"><i data-r="shakeBar"></i></div>
      </div>
      <div class="meter">
        <span>Nhảy ⤴</span>
        <div class="bar"><i data-r="jumpBar" class="jump-bar"></i></div>
        <b data-r="jumpHit" class="jump-hit" hidden>NHẢY!</b>
      </div>
      <div class="row">
        <button data-r="btnCalib">Hiệu chỉnh</button>
        <label class="check"><input type="checkbox" data-r="chkInvert"> Đảo chiều</label>
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
        <span>Nhảy bằng cử chỉ</span>
        <select data-r="selJump">
          <option value="0">Tắt (chỉ dùng nút)</option>
          <option value="22">Thấp</option>
          <option value="15">Vừa</option>
          <option value="10">Cao</option>
        </select>
      </label>
      <p data-r="jumpDbg" class="hint"></p>
      <p data-r="jumpNote" class="hint" hidden></p>
      <p class="hint">Cầm máy dọc, bấm "Hiệu chỉnh" khi đang cầm thẳng. Nghiêng trái/phải để lái. <b>Lắc lên xuống</b> để chạy: không lắc là đứng yên, lắc càng nhanh càng chạy nhanh (lắc ngang không tính). Thanh "Lắc ↕" cho biết con vật sẽ chạy nhanh cỡ nào. <b>Nhảy</b>: hất nhanh đầu máy về phía mình rồi thả về (như giật cương), hoặc bấm nút NHẢY. Bấm <b>PHI!</b> 1 lần để tăng tốc, năng lượng tụt dần tới hết (đầy 100% thì được 5 giây).</p>
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
      <div class="controls">
        <button data-r="btnLeft" class="hold" aria-label="Sang trái">◀</button>
        <div class="mid">
          <button data-r="btnBoost" class="boost" aria-label="Tăng tốc">
            <span class="mana-fill"></span>
            <span data-r="boostLabel" class="lbl">PHI!<small>0%</small></span>
          </button>
          <button data-r="btnJump" class="jump">NHẢY ⤴</button>
        </div>
        <button data-r="btnRight" class="hold" aria-label="Sang phải">▶</button>
      </div>
      <div class="steer-indicator"><i data-r="steerDot"></i></div>
    </div>`;

  const el = {}; // các phần tử có data-r, tra theo tên
  for (const node of [...lobbyRoot.querySelectorAll('[data-r]'), ...playRoot.querySelectorAll('[data-r]')]) el[node.dataset.r] = node;

  // ---------- Năng lượng + nút PHI! (TURBO) ----------
  let manaReady = false;
  let lastMana = 0;

  // Có mana là bấm được; trong lúc TURBO thanh mana tụt dần tới 0. Đầy 100% thì nhấp nháy.
  function renderMana(mana, turboOn) {
    const btn = el.btnBoost;
    const value = Math.max(0, Math.min(1, mana || 0));
    lastMana = value;
    const pct = Math.round(value * 100);
    const full = pct >= 100;
    manaReady = value > 0 && !turboOn;
    btn.style.setProperty('--mana', `${pct}%`);
    btn.classList.toggle('ready', manaReady);
    btn.classList.toggle('full', full && !turboOn);
    btn.classList.toggle('turbo', turboOn);
    el.boostLabel.innerHTML = turboOn ? `TURBO!<small>${pct}%</small>` : full ? 'PHI! 🔥' : `PHI!<small>${pct}%</small>`;
  }

  // Máy không lắc được thì báo cho người chơi biết.
  function updateNoShake() {
    if (sensors.enabled && sensors.gotMotion) {
      el.noShake.hidden = true;
      return;
    }
    const canEnable = sensors.secure && !sensors.enabled && ctx.sensorError()?.message !== 'unsupported';
    el.noShake.textContent = canEnable
      ? 'Chưa bật cảm biến nên lắc chưa có tác dụng. Bấm "Bật cảm biến" ở dưới.'
      : 'Máy không có cảm biến lắc nên con vật chỉ chạy được khi bấm PHI! (TURBO).';
    el.noShake.hidden = false;
  }

  function resetPlay() {
    el.status.textContent = '';
    el.powerBar.style.width = '0%';
    el.pos.textContent = '–';
    el.progBar.style.width = '0%';
    renderMana(0, false);
  }

  // ---------- Điều khiển ----------
  let holdSteer = 0;
  let lastSteer = null;
  let lastSteerAt = 0;

  function bindHold(btn, dir) {
    const on = e => {
      e.preventDefault();
      holdSteer = dir;
      btn.classList.add('on');
      try {
        btn.setPointerCapture(e.pointerId);
      } catch {}
    };
    const off = () => {
      if (holdSteer === dir) holdSteer = 0;
      btn.classList.remove('on');
    };
    btn.addEventListener('pointerdown', on);
    btn.addEventListener('pointerup', off);
    btn.addEventListener('pointercancel', off);
    btn.addEventListener('lostpointercapture', off);
  }
  bindHold(el.btnLeft, -1);
  bindHold(el.btnRight, 1);

  el.btnBoost.addEventListener('pointerdown', e => {
    e.preventDefault();
    const b = el.btnBoost;
    if (!manaReady) {
      // Hết mana (hoặc đang TURBO): lắc nút báo "chưa được".
      b.classList.remove('nope');
      void b.offsetWidth;
      b.classList.add('nope');
      return;
    }
    send('turbo');
    vibrate(40);
    renderMana(lastMana, true); // hiển thị ngay, server sẽ cập nhật mana tụt dần
  });

  function doJump() {
    send('jump');
    vibrate(20);
    el.btnJump.classList.add('flash');
    setTimeout(() => el.btnJump.classList.remove('flash'), 150);
  }

  el.btnJump.addEventListener('pointerdown', e => {
    e.preventDefault();
    doJump();
  });

  // Gửi lái + mức lắc khi đang ở màn chơi.
  let moveTick = 0;
  const sendTimer = setInterval(() => {
    const steer = holdSteer || (sensors.enabled ? sensors.steer : 0);
    el.steerDot.style.left = `${50 + steer * 45}%`;
    if (ctx.screen() !== 'game') return;
    const v = Math.round(steer * 20) / 20;
    const now = Date.now();
    if (v !== lastSteer || now - lastSteerAt > 500) {
      send('steer', v);
      lastSteer = v;
      lastSteerAt = now;
    }
    // Mức lắc gửi đều 10 lần/giây (kể cả 0): server không nhận được nữa thì con vật dừng.
    if (++moveTick % 2 === 0) {
      const level = sensors.enabled ? sensors.level : 0;
      send('move', Math.round(level * 100) / 100);
    }
  }, 50);

  // ---------- Phòng chờ: thử cảm biến ----------
  el.btnCalib.onclick = () => sensors.calibrate();
  el.chkInvert.checked = sensors.invert;
  el.chkInvert.onchange = e => sensors.setInvert(e.target.checked);
  el.selSens.value = String(sensors.range);
  el.selSens.onchange = e => sensors.setRange(e.target.value);
  el.selJump.value = String(sensors.jumpDeg);
  el.selJump.onchange = e => sensors.setJumpDeg(e.target.value);

  let jumpHitTimer = null;
  let uiAt = 0;

  return {
    onShow(screen, prev) {
      if (screen === 'game' && prev !== 'game') resetPlay();
      if (screen !== 'game') {
        holdSteer = 0;
        lastSteer = null;
      }
    },

    onMe(m) {
      el.pos.textContent = `${m.pos}/${m.total}`;
      el.progBar.style.width = `${m.prog * 100}%`;
      el.powerBar.style.width = `${m.pw * 100}%`;

      const f = m.f;
      renderMana(m.mn, !!(f & FLAG.TURBO));
      updateNoShake();

      let status = '';
      if (f & FLAG.FINISHED) status = `Về đích hạng ${m.rank}! 🏁`;
      else if (f & FLAG.STUN) status = 'Vấp rào! 💫';
      else if (f & FLAG.TURBO) status = 'TURBO! 🔥';
      else if (f & FLAG.JUMP) status = 'Nhảy! ⤴';
      else if (f & FLAG.BUMP) status = 'Va nhau! 💥';
      else if (f & FLAG.MUD) status = 'Lội bùn… 🟫';
      el.status.textContent = status;
    },

    onEvent(e) {
      if (e.type === 'fence') vibrate([200, 80, 200]);
      else if (e.type === 'carrot') vibrate(60);
      else if (e.type === 'manaFull') vibrate([40, 60, 40]);
      else if (e.type === 'bump') vibrate(35);
      else if (e.type === 'finish') vibrate([100, 50, 100, 50, 300]);
    },

    // "Giật cương" (hất đầu máy về phía mình): đang chơi thì nhảy, ở phòng chờ thì báo đã nhận để thử.
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
      // Chấm chạm mép = lái hết cỡ.
      el.tiltDot.style.left = `${50 + sensors.steer * 45}%`;
      // Thanh "Lắc ↕" = tốc độ con vật sẽ chạy (đầy = tối đa ở độ khó Trung bình).
      el.shakeBar.style.width = `${Math.min(1, sensors.level) * 100}%`;
      // Thanh "Nhảy ⤴": đầy = đủ mạnh để nhảy.
      const jd = sensors.jumpDeg || 20;
      el.jumpBar.style.width = `${Math.min(1, sensors.pitchSwing / jd) * 100}%`;
      if (t - uiAt > 150) {
        uiAt = t;
        // Số đo để chỉnh: hất máy xem góc đổi bao nhiêu độ, vượt ngưỡng là nhảy.
        el.jumpDbg.textContent = !sensors.gotOrientation
          ? 'Chưa nhận được góc nghiêng của máy.'
          : `Hất máy: ${Math.round(sensors.pitchSwing)}° · cần ${sensors.jumpDeg ? sensors.jumpDeg + '°' : '(đang tắt)'}`;
        const noGyro = sensors.enabled && sensors.gotMotion && !sensors.gotOrientation;
        el.jumpNote.textContent = noGyro ? 'Máy không báo được góc nghiêng nên không nhảy bằng cử chỉ được, hãy bấm nút NHẢY.' : '';
        el.jumpNote.hidden = !noGyro;
      }
    },

    destroy() {
      clearInterval(sendTimer);
      clearTimeout(jumpHitTimer);
      lobbyRoot.innerHTML = '';
      playRoot.innerHTML = '';
    },
  };
}

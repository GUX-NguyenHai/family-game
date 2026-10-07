// Đua thú – tay cầm trên điện thoại: lắc lên xuống để chạy, hất máy (hoặc nút) để NHẢY, PHI! (TURBO).
// Mỗi con chạy thẳng trong làn của mình, không lái trái/phải. Phòng chờ có phần thử cảm biến + chỉnh độ nhạy.
const FLAG = { STUN: 1, JUMP: 2, MUD: 4, FINISHED: 8, TURBO: 16, BUMP: 32 };

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
      <p class="hint">Cầm máy dọc. Mỗi con chạy thẳng trong làn của mình, không cần lái. <b>Lắc lên xuống</b> để chạy: không lắc là đứng yên, lắc càng nhanh càng chạy nhanh (lắc ngang không tính). Thanh "Lắc ↕" cho biết con vật sẽ chạy nhanh cỡ nào. <b>Nhảy</b>: hất nhanh đầu máy về phía mình (như giật cương), hoặc <b>giật mạnh cả máy lên trên</b> (mạnh hơn hẳn lúc lắc chạy), hoặc bấm nút NHẢY. Bấm <b>PHI!</b> 1 lần để tăng tốc, năng lượng tụt dần tới hết (đầy 100% thì được 5 giây).</p>
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
        <button data-r="btnBoost" class="boost" aria-label="Tăng tốc">
          <span class="mana-fill"></span>
          <span data-r="boostLabel" class="lbl">PHI!<small>0%</small></span>
        </button>
        <button data-r="btnJump" class="jump">NHẢY ⤴</button>
      </div>
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

  // Mức lắc gửi đều 10 lần/giây (kể cả 0) khi đang ở màn chơi: server không nhận được nữa thì con vật dừng.
  const sendTimer = setInterval(() => {
    if (ctx.screen() !== 'game') return;
    const level = sensors.enabled ? sensors.level : 0;
    send('move', Math.round(level * 100) / 100);
  }, 100);

  // ---------- Phòng chờ: thử cảm biến ----------
  el.selSens.value = String(sensors.range);
  el.selSens.onchange = e => sensors.setRange(e.target.value);
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

      const f = m.f;
      renderMana(m.mn, !!(f & FLAG.TURBO));
      updateNoShake();

      let status = '';
      if (f & FLAG.FINISHED) status = `Về đích hạng ${m.rank}! 🏁`;
      else if (f & FLAG.STUN) status = 'Vấp rào! 💫';
      else if (f & FLAG.TURBO) status = 'TURBO! 🔥';
      else if (f & FLAG.JUMP) status = 'Nhảy! ⤴';
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
      // Thanh "Lắc ↕" = tốc độ con vật sẽ chạy (đầy = tối đa ở độ khó Trung bình).
      el.shakeBar.style.width = `${Math.min(1, sensors.level) * 100}%`;
      // Thanh "Nhảy ⤴": đầy = đủ mạnh để nhảy (hất đầu máy hoặc giật máy lên, cách nào mạnh hơn thì tính).
      const jd = sensors.jumpDeg || 20;
      const jerkNeed = sensors.jerkNeed();
      el.jumpBar.style.width = `${Math.min(1, Math.max(sensors.pitchSwing / jd, sensors.jerkPeak / jerkNeed)) * 100}%`;
      if (t - uiAt > 150) {
        uiAt = t;
        // Số đo để chỉnh: vượt ngưỡng là nhảy.
        const swing = sensors.gotOrientation ? `Hất đầu máy: ${Math.round(sensors.pitchSwing)}°/${jd}°` : 'Không đo được góc nghiêng';
        el.jumpDbg.textContent = !sensors.jumpDeg
          ? 'Nhảy bằng cử chỉ đang tắt, chỉ dùng nút NHẢY.'
          : `${swing} · Giật lên: ${Math.round(sensors.jerkPeak)}/${Math.round(jerkNeed)}`;
        const noGyro = sensors.enabled && sensors.gotMotion && !sensors.gotOrientation;
        el.jumpNote.textContent = noGyro ? 'Máy không báo được góc nghiêng nên không hất đầu máy được: hãy giật cả máy lên hoặc bấm nút NHẢY.' : '';
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

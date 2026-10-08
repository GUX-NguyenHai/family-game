// Nhảy bao bố – tay cầm trên điện thoại: KHÔNG có nút bấm. Mỗi lần hất đầu máy về phía mình hoặc giật máy lên = 1 bước nhảy.
// Điện thoại RUNG lúc con vật đáp đất: cảm thấy rung là hất tiếp (đúng nhịp thì bước dài dần).
// Hất vội lúc con vật còn đang bay là bị ngã. Phòng chờ có phần thử cử chỉ nhảy + chỉnh độ nhạy.
const FLAG = { HOP: 1, FALL: 2, FINISHED: 4 };

export function create(ctx) {
  const { lobbyRoot, playRoot, sensors, send, vibrate } = ctx;

  lobbyRoot.innerHTML = `
    <div class="box sack-lobby">
      <h3>🛍️ Thử nhảy</h3>
      <div class="meter">
        <span>Nhảy ⤴</span>
        <div class="bar"><i data-r="jumpBar" class="sack-jump-bar"></i></div>
        <b data-r="jumpHit" class="sack-jump-hit" hidden>NHẢY!</b>
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
      <p class="hint">Không có nút bấm. Cầm máy dọc, <b>hất nhanh đầu máy về phía mình</b> hoặc <b>giật mạnh cả máy lên</b>: mỗi lần là 1 bước nhảy. Máy <b>rung</b> lúc con vật đáp đất: hất tiếp ngay thì bước dài dần 🔥. Hất vội lúc còn đang bay là <b>ngã</b>!</p>
    </div>`;

  playRoot.innerHTML = `
    <div class="sack">
      <div class="sack-top">
        <div data-r="pos" class="sack-pos">–</div>
        <div class="bar sack-prog"><i data-r="progBar"></i></div>
      </div>
      <div data-r="combo" class="sack-combo"></div>
      <p data-r="noSensor" class="sack-nosensor" hidden></p>
      <div class="sack-pad" data-r="pad">
        <span data-r="padIcon">🛍️</span>
        <b data-r="padText">HẤT MÁY ĐỂ NHẢY</b>
        <small data-r="padSub">Máy rung là đáp đất: hất tiếp ngay!</small>
      </div>
    </div>`;

  const el = {}; // các phần tử có data-r, tra theo tên
  for (const node of [...lobbyRoot.querySelectorAll('[data-r]'), ...playRoot.querySelectorAll('[data-r]')]) el[node.dataset.r] = node;

  let fallen = false;
  let finished = false;
  let cueTimer = null;
  let flashTimer = null;

  // Máy không đọc được cảm biến thì không chơi được: báo rõ cho người chơi.
  function updateNoSensor() {
    if (sensors.enabled && (sensors.gotMotion || sensors.gotOrientation)) {
      el.noSensor.hidden = true;
      return;
    }
    const canEnable = sensors.secure && !sensors.enabled && ctx.sensorError()?.message !== 'unsupported';
    el.noSensor.textContent = canEnable
      ? 'Chưa bật cảm biến nên chưa nhảy được. Bấm "Bật cảm biến" ở dưới.'
      : 'Máy này không có cảm biến chuyển động nên không chơi được Nhảy bao bố.';
    el.noSensor.hidden = false;
  }

  function setPad(icon, text, sub, cls = '') {
    el.padIcon.textContent = icon;
    el.padText.textContent = text;
    el.padSub.textContent = sub;
    el.pad.className = `sack-pad ${cls}`;
  }

  function normalPad() {
    setPad('🛍️', 'HẤT MÁY ĐỂ NHẢY', 'Máy rung là đáp đất: hất tiếp ngay!');
  }

  function flash(cls, ms) {
    el.pad.classList.add(cls);
    clearTimeout(flashTimer);
    flashTimer = setTimeout(() => el.pad.classList.remove(cls), ms);
  }

  function resetPlay() {
    fallen = false;
    finished = false;
    clearTimeout(cueTimer);
    el.pos.textContent = '–';
    el.progBar.style.width = '0%';
    el.combo.textContent = '';
    normalPad();
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
      el.pos.textContent = `${m.pos}/${m.total}`;
      el.progBar.style.width = `${m.prog * 100}%`;
      el.combo.textContent = m.c >= 2 ? `Nhịp đẹp ×${m.c} 🔥` : '';
      if (m.f & FLAG.FINISHED) {
        if (!finished) {
          finished = true;
          setPad('🏁', `VỀ ĐÍCH HẠNG ${m.rank}!`, '', 'win');
        }
      } else if (m.f & FLAG.FALL) {
        if (!fallen) {
          fallen = true;
          setPad('🤕', 'NGÃ RỒI!', 'Chờ đứng dậy rồi nhảy lại…', 'fall');
        }
      } else if (fallen) {
        fallen = false;
        normalPad();
      }
    },

    onEvent(e) {
      if (e.type === 'hop') {
        // Hẹn giờ rung + nháy khung lúc con vật sắp đáp đất (server đã trừ sẵn thời gian phản xạ).
        clearTimeout(cueTimer);
        cueTimer = setTimeout(() => {
          vibrate(35);
          flash('land', 220);
        }, Math.max(0, e.cueMs));
      } else if (e.type === 'fall') {
        clearTimeout(cueTimer);
        vibrate([250, 80, 250]);
      } else if (e.type === 'finish') {
        clearTimeout(cueTimer);
        vibrate([100, 50, 100, 50, 300]);
      }
    },

    // Hất đầu máy về phía mình hoặc giật máy lên: đang chơi thì nhảy, ở phòng chờ thì báo đã nhận để thử.
    onGesture(name) {
      if (name !== 'jump') return;
      if (ctx.screen() === 'game') {
        if (fallen || finished) return;
        send('jump');
        flash('jumping', 200);
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
      clearTimeout(cueTimer);
      clearTimeout(flashTimer);
      lobbyRoot.innerHTML = '';
      playRoot.innerHTML = '';
    },
  };
}

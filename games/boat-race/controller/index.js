// Đua thuyền – tay cầm trên điện thoại: lắc lên xuống để chèo; kiểu Pro nghiêng để lái.
// Phòng chờ: chọn thuyền + thử lắc/nghiêng.
const FLAG = { STUN: 1, BUMP: 2, FINISHED: 4, BLOCKED: 8 };
const catalog = await fetch('/games/boat-race/assets/boats.json').then(r => r.json());

export function create(ctx) {
  const { lobbyRoot, playRoot, sensors, send, vibrate, esc, t } = ctx;
  let course = 'basic';
  let teamMode = false;

  lobbyRoot.innerHTML = `
    <div class="box">
      <h3>${esc(t('pickBoat'))}</h3>
      <div class="boat-picker" data-r="boatPicker"></div>
      <p class="hint" data-r="boatNote" hidden>${esc(t('teamBoatNote'))}</p>
    </div>
    <div class="box">
      <h3>${esc(t('tryPaddle'))}</h3>
      <div class="meter">
        <span>${esc(t('shake'))}</span>
        <div class="bar"><i data-r="shakeBar"></i></div>
      </div>
      <div class="meter" data-r="tiltRow">
        <span>${esc(t('tilt'))}</span>
        <div class="tilt"><i data-r="tiltDot"></i></div>
      </div>
      <div class="row" data-r="calibRow">
        <button data-r="btnCalib">${esc(t('calibrate'))}</button>
        <label class="check"><input type="checkbox" data-r="chkInvert"> ${esc(t('invert'))}</label>
      </div>
      <label class="row">
        <span>${esc(t('sensitivity'))}</span>
        <select data-r="selSens">
          <option value="14">${esc(t('low'))}</option>
          <option value="10">${esc(t('mid'))}</option>
          <option value="7">${esc(t('high'))}</option>
        </select>
      </label>
      <p class="hint" data-r="lobbyHint"></p>
    </div>`;

  playRoot.innerHTML = `
    <div class="boat-play">
      <div class="boat-top">
        <div data-r="pos" class="boat-pos">–</div>
        <div class="bar boat-prog"><i data-r="progBar"></i></div>
      </div>
      <div data-r="status" class="boat-status"></div>
      <div class="boat-meters">
        <div class="meter"><span>${esc(t('you'))}</span><div class="bar boat-power"><i data-r="myBar"></i></div></div>
        <div class="meter" data-r="teamRow"><span>${esc(t('wholeTeam'))}</span><div class="bar boat-power team"><i data-r="teamBar"></i></div></div>
      </div>
      <p data-r="noShake" class="boat-noshake" hidden></p>
      <div class="boat-paddle" data-r="paddle"><span data-r="paddleEmoji">🚣</span><b>${esc(t('shakeToPaddle'))}</b></div>
      <div class="boat-steer" data-r="steerArea">
        <button data-r="btnLeft" class="hold" aria-label="${esc(t('steerLeft'))}">◀</button>
        <div class="steer-indicator"><i data-r="steerDot"></i></div>
        <button data-r="btnRight" class="hold" aria-label="${esc(t('steerRight'))}">▶</button>
      </div>
    </div>`;

  const el = {}; // các phần tử có data-r, tra theo tên
  for (const node of [...lobbyRoot.querySelectorAll('[data-r]'), ...playRoot.querySelectorAll('[data-r]')]) el[node.dataset.r] = node;

  // ---------- Chọn thuyền ----------
  function currentBoat() {
    const id = ctx.pref('boat');
    return catalog.boats.some(b => b.id === id) ? id : catalog.boats[0].id;
  }

  function renderBoats() {
    const sel = currentBoat();
    el.boatPicker.innerHTML = catalog.boats
      .map(b => `<button type="button" data-id="${esc(b.id)}" class="${b.id === sel ? 'sel' : ''}"><span class="e">${b.emoji}</span>${esc(ctx.pick(b.name))}</button>`)
      .join('');
  }

  el.boatPicker.onclick = e => {
    const btn = e.target.closest('button[data-id]');
    if (!btn) return;
    ctx.setPref('boat', btn.dataset.id);
    renderBoats();
  };
  renderBoats();
  if (!ctx.pref('boat')) ctx.setPref('boat', currentBoat());

  // ---------- Cảm biến ở phòng chờ ----------
  el.btnCalib.onclick = () => sensors.calibrate();
  el.chkInvert.checked = sensors.invert;
  el.chkInvert.onchange = e => sensors.setInvert(e.target.checked);
  el.selSens.value = String(sensors.range);
  el.selSens.onchange = e => sensors.setRange(e.target.value);

  function renderMode() {
    const pro = course === 'pro';
    el.tiltRow.hidden = !pro;
    el.calibRow.hidden = !pro;
    el.steerArea.hidden = !pro;
    el.teamRow.hidden = !teamMode;
    el.boatNote.hidden = !teamMode;
    el.lobbyHint.textContent = [t('hint'), pro ? t('hintPro') : '', teamMode ? t('hintTeam') : ''].filter(Boolean).join(' ');
  }

  // ---------- Màn chơi ----------
  function updateNoShake() {
    if (sensors.enabled && sensors.gotMotion) {
      el.noShake.hidden = true;
      return;
    }
    const canEnable = sensors.secure && !sensors.enabled && ctx.sensorError()?.message !== 'unsupported';
    el.noShake.textContent = canEnable ? t('noSensorEnable') : t('noSensor');
    el.noShake.hidden = false;
  }

  function resetPlay() {
    el.status.textContent = '';
    el.pos.textContent = '–';
    el.progBar.style.width = '0%';
    el.myBar.style.width = '0%';
    el.teamBar.style.width = '0%';
    renderMode();
  }

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

  // Gửi mức lắc (10 lần/giây) + lái (kiểu Pro) khi đang ở màn chơi.
  let tick = 0;
  const sendTimer = setInterval(() => {
    const steer = course === 'pro' ? holdSteer || (sensors.enabled ? sensors.steer : 0) : 0;
    el.steerDot.style.left = `${50 + steer * 45}%`;
    if (ctx.screen() !== 'game') return;
    if (course === 'pro') {
      const v = Math.round(steer * 20) / 20;
      const now = Date.now();
      if (v !== lastSteer || now - lastSteerAt > 500) {
        send('steer', v);
        lastSteer = v;
        lastSteerAt = now;
      }
    }
    if (++tick % 2 === 0) {
      const level = sensors.enabled ? sensors.level : 0;
      send('move', Math.round(level * 100) / 100);
      // Mái chèo trên màn hình nhún theo mức lắc của chính mình.
      el.paddle.style.setProperty('--lv', Math.min(1, level).toFixed(2));
    }
  }, 50);

  return {
    onRoom(info) {
      course = info.options?.course === 'pro' ? 'pro' : 'basic';
      teamMode = !!info.teamMode;
      renderMode();
    },

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
      el.myBar.style.width = `${m.pw * 100}%`;
      el.teamBar.style.width = `${m.tw * 100}%`;
      updateNoShake();

      const f = m.f;
      let status = '';
      if (f & FLAG.FINISHED) status = t('myFinish', { n: m.rank });
      else if (f & FLAG.BLOCKED) status = t('myIsland');
      else if (f & FLAG.STUN) status = t('myLog');
      else if (f & FLAG.BUMP) status = t('myBump');
      else if (m.crew > 1 && m.pw < m.tw * 0.5) status = t('paddleHarder');
      el.status.textContent = status;
    },

    onEvent(e) {
      if (e.type === 'log') vibrate([150, 60, 150]);
      else if (e.type === 'island') vibrate(220);
      else if (e.type === 'bump') vibrate(35);
      else if (e.type === 'finish') vibrate([100, 50, 100, 50, 300]);
    },

    frame() {
      if (ctx.screen() !== 'lobby') return;
      el.shakeBar.style.width = `${Math.min(1, sensors.level) * 100}%`;
      el.tiltDot.style.left = `${50 + sensors.steer * 45}%`;
    },

    destroy() {
      clearInterval(sendTimer);
      lobbyRoot.innerHTML = '';
      playRoot.innerHTML = '';
    },
  };
}

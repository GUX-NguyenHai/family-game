// Leo cây hái dừa – tay cầm trên điện thoại: lắc lên xuống để leo, ngừng lắc là tụt.
// Bên trái là "cây" dọc: chấm = mình đang ở đâu, khúc xanh rêu = đoạn thân trơn, 🥥 = ngọn.
const FLAG = { SLIP: 1, SLIDING: 2, TOP: 4 };

export function create(ctx) {
  const { lobbyRoot, playRoot, sensors, send, vibrate } = ctx;

  lobbyRoot.innerHTML = `
    <div class="box">
      <h3>🌴 Thử leo</h3>
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
      <p class="hint">Cầm máy dọc, lắc lên xuống để leo: lắc càng nhanh leo càng nhanh, <b>ngừng lắc là tụt xuống</b>. Giữa thân cây có <b>đoạn trơn</b> màu rêu xanh: phải lắc thật mạnh mới leo qua, lắc yếu là trượt nhanh. Ai lên ngọn hái dừa trước thì thắng!</p>
    </div>`;

  playRoot.innerHTML = `
    <div class="cc-play">
      <div class="cc-top">
        <div data-r="pos" class="cc-pos">–</div>
        <div data-r="height" class="cc-height"></div>
        <div data-r="timer" class="cc-timer"></div>
      </div>
      <div class="cc-main">
        <div class="cc-tree">
          <span class="cc-nut">🥥</span>
          <div class="cc-slip" data-r="slipZone"></div>
          <i data-r="marker"></i>
        </div>
        <div class="cc-right">
          <div data-r="status" class="cc-status"></div>
          <div class="cc-power"><span>Lắc</span><div class="bar"><i data-r="powerBar"></i><b data-r="needMark" hidden></b></div></div>
          <p data-r="noShake" class="cc-noshake" hidden></p>
          <div class="cc-shake" data-r="shake"><span>🧗</span><b>LẮC ĐỂ LEO!</b></div>
        </div>
      </div>
    </div>`;

  const el = {}; // các phần tử có data-r, tra theo tên
  for (const node of [...lobbyRoot.querySelectorAll('[data-r]'), ...playRoot.querySelectorAll('[data-r]')]) el[node.dataset.r] = node;

  el.selSens.value = String(sensors.range);
  el.selSens.onchange = e => sensors.setRange(e.target.value);

  function updateNoShake() {
    if (sensors.enabled && sensors.gotMotion) {
      el.noShake.hidden = true;
      return;
    }
    const canEnable = sensors.secure && !sensors.enabled && ctx.sensorError()?.message !== 'unsupported';
    el.noShake.textContent = canEnable
      ? 'Chưa bật cảm biến nên lắc chưa có tác dụng. Bấm "Bật cảm biến" ở dưới.'
      : 'Máy không có cảm biến lắc nên không leo được.';
    el.noShake.hidden = false;
  }

  function resetPlay() {
    el.pos.textContent = '–';
    el.height.textContent = '';
    el.timer.textContent = '';
    el.status.textContent = '';
    el.marker.style.bottom = '0%';
    el.powerBar.style.width = '0%';
    playRoot.querySelector('.cc-play').classList.remove('slip', 'sliding', 'top');
  }

  // Gửi mức lắc 10 lần/giây khi đang ở màn chơi.
  const sendTimer = setInterval(() => {
    if (ctx.screen() !== 'game') return;
    const level = sensors.enabled ? sensors.level : 0;
    send('move', Math.round(level * 100) / 100);
    el.shake.style.setProperty('--lv', Math.min(1, level).toFixed(2));
  }, 100);

  return {
    onShow(screen, prev) {
      if (screen === 'game' && prev !== 'game') resetPlay();
    },

    onMe(m) {
      el.pos.textContent = `${m.pos}/${m.total}`;
      el.height.textContent = `${m.y.toFixed(1)} / ${m.height}m`;
      el.timer.textContent = m.phase === 'climb' ? `${Math.ceil(m.timeLeft / 1000)}s` : '';
      el.marker.style.bottom = `${Math.min(1, m.y / m.height) * 100}%`;
      el.slipZone.style.bottom = `${m.slip[0] * 100}%`;
      el.slipZone.style.height = `${(m.slip[1] - m.slip[0]) * 100}%`;
      el.powerBar.style.width = `${m.pw * 100}%`;
      el.needMark.style.left = `${m.need * 100}%`;
      updateNoShake();

      const f = m.f;
      const root = playRoot.querySelector('.cc-play');
      root.classList.toggle('slip', !!(f & FLAG.SLIP) && !(f & FLAG.TOP));
      root.classList.toggle('sliding', !!(f & FLAG.SLIDING));
      root.classList.toggle('top', !!(f & FLAG.TOP));
      el.needMark.hidden = !(f & FLAG.SLIP);

      let status = '';
      if (f & FLAG.TOP) status = `Hái được dừa! Hạng ${m.rank} 🥥🎉`;
      else if (f & FLAG.SLIP) status = m.pw > m.need ? 'Đoạn trơn! Cố lên, lắc tiếp! 💪' : 'Đoạn trơn! Lắc MẠNH lên, đang trượt! 😱';
      else if (f & FLAG.SLIDING) status = 'Đang tụt! Lắc tiếp! ⬇️';
      else if (m.phase === 'climb') status = 'Leo lên! 🌴';
      el.status.textContent = status;
    },

    onEvent(e) {
      if (e.type === 'slip') vibrate([60, 40, 60]);
      else if (e.type === 'top') vibrate([100, 50, 100, 50, 300]);
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

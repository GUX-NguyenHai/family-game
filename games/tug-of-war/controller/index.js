// Kéo co – tay cầm trên điện thoại: lắc lên xuống để kéo. Hiện tỉ số, vị trí sợi dây, lực của mình và hai đội.
// Chữ hiện ra lấy từ assets/i18n.json qua ctx.t (2 thứ tiếng).
export function create(ctx) {
  const { lobbyRoot, playRoot, sensors, send, vibrate, t, esc } = ctx;

  lobbyRoot.innerHTML = `
    <div class="box">
      <h3>${esc(t('tryPull'))}</h3>
      <div class="meter">
        <span>${esc(t('shake'))}</span>
        <div class="bar"><i data-r="shakeBar"></i></div>
      </div>
      <label class="row">
        <span>${esc(t('sensitivity'))}</span>
        <select data-r="selSens">
          <option value="14">${esc(t('low'))}</option>
          <option value="10">${esc(t('mid'))}</option>
          <option value="7">${esc(t('high'))}</option>
        </select>
      </label>
      <p class="hint">${esc(t('hint'))}</p>
    </div>`;

  playRoot.innerHTML = `
    <div class="tug-play">
      <div class="tug-score">
        <b data-r="redName" class="red"></b>
        <span data-r="timerTop"></span>
        <b data-r="blueName" class="blue"></b>
      </div>
      <div class="tug-rope">
        <div class="tug-zone left"></div>
        <div class="tug-zone right"></div>
        <i data-r="marker"></i>
      </div>
      <p data-r="side" class="tug-side"></p>
      <div data-r="status" class="tug-status"></div>
      <div class="tug-meters">
        <div class="meter"><span>${esc(t('meterMe'))}</span><div class="bar tug-power"><i data-r="myBar"></i></div></div>
        <div class="meter"><span>${esc(t('meterTeam'))}</span><div class="bar tug-power mine"><i data-r="teamBar"></i></div></div>
        <div class="meter"><span>${esc(t('meterOther'))}</span><div class="bar tug-power other"><i data-r="otherBar"></i></div></div>
      </div>
      <p data-r="noShake" class="tug-noshake" hidden></p>
      <div class="tug-pull" data-r="pull"><span>💪</span><b>${esc(t('go'))}</b></div>
    </div>`;

  const el = {}; // các phần tử có data-r, tra theo tên
  for (const node of [...lobbyRoot.querySelectorAll('[data-r]'), ...playRoot.querySelectorAll('[data-r]')]) el[node.dataset.r] = node;

  el.selSens.value = String(sensors.range);
  el.selSens.onchange = e => sensors.setRange(e.target.value);

  let teams = [];

  function teamOf(i) {
    return teams[i] || {
      emoji: i ? '🔵' : '🔴',
      name: i ? 'Xanh' : 'Đỏ',
      names: i ? { vi: 'Xanh', en: 'Blue' } : { vi: 'Đỏ', en: 'Red' },
      color: i ? '#4363d8' : '#e6194b',
    };
  }

  // Tên đội theo ngôn ngữ của máy (vd 'Đỏ' / 'Red').
  function teamName(team) {
    return ctx.pick(team.names || team.name);
  }

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
    el.timerTop.textContent = '';
    el.marker.style.left = '50%';
    el.myBar.style.width = el.teamBar.style.width = el.otherBar.style.width = '0%';
    playRoot.style.setProperty('--red', teamOf(0).color);
    playRoot.style.setProperty('--blue', teamOf(1).color);
  }

  // Gửi mức lắc 10 lần/giây khi đang ở màn chơi.
  const sendTimer = setInterval(() => {
    if (ctx.screen() !== 'game') return;
    const level = sensors.enabled ? sensors.level : 0;
    send('move', Math.round(level * 100) / 100);
    el.pull.style.setProperty('--lv', Math.min(1, level).toFixed(2));
  }, 100);

  return {
    onRoom(info) {
      teams = info.teams || [];
    },

    onShow(screen, prev) {
      if (screen === 'game' && prev !== 'game') resetPlay();
    },

    onMe(m) {
      const mine = teamOf(m.team);
      const other = teamOf(1 - m.team);
      el.redName.textContent = `${teamOf(0).emoji} ${teamName(teamOf(0))}`;
      el.blueName.textContent = `${teamName(teamOf(1))} ${teamOf(1).emoji}`;
      el.timerTop.textContent = m.phase === 'pull' ? `${Math.ceil(m.timeLeft / 1000)}s` : '';
      el.marker.style.left = `${50 + Math.max(-0.96, Math.min(0.96, m.rope)) * 50}%`;
      el.side.textContent = t('side', { emoji: mine.emoji, name: teamName(mine), where: t(m.team === 0 ? 'left' : 'right') });
      el.myBar.style.width = `${m.pw * 100}%`;
      el.teamBar.style.width = `${m.tw * 100}%`;
      el.otherBar.style.width = `${m.ow * 100}%`;
      updateNoShake();

      // Dây đang lệch về phía đội mình? (Đỏ ở trái = rope âm, Xanh ở phải = rope dương)
      const lead = m.team === 0 ? -m.rope : m.rope;
      let status = '';
      if (m.phase === 'pull') {
        status = t(lead > 0.05 ? 'leading' : lead < -0.05 ? 'losing' : 'even');
      } else if ((m.phase === 'end' || m.phase === 'done') && m.winner != null) {
        status = m.winner === m.team ? t('youWin', { emoji: mine.emoji }) : t('youLose', { emoji: other.emoji });
      }
      el.status.textContent = status;
    },

    onEvent(e) {
      const me = ctx.me();
      if (e.type === 'win') vibrate(me?.team === e.team ? [80, 60, 80] : [400]);
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

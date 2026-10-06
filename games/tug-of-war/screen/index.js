// Kéo co – màn hình chung: cảnh 3D hai đội hai bên bờ sông, tỉ số, đồng hồ, lực hai đội, thông báo thắng ván.
// Ở phòng chờ cảnh 3D làm nền: hai đội đứng sẵn hai bên bờ theo đội đã chọn.
import { TugScene } from './scene.js';

export function create(ctx) {
  const { root, esc, toast, beep, fanfare } = ctx;
  root.innerHTML = `
    <canvas class="tug-scene"></canvas>
    <div class="tug-hud" hidden>
      <div class="tug-board">
        <span class="team red"><b class="name"></b><b class="score">0</b></span>
        <span class="mid"><small class="round"></small><b class="timer"></b></span>
        <span class="team blue"><b class="score">0</b><b class="name"></b></span>
      </div>
      <div class="tug-forces">
        <div class="force red"><i></i></div>
        <div class="force blue"><i></i></div>
      </div>
      <div class="tug-banner" hidden></div>
    </div>`;
  const q = sel => root.querySelector(sel);
  const scene = new TugScene(q('.tug-scene'), ctx.manifest, ctx.quality);
  let teams = [];
  let phase = null;

  function teamOf(i) {
    return teams[i] || { emoji: i ? '🔵' : '🔴', name: i ? 'Xanh' : 'Đỏ', color: i ? '#4363d8' : '#e6194b' };
  }

  function renderNames() {
    q('.tug-board .red .name').textContent = `${teamOf(0).emoji} Đội ${teamOf(0).name}`;
    q('.tug-board .blue .name').textContent = `Đội ${teamOf(1).name} ${teamOf(1).emoji}`;
    root.style.setProperty('--red', teamOf(0).color);
    root.style.setProperty('--blue', teamOf(1).color);
  }

  function banner(text) {
    const el = q('.tug-banner');
    el.textContent = text;
    el.hidden = !text;
  }

  return {
    onRoom(info) {
      q('.tug-hud').hidden = info.state === 'lobby';
      if (info.state !== 'lobby') return;
      // Phòng chờ: dựng hai đội theo đội mọi người đã chọn.
      teams = info.teams || [];
      scene.reset();
      banner('');
      if (info.preview) scene.setField(info.preview.riverHalf, info.preview.win);
      const members = [0, 1].map(t => info.players.filter(p => p.team === t).map(p => p.id));
      const extras = info.players.filter(p => p.team == null).map(p => p.id);
      scene.setTeams(
        [0, 1].map(t => ({ color: teamOf(t).color, members: members[t] })),
        extras,
        id => ctx.player(id),
      );
      renderNames();
    },

    onSetup(info) {
      if (!info) return;
      teams = info.teams;
      scene.reset();
      scene.setField(info.riverHalf, info.win);
      scene.setTeams(info.teams, [], id => ctx.player(id));
      renderNames();
      banner('');
    },

    onState(s) {
      scene.setState(s);
      q('.tug-board .red .score').textContent = s.wins[0];
      q('.tug-board .blue .score').textContent = s.wins[1];
      q('.tug-board .round').textContent = s.totalRounds > 1 ? `Ván ${s.round}/${s.totalRounds}` : 'Ván quyết định';
      q('.tug-board .timer').textContent = s.phase === 'pull' ? `${Math.ceil(s.timeLeft / 1000)}s` : '';
      q('.tug-forces .red i').style.width = `${s.forces[0] * 100}%`;
      q('.tug-forces .blue i').style.width = `${s.forces[1] * 100}%`;

      if (s.phase === 'ready') banner(`Ván ${s.round} · ${Math.max(1, Math.ceil(s.phaseLeft / 1000))}`);
      else if (s.phase === 'roundEnd' || s.phase === 'done') {
        const w = teamOf(s.lastWinner);
        banner(`${w.emoji} Đội ${w.name} thắng ván ${s.round}!${s.lastByTime ? ' (hết giờ)' : ''}`);
      } else if (s.phase === 'pull' && phase !== 'pull') banner('');
      phase = s.phase;
    },

    onEvent(e) {
      if (e.type === 'roundWin') {
        beep(180, 0.3, 'sawtooth', 0.05);
        setTimeout(() => beep(660, 0.25, 'triangle'), 250);
      } else if (e.type === 'matchWin') {
        const w = teamOf(e.team);
        toast(`${w.emoji} Đội ${w.name} thắng trận! 🏆`);
        fanfare();
      } else if (e.type === 'go') {
        toast(`Ván ${e.round}: KÉO! 🪢`);
        beep(880, 0.3);
      } else if (e.type === 'ready') {
        beep(440, 0.15);
      }
    },

    destroy() {
      scene.destroy();
      root.innerHTML = '';
    },
  };
}

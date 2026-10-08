// Kéo co – màn hình chung: cảnh 3D hai đội hai bên bờ sông, tên hai đội, đồng hồ, lực hai đội, thông báo đội thắng.
// Mỗi lần bắt đầu là 1 ván. Ở phòng chờ cảnh 3D làm nền: hai đội đứng sẵn hai bên bờ theo đội đã chọn.
// Chữ hiện ra lấy từ assets/i18n.json qua ctx.t (2 thứ tiếng).
import { TugScene } from './scene.js';
import { compile, decode } from '/js/core/state-codec.js';

// Trạng thái từ server là nhị phân, giải mã theo cùng schema với server.
const stateCodec = compile(await fetch('/games/tug-of-war/assets/schema.json').then(r => r.json()));

export function create(ctx) {
  const { root, toast, beep } = ctx;
  root.innerHTML = `
    <canvas class="tug-scene"></canvas>
    <div class="tug-hud" hidden>
      <div class="tug-board">
        <b class="name red"></b>
        <b class="timer"></b>
        <b class="name blue"></b>
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
  let order = []; // thứ tự các hàng trong trạng thái nhị phân (từ setup)

  function teamOf(i) {
    return teams[i] || {
      emoji: i ? '🔵' : '🔴',
      name: i ? 'Xanh' : 'Đỏ',
      names: i ? { vi: 'Xanh', en: 'Blue' } : { vi: 'Đỏ', en: 'Red' },
      color: i ? '#4363d8' : '#e6194b',
    };
  }

  // Tên đội theo ngôn ngữ của TV (vd 'Đỏ' / 'Red').
  function teamName(team) {
    return ctx.pick(team.names || team.name);
  }

  // Lời báo đội thắng, vd "🔴 Đội Đỏ thắng!" / "🔴 Red team wins!".
  function winText(team) {
    return ctx.t('win', { emoji: team.emoji, name: teamName(team) });
  }

  function renderNames() {
    q('.tug-board .name.red').textContent = `${teamOf(0).emoji} ${ctx.t('team', { name: teamName(teamOf(0)) })}`;
    q('.tug-board .name.blue').textContent = `${ctx.t('team', { name: teamName(teamOf(1)) })} ${teamOf(1).emoji}`;
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
      order = info.order || [];
      scene.reset();
      scene.setField(info.riverHalf, info.win);
      scene.setTeams(info.teams, [], id => ctx.player(id));
      renderNames();
      banner('');
    },

    onState(raw) {
      if (!order.length) return; // chưa có setup thì chưa biết hàng nào là ai
      const s = decode(stateCodec, raw, order);
      scene.setState(s);
      q('.tug-board .timer').textContent = s.phase === 'pull' ? `${Math.ceil(s.timeLeft / 1000)}s` : '';
      q('.tug-forces .red i').style.width = `${s.forces[0] * 100}%`;
      q('.tug-forces .blue i').style.width = `${s.forces[1] * 100}%`;
      if ((s.phase === 'end' || s.phase === 'done') && s.winner != null) {
        banner(`${winText(teamOf(s.winner))}${s.byTime ? ` ${ctx.t('byTime')}` : ''}`);
      } else {
        banner('');
      }
    },

    onEvent(e) {
      if (e.type === 'win') {
        toast(`${winText(teamOf(e.team))} 🏆`);
        beep(180, 0.3, 'sawtooth', 0.05); // tiếng rơi xuống nước; nhạc chiến thắng do bảng kết quả chung phát
        setTimeout(() => beep(660, 0.25, 'triangle'), 250);
      }
    },

    destroy() {
      scene.destroy();
      root.innerHTML = '';
    },
  };
}

// Màn hình chung (TV/laptop): phần dùng chung cho mọi game.
// Lo phòng, QR, danh sách người chơi, gói Pro, chọn game + tuỳ chọn, đếm ngược, thông báo, bảng kết quả.
// Phần vẽ game do module games/<id>/screen/index.js lo: export create(ctx) trả về
//   { onRoom(info), onSetup(data), onState(s), onEvent(e), destroy() } (hàm nào không cần thì bỏ).
import { $, esc, store, session, loadCss, watchVersion, MEDALS } from './util.js';
import { unlockAudio, beep, fanfare } from './audio.js';
import { adSlot } from './ads.js';
import { lang, t, pick, loadGameT, applyDom, bindLangButton, formatDate } from './i18n.js';

applyDom();
bindLangButton($('#btnLang'));

const SESSION_KEY = 'fg:host';
const manifest = await fetch('/assets/animals.json').then(r => r.json());
const animalById = new Map(manifest.animals.map(a => [a.id, a]));
const quality = store.get('fg:quality', 'high');

const socket = io();
let room = null;
let catalog = [];
let categories = []; // nhóm game cho thanh chọn game bên trái
let players = new Map();
let lastState = null;
let current = null; // game đang gắn: { id, inst, removeCss }
let loadingId = null;
let lastSetup = null; // { game, data }: dữ liệu bắt đầu ván, giữ lại để gắn cho game vừa tải xong
const ad = adSlot($('#adHost'), 'host'); // quảng cáo chỉ ở phòng chờ

const getSession = () => session.get(SESSION_KEY, null) || {};
const setSession = patch => session.set(SESSION_KEY, { ...getSession(), ...patch });

// ---------- Kết nối ----------
socket.on('connect', () => {
  const saved = getSession();
  if (saved.code) socket.emit('host:resume', saved, res => (res?.ok ? onJoined(res) : create()));
  else create();
});
socket.on('disconnect', () => toast(t('host.disconnected')));
watchVersion(socket);

function create() {
  socket.emit('host:create', { license: getSession().license || '', game: getSession().game }, res => {
    if (res?.error === 'busy') {
      $('#loading').hidden = false;
      $('#loading').textContent = t('host.busy');
      setTimeout(create, 10000);
      return;
    }
    onJoined(res);
  });
}

function onJoined(res) {
  if (!res?.ok) return;
  catalog = res.games || catalog;
  categories = res.categories || categories;
  setSession({ code: res.code, token: res.token });
  setJoinUrl(res.code);
  lastSetup = res.setup ? { game: res.room.game, data: res.setup } : null;
  onRoom(res.room);
  if (res.licenseError) {
    setSession({ license: '' });
    showLicenseMsg(LICENSE_ERRORS[res.licenseError] ? t(LICENSE_ERRORS[res.licenseError]) : t('license.restoreFail'), false);
  }
}

async function setJoinUrl(code) {
  const local = ['localhost', '127.0.0.1', '::1', '[::1]'].includes(location.hostname);
  let origin = location.origin;
  const warns = [];
  if (local) {
    try {
      const { ips } = await fetch('/api/lan').then(r => r.json());
      if (ips[0]) origin = `${location.protocol}//${ips[0]}${location.port ? ':' + location.port : ''}`;
    } catch {}
    warns.push(t('host.warnLocal'));
  }
  if (location.protocol !== 'https:') warns.push(t('host.warnHttps'));
  const url = `${origin}/play?room=${code}`;
  $('#qr').src = '/qr.svg?text=' + encodeURIComponent(url);
  $('#joinUrl').textContent = url;
  $('#roomCode').textContent = code;
  $('#urlWarn').textContent = warns.join(' ');
  $('#urlWarn').hidden = !warns.length;
}

// ---------- Gắn game ----------
// gameT: chữ của game (games/<id>/assets/i18n.json), thiếu thì lấy chữ phần chung.
function gameCtx(gameT) {
  return {
    root: $('#game'),
    manifest,
    animalById,
    quality,
    toast,
    beep,
    fanfare,
    esc,
    lang, // 'vi' | 'en'
    t: gameT,
    pick, // chữ dạng { vi, en } → đúng ngôn ngữ
    player: id => players.get(id),
  };
}

async function useGame(id) {
  if (current?.id === id || loadingId === id) return;
  loadingId = id;
  let mod;
  let gameT;
  try {
    [mod, gameT] = await Promise.all([import(`/games/${id}/screen/index.js`), loadGameT(id)]);
  } catch (err) {
    if (loadingId === id) loadingId = null;
    $('#loading').hidden = false;
    $('#loading').textContent = t('host.loadError', { id, msg: err.message });
    return;
  }
  if (loadingId !== id) return; // trong lúc tải đã đổi sang game khác
  loadingId = null;
  if (current) {
    try {
      current.inst.destroy?.();
    } catch {}
    current.removeCss();
    current = null;
  }
  $('#game').innerHTML = '';
  $('#game').dataset.game = id;
  const removeCss = loadCss(`/games/${id}/screen/style.css`);
  const inst = (await mod.create(gameCtx(gameT))) || {};
  current = { id, inst, removeCss };
  if (room?.game === id) inst.onRoom?.(room);
  if (lastSetup?.game === id) inst.onSetup?.(lastSetup.data);
  $('#loading').hidden = true;
}

function gameCall(name, arg) {
  if (!current || current.id !== room?.game) return;
  try {
    current.inst[name]?.(arg);
  } catch (err) {
    console.error(`Lỗi game ${current.id}.${name}:`, err);
  }
}

socket.on('game:setup', data => {
  lastSetup = { game: room?.game, data };
  gameCall('onSetup', data);
});
socket.on('game:state', s => gameCall('onState', s));
socket.on('game:event', e => gameCall('onEvent', e));

// ---------- Trạng thái phòng ----------
socket.on('room', onRoom);

function gameInfo() {
  return catalog.find(g => g.id === room?.game) || null;
}

function onRoom(info) {
  room = info;
  players = new Map(info.players.map(p => [p.id, p]));
  setSession({ game: info.game });
  if (info.state === 'lobby') lastSetup = null;
  useGame(info.game);
  gameCall('onRoom', info);

  renderGamePicker();
  renderOptions();
  renderLobby();

  $('#lobby').hidden = info.state !== 'lobby';
  $('#results').hidden = info.state !== 'finished';
  if (info.state === 'lobby') ad.show();
  else ad.hide();
  if (info.state === 'finished' && lastState !== 'finished') {
    renderResults(info.results || []);
    fanfare();
  }
  if (info.state === 'countdown' && lastState !== 'countdown') runCountdown(info.startIn);
  if (info.state === 'playing' && lastState === 'countdown') showGo(info.goText);
  if (info.state === 'lobby' || info.state === 'finished') stopCountdown();
  lastState = info.state;
}

// ---------- Chọn game (thanh bên trái, chia theo nhóm) + tuỳ chọn của game ----------
function gameTags(g) {
  const tags = [`👤 ${g.minPlayers > 1 ? g.minPlayers : 1}–${g.maxPlayers}`];
  if (g.sensors) tags.push(t('tag.motion'));
  if (g.teams) tags.push(t('tag.teams'));
  return tags;
}

// Tên nhóm: có trong từ điển (cat.<id>) thì dịch, không thì lấy tên nhóm server gửi.
function categoryName(c) {
  const key = `cat.${c.id}`;
  const text = t(key);
  return text === key ? pick(c.name) : text;
}

function renderGamePicker() {
  // Nhóm theo thứ tự trong cấu hình; game khai báo nhóm lạ thì vào nhóm "Khác" ở cuối. Tên nhóm dịch theo id (cat.<id>).
  const known = new Set(categories.map(c => c.id));
  const groups = [...categories, { id: 'other', emoji: '🎮' }]
    .map(c => ({ ...c, games: catalog.filter(g => (known.has(g.category) ? g.category : 'other') === c.id) }))
    .filter(c => c.games.length);
  // Thẻ nhỏ: biểu tượng + tên (3 thẻ một hàng); nhãn chi tiết hiện ở khung giữa cho game đang chọn.
  document.querySelector('.game-list').innerHTML = groups
    .map(
      c => `<section class="game-group">
        <h3>${esc(c.emoji)} ${esc(categoryName(c))}</h3>
        <div class="game-tiles">
          ${c.games
            .map(
              g => `<button class="game-card${g.id === room.game ? ' sel' : ''}" data-game="${esc(g.id)}" role="radio"
                aria-checked="${g.id === room.game}" title="${esc(pick(g.description))}">
                <span class="emoji">${esc(g.emoji)}</span>
                <span>${esc(pick(g.name))}</span>
              </button>`,
            )
            .join('')}
        </div>
      </section>`,
    )
    .join('');
  const game = gameInfo();
  document.querySelector('.game-title').textContent = game ? `${game.emoji} ${pick(game.name)}` : '';
  document.querySelector('.game-tags').innerHTML = game ? gameTags(game).map(tag => `<i>${esc(tag)}</i>`).join('') : '';
  document.querySelector('.game-desc').textContent = pick(game?.description);
}

// ---------- Cài đặt (⚙️): mã Pro, đồ hoạ, toàn màn hình, link vào phòng, version ----------
function setSettingsOpen(open) {
  $('#settings').hidden = !open;
  $('#btnSettings').setAttribute('aria-expanded', String(open));
}
$('#btnSettings').onclick = e => {
  e.stopPropagation();
  setSettingsOpen($('#settings').hidden);
};
// Bấm ra ngoài thì đóng.
document.addEventListener('click', e => {
  if (!$('#settings').hidden && !e.target.closest('#settings, #btnSettings')) setSettingsOpen(false);
});

function renderOptions() {
  const game = gameInfo();
  for (const box of document.querySelectorAll('.game-options')) {
    const prefix = box.dataset.prefixKey ? t(box.dataset.prefixKey) : '';
    const button = (o, c, value) =>
      `<button data-key="${esc(o.key)}" data-value="${esc(c.value)}" class="${c.value === value ? 'sel' : ''}">${esc(pick(c.label))}</button>`;
    if (box.classList.contains('compact')) {
      // Phòng chờ: mỗi lựa chọn là một dải nút liền nhau, tên lựa chọn thẳng cột; mô tả gom thành 1 dòng chữ nhỏ.
      const notes = [];
      box.innerHTML = (game?.options || [])
        .map(o => {
          const value = room.options?.[o.key];
          const sel = o.choices.find(c => c.value === value);
          if (sel?.desc) notes.push(pick(sel.desc));
          return `<div class="option" role="radiogroup" aria-label="${esc(pick(o.label))}">
            <span class="label">${esc(pick(o.label))}</span>
            <div class="seg">${o.choices.map(c => button(o, c, value)).join('')}</div>
          </div>`;
        })
        .join('') + (notes.length ? `<p class="option-notes">ⓘ ${notes.map(esc).join(' · ')}</p>` : '');
      continue;
    }
    box.innerHTML = (game?.options || [])
      .map(o => {
        const value = room.options?.[o.key];
        const sel = o.choices.find(c => c.value === value);
        return `<div class="option" role="radiogroup" aria-label="${esc(pick(o.label))}">
          <span class="label">${esc(prefix + pick(o.label))}:</span>
          ${o.choices.map(c => button(o, c, value)).join('')}
        </div>
        <p class="option-desc">${esc(pick(sel?.desc))}</p>`;
      })
      .join('');
  }
}

document.addEventListener('click', e => {
  const g = e.target.closest?.('.game-list button[data-game]');
  if (g && g.dataset.game !== room?.game) socket.emit('host:game', g.dataset.game);
  const o = e.target.closest?.('.game-options button[data-key]');
  if (o) socket.emit('host:option', { key: o.dataset.key, value: o.dataset.value });
});

// ---------- Gói miễn phí / Pro ----------
// Mã lỗi từ server → khoá chữ trong từ điển.
const LICENSE_ERRORS = {
  invalid: 'license.invalid',
  expired: 'license.expired',
  'in-use': 'license.inUse',
  disabled: 'license.disabled',
  'no-room': 'license.noRoom',
};

function renderTier() {
  const pro = room.tier === 'pro';
  const badge = $('#tierBadge');
  badge.classList.toggle('pro', pro);
  badge.textContent = pro
    ? t('tier.pro', { n: room.maxPlayers }) + (room.proUntil ? t('tier.until', { date: formatDate(room.proUntil) }) : '')
    : t('tier.free', { n: room.maxPlayers });
  $('#btnShowLicense').textContent = t(pro ? 'host.changePro' : 'host.enterPro');
  $('#btnRemoveLicense').hidden = !pro;
}

function showLicenseMsg(text, ok) {
  const el = $('#licenseMsg');
  el.textContent = text;
  el.classList.toggle('ok', !!ok);
  el.hidden = !text;
  if (text && $('#settings').hidden) toast(text); // khung cài đặt đang đóng: vẫn báo cho chủ phòng thấy
}

$('#btnShowLicense').onclick = () => {
  const form = $('#licenseForm');
  form.hidden = !form.hidden;
  if (!form.hidden) $('#licenseInput').focus();
};

$('#licenseForm').onsubmit = e => {
  e.preventDefault();
  const code = $('#licenseInput').value.trim();
  if (!code) return;
  socket.emit('host:license', { code }, res => {
    if (res?.ok) {
      setSession({ license: res.code });
      $('#licenseInput').value = '';
      $('#licenseForm').hidden = true;
      const until = res.expiresAt ? t('license.untilShort', { date: formatDate(res.expiresAt) }) : '';
      showLicenseMsg(t('license.activated', { n: res.maxPlayers, until }), true);
    } else {
      showLicenseMsg(t(LICENSE_ERRORS[res?.error] || 'license.fail'), false);
    }
  });
};

$('#btnRemoveLicense').onclick = () => {
  if (!confirm(t('license.confirmRemove'))) return;
  socket.emit('host:license', { code: '' }, () => {
    setSession({ license: '' });
    showLicenseMsg(t('license.removed'), true);
  });
};

// ---------- Phòng chờ ----------
function renderLobby() {
  const list = room.players;
  const game = gameInfo();
  renderTier();
  $('#playerCount').textContent = `${list.length}/${room.maxPlayers}`;
  $('#emptyHint').hidden = list.length > 0;
  const teams = room.teamMode ? room.teams : null;
  $('#playerList').innerHTML = list
    .map(p => {
      const a = animalById.get(p.animal);
      const team = teams && p.team != null ? teams[p.team] : null;
      const teamBtn = teams
        ? `<button class="team" data-id="${esc(p.id)}" title="${esc(t('host.changeTeam'))}">${team ? team.emoji : '⚪'}</button>`
        : '';
      return `<li class="${p.connected ? '' : 'off'}" style="--c:${team ? team.color : p.color}">
        ${teamBtn}
        <span class="emoji">${a?.emoji || '🐾'}</span>
        <span class="name">${esc(p.name)}${p.bot ? ' 🤖' : ''}</span>
        <button class="kick" data-id="${esc(p.id)}" title="${esc(t('host.kick'))}">✕</button>
      </li>`;
    })
    .join('');
  renderTeams(list);
  $('#btnStart').disabled = !list.some(p => p.connected);
  $('#btnStart').innerHTML = `<span class="go">▶</span><b>${esc(t('host.start'))}</b>`;
  const bots = !!game?.bots;
  $('#btnAddBot').hidden = !bots;
  $('#btnClearBots').hidden = !bots;
  $('#btnAddBot').disabled = list.length >= room.maxPlayers;
  $('#btnClearBots').disabled = !list.some(p => p.bot);
}

// ---------- Đội ----------
function renderTeams(list) {
  $('#teamBar').hidden = !room.teamMode;
  if (!room.teamMode) return;
  const { min, max, equal } = room.teamRule;
  const counts = room.teams.map(team => ({ team, n: list.filter(p => p.team === team.id).length })).filter(x => x.n > 0);
  const none = list.filter(p => p.team == null).length;
  const parts = counts.map(({ team, n }) => `${team.emoji} ${n}`);
  if (none) parts.push(t('team.noTeam', { n: none }));
  const rule = t('team.rule', { min, max }) + (equal ? t('team.ruleEqual') : '') + '.';
  $('#teamSummary').textContent = `${rule} ${parts.join(' · ') || t('team.nobody')}`;
}

$('#btnShuffleTeams').onclick = () => socket.emit('host:shuffleTeams');

// ---------- Đếm ngược ----------
let cdTimer = null;

function stopCountdown() {
  clearInterval(cdTimer);
  cdTimer = null;
  $('#countdown').hidden = true;
}

function runCountdown(ms) {
  stopCountdown();
  const end = performance.now() + (ms || 0);
  const el = $('#countdown');
  let last = null;
  const step = () => {
    const n = Math.ceil((end - performance.now()) / 1000);
    if (n <= 0) {
      clearInterval(cdTimer);
      cdTimer = null;
      return;
    }
    if (n !== last) {
      last = n;
      el.hidden = false;
      el.classList.remove('go');
      el.textContent = n;
      beep(440, 0.18);
    }
  };
  step();
  cdTimer = setInterval(step, 50);
}

function showGo(text) {
  clearInterval(cdTimer);
  cdTimer = null;
  const el = $('#countdown');
  el.hidden = false;
  el.classList.add('go');
  const go = pick(text) || t('host.go');
  el.textContent = go;
  beep(880, 0.35);
  setTimeout(() => {
    if (el.textContent === go) el.hidden = true;
  }, 900);
}

// ---------- Kết quả ----------
function renderResults(results) {
  $('#resultList').innerHTML = results
    .map(r => {
      const a = animalById.get(r.animal);
      return `<li style="--c:${r.color}">
        <span class="medal">${MEDALS[r.place - 1] || r.place}</span>
        <span class="emoji">${a?.emoji || '🐾'}</span>
        <span class="name">${esc(pick(r.name))}</span>
        <span class="time">${esc(pick(r.detail))}</span>
      </li>`;
    })
    .join('');
}

// ---------- Thông báo ----------
function toast(text) {
  const box = $('#toasts');
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = text;
  box.append(el);
  while (box.children.length > 4) box.firstElementChild.remove();
  setTimeout(() => el.remove(), 2500);
}

// ---------- Nút bấm ----------
const START_ERRORS = {
  'too-many': r => t('start.tooMany', { n: r.maxPlayers }),
  'too-few': r => t('start.tooFew', { n: r.minPlayers }),
  empty: () => t('start.empty'),
  teams: r =>
    r.reason === 'need-two' ? t('start.needTwo') : r.reason === 'equal' ? t('start.equal') : t('start.size', { min: r.min, max: r.max }),
  'game-error': () => t('start.gameError'),
};

function startGame() {
  unlockAudio();
  socket.emit('host:start', null, res => {
    if (res?.ok) return;
    const msg = START_ERRORS[res?.error];
    if (msg) toast(msg(res));
    if (room?.state === 'finished') socket.emit('host:lobby');
  });
}
$('#btnStart').onclick = startGame;
$('#btnAgain').onclick = startGame;
$('#btnLobby').onclick = () => socket.emit('host:lobby');
$('#btnAddBot').onclick = () => socket.emit('host:addBot');
$('#btnClearBots').onclick = () => socket.emit('host:clearBots');
$('#playerList').onclick = e => {
  const btn = e.target.closest('.kick');
  if (btn) socket.emit('host:kick', btn.dataset.id);
  // Bấm vào huy hiệu đội: chuyển sang đội kế tiếp.
  const team = e.target.closest('.team');
  if (team && room?.teamMode) {
    const p = players.get(team.dataset.id);
    const next = p?.team == null ? 0 : (p.team + 1) % room.teams.length;
    socket.emit('host:team', { id: team.dataset.id, team: next });
  }
};

$('#btnQuality').textContent = t(quality === 'high' ? 'host.qualityHigh' : 'host.qualityLow');
$('#btnQuality').onclick = () => {
  store.set('fg:quality', quality === 'high' ? 'low' : 'high');
  location.reload();
};

function toggleFullscreen() {
  if (document.fullscreenElement) document.exitFullscreen?.();
  else document.documentElement.requestFullscreen?.().catch(() => {});
}
$('#btnFullscreen').onclick = toggleFullscreen;

window.addEventListener('keydown', e => {
  if (e.target.closest?.('input, textarea')) return;
  if (e.key === 'f' || e.key === 'F') toggleFullscreen();
});

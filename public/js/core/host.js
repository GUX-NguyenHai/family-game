// Màn hình chung (TV/laptop): phần dùng chung cho mọi game.
// Lo phòng, QR, danh sách người chơi, gói Pro, chọn game + tuỳ chọn, đếm ngược, thông báo, bảng kết quả.
// Phần vẽ game do module games/<id>/screen/index.js lo: export create(ctx) trả về
//   { onRoom(info), onSetup(data), onState(s), onEvent(e), destroy() } (hàm nào không cần thì bỏ).
import { $, esc, store, session, loadCss, watchVersion, MEDALS } from './util.js';
import { unlockAudio, beep, fanfare } from './audio.js';

const SESSION_KEY = 'fg:host';
const manifest = await fetch('/assets/animals.json').then(r => r.json());
const animalById = new Map(manifest.animals.map(a => [a.id, a]));
const quality = store.get('fg:quality', 'high');

const socket = io();
let room = null;
let catalog = [];
let players = new Map();
let lastState = null;
let current = null; // game đang gắn: { id, inst, removeCss }
let loadingId = null;
let lastSetup = null; // { game, data }: dữ liệu bắt đầu ván, giữ lại để gắn cho game vừa tải xong

const getSession = () => session.get(SESSION_KEY, null) || {};
const setSession = patch => session.set(SESSION_KEY, { ...getSession(), ...patch });

// ---------- Kết nối ----------
socket.on('connect', () => {
  const saved = getSession();
  if (saved.code) socket.emit('host:resume', saved, res => (res?.ok ? onJoined(res) : create()));
  else create();
});
socket.on('disconnect', () => toast('Mất kết nối server, đang nối lại…'));
watchVersion(socket);

function create() {
  socket.emit('host:create', { license: getSession().license || '', game: getSession().game }, res => {
    if (res?.error === 'busy') {
      $('#loading').hidden = false;
      $('#loading').textContent = 'Server đang có quá nhiều phòng, thử lại sau ít phút…';
      setTimeout(create, 10000);
      return;
    }
    onJoined(res);
  });
}

function onJoined(res) {
  if (!res?.ok) return;
  catalog = res.games || catalog;
  setSession({ code: res.code, token: res.token });
  setJoinUrl(res.code);
  lastSetup = res.setup ? { game: res.room.game, data: res.setup } : null;
  onRoom(res.room);
  if (res.licenseError) {
    setSession({ license: '' });
    showLicenseMsg(LICENSE_ERRORS[res.licenseError] || 'Không gắn lại được mã Pro.', false);
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
    warns.push('Đang mở bằng localhost nên mã QR dùng IP mạng LAN.');
  }
  if (location.protocol !== 'https:') {
    warns.push('Chưa có HTTPS: iPhone sẽ không dùng được cảm biến (chỉ dùng nút bấm).');
  }
  const url = `${origin}/play?room=${code}`;
  $('#qr').src = '/qr.svg?text=' + encodeURIComponent(url);
  $('#joinUrl').textContent = url;
  $('#roomCode').textContent = code;
  $('#urlWarn').textContent = warns.join(' ');
  $('#urlWarn').hidden = !warns.length;
}

// ---------- Gắn game ----------
function gameCtx() {
  return {
    root: $('#game'),
    manifest,
    animalById,
    quality,
    toast,
    beep,
    fanfare,
    esc,
    player: id => players.get(id),
  };
}

async function useGame(id) {
  if (current?.id === id || loadingId === id) return;
  loadingId = id;
  let mod;
  try {
    mod = await import(`/games/${id}/screen/index.js`);
  } catch (err) {
    if (loadingId === id) loadingId = null;
    $('#loading').hidden = false;
    $('#loading').textContent = `Lỗi tải game "${id}": ${err.message} (thử Ctrl+Shift+R)`;
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
  const inst = (await mod.create(gameCtx())) || {};
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
  if (info.state === 'finished' && lastState !== 'finished') {
    renderResults(info.results || []);
    fanfare();
  }
  if (info.state === 'countdown' && lastState !== 'countdown') runCountdown(info.startIn);
  if (info.state === 'playing' && lastState === 'countdown') showGo(info.goText);
  if (info.state === 'lobby' || info.state === 'finished') stopCountdown();
  lastState = info.state;
}

// ---------- Chọn game + tuỳ chọn của game ----------
function renderGamePicker() {
  const box = document.querySelector('.game-picker');
  box.innerHTML = catalog
    .map(g => `<button data-game="${esc(g.id)}" class="${g.id === room.game ? 'sel' : ''}">${esc(g.emoji)} ${esc(g.name)}</button>`)
    .join('');
  box.hidden = catalog.length < 2;
  document.querySelector('.game-desc').textContent = gameInfo()?.description || '';
}

function renderOptions() {
  const game = gameInfo();
  for (const box of document.querySelectorAll('.game-options')) {
    const prefix = box.dataset.prefix || '';
    box.innerHTML = (game?.options || [])
      .map(o => {
        const value = room.options?.[o.key];
        const sel = o.choices.find(c => c.value === value);
        return `<div class="option" role="radiogroup" aria-label="${esc(o.label)}">
          <span class="label">${esc(prefix + o.label)}:</span>
          ${o.choices
            .map(c => `<button data-key="${esc(o.key)}" data-value="${esc(c.value)}" class="${c.value === value ? 'sel' : ''}">${esc(c.label)}</button>`)
            .join('')}
        </div>
        <p class="option-desc">${esc(sel?.desc || '')}</p>`;
      })
      .join('');
  }
}

document.addEventListener('click', e => {
  const g = e.target.closest?.('.game-picker button[data-game]');
  if (g) socket.emit('host:game', g.dataset.game);
  const o = e.target.closest?.('.game-options button[data-key]');
  if (o) socket.emit('host:option', { key: o.dataset.key, value: o.dataset.value });
});

// ---------- Gói miễn phí / Pro ----------
const LICENSE_ERRORS = {
  invalid: 'Mã không đúng. Kiểm tra lại từng ký tự.',
  expired: 'Mã đã hết hạn.',
  'in-use': 'Mã đang được dùng ở một phòng khác đang mở.',
  disabled: 'Server chưa bật tính năng Pro.',
  'no-room': 'Chưa kết nối được phòng, thử lại.',
};

function formatDate(ms) {
  return new Date(ms).toLocaleDateString('vi-VN');
}

function renderTier() {
  const pro = room.tier === 'pro';
  const badge = $('#tierBadge');
  badge.classList.toggle('pro', pro);
  badge.textContent = pro
    ? `⭐ Pro · tối đa ${room.maxPlayers} người${room.proUntil ? ` · hết hạn ${formatDate(room.proUntil)}` : ''}`
    : `🆓 Miễn phí · tối đa ${room.maxPlayers} người`;
  $('#btnShowLicense').textContent = pro ? 'Đổi mã' : 'Nhập mã Pro';
  $('#btnRemoveLicense').hidden = !pro;
}

function showLicenseMsg(text, ok) {
  const el = $('#licenseMsg');
  el.textContent = text;
  el.classList.toggle('ok', !!ok);
  el.hidden = !text;
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
      showLicenseMsg(`Đã kích hoạt Pro: tối đa ${res.maxPlayers} người${res.expiresAt ? `, hết hạn ${formatDate(res.expiresAt)}` : ''}.`, true);
    } else {
      showLicenseMsg(LICENSE_ERRORS[res?.error] || 'Không kích hoạt được mã.', false);
    }
  });
};

$('#btnRemoveLicense').onclick = () => {
  if (!confirm('Gỡ mã Pro khỏi phòng này? Phòng sẽ về bản miễn phí.')) return;
  socket.emit('host:license', { code: '' }, () => {
    setSession({ license: '' });
    showLicenseMsg('Đã gỡ mã, phòng về bản miễn phí.', true);
  });
};

// ---------- Phòng chờ ----------
function renderLobby() {
  const list = room.players;
  const game = gameInfo();
  renderTier();
  $('#playerCount').textContent = `${list.length}/${room.maxPlayers}`;
  $('#emptyHint').hidden = list.length > 0;
  $('#playerList').innerHTML = list
    .map(p => {
      const a = animalById.get(p.animal);
      return `<li class="${p.connected ? '' : 'off'}" style="--c:${p.color}">
        <span class="emoji">${a?.emoji || '🐾'}</span>
        <span class="name">${esc(p.name)}${p.bot ? ' 🤖' : ''}</span>
        <button class="kick" data-id="${esc(p.id)}" title="Mời ra">✕</button>
      </li>`;
    })
    .join('');
  $('#btnStart').disabled = !list.some(p => p.connected);
  $('#btnStart').textContent = `▶ Bắt đầu ${game ? game.name : ''}`;
  const bots = !!game?.bots;
  $('#btnAddBot').hidden = !bots;
  $('#btnClearBots').hidden = !bots;
  $('#btnAddBot').disabled = list.length >= room.maxPlayers;
  $('#btnClearBots').disabled = !list.some(p => p.bot);
}

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
  const t = text || 'BẮT ĐẦU!';
  el.textContent = t;
  beep(880, 0.35);
  setTimeout(() => {
    if (el.textContent === t) el.hidden = true;
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
        <span class="name">${esc(r.name)}</span>
        <span class="time">${esc(r.detail || '')}</span>
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
  'too-many': r => `Game này chỉ cho tối đa ${r.maxPlayers} người. Bớt người/bot hoặc nhập mã Pro.`,
  'too-few': r => `Game này cần ít nhất ${r.minPlayers} người.`,
  empty: () => 'Chưa có ai trong phòng.',
  'game-error': () => 'Game bị lỗi khi bắt đầu, xem log server.',
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
};

$('#btnQuality').textContent = quality === 'high' ? '🎨 Đồ hoạ: Cao' : '🎨 Đồ hoạ: Thấp';
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

// Điện thoại: phần dùng chung cho mọi game.
// Lo vào phòng, nối lại, phòng chờ, cảm biến, đếm ngược, màn kết quả, giữ màn hình sáng.
// Tay cầm do module games/<id>/controller/index.js lo: export create(ctx) trả về
//   { onShow(screen, prev), onRoom(info), onMe(m), onEvent(e), onGesture(name), frame(t), destroy() } (hàm nào không cần thì bỏ).
import { $, esc, store, loadCss, vibrate, watchVersion, MEDALS } from './util.js';
import { createSensors } from './sensors.js';
import { adSlot } from './ads.js';

const params = new URLSearchParams(location.search);

// Thêm ?debug=1 vào URL để hiện console ngay trên điện thoại.
if (params.has('debug')) {
  const s = document.createElement('script');
  s.src = 'https://cdn.jsdelivr.net/npm/eruda@3';
  s.onload = () => window.eruda?.init();
  document.head.append(s);
}

function makeId() {
  if (window.crypto?.randomUUID) return crypto.randomUUID();
  return 'p-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 12);
}

const manifest = await fetch('/assets/animals.json').then(r => r.json());
const animalById = new Map(manifest.animals.map(a => [a.id, a]));

const socket = io();
const sensors = createSensors({ onJump: () => gameCall('onGesture', 'jump') });

let playerId = store.get('fg:pid', null);
if (!playerId) {
  playerId = makeId();
  store.set('fg:pid', playerId);
}
let code = (params.get('room') || '').toUpperCase();
let name = store.get('fg:name', '');
let animal = animalById.has(store.get('fg:animal')) ? store.get('fg:animal') : manifest.animals[0].id;
let joined = false;
let wantJoin = !!code && !!name && store.get('fg:joined', null) === code; // tải lại trang thì tự vào lại
let editing = false;
let room = null;
let current = 'join';
let retries = 0;
let retryTimer = null;
let sensorErr = null;
let game = null; // tay cầm đang gắn: { id, inst, removeCss }
let loadingId = null;
let cdTimer = null;
let prefs = store.get('fg:prefs', {}) || {}; // lựa chọn riêng cho các game (VD loại thuyền), nhớ trên máy

// ---------- Màn hình ----------
const ad = adSlot($('#adPlay'), 'play'); // quảng cáo chỉ ở phòng chờ

function show(screen) {
  const prev = current;
  current = screen;
  for (const id of ['join', 'lobby', 'game', 'done']) $(`#scr-${id}`).hidden = id !== screen;
  if (screen === 'lobby') ad.show();
  else ad.hide();
  if (screen !== 'game') stopCountdown();
  if (prev !== screen) gameCall('onShow', screen, prev);
}

function msg(text) {
  $('#joinMsg').textContent = text || '';
}

function renderAnimalGrid() {
  $('#animalGrid').innerHTML = manifest.animals
    .map(a => `<button type="button" data-id="${a.id}" class="${a.id === animal ? 'sel' : ''}"><span class="e">${a.emoji}</span>${a.name}</button>`)
    .join('');
}

$('#animalGrid').onclick = e => {
  const btn = e.target.closest('button[data-id]');
  if (!btn) return;
  animal = btn.dataset.id;
  renderAnimalGrid();
};

$('#code').value = code;
$('#name').value = name;
renderAnimalGrid();
show('join');

// ---------- Gắn tay cầm của game ----------
function gameCtx() {
  return {
    lobbyRoot: $('#gameLobby'),
    playRoot: $('#game'),
    sensors,
    send: (type, data) => socket.connected && socket.emit('game:input', type, data),
    vibrate,
    esc,
    screen: () => current,
    room: () => room,
    me: () => room?.players.find(p => p.id === playerId) || null,
    sensorError: () => sensorErr,
    enableSensors,
    // Lựa chọn riêng cho game (VD loại thuyền): nhớ trên máy + báo server.
    pref: key => prefs[key],
    setPref(key, value) {
      prefs = { ...prefs, [key]: String(value) };
      store.set('fg:prefs', prefs);
      if (joined && socket.connected) socket.emit('player:prefs', { [key]: String(value) });
    },
  };
}

async function useGame(id) {
  if (game?.id === id || loadingId === id) return;
  loadingId = id;
  let mod;
  try {
    mod = await import(`/games/${id}/controller/index.js`);
  } catch (err) {
    if (loadingId === id) loadingId = null;
    $('#lobbyMsg').textContent = `Lỗi tải game: ${err.message}. Thử tải lại trang.`;
    return;
  }
  if (loadingId !== id) return;
  loadingId = null;
  if (game) {
    try {
      game.inst.destroy?.();
    } catch {}
    game.removeCss();
    game = null;
  }
  $('#gameLobby').innerHTML = '';
  $('#game').innerHTML = '';
  const removeCss = loadCss(`/games/${id}/controller/style.css`);
  const inst = mod.create(gameCtx()) || {};
  game = { id, inst, removeCss };
  if (room?.game === id) inst.onRoom?.(room);
  inst.onShow?.(current, null);
  updateSensorUi();
}

function gameCall(name, ...args) {
  if (!game || game.id !== room?.game) return;
  try {
    game.inst[name]?.(...args);
  } catch (err) {
    console.error(`Lỗi game ${game.id}.${name}:`, err);
  }
}

// ---------- Vào phòng ----------
$('#btnJoin').onclick = () => {
  // iPhone: xin quyền cảm biến phải nằm ngay trong sự kiện bấm, trước mọi await.
  if (!sensors.enabled && sensors.secure) enableSensors();
  keepAwake();

  code = $('#code').value.trim().toUpperCase();
  name = $('#name').value.trim();
  if (!/^[A-Z]{4}$/.test(code)) return msg('Mã phòng gồm 4 chữ cái.');
  if (!name) return msg('Nhập tên đã nhé!');
  store.set('fg:name', name);
  store.set('fg:animal', animal);
  history.replaceState(null, '', `?room=${code}${params.has('debug') ? '&debug=1' : ''}`);
  editing = false;
  wantJoin = true;
  retries = 0;
  msg('Đang vào phòng…');
  join();
};

function join() {
  clearTimeout(retryTimer);
  if (!socket.connected) return; // sẽ tự vào khi kết nối lại
  socket.emit('player:join', { code, playerId, name, animal, prefs }, res => {
    if (res?.ok) {
      retries = 0;
      joined = true;
      store.set('fg:joined', code);
      msg('');
      keepAwake();
      onRoom(res.room);
      return;
    }
    if (res?.error === 'no-room' && (joined || store.get('fg:joined', null) === code) && retries < 30) {
      // Server vừa khởi động lại: chờ màn hình chung dựng lại phòng.
      retries++;
      msg('Đang chờ phòng mở lại…');
      retryTimer = setTimeout(join, 2000);
      return;
    }
    joined = false;
    wantJoin = false;
    store.set('fg:joined', null);
    show('join');
    if (res?.error === 'full') {
      msg(
        res.tier === 'free'
          ? `Phòng miễn phí chỉ tối đa ${res.maxPlayers} người và đã đủ. Nhờ chủ phòng nhập mã Pro để thêm người.`
          : `Phòng đã đủ ${res.maxPlayers} người.`,
      );
    } else {
      msg('Không tìm thấy phòng. Kiểm tra lại mã hoặc quét lại QR.');
    }
  });
}

socket.on('connect', () => {
  $('#conn').hidden = true;
  if (wantJoin) join();
});
socket.on('disconnect', () => {
  if (joined) $('#conn').hidden = false;
});
watchVersion(socket);
socket.on('kicked', () => leave('Bạn đã được mời ra khỏi phòng.'));
socket.on('replaced', () => leave('Bạn vừa vào phòng từ một tab/máy khác.'));

function leave(text) {
  joined = false;
  wantJoin = false;
  store.set('fg:joined', null);
  show('join');
  msg(text);
}

$('#btnChange').onclick = () => {
  editing = true;
  show('join');
  msg('Đổi xong bấm "Vào phòng" để cập nhật.');
};

// ---------- Trạng thái phòng ----------
socket.on('room', onRoom);
socket.on('game:me', m => current === 'game' && gameCall('onMe', m));
socket.on('game:event', e => gameCall('onEvent', e));

function onRoom(info) {
  if (!joined) return;
  const prevState = room?.state;
  room = info;
  const me = info.players.find(p => p.id === playerId);
  if (!me) return leave('Bạn không còn trong phòng. Bấm "Vào phòng" để vào lại.');

  useGame(info.game);
  gameCall('onRoom', info);

  document.documentElement.style.setProperty('--me', me.color);
  const a = animalById.get(me.animal);
  $('#meEmoji').textContent = a?.emoji || '🐾';
  $('#meName').textContent = me.name;
  $('#gameTitle').textContent = `${info.gameEmoji} ${info.gameName}`;
  $('#sensorBox').hidden = !info.sensors;
  updateSensorUi();
  renderTeamPicker(me);

  if (info.state === 'lobby' || !me.inGame) {
    if (editing && info.state === 'lobby') return;
    $('#lobbyMsg').textContent =
      (info.state === 'lobby' ? 'Chờ chủ phòng bắt đầu…' : 'Đang có lượt chơi, bạn chờ lượt sau nhé!') +
      (info.optionsText ? ` · ${info.optionsText}` : '');
    show('lobby');
    return;
  }
  editing = false;
  if (info.state === 'countdown' || info.state === 'playing') {
    show('game');
    if (info.state === 'countdown' && (prevState !== 'countdown' || !cdTimer)) runCountdown(info.startIn);
    if (info.state === 'playing') stopCountdown();
    return;
  }
  if (info.state === 'finished') {
    const r = (info.results || []).find(x => x.id === playerId || x.members?.includes(playerId));
    $('#doneBig').textContent = r ? MEDALS[r.place - 1] || `#${r.place}` : '🏁';
    $('#doneText').textContent = r ? `Hạng ${r.place}${r.detail ? ` · ${r.detail}` : ''}` : 'Hết lượt!';
    show('done');
  }
}

// ---------- Chọn đội ----------
function renderTeamPicker(me) {
  const box = $('#teamBox');
  box.hidden = !room.teamMode;
  if (!room.teamMode) return;
  const counts = room.teams.map(t => room.players.filter(p => p.team === t.id).length);
  $('#teamPicker').innerHTML = room.teams
    .map(
      t => `<button type="button" data-team="${t.id}" class="${me.team === t.id ? 'sel' : ''}" style="--c:${t.color}">
        <span class="e">${t.emoji}</span>${esc(t.name)} (${counts[t.id]})
      </button>`,
    )
    .join('');
  const { min, max, equal } = room.teamRule;
  $('#teamHint').textContent =
    (me.team == null ? 'Bạn chưa chọn đội, lúc bắt đầu sẽ được xếp tự động. ' : '') +
    `Mỗi đội ${min}–${max} người${equal ? ', các đội phải bằng người' : ''}.`;
}

$('#teamPicker').onclick = e => {
  const btn = e.target.closest('button[data-team]');
  if (!btn || room?.state !== 'lobby') return;
  socket.emit('player:team', Number(btn.dataset.team));
};

// ---------- Đếm ngược ----------
function stopCountdown() {
  clearInterval(cdTimer);
  cdTimer = null;
  $('#cd').hidden = true;
}

function runCountdown(ms) {
  stopCountdown();
  const end = performance.now() + (ms || 0);
  const step = () => {
    const n = Math.ceil((end - performance.now()) / 1000);
    if (n <= 0) return stopCountdown();
    $('#cd').hidden = false;
    $('#cd').textContent = n;
  };
  step();
  if (end > performance.now()) cdTimer = setInterval(step, 100);
}

// Chặn cuộn/zoom khi đang chơi.
document.addEventListener('touchmove', e => {
  if (current === 'game') e.preventDefault();
}, { passive: false });
document.addEventListener('contextmenu', e => e.preventDefault());

// ---------- Cảm biến ----------
function enableSensors() {
  sensorErr = null;
  sensors.enable().then(
    () => updateSensorUi(),
    err => {
      sensorErr = err;
      updateSensorUi();
    },
  );
}

function updateSensorUi() {
  const need = !!room?.sensors;
  let text;
  let needButton = false;
  if (!sensors.secure) {
    text = 'Trang chưa có HTTPS nên không đọc được cảm biến.';
  } else if (sensors.enabled) {
    text = sensors.gotOrientation || sensors.gotMotion ? '✅ Cảm biến đang hoạt động' : 'Đang chờ dữ liệu cảm biến… Nếu lâu không có thì máy không hỗ trợ.';
  } else if (sensorErr?.message === 'denied') {
    text = 'Bạn đã từ chối quyền cảm biến. Bấm nút để thử lại.';
    needButton = true;
  } else if (sensorErr?.message === 'unsupported') {
    text = 'Trình duyệt không hỗ trợ cảm biến.';
  } else {
    text = 'Cảm biến chưa bật.';
    needButton = true;
  }
  $('#sensorStatus').textContent = text;
  $('#btnSensor').hidden = !needButton;
  $('#btnSensor2').hidden = !(need && needButton);
}

$('#btnSensor').onclick = enableSensors;
$('#btnSensor2').onclick = enableSensors;

// Android không cần xin quyền: bật luôn.
if (sensors.secure && !sensors.needsPermission) enableSensors();
updateSensorUi();

let uiAt = 0;
function loop(t) {
  sensors.decay();
  gameCall('frame', t);
  if (current === 'lobby' && t - uiAt > 500) {
    uiAt = t;
    updateSensorUi();
  }
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

// ---------- Giữ màn hình sáng ----------
let wakeLock = null;
async function keepAwake() {
  try {
    if ('wakeLock' in navigator && document.visibilityState === 'visible' && !wakeLock) {
      wakeLock = await navigator.wakeLock.request('screen');
      wakeLock.addEventListener('release', () => (wakeLock = null));
    }
  } catch {}
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && joined) keepAwake();
});

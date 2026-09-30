import { createSensors } from './sensors.js';

const $ = sel => document.querySelector(sel);
const params = new URLSearchParams(location.search);

// Thêm ?debug=1 vào URL để hiện console ngay trên điện thoại.
if (params.has('debug')) {
  const s = document.createElement('script');
  s.src = 'https://cdn.jsdelivr.net/npm/eruda@3';
  s.onload = () => window.eruda?.init();
  document.head.append(s);
}

const store = {
  get(key, fallback) {
    try {
      const v = localStorage.getItem(key);
      return v === null ? fallback : JSON.parse(v);
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {}
  },
};

function makeId() {
  if (window.crypto?.randomUUID) return crypto.randomUUID();
  return 'p-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 12);
}

const manifest = await fetch('/assets/animals.json').then(r => r.json());
const animalById = new Map(manifest.animals.map(a => [a.id, a]));

const socket = io();
const sensors = createSensors({ onJump: onGestureJump });

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

// ---------- Màn hình ----------
function show(screen) {
  current = screen;
  for (const id of ['join', 'lobby', 'race', 'done']) $(`#scr-${id}`).hidden = id !== screen;
  if (screen !== 'race') $('#cd').hidden = true;
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
  socket.emit('player:join', { code, playerId, name, animal }, res => {
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
// Server vừa được cập nhật (khác phiên bản lúc mở trang) thì tải lại để dùng code mới.
let buildId = null;
socket.on('hello', ({ build } = {}) => {
  if (buildId && build && build !== buildId) location.reload();
  buildId = build;
});
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
socket.on('me', onMe);
socket.on('hit', onHit);

function onRoom(info) {
  if (!joined) return;
  room = info;
  const me = info.players.find(p => p.id === playerId);
  if (!me) return leave('Bạn không còn trong phòng. Bấm "Vào phòng" để vào lại.');

  document.documentElement.style.setProperty('--me', me.color);
  const a = animalById.get(me.animal);
  $('#meEmoji').textContent = a?.emoji || '🐾';
  $('#meName').textContent = me.name;

  if (info.state === 'lobby' || !me.inRace) {
    if (editing && info.state === 'lobby') return;
    const level = { easy: '🟢 Dễ', normal: '🟡 Trung bình', hard: '🔴 Khó' }[info.difficulty] || '';
    $('#lobbyMsg').textContent =
      (info.state === 'lobby' ? 'Chờ chủ phòng bắt đầu…' : 'Đang có lượt đua, bạn chờ lượt sau nhé!') +
      (level ? ` · Độ khó: ${level}` : '');
    show('lobby');
    return;
  }
  editing = false;
  if (info.state === 'countdown' || info.state === 'racing') {
    if (current !== 'race') {
      $('#status').textContent = '';
      $('#powerBar').style.width = '0%';
      renderMana(0, false);
    }
    show('race');
    return;
  }
  if (info.state === 'finished') {
    const r = (info.results || []).find(x => x.id === playerId);
    const medals = ['🥇', '🥈', '🥉'];
    $('#doneBig').textContent = r ? medals[r.place - 1] || `#${r.place}` : '🏁';
    $('#doneText').textContent = !r
      ? 'Hết lượt!'
      : r.finished
        ? `Hạng ${r.place} · ${(r.timeMs / 1000).toFixed(2)}s`
        : `Hạng ${r.place} · chưa về đích (${Math.round(r.progress * 100)}%)`;
    show('done');
  }
}

function onMe(m) {
  if (current !== 'race') return;
  $('#pos').textContent = `${m.pos}/${m.total}`;
  $('#progBar').style.width = `${m.prog * 100}%`;
  $('#powerBar').style.width = `${m.pw * 100}%`;

  const f = m.f;
  renderMana(m.mn, !!(f & 16));
  updateNoShake();

  let status = '';
  if (f & 8) status = `Về đích hạng ${m.rank}! 🏁`;
  else if (f & 1) status = 'Vấp rào! 💫';
  else if (f & 16) status = 'TURBO! 🔥';
  else if (f & 2) status = 'Nhảy! ⤴';
  else if (f & 32) status = 'Va nhau! 💥';
  else if (f & 4) status = 'Lội bùn… 🟫';
  $('#status').textContent = status;

  const cd = $('#cd');
  if (m.state === 'countdown' && m.cd > 0) {
    cd.hidden = false;
    cd.textContent = Math.ceil(m.cd / 1000);
  } else {
    cd.hidden = true;
  }
}

function vibrate(pattern) {
  try {
    navigator.vibrate?.(pattern);
  } catch {}
}

function onHit(e) {
  if (e.type === 'fence') vibrate([200, 80, 200]);
  else if (e.type === 'carrot') vibrate(60);
  else if (e.type === 'manaFull') vibrate([40, 60, 40]);
  else if (e.type === 'bump') vibrate(35);
  else if (e.type === 'finish') vibrate([100, 50, 100, 50, 300]);
}

// ---------- Năng lượng + nút PHI! (TURBO) ----------
let manaReady = false;

// Có mana là bấm được; trong lúc TURBO thanh mana tụt dần tới 0. Đầy 100% thì nhấp nháy.
let lastMana = 0;
function renderMana(mana, turboOn) {
  const btn = $('#btnBoost');
  const value = Math.max(0, Math.min(1, mana || 0));
  lastMana = value;
  const pct = Math.round(value * 100);
  const full = pct >= 100;
  manaReady = value > 0 && !turboOn;
  btn.style.setProperty('--mana', `${pct}%`);
  btn.classList.toggle('ready', manaReady);
  btn.classList.toggle('full', full && !turboOn);
  btn.classList.toggle('turbo', turboOn);
  $('#boostLabel').innerHTML = turboOn
    ? `TURBO!<small>${pct}%</small>`
    : full
      ? 'PHI! 🔥'
      : `PHI!<small>${pct}%</small>`;
}

// Máy không lắc được thì báo cho người chơi biết.
function updateNoShake() {
  const el = $('#noShake');
  if (sensors.enabled && sensors.gotMotion) {
    el.hidden = true;
    return;
  }
  const canEnable = sensors.secure && !sensors.enabled && sensorErr?.message !== 'unsupported';
  el.textContent = canEnable
    ? 'Chưa bật cảm biến nên lắc chưa có tác dụng. Bấm "Bật cảm biến" ở dưới.'
    : 'Máy không có cảm biến lắc nên con vật chỉ chạy được khi bấm PHI! (TURBO).';
  el.hidden = false;
}

// ---------- Điều khiển ----------
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
bindHold($('#btnLeft'), -1);
bindHold($('#btnRight'), 1);

$('#btnBoost').addEventListener('pointerdown', e => {
  e.preventDefault();
  const b = $('#btnBoost');
  if (!manaReady) {
    // Hết mana (hoặc đang TURBO): lắc nút báo "chưa được".
    b.classList.remove('nope');
    void b.offsetWidth;
    b.classList.add('nope');
    return;
  }
  socket.emit('turbo');
  vibrate(40);
  renderMana(lastMana, true); // hiển thị ngay, server sẽ cập nhật mana tụt dần qua 'me'
});

function doJump() {
  socket.emit('jump');
  vibrate(20);
  const b = $('#btnJump');
  b.classList.add('flash');
  setTimeout(() => b.classList.remove('flash'), 150);
}

$('#btnJump').addEventListener('pointerdown', e => {
  e.preventDefault();
  doJump();
});

// "Giật cương" (hất đầu máy về phía mình): đang đua thì nhảy, ở phòng chờ thì báo đã nhận để thử.
let jumpHitTimer = null;
function onGestureJump() {
  if (current === 'race') {
    doJump();
  } else if (current === 'lobby') {
    $('#jumpHit').hidden = false;
    vibrate(20);
    clearTimeout(jumpHitTimer);
    jumpHitTimer = setTimeout(() => ($('#jumpHit').hidden = true), 600);
  }
}

// Chặn cuộn/zoom khi đang đua.
document.addEventListener('touchmove', e => {
  if (current === 'race') e.preventDefault();
}, { passive: false });
document.addEventListener('contextmenu', e => e.preventDefault());

let moveTick = 0;
setInterval(() => {
  const steer = holdSteer || (sensors.enabled ? sensors.steer : 0);
  $('#steerDot').style.left = `${50 + steer * 45}%`;
  if (current !== 'race' || !socket.connected) return;
  const v = Math.round(steer * 20) / 20;
  const now = Date.now();
  if (v !== lastSteer || now - lastSteerAt > 500) {
    socket.emit('steer', v);
    lastSteer = v;
    lastSteerAt = now;
  }
  // Mức lắc gửi đều 10 lần/giây (kể cả 0): server không nhận được nữa thì con vật dừng.
  if (++moveTick % 2 === 0) {
    const level = sensors.enabled ? sensors.level : 0;
    socket.emit('move', Math.round(level * 100) / 100);
  }
}, 50);

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
  let text;
  let needButton = false;
  if (!sensors.secure) {
    text = 'Trang chưa có HTTPS nên không đọc được cảm biến: con vật chỉ chạy được khi dùng TURBO.';
  } else if (sensors.enabled) {
    text = sensors.gotOrientation || sensors.gotMotion ? '✅ Cảm biến đang hoạt động' : 'Đang chờ dữ liệu cảm biến… Nếu lâu không có thì máy không hỗ trợ lắc.';
  } else if (sensorErr?.message === 'denied') {
    text = 'Bạn đã từ chối quyền cảm biến. Bấm nút để thử lại, không có cảm biến thì không lắc để chạy được.';
    needButton = true;
  } else if (sensorErr?.message === 'unsupported') {
    text = 'Trình duyệt không hỗ trợ cảm biến: con vật chỉ chạy được khi dùng TURBO.';
  } else {
    text = 'Cảm biến chưa bật.';
    needButton = true;
  }
  $('#sensorStatus').textContent = text;
  $('#btnSensor').hidden = !needButton;
  $('#btnSensor2').hidden = !needButton;

  const noGyro = sensors.enabled && sensors.gotMotion && !sensors.gotRotation;
  $('#jumpNote').textContent = noGyro ? 'Máy không có con quay hồi chuyển nên không nhảy bằng cử chỉ được, hãy bấm nút NHẢY.' : '';
  $('#jumpNote').hidden = !noGyro;
}

$('#btnSensor').onclick = enableSensors;
$('#btnSensor2').onclick = enableSensors;
$('#btnCalib').onclick = () => sensors.calibrate();
$('#chkInvert').checked = sensors.invert;
$('#chkInvert').onchange = e => sensors.setInvert(e.target.checked);
$('#selSens').value = String(sensors.range);
$('#selSens').onchange = e => sensors.setRange(e.target.value);
$('#selJump').value = String(sensors.jumpRate);
$('#selJump').onchange = e => sensors.setJumpRate(e.target.value);

// Android không cần xin quyền: bật luôn.
if (sensors.secure && !sensors.needsPermission) enableSensors();
updateSensorUi();

let uiAt = 0;
function sensorLoop(t) {
  if (current === 'lobby') {
    // Chấm chạm mép = lái hết cỡ.
    $('#tiltDot').style.left = `${50 + sensors.steer * 45}%`;
    // Thanh "Lắc ↕" = tốc độ con vật sẽ chạy (đầy = tối đa ở độ khó Trung bình).
    $('#shakeBar').style.width = `${Math.min(1, sensors.level) * 100}%`;
    // Thanh "Nhảy ⤴": đầy = đủ mạnh để nhảy.
    const jr = sensors.jumpRate || 250;
    $('#jumpBar').style.width = `${Math.min(1, sensors.pitchRate / jr) * 100}%`;
    if (t - uiAt > 500) {
      uiAt = t;
      updateSensorUi();
    }
  }
  sensors.decay();
  requestAnimationFrame(sensorLoop);
}
requestAnimationFrame(sensorLoop);

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

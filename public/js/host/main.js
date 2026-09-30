import { RaceScene } from './scene.js';

const $ = sel => document.querySelector(sel);
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
const session = {
  get() {
    try {
      return JSON.parse(sessionStorage.getItem('fg:host') || 'null');
    } catch {
      return null;
    }
  },
  set(v) {
    try {
      sessionStorage.setItem('fg:host', JSON.stringify(v));
    } catch {}
  },
};

const manifest = await fetch('/assets/animals.json').then(r => r.json());
const animalById = new Map(manifest.animals.map(a => [a.id, a]));
const quality = store.get('fg:quality', 'high');
const scene = new RaceScene($('#scene'), manifest, quality);
$('#loading').hidden = true;

const socket = io();
let room = null;
let players = new Map();
let trackLen = 400;
let lastState = null;
let lastCountdown = null;
let hudAt = 0;

// ---------- Âm thanh đơn giản (không cần file) ----------
let audio = null;
function unlockAudio() {
  try {
    audio ??= new AudioContext();
    audio.resume();
  } catch {}
}
function beep(freq, dur = 0.15, type = 'square', vol = 0.06) {
  if (!audio || audio.state !== 'running') return;
  const o = audio.createOscillator();
  const g = audio.createGain();
  o.type = type;
  o.frequency.value = freq;
  g.gain.setValueAtTime(vol, audio.currentTime);
  g.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + dur);
  o.connect(g).connect(audio.destination);
  o.start();
  o.stop(audio.currentTime + dur);
}
function fanfare() {
  [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => beep(f, 0.22, 'triangle', 0.08), i * 140));
}
document.addEventListener('pointerdown', unlockAudio);

// ---------- Kết nối ----------
socket.on('connect', () => {
  const saved = session.get();
  if (saved) socket.emit('host:resume', saved, res => (res?.ok ? onJoined(res) : create()));
  else create();
});
socket.on('disconnect', () => toast('Mất kết nối server, đang nối lại…'));

function create() {
  socket.emit('host:create', null, onJoined);
}

function onJoined(res) {
  if (!res?.ok) return;
  session.set({ code: res.code, token: res.token });
  setJoinUrl(res.code);
  if (res.race) scene.setupRace(res.race);
  onRoom(res.room);
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

// ---------- Trạng thái phòng ----------
socket.on('room', onRoom);
socket.on('race', info => scene.setupRace(info));
socket.on('state', onState);
socket.on('fx', onFx);

function onRoom(info) {
  room = info;
  trackLen = info.trackLen;
  players = new Map(info.players.map(p => [p.id, p]));
  scene.setPlayers(info.players, info.state);
  renderLobby();

  $('#lobby').hidden = info.state !== 'lobby';
  $('#hud').hidden = !(info.state === 'countdown' || info.state === 'racing' || info.state === 'finished');
  $('#results').hidden = info.state !== 'finished';
  if (info.state === 'finished' && lastState !== 'finished') {
    renderResults(info.results || []);
    fanfare();
  }
  if (info.state === 'racing' && lastState === 'countdown') showGo();
  if (info.state === 'lobby') $('#countdown').hidden = true;
  lastState = info.state;
}

function esc(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

function renderLobby() {
  const list = room.players;
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
  $('#btnAddBot').disabled = list.length >= room.maxPlayers;
  $('#btnClearBots').disabled = !list.some(p => p.bot);
}

function formatTime(ms) {
  return (ms / 1000).toFixed(2) + 's';
}

function renderResults(results) {
  const medals = ['🥇', '🥈', '🥉'];
  $('#resultList').innerHTML = results
    .map(r => {
      const a = animalById.get(r.animal);
      const time = r.finished ? formatTime(r.timeMs) : `chưa về (${Math.round(r.progress * 100)}%)`;
      return `<li style="--c:${r.color}">
        <span class="medal">${medals[r.place - 1] || r.place}</span>
        <span class="emoji">${a?.emoji || '🐾'}</span>
        <span class="name">${esc(r.name)}</span>
        <span class="time">${time}</span>
      </li>`;
    })
    .join('');
}

// ---------- Trong lúc đua ----------
function onState(s) {
  scene.pushSnapshot(s);

  if (s.state === 'countdown') {
    const n = Math.ceil(s.cd / 1000);
    if (n !== lastCountdown && n > 0) {
      lastCountdown = n;
      const el = $('#countdown');
      el.hidden = false;
      el.classList.remove('go');
      el.textContent = n;
      beep(440, 0.18);
    }
  } else {
    lastCountdown = null;
  }

  const now = performance.now();
  if (now - hudAt < 200) return;
  hudAt = now;
  renderHud(s);
}

function showGo() {
  const el = $('#countdown');
  el.hidden = false;
  el.classList.add('go');
  el.textContent = 'CHẠY!';
  beep(880, 0.35);
  setTimeout(() => {
    if (el.textContent === 'CHẠY!') el.hidden = true;
  }, 900);
}

function renderHud(s) {
  const order = [...s.p].sort((a, b) => {
    if (a.r != null && b.r != null) return a.r - b.r;
    if (a.r != null) return -1;
    if (b.r != null) return 1;
    return b.z - a.z;
  });
  $('#standings').innerHTML = order
    .map((p, i) => {
      const pl = players.get(p.id);
      return `<li style="--c:${pl?.color || '#fff'}">
        <span class="pos">${i + 1}.</span><span class="dot"></span>
        <span>${esc(pl?.name || '?')}</span>${p.r ? '<span class="fin">🏁</span>' : p.f & 16 ? '<span class="fin">🔥</span>' : ''}
      </li>`;
    })
    .join('');

  const bar = $('#progress');
  const seen = new Set();
  for (const p of s.p) {
    seen.add(p.id);
    let m = bar.querySelector(`[data-id="${CSS.escape(p.id)}"]`);
    if (!m) {
      m = document.createElement('div');
      m.className = 'marker';
      m.dataset.id = p.id;
      bar.append(m);
    }
    m.style.setProperty('--c', players.get(p.id)?.color || '#fff');
    m.style.top = `${(1 - Math.min(1, p.z / trackLen)) * 100}%`;
  }
  for (const m of bar.querySelectorAll('.marker')) if (!seen.has(m.dataset.id)) m.remove();
}

function onFx(ev) {
  scene.fx(ev);
  const name = players.get(ev.pid)?.name || '?';
  if (ev.type === 'fence') {
    toast(`${name} vấp rào! 💥`);
    beep(140, 0.2, 'sawtooth', 0.05);
  } else if (ev.type === 'carrot') {
    toast(`${name} ăn cà rốt! +10% năng lượng 🥕`);
    beep(990, 0.12, 'triangle');
  } else if (ev.type === 'turbo') {
    toast(`${name} dùng TURBO! 🔥`);
    beep(220, 0.1, 'sawtooth', 0.05);
    setTimeout(() => beep(440, 0.12, 'sawtooth', 0.05), 90);
    setTimeout(() => beep(880, 0.18, 'sawtooth', 0.05), 180);
  } else if (ev.type === 'finish') {
    toast(`${name} về đích hạng ${ev.rank}! 🏁`);
    if (ev.rank === 1) fanfare();
    else beep(660, 0.2, 'triangle');
  }
}

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
$('#btnStart').onclick = () => {
  unlockAudio();
  socket.emit('host:start');
};
$('#btnAgain').onclick = () => {
  unlockAudio();
  socket.emit('host:start');
};
$('#btnLobby').onclick = () => socket.emit('host:lobby');
$('#btnAddBot').onclick = () => socket.emit('host:addBot');
$('#btnClearBots').onclick = () => socket.emit('host:clearBots');
$('#playerList').onclick = e => {
  const btn = e.target.closest('.kick');
  if (btn) socket.emit('host:kick', btn.dataset.id);
};

$('#btnQuality').textContent = quality === 'high' ? '🎨 Chất lượng: Cao' : '🎨 Chất lượng: Thấp';
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
  if (e.key === 'y' || e.key === 'Y') {
    const yaw = scene.rotateModels(Math.PI / 2);
    toast(`Xoay model: modelYaw = ${yaw.toFixed(4)} (ghi số này vào animals.json)`);
  }
});

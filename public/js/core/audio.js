// Âm thanh đơn giản (không cần file) cho màn hình chung. Trình duyệt chỉ cho phát sau lần bấm đầu tiên.
let audio = null;

export function unlockAudio() {
  try {
    audio ??= new AudioContext();
    audio.resume();
  } catch {}
}

export function beep(freq, dur = 0.15, type = 'square', vol = 0.06) {
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

export function fanfare() {
  [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => beep(f, 0.22, 'triangle', 0.08), i * 140));
}

document.addEventListener('pointerdown', unlockAudio);

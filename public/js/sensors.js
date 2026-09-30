// Đọc cảm biến điện thoại: nghiêng trái/phải để lái; lắc LÊN XUỐNG để chạy (lắc ngang không tính).
// Mức lắc đo liên tục: đứng yên = 0 (con vật dừng), lắc càng nhanh/mạnh càng lớn (chạy càng nhanh).
// Dùng chung cho Android và iPhone; iPhone cần gọi enable() ngay trong sự kiện bấm nút.

const DEADZONE_DEG = 3; // nghiêng dưới mức này coi như cầm thẳng
const FULL_TILT_DEG = 15; // nghiêng tới mức này là lái hết cỡ
const NOISE_FLOOR = 1.0; // m/s²: rung tay khi cầm yên dưới mức này không tính
const ACTIVITY_TAU_MS = 250; // làm mượt mức lắc: dừng tay thì ~0,5 giây là về 0
const MAX_LEVEL = 1.5; // cho phép vượt 1 để độ khó cao (phải lắc mạnh hơn) vẫn đạt tối đa
// Nhảy = "giật cương": hất nhanh đầu máy về phía mình, tức góc ngửa (beta) đổi nhiều trong thời gian ngắn.
// Khác chạy (dịch chuyển lên xuống, góc gần như không đổi) và lái (nghiêng trái/phải = gamma, trục khác).
const JUMP_GAP_MS = 700; // 2 lần nhảy cách nhau ít nhất
const JUMP_WINDOW_MS = 250; // góc ngửa phải đổi đủ nhiều trong khoảng này
const GRAVITY_SMOOTH = 0.05; // lọc thông thấp để biết hướng trọng lực (= phương thẳng đứng)
const TILT_SMOOTH_MS = 120; // làm mượt góc nghiêng: giật máy nhanh sang ngang không làm đổi làn
const G = 9.81;

function load(key, fallback) {
  try {
    const v = localStorage.getItem(key);
    return v === null ? fallback : JSON.parse(v);
  } catch {
    return fallback;
  }
}

function save(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {}
}

function screenAngle() {
  const a = screen.orientation?.angle ?? window.orientation ?? 0;
  return ((a % 360) + 360) % 360;
}

export function createSensors({ onJump } = {}) {
  const s = {
    enabled: false,
    needsPermission:
      typeof window.DeviceMotionEvent?.requestPermission === 'function' ||
      typeof window.DeviceOrientationEvent?.requestPermission === 'function',
    secure: window.isSecureContext,
    gotOrientation: false,
    gotMotion: false,
    raw: 0, // góc nghiêng thô (độ)
    tilt: 0, // sau hiệu chỉnh/đảo chiều
    steer: 0, // -1..1
    activity: 0, // độ lắc lên xuống đã làm mượt (m/s²)
    level: 0, // mức lắc gửi lên server: 0 = đứng yên, 1 = lắc đủ mạnh (tối đa MAX_LEVEL)
    calib: load('fg:calib', 0),
    invert: load('fg:invert', false),
    // Độ nhạy: lắc mạnh bao nhiêu (m/s², trên mức rung tay) thì coi là hết cỡ. Nhỏ = nhạy.
    range: load('fg:range', 10),
    pitchSwing: 0, // góc ngửa đổi nhiều nhất gần đây (độ) để vẽ thanh đo
    // Ngưỡng nhảy (độ đổi trong 0,25 giây): nhỏ = nhạy. 0 = tắt nhảy bằng cử chỉ, chỉ dùng nút.
    jumpDeg: load('fg:jumpDeg', 20),
  };
  let lastMotionAt = 0;
  let lastJumpAt = 0;
  let pitchHistory = []; // [{t, v}] góc ngửa trong JUMP_WINDOW_MS gần nhất
  const grav = { x: 0, y: 0, z: 0, ready: false };
  let smoothTilt = null;
  let lastTiltAt = 0;

  // Chỉ nghiêng và giữ mới đổi làn; dao động nhanh (lắc) bị lọc bỏ.
  function applyTilt(raw) {
    const now = performance.now();
    const dt = lastTiltAt ? Math.min(200, now - lastTiltAt) : 16;
    lastTiltAt = now;
    smoothTilt = smoothTilt == null ? raw : smoothTilt + (raw - smoothTilt) * (1 - Math.exp(-dt / TILT_SMOOTH_MS));
    s.raw = smoothTilt;
    let t = smoothTilt - s.calib;
    if (s.invert) t = -t;
    s.tilt = t;
    const a = Math.abs(t);
    s.steer = a < DEADZONE_DEG ? 0 : Math.sign(t) * Math.min(1, (a - DEADZONE_DEG) / (FULL_TILT_DEG - DEADZONE_DEG));
  }

  function onOrientation(e) {
    if (e.gamma == null || e.beta == null) return;
    s.gotOrientation = true;
    const ang = screenAngle();
    const raw = ang === 90 ? e.beta : ang === 270 ? -e.beta : ang === 180 ? -e.gamma : e.gamma;
    applyTilt(raw);
    detectJump(ang === 90 || ang === 270 ? e.gamma : e.beta, performance.now());
  }

  // Góc ngửa đổi >= jumpDeg trong JUMP_WINDOW_MS (chiều nào cũng được) thì nhảy.
  function detectJump(pitch, now) {
    pitchHistory.push({ t: now, v: pitch });
    while (pitchHistory.length && now - pitchHistory[0].t > JUMP_WINDOW_MS) pitchHistory.shift();
    let min = Infinity;
    let max = -Infinity;
    for (const h of pitchHistory) {
      if (h.v < min) min = h.v;
      if (h.v > max) max = h.v;
    }
    const swing = max - min;
    if (swing > 120) return; // nhảy vọt do góc quấn vòng (máy lật úp), bỏ qua
    s.pitchSwing = Math.max(swing, s.pitchSwing);
    if (!s.jumpDeg || swing < s.jumpDeg || now - lastJumpAt < JUMP_GAP_MS) return;
    lastJumpAt = now;
    pitchHistory = []; // tránh 1 cú hất tính 2 lần
    onJump?.();
  }

  function onMotion(e) {
    const a = e.acceleration;
    const g = e.accelerationIncludingGravity;
    const hasA = a && a.x != null;
    const hasG = g && g.x != null;
    if (!hasA && !hasG) return;
    s.gotMotion = true;

    let mag;
    if (hasG) {
      // Hướng trọng lực = phương thẳng đứng, lấy bằng cách làm mượt accelerationIncludingGravity.
      if (!grav.ready) {
        Object.assign(grav, { x: g.x, y: g.y, z: g.z, ready: true });
      } else {
        grav.x += (g.x - grav.x) * GRAVITY_SMOOTH;
        grav.y += (g.y - grav.y) * GRAVITY_SMOOTH;
        grav.z += (g.z - grav.z) * GRAVITY_SMOOTH;
      }
      // Gia tốc do tay lắc (đã bỏ trọng lực), chỉ giữ phần theo phương thẳng đứng.
      // Lấy trị tuyệt đối nên không sợ iPhone/Android ngược dấu nhau.
      const lin = hasA ? a : { x: g.x - grav.x, y: g.y - grav.y, z: g.z - grav.z };
      const gn = Math.hypot(grav.x, grav.y, grav.z) || G;
      mag = Math.abs((lin.x * grav.x + lin.y * grav.y + lin.z * grav.z) / gn);

      // Máy không có con quay hồi chuyển: tính góc nghiêng từ trọng lực.
      if (!s.gotOrientation) {
        const ang = screenAngle();
        const axis = ang === 90 ? -grav.y : ang === 270 ? grav.y : ang === 180 ? -grav.x : grav.x;
        applyTilt((-Math.asin(Math.max(-1, Math.min(1, axis / G))) * 180) / Math.PI);
      }
    } else {
      // Không biết hướng trọng lực: đành tính lắc mọi hướng.
      mag = Math.hypot(a.x, a.y, a.z);
    }

    const now = performance.now();
    const dt = lastMotionAt ? Math.min(100, now - lastMotionAt) : 16;
    lastMotionAt = now;
    s.activity += (mag - s.activity) * (1 - Math.exp(-dt / ACTIVITY_TAU_MS));
    updateLevel();
  }

  function updateLevel() {
    s.level = Math.max(0, Math.min(MAX_LEVEL, (s.activity - NOISE_FLOOR) / s.range));
  }

  function attach() {
    if (s.enabled) return;
    window.addEventListener('deviceorientation', onOrientation);
    window.addEventListener('devicemotion', onMotion);
    s.enabled = true;
  }

  // Phải gọi đồng bộ trong sự kiện click (iPhone). Trả về Promise.
  s.enable = () => {
    if (!s.secure) return Promise.reject(new Error('insecure'));
    const DM = window.DeviceMotionEvent;
    const DO = window.DeviceOrientationEvent;
    if (!DM && !DO) return Promise.reject(new Error('unsupported'));
    const requests = [];
    if (typeof DM?.requestPermission === 'function') requests.push(DM.requestPermission());
    if (typeof DO?.requestPermission === 'function') requests.push(DO.requestPermission());
    return Promise.all(requests).then(results => {
      if (results.some(r => r !== 'granted')) throw new Error('denied');
      attach();
    });
  };

  s.calibrate = () => {
    s.calib = s.raw;
    save('fg:calib', s.calib);
    applyTilt(s.raw);
  };

  s.setInvert = v => {
    s.invert = !!v;
    save('fg:invert', s.invert);
    applyTilt(s.raw);
  };

  s.setRange = v => {
    s.range = Number(v) || 10;
    save('fg:range', s.range);
    updateLevel();
  };

  s.setJumpDeg = v => {
    s.jumpDeg = Number(v) || 0;
    save('fg:jumpDeg', s.jumpDeg);
  };

  // Gọi mỗi khung hình: nếu trình duyệt ngừng gửi sự kiện chuyển động thì cho mức lắc về 0.
  s.decay = () => {
    s.pitchSwing *= 0.93;
    if (performance.now() - lastMotionAt > 200) {
      s.activity *= 0.85;
      updateLevel();
    }
  };

  return s;
}

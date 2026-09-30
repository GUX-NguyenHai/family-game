// Đọc cảm biến điện thoại: nghiêng trái/phải để lái, lắc LÊN XUỐNG để phi (lắc ngang không tính).
// Dùng chung cho Android và iPhone; iPhone cần gọi enable() ngay trong sự kiện bấm nút.

const DEADZONE_DEG = 5;
const FULL_TILT_DEG = 25;
const SHAKE_GAP_MS = 130;
const GRAVITY_SMOOTH = 0.05; // lọc thông thấp để biết hướng trọng lực (= phương thẳng đứng)
const TILT_SMOOTH_MS = 180; // làm mượt góc nghiêng: giật máy nhanh sang ngang không làm đổi làn
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

export function createSensors({ onShake }) {
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
    shake: 0, // độ lắc hiện tại (m/s²) để vẽ thanh đo
    calib: load('fg:calib', 0),
    invert: load('fg:invert', false),
    threshold: load('fg:sens', 12),
  };
  let lastShake = 0;
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

    s.shake = Math.max(mag, s.shake * 0.92);
    const now = performance.now();
    if (mag > s.threshold && now - lastShake > SHAKE_GAP_MS) {
      lastShake = now;
      onShake(Math.min(1, (mag - s.threshold) / 15));
    }
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

  s.setThreshold = v => {
    s.threshold = Number(v) || 12;
    save('fg:sens', s.threshold);
  };

  s.decay = () => {
    s.shake *= 0.9;
  };

  return s;
}

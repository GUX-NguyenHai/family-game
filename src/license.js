// Mã Pro cho phòng trả phí. Mã được ký bằng LICENSE_SECRET và tự chứa hạn dùng + số người tối đa,
// nên server kiểm tra được mà không cần database. Việc bán/thanh toán nằm ngoài game.
//
// Dạng mã: XXXX-XXXX-XXXX-XXXX-XXXX-XX (22 ký tự Crockford base32, dấu gạch chỉ để dễ đọc)
//   8 ký tự mã định danh ngẫu nhiên + 4 ký tự ngày hết hạn + 2 ký tự số người + 8 ký tự chữ ký.
//
// Tạo mã (chạy ở máy có cùng LICENSE_SECRET với server):
//   node src/license.js --days 30 --players 12 --count 1      (--days 0 = vĩnh viễn)
const crypto = require('crypto');
const C = require('./config');

const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const DAY_MS = 86400000;
const DEV_SECRET = 'dev-only-secret-change-me';

function hasSecret() {
  return !!process.env.LICENSE_SECRET;
}

// Chạy production mà chưa đặt LICENSE_SECRET thì tắt Pro, tránh ai cũng tự tạo được mã.
function enabled() {
  return hasSecret() || process.env.NODE_ENV !== 'production';
}

function secret() {
  return process.env.LICENSE_SECRET || DEV_SECRET;
}

function encodeNum(n, len) {
  let s = '';
  for (let i = 0; i < len; i++) {
    s = ALPHABET[n % 32] + s;
    n = Math.floor(n / 32);
  }
  return s;
}

function decodeNum(s) {
  let n = 0;
  for (const ch of s) {
    const v = ALPHABET.indexOf(ch);
    if (v < 0) return NaN;
    n = n * 32 + v;
  }
  return n;
}

function randomChars(len) {
  return Array.from(crypto.randomBytes(len), b => ALPHABET[b % 32]).join('');
}

function sign(payload) {
  const mac = crypto.createHmac('sha256', secret()).update(payload).digest();
  return Array.from(mac.subarray(0, 8), b => ALPHABET[b % 32]).join('');
}

function format(raw) {
  return raw.match(/.{1,4}/g).join('-');
}

// Người dùng gõ nhầm O/0, I/L/1, thường/hoa, thêm dấu cách... vẫn nhận.
function normalize(input) {
  return String(input || '')
    .toUpperCase()
    .replace(/[^0-9A-Z]/g, '')
    .replace(/O/g, '0')
    .replace(/[IL]/g, '1');
}

function createCode({ days = 30, players = C.PRO_MAX_PLAYERS } = {}) {
  const id = randomChars(8);
  const exp = days > 0 ? Math.floor(Date.now() / DAY_MS) + Math.ceil(days) : 0;
  const payload = id + encodeNum(exp, 4) + encodeNum(Math.max(1, Math.min(1023, Math.floor(players))), 2);
  return format(payload + sign(payload));
}

// Trả về { ok, id, code, expiresAt, players } hoặc { ok: false, error: 'disabled'|'invalid'|'expired' }.
function verifyCode(input, now = Date.now()) {
  if (!enabled()) return { ok: false, error: 'disabled' };
  const raw = normalize(input);
  if (raw.length !== 22) return { ok: false, error: 'invalid' };
  const payload = raw.slice(0, 14);
  const sig = Buffer.from(raw.slice(14));
  const expected = Buffer.from(sign(payload));
  if (sig.length !== expected.length || !crypto.timingSafeEqual(sig, expected)) return { ok: false, error: 'invalid' };

  const exp = decodeNum(payload.slice(8, 12));
  const players = decodeNum(payload.slice(12, 14));
  if (!Number.isFinite(exp) || !Number.isFinite(players)) return { ok: false, error: 'invalid' };
  const expiresAt = exp ? exp * DAY_MS : null;
  if (expiresAt && now >= expiresAt) return { ok: false, error: 'expired', expiresAt };
  return { ok: true, id: payload.slice(0, 8), code: format(raw), expiresAt, players };
}

module.exports = { createCode, verifyCode, enabled, hasSecret };

if (require.main === module) {
  const args = process.argv.slice(2);
  const arg = (name, fallback) => {
    const i = args.indexOf('--' + name);
    const v = i >= 0 ? Number(args[i + 1]) : NaN;
    return Number.isFinite(v) ? v : fallback;
  };
  if (!enabled()) {
    console.error('Chưa đặt LICENSE_SECRET nên không tạo mã được (NODE_ENV=production).');
    process.exit(1);
  }
  if (!hasSecret()) console.warn('⚠️  Chưa đặt LICENSE_SECRET: đang dùng khoá thử, mã chỉ hợp lệ với server cũng chưa đặt khoá.');
  const days = arg('days', 30);
  const players = arg('players', C.PRO_MAX_PLAYERS);
  const count = Math.max(1, arg('count', 1));
  for (let i = 0; i < count; i++) console.log(createCode({ days, players }));
  console.log(`(${days > 0 ? `dùng ${days} ngày` : 'vĩnh viễn'}, tối đa ${players} người)`);
}

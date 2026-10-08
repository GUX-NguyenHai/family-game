// Trang quản trị /admin: upload game (.zip) để dùng ngay, không cần sửa code hay build lại Docker; xoá game đã upload.
// Mật khẩu: biến môi trường ADMIN_PASSWORD (đặt trong .env). Chưa đặt thì tắt trang quản trị.
// Game upload nằm trong thư mục games-installed/ (ngoài git, ngoài Docker image), mỗi game một thư mục <id>.
// Lưu ý: code trong service/ của game chạy thẳng trên server, chỉ upload game của người trong team.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const games = require('./games');
const { unzip } = require('./unzip');

const PASSWORD = process.env.ADMIN_PASSWORD || '';
const DIR = games.INSTALLED_DIR;
const SKIP = /(^|\/)(__MACOSX\/|\.DS_Store$|Thumbs\.db$|node_modules\/)/; // rác do máy tạo ra khi nén

function hash(text) {
  return crypto.createHash('sha256').update(String(text)).digest();
}

// Middleware: kiểm tra mật khẩu ở header x-admin-password. Sai thì chờ 1 giây mới trả lời (chống dò).
function guard(req, res, next) {
  if (!PASSWORD) return res.status(503).json({ error: 'Chưa đặt ADMIN_PASSWORD trong .env nên trang quản trị đang tắt.' });
  if (crypto.timingSafeEqual(hash(req.get('x-admin-password') || ''), hash(PASSWORD))) return next();
  setTimeout(() => res.status(401).json({ error: 'Sai mật khẩu.' }), 1000);
}

function list() {
  return games.all().map(g => ({
    id: g.id,
    name: games.text(g.name),
    emoji: g.emoji || '🎮',
    source: g.source,
    installedAt: g.installedAt || null,
  }));
}

// Nạp thử service/index.js của game vừa giải nén để lấy id, tên (rồi xoá khỏi bộ nhớ đệm require).
function peek(dir) {
  const entry = require.resolve(path.join(dir, 'service'));
  try {
    return require(entry);
  } finally {
    for (const key of Object.keys(require.cache)) if (key.startsWith(dir + path.sep)) delete require.cache[key];
  }
}

// buf: file zip; force: đã đồng ý các cảnh báo (ghi đè, trùng tên).
// Trả về { ok, id, name } | { ok: false, confirm: [cảnh báo] } | { ok: false, error }.
function install(buf, force) {
  let files;
  try {
    files = unzip(buf).filter(f => !SKIP.test(f.name));
  } catch (err) {
    return { ok: false, error: err.message };
  }
  // Zip có thể chứa cả thư mục game (ten-game/service/...) hoặc chỉ phần bên trong (service/...).
  const entry = files.find(f => /(^|\/)service\/index\.js$/.test(f.name));
  if (!entry) return { ok: false, error: 'Không thấy service/index.js trong file zip.' };
  const prefix = entry.name.slice(0, -'service/index.js'.length);

  fs.mkdirSync(DIR, { recursive: true });
  const tmp = path.join(DIR, `.upload-${crypto.randomUUID()}`);
  const cleanup = () => fs.rmSync(tmp, { recursive: true, force: true });
  try {
    for (const f of files) {
      if (!f.name.startsWith(prefix)) continue;
      const target = path.resolve(tmp, f.name.slice(prefix.length));
      if (!target.startsWith(tmp + path.sep)) continue; // đường dẫn lạ (../) thì bỏ, không ghi ra ngoài
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, f.data);
    }

    let mod;
    try {
      mod = peek(tmp);
    } catch (err) {
      cleanup();
      return { ok: false, error: `Lỗi khi nạp service/index.js: ${err.message}` };
    }
    const id = String(mod?.id || '');
    if (!/^[a-z0-9-]+$/.test(id)) {
      cleanup();
      return { ok: false, error: 'service/index.js thiếu id hợp lệ (chữ thường, số, dấu -).' };
    }
    if (typeof mod.createMatch !== 'function') {
      cleanup();
      return { ok: false, error: `Game ${id} thiếu createMatch().` };
    }
    const existing = games.get(id);
    if (existing?.source === 'builtin') {
      cleanup();
      return { ok: false, error: `Trùng id với game có sẵn "${id}" (${games.text(existing.name)}). Đổi id khác rồi upload lại.` };
    }

    const name = games.text(mod.name);
    const confirm = [];
    if (existing) {
      const when = existing.installedAt ? new Date(existing.installedAt).toLocaleString('vi-VN') : 'trước đó';
      confirm.push(`Game "${id}" (${games.text(existing.name)}) đã có, upload lúc ${when}. Ghi đè bằng bản mới?`);
    }
    const sameName = games.all().find(g => g.id !== id && games.text(g.name) === name);
    if (sameName) confirm.push(`Đã có game tên "${name}" (id ${sameName.id}), người chơi sẽ khó phân biệt. Vẫn cài?`);
    if (confirm.length && !force) {
      cleanup();
      return { ok: false, confirm };
    }

    fs.writeFileSync(path.join(tmp, '.installed.json'), JSON.stringify({ installedAt: Date.now() }));
    const dest = path.join(DIR, id);
    fs.rmSync(dest, { recursive: true, force: true });
    fs.renameSync(tmp, dest);
    games.reload();
    if (!games.get(id)) return { ok: false, error: 'Đã chép game nhưng nạp không được, xem log server.' };
    return { ok: true, id, name };
  } catch (err) {
    cleanup();
    return { ok: false, error: err.message };
  }
}

function remove(id) {
  const g = games.get(String(id));
  if (!g) return { ok: false, error: 'Không có game này.' };
  if (g.source !== 'installed') return { ok: false, error: 'Game có sẵn trong code, không xoá ở đây được.' };
  fs.rmSync(g.dir, { recursive: true, force: true });
  games.reload();
  return { ok: true };
}

module.exports = { enabled: () => !!PASSWORD, guard, list, install, remove };

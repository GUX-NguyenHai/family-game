// Danh sách game: TỰ TÌM mọi thư mục có service/index.js, không cần đăng ký tay.
//   games/<id>/            game có sẵn trong code (đi theo git, build vào Docker image)
//   games-installed/<id>/  game upload qua trang /admin (nằm ngoài git và image, build lại không mất)
// ORDER: thứ tự game có sẵn trên thanh chọn game. Game không có trong ORDER xếp sau theo id; game upload xếp cuối.
const fs = require('fs');
const path = require('path');

const ORDER = ['animal-race', 'boat-race', 'tug-of-war', 'coconut-climb', 'jump-rope', 'sack-race', 'ski-slalom'];
const INSTALLED_DIR = process.env.GAMES_INSTALLED_DIR || path.join(__dirname, '..', 'games-installed');

// Các thư mục con có service/index.js (bỏ thư mục ẩn, VD .upload-tạm).
function gameDirs(root) {
  let names = [];
  try {
    names = fs.readdirSync(root, { withFileTypes: true }).filter(d => d.isDirectory() && !d.name.startsWith('.')).map(d => d.name);
  } catch {
    return [];
  }
  return names.filter(n => fs.existsSync(path.join(root, n, 'service', 'index.js'))).map(n => path.join(root, n));
}

function rank(dir) {
  const i = ORDER.indexOf(path.basename(dir));
  return i < 0 ? ORDER.length : i;
}

// Game có sẵn: lỗi là lỗi code, để server báo ngay khi khởi động.
function builtin() {
  return gameDirs(__dirname)
    .sort((a, b) => rank(a) - rank(b) || path.basename(a).localeCompare(path.basename(b)))
    .map(dir => ({ dir, source: 'builtin', mod: require(path.join(dir, 'service')) }));
}

// Game upload: nạp lại từ đầu mỗi lần gọi (xoá bộ nhớ đệm require); game lỗi thì bỏ qua + ghi log.
function installed() {
  for (const key of Object.keys(require.cache)) if (key.startsWith(INSTALLED_DIR + path.sep)) delete require.cache[key];
  const out = [];
  for (const dir of gameDirs(INSTALLED_DIR).sort()) {
    try {
      let installedAt = null;
      try {
        installedAt = JSON.parse(fs.readFileSync(path.join(dir, '.installed.json'), 'utf8')).installedAt ?? null;
      } catch {}
      out.push({ dir, source: 'installed', installedAt, mod: require(path.join(dir, 'service')) });
    } catch (err) {
      console.warn(`⚠️  Bỏ qua game upload ${path.basename(dir)}: lỗi khi nạp (${err.message})`);
    }
  }
  return out;
}

module.exports = { builtin, installed, INSTALLED_DIR };

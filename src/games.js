// Đọc danh sách game (games/index.js tự tìm: game có sẵn + game upload qua /admin), kiểm tra khai báo,
// và các tiện ích về tuỳ chọn của game. reload() nạp lại game upload mà không cần khởi động lại server.
// Mỗi game được gắn thêm: dir (thư mục game), source ('builtin' | 'installed'), installedAt (game upload).
const C = require('./config');
const loader = require('../games');

let byId = new Map();

// Chữ do game khai báo: chuỗi hoặc { vi, en }. Lấy theo ngôn ngữ (mặc định tiếng Việt, dùng cho log/admin).
function text(value, lang = 'vi') {
  if (value && typeof value === 'object') return value[lang] ?? value.vi ?? value.en ?? Object.values(value)[0] ?? '';
  return value ?? '';
}

function problemOf(g) {
  if (!/^[a-z0-9-]+$/.test(g?.id || '')) return `thiếu id hợp lệ (chữ thường, số, dấu -): ${text(g?.name) || '?'}`;
  if (typeof g.createMatch !== 'function') return `game ${g.id} thiếu createMatch()`;
  return null;
}

function load() {
  const next = new Map();
  // Game có sẵn: sai là lỗi code, dừng server luôn để sửa.
  for (const { dir, source, mod } of loader.builtin()) {
    const problem = problemOf(mod);
    if (problem) throw new Error(`Game có sẵn ${problem}`);
    if (next.has(mod.id)) throw new Error(`Trùng id game: ${mod.id}`);
    next.set(mod.id, Object.assign(mod, { dir, source }));
  }
  // Game upload: sai hoặc trùng thì bỏ qua, ghi cảnh báo.
  for (const { dir, source, installedAt, mod } of loader.installed()) {
    const problem = problemOf(mod);
    if (problem) {
      console.warn(`⚠️  Bỏ qua game upload ở ${dir}: ${problem}`);
      continue;
    }
    if (next.has(mod.id)) {
      console.warn(`⚠️  Bỏ qua game upload "${mod.id}": trùng id với game có sẵn.`);
      continue;
    }
    const sameName = [...next.values()].find(g => text(g.name) === text(mod.name));
    if (sameName) console.warn(`⚠️  Game upload "${mod.id}" trùng tên "${text(mod.name)}" với game ${sameName.id}.`);
    next.set(mod.id, Object.assign(mod, { dir, source, installedAt }));
  }
  if (!next.size) throw new Error('Chưa có game nào trong games/');
  byId = next;
}
load();

// Nạp lại sau khi upload/xoá game ở /admin.
function reload() {
  load();
}

function get(id) {
  return byId.get(id) || null;
}

function all() {
  return [...byId.values()];
}

function defaultId() {
  return byId.has(C.DEFAULT_GAME) ? C.DEFAULT_GAME : byId.keys().next().value;
}

// Thông tin gửi cho màn hình chung để vẽ phần chọn game và tuỳ chọn.
function catalog() {
  return all().map(g => ({
    id: g.id,
    name: g.name,
    emoji: g.emoji || '🎮',
    description: g.description || '',
    category: g.category || 'other',
    maxPlayers: g.maxPlayers || C.PRO_MAX_PLAYERS,
    minPlayers: g.minPlayers || 1,
    bots: !!g.bots,
    sensors: !!g.sensors,
    teams: g.teams
      ? {
          min: g.teams.min || 1,
          max: g.teams.max || C.PRO_MAX_PLAYERS,
          count: Math.min(C.TEAMS.length, g.teams.count || C.TEAMS.length),
          equal: !!g.teams.equal,
        }
      : null,
    options: g.options || [],
  }));
}

// Game có chơi theo đội không (với tuỳ chọn đang chọn).
// Game khai báo teams: { min, max, count (số đội dùng, mặc định 4), equal (các đội phải bằng người), enabled(options) }.
function teamMode(game, options) {
  if (!game.teams) return false;
  return typeof game.teams.enabled === 'function' ? !!game.teams.enabled(options) : true;
}

function defaultOptions(game) {
  return Object.fromEntries((game.options || []).map(o => [o.key, o.default ?? o.choices[0]?.value]));
}

// Chỉ nhận giá trị có trong danh sách lựa chọn của game.
function isChoice(game, key, value) {
  const opt = (game.options || []).find(o => o.key === key);
  return !!opt && opt.choices.some(c => c.value === value);
}

// VD: { vi: "Độ khó: 🟢 Dễ", en: "Difficulty: 🟢 Easy" } để điện thoại hiện ở phòng chờ (điện thoại tự chọn thứ tiếng).
function optionsText(game, options) {
  return Object.fromEntries(
    C.LANGS.map(lang => [
      lang,
      (game.options || [])
        .map(o => {
          const c = o.choices.find(x => x.value === options[o.key]);
          return c ? `${text(o.label, lang)}: ${text(c.label, lang)}` : null;
        })
        .filter(Boolean)
        .join(' · '),
    ]),
  );
}

module.exports = { get, all, reload, defaultId, catalog, defaultOptions, isChoice, optionsText, teamMode, text, INSTALLED_DIR: loader.INSTALLED_DIR };

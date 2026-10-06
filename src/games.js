// Đọc danh sách game (games/index.js), kiểm tra khai báo, và các tiện ích về tuỳ chọn của game.
const C = require('./config');
const list = require('../games');

const byId = new Map();
for (const g of list) {
  if (!/^[a-z0-9-]+$/.test(g.id || '')) throw new Error(`Game thiếu id hợp lệ: ${g.name || '?'}`);
  if (byId.has(g.id)) throw new Error(`Trùng id game: ${g.id}`);
  if (typeof g.createMatch !== 'function') throw new Error(`Game ${g.id} thiếu createMatch()`);
  byId.set(g.id, g);
}
if (!byId.size) throw new Error('Chưa có game nào trong games/index.js');

function get(id) {
  return byId.get(id) || null;
}

function all() {
  return [...byId.values()];
}

function defaultId() {
  return byId.has(C.DEFAULT_GAME) ? C.DEFAULT_GAME : list[0].id;
}

// Thông tin gửi cho màn hình chung để vẽ phần chọn game và tuỳ chọn.
function catalog() {
  return all().map(g => ({
    id: g.id,
    name: g.name,
    emoji: g.emoji || '🎮',
    description: g.description || '',
    maxPlayers: g.maxPlayers || C.PRO_MAX_PLAYERS,
    minPlayers: g.minPlayers || 1,
    bots: !!g.bots,
    sensors: !!g.sensors,
    options: g.options || [],
  }));
}

function defaultOptions(game) {
  return Object.fromEntries((game.options || []).map(o => [o.key, o.default ?? o.choices[0]?.value]));
}

// Chỉ nhận giá trị có trong danh sách lựa chọn của game.
function isChoice(game, key, value) {
  const opt = (game.options || []).find(o => o.key === key);
  return !!opt && opt.choices.some(c => c.value === value);
}

// VD: "Độ khó: 🟢 Dễ" để điện thoại hiện ở phòng chờ.
function optionsText(game, options) {
  return (game.options || [])
    .map(o => {
      const c = o.choices.find(x => x.value === options[o.key]);
      return c ? `${o.label}: ${c.label}` : null;
    })
    .filter(Boolean)
    .join(' · ');
}

module.exports = { get, all, defaultId, catalog, defaultOptions, isChoice, optionsText };

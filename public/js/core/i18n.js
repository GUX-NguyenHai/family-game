// Ngôn ngữ giao diện (vi | en), dùng chung cho TV, điện thoại và các game.
// - Mỗi thiết bị tự chọn, nhớ trong máy (fg:lang). Lần đầu theo ngôn ngữ trình duyệt (tiếng Việt → vi, còn lại → en).
// - Link có ?lang=vi|en thì dùng luôn và nhớ (trang giới thiệu dẫn sang /host, /play kèm ngôn ngữ đang xem).
// - Chữ phần chung: /i18n/vi.json, /i18n/en.json (khoá phẳng, VD "host.players"). Chữ riêng của game:
//   games/<id>/assets/i18n.json { "vi": {...}, "en": {...} }, nạp bằng loadGameT(id).
// - Chữ do game khai báo ở server (tên, mô tả, lựa chọn, kết quả) có thể là chuỗi hoặc { vi, en }: dùng pick().
// - Đổi ngôn ngữ = tải lại trang (phòng chơi vẫn giữ trên server, TV và điện thoại tự vào lại).
import { store } from './util.js';

export const LANGS = ['vi', 'en'];

function detect() {
  const q = new URLSearchParams(location.search).get('lang');
  if (LANGS.includes(q)) {
    store.set('fg:lang', q);
    return q;
  }
  const saved = store.get('fg:lang', null);
  if (LANGS.includes(saved)) return saved;
  const prefs = navigator.languages?.length ? navigator.languages : [navigator.language || ''];
  return prefs.some(l => /^vi\b/i.test(l)) ? 'vi' : 'en';
}

export const lang = detect();
document.documentElement.lang = lang;

const load = url =>
  fetch(url)
    .then(r => (r.ok ? r.json() : {}))
    .catch(() => ({}));
// Thiếu chữ ở ngôn ngữ đang dùng thì lấy tiếng Việt (bản gốc), vẫn thiếu thì hiện luôn khoá.
const [coreMain, coreVi] = await Promise.all([load(`/i18n/${lang}.json`), lang === 'vi' ? {} : load('/i18n/vi.json')]);

function fill(text, params) {
  return params ? String(text).replace(/\{(\w+)\}/g, (m, k) => (params[k] ?? m)) : String(text);
}

// Tạo hàm t() tra lần lượt trong các bộ từ điển (đầu tiên là ưu tiên nhất).
function makeT(...dicts) {
  return (key, params) => {
    for (const d of dicts) if (d && key in d) return fill(d[key], params);
    return key;
  };
}

// t('host.players') → "Người chơi" / "Players"; t('tier.free', { n: 4 }) điền {n}.
export const t = makeT(coreMain, coreVi);

// Chữ có thể là chuỗi (một thứ tiếng) hoặc { vi, en }: lấy đúng ngôn ngữ đang dùng.
export function pick(value) {
  if (value && typeof value === 'object') return value[lang] ?? value.vi ?? value.en ?? Object.values(value)[0] ?? '';
  return value ?? '';
}

// Từ điển riêng của game (games/<id>/assets/i18n.json). Không có file thì chỉ dùng chữ phần chung.
export async function loadGameT(id) {
  const all = await load(`/games/${id}/assets/i18n.json`);
  return makeT(all[lang], all.vi, coreMain, coreVi);
}

export function setLang(next) {
  if (!LANGS.includes(next) || next === lang) return;
  store.set('fg:lang', next);
  const url = new URL(location.href);
  url.searchParams.delete('lang');
  location.replace(url.toString());
}

// Nút đổi ngôn ngữ: hiện ngôn ngữ sẽ đổi sang (đang tiếng Việt thì hiện "🇬🇧 EN").
export function bindLangButton(btn) {
  if (!btn) return;
  btn.textContent = t('lang.switch');
  btn.title = t('lang.title');
  btn.onclick = () => setLang(lang === 'vi' ? 'en' : 'vi');
}

// Điền chữ cho HTML tĩnh: data-i18n (nội dung), data-i18n-placeholder, data-i18n-title, data-i18n-alt, data-i18n-aria.
export function applyDom(root = document) {
  for (const el of root.querySelectorAll('[data-i18n]')) el.textContent = t(el.dataset.i18n);
  for (const el of root.querySelectorAll('[data-i18n-placeholder]')) el.placeholder = t(el.dataset.i18nPlaceholder);
  for (const el of root.querySelectorAll('[data-i18n-title]')) el.title = t(el.dataset.i18nTitle);
  for (const el of root.querySelectorAll('[data-i18n-alt]')) el.alt = t(el.dataset.i18nAlt);
  for (const el of root.querySelectorAll('[data-i18n-aria]')) el.setAttribute('aria-label', t(el.dataset.i18nAria));
}

export function formatDate(ms) {
  return new Date(ms).toLocaleDateString(lang === 'vi' ? 'vi-VN' : 'en-GB');
}

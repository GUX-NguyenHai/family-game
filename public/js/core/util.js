// Tiện ích dùng chung cho màn hình chính, điện thoại và các game.

export const $ = sel => document.querySelector(sel);

export function esc(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

function makeStore(storage) {
  return {
    get(key, fallback) {
      try {
        const v = storage().getItem(key);
        return v === null ? fallback : JSON.parse(v);
      } catch {
        return fallback;
      }
    },
    set(key, value) {
      try {
        storage().setItem(key, JSON.stringify(value));
      } catch {}
    },
  };
}

export const store = makeStore(() => localStorage);
export const session = makeStore(() => sessionStorage);

export function vibrate(pattern) {
  try {
    navigator.vibrate?.(pattern);
  } catch {}
}

// Nạp CSS của game; trả về hàm gỡ CSS khi đổi game.
export function loadCss(href) {
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = href;
  document.head.append(link);
  return () => link.remove();
}

// Server vừa được cập nhật (khác phiên bản lúc mở trang) thì tải lại để dùng code mới; hiện số phiên bản.
export function watchVersion(socket) {
  let buildId = null;
  socket.on('hello', ({ build, version } = {}) => {
    if (buildId && build && build !== buildId) location.reload();
    buildId = build;
    const v = $('#appVersion');
    if (v) v.textContent = version ? `version ${version}` : '';
  });
}

export const MEDALS = ['🥇', '🥈', '🥉'];

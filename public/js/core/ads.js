// Quảng cáo Google AdSense ở phòng chờ (TV và điện thoại), dùng chung cho host.js và play.js.
// - Server cho biết mã qua /api/ads (đặt trong .env). Chưa có mã thì không hiện gì, không tải gì của Google.
// - Mã quảng cáo của Google chỉ tải lần đầu vào phòng chờ, nên lúc chơi trang vẫn nhẹ.
// - Quy định AdSense: không tự làm mới quảng cáo. Ô quảng cáo chỉ tạo mới khi người dùng vừa vào lại
//   phòng chờ (bắt đầu chơi thì gỡ ô, chơi xong về phòng chờ thì tạo ô mới).
const SCRIPT = 'https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js';
let configPromise = null;
let scriptAdded = false;

function loadConfig() {
  configPromise ??= fetch('/api/ads')
    .then(r => (r.ok ? r.json() : null))
    .catch(() => null);
  return configPromise;
}

function addScript(client) {
  if (scriptAdded) return;
  scriptAdded = true;
  const s = document.createElement('script');
  s.async = true;
  s.src = `${SCRIPT}?client=${encodeURIComponent(client)}`;
  s.crossOrigin = 'anonymous';
  document.head.append(s);
}

// box: phần tử chứa ô quảng cáo (để trống, hidden); kind: 'host' (TV) | 'play' (điện thoại).
// Trả về { show(), hide() }: gọi show() mỗi lần đang ở phòng chờ (gọi lặp lại không sao), hide() khi rời phòng chờ.
export function adSlot(box, kind) {
  let shown = false;
  let token = 0;
  return {
    async show() {
      if (shown) return;
      shown = true;
      const my = ++token;
      const c = await loadConfig();
      if (my !== token || !c?.client || !c.slots?.[kind]) return; // đã rời phòng chờ hoặc chưa có mã
      addScript(c.client);
      // client và slot đã được server kiểm tra đúng dạng (chỉ chữ số và "ca-pub-").
      box.innerHTML = `<small>Quảng cáo</small>
        <ins class="adsbygoogle" style="display:block" data-ad-client="${c.client}" data-ad-slot="${c.slots[kind]}"
          data-ad-format="auto" data-full-width-responsive="true"></ins>`;
      box.hidden = false;
      try {
        (window.adsbygoogle = window.adsbygoogle || []).push({});
      } catch {}
    },
    hide() {
      if (!shown) return;
      shown = false;
      token++;
      box.innerHTML = '';
      box.hidden = true;
    },
  };
}

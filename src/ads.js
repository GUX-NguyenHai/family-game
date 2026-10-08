// Quảng cáo Google AdSense: đọc mã từ biến môi trường (.env cạnh docker-compose.yml, không đưa lên git).
//   ADSENSE_CLIENT     mã nhà xuất bản, dạng ca-pub-1234567890123456
//   ADSENSE_SLOT_HOST  mã đơn vị quảng cáo ở phòng chờ trên TV (chỉ số)
//   ADSENSE_SLOT_PLAY  mã đơn vị quảng cáo ở phòng chờ trên điện thoại (chỉ số)
// Thiếu hoặc sai dạng thì tắt: trang không hiện ô quảng cáo, không tải gì của Google.

function clean(value, pattern) {
  const v = String(value || '').trim();
  return pattern.test(v) ? v : '';
}

const client = clean(process.env.ADSENSE_CLIENT, /^ca-pub-\d{10,20}$/);
const slots = {
  host: clean(process.env.ADSENSE_SLOT_HOST, /^\d{5,20}$/),
  play: clean(process.env.ADSENSE_SLOT_PLAY, /^\d{5,20}$/),
};

// Gửi cho trình duyệt (/api/ads): chỉ những gì cần để vẽ ô quảng cáo.
function publicConfig() {
  return client ? { client, slots } : { client: '', slots: {} };
}

// Nội dung /ads.txt: Google dùng để xác nhận trang này được phép hiện quảng cáo của tài khoản.
function adsTxt() {
  return client ? `google.com, ${client.replace(/^ca-/, '')}, DIRECT, f08c47fec0942fa0\n` : null;
}

// Thẻ <script> AdSense cho <head> của trang giới thiệu (Google kiểm tra thẻ này lúc duyệt trang).
function headTag() {
  return client
    ? `<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${client}" crossorigin="anonymous"></script>`
    : '';
}

module.exports = { enabled: () => !!client, publicConfig, adsTxt, headTag };

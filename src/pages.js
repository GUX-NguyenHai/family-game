// Trang giới thiệu (/) và chính sách bảo mật (/privacy), dựng sẵn HTML trên server
// (danh sách game lấy từ khai báo của từng game) để người xem và Google đọc được ngay, không cần chạy JS.
// Liên hệ: biến môi trường CONTACT_EMAIL (tuỳ chọn, đặt trong .env), trống thì không hiện.
const C = require('./config');
const games = require('./games');
const ads = require('./ads');

function esc(text) {
  return String(text ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
}

const CONTACT = /^[^\s@<>"']+@[^\s@<>"']+\.[^\s@<>"']+$/.test(process.env.CONTACT_EMAIL || '') ? process.env.CONTACT_EMAIL : '';

const STYLE = `
  :root { font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; color-scheme: dark; }
  * { box-sizing: border-box; }
  body { margin: 0; background: #141a2a; color: #f5f7fb; line-height: 1.55; }
  main { max-width: 960px; margin: 0 auto; padding: 32px 16px 48px; }
  h1 { font-size: clamp(2rem, 6vw, 3rem); margin: 0 0 6px; }
  h2 { margin: 40px 0 12px; }
  p, li { color: #c7cfe0; }
  a { color: #ffb020; }
  .lead { font-size: 1.15rem; color: #dde3f0; }
  .cta { display: flex; flex-wrap: wrap; gap: 12px; margin-top: 20px; }
  .cta a { padding: 14px 20px; border-radius: 14px; font-weight: 700; text-decoration: none; color: #f5f7fb; background: rgba(255, 255, 255, 0.12); }
  .cta a.primary { background: #ffb020; color: #1b1300; }
  .steps { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 12px; padding: 0; list-style: none; counter-reset: s; }
  .steps li { counter-increment: s; padding: 16px; border-radius: 14px; background: rgba(255, 255, 255, 0.06); }
  .steps li::before { content: counter(s); display: inline-grid; place-items: center; width: 28px; height: 28px; margin-right: 8px; border-radius: 50%; background: #ffb020; color: #1b1300; font-weight: 800; }
  .games { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 12px; }
  .game { padding: 16px; border-radius: 14px; background: rgba(255, 255, 255, 0.06); }
  .game h3 { margin: 0 0 4px; font-size: 1.2rem; }
  .game .emoji { font-size: 1.6rem; margin-right: 6px; }
  .game p { margin: 8px 0 0; }
  .tags { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; }
  .tags span { padding: 2px 8px; border-radius: 99px; background: rgba(255, 255, 255, 0.1); font-size: 0.8rem; color: #a9b3c7; }
  footer { margin-top: 48px; padding-top: 16px; border-top: 1px solid rgba(255, 255, 255, 0.1); font-size: 0.9rem; color: #8b95ab; }
`;

function layout(title, description, body) {
  return `<!doctype html>
<html lang="vi">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${esc(title)}</title>
  <meta name="description" content="${esc(description)}">
  ${ads.headTag()}
  <style>${STYLE}</style>
</head>
<body>
  <main>
${body}
    <footer>
      <a href="/">Trang chủ</a> · <a href="/privacy">Chính sách bảo mật</a>${CONTACT ? ` · Liên hệ: <a href="mailto:${esc(CONTACT)}">${esc(CONTACT)}</a>` : ''}
      · version ${esc(C.APP_VERSION)}
    </footer>
  </main>
</body>
</html>`;
}

function gameCard(g, categoryName) {
  const tags = [categoryName, g.minPlayers > 1 ? `${g.minPlayers}–${g.maxPlayers} người` : `1–${g.maxPlayers} người`];
  if (g.sensors) tags.push('Điều khiển bằng cử động điện thoại');
  if (g.teams) tags.push('Có chơi theo đội');
  if (g.bots) tags.push('Có bot chơi cùng');
  return `<article class="game">
        <h3><span class="emoji">${esc(g.emoji)}</span>${esc(g.name)}</h3>
        <p>${esc(g.description)}</p>
        <div class="tags">${tags.map(t => `<span>${esc(t)}</span>`).join('')}</div>
      </article>`;
}

function landing() {
  const categoryName = new Map(C.GAME_CATEGORIES.map(c => [c.id, `${c.emoji} ${c.name}`]));
  const list = games.catalog();
  const description = `Trò chơi vận động cho cả nhà: TV hoặc laptop làm màn hình chung, điện thoại làm tay cầm. ${list.map(g => g.name).join(', ')}.`;
  return layout(
    'Party Game – Trò chơi cả nhà trên TV, điện thoại làm tay cầm',
    description,
    `    <h1>🎮 Party Game</h1>
    <p class="lead">Trò chơi cho cả nhà và nhóm bạn: mở trang trên <b>TV hoặc laptop</b> làm màn hình chung, mọi người <b>quét mã QR bằng điện thoại</b> rồi dùng điện thoại làm tay cầm. Không cần cài ứng dụng, không cần tài khoản.</p>
    <div class="cta">
      <a class="primary" href="/host">📺 Tạo phòng (mở trên TV/laptop)</a>
      <a href="/play">📱 Vào chơi bằng mã phòng</a>
    </div>

    <h2>Cách chơi</h2>
    <ol class="steps">
      <li><b>Mở màn hình chung.</b> Trên TV thông minh, laptop hoặc máy tính nối TV, mở trang này và bấm "Tạo phòng". Màn hình hiện mã QR và mã phòng 4 chữ.</li>
      <li><b>Mọi người vào phòng.</b> Mỗi người quét mã QR bằng điện thoại, nhập tên và chọn một con vật làm nhân vật.</li>
      <li><b>Chọn game và bắt đầu.</b> Chủ phòng chọn trò chơi, độ khó rồi bấm Bắt đầu. Đổi game không cần quét lại mã.</li>
      <li><b>Chơi bằng cử động.</b> Phần lớn các game điều khiển bằng cách lắc, nghiêng hoặc hất điện thoại. Ít người thì thêm bot cho vui.</li>
    </ol>

    <h2>Các trò chơi</h2>
    <div class="games">
      ${list.map(g => gameCard(g, categoryName.get(g.category) || '🎮 Khác')).join('\n      ')}
    </div>

    <h2>Cần chuẩn bị gì</h2>
    <ul>
      <li>Một màn hình chung có trình duyệt web: TV thông minh, laptop, máy tính nối TV hoặc máy chiếu.</li>
      <li>Mỗi người một điện thoại Android hoặc iPhone có trình duyệt. Game vận động cần cảm biến chuyển động (hầu hết điện thoại đều có); iPhone sẽ hỏi quyền dùng cảm biến lần đầu.</li>
      <li>Điện thoại và màn hình chung đều cần kết nối Internet.</li>
    </ul>

    <h2>Câu hỏi thường gặp</h2>
    <p><b>Có mất phí không?</b> Chơi miễn phí với tối đa ${C.FREE_MAX_PLAYERS} người một phòng (tính cả bot). Phòng có mã Pro chơi được tới ${C.PRO_MAX_PLAYERS} người.</p>
    <p><b>Có phải tạo tài khoản không?</b> Không. Chỉ cần nhập tên hiển thị khi vào phòng.</p>
    <p><b>Game có lưu thông tin của tôi không?</b> Không có cơ sở dữ liệu: phòng chơi chỉ tồn tại trong lúc chơi rồi tự xoá. Xem <a href="/privacy">Chính sách bảo mật</a>.</p>
    <p><b>Chơi ở xa nhau được không?</b> Được, miễn mọi người nhìn thấy màn hình chung (ví dụ chia sẻ màn hình qua cuộc gọi video), nhưng vui nhất là chơi cùng một phòng.</p>`,
  );
}

function privacy() {
  return layout(
    'Chính sách bảo mật – Party Game',
    'Party Game thu thập những gì, lưu ở đâu, quảng cáo và cookie.',
    `    <h1>Chính sách bảo mật</h1>
    <p class="lead">Party Game được làm để chơi ngay, không cần tài khoản và lưu ít thông tin nhất có thể.</p>

    <h2>Thông tin chúng tôi xử lý</h2>
    <ul>
      <li><b>Tên hiển thị và con vật bạn chọn</b> khi vào phòng, để hiện trên màn hình chung và bảng kết quả.</li>
      <li><b>Thao tác trong game</b> (mức lắc, cử chỉ nhảy, độ nghiêng của điện thoại) được gửi lên máy chủ trong lúc chơi để tính kết quả. Không ghi âm, không chụp ảnh, không lấy vị trí.</li>
      <li>Những thông tin trên <b>chỉ nằm trong bộ nhớ tạm của máy chủ</b> khi phòng còn mở. Máy chủ không có cơ sở dữ liệu; phòng đóng hoặc máy chủ khởi động lại là mất hết.</li>
      <li><b>Trên chính thiết bị của bạn</b>, trình duyệt nhớ tên, con vật, độ nhạy cảm biến và lựa chọn đồ hoạ (bộ nhớ cục bộ của trình duyệt) để lần sau khỏi nhập lại. Bạn xoá được bằng cách xoá dữ liệu trang web trong trình duyệt.</li>
      <li>Máy chủ có thể ghi nhật ký kỹ thuật ngắn hạn (lỗi, số phòng) để vận hành; không dùng để nhận diện người chơi.</li>
    </ul>

    <h2>Quảng cáo và cookie</h2>
    <p>Phòng chờ có thể hiện quảng cáo của <b>Google AdSense</b>. Google và các đối tác dùng cookie hoặc dữ liệu thiết bị để hiện quảng cáo, đo lường và (nếu bạn đồng ý) cá nhân hoá quảng cáo dựa trên các lần bạn truy cập trang này và trang khác.</p>
    <ul>
      <li>Tìm hiểu cách Google dùng dữ liệu: <a href="https://policies.google.com/technologies/partner-sites" rel="noopener">policies.google.com/technologies/partner-sites</a>.</li>
      <li>Tắt quảng cáo cá nhân hoá: <a href="https://adssettings.google.com" rel="noopener">adssettings.google.com</a>.</li>
      <li>Người dùng ở Khu vực Kinh tế Châu Âu, Vương quốc Anh và Thuỵ Sĩ sẽ được hỏi đồng ý trước khi dùng cookie quảng cáo, và có thể đổi lựa chọn bất cứ lúc nào.</li>
    </ul>
    <p>Quảng cáo chỉ hiện ở phòng chờ, không hiện trong lúc chơi.</p>

    <h2>Trẻ em</h2>
    <p>Game dành cho cả gia đình. Chúng tôi không cố ý thu thập thông tin cá nhân của trẻ em; tên hiển thị có thể là biệt danh bất kỳ.</p>

    <h2>Thay đổi</h2>
    <p>Chính sách có thể được cập nhật khi game thay đổi. Bản mới nhất luôn ở trang này.</p>`,
  );
}

module.exports = { landing, privacy };

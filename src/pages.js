// Trang giới thiệu (/) và chính sách bảo mật (/privacy), dựng sẵn HTML trên server, 2 thứ tiếng (vi | en)
// (danh sách game lấy từ khai báo của từng game) để người xem và Google đọc được ngay, không cần chạy JS.
// Ngôn ngữ: ?lang=vi|en, không có thì theo Accept-Language của trình duyệt (xem langOf()).
// Liên hệ: biến môi trường CONTACT_EMAIL (tuỳ chọn, đặt trong .env), trống thì không hiện.
const C = require('./config');
const games = require('./games');
const ads = require('./ads');

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
}

const CONTACT = /^[^\s@<>"']+@[^\s@<>"']+\.[^\s@<>"']+$/.test(process.env.CONTACT_EMAIL || '') ? process.env.CONTACT_EMAIL : '';

// Ngôn ngữ của yêu cầu: ?lang=… trước, rồi tới ngôn ngữ trình duyệt (vi → vi, còn lại → en).
function langOf(req) {
  const q = String(req.query.lang || '');
  if (C.LANGS.includes(q)) return q;
  return /(^|,)\s*vi\b/i.test(req.get('accept-language') || '') ? 'vi' : 'en';
}

const CATEGORY_NAMES = {
  vi: { motion: 'Vận động', reflex: 'Phản xạ', mind: 'Trí tuệ', secret: 'Bí mật', folk: 'Dân gian', other: 'Khác' },
  en: { motion: 'Active', reflex: 'Reflex', mind: 'Brain', secret: 'Secret', folk: 'Folk', other: 'Other' },
};

const UI = {
  vi: {
    home: 'Trang chủ',
    privacy: 'Chính sách bảo mật',
    contact: 'Liên hệ',
    switchTo: '🇬🇧 English',
    players: (min, max) => `${min}–${max} người`,
    motion: 'Điều khiển bằng cử động điện thoại',
    teams: 'Có chơi theo đội',
    bots: 'Có bot chơi cùng',
  },
  en: {
    home: 'Home',
    privacy: 'Privacy policy',
    contact: 'Contact',
    switchTo: '🇻🇳 Tiếng Việt',
    players: (min, max) => `${min}–${max} players`,
    motion: 'Controlled by moving your phone',
    teams: 'Team play',
    bots: 'Bots can join',
  },
};

const STYLE = `
  :root { font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; color-scheme: dark; }
  * { box-sizing: border-box; }
  body { margin: 0; background: #141a2a; color: #f5f7fb; line-height: 1.55; }
  main { max-width: 960px; margin: 0 auto; padding: 32px 16px 48px; position: relative; }
  h1 { font-size: clamp(2rem, 6vw, 3rem); margin: 0 0 6px; }
  h2 { margin: 40px 0 12px; }
  p, li { color: #c7cfe0; }
  a { color: #ffb020; }
  .lang { position: absolute; top: 16px; right: 16px; padding: 6px 12px; border-radius: 10px; background: rgba(255, 255, 255, 0.12); color: #f5f7fb; text-decoration: none; font-weight: 600; }
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

function layout(lang, path, title, description, body) {
  const ui = UI[lang];
  const other = lang === 'vi' ? 'en' : 'vi';
  return `<!doctype html>
<html lang="${lang}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${esc(title)}</title>
  <meta name="description" content="${esc(description)}">
  <link rel="alternate" hreflang="vi" href="${path}?lang=vi">
  <link rel="alternate" hreflang="en" href="${path}?lang=en">
  ${ads.headTag()}
  <style>${STYLE}</style>
</head>
<body>
  <main>
    <a class="lang" href="${path}?lang=${other}">${ui.switchTo}</a>
${body}
    <footer>
      <a href="/?lang=${lang}">${ui.home}</a> · <a href="/privacy?lang=${lang}">${ui.privacy}</a>${CONTACT ? ` · ${ui.contact}: <a href="mailto:${esc(CONTACT)}">${esc(CONTACT)}</a>` : ''}
      · version ${esc(C.APP_VERSION)}
    </footer>
  </main>
</body>
</html>`;
}

function gameCard(g, lang) {
  const ui = UI[lang];
  const cat = CATEGORY_NAMES[lang][g.category] || CATEGORY_NAMES[lang].other;
  const emoji = (C.GAME_CATEGORIES.find(c => c.id === g.category) || { emoji: '🎮' }).emoji;
  const tags = [`${emoji} ${cat}`, ui.players(g.minPlayers > 1 ? g.minPlayers : 1, g.maxPlayers)];
  if (g.sensors) tags.push(ui.motion);
  if (g.teams) tags.push(ui.teams);
  if (g.bots) tags.push(ui.bots);
  return `<article class="game">
        <h3><span class="emoji">${esc(g.emoji)}</span>${esc(games.text(g.name, lang))}</h3>
        <p>${esc(games.text(g.description, lang))}</p>
        <div class="tags">${tags.map(tag => `<span>${esc(tag)}</span>`).join('')}</div>
      </article>`;
}

const LANDING = {
  vi: list => ({
    title: 'Party Game – Trò chơi cả nhà trên TV, điện thoại làm tay cầm',
    description: `Trò chơi vận động cho cả nhà: TV hoặc laptop làm màn hình chung, điện thoại làm tay cầm. ${list}.`,
    body: cards => `    <h1>🎮 Party Game</h1>
    <p class="lead">Trò chơi cho cả nhà và nhóm bạn: mở trang trên <b>TV hoặc laptop</b> làm màn hình chung, mọi người <b>quét mã QR bằng điện thoại</b> rồi dùng điện thoại làm tay cầm. Không cần cài ứng dụng, không cần tài khoản.</p>
    <div class="cta">
      <a class="primary" href="/host?lang=vi">📺 Tạo phòng (mở trên TV/laptop)</a>
      <a href="/play?lang=vi">📱 Vào chơi bằng mã phòng</a>
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
      ${cards}
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
    <p><b>Game có lưu thông tin của tôi không?</b> Không có cơ sở dữ liệu: phòng chơi chỉ tồn tại trong lúc chơi rồi tự xoá. Xem <a href="/privacy?lang=vi">Chính sách bảo mật</a>.</p>
    <p><b>Có tiếng Anh không?</b> Có. Mỗi thiết bị tự chọn ngôn ngữ (nút 🇬🇧 / 🇻🇳), nên người trong phòng có thể dùng thứ tiếng khác nhau.</p>`,
  }),
  en: list => ({
    title: 'Party Game – Family games on your TV, phones as controllers',
    description: `Active party games for the whole family: a TV or laptop is the big screen, phones are the controllers. ${list}.`,
    body: cards => `    <h1>🎮 Party Game</h1>
    <p class="lead">Games for families and friends: open this site on a <b>TV or laptop</b> as the big screen, everyone <b>scans the QR code with their phone</b> and uses it as a controller. No app to install, no account needed.</p>
    <div class="cta">
      <a class="primary" href="/host?lang=en">📺 Create a room (on a TV/laptop)</a>
      <a href="/play?lang=en">📱 Join with a room code</a>
    </div>

    <h2>How it works</h2>
    <ol class="steps">
      <li><b>Open the big screen.</b> On a smart TV, laptop or a computer connected to a TV, open this site and press "Create a room". It shows a QR code and a 4-letter room code.</li>
      <li><b>Everyone joins.</b> Each player scans the QR code with their phone, types a name and picks an animal.</li>
      <li><b>Pick a game and start.</b> The host picks a game and a difficulty, then presses Start. Switching games doesn't need a new scan.</li>
      <li><b>Play by moving.</b> Most games are played by shaking, tilting or flicking your phone. Few players? Add bots for fun.</li>
    </ol>

    <h2>Games</h2>
    <div class="games">
      ${cards}
    </div>

    <h2>What you need</h2>
    <ul>
      <li>A shared screen with a web browser: smart TV, laptop, a computer connected to a TV, or a projector.</li>
      <li>One Android phone or iPhone per player with a browser. Motion games need motion sensors (almost every phone has them); iPhones ask for permission the first time.</li>
      <li>The phones and the big screen need an Internet connection.</li>
    </ul>

    <h2>FAQ</h2>
    <p><b>Is it free?</b> Free rooms allow up to ${C.FREE_MAX_PLAYERS} players (bots included). Rooms with a Pro code allow up to ${C.PRO_MAX_PLAYERS} players.</p>
    <p><b>Do I need an account?</b> No. Just type a display name when you join.</p>
    <p><b>Do you store my data?</b> There is no database: a room only exists while you play and is deleted afterwards. See the <a href="/privacy?lang=en">Privacy policy</a>.</p>
    <p><b>Is it available in Vietnamese?</b> Yes. Each device picks its own language (🇬🇧 / 🇻🇳 button), so players in the same room can use different languages.</p>`,
  }),
};

function landing(lang) {
  const list = games.catalog();
  const page = LANDING[lang](list.map(g => games.text(g.name, lang)).join(', '));
  return layout(lang, '/', page.title, page.description, page.body(list.map(g => gameCard(g, lang)).join('\n      ')));
}

const PRIVACY = {
  vi: {
    title: 'Chính sách bảo mật – Party Game',
    description: 'Party Game thu thập những gì, lưu ở đâu, quảng cáo và cookie.',
    body: `    <h1>Chính sách bảo mật</h1>
    <p class="lead">Party Game được làm để chơi ngay, không cần tài khoản và lưu ít thông tin nhất có thể.</p>

    <h2>Thông tin chúng tôi xử lý</h2>
    <ul>
      <li><b>Tên hiển thị và con vật bạn chọn</b> khi vào phòng, để hiện trên màn hình chung và bảng kết quả.</li>
      <li><b>Thao tác trong game</b> (mức lắc, cử chỉ nhảy, độ nghiêng của điện thoại) được gửi lên máy chủ trong lúc chơi để tính kết quả. Không ghi âm, không chụp ảnh, không lấy vị trí.</li>
      <li>Những thông tin trên <b>chỉ nằm trong bộ nhớ tạm của máy chủ</b> khi phòng còn mở. Máy chủ không có cơ sở dữ liệu; phòng đóng hoặc máy chủ khởi động lại là mất hết.</li>
      <li><b>Trên chính thiết bị của bạn</b>, trình duyệt nhớ tên, con vật, ngôn ngữ, độ nhạy cảm biến và lựa chọn đồ hoạ (bộ nhớ cục bộ của trình duyệt) để lần sau khỏi nhập lại. Bạn xoá được bằng cách xoá dữ liệu trang web trong trình duyệt.</li>
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
  },
  en: {
    title: 'Privacy policy – Party Game',
    description: 'What Party Game collects, where it is stored, ads and cookies.',
    body: `    <h1>Privacy policy</h1>
    <p class="lead">Party Game is built to play instantly, with no account, storing as little as possible.</p>

    <h2>What we process</h2>
    <ul>
      <li><b>The display name and animal you pick</b> when joining, to show on the big screen and the results.</li>
      <li><b>Game input</b> (shake level, jump gestures, phone tilt) is sent to the server while playing to compute results. No audio, no photos, no location.</li>
      <li>This information <b>only lives in the server's temporary memory</b> while the room is open. There is no database; when the room closes or the server restarts, it's gone.</li>
      <li><b>On your own device</b>, the browser remembers your name, animal, language, sensor sensitivity and graphics setting (browser local storage) so you don't have to type them again. You can remove them by clearing this site's data in your browser.</li>
      <li>The server may keep short-term technical logs (errors, number of rooms) to run the service; they are not used to identify players.</li>
    </ul>

    <h2>Ads and cookies</h2>
    <p>The lobby may show ads from <b>Google AdSense</b>. Google and its partners use cookies or device data to serve ads, measure them and (if you agree) personalise them based on your visits to this and other sites.</p>
    <ul>
      <li>How Google uses data: <a href="https://policies.google.com/technologies/partner-sites" rel="noopener">policies.google.com/technologies/partner-sites</a>.</li>
      <li>Turn off personalised ads: <a href="https://adssettings.google.com" rel="noopener">adssettings.google.com</a>.</li>
      <li>Users in the European Economic Area, the UK and Switzerland are asked for consent before advertising cookies are used, and can change their choice at any time.</li>
    </ul>
    <p>Ads only appear in the lobby, never during a game.</p>

    <h2>Children</h2>
    <p>The games are made for the whole family. We don't knowingly collect personal information from children; a display name can be any nickname.</p>

    <h2>Changes</h2>
    <p>This policy may be updated as the games change. The latest version is always on this page.</p>`,
  },
};

function privacy(lang) {
  const page = PRIVACY[lang];
  return layout(lang, '/privacy', page.title, page.description, page.body);
}

module.exports = { landing, privacy, langOf };

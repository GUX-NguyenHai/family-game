const path = require('path');
// Chạy local (npm run dev): đọc biến môi trường từ .env cạnh file này, phải trước khi nạp src/ (đọc env lúc nạp).
// Trên Docker không có file này trong image, biến môi trường do docker-compose đưa vào.
try {
  process.loadEnvFile?.(path.join(__dirname, '.env'));
} catch {}
const http = require('http');
const os = require('os');
const express = require('express');
const { Server } = require('socket.io');
const QRCode = require('qrcode');
const rooms = require('./src/rooms');
const games = require('./src/games');
const license = require('./src/license');
const ads = require('./src/ads');
const pages = require('./src/pages');
const admin = require('./src/admin');
const C = require('./src/config');
const { APP_VERSION } = C;

const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || '0.0.0.0';

const app = express();
app.disable('x-powered-by');
const server = http.createServer(app);
const io = new Server(server, { pingInterval: 10000, pingTimeout: 8000 });

// Mỗi lần server khởi động, hoặc vừa upload/xoá game ở /admin, có mã phiên bản mới. Trang đang mở kết nối lại
// (hoặc nhận 'hello' mới) mà thấy khác mã thì tự tải lại, để không chạy code giao diện cũ.
let BUILD_ID = Date.now().toString(36);
io.on('connection', socket => socket.emit('hello', { build: BUILD_ID, version: APP_VERSION }));

// Trang giới thiệu + chính sách bảo mật: HTML 2 thứ tiếng dựng trên server (xem src/pages.js), dựng sẵn mỗi thứ tiếng
// một bản; trang giới thiệu dựng lại khi danh sách game đổi.
const buildPages = render => Object.fromEntries(C.LANGS.map(lang => [lang, render(lang)]));
let landingHtml = buildPages(pages.landing);
const privacyHtml = buildPages(pages.privacy);
function sendPage(cache) {
  return (req, res) => res.type('html').setHeader('Cache-Control', 'no-cache').setHeader('Vary', 'Accept-Language').send(cache()[pages.langOf(req)]);
}
app.get('/', sendPage(() => landingHtml));
app.get('/privacy', sendPage(() => privacyHtml));

// ---------- Quản trị: upload/xoá game (/admin, mật khẩu ADMIN_PASSWORD trong .env, xem src/admin.js) ----------
// Sau khi đổi game: dựng lại trang giới thiệu + bảo mọi trang đang mở tải lại (phòng chơi vẫn giữ nguyên trong RAM).
function gamesChanged() {
  landingHtml = buildPages(pages.landing);
  BUILD_ID = Date.now().toString(36);
  io.emit('hello', { build: BUILD_ID, version: APP_VERSION });
}
app.get('/admin/api/games', admin.guard, (req, res) => res.json({ games: admin.list() }));
app.post('/admin/api/upload', admin.guard, express.raw({ type: () => true, limit: '60mb' }), (req, res) => {
  if (!Buffer.isBuffer(req.body) || !req.body.length) return res.status(400).json({ ok: false, error: 'Chưa chọn file.' });
  const result = admin.install(req.body, req.query.force === '1');
  if (result.ok) {
    console.log(`📦 Đã cài game ${result.id} (${games.text(result.name)}) qua /admin`);
    gamesChanged();
  }
  res.json(result);
});
app.delete('/admin/api/games/:id', admin.guard, (req, res) => {
  const result = admin.remove(req.params.id);
  if (result.ok) {
    console.log(`🗑️  Đã xoá game ${req.params.id} qua /admin`);
    gamesChanged();
  }
  res.json(result);
});

// Quảng cáo Google AdSense (mã đặt trong .env, xem src/ads.js). Chưa có mã thì /ads.txt trả 404.
app.get('/api/ads', (req, res) => res.json(ads.publicConfig()));
app.get('/ads.txt', (req, res) => {
  const txt = ads.adsTxt();
  if (!txt) return res.status(404).end();
  res.type('text/plain').send(txt);
});

// HTML/JS/CSS của game: bắt trình duyệt luôn hỏi lại server (không dùng bản cũ trong bộ nhớ đệm).
app.use(
  express.static(path.join(__dirname, 'public'), {
    extensions: ['html'],
    index: false, // trang "/" do route ở trên lo
    setHeaders: res => res.setHeader('Cache-Control', 'no-cache'),
  }),
);
// Giao diện riêng của từng game: chỉ mở thư mục screen/, controller/ và assets/ (luật chơi trong service/ không ra ngoài).
// Tra theo danh sách game hiện tại (kể cả game vừa upload ở /admin), nên không cần khởi động lại server.
const GAME_SIDES = new Set(['screen', 'controller', 'assets']);
const gameStatic = new Map(); // thư mục → middleware express.static
app.use('/games/:id/:side', (req, res, next) => {
  const g = games.get(req.params.id);
  if (!g || !GAME_SIDES.has(req.params.side)) return next();
  const dir = path.join(g.dir, req.params.side);
  let serve = gameStatic.get(dir);
  if (!serve) {
    serve = express.static(dir, { setHeaders: r => r.setHeader('Cache-Control', 'no-cache') });
    gameStatic.set(dir, serve);
  }
  serve(req, res, next);
});
app.get('/api/games', (req, res) => res.json(games.catalog()));
app.use('/vendor/three', express.static(path.join(__dirname, 'node_modules/three'), { maxAge: '1d' }));
// Ưu tiên model đã tối ưu (npm run models), không có thì dùng file gốc trong animal/.
app.use('/models', express.static(path.join(__dirname, 'build/models'), { maxAge: '1h' }));
app.use('/models', express.static(path.join(__dirname, 'animal'), { maxAge: '1h' }));

app.get('/qr.svg', async (req, res) => {
  const text = String(req.query.text || '').slice(0, 500);
  if (!text) return res.status(400).end();
  try {
    const svg = await QRCode.toString(text, { type: 'svg', margin: 1, errorCorrectionLevel: 'M' });
    res.type('image/svg+xml').send(svg);
  } catch {
    res.status(500).end();
  }
});

function lanIps() {
  return Object.values(os.networkInterfaces())
    .flat()
    .filter(i => i && i.family === 'IPv4' && !i.internal)
    .map(i => i.address);
}

// Khi màn hình host mở bằng localhost, QR cần IP LAN để điện thoại vào được.
app.get('/api/lan', (req, res) => res.json({ ips: lanIps() }));

rooms.attach(io);

server.listen(PORT, HOST, () => {
  console.log(`Party Game đang chạy (${games.all().map(g => games.text(g.name)).join(', ')}):`);
  console.log(`  Màn hình chung: http://localhost:${PORT}/host`);
  for (const ip of lanIps()) console.log(`  Trong mạng LAN:  http://${ip}:${PORT}/host`);
  if (!license.hasSecret()) {
    console.warn(
      license.enabled()
        ? '⚠️  Chưa đặt LICENSE_SECRET: mã Pro đang dùng khoá thử (chỉ nên dùng khi phát triển).'
        : '⚠️  Chưa đặt LICENSE_SECRET: tắt mã Pro, mọi phòng là bản miễn phí.',
    );
  }
  if (!ads.enabled()) console.log('ℹ️  Chưa đặt ADSENSE_CLIENT: không hiện quảng cáo.');
  if (!admin.enabled()) console.log('ℹ️  Chưa đặt ADMIN_PASSWORD: trang /admin (upload game) đang tắt.');
});

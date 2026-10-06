const path = require('path');
const http = require('http');
const os = require('os');
const express = require('express');
const { Server } = require('socket.io');
const QRCode = require('qrcode');
const rooms = require('./src/rooms');
const games = require('./src/games');
const license = require('./src/license');

const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || '0.0.0.0';

const app = express();
app.disable('x-powered-by');
const server = http.createServer(app);
const io = new Server(server, { pingInterval: 10000, pingTimeout: 8000 });

// HTML/JS/CSS của game: bắt trình duyệt luôn hỏi lại server (không dùng bản cũ trong bộ nhớ đệm).
app.use(
  express.static(path.join(__dirname, 'public'), {
    extensions: ['html'],
    setHeaders: res => res.setHeader('Cache-Control', 'no-cache'),
  }),
);
// Giao diện riêng của từng game: chỉ mở thư mục screen/, controller/ và assets/ (luật chơi trong service/ không ra ngoài).
for (const g of games.all()) {
  for (const side of ['screen', 'controller', 'assets']) {
    app.use(
      `/games/${g.id}/${side}`,
      express.static(path.join(__dirname, 'games', g.id, side), {
        setHeaders: res => res.setHeader('Cache-Control', 'no-cache'),
      }),
    );
  }
}
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

// Mỗi lần server khởi động có mã phiên bản mới. Trang đang mở kết nối lại mà thấy khác mã
// thì tự tải lại, để không chạy code giao diện cũ sau khi build/deploy.
const BUILD_ID = Date.now().toString(36);
const { APP_VERSION } = require('./src/config');
io.on('connection', socket => socket.emit('hello', { build: BUILD_ID, version: APP_VERSION }));

rooms.attach(io);

server.listen(PORT, HOST, () => {
  console.log(`Party Game đang chạy (${games.all().map(g => g.name).join(', ')}):`);
  console.log(`  Màn hình chung: http://localhost:${PORT}/host`);
  for (const ip of lanIps()) console.log(`  Trong mạng LAN:  http://${ip}:${PORT}/host`);
  if (!license.hasSecret()) {
    console.warn(
      license.enabled()
        ? '⚠️  Chưa đặt LICENSE_SECRET: mã Pro đang dùng khoá thử (chỉ nên dùng khi phát triển).'
        : '⚠️  Chưa đặt LICENSE_SECRET: tắt mã Pro, mọi phòng là bản miễn phí.',
    );
  }
});

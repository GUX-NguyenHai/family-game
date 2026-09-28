const path = require('path');
const http = require('http');
const os = require('os');
const express = require('express');
const { Server } = require('socket.io');
const QRCode = require('qrcode');
const rooms = require('./src/rooms');

const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || '0.0.0.0';

const app = express();
app.disable('x-powered-by');
const server = http.createServer(app);
const io = new Server(server, { pingInterval: 10000, pingTimeout: 8000 });

app.use(express.static(path.join(__dirname, 'public'), { extensions: ['html'] }));
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
  console.log(`Đua thú đang chạy:`);
  console.log(`  Màn hình chung: http://localhost:${PORT}/host`);
  for (const ip of lanIps()) console.log(`  Trong mạng LAN:  http://${ip}:${PORT}/host`);
});

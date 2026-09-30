// Bản đồ nhỏ góc dưới bên phải: toàn bộ đường đua nhìn từ trên xuống (xuất phát dưới, đích trên),
// chấm màu từng con, vật cản thu nhỏ và khung đoạn camera đang quay.

const PAD = 10;

export class Minimap {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas?.getContext('2d') || null; // trang HTML cũ không có khung minimap: bỏ qua, không làm hỏng trang
    this.race = null;
    this.taken = new Set();
    this.colors = new Map();
    window.addEventListener('resize', () => this.resize());
    this.resize();
  }

  resize() {
    if (!this.ctx) return;
    const rect = this.canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.w = Math.max(1, rect.width);
    this.h = Math.max(1, rect.height);
    this.canvas.width = Math.round(this.w * dpr);
    this.canvas.height = Math.round(this.h * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  setRace(info) {
    this.race = { trackLen: info.trackLen, width: info.width, obstacles: info.obstacles };
    this.taken = new Set(info.taken || []);
    this.resize();
  }

  setColors(players) {
    this.colors = new Map(players.map(p => [p.id, p.color]));
  }

  markTaken(id) {
    this.taken.add(id);
  }

  // players: [{id, x, z, r}] từ snapshot; focus: quãng đường camera đang nhìn (m).
  draw(players, focus) {
    if (!this.ctx) return;
    // HUD vừa hiện ra (lúc trước bị ẩn nên kích thước = 0) thì đo lại.
    const cw = this.canvas.clientWidth;
    const ch = this.canvas.clientHeight;
    if (cw && ch && (Math.abs(cw - this.w) > 1 || Math.abs(ch - this.h) > 1)) this.resize();
    const { ctx, w, h, race } = this;
    ctx.clearRect(0, 0, w, h);
    if (!race) return;

    const left = PAD;
    const right = w - PAD;
    const top = PAD + 6;
    const bottom = h - PAD;
    const trackW = right - left;
    const toY = z => bottom - (Math.min(Math.max(z, 0), race.trackLen) / race.trackLen) * (bottom - top);
    const toX = x => left + (x / race.width + 0.5) * trackW;
    const scaleX = trackW / race.width;
    const scaleY = (bottom - top) / race.trackLen;

    // Nền + mặt đường.
    ctx.fillStyle = 'rgba(18, 24, 38, 0.8)';
    roundRect(ctx, 0, 0, w, h, 12);
    ctx.fill();
    ctx.fillStyle = '#b58a57';
    ctx.fillRect(left, top, trackW, bottom - top);

    // Khung đoạn camera đang quay.
    const camTop = toY(focus + 30);
    const camBottom = toY(focus - 3);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.18)';
    ctx.fillRect(left, camTop, trackW, camBottom - camTop);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.55)';
    ctx.lineWidth = 1;
    ctx.strokeRect(left + 0.5, camTop + 0.5, trackW - 1, camBottom - camTop - 1);

    // Vật cản.
    for (const o of race.obstacles) {
      const x = toX(o.x);
      const y = toY(o.z);
      if (o.type === 'mud') {
        ctx.fillStyle = '#5b3a1e';
        ctx.beginPath();
        ctx.ellipse(x, y, Math.max(2, o.w * scaleX), Math.max(1.5, o.d * scaleY), 0, 0, Math.PI * 2);
        ctx.fill();
      } else if (o.type === 'fence') {
        ctx.strokeStyle = '#e03b3b';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(x - o.w * scaleX, y);
        ctx.lineTo(x + o.w * scaleX, y);
        ctx.stroke();
      } else if (!this.taken.has(o.id)) {
        ctx.fillStyle = '#ff8a1e';
        ctx.beginPath();
        ctx.arc(x, y, 2, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Vạch xuất phát + vạch đích ca-rô.
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(left, bottom - 1, trackW, 2);
    const cells = 8;
    const cellW = trackW / cells;
    for (let i = 0; i < cells; i++) {
      ctx.fillStyle = i % 2 ? '#111' : '#fff';
      ctx.fillRect(left + i * cellW, top - 4, cellW, 4);
    }

    // Các con vật: con về sau vẽ trước để con dẫn đầu nằm trên cùng.
    const sorted = [...players].sort((a, b) => a.z - b.z);
    for (const p of sorted) {
      ctx.fillStyle = this.colors.get(p.id) || '#fff';
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(toX(p.x), toY(p.z), 4.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
  }
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  if (ctx.roundRect) {
    ctx.roundRect(x, y, w, h, r);
    return;
  }
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

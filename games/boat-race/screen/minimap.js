// Bản đồ nhỏ góc dưới bên phải: cả khúc sông nhìn từ trên xuống (xuất phát dưới, đích trên),
// chấm màu từng thuyền, khúc gỗ, đảo hải đăng và khung đoạn camera đang quay.
import { roundRectPath } from '/js/core/scene-kit.js';

const PAD = 10;

export class Minimap {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas?.getContext('2d') || null;
    this.race = null;
    this.colors = new Map();
    this.onResize = () => this.resize();
    window.addEventListener('resize', this.onResize);
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

  // info: dữ liệu bắt đầu ván (setup) của server.
  setRace(info) {
    this.race = { trackLen: info.trackLen, width: info.width, obstacles: info.obstacles };
    this.colors = new Map(info.boats.map(b => [b.id, b.color]));
    this.resize();
  }

  // boats: [{ id, x, z }] từ snapshot; focus: quãng đường camera đang nhìn (m).
  draw(boats, focus) {
    if (!this.ctx) return;
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
    const riverW = right - left;
    const toY = z => bottom - (Math.min(Math.max(z, 0), race.trackLen) / race.trackLen) * (bottom - top);
    const toX = x => left + (x / race.width + 0.5) * riverW;
    const scaleX = riverW / race.width;
    const scaleY = (bottom - top) / race.trackLen;

    // Nền + mặt sông.
    ctx.fillStyle = 'rgba(18, 24, 38, 0.8)';
    roundRectPath(ctx, 0, 0, w, h, 12);
    ctx.fill();
    ctx.fillStyle = '#2f86c9';
    ctx.fillRect(left, top, riverW, bottom - top);

    // Khung đoạn camera đang quay.
    const camTop = toY(focus + 30);
    const camBottom = toY(focus - 3);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.18)';
    ctx.fillRect(left, camTop, riverW, camBottom - camTop);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.55)';
    ctx.lineWidth = 1;
    ctx.strokeRect(left + 0.5, camTop + 0.5, riverW - 1, camBottom - camTop - 1);

    // Vật cản.
    for (const o of race.obstacles) {
      const x = toX(o.x);
      const y = toY(o.z);
      if (o.type === 'island') {
        ctx.fillStyle = '#9aa0a8';
        ctx.beginPath();
        ctx.ellipse(x, y, Math.max(3, o.w * scaleX), Math.max(2, o.d * scaleY), 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#d63a3a';
        ctx.fillRect(x - 1.5, y - 3, 3, 6);
      } else {
        ctx.strokeStyle = '#7a5230';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(x - o.w * scaleX, y);
        ctx.lineTo(x + o.w * scaleX, y);
        ctx.stroke();
      }
    }

    // Vạch xuất phát + vạch đích ca-rô.
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(left, bottom - 1, riverW, 2);
    const cells = 8;
    const cellW = riverW / cells;
    for (let i = 0; i < cells; i++) {
      ctx.fillStyle = i % 2 ? '#111' : '#fff';
      ctx.fillRect(left + i * cellW, top - 4, cellW, 4);
    }

    // Thuyền về sau vẽ trước để thuyền dẫn đầu nằm trên cùng.
    for (const b of [...boats].sort((a, c) => a.z - c.z)) {
      ctx.fillStyle = this.colors.get(b.id) || '#fff';
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(toX(b.x), toY(b.z), 4.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
  }

  destroy() {
    window.removeEventListener('resize', this.onResize);
  }
}

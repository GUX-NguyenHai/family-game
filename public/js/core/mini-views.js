// Khung nhỏ cho người chơi bị tụt lại khỏi cảnh chính (dùng chung cho các game đua 3D).
// - Mỗi người một chỗ cố định cả ván, xếp 2 cột trái/phải theo thứ tự làn xuất phát (trái → phải).
//   Tụt lại thì khung hiện đúng chỗ đó, đuổi kịp thì ẩn; không bao giờ đổi chỗ giữa chừng.
// - Chống nhấp nháy: hiện sớm (sắp chạm mép dưới cảnh chính), ẩn muộn (vào hẳn cảnh chính), giữ ít nhất vài giây.
// - Lúc ẩn: khung phủ màu dần kèm ⬆ rồi mới mất; ở cảnh chính con vật/thuyền đó được đánh dấu
//   (vòng sáng dưới chân + mũi tên trên đầu) vài giây để người chơi kịp tìm thấy mình.
// - Vẽ chung canvas với cảnh chính (setViewport/setScissor), không tạo thêm renderer, không tính lại bóng đổ.
// - Viền màu + tên là HTML phủ lên canvas (class .mini-view trong /css/host.css).
//
// Cách dùng trong scene của game:
//   this.miniViews = new MiniViews(renderer, scene, overlay, { high });
//   miniViews.setOrder(ids)        lúc bắt đầu ván: id theo thứ tự làn từ trái sang phải
//   miniViews.setArea(area)        chỗ trống 2 bên: { left: {top, bottom}, right: {top, bottom} } (px)
//   miniViews.update(players, edge, now)   players = [{ id, z, active }], edge = z mép dưới cảnh chính
//                                          → Map id → { rect, leaving } những ai đang có khung
//   miniViews.updateMarkers(now, where)    where(id) → { pos: Vector3, top, color, size? } | null: chỗ đặt dấu
//                                          (top = độ cao đỉnh đầu, size = phóng vòng sáng, mặc định 1)
//   miniViews.draw(views, { begin, end })  mỗi khung hình, sau khi vẽ cảnh chính
//     views = [{ id, rect, leaving, color, text, aim(camera), before(), after() }]
import * as THREE from 'three';

const RATIO = 0.62; // cao / rộng
const MIN_H = 64; // nhỏ nhất; thu tới mức này vẫn không đủ chỗ thì người ở làn giữa không có khung
const GAP = 10;
const MARGIN = 16;
const LOW_MAX = 4; // Đồ hoạ Thấp: tối đa số khung vẽ cùng lúc (ưu tiên người gần nhất)

const SHOW_AHEAD = 2; // m: còn cách mép dưới cảnh chính bấy nhiêu đã hiện khung
const HIDE_AHEAD = 9; // m: phải vào hẳn cảnh chính bấy nhiêu mới bắt đầu ẩn
const MIN_SHOW_MS = 3000; // khung đã hiện thì giữ ít nhất bấy lâu
const FADE_MS = 1000; // thời gian khung phủ màu dần trước khi mất (khớp animation trong host.css)
const MARK_MS = 2000; // thời gian đánh dấu ở cảnh chính sau khi khung mất

export class MiniViews {
  constructor(renderer, scene, overlay, { high = true } = {}) {
    this.renderer = renderer;
    this.scene = scene;
    this.overlay = overlay;
    this.high = high;
    this.camera = new THREE.PerspectiveCamera(45, 1.6, 0.3, 90);
    this.area = null;
    this.order = [];
    this.slots = new Map(); // id → { x, y, w, h } (px, gốc trên-trái)
    this.slotKey = null;
    this.states = new Map(); // id → { since, leaveAt } những ai đang có khung
    this.frames = new Map(); // id → phần tử viền + tên
    this.marks = new Map(); // id → hết hạn đánh dấu (ms)
    this.markers = new Map(); // id → { group, ring, arrow, color }
    this.markerGroup = new THREE.Group();
    scene.add(this.markerGroup);
  }

  setArea(area) {
    this.area = area;
  }

  setOrder(ids) {
    this.order = ids || [];
    this.slotKey = null;
    this.states.clear();
    this.marks.clear();
  }

  // Chỗ cố định của từng người: các làn bên trái xếp cột trái, các làn bên phải xếp cột phải, từ trên xuống.
  // Mọi khung cùng cỡ, cỡ lớn nhất mà vẫn đủ chỗ cho cả ván. Chỉ tính lại khi chỗ trống/cửa sổ đổi.
  layout() {
    const area = this.area;
    const ids = this.order;
    const W = window.innerWidth;
    const key = area ? `${W}|${area.left.top}|${area.left.bottom}|${area.right.top}|${area.right.bottom}|${ids.join(',')}` : '';
    if (key === this.slotKey) return this.slots;
    this.slotKey = key;
    this.slots = new Map();
    const n = ids.length;
    if (!area || !n) return this.slots;

    const bandH = side => Math.max(0, area[side].bottom - area[side].top);
    const cap = (side, h) => Math.floor((bandH(side) + GAP) / (h + GAP));
    // Thu nhỏ dần tới khi 2 cột đủ chỗ cho tất cả.
    let h = Math.max(MIN_H, W * 0.17 * RATIO);
    while (h > MIN_H && cap('left', h) + cap('right', h) < n) h -= 2;
    const capL = cap('left', h);
    const capR = cap('right', h);
    // Chia đôi theo làn; một bên thiếu chỗ thì bên kia nhận thêm.
    const nLeft = Math.min(capL, Math.max(Math.ceil(n / 2), n - capR));
    const nRight = Math.min(capR, n - nLeft);
    const w = h / RATIO;
    ids.slice(0, nLeft).forEach((id, i) => {
      this.slots.set(id, { x: MARGIN, y: area.left.top + i * (h + GAP), w, h });
    });
    ids.slice(n - nRight).forEach((id, i) => {
      this.slots.set(id, { x: W - MARGIN - w, y: area.right.top + i * (h + GAP), w, h });
    });
    return this.slots;
  }

  // players: [{ id, z, active }] (active = đang đua, chưa về đích); edge: z của mép dưới cảnh chính.
  // Trả về Map id → { rect, leaving } những ai đang có khung (leaving = đang phủ màu trước khi mất).
  update(players, edge, now) {
    const slots = this.layout();
    const live = [];
    const seen = new Set();
    for (const p of players) {
      seen.add(p.id);
      if (!p.active || !slots.has(p.id)) {
        this.states.delete(p.id);
        continue;
      }
      let st = this.states.get(p.id);
      if (!st) {
        if (p.z >= edge + SHOW_AHEAD) continue;
        st = { since: now, leaveAt: 0 };
        this.states.set(p.id, st);
        this.marks.delete(p.id);
      }
      if (p.z <= edge + HIDE_AHEAD) st.leaveAt = 0; // tụt lại giữa chừng thì thôi ẩn
      else if (!st.leaveAt && now - st.since >= MIN_SHOW_MS) st.leaveAt = now;
      if (st.leaveAt && now - st.leaveAt >= FADE_MS) {
        this.states.delete(p.id);
        this.marks.set(p.id, now + MARK_MS);
        continue;
      }
      live.push(p);
    }
    for (const id of this.states.keys()) if (!seen.has(id)) this.states.delete(id);
    // Máy yếu: chỉ vẽ vài khung của những người gần đoàn nhất.
    const drawn = this.high ? live : [...live].sort((a, b) => b.z - a.z).slice(0, LOW_MAX);
    return new Map(drawn.map(p => [p.id, { rect: slots.get(p.id), leaving: !!this.states.get(p.id).leaveAt }]));
  }

  // Dấu ở cảnh chính cho người vừa rời khung nhỏ: vòng sáng dưới chân + mũi tên nhún nhảy trên đầu.
  updateMarkers(now, where) {
    for (const [id, until] of this.marks) {
      const at = now < until ? where(id) : null;
      if (now >= until) this.marks.delete(id);
      let m = this.markers.get(id);
      if (!at) {
        if (m) m.group.visible = false;
        if (now >= until && m) this.removeMarker(id);
        continue;
      }
      if (!m || m.color !== at.color) {
        if (m) this.removeMarker(id);
        m = this.makeMarker(at.color);
        this.markers.set(id, m);
      }
      const t = now / 1000;
      const left = (until - now) / MARK_MS; // 1 → 0
      m.group.visible = true;
      m.group.position.set(at.pos.x, 0, at.pos.z);
      m.ring.scale.setScalar((at.size || 1) * (1 + 0.15 * Math.sin(t * 8)));
      m.ring.material.opacity = 0.85 * Math.min(1, left * 3);
      m.arrow.position.y = at.top + 0.9 + 0.25 * Math.abs(Math.sin(t * 6)); // trên nhãn tên
      m.arrow.material.opacity = m.ring.material.opacity;
    }
    for (const id of this.markers.keys()) if (!this.marks.has(id)) this.removeMarker(id);
  }

  makeMarker(color) {
    const group = new THREE.Group();
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(1.3, 1.65, 32), // to hơn vòng màu sẵn có dưới chân con vật
      new THREE.MeshBasicMaterial({ color, transparent: true, depthWrite: false, side: THREE.DoubleSide }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.06;
    const arrow = new THREE.Mesh(
      new THREE.ConeGeometry(0.32, 0.7, 12),
      new THREE.MeshBasicMaterial({ color, transparent: true, depthTest: false, depthWrite: false }),
    );
    arrow.rotation.x = Math.PI; // mũi nhọn chỉ xuống
    arrow.renderOrder = 11;
    group.add(ring, arrow);
    this.markerGroup.add(group);
    return { group, ring, arrow, color };
  }

  removeMarker(id) {
    const m = this.markers.get(id);
    if (!m) return;
    this.markerGroup.remove(m.group);
    for (const mesh of [m.ring, m.arrow]) {
      mesh.geometry.dispose();
      mesh.material.dispose();
    }
    this.markers.delete(id);
  }

  // Vẽ các khung (gọi sau khi vẽ cảnh chính). begin/end: ẩn/hiện lại những thứ không cần trong khung (cây cối…).
  draw(views, { begin, end } = {}) {
    if (views.length) {
      const r = this.renderer;
      const H = window.innerHeight;
      const shadowAuto = r.shadowMap.autoUpdate;
      r.shadowMap.autoUpdate = false; // dùng lại bóng đã tính cho cảnh chính
      this.markerGroup.visible = false;
      begin?.();
      r.setScissorTest(true);
      for (const v of views) {
        const { x, y, w, h } = v.rect;
        this.camera.aspect = w / h;
        this.camera.updateProjectionMatrix();
        v.aim(this.camera);
        v.before?.();
        const gy = H - y - h; // WebGL tính từ dưới lên
        r.setViewport(x, gy, w, h);
        r.setScissor(x, gy, w, h);
        r.render(this.scene, this.camera);
        v.after?.();
      }
      r.setScissorTest(false);
      r.setViewport(0, 0, window.innerWidth, H);
      r.shadowMap.autoUpdate = shadowAuto;
      this.markerGroup.visible = true;
      end?.();
    }
    this.syncFrames(views);
  }

  // Viền màu + tên cho từng khung; khung không còn trong views thì gỡ.
  syncFrames(views) {
    if (!this.overlay) return;
    const keep = new Set();
    for (const v of views) {
      keep.add(v.id);
      let el = this.frames.get(v.id);
      if (!el) {
        el = document.createElement('div');
        el.className = 'mini-view';
        el.innerHTML = '<b></b>';
        this.overlay.append(el);
        this.frames.set(v.id, el);
      }
      const { x, y, w, h } = v.rect;
      el.style.cssText = `left:${x}px;top:${y}px;width:${w}px;height:${h}px;--c:${v.color}`;
      el.classList.toggle('leaving', !!v.leaving);
      if (el.firstChild.textContent !== v.text) el.firstChild.textContent = v.text;
    }
    for (const [id, el] of this.frames) {
      if (keep.has(id)) continue;
      el.remove();
      this.frames.delete(id);
    }
  }

  destroy() {
    for (const el of this.frames.values()) el.remove();
    this.frames.clear();
    for (const id of [...this.markers.keys()]) this.removeMarker(id);
    this.scene.remove(this.markerGroup);
  }
}

// Chữ trên khung: "Bố ↓45m" (làm tròn 5m); chưa ra khỏi cảnh chính thì chỉ ghi tên.
export function behindText(name, meters) {
  return meters > 0 ? `${name} ↓${Math.max(5, Math.round(meters / 5) * 5)}m` : name;
}

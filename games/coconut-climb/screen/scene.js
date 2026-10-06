// Cảnh 3D Leo cây hái dừa: bãi biển, hàng cây dừa (mỗi người một cây), khỉ (người chơi tự chọn) ôm thân cây leo lên.
// Thân cây tự dựng (thẳng, có khúc rêu xanh = đoạn trơn) để con vật bám đúng thân; cây dừa tải về dùng trang trí xung quanh.
// Toạ độ: x = ngang (các cây xếp hàng), y = độ cao, camera nhìn từ phía trước (z dương).
import * as THREE from 'three';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import {
  clamp,
  damp,
  loadModel,
  cloneModel,
  canvasTexture,
  noiseTexture,
  textSprite,
  disposeTree,
  Label,
  Particles,
} from '/js/core/scene-kit.js';

export const FLAG = { SLIP: 1, SLIDING: 2, TOP: 4 };

const MODELS = '/games/coconut-climb/assets/models/';
const SPACING = 4; // khoảng cách giữa 2 cây
const TRUNK_R = 0.32;
const BASE_Y = 0.3; // độ cao 0m của người leo (khỉ bám ngay trên gốc)

// Vân thân cây dừa: các khoanh ngang.
function trunkTexture(base, ring) {
  const c = document.createElement('canvas');
  c.width = 32;
  c.height = 64;
  const ctx = c.getContext('2d');
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, 32, 64);
  ctx.fillStyle = ring;
  ctx.fillRect(0, 0, 32, 10);
  return canvasTexture(c, true);
}

function waterTexture() {
  const size = 256;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#2a8fd0';
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < 120; i++) {
    ctx.fillStyle = `rgba(255,255,255,${0.08 + Math.random() * 0.2})`;
    ctx.fillRect(Math.random() * size, Math.random() * size, 12 + Math.random() * 40, 2 + Math.random() * 2);
  }
  return canvasTexture(c, true);
}

const LEAF_MAT = new THREE.MeshLambertMaterial({ color: 0x2f9a3a, flatShading: true });
const NUT_MAT = new THREE.MeshLambertMaterial({ color: 0x6b4a2b });

// ---------- Một cây dừa (mỗi người một cây) ----------

class Tree {
  // slips: các đoạn trơn [[từ, đến]] (mét tính từ 0m của người leo).
  constructor(height, slips) {
    this.group = new THREE.Group();
    this.height = height;
    this.nuts = [];
    this.falling = [];

    const top = BASE_Y + height + 0.6; // ngọn cây: trên đích một chút
    const tex = trunkTexture('#9c6b3e', '#7a5230');
    tex.repeat.set(1, top / 0.6);
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(TRUNK_R * 0.8, TRUNK_R, top, 10), new THREE.MeshLambertMaterial({ map: tex }));
    trunk.position.y = top / 2;
    trunk.castShadow = true;
    this.group.add(trunk);

    // Các khúc rêu trơn, bọc ngoài thân cây (thân thon dần lên ngọn nên bán kính tính theo độ cao).
    const radiusAt = y => TRUNK_R * (1 - 0.2 * (y / top)) + 0.03;
    const mossTex = trunkTexture('#3f8f3a', '#57b04f');
    const mossMat = new THREE.MeshLambertMaterial({ map: mossTex });
    for (const [from, to] of slips || []) {
      const y0 = BASE_Y + from;
      const y1 = BASE_Y + to;
      const moss = new THREE.Mesh(new THREE.CylinderGeometry(radiusAt(y1), radiusAt(y0), Math.max(0.1, y1 - y0), 10), mossMat);
      moss.position.y = (y0 + y1) / 2;
      this.group.add(moss);
    }

    // Tán lá: 8 tàu lá xoè ra và rủ xuống.
    const crown = new THREE.Group();
    crown.position.y = top;
    for (let i = 0; i < 8; i++) {
      const arm = new THREE.Group();
      arm.rotation.y = (i / 8) * Math.PI * 2 + Math.random() * 0.3;
      const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.35, 3, 4), LEAF_MAT);
      leaf.rotation.z = -Math.PI / 2 - 0.45; // nằm ngang hướng ra ngoài, chúc xuống
      leaf.position.set(1.4, -0.35, 0);
      leaf.scale.set(1, 1, 0.3);
      leaf.castShadow = true;
      arm.add(leaf);
      crown.add(arm);
    }
    this.group.add(crown);

    // Chùm dừa dưới tán lá (tải model lỗi thì dùng quả cầu nâu).
    for (let i = 0; i < 3; i++) {
      const nut = new THREE.Group();
      const a = (i / 3) * Math.PI * 2;
      nut.position.set(Math.cos(a) * 0.32, top - 0.35, Math.sin(a) * 0.32 + 0.1);
      nut.add(new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 6), NUT_MAT));
      this.group.add(nut);
      this.nuts.push(nut);
    }
    loadModel(MODELS + 'coconut.glb')
      .then(tpl => {
        for (const nut of this.nuts) {
          const made = cloneModel(tpl, { height: 0.45 });
          made.object.position.y = -0.22;
          nut.clear();
          nut.add(made.object);
        }
      })
      .catch(() => {});
  }

  // Người chơi lên ngọn: 1 quả dừa rơi xuống đất.
  dropNut() {
    const nut = this.nuts.find(n => !n.userData.dropped);
    if (!nut) return;
    nut.userData.dropped = true;
    this.falling.push({ nut, v: 0, spin: (Math.random() - 0.5) * 8, bounced: 0 });
  }

  // Trả về vị trí quả dừa vừa chạm đất (để bắn hạt), nếu có.
  update(dt) {
    let landed = null;
    for (const f of this.falling) {
      if (f.bounced > 2) continue;
      f.v -= 9.8 * dt;
      f.nut.position.y += f.v * dt;
      f.nut.rotation.z += f.spin * dt;
      if (f.nut.position.y <= 0.22) {
        f.nut.position.y = 0.22;
        f.v = -f.v * 0.35;
        if (f.bounced++ === 0) landed = f.nut.getWorldPosition(new THREE.Vector3());
      }
    }
    return landed;
  }

  dispose() {
    disposeTree(this.group);
    this.group.parent?.remove(this.group);
  }
}

// ---------- Một chú khỉ ôm thân cây ----------
// Model khỉ khác nhau về tư thế: đứng thẳng (cao hơn dài) thì giữ nguyên, quay mặt vào thân cây;
// bò 4 chân (dài hơn cao) thì dựng đứng lên cho đầu hướng lên trên, bụng áp vào thân cây.
// Có hoạt ảnh leo/chạy/đi thì dùng; không có thì tự nhún người theo nhịp lắc.

const RING_GEO = new THREE.TorusGeometry(TRUNK_R + 0.12, 0.045, 6, 20);

// Tìm hoạt ảnh theo tên (không phân biệt hoa thường), ưu tiên theo thứ tự các mẫu.
function pickClip(clips, patterns) {
  for (const re of patterns) {
    const c = clips.find(x => re.test(x.name));
    if (c) return c;
  }
  return null;
}

class Climber {
  constructor(player, figureId, catalog) {
    this.catalog = catalog;
    this.group = new THREE.Group(); // đặt ở thân cây, nâng theo độ cao
    this.body = new THREE.Group(); // nhún/rung khi leo, tụt
    this.group.add(this.body);
    // Vòng dây màu người chơi quấn quanh thân cây (như người trèo dừa thật).
    this.ringMat = new THREE.MeshLambertMaterial({ color: player.color });
    this.ring = new THREE.Mesh(RING_GEO, this.ringMat);
    this.ring.rotation.x = Math.PI / 2;
    this.group.add(this.ring);
    this.label = new Label();
    this.group.add(this.label.sprite);
    this.pose = null;
    this.inner = null;
    this.mixer = null;
    this.actions = {};
    this.current = null;
    this.currentKey = null;
    this.hasMove = false;
    this.extraYaw = 0;
    this.loadToken = 0;
    this.disposed = false;
    this.figure = undefined; // khác mọi giá trị thật để lần đầu luôn tải model
    this.size = 1.3;
    this.y = 0;
    this.setPlayer(player, figureId);
  }

  setPlayer(player, figureId) {
    this.label.set(player.name, player.color);
    this.ringMat.color.set(player.color);
    if (figureId !== this.figure) {
      this.figure = figureId;
      this.loadFigure(figureId);
    }
  }

  async loadFigure(figureId) {
    const token = ++this.loadToken;
    const def = this.catalog.figures.find(f => f.id === figureId) || this.catalog.figures[0];
    let tpl = null;
    try {
      tpl = await loadModel(MODELS + def.file);
    } catch {
      tpl = null;
    }
    if (token !== this.loadToken || this.disposed) return;
    if (this.pose) {
      // Chỉ gỡ ra: bản sao dùng chung hình khối/vật liệu với model gốc nên không dispose.
      this.body.remove(this.pose);
      this.mixer?.stopAllAction();
    }
    this.actions = {};
    this.current = null;
    this.currentKey = null;
    this.mixer = null;
    this.yaw = def.yaw || 0;
    this.pose = new THREE.Group();
    this.inner = new THREE.Group();
    this.pose.add(this.inner);

    let depth = 0.3; // nửa bề dày theo hướng thân cây, để bụng vừa chạm thân cây
    if (tpl) {
      const model = SkeletonUtils.clone(tpl.root);
      const { size, center } = tpl;
      const scale = (def.size || 1.3) / Math.max(size.x, size.y, size.z, 1e-6);
      model.scale.setScalar(scale);
      model.position.set(-center.x * scale, -center.y * scale, -center.z * scale);
      this.inner.add(model);
      const upright = size.y >= Math.max(size.x, size.z) * 0.9;
      // glTF quay mặt về +z; quay 180° cho mặt hướng vào thân cây (-z), cộng thêm yaw riêng nếu model quay sai.
      this.inner.rotation.y = Math.PI + this.yaw + this.extraYaw;
      if (upright) {
        const sideways = Math.abs(Math.sin(this.yaw)) > 0.5;
        depth = ((sideways ? size.x : size.z) * scale) / 2;
      } else {
        this.pose.rotation.x = Math.PI / 2; // bò 4 chân → dựng đứng, đầu hướng lên
        depth = (size.y * scale) / 2;
      }
      this.size = Math.max(size.x, size.y, size.z) * scale;
      if (tpl.clips.length) {
        this.mixer = new THREE.AnimationMixer(model);
        const move = pickClip(tpl.clips, [/climb/i, /run|gallop/i, /walk/i, /jump/i]);
        const idle = pickClip(tpl.clips, [/idle/i, /stand/i]);
        const win = pickClip(tpl.clips, [/celebrat|victory|dance|happy|wave/i, /jump/i]);
        if (move) this.actions.move = this.mixer.clipAction(move);
        if (idle) this.actions.idle = this.mixer.clipAction(idle);
        if (win) this.actions.win = this.mixer.clipAction(win);
        if (!idle && !move) this.actions.idle = this.mixer.clipAction(tpl.clips[0]);
        this.hasMove = !!move;
      }
    } else {
      // Tải model lỗi: khối tạm để vẫn chơi được.
      const box = new THREE.Mesh(new THREE.BoxGeometry(0.6, 1.1, 0.5), new THREE.MeshLambertMaterial({ color: 0x8b5a2b }));
      this.inner.add(box);
      depth = 0.25;
      this.size = 1.1;
    }
    this.pose.position.z = TRUNK_R + depth;
    this.body.add(this.pose);
    this.ring.position.y = -this.size * 0.25;
    this.label.sprite.position.y = this.size * 0.6 + 0.5;
    this.setAnim('idle');
  }

  // Phím Y trên màn hình chung: xoay thử khỉ 90° nếu quay sai hướng.
  rotate(delta) {
    this.extraYaw += delta;
    if (this.inner) this.inner.rotation.y = Math.PI + this.yaw + this.extraYaw;
  }

  setAnim(key, timeScale = 1) {
    const action = this.actions[key] || this.actions.idle;
    if (!action) return;
    if (this.current === action) {
      action.setEffectiveTimeScale(timeScale);
      return;
    }
    action.reset();
    action.setLoop(THREE.LoopRepeat, Infinity);
    action.setEffectiveTimeScale(timeScale).setEffectiveWeight(1).fadeIn(0.2).play();
    if (this.current) this.current.fadeOut(0.2);
    this.current = action;
    this.currentKey = key;
  }

  // y: độ cao (m), d: mức lắc 0..1, f: cờ trạng thái.
  place(x, y, d, f, state, dt, now) {
    this.y = damp(this.y, y, 15, dt);
    this.group.position.set(x, BASE_Y + this.y + this.size / 2, 0);
    const climbing = state === 'climb' && d > 0.12 && !(f & FLAG.TOP);

    // Đang tụt thì rung lắc qua lại; leo mà model không có hoạt ảnh thì tự nhún người theo nhịp.
    let wobble = 0;
    let bob = 0;
    if (f & FLAG.SLIDING) wobble = Math.sin(now / 60) * 0.1;
    else if (climbing && !this.hasMove) {
      const phase = now / (220 - d * 120);
      bob = Math.abs(Math.sin(phase)) * 0.12;
      wobble = Math.sin(phase) * 0.08;
    } else if (f & FLAG.TOP && !this.actions.win) {
      bob = Math.abs(Math.sin(now / 150)) * 0.25; // nhảy cẫng ăn mừng
    }
    this.body.rotation.z = damp(this.body.rotation.z, wobble, 20, dt);
    this.body.position.y = damp(this.body.position.y, bob, 20, dt);

    if (f & FLAG.TOP) this.setAnim('win');
    else if (climbing) this.setAnim('move', clamp(0.6 + d * 1.4, 0.6, 2));
    else this.setAnim('idle');
  }

  update(dt) {
    this.mixer?.update(dt);
  }

  dispose() {
    this.disposed = true;
    this.mixer?.stopAllAction();
    this.label.dispose();
    this.ringMat.dispose();
    this.group.parent?.remove(this.group);
  }
}

// ---------- Cảnh chính ----------

export class ClimbScene {
  constructor(canvas, catalog, quality = 'high') {
    this.catalog = catalog; // danh sách khỉ (assets/figures.json)
    this.extraYaw = 0;
    this.high = quality === 'high';
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: this.high, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, this.high ? 2 : 1));
    this.renderer.shadowMap.enabled = this.high;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x8fd3ff);
    this.scene.fog = new THREE.Fog(0xbfe9ff, 60, 180);
    this.camera = new THREE.PerspectiveCamera(45, 1, 0.5, 400);

    this.scene.add(new THREE.HemisphereLight(0xffffff, 0xe8d3a0, 1.5));
    this.sun = new THREE.DirectionalLight(0xffffff, 2.2);
    this.sun.position.set(-12, 30, 18);
    this.sun.castShadow = this.high;
    this.sun.shadow.mapSize.set(2048, 2048);
    Object.assign(this.sun.shadow.camera, { left: -30, right: 30, top: 30, bottom: -5, near: 1, far: 100 });
    this.sun.shadow.camera.updateProjectionMatrix();
    this.scene.add(this.sun);

    this.height = 18;
    this.slips = []; // các đoạn trơn [[từ, đến]] (mét)
    this.order = []; // id người chơi theo thứ tự cây từ trái sang phải
    this.trees = new Map();
    this.climbers = new Map();
    this.state = null;
    this.phase = 'lobby';
    this.camY = 4;
    this.particles = new Particles(this.scene);
    this.clock = new THREE.Clock();
    this.worldGroup = null;

    this.buildWorld();
    this.onResize = () => this.resize();
    window.addEventListener('resize', this.onResize);
    this.resize();
    this.renderer.setAnimationLoop(() => this.frame());
  }

  resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  // Bãi cát, biển phía sau, cây dừa trang trí, cột mốc độ cao.
  buildWorld() {
    if (this.worldGroup) {
      this.scene.remove(this.worldGroup);
      disposeTree(this.worldGroup);
    }
    const g = new THREE.Group();
    this.worldGroup = g;
    this.scene.add(g);

    const sandTex = noiseTexture('#ead7a4', '#d2bb82');
    sandTex.repeat.set(30, 20);
    const sand = new THREE.Mesh(new THREE.PlaneGeometry(200, 60), new THREE.MeshLambertMaterial({ map: sandTex }));
    sand.rotation.x = -Math.PI / 2;
    sand.position.set(0, 0, 5);
    sand.receiveShadow = true;
    g.add(sand);

    const waterTex = waterTexture();
    waterTex.repeat.set(20, 10);
    this.water = new THREE.Mesh(new THREE.PlaneGeometry(400, 200), new THREE.MeshPhongMaterial({ map: waterTex, shininess: 80, specular: 0x88ccff }));
    this.water.rotation.x = -Math.PI / 2;
    this.water.position.set(0, -0.05, -125);
    g.add(this.water);

    // Cột mốc độ cao bên trái hàng cây.
    this.marks = new THREE.Group();
    g.add(this.marks);

    // Cây dừa trang trí phía sau và hai bên.
    loadModel(MODELS + 'palm-tree.glb')
      .then(tpl => {
        if (this.worldGroup !== g) return;
        for (let i = 0; i < (this.high ? 14 : 7); i++) {
          const made = cloneModel(tpl, { height: 6 + Math.random() * 5 });
          const side = i % 2 ? 1 : -1;
          made.object.position.set(side * (8 + Math.random() * 40), 0, -6 - Math.random() * 22);
          made.object.rotation.y = Math.random() * Math.PI * 2;
          g.add(made.object);
        }
      })
      .catch(() => {});
  }

  buildMarks() {
    for (const m of [...this.marks.children]) {
      this.marks.remove(m);
      disposeTree(m);
    }
    const x = -((this.order.length - 1) * SPACING) / 2 - SPACING * 0.75;
    for (let h = 5; h < this.height; h += 5) {
      const sign = textSprite(`${h}m`, { height: 0.6 });
      sign.position.set(x, BASE_Y + h, 0);
      this.marks.add(sign);
    }
    const top = textSprite('🥥 ĐÍCH', { bg: '#d63a3a', height: 0.8 });
    top.position.set(x, BASE_Y + this.height, 0);
    this.marks.add(top);
  }

  // Dựng hàng cây + khỉ. ids: người chơi theo thứ tự; playerOf: id → người chơi; figureOf: id → loại khỉ.
  setPlayers(ids, playerOf, field, figureOf) {
    const changed = field && (field.height !== this.height || JSON.stringify(field.slips) !== JSON.stringify(this.slips));
    if (field) Object.assign(this, { height: field.height, slips: field.slips || [] });
    const same = !changed && ids.length === this.order.length && ids.every((id, i) => id === this.order[i]);
    this.order = ids;
    // Dựng lại cây khi đổi người/độ khó, hoặc ván trước đã có quả dừa rơi.
    if (!same || this.nutsDropped) {
      this.nutsDropped = false;
      for (const t of this.trees.values()) t.dispose();
      this.trees.clear();
      ids.forEach((id, i) => {
        const t = new Tree(this.height, this.slips);
        t.group.position.x = (i - (ids.length - 1) / 2) * SPACING;
        this.trees.set(id, t);
        this.scene.add(t.group);
      });
      this.buildMarks();
    }
    const keep = new Set(ids);
    for (const [id, c] of this.climbers) {
      if (!keep.has(id)) {
        c.dispose();
        this.climbers.delete(id);
      }
    }
    for (const id of ids) {
      const player = playerOf(id) || { id, name: '?', animal: null, color: '#fff' };
      let c = this.climbers.get(id);
      if (!c) {
        c = new Climber(player, figureOf(id), this.catalog);
        if (this.extraYaw) c.rotate(this.extraYaw);
        this.climbers.set(id, c);
        this.scene.add(c.group);
      } else {
        c.setPlayer(player, figureOf(id));
      }
    }
  }

  // Phím Y: xoay thử mọi chú khỉ 90°. Trả về góc đã xoay thêm (ghi vào yaw trong figures.json nếu đúng).
  rotateFigures(delta) {
    this.extraYaw = (this.extraYaw + delta) % (Math.PI * 2);
    for (const c of this.climbers.values()) c.rotate(delta);
    return this.extraYaw;
  }

  setPhase(phase) {
    this.phase = phase;
    if (phase === 'lobby') this.state = null;
  }

  setState(s) {
    this.state = s;
  }

  // Có người lên ngọn: quả dừa trên cây đó rơi xuống.
  topReached(pid) {
    const t = this.trees.get(pid);
    if (!t) return;
    t.dropNut();
    this.nutsDropped = true;
    const at = t.group.position.clone().setY(BASE_Y + this.height + 0.5);
    this.particles.burst(at, ['#ffe119', '#ffffff', '#3cb44b', '#ff8a1e'], { count: 40, speed: 4, up: 5, life: 1.4 });
  }

  updateCamera(maxY, dt) {
    const n = Math.max(1, this.order.length);
    const halfSpan = ((n - 1) * SPACING) / 2 + SPACING;
    const vfov = (this.camera.fov * Math.PI) / 180;
    const hfov = 2 * Math.atan(Math.tan(vfov / 2) * this.camera.aspect);
    const dist = clamp(halfSpan / Math.tan(hfov / 2), 10, 60);
    // Khung hình cao bao nhiêu mét; đủ chỗ thì thấy cả cây, không thì bám theo người leo cao nhất.
    const view = 2 * dist * Math.tan(vfov / 2) * 0.85;
    const full = BASE_Y + this.height + 2.5;
    const target = view >= full ? full / 2 : clamp(BASE_Y + maxY, view / 2, full - view / 2);
    this.camY = damp(this.camY, target, 3, dt);
    this.camera.position.set(0, this.camY + 1.5, dist);
    this.camera.lookAt(0, this.camY, 0);
  }

  frame() {
    const dt = Math.min(0.05, this.clock.getDelta());
    const now = performance.now();
    const s = this.state;
    const byId = new Map((s?.p || []).map(p => [p.id, p]));
    let maxY = 0;
    this.order.forEach((id, i) => {
      const c = this.climbers.get(id);
      if (!c) return;
      const p = byId.get(id);
      const x = (i - (this.order.length - 1) / 2) * SPACING;
      c.place(x, p ? p.y : 0, p ? p.d : 0, p ? p.f : 0, s?.phase || 'lobby', dt, now);
      maxY = Math.max(maxY, c.y);
    });
    this.updateCamera(maxY, dt);

    for (const t of this.trees.values()) {
      const landed = t.update(dt);
      if (landed) this.particles.burst(landed, ['#ead7a4', '#d2bb82', '#ffffff'], { count: 14, speed: 2, up: 2.5, life: 0.7 });
    }
    if (this.water) this.water.material.map.offset.x += dt * 0.01; // sóng trôi nhẹ
    for (const c of this.climbers.values()) c.update(dt);
    this.particles.update(dt);
    this.renderer.render(this.scene, this.camera);
  }

  destroy() {
    this.renderer.setAnimationLoop(null);
    window.removeEventListener('resize', this.onResize);
    for (const c of this.climbers.values()) c.dispose();
    for (const t of this.trees.values()) t.dispose();
    this.climbers.clear();
    this.trees.clear();
    if (this.worldGroup) disposeTree(this.worldGroup);
    this.particles.dispose();
    this.renderer.dispose();
  }
}

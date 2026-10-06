// Cảnh 3D cho màn hình chung: đường đua, vật cản, các con vật, camera bám theo đoàn đua.
// Toạ độ server: z = quãng đường (0 → trackLen), x = lệch ngang. Trong three.js: worldZ = -z (chạy vào trong màn hình).
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';

export const FLAG = { STUN: 1, JUMP: 2, MUD: 4, FINISHED: 8, TURBO: 16, BUMP: 32 };

const INTERP_DELAY_MS = 100;
const LEAD_VIEW_BEHIND = 16; // camera nhìn từ con dẫn đầu lùi về bấy nhiêu mét
const TRACK_EXTRA_BEFORE = 40;
const TRACK_EXTRA_AFTER = 100;

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, k) => a + (b - a) * k;
const damp = (current, target, rate, dt) => current + (target - current) * (1 - Math.exp(-rate * dt));

export function trackWidthFor(count) {
  return clamp(4 + count * 1.2, 8, 18);
}

// ---------- Tải model ----------

const loader = new GLTFLoader();
const templates = new Map();

function findClip(clips, names) {
  for (const n of names) {
    const exact = clips.find(c => c.name === n);
    if (exact) return exact;
  }
  for (const n of names) {
    const prefixed = clips.find(c => c.name.endsWith('|' + n));
    if (prefixed) return prefixed;
  }
  return null;
}

function prepareTemplate(gltf, def, manifest) {
  const root = gltf.scene;
  root.traverse(o => {
    if (!o.isMesh) return;
    o.castShadow = true;
    o.frustumCulled = false; // bounding box của skinned mesh không theo hoạt ảnh, tắt để khỏi bị biến mất
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    for (const m of mats) {
      if (m && 'metalness' in m) {
        m.metalness = 0;
        m.roughness = Math.max(m.roughness ?? 1, 0.6);
      }
    }
  });

  // Đo kích thước thật (có tính khung xương) rồi quy về cùng chiều dài targetLength.
  root.updateMatrixWorld(true);
  root.traverse(o => {
    if (o.isSkinnedMesh) o.skeleton.update();
  });
  const box = new THREE.Box3().setFromObject(root);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  let scale = ((def.scale ?? 1) * manifest.targetLength) / Math.max(size.x, size.z);
  if (!Number.isFinite(scale) || scale <= 0 || scale > 1e5) {
    console.warn('Không đo được kích thước model', def.id, size);
    scale = def.scale ?? 1;
  }
  return {
    root,
    clips: gltf.animations,
    scale,
    offset: new THREE.Vector3(-center.x * scale, -box.min.y * scale, -center.z * scale),
    height: Number.isFinite(size.y * scale) ? size.y * scale : 1.5,
  };
}

function loadTemplate(def, manifest) {
  if (!templates.has(def.id)) {
    const url = '/models/' + encodeURIComponent(def.file);
    const promise = loader
      .loadAsync(url)
      .then(gltf => prepareTemplate(gltf, def, manifest))
      .catch(err => {
        console.error('Không tải được model', url, err);
        templates.delete(def.id);
        throw err;
      });
    templates.set(def.id, promise);
  }
  return templates.get(def.id);
}

// ---------- Tiện ích vẽ ----------

function textColorFor(hex) {
  const c = new THREE.Color(hex);
  return 0.299 * c.r + 0.587 * c.g + 0.114 * c.b > 0.6 ? '#111' : '#fff';
}

function roundRectPath(ctx, x, y, w, h, r) {
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

function canvasTexture(canvas, repeat) {
  const t = new THREE.CanvasTexture(canvas);
  t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 4;
  }
  return t;
}

function noiseTexture(base, dots, size = 128) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = dots;
  for (let i = 0; i < (size * size) / 10; i++) {
    const s = Math.random() * 2 + 0.5;
    ctx.globalAlpha = Math.random() * 0.6 + 0.2;
    ctx.fillRect(Math.random() * size, Math.random() * size, s, s);
  }
  ctx.globalAlpha = 1;
  return canvasTexture(c, true);
}

function checkerTexture(cols, rows) {
  const c = document.createElement('canvas');
  const cell = 32;
  c.width = cols * cell;
  c.height = rows * cell;
  const ctx = c.getContext('2d');
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      ctx.fillStyle = (x + y) % 2 ? '#111' : '#fff';
      ctx.fillRect(x * cell, y * cell, cell, cell);
    }
  }
  return canvasTexture(c, false);
}

function textSprite(text, { bg = 'rgba(0,0,0,0.55)', fg = '#fff', height = 0.6 } = {}) {
  const c = document.createElement('canvas');
  const ctx = c.getContext('2d');
  const font = 'bold 40px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
  ctx.font = font;
  const w = Math.ceil(ctx.measureText(text).width) + 36;
  const h = 60;
  c.width = w;
  c.height = h;
  ctx.font = font;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = bg;
  roundRectPath(ctx, 0, 0, w, h, 18);
  ctx.fill();
  ctx.fillStyle = fg;
  ctx.fillText(text, w / 2, h / 2 + 2);
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: canvasTexture(c), depthWrite: false, transparent: true }),
  );
  sprite.scale.set((height * w) / h, height, 1);
  return sprite;
}

function disposeTree(obj) {
  obj.traverse(o => {
    o.geometry?.dispose?.();
    const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
    for (const m of mats) {
      m.map?.dispose?.();
      m.dispose?.();
    }
  });
}

// Nhãn tên lơ lửng trên đầu. Mỗi lần đổi chữ tạo texture mới (đổi kích thước canvas trên texture cũ dễ lỗi).
class Label {
  constructor() {
    this.material = new THREE.SpriteMaterial({ depthTest: false, depthWrite: false, transparent: true });
    this.sprite = new THREE.Sprite(this.material);
    this.sprite.renderOrder = 10;
    this.text = null;
    this.color = null;
  }

  set(text, color) {
    if (text === this.text && color === this.color) return;
    this.text = text;
    this.color = color;
    const c = document.createElement('canvas');
    const ctx = c.getContext('2d');
    const font = 'bold 40px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
    ctx.font = font;
    const w = Math.ceil(ctx.measureText(text).width) + 36;
    const h = 60;
    c.width = w;
    c.height = h;
    ctx.font = font;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = color;
    roundRectPath(ctx, 0, 0, w, h, 18);
    ctx.fill();
    ctx.fillStyle = textColorFor(color);
    ctx.fillText(text, w / 2, h / 2 + 2);
    this.material.map?.dispose();
    this.material.map = canvasTexture(c);
    this.material.needsUpdate = true;
    this.sprite.scale.set((0.6 * w) / h, 0.6, 1);
  }

  dispose() {
    this.material.map?.dispose();
    this.material.dispose();
  }
}

// ---------- Một con vật ----------

const RING_GEO = new THREE.RingGeometry(0.85, 1.15, 32);

class Runner {
  constructor(player, manifest) {
    this.id = player.id;
    this.manifest = manifest;
    this.group = new THREE.Group();
    this.body = new THREE.Group(); // nghiêng khi rẽ + nhảy
    this.group.add(this.body);

    this.ringMat = new THREE.MeshBasicMaterial({ color: player.color, transparent: true, opacity: 0.9, depthWrite: false });
    this.ring = new THREE.Mesh(RING_GEO, this.ringMat);
    this.ring.rotation.x = -Math.PI / 2;
    this.ring.position.y = 0.05;
    this.group.add(this.ring);

    this.label = new Label();
    this.label.sprite.position.y = 2.2;
    this.group.add(this.label.sprite);

    this.yaw = manifest.modelYaw;
    this.pivot = null;
    this.mixer = null;
    this.actions = {};
    this.current = null;
    this.currentKey = null;
    this.height = 1.5;
    this.loadToken = 0;
    this.jumping = false;
    this.jumpStart = 0;
    this.hitKey = 'hitLeft';
    this.behindShown = 0;
    this.disposed = false;
    this.setPlayer(player);
  }

  setPlayer(player) {
    this.name = player.name;
    this.color = player.color;
    this.ringMat.color.set(player.color);
    this.label.set(player.name, player.color);
    if (player.animal !== this.animal) {
      this.animal = player.animal;
      this.loadModel(player.animal);
    }
  }

  async loadModel(animalId) {
    const token = ++this.loadToken;
    const def = this.manifest.animals.find(a => a.id === animalId) || this.manifest.animals[0];
    let tpl = null;
    try {
      tpl = await loadTemplate(def, this.manifest);
    } catch {
      tpl = null;
    }
    if (token !== this.loadToken || this.disposed) return;

    if (this.pivot) {
      this.body.remove(this.pivot);
      this.mixer?.stopAllAction();
    }
    this.pivot = new THREE.Group();
    this.pivot.rotation.y = this.yaw;
    this.actions = {};
    this.current = null;
    this.currentKey = null;

    if (tpl) {
      const model = SkeletonUtils.clone(tpl.root);
      model.scale.setScalar(tpl.scale);
      model.position.copy(tpl.offset);
      this.pivot.add(model);
      this.mixer = new THREE.AnimationMixer(model);
      for (const [key, names] of Object.entries(this.manifest.clips)) {
        const clip = findClip(tpl.clips, names);
        if (clip) this.actions[key] = this.mixer.clipAction(clip);
      }
      this.height = tpl.height;
    } else {
      // Tải model lỗi: dùng khối tạm để vẫn chơi được.
      const box = new THREE.Mesh(
        new THREE.BoxGeometry(0.8, 1.2, this.manifest.targetLength),
        new THREE.MeshLambertMaterial({ color: this.color }),
      );
      box.position.y = 0.6;
      box.castShadow = true;
      this.pivot.add(box);
      this.mixer = null;
      this.height = 1.2;
    }
    this.body.add(this.pivot);
    this.label.sprite.position.y = this.height + 0.7;
    this.setAnim('idle');
  }

  setYaw(yaw) {
    this.yaw = yaw;
    if (this.pivot) this.pivot.rotation.y = yaw;
  }

  setAnim(key, { once = false, timeScale = 1 } = {}) {
    const action = this.actions[key] || this.actions.run || this.actions.idle;
    if (!action) return;
    if (this.currentKey === key) {
      action.setEffectiveTimeScale(timeScale);
      return;
    }
    action.reset();
    action.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, Infinity);
    action.clampWhenFinished = once;
    action.setEffectiveTimeScale(timeScale).setEffectiveWeight(1).fadeIn(0.18).play();
    if (this.current && this.current !== action) this.current.fadeOut(0.18);
    this.current = action;
    this.currentKey = key;
  }

  setShown(shown) {
    this.body.visible = shown;
    this.ring.visible = shown;
    this.label.sprite.position.y = shown ? this.height + 0.7 : 1;
  }

  placeLobby(x, dt) {
    this.group.visible = true;
    this.setShown(true);
    this.group.position.set(x, 0, 0);
    this.body.rotation.y = damp(this.body.rotation.y, 0, 8, dt);
    this.body.position.y = 0;
    this.setAnim('idle');
    this.showBehind(0);
  }

  // Con bị tụt ra khỏi khung hình: không vẽ con vật, chỉ hiện nhãn "Tên ↓45m" ở mép dưới màn hình.
  placeStraggler(p, edgeZ, behind) {
    this.group.visible = true;
    this.setShown(false);
    this.group.position.set(p.x, 0, -edgeZ);
    this.jumping = false;
    this.showBehind(behind);
  }

  // p: {x, z, sp, f, r} đã nội suy.
  placeRace(p, renderZ, behind, dt, now, state, jumpMs) {
    this.group.visible = true;
    this.setShown(true);
    const prevX = this.group.position.x;
    this.group.position.x = p.x;
    this.group.position.z = -renderZ;

    const latVel = dt > 0 ? (p.x - prevX) / dt : 0;
    const targetYaw = p.f & FLAG.STUN ? 0 : -Math.atan2(latVel, Math.max(p.sp, 3)) * 0.9;
    this.body.rotation.y = damp(this.body.rotation.y, clamp(targetYaw, -0.6, 0.6), 10, dt);

    if (p.f & FLAG.JUMP) {
      if (!this.jumping) {
        this.jumping = true;
        this.jumpStart = now;
      }
      const k = clamp((now - this.jumpStart) / jumpMs, 0, 1);
      this.body.position.y = Math.sin(Math.PI * k) * this.manifest.jumpHeight;
    } else {
      this.jumping = false;
      this.body.position.y = damp(this.body.position.y, 0, 12, dt);
    }

    const pulse = p.f & FLAG.TURBO ? 1.2 + 0.2 * Math.sin(now / 50) : 1;
    this.ring.scale.setScalar(pulse);

    this.chooseAnim(p, state, jumpMs);
    this.showBehind(behind);
  }

  chooseAnim(p, state, jumpMs) {
    const f = p.f;
    if (state === 'countdown') return this.setAnim('idle');
    if (f & FLAG.FINISHED) {
      if (p.sp > 1.5) return this.setAnim('run', { timeScale: clamp(p.sp / this.manifest.runSpeedRef, 0.5, 2.2) });
      return this.setAnim(p.r === 1 ? 'celebrate' : 'idle');
    }
    if (state === 'finished') return this.setAnim('idle');
    if (f & FLAG.STUN) return this.setAnim(this.hitKey, { once: true });
    if (f & FLAG.JUMP) {
      const clip = this.actions.jump?.getClip();
      return this.setAnim('jump', { once: true, timeScale: clip ? clip.duration / (jumpMs / 1000) : 1 });
    }
    // Không lắc thì đứng yên; chạy chậm thì đi bộ; nhanh thì phi.
    if (p.sp < 0.5) return this.setAnim('idle');
    if (f & FLAG.MUD || p.sp < 5) return this.setAnim('walk', { timeScale: clamp(p.sp / 2.5, 0.5, 2) });
    return this.setAnim('run', { timeScale: clamp(p.sp / this.manifest.runSpeedRef, 0.5, 2.2) });
  }

  showBehind(behind) {
    const rounded = behind > 0 ? Math.max(5, Math.round(behind / 5) * 5) : 0;
    if (rounded === this.behindShown) return;
    this.behindShown = rounded;
    this.label.set(rounded ? `${this.name} ↓${rounded}m` : this.name, this.color);
  }

  dispose() {
    this.disposed = true;
    this.mixer?.stopAllAction();
    this.label.dispose();
    this.ringMat.dispose();
    this.group.parent?.remove(this.group);
  }
}

// ---------- Hạt hiệu ứng (bụi, cà rốt, pháo giấy) ----------

class Particles {
  constructor(scene) {
    this.scene = scene;
    this.items = [];
    this.geo = new THREE.BoxGeometry(0.14, 0.14, 0.14);
    this.mats = new Map();
  }

  mat(color) {
    if (!this.mats.has(color)) this.mats.set(color, new THREE.MeshBasicMaterial({ color }));
    return this.mats.get(color);
  }

  burst(pos, colors, { count = 20, speed = 3, up = 4, life = 1.1 } = {}) {
    for (let i = 0; i < count; i++) {
      const mesh = new THREE.Mesh(this.geo, this.mat(colors[i % colors.length]));
      mesh.position.copy(pos);
      const a = Math.random() * Math.PI * 2;
      const v = new THREE.Vector3(Math.cos(a) * speed * Math.random(), up * (0.5 + Math.random()), Math.sin(a) * speed * Math.random());
      this.scene.add(mesh);
      this.items.push({ mesh, v, age: 0, life: life * (0.7 + Math.random() * 0.6) });
    }
  }

  update(dt) {
    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i];
      it.age += dt;
      it.v.y -= 9.8 * dt;
      it.mesh.position.addScaledVector(it.v, dt);
      it.mesh.rotation.x += dt * 6;
      it.mesh.rotation.y += dt * 4;
      if (it.age > it.life || it.mesh.position.y < -0.5) {
        this.scene.remove(it.mesh);
        this.items.splice(i, 1);
      }
    }
  }
}

// ---------- Vật cản ----------

const MUD_MAT = new THREE.MeshLambertMaterial({ color: 0x5b3a1e, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
const MUD_DARK_MAT = new THREE.MeshLambertMaterial({ color: 0x3f2712, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
const CIRCLE_GEO = new THREE.CircleGeometry(1, 24);
const POST_MAT = new THREE.MeshLambertMaterial({ color: 0x8b5a2b });
const PLANK_WHITE = new THREE.MeshLambertMaterial({ color: 0xf5f5f5 });
const PLANK_RED = new THREE.MeshLambertMaterial({ color: 0xd63a3a });
const CARROT_MAT = new THREE.MeshLambertMaterial({ color: 0xff8a1e });
const LEAF_MAT = new THREE.MeshLambertMaterial({ color: 0x3fae3f });

function makeObstacle(o) {
  const g = new THREE.Group();
  g.position.set(o.x, 0, -o.z);

  if (o.type === 'mud') {
    const pool = new THREE.Mesh(CIRCLE_GEO, MUD_MAT);
    pool.rotation.x = -Math.PI / 2;
    pool.scale.set(o.w, o.d, 1);
    pool.position.y = 0.04;
    pool.receiveShadow = true;
    g.add(pool);
    for (let i = 0; i < 3; i++) {
      const spot = new THREE.Mesh(CIRCLE_GEO, MUD_DARK_MAT);
      spot.rotation.x = -Math.PI / 2;
      spot.scale.set(o.w * 0.25, o.d * 0.2, 1);
      spot.position.set((Math.random() - 0.5) * o.w, 0.05, (Math.random() - 0.5) * o.d);
      g.add(spot);
    }
  } else if (o.type === 'fence') {
    const postGeo = new THREE.BoxGeometry(0.15, 1.05, 0.15);
    for (const side of [-1, 1]) {
      const post = new THREE.Mesh(postGeo, POST_MAT);
      post.position.set(side * o.w, 0.52, 0);
      post.castShadow = true;
      g.add(post);
    }
    const plankGeo = new THREE.BoxGeometry(o.w * 2, 0.14, 0.08);
    const low = new THREE.Mesh(plankGeo, PLANK_WHITE);
    low.position.y = 0.45;
    const high = new THREE.Mesh(plankGeo, PLANK_RED);
    high.position.y = 0.85;
    low.castShadow = high.castShadow = true;
    g.add(low, high);
  } else {
    const carrot = new THREE.Group();
    const root = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.8, 8), CARROT_MAT);
    root.rotation.x = Math.PI;
    carrot.add(root);
    for (let i = 0; i < 3; i++) {
      const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.35, 5), LEAF_MAT);
      leaf.position.set((i - 1) * 0.07, 0.55, 0);
      leaf.rotation.z = (i - 1) * 0.35;
      carrot.add(leaf);
    }
    carrot.scale.setScalar(1.3);
    carrot.position.y = 1;
    g.add(carrot);
    g.userData.spin = carrot;
  }
  return g;
}

// ---------- Cảnh chính ----------

export class RaceScene {
  constructor(canvas, manifest, quality = 'high') {
    this.manifest = manifest;
    this.high = quality === 'high';
    this.modelYaw = manifest.modelYaw;

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: this.high, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, this.high ? 2 : 1));
    this.renderer.shadowMap.enabled = this.high;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x9fd8ff);
    this.scene.fog = new THREE.Fog(0xbfe6ff, 80, 240);

    this.camera = new THREE.PerspectiveCamera(50, 1, 0.5, 600);

    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x6a8f4e, 1.5));
    this.sun = new THREE.DirectionalLight(0xffffff, 2.2);
    this.sun.castShadow = this.high;
    this.sun.shadow.mapSize.set(2048, 2048);
    Object.assign(this.sun.shadow.camera, { left: -30, right: 30, top: 30, bottom: -30, near: 1, far: 120 });
    this.sun.shadow.camera.updateProjectionMatrix();
    this.scene.add(this.sun, this.sun.target);

    this.runners = new Map();
    this.snapshots = [];
    this.obstacles = new Map();
    this.obstacleGroup = new THREE.Group();
    this.scene.add(this.obstacleGroup);
    this.trackGroup = null;
    this.trackWidth = 0;
    this.trackLen = 400;
    this.jumpMs = 900;
    this.mode = 'lobby';
    this.lobbyOrder = [];
    this.focus = 0;
    this.particles = new Particles(this.scene);
    this.clock = new THREE.Clock();

    this.buildTrack(trackWidthFor(1), this.trackLen);
    this.onResize = () => this.resize();
    window.addEventListener('resize', this.onResize);
    this.resize();
    this.renderer.setAnimationLoop(() => this.frame());
  }

  // Đổi sang game khác: dừng vẽ, giải phóng bộ nhớ GPU.
  destroy() {
    this.renderer.setAnimationLoop(null);
    window.removeEventListener('resize', this.onResize);
    for (const r of this.runners.values()) r.dispose();
    this.runners.clear();
    this.clearObstacles();
    if (this.trackGroup) disposeTree(this.trackGroup);
    this.renderer.dispose();
  }

  resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  buildTrack(width, trackLen) {
    if (this.trackGroup && width === this.trackWidth && trackLen === this.trackLen) return;
    if (this.trackGroup) {
      this.scene.remove(this.trackGroup);
      disposeTree(this.trackGroup);
    }
    this.trackWidth = width;
    this.trackLen = trackLen;
    const g = new THREE.Group();
    this.trackGroup = g;
    this.scene.add(g);

    const len = trackLen + TRACK_EXTRA_BEFORE + TRACK_EXTRA_AFTER;
    const centerZ = -(len / 2 - TRACK_EXTRA_BEFORE);
    const half = width / 2;

    const grassTex = noiseTexture('#6fbf5b', '#4f9c3f');
    grassTex.repeat.set(240 / 6, len / 6);
    const grass = new THREE.Mesh(new THREE.PlaneGeometry(240, len), new THREE.MeshLambertMaterial({ map: grassTex }));
    grass.rotation.x = -Math.PI / 2;
    grass.position.set(0, 0, centerZ);
    grass.receiveShadow = true;
    g.add(grass);

    const dirtTex = noiseTexture('#c89f6d', '#9c7446');
    dirtTex.repeat.set((width + 2) / 4, len / 4);
    const dirt = new THREE.Mesh(
      new THREE.PlaneGeometry(width + 2, len),
      new THREE.MeshLambertMaterial({ map: dirtTex, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }),
    );
    dirt.rotation.x = -Math.PI / 2;
    dirt.position.set(0, 0.02, centerZ);
    dirt.receiveShadow = true;
    g.add(dirt);

    // Rào trắng hai bên.
    const railMat = new THREE.MeshLambertMaterial({ color: 0xffffff });
    const postGeo = new THREE.BoxGeometry(0.14, 1.1, 0.14);
    const postsPerSide = Math.ceil(len / 4);
    const posts = new THREE.InstancedMesh(postGeo, railMat, postsPerSide * 2);
    const m = new THREE.Matrix4();
    let i = 0;
    for (const side of [-1, 1]) {
      for (let k = 0; k < postsPerSide; k++) {
        m.makeTranslation(side * (half + 1), 0.55, TRACK_EXTRA_BEFORE - k * 4);
        posts.setMatrixAt(i++, m);
      }
    }
    posts.castShadow = true;
    g.add(posts);
    const boardGeo = new THREE.BoxGeometry(0.08, 0.12, len);
    for (const side of [-1, 1]) {
      for (const y of [0.55, 0.95]) {
        const board = new THREE.Mesh(boardGeo, railMat);
        board.position.set(side * (half + 1), y, centerZ);
        g.add(board);
      }
    }

    // Vạch xuất phát và vạch đích.
    const lineMat = new THREE.MeshBasicMaterial({ color: 0xffffff, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    const start = new THREE.Mesh(new THREE.PlaneGeometry(width + 2, 0.4), lineMat);
    start.rotation.x = -Math.PI / 2;
    start.position.set(0, 0.03, 0);
    g.add(start);

    const finish = new THREE.Mesh(
      new THREE.PlaneGeometry(width + 2, 1.6),
      new THREE.MeshBasicMaterial({ map: checkerTexture(Math.round((width + 2) / 0.8), 2), polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
    );
    finish.rotation.x = -Math.PI / 2;
    finish.position.set(0, 0.03, -trackLen);
    g.add(finish);

    const archMat = new THREE.MeshLambertMaterial({ color: 0xd63a3a });
    const poleGeo = new THREE.CylinderGeometry(0.2, 0.2, 5.5, 10);
    for (const side of [-1, 1]) {
      const pole = new THREE.Mesh(poleGeo, archMat);
      pole.position.set(side * (half + 1.4), 2.75, -trackLen);
      pole.castShadow = true;
      g.add(pole);
    }
    const banner = textSprite('🏁 ĐÍCH 🏁', { bg: '#d63a3a', height: 1.4 });
    banner.position.set(0, 5.4, -trackLen);
    g.add(banner);

    // Cột mốc khoảng cách.
    for (let d = 50; d < trackLen; d += 50) {
      const sign = textSprite(`${d}m`, { height: 0.7 });
      sign.position.set(-(half + 2.2), 1.6, -d);
      g.add(sign);
    }

    // Cây và đồi (instanced cho nhẹ).
    const treeCount = this.high ? 240 : 90;
    const trunks = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.15, 0.22, 1.2, 6), new THREE.MeshLambertMaterial({ color: 0x7a5230 }), treeCount);
    const crowns = new THREE.InstancedMesh(new THREE.ConeGeometry(1.2, 2.8, 7), new THREE.MeshLambertMaterial({ color: 0x2f8f3a }), treeCount);
    const q = new THREE.Quaternion();
    const s = new THREE.Vector3();
    const p = new THREE.Vector3();
    for (let t = 0; t < treeCount; t++) {
      const side = t % 2 ? 1 : -1;
      const x = side * (half + 4 + Math.random() * 50);
      const z = TRACK_EXTRA_BEFORE - Math.random() * len;
      const k = 0.7 + Math.random() * 0.8;
      s.set(k, k, k);
      p.set(x, 0.6 * k, z);
      trunks.setMatrixAt(t, m.compose(p, q, s));
      p.set(x, (1.2 + 1.4) * k, z);
      crowns.setMatrixAt(t, m.compose(p, q, s));
    }
    if (this.high) crowns.castShadow = true;
    g.add(trunks, crowns);

    const hillMat = new THREE.MeshLambertMaterial({ color: 0x5da65a, flatShading: true });
    const hillGeo = new THREE.IcosahedronGeometry(1, 1);
    for (let h = 0; h < 16; h++) {
      const hill = new THREE.Mesh(hillGeo, hillMat);
      const side = h % 2 ? 1 : -1;
      hill.position.set(side * (70 + Math.random() * 40), -2, TRACK_EXTRA_BEFORE - (h / 16) * (len + 80));
      hill.scale.set(30 + Math.random() * 20, 10 + Math.random() * 10, 30 + Math.random() * 20);
      g.add(hill);
    }
  }

  clearObstacles() {
    for (const o of this.obstacles.values()) {
      this.obstacleGroup.remove(o);
      disposeTree(o);
    }
    this.obstacles.clear();
  }

  // Dữ liệu phòng thay đổi (vào/ra, đổi con vật...).
  setPlayers(players, state, trackLen = this.trackLen) {
    const ids = new Set(players.map(p => p.id));
    for (const [id, r] of this.runners) {
      if (!ids.has(id)) {
        r.dispose();
        this.runners.delete(id);
      }
    }
    for (const p of players) {
      let r = this.runners.get(p.id);
      if (!r) {
        r = new Runner(p, this.manifest);
        r.setYaw(this.modelYaw);
        this.runners.set(p.id, r);
        this.scene.add(r.group);
      } else {
        r.setPlayer(p);
      }
    }
    if (state === 'lobby') {
      if (this.mode !== 'lobby') {
        this.mode = 'lobby';
        this.snapshots = [];
        this.clearObstacles();
      }
      this.lobbyOrder = players.map(p => p.id);
      this.buildTrack(trackWidthFor(Math.max(1, players.length)), trackLen);
    }
  }

  setupRace(info) {
    this.mode = 'race';
    this.snapshots = [];
    this.jumpMs = info.jumpMs || 900;
    this.racerIds = new Set(info.racers);
    this.buildTrack(info.width, info.trackLen);
    this.clearObstacles();
    for (const o of info.obstacles) {
      const mesh = makeObstacle(o);
      mesh.userData.type = o.type;
      this.obstacles.set(o.id, mesh);
      this.obstacleGroup.add(mesh);
    }
    for (const id of info.taken || []) this.hideCarrot(id);
    this.focus = 0;
  }

  hideCarrot(id) {
    const o = this.obstacles.get(id);
    if (o && o.visible) o.visible = false;
  }

  pushSnapshot(s) {
    s.recv = performance.now();
    this.snapshots.push(s);
    if (this.snapshots.length > 30) this.snapshots.shift();
    if (s.taken) for (const id of s.taken) this.hideCarrot(id);
  }

  sample(now) {
    const snaps = this.snapshots;
    if (!snaps.length) return null;
    const t = now - INTERP_DELAY_MS;
    let a = snaps[0];
    let b = snaps[0];
    for (let i = snaps.length - 1; i >= 0; i--) {
      if (snaps[i].recv <= t) {
        a = snaps[i];
        b = snaps[i + 1] || snaps[i];
        break;
      }
    }
    const k = a === b ? 0 : clamp((t - a.recv) / (b.recv - a.recv), 0, 1);
    const prev = new Map(a.p.map(p => [p.id, p]));
    const players = b.p.map(pb => {
      const pa = prev.get(pb.id) || pb;
      return { ...pb, x: lerp(pa.x, pb.x, k), z: lerp(pa.z, pb.z, k) };
    });
    return { state: b.state, players };
  }

  fx(ev) {
    const r = this.runners.get(ev.pid);
    const pos = r ? r.group.position.clone() : new THREE.Vector3();
    if (ev.type === 'fence') {
      if (r) r.hitKey = ev.side === 'left' ? 'hitLeft' : 'hitRight';
      pos.y = 0.8;
      this.particles.burst(pos, ['#8b5a2b', '#f5f5f5', '#d63a3a'], { count: 16, speed: 3, up: 3 });
    } else if (ev.type === 'carrot') {
      this.hideCarrot(ev.oid);
      pos.y = 1.2;
      this.particles.burst(pos, ['#ff8a1e', '#ffd166', '#3fae3f'], { count: 22, speed: 2.5, up: 4 });
    } else if (ev.type === 'bump') {
      pos.y = 0.6;
      this.particles.burst(pos, ['#c89f6d', '#e8d8b0', '#ffffff'], { count: 8, speed: 2.5, up: 2, life: 0.5 });
    } else if (ev.type === 'turbo') {
      pos.y = 1;
      this.particles.burst(pos, ['#ff3d00', '#ffb020', '#ffd166'], { count: 30, speed: 4, up: 3, life: 0.8 });
    } else if (ev.type === 'clear') {
      pos.y = 0.5;
      this.particles.burst(pos, ['#ffffff', '#e8d8b0'], { count: 10, speed: 2, up: 2, life: 0.6 });
    } else if (ev.type === 'finish') {
      const at = new THREE.Vector3(0, 1, -this.trackLen);
      if (ev.rank === 1) {
        this.particles.burst(at, ['#e6194b', '#ffe119', '#4363d8', '#3cb44b', '#f032e6', '#ffffff'], { count: 140, speed: 7, up: 9, life: 2.4 });
      } else if (r) {
        this.particles.burst(pos.setY(1), [r.color, '#ffffff'], { count: 24, speed: 3, up: 5 });
      }
    }
  }

  // Phím Y trên màn hình host: xoay model 90° nếu con vật chạy ngang/ngược.
  rotateModels(delta) {
    this.modelYaw = (this.modelYaw + delta) % (Math.PI * 2);
    for (const r of this.runners.values()) r.setYaw(this.modelYaw);
    return this.modelYaw;
  }

  updateCamera(dt, focus, sway = 0) {
    const w = this.trackWidth;
    const narrow = clamp(1.6 / this.camera.aspect, 1, 2);
    const back = (12 + w * 0.25) * narrow;
    const height = (7 + w * 0.45) * narrow;
    this.camera.position.set(sway, height, -(focus - back));
    this.camera.lookAt(0, 0, -(focus + 12));
    this.sun.position.set(-15, 35, -(focus - 10));
    this.sun.target.position.set(0, 0, -(focus + 10));
  }

  updateLobby(dt, now) {
    const n = this.lobbyOrder.length;
    const lane = this.trackWidth / Math.max(1, n);
    this.lobbyOrder.forEach((id, i) => {
      this.runners.get(id)?.placeLobby(-this.trackWidth / 2 + lane * (i + 0.5), dt);
    });
    this.focus = damp(this.focus, 2, 2, dt);
    this.updateCamera(dt, this.focus, Math.sin(now / 5000) * 3);
  }

  updateRace(dt, now) {
    const s = this.sample(now);
    if (!s) {
      this.updateCamera(dt, this.focus);
      return;
    }
    // Con dẫn đầu (chưa về đích); tất cả đã về đích thì lấy con xa nhất.
    let lead = -Infinity;
    for (const p of s.players) if (!(p.f & FLAG.FINISHED)) lead = Math.max(lead, p.z);
    if (lead === -Infinity) for (const p of s.players) lead = Math.max(lead, p.z);
    if (!Number.isFinite(lead)) lead = 0;

    // Camera luôn bám nhóm dẫn đầu: con đầu ở khoảng giữa-trên màn hình,
    // những con bám sát trong ~LEAD_VIEW_BEHIND mét phía sau vẫn thấy rõ.
    const target = s.state === 'countdown' ? 0 : Math.max(0, lead - LEAD_VIEW_BEHIND);
    this.focus = damp(this.focus, target, 2.5, dt);
    this.updateCamera(dt, this.focus);

    // Tụt ra khỏi mép dưới khung hình thì chỉ hiện nhãn tên ở mép dưới.
    const minZ = this.focus - 2.5;
    const seen = new Set();
    for (const p of s.players) {
      const r = this.runners.get(p.id);
      if (!r) continue;
      seen.add(p.id);
      if (p.z < minZ) {
        r.placeStraggler(p, this.focus - 2, this.focus - p.z);
        continue;
      }
      r.placeRace(p, p.z, 0, dt, now, s.state, this.jumpMs);
      if (p.f & FLAG.TURBO && Math.random() < (this.high ? 0.5 : 0.25)) {
        // Vệt lửa phía sau khi đang TURBO.
        const tail = r.group.position.clone();
        tail.y = 0.4 + Math.random() * 0.6;
        tail.z += 1.1;
        this.particles.burst(tail, ['#ff3d00', '#ffb020', '#ffd166'], { count: 1, speed: 0.8, up: 1.2, life: 0.45 });
      }
    }
    for (const [id, r] of this.runners) if (!seen.has(id)) r.group.visible = false;
  }

  frame() {
    const dt = Math.min(0.05, this.clock.getDelta());
    const now = performance.now();
    if (this.mode === 'race') this.updateRace(dt, now);
    else this.updateLobby(dt, now);

    for (const r of this.runners.values()) r.mixer?.update(dt);
    for (const o of this.obstacles.values()) {
      const spin = o.userData.spin;
      if (spin) {
        spin.rotation.y += dt * 2;
        spin.position.y = 1 + Math.sin(now / 300 + o.position.z) * 0.15;
      }
    }
    this.particles.update(dt);
    this.renderer.render(this.scene, this.camera);
  }
}

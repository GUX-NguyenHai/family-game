// Bộ đồ nghề 3D dùng chung cho các game (three.js): tải model con vật/model khác, nhãn tên, chữ nổi,
// texture tự vẽ, hạt hiệu ứng, giải phóng bộ nhớ. Game nào cần cảnh 3D thì import từ đây.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, k) => a + (b - a) * k;
export const damp = (current, target, rate, dt) => current + (target - current) * (1 - Math.exp(-rate * dt));

// ---------- Tải model ----------

const loader = new GLTFLoader();
const animalTemplates = new Map();
const modelTemplates = new Map();

export function findClip(clips, names) {
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

function prepareMeshes(root) {
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
}

// Đo kích thước thật (có tính khung xương).
function measure(root) {
  root.updateMatrixWorld(true);
  root.traverse(o => {
    if (o.isSkinnedMesh) o.skeleton.update();
  });
  const box = new THREE.Box3().setFromObject(root);
  return { box, size: box.getSize(new THREE.Vector3()), center: box.getCenter(new THREE.Vector3()) };
}

function prepareAnimalTemplate(gltf, def, manifest) {
  const root = gltf.scene;
  prepareMeshes(root);
  // Quy mọi con vật về cùng chiều dài targetLength.
  const { box, size, center } = measure(root);
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

// Con vật trong public/assets/animals.json (tải từ /models/). Trả về Promise template, dùng chung giữa các bản sao.
export function loadAnimalTemplate(def, manifest) {
  if (!animalTemplates.has(def.id)) {
    const url = '/models/' + encodeURIComponent(def.file);
    const promise = loader
      .loadAsync(url)
      .then(gltf => prepareAnimalTemplate(gltf, def, manifest))
      .catch(err => {
        console.error('Không tải được model', url, err);
        animalTemplates.delete(def.id);
        throw err;
      });
    animalTemplates.set(def.id, promise);
  }
  return animalTemplates.get(def.id);
}

// Model bất kỳ (thuyền, hải đăng, khỉ...). Trả về { root, size, center, min, clips } chưa co giãn;
// dùng cloneModel() để lấy bản sao. clips = hoạt ảnh có sẵn trong file (có thể rỗng).
export function loadModel(url) {
  if (!modelTemplates.has(url)) {
    const promise = loader
      .loadAsync(url)
      .then(gltf => {
        const root = gltf.scene;
        prepareMeshes(root);
        const { box, size, center } = measure(root);
        return { root, size, center, min: box.min.clone(), clips: gltf.animations || [] };
      })
      .catch(err => {
        console.error('Không tải được model', url, err);
        modelTemplates.delete(url);
        throw err;
      });
    modelTemplates.set(url, promise);
  }
  return modelTemplates.get(url);
}

// Bản sao model, xoay cho chiều dài nằm theo trục z, co giãn để dài đúng `length` (hoặc cao đúng `height`),
// đáy đặt ở y = 0, tâm ở gốc. Trả về { object, model, width, height, length } (kích thước sau khi co giãn);
// `model` là bản sao bên trong, dùng để gắn hoạt ảnh (AnimationMixer).
// Dùng SkeletonUtils.clone để model có xương (hoạt ảnh) không bị hỏng khi nhân bản.
export function cloneModel(tpl, { length = null, height = null } = {}) {
  const model = SkeletonUtils.clone(tpl.root);
  const pivot = new THREE.Group();
  const alongX = tpl.size.x > tpl.size.z; // model nằm ngang theo trục x thì xoay 90°
  const len = alongX ? tpl.size.x : tpl.size.z;
  const wid = alongX ? tpl.size.z : tpl.size.x;
  let scale = 1;
  if (length) scale = length / len;
  else if (height) scale = height / tpl.size.y;
  if (!Number.isFinite(scale) || scale <= 0) scale = 1;
  model.scale.setScalar(scale);
  model.position.set(-tpl.center.x * scale, -tpl.min.y * scale, -tpl.center.z * scale);
  const inner = new THREE.Group();
  inner.add(model);
  if (alongX) inner.rotation.y = Math.PI / 2;
  pivot.add(inner);
  return { object: pivot, model, width: wid * scale, height: tpl.size.y * scale, length: len * scale };
}

// ---------- Texture, chữ ----------

export function textColorFor(hex) {
  const c = new THREE.Color(hex);
  return 0.299 * c.r + 0.587 * c.g + 0.114 * c.b > 0.6 ? '#111' : '#fff';
}

export function roundRectPath(ctx, x, y, w, h, r) {
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

export function canvasTexture(canvas, repeat) {
  const t = new THREE.CanvasTexture(canvas);
  t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 4;
  }
  return t;
}

export function noiseTexture(base, dots, size = 128) {
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

export function checkerTexture(cols, rows) {
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

export function textSprite(text, { bg = 'rgba(0,0,0,0.55)', fg = '#fff', height = 0.6 } = {}) {
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

export function disposeTree(obj) {
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
export class Label {
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

// ---------- Hạt hiệu ứng (bụi, nước bắn, pháo giấy) ----------

export class Particles {
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

  dispose() {
    for (const it of this.items) this.scene.remove(it.mesh);
    this.items = [];
    this.geo.dispose();
    for (const m of this.mats.values()) m.dispose();
  }
}

// Cảnh 3D Leo cây hái dừa: bãi biển, hàng cây dừa (mỗi người một cây), con vật ôm thân cây leo lên.
// Thân cây tự dựng (thẳng, có khúc rêu xanh = đoạn trơn) để con vật bám đúng thân; cây dừa tải về dùng trang trí xung quanh.
// Toạ độ: x = ngang (các cây xếp hàng), y = độ cao, camera nhìn từ phía trước (z dương).
import * as THREE from 'three';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import {
  clamp,
  damp,
  findClip,
  loadAnimalTemplate,
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
const ANIMAL_SCALE = 0.6; // con vật thu nhỏ cho vừa thân cây
const BASE_Y = 0.7; // độ cao 0m của người leo (con vật đứng dưới gốc)

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
  constructor(height, slipFrom, slipTo) {
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

    // Khúc rêu trơn.
    const slipH = Math.max(0.1, slipTo - slipFrom);
    const mossTex = trunkTexture('#3f8f3a', '#57b04f');
    mossTex.repeat.set(1, slipH / 0.4);
    const moss = new THREE.Mesh(
      new THREE.CylinderGeometry(TRUNK_R * 0.95, TRUNK_R * 1.02, slipH, 10),
      new THREE.MeshLambertMaterial({ map: mossTex }),
    );
    moss.position.y = BASE_Y + slipFrom + slipH / 2;
    this.group.add(moss);

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

// ---------- Một con vật ôm thân cây ----------

class Climber {
  constructor(player, manifest) {
    this.manifest = manifest;
    this.group = new THREE.Group(); // đặt ở thân cây, nâng theo độ cao
    this.hug = new THREE.Group(); // dựng đứng con vật: đầu hướng lên, bụng áp vào thân cây
    this.hug.rotation.x = Math.PI / 2;
    this.hug.position.z = TRUNK_R + 0.05;
    this.group.add(this.hug);
    this.label = new Label();
    this.group.add(this.label.sprite);
    this.pivot = null;
    this.mixer = null;
    this.actions = {};
    this.current = null;
    this.currentKey = null;
    this.loadToken = 0;
    this.disposed = false;
    this.animal = undefined; // khác mọi giá trị thật để lần đầu luôn tải model
    this.y = 0;
    this.setPlayer(player);
  }

  setPlayer(player) {
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
      tpl = await loadAnimalTemplate(def, this.manifest);
    } catch {
      tpl = null;
    }
    if (token !== this.loadToken || this.disposed) return;
    if (this.pivot) {
      this.hug.remove(this.pivot);
      this.mixer?.stopAllAction();
    }
    this.pivot = new THREE.Group();
    this.pivot.rotation.y = this.manifest.modelYaw; // quay mặt vào thân cây (-z) trước khi dựng đứng
    this.actions = {};
    this.current = null;
    this.currentKey = null;
    if (tpl) {
      const model = SkeletonUtils.clone(tpl.root);
      model.scale.setScalar(tpl.scale * ANIMAL_SCALE);
      model.position.copy(tpl.offset).multiplyScalar(ANIMAL_SCALE);
      this.pivot.add(model);
      this.mixer = new THREE.AnimationMixer(model);
      for (const [key, names] of Object.entries(this.manifest.clips)) {
        const clip = findClip(tpl.clips, names);
        if (clip) this.actions[key] = this.mixer.clipAction(clip);
      }
    } else {
      const box = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 1.2), new THREE.MeshLambertMaterial({ color: 0xcccccc }));
      box.position.y = 0.25;
      this.pivot.add(box);
      this.mixer = null;
    }
    this.hug.add(this.pivot);
    this.label.sprite.position.y = 1.3;
    this.setAnim('idle');
  }

  setAnim(key, timeScale = 1) {
    const action = this.actions[key] || this.actions.idle;
    if (!action) return;
    if (this.currentKey === key) {
      action.setEffectiveTimeScale(timeScale);
      return;
    }
    action.reset();
    action.setLoop(THREE.LoopRepeat, Infinity);
    action.setEffectiveTimeScale(timeScale).setEffectiveWeight(1).fadeIn(0.2).play();
    if (this.current && this.current !== action) this.current.fadeOut(0.2);
    this.current = action;
    this.currentKey = key;
  }

  // y: độ cao (m), d: mức lắc 0..1, f: cờ trạng thái.
  place(x, y, d, f, state, dt, now) {
    this.y = damp(this.y, y, 15, dt);
    this.group.position.set(x, BASE_Y + this.y, 0);
    // Đang tụt thì rung lắc qua lại cho thấy đang trượt.
    this.group.rotation.z = f & FLAG.SLIDING ? Math.sin(now / 60) * 0.08 : damp(this.group.rotation.z, 0, 10, dt);
    if (f & FLAG.TOP) this.setAnim('celebrate');
    else if (state === 'climb' && d > 0.12) this.setAnim('run', clamp(0.6 + d * 1.4, 0.6, 2));
    else this.setAnim('idle');
  }

  update(dt) {
    this.mixer?.update(dt);
  }

  dispose() {
    this.disposed = true;
    this.mixer?.stopAllAction();
    this.label.dispose();
    this.group.parent?.remove(this.group);
  }
}

// ---------- Cảnh chính ----------

export class ClimbScene {
  constructor(canvas, manifest, quality = 'high') {
    this.manifest = manifest;
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
    this.slipFrom = 7.5;
    this.slipTo = 10.8;
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

  // Dựng hàng cây + con vật. ids: người chơi theo thứ tự; playerOf: id → người chơi.
  setPlayers(ids, playerOf, field) {
    const changed = field && (field.height !== this.height || field.slipFrom !== this.slipFrom || field.slipTo !== this.slipTo);
    if (field) Object.assign(this, { height: field.height, slipFrom: field.slipFrom, slipTo: field.slipTo });
    const same = !changed && ids.length === this.order.length && ids.every((id, i) => id === this.order[i]);
    this.order = ids;
    // Dựng lại cây khi đổi người/độ khó, hoặc ván trước đã có quả dừa rơi.
    if (!same || this.nutsDropped) {
      this.nutsDropped = false;
      for (const t of this.trees.values()) t.dispose();
      this.trees.clear();
      ids.forEach((id, i) => {
        const t = new Tree(this.height, this.slipFrom, this.slipTo);
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
        c = new Climber(player, this.manifest);
        this.climbers.set(id, c);
        this.scene.add(c.group);
      } else {
        c.setPlayer(player);
      }
    }
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

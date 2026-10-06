// Cảnh 3D Đua thuyền cho màn hình chung: dòng sông, thuyền (có con vật ngồi), khúc gỗ, đảo hải đăng, camera bám đoàn dẫn đầu.
// Toạ độ server: z = quãng đường (0 → trackLen), x = lệch ngang. Trong three.js: worldZ = -z (đi vào trong màn hình).
import * as THREE from 'three';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import {
  clamp,
  lerp,
  damp,
  findClip,
  loadAnimalTemplate,
  loadModel,
  cloneModel,
  canvasTexture,
  noiseTexture,
  checkerTexture,
  textSprite,
  disposeTree,
  Label,
  Particles,
} from '/js/core/scene-kit.js';

export const FLAG = { STUN: 1, BUMP: 2, FINISHED: 4, BLOCKED: 8 };

const MODELS = '/games/boat-race/assets/models/';
const INTERP_DELAY_MS = 100;
const LEAD_VIEW_BEHIND = 18; // camera nhìn từ thuyền dẫn đầu lùi về bấy nhiêu mét
const RIVER_EXTRA_BEFORE = 40;
const RIVER_EXTRA_AFTER = 100;
const ANIMAL_SCALE = 0.42; // con vật ngồi trên thuyền thu nhỏ lại cho vừa
const BOAT_WIDTH = 1.4;

// ---------- Texture mặt nước ----------

function waterTexture() {
  const size = 256;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#2f86c9';
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < 140; i++) {
    ctx.fillStyle = `rgba(255,255,255,${0.08 + Math.random() * 0.22})`;
    const w = 10 + Math.random() * 40;
    ctx.fillRect(Math.random() * size, Math.random() * size, w, 2 + Math.random() * 2);
  }
  return canvasTexture(c, true);
}

// ---------- Một con vật ngồi trên thuyền ----------

class Rower {
  constructor(player, manifest) {
    this.manifest = manifest;
    this.group = new THREE.Group();
    this.pivot = null;
    this.mixer = null;
    this.actions = {};
    this.current = null;
    this.currentKey = null;
    this.loadToken = 0;
    this.disposed = false;
    this.animal = undefined; // khác mọi giá trị thật để lần đầu luôn tải model
    this.setPlayer(player);
  }

  setPlayer(player) {
    if (player && player.animal !== this.animal) {
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
      this.group.remove(this.pivot);
      this.mixer?.stopAllAction();
    }
    this.pivot = new THREE.Group();
    this.pivot.rotation.y = this.manifest.modelYaw;
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
      const box = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.5, 0.6), new THREE.MeshLambertMaterial({ color: 0xcccccc }));
      box.position.y = 0.25;
      this.pivot.add(box);
      this.mixer = null;
    }
    this.group.add(this.pivot);
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

  // level: mức chèo của người này (0..1).
  animate(level, state, finished, winner) {
    if (state === 'countdown') return this.setAnim('idle');
    if (finished) return this.setAnim(winner ? 'celebrate' : 'idle');
    if (level > 0.5) return this.setAnim('run', clamp(0.6 + level, 0.6, 2));
    if (level > 0.12) return this.setAnim('walk', clamp(0.6 + level * 1.5, 0.6, 1.8));
    return this.setAnim('idle');
  }

  dispose() {
    this.disposed = true;
    this.mixer?.stopAllAction();
    this.group.parent?.remove(this.group);
  }
}

// ---------- Một chiếc thuyền ----------
// info: { id, name, color, boat (loại), crew: [id người chơi], halfLen }

class BoatView {
  constructor(info, catalog, manifest, playerOf) {
    this.id = info.id;
    this.catalog = catalog;
    this.manifest = manifest;
    this.playerOf = playerOf;
    this.group = new THREE.Group();
    this.body = new THREE.Group(); // nhấp nhô, nghiêng
    this.group.add(this.body);
    this.hull = null;
    this.hullType = null;
    this.halfLen = info.halfLen || 1.6;
    this.deckY = 0.25;
    this.rowers = new Map();
    this.phase = Math.random() * Math.PI * 2;
    this.loadToken = 0;
    this.disposed = false;
    this.behindShown = 0;

    // Cờ màu ở đuôi thuyền.
    this.flagMat = new THREE.MeshLambertMaterial({ color: info.color, side: THREE.DoubleSide });
    this.flag = new THREE.Group();
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.6, 6), new THREE.MeshLambertMaterial({ color: 0x6b4a2b }));
    pole.position.y = 0.8;
    const cloth = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.45), this.flagMat);
    cloth.position.set(0.35, 1.35, 0);
    this.flag.add(pole, cloth);
    this.body.add(this.flag);

    this.label = new Label();
    this.group.add(this.label.sprite);
    this.setInfo(info);
  }

  setInfo(info) {
    this.name = info.name;
    this.color = info.color;
    this.flagMat.color.set(info.color);
    this.label.set(info.name, info.color);
    this.behindShown = 0;
    if ((info.halfLen || this.halfLen) !== this.halfLen || info.boat !== this.hullType) {
      this.halfLen = info.halfLen || this.halfLen;
      this.loadHull(info.boat, info.color);
    } else if (this.hull) {
      this.tint(this.hull, info.color);
    }
    // Con vật trên thuyền.
    const ids = new Set(info.crew);
    for (const [id, r] of this.rowers) {
      if (!ids.has(id)) {
        r.dispose();
        this.rowers.delete(id);
      }
    }
    for (const id of info.crew) {
      const player = this.playerOf(id);
      let r = this.rowers.get(id);
      if (!r) {
        r = new Rower(player || { animal: null }, this.manifest);
        this.rowers.set(id, r);
        this.body.add(r.group);
      } else {
        r.setPlayer(player);
      }
    }
    this.crewOrder = info.crew;
    this.layout();
  }

  // Xếp chỗ ngồi dọc thuyền (mũi thuyền ở phía -z).
  layout() {
    const n = this.crewOrder.length || 1;
    const span = this.halfLen * 1.4;
    this.crewOrder.forEach((id, i) => {
      const r = this.rowers.get(id);
      if (r) r.group.position.set(0, this.deckY, -span / 2 + (span * (i + 0.5)) / n);
    });
    this.flag.position.set(0, this.deckY, this.halfLen * 0.85);
    this.label.sprite.position.y = this.deckY + 2;
  }

  tint(obj, color) {
    const c = new THREE.Color(color);
    obj.traverse(o => {
      if (!o.isMesh) return;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of mats) {
        if (!m?.color) continue;
        m.userData.baseColor ??= m.color.clone();
        m.color.copy(m.userData.baseColor).lerp(c, 0.35);
      }
    });
  }

  async loadHull(type, color) {
    const token = ++this.loadToken;
    this.hullType = type;
    const def = this.catalog.boats.find(b => b.id === type) || this.catalog.boats[0];
    let made = null;
    try {
      const tpl = await loadModel(MODELS + encodeURIComponent(def.file));
      made = cloneModel(tpl, { length: this.halfLen * 2 });
    } catch {
      made = null;
    }
    if (token !== this.loadToken || this.disposed) return;
    if (this.hull) {
      this.body.remove(this.hull);
      disposeTree(this.hull);
    }
    if (made) {
      // Mỗi thuyền có vật liệu riêng để tô màu không lây sang thuyền khác.
      made.object.traverse(o => {
        if (o.isMesh) o.material = Array.isArray(o.material) ? o.material.map(m => m.clone()) : o.material.clone();
      });
      // Thuyền quá rộng/quá cao so với chiều dài thì ép bớt bề ngang cho gọn làn.
      const sx = made.width > BOAT_WIDTH * 1.3 ? (BOAT_WIDTH * 1.3) / made.width : 1;
      made.object.scale.x = sx;
      this.hull = made.object;
      this.deckY = Math.min(made.height * 0.45, 0.6);
      // Thuyền nổi: chìm một phần dưới mặt nước.
      this.hull.position.y = -made.height * 0.3;
    } else {
      this.hull = new THREE.Mesh(new THREE.BoxGeometry(BOAT_WIDTH, 0.5, this.halfLen * 2), new THREE.MeshLambertMaterial({ color: 0x8b5a2b }));
      this.hull.position.y = 0.05;
      this.deckY = 0.3;
    }
    this.hull.traverse(o => {
      if (o.isMesh) o.castShadow = true;
    });
    this.tint(this.hull, color ?? this.color);
    this.body.add(this.hull);
    this.layout();
  }

  setShown(shown) {
    this.body.visible = shown;
    this.label.sprite.position.y = shown ? this.deckY + 2 : 1;
  }

  // Thuyền tụt ra khỏi khung hình: chỉ hiện nhãn "Tên ↓45m" ở mép dưới màn hình.
  placeStraggler(p, edgeZ, behind) {
    this.group.visible = true;
    this.setShown(false);
    this.group.position.set(p.x, 0, -edgeZ);
    this.showBehind(behind);
  }

  // p: { x, z, sp, f, r, c } đã nội suy.
  place(p, dt, now, state) {
    this.group.visible = true;
    this.setShown(true);
    const prevX = this.group.position.x;
    this.group.position.set(p.x, 0, -p.z);
    const latVel = dt > 0 ? (p.x - prevX) / dt : 0;
    const yaw = -Math.atan2(latVel, Math.max(p.sp, 3)) * 0.8;
    this.body.rotation.y = damp(this.body.rotation.y, clamp(yaw, -0.5, 0.5), 8, dt);
    // Nhấp nhô theo sóng; đâm vật cản thì lắc mạnh hơn.
    const hit = p.f & (FLAG.STUN | FLAG.BLOCKED) ? 3 : 1;
    this.body.position.y = Math.sin(now / 380 + this.phase) * 0.05 * hit;
    this.body.rotation.z = Math.sin(now / 650 + this.phase) * 0.035 * hit - clamp(latVel * 0.03, -0.12, 0.12);
    this.body.rotation.x = Math.sin(now / 900 + this.phase) * 0.02 * hit;
    const finished = !!(p.f & FLAG.FINISHED);
    this.crewOrder.forEach((id, i) => this.rowers.get(id)?.animate(p.c?.[i] ?? 0, state, finished, p.r === 1));
    this.showBehind(0);
  }

  placeLobby(x, now) {
    this.group.visible = true;
    this.setShown(true);
    this.group.position.set(x, 0, 0);
    this.body.rotation.set(0, 0, Math.sin(now / 650 + this.phase) * 0.03);
    this.body.position.y = Math.sin(now / 380 + this.phase) * 0.05;
    for (const r of this.rowers.values()) r.setAnim('idle');
    this.showBehind(0);
  }

  showBehind(behind) {
    const rounded = behind > 0 ? Math.max(5, Math.round(behind / 5) * 5) : 0;
    if (rounded === this.behindShown) return;
    this.behindShown = rounded;
    this.label.set(rounded ? `${this.name} ↓${rounded}m` : this.name, this.color);
  }

  update(dt) {
    for (const r of this.rowers.values()) r.mixer?.update(dt);
  }

  dispose() {
    this.disposed = true;
    for (const r of this.rowers.values()) r.dispose();
    this.rowers.clear();
    if (this.hull) disposeTree(this.hull);
    this.label.dispose();
    this.flagMat.dispose();
    this.group.parent?.remove(this.group);
  }
}

// ---------- Vật cản ----------

const ROCK_MAT = new THREE.MeshLambertMaterial({ color: 0x8a8f96, flatShading: true });
const LOG_MAT = new THREE.MeshLambertMaterial({ color: 0x7a5230 });

function makeLog(o, catalog) {
  const g = new THREE.Group();
  g.position.set(o.x, 0, -o.z);
  const fallback = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, o.w * 2, 10), LOG_MAT);
  fallback.rotation.z = Math.PI / 2;
  fallback.position.y = 0.1;
  fallback.castShadow = true;
  g.add(fallback);
  const files = catalog.obstacles?.log || [];
  const file = files[o.variant % Math.max(1, files.length)];
  if (file) {
    loadModel(MODELS + encodeURIComponent(file))
      .then(tpl => {
        if (!g.parent) return;
        const made = cloneModel(tpl, { length: o.w * 2 });
        made.object.rotation.y = Math.PI / 2; // nằm ngang sông
        made.object.position.y = -made.height * 0.35; // nổi lập lờ
        g.remove(fallback);
        fallback.geometry.dispose();
        g.add(made.object);
      })
      .catch(() => {});
  }
  g.userData.float = true;
  return g;
}

function makeIsland(o, catalog) {
  const g = new THREE.Group();
  g.position.set(o.x, 0, -o.z);
  // Cụm đá giữa sông.
  const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(1, 1), ROCK_MAT);
  rock.scale.set(o.w * 1.05, 1.1, o.d * 1.1);
  rock.position.y = 0.1;
  rock.castShadow = rock.receiveShadow = true;
  g.add(rock);
  for (let i = 0; i < 4; i++) {
    const s = new THREE.Mesh(new THREE.DodecahedronGeometry(0.6, 0), ROCK_MAT);
    s.position.set((Math.random() - 0.5) * o.w * 1.6, 0.1, (Math.random() - 0.5) * o.d * 1.6);
    s.scale.setScalar(0.6 + Math.random() * 0.8);
    g.add(s);
  }
  // Ngọn hải đăng trên đảo (tải lỗi thì dựng tháp sọc đỏ trắng).
  const top = new THREE.Group();
  top.position.y = 0.9;
  g.add(top);
  const tower = new THREE.Group();
  for (let i = 0; i < 4; i++) {
    const seg = new THREE.Mesh(
      new THREE.CylinderGeometry(0.55 - i * 0.07, 0.6 - i * 0.07, 1.2, 12),
      new THREE.MeshLambertMaterial({ color: i % 2 ? 0xffffff : 0xd63a3a }),
    );
    seg.position.y = 0.6 + i * 1.2;
    seg.castShadow = true;
    tower.add(seg);
  }
  top.add(tower);
  const file = catalog.obstacles?.lighthouse;
  if (file) {
    loadModel(MODELS + encodeURIComponent(file))
      .then(tpl => {
        if (!g.parent) return;
        const made = cloneModel(tpl, { height: 6 });
        top.remove(tower);
        disposeTree(tower);
        top.add(made.object);
      })
      .catch(() => {});
  }
  return g;
}

// ---------- Cảnh chính ----------

export class BoatScene {
  constructor(canvas, manifest, catalog, quality = 'high', playerOf = () => null) {
    this.manifest = manifest;
    this.catalog = catalog;
    this.playerOf = playerOf;
    this.high = quality === 'high';

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

    this.boats = new Map();
    this.snapshots = [];
    this.obstacleGroup = new THREE.Group();
    this.scene.add(this.obstacleGroup);
    this.riverGroup = null;
    this.water = null;
    this.riverKey = null;
    this.width = 12;
    this.trackLen = 400;
    this.mode = 'lobby';
    this.lobbyOrder = [];
    this.focus = 0;
    this.particles = new Particles(this.scene);
    this.clock = new THREE.Clock();

    this.buildRiver(this.width, this.trackLen, 'basic', 3);
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

  // Dòng sông, bờ cỏ, cây, vạch xuất phát/đích, cột mốc; kiểu Basic thêm hàng phao chia làn.
  buildRiver(width, trackLen, course, lanes) {
    const key = `${width}|${trackLen}|${course}|${course === 'basic' ? lanes : 0}`;
    if (this.riverGroup && key === this.riverKey) return;
    if (this.riverGroup) {
      this.scene.remove(this.riverGroup);
      disposeTree(this.riverGroup);
    }
    this.riverKey = key;
    this.width = width;
    this.trackLen = trackLen;
    const g = new THREE.Group();
    this.riverGroup = g;
    this.scene.add(g);

    const len = trackLen + RIVER_EXTRA_BEFORE + RIVER_EXTRA_AFTER;
    const centerZ = -(len / 2 - RIVER_EXTRA_BEFORE);
    const half = width / 2;

    const waterTex = waterTexture();
    waterTex.repeat.set(Math.max(1, width / 8), len / 8);
    this.water = new THREE.Mesh(
      new THREE.PlaneGeometry(width + 2, len),
      new THREE.MeshPhongMaterial({ map: waterTex, shininess: 80, specular: 0x88ccff }),
    );
    this.water.rotation.x = -Math.PI / 2;
    this.water.position.set(0, 0, centerZ);
    this.water.receiveShadow = true;
    g.add(this.water);

    // Bờ cỏ hai bên, cao hơn mặt nước một chút.
    const grassTex = noiseTexture('#6fbf5b', '#4f9c3f');
    grassTex.repeat.set(120 / 6, len / 6);
    for (const side of [-1, 1]) {
      const bank = new THREE.Mesh(new THREE.BoxGeometry(120, 0.6, len), new THREE.MeshLambertMaterial({ map: grassTex }));
      bank.position.set(side * (half + 1 + 60), 0.1, centerZ);
      bank.receiveShadow = true;
      g.add(bank);
      const edge = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, len), new THREE.MeshLambertMaterial({ color: 0xc8a46d }));
      edge.position.set(side * (half + 1.2), 0.15, centerZ);
      g.add(edge);
    }

    // Vạch xuất phát và vạch đích (phao nổi + băng rôn).
    const startLine = new THREE.Mesh(new THREE.PlaneGeometry(width + 2, 0.3), new THREE.MeshBasicMaterial({ color: 0xffffff }));
    startLine.rotation.x = -Math.PI / 2;
    startLine.position.set(0, 0.03, 0);
    g.add(startLine);
    const finish = new THREE.Mesh(
      new THREE.PlaneGeometry(width + 2, 1.2),
      new THREE.MeshBasicMaterial({ map: checkerTexture(Math.round((width + 2) / 0.8), 2), transparent: true, opacity: 0.85 }),
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

    for (let d = 50; d < trackLen; d += 50) {
      const sign = textSprite(`${d}m`, { height: 0.7 });
      sign.position.set(-(half + 2.4), 1.6, -d);
      g.add(sign);
    }

    // Kiểu Basic: hàng phao chia làn.
    if (course === 'basic' && lanes > 1) {
      const laneW = width / lanes;
      const per = Math.ceil(trackLen / 6);
      const buoys = new THREE.InstancedMesh(new THREE.SphereGeometry(0.16, 8, 6), new THREE.MeshLambertMaterial({ color: 0xff7a3d }), per * (lanes - 1));
      const m = new THREE.Matrix4();
      let i = 0;
      for (let l = 1; l < lanes; l++) {
        const x = -half + laneW * l;
        for (let k = 0; k < per; k++) {
          m.makeTranslation(x, 0.08, -k * 6);
          buoys.setMatrixAt(i++, m);
        }
      }
      g.add(buoys);
    }

    // Cây và đồi (instanced cho nhẹ).
    const treeCount = this.high ? 240 : 90;
    const trunks = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.15, 0.22, 1.2, 6), new THREE.MeshLambertMaterial({ color: 0x7a5230 }), treeCount);
    const crowns = new THREE.InstancedMesh(new THREE.ConeGeometry(1.2, 2.8, 7), new THREE.MeshLambertMaterial({ color: 0x2f8f3a }), treeCount);
    const q = new THREE.Quaternion();
    const s = new THREE.Vector3();
    const p = new THREE.Vector3();
    const m = new THREE.Matrix4();
    for (let t = 0; t < treeCount; t++) {
      const side = t % 2 ? 1 : -1;
      const x = side * (half + 4 + Math.random() * 50);
      const z = RIVER_EXTRA_BEFORE - Math.random() * len;
      const k = 0.7 + Math.random() * 0.8;
      s.set(k, k, k);
      p.set(x, 0.4 + 0.6 * k, z);
      trunks.setMatrixAt(t, m.compose(p, q, s));
      p.set(x, 0.4 + (1.2 + 1.4) * k, z);
      crowns.setMatrixAt(t, m.compose(p, q, s));
    }
    if (this.high) crowns.castShadow = true;
    g.add(trunks, crowns);

    const hillMat = new THREE.MeshLambertMaterial({ color: 0x5da65a, flatShading: true });
    const hillGeo = new THREE.IcosahedronGeometry(1, 1);
    for (let h = 0; h < 16; h++) {
      const hill = new THREE.Mesh(hillGeo, hillMat);
      const side = h % 2 ? 1 : -1;
      hill.position.set(side * (70 + Math.random() * 40), -2, RIVER_EXTRA_BEFORE - (h / 16) * (len + 80));
      hill.scale.set(30 + Math.random() * 20, 10 + Math.random() * 10, 30 + Math.random() * 20);
      g.add(hill);
    }
  }

  clearObstacles() {
    for (const o of [...this.obstacleGroup.children]) {
      this.obstacleGroup.remove(o);
      disposeTree(o);
    }
  }

  syncBoats(list) {
    const ids = new Set(list.map(b => b.id));
    for (const [id, v] of this.boats) {
      if (!ids.has(id)) {
        v.dispose();
        this.boats.delete(id);
      }
    }
    for (const info of list) {
      let v = this.boats.get(info.id);
      if (!v) {
        v = new BoatView(info, this.catalog, this.manifest, this.playerOf);
        this.boats.set(info.id, v);
        this.scene.add(v.group);
      } else {
        v.setInfo(info);
      }
    }
  }

  // Phòng chờ: các thuyền xếp hàng ở vạch xuất phát.
  setLobby(boats, trackLen, course) {
    if (this.mode !== 'lobby') {
      this.mode = 'lobby';
      this.snapshots = [];
      this.clearObstacles();
    }
    this.syncBoats(boats);
    this.lobbyOrder = boats.map(b => b.id);
    const n = Math.max(1, boats.length);
    const width = course === 'basic' ? Math.max(10, n * 3.6) : clamp(10 + n * 2.5, 14, 24);
    this.buildRiver(width, trackLen, course, n);
  }

  // Lúc bắt đầu ván: đúng thuyền, đúng làn, vật cản.
  setupRace(info) {
    this.mode = 'race';
    this.snapshots = [];
    this.syncBoats(info.boats);
    this.buildRiver(info.width, info.trackLen, info.course, info.boats.length);
    this.clearObstacles();
    for (const o of info.obstacles) {
      this.obstacleGroup.add(o.type === 'island' ? makeIsland(o, this.catalog) : makeLog(o, this.catalog));
    }
    for (const b of info.boats) this.boats.get(b.id)?.group.position.set(b.lane, 0, 0);
    this.focus = 0;
  }

  pushSnapshot(s) {
    s.recv = performance.now();
    this.snapshots.push(s);
    if (this.snapshots.length > 30) this.snapshots.shift();
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
    const boats = b.p.map(pb => {
      const pa = prev.get(pb.id) || pb;
      return { ...pb, x: lerp(pa.x, pb.x, k), z: lerp(pa.z, pb.z, k) };
    });
    return { state: b.state, boats };
  }

  fx(ev) {
    const v = this.boats.get(ev.bid);
    const pos = v ? v.group.position.clone() : new THREE.Vector3();
    if (ev.type === 'log') {
      pos.y = 0.4;
      pos.z -= v?.halfLen || 1.5;
      this.particles.burst(pos, ['#ffffff', '#a8dcff', '#7a5230'], { count: 20, speed: 3, up: 3 });
    } else if (ev.type === 'island') {
      pos.y = 0.4;
      pos.z -= v?.halfLen || 1.5;
      this.particles.burst(pos, ['#ffffff', '#a8dcff', '#8a8f96'], { count: 24, speed: 3.5, up: 3.5 });
    } else if (ev.type === 'bump') {
      pos.y = 0.4;
      this.particles.burst(pos, ['#ffffff', '#a8dcff'], { count: 10, speed: 2.5, up: 2, life: 0.6 });
    } else if (ev.type === 'finish') {
      const at = new THREE.Vector3(0, 1, -this.trackLen);
      if (ev.rank === 1) {
        this.particles.burst(at, ['#e6194b', '#ffe119', '#4363d8', '#3cb44b', '#f032e6', '#ffffff'], { count: 140, speed: 7, up: 9, life: 2.4 });
      } else if (v) {
        this.particles.burst(pos.setY(1), [v.color, '#ffffff'], { count: 24, speed: 3, up: 5 });
      }
    }
  }

  updateCamera(focus, sway = 0) {
    const w = this.width;
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
    const lane = this.width / Math.max(1, n);
    this.lobbyOrder.forEach((id, i) => this.boats.get(id)?.placeLobby(-this.width / 2 + lane * (i + 0.5), now));
    this.focus = damp(this.focus, 2, 2, dt);
    this.updateCamera(this.focus, Math.sin(now / 5000) * 3);
  }

  updateRace(dt, now) {
    const s = this.sample(now);
    if (!s) {
      this.updateCamera(this.focus);
      return;
    }
    let lead = -Infinity;
    for (const p of s.boats) if (!(p.f & FLAG.FINISHED)) lead = Math.max(lead, p.z);
    if (lead === -Infinity) for (const p of s.boats) lead = Math.max(lead, p.z);
    if (!Number.isFinite(lead)) lead = 0;
    const target = s.state === 'countdown' ? 0 : Math.max(0, lead - LEAD_VIEW_BEHIND);
    this.focus = damp(this.focus, target, 2.5, dt);
    this.updateCamera(this.focus);

    const minZ = this.focus - 3;
    const seen = new Set();
    for (const p of s.boats) {
      const v = this.boats.get(p.id);
      if (!v) continue;
      seen.add(p.id);
      if (p.z < minZ) {
        v.placeStraggler(p, this.focus - 2, this.focus - p.z);
        continue;
      }
      v.place(p, dt, now, s.state);
      // Bọt nước sau đuôi khi chèo nhanh.
      if (p.sp > 3 && Math.random() < (this.high ? 0.35 : 0.15)) {
        const tail = v.group.position.clone();
        tail.x += (Math.random() - 0.5) * 0.8;
        tail.y = 0.1;
        tail.z += v.halfLen + 0.2;
        this.particles.burst(tail, ['#ffffff', '#cfeaff'], { count: 1, speed: 0.6, up: 0.8, life: 0.5 });
      }
    }
    for (const [id, v] of this.boats) if (!seen.has(id)) v.group.visible = false;
  }

  frame() {
    const dt = Math.min(0.05, this.clock.getDelta());
    const now = performance.now();
    if (this.mode === 'race') this.updateRace(dt, now);
    else this.updateLobby(dt, now);

    // Nước chảy: trượt texture về phía người xem.
    if (this.water) this.water.material.map.offset.y -= dt * 0.08;
    for (const o of this.obstacleGroup.children) {
      if (o.userData.float) o.position.y = Math.sin(now / 500 + o.position.z) * 0.05;
    }
    for (const v of this.boats.values()) v.update(dt);
    this.particles.update(dt);
    this.renderer.render(this.scene, this.camera);
  }

  destroy() {
    this.renderer.setAnimationLoop(null);
    window.removeEventListener('resize', this.onResize);
    for (const v of this.boats.values()) v.dispose();
    this.boats.clear();
    this.clearObstacles();
    if (this.riverGroup) disposeTree(this.riverGroup);
    this.particles.dispose();
    this.renderer.dispose();
  }
}

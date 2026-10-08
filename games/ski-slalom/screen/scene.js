// Cảnh 3D Trượt tuyết vượt cổng cho màn hình chung: dốc tuyết nghiêng xuống phía xa, cổng cờ đỏ/xanh xen kẽ,
// cây thông và tảng đá, mỗi người là con vật đứng trên đôi ván trượt màu người chơi.
// Camera bám người dẫn đầu; người tụt lại có khung nhỏ (/js/core/mini-views.js).
// Toạ độ server: z = quãng đường xuống dốc, x = lệch ngang. Mọi thứ nằm trong nhóm `world` (worldZ = -z),
// nhóm này nghiêng SLOPE cho thấy là đang xuống dốc; camera tính trong toạ độ của nhóm rồi đổi ra ngoài.
import * as THREE from 'three';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import {
  clamp,
  lerp,
  damp,
  findClip,
  loadAnimalTemplate,
  noiseTexture,
  checkerTexture,
  textSprite,
  disposeTree,
  Label,
  Particles,
} from '/js/core/scene-kit.js';
import { MiniViews, behindText } from '/js/core/mini-views.js';

export const FLAG = { FALL: 1, FINISHED: 2 };

const INTERP_DELAY_MS = 100;
const LEAD_VIEW_BEHIND = 14; // camera nhìn từ người dẫn đầu lùi về bấy nhiêu mét
const EXTRA_BEFORE = 30;
const EXTRA_AFTER = 80;
const SLOPE = 0.12; // độ nghiêng của dốc (rad)
const SKIER_SCALE = 0.7;
const GATE_COLORS = { red: 0xe03b3b, blue: 0x2f6fe0 };

// ---------- Một người trượt ----------

const SKI_GEO = new THREE.BoxGeometry(0.14, 0.05, 1.9);

class Skier {
  constructor(player, manifest) {
    this.id = player.id;
    this.manifest = manifest;
    this.group = new THREE.Group();
    this.body = new THREE.Group(); // xoay theo hướng trượt, nghiêng khi cua, ngã khi đâm
    this.group.add(this.body);
    this.skiMat = new THREE.MeshLambertMaterial({ color: player.color });
    for (const side of [-1, 1]) {
      const ski = new THREE.Mesh(SKI_GEO, this.skiMat);
      ski.position.set(side * 0.22, 0.03, -0.1);
      ski.castShadow = true;
      this.body.add(ski);
    }
    this.label = new Label();
    this.group.add(this.label.sprite);
    this.yaw = manifest.modelYaw;
    this.pivot = null;
    this.mixer = null;
    this.actions = {};
    this.current = null;
    this.currentKey = null;
    this.height = 1.2;
    this.loadToken = 0;
    this.disposed = false;
    this.behindShown = 0;
    this.lastHeading = 0;
    this.setPlayer(player);
  }

  setPlayer(player) {
    this.name = player.name;
    this.color = player.color;
    this.skiMat.color.set(player.color);
    this.label.set(player.name, player.color);
    if (player.animal !== this.animal) {
      this.animal = player.animal;
      this.loadModel(player.animal);
    }
  }

  setYaw(yaw) {
    this.yaw = yaw;
    if (this.pivot) this.pivot.rotation.y = yaw;
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
      this.body.remove(this.pivot);
      this.mixer?.stopAllAction();
    }
    this.pivot = new THREE.Group();
    this.pivot.rotation.y = this.yaw;
    this.pivot.position.y = 0.06; // đứng trên ván
    this.actions = {};
    this.current = null;
    this.currentKey = null;
    if (tpl) {
      const model = SkeletonUtils.clone(tpl.root);
      model.scale.setScalar(tpl.scale * SKIER_SCALE);
      model.position.copy(tpl.offset).multiplyScalar(SKIER_SCALE);
      this.pivot.add(model);
      this.mixer = new THREE.AnimationMixer(model);
      for (const [key, names] of Object.entries(this.manifest.clips)) {
        const clip = findClip(tpl.clips, names);
        if (clip) this.actions[key] = this.mixer.clipAction(clip);
      }
      this.height = tpl.height * SKIER_SCALE;
    } else {
      const box = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.8, 1.2), new THREE.MeshLambertMaterial({ color: 0xcccccc }));
      box.position.y = 0.4;
      this.pivot.add(box);
      this.mixer = null;
      this.height = 0.8;
    }
    this.body.add(this.pivot);
    this.label.sprite.position.y = this.height + 0.6;
    this.setAnim('idle');
  }

  setAnim(key, { once = false, timeScale = 1 } = {}) {
    const action = this.actions[key] || this.actions.idle;
    if (!action) return;
    if (this.currentKey === key) {
      action.setEffectiveTimeScale(timeScale);
      return;
    }
    action.reset();
    action.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, Infinity);
    action.clampWhenFinished = once;
    action.setEffectiveTimeScale(timeScale).setEffectiveWeight(1).fadeIn(0.15).play();
    if (this.current && this.current !== action) this.current.fadeOut(0.15);
    this.current = action;
    this.currentKey = key;
  }

  setShown(shown) {
    this.body.visible = shown;
    this.label.sprite.position.y = shown ? this.height + 0.6 : 1;
  }

  placeLobby(x) {
    this.group.visible = true;
    this.setShown(true);
    this.group.position.set(x, 0, 0);
    this.body.rotation.set(0, 0, 0);
    this.setAnim('idle');
    this.showBehind(0);
  }

  // Tụt ra khỏi khung hình (và không có khung nhỏ): chỉ hiện nhãn "Tên ↓Xm" ở mép dưới.
  placeStraggler(p, edgeZ, behind) {
    this.group.visible = true;
    this.setShown(false);
    this.group.position.set(p.x, 0, -edgeZ);
    this.showBehind(behind);
  }

  // p: { x, z, h, sp, f, r } đã nội suy. Trả về true nếu đang cua gắt (để bắn tuyết).
  placeRace(p, dt, state) {
    this.group.visible = true;
    this.setShown(true);
    this.group.position.set(p.x, 0, -p.z);
    const fallen = !!(p.f & FLAG.FALL);
    const turnRate = dt > 0 ? (p.h - this.lastHeading) / dt : 0;
    this.lastHeading = p.h;
    this.body.rotation.y = damp(this.body.rotation.y, -p.h, 12, dt);
    // Nghiêng người vào phía trong khúc cua; ngã thì lật nghiêng hẳn.
    const lean = fallen ? 1.3 : clamp(-turnRate * 0.25 - p.h * 0.25, -0.5, 0.5);
    this.body.rotation.z = damp(this.body.rotation.z, lean, fallen ? 12 : 8, dt);
    if (state === 'countdown') this.setAnim('idle');
    else if (p.f & FLAG.FINISHED) this.setAnim(p.r === 1 ? 'celebrate' : 'idle');
    else if (fallen) this.setAnim('hitLeft', { once: true });
    else this.setAnim('idle');
    this.showBehind(0);
    return !fallen && p.sp > 4 && Math.abs(turnRate) > 0.6;
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
    this.skiMat.dispose();
    this.group.parent?.remove(this.group);
  }
}

// ---------- Cổng, cây, đá ----------

const POLE_GEO = new THREE.CylinderGeometry(0.05, 0.05, 1.9, 6);
const FLAG_GEO = new THREE.PlaneGeometry(0.75, 0.55);
const TREE_MAT = new THREE.MeshLambertMaterial({ color: 0x1f6b3a });
const TRUNK_MAT = new THREE.MeshLambertMaterial({ color: 0x6b4a2b });
const SNOW_MAT = new THREE.MeshLambertMaterial({ color: 0xffffff });
const ROCK_MAT = new THREE.MeshLambertMaterial({ color: 0x7d838c, flatShading: true });

function makeGate(g) {
  const group = new THREE.Group();
  group.position.set(g.x, 0, -g.z);
  const mat = new THREE.MeshLambertMaterial({ color: GATE_COLORS[g.color] || 0xe03b3b, side: THREE.DoubleSide });
  for (const side of [-1, 1]) {
    const pole = new THREE.Mesh(POLE_GEO, mat);
    pole.position.set(side * g.w, 0.95, 0);
    pole.castShadow = true;
    const flag = new THREE.Mesh(FLAG_GEO, mat);
    flag.position.set(side * g.w - side * 0.4, 1.55, 0); // lá cờ quay vào phía trong cổng
    group.add(pole, flag);
  }
  // Vạch mờ trên tuyết nối 2 cột cho dễ thấy cổng.
  const line = new THREE.Mesh(
    new THREE.PlaneGeometry(g.w * 2, 0.12),
    new THREE.MeshBasicMaterial({ color: GATE_COLORS[g.color] || 0xe03b3b, transparent: true, opacity: 0.35, depthWrite: false }),
  );
  line.rotation.x = -Math.PI / 2;
  line.position.y = 0.02;
  group.add(line);
  return group;
}

function makeTree(scale = 1) {
  const g = new THREE.Group();
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 0.6, 6), TRUNK_MAT);
  trunk.position.y = 0.3;
  g.add(trunk);
  for (let i = 0; i < 3; i++) {
    const r = 0.9 - i * 0.22;
    const cone = new THREE.Mesh(new THREE.ConeGeometry(r, 1.1, 7), TREE_MAT);
    cone.position.y = 0.9 + i * 0.6;
    cone.castShadow = true;
    const cap = new THREE.Mesh(new THREE.ConeGeometry(r * 0.55, 0.45, 7), SNOW_MAT);
    cap.position.y = cone.position.y + 0.38;
    g.add(cone, cap);
  }
  g.scale.setScalar(scale);
  return g;
}

function makeObstacle(o) {
  let g;
  if (o.type === 'tree') {
    g = makeTree(1);
  } else {
    g = new THREE.Group();
    const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(o.r, 0), ROCK_MAT);
    rock.scale.y = 0.7;
    rock.position.y = o.r * 0.4;
    rock.castShadow = true;
    const cap = new THREE.Mesh(new THREE.SphereGeometry(o.r * 0.6, 8, 5, 0, Math.PI * 2, 0, Math.PI / 2), SNOW_MAT);
    cap.position.y = o.r * 0.75;
    cap.scale.y = 0.5;
    g.add(rock, cap);
  }
  g.position.set(o.x, 0, -o.z);
  return g;
}

// ---------- Cảnh chính ----------

export class SkiScene {
  // overlay: phần tử HTML phủ lên canvas để vẽ viền + tên cho các khung nhỏ.
  constructor(canvas, manifest, quality = 'high', overlay = null) {
    this.manifest = manifest;
    this.high = quality === 'high';
    this.minis = [];
    this.scenery = []; // rừng thông, núi, lưới chắn: ẩn khi vẽ khung nhỏ

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: this.high, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, this.high ? 2 : 1));
    this.renderer.shadowMap.enabled = this.high;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0xb9dcff);
    this.scene.fog = new THREE.Fog(0xdcecff, 60, 200);
    this.miniViews = new MiniViews(this.renderer, this.scene, overlay, { high: this.high });
    this.camera = new THREE.PerspectiveCamera(50, 1, 0.5, 500);

    this.scene.add(new THREE.HemisphereLight(0xffffff, 0xb0c4de, 1.6));
    this.sun = new THREE.DirectionalLight(0xffffff, 2);
    this.sun.castShadow = this.high;
    this.sun.shadow.mapSize.set(2048, 2048);
    Object.assign(this.sun.shadow.camera, { left: -30, right: 30, top: 30, bottom: -30, near: 1, far: 120 });
    this.sun.shadow.camera.updateProjectionMatrix();
    this.scene.add(this.sun, this.sun.target);

    // Mọi thứ trên dốc nằm trong world (nghiêng xuống phía xa).
    this.world = new THREE.Group();
    this.world.rotation.x = -SLOPE;
    this.scene.add(this.world);
    this.courseGroup = new THREE.Group(); // cổng + cây + đá của lượt đang chơi
    this.world.add(this.courseGroup);

    this.skiers = new Map();
    this.snapshots = [];
    this.trackGroup = null;
    this.trackKey = '';
    this.width = 26;
    this.courseLen = 400;
    this.mode = 'lobby';
    this.lobbyOrder = [];
    this.focus = 0;
    this.edgeZ = 0;
    this.particles = new Particles(this.world);
    this.clock = new THREE.Clock();
    this.tmpA = new THREE.Vector3();
    this.tmpB = new THREE.Vector3();

    this.buildTrack(this.width, this.courseLen);
    this.onResize = () => this.resize();
    window.addEventListener('resize', this.onResize);
    this.resize();
    this.renderer.setAnimationLoop(() => this.frame());
  }

  destroy() {
    this.renderer.setAnimationLoop(null);
    window.removeEventListener('resize', this.onResize);
    this.miniViews.destroy();
    for (const s of this.skiers.values()) s.dispose();
    this.skiers.clear();
    this.clearCourse();
    if (this.trackGroup) disposeTree(this.trackGroup);
    this.particles.dispose();
    this.renderer.dispose();
  }

  resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  // Dốc tuyết, lưới chắn 2 bên, vạch xuất phát/đích, rừng thông 2 bên, núi phía xa.
  buildTrack(width, courseLen) {
    const key = `${width}|${courseLen}`;
    if (this.trackGroup && key === this.trackKey) return;
    if (this.trackGroup) {
      this.world.remove(this.trackGroup);
      disposeTree(this.trackGroup);
    }
    this.trackKey = key;
    this.width = width;
    this.courseLen = courseLen;
    const g = new THREE.Group();
    this.trackGroup = g;
    this.world.add(g);
    this.scenery = [];
    const len = courseLen + EXTRA_BEFORE + EXTRA_AFTER;
    const centerZ = -(len / 2 - EXTRA_BEFORE);
    const half = width / 2;

    const snowTex = noiseTexture('#f7faff', '#dde7f3');
    snowTex.repeat.set(200 / 5, len / 5);
    const snow = new THREE.Mesh(new THREE.PlaneGeometry(200, len), new THREE.MeshLambertMaterial({ map: snowTex }));
    snow.rotation.x = -Math.PI / 2;
    snow.position.set(0, 0, centerZ);
    snow.receiveShadow = true;
    g.add(snow);

    // Lưới chắn màu cam 2 bên mép dốc.
    const netMat = new THREE.MeshLambertMaterial({ color: 0xff7a1a, transparent: true, opacity: 0.85 });
    for (const side of [-1, 1]) {
      const net = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.9, len), netMat);
      net.position.set(side * (half + 0.3), 0.45, centerZ);
      g.add(net);
      this.scenery.push(net);
    }

    const lineMat = new THREE.MeshBasicMaterial({ color: 0x2f6fe0 });
    const start = new THREE.Mesh(new THREE.PlaneGeometry(width, 0.35), lineMat);
    start.rotation.x = -Math.PI / 2;
    start.position.set(0, 0.02, 0);
    g.add(start);
    const finish = new THREE.Mesh(
      new THREE.PlaneGeometry(width, 1.6),
      new THREE.MeshBasicMaterial({ map: checkerTexture(Math.round(width / 0.8), 2) }),
    );
    finish.rotation.x = -Math.PI / 2;
    finish.position.set(0, 0.02, -courseLen);
    g.add(finish);
    const archMat = new THREE.MeshLambertMaterial({ color: 0xd63a3a });
    for (const side of [-1, 1]) {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 5.5, 10), archMat);
      pole.position.set(side * (half + 0.8), 2.75, -courseLen);
      pole.castShadow = true;
      g.add(pole);
    }
    const banner = textSprite('🏁 ĐÍCH 🏁', { bg: '#d63a3a', height: 1.4 });
    banner.position.set(0, 5.4, -courseLen);
    g.add(banner);

    // Rừng thông 2 bên dốc (instanced cho nhẹ).
    const treeCount = this.high ? 220 : 80;
    const cones = new THREE.InstancedMesh(new THREE.ConeGeometry(1.3, 3.4, 7), TREE_MAT, treeCount);
    const caps = new THREE.InstancedMesh(new THREE.ConeGeometry(0.7, 1.1, 7), SNOW_MAT, treeCount);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const s = new THREE.Vector3();
    const p = new THREE.Vector3();
    for (let t = 0; t < treeCount; t++) {
      const side = t % 2 ? 1 : -1;
      const x = side * (half + 3 + Math.random() * 45);
      const z = EXTRA_BEFORE - Math.random() * len;
      const k = 0.7 + Math.random() * 0.9;
      s.set(k, k, k);
      p.set(x, 1.7 * k, z);
      cones.setMatrixAt(t, m.compose(p, q, s));
      p.set(x, 3.1 * k, z);
      caps.setMatrixAt(t, m.compose(p, q, s));
    }
    if (this.high) cones.castShadow = true;
    g.add(cones, caps);
    this.scenery.push(cones, caps);

    // Núi tuyết phía xa.
    const rockMat = new THREE.MeshLambertMaterial({ color: 0x8a97ab, flatShading: true });
    for (let i = 0; i < 9; i++) {
      const h = 40 + Math.random() * 40;
      const mountain = new THREE.Mesh(new THREE.ConeGeometry(30 + Math.random() * 20, h, 6), rockMat);
      mountain.position.set((i - 4) * 40 + Math.random() * 15, h / 2 - 25, -(courseLen + 120 + Math.random() * 60));
      const top = new THREE.Mesh(new THREE.ConeGeometry(12, h * 0.3, 6), SNOW_MAT);
      top.position.y = h * 0.36;
      mountain.add(top);
      g.add(mountain);
      this.scenery.push(mountain);
    }
  }

  clearCourse() {
    for (const o of [...this.courseGroup.children]) {
      this.courseGroup.remove(o);
      disposeTree(o);
    }
  }

  // Dữ liệu phòng thay đổi (vào/ra, đổi con vật...).
  setPlayers(players, state, preview) {
    const ids = new Set(players.map(p => p.id));
    for (const [id, s] of this.skiers) {
      if (!ids.has(id)) {
        s.dispose();
        this.skiers.delete(id);
      }
    }
    for (const p of players) {
      let s = this.skiers.get(p.id);
      if (!s) {
        s = new Skier(p, this.manifest);
        this.skiers.set(p.id, s);
        this.world.add(s.group);
      } else {
        s.setPlayer(p);
      }
    }
    if (state === 'lobby') {
      if (this.mode !== 'lobby') {
        this.mode = 'lobby';
        this.snapshots = [];
        this.clearCourse();
      }
      this.lobbyOrder = players.map(p => p.id);
      if (preview?.courseLen) this.buildTrack(preview.width || this.width, preview.courseLen);
    }
  }

  setupRace(info) {
    this.mode = 'race';
    this.snapshots = [];
    this.miniViews.setOrder(info.racers); // thứ tự đứng ở vạch xuất phát, trái → phải
    this.buildTrack(info.width, info.courseLen);
    this.clearCourse();
    for (const gate of info.gates) this.courseGroup.add(makeGate(gate));
    for (const o of info.obstacles) this.courseGroup.add(makeObstacle(o));
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
    const players = b.p.map(pb => {
      const pa = prev.get(pb.id) || pb;
      return { ...pb, x: lerp(pa.x, pb.x, k), z: lerp(pa.z, pb.z, k), h: lerp(pa.h, pb.h, k) };
    });
    return { state: b.state, players };
  }

  fx(ev) {
    const s = this.skiers.get(ev.pid);
    if (ev.type === 'crash' && s) {
      const pos = s.group.position.clone().setY(0.4);
      this.particles.burst(pos, ['#ffffff', '#e8f0ff', s.color], { count: 22, speed: 3, up: 3.5 });
    } else if (ev.type === 'miss' && s) {
      this.particles.burst(s.group.position.clone().setY(1.5), ['#ff4d4d'], { count: 8, speed: 1.5, up: 2, life: 0.7 });
    } else if (ev.type === 'finish') {
      const at = new THREE.Vector3(0, 1, -this.courseLen);
      if (ev.rank === 1) {
        this.particles.burst(at, ['#e6194b', '#ffe119', '#4363d8', '#3cb44b', '#f032e6', '#ffffff'], { count: 140, speed: 7, up: 9, life: 2.4 });
      } else if (s) {
        this.particles.burst(s.group.position.clone().setY(1), [s.color, '#ffffff'], { count: 24, speed: 3, up: 5 });
      }
    }
  }

  // Phím Y trên màn hình host: xoay model 90° nếu con vật trượt ngang/ngược.
  rotateModels(delta) {
    const first = this.skiers.values().next().value;
    const yaw = ((first?.yaw ?? this.manifest.modelYaw) + delta) % (Math.PI * 2);
    for (const s of this.skiers.values()) s.setYaw(yaw);
    return yaw;
  }

  // Đổi điểm trong toạ độ dốc ra toạ độ cảnh.
  toScene(x, y, z, out) {
    return this.world.localToWorld(out.set(x, y, z));
  }

  updateCamera(focus, sway = 0) {
    const w = this.width;
    const narrow = clamp(1.6 / this.camera.aspect, 1, 2);
    const back = (11 + w * 0.25) * narrow;
    const height = (6 + w * 0.4) * narrow;
    this.world.updateMatrixWorld();
    this.camera.position.copy(this.toScene(sway, height, -(focus - back), this.tmpA));
    this.camera.lookAt(this.toScene(0, 0, -(focus + 12), this.tmpB));
    this.sun.position.copy(this.toScene(-15, 35, -(focus - 10), this.tmpA));
    this.sun.target.position.copy(this.toScene(0, 0, -(focus + 10), this.tmpB));
  }

  updateLobby(now) {
    const n = this.lobbyOrder.length;
    this.lobbyOrder.forEach((id, i) => this.skiers.get(id)?.placeLobby((i - (n - 1) / 2) * 1.6));
    this.focus = 2;
    this.updateCamera(this.focus, Math.sin(now / 5000) * 3);
    this.miniViews.updateMarkers(now, () => null);
  }

  updateRace(dt, now) {
    const s = this.sample(now);
    if (!s) {
      this.updateCamera(this.focus);
      return;
    }
    let lead = -Infinity;
    for (const p of s.players) if (!(p.f & FLAG.FINISHED)) lead = Math.max(lead, p.z);
    if (lead === -Infinity) for (const p of s.players) lead = Math.max(lead, p.z);
    if (!Number.isFinite(lead)) lead = 0;
    const target = s.state === 'countdown' ? 0 : Math.max(0, lead - LEAD_VIEW_BEHIND);
    this.focus = damp(this.focus, target, 2.5, dt);
    this.updateCamera(this.focus);

    // Khung nhỏ cho người tụt lại: hiện sớm/ẩn muộn quanh mép dưới (minZ) để không nhấp nháy.
    const minZ = this.focus - 2.5;
    this.edgeZ = minZ;
    const racing = s.state === 'racing';
    const miniIds = this.miniViews.update(
      s.players.map(p => ({ id: p.id, z: p.z, active: racing && !(p.f & FLAG.FINISHED) })),
      minZ,
      now,
    );
    this.minis = [];
    const seen = new Set();
    for (const p of s.players) {
      const sk = this.skiers.get(p.id);
      if (!sk) continue;
      seen.add(p.id);
      const mini = miniIds.get(p.id);
      const out = p.z < minZ;
      if (out && !mini) {
        sk.placeStraggler(p, this.focus - 2, this.focus - p.z);
        continue;
      }
      // Cua gắt thì tuyết bắn lên ở ván trượt.
      if (sk.placeRace(p, dt, s.state) && Math.random() < (this.high ? 0.5 : 0.2)) {
        const at = sk.group.position.clone().setY(0.15);
        this.particles.burst(at, ['#ffffff', '#e8f0ff'], { count: 2, speed: 1.6, up: 1.2, life: 0.5 });
      }
      if (mini) this.minis.push({ id: p.id, sk, p, rect: mini.rect, leaving: mini.leaving, out });
    }
    for (const [id, sk] of this.skiers) if (!seen.has(id)) sk.group.visible = false;
    this.miniViews.updateMarkers(now, id => {
      const sk = this.skiers.get(id);
      if (!sk?.group.visible || !sk.body.visible) return null;
      const pos = sk.group.getWorldPosition(new THREE.Vector3());
      pos.y += 0.15; // dốc nghiêng: nhấc vòng sáng lên chút cho khỏi chìm vào tuyết
      return { pos, top: sk.label.sprite.position.y, color: sk.color };
    });
  }

  // Màn hình chung báo chỗ trống 2 bên (tránh bảng xếp hạng).
  setMiniArea(area) {
    this.miniViews.setArea(area);
  }

  // Vẽ các khung nhỏ: camera sau lưng người trượt, thấy cổng/cây/đá phía trước, ẩn người khác và rừng 2 bên.
  renderMinis() {
    let shown = [];
    const views = this.minis.map(({ id, sk, p, rect, leaving }) => ({
      id,
      rect,
      leaving,
      color: sk.color,
      text: behindText(sk.name, this.edgeZ - p.z),
      aim: cam => {
        cam.position.copy(this.toScene(p.x, 3.2, -(p.z - 6), this.tmpA));
        cam.lookAt(this.toScene(p.x, 0.5, -(p.z + 10), this.tmpB));
      },
      before: () => {
        sk.group.visible = true;
        sk.label.sprite.visible = false;
      },
      after: () => {
        sk.group.visible = false;
        sk.label.sprite.visible = true;
      },
    }));
    this.miniViews.draw(views, {
      begin: () => {
        shown = [...this.skiers.values()].filter(sk => sk.group.visible);
        for (const sk of shown) sk.group.visible = false;
        for (const o of this.scenery) o.visible = false;
      },
      end: () => {
        for (const o of this.scenery) o.visible = true;
        for (const sk of shown) sk.group.visible = true;
      },
    });
  }

  frame() {
    const dt = Math.min(0.05, this.clock.getDelta());
    const now = performance.now();
    this.minis = [];
    if (this.mode === 'race') this.updateRace(dt, now);
    else this.updateLobby(now);

    for (const sk of this.skiers.values()) sk.mixer?.update(dt);
    this.particles.update(dt);
    // Cảnh chính không vẽ những người có khung nhỏ mà đã ra khỏi khung hình (ở sau lưng camera).
    for (const m of this.minis) if (m.out) m.sk.group.visible = false;
    this.renderer.render(this.scene, this.camera);
    this.renderMinis();
  }
}

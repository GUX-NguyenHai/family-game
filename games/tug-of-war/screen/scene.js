// Cảnh 3D Kéo co: con sông chảy dọc giữa màn hình, đội Đỏ đứng bờ trái, đội Xanh bờ phải, sợi dây vắt ngang sông.
// Toạ độ: x = ngang màn hình (âm = trái/Đỏ, dương = phải/Xanh). Cả dây + hai đội dịch theo `rope` (mét).
// Con vật nào bị kéo vào lòng sông (|x| < nửa bề rộng sông) thì lội nước, đội thua ván thì ngã xuống sông.
import * as THREE from 'three';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { clamp, damp, findClip, loadAnimalTemplate, canvasTexture, noiseTexture, disposeTree, Label, Particles } from '/js/core/scene-kit.js';

const SPACING = 2; // khoảng cách giữa 2 con vật cùng đội (m)
const FRONT_GAP = 0.6; // con đứng đầu cách mép vạch thắng bấy nhiêu
const ROPE_Y = 1; // độ cao sợi dây
const WATER_Y = -0.45;
const BANK_W = 80;

function waterTexture() {
  const size = 256;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#2f86c9';
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < 140; i++) {
    ctx.fillStyle = `rgba(255,255,255,${0.08 + Math.random() * 0.22})`;
    ctx.fillRect(Math.random() * size, Math.random() * size, 2 + Math.random() * 2, 10 + Math.random() * 40);
  }
  return canvasTexture(c, true);
}

// ---------- Một con vật cầm dây ----------

class Puller {
  constructor(player, manifest, side) {
    this.id = player.id;
    this.manifest = manifest;
    this.side = side; // 0 = Đỏ (trái, quay mặt sang phải), 1 = Xanh (phải, quay sang trái)
    this.group = new THREE.Group();
    this.body = new THREE.Group(); // ngả người khi kéo, ngã khi thua
    this.group.add(this.body);
    this.label = new Label();
    this.group.add(this.label.sprite);
    this.pivot = null;
    this.mixer = null;
    this.actions = {};
    this.current = null;
    this.currentKey = null;
    this.height = 1.5;
    this.loadToken = 0;
    this.disposed = false;
    this.animal = undefined; // khác mọi giá trị thật để lần đầu luôn tải model
    this.inWater = false;
    this.y = 0;
    this.setPlayer(player, side);
  }

  setPlayer(player, side, color) {
    this.side = side;
    if (this.pivot) this.pivot.rotation.y = this.yaw();
    this.label.set(player.name, color || player.color);
    if (player.animal !== this.animal) {
      this.animal = player.animal;
      this.loadModel(player.animal);
    }
  }

  yaw() {
    return this.manifest.modelYaw + (this.side === 0 ? -Math.PI / 2 : Math.PI / 2);
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
    this.pivot.rotation.y = this.yaw();
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
      const box = new THREE.Mesh(new THREE.BoxGeometry(this.manifest.targetLength, 1.2, 0.8), new THREE.MeshLambertMaterial({ color: 0xcccccc }));
      box.position.y = 0.6;
      this.pivot.add(box);
      this.mixer = null;
      this.height = 1.2;
    }
    this.body.add(this.pivot);
    this.label.sprite.position.y = this.height + 0.7;
    this.setAnim('idle');
  }

  setAnim(key, { timeScale = 1, once = false } = {}) {
    const action = this.actions[key] || this.actions.idle;
    if (!action) return;
    if (this.currentKey === key) {
      action.setEffectiveTimeScale(timeScale);
      return;
    }
    action.reset();
    action.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, Infinity);
    action.clampWhenFinished = once;
    action.setEffectiveTimeScale(timeScale).setEffectiveWeight(1).fadeIn(0.2).play();
    if (this.current && this.current !== action) this.current.fadeOut(0.2);
    this.current = action;
    this.currentKey = key;
  }

  // x: vị trí thật (đã cộng độ lệch dây). level: mức kéo 0..1. mood: 'pull' | 'win' | 'lose' | 'idle'.
  // Trả về true nếu vừa rơi xuống nước (để bắn nước).
  place(x, z, level, mood, riverHalf, dt) {
    this.group.position.set(x, 0, z);
    const wasInWater = this.inWater;
    this.inWater = Math.abs(x) < riverHalf;
    const fallen = mood === 'lose' && this.inWater;
    const targetY = fallen ? WATER_Y - 0.6 : this.inWater ? WATER_Y : 0;
    this.y = damp(this.y, targetY, 8, dt);
    this.body.position.y = this.y;

    // Ngả người về sau khi kéo (Đỏ quay mặt sang phải nên ngả sang trái, Xanh ngược lại).
    const back = this.side === 0 ? 1 : -1;
    let lean = 0;
    if (mood === 'pull') lean = level > 0.12 ? 0.12 + level * 0.25 : 0.05;
    if (fallen) lean = -0.9; // ngã chúi xuống sông
    this.body.rotation.z = damp(this.body.rotation.z, lean * back, 8, dt);

    if (mood === 'win') this.setAnim('celebrate');
    else if (fallen) this.setAnim(this.side === 0 ? 'hitRight' : 'hitLeft', { once: true });
    else if (mood === 'pull' && level > 0.12) this.setAnim('walk', { timeScale: -(0.6 + level * 1.4) }); // lùi lại
    else this.setAnim('idle');
    return this.inWater && !wasInWater;
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

export class TugScene {
  constructor(canvas, manifest, quality = 'high') {
    this.manifest = manifest;
    this.high = quality === 'high';
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: this.high, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, this.high ? 2 : 1));
    this.renderer.shadowMap.enabled = this.high;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x9fd8ff);
    this.scene.fog = new THREE.Fog(0xbfe6ff, 60, 160);
    this.camera = new THREE.PerspectiveCamera(45, 1, 0.5, 400);

    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x6a8f4e, 1.5));
    this.sun = new THREE.DirectionalLight(0xffffff, 2.2);
    this.sun.position.set(-10, 30, 20);
    this.sun.castShadow = this.high;
    this.sun.shadow.mapSize.set(2048, 2048);
    Object.assign(this.sun.shadow.camera, { left: -30, right: 30, top: 20, bottom: -20, near: 1, far: 100 });
    this.sun.shadow.camera.updateProjectionMatrix();
    this.scene.add(this.sun);

    this.riverHalf = 2;
    this.win = 4;
    this.pullers = new Map();
    this.teams = [[], []]; // id thành viên mỗi đội theo thứ tự đứng (người đầu tiên đứng sát sông)
    this.extras = []; // người chưa chọn đội (phòng chờ): đứng xem phía sau
    this.teamColors = ['#e6194b', '#4363d8'];
    this.rope = 0; // độ lệch dây đang vẽ (mượt theo server)
    this.ropeTarget = 0;
    this.levels = new Map();
    this.mood = 'idle';
    this.lastWinner = null;
    this.particles = new Particles(this.scene);
    this.clock = new THREE.Clock();
    this.worldGroup = null;

    this.ropeMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 1, 8), new THREE.MeshLambertMaterial({ color: 0xc8a46d }));
    this.ropeMesh.rotation.z = Math.PI / 2;
    this.ropeMesh.castShadow = true;
    this.scene.add(this.ropeMesh);
    // Dải vải đỏ đánh dấu giữa dây.
    this.ribbon = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.6, 8), new THREE.MeshLambertMaterial({ color: 0xff3b3b }));
    this.ribbon.rotation.x = Math.PI;
    this.scene.add(this.ribbon);

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

  // Sông, hai bờ, vạch thắng, cây cối. Dựng lại khi đổi độ rộng sông hoặc vạch thắng.
  buildWorld() {
    if (this.worldGroup) {
      this.scene.remove(this.worldGroup);
      disposeTree(this.worldGroup);
    }
    const g = new THREE.Group();
    this.worldGroup = g;
    this.scene.add(g);
    const rh = this.riverHalf;

    const waterTex = waterTexture();
    waterTex.repeat.set(1, 12);
    this.water = new THREE.Mesh(
      new THREE.PlaneGeometry(rh * 2 + 1, 160),
      new THREE.MeshPhongMaterial({ map: waterTex, shininess: 80, specular: 0x88ccff }),
    );
    this.water.rotation.x = -Math.PI / 2;
    this.water.position.set(0, WATER_Y, -40);
    g.add(this.water);

    const grassTex = noiseTexture('#6fbf5b', '#4f9c3f');
    grassTex.repeat.set(BANK_W / 6, 160 / 6);
    for (const side of [-1, 1]) {
      const bank = new THREE.Mesh(new THREE.BoxGeometry(BANK_W, 1, 160), new THREE.MeshLambertMaterial({ map: grassTex }));
      bank.position.set(side * (rh + BANK_W / 2), -0.5, -40);
      bank.receiveShadow = true;
      g.add(bank);
      // Vạch thắng: dấu giữa dây qua vạch bên nào thì đội bên đó thắng.
      const line = new THREE.Mesh(new THREE.PlaneGeometry(0.25, 8), new THREE.MeshBasicMaterial({ color: side < 0 ? 0xff6b6b : 0x6b9bff }));
      line.rotation.x = -Math.PI / 2;
      line.position.set(side * this.win, 0.02, 0);
      g.add(line);
    }

    // Cây và đồi phía sau (instanced cho nhẹ).
    const treeCount = this.high ? 160 : 60;
    const trunks = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.15, 0.22, 1.2, 6), new THREE.MeshLambertMaterial({ color: 0x7a5230 }), treeCount);
    const crowns = new THREE.InstancedMesh(new THREE.ConeGeometry(1.2, 2.8, 7), new THREE.MeshLambertMaterial({ color: 0x2f8f3a }), treeCount);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const s = new THREE.Vector3();
    const p = new THREE.Vector3();
    for (let t = 0; t < treeCount; t++) {
      const side = t % 2 ? 1 : -1;
      const x = side * (rh + 3 + Math.random() * 45);
      const z = -8 - Math.random() * 90;
      const k = 0.7 + Math.random() * 0.8;
      s.set(k, k, k);
      p.set(x, 0.6 * k, z);
      trunks.setMatrixAt(t, m.compose(p, q, s));
      p.set(x, 2.6 * k, z);
      crowns.setMatrixAt(t, m.compose(p, q, s));
    }
    if (this.high) crowns.castShadow = true;
    g.add(trunks, crowns);
    const hillMat = new THREE.MeshLambertMaterial({ color: 0x5da65a, flatShading: true });
    const hillGeo = new THREE.IcosahedronGeometry(1, 1);
    for (let h = 0; h < 10; h++) {
      const hill = new THREE.Mesh(hillGeo, hillMat);
      hill.position.set((h - 4.5) * 22 + Math.random() * 8, -2, -90 - Math.random() * 20);
      hill.scale.set(25 + Math.random() * 15, 10 + Math.random() * 10, 20);
      g.add(hill);
    }
  }

  setField(riverHalf, win) {
    if (riverHalf === this.riverHalf && win === this.win) return;
    this.riverHalf = riverHalf;
    this.win = win;
    this.buildWorld();
  }

  // teams: [{ color, members: [id] }, { … }]; extras: id người chưa chọn đội; playerOf: id → người chơi.
  setTeams(teams, extras, playerOf) {
    this.teams = [teams[0]?.members || [], teams[1]?.members || []];
    this.teamColors = [teams[0]?.color || '#e6194b', teams[1]?.color || '#4363d8'];
    this.extras = extras || [];
    const ids = new Set([...this.teams[0], ...this.teams[1], ...this.extras]);
    for (const [id, pl] of this.pullers) {
      if (!ids.has(id)) {
        pl.dispose();
        this.pullers.delete(id);
      }
    }
    const put = (id, side, color) => {
      const player = playerOf(id) || { id, name: '?', animal: null, color };
      let pl = this.pullers.get(id);
      if (!pl) {
        pl = new Puller(player, this.manifest, side);
        this.pullers.set(id, pl);
        this.scene.add(pl.group);
      }
      pl.setPlayer(player, side, color);
    };
    this.teams.forEach((members, side) => members.forEach(id => put(id, side, this.teamColors[side])));
    this.extras.forEach(id => put(id, 0, '#9aa5bd'));
  }

  // s: trạng thái server (rope, phase, winner, p: [{ id, d }]).
  setState(s) {
    this.ropeTarget = s.phase === 'countdown' ? 0 : s.rope;
    this.levels = new Map(s.p.map(x => [x.id, x.d]));
    this.lastWinner = s.winner;
    if (s.phase === 'pull') this.mood = 'pull';
    else if (s.phase === 'end' || s.phase === 'done') this.mood = 'end';
    else this.mood = 'idle';
  }

  reset() {
    this.mood = 'idle';
    this.rope = this.ropeTarget = 0;
    this.lastWinner = null;
    this.levels = new Map();
  }

  splash(x, z) {
    this.particles.burst(new THREE.Vector3(x, WATER_Y + 0.3, z), ['#ffffff', '#a8dcff', '#2f86c9'], { count: 26, speed: 3, up: 5, life: 1 });
  }

  updateCamera() {
    const n = Math.max(1, this.teams[0].length, this.teams[1].length);
    const halfSpan = this.win + FRONT_GAP + n * SPACING + 2;
    const vfov = (this.camera.fov * Math.PI) / 180;
    const hfov = 2 * Math.atan(Math.tan(vfov / 2) * this.camera.aspect);
    const dist = clamp(halfSpan / Math.tan(hfov / 2), 12, 70);
    this.camera.position.set(0, dist * 0.38, dist);
    this.camera.lookAt(0, 0.5, -2);
  }

  frame() {
    const dt = Math.min(0.05, this.clock.getDelta());
    const now = performance.now();
    this.rope = damp(this.rope, this.ropeTarget, 10, dt);
    this.updateCamera();

    const rh = this.riverHalf;
    const front = this.win + FRONT_GAP;
    let minX = 0;
    let maxX = 0;
    this.teams.forEach((members, side) => {
      const dir = side === 0 ? -1 : 1;
      let mood = this.mood === 'pull' ? 'pull' : 'idle';
      if (this.mood === 'end' && this.lastWinner != null) mood = side === this.lastWinner ? 'win' : 'lose';
      members.forEach((id, i) => {
        const pl = this.pullers.get(id);
        if (!pl) return;
        const x = dir * (front + i * SPACING) + this.rope;
        const z = (i % 2 ? 0.35 : -0.35); // so le nhẹ cho khỏi chồng lên nhau
        if (pl.place(x, z, this.levels.get(id) || 0, mood, rh, dt)) this.splash(x, z);
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
      });
    });
    // Người chưa chọn đội đứng xem phía sau, bên bờ trái.
    this.extras.forEach((id, i) => this.pullers.get(id)?.place(-(rh + 3 + i * SPACING), -5, 0, 'idle', rh, dt));

    // Sợi dây nối hai đội, dải đỏ ở giữa.
    const left = Math.min(minX, -front) - 1;
    const right = Math.max(maxX, front) + 1;
    this.ropeMesh.scale.y = right - left;
    this.ropeMesh.position.set((left + right) / 2, ROPE_Y, 0);
    this.ribbon.position.set(this.rope, ROPE_Y - 0.3 + Math.sin(now / 300) * 0.03, 0);

    if (this.water) this.water.material.map.offset.y += dt * 0.15; // nước chảy
    for (const pl of this.pullers.values()) pl.update(dt);
    this.particles.update(dt);
    this.renderer.render(this.scene, this.camera);
  }

  destroy() {
    this.renderer.setAnimationLoop(null);
    window.removeEventListener('resize', this.onResize);
    for (const pl of this.pullers.values()) pl.dispose();
    this.pullers.clear();
    if (this.worldGroup) disposeTree(this.worldGroup);
    this.ropeMesh.geometry.dispose();
    this.ribbon.geometry.dispose();
    this.particles.dispose();
    this.renderer.dispose();
  }
}

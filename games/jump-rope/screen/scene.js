// Cảnh 3D Nhảy dây: một hàng con vật đứng giữa sân, quay mặt ra phía người xem; sợi dây dài căng giữa 2 cột,
// 2 con vật đứng cạnh cột quay dây. Dây quay quanh trục nằm ngang (trục x): từ sau lưng lên qua đầu,
// quét xuống trước mặt rồi chạm đất dưới chân.
// rev = số vòng dây đã quay (server gửi): số nguyên = dây chạm đất. TV tự quay dây theo tốc độ giữa 2 lần nhận.
import * as THREE from 'three';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { clamp, damp, findClip, loadAnimalTemplate, noiseTexture, disposeTree, Label, Particles } from '/js/core/scene-kit.js';

const SPACING = 1.4; // khoảng cách giữa 2 người nhảy (m)
const JUMPER_SCALE = 0.65; // con vật thu nhỏ cho hàng người nhảy gọn
const TURNER_SCALE = 0.8;
const ROPE_END = 3; // dây dài hơn hàng người bấy nhiêu mét mỗi đầu
const AXIS_Y = 1.75; // độ cao trục quay (tay cầm dây trên cột)
const ROPE_RADIUS = 1.72; // giữa dây cách trục bấy nhiêu khi căng (chạm đất lúc ở dưới)
const ROPE_SHAPE = 6; // độ "vuông" của dây: lớn = giữa dây phẳng, chỉ cong gần 2 đầu
const JUMP_HEIGHT = 0.75;
const BACK_ROW_Z = -4.2; // người bị loại ra đứng xem phía sau
const TURNER_ANIMALS = ['bull', 'cow'];

// ---------- Một con vật (người nhảy hoặc người quay dây) ----------

class Animal {
  constructor(player, manifest, { scale = 1, labeled = true } = {}) {
    this.id = player.id;
    this.manifest = manifest;
    this.scale = scale;
    this.group = new THREE.Group();
    this.body = new THREE.Group(); // bật lên khi nhảy, ngã khi vướng dây
    this.group.add(this.body);
    this.yaw = manifest.modelYaw + Math.PI; // mặc định model quay vào trong màn hình; +180° = quay ra người xem
    this.label = null;
    this.ring = null;
    if (labeled) {
      this.label = new Label();
      this.group.add(this.label.sprite);
      this.ringMat = new THREE.MeshBasicMaterial({ color: player.color, transparent: true, opacity: 0.9, depthWrite: false });
      this.ring = new THREE.Mesh(new THREE.RingGeometry(0.42, 0.6, 28), this.ringMat);
      this.ring.rotation.x = -Math.PI / 2;
      this.ring.position.y = 0.04;
      this.group.add(this.ring);
    }
    this.pivot = null;
    this.mixer = null;
    this.actions = {};
    this.current = null;
    this.currentKey = null;
    this.height = 1;
    this.loadToken = 0;
    this.disposed = false;
    this.animal = undefined; // khác mọi giá trị thật để lần đầu luôn tải model
    this.jumpAt = -Infinity;
    this.outAt = null;
    this.x = 0;
    this.z = 0;
    this.setPlayer(player);
  }

  setPlayer(player) {
    this.name = player.name;
    this.color = player.color;
    if (this.label) {
      this.label.set(player.name, player.color);
      this.ringMat.color.set(player.color);
    }
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
    this.actions = {};
    this.current = null;
    this.currentKey = null;
    if (tpl) {
      const model = SkeletonUtils.clone(tpl.root);
      model.scale.setScalar(tpl.scale * this.scale);
      model.position.copy(tpl.offset).multiplyScalar(this.scale);
      this.pivot.add(model);
      this.mixer = new THREE.AnimationMixer(model);
      for (const [key, names] of Object.entries(this.manifest.clips)) {
        const clip = findClip(tpl.clips, names);
        if (clip) this.actions[key] = this.mixer.clipAction(clip);
      }
      this.height = tpl.height * this.scale;
    } else {
      const box = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.8, 1.2), new THREE.MeshLambertMaterial({ color: 0xcccccc }));
      box.position.y = 0.4;
      this.pivot.add(box);
      this.mixer = null;
      this.height = 0.8;
    }
    this.body.add(this.pivot);
    if (this.label) this.label.sprite.position.y = this.height + 0.55;
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
    action.setEffectiveTimeScale(timeScale).setEffectiveWeight(1).fadeIn(0.15).play();
    if (this.current && this.current !== action) this.current.fadeOut(0.15);
    this.current = action;
    this.currentKey = key;
  }

  jump(now) {
    if (this.outAt == null) this.jumpAt = now;
  }

  setOut(now) {
    if (this.outAt == null) this.outAt = now;
  }

  reset() {
    this.jumpAt = -Infinity;
    this.outAt = null;
    this.body.rotation.set(0, 0, 0);
    this.body.position.y = 0;
  }

  // Người nhảy: x = chỗ đứng trong hàng; mood: 'idle' | 'play' | 'win'.
  placeJumper(x, now, dt, airMs, mood) {
    this.x = x;
    if (this.outAt != null) {
      // Vướng dây: ngã ra (~0,9 giây) rồi đứng dậy đi ra hàng sau đứng xem.
      const t = now - this.outAt;
      const lying = t < 900;
      this.body.rotation.z = damp(this.body.rotation.z, lying ? 1.35 : 0, lying ? 10 : 5, dt);
      this.body.position.y = damp(this.body.position.y, 0, 10, dt);
      if (!lying) this.z = damp(this.z, BACK_ROW_Z, 2.2, dt);
      const walking = !lying && Math.abs(this.z - BACK_ROW_Z) > 0.2;
      this.setAnim(lying ? 'hitLeft' : walking ? 'walk' : 'idle', { once: lying });
      if (this.ring) this.ring.visible = false;
    } else {
      this.z = damp(this.z, 0, 4, dt);
      const t = (now - this.jumpAt) / airMs;
      const inAir = t >= 0 && t < 1;
      this.body.position.y = inAir ? JUMP_HEIGHT * 4 * t * (1 - t) : 0;
      this.body.rotation.z = damp(this.body.rotation.z, 0, 8, dt);
      if (mood === 'win') this.setAnim('celebrate');
      else if (inAir) this.setAnim('jump', { timeScale: 1.4 });
      else this.setAnim('idle');
      if (this.ring) this.ring.visible = true;
    }
    this.group.position.set(this.x, 0, this.z);
  }

  update(dt) {
    this.mixer?.update(dt);
  }

  dispose() {
    this.disposed = true;
    this.mixer?.stopAllAction();
    this.label?.dispose();
    if (this.ring) {
      this.ring.geometry.dispose();
      this.ringMat.dispose();
    }
    this.group.parent?.remove(this.group);
  }
}

// ---------- Cảnh chính ----------

export class RopeScene {
  constructor(canvas, manifest, quality = 'high') {
    this.manifest = manifest;
    this.high = quality === 'high';
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: this.high, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, this.high ? 2 : 1));
    this.renderer.shadowMap.enabled = this.high;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x9fd8ff);
    this.scene.fog = new THREE.Fog(0xbfe6ff, 50, 140);
    this.camera = new THREE.PerspectiveCamera(42, 1, 0.5, 300);

    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x6a8f4e, 1.5));
    this.sun = new THREE.DirectionalLight(0xffffff, 2.2);
    this.sun.position.set(-8, 25, 18);
    this.sun.castShadow = this.high;
    this.sun.shadow.mapSize.set(2048, 2048);
    Object.assign(this.sun.shadow.camera, { left: -20, right: 20, top: 15, bottom: -15, near: 1, far: 80 });
    this.sun.shadow.camera.updateProjectionMatrix();
    this.scene.add(this.sun);

    this.jumpers = new Map(); // id → Animal
    this.order = []; // thứ tự đứng trong hàng (trái → phải)
    this.turners = [];
    this.posts = [];
    this.ropeMesh = null;
    this.ropeLen = 0;
    this.airMs = 500;
    this.rev = 0; // vòng dây đang vẽ
    this.rate = 0;
    this.target = { rev: 0, rate: 0, recv: 0 };
    this.phase = 'lobby';
    this.onBottom = null; // gọi mỗi lần dây chạm đất (để kêu "tách")
    this.extraYaw = 0;
    this.particles = new Particles(this.scene);
    this.clock = new THREE.Clock();

    this.buildWorld();
    for (const [i, animal] of TURNER_ANIMALS.entries()) {
      const t = new Animal({ id: `turner-${i}`, name: '', animal, color: '#fff' }, manifest, { scale: TURNER_SCALE, labeled: false });
      t.setYaw(manifest.modelYaw + (i === 0 ? -Math.PI / 2 : Math.PI / 2)); // quay mặt vào giữa
      this.turners.push(t);
      this.scene.add(t.group);
    }
    this.layoutRope(1);

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

  // Sân cỏ, khoảng đất giữa sân, cây và đồi phía sau.
  buildWorld() {
    const g = new THREE.Group();
    this.worldGroup = g;
    this.scene.add(g);
    const grassTex = noiseTexture('#6fbf5b', '#4f9c3f');
    grassTex.repeat.set(30, 30);
    const grass = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), new THREE.MeshLambertMaterial({ map: grassTex }));
    grass.rotation.x = -Math.PI / 2;
    grass.receiveShadow = true;
    g.add(grass);
    const dirtTex = noiseTexture('#d9b98a', '#b8946a');
    dirtTex.repeat.set(8, 3);
    const dirt = new THREE.Mesh(new THREE.CircleGeometry(1, 48), new THREE.MeshLambertMaterial({ map: dirtTex }));
    dirt.rotation.x = -Math.PI / 2;
    dirt.position.y = 0.01;
    dirt.receiveShadow = true;
    this.dirt = dirt;
    g.add(dirt);

    const treeCount = this.high ? 90 : 35;
    const trunks = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.15, 0.22, 1.2, 6), new THREE.MeshLambertMaterial({ color: 0x7a5230 }), treeCount);
    const crowns = new THREE.InstancedMesh(new THREE.ConeGeometry(1.2, 2.8, 7), new THREE.MeshLambertMaterial({ color: 0x2f8f3a }), treeCount);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const s = new THREE.Vector3();
    const p = new THREE.Vector3();
    for (let t = 0; t < treeCount; t++) {
      const x = (Math.random() - 0.5) * 90;
      const z = -10 - Math.random() * 40;
      const k = 0.8 + Math.random() * 0.9;
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
    for (let h = 0; h < 8; h++) {
      const hill = new THREE.Mesh(hillGeo, hillMat);
      hill.position.set((h - 3.5) * 24 + Math.random() * 8, -2, -60 - Math.random() * 15);
      hill.scale.set(25 + Math.random() * 15, 10 + Math.random() * 8, 18);
      g.add(hill);
    }
  }

  // Dây + 2 cột + 2 người quay dây theo số người nhảy (dựng lại khi số người đổi).
  layoutRope(count) {
    const n = Math.max(1, count);
    const len = (n - 1) * SPACING + ROPE_END * 2;
    if (this.ropeMesh && Math.abs(len - this.ropeLen) < 0.01) return;
    this.ropeLen = len;
    const half = len / 2;

    if (this.ropeMesh) {
      this.scene.remove(this.ropeMesh);
      this.ropeMesh.geometry.dispose();
      this.ropeMesh.material.dispose();
    }
    // Dây nằm trong mặt phẳng xy (cong lên phía +y), quay quanh trục x bằng rotation.x.
    const points = [];
    for (let i = 0; i <= 80; i++) {
      const u = i / 80;
      const sag = 1 - Math.abs(2 * u - 1) ** ROPE_SHAPE;
      points.push(new THREE.Vector3(-half + len * u, ROPE_RADIUS * sag, 0));
    }
    this.ropeMesh = new THREE.Mesh(
      new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 160, 0.045, 6, false),
      new THREE.MeshLambertMaterial({ color: 0xff4fa3 }),
    );
    this.ropeMesh.position.y = AXIS_Y;
    this.ropeMesh.castShadow = true;
    this.scene.add(this.ropeMesh);

    for (const post of this.posts) {
      this.scene.remove(post.group);
      disposeTree(post.group);
    }
    this.posts = [-1, 1].map(side => {
      const group = new THREE.Group();
      group.position.set(side * (half + 0.15), 0, 0);
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, AXIS_Y + 0.25, 10), new THREE.MeshLambertMaterial({ color: 0x8b5a2b }));
      pole.position.y = (AXIS_Y + 0.25) / 2;
      pole.castShadow = true;
      const crank = new THREE.Group(); // tay quay ở đầu cột, quay cùng dây
      crank.position.y = AXIS_Y;
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.32, 0.06), new THREE.MeshLambertMaterial({ color: 0xffd166 }));
      arm.position.y = 0.16;
      crank.add(arm);
      group.add(pole, crank);
      this.scene.add(group);
      return { group, crank };
    });
    this.turners.forEach((t, i) => {
      t.x = (i === 0 ? -1 : 1) * (half + 1.1);
      t.group.position.set(t.x, 0, 0.5);
    });
    this.dirt.scale.set(half + 3, 6, 1);
  }

  // Hàng người nhảy: ids theo thứ tự trái → phải; playerOf: id → người chơi.
  setJumpers(ids, playerOf) {
    this.order = ids;
    const keep = new Set(ids);
    for (const [id, a] of this.jumpers) {
      if (!keep.has(id)) {
        a.dispose();
        this.jumpers.delete(id);
      }
    }
    for (const id of ids) {
      const player = playerOf(id) || { id, name: '?', animal: null, color: '#fff' };
      let a = this.jumpers.get(id);
      if (!a) {
        a = new Animal(player, this.manifest, { scale: JUMPER_SCALE });
        a.setYaw(this.manifest.modelYaw + Math.PI + this.extraYaw);
        this.jumpers.set(id, a);
        this.scene.add(a.group);
      } else {
        a.setPlayer(player);
      }
    }
    this.layoutRope(ids.length);
  }

  // Phòng chờ hoặc ván mới: mọi người đứng lại hàng, dây nằm dưới đất.
  reset(airMs) {
    if (airMs) this.airMs = airMs;
    for (const a of this.jumpers.values()) a.reset();
    this.rev = 0;
    this.rate = 0;
    this.target = { rev: 0, rate: 0, recv: performance.now() };
  }

  setPhase(phase) {
    this.phase = phase;
  }

  // s: trạng thái server đã giải mã.
  setState(s, now) {
    this.phase = s.phase;
    this.target = { rev: s.rev, rate: s.rate, recv: now };
    for (const p of s.p) if (p.f & 1) this.jumpers.get(p.id)?.setOut(now);
  }

  jump(id) {
    this.jumpers.get(id)?.jump(performance.now());
  }

  // Ai đó vướng dây: bụi bay ở chân.
  trip(id) {
    const a = this.jumpers.get(id);
    if (!a) return;
    a.setOut(performance.now());
    this.particles.burst(new THREE.Vector3(a.x, 0.2, 0.3), ['#d9b98a', '#ffffff', a.color], { count: 18, speed: 2.5, up: 3 });
  }

  // Phím Y: xoay model người nhảy 90° nếu con vật quay sai hướng.
  rotateModels(delta) {
    this.extraYaw = (this.extraYaw + delta) % (Math.PI * 2);
    for (const a of this.jumpers.values()) a.setYaw(this.manifest.modelYaw + Math.PI + this.extraYaw);
    return this.extraYaw;
  }

  updateCamera() {
    const halfSpan = this.ropeLen / 2 + 2.5;
    const vfov = (this.camera.fov * Math.PI) / 180;
    const hfov = 2 * Math.atan(Math.tan(vfov / 2) * this.camera.aspect);
    const dist = clamp(halfSpan / Math.tan(hfov / 2), 9, 60);
    this.camera.position.set(0, 2.2 + dist * 0.22, dist);
    this.camera.lookAt(0, 1.1, -0.5);
  }

  // Quay dây mượt: chạy theo tốc độ server, kéo dần về vị trí server dự đoán (lệch nhiều thì nhảy thẳng tới).
  updateRope(now, dt) {
    const predicted = this.target.rev + (this.target.rate * (now - this.target.recv)) / 1000;
    const before = this.rev;
    this.rate = this.target.rate;
    this.rev += this.rate * dt;
    const err = predicted - this.rev;
    if (Math.abs(err) > 0.5) this.rev = predicted;
    else this.rev += err * Math.min(1, dt * 6);
    if (this.phase === 'playing' && Math.floor(this.rev) > Math.floor(before) && this.rev - before < 0.5) this.onBottom?.();
    const frac = this.rev - Math.floor(this.rev);
    const angle = Math.PI + frac * Math.PI * 2; // frac 0 = chạm đất; tăng dần: lên sau lưng → qua đầu → xuống trước mặt
    this.ropeMesh.rotation.x = angle;
    for (const post of this.posts) post.crank.rotation.x = angle;
  }

  frame() {
    const dt = Math.min(0.05, this.clock.getDelta());
    const now = performance.now();
    this.updateCamera();
    this.updateRope(now, dt);

    const n = this.order.length;
    const mood = this.phase === 'finished' ? 'win' : 'play';
    this.order.forEach((id, i) => {
      const a = this.jumpers.get(id);
      if (a) a.placeJumper((i - (n - 1) / 2) * SPACING, now, dt, this.airMs, a.outAt == null ? mood : 'play');
    });
    const turning = this.rate > 0;
    for (const t of this.turners) t.setAnim(turning ? 'walk' : 'idle', { timeScale: 0.7 });

    for (const a of this.jumpers.values()) a.update(dt);
    for (const t of this.turners) t.update(dt);
    this.particles.update(dt);
    this.renderer.render(this.scene, this.camera);
  }

  destroy() {
    this.renderer.setAnimationLoop(null);
    window.removeEventListener('resize', this.onResize);
    for (const a of this.jumpers.values()) a.dispose();
    this.jumpers.clear();
    for (const t of this.turners) t.dispose();
    for (const post of this.posts) disposeTree(post.group);
    if (this.ropeMesh) {
      this.ropeMesh.geometry.dispose();
      this.ropeMesh.material.dispose();
    }
    disposeTree(this.worldGroup);
    this.particles.dispose();
    this.renderer.dispose();
  }
}

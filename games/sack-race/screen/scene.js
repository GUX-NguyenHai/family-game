// Cảnh 3D Nhảy bao bố cho màn hình chung: đường đua thẳng chia làn, mỗi con vật đứng trong một bao bố màu
// người chơi, nhảy từng bước về đích. Camera bám nhóm dẫn đầu; người tụt lại có khung nhỏ (/js/core/mini-views.js).
// Toạ độ server: z = quãng đường (0 → trackLen). Trong three.js: worldZ = -z (nhảy vào trong màn hình).
import * as THREE from 'three';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import {
  clamp,
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

export const FLAG = { HOP: 1, FALL: 2, FINISHED: 4 };

const LEAD_VIEW_BEHIND = 12; // camera nhìn từ người dẫn đầu lùi về bấy nhiêu mét
const TRACK_EXTRA_BEFORE = 30;
const TRACK_EXTRA_AFTER = 60;
const HOP_HEIGHT = 0.75;

export function trackWidthFor(count) {
  return clamp(4 + count * 1.2, 8, 18);
}

// Bao bố: ống vải hở miệng, bầu ra ở giữa, dài theo thân con vật.
const SACK_GEO = new THREE.LatheGeometry(
  [
    new THREE.Vector2(0.001, 0),
    new THREE.Vector2(0.5, 0.02),
    new THREE.Vector2(0.62, 0.25),
    new THREE.Vector2(0.6, 0.7),
    new THREE.Vector2(0.68, 0.92),
  ],
  20,
);
const RIM_GEO = new THREE.TorusGeometry(0.68, 0.05, 6, 20);

// ---------- Một con vật trong bao bố ----------

class Hopper {
  constructor(player, manifest) {
    this.id = player.id;
    this.manifest = manifest;
    this.group = new THREE.Group();
    this.body = new THREE.Group(); // bật lên khi nhảy, ngã khi hất hỏng
    this.group.add(this.body);

    this.sackMat = new THREE.MeshLambertMaterial({ color: player.color, side: THREE.DoubleSide, map: noiseTexture('#ffffff', '#c9c9c9', 64) });
    this.sack = new THREE.Group();
    const bag = new THREE.Mesh(SACK_GEO, this.sackMat);
    bag.castShadow = true;
    const rim = new THREE.Mesh(RIM_GEO, this.sackMat);
    rim.rotation.x = Math.PI / 2;
    rim.position.y = 0.92;
    this.sack.add(bag, rim);
    this.sack.scale.set(0.8, 1, 1.75); // dài theo thân con vật (dọc trục z)
    this.body.add(this.sack);

    this.label = new Label();
    this.group.add(this.label.sprite);
    this.yaw = manifest.modelYaw;
    this.pivot = null;
    this.mixer = null;
    this.actions = {};
    this.current = null;
    this.currentKey = null;
    this.height = 1.5;
    this.loadToken = 0;
    this.disposed = false;
    this.z = 0; // quãng đường đang vẽ
    this.targetZ = 0; // quãng đường server gửi
    this.hop = null; // { start, from, len } bước nhảy đang vẽ
    this.behindShown = 0;
    this.setPlayer(player);
  }

  setPlayer(player) {
    this.name = player.name;
    this.color = player.color;
    this.sackMat.color.set(player.color);
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
      const box = new THREE.Mesh(new THREE.BoxGeometry(0.8, 1.2, this.manifest.targetLength), new THREE.MeshLambertMaterial({ color: 0xcccccc }));
      box.position.y = 0.6;
      this.pivot.add(box);
      this.mixer = null;
      this.height = 1.2;
    }
    this.body.add(this.pivot);
    this.label.sprite.position.y = this.height + 0.7;
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
    this.label.sprite.position.y = shown ? this.height + 0.7 : 1;
  }

  // Server báo bắt đầu một bước nhảy dài len mét.
  startHop(now, len) {
    this.hop = { start: now, from: this.z, len };
  }

  reset() {
    this.z = this.targetZ = 0;
    this.hop = null;
    this.body.position.y = 0;
    this.body.rotation.set(0, 0, 0);
  }

  placeLobby(x, dt) {
    this.group.visible = true;
    this.setShown(true);
    this.reset();
    this.group.position.set(x, 0, 0);
    this.setAnim('idle');
    this.showBehind(0);
  }

  // Tụt ra khỏi khung hình (và không có khung nhỏ): chỉ hiện nhãn "Tên ↓Xm" ở mép dưới.
  placeStraggler(x, edgeZ, behind) {
    this.group.visible = true;
    this.setShown(false);
    this.group.position.set(x, 0, -edgeZ);
    this.showBehind(behind);
  }

  // Cập nhật quãng đường đang vẽ: bước nhảy vẽ theo thời gian, ngoài ra đuổi dần theo server.
  advance(now, dt, hopMs) {
    let k = -1;
    if (this.hop) {
      k = (now - this.hop.start) / hopMs;
      if (k >= 1) {
        this.z = this.hop.from + this.hop.len;
        this.hop = null;
        k = -1;
      } else {
        this.z = this.hop.from + this.hop.len * k;
      }
    }
    if (!this.hop) this.z = Math.abs(this.targetZ - this.z) > 3 ? this.targetZ : damp(this.z, this.targetZ, 6, dt);
    return k;
  }

  // p: { x, z, f, c, r }; k: tiến độ bước nhảy (0..1) hoặc -1.
  placeRace(p, k, dt, state) {
    this.group.visible = true;
    this.setShown(true);
    this.group.position.set(p.x, 0, -this.z);
    const inAir = k >= 0;
    this.body.position.y = inAir ? HOP_HEIGHT * Math.sin(Math.PI * k) : damp(this.body.position.y, 0, 14, dt);
    this.body.rotation.x = inAir ? -0.18 * Math.sin(Math.PI * k) : damp(this.body.rotation.x, 0, 10, dt); // chúi người khi nhảy
    // Đáp xuống thì bao bố hơi bẹp lại cho có cảm giác nảy.
    const squash = !inAir && this.landedAt != null ? Math.max(0, 1 - (performance.now() - this.landedAt) / 150) : 0;
    this.sack.scale.y = 1 - 0.15 * squash;
    if (inAir) this.landedAt = null;
    else if (this.wasInAir) this.landedAt = performance.now();
    this.wasInAir = inAir;

    const fallen = !!(p.f & FLAG.FALL);
    this.body.rotation.z = damp(this.body.rotation.z, fallen ? 1.35 : 0, fallen ? 12 : 6, dt);
    if (state === 'countdown') this.setAnim('idle');
    else if (p.f & FLAG.FINISHED) this.setAnim(p.r === 1 ? 'celebrate' : 'idle');
    else if (fallen) this.setAnim('hitLeft', { once: true });
    else this.setAnim('idle');
    this.showBehind(0);
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
    this.sackMat.map?.dispose();
    this.sackMat.dispose();
    this.group.parent?.remove(this.group);
  }
}

// ---------- Cảnh chính ----------

export class SackScene {
  // overlay: phần tử HTML phủ lên canvas để vẽ viền + tên cho các khung nhỏ.
  // texts: chữ hiện trong cảnh 3D theo ngôn ngữ của TV (screen/index.js dịch sẵn rồi truyền vào).
  constructor(canvas, manifest, quality = 'high', overlay = null, texts = {}) {
    this.manifest = manifest;
    this.texts = { finishBanner: '🏁 ĐÍCH 🏁', ...texts };
    this.high = quality === 'high';
    this.minis = []; // [{ id, r, p, rect, leaving, out }] khung nhỏ của khung hình hiện tại
    this.scenery = []; // cây, đồi, rào biên, biển báo: ẩn khi vẽ khung nhỏ

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: this.high, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, this.high ? 2 : 1));
    this.renderer.shadowMap.enabled = this.high;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x9fd8ff);
    this.scene.fog = new THREE.Fog(0xbfe6ff, 70, 200);
    this.miniViews = new MiniViews(this.renderer, this.scene, overlay, { high: this.high });
    this.camera = new THREE.PerspectiveCamera(50, 1, 0.5, 500);

    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x6a8f4e, 1.5));
    this.sun = new THREE.DirectionalLight(0xffffff, 2.2);
    this.sun.castShadow = this.high;
    this.sun.shadow.mapSize.set(2048, 2048);
    Object.assign(this.sun.shadow.camera, { left: -25, right: 25, top: 25, bottom: -25, near: 1, far: 100 });
    this.sun.shadow.camera.updateProjectionMatrix();
    this.scene.add(this.sun, this.sun.target);

    this.hoppers = new Map();
    this.lanes = new Map(); // id → x
    this.state = null; // trạng thái server gần nhất
    this.trackGroup = null;
    this.trackWidth = 0;
    this.trackLen = 40;
    this.lanesCount = 0;
    this.hopMs = 520;
    this.mode = 'lobby';
    this.lobbyOrder = [];
    this.focus = 0;
    this.edgeZ = 0;
    this.particles = new Particles(this.scene);
    this.clock = new THREE.Clock();

    this.buildTrack(trackWidthFor(1), this.trackLen, 1);
    this.onResize = () => this.resize();
    window.addEventListener('resize', this.onResize);
    this.resize();
    this.renderer.setAnimationLoop(() => this.frame());
  }

  destroy() {
    this.renderer.setAnimationLoop(null);
    window.removeEventListener('resize', this.onResize);
    this.miniViews.destroy();
    for (const h of this.hoppers.values()) h.dispose();
    this.hoppers.clear();
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

  // Đường đua: cỏ, mặt đất, vạch chia làn, rào trắng 2 bên, vạch xuất phát/đích, biển số mét, cây, đồi.
  buildTrack(width, trackLen, lanes) {
    if (this.trackGroup && width === this.trackWidth && trackLen === this.trackLen && lanes === this.lanesCount) return;
    if (this.trackGroup) {
      this.scene.remove(this.trackGroup);
      disposeTree(this.trackGroup);
    }
    this.trackWidth = width;
    this.trackLen = trackLen;
    this.lanesCount = lanes;
    const g = new THREE.Group();
    this.trackGroup = g;
    this.scene.add(g);
    this.scenery = [];

    const len = trackLen + TRACK_EXTRA_BEFORE + TRACK_EXTRA_AFTER;
    const centerZ = -(len / 2 - TRACK_EXTRA_BEFORE);
    const half = width / 2;

    const grassTex = noiseTexture('#6fbf5b', '#4f9c3f');
    grassTex.repeat.set(200 / 6, len / 6);
    const grass = new THREE.Mesh(new THREE.PlaneGeometry(200, len), new THREE.MeshLambertMaterial({ map: grassTex }));
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

    // Vạch trắng chia làn (từ vạch xuất phát tới vạch đích).
    const lineMat = new THREE.MeshBasicMaterial({ color: 0xffffff, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    const laneW = width / Math.max(1, lanes);
    for (let i = 1; i < lanes; i++) {
      const line = new THREE.Mesh(new THREE.PlaneGeometry(0.08, trackLen), lineMat);
      line.rotation.x = -Math.PI / 2;
      line.position.set(-half + laneW * i, 0.03, -trackLen / 2);
      g.add(line);
    }

    // Rào trắng hai bên.
    const railMat = new THREE.MeshLambertMaterial({ color: 0xffffff });
    const postsPerSide = Math.ceil(len / 4);
    const posts = new THREE.InstancedMesh(new THREE.BoxGeometry(0.14, 1.1, 0.14), railMat, postsPerSide * 2);
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
    this.scenery.push(posts);
    for (const side of [-1, 1]) {
      const board = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.12, len), railMat);
      board.position.set(side * (half + 1), 0.95, centerZ);
      g.add(board);
      this.scenery.push(board);
    }

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
    for (const side of [-1, 1]) {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 5.5, 10), archMat);
      pole.position.set(side * (half + 1.4), 2.75, -trackLen);
      pole.castShadow = true;
      g.add(pole);
    }
    const banner = textSprite(this.texts.finishBanner, { bg: '#d63a3a', height: 1.4 });
    banner.position.set(0, 5.4, -trackLen);
    g.add(banner);

    for (let d = 10; d < trackLen; d += 10) {
      const sign = textSprite(`${d}m`, { height: 0.6 });
      sign.position.set(-(half + 2.2), 1.5, -d);
      g.add(sign);
      this.scenery.push(sign);
    }

    // Cây và đồi (instanced cho nhẹ).
    const treeCount = this.high ? 160 : 60;
    const trunks = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.15, 0.22, 1.2, 6), new THREE.MeshLambertMaterial({ color: 0x7a5230 }), treeCount);
    const crowns = new THREE.InstancedMesh(new THREE.ConeGeometry(1.2, 2.8, 7), new THREE.MeshLambertMaterial({ color: 0x2f8f3a }), treeCount);
    const q = new THREE.Quaternion();
    const s = new THREE.Vector3();
    const p = new THREE.Vector3();
    for (let t = 0; t < treeCount; t++) {
      const side = t % 2 ? 1 : -1;
      const x = side * (half + 4 + Math.random() * 45);
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
    this.scenery.push(trunks, crowns);
    const hillMat = new THREE.MeshLambertMaterial({ color: 0x5da65a, flatShading: true });
    const hillGeo = new THREE.IcosahedronGeometry(1, 1);
    for (let h = 0; h < 10; h++) {
      const hill = new THREE.Mesh(hillGeo, hillMat);
      const side = h % 2 ? 1 : -1;
      hill.position.set(side * (60 + Math.random() * 30), -2, TRACK_EXTRA_BEFORE - (h / 10) * (len + 60));
      hill.scale.set(25 + Math.random() * 20, 8 + Math.random() * 8, 25 + Math.random() * 20);
      g.add(hill);
      this.scenery.push(hill);
    }
  }

  // Dữ liệu phòng thay đổi (vào/ra, đổi con vật...).
  setPlayers(players, state, trackLen = this.trackLen) {
    const ids = new Set(players.map(p => p.id));
    for (const [id, h] of this.hoppers) {
      if (!ids.has(id)) {
        h.dispose();
        this.hoppers.delete(id);
      }
    }
    for (const p of players) {
      let h = this.hoppers.get(p.id);
      if (!h) {
        h = new Hopper(p, this.manifest);
        this.hoppers.set(p.id, h);
        this.scene.add(h.group);
      } else {
        h.setPlayer(p);
      }
    }
    if (state === 'lobby') {
      this.mode = 'lobby';
      this.state = null;
      this.lobbyOrder = players.map(p => p.id);
      const n = Math.max(1, players.length);
      this.buildTrack(trackWidthFor(n), trackLen, n);
    }
  }

  setupRace(info) {
    this.mode = 'race';
    this.state = null;
    this.hopMs = info.hopMs || 520;
    this.lanes = new Map(info.racers.map((id, i) => [id, info.lanes[i]]));
    this.miniViews.setOrder(info.racers); // thứ tự làn từ trái sang phải
    this.buildTrack(info.width, info.trackLen, info.racers.length);
    for (const h of this.hoppers.values()) h.reset();
    this.focus = 0;
  }

  setState(s) {
    this.state = s;
    for (const p of s.p) {
      const h = this.hoppers.get(p.id);
      if (h) h.targetZ = p.z;
    }
  }

  fx(ev) {
    const h = this.hoppers.get(ev.pid);
    if (ev.type === 'hop') {
      h?.startHop(performance.now(), ev.len);
    } else if (ev.type === 'fall' && h) {
      const pos = h.group.position.clone().setY(0.3);
      this.particles.burst(pos, ['#c89f6d', '#ffffff', h.color], { count: 16, speed: 2.5, up: 3 });
    } else if (ev.type === 'finish') {
      const at = new THREE.Vector3(0, 1, -this.trackLen);
      if (ev.rank === 1) {
        this.particles.burst(at, ['#e6194b', '#ffe119', '#4363d8', '#3cb44b', '#f032e6', '#ffffff'], { count: 140, speed: 7, up: 9, life: 2.4 });
      } else if (h) {
        this.particles.burst(h.group.position.clone().setY(1), [h.color, '#ffffff'], { count: 24, speed: 3, up: 5 });
      }
    }
  }

  // Phím Y trên màn hình host: xoay model 90° nếu con vật nhảy ngang/ngược.
  rotateModels(delta) {
    const yaw = ((this.hoppers.values().next().value?.yaw ?? this.manifest.modelYaw) + delta) % (Math.PI * 2);
    for (const h of this.hoppers.values()) h.setYaw(yaw);
    return yaw;
  }

  updateCamera(focus, sway = 0) {
    const w = this.trackWidth;
    const narrow = clamp(1.6 / this.camera.aspect, 1, 2);
    const back = (10 + w * 0.25) * narrow;
    const height = (6 + w * 0.45) * narrow;
    this.camera.position.set(sway, height, -(focus - back));
    this.camera.lookAt(0, 0, -(focus + 10));
    this.sun.position.set(-15, 35, -(focus - 10));
    this.sun.target.position.set(0, 0, -(focus + 10));
  }

  updateLobby(dt, now) {
    const n = this.lobbyOrder.length;
    const lane = this.trackWidth / Math.max(1, n);
    this.lobbyOrder.forEach((id, i) => this.hoppers.get(id)?.placeLobby(-this.trackWidth / 2 + lane * (i + 0.5), dt));
    this.focus = damp(this.focus, 2, 2, dt);
    this.updateCamera(this.focus, Math.sin(now / 5000) * 3);
    this.miniViews.updateMarkers(now, () => null);
  }

  updateRace(dt, now) {
    const s = this.state;
    const list = (s?.p || []).map(p => {
      const h = this.hoppers.get(p.id);
      const k = h ? h.advance(now, dt, this.hopMs) : -1;
      return { ...p, x: this.lanes.get(p.id) ?? 0, z: h ? h.z : p.z, k };
    });
    // Người dẫn đầu (chưa về đích); tất cả đã về thì lấy người xa nhất.
    let lead = -Infinity;
    for (const p of list) if (!(p.f & FLAG.FINISHED)) lead = Math.max(lead, p.z);
    if (lead === -Infinity) for (const p of list) lead = Math.max(lead, p.z);
    if (!Number.isFinite(lead)) lead = 0;
    const target = s?.state === 'countdown' ? 0 : Math.max(0, lead - LEAD_VIEW_BEHIND);
    this.focus = damp(this.focus, target, 2.5, dt);
    this.updateCamera(this.focus);

    // Khung nhỏ cho người tụt lại: hiện sớm/ẩn muộn quanh mép dưới (minZ) để không nhấp nháy.
    const minZ = this.focus - 2.5;
    this.edgeZ = minZ;
    const racing = s?.state === 'racing';
    const miniIds = this.miniViews.update(
      list.map(p => ({ id: p.id, z: p.z, active: racing && !(p.f & FLAG.FINISHED) })),
      minZ,
      now,
    );
    this.minis = [];
    const seen = new Set();
    for (const p of list) {
      const h = this.hoppers.get(p.id);
      if (!h) continue;
      seen.add(p.id);
      const mini = miniIds.get(p.id);
      const out = p.z < minZ;
      if (out && !mini) {
        h.placeStraggler(p.x, this.focus - 2, this.focus - p.z);
        continue;
      }
      h.placeRace(p, p.k, dt, s.state);
      if (mini) this.minis.push({ id: p.id, h, p, rect: mini.rect, leaving: mini.leaving, out });
    }
    for (const [id, h] of this.hoppers) if (!seen.has(id)) h.group.visible = false;
    this.miniViews.updateMarkers(now, id => {
      const h = this.hoppers.get(id);
      return h?.group.visible && h.body.visible ? { pos: h.group.position, top: h.label.sprite.position.y, color: h.color } : null;
    });
  }

  // Màn hình chung báo chỗ trống 2 bên (tránh bảng xếp hạng).
  setMiniArea(area) {
    this.miniViews.setArea(area);
  }

  // Vẽ các khung nhỏ: camera sau lưng con vật, chỉ hiện con đó trong làn của nó.
  renderMinis() {
    let shown = [];
    const views = this.minis.map(({ id, h, p, rect, leaving }) => ({
      id,
      rect,
      leaving,
      color: h.color,
      text: behindText(h.name, this.edgeZ - p.z),
      aim: cam => {
        cam.position.set(p.x, 3, -(p.z - 5.5));
        cam.lookAt(p.x, 0.6, -(p.z + 7));
      },
      before: () => {
        h.group.visible = true;
        h.label.sprite.visible = false;
      },
      after: () => {
        h.group.visible = false;
        h.label.sprite.visible = true;
      },
    }));
    this.miniViews.draw(views, {
      begin: () => {
        shown = [...this.hoppers.values()].filter(h => h.group.visible);
        for (const h of shown) h.group.visible = false;
        for (const o of this.scenery) o.visible = false;
      },
      end: () => {
        for (const o of this.scenery) o.visible = true;
        for (const h of shown) h.group.visible = true;
      },
    });
  }

  frame() {
    const dt = Math.min(0.05, this.clock.getDelta());
    const now = performance.now();
    this.minis = [];
    if (this.mode === 'race') this.updateRace(dt, now);
    else this.updateLobby(dt, now);

    for (const h of this.hoppers.values()) h.mixer?.update(dt);
    this.particles.update(dt);
    // Cảnh chính không vẽ những con có khung nhỏ mà đã ra khỏi khung hình (ở sau lưng camera).
    for (const m of this.minis) if (m.out) m.h.group.visible = false;
    this.renderer.render(this.scene, this.camera);
    this.renderMinis();
  }
}

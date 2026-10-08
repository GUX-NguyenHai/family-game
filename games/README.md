# Hướng dẫn làm game mới

Tài liệu này nói **một game phải viết những gì** và **phần chung cung cấp gì** cho game. Đọc [README gốc](../README.md) trước để nắm tổng thể và quy ước.

## Mục lục
1. [Một game gồm những gì](#1-một-game-gồm-những-gì)
2. [Vòng đời một ván](#2-vòng-đời-một-ván)
3. [`service/index.js`: khai báo + luật chơi](#3-serviceindexjs-khai-báo--luật-chơi)
4. [`screen/index.js`: hình ảnh trên TV](#4-screenindexjs-hình-ảnh-trên-tv)
5. [`controller/index.js`: tay cầm điện thoại](#5-controllerindexjs-tay-cầm-điện-thoại)
6. [Game mẫu đầy đủ: "Bấm nhanh"](#6-game-mẫu-đầy-đủ-bấm-nhanh)
7. [Chơi theo đội, lựa chọn riêng, tài nguyên](#7-chơi-theo-đội-lựa-chọn-riêng-tài-nguyên)
8. [Cảm biến và đồ nghề 3D](#8-cảm-biến-và-đồ-nghề-3d)
9. [Danh sách kiểm tra trước khi xong](#9-danh-sách-kiểm-tra-trước-khi-xong)
10. [Các game có sẵn để tham khảo](#10-các-game-có-sẵn-để-tham-khảo)

---

## 1. Một game gồm những gì

```
games/<id>/                   <id>: tiếng Anh, chữ thường, nối bằng "-" (VD tap-race)
  README.md                   luật chơi, tuỳ chọn, tham số chỉnh
  service/                    chạy trên SERVER (Node, CommonJS). Trình duyệt không tải được.
    index.js                  khai báo game + createMatch()        ← bắt buộc
    config.js                 tham số                              ← nên có
    simulation.js             mô phỏng thuần + bot                 ← nên có khi luật phức tạp
  screen/                     chạy trên TV (ES module)
    index.js                  export function create(ctx)          ← bắt buộc
    style.css                 CSS riêng (tự nạp khi game được chọn) ← bắt buộc (có thể rỗng)
  controller/                 chạy trên điện thoại (ES module)
    index.js                  export function create(ctx)          ← bắt buộc
    style.css                                                      ← bắt buộc (có thể rỗng)
  assets/                     (tuỳ chọn) model .glb, json, ảnh + CREDITS.md
```

**Không cần đăng ký:** server tự nhận mọi thư mục có `service/index.js` trong `games/`. Muốn đặt thứ tự trên thanh chọn game thì thêm id vào `ORDER` trong [games/index.js](index.js); không có trong `ORDER` thì xếp sau theo id.

**Gửi game cho chủ server mà không cần sửa code chính:** nén cả thư mục `games/<id>/` thành `<id>.zip` (zip thường, không mật khẩu; có hay không có thư mục ngoài cùng đều được), chủ server upload ở trang **`/admin`**. Game được giải nén vào `games-installed/<id>/` và dùng được ngay. Đường dẫn `require('../../../src/state-codec')` vẫn đúng vì `games-installed/` nằm cùng cấp với `games/`.

Trình duyệt tải được các đường dẫn:
- `/games/<id>/screen/…`
- `/games/<id>/controller/…`
- `/games/<id>/assets/…`

Ví dụ: `fetch('/games/<id>/assets/data.json')`.

---

## 2. Vòng đời một ván

```
Chủ phòng bấm "Bắt đầu"
  └─ server: createMatch({ players, options, teams, now, startAt, api })   → trả về đối tượng "ván" (match)
       ├─ match.setup()              → TV: screen.onSetup(data)            (dữ liệu tĩnh: đường đua, đội…)
       ├─ đếm ngược countdownMs      → TV + điện thoại tự hiện 3-2-1 rồi goText
       │    (trong lúc này tick() vẫn chạy)
       ├─ match.begin(now)           khi hết đếm ngược
       ├─ lặp tickHz lần/giây:
       │    match.tick(now, dt)
       │    match.hostState(now)     → TV: screen.onState(s)               (mỗi hostEvery tick)
       │    match.playerState(pid)   → từng điện thoại: controller.onMe(m) (mỗi playerEvery tick)
       ├─ điện thoại ctx.send(type, data) → match.input(pid, type, data, now)
       ├─ api.toHost / toPlayer / toPlayers(msg) → screen.onEvent / controller.onEvent (tức thời)
       └─ api.finish(results)        → bảng kết quả chung; vòng lặp chạy thêm coastMs rồi dừng
```

**Trạng thái phòng** (`info.state` gửi cho TV và điện thoại): `lobby` → `countdown` → `playing` → `finished`.

---

## 3. `service/index.js`: khai báo + luật chơi

```js
module.exports = {
  id: 'tap-race',              // trùng tên thư mục
  name: 'Bấm nhanh',           // tên hiện trên thanh chọn game
  emoji: '👆',
  description: '…',            // hiện ở đầu cột người chơi khi game được chọn
  category: 'reflex',          // nhóm: motion | reflex | mind | secret | folk (GAME_CATEGORIES trong src/config.js)
  maxPlayers: 12,              // giới hạn thật = min(gói Free/Pro, số này)
  minPlayers: 1,
  bots: true,                  // có nút "+ Thêm bot" không
  sensors: false,              // điện thoại có cần cảm biến không (hiện ô "Cảm biến" ở phòng chờ)
  // (tuỳ chọn) chơi theo đội, xem mục 7
  teams: { min: 2, max: 4, count: 4, equal: false, enabled: options => options.mode === 'team' },
  tickHz: 20,                  // vòng lặp mấy lần/giây (mặc định 10; game chuyển động nhanh nên 30)
  hostEvery: 1,                // gửi hostState() mỗi mấy tick (mặc định 1)
  playerEvery: 2,              // gửi playerState() mỗi mấy tick (mặc định 1)
  countdownMs: 3000,           // đếm ngược trước khi chơi (0 = không đếm)
  goText: 'BẤM!',              // chữ hiện khi hết đếm ngược
  coastMs: 0,                  // kết thúc rồi vẫn chạy vòng lặp thêm bấy lâu (cho cảnh ăn mừng)
  options: [                   // tuỳ chọn cho chủ phòng; phần chung tự vẽ thành hàng nút
    {
      key: 'target', label: 'Số lần bấm', default: '50',
      choices: [
        { value: '30', label: '30 lần', desc: 'Nhanh gọn.' },
        { value: '50', label: '50 lần', desc: 'Vừa sức.' },
      ],
    },
  ],
  preview: options => ({ … }), // (tuỳ chọn) dữ liệu thêm cho TV vẽ nền ở phòng chờ → info.preview
  createMatch,
};
```

Giá trị tuỳ chọn luôn là **chuỗi** (`'50'`, không phải `50`). Server chỉ nhận giá trị nằm trong `choices`.

### `createMatch({ players, options, teams, now, startAt, api })`
Gọi mỗi lần bấm Bắt đầu hoặc Chơi lại. Trả về đối tượng "ván". Hàm nào không cần thì bỏ:

| Hàm của ván | Khi nào được gọi | Kết quả đi đâu |
|---|---|---|
| `setup()` | Lúc bắt đầu, và khi TV tải lại giữa ván | `screen.onSetup(data)` |
| `begin(now)` | Hết đếm ngược | |
| `tick(now, dt)` | Mỗi tick, kể cả lúc đếm ngược. `dt` tính bằng giây | |
| `input(pid, type, data, now)` | Điện thoại gọi `ctx.send(type, data)` | |
| `hostState(now)` | Mỗi `hostEvery` tick | `screen.onState(s)` |
| `playerState(pid, now)` | Mỗi `playerEvery` tick, cho từng người đang chơi | `controller.onMe(m)` của người đó |
| `leave(pid)` | Người chơi mất kết nối giữa ván | |
| `stop()` | Ván bị huỷ (về phòng chờ, đổi game) | |

**Tham số của `createMatch`:**
- `players`: `[{ id, name, animal, color, bot, team, prefs }]`. Đây là bản sao. Game tự giữ trạng thái riêng (vị trí, điểm…) trong object của mình.
- `options`: giá trị chủ phòng đã chọn, ví dụ `{ target: '50' }`.
- `teams`: danh sách đội `[{ id, name, emoji, color }]` khi đang chơi theo đội, `null` khi không.
- `now`, `startAt`: mốc thời gian (ms). `startAt` là lúc hết đếm ngược.
- `api`:
  - `api.toHost(msg)`: gửi sự kiện tức thời cho TV (→ `screen.onEvent`). Ví dụ `{ type: 'fence', pid }`.
  - `api.toPlayer(pid, msg)`: gửi cho một điện thoại (→ `controller.onEvent`), ví dụ để rung máy.
  - `api.toPlayers(msg)`: gửi cho mọi điện thoại trong phòng.
  - `api.finish(results)`: **kết thúc ván**, hiện bảng kết quả. `results` là mảng đã xếp hạng:
    ```js
    [{ id, name, animal, color, bot, place, detail, members }]
    // detail: chữ cạnh tên, VD "12.34s", "7 điểm"
    // members: (chơi theo đội) id các thành viên, để điện thoại của họ hiện đúng hạng
    ```

**Ghi nhớ:**
- `input()` có thể tới **bất cứ lúc nào**, kể cả lúc đếm ngược hay sau khi đã xong. Game tự chặn nếu chưa cho chơi.
- Dữ liệu gửi đi (`hostState`, `playerState`) nên **gọn**: làm tròn số, chỉ gửi thứ cần vẽ. Nó được gửi 10–30 lần mỗi giây.
  - Phần chung **tự bỏ tin giống hệt tin trước**, vẫn gửi lại mỗi giây một lần. Không cần tự lo việc này.
  - Game có chuyển động liên tục nên gửi `hostState` **dạng nhị phân** (xem mục "Gửi trạng thái nhị phân" bên dưới) với `hostEvery: 2` (15 lần/giây), rồi để TV tự làm mượt.
- Bot là người chơi có `bot: true`. Cho bot hành động trong `tick()`, thường là tự gọi cùng hàm xử lý với `input()`.
- Lỗi trong code game được phần chung bắt và ghi log. Server không sập, nhưng ván đó có thể đứng.

### Gửi trạng thái nhị phân (khuyên dùng cho game chuyển động)
JSON có tên trường và id người chơi (36 ký tự) lặp lại mỗi lần gửi, nên nặng. Gửi dạng nhị phân nhẹ hơn khoảng **10–20 lần**.
1. Khai báo `games/<id>/assets/schema.json`:
   ```json
   {
     "rows": "p",
     "head": [["state", "enum", ["countdown", "racing", "finished"]], ["timeLeft", "u16", 0.1]],
     "row":  [["x", "i16", 100], ["z", "u16", 50], ["f", "u8"], ["r", "u8?"], ["c", "u8*4", 100]]
   }
   ```
   - Mỗi trường gồm `[tên, kiểu, tham số]`.
   - Kiểu: `u8 i8 u16 i16 u32 f32 bool enum`. Thêm `?` cho trường có thể null, thêm `*N` cho mảng N phần tử.
   - Tham số là hệ số nhân trước khi làm tròn: `100` giữ 2 chữ số lẻ, `0.1` làm tròn tới hàng chục. Với `enum` thì tham số là danh sách giá trị.
   - Mô tả đầy đủ ở [src/state-codec.js](../src/state-codec.js).
2. Server (`service/index.js`):
   ```js
   const codec = require('../../../src/state-codec');
   const stateCodec = codec.compile(require('../assets/schema.json'));
   // …
   hostState(now) {
     return codec.encode(stateCodec, { state: …, p: list.map(p => ({ x: p.x, z: p.z, f: …, r: p.rank })) });
   }
   ```
   Hàng không chứa id. **`setup()` phải trả về thứ tự id các hàng** (VD `players: list.map(p => p.id)`).
3. TV (`screen/index.js`):
   ```js
   import { compile, decode } from '/js/core/state-codec.js';
   const stateCodec = compile(await fetch('/games/<id>/assets/schema.json').then(r => r.json()));
   // …
   onSetup(info) { ids = info.players; },
   onState(raw) { if (!ids.length) return; const s = decode(stateCodec, raw, ids); /* s.p[i].id đã có */ },
   ```

Kiểm tra giới hạn giá trị khi chọn kiểu. Ví dụ `u16` với hệ số 50 thì giữ được tối đa 1310 m. Giá trị vượt giới hạn bị cắt về số lớn nhất.

---

## 4. `screen/index.js`: hình ảnh trên TV

```js
export function create(ctx) {
  ctx.root.innerHTML = '…';      // vẽ vào ô phủ kín màn hình (cả lúc ở phòng chờ: làm nền phía sau bảng phòng chờ)
  return {
    onRoom(info) {},             // phòng thay đổi: người vào/ra, đổi tuỳ chọn, đổi trạng thái
    onSetup(data) {},            // dữ liệu từ match.setup()
    onState(s) {},               // dữ liệu từ match.hostState()
    onEvent(e) {},               // sự kiện từ api.toHost()
    destroy() {},                // đổi sang game khác: gỡ listener, dừng vòng vẽ, giải phóng bộ nhớ
  };
}
```

**`ctx`:**

| Thuộc tính | Ý nghĩa |
|---|---|
| `root` | Ô HTML phủ kín màn hình để vẽ |
| `player(id)` | Thông tin người chơi `{ id, name, animal, color, bot, team, prefs, connected }` |
| `manifest`, `animalById` | Danh sách con vật avatar (`public/assets/animals.json`) |
| `quality` | `'high'` hoặc `'low'` (nút Đồ hoạ ở phòng chờ) |
| `toast(text)` | Thông báo nổi ngắn |
| `beep(freq, dur, type, vol)`, `fanfare()` | Âm thanh |
| `esc(text)` | Chống chèn HTML khi đưa tên người chơi vào `innerHTML` |

**`info` (trong `onRoom`) có:**
- `state`, `players`, `options`, `preview`, `teamMode`, `teams`, `results`, `game`, `gameName`, `maxPlayers`…
- Phần chung đã lo phòng chờ, đếm ngược, chữ bắt đầu và bảng kết quả. Game chỉ vẽ cảnh và HUD riêng (bảng điểm, đồng hồ…).

---

## 5. `controller/index.js`: tay cầm điện thoại

```js
export function create(ctx) {
  ctx.lobbyRoot.innerHTML = '…'; // phần riêng ở phòng chờ: hướng dẫn, thử cảm biến, chọn đồ…
  ctx.playRoot.innerHTML = '…';  // tay cầm lúc chơi (chiếm hết chiều cao màn hình)
  return {
    onShow(screen, prev) {},     // screen: 'join' | 'lobby' | 'game' | 'done'
    onRoom(info) {},
    onMe(m) {},                  // dữ liệu từ match.playerState()
    onEvent(e) {},               // từ api.toPlayer() / api.toPlayers()
    onGesture(name) {},          // 'jump' khi người chơi hất đầu máy hoặc giật máy lên
    frame(t) {},                 // mỗi khung hình (vẽ thanh đo cảm biến ở phòng chờ…)
    destroy() {},                // gỡ setInterval, listener
  };
}
```

**`ctx`:**

| Thuộc tính | Ý nghĩa |
|---|---|
| `lobbyRoot`, `playRoot` | Hai ô HTML: phần riêng ở phòng chờ, tay cầm lúc chơi |
| `send(type, data)` | Gửi thao tác lên server, đến `match.input()` |
| `sensors` | Cảm biến (mục 8) |
| `vibrate(pattern)` | Rung máy, ví dụ `vibrate(40)` hoặc `vibrate([100, 50, 100])` |
| `screen()` | Màn đang hiện: `'join'`, `'lobby'`, `'game'`, `'done'` |
| `room()`, `me()` | Thông tin phòng, thông tin của chính mình |
| `pref(key)`, `setPref(key, value)` | Lựa chọn riêng (mục 7) |
| `sensorError()`, `enableSensors()` | Trạng thái và bật cảm biến (nút "Bật cảm biến" phần chung đã có) |
| `esc(text)` | Chống chèn HTML |

**Mẹo:**
- Thao tác liên tục (mức lắc) thì gửi đều khoảng 10 lần/giây bằng `setInterval`. Chỉ gửi khi `ctx.screen() === 'game'`.
- Thao tác rời rạc (bấm nút) thì gửi ngay trong `pointerdown` (nhanh hơn `click`), kèm `e.preventDefault()`.
- Đừng quên `clearInterval` trong `destroy()`.

---

## 6. Game mẫu đầy đủ: "Bấm nhanh"

Ai bấm nút đủ N lần trước thì thắng. Chép 3 file dưới vào `games/tap-race/`, tạo 2 file `style.css` (có thể để trống), khởi động lại server là game hiện trên thanh chọn game.

### `games/tap-race/service/index.js`
```js
// Bấm nhanh: ai bấm đủ số lần trước thì thắng.
function createMatch({ players, options, api }) {
  const target = Number(options.target) || 50;
  const list = players.map(p => ({ id: p.id, name: p.name, animal: p.animal, color: p.color, bot: p.bot, taps: 0, doneAt: null }));
  const byId = new Map(list.map(p => [p.id, p]));
  let started = false;
  let ended = false;

  function standings() {
    // Ai xong trước đứng trước, còn lại xếp theo số lần bấm.
    return [...list].sort((a, b) => (a.doneAt ?? Infinity) - (b.doneAt ?? Infinity) || b.taps - a.taps);
  }

  function tap(p, now) {
    if (!started || ended || p.doneAt != null) return;
    p.taps++;
    if (p.taps < target) return;
    p.doneAt = now;
    api.toHost({ type: 'done', pid: p.id });
    ended = true; // người đầu tiên xong là hết ván
    api.finish(
      standings().map((q, i) => ({
        id: q.id, name: q.name, animal: q.animal, color: q.color, bot: q.bot,
        place: i + 1, detail: `${q.taps}/${target} lần`,
      })),
    );
  }

  return {
    begin() {
      started = true;
    },
    input(pid, type, data, now) {
      const p = byId.get(pid);
      if (p && type === 'tap') tap(p, now);
    },
    tick(now) {
      for (const p of list) if (p.bot && Math.random() < 0.25) tap(p, now); // bot bấm ~5 lần/giây
    },
    hostState() {
      return { target, p: list.map(p => ({ id: p.id, taps: p.taps })) };
    },
    playerState(pid) {
      const p = byId.get(pid);
      return p ? { taps: p.taps, target } : null;
    },
  };
}

module.exports = {
  id: 'tap-race',
  name: 'Bấm nhanh',
  emoji: '👆',
  description: 'Bấm nút thật nhanh, ai đủ số lần trước thì thắng.',
  category: 'reflex',
  maxPlayers: 12,
  bots: true,
  sensors: false,
  tickHz: 20,
  playerEvery: 2,
  countdownMs: 3000,
  goText: 'BẤM!',
  options: [
    {
      key: 'target',
      label: 'Số lần bấm',
      default: '50',
      choices: [
        { value: '30', label: '30 lần', desc: 'Nhanh gọn.' },
        { value: '50', label: '50 lần', desc: 'Vừa sức.' },
      ],
    },
  ],
  createMatch,
};
```

### `games/tap-race/screen/index.js`
```js
// Bấm nhanh – TV: mỗi người một thanh tiến độ.
export function create(ctx) {
  ctx.root.innerHTML = `<div class="tap-board"></div>`;
  const board = ctx.root.querySelector('.tap-board');
  return {
    onState(s) {
      board.innerHTML = s.p
        .map(p => {
          const pl = ctx.player(p.id);
          return `<div class="tap-row" style="--c:${pl?.color || '#fff'}">
            <span>${ctx.esc(pl?.name || '?')}</span>
            <i style="width:${(p.taps / s.target) * 100}%"></i>
          </div>`;
        })
        .join('');
    },
    onEvent(e) {
      if (e.type === 'done') ctx.toast(`${ctx.player(e.pid)?.name || '?'} về đích! 🏁`);
    },
    destroy() {
      ctx.root.innerHTML = '';
    },
  };
}
```

### `games/tap-race/controller/index.js`
```js
// Bấm nhanh – điện thoại: một nút thật to.
export function create(ctx) {
  ctx.lobbyRoot.innerHTML = `<div class="box"><h3>👆 Bấm nhanh</h3><p class="hint">Hết đếm ngược thì bấm nút thật nhanh!</p></div>`;
  ctx.playRoot.innerHTML = `<button class="tap-btn"><b>BẤM!</b><small></small></button>`;
  const btn = ctx.playRoot.querySelector('.tap-btn');
  btn.addEventListener('pointerdown', e => {
    e.preventDefault();
    ctx.send('tap');
    ctx.vibrate(15);
  });
  return {
    onMe(m) {
      btn.querySelector('small').textContent = `${m.taps}/${m.target}`;
    },
    destroy() {
      ctx.lobbyRoot.innerHTML = '';
      ctx.playRoot.innerHTML = '';
    },
  };
}
```

`screen/style.css` và `controller/style.css` tự viết, ví dụ thanh `.tap-row i { display:block; height:24px; background:var(--c) }` và nút `.tap-btn { width:100%; min-height:60vh; font-size:3rem }`.

---

## 7. Chơi theo đội, lựa chọn riêng, tài nguyên

### Chơi theo đội
Khai báo trong `service/index.js`:
```js
teams: {
  min: 2,          // mỗi đội ít nhất
  max: 4,          // mỗi đội nhiều nhất
  count: 4,        // dùng mấy màu đội (tối đa 4: Đỏ, Xanh, Lục, Vàng — C.TEAMS trong src/config.js)
  equal: false,    // true = các đội phải bằng người
  enabled: options => options.mode === 'team', // lúc nào chơi theo đội; bỏ trống = luôn luôn
},
```

Phần chung tự lo:
- Ô "Chọn đội" trên điện thoại.
- Huy hiệu đội trên TV, bấm vào để đổi đội.
- Nút "Chia đội ngẫu nhiên".
- Lúc Bắt đầu, tự xếp người chưa chọn đội và kiểm tra luật đội. Sai luật thì báo chủ phòng và không bắt đầu.

Game nhận `players[].team` (số đội) và `teams`. Kết quả theo đội thì mỗi đội một dòng, kèm `members`.

Xem mẫu: [boat-race](boat-race/) (đội tuỳ chọn) và [tug-of-war](tug-of-war/) (luôn 2 đội, phải bằng người).

### Lựa chọn riêng của người chơi
Ví dụ chọn loại thuyền hay loại khỉ.
- **Điện thoại:** `ctx.setPref('boat', 'canoe')` lưu trên máy và gửi lên server. Đọc lại bằng `ctx.pref('boat')`.
- **Server:** nhận trong `players[].prefs.boat`. **Phải tự kiểm tra giá trị hợp lệ**, sai thì dùng mặc định.
- **TV ở phòng chờ:** đọc trong `info.players[].prefs` để vẽ trước.

Xem mẫu: [boat-race](boat-race/) (`boat`), [coconut-climb](coconut-climb/) (`figure`).

### Tài nguyên (model, json)
- Để trong `games/<id>/assets/`. Danh sách đồ chọn được (thuyền, khỉ…) nên là một file json trong `assets/`, để cả server (`require('../assets/x.json')`) lẫn trình duyệt (`fetch('/games/<id>/assets/x.json')`) cùng đọc.
- Model 3D: định dạng `.glb`, low-poly, mỗi file nên dưới 2–3 MB, tên tiếng Anh ngắn gọn. Mỗi thư mục model có `CREDITS.md` ghi tên gốc, tác giả và link.
- Nguồn model miễn phí: poly.pizza, quaternius.com, kenney.nl (CC0), sketchfab.com (xem giấy phép từng model).

---

## 8. Cảm biến và đồ nghề 3D

### `ctx.sensors` (điện thoại)
| Thuộc tính | Ý nghĩa |
|---|---|
| `level` | Mức lắc lên xuống, 0 (đứng yên) đến 1.5. Gửi lên server khoảng 10 lần/giây, server nhân với hệ số độ khó |
| `steer` | Nghiêng trái/phải, -1 đến 1 |
| `onGesture('jump')` | Gọi khi người chơi **hất đầu máy về phía mình** hoặc **giật mạnh cả máy lên** |
| `enabled`, `gotMotion`, `gotOrientation`, `secure` | Trạng thái cảm biến, dùng để báo người chơi khi máy không hỗ trợ |
| `range`, `setRange(v)` | Độ nhạy lắc |
| `jumpDeg`, `setJumpDeg(v)` | Độ nhạy cử chỉ nhảy |
| `pitchSwing`, `jerkPeak`, `jerkNeed()` | Số đo để vẽ thanh thử ở phòng chờ |
| `calibrate()`, `setInvert(v)` | Hiệu chỉnh hướng nghiêng |

Khai báo `sensors: true` trong `service/index.js` để phần chung hiện ô bật cảm biến ở phòng chờ. Điện thoại cần HTTPS mới đọc được cảm biến.

### `/js/core/scene-kit.js` (TV, three.js)
```js
import * as THREE from 'three';
import { loadAnimalTemplate, loadModel, cloneModel, Label, textSprite, Particles, damp, clamp } from '/js/core/scene-kit.js';
```

| Hàm | Dùng để |
|---|---|
| `loadAnimalTemplate(def, manifest)` | Tải con vật avatar (đã quy về cùng kích thước, có hoạt ảnh) |
| `loadModel(url)` | Tải model `.glb` bất kỳ, trả về `{ root, size, center, min, clips }` |
| `cloneModel(tpl, { length \| height })` | Bản sao đã co giãn, đáy ở y = 0. Trả về `{ object, model, width, height, length }`. Dùng `model` để gắn `AnimationMixer` |
| `Label` | Nhãn tên có màu lơ lửng trên đầu |
| `textSprite(text, opts)` | Chữ nổi (biển báo, mốc mét) |
| `Particles` | Hạt hiệu ứng: bụi, nước bắn, pháo giấy |
| `noiseTexture`, `checkerTexture`, `canvasTexture` | Texture tự vẽ |
| `disposeTree(obj)` | Giải phóng bộ nhớ GPU khi xoá vật thể |
| `damp`, `lerp`, `clamp` | Làm mượt, nội suy |

**Lưu ý với cảnh 3D:**
- Trong `destroy()` phải gọi `renderer.setAnimationLoop(null)`, gỡ listener `resize` và `renderer.dispose()`.
- Dữ liệu từ server tới khoảng 10–30 lần/giây. Vẽ 60 hình/giây thì làm mượt bằng `damp()` hoặc nội suy giữa 2 lần nhận.
- Màn hình yếu thì đọc `ctx.quality === 'low'` để giảm cây cối và bóng đổ.

---

## 9. Danh sách kiểm tra trước khi xong

- [ ] Tên thư mục, file, biến bằng tiếng Anh, viết đầy đủ. Chữ hiện cho người chơi bằng tiếng Việt.
- [ ] `service/index.js` có `id` trùng tên thư mục, có `category`, `description`, `options` (nếu cần).
- [ ] `id` không trùng game nào đang có (trùng game có sẵn thì /admin không cho cài).
- [ ] Chặn `input()` khi chưa bắt đầu hoặc đã xong.
- [ ] Có bot (nếu `bots: true`) và bot chơi được tới khi kết thúc.
- [ ] Ván luôn kết thúc: có giới hạn thời gian hoặc điều kiện thắng chắc chắn xảy ra, rồi gọi `api.finish()` đúng 1 lần.
- [ ] TV vẽ được ở phòng chờ (`onRoom` với `state === 'lobby'`) và khi tải lại giữa ván (`onSetup`).
- [ ] Game chuyển động liên tục: `hostState` gửi nhị phân theo `assets/schema.json`, `hostEvery: 2`.
- [ ] `destroy()` dọn sạch: interval, listener, vòng vẽ 3D.
- [ ] CSS có tiền tố riêng của game.
- [ ] Model tải về có `CREDITS.md`.
- [ ] Viết `games/<id>/README.md`: cách chơi, tuỳ chọn, tham số chỉnh trong `config.js`.
- [ ] Chạy lệnh kiểm tra cú pháp (README gốc, mục 1). Thử với bot trên máy, rồi thử bằng điện thoại thật qua HTTPS.

---

## 10. Các game có sẵn để tham khảo

| Game | Học được gì |
|---|---|
| [tug-of-war](tug-of-war/) 🪢 | Ngắn gọn nhất. Đội cố định 2 màu (`count: 2`, `equal: true`), lắc để tính lực, cảnh 3D đơn giản |
| [coconut-climb](coconut-climb/) 🌴 | Lựa chọn riêng (`prefs.figure`), danh sách đồ trong `assets/figures.json`, model tải về có hoặc không có hoạt ảnh |
| [boat-race](boat-race/) 🚣 | Đội bật/tắt theo tuỳ chọn (`enabled`), nhiều tuỳ chọn, lái bằng nghiêng, vật cản, va chạm |
| [animal-race](animal-race/) 🏁 | Điều khiển hoàn toàn bằng cử động (lắc chạy, hất/giật máy nhảy), không nút bấm, camera bám đoàn dẫn đầu, khung nhỏ cho người bị tụt lại (`/js/core/mini-views.js`) |
| [ski-slalom](ski-slalom/) ⛷️ | Chỉ dùng nghiêng (`steer`), cân chỉnh ở phòng chờ; cảnh nằm trong nhóm nghiêng (dốc) nên camera và dấu khung nhỏ phải đổi toạ độ ra ngoài (`localToWorld`) |
| [sack-race](sack-race/) 🛍️ | Nhịp điệu bằng cử chỉ nhảy; server gửi sự kiện riêng cho điện thoại để hẹn giờ rung báo nhịp; khung nhỏ dùng chung |
| [jump-rope](jump-rope/) 🤸 | Chỉ dùng cử chỉ nhảy, chia màn chơi, server chấm theo thời điểm; TV tự quay dây theo tốc độ server gửi (không vẽ giật theo từng gói tin) |

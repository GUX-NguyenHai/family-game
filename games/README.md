# Thêm game mới

Mỗi game là một thư mục `games/<id>/` gồm 3 phần. Phần chung đã có sẵn: phòng, QR, vào phòng, nối lại, gói Pro, bot, đếm ngược, bảng kết quả, cảm biến. Game chỉ lo luật chơi và giao diện riêng của nó.

```
games/<id>/
  logic/index.js        luật chơi (server chung gọi tới, Node CommonJS)
  screen/index.js       hình ảnh trên TV lúc chơi (ES module) + screen/style.css
  controller/index.js   tay cầm trên điện thoại (ES module) + controller/style.css
```

Các bước:
1. Tạo thư mục `games/<id>/` với 3 phần như dưới. `<id>` chỉ gồm chữ thường, số và dấu `-`. Có thể xem `games/animal-race/` để tham khảo.
2. Thêm 1 dòng `require('./<id>/logic')` vào `games/index.js`.
3. Khởi động lại server. Game sẽ hiện ra ở phần chọn game trong phòng chờ.

Chỉ thư mục `screen/` và `controller/` được mở ra ngoài, ở đường dẫn `/games/<id>/screen/…` và `/games/<id>/controller/…`. Không ai tải được thư mục `logic/`.

## 1. `logic/index.js`: khai báo + luật chơi

```js
module.exports = {
  id: 'my-game',               // trùng tên thư mục
  name: 'Tên game',
  emoji: '🎯',
  description: '…',            // hiện dưới phần chọn game
  maxPlayers: 12,              // giới hạn thật = min(gói Free/Pro, số này)
  minPlayers: 1,
  bots: true,                  // có nút "+ Thêm bot" không
  sensors: false,              // điện thoại có cần cảm biến không (hiện ô bật cảm biến)
  tickHz: 20,                  // vòng lặp mấy lần/giây (mặc định 10)
  hostEvery: 2,                // gửi hostState() mỗi mấy tick (mặc định 1)
  playerEvery: 2,              // gửi playerState() mỗi mấy tick (mặc định 1)
  countdownMs: 3000,           // đếm ngược trước khi chơi (0 = không đếm)
  goText: 'BẮT ĐẦU!',          // chữ hiện khi hết đếm ngược
  coastMs: 0,                  // kết thúc rồi vẫn chạy vòng lặp thêm bấy lâu (VD cho con vật chạy chậm dần)
  options: [                   // tuỳ chọn chủ phòng chọn (vẽ tự động thành hàng nút)
    { key: 'rounds', label: 'Số vòng', default: '5',
      choices: [{ value: '3', label: '3 vòng', desc: '…' }, { value: '5', label: '5 vòng', desc: '…' }] },
  ],
  preview: options => ({ … }), // (tuỳ chọn) dữ liệu thêm cho màn hình TV ở phòng chờ
  createMatch,
};
```

Mỗi lần bấm Bắt đầu, server gọi `createMatch({ players, options, now, startAt, api })`. Hàm này trả về một đối tượng "ván chơi". Hàm nào không cần thì bỏ:

| Hàm | Khi nào được gọi |
|---|---|
| `setup()` | Ngay khi bắt đầu, và khi màn hình TV tải lại giữa ván. Kết quả đi tới `screen.onSetup` |
| `begin(now)` | Hết đếm ngược |
| `tick(now, dt)` | Mỗi tick, kể cả lúc đang đếm ngược (`dt` tính bằng giây) |
| `input(pid, type, data, now)` | Khi tay cầm gọi `ctx.send(type, data)` |
| `hostState(now)` | Mỗi `hostEvery` tick. Kết quả đi tới `screen.onState` |
| `playerState(pid, now)` | Mỗi `playerEvery` tick, cho từng người đang chơi. Kết quả đi tới `controller.onMe` |
| `leave(pid)` | Người chơi mất kết nối giữa ván |
| `stop()` | Ván bị huỷ (về phòng chờ hoặc đổi game) |

- `players`: `[{ id, name, animal, color, bot }]`. Game tự giữ trạng thái riêng của từng người.
- `options`: giá trị chủ phòng đã chọn, ví dụ `{ rounds: '5' }`.
- `api.toHost(msg)` / `api.toPlayer(pid, msg)` / `api.toPlayers(msg)`: gửi sự kiện tức thời, phía nhận là `screen.onEvent` / `controller.onEvent`.
- `api.finish(results)`: kết thúc ván. `results` có dạng `[{ id, name, animal, color, bot, place, detail }]`. `detail` là chữ hiện cạnh tên, ví dụ `"12.34s"` hay `"7 điểm"`.
- Bot là người chơi có `bot: true`. Game tự cho bot hành động trong `tick()`.
- Nếu code game bị lỗi, server bắt lại và ghi log, không bị sập.

## 2. `screen/index.js`: hình ảnh trên TV

```js
export function create(ctx) {
  ctx.root.innerHTML = '…';      // tự vẽ vào ô phủ kín màn hình
  return {
    onRoom(info) {},             // phòng thay đổi (ở phòng chờ game vẫn được vẽ, làm nền phía sau bảng phòng chờ)
    onSetup(data) {},
    onState(s) {},
    onEvent(e) {},
    destroy() {},                // đổi sang game khác: gỡ listener, dừng vòng vẽ
  };
}
```

`ctx` gồm: `root`, `player(id)`, `animalById`, `manifest`, `quality` ('high' | 'low'), `toast(text)`, `beep(freq, dur, type, vol)`, `fanfare()`, `esc(text)`.

`info.state` có 4 giá trị: `lobby` | `countdown` | `playing` | `finished`. Đếm ngược, chữ bắt đầu và bảng kết quả do phần chung lo.

## 3. `controller/index.js`: tay cầm

```js
export function create(ctx) {
  ctx.lobbyRoot.innerHTML = '…'; // phần riêng ở phòng chờ (hướng dẫn, thử cảm biến…)
  ctx.playRoot.innerHTML = '…';  // tay cầm lúc chơi (chiếm hết chiều cao màn hình)
  return {
    onShow(screen, prev) {},     // screen: 'join' | 'lobby' | 'game' | 'done'
    onRoom(info) {},
    onMe(m) {},                  // dữ liệu từ playerState()
    onEvent(e) {},
    onGesture(name) {},          // 'jump' khi hất đầu máy về phía mình
    frame(t) {},                 // mỗi khung hình
    destroy() {},
  };
}
```

`ctx` gồm: `send(type, data)`, `sensors`, `vibrate(pattern)`, `screen()`, `room()`, `me()`, `sensorError()`, `enableSensors()`, `esc(text)`.

`ctx.sensors` có sẵn:
- `steer` (-1..1): nghiêng trái/phải.
- `level` (0..1.5): mức lắc lên xuống.
- `enabled`, `gotMotion`, `gotOrientation`.
- `calibrate()`, `setInvert()`, `setRange()`, `setJumpDeg()`.

CSS của game nên đặt tên class có tiền tố riêng (ví dụ Đua thú dùng `.race-…`) để không đè lên game khác. Dùng các biến màu `--accent`, `--muted`, `--panel`, `--me` có sẵn trong CSS chung.

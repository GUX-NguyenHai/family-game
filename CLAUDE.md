# Party Game – hướng dẫn cho Claude

Nền tảng game cho cả nhà: **TV/laptop là màn hình chung** (`/host`), **mỗi điện thoại là tay cầm** (`/play`, quét QR). Node.js + Express + Socket.IO, three.js cho cảnh 3D. **Không có database**, mọi thứ nằm trong RAM. Mỗi game là một module trong `games/<id>/`.

## Đọc trước khi làm
1. [README.md](README.md): kiến trúc, cấu trúc thư mục, quy ước, phần chung có sẵn.
2. [games/README.md](games/README.md): **hợp đồng giữa game và phần chung** (game export gì, nhận gì, gửi gì), game mẫu, trạng thái nhị phân, danh sách kiểm tra. Quan trọng nhất khi làm game.
3. Một game gần giống với game định làm, xem bảng "Các game có sẵn để tham khảo" cuối `games/README.md`.

Làm game mới: dùng skill **`/new-game`** (`.claude/skills/new-game/`), có quy trình từng bước và bộ khung file.

## Quy ước bắt buộc
- **Tên file, thư mục, biến, id game: tiếng Anh, viết đầy đủ** (`simulation.js`, không `sim.js`; `boat-race`, không `dua-thuyen`).
- **Chữ hiện cho người chơi: cả tiếng Việt và tiếng Anh** (mỗi thiết bị tự chọn ngôn ngữ). Ở server viết `{ vi, en }`; ở TV/điện thoại dùng `ctx.t('khoá')` với `games/<id>/assets/i18n.json`; phần chung dùng `public/i18n/vi.json` + `en.json` và `/js/core/i18n.js`. Chi tiết: `games/README.md` mục "Hai thứ tiếng".
- **Comment trong code: tiếng Việt.** Comment ngắn, giải thích "tại sao", theo giọng các file đang có.
- **Server là trọng tài:** điểm, va chạm, thắng thua tính trong `games/<id>/service/`. Điện thoại chỉ gửi thao tác, TV chỉ vẽ.
- **`service/` không bao giờ được trình duyệt tải.** Server chỉ mở `screen/`, `controller/`, `assets/`.
- **Game không import code của game khác.** Cái dùng chung đặt ở `public/js/core/` (trình duyệt) hoặc `src/` (server), và cập nhật `games/README.md`.
- **CSS có tiền tố riêng của game** (`.race-…`, `.rope-…`) để không đè lên game khác.
- **Tham số luật chơi để trong `service/config.js`**, có `DIFFICULTIES` (Dễ/Trung bình/Khó) nếu game có độ khó.
- **Game chuyển động liên tục gửi `hostState` dạng nhị phân** theo `assets/schema.json`, `hostEvery: 2`.
- **Có bot** (`bots: true`) để thử một mình.
- **Không tăng `APP_VERSION`** trong `src/config.js` khi đang thử nghiệm.
- **Không commit bí mật:** `.env` (LICENSE_SECRET, ADSENSE_*, ADMIN_PASSWORD) không lên git.
- **Không ghi thông tin server** (IP, tên miền, đường dẫn trên server) vào README hay tài liệu.
- **Model 3D tải về phải có `CREDITS.md`** (tên gốc, tác giả, link, giấy phép).

## Lệnh
```bash
npm install            # lần đầu
npm run dev            # chạy server local (tự đọc .env), mở http://localhost:3000/host
# Kiểm tra cú pháp toàn bộ (chạy trước khi commit hoặc đóng gói game)
for f in server.js src/*.js games/index.js games/*/service/*.js; do node --check "$f" || echo "❌ LỖI: $f"; done
for f in public/js/core/*.js games/*/screen/*.js games/*/controller/*.js; do node --input-type=module --check < "$f" || echo "❌ LỖI: $f"; done
```
- Thử không cần điện thoại: ở `/host` bấm "+ Thêm bot" rồi "Bắt đầu".
- Điện thoại cần HTTPS mới đọc được cảm biến: `cloudflared tunnel --url http://localhost:3000` (xem README mục 1).

## Game được nhận thế nào
- Server **tự nhận** mọi thư mục có `service/index.js` trong `games/` (game có sẵn) và `games-installed/` (game upload). Không cần đăng ký tay. Thứ tự trên thanh chọn game: mảng `ORDER` trong `games/index.js`.
- **Gửi game cho chủ server:** nén thư mục `games/<id>/` thành `<id>.zip`, chủ server upload ở trang `/admin`. Id không được trùng game có sẵn.

## Bản đồ code
| Chỗ | Nội dung |
|---|---|
| `server.js` | HTTP, Socket.IO, phục vụ file game, `/admin`, trang giới thiệu |
| `src/rooms.js` | Phòng, người chơi, bot, đội, vòng lặp tick, chuyển tin game ↔ TV ↔ điện thoại |
| `src/games.js`, `games/index.js` | Nạp game, kiểm tra khai báo, tuỳ chọn |
| `src/state-codec.js` + `public/js/core/state-codec.js` | Mã hoá / giải mã trạng thái nhị phân |
| `public/js/core/host.js`, `play.js` | Phần chung của TV và điện thoại (phòng chờ, đếm ngược, kết quả) |
| `public/js/core/sensors.js` | Cảm biến: lắc (`level`), nghiêng (`steer`), cử chỉ nhảy |
| `public/js/core/scene-kit.js` | Đồ nghề 3D: tải con vật/model, nhãn tên, hạt hiệu ứng |
| `public/js/core/mini-views.js` | Khung nhỏ cho người bị tụt lại (game đua 3D) |

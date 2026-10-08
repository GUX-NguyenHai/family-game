---
name: new-game
description: Làm một game mới cho Party Game (TV làm màn hình chung, điện thoại làm tay cầm) theo đúng khuôn module games/<id>/. Dùng khi người dùng muốn tạo game mới, thêm trò chơi, làm game cho nền tảng này, hoặc gõ /new-game.
---

# Làm game mới cho Party Game

Làm theo đúng thứ tự. **Không viết code trước khi chốt xong bước 1 với người dùng.**

## Bước 0: Đọc
- `CLAUDE.md` (quy ước bắt buộc), `games/README.md` (hợp đồng game ↔ phần chung, mục 3–8).
- Mở **một game có sẵn gần giống nhất** để bắt chước cách viết (bảng cuối `games/README.md`):
  - Lắc liên tục để chạy/kéo: `games/tug-of-war` (ngắn gọn nhất), `games/animal-race`.
  - Chỉ cử chỉ nhảy, chấm theo thời điểm: `games/jump-rope`, `games/sack-race`.
  - Nghiêng để lái: `games/ski-slalom`.
  - Chơi theo đội, lựa chọn riêng (prefs): `games/boat-race`, `games/coconut-climb`.
  - Bấm nút, không cảm biến: game mẫu "Bấm nhanh" trong `games/README.md` mục 6.

## Bước 1: Chốt luật chơi với người dùng (hỏi, đề xuất, chờ đồng ý)
Trình bày ngắn gọn rồi chờ người dùng đồng ý:
- **Cách chơi trên điện thoại:** lắc lên xuống (`sensors.level`), nghiêng trái/phải (`sensors.steer`), hất/giật máy (`onGesture('jump')`), hay nút bấm. Ưu tiên cử động, ít nút.
- **TV hiện gì:** cảnh 3D (three.js, `scene-kit.js`) hay giao diện 2D đơn giản (HTML/CSS).
- **Cá nhân hay theo đội**, số người tối thiểu/tối đa, có bot.
- **Thắng thua và kết thúc:** điều kiện thắng chắc chắn xảy ra, hoặc giới hạn thời gian. Ván luôn phải kết thúc.
- **Độ khó Dễ / Trung bình / Khó** thay đổi những gì.
- **id** (tiếng Anh, chữ thường, nối bằng `-`, không trùng thư mục nào trong `games/`), **tên tiếng Việt**, **emoji** (không trùng game khác), **nhóm** (`motion` | `reflex` | `mind` | `secret` | `folk`), **tiền tố CSS** riêng (2–5 chữ, VD `tap`).

## Bước 2: Dựng khung từ template
```bash
cp -R .claude/skills/new-game/template games/<id>
```
Rồi thay trong mọi file của `games/<id>/`:
- `__ID__` → id game (VD `shake-fill`)
- `__NAME__` → tên tiếng Việt
- `__EMOJI__` → emoji
- `__PREFIX__` → tiền tố CSS (VD `sf`)

Template là một game chạy được ngay ("lắc để đổ đầy thanh, ai đầy trước thắng"): có `config.js` với độ khó, `simulation.js` thuần, trạng thái nhị phân, bot, tay cầm có thử cảm biến ở phòng chờ. **Sửa luật thật vào đó**, xoá phần không dùng.

## Bước 3: Viết phần server (`service/`)
- `config.js`: mọi con số luật chơi + `DIFFICULTIES` (mỗi mức có `label`, `desc` tiếng Việt).
- `simulation.js`: hàm thuần (không socket, không đồ hoạ): tạo ván, nhận thao tác, `step`, bot, kết thúc, xếp hạng.
- `index.js`: khai báo game + `createMatch` nối simulation với nền tảng. Chặn `input()` khi chưa bắt đầu/đã xong. Gọi `api.finish(results)` **đúng 1 lần**.
- `assets/schema.json`: trường gửi cho TV (gọn: làm tròn, chỉ thứ cần vẽ). `setup()` trả về thứ tự id các hàng.

## Bước 4: Viết TV (`screen/`) và điện thoại (`controller/`)
- TV: vẽ được cả lúc **phòng chờ** (`onRoom` với `state === 'lobby'`, làm nền phía sau bảng phòng chờ) và khi **tải lại giữa ván** (`onSetup`). Bố cục phòng chờ của phần chung để trống phần giữa màn hình cho cảnh game.
- Cảnh 3D: dùng `/js/core/scene-kit.js`; game đua có người tụt lại thì dùng `/js/core/mini-views.js`. `destroy()` phải `setAnimationLoop(null)`, gỡ listener, `renderer.dispose()`.
- Điện thoại: chữ to, ít thứ, rung (`ctx.vibrate`) khi có sự kiện quan trọng. Gửi thao tác liên tục ~10 lần/giây bằng `setInterval`, chỉ khi `ctx.screen() === 'game'`. `destroy()` dọn interval.
- CSS mọi class đều có tiền tố `__PREFIX__-`.

## Bước 5: Tài liệu
- `games/<id>/README.md`: cách chơi, tuỳ chọn, độ khó, bảng file, tham số chỉnh trong `config.js`.
- Thêm 1 dòng vào bảng game đầu `README.md` gốc và vào bảng "Các game có sẵn để tham khảo" cuối `games/README.md` (nếu game có điểm mới đáng học).
- Muốn đặt thứ tự trên thanh chọn game: thêm id vào `ORDER` trong `games/index.js`.
- Model tải về: `games/<id>/assets/models/CREDITS.md`.

## Bước 6: Kiểm tra
- Chạy lệnh kiểm tra cú pháp trong `CLAUDE.md`.
- Đối chiếu **danh sách kiểm tra** ở `games/README.md` mục 9.
- Nói người dùng thử: `npm run dev` → `http://localhost:3000/host` → thêm bot → Bắt đầu. Rồi thử bằng điện thoại thật (cần HTTPS cho cảm biến).
- Gửi cho chủ server: `cd games && zip -r ../<id>.zip <id>` rồi upload ở `/admin`.

## Không được
- Sửa phần chung (`src/`, `public/js/core/`) chỉ để làm một game. Chỉ sửa khi nhiều game cùng cần, và cập nhật `games/README.md`.
- Import code từ game khác.
- Tăng `APP_VERSION`, commit `.env`, ghi thông tin server vào tài liệu.

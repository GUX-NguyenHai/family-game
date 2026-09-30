# 🏁 Đua thú

Game đua thú cho cả nhà:
- **TV hoặc laptop** chiếu đường đua 3D và mã QR.
- **Mỗi người dùng điện thoại** quét QR, chọn một con vật, rồi dùng máy làm tay cầm.

Không cần database. Mọi dữ liệu nằm trong RAM, tắt server là mất.

## Cách chơi (trên điện thoại)

| Thao tác | Tác dụng |
|---|---|
| Nghiêng máy trái/phải (hoặc giữ nút ◀ ▶) | Lái sang trái/phải |
| **Lắc máy lên xuống** | Chạy nhanh hơn. Lắc càng mạnh, càng đều thì càng nhanh. Lắc ngang không tính. Tốc độ **tăng dần**: từ đứng yên lên tối đa mất ~3 giây |
| Nút **PHI!** (TURBO) | **Có năng lượng là bấm được.** Bấm là dùng hết năng lượng đang có: nhanh hơn 40% và lướt qua bùn. Đầy 100% thì được 3 giây, 50% thì 1,5 giây… |
| Bấm nút **NHẢY** | Nhảy qua rào |
| ⚡ Năng lượng | Tự đầy sau 8 giây (không tăng trong lúc TURBO). Đầy thì điện thoại rung và nút PHI! nhấp nháy |
| 🟫 Bùn | Chạy chậm lại (trừ khi đang TURBO) |
| 🚧 Rào | Đâm vào thì dừng hẳn, khựng 1 giây, mất 20% năng lượng, rồi tăng tốc lại từ 0 |
| 🥕 Cà rốt | +10% năng lượng. Ai tới trước người đó ăn |
| 💥 Va nhau | Hai con chạm nhau bị đẩy sang hai bên và **cùng chậm lại như lội bùn**, rồi tăng tốc lại. Tông đuôi con phía trước thì không vượt được, phải lái sang bên. Con đang TURBO không bị chậm, hất con kia ra và lách qua |

Các con số này chỉnh trong `src/config.js`: `MANA_FILL_MS`, `CARROT_MANA`, `FENCE_MANA_LOSS`, `TURBO_MS`, `TURBO_FACTOR`. Va chạm chỉnh bằng `COLLIDE` (đặt `false` để tắt), `BUMP_PUSH`, `TURBO_PUSH_SHARE`.

## Cài đặt (lần đầu)

```bash
cd /Users/nguyenhai/workspaces/family_game
npm install
npm run models      # không bắt buộc: bỏ hoạt ảnh thừa, model nhẹ hơn khoảng một nửa
```

## Chạy trên máy (Mac)

```bash
npm run dev         # tự khởi động lại khi sửa code
```

- Mở màn hình chung ở `http://localhost:3000/host`.
- **Muốn test cảm biến trên điện thoại thì cần HTTPS.** Mở terminal thứ 2 và chạy:

```bash
brew install cloudflared                          # lần đầu
cloudflared tunnel --url http://localhost:3000
```

  Mở link `https://xxx.trycloudflare.com/host` mà lệnh trên in ra (mở trên máy tính). Mã QR sẽ tự dùng link HTTPS đó, cả Android lẫn iPhone đều dùng được cảm biến.

### Mẹo khi test
- **Thêm bot:** bấm nút "+ Thêm bot" ở phòng chờ để thử đua đông người.
- **Xem console trên điện thoại:** thêm `&debug=1` vào cuối URL trang chơi.
- **Phím tắt trên màn hình chung:**
  - `F`: bật/tắt toàn màn hình.
  - `Y`: xoay model 90°, dùng khi con vật chạy ngang hoặc chạy ngược. Xoay tới khi đúng, ghi số `modelYaw` hiện trên màn hình vào `public/assets/animals.json`.
- **Chất lượng Thấp/Cao:** nút ở phòng chờ. Dùng chế độ Thấp nếu laptop chiếu bị giật.
- **Cảm biến chạy ngược chiều:** trên điện thoại, tick "Đảo chiều" ở phòng chờ.

## Deploy lên server bằng Docker (chưa có domain)

Game chạy trong Docker. nginx và certbot cài thẳng trên server để lo HTTPS.

Dùng **sslip.io**: server có IP `1.2.3.4` thì tự có domain `1-2-3-4.sslip.io`, lấy được HTTPS thật.
Server hiện tại: `103.185.185.188`, tức domain `103-185-185-188.sslip.io`. Domain này đã điền sẵn trong `deploy/nginx.conf`.

Code lấy từ GitHub: `GUX-NguyenHai/family-game`. Gốc repo chính là thư mục game.

1. **Cài trên server (lần đầu):** Docker, nginx, certbot. Mở cổng 80 và 443 ở trang quản lý của nhà cung cấp server.
   ```bash
   curl -fsSL https://get.docker.com | sh           # bỏ qua nếu đã có docker
   apt install -y nginx certbot python3-certbot-nginx
   ```
2. **Lấy code (lần đầu).** Repo private thì cần deploy key: tạo key trên server, thêm vào repo ở Settings → Deploy keys (chỉ đọc), và khai báo `Host github-family-game` trong `~/.ssh/config` của server.
   ```bash
   git clone git@github-family-game:GUX-NguyenHai/family-game.git ~/family-game
   ```
3. **Build và chạy:**
   ```bash
   cd ~/family-game
   docker compose up -d --build
   docker compose logs -f             # xem log, Ctrl+C để thoát
   ```
   Lúc build, image tự cài thư viện và tối ưu model. Container tự chạy lại khi lỗi và khi server reboot.
4. **nginx + HTTPS (lần đầu):**
   ```bash
   cp deploy/nginx.conf /etc/nginx/sites-available/dua-thu
   ln -sf /etc/nginx/sites-available/dua-thu /etc/nginx/sites-enabled/dua-thu
   rm -f /etc/nginx/sites-enabled/default
   nginx -t && systemctl reload nginx
   certbot --nginx -d 103-185-185-188.sslip.io --redirect
   ```
   ⚠️ Certbot sửa trực tiếp file `/etc/nginx/sites-available/dua-thu` để thêm HTTPS. Sau đó **đừng chép đè `deploy/nginx.conf`** lên file này nữa. Lỡ chép đè thì chạy lại lệnh certbot ở trên.
5. Mở `https://103-185-185-188.sslip.io/host` trên TV hoặc laptop.

**Cập nhật code sau này:** trên Mac chạy `git push`, rồi trên server chạy:
```bash
cd ~/family-game && git pull && docker compose up -d --build
```

**Lệnh Docker hay dùng** (chạy trong `~/family-game`):
- `docker compose ps`: xem trạng thái.
- `docker compose restart`: khởi động lại (mọi phòng đang chơi sẽ mất).
- `docker compose down`: tắt hẳn.
- `docker image prune -f`: dọn image cũ sau nhiều lần build.

### Không dùng Docker (tuỳ chọn)
Cài Node 22 trên server, rồi chạy `npm install --omit=dev`. Tối ưu model bằng `npm run models` trên Mac, sau đó chép thêm thư mục `build/` lên server. Chạy bằng systemd theo file `deploy/dua-thu.service` (đang để `User=root`, `WorkingDirectory=/root/family-game`): copy vào `/etc/systemd/system/`, rồi chạy `systemctl enable --now dua-thu`.

## Cấu trúc

```
server.js                  HTTP + Socket.IO + QR
src/config.js              ★ tham số luật chơi (tốc độ, độ dài đường, thời gian choáng…)
src/game.js                mô phỏng cuộc đua + bot (không dính đồ hoạ)
src/rooms.js               quản lý phòng, sự kiện socket
public/assets/animals.json ★ danh sách con vật, tên hoạt ảnh, hướng model
public/host.html + js/host/  màn hình chung 3D (three.js)
public/play.html + js/play.js + js/sensors.js   tay cầm điện thoại
animal/                    model gốc (Quaternius, CC0)
build/models/              model đã tối ưu (tạo bằng npm run models)
```

**Thêm con vật mới:**
1. Chép file `.glb` vào `animal/`.
2. Thêm một dòng vào `animals.json`.
3. Chạy lại `npm run models`.

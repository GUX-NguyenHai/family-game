# 🎮 Party Game

Bộ game cho cả nhà:
- **TV hoặc laptop** làm màn hình chung, hiện mã QR.
- **Mỗi người dùng điện thoại** quét QR, chọn một con vật làm avatar, rồi dùng máy làm tay cầm.
- **Chủ phòng chọn game ở phòng chờ.** Đổi game không cần quét lại mã: cả nhà ở nguyên trong phòng.

| Game | Cách chơi |
|---|---|
| 🏁 **Đua thú** | Đường đua 3D: lắc máy để chạy, nghiêng để đổi làn, nhảy rào, TURBO (chi tiết ở dưới) |
| 🪢 **Kéo co** | 2 đội Đỏ – Xanh (1–6 người/đội, **phải bằng người**, thiếu thì thêm bot) đứng hai bên bờ sông, lắc máy để kéo. Lực đội = trung bình mức lắc. Kéo dấu giữa dây qua vạch bên mình là thắng ván, đội kia ngã xuống sông. Hết 45 giây thì dây lệch bên nào bên đó thắng. Mỗi lần bắt đầu là 1 ván, muốn đấu tiếp thì bấm "Chơi lại". Tham số: `games/tug-of-war/service/config.js` |
| 🌴 **Leo cây hái dừa** | Mỗi người một cây dừa, lắc máy để leo, **ngừng lắc là tụt xuống**. Giữa thân có **đoạn trơn** (rêu xanh): phải lắc thật mạnh mới qua, lắc yếu là trượt. Ai lên ngọn hái dừa trước thì thắng, hết 45 giây xếp theo độ cao. Mỗi lần bắt đầu là 1 ván. Tham số: `games/coconut-climb/service/config.js` |
| 🚣 **Đua thuyền** | Lắc máy lên xuống để chèo: lắc nhanh thì đi nhanh, ngừng lắc thì thuyền dừng. **Thi đơn** hoặc **theo đội** (2–4 người chung thuyền, tốc độ = trung bình mức lắc cả đội). Kiểu **Basic**: đường thẳng, không vật cản. Kiểu **Pro**: nghiêng để lái (theo đội thì cả đội cùng nghiêng), né khúc gỗ và đảo hải đăng. Chọn xuồng hoặc thuyền chèo ở phòng chờ. Tham số: `games/boat-race/service/config.js` |

Mỗi game là một module trong `games/`. **Cách thêm game mới: xem [games/README.md](games/README.md).**

Không cần database. Mọi dữ liệu nằm trong RAM, tắt server là mất.

## 🏁 Đua thú: cách chơi (trên điện thoại)

| Thao tác | Tác dụng |
|---|---|
| Nghiêng máy trái/phải (hoặc giữ nút ◀ ▶) | Lái sang trái/phải |
| **Lắc máy lên xuống** | **Không lắc thì đứng yên.** Lắc thì chạy, lắc càng nhanh và mạnh thì càng nhanh. Dừng tay thì chậm dần rồi dừng trong khoảng 1 giây. Lắc ngang không tính. Tốc độ **tăng dần**: từ đứng yên lên tối đa mất ~2,4 giây |
| Nút **PHI!** (TURBO) | **Có năng lượng là bấm được.** Nhanh hơn 40% và lướt qua bùn. Trong lúc TURBO, thanh năng lượng **tụt dần**, cạn thì hết TURBO: đầy 100% dùng được 5 giây, 50% dùng được 2,5 giây… Chỉ cần bấm 1 lần, không cần giữ. Đang TURBO mà ăn cà rốt thì được kéo dài. Đâm rào thì mất TURBO |
| **Giật cương** (hất nhanh đầu máy về phía mình rồi thả về) hoặc bấm nút **NHẢY** | Nhảy qua rào. Chỉnh độ nhạy hoặc tắt cử chỉ ở phòng chờ ("Nhảy bằng cử chỉ"). Máy không có con quay hồi chuyển thì chỉ dùng nút |
| ⚡ Năng lượng | **Chỉ tăng khi đang chạy**: chạy nhanh (từ 60% tốc độ tối đa) thì đầy sau 12 giây, chạy chậm thì tăng chậm, đứng yên hoặc đang khựng thì không tăng. Không tăng trong lúc TURBO. Đầy thì điện thoại rung và nút PHI! nhấp nháy |
| 🟫 Bùn | Chạy chậm lại (trừ khi đang TURBO) |
| 🚧 Rào | Đâm vào thì dừng hẳn, khựng 1 giây, mất 20% năng lượng, rồi tăng tốc lại từ 0 |
| 🥕 Cà rốt | +10% năng lượng. Ai tới trước người đó ăn |
| 💥 Va nhau | Hai con chạm nhau bị đẩy sang hai bên và **cùng chậm lại như lội bùn**, rồi tăng tốc lại. Tông đuôi con phía trước thì không vượt được, phải lái sang bên. Con đang TURBO không bị chậm, hất con kia ra và lách qua |

Các con số này chỉnh trong `games/animal-race/service/config.js`: `MANA_FILL_MS`, `CARROT_MANA`, `FENCE_MANA_LOSS`, `TURBO_MS`, `TURBO_FACTOR`. Va chạm chỉnh bằng `COLLIDE` (đặt `false` để tắt), `BUMP_PUSH`, `TURBO_PUSH_SHARE`.

## 🏁 Đua thú: độ khó

Chủ phòng chọn ở phòng chờ trên màn hình chung (hoặc ở màn kết quả cho ván sau). **Mặc định: Dễ.** Mọi gói đều dùng được.

| | 🟢 Dễ | 🟡 Trung bình | 🔴 Khó |
|---|---|---|---|
| Đường đua | 300m | 400m | 500m |
| Vật cản | Ít rào, nhiều cà rốt, không có 2 vật cản cạnh nhau | Vừa phải | Nhiều rào, bùn to, hay có 2 vật cản cạnh nhau |
| Đâm rào | Khựng 0,5s, không mất năng lượng | Khựng 1s, −20% | Khựng 1,5s, −30% |
| Va nhau | Chậm nhẹ (còn 70%) | Còn 40% | Còn 40%, chậm lâu hơn |
| Độ nặng tay | Lắc nhẹ đã chạy tối đa | Vừa | Phải lắc mạnh mới chạy tối đa |
| Bot | Chậm, ít nhảy rào, hay phí TURBO | Khá | Nhanh, nhảy rào giỏi, dùng TURBO khôn |

Tốc độ tối đa ở cả 3 mức đều là 19 m/s. Độ nặng tay là `DRIVE_GAIN` (1.3 / 1 / 0.8). Chỉnh các con số trong `DIFFICULTIES` ở `games/animal-race/service/config.js`.

## Miễn phí và Pro

| | Miễn phí | Pro |
|---|---|---|
| Số người mỗi phòng (tính cả bot) | 4 (`FREE_MAX_PLAYERS`) | Theo mã, tối đa 12 (`PRO_MAX_PLAYERS`) |

- **Mã Pro** chủ phòng nhập trên màn hình chung: phòng chờ → "Nhập mã Pro".
- **Mỗi mã chỉ dùng cho một phòng tại một thời điểm.** Nếu phòng đang giữ mã đã đóng màn hình, phòng khác nhập mã đó sẽ lấy được mã.
- Mã được **ký bằng `LICENSE_SECRET`**, chứa sẵn hạn dùng và số người, nên **không cần database**. Việc bán và thanh toán nằm ngoài game.
- Mã hết hạn thì phòng tự về bản miễn phí.
- Server tối đa `MAX_ROOMS` = 50 phòng cùng lúc.

**Đặt khoá bí mật (làm một lần trên server):**
```bash
cd ~/family-game
echo "LICENSE_SECRET=$(openssl rand -hex 32)" > .env
docker compose up -d --build
```
Giữ kín file `.env`, **không đưa lên git**. Đổi khoá thì mọi mã cũ mất hiệu lực. Chưa có khoá thì server tắt Pro, mọi phòng là bản miễn phí.

**Tạo mã (trên server, sau khi đã đặt khoá):**
```bash
docker compose exec party-game node src/license.js --days 30 --players 12
docker compose exec party-game node src/license.js --days 0 --count 5    # 5 mã vĩnh viễn
```
Khi chạy trên Mac không có `.env`, `npm run make-code -- --days 30` tạo **mã thử**. Mã này chỉ dùng được với server cũng chưa đặt khoá.

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
   cp deploy/nginx.conf /etc/nginx/sites-available/party-game
   ln -sf /etc/nginx/sites-available/party-game /etc/nginx/sites-enabled/party-game
   rm -f /etc/nginx/sites-enabled/default
   nginx -t && systemctl reload nginx
   certbot --nginx -d 103-185-185-188.sslip.io --redirect
   ```
   ⚠️ Certbot sửa trực tiếp file `/etc/nginx/sites-available/party-game` để thêm HTTPS. Sau đó **đừng chép đè `deploy/nginx.conf`** lên file này nữa. Lỡ chép đè thì chạy lại lệnh certbot ở trên.
5. Mở `https://103-185-185-188.sslip.io/host` trên TV hoặc laptop.

**Cập nhật code sau này:** trên Mac chạy `git push`, rồi trên server chạy:
```bash
cd ~/family-game && git pull && docker compose up -d --build --force-recreate
```

**Lệnh Docker hay dùng** (chạy trong `~/family-game`):
- `docker compose ps`: xem trạng thái.
- `docker compose restart`: khởi động lại (mọi phòng đang chơi sẽ mất).
- `docker compose down`: tắt hẳn.
- `docker image prune -f`: dọn image cũ sau nhiều lần build.

### Không dùng Docker (tuỳ chọn)
Cài Node 22 trên server, rồi chạy `npm install --omit=dev`. Tối ưu model bằng `npm run models` trên Mac, sau đó chép thêm thư mục `build/` lên server. Chạy bằng systemd theo file `deploy/party-game.service` (đang để `User=root`, `WorkingDirectory=/root/family-game`): copy vào `/etc/systemd/system/`, rồi chạy `systemctl enable --now party-game`.

## Cấu trúc

```
server.js                     HTTP + Socket.IO + QR, mở thư mục giao diện của từng game
src/                          ── phần chung (nền tảng) ──
  config.js                   ★ phiên bản, giới hạn phòng/gói, game mặc định
  rooms.js                    phòng, người chơi, bot, vòng lặp, chuyển tin giữa game ↔ màn hình ↔ điện thoại
  games.js                    đọc danh sách game, tuỳ chọn của game
  license.js                  mã Pro
public/                       giao diện chung
  host.html + js/core/host.js phòng chờ, QR, chọn game, đếm ngược, kết quả (màn hình chung)
  play.html + js/core/play.js vào phòng, phòng chờ, màn kết quả (điện thoại)
  js/core/sensors.js          cảm biến điện thoại (nghiêng, lắc, hất máy), game nào cũng dùng được
  js/core/scene-kit.js        đồ nghề 3D dùng chung: tải con vật/model, nhãn tên, chữ nổi, hạt hiệu ứng
  assets/animals.json         ★ danh sách con vật (avatar), tên hoạt ảnh, hướng model
games/                        ── mỗi game một thư mục ──
  index.js                    ★ danh sách game (thêm game = thêm 1 dòng)
  animal-race/                🏁 Đua thú
    service/                  luật chơi: config.js ★, simulation.js (mô phỏng cuộc đua + bot), index.js (khai báo)
    screen/                   hình ảnh trên TV: cảnh 3D (three.js), bản đồ nhỏ, bảng xếp hạng
    controller/               tay cầm điện thoại: PHI!/NHẢY, thử cảm biến ở phòng chờ
  boat-race/                  🚣 Đua thuyền
    service/                  luật chơi: config.js ★, simulation.js (thuyền, đội, vật cản, bot), index.js
    screen/                   cảnh sông 3D, bản đồ nhỏ, bảng xếp hạng
    controller/               tay cầm: chèo, lái (kiểu Pro), chọn thuyền ở phòng chờ
    assets/                   boats.json (danh sách thuyền), models/ (thuyền, khúc gỗ, hải đăng + CREDITS.md)
  tug-of-war/                 🪢 Kéo co
    service/                  luật chơi: config.js ★, simulation.js (dây, ván, bot), index.js
    screen/                   cảnh 3D hai bờ sông, tỉ số, lực hai đội
    controller/               tay cầm: lắc để kéo, vị trí dây
  coconut-climb/              🌴 Leo cây hái dừa
    service/                  luật chơi: config.js ★, simulation.js (leo, tụt, đoạn trơn, bot), index.js
    screen/                   cảnh bãi biển 3D, hàng cây dừa, bảng xếp hạng
    controller/               tay cầm: lắc để leo, thanh độ cao có đoạn trơn
    assets/models/            palm-tree.glb, coconut.glb (+ CREDITS.md)
animal/                       model gốc (Quaternius, CC0)
build/models/                 model đã tối ưu (tạo bằng npm run models)
```

**Thêm con vật mới:**
1. Chép file `.glb` vào `animal/`.
2. Thêm một dòng vào `animals.json`.
3. Chạy lại `npm run models`.

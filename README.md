# 🎮 Party Game

Nền tảng game cho cả nhà, chơi theo kiểu **TV + điện thoại làm tay cầm**:
- **TV hoặc laptop** làm màn hình chung: hiện mã QR, phòng chờ, cảnh game.
- **Mỗi người dùng điện thoại** quét QR, nhập tên, chọn một con vật làm avatar, rồi dùng máy làm tay cầm (lắc, nghiêng, hất máy, bấm nút).
- **Chủ phòng chọn game** ở phòng chờ. Đổi game không cần quét lại mã, cả nhà ở nguyên trong phòng.
- **Không có database.** Mọi dữ liệu nằm trong RAM, tắt server là mất.

**Mỗi game là một module** trong thư mục `games/`. Phần chung (phòng, QR, người chơi, bot, đội, gói Pro, cảm biến, đếm ngược, bảng kết quả) đã có sẵn. Người làm game chỉ cần viết luật chơi và giao diện riêng.

| Game | Tóm tắt | Chi tiết |
|---|---|---|
| 🏁 Đua thú | Mỗi con chạy thẳng một làn. Lắc máy để chạy, hất hoặc giật máy để nhảy qua rào và bùn. Không có nút bấm | [games/animal-race](games/animal-race/README.md) |
| 🚣 Đua thuyền | Lắc máy để chèo. Thi đơn hoặc theo đội. Kiểu Basic (đường thẳng) hoặc Pro (lái, né vật cản) | [games/boat-race](games/boat-race/README.md) |
| 🪢 Kéo co | 2 đội bằng người, lắc máy để kéo dây, đội thua rơi xuống sông | [games/tug-of-war](games/tug-of-war/README.md) |
| 🌴 Leo cây hái dừa | Chọn khỉ, lắc để leo, ngừng lắc là tụt, qua các đoạn thân trơn | [games/coconut-climb](games/coconut-climb/README.md) |
| 🤸 Nhảy dây | Cả nhà nhảy chung một sợi dây, hất máy để nhảy đúng nhịp, vướng là bị loại. Mỗi màn khó hơn, ai trụ cuối cùng thắng | [games/jump-rope](games/jump-rope/README.md) |
| ⛷️ Trượt tuyết vượt cổng | Chỉ nghiêng máy để lái xuống dốc qua các cổng cờ. Trượt cổng +3 giây, đâm cây là ngã, ít thời gian nhất thắng | [games/ski-slalom](games/ski-slalom/README.md) |
| 🛍️ Nhảy bao bố | Mỗi lần hất máy là một bước nhảy. Máy rung lúc đáp: hất tiếp ngay thì bước dài dần, hất vội lúc còn bay là ngã | [games/sack-race](games/sack-race/README.md) |

---

## Mục lục
1. [Chạy thử trên máy](#1-chạy-thử-trên-máy)
2. [Cách hệ thống hoạt động](#2-cách-hệ-thống-hoạt-động)
3. [Cấu trúc thư mục](#3-cấu-trúc-thư-mục)
4. [Làm một game mới](#4-làm-một-game-mới)
5. [Quy ước bắt buộc](#5-quy-ước-bắt-buộc)
6. [Phần chung có sẵn những gì](#6-phần-chung-có-sẵn-những-gì)
7. [Miễn phí và Pro](#7-miễn-phí-và-pro)
8. [Mẹo, lỗi hay gặp](#8-mẹo-lỗi-hay-gặp)
9. [Dành cho AI / người mới đọc code](#9-dành-cho-ai--người-mới-đọc-code)

---

## 1. Chạy thử trên máy

Cần **Node.js 18.11 trở lên** (khuyên dùng Node 22).

```bash
npm install
npm run models      # không bắt buộc: làm nhẹ model con vật (bỏ hoạt ảnh thừa), chạy 1 lần
npm run dev         # chạy server, tự khởi động lại khi sửa code
```

- Mở **http://localhost:3000/host** trên máy tính. Đây là màn hình chung.
- Bấm **"+ Thêm bot"** vài lần rồi **"▶ Bắt đầu"** để xem game chạy mà không cần điện thoại.

**Thử bằng điện thoại.** Điện thoại chỉ đọc được cảm biến (lắc, nghiêng) khi trang chạy **HTTPS**. Trên máy local, dùng cloudflared để có link HTTPS tạm:
```bash
brew install cloudflared                          # lần đầu (macOS)
cloudflared tunnel --url http://localhost:3000
```
Mở link `https://xxx.trycloudflare.com/host` mà lệnh in ra. Mã QR trên màn hình sẽ tự dùng link này, điện thoại quét là chơi được, cả Android lẫn iPhone. Nếu chỉ thử giao diện mà không cần cảm biến thì điện thoại và máy tính dùng chung Wi-Fi là đủ: mã QR dùng sẵn IP mạng LAN.

**Kiểm tra cú pháp** trước khi commit (không cần chạy server):
```bash
for f in server.js src/*.js games/index.js games/*/service/*.js; do node --check "$f" || echo "❌ LỖI: $f"; done
for f in public/js/core/*.js games/*/screen/*.js games/*/controller/*.js; do node --input-type=module --check < "$f" || echo "❌ LỖI: $f"; done
```

---

## 2. Cách hệ thống hoạt động

```
  📺 TV / laptop                    🖥️ Server (Node.js)                    📱 Điện thoại
  /host                                                                    /play?room=ABCD
  ┌──────────────────┐   Socket.IO   ┌───────────────────────────┐ Socket.IO ┌──────────────────┐
  │ core/host.js     │◀─────────────│ src/rooms.js (phần chung)  │◀──────────│ core/play.js     │
  │  phòng chờ, QR,  │  game:setup   │  phòng, người chơi, bot,   │game:input │  vào phòng,      │
  │  kết quả         │  game:state   │  đội, vòng lặp tick        │──────────▶│  phòng chờ, kq   │
  │ ┌──────────────┐ │  game:event   │ ┌───────────────────────┐ │ game:me   │ ┌──────────────┐ │
  │ │ games/<id>/  │ │               │ │ games/<id>/service/   │ │ game:event│ │ games/<id>/  │ │
  │ │   screen/    │ │               │ │   luật chơi           │ │           │ │  controller/ │ │
  │ └──────────────┘ │               │ └───────────────────────┘ │           │ └──────────────┘ │
  └──────────────────┘               └───────────────────────────┘           └──────────────────┘
```

- **Server là trọng tài.** Mọi tính toán (vị trí, va chạm, điểm, thắng thua, bot) chạy trên server trong `games/<id>/service/`. TV và điện thoại chỉ hiển thị.
- **Điện thoại không nói chuyện trực tiếp với TV.** Điện thoại gửi thao tác lên server (`game:input`). Server tính toán rồi gửi kết quả cho TV (`game:state`, khoảng 10–30 lần/giây) và cho từng điện thoại (`game:me`).
- **HTTP chỉ dùng để tải tài nguyên** (HTML, JS, CSS, model 3D). Mọi tương tác lúc chơi đi qua WebSocket (Socket.IO).
- **Mỗi phòng độc lập.** Phòng có mã 4 chữ, danh sách người chơi, game đang chọn, tuỳ chọn và vòng lặp riêng. Nhiều phòng chơi nhiều game khác nhau cùng lúc mà không ảnh hưởng nhau.
- **Một phòng đi qua 4 trạng thái:** `lobby` (phòng chờ) → `countdown` (đếm ngược) → `playing` → `finished` (bảng kết quả) → về `lobby` hoặc "Chơi lại".

---

## 3. Cấu trúc thư mục

```
server.js                     HTTP + Socket.IO + QR; mở thư mục screen/ controller/ assets/ của từng game
src/                          ── PHẦN CHUNG phía server ──
  config.js                   phiên bản, giới hạn phòng/gói, game mặc định, nhóm game, màu đội
  rooms.js                    phòng, người chơi, bot, đội, vòng lặp, chuyển tin game ↔ TV ↔ điện thoại
  games.js                    đọc danh sách game, kiểm tra khai báo, tuỳ chọn
  license.js                  mã Pro (ký HMAC, không cần database)
  ads.js, pages.js            quảng cáo AdSense (mã từ .env, /ads.txt); trang giới thiệu "/" và "/privacy"
  admin.js, unzip.js          trang /admin: upload game .zip (giải nén vào games-installed/), xoá game đã upload
  state-codec.js              mã hoá trạng thái gửi cho TV thành nhị phân gọn (theo schema của từng game)
public/                       ── PHẦN CHUNG phía trình duyệt ──
  host.html, play.html        khung trang TV và điện thoại
  css/host.css, css/play.css  giao diện chung (biến màu dùng lại được trong game)
  js/core/host.js             TV: phòng chờ, chọn game (thanh bên trái), QR, đếm ngược, kết quả; nạp games/<id>/screen
  js/core/play.js             điện thoại: vào phòng, phòng chờ, chọn đội, màn kết quả; nạp games/<id>/controller
  js/core/sensors.js          cảm biến: lắc lên xuống, nghiêng, hất đầu máy, giật máy lên
  js/core/scene-kit.js        đồ nghề 3D (three.js): tải con vật/model, nhãn tên, chữ nổi, hạt hiệu ứng
  js/core/mini-views.js       game đua 3D: khung nhỏ 2 bên màn hình cho người bị tụt lại (chỗ cố định theo làn)
  js/core/state-codec.js      giải mã trạng thái nhị phân từ server
  js/core/util.js, audio.js   tiện ích nhỏ, âm thanh bíp
  js/core/ads.js              ô quảng cáo ở phòng chờ (TV + điện thoại)
  assets/animals.json         danh sách con vật (avatar người chơi) + hoạt ảnh
games/                        ── MỖI GAME MỘT THƯ MỤC ──
  index.js                    tự tìm game (games/ + games-installed/), thứ tự hiện (ORDER)
  README.md                   ★ hướng dẫn chi tiết cách làm game
  <id>/
    README.md                 luật chơi, tham số chỉnh
    service/                  luật chơi, chạy trên server (KHÔNG mở ra ngoài)
      index.js                khai báo game + createMatch()
      config.js               tham số (tốc độ, thời gian, độ khó…)
      simulation.js           mô phỏng thuần (không dính socket/đồ hoạ), bot
    screen/                   hình ảnh trên TV: index.js (+ scene.js nếu 3D), style.css
    controller/               tay cầm điện thoại: index.js, style.css
    assets/                   schema.json (định dạng trạng thái nhị phân), model .glb, json, ảnh + CREDITS.md
animal/                       model con vật gốc (Quaternius, CC0)
build/models/                 model con vật đã tối ưu (npm run models tạo ra)
games-installed/              game upload qua /admin (không lên git, không vào image)
deploy/                       cấu hình nginx, systemd
Dockerfile, docker-compose.yml
```

---

## 4. Làm một game mới

Tóm tắt 5 bước. **Hướng dẫn đầy đủ kèm game mẫu chép được ngay: [games/README.md](games/README.md).**

1. Tạo thư mục `games/<id>/`. `<id>` là tiếng Anh, chữ thường, nối bằng `-`, ví dụ `tap-race`.
2. Viết `service/index.js`: khai báo game (tên, emoji, nhóm, số người, tuỳ chọn…) và hàm `createMatch()` chứa luật chơi.
3. Viết `screen/index.js` + `style.css`: vẽ game trên TV.
4. Viết `controller/index.js` + `style.css`: tay cầm trên điện thoại.
5. Khởi động lại server. Game **tự được nhận** (mọi thư mục có `service/index.js`) và hiện trên thanh chọn game. Muốn xếp thứ tự thì thêm id vào `ORDER` trong [games/index.js](games/index.js).

**Người trong team gửi game mà không cần sửa code chính:** nén thư mục `games/<id>/` thành `<id>.zip`, chủ server vào **`/admin`** (mật khẩu `ADMIN_PASSWORD` trong `.env`) và upload. Game dùng được ngay, không phải build lại; các màn hình đang mở tự tải lại. Game upload nằm trong `games-installed/` (volume Docker riêng), nên `git pull` và build lại không mất. Upload lại cùng id là cập nhật. Trùng id với game có sẵn thì không cho cài; trùng id game đã upload hoặc trùng tên thì hỏi lại trước khi cài. Lưu ý: code `service/` của game chạy trên server, chỉ upload game của người tin được.

**Không cần sửa phần chung** (`src/`, `public/js/core/`) để làm một game bình thường. Chỉ sửa phần chung khi cần một khả năng mới mà **nhiều game** sẽ dùng (như đội, lựa chọn riêng). Khi đó phải cập nhật luôn [games/README.md](games/README.md).

---

## 5. Quy ước bắt buộc

| Quy ước | Chi tiết |
|---|---|
| **Tên file, thư mục, biến: tiếng Anh, viết đầy đủ** | `simulation.js`, không phải `sim.js`; `boat-race`, không phải `dua-thuyen`. Không viết tắt khó hiểu |
| **Chữ hiện cho người chơi và chú thích code: tiếng Việt** | Giao diện, thông báo, mô tả trong `description`/`options`, comment trong code |
| **Game không import code của game khác** | Cái gì dùng chung thì đưa vào `public/js/core/` (trình duyệt) hoặc `src/` (server) |
| **`service/` không bao giờ được trình duyệt tải** | Server chỉ mở `screen/`, `controller/`, `assets/`. Đừng để luật chơi hay bí mật trong 3 thư mục này |
| **Server là trọng tài** | Thắng thua, điểm, va chạm tính trong `service/`. Điện thoại chỉ gửi thao tác, không tự quyết kết quả |
| **Tách mô phỏng khỏi lớp nối** | `simulation.js` là hàm thuần (nhận trạng thái, trả trạng thái/sự kiện). `index.js` nối nó với nền tảng |
| **Tham số để trong `config.js`** | Tốc độ, thời gian, độ khó… không viết cứng rải rác trong code |
| **CSS có tiền tố riêng** | Mỗi game đặt tiền tố class riêng (`.race-…`, `.boat-…`, `.tug-…`, `.cc-…`, `.rope-…`, `.sack-…`, `.ski-…`) để không đè lên game khác |
| **Model tải về ghi nguồn** | Mỗi thư mục model có `CREDITS.md` (tên gốc, tác giả, link). Nhiều model là CC-BY, phải ghi tên tác giả |
| **Có bot** | Game nên có bot để thử một mình và để bù người |
| **Chạy được trên cả Android và iPhone** | iPhone chỉ cho đọc cảm biến sau khi người chơi bấm nút. Phần chung đã lo, game chỉ cần dùng `ctx.sensors` |
| **Không tăng `APP_VERSION` khi đang thử nghiệm** | Chỉ tăng khi phát hành bản chạy thật. Trang tự tải lại khi server khởi động lại, không phụ thuộc số version |
| **Không commit bí mật** | `.env` (`LICENSE_SECRET`) không lên git, không vào Docker image |

---

## 6. Phần chung có sẵn những gì

| Khả năng | Game dùng thế nào |
|---|---|
| Phòng, mã phòng, QR, vào/ra, nối lại khi rớt mạng | Tự có, không cần làm gì |
| Thanh chọn game theo nhóm (Vận động, Phản xạ, Trí tuệ, Bí mật, Dân gian) | Khai báo `category` trong `service/index.js` |
| Tuỳ chọn cho chủ phòng (độ khó, chế độ…) | Khai báo `options`, phần chung tự vẽ hàng nút và gửi giá trị vào `createMatch` |
| Bot | Khai báo `bots: true`. Người chơi có `bot: true`, game tự cho bot hành động trong `tick()` |
| Chơi theo đội (tối đa 4 màu đội, chọn đội, chia ngẫu nhiên, bắt bằng người) | Khai báo `teams: { min, max, count, equal, enabled }` |
| Lựa chọn riêng của người chơi (loại thuyền, loại khỉ…) | Điện thoại gọi `ctx.setPref(key, value)`, server nhận trong `players[].prefs` |
| Đếm ngược 3-2-1, chữ bắt đầu, bảng kết quả, "Chơi lại" | Khai báo `countdownMs`, `goText`; gọi `api.finish(results)` |
| Gói Free/Pro, giới hạn số người | Khai báo `maxPlayers`, phần chung lấy số nhỏ hơn giữa gói và game |
| Cảm biến điện thoại | `ctx.sensors.level` (lắc), `ctx.sensors.steer` (nghiêng), `onGesture('jump')` (hất hoặc giật máy) |
| Đồ nghề 3D | Import từ `/js/core/scene-kit.js` |
| Khung nhỏ cho người bị tụt lại (game đua) | `MiniViews` trong `/js/core/mini-views.js`, cách dùng ghi ở đầu file. Đua thú, Đua thuyền, Nhảy bao bố, Trượt tuyết đang dùng |
| Âm thanh, thông báo nổi trên TV | `ctx.beep()`, `ctx.fanfare()`, `ctx.toast()` |
| Bắt lỗi | Lỗi trong code game được bắt và ghi log, không làm sập server |

---

## 7. Miễn phí và Pro

| | Miễn phí | Pro |
|---|---|---|
| Số người mỗi phòng (tính cả bot) | 4 (`FREE_MAX_PLAYERS`) | Theo mã, tối đa 12 (`PRO_MAX_PLAYERS`) |

- Chủ phòng nhập mã Pro ở phòng chờ ("Nhập mã Pro"). **Mỗi mã chỉ dùng cho một phòng tại một thời điểm.** Mã hết hạn thì phòng tự về bản miễn phí.
- Mã được **ký bằng `LICENSE_SECRET`**, chứa sẵn hạn dùng và số người, nên không cần database. Việc bán và thanh toán nằm ngoài game.
- Server tối đa `MAX_ROOMS` = 50 phòng cùng lúc.

**Đặt khoá bí mật trên server (một lần):**
```bash
echo "LICENSE_SECRET=$(openssl rand -hex 32)" >> .env     # cạnh docker-compose.yml, KHÔNG đưa lên git
docker compose up -d --build
```
Chưa có khoá thì server tắt Pro. Đổi khoá thì mọi mã cũ mất hiệu lực.

**Tạo mã:**
```bash
docker compose exec party-game node src/license.js --days 30 --players 12
docker compose exec party-game node src/license.js --days 0 --count 5    # 5 mã vĩnh viễn
npm run make-code -- --days 30                                          # trên máy local: mã thử
```

### Quảng cáo (Google AdSense)
- Chỉ hiện ở **phòng chờ**, trên TV (dưới mã QR) và điện thoại (cuối trang). Không hiện lúc chơi. Phòng Pro cũng có quảng cáo.
- Bắt đầu chơi thì gỡ ô quảng cáo, về phòng chờ thì tạo ô mới. Không tự làm mới quảng cáo (quy định AdSense).
- Mã đặt trong `.env`, chưa có thì không hiện gì và không tải gì của Google:
  ```bash
  ADSENSE_CLIENT=ca-pub-1234567890123456   # mã nhà xuất bản: cần để Google duyệt trang
  ADSENSE_SLOT_HOST=1234567890             # đơn vị quảng cáo cho TV (tạo sau khi được duyệt)
  ADSENSE_SLOT_PLAY=1234567890             # đơn vị quảng cáo cho điện thoại
  CONTACT_EMAIL=                           # (tuỳ chọn) email liên hệ ở chân trang
  ADMIN_PASSWORD=                          # mật khẩu trang /admin (upload game), trống = tắt
  ```
  Sửa `.env` xong chạy lại `docker compose up -d` để container nhận giá trị mới.
- Có `ADSENSE_CLIENT` thì server tự trả `/ads.txt` và chèn thẻ AdSense vào trang giới thiệu `/` (Google kiểm tra thẻ này lúc duyệt).
- Trang giới thiệu `/` và chính sách bảo mật `/privacy` dựng trên server ([src/pages.js](src/pages.js)); danh sách game lấy từ khai báo của từng game nên thêm game là trang tự cập nhật.
- Bảng hỏi đồng ý cookie cho châu Âu/Anh: bật trong AdSense, mục "Quyền riêng tư và thông báo", không cần code.

---

## 8. Mẹo, lỗi hay gặp

- **Thêm bot** để thử đông người. **Xem console trên điện thoại:** thêm `&debug=1` vào cuối link trang chơi.
- **Phím tắt trên TV:** `F` bật/tắt toàn màn hình. `Y` xoay model 90° (Đua thú: con vật; Leo cây: khỉ) khi model quay sai hướng. Ghi số hiện ra vào file json tương ứng.
- **Đồ hoạ Thấp/Cao:** nút ở phòng chờ. Dùng Thấp nếu TV hoặc laptop bị giật.
- **Mở ra vẫn thấy bản cũ:** tải lại hẳn trang (Ctrl/Cmd+Shift+R). Trên server, kiểm tra container đã được thay chưa (`docker compose logs --tail=5`).
- **Màn hình hiện "Lỗi: …"** thay vì chạy: thường là lỗi cú pháp JS. Chạy lệnh kiểm tra cú pháp ở mục 1.
- **Điện thoại không lắc được:** trang phải là HTTPS. iPhone phải bấm "Bật cảm biến" và cho phép.
- **Thêm con vật avatar:** chép `.glb` vào `animal/`, thêm 1 dòng vào `public/assets/animals.json`, chạy `npm run models`.

---

## 9. Dành cho AI / người mới đọc code

Nên đọc theo thứ tự này:
1. **README này**, để nắm ý tưởng, luồng dữ liệu và quy ước.
2. **[games/README.md](games/README.md)**, phần **hợp đồng giữa game và phần chung**: game phải export gì, nhận gì, gửi gì. Đây là tài liệu quan trọng nhất khi làm game.
3. **Một game mẫu đơn giản**: [games/tug-of-war](games/tug-of-war/), ít file và luật gọn. Sau đó xem [games/coconut-climb](games/coconut-climb/) (lựa chọn riêng `prefs`, model tải về) và [games/boat-race](games/boat-race/) (chơi theo đội, nhiều tuỳ chọn).
4. Khi cần hiểu sâu phần chung: [src/rooms.js](src/rooms.js) (server), [public/js/core/host.js](public/js/core/host.js) (TV), [public/js/core/play.js](public/js/core/play.js) (điện thoại).

**Khi sửa code:**
- Làm game mới thì chỉ thêm thư mục trong `games/` (tự được nhận), hoặc nén thư mục đó để upload ở `/admin`.
- Đổi hợp đồng ở phần chung thì cập nhật [games/README.md](games/README.md) và kiểm tra **mọi game** còn chạy.
- Mỗi game có README riêng ghi luật chơi và tham số. Sửa luật thì sửa luôn README của game đó.
- Giữ đúng các quy ước ở mục 5.

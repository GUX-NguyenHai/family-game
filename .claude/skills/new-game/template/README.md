# __EMOJI__ __NAME__ (`__ID__`)

<!-- Viết lại cho game thật: cách chơi, tuỳ chọn, độ khó, bảng file, tham số chỉnh. Xem README của game khác để bắt chước. -->

Lắc điện thoại lên xuống để đổ đầy thanh của mình. Ai đầy trước thì thắng; hết giờ (30 giây) thì xếp theo mức đã đổ. Chơi cá nhân, có bot.

**Không có nút bấm:** chỉ lắc máy. Máy không có cảm biến thì không chơi được.

## Độ khó (chủ phòng chọn, mặc định Dễ)
| | 🟢 Dễ | 🟡 Trung bình | 🔴 Khó |
|---|---|---|---|
| Lắc hết sức thì đầy sau | ~8 giây | ~12 giây | ~16 giây |
| Bot | Chậm | Khá | Khoẻ |

## File
| File | Nội dung |
|---|---|
| `service/config.js` | ★ Tham số: thời gian ván (`ROUND_MS`), tốc độ đổ (`FILL_RATE` theo độ khó), vùng chết lắc (`MIN_DRIVE`) |
| `service/simulation.js` | Mô phỏng: đổ thanh theo mức lắc, kết thúc, bot, xếp hạng |
| `service/index.js` | Khai báo game, nối input (`move`) với mô phỏng, gửi trạng thái nhị phân cho TV |
| `assets/schema.json` | Định dạng trạng thái nhị phân gửi cho TV |
| `screen/index.js`, `style.css` | TV: mỗi người một thanh dọc, đồng hồ |
| `controller/index.js`, `style.css` | Điện thoại: thanh của mình + mức lắc, thử lắc ở phòng chờ |

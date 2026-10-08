# ⛷️ Trượt tuyết vượt cổng (`ski-slalom`)

Mọi người trượt chung một dốc tuyết, đi qua các cổng cờ đỏ/xanh xen kẽ trái phải. **Ít thời gian nhất (kể cả giây phạt) thì thắng.** Chơi cá nhân, có bot.

**Không có nút bấm, không cần lắc:** chỉ nghiêng điện thoại trái/phải để lái. Máy không có cảm biến nghiêng thì không chơi được.

## Cách chơi
- **Nghiêng trái/phải** để lái, nghiêng nhiều thì cua gắt. Phòng chờ có nút **"Cân chỉnh"** (lấy tư thế đang cầm làm thẳng), "Đảo chiều" và độ nhạy lái.
- **Tốc độ tự tăng** theo dốc tới tối đa. Đi càng chéo càng mất tốc, nên phải tính đường cua mượt để đi thẳng được nhiều.
- **Cổng:** đi qua giữa 2 lá cờ thì ✅, điện thoại rung nhẹ. Trượt ngoài cổng: **+3 giây phạt**, không cần quay lại.
- **Cây thông, tảng đá:** đâm vào thì ngã, nằm 1 giây rồi trượt tiếp từ chậm.
- **Lưới chắn 2 bên mép dốc:** đâm vào thì chậm lại.
- Mọi người **đi xuyên qua nhau** (không va chạm người với người), nên không ai bị chặn đường.

## Kết thúc
Khi mọi người về đích, hoặc 20 giây sau khi người đầu tiên về, tối đa 2,5 phút. Xếp hạng theo **thời gian + giây phạt**; người chưa về xếp theo quãng đường. Bảng xếp hạng trên TV hiện số giây phạt của từng người.

## Độ khó (chủ phòng chọn, mặc định Dễ)
| | 🟢 Dễ | 🟡 Trung bình | 🔴 Khó |
|---|---|---|---|
| Số cổng | 12 | 18 | 24 |
| Cổng | Rộng 6m, lệch ít | Rộng 4,8m | Hẹp 3,8m, lệch nhiều |
| Tốc độ tối đa | 10 m/s | 12 m/s | 14 m/s |
| Cây và đá | Ít, xa đường | Vừa | Nhiều, sát đường |
| Bot | Hay trượt cổng | Khá | Giỏi |

## TV
- Dốc nghiêng xuống phía xa, camera bám người dẫn đầu, thanh tiến độ ngang ở giữa phía trên.
- Người bị tụt lại có khung nhỏ ở chỗ cố định theo vị trí xuất phát (dùng chung `/js/core/mini-views.js`). Khung nhỏ vẫn thấy cổng, cây, đá phía trước để lái.

## File
| File | Nội dung |
|---|---|
| `service/config.js` | ★ Tham số: lái (`MAX_ANGLE`, `TURN_RESPONSE`), tốc độ (`ACCEL`, `TURN_DRAG`, `MAX_SPEED`), phạt (`MISS_PENALTY_MS`), ngã (`FALL_MS`), cổng và cây theo độ khó (`DIFFICULTIES`) |
| `service/simulation.js` | Mô phỏng: tạo dốc (cổng, cây tránh đường nối các cổng), trượt, qua/trượt cổng, ngã, về đích, bot, xếp hạng |
| `service/index.js` | Khai báo game, nối input (`steer`) với mô phỏng, gửi trạng thái nhị phân cho TV |
| `assets/schema.json` | Định dạng trạng thái nhị phân gửi cho TV |
| `assets/i18n.json` | Chữ trong game trên TV và điện thoại, 2 thứ tiếng (vi/en) |
| `screen/scene.js` | Cảnh 3D: dốc tuyết nghiêng, cổng cờ, cây, đá, người trượt trên ván, khung nhỏ |
| `screen/index.js` | Bảng xếp hạng (giây phạt), thanh tiến độ ngang |
| `controller/index.js` | Tay cầm không nút: mũi tên hướng lái, số cổng, giây phạt, thử nghiêng + cân chỉnh ở phòng chờ |

Phím `Y` trên TV xoay model con vật 90° nếu con vật trượt sai hướng.

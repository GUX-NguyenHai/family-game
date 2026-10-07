# 🌴 Leo cây hái dừa (`coconut-climb`)

Mỗi người chọn một chú khỉ và một cây dừa. Lắc máy để leo, **ngừng lắc là tụt xuống**. Ai lên ngọn hái dừa trước thì thắng.

## Luật
- **Leo:** tốc độ leo = (mức lắc)^`CLIMB_CURVE`. Lắc nhẹ chỉ nhích từng chút, phải lắc khoẻ mới leo nhanh. Lắc dưới `MIN_DRIVE` coi như không lắc, sẽ bị tụt.
- **Đoạn thân trơn** (rêu xanh): phải lắc mạnh hơn `SLIP_NEED` mới leo được. Yếu hơn thì trượt xuống, càng yếu trượt càng nhanh.
- **Kết thúc:** khi ai cũng đã lên ngọn, hoặc hết 45 giây, hoặc 12 giây sau khi người đầu tiên lên ngọn. Ai chưa lên thì xếp theo độ cao.
- **Chọn khỉ:** ở phòng chờ trên điện thoại (`prefs.figure`). Chưa chọn thì được gán sẵn theo id người chơi (cùng một hàm trong `service/index.js`, `screen/index.js`, `controller/index.js`). Quanh thân cây có vòng dây màu của người chơi để phân biệt.
- **Mỗi lần bắt đầu là 1 ván.** Có bot (bot yếu thỉnh thoảng nghỉ tay).

## Độ khó
| | 🟢 Dễ | 🟡 Trung bình | 🔴 Khó |
|---|---|---|---|
| Cây cao | 14m | 18m | 22m |
| Số đoạn trơn (`SLIP_ZONES`) | 2 | 3 | 4 |
| Phải lắc vượt (`SLIP_NEED`) | 35% | 45% | 55% |
| Tụt khi ngừng lắc (`SLIDE`) | 0,35 m/s | 0,5 m/s | 0,7 m/s |
| Độ nặng tay (`DRIVE_GAIN`) | 0.9 | 0.7 | 0.55 |

`SLIP_ZONES` ghi các đoạn `[bắt đầu, kết thúc]`, tính theo phần chiều cao cây (0 = gốc, 1 = ngọn).

## Khỉ (`assets/figures.json`)
Mỗi con có: `id`, `name`, `emoji`, `file` (model trong `assets/models/figure/`), `yaw` (xoay thêm nếu model quay sai hướng), `size` (chiều cao khi leo, mét).
- Model **đứng thẳng** thì giữ dáng, quay mặt vào thân cây. Model **bò 4 chân** thì được dựng đứng lên.
- Có hoạt ảnh leo/chạy/đi thì dùng, không có thì khỉ tự nhún theo nhịp lắc.
- Khỉ quay sai hướng: bấm `Y` trên TV để xoay thử 90°, đúng rồi thì ghi số hiện ra vào `yaw`.
- Thêm khỉ: chép `.glb` vào `assets/models/figure/`, thêm một dòng vào `figures.json`, ghi nguồn vào `assets/models/CREDITS.md`.

## File
| File | Nội dung |
|---|---|
| `service/config.js` | ★ Tham số leo, tụt, đoạn trơn, độ khó |
| `service/simulation.js` | Mô phỏng: leo, tụt, đoạn trơn, lên ngọn, bot |
| `service/index.js` | Khai báo game, chọn khỉ cho từng người |
| `screen/scene.js` | Cảnh bãi biển 3D: thân cây tự dựng (có khúc rêu), tán lá, chùm dừa (`coconut.glb`), cây dừa trang trí (`palm-tree.glb`), khỉ ôm thân cây |
| `controller/index.js` | Tay cầm: chọn khỉ, thanh "cây" dọc có các khúc rêu, cảnh báo khi đang trượt |

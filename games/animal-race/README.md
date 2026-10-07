# 🏁 Đua thú (`animal-race`)

Đường đua 3D, mỗi người một con vật (avatar chọn lúc vào phòng), **mỗi con chạy thẳng trong làn riêng**. Ai về đích trước thì thắng.

**Không có nút bấm:** chỉ điều khiển bằng cử động điện thoại. Máy không có cảm biến chuyển động thì không chơi được.

## Cách chơi (trên điện thoại)

| Cử động | Tác dụng |
|---|---|
| **Lắc máy lên xuống** | **Không lắc thì đứng yên.** Lắc càng nhanh và mạnh thì càng nhanh. Dừng tay thì chậm dần rồi dừng sau khoảng 1 giây. Lắc ngang không tính. Tốc độ **tăng dần**: từ đứng yên lên tối đa mất ~2,4 giây |
| **Hất đầu máy về phía mình** (như giật cương) hoặc **giật mạnh cả máy lên** | Nhảy qua rào và bùn. Chỉnh độ nhạy ở phòng chờ ("Độ nhạy nhảy"). Giật máy lên phải mạnh hơn hẳn lúc đang lắc chạy |
| 🚧 Rào | Đâm vào thì dừng hẳn, khựng lại, rồi tăng tốc lại từ 0 |
| 🟫 Bùn | Chạy chậm lại, trừ khi nhảy qua |

**Công bằng giữa các làn:** rào và bùn xếp thành **hàng ngang**, mọi làn gặp cùng loại ở cùng khoảng cách. Thứ tự vật cản ngẫu nhiên mỗi ván.

## Độ khó (chủ phòng chọn, mặc định Dễ)

| | 🟢 Dễ | 🟡 Trung bình | 🔴 Khó |
|---|---|---|---|
| Đường đua | 300m | 400m | 500m |
| Vật cản | Thưa, không có 2 hàng liền nhau | Vừa phải | Dày, hay có 2 hàng liền nhau (rào rồi bùn…), bùn to |
| Đâm rào | Khựng 0,5s | Khựng 1s | Khựng 1,5s |
| Độ nặng tay (`DRIVE_GAIN`) | 1.3: lắc nhẹ đã nhanh | 1 | 0.8: phải lắc mạnh |
| Bot | Chậm, hay quên nhảy | Khá | Nhanh, nhảy giỏi |

Tốc độ tối đa ở cả 3 mức là 19 m/s.

## File
| File | Nội dung |
|---|---|
| `service/config.js` | ★ Tham số: tốc độ (`MAX_SPEED`, `ACCEL`, `BRAKE`), bùn (`MUD_FACTOR`), rào (`STUN_MS`), nhảy (`JUMP_MS`), độ khó và mật độ vật cản (`DIFFICULTIES`) |
| `service/simulation.js` | Mô phỏng: tạo vật cản theo làn, chạy, nhảy, về đích, bot |
| `service/index.js` | Khai báo game, nối input (`move`, `jump`) với mô phỏng, gửi trạng thái nhị phân cho TV |
| `assets/schema.json` | Định dạng trạng thái nhị phân gửi cho TV |
| `screen/scene.js` | Cảnh 3D: đường đua, con vật, vật cản, camera bám đoàn dẫn đầu. **Người bị tụt lại có khung nhỏ riêng** ở 2 bên màn hình (chỉ vẽ làn của người đó, thấy rào/bùn sắp tới để canh nhảy). Mỗi người **một chỗ cố định cả ván** theo làn (làn bên trái → cột trái, làn bên phải → cột phải, từ trên xuống): tụt lại thì khung hiện đúng chỗ đó, đuổi kịp thì ẩn. Chống nhấp nháy: hiện sớm khi sắp chạm mép dưới, chỉ ẩn khi đã vào hẳn cảnh chính (~9m) và đã hiện ít nhất 3 giây; lúc ẩn khung phủ màu dần kèm ⬆, rồi con vật đó được đánh dấu (vòng sáng + mũi tên) 2 giây ở cảnh chính. Đồ hoạ Thấp vẽ tối đa 4 khung cùng lúc; quá đông không đủ chỗ thì người không có khung chỉ hiện nhãn tên ở mép dưới. Phần chia chỗ/vẽ khung dùng chung: `/js/core/mini-views.js` |
| `screen/index.js` | Bảng xếp hạng, thanh tiến độ ngang ở giữa phía trên |
| `controller/index.js` | Tay cầm không nút: thanh lắc, khung lớn nháy khi nhảy, thử cảm biến ở phòng chờ |

Phím `Y` trên TV xoay model con vật 90° nếu con vật chạy sai hướng. Ghi số hiện ra vào `modelYaw` trong `public/assets/animals.json`.

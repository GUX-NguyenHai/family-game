# 🏁 Đua thú (`animal-race`)

Đường đua 3D, mỗi người một con vật (avatar chọn lúc vào phòng), **mỗi con chạy thẳng trong làn riêng**. Ai về đích trước thì thắng.

## Cách chơi (trên điện thoại)

| Thao tác | Tác dụng |
|---|---|
| **Lắc máy lên xuống** | **Không lắc thì đứng yên.** Lắc càng nhanh và mạnh thì càng nhanh. Dừng tay thì chậm dần rồi dừng sau khoảng 1 giây. Lắc ngang không tính. Tốc độ **tăng dần**: từ đứng yên lên tối đa mất ~2,4 giây |
| **Hất đầu máy về phía mình** (như giật cương), **giật mạnh cả máy lên**, hoặc bấm **NHẢY** | Nhảy qua rào và bùn. Chỉnh độ nhạy hoặc tắt cử chỉ ở phòng chờ ("Nhảy bằng cử chỉ"). Giật máy lên phải mạnh hơn hẳn lúc đang lắc chạy |
| Nút **PHI!** (TURBO) | Có năng lượng là bấm được, bấm 1 lần là đủ. Nhanh hơn 40% và lướt qua bùn. Năng lượng **tụt dần** trong lúc TURBO: đầy 100% dùng được 5 giây. Đâm rào thì mất TURBO |
| ⚡ Năng lượng | **Chỉ tăng khi đang chạy.** Chạy nhanh thì đầy sau khoảng 12 giây, đứng yên hoặc đang khựng thì không tăng. Đầy thì máy rung và nút PHI! nhấp nháy |
| 🚧 Rào | Đâm vào thì dừng hẳn, khựng lại, mất năng lượng, rồi tăng tốc lại từ 0 |
| 🟫 Bùn | Chạy chậm lại, trừ khi đang nhảy hoặc TURBO |
| 🥕 Cà rốt | +10% năng lượng |

**Công bằng giữa các làn:** không lái trái/phải được, nên rào, bùn và cà rốt xếp thành **hàng ngang**, mọi làn gặp cùng loại ở cùng khoảng cách. Thứ tự vật cản ngẫu nhiên mỗi ván. Không có va chạm giữa các con (`COLLIDE: false`).

## Độ khó (chủ phòng chọn, mặc định Dễ)

| | 🟢 Dễ | 🟡 Trung bình | 🔴 Khó |
|---|---|---|---|
| Đường đua | 300m | 400m | 500m |
| Vật cản | Ít rào, nhiều cà rốt | Vừa phải | Nhiều rào, bùn to, hay có 2 hàng vật cản liền nhau |
| Đâm rào | Khựng 0,5s, không mất năng lượng | Khựng 1s, −20% | Khựng 1,5s, −30% |
| Độ nặng tay (`DRIVE_GAIN`) | 1.3: lắc nhẹ đã nhanh | 1 | 0.8: phải lắc mạnh |
| Bot | Chậm, hay quên nhảy, hay phí TURBO | Khá | Nhanh, nhảy giỏi, dùng TURBO khôn |

Tốc độ tối đa ở cả 3 mức là 19 m/s.

## File
| File | Nội dung |
|---|---|
| `service/config.js` | ★ Tham số: tốc độ (`MAX_SPEED`, `ACCEL`, `BRAKE`), năng lượng (`MANA_FILL_MS`, `CARROT_MANA`, `TURBO_MS`, `TURBO_FACTOR`), nhảy (`JUMP_MS`), độ khó (`DIFFICULTIES`) |
| `service/simulation.js` | Mô phỏng: tạo vật cản theo làn, chạy, nhảy, năng lượng, về đích, bot |
| `service/index.js` | Khai báo game, nối input (`move`, `turbo`, `jump`) với mô phỏng |
| `screen/scene.js` | Cảnh 3D: đường đua, con vật, vật cản, camera bám đoàn dẫn đầu (con tụt lại chỉ hiện nhãn tên ở mép dưới) |
| `screen/minimap.js` | Bản đồ nhỏ góc dưới phải |
| `controller/index.js` | Tay cầm: nút PHI! và NHẢY, thử cảm biến ở phòng chờ |

Phím `Y` trên TV xoay model con vật 90° nếu con vật chạy sai hướng. Ghi số hiện ra vào `modelYaw` trong `public/assets/animals.json`.

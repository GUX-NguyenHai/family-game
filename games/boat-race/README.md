# 🚣 Đua thuyền (`boat-race`)

Lắc máy lên xuống để chèo: lắc nhanh thì đi nhanh, ngừng lắc thì thuyền chậm dần rồi dừng. Một ván khoảng 45–60 giây.

## Tuỳ chọn (chủ phòng chọn)
| Tuỳ chọn | Giá trị |
|---|---|
| **Chế độ** | 👤 Thi đơn: mỗi người một thuyền · 👥 Theo đội: mỗi đội **2–4 người** chung một thuyền, ít nhất 2 đội |
| **Kiểu đua** | **Basic:** đường thẳng, mỗi thuyền một làn, không vật cản, chỉ lắc · **Pro:** nghiêng máy để lái, có khúc gỗ và đảo hải đăng, thuyền đâm nhau thì bị đẩy ra và chậm lại. Đây là kiểu đua, không liên quan gói trả phí Pro |
| **Độ khó** | Dễ / Trung bình / Khó: sông 380 / 440 / 500m, độ nặng tay khi lắc, mật độ vật cản (kiểu Pro), độ giỏi của bot |

## Luật
- **Theo đội:** tốc độ thuyền = **trung bình mức lắc** của cả đội. Kiểu Pro thì hướng lái = **trung bình độ nghiêng** của cả đội. Một người lười là cả thuyền chậm.
- **Khúc gỗ:** đâm vào thì khựng lại và mất gần hết tốc độ.
- **Đảo hải đăng:** chắn gần nửa lòng sông. Mũi thuyền chạm đảo là dừng, phải lái sang bên mới đi tiếp.
- **Chọn thuyền:** ở phòng chờ trên điện thoại (`prefs.boat`). Chỉ khác hình. Theo đội thì dùng thuyền của đội trưởng (người đầu tiên của đội).
- **Kết thúc:** khi mọi thuyền về đích, hoặc 15 giây sau khi thuyền đầu tiên về.

## File
| File | Nội dung |
|---|---|
| `service/config.js` | ★ Tham số: `MAX_SPEED`, `ACCEL`, `DRAG`, `LATERAL_SPEED`, kích thước thuyền, khúc gỗ (`LOG_*`), va chạm (`BUMP_*`), `DIFFICULTIES` |
| `service/simulation.js` | Mô phỏng: chia thuyền (đơn/đội), làn, vật cản, va chạm, bot |
| `service/index.js` | Khai báo game (tuỳ chọn `mode`, `course`, `difficulty`; `teams.enabled` khi `mode === 'team'`) |
| `screen/scene.js` | Cảnh sông 3D, thuyền tô màu người chơi hoặc đội, con vật ngồi trên thuyền động tay theo mức chèo của từng người. **Thuyền bị tụt lại có khung nhỏ riêng** ở 2 bên màn hình, mỗi thuyền một chỗ cố định cả ván theo làn xuất phát (camera bám đuôi thuyền, vẫn thấy khúc gỗ/đảo/thuyền khác ở gần). Hiện sớm, ẩn muộn, giữ ít nhất 3 giây; lúc ẩn phủ màu dần rồi thuyền được đánh dấu 2 giây ở cảnh chính (giống Đua thú) |
| `screen/index.js` | Bảng xếp hạng, thanh tiến độ ngang ở giữa phía trên |
| `controller/index.js` | Tay cầm: thanh chèo của mình và của đội, nút lái (kiểu Pro), chọn thuyền |
| `assets/boats.json` | Danh sách thuyền chọn được và model vật cản |
| `assets/models/` | Model thuyền, khúc gỗ, hải đăng + `CREDITS.md` |

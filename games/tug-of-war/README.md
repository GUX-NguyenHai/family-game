# 🪢 Kéo co (`tug-of-war`)

Hai đội 🔴 Đỏ và 🔵 Xanh đứng hai bên bờ sông, cầm chung một sợi dây. Lắc máy lên xuống để kéo. Đội thua bị kéo ngã xuống sông.

## Luật
- **Luôn 2 đội, mỗi đội 1–6 người, hai đội phải bằng người** (`teams: { min: 1, max: 6, count: 2, equal: true }`). Lệch người thì không bắt đầu được: thêm bot, đổi đội hoặc bấm "Chia đội ngẫu nhiên".
- **Lực của đội = trung bình mức lắc** các thành viên. Dây chạy về phía đội mạnh hơn, nhanh theo độ chênh lực (`PULL_SPEED`).
- **Thắng:** kéo dấu giữa dây qua vạch bên mình (cách giữa `WIN_DISTANCE` mét).
- **Hết giờ** (45 giây): dây lệch bên nào bên đó thắng. Dây đứng đúng giữa thì đội có tổng lực kéo cả ván lớn hơn thắng.
- **Mỗi lần bắt đầu là 1 ván.** Có đội thắng thì đội thua ngã xuống sông khoảng 3,5 giây rồi hiện bảng kết quả. Muốn đấu tiếp thì chủ phòng bấm "Chơi lại". Không cộng dồn tỉ số giữa các ván.

## Độ khó
| | 🟢 Dễ | 🟡 Trung bình | 🔴 Khó |
|---|---|---|---|
| Vạch thắng | 3m | 4m | 5m |
| Độ nặng tay (`DRIVE_GAIN`) | 1.3 | 1 | 0.8 |
| Bot | Yếu | Khá | Rất khoẻ |

## File
| File | Nội dung |
|---|---|
| `service/config.js` | ★ Tham số: `ROUND_MS`, `END_SHOW_MS`, `PULL_SPEED`, `ROPE_RESPONSE`, `WIN_DISTANCE`, `DIFFICULTIES` |
| `service/simulation.js` | Mô phỏng: lực hai đội, vị trí dây, phân thắng thua, bot |
| `service/index.js` | Khai báo game, gửi trạng thái cho TV và điện thoại |
| `screen/scene.js` | Cảnh 3D: sông giữa màn hình, hai đội hai bờ. Con vật ngả người, đi lùi khi kéo, lội nước khi bị kéo vào sông |
| `controller/index.js` | Tay cầm: vị trí dây, lực của mình, đội mình và đội kia |
| `assets/i18n.json` | Chữ trên TV và điện thoại của game (2 thứ tiếng) |

# 🛍️ Nhảy bao bố (`sack-race`)

Đường đua thẳng chia làn, mỗi con vật đứng trong một bao bố màu của người chơi. **Mỗi lần hất máy là nhảy một bước**, ai về đích trước thì thắng. Thử thách chính là **giữ nhịp**, không phải hất càng nhanh càng tốt. Chơi cá nhân, có bot.

**Không có nút bấm:** hất đầu máy về phía mình hoặc giật mạnh cả máy lên (giống nhảy ở Đua thú). Máy không có cảm biến thì không chơi được.

## Cách chơi
| Lúc hất máy | Kết quả |
|---|---|
| **Ngay sau khi đáp đất** (trong `GOOD_WINDOW_MS`) | Đúng nhịp: bước sau dài hơn bước trước (0,9m → tối đa 2,1m). Bảng xếp hạng hiện 🔥 khi đúng nhịp từ 3 lần liền |
| Chậm sau khi đáp | Vẫn nhảy, nhưng bước trở lại ngắn nhất |
| Sớm một chút trước lúc đáp (trong `EARLY_GRACE_MS`) | Được tính: tự nhảy tiếp ngay khi đáp, vẫn là đúng nhịp |
| **Quá sớm, lúc còn đang bay** | Đáp xuống bị **ngã**, nằm `FALL_MS` rồi nhảy lại từ bước ngắn nhất |

**Điện thoại rung lúc con vật đáp đất** và khung lớn nháy vàng. Cảm thấy rung là hất tiếp, không cần nhìn TV hay điện thoại. Rung được hẹn giờ trên điện thoại ngay khi bước nhảy bắt đầu, sớm hơn lúc đáp thật `LAND_CUE_LEAD_MS` để bù thời gian phản xạ.

**Kết thúc:** khi mọi người về đích, hoặc 15 giây sau khi người đầu tiên về, hoặc tối đa 2 phút. Người chưa về xếp theo quãng đường. Bảng kết quả ghi thời gian và số lần ngã.

## Độ khó (chủ phòng chọn, mặc định Dễ)
| | 🟢 Dễ | 🟡 Trung bình | 🔴 Khó |
|---|---|---|---|
| Đường đua | 40m | 60m | 80m |
| Ngã nằm | 0,8 giây | 1,2 giây | 1,6 giây |
| Hất sớm vẫn được tính (`EARLY_GRACE_MS`) | 220ms | 160ms | 100ms |
| Bot | Chậm, hay ngã | Khá | Nhanh, ít ngã |

## TV
- Camera bám nhóm dẫn đầu, thanh tiến độ ngang ở giữa phía trên, bảng xếp hạng góc trên trái.
- Người bị tụt lại có khung nhỏ ở chỗ cố định (dùng chung `/js/core/mini-views.js`, giống Đua thú).
- Bước nhảy TV vẽ theo sự kiện `hop` (bắt đầu ngay khi server nhận), nên không giật theo gói trạng thái.

## File
| File | Nội dung |
|---|---|
| `service/config.js` | ★ Tham số: bước nhảy (`HOP_MS`, `HOP_BASE`, `HOP_PER_COMBO`, `HOP_MAX`), cửa sổ nhịp (`GOOD_WINDOW_MS`, `EARLY_GRACE_MS`), ngã (`FALL_MS`), rung báo (`LAND_CUE_LEAD_MS`), độ khó (`DIFFICULTIES`) |
| `service/simulation.js` | Mô phỏng: nhảy, đúng nhịp/ngã, về đích, bot, xếp hạng |
| `service/index.js` | Khai báo game, nối input (`jump`) với mô phỏng, gửi trạng thái nhị phân cho TV, gửi `hop` cho điện thoại để hẹn giờ rung |
| `assets/schema.json` | Định dạng trạng thái nhị phân gửi cho TV |
| `assets/i18n.json` | Chữ trên TV và điện thoại của game, 2 thứ tiếng (vi, en) |
| `screen/scene.js` | Cảnh 3D: đường đua chia làn, con vật trong bao bố, nhảy/ngã, khung nhỏ |
| `screen/index.js` | Bảng xếp hạng (🔥 nhịp, 🤕 ngã), thanh tiến độ ngang |
| `controller/index.js` | Tay cầm không nút: rung lúc đáp, khung lớn nháy, thử cử chỉ nhảy ở phòng chờ |

Phím `Y` trên TV xoay model con vật 90° nếu con vật nhảy sai hướng.

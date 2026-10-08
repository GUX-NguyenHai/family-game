# 🤸 Nhảy dây (`jump-rope`)

Cả nhà nhảy chung một sợi dây dài. Hai con vật quay dây ở hai đầu, người chơi đứng thành một hàng ở giữa. **Chơi cá nhân, 1 mạng:** dây vướng chân là bị loại. Người cuối cùng còn trụ thì thắng.

**Không có nút bấm:** hất đầu máy về phía mình hoặc giật mạnh cả máy lên để nhảy (giống nhảy ở Đua thú). Máy không có cảm biến thì không chơi được.

## Cách chơi
- Dây quay từ sau lưng lên qua đầu, quét xuống trước mặt rồi **chạm đất dưới chân**. Mỗi lần chạm đất TV kêu **"tách"** để bắt nhịp.
- Phải đang ở trên không đúng lúc dây chạm đất. Nhảy sớm quá thì đáp xuống trước khi dây tới, trễ quá thì dây đã vướng chân.
- Nhảy xong phải chờ một chút mới nhảy tiếp được, nên hất máy liên tục không qua được, phải canh nhịp.

## Màn chơi
Mỗi màn 30 giây. Hết giờ mà còn từ 2 người thì nghỉ 3 giây (TV hiện "MÀN 2 – …") rồi sang màn khó hơn.

| Màn | Dây quay |
|---|---|
| 1 | Chậm, nhịp đều (1,6 giây/vòng) |
| 2 | Nhanh hơn (1,25 giây/vòng) |
| 3 | Lúc nhanh lúc chậm: đổi nhịp bất ngờ sau mỗi 2–4 vòng |
| 4 | Có lúc dừng hẫng: dây chậm hẳn lại trên đầu rồi quay tiếp |
| 5 | Nhanh, đổi nhịp, dừng hẫng |
| 6–8 | Như màn 5, mỗi màn nhanh thêm |

Đổi nhịp và dừng hẫng chỉ xảy ra **lúc dây ở trên đầu**, để người chơi kịp thấy trước nửa vòng.

## Kết thúc và xếp hạng
- **Chỉ còn 1 người:** người đó thắng, ván dừng ngay.
- **Những người cuối cùng vướng cùng một vòng dây:** đồng hạng nhất.
- **Qua hết màn 8 mà còn nhiều người:** những người còn lại cùng hạng nhất.
- **Chơi một mình:** chơi đến khi vướng dây. Kết quả ghi màn đạt được.
- Người bị loại sau đứng trên người bị loại trước. Bảng kết quả ghi màn bị vướng và số lần nhảy qua.

## Độ khó (chủ phòng chọn)
Độ khó quyết định **bắt đầu từ màn nào**: 🟢 Dễ từ màn 1, 🟡 Trung bình từ màn 2, 🔴 Khó từ màn 3. Bot ở mức khó hụt ít hơn.

## Chấm nhảy (server)
Dây chạm đất lúc `T`. Người chơi qua nếu có một lần nhảy mà **server nhận được** trong khoảng `[T - SAFE_BEFORE_MS, T + SAFE_AFTER_MS]`.
- `SAFE_AFTER_MS` bù độ trễ: cảm biến cần một chút để nhận ra cử chỉ, tin còn phải đi qua mạng, TV cũng vẽ chậm hơn server một chút.
- Thấy hay bị loại oan dù nhảy đúng nhịp trên TV thì **tăng `SAFE_AFTER_MS`**. Thấy dễ quá thì giảm `SAFE_BEFORE_MS`.
- TV không vẽ theo từng gói tin: nó tự quay dây theo `rev` (số vòng) + `rate` (tốc độ) server gửi, nên dây và tiếng "tách" khớp nhịp server dùng để chấm.

## File
| File | Nội dung |
|---|---|
| `service/config.js` | ★ Tham số: thời gian màn (`LEVEL_MS`, `BREAK_MS`, `MAX_LEVEL`), cửa sổ chấm nhảy (`SAFE_BEFORE_MS`, `SAFE_AFTER_MS`, `JUMP_COOLDOWN_MS`), cách quay dây và tên từng màn (`LEVELS`, `FASTER_TITLE`), độ khó (`DIFFICULTIES`) |
| `service/simulation.js` | Mô phỏng: quay dây, đổi nhịp/dừng hẫng, chấm từng lần dây chạm đất, màn chơi, bot, xếp hạng |
| `service/index.js` | Khai báo game, nối input (`jump`) với mô phỏng, gửi trạng thái nhị phân cho TV |
| `assets/schema.json` | Định dạng trạng thái nhị phân gửi cho TV |
| `assets/i18n.json` | Chữ trên TV và điện thoại của game (2 thứ tiếng vi/en). Tên các màn nằm ở `LEVELS[].title` trong `service/config.js` |
| `screen/scene.js` | Cảnh 3D: sân, 2 cột + 2 con vật quay dây, hàng người nhảy, người vướng dây ngã rồi ra đứng xem phía sau |
| `screen/index.js` | Bảng màn chơi giữa phía trên, chữ lớn lúc nghỉ giữa màn, tiếng "tách" |
| `controller/index.js` | Tay cầm không nút: khung lớn nháy khi nhảy, thử cử chỉ nhảy ở phòng chờ |

Phím `Y` trên TV xoay model người nhảy 90° (chỉ để thử) nếu con vật không quay mặt ra người xem.

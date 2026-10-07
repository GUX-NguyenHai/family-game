// Tham số luật chơi Đua thú. Đơn vị: mét, giây, mili-giây.
// Chỉ điều khiển bằng cử động điện thoại: lắc lên xuống để chạy, hất đầu máy / giật máy lên để nhảy. Không có nút bấm.
// Lưu ý: các tham số có trong DIFFICULTIES (cuối file) sẽ bị ghi đè theo độ khó phòng chọn.
module.exports = {
  TICK_HZ: 30,
  HOST_UPDATE_EVERY: 2, // gửi trạng thái cho TV mỗi 2 tick (~15 lần/giây; TV tự nội suy cho mượt)
  PLAYER_UPDATE_EVERY: 3, // gửi trạng thái riêng cho điện thoại mỗi 3 tick (~10 lần/giây)

  TRACK_LEN: 400,
  COUNTDOWN_MS: 3000,
  FINISH_TIMEOUT_MS: 20000, // sau khi con đầu tiên về đích, chờ tối đa bấy nhiêu
  COAST_MS: 4000, // sau khi kết thúc, tiếp tục cho con vật chạy chậm lại rồi dừng loop

  // Điều khiển tốc độ: điện thoại gửi liên tục mức lắc lên xuống (0..1). Không lắc = đứng yên,
  // lắc càng nhanh/mạnh càng chạy nhanh. Tốc độ thật tăng/giảm dần theo tốc độ mục tiêu.
  MAX_SPEED: 19, // m/s khi lắc hết cỡ
  DRIVE_GAIN: 1, // nhân mức lắc (độ khó chỉnh: dễ thì lắc nhẹ đã nhanh)
  MOVE_STALE_MS: 400, // quá lâu không nhận mức lắc (mất mạng, tắt màn hình) thì coi như dừng
  MIN_DRIVE: 0.12, // lắc nhẹ hơn mức này (rung tay khi cầm yên) coi như đứng yên hẳn
  ACCEL: 8, // tăng tốc (m/s²): từ 0 lên tối đa ~2,4 giây
  BRAKE: 25, // giảm tốc (m/s²): ngừng lắc / vào bùn thì chậm lại nhanh (~0,8 giây là dừng)

  MUD_FACTOR: 0.4, // lội bùn: tốc độ còn bấy nhiêu phần (nhảy qua thì không sao)
  STUN_MS: 1000, // đâm rào: dừng hẳn, khựng bấy lâu rồi tăng tốc lại từ 0
  JUMP_MS: 900,
  JUMP_COOLDOWN_MS: 400,

  BODY_HALF_WIDTH: 0.45,
  BODY_HALF_LEN: 0.9,

  // Độ khó: chủ phòng chọn cho cả phòng. Mỗi mức ghi đè các tham số ở trên.
  // Tốc độ tối đa luôn 19 m/s; DRIVE_GAIN quyết định lắc nặng hay nhẹ tay.
  // label + desc hiện trên màn hình chọn độ khó.
  DEFAULT_DIFFICULTY: 'easy',
  DIFFICULTIES: {
    easy: {
      label: '🟢 Dễ',
      desc: 'Đường 300m, lắc nhẹ đã chạy nhanh, ít rào, đâm rào khựng ngắn, bot chậm. Hợp với trẻ nhỏ.',
      TRACK_LEN: 300,
      DRIVE_GAIN: 1.3,
      STUN_MS: 500,
      // fence: tỉ lệ hàng rào (còn lại là bùn); pairChance: thêm 1 hàng vật cản ngay sau; gapMin/gapMax: khoảng cách giữa các hàng
      OBSTACLES: { fence: 0.45, pairChance: 0, mudScale: 0.85, gapMin: 26, gapMax: 40 },
      BOT: { skillMin: 0.3, skillMax: 0.5 },
    },
    normal: {
      label: '🟡 Trung bình',
      desc: 'Đường 400m, rào và bùn vừa phải, bot khá.',
      TRACK_LEN: 400,
      DRIVE_GAIN: 1,
      STUN_MS: 1000,
      OBSTACLES: { fence: 0.5, pairChance: 0.35, mudScale: 1, gapMin: 20, gapMax: 34 },
      BOT: { skillMin: 0.45, skillMax: 0.9 },
    },
    hard: {
      label: '🔴 Khó',
      desc: 'Đường 500m, phải lắc mạnh, nhiều rào và bùn to, đâm rào khựng lâu, bot rất giỏi.',
      TRACK_LEN: 500,
      DRIVE_GAIN: 0.8,
      STUN_MS: 1500,
      OBSTACLES: { fence: 0.55, pairChance: 0.6, mudScale: 1.3, gapMin: 16, gapMax: 28 },
      BOT: { skillMin: 0.75, skillMax: 1 },
    },
  },
};

// Tham số luật chơi Đua thú. Đơn vị: mét, giây, mili-giây.
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
  MANA_MIN_SPEED: 1.5, // m/s: chạy chậm hơn mức này thì mana không tăng
  ACCEL: 8, // tăng tốc (m/s²): từ 0 lên tối đa ~2,4 giây
  TURBO_ACCEL_MULT: 2, // đang TURBO thì vọt lên nhanh gấp đôi
  BRAKE: 25, // giảm tốc (m/s²): ngừng lắc / vào bùn thì chậm lại nhanh (~0,8 giây là dừng)

  // Năng lượng (mana) + TURBO: có mana là bấm PHI! được, bấm là dùng hết mana đang có.
  MANA_FILL_MS: 12000, // đầy từ 0 → 100% trong bấy nhiêu khi đang chạy đủ nhanh
  MANA_FULL_RATE_AT: 0.6, // chạy từ 60% tốc độ tối đa trở lên thì mana tăng đủ tốc; chậm hơn tăng chậm theo tỉ lệ, đứng yên không tăng
  CARROT_MANA: 0.1, // ăn cà rốt +10%
  FENCE_MANA_LOSS: 0.2, // đâm rào -20%
  TURBO_MS: 5000, // bấm PHI! 1 lần là TURBO, mana tụt dần: đầy 100% thì cạn sau bấy nhiêu (ít mana thì ngắn hơn)
  TURBO_FACTOR: 1.4, // nhanh hơn 40%, lướt qua bùn
  TURBO_MIN_DRIVE: 0.7, // đang TURBO thì dù không lắc vẫn chạy ít nhất 70% tốc độ tối đa (rồi ×1,4)

  MUD_FACTOR: 0.4,
  STUN_MS: 1000,
  JUMP_MS: 900,
  JUMP_COOLDOWN_MS: 400,

  BODY_HALF_WIDTH: 0.45,
  BODY_HALF_LEN: 0.9,

  // Va chạm giữa các con vật: đẩy nhau sang ngang, tông đuôi thì không xuyên qua được.
  // Tắt vì giờ mỗi con chạy thẳng trong làn riêng (không lái trái/phải), không bao giờ chạm nhau.
  COLLIDE: false,
  BUMP_PUSH: 0.35, // mỗi tick gỡ bấy nhiêu phần chồng lấn (càng lớn càng bật mạnh)
  TURBO_PUSH_SHARE: 0.85, // con đang TURBO hất con kia: con kia chịu 85% lực đẩy
  BUMP_FX_GAP_MS: 700, // mỗi con tối đa 1 hiệu ứng va chạm trong khoảng này
  BUMP_SLOW_FACTOR: 0.4, // va nhau thì chậm lại như lội bùn (con đang TURBO không bị)
  BUMP_SLOW_MS: 500, // chậm tiếp bấy nhiêu sau khi hết chạm nhau

  // Độ khó: chủ phòng chọn cho cả phòng. Mỗi mức ghi đè các tham số ở trên.
  // Tốc độ tối đa luôn 19 m/s; DRIVE_GAIN quyết định lắc nặng hay nhẹ tay.
  // label + desc hiện trên màn hình chọn độ khó.
  DEFAULT_DIFFICULTY: 'easy',
  DIFFICULTIES: {
    easy: {
      label: '🟢 Dễ',
      desc: 'Đường 300m, lắc nhẹ đã chạy nhanh, ít rào, nhiều cà rốt, bot chậm. Hợp với trẻ nhỏ.',
      TRACK_LEN: 300,
      DRIVE_GAIN: 1.3,
      STUN_MS: 500,
      FENCE_MANA_LOSS: 0,
      BUMP_SLOW_FACTOR: 0.7,
      BUMP_SLOW_MS: 300,
      // mud/fence: tỉ lệ loại vật cản (phần còn lại là cà rốt); pairChance: 2 vật cản cạnh nhau
      OBSTACLES: { mud: 0.35, fence: 0.3, pairChance: 0, extraCarrot: 0.5, mudScale: 0.85, gapMin: 22, gapMax: 36 },
      // skill: tay nghề bot; turboMin/turboRate: dùng TURBO sớm khi có từ turboMin mana, xác suất mỗi giây
      BOT: { skillMin: 0.3, skillMax: 0.5, turboMin: 0.3, turboRate: 0.6 },
    },
    normal: {
      label: '🟡 Trung bình',
      desc: 'Đường 400m, vật cản vừa phải, bot khá.',
      TRACK_LEN: 400,
      DRIVE_GAIN: 1,
      STUN_MS: 1000,
      FENCE_MANA_LOSS: 0.2,
      BUMP_SLOW_FACTOR: 0.4,
      BUMP_SLOW_MS: 500,
      OBSTACLES: { mud: 0.4, fence: 0.4, pairChance: 0.35, extraCarrot: 0.3, mudScale: 1, gapMin: 18, gapMax: 32 },
      BOT: { skillMin: 0.45, skillMax: 0.9, turboMin: 0.5, turboRate: 0.3 },
    },
    hard: {
      label: '🔴 Khó',
      desc: 'Đường 500m, phải lắc mạnh, nhiều rào và bùn to, phạt nặng, bot rất giỏi.',
      TRACK_LEN: 500,
      DRIVE_GAIN: 0.8,
      STUN_MS: 1500,
      FENCE_MANA_LOSS: 0.3,
      BUMP_SLOW_FACTOR: 0.4,
      BUMP_SLOW_MS: 900,
      OBSTACLES: { mud: 0.4, fence: 0.48, pairChance: 0.6, extraCarrot: 0.15, mudScale: 1.3, gapMin: 14, gapMax: 26 },
      BOT: { skillMin: 0.75, skillMax: 1, turboMin: 1, turboRate: 0 },
    },
  },
};

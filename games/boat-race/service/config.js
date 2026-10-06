// Tham số luật chơi Đua thuyền. Đơn vị: mét, giây, mili-giây.
// Các tham số trong DIFFICULTIES (cuối file) ghi đè theo độ khó phòng chọn.
module.exports = {
  TICK_HZ: 30,
  PLAYER_UPDATE_EVERY: 3, // gửi trạng thái riêng cho điện thoại ~10 lần/giây
  COUNTDOWN_MS: 3000,
  FINISH_TIMEOUT_MS: 15000, // thuyền đầu tiên về đích rồi, chờ các thuyền khác tối đa bấy nhiêu
  COAST_MS: 3000, // kết thúc rồi vẫn cho thuyền trôi chậm lại

  // Chèo = lắc lên xuống như Đua thú: không lắc thì thuyền chậm dần rồi dừng, lắc càng nhanh càng đi nhanh.
  // Chơi theo đội: mức chèo của thuyền = trung bình mức lắc của cả đội.
  MAX_SPEED: 12, // m/s khi chèo hết cỡ (đường ~440m ≈ 45–60 giây)
  DRIVE_GAIN: 1,
  MOVE_STALE_MS: 400, // quá lâu không nhận mức lắc thì coi như ngừng chèo
  MIN_DRIVE: 0.12, // lắc nhẹ hơn mức này (rung tay) coi như không chèo
  ACCEL: 5, // tăng tốc (m/s²): nước nặng hơn đất nên vọt chậm hơn Đua thú
  DRAG: 6, // giảm tốc khi chèo yếu đi/ngừng chèo (m/s²)

  // Kiểu Pro: nghiêng để lái, có vật cản.
  LATERAL_SPEED: 4.5, // m/s khi nghiêng hết cỡ
  BOAT_HALF_WIDTH: 0.7,
  BOAT_HALF_LEN_BASE: 1.3, // nửa chiều dài thuyền = BASE + PER_SEAT × số người trên thuyền
  BOAT_HALF_LEN_PER_SEAT: 0.35,
  LANE_WIDTH: 3.6, // kiểu Basic: mỗi thuyền một làn
  LOG_STUN_MS: 900, // đâm khúc gỗ: khựng lại bấy lâu
  LOG_SLOW: 0.25, // đâm khúc gỗ: tốc độ còn lại bấy nhiêu phần
  ISLAND_BUMP_GAP_MS: 800, // đâm đảo hải đăng: hiệu ứng tối đa 1 lần trong khoảng này

  // Thuyền đâm nhau (kiểu Pro): đẩy sang hai bên và cùng chậm lại.
  BUMP_PUSH: 0.35,
  BUMP_SLOW_FACTOR: 0.5,
  BUMP_SLOW_MS: 500,
  BUMP_FX_GAP_MS: 700,

  DEFAULT_DIFFICULTY: 'easy',
  DIFFICULTIES: {
    easy: {
      label: '🟢 Dễ',
      desc: 'Sông 380m, lắc nhẹ đã đi nhanh, ít vật cản (kiểu Pro), bot chậm.',
      TRACK_LEN: 380,
      DRIVE_GAIN: 1.3,
      // log/island: tỉ lệ loại vật cản; gapMin/gapMax: khoảng cách giữa 2 cụm vật cản; pairChance: 2 khúc gỗ cạnh nhau
      OBSTACLES: { island: 0.3, gapMin: 30, gapMax: 45, pairChance: 0 },
      BOT: { skillMin: 0.3, skillMax: 0.5 },
    },
    normal: {
      label: '🟡 Trung bình',
      desc: 'Sông 440m, vật cản vừa phải (kiểu Pro), bot khá.',
      TRACK_LEN: 440,
      DRIVE_GAIN: 1,
      OBSTACLES: { island: 0.35, gapMin: 24, gapMax: 36, pairChance: 0.3 },
      BOT: { skillMin: 0.45, skillMax: 0.85 },
    },
    hard: {
      label: '🔴 Khó',
      desc: 'Sông 500m, phải lắc mạnh, nhiều vật cản (kiểu Pro), bot giỏi.',
      TRACK_LEN: 500,
      DRIVE_GAIN: 0.8,
      OBSTACLES: { island: 0.4, gapMin: 18, gapMax: 28, pairChance: 0.55 },
      BOT: { skillMin: 0.75, skillMax: 1 },
    },
  },
};

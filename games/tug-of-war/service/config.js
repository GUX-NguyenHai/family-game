// Tham số luật chơi Kéo co. Đơn vị: mét, giây, mili-giây.
// Các tham số trong DIFFICULTIES (cuối file) ghi đè theo độ khó phòng chọn.
module.exports = {
  TICK_HZ: 30,
  PLAYER_UPDATE_EVERY: 3, // gửi trạng thái riêng cho điện thoại ~10 lần/giây
  COUNTDOWN_MS: 3000,
  COAST_MS: 2500, // hiện bảng kết quả rồi vẫn chạy thêm cho cảnh ăn mừng

  // Mỗi lần bắt đầu chỉ đấu 1 ván; muốn đấu tiếp thì chủ phòng bấm "Chơi lại".
  ROUND_MS: 45000, // hết giờ mà chưa ai kéo qua vạch: dây lệch về bên nào, bên đó thắng
  END_SHOW_MS: 3500, // có đội thắng rồi, xem đội thua rơi xuống sông bấy lâu mới hiện bảng kết quả

  // Lắc lên xuống để kéo. Lực của đội = trung bình mức lắc của các thành viên (0..1).
  DRIVE_GAIN: 1,
  MOVE_STALE_MS: 400, // quá lâu không nhận mức lắc thì coi như ngừng kéo
  MIN_DRIVE: 0.12, // lắc nhẹ hơn mức này (rung tay) coi như không kéo
  PULL_SPEED: 2, // m/s dây chạy khi một đội kéo hết sức còn đội kia buông tay
  ROPE_RESPONSE: 3, // dây đổi tốc độ nhanh cỡ nào (lớn = giật cục, nhỏ = ì)
  WIN_DISTANCE: 4, // kéo dấu giữa dây qua bấy nhiêu mét về phía mình thì thắng ván
  RIVER_HALF: 2, // nửa bề rộng con sông ở giữa (chỉ để vẽ)

  DEFAULT_DIFFICULTY: 'easy',
  DIFFICULTIES: {
    easy: {
      label: '🟢 Dễ',
      desc: 'Vạch thắng gần (3m), lắc nhẹ đã kéo khoẻ, bot yếu.',
      DRIVE_GAIN: 1.3,
      WIN_DISTANCE: 3,
      BOT: { skillMin: 0.3, skillMax: 0.5 },
    },
    normal: {
      label: '🟡 Trung bình',
      desc: 'Vạch thắng 4m, bot khá.',
      DRIVE_GAIN: 1,
      WIN_DISTANCE: 4,
      BOT: { skillMin: 0.45, skillMax: 0.85 },
    },
    hard: {
      label: '🔴 Khó',
      desc: 'Vạch thắng xa (5m), phải lắc mạnh, bot rất khoẻ.',
      DRIVE_GAIN: 0.8,
      WIN_DISTANCE: 5,
      BOT: { skillMin: 0.75, skillMax: 1 },
    },
  },
};

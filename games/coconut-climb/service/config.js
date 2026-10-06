// Tham số luật chơi Leo cây hái dừa. Đơn vị: mét, giây, mili-giây.
// Các tham số trong DIFFICULTIES (cuối file) ghi đè theo độ khó phòng chọn.
module.exports = {
  TICK_HZ: 30,
  PLAYER_UPDATE_EVERY: 3, // gửi trạng thái riêng cho điện thoại ~10 lần/giây
  COUNTDOWN_MS: 3000,
  ROUND_MS: 45000, // hết giờ thì ai chưa lên ngọn xếp theo độ cao
  FINISH_TIMEOUT_MS: 12000, // người đầu tiên lên ngọn rồi, chờ những người khác tối đa bấy nhiêu
  COAST_MS: 3000, // hiện bảng kết quả rồi vẫn chạy thêm cho cảnh ăn mừng

  // Lắc lên xuống để leo: lắc càng mạnh/nhanh leo càng nhanh. Ngừng lắc thì từ từ tụt xuống.
  DRIVE_GAIN: 1,
  MOVE_STALE_MS: 400, // quá lâu không nhận mức lắc thì coi như ngừng lắc
  MIN_DRIVE: 0.12, // lắc nhẹ hơn mức này (rung tay) coi như không lắc
  MAX_CLIMB: 1.6, // m/s khi lắc hết cỡ
  SLIDE: 0.5, // m/s tụt xuống khi ngừng lắc
  ACCEL: 4, // tốc độ leo/tụt đổi dần (m/s²) cho mượt

  // Đoạn thân trơn (rêu) giữa cây: lắc mạnh hơn SLIP_NEED mới leo được, yếu hơn thì trượt (càng yếu trượt càng nhanh).
  SLIP_START: 0.42, // bắt đầu ở bấy nhiêu phần chiều cao cây
  SLIP_END: 0.6,
  SLIP_NEED: 0.45,
  SLIP_SLIDE: 1.2, // m/s trượt khi đứng trên đoạn trơn mà không lắc
  SLIP_CLIMB: 0.75, // trên đoạn trơn leo chậm hơn bình thường bấy nhiêu lần

  DEFAULT_DIFFICULTY: 'easy',
  DIFFICULTIES: {
    easy: {
      label: '🟢 Dễ',
      desc: 'Cây 14m, lắc nhẹ đã leo nhanh, tụt chậm, đoạn trơn ngắn, bot yếu.',
      HEIGHT: 14,
      DRIVE_GAIN: 1.3,
      SLIDE: 0.35,
      SLIP_START: 0.45,
      SLIP_END: 0.55,
      SLIP_NEED: 0.35,
      SLIP_SLIDE: 0.9,
      BOT: { skillMin: 0.3, skillMax: 0.5 },
    },
    normal: {
      label: '🟡 Trung bình',
      desc: 'Cây 18m, đoạn trơn vừa, bot khá.',
      HEIGHT: 18,
      DRIVE_GAIN: 1,
      BOT: { skillMin: 0.45, skillMax: 0.85 },
    },
    hard: {
      label: '🔴 Khó',
      desc: 'Cây 22m, phải lắc mạnh, tụt nhanh, đoạn trơn dài và rất trơn, bot giỏi.',
      HEIGHT: 22,
      DRIVE_GAIN: 0.8,
      SLIDE: 0.7,
      SLIP_START: 0.38,
      SLIP_END: 0.64,
      SLIP_NEED: 0.55,
      SLIP_SLIDE: 1.6,
      BOT: { skillMin: 0.75, skillMax: 1 },
    },
  },
};

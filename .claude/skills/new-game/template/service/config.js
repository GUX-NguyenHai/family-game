// Tham số luật chơi __NAME__. Đơn vị: giây, mili-giây.
// Các tham số trong DIFFICULTIES (cuối file) ghi đè theo độ khó phòng chọn.
module.exports = {
  TICK_HZ: 20,
  HOST_UPDATE_EVERY: 2, // gửi trạng thái cho TV ~10 lần/giây
  PLAYER_UPDATE_EVERY: 2, // gửi trạng thái riêng cho điện thoại ~10 lần/giây
  COUNTDOWN_MS: 3000,
  COAST_MS: 2000, // hiện bảng kết quả rồi vẫn chạy thêm cho cảnh ăn mừng

  ROUND_MS: 30000, // hết giờ mà chưa ai đầy thanh thì xếp theo mức đã đổ
  MOVE_STALE_MS: 400, // quá lâu không nhận mức lắc thì coi như ngừng lắc
  MIN_DRIVE: 0.12, // lắc nhẹ hơn mức này (rung tay) coi như không lắc

  DEFAULT_DIFFICULTY: 'easy',
  DIFFICULTIES: {
    easy: {
      label: { vi: '🟢 Dễ', en: '🟢 Easy' },
      desc: { vi: 'Lắc hết sức ~8 giây là đầy thanh, bot chậm.', en: 'Full shaking fills the bar in ~8s, slow bots.' },
      FILL_RATE: 0.12, // phần thanh đổ được mỗi giây khi lắc hết cỡ
      BOT: { skillMin: 0.3, skillMax: 0.55 },
    },
    normal: {
      label: { vi: '🟡 Trung bình', en: '🟡 Normal' },
      desc: { vi: '~12 giây, bot khá.', en: '~12s, decent bots.' },
      FILL_RATE: 0.085,
      BOT: { skillMin: 0.45, skillMax: 0.8 },
    },
    hard: {
      label: { vi: '🔴 Khó', en: '🔴 Hard' },
      desc: { vi: '~16 giây, bot khoẻ.', en: '~16s, strong bots.' },
      FILL_RATE: 0.065,
      BOT: { skillMin: 0.7, skillMax: 1 },
    },
  },
};

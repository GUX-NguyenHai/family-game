// Tham số luật chơi Nhảy dây. Đơn vị: giây (chu kỳ dây), mili-giây (thời gian).
// Dây quay đều quanh trục nối 2 cột; "1 vòng" = dây từ mặt đất lên qua đầu rồi quét lại mặt đất.
module.exports = {
  TICK_HZ: 30,
  HOST_UPDATE_EVERY: 2, // gửi trạng thái cho TV ~15 lần/giây (TV tự quay dây mượt theo tốc độ)
  PLAYER_UPDATE_EVERY: 3, // gửi trạng thái riêng cho điện thoại ~10 lần/giây
  COUNTDOWN_MS: 3000,
  COAST_MS: 2500, // hiện bảng kết quả rồi vẫn chạy thêm cho cảnh ăn mừng

  // Màn chơi: mỗi màn LEVEL_MS; hết giờ mà còn từ 2 người thì nghỉ BREAK_MS rồi sang màn khó hơn.
  LEVEL_MS: 30000,
  BREAK_MS: 3000,
  MAX_LEVEL: 8, // qua hết màn này mà vẫn còn nhiều người thì những người còn lại cùng hạng nhất

  // Nhảy: hất hoặc giật máy lên. Dây chạm đất lúc T thì người chơi qua được nếu có lần nhảy
  // (tính theo lúc server NHẬN được) trong khoảng [T - SAFE_BEFORE_MS, T + SAFE_AFTER_MS].
  // SAFE_AFTER_MS bù độ trễ: cảm biến nhận ra cử chỉ + mạng điện thoại → server + TV vẽ chậm hơn server.
  AIR_MS: 500, // thời gian bay mỗi lần nhảy (TV vẽ theo)
  SAFE_BEFORE_MS: 420,
  SAFE_AFTER_MS: 220,
  JUMP_COOLDOWN_MS: 550, // nhảy xong phải chờ bấy lâu mới nhảy tiếp được (chống hất liên tục)

  // Các màn (màn 1 = phần tử đầu). Quá số màn trong danh sách thì dùng màn cuối, nhanh thêm FASTER_PER_LEVEL mỗi màn.
  //   periods: chu kỳ 1 vòng dây (giây); nhiều giá trị = đổi nhịp ngẫu nhiên sau mỗi changeEvery vòng (đổi lúc dây ở trên đầu).
  //   holdChance: xác suất mỗi vòng dây chậm hẳn lại ở trên đầu ("dừng hẫng") trong holdMs rồi quay tiếp.
  LEVELS: [
    { title: 'Chậm, nhịp đều', periods: [1.6] },
    { title: 'Nhanh hơn', periods: [1.25] },
    { title: 'Lúc nhanh lúc chậm', periods: [1.4, 0.95], changeEvery: [2, 4] },
    { title: 'Có lúc dừng hẫng', periods: [1.05], holdChance: 0.3, holdMs: 700 },
    { title: 'Nhanh, đổi nhịp, dừng hẫng', periods: [1.0, 0.85], changeEvery: [2, 4], holdChance: 0.2, holdMs: 600 },
  ],
  FASTER_PER_LEVEL: 0.05, // từ màn 6 trở đi: chu kỳ ngắn thêm bấy nhiêu giây mỗi màn
  MIN_PERIOD: 0.7, // dây không quay nhanh hơn mức này
  HOLD_FACTOR: 0.12, // lúc "dừng hẫng" dây quay bằng bấy nhiêu phần tốc độ thường

  DEFAULT_DIFFICULTY: 'easy',
  DIFFICULTIES: {
    easy: {
      label: '🟢 Dễ',
      desc: 'Bắt đầu từ màn 1: dây quay chậm, nhịp đều.',
      START_LEVEL: 1,
      BOT: { missBase: 0.01, missPerLevel: 0.012 },
    },
    normal: {
      label: '🟡 Trung bình',
      desc: 'Bắt đầu từ màn 2: dây quay nhanh hơn.',
      START_LEVEL: 2,
      BOT: { missBase: 0.008, missPerLevel: 0.01 },
    },
    hard: {
      label: '🔴 Khó',
      desc: 'Bắt đầu từ màn 3: lúc nhanh lúc chậm ngay từ đầu.',
      START_LEVEL: 3,
      BOT: { missBase: 0.006, missPerLevel: 0.008 },
    },
  },
};

// Tham số luật chơi Nhảy bao bố. Đơn vị: mét, mili-giây.
// Các tham số trong DIFFICULTIES (cuối file) ghi đè theo độ khó phòng chọn.
module.exports = {
  TICK_HZ: 30,
  HOST_UPDATE_EVERY: 2, // gửi trạng thái cho TV ~15 lần/giây (bước nhảy TV tự vẽ theo sự kiện 'hop')
  PLAYER_UPDATE_EVERY: 3, // gửi trạng thái riêng cho điện thoại ~10 lần/giây
  COUNTDOWN_MS: 3000,
  COAST_MS: 3000,
  FINISH_TIMEOUT_MS: 15000, // người đầu tiên về đích rồi, chờ thêm bấy lâu thì kết thúc
  MAX_RACE_MS: 120000, // chặn trên cho cả ván

  // Mỗi lần hất/giật máy lên = 1 bước nhảy, bay HOP_MS rồi đáp.
  HOP_MS: 520,
  HOP_BASE: 0.9, // bước nhảy ngắn nhất (m)
  HOP_PER_COMBO: 0.15, // mỗi nhịp đúng liên tiếp dài thêm bấy nhiêu
  HOP_MAX: 2.1, // bước dài nhất
  // Hất trong bấy lâu sau khi đáp = đúng nhịp (bước dài dần). Trễ hơn thì bước trở lại ngắn nhất.
  // Rộng vì còn độ trễ: điện thoại rung báo đáp → người phản xạ → cảm biến nhận ra → tin đi qua mạng.
  GOOD_WINDOW_MS: 450,
  // Điện thoại rung báo "đáp đất" sớm hơn lúc đáp thật bấy nhiêu (bù thời gian người phản xạ).
  LAND_CUE_LEAD_MS: 80,

  DEFAULT_DIFFICULTY: 'easy',
  DIFFICULTIES: {
    easy: {
      label: { vi: '🟢 Dễ', en: '🟢 Easy' },
      desc: { vi: 'Đường 40m, ngã nằm 0,8 giây, hất sớm một chút vẫn được tính.', en: '40m track, 0.8s down after a fall, slightly early flicks still count.' },
      TRACK_LEN: 40,
      FALL_MS: 800,
      EARLY_GRACE_MS: 220, // hất sớm trước lúc đáp trong bấy lâu: tự nhảy tiếp ngay khi đáp (không ngã)
      BOT: { skillMin: 0.3, skillMax: 0.6, fallChance: 0.08 },
    },
    normal: {
      label: { vi: '🟡 Trung bình', en: '🟡 Normal' },
      desc: { vi: 'Đường 60m, ngã nằm 1,2 giây.', en: '60m track, 1.2s down after a fall.' },
      TRACK_LEN: 60,
      FALL_MS: 1200,
      EARLY_GRACE_MS: 160,
      BOT: { skillMin: 0.45, skillMax: 0.85, fallChance: 0.05 },
    },
    hard: {
      label: { vi: '🔴 Khó', en: '🔴 Hard' },
      desc: { vi: 'Đường 80m, ngã nằm 1,6 giây, hất sớm là ngã ngay.', en: '80m track, 1.6s down after a fall, early flicks make you fall.' },
      TRACK_LEN: 80,
      FALL_MS: 1600,
      EARLY_GRACE_MS: 100,
      BOT: { skillMin: 0.7, skillMax: 1, fallChance: 0.03 },
    },
  },
};

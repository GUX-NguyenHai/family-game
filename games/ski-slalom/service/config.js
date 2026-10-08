// Tham số luật chơi Trượt tuyết vượt cổng. Đơn vị: mét, giây, mili-giây, radian.
// Các tham số trong DIFFICULTIES (cuối file) ghi đè theo độ khó phòng chọn.
module.exports = {
  TICK_HZ: 30,
  HOST_UPDATE_EVERY: 2, // gửi trạng thái cho TV ~15 lần/giây (TV tự làm mượt)
  PLAYER_UPDATE_EVERY: 3, // gửi trạng thái riêng cho điện thoại ~10 lần/giây
  COUNTDOWN_MS: 3000,
  COAST_MS: 3000,
  FINISH_TIMEOUT_MS: 20000, // người đầu tiên về đích rồi, chờ thêm bấy lâu thì kết thúc
  MAX_RACE_MS: 150000, // chặn trên cho cả lượt

  // Dốc: rộng COURSE_WIDTH, cổng đầu tiên ở FIRST_GATE_Z, sau cổng cuối FINISH_AFTER mét là vạch đích.
  COURSE_WIDTH: 26,
  FIRST_GATE_Z: 40,
  FINISH_AFTER: 35,
  START_SPACING: 1.6, // khoảng cách giữa 2 người ở vạch xuất phát

  // Lái: hướng trượt (góc lệch khỏi đường thẳng xuống dốc) đuổi theo steer × MAX_ANGLE.
  MAX_ANGLE: 0.9, // ~52°
  TURN_RESPONSE: 4, // lớn = bẻ lái nhanh
  STEER_STALE_MS: 600, // quá lâu không nhận lái thì coi như cầm thẳng
  // Tốc độ: tự tăng ACCEL tới MAX_SPEED; càng đi chéo càng mất tốc (TURN_DRAG × |góc| × tốc độ).
  ACCEL: 3.2,
  TURN_DRAG: 0.55,
  START_SPEED: 3,
  EDGE_SLOW: 0.5, // đâm vào lưới chắn 2 bên mép dốc: tốc độ nhân bấy nhiêu

  MISS_PENALTY_MS: 3000, // trượt ngoài cổng: cộng bấy nhiêu giây phạt
  FALL_MS: 1000, // đâm cây/đá: nằm bấy lâu
  FALL_SPEED: 2, // đứng dậy rồi trượt tiếp từ tốc độ này
  BODY_RADIUS: 0.45,

  DEFAULT_DIFFICULTY: 'easy',
  DIFFICULTIES: {
    easy: {
      label: '🟢 Dễ',
      desc: '12 cổng rộng, lệch ít, trượt chậm, ít cây.',
      GATES: 12,
      GATE_GAP: 26, // khoảng cách dọc giữa 2 cổng
      GATE_HALF_WIDTH: 3, // nửa bề rộng cổng
      GATE_OFFSET: [2, 5], // cổng lệch khỏi giữa dốc bấy nhiêu mét (trái/phải xen kẽ)
      MAX_SPEED: 10,
      TREES: 0.4, // số cây/đá trung bình mỗi đoạn giữa 2 cổng
      TREE_CLEARANCE: 5, // cây cách đường nối các cổng ít nhất bấy nhiêu mét
      BOT: { skillMin: 0.35, skillMax: 0.6 },
    },
    normal: {
      label: '🟡 Trung bình',
      desc: '18 cổng, lệch vừa, có cây và đá.',
      GATES: 18,
      GATE_GAP: 24,
      GATE_HALF_WIDTH: 2.4,
      GATE_OFFSET: [3, 7],
      MAX_SPEED: 12,
      TREES: 0.9,
      TREE_CLEARANCE: 3.5,
      BOT: { skillMin: 0.5, skillMax: 0.85 },
    },
    hard: {
      label: '🔴 Khó',
      desc: '24 cổng hẹp, lệch nhiều, trượt nhanh, cây đá cả giữa đường.',
      GATES: 24,
      GATE_GAP: 22,
      GATE_HALF_WIDTH: 1.9,
      GATE_OFFSET: [4, 9],
      MAX_SPEED: 14,
      TREES: 1.5,
      TREE_CLEARANCE: 2.2,
      BOT: { skillMin: 0.7, skillMax: 1 },
    },
  },
};

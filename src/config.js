// Tham số luật chơi. Đơn vị: mét, giây, mili-giây.
module.exports = {
  TICK_HZ: 30,
  PLAYER_UPDATE_EVERY: 3, // gửi 'me' cho điện thoại mỗi 3 tick (~10 lần/giây)

  TRACK_LEN: 400,
  COUNTDOWN_MS: 3000,
  FINISH_TIMEOUT_MS: 20000, // sau khi con đầu tiên về đích, chờ tối đa bấy nhiêu
  COAST_MS: 4000, // sau khi kết thúc, tiếp tục cho con vật chạy chậm lại rồi dừng loop

  BASE_SPEED: 5, // không lắc vẫn chạy chậm
  BOOST_SPEED: 14, // cộng thêm khi power = 1
  POWER_TAU: 0.9, // power giảm dần theo hàm mũ với hằng số thời gian này (giây)
  SHAKE_IMPULSE: 0.1,
  SHAKE_IMPULSE_STRENGTH: 0.12, // lắc càng mạnh cộng càng nhiều
  SHAKE_MIN_INTERVAL_MS: 80,

  // Năng lượng (mana) + TURBO: đầy thanh mới bấm PHI! được, bấm là dùng hết.
  MANA_FILL_MS: 12000, // tự đầy từ 0 → 100% trong bấy nhiêu
  CARROT_MANA: 0.1, // ăn cà rốt +10%
  FENCE_MANA_LOSS: 0.2, // đâm rào -20%
  TURBO_MS: 3000,
  TURBO_FACTOR: 1.4, // nhanh hơn 40%, lướt qua bùn

  LATERAL_SPEED: 5,
  MUD_FACTOR: 0.4,
  STUN_MS: 1000,
  JUMP_MS: 900,
  JUMP_COOLDOWN_MS: 400,

  BODY_HALF_WIDTH: 0.45,
  BODY_HALF_LEN: 0.9,

  // Va chạm giữa các con vật: đẩy nhau sang ngang, tông đuôi thì không xuyên qua được.
  COLLIDE: true,
  BUMP_PUSH: 0.35, // mỗi tick gỡ bấy nhiêu phần chồng lấn (càng lớn càng bật mạnh)
  TURBO_PUSH_SHARE: 0.85, // con đang TURBO hất con kia: con kia chịu 85% lực đẩy
  BUMP_FX_GAP_MS: 700, // mỗi con tối đa 1 hiệu ứng va chạm trong khoảng này

  MAX_PLAYERS: 12,
  PLAYER_DROP_MS: 2 * 60 * 1000, // người rời phòng chờ quá lâu thì xoá
  ROOM_IDLE_MS: 10 * 60 * 1000, // phòng không còn ai kết nối quá lâu thì xoá

  COLORS: [
    '#e6194b', '#3cb44b', '#ffe119', '#4363d8', '#f58231', '#911eb4',
    '#42d4f4', '#f032e6', '#bfef45', '#fabed4', '#469990', '#9a6324',
  ],
};

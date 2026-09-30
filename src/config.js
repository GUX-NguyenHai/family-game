// Tham số luật chơi. Đơn vị: mét, giây, mili-giây.
// Lưu ý: các tham số có trong DIFFICULTIES (cuối file) sẽ bị ghi đè theo độ khó phòng chọn.
module.exports = {
  TICK_HZ: 30,
  PLAYER_UPDATE_EVERY: 3, // gửi 'me' cho điện thoại mỗi 3 tick (~10 lần/giây)

  TRACK_LEN: 400,
  COUNTDOWN_MS: 3000,
  FINISH_TIMEOUT_MS: 20000, // sau khi con đầu tiên về đích, chờ tối đa bấy nhiêu
  COAST_MS: 4000, // sau khi kết thúc, tiếp tục cho con vật chạy chậm lại rồi dừng loop

  BASE_SPEED: 5, // không lắc vẫn chạy chậm
  BOOST_SPEED: 14, // cộng thêm khi power = 1 → tối đa 19 m/s
  ACCEL: 6.5, // tăng tốc (m/s²): từ 0 lên 19 m/s mất ~3 giây
  TURBO_ACCEL_MULT: 2, // đang TURBO thì vọt lên nhanh gấp đôi
  BRAKE: 25, // giảm tốc (m/s²) khi vào bùn / ngừng lắc: chậm lại nhanh
  POWER_TAU: 0.9, // power giảm dần theo hàm mũ với hằng số thời gian này (giây)
  SHAKE_IMPULSE: 0.1,
  SHAKE_IMPULSE_STRENGTH: 0.12, // lắc càng mạnh cộng càng nhiều
  SHAKE_MIN_INTERVAL_MS: 80,

  // Năng lượng (mana) + TURBO: có mana là bấm PHI! được, bấm là dùng hết mana đang có.
  MANA_FILL_MS: 8000, // tự đầy từ 0 → 100% trong bấy nhiêu
  CARROT_MANA: 0.1, // ăn cà rốt +10%
  FENCE_MANA_LOSS: 0.2, // đâm rào -20%
  TURBO_MS: 3000, // TURBO kéo dài bấy nhiêu khi mana đầy; ít mana thì ngắn theo tỉ lệ
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
  BUMP_SLOW_FACTOR: 0.4, // va nhau thì chậm lại như lội bùn (con đang TURBO không bị)
  BUMP_SLOW_MS: 500, // chậm tiếp bấy nhiêu sau khi hết chạm nhau

  FREE_MAX_PLAYERS: 4, // phòng miễn phí (tính cả bot)
  PRO_MAX_PLAYERS: 12, // phòng có mã Pro: tối đa bấy nhiêu dù mã ghi nhiều hơn (mượt với laptop thường)
  MAX_ROOMS: 50, // số phòng tối đa cùng lúc trên server
  PLAYER_DROP_MS: 2 * 60 * 1000, // người rời phòng chờ quá lâu thì xoá
  ROOM_IDLE_MS: 10 * 60 * 1000, // phòng không còn ai kết nối quá lâu thì xoá

  // Độ khó: chủ phòng chọn cho cả phòng. Mỗi mức ghi đè các tham số ở trên.
  // Tốc độ tối đa luôn 19 m/s (BASE_SPEED + BOOST_SPEED); chỉ tốc độ khi không lắc là khác.
  DEFAULT_DIFFICULTY: 'easy',
  DIFFICULTIES: {
    easy: {
      label: 'Dễ',
      TRACK_LEN: 300,
      BASE_SPEED: 7,
      BOOST_SPEED: 12,
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
      label: 'Trung bình',
      TRACK_LEN: 400,
      BASE_SPEED: 5,
      BOOST_SPEED: 14,
      STUN_MS: 1000,
      FENCE_MANA_LOSS: 0.2,
      BUMP_SLOW_FACTOR: 0.4,
      BUMP_SLOW_MS: 500,
      OBSTACLES: { mud: 0.4, fence: 0.4, pairChance: 0.35, extraCarrot: 0.3, mudScale: 1, gapMin: 18, gapMax: 32 },
      BOT: { skillMin: 0.45, skillMax: 0.9, turboMin: 0.5, turboRate: 0.3 },
    },
    hard: {
      label: 'Khó',
      TRACK_LEN: 500,
      BASE_SPEED: 3,
      BOOST_SPEED: 16,
      STUN_MS: 1500,
      FENCE_MANA_LOSS: 0.3,
      BUMP_SLOW_FACTOR: 0.4,
      BUMP_SLOW_MS: 900,
      OBSTACLES: { mud: 0.4, fence: 0.48, pairChance: 0.6, extraCarrot: 0.15, mudScale: 1.3, gapMin: 14, gapMax: 26 },
      BOT: { skillMin: 0.75, skillMax: 1, turboMin: 1, turboRate: 0 },
    },
  },

  COLORS: [
    '#e6194b', '#3cb44b', '#ffe119', '#4363d8', '#f58231', '#911eb4',
    '#42d4f4', '#f032e6', '#bfef45', '#fabed4', '#469990', '#9a6324',
  ],
};

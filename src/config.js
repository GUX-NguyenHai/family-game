// Cấu hình chung của nền tảng (phòng, gói, giới hạn). Tham số luật chơi của từng game nằm trong games/<id>/server/.
module.exports = {
  // Tăng mỗi lần sửa; hiện ở góc màn hình chính và điện thoại để biết đang chạy đúng bản chưa.
  APP_VERSION: '20261006.5', // dạng NămThángNgày.lần-sửa-trong-ngày

  DEFAULT_GAME: 'animal-race', // game được chọn sẵn khi tạo phòng (id = tên thư mục trong games/)
  DEFAULT_TICK_HZ: 10, // game không khai báo tickHz thì vòng lặp chạy bấy nhiêu lần/giây
  DEFAULT_COUNTDOWN_MS: 3000,

  FREE_MAX_PLAYERS: 4, // phòng miễn phí (tính cả bot)
  PRO_MAX_PLAYERS: 12, // phòng có mã Pro: tối đa bấy nhiêu dù mã ghi nhiều hơn (mượt với laptop thường)
  MAX_ROOMS: 50, // số phòng tối đa cùng lúc trên server
  PLAYER_DROP_MS: 2 * 60 * 1000, // người rời phòng chờ quá lâu thì xoá
  ROOM_IDLE_MS: 10 * 60 * 1000, // phòng không còn ai kết nối quá lâu thì xoá

  // Đội (cho game chơi theo đội). Tối đa 4 đội.
  TEAMS: [
    { id: 0, name: 'Đỏ', emoji: '🔴', color: '#e6194b' },
    { id: 1, name: 'Xanh', emoji: '🔵', color: '#4363d8' },
    { id: 2, name: 'Lục', emoji: '🟢', color: '#3cb44b' },
    { id: 3, name: 'Vàng', emoji: '🟡', color: '#ffe119' },
  ],

  // Màu riêng của từng người, dùng chung cho mọi game.
  COLORS: [
    '#e6194b', '#3cb44b', '#ffe119', '#4363d8', '#f58231', '#911eb4',
    '#42d4f4', '#f032e6', '#bfef45', '#fabed4', '#469990', '#9a6324',
  ],
};

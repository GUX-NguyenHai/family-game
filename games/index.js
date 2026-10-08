// Danh sách game. Thêm game mới: tạo thư mục games/<id>/ (xem games/README.md) rồi thêm 1 dòng ở đây.
// Thứ tự ở đây = thứ tự hiện trên màn hình chọn game. Chỉ có 1 game thì phòng chờ ẩn phần chọn game.
module.exports = [
  require('./animal-race/service'),
  require('./boat-race/service'),
  require('./tug-of-war/service'),
  require('./coconut-climb/service'),
  require('./jump-rope/service'),
  require('./sack-race/service'),
];

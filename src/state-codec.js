// Mã hoá trạng thái game gửi cho TV thành nhị phân gọn (thay vì JSON) để nhẹ đường truyền.
// Phía TV giải mã bằng public/js/core/state-codec.js với CÙNG một schema (games/<id>/assets/schema.json).
//
// Schema: { "head": [trường…], "row": [trường…], "rows": "p" }
//   head = các trường chung (VD giai đoạn, đồng hồ); row = các trường của mỗi người/thuyền (danh sách data[rows]).
//   Mỗi trường: [tên, kiểu, tham số]
//     kiểu: u8 i8 u16 i16 u32 f32 bool enum; thêm "?" = có thể null (VD "u8?"); thêm "*N" = mảng N phần tử (VD "u8*4").
//     tham số: số = hệ số nhân trước khi làm tròn (VD 100 → giữ 2 chữ số thập phân); với enum = danh sách giá trị.
//   Hàng không gửi id: TV ghép id theo thứ tự đã biết từ setup() (id dài 36 ký tự là phần nặng nhất).
const SIZE = { u8: 1, i8: 1, u16: 2, i16: 2, u32: 4, f32: 4 };
const RANGE = { u8: [0, 255], i8: [-128, 127], u16: [0, 65535], i16: [-32768, 32767], u32: [0, 4294967295] };

function parseField([name, type, arg]) {
  let t = type;
  let nullable = false;
  let count = 0; // 0 = một giá trị, >0 = mảng
  if (t.endsWith('?')) {
    nullable = true;
    t = t.slice(0, -1);
  }
  const m = t.match(/^(\w+)\*(\d+)$/);
  if (m) {
    t = m[1];
    count = Number(m[2]);
  }
  let values = null;
  let scale = 1;
  if (t === 'enum') {
    values = arg;
    t = 'u8';
  } else if (t === 'bool') {
    t = 'u8';
  } else if (typeof arg === 'number') {
    scale = arg;
  }
  if (!SIZE[t]) throw new Error(`Kiểu không hợp lệ trong schema: ${type}`);
  return { name, t, size: SIZE[t] * (count || 1), count, nullable, values, scale };
}

function compile(schema) {
  return {
    head: (schema.head || []).map(parseField),
    row: (schema.row || []).map(parseField),
    rows: schema.rows || 'p',
  };
}

function toInt(f, v) {
  let n;
  if (f.values) n = Math.max(0, f.values.indexOf(v));
  else if (f.nullable) n = v == null ? 0 : Math.round(v * f.scale) + 1; // 0 = null
  else n = Math.round((Number(v) || 0) * f.scale);
  const [lo, hi] = RANGE[f.t];
  return n < lo ? lo : n > hi ? hi : n;
}

function writeOne(view, off, f, v) {
  if (f.t === 'f32') return view.setFloat32(off, (Number(v) || 0) * f.scale, true);
  const n = toInt(f, typeof v === 'boolean' ? (v ? 1 : 0) : v);
  if (f.t === 'u8') view.setUint8(off, n);
  else if (f.t === 'i8') view.setInt8(off, n);
  else if (f.t === 'u16') view.setUint16(off, n, true);
  else if (f.t === 'i16') view.setInt16(off, n, true);
  else view.setUint32(off, n, true);
}

function writeField(view, off, f, v) {
  if (!f.count) {
    writeOne(view, off, f, v);
    return off + f.size;
  }
  const one = SIZE[f.t];
  for (let i = 0; i < f.count; i++) writeOne(view, off + i * one, f, Array.isArray(v) ? v[i] : 0);
  return off + f.size;
}

// data: { ...trường head, [rows]: [ {...trường row}, … ] } → Buffer. Tối đa 255 hàng.
function encode(compiled, data) {
  const rows = (data[compiled.rows] || []).slice(0, 255);
  const headSize = compiled.head.reduce((s, f) => s + f.size, 0);
  const rowSize = compiled.row.reduce((s, f) => s + f.size, 0);
  const buf = Buffer.alloc(headSize + 1 + rows.length * rowSize);
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  let off = 0;
  for (const f of compiled.head) off = writeField(view, off, f, data[f.name]);
  view.setUint8(off++, rows.length);
  for (const r of rows) for (const f of compiled.row) off = writeField(view, off, f, r[f.name]);
  return buf;
}

module.exports = { compile, encode };

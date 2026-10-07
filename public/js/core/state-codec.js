// Giải mã trạng thái game nhị phân từ server (src/state-codec.js mã hoá) với CÙNG một schema.
// Cách dùng trong games/<id>/screen/index.js:
//   const codec = compile(await fetch('/games/<id>/assets/schema.json').then(r => r.json()));
//   onState(raw) { const s = decode(codec, raw, ids); … }   // ids: thứ tự id các hàng, lấy từ setup()
// Xem mô tả định dạng schema ở src/state-codec.js.
const SIZE = { u8: 1, i8: 1, u16: 2, i16: 2, u32: 4, f32: 4 };

function parseField([name, type, arg]) {
  let t = type;
  let nullable = false;
  let count = 0;
  let bool = false;
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
    bool = true;
    t = 'u8';
  } else if (typeof arg === 'number') {
    scale = arg;
  }
  return { name, t, size: SIZE[t] * (count || 1), count, nullable, values, scale, bool };
}

export function compile(schema) {
  return {
    head: (schema.head || []).map(parseField),
    row: (schema.row || []).map(parseField),
    rows: schema.rows || 'p',
  };
}

function readRaw(view, off, t) {
  if (t === 'u8') return view.getUint8(off);
  if (t === 'i8') return view.getInt8(off);
  if (t === 'u16') return view.getUint16(off, true);
  if (t === 'i16') return view.getInt16(off, true);
  if (t === 'u32') return view.getUint32(off, true);
  return view.getFloat32(off, true);
}

function readOne(view, off, f) {
  const n = readRaw(view, off, f.t);
  if (f.values) return f.values[n] ?? f.values[0];
  if (f.bool) return n !== 0;
  if (f.nullable) return n === 0 ? null : (n - 1) / f.scale;
  return n / f.scale;
}

function readField(view, off, f) {
  if (!f.count) return [readOne(view, off, f), off + f.size];
  const one = SIZE[f.t];
  const arr = [];
  for (let i = 0; i < f.count; i++) arr.push(readOne(view, off + i * one, f));
  return [arr, off + f.size];
}

// raw: ArrayBuffer (hoặc Uint8Array) từ server; ids: id của từng hàng theo thứ tự. Trả về object giống lúc server tạo.
// raw không phải nhị phân (VD game chưa chuyển) thì trả nguyên.
export function decode(compiled, raw, ids = []) {
  if (!(raw instanceof ArrayBuffer) && !ArrayBuffer.isView(raw)) return raw;
  const view = raw instanceof ArrayBuffer ? new DataView(raw) : new DataView(raw.buffer, raw.byteOffset, raw.byteLength);
  const out = {};
  let off = 0;
  let v;
  for (const f of compiled.head) {
    [v, off] = readField(view, off, f);
    out[f.name] = v;
  }
  const count = view.getUint8(off++);
  const rows = [];
  for (let i = 0; i < count; i++) {
    const r = { id: ids[i] };
    for (const f of compiled.row) {
      [v, off] = readField(view, off, f);
      r[f.name] = v;
    }
    rows.push(r);
  }
  out[compiled.rows] = rows;
  return out;
}

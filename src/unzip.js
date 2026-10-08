// Đọc file .zip thường (không mật khẩu, nén Store hoặc Deflate, dưới 4GB) bằng zlib có sẵn của Node,
// không cần thêm thư viện. Đủ cho zip tạo bằng Finder, Windows, lệnh zip, 7-Zip.
const zlib = require('zlib');

const EOCD = 0x06054b50; // cuối danh mục
const CENTRAL = 0x02014b50; // một mục trong danh mục
const LOCAL = 0x04034b50; // đầu dữ liệu một file

// buf: Buffer file zip. Trả về [{ name, data }] (bỏ các mục thư mục).
function unzip(buf) {
  let end = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 22 - 0xffff); i--) {
    if (buf.readUInt32LE(i) === EOCD) {
      end = i;
      break;
    }
  }
  if (end < 0) throw new Error('Không phải file .zip');
  const count = buf.readUInt16LE(end + 10);
  let off = buf.readUInt32LE(end + 16);
  const files = [];
  for (let n = 0; n < count; n++) {
    if (buf.readUInt32LE(off) !== CENTRAL) throw new Error('File .zip bị hỏng');
    const flags = buf.readUInt16LE(off + 8);
    const method = buf.readUInt16LE(off + 10);
    const packed = buf.readUInt32LE(off + 20);
    const size = buf.readUInt32LE(off + 24);
    const nameLen = buf.readUInt16LE(off + 28);
    const extraLen = buf.readUInt16LE(off + 30);
    const commentLen = buf.readUInt16LE(off + 32);
    const local = buf.readUInt32LE(off + 42);
    const name = buf.toString('utf8', off + 46, off + 46 + nameLen);
    off += 46 + nameLen + extraLen + commentLen;
    if (name.endsWith('/')) continue;
    if (flags & 1) throw new Error('File .zip có mật khẩu, nén lại không đặt mật khẩu');
    if (packed === 0xffffffff || local === 0xffffffff) throw new Error('File .zip quá lớn');
    if (buf.readUInt32LE(local) !== LOCAL) throw new Error('File .zip bị hỏng');
    const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
    const raw = buf.subarray(start, start + packed);
    let data;
    if (method === 0) data = Buffer.from(raw);
    else if (method === 8) data = zlib.inflateRawSync(raw);
    else throw new Error(`Kiểu nén chưa hỗ trợ (${method}), nén lại bằng zip thường`);
    if (data.length !== size) throw new Error(`File .zip bị hỏng (${name})`);
    files.push({ name, data });
  }
  return files;
}

module.exports = { unzip };

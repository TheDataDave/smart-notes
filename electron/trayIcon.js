const { nativeImage } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

const DARK = [45, 42, 74, 255];
const YELLOW = [255, 212, 59, 255];

// Is the point (px, py) inside a rounded rectangle?
function inRoundRect(px, py, x, y, w, h, r) {
  const cx = Math.min(Math.max(px, x + r), x + w - r);
  const cy = Math.min(Math.max(py, y + r), y + h - r);
  return (px - cx) ** 2 + (py - cy) ** 2 <= r * r;
}

function drawIcon(size) {
  const px = Buffer.alloc(size * size * 4); // starts fully transparent
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const cx = x + 0.5;
      const cy = y + 0.5;
      if (!inRoundRect(cx, cy, 1, 1, size - 2, size - 2, 8)) continue;

      let color = inRoundRect(cx, cy, 3.5, 3.5, size - 7, size - 7, 6) ? YELLOW : DARK;
      const line =
        (x >= 9 && x < 23 && ((y >= 11 && y < 13) || (y >= 16 && y < 18))) ||
        (x >= 9 && x < 17 && y >= 21 && y < 23);
      if (color === YELLOW && line) color = DARK;

      const i = (y * size + x) * 4;
      px.set(color, i);
    }
  }
  return px;
}

// ---- minimal PNG encoder ----
function crc32(buf) {
  let crc = 0xffffffff;
  for (const byte of buf) {
    crc ^= byte;
    for (let k = 0; k < 8; k++) crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function encodePng(size, rgba) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8; // 8 bits per channel
  header[9] = 6; // RGBA

  const stride = size * 4;
  const raw = Buffer.alloc((stride + 1) * size); // each row starts with a filter byte (0)
  for (let y = 0; y < size; y++) {
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }

  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', header),
    chunk('IDAT', zlib.deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function makeTrayIcon() {
  const file = path.join(__dirname, 'icon.png');
  if (fs.existsSync(file)) return nativeImage.createFromPath(file);
  // 32px drawn, shown at 16px logical size so it stays sharp on high-DPI screens
  return nativeImage.createFromBuffer(encodePng(32, drawIcon(32)), { scaleFactor: 2 });
}

module.exports = { makeTrayIcon };
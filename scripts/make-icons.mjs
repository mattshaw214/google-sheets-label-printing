import { mkdirSync, writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const projectRoot = new URL('../', import.meta.url);
const iconDirectory = new URL('chrome-extension/icons/', projectRoot);
const sizes = [16, 32, 48, 128];
const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const typeBytes = Buffer.from(type, 'ascii');
  const output = Buffer.alloc(12 + data.length);
  output.writeUInt32BE(data.length, 0);
  typeBytes.copy(output, 4);
  data.copy(output, 8);
  output.writeUInt32BE(crc32(Buffer.concat([typeBytes, data])), 8 + data.length);
  return output;
}

function pixel(size, x, y) {
  const center = (size - 1) / 2;
  const dx = (x - center) / size;
  const dy = (y - center) / size;
  const rounded = Math.hypot(dx, dy) < 0.47;
  if (!rounded) return [0, 0, 0, 0];

  const leafLeft = ((x / size) - 0.43) ** 2 / 0.055 + ((y / size) - 0.40) ** 2 / 0.10 < 1;
  const leafRight = ((x / size) - 0.61) ** 2 / 0.055 + ((y / size) - 0.36) ** 2 / 0.09 < 1;
  const stem = Math.abs(x / size - (0.46 + (y / size - 0.42) * 0.22)) < 0.025
    && y / size > 0.35 && y / size < 0.76;
  if (leafLeft || leafRight || stem) return [246, 249, 231, 255];
  return [39, 111, 57, 255];
}

function makePng(size) {
  const scanlines = Buffer.alloc(size * (1 + size * 4));
  for (let y = 0; y < size; y += 1) {
    const rowStart = y * (1 + size * 4);
    scanlines[rowStart] = 0;
    for (let x = 0; x < size; x += 1) {
      const offset = rowStart + 1 + x * 4;
      const rgba = pixel(size, x, y);
      scanlines.set(rgba, offset);
    }
  }

  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8;
  header[9] = 6;
  return Buffer.concat([
    signature,
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(scanlines, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

mkdirSync(iconDirectory, { recursive: true });
for (const size of sizes) {
  writeFileSync(new URL(`icon-${size}.png`, iconDirectory), makePng(size));
}


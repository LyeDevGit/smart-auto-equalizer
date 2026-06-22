// Generate minimal PNG icons for Lye Equalizer
import { writeFileSync } from 'fs';
import { resolve } from 'path';
import { deflateSync } from 'zlib';

const __dirname = import.meta.dirname;
const ICONS_DIR = resolve(__dirname, '..', 'public', 'icons');

function createPNG(width, height) {
  // Minimal PNG generator for solid-color icons
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  // IHDR chunk
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData[8] = 8;  // bit depth
  ihdrData[9] = 2;  // color type: RGB
  ihdrData[10] = 0; // compression
  ihdrData[11] = 0; // filter
  ihdrData[12] = 0; // interlace

  const ihdr = chunk('IHDR', ihdrData);

  // IDAT chunk - image data
  // Each row: filter byte (0) + RGB pixels
  const rawData = Buffer.alloc(height * (1 + width * 3));
  for (let y = 0; y < height; y++) {
    const rowStart = y * (1 + width * 3);
    rawData[rowStart] = 0; // No filter
    for (let x = 0; x < width; x++) {
      const px = rowStart + 1 + x * 3;
      rawData[px] = 0x81;     // R (purple)
      rawData[px + 1] = 0x8c; // G
      rawData[px + 2] = 0xf8; // B
    }
  }

  const compressed = deflateSync(rawData);
  const idat = chunk('IDAT', compressed);

  // IEND chunk
  const iend = chunk('IEND', Buffer.alloc(0));

  return Buffer.concat([signature, ihdr, idat, iend]);
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const crcData = Buffer.concat([Buffer.from(type), data]);
  const crc = crc32(crcData);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc >>> 0);
  return Buffer.concat([len, Buffer.from(type), data, crcBuf]);
}

function crc32(buf) {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc ^= buf[i];
    for (let j = 0; j < 8; j++) {
      if (crc & 1) crc = (crc >>> 1) ^ 0xedb88320;
      else crc >>>= 1;
    }
  }
  return ~crc;
}

// Generate icons
for (const size of [16, 48, 128]) {
  const png = createPNG(size, size);
  writeFileSync(resolve(ICONS_DIR, `icon${size}.png`), png);
  console.log(`Created icon${size}.png (${size}x${size})`);
}

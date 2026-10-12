#!/usr/bin/env node
// Generate extension icons: a white ring and dot on a black disc,
// matching the in-tweet button. No dependencies.

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const CRC_TABLE = Array.from({ length: 256 }, (_, i) => {
  let c = i;
  for (let j = 0; j < 8; j++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
  return c >>> 0;
});

function crc32(data) {
  let crc = 0xFFFFFFFF;
  for (const byte of data) crc = CRC_TABLE[(crc ^ byte) & 0xFF] ^ (crc >>> 8);
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

// Coverage-based shape test in a unit square centered at 0,0 (radius 0.5).
// Returns [r, g, b, a] for a point.
function shade(x, y) {
  const d = Math.sqrt(x * x + y * y);
  if (d > 0.48) return null;                       // outside the disc
  const white = (d < 0.11) ||                      // center dot
                (d > 0.28 && d < 0.34);            // ring
  return white ? [255, 255, 255] : [0, 0, 0];
}

function createPNG(size) {
  const SS = 4; // supersampling for anti-aliased edges
  const raw = [];

  for (let py = 0; py < size; py++) {
    raw.push(0); // filter: none
    for (let px = 0; px < size; px++) {
      let r = 0, g = 0, b = 0, covered = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const x = (px + (sx + 0.5) / SS) / size - 0.5;
          const y = (py + (sy + 0.5) / SS) / size - 0.5;
          const c = shade(x, y);
          if (!c) continue;
          r += c[0]; g += c[1]; b += c[2]; covered++;
        }
      }
      if (covered === 0) {
        raw.push(0, 0, 0, 0);
      } else {
        raw.push(
          Math.round(r / covered),
          Math.round(g / covered),
          Math.round(b / covered),
          Math.round(255 * covered / (SS * SS))
        );
      }
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 6;  // color type: RGBA
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(Buffer.from(raw))),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

const assetsDir = path.join(__dirname, 'assets');
fs.mkdirSync(assetsDir, { recursive: true });

for (const size of [16, 48, 128]) {
  const filename = path.join(assetsDir, `icon${size}.png`);
  fs.writeFileSync(filename, createPNG(size));
  console.log(`Created ${filename}`);
}

console.log('\nTo install the extension:');
console.log('1. Open chrome://extensions');
console.log('2. Enable "Developer mode"');
console.log('3. Click "Load unpacked"');
console.log('4. Select this folder: ' + __dirname);

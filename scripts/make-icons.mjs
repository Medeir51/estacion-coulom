// Genera los íconos PNG de la PWA: un átomo estilizado sobre fondo #070B10 (sección 21.2).
// Uso: node scripts/make-icons.mjs
import { writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const BG = [7, 11, 16];
const ORBIT = [79, 216, 255];
const CORE = [61, 252, 156];

function crc32(buf) {
  let c;
  const table = [];
  for (let n = 0; n < 256; n++) {
    c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  let crc = 0xffffffff;
  for (const b of buf) crc = table[(crc ^ b) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}

function png(size, pixel) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      const [r, g, b, a] = pixel(x, y);
      const o = y * (size * 4 + 1) + 1 + x * 4;
      raw[o] = r;
      raw[o + 1] = g;
      raw[o + 2] = b;
      raw[o + 3] = a;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/** Cobertura (0–1) de cada capa en un punto en coordenadas normalizadas [-1, 1]. */
function sample(u, v, scale) {
  const x = u / scale;
  const y = v / scale;
  let orbit = 0;
  for (const ang of [0, Math.PI / 3, (2 * Math.PI) / 3]) {
    const c = Math.cos(ang);
    const s = Math.sin(ang);
    const xr = x * c + y * s;
    const yr = -x * s + y * c;
    const a = 0.82;
    const b = 0.3;
    const f = (xr * xr) / (a * a) + (yr * yr) / (b * b) - 1;
    const g = Math.hypot((2 * xr) / (a * a), (2 * yr) / (b * b)) || 1;
    if (Math.abs(f / g) < 0.035) orbit = 1;
  }
  const core = Math.hypot(x, y) < 0.16 ? 1 : 0;
  return { orbit, core };
}

function render(size, scale, rounded) {
  const SS = 4;
  return png(size, (px, py) => {
    let o = 0;
    let c = 0;
    let inside = 0;
    for (let i = 0; i < SS; i++) {
      for (let j = 0; j < SS; j++) {
        const u = ((px + (i + 0.5) / SS) / size) * 2 - 1;
        const v = ((py + (j + 0.5) / SS) / size) * 2 - 1;
        const s = sample(u, v, scale);
        o += s.orbit;
        c += s.core;
        const r = 0.22;
        const qx = Math.max(Math.abs(u) - (1 - r), 0);
        const qy = Math.max(Math.abs(v) - (1 - r), 0);
        inside += !rounded || Math.hypot(qx, qy) <= r ? 1 : 0;
      }
    }
    const n = SS * SS;
    const fo = o / n;
    const fc = c / n;
    const col = BG.map((bg, k) => Math.round(bg * (1 - fo) + ORBIT[k] * fo));
    const col2 = col.map((cv, k) => Math.round(cv * (1 - fc) + CORE[k] * fc));
    return [...col2, Math.round((255 * inside) / n)];
  });
}

writeFileSync('public/icon-192.png', render(192, 0.9, true));
writeFileSync('public/icon-512.png', render(512, 0.9, true));
writeFileSync('public/icon-maskable-512.png', render(512, 0.62, false));
writeFileSync('public/apple-touch-icon.png', render(180, 0.8, false));
console.log('Íconos generados en public/');

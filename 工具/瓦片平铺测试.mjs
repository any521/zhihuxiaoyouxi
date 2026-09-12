/**
 * 瓦片平铺测试（零依赖）
 *
 * 美术圣经 §7 T01 的验收标准：把同一张材质 3×3 平铺，看不出接缝。
 * 这个脚本：从材质图里取指定的一格 → 降采样到目标瓦片尺寸 → 3×3 平铺 → 输出 1× 与 8× 两张图。
 *
 * 用法：
 *   node 工具/瓦片平铺测试.mjs <材质图> <输出目录> [--格=左上] [--尺寸=32]
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { inflateSync, deflateSync } from 'node:zlib';
import { join, resolve } from 'node:path';

/* PNG 解码 */
function decodePng(buffer) {
  let offset = 8;
  let width = 0;
  let height = 0;
  let colorType = 6;
  const idat = [];
  let palette = null;
  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString('ascii', offset + 4, offset + 8);
    const data = buffer.subarray(offset + 8, offset + 8 + length);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      colorType = data[9];
    } else if (type === 'PLTE') {
      palette = [];
      for (let i = 0; i < data.length; i += 3) palette.push([data[i], data[i + 1], data[i + 2]]);
    } else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    offset += 12 + length;
  }
  const channels = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[colorType];
  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const out = Buffer.alloc(height * stride);
  for (let y = 0; y < height; y += 1) {
    const filter = raw[y * (stride + 1)];
    const line = raw.subarray(y * (stride + 1) + 1, y * (stride + 1) + 1 + stride);
    const prev = y > 0 ? out.subarray((y - 1) * stride, y * stride) : null;
    const cur = out.subarray(y * stride, (y + 1) * stride);
    for (let x = 0; x < stride; x += 1) {
      const a = x >= channels ? cur[x - channels] : 0;
      const b = prev ? prev[x] : 0;
      const c = prev && x >= channels ? prev[x - channels] : 0;
      let v = line[x];
      if (filter === 1) v += a;
      else if (filter === 2) v += b;
      else if (filter === 3) v += (a + b) >> 1;
      else if (filter === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      cur[x] = v & 0xff;
    }
  }
  const rgb = new Uint8Array(width * height * 3);
  for (let i = 0; i < width * height; i += 1) {
    if (colorType === 3 && palette) {
      const [r, g, b] = palette[out[i]] ?? [0, 0, 0];
      rgb[i * 3] = r;
      rgb[i * 3 + 1] = g;
      rgb[i * 3 + 2] = b;
    } else if (colorType === 0 || colorType === 4) {
      const v = out[i * channels];
      rgb[i * 3] = v;
      rgb[i * 3 + 1] = v;
      rgb[i * 3 + 2] = v;
    } else {
      rgb[i * 3] = out[i * channels];
      rgb[i * 3 + 1] = out[i * channels + 1];
      rgb[i * 3 + 2] = out[i * channels + 2];
    }
  }
  return { width, height, rgb };
}

/* PNG 编码 */
const crcTable = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i += 1) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function encodePng(width, height, rgb) {
  const stride = width * 3;
  const raw = Buffer.alloc(height * (stride + 1));
  for (let y = 0; y < height; y += 1) {
    raw[y * (stride + 1)] = 0;
    Buffer.from(rgb.subarray(y * stride, (y + 1) * stride)).copy(raw, y * (stride + 1) + 1);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/* 32 色调色板量化 */
const PALETTE = [
  0x6b4423, 0x8f5a33, 0xb87b4a, 0xd9a066, 0xf0c896,
  0x2f5d3a, 0x4a8f4f, 0x7cc26b, 0xa8d98a,
  0x1b3a6b, 0x2c5fa8, 0x4a8fd4, 0x8ec3ee,
  0xffffff, 0xf4f0ea, 0xd8d2c8, 0xa8a29a,
  0xffdcb8, 0xf0c09a, 0xd99e77,
  0x14161c, 0x262a33, 0x454b57, 0x6e7686, 0xa4acbb,
  0xffb020, 0xff7a45, 0xe04f3f, 0x9b6bff,
  0xf7efdd, 0xe8dcc0, 0x241a12,
].map((k) => [(k >> 16) & 0xff, (k >> 8) & 0xff, k & 0xff]);
function quantize(r, g, b) {
  let best = PALETTE[0];
  let bestD = Infinity;
  for (const c of PALETTE) {
    const dr = c[0] - r;
    const dg = c[1] - g;
    const db = c[2] - b;
    const d = dr * dr * 0.3 + dg * dg * 0.59 + db * db * 0.11;
    if (d < bestD) {
      bestD = d;
      best = c;
    }
  }
  return best;
}

const args = process.argv.slice(2);
const input = args[0];
const outDir = args[1] ?? '美术/素材库/成品/_瓦片平铺测试';
if (!input) {
  console.error('用法：node 工具/瓦片平铺测试.mjs <材质图> [输出目录] [--格=左上] [--尺寸=32]');
  process.exit(1);
}
const cellName = (args.find((a) => a.startsWith('--格=')) ?? '--格=左上').split('=')[1];
const TILE = Number((args.find((a) => a.startsWith('--尺寸=')) ?? '--尺寸=32').split('=')[1]);
const CELLS = { 左上: [0, 0], 右上: [1, 0], 左下: [0, 1], 右下: [1, 1] };
const [cx, cy] = CELLS[cellName] ?? CELLS['左上'];

const img = decodePng(readFileSync(input));
const cw = Math.floor(img.width / 2);
const ch = Math.floor(img.height / 2);
const ox = cx * cw;
const oy = cy * ch;
const inset = Math.max(8, Math.floor(cw * 0.08)); // 向内缩，避开格线与边缘瑕疵

// 降采样到 TILE×TILE（面积平均）
const tile = new Uint8Array(TILE * TILE * 3);
for (let y = 0; y < TILE; y += 1) {
  for (let x = 0; x < TILE; x += 1) {
    const sx0 = ox + inset + ((x * (cw - inset * 2)) / TILE);
    const sx1 = ox + inset + (((x + 1) * (cw - inset * 2)) / TILE);
    const sy0 = oy + inset + ((y * (ch - inset * 2)) / TILE);
    const sy1 = oy + inset + (((y + 1) * (ch - inset * 2)) / TILE);
    let r = 0;
    let g = 0;
    let b = 0;
    let w = 0;
    for (let sy = Math.floor(sy0); sy < Math.ceil(sy1); sy += 1) {
      for (let sx = Math.floor(sx0); sx < Math.ceil(sx1); sx += 1) {
        const wx = Math.min(sx1, sx + 1) - Math.max(sx0, sx);
        const wy = Math.min(sy1, sy + 1) - Math.max(sy0, sy);
        const ww = Math.max(0, wx) * Math.max(0, wy);
        if (ww <= 0) continue;
        const si = (sy * img.width + sx) * 3;
        r += img.rgb[si] * ww;
        g += img.rgb[si + 1] * ww;
        b += img.rgb[si + 2] * ww;
        w += ww;
      }
    }
    const [qr, qg, qb] = quantize(Math.round(r / w), Math.round(g / w), Math.round(b / w));
    const di = (y * TILE + x) * 3;
    tile[di] = qr;
    tile[di + 1] = qg;
    tile[di + 2] = qb;
  }
}

// 3×3 平铺
const N = 3;
const W = TILE * N;
const canvas = Buffer.alloc(W * W * 3);
for (let ty = 0; ty < N; ty += 1) {
  for (let tx = 0; tx < N; tx += 1) {
    for (let y = 0; y < TILE; y += 1) {
      for (let x = 0; x < TILE; x += 1) {
        const si = (y * TILE + x) * 3;
        const di = ((ty * TILE + y) * W + tx * TILE + x) * 3;
        canvas[di] = tile[si];
        canvas[di + 1] = tile[si + 1];
        canvas[di + 2] = tile[si + 2];
      }
    }
  }
}

const S = 6;
const big = Buffer.alloc(W * S * W * S * 3);
for (let y = 0; y < W * S; y += 1) {
  for (let x = 0; x < W * S; x += 1) {
    const si = (Math.floor(y / S) * W + Math.floor(x / S)) * 3;
    const di = (y * W * S + x) * 3;
    big[di] = canvas[si];
    big[di + 1] = canvas[si + 1];
    big[di + 2] = canvas[si + 2];
  }
}

mkdirSync(resolve(outDir), { recursive: true });
const base = input.split(/[\\/]/).pop().replace(/\.png$/i, '');
writeFileSync(join(resolve(outDir), `${base}_${cellName}_3x3_1x.png`), encodePng(W, W, canvas));
writeFileSync(join(resolve(outDir), `${base}_${cellName}_3x3_${S}x.png`), encodePng(W * S, W * S, big));

console.log('=== 瓦片平铺测试 ===');
console.log(`材质：${base} · 取格：${cellName} · 瓦片尺寸：${TILE}×${TILE} · 平铺：3×3`);
console.log(`输出：${join(resolve(outDir), `${base}_${cellName}_3x3_${S}x.png`)}`);
console.log('判断标准：接缝处看不出明显的直线或色差；如果出现规律性重复的亮点，说明材质带有孤立碎屑，需要清掉。');

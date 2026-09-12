/**
 * 把 AI 生成的"像素风插画"转成真·像素画（零依赖）
 *
 * 干三件事：
 *   1. 按整数倍降采样：每个输出像素取源图对应方块里**出现最多的颜色**（块众数），
 *      这一步会把 AI 随手画的、大小不一的"假像素块"统一掉，同时消掉抖动噪点。
 *   2. 量化到项目 32 色调色板（最近色替换），把上万色压到 32 色。
 *   3. 可选：把品红背景转成透明，输出带 alpha 的 PNG。
 *
 * 用法：
 *   node 工具/转像素画.mjs <输入.png> <输出.png> [--宽=512] [--透明] [--色数=32]
 *
 * 例：
 *   node 工具/转像素画.mjs "美术/素材库/原图/00-风格基准/参考_风格基准图.png" "美术/素材库/成品/参考_风格基准图_像素化.png" --宽=256
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { inflateSync, deflateSync } from 'node:zlib';

/* ───────────── PNG 解码 ───────────── */
function decodePng(buffer) {
  if (buffer.readUInt32BE(0) !== 0x89504e47) throw new Error('不是 PNG 文件');
  let offset = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 8;
  let colorType = 6;
  let interlace = 0;
  const idat = [];
  let palette = null;

  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString('ascii', offset + 4, offset + 8);
    const data = buffer.subarray(offset + 8, offset + 8 + length);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
      interlace = data[12];
    } else if (type === 'PLTE') {
      palette = [];
      for (let i = 0; i < data.length; i += 3) palette.push([data[i], data[i + 1], data[i + 2]]);
    } else if (type === 'IDAT') {
      idat.push(data);
    } else if (type === 'IEND') break;
    offset += 12 + length;
  }

  if (interlace !== 0) throw new Error('不支持交错式 PNG');
  if (bitDepth !== 8) throw new Error(`暂只支持 8 位色深，实际 ${bitDepth}`);

  const channels = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[colorType];
  if (!channels) throw new Error(`不支持的颜色类型 ${colorType}`);

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
      let value = line[x];
      if (filter === 1) value += a;
      else if (filter === 2) value += b;
      else if (filter === 3) value += (a + b) >> 1;
      else if (filter === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        value += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      cur[x] = value & 0xff;
    }
  }

  const rgb = new Uint8Array(width * height * 3);
  const alpha = new Uint8Array(width * height).fill(255);
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
      if (colorType === 4) alpha[i] = out[i * channels + 1];
    } else {
      rgb[i * 3] = out[i * channels];
      rgb[i * 3 + 1] = out[i * channels + 1];
      rgb[i * 3 + 2] = out[i * channels + 2];
      if (colorType === 6) alpha[i] = out[i * channels + 3];
    }
  }
  return { width, height, rgb, alpha };
}

/* ───────────── PNG 编码 ───────────── */
const crcTable = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buffer) {
  let c = 0xffffffff;
  for (let i = 0; i < buffer.length; i += 1) c = crcTable[(c ^ buffer[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const typeAndData = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typeAndData));
  return Buffer.concat([length, typeAndData, crc]);
}

function encodePng(width, height, rgb, alpha) {
  const useAlpha = Boolean(alpha);
  const channels = useAlpha ? 4 : 3;
  const stride = width * channels;
  const raw = Buffer.alloc(height * (stride + 1));
  for (let y = 0; y < height; y += 1) {
    raw[y * (stride + 1)] = 0; // filter: none
    for (let x = 0; x < width; x += 1) {
      const src = (y * width + x) * 3;
      const dst = y * (stride + 1) + 1 + x * channels;
      raw[dst] = rgb[src];
      raw[dst + 1] = rgb[src + 1];
      raw[dst + 2] = rgb[src + 2];
      if (useAlpha) raw[dst + 3] = alpha[y * width + x];
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = useAlpha ? 6 : 2;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/* ───────────── 项目 32 色调色板 ───────────── */
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

function nearestPaletteColor(r, g, b) {
  let best = PALETTE[0];
  let bestDistance = Infinity;
  for (const color of PALETTE) {
    const dr = color[0] - r;
    const dg = color[1] - g;
    const db = color[2] - b;
    const distance = dr * dr * 0.3 + dg * dg * 0.59 + db * db * 0.11; // 按人眼敏感度加权
    if (distance < bestDistance) {
      bestDistance = distance;
      best = color;
    }
  }
  return best;
}

/* ───────────── 主流程 ───────────── */
const args = process.argv.slice(2);
const input = args[0];
const output = args[1];
if (!input || !output) {
  console.error('用法：node 工具/转像素画.mjs <输入.png> <输出.png> [--宽=512] [--精确=512x288] [--透明] [--色数=32]');
  process.exit(1);
}
const targetWidth = Number((args.find((a) => a.startsWith('--宽=')) ?? '--宽=0').split('=')[1]) || 0;
const exactArg = args.find((a) => a.startsWith('--精确='));
const exact = exactArg ? exactArg.split('=')[1].split('x').map(Number) : null;
const makeTransparent = args.includes('--透明');
const 放大倍 = Number((args.find((a) => a.startsWith('--放大=')) ?? '--放大=0').split('=')[1]) || 0;

const source = decodePng(readFileSync(input));
const { width: srcW, height: srcH, rgb } = source;

// --放大=N：只做最近邻放大，不降采样、不量化（用来肉眼检查小尺寸素材）
if (放大倍 > 0) {
  const W = srcW * 放大倍;
  const H = srcH * 放大倍;
  const out = new Uint8Array(W * H * 3);
  for (let y = 0; y < H; y += 1) {
    for (let x = 0; x < W; x += 1) {
      const si = (Math.floor(y / 放大倍) * srcW + Math.floor(x / 放大倍)) * 3;
      const di = (y * W + x) * 3;
      out[di] = rgb[si];
      out[di + 1] = rgb[si + 1];
      out[di + 2] = rgb[si + 2];
    }
  }
  writeFileSync(output, encodePng(W, H, out));
  console.log(`输出：${output}  ${W}×${H}（最近邻放大 ${放大倍}×，未量化）`);
  process.exit(0);
}

/**
 * 采样方式：
 *   --精确=WxH ：面积平均降采样到精确尺寸（首选用它——成品尺寸必须精确等于游戏内部分辨率，
 *                1920×1088 这种源图用整数倍只能缩到 480×272，会逼着游戏再非整数拉伸一次）
 *   --宽=N     ：整数倍降采样 + 块众数取样（像素块最规整，适合精灵/瓦片）
 */
let dstW;
let dstH;
if (exact && exact.length === 2 && exact[0] > 0 && exact[1] > 0) {
  dstW = exact[0];
  dstH = exact[1];
} else {
  const factor = targetWidth > 0 ? Math.max(1, Math.round(srcW / targetWidth)) : 1;
  dstW = Math.floor(srcW / factor);
  dstH = Math.floor(srcH / factor);
}

const outRgb = new Uint8Array(dstW * dstH * 3);
const outAlpha = makeTransparent ? new Uint8Array(dstW * dstH) : null;
let transparentPixels = 0;

for (let y = 0; y < dstH; y += 1) {
  for (let x = 0; x < dstW; x += 1) {
    let r = 0;
    let g = 0;
    let b = 0;
    let weight = 0;
    let magenta = 0;

    if (exact) {
      // 面积平均：按源像素覆盖输出像素的面积加权
      const sx0 = (x * srcW) / dstW;
      const sx1 = ((x + 1) * srcW) / dstW;
      const sy0 = (y * srcH) / dstH;
      const sy1 = ((y + 1) * srcH) / dstH;
      for (let sy = Math.floor(sy0); sy < Math.ceil(sy1); sy += 1) {
        for (let sx = Math.floor(sx0); sx < Math.ceil(sx1); sx += 1) {
          if (sx < 0 || sy < 0 || sx >= srcW || sy >= srcH) continue;
          const wx = Math.min(sx1, sx + 1) - Math.max(sx0, sx);
          const wy = Math.min(sy1, sy + 1) - Math.max(sy0, sy);
          const w = Math.max(0, wx) * Math.max(0, wy);
          if (w <= 0) continue;
          const si = (sy * srcW + sx) * 3;
          const pr = rgb[si];
          const pg = rgb[si + 1];
          const pb = rgb[si + 2];
          r += pr * w;
          g += pg * w;
          b += pb * w;
          weight += w;
          if (pr > 170 && pb > 170 && pg < 120) magenta += w;
        }
      }
      if (weight > 0) {
        r /= weight;
        g /= weight;
        b /= weight;
      }
      var magentaShare = weight > 0 ? magenta / weight : 0;
    } else {
      // 块众数：取源方块里出现最多的颜色
      const factor = Math.max(1, Math.round(srcW / dstW));
      const counts = new Map();
      for (let sy = 0; sy < factor; sy += 1) {
        for (let sx = 0; sx < factor; sx += 1) {
          const px = x * factor + sx;
          const py = y * factor + sy;
          if (px >= srcW || py >= srcH) continue;
          const i = py * srcW + px;
          const key = (rgb[i * 3] << 16) | (rgb[i * 3 + 1] << 8) | rgb[i * 3 + 2];
          counts.set(key, (counts.get(key) ?? 0) + 1);
        }
      }
      let bestKey = 0;
      let bestCount = -1;
      for (const [key, count] of counts) {
        if (count > bestCount) {
          bestCount = count;
          bestKey = key;
        }
      }
      r = (bestKey >> 16) & 0xff;
      g = (bestKey >> 8) & 0xff;
      b = bestKey & 0xff;
      var magentaShare = r > 170 && b > 170 && g < 120 ? 1 : 0;
    }

    const dst = (y * dstW + x) * 3;
    if (makeTransparent && magentaShare > 0.5) {
      outRgb[dst] = 0;
      outRgb[dst + 1] = 0;
      outRgb[dst + 2] = 0;
      outAlpha[y * dstW + x] = 0;
      transparentPixels += 1;
      continue;
    }
    const [qr, qg, qb] = nearestPaletteColor(Math.round(r), Math.round(g), Math.round(b));
    outRgb[dst] = qr;
    outRgb[dst + 1] = qg;
    outRgb[dst + 2] = qb;
    if (outAlpha) outAlpha[y * dstW + x] = 255;
  }
}

writeFileSync(output, encodePng(dstW, dstH, outRgb, outAlpha));

const usedColors = new Set();
for (let i = 0; i < dstW * dstH; i += 1) {
  usedColors.add((outRgb[i * 3] << 16) | (outRgb[i * 3 + 1] << 8) | outRgb[i * 3 + 2]);
}

console.log('=== 转像素画完成 ===');
console.log(`输入：${input}  ${srcW}×${srcH}`);
console.log(`输出：${output}  ${dstW}×${dstH}  （${exact ? "面积平均，精确尺寸" : `整数倍降采样 ${Math.max(1, Math.round(srcW / dstW))}×，块众数取样`}）`);
console.log(`用色：${usedColors.size} 色（调色板 32 色）`);
if (outAlpha) {
  console.log(`透明像素：${transparentPixels}（占 ${((transparentPixels / (dstW * dstH)) * 100).toFixed(1)}%）`);
}
console.log('');
console.log('下一步：用 工具/图片体检.mjs 复查这张输出图，确认颜色总数与孤立像素降下来了。');

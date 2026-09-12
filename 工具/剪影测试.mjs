/**
 * 剪影测试（零依赖）
 *
 * 美术圣经 §5.5.7 要求：把角色的正面视图填成纯黑剪影，缩到接近游戏尺寸并排看，
 * 如果认不出谁是谁，就回去改剪影（体型/耳朵/姿态），不要靠加颜色解决。
 *
 * 这个脚本自动完成：
 *   1. 从每张角色设定图里裁出左侧的正面视图（自动找内容边界盒）
 *   2. 把角色像素全部涂黑，得到纯剪影
 *   3. 缩到接近 32×48 精灵的比例，横向排开
 *   4. 同时输出 1× 与 8× 两张图，方便肉眼判断
 *
 * 用法：node 工具/剪影测试.mjs [输出目录]
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { inflateSync, deflateSync } from 'node:zlib';
import { join, resolve } from 'node:path';

const ROOT = resolve(process.cwd(), '美术/素材库');
const OUT = process.argv[2] ?? join(ROOT, '成品/_剪影测试');

/* ── PNG 解码 ── */
function decodePng(buffer) {
  if (buffer.readUInt32BE(0) !== 0x89504e47) throw new Error('不是 PNG');
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
    } else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    offset += 12 + length;
  }
  if (interlace !== 0) throw new Error('不支持交错 PNG');
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

/* ── PNG 编码 ── */
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
    rgb.copy
      ? rgb.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride)
      : Buffer.from(rgb.subarray(y * stride, (y + 1) * stride)).copy(raw, y * (stride + 1) + 1);
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

const isBackground = (r, g, b) => r > 170 && b > 170 && g < 120; // 品红底

/** 判断某一行在给定横向范围内是否全是背景 */
function rowIsEmpty(img, y, x0, x1) {
  for (let x = x0; x < x1; x += 1) {
    const i = (y * img.width + x) * 3;
    if (!isBackground(img.rgb[i], img.rgb[i + 1], img.rgb[i + 2])) return false;
  }
  return true;
}

/** 判断某一列在给定纵向范围内是否全是背景 */
function colIsEmpty(img, x, y0, y1) {
  for (let y = y0; y < y1; y += 1) {
    const i = (y * img.width + x) * 3;
    if (!isBackground(img.rgb[i], img.rgb[i + 1], img.rgb[i + 2])) return false;
  }
  return true;
}

/**
 * 取设定图"第一格"（左上那一格）的内容边界盒。
 *
 * 为什么按网格几何切、而不是靠"找空白行/列"自动识别：
 * 有些设定图带格线边框，那些线会让"整行都是背景"的判断失效，自动识别会把整幅当成一格。
 * 所以由调用方声明这张图是几行几列，这里只在第一格内部找内容，并向内缩 6 像素避开格线。
 */
function firstCellBox(img, cols, rows) {
  const cellW = Math.floor(img.width / cols);
  const cellH = Math.floor(img.height / rows);
  const inset = 6;
  const x0 = inset;
  const x1 = Math.min(img.width - 1, cellW - inset);
  const y0 = inset;
  const y1 = Math.min(img.height - 1, cellH - inset);

  let minX = x1;
  let maxX = x0;
  let minY = y1;
  let maxY = y0;
  for (let y = y0; y <= y1; y += 1) {
    for (let x = x0; x <= x1; x += 1) {
      const i = (y * img.width + x) * 3;
      if (!isBackground(img.rgb[i], img.rgb[i + 1], img.rgb[i + 2])) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < minX || maxY < minY) return null;
  return { minX, maxX, minY, maxY };
}


const CAST = [
  ['主角', '原图/01-主角/角色_刘看山_三视图.png', 3, 1],
  ['学长', '原图/03-其他角色/角色_学长_设定总表.png', 4, 4],
  ['林总', '原图/03-其他角色/角色_林总_三视图.png', 3, 1],
  ['周岚', '原图/03-其他角色/角色_周岚_三视图.png', 3, 1],
  ['阿麦', '原图/03-其他角色/角色_阿麦_三视图.png', 3, 1],
  ['韩策', '原图/03-其他角色/角色_韩策_三视图.png', 3, 1],
  ['小鹿', '原图/03-其他角色/角色_小鹿_三视图.png', 3, 1],
  ['客户', '原图/03-其他角色/角色_客户_三视图.png', 3, 1],
  ['面试官', '原图/03-其他角色/角色_面试官_设定总表.png', 2, 2],
];

const TARGET_H = 48;      // 剪影高度 ≈ 最终精灵高度
const GAP = 10;
const MARGIN = 12;
const BG = [232, 232, 236];

const tiles = [];
for (const [name, rel, cols, rows] of CAST) {
  const path = join(ROOT, rel);
  let img;
  try {
    img = decodePng(readFileSync(path));
  } catch (e) {
    console.log(`跳过 ${name}：${e.message}`);
    continue;
  }
  // 自动识别网格首格（正面视图）
  const box = firstCellBox(img, cols, rows);
  if (!box) {
    console.log(`跳过 ${name}：没找到内容格`);
    continue;
  }
  if (process.env.DEBUG_BOX) console.log(`  ${name}: 裁切框 x[${box.minX}..${box.maxX}] y[${box.minY}..${box.maxY}] 宽${box.maxX-box.minX+1} 高${box.maxY-box.minY+1}`);
  const pad = 6;
  const bx0 = Math.max(0, box.minX - pad);
  const bx1 = Math.min(img.width - 1, box.maxX + pad);
  const by0 = Math.max(0, box.minY - pad);
  const by1 = Math.min(img.height - 1, box.maxY + pad);
  const bw = bx1 - bx0 + 1;
  const bh = by1 - by0 + 1;

  const targetW = Math.max(1, Math.round((bw / bh) * TARGET_H));
  const tile = new Uint8Array(targetW * TARGET_H * 3).fill(0);
  const tileRgb = Buffer.alloc(targetW * TARGET_H * 3);
  for (let y = 0; y < TARGET_H; y += 1) {
    for (let x = 0; x < targetW; x += 1) {
      const sx = bx0 + Math.min(bw - 1, Math.floor(((x + 0.5) / targetW) * bw));
      const sy = by0 + Math.min(bh - 1, Math.floor(((y + 0.5) / TARGET_H) * bh));
      const si = (sy * img.width + sx) * 3;
      const bg = isBackground(img.rgb[si], img.rgb[si + 1], img.rgb[si + 2]);
      const di = (y * targetW + x) * 3;
      if (bg) {
        tileRgb[di] = BG[0];
        tileRgb[di + 1] = BG[1];
        tileRgb[di + 2] = BG[2];
      } else {
        tileRgb[di] = 0;
        tileRgb[di + 1] = 0;
        tileRgb[di + 2] = 0;
      }
    }
  }
  tiles.push({ name, width: targetW, rgb: tileRgb });
}

const totalW = MARGIN * 2 + tiles.reduce((s, t) => s + t.width, 0) + GAP * (tiles.length - 1);
const canvas = Buffer.alloc(totalW * (TARGET_H + MARGIN * 2) * 3);
for (let i = 0; i < canvas.length; i += 3) {
  canvas[i] = BG[0];
  canvas[i + 1] = BG[1];
  canvas[i + 2] = BG[2];
}
let cursor = MARGIN;
for (const t of tiles) {
  for (let y = 0; y < TARGET_H; y += 1) {
    for (let x = 0; x < t.width; x += 1) {
      const si = (y * t.width + x) * 3;
      const di = ((y + MARGIN) * totalW + cursor + x) * 3;
      canvas[di] = t.rgb[si];
      canvas[di + 1] = t.rgb[si + 1];
      canvas[di + 2] = t.rgb[si + 2];
    }
  }
  cursor += t.width + GAP;
}

const H = TARGET_H + MARGIN * 2;
mkdirSync(OUT, { recursive: true });
writeFileSync(join(OUT, '剪影测试_1x.png'), encodePng(totalW, H, canvas));

// 8× 放大，便于肉眼判断
const S = 8;
const big = Buffer.alloc(totalW * S * H * S * 3);
for (let y = 0; y < H * S; y += 1) {
  for (let x = 0; x < totalW * S; x += 1) {
    const si = (Math.floor(y / S) * totalW + Math.floor(x / S)) * 3;
    const di = (y * totalW * S + x) * 3;
    big[di] = canvas[si];
    big[di + 1] = canvas[si + 1];
    big[di + 2] = canvas[si + 2];
  }
}
writeFileSync(join(OUT, '剪影测试_8x.png'), encodePng(totalW * S, H * S, big));

console.log('=== 剪影测试 ===');
console.log('角色顺序：' + tiles.map((t) => t.name).join(' · '));
console.log(`剪影高度：${TARGET_H}px（≈ 最终精灵高度）`);
console.log(`输出：${join(OUT, '剪影测试_1x.png')}`);
console.log(`输出：${join(OUT, '剪影测试_8x.png')}`);

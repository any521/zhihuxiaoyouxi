/**
 * 图片体检（零依赖，直接 node 跑）
 *
 * 为什么需要它：AI 生成的"像素画"经常是假的——像素块大小不统一、色数几百色、
 * 满屏抖动噪点。肉眼在小图上看不出来，放大或降采样后就会崩。
 * 这个脚本用数字给出四个硬指标。
 *
 * 用法：node 工具/图片体检.mjs "美术/素材库/原图/00-风格基准/参考_风格基准图.png"
 */
import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';

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
    } else if (type === 'IEND') {
      break;
    }
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

  // 统一转成 RGB 数组
  const pixels = new Uint8Array(width * height * 3);
  for (let i = 0; i < width * height; i += 1) {
    if (colorType === 3 && palette) {
      const [r, g, b] = palette[out[i]] ?? [0, 0, 0];
      pixels[i * 3] = r;
      pixels[i * 3 + 1] = g;
      pixels[i * 3 + 2] = b;
    } else if (colorType === 0 || colorType === 4) {
      const v = out[i * channels];
      pixels[i * 3] = v;
      pixels[i * 3 + 1] = v;
      pixels[i * 3 + 2] = v;
    } else {
      pixels[i * 3] = out[i * channels];
      pixels[i * 3 + 1] = out[i * channels + 1];
      pixels[i * 3 + 2] = out[i * channels + 2];
    }
  }
  return { width, height, pixels };
}

const file = process.argv[2];
if (!file) {
  console.error('用法：node 工具/图片体检.mjs <图片路径>');
  process.exit(1);
}

const buffer = readFileSync(file);
const { width, height, pixels } = decodePng(buffer);
const total = width * height;

const key = (i) => (pixels[i * 3] << 16) | (pixels[i * 3 + 1] << 8) | pixels[i * 3 + 2];
const hex = (k) => '#' + k.toString(16).padStart(6, '0');

/* 1) 色数 */
const colorCount = new Map();
for (let i = 0; i < total; i += 1) {
  const k = key(i);
  colorCount.set(k, (colorCount.get(k) ?? 0) + 1);
}
const topColors = [...colorCount.entries()].sort((a, b) => b[1] - a[1]).slice(0, 14);

/* 2) 像素块大小：统计横向连续同色游程的众数（排除大色块背景） */
const runCount = new Map();
for (let y = 0; y < height; y += 1) {
  let run = 1;
  for (let x = 1; x < width; x += 1) {
    if (key(y * width + x) === key(y * width + x - 1)) {
      run += 1;
    } else {
      if (run <= 24) runCount.set(run, (runCount.get(run) ?? 0) + 1);
      run = 1;
    }
  }
  if (run <= 24) runCount.set(run, (runCount.get(run) ?? 0) + 1);
}
const runModes = [...runCount.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);

/* 3) 孤立像素比例（噪点指标）：四邻全部不同色的像素占比 */
let isolated = 0;
for (let y = 1; y < height - 1; y += 1) {
  for (let x = 1; x < width - 1; x += 1) {
    const i = y * width + x;
    const k = key(i);
    if (
      key(i - 1) !== k &&
      key(i + 1) !== k &&
      key(i - width) !== k &&
      key(i + width) !== k
    ) {
      isolated += 1;
    }
  }
}

/* 4) 背景占比（左上角颜色） */
const bgKey = key(0);
const bgCount = colorCount.get(bgKey) ?? 0;

/* 5) 是否落在 32 色板附近（容差 24） */
const palette = [
  0x6b4423, 0x8f5a33, 0xb87b4a, 0xd9a066, 0xf0c896,
  0x2f5d3a, 0x4a8f4f, 0x7cc26b, 0xa8d98a,
  0x1b3a6b, 0x2c5fa8, 0x4a8fd4, 0x8ec3ee,
  0xffffff, 0xf4f0ea, 0xd8d2c8, 0xa8a29a,
  0xffdcb8, 0xf0c09a, 0xd99e77,
  0x14161c, 0x262a33, 0x454b57, 0x6e7686, 0xa4acbb,
  0xffb020, 0xff7a45, 0xe04f3f, 0x9b6bff,
  0xf7efdd, 0xe8dcc0, 0x241a12,
];
let nearPalette = 0;
for (const k of colorCount.keys()) {
  const r = (k >> 16) & 0xff;
  const g = (k >> 8) & 0xff;
  const b = k & 0xff;
  const hit = palette.some(
    (p) =>
      Math.abs(((p >> 16) & 0xff) - r) <= 24 &&
      Math.abs(((p >> 8) & 0xff) - g) <= 24 &&
      Math.abs((p & 0xff) - b) <= 24,
  );
  if (hit) nearPalette += 1;
}

console.log(`文件：${file}`);
console.log(`尺寸：${width}×${height}`);
console.log('');
console.log('【1】颜色总数：', colorCount.size, colorCount.size <= 64 ? '✅ 干净' : colorCount.size <= 256 ? '⚠️ 偏多' : '❌ 严重超标');
console.log('      落在 32 色板容差内的颜色数：', nearPalette, `（占 ${((nearPalette / colorCount.size) * 100).toFixed(1)}%）`);
console.log('【2】横向同色游程众数（像素块大小）：', runModes.map(([len, n]) => `${len}px×${n}次`).join(' · '));
console.log('【3】孤立像素占比（噪点）：', ((isolated / total) * 100).toFixed(2) + '%', isolated / total < 0.02 ? '✅ 低' : isolated / total < 0.06 ? '⚠️ 偏高' : '❌ 抖动噪点严重');
console.log('【4】背景色：', hex(bgKey), `占 ${((bgCount / total) * 100).toFixed(1)}%`);
console.log('');
console.log('出现最多的 14 种颜色：');
topColors.forEach(([k, n]) => {
  console.log(`  ${hex(k)}  ${((n / total) * 100).toFixed(2)}%`);
});

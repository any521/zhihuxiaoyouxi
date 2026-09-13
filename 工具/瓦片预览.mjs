/**
 * 瓦片预览（零依赖）
 *
 * 新瓦片是**单张 512×512 的材质**（不是 2×2 材质表），所以要一个专用工具：
 *   原图 → 块众数降采样到 N×N → 量化到 32 色板 → 3×3 平铺 → 输出 1× 与放大图
 *
 * 用法：
 *   node 工具/瓦片预览.mjs <瓦片图> [输出目录] [--尺寸=32] [--不量化]
 */
import { mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { 读取PNG, 写入PNG, 缩放到_块众数, 量化 } from './图像库.mjs';
const 参数 = process.argv.slice(2);
const 输入 = 参数[0];
const 输出目录 = 参数.find((a) => !a.startsWith('--') && a !== 输入) ?? '美术/素材库/成品/_瓦片平铺测试';
if (!输入) {
  console.error('用法：node 工具/瓦片预览.mjs <瓦片图> [输出目录] [--尺寸=32] [--不量化]');
  process.exit(1);
}
const 尺寸 = Number((参数.find((a) => a.startsWith('--尺寸=')) ?? '--尺寸=32').split('=')[1]) || 32;
const 要量化 = !参数.includes('--不量化');
const 平铺数 = Number((参数.find((a) => a.startsWith('--平铺=')) ?? '--平铺=3').split('=')[1]) || 3;

const 源 = 读取PNG(输入);
// 1) 块众数降采样（保证像素块规整；面积平均会把细节糊掉）
let 瓦片 = 缩放到_块众数(源, 尺寸, 尺寸);
if (要量化) 瓦片 = 量化(瓦片);

// 2) 平铺
const N = 平铺数;
const W = 尺寸 * N;
const rgb = new Uint8Array(W * W * 3);
for (let ty = 0; ty < N; ty += 1) {
  for (let tx = 0; tx < N; tx += 1) {
    for (let y = 0; y < 尺寸; y += 1) {
      for (let x = 0; x < 尺寸; x += 1) {
        const si = (y * 尺寸 + x) * 3;
        const di = ((ty * 尺寸 + y) * W + tx * 尺寸 + x) * 3;
        rgb[di] = 瓦片.rgb[si];
        rgb[di + 1] = 瓦片.rgb[si + 1];
        rgb[di + 2] = 瓦片.rgb[si + 2];
      }
    }
  }
}

// 3) 放大
const S = Math.max(2, Math.floor(480 / W));
const H = W * S;
const 放大 = new Uint8Array(H * H * 3);
for (let y = 0; y < H; y += 1) {
  for (let x = 0; x < H; x += 1) {
    const si = (Math.floor(y / S) * W + Math.floor(x / S)) * 3;
    const di = (y * H + x) * 3;
    放大[di] = rgb[si];
    放大[di + 1] = rgb[si + 1];
    放大[di + 2] = rgb[si + 2];
  }
}

mkdirSync(resolve(输出目录), { recursive: true });
const 基名 = 输入.split(/[\\/]/).pop().replace(/\.png$/i, '');
const 小图路径 = join(resolve(输出目录), `${基名}_${尺寸}_平铺${N}x${N}_1x.png`);
const 大图路径 = join(resolve(输出目录), `${基名}_${尺寸}_平铺${N}x${N}_${S}x.png`);
写入PNG(小图路径, { width: W, height: W, rgb });
写入PNG(大图路径, { width: H, height: H, rgb: 放大 });

// 4) 顺手报一下量化后的用色与噪点
const 用色 = new Set();
for (let i = 0; i < W * W; i += 1) {
  用色.add((rgb[i * 3] << 16) | (rgb[i * 3 + 1] << 8) | rgb[i * 3 + 2]);
}
let 孤立 = 0;
for (let y = 0; y < W; y += 1) {
  for (let x = 0; x < W; x += 1) {
    const i = (y * W + x) * 3;
    const c = (rgb[i] << 16) | (rgb[i + 1] << 8) | rgb[i + 2];
    let 同 = 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= W || ny >= W) { 同 += 1; continue; }
      const j = (ny * W + nx) * 3;
      if (((rgb[j] << 16) | (rgb[j + 1] << 8) | rgb[j + 2]) === c) 同 += 1;
    }
    if (同 === 0) 孤立 += 1;
  }
}

console.log(`输入：${输入}`);
console.log(`瓦片：${尺寸}×${尺寸}（块众数降采样 ${Math.round(源.width / 尺寸)}×）${要量化 ? ' + 量化到 32 色板' : ''}`);
console.log(`用色：${用色.size} 种`);
console.log(`孤立像素：${((孤立 / (W * W)) * 100).toFixed(2)}%`);
console.log(`输出：${小图路径}`);
console.log(`输出：${大图路径}`);

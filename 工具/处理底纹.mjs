/**
 * 处理界面底纹（零依赖）
 *
 * 输入是 AI 生成的 1024×1024 全彩底纹，输出是可平铺的 512×512、32 色板成品。
 *
 * 关键问题：**AI 生成的图不能无缝平铺** —— 左右边缘对不上，直接 repeat 会出现明显的接缝格。
 * 解法：先量边缘差异；差得多就用**镜像拼合**（2×2 镜像）——
 * 镜像的接缝在数学上一定对齐，接缝问题彻底消失。
 * 代价是图案会有对称性，但底纹是散点图案，看不出来。
 *
 * 用法：node 工具/处理底纹.mjs
 */
import { mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { 读取PNG, 写入PNG, 缩放到, 量化 } from './图像库.mjs';

const 根 = resolve(process.cwd());
const 源目录 = join(根, '美术/素材库/原图/15-界面背景');
const 出目录 = join(根, '美术/素材库/成品/界面v2');
const 游戏目录 = join(根, 'liukanshan-career/public/assets/avg');

const 目标边 = 512;

/** 量左右/上下边缘的平均色差（0~255），用来判断能不能直接平铺 */
function 量接缝(img) {
  const { width: W, height: H, rgb } = img;
  const 取 = (x, y) => {
    const i = (y * W + x) * 3;
    return [rgb[i], rgb[i + 1], rgb[i + 2]];
  };
  let 左右 = 0;
  let 上下 = 0;
  for (let y = 0; y < H; y += 1) {
    const a = 取(0, y);
    const b = 取(W - 1, y);
    左右 += (Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2])) / 3;
  }
  for (let x = 0; x < W; x += 1) {
    const a = 取(x, 0);
    const b = 取(x, H - 1);
    上下 += (Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2])) / 3;
  }
  return { 左右: 左右 / H, 上下: 上下 / W };
}

/** 2×2 镜像拼合：右下原图，左下水平翻转，右上垂直翻转，右下对角翻转 —— 接缝一定对齐 */
function 镜像拼合(img) {
  const W = img.width;
  const H = img.height;
  const TW = W * 2;
  const TH = H * 2;
  const rgb = new Uint8Array(TW * TH * 3);
  for (let y = 0; y < TH; y += 1) {
    for (let x = 0; x < TW; x += 1) {
      // 目标坐标映射回原图（带翻转）
      const 右半 = x >= W;
      const 下半 = y >= H;
      const sx = 右半 ? W - 1 - (x - W) : x;
      const sy = 下半 ? H - 1 - (y - H) : y;
      const si = (sy * W + sx) * 3;
      const di = (y * TW + x) * 3;
      rgb[di] = img.rgb[si];
      rgb[di + 1] = img.rgb[si + 1];
      rgb[di + 2] = img.rgb[si + 2];
    }
  }
  return { width: TW, height: TH, rgb };
}

/**
 * 相对底色的对比增强。
 *
 * 为什么要这一步：÷2 降采样会把细图案和底色平均掉，图案变得几乎看不见。
 * 这里先找出"底色"（出现最多的颜色），再把每个像素**相对底色**拉开一段距离：
 *     新色 = 底色 + (原色 - 底色) × 增益
 * 底色本身不动（增益对它无效），图案的色差被放大，缩完仍然看得清。
 */
function 增强对比(img, 增益) {
  const { width: W, height: H, rgb } = img;
  // 找底色：统计出现最多的颜色
  const 计 = new Map();
  for (let i = 0; i < W * H; i += 1) {
    const k = (rgb[i * 3] << 16) | (rgb[i * 3 + 1] << 8) | rgb[i * 3 + 2];
    计.set(k, (计.get(k) ?? 0) + 1);
  }
  let 底 = 0;
  let 最多 = -1;
  for (const [k, n] of 计) {
    if (n > 最多) {
      最多 = n;
      底 = k;
    }
  }
  const 底R = (底 >> 16) & 255;
  const 底G = (底 >> 8) & 255;
  const 底B = 底 & 255;
  const out = new Uint8Array(rgb.length);
  const 夹 = (v) => Math.max(0, Math.min(255, Math.round(v)));
  for (let i = 0; i < W * H; i += 1) {
    out[i * 3] = 夹(底R + (rgb[i * 3] - 底R) * 增益);
    out[i * 3 + 1] = 夹(底G + (rgb[i * 3 + 1] - 底G) * 增益);
    out[i * 3 + 2] = 夹(底B + (rgb[i * 3 + 2] - 底B) * 增益);
  }
  return { width: W, height: H, rgb: out, 底色: `#${底.toString(16).padStart(6, '0')}` };
}

const 任务 = [
  { 源: '底纹_聊天区_米白.png', 出: '底纹_聊天区_米白.png', 游戏: 'wallpaper_chat.png', 增益: 1.9 },
  { 源: '底纹_侧栏_绿.png', 出: '底纹_侧栏_绿.png', 游戏: 'wallpaper_rail.png', 增益: 1.7 },
];

mkdirSync(出目录, { recursive: true });
mkdirSync(游戏目录, { recursive: true });

console.log('=== 处理界面底纹 ===\n');

for (const 项 of 任务) {
  const 源路径 = join(源目录, 项.源);
  const 原 = 读取PNG(源路径);
  const 缝 = 量接缝(原);
  const 需要镜像 = 缝.左右 > 6 || 缝.上下 > 6;

  console.log(`【${项.源}】${原.width}×${原.height}`);
  console.log(`  边缘色差  左右 ${缝.左右.toFixed(1)} · 上下 ${缝.上下.toFixed(1)}`);
  console.log(`  判定      ${需要镜像 ? '❌ 直接平铺会有接缝 → 用镜像拼合' : '✅ 边缘基本对得上，可直接平铺'}`);

  // 不无缝就镜像拼合
  const 中间 = 需要镜像 ? 镜像拼合(原) : 原;
  if (需要镜像) console.log(`  镜像拼合  → ${中间.width}×${中间.height}`);

  // 缩到目标尺寸（面积平均）
  const 缩 = 缩放到(中间, 目标边, 目标边);
  // ⚠️ ÷2 会把细图案和底色平均掉，图案几乎看不见 —— 所以缩完要相对底色增强一次对比
  const 强 = 增强对比(缩, 项.增益);
  let 图 = 量化(强);
  console.log(`  底色      ${强.底色} · 对比增强 ×${项.增益}`);

  // 再量一次：缩完之后的边缘（镜像的话应当接近 0）
  const 缝2 = 量接缝(图);
  console.log(`  成品       ${目标边}×${目标边} · 边缘色差 左右 ${缝2.左右.toFixed(1)} · 上下 ${缝2.上下.toFixed(1)}`);

  const 用色 = new Set();
  for (let i = 0; i < 目标边 * 目标边; i += 1) {
    用色.add((图.rgb[i * 3] << 16) | (图.rgb[i * 3 + 1] << 8) | 图.rgb[i * 3 + 2]);
  }
  console.log(`  用色      ${用色.size} 种`);

  写入PNG(join(出目录, 项.出), 图);
  写入PNG(join(游戏目录, 项.游戏), 图);
  console.log(`  → ${项.游戏}\n`);
}

console.log(`输出：${出目录}`);
console.log(`接入：${游戏目录}`);

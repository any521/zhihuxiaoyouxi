/**
 * 修行走表的"回头帧"（零依赖）
 *
 * 问题：`角色_刘看山_四方向行走16帧_32x48.png` 的第 4 行（朝右）里，
 * **第 4 帧的头转回了左边** —— 身体朝右、鼻子朝左。
 * 走路动画循环到那一帧就会出现"走两步回一次头"，非常怪。
 *
 * 为什么用镜像而不是重生成：
 *   向左和向右本来就应该是**镜像**关系。直接把第 3 行（朝左）水平翻转当第 4 行，
 *   ① 保证左右完全对称，② 不会再有奇怪的帧，③ 不用你重新生成素材。
 *   这也是 2D 游戏处理左右朝向的标准做法。
 *
 * 用法：node 工具/修行走表.mjs
 */
import { mkdirSync, copyFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { 读取PNG, 写入PNG } from './图像库.mjs';

const 根 = resolve(process.cwd());
const 源 = join(根, '美术/素材库/成品/角色动画/角色_刘看山_四方向行走16帧_32x48.png');
const 出目录 = join(根, '美术/素材库/成品/角色动画/_已修');
const 游戏 = join(根, 'liukanshan-career/public/assets/map/chr_lks_walk.png');

const 格W = 32;
const 格H = 48;
/** 行索引：0=下 1=上 2=左 3=右 */
const 左行 = 2;
const 右行 = 3;

const 图 = 读取PNG(源);
const 列数 = Math.floor(图.width / 格W);
const 行数 = Math.floor(图.height / 格H);

console.log('=== 修行走表：把「朝右」换成「朝左」的镜像 ===\n');
console.log(`  源图 ${图.width}×${图.height}（${列数} 列 × ${行数} 行）`);

const 出 = new Uint8Array(图.rgb.length);
出.set(图.rgb);
const 出alpha = 图.alpha ? new Uint8Array(图.alpha) : null;

let 改了几个 = 0;
for (let 列 = 0; 列 < 列数; 列 += 1) {
  for (let y = 0; y < 格H; y += 1) {
    for (let x = 0; x < 格W; x += 1) {
      // 目标像素：第 右行 行、第 列 帧、格内 (x, y)
      const 目标x = 列 * 格W + x;
      const 目标y = 右行 * 格H + y;
      // 来源：第 左行 行、同一帧、格内水平镜像 (格W-1-x, y)
      const 源x = 列 * 格W + (格W - 1 - x);
      const 源y = 左行 * 格H + y;
      const si = (源y * 图.width + 源x) * 3;
      const di = (目标y * 图.width + 目标x) * 3;
      出[di] = 图.rgb[si];
      出[di + 1] = 图.rgb[si + 1];
      出[di + 2] = 图.rgb[si + 2];
      if (出alpha && 图.alpha) 出alpha[目标y * 图.width + 目标x] = 图.alpha[源y * 图.width + 源x];
      改了几个 += 1;
    }
  }
}

mkdirSync(出目录, { recursive: true });
const 成品 = { width: 图.width, height: 图.height, rgb: 出, ...(出alpha ? { alpha: 出alpha } : {}) };
写入PNG(join(出目录, '角色_刘看山_四方向行走16帧_32x48_已修.png'), 成品);
copyFileSync(join(出目录, '角色_刘看山_四方向行走16帧_32x48_已修.png'), 游戏);

console.log(`  第 ${左行 + 1} 行（朝左）水平镜像 → 第 ${右行 + 1} 行（朝右）`);
console.log(`  重写了 ${改了几个} 个像素`);
console.log(`  → ${游戏}`);
console.log('\n  这样左右完全对称，不会再出现"走两步回一次头"。');

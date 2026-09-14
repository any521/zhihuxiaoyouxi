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
 * 用法：
 *   node 工具/修行走表.mjs                                  # 默认修主角那张（老用法不变）
 *   node 工具/修行走表.mjs <成品png> [游戏目标png]            # 修任意一张（同事的四方向行走图）
 *
 * ⚠️ 2026-09 参数化：同事的四方向行走图也是同一套问题（第 4 行不朝右），
 *    所以把路径改成可传，而不是再写一个脚本。不传参数时行为**和以前完全一样**。
 */
import { mkdirSync, copyFileSync, existsSync } from 'node:fs';
import { join, resolve, dirname, basename } from 'node:path';
import { 读取PNG, 写入PNG } from './图像库.mjs';

const 根 = resolve(process.cwd());
const 参数 = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const 源 = resolve(
  参数[0] ?? join(根, '美术/素材库/成品/角色动画/角色_刘看山_四方向行走16帧_32x48.png'),
);
const 出目录 = join(dirname(源), '_已修');
/** 游戏里的目标；不传就**只修成品、不拷游戏**（拷游戏交给 工具/接入地图素材.mjs） */
const 游戏 = 参数[1] ? resolve(参数[1]) : null;

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
const 已修路径 = join(出目录, basename(源).replace(/\.png$/i, '_已修.png'));
写入PNG(已修路径, 成品);

// ⚠️ **必须同时覆盖"成品"目录里的源文件**。
//    只写 _已修/ 和游戏目录是不够的 —— 之后只要再跑一次 工具/接入地图素材.mjs，
//    它会从成品目录重新拷贝，把修复整个盖掉（这就是这个 bug 复发的原因）。
//    先备份一份原始文件。
const 备份 = 源.replace(/\.png$/, '_原始备份.png');
if (!existsSync(备份)) copyFileSync(源, 备份);
写入PNG(源, 成品);

console.log(`  第 ${左行 + 1} 行（朝左）水平镜像 → 第 ${右行 + 1} 行（朝右）`);
console.log(`  重写了 ${改了几个} 个像素`);
console.log(`  → ${源}（成品已就地修好，原图备份在 ${basename(备份)}）`);
if (游戏) {
  copyFileSync(已修路径, 游戏);
  console.log(`  → ${游戏}`);
} else {
  console.log('  （没给游戏目标，跳过拷贝；交给 工具/接入地图素材.mjs 就行）');
}
console.log('\n  这样左右完全对称，不会再出现"走两步回一次头"。');

/**
 * 处理 19 批的「墙面元素 6 枚」（零依赖）
 *
 * 输入：`美术/素材库/原图/19-地图重做/墙面元素_6枚.png`
 *      （2508×1672，**3 列 × 2 行**，纯品红背景；生成尺寸是 3:2，不是 1:1）
 * 输出：`美术/素材库/成品/道具/墙面元素/` + `liukanshan-career/public/assets/map/`
 *
 * ⚠️ 六格**不能按整张图找边界**（那会把六件东西框成一大块）。
 *    必须按格分别裁：先算出每格矩形 → 在格内找内容边界 → 缩放 → 拼回 32 的倍数。
 *
 * ⚠️ **右下角有「豆包AI生成」水印**（实测在最后一行底部、偏右）。
 *    第 6 格（楼层指示牌）正好离它最近，所以找边界时要**把水印那块挖掉**，
 *    否则指示牌的框会被撑到右下角、缩出来小得可怜。
 *
 * 命名与尺寸（**瓦片一格 = 32px**；这些都是"挂在墙上"的贴面，不挡路）：
 *   prop_wall_安全出口牌 24×16   prop_wall_灭火器 20×30   prop_wall_消防栓箱 26×30
 *   prop_wall_挂钟      28×28   prop_wall_窗户   52×40   prop_wall_指示牌 30×22
 *
 * 用法：node 工具/处理墙面元素.mjs
 */
import { mkdirSync, copyFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { 读取PNG, 写入PNG, 裁剪, 缩放到, 量化, 去毛边, 加描边 } from './图像库.mjs';

const 根 = resolve(process.cwd());
const 源 = join(根, '美术/素材库/原图/19-地图重做/墙面元素_6枚.png');
const 出目录 = join(根, '美术/素材库/成品/道具/墙面元素');
const 游戏 = join(根, 'liukanshan-career/public/assets/map');

/** 六格：格子序号（行优先）→ 成品名与尺寸。顺序 = 提示词里写的顺序 */
const 六格 = [
  { i: 0, 名: '安全出口牌', 游戏名: 'prop_wall_安全出口牌.png', 宽: 24, 高: 16 },
  { i: 1, 名: '灭火器', 游戏名: 'prop_wall_灭火器.png', 宽: 20, 高: 30 },
  { i: 2, 名: '消防栓箱', 游戏名: 'prop_wall_消防栓箱.png', 宽: 26, 高: 30 },
  { i: 3, 名: '挂钟', 游戏名: 'prop_wall_挂钟.png', 宽: 28, 高: 28 },
  { i: 4, 名: '窗户', 游戏名: 'prop_wall_窗户.png', 宽: 52, 高: 40 },
  { i: 5, 名: '楼层指示牌', 游戏名: 'prop_wall_指示牌.png', 宽: 30, 高: 22 },
];

/** 品红底（这个模型出的是 #f90fd2 一类，绿通道很低） */
const 是品红 = (r, g, b) => r > 170 && g < 120 && b > 170;

const 图 = 读取PNG(源);
const 列数 = 3;
const 行数 = 2;
const 格W = Math.floor(图.width / 列数);
const 格H = Math.floor(图.height / 行数);

/** 水印禁区：右下角那一块（相对整图） */
const 水印 = { x0: 图.width - 470, y0: 图.height - 190 };
console.log(`=== 处理墙面元素 ===\n源 ${图.width}×${图.height} · 每格 ${格W}×${格H}`);
console.log(`水印禁区：x ≥ ${水印.x0} 且 y ≥ ${水印.y0}\n`);

/** 在第 i 格里找内容边界（排除水印）；返回相对本格的矩形 */
function 格内边界(i) {
  const c = i % 列数;
  const r = Math.floor(i / 列数);
  const x0 = c * 格W;
  const y0 = r * 格H;
  let minX = 格W;
  let minY = 格H;
  let maxX = -1;
  let maxY = -1;
  let 数 = 0;
  for (let y = 0; y < 格H; y += 1) {
    for (let x = 0; x < 格W; x += 1) {
      const ax = x0 + x;
      const ay = y0 + y;
      if (ax >= 水印.x0 && ay >= 水印.y0) continue; // 水印不算内容
      const p = (ay * 图.width + ax) * 3;
      if (是品红(图.rgb[p], 图.rgb[p + 1], 图.rgb[p + 2])) continue;
      数 += 1;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  }
  return maxX < 0 ? null : { x: minX, y: minY, 宽: maxX - minX + 1, 高: maxY - minY + 1, 数 };
}

mkdirSync(出目录, { recursive: true });
mkdirSync(游戏, { recursive: true });

let 坏 = 0;
for (const 格 of 六格) {
  const b = 格内边界(格.i);
  if (!b) {
    console.log(`  ❌ ${格.名}：这一格没找到内容`);
    坏 += 1;
    continue;
  }
  // 抠出这一格的内容（多留 2px，免得把描边切掉）
  const 左 = Math.max(0, b.x - 2);
  const 上 = Math.max(0, b.y - 2);
  const 宽 = Math.min(格W - 左, b.宽 + 4);
  const 高 = Math.min(格H - 上, b.高 + 4);
  const 紧 = 裁剪(图, 格.i % 列数 * 格W + 左, Math.floor(格.i / 列数) * 格H + 上, 宽, 高);

  const 缩 = 缩放到(紧, 格.宽, 格.高);
  const 净 = 去毛边(缩);
  // ⚠️ 顺序不能反：先量化再加描边（反了描边会被量化掉色）
  const 量 = 量化(净);
  const 成品 = 加描边(量);

  写入PNG(join(出目录, `${格.名}.png`), 成品);
  copyFileSync(join(出目录, `${格.名}.png`), join(游戏, 格.游戏名));

  // 自检：面积占比（太小说明框错了）
  let 实 = 0;
  for (let k = 0; k < 格.宽 * 格.高; k += 1) {
    if (成品.alpha && 成品.alpha[k] < 128) continue;
    实 += 1;
  }
  const 占比 = 实 / (格.宽 * 格.高);
  const 用色 = new Set();
  for (let k = 0; k < 格.宽 * 格.高; k += 1) {
    用色.add((成品.rgb[k * 3] << 16) | (成品.rgb[k * 3 + 1] << 8) | 成品.rgb[k * 3 + 2]);
  }
  const 可疑 = 占比 < 0.25 || 占比 > 0.98;
  if (可疑) 坏 += 1;
  console.log(
    `  ${可疑 ? '⚠️' : '✅'} ${格.名.padEnd(6)} 格内内容 ${b.宽}×${b.高} → ${格.宽}×${格.高}` +
      ` · 占画布 ${(占比 * 100).toFixed(0)}% · ${用色.size} 色 → ${格.游戏名}${可疑 ? '  ← 占比可疑，看看框对不对' : ''}`,
  );
}

console.log(`\n输出：${出目录}`);
console.log(`接入：${游戏}`);
console.log(坏 ? `\n⚠️ ${坏} 件有问题` : '\n✅ 六件全部处理完');

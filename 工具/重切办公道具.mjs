/**
 * 重新切「06-道具/道具_办公_投递箱.png」这张表（零依赖）
 *
 * 为什么重切：这张表是**上左 + 上右 + 下方居中**的三件布局，
 * 之前用连通块切，把打印机切成了残块（内容只占左边一半，右边是空的），
 * 摆进地图看着就是"图坏了"。
 *
 * 这次改成**按区域分块**再取每块的紧致边界：
 *   区1 左上  x 0..512,   y 0..430   投递箱
 *   区2 右上  x 512..1024, y 0..430  资料架
 *   区3 下方  x 0..1024,  y 430..1024 打印机
 *
 * 用法：node 工具/重切办公道具.mjs
 */
import { mkdirSync, copyFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { 读取PNG, 写入PNG, 裁剪, 缩放到, 量化, 内容边界, 去毛边 } from './图像库.mjs';

const 根 = resolve(process.cwd());
const 源 = join(根, '美术/素材库/原图/06-道具/道具_办公_投递箱.png');
const 出目录 = join(根, '美术/素材库/成品/道具/办公设备');
const 游戏 = join(根, 'liukanshan-career/public/assets/map');

/** 三件的区域与目标尺寸 */
const 件 = [
  { 名: '投递箱', 区: [0, 0, 512, 430], 目标高: 48 },
  { 名: '资料架', 区: [512, 0, 1024, 430], 目标高: 48 },
  { 名: '打印机', 区: [0, 430, 1024, 1024], 目标高: 48 },
];

const 图 = 读取PNG(源);
console.log(`=== 重切办公道具 ===\n  源表 ${图.width}×${图.height}\n`);

for (const 一 of 件) {
  const [x1, y1, x2, y2] = 一.区;
  const 块 = 裁剪(图, x1, y1, x2 - x1, y2 - y1);

  // 在块里找**非背景**（透明 + 品红都算背景）的紧致边界
  const b = 内容边界(块);
  if (!b) {
    console.log(`  ❌ ${一.名}：区块里没找到内容`);
    continue;
  }
  // 留 2px 余量再裁，避免贴边
  const 左 = Math.max(0, b.minX - 2);
  const 上 = Math.max(0, b.minY - 2);
  const 宽 = Math.min(块.width - 左, b.宽 + 4);
  const 高 = Math.min(块.height - 上, b.高 + 4);

  const 紧 = 裁剪(块, 左, 上, 宽, 高);
  const 比例 = 一.目标高 / 高;
  const 目标宽 = Math.max(8, Math.round(宽 * 比例));
  const 缩 = 缩放到(紧, 目标宽, 一.目标高);
  const 净 = 去毛边(缩);
  const 成品 = 量化(净);

  mkdirSync(出目录, { recursive: true });
  写入PNG(join(出目录, `${一.名}.png`), 成品);
  copyFileSync(
    join(出目录, `${一.名}.png`),
    join(游戏, `prop_dev_${一.名}.png`),
  );

  const 用色 = new Set();
  for (let i = 0; i < 目标宽 * 一.目标高; i += 1) {
    用色.add((成品.rgb[i * 3] << 16) | (成品.rgb[i * 3 + 1] << 8) | 成品.rgb[i * 3 + 2]);
  }
  console.log(`  ✅ ${一.名}`);
  console.log(`     区块 ${x2 - x1}×${y2 - y1} → 内容 ${宽}×${高} → 成品 ${目标宽}×${一.目标高} · ${用色.size} 色`);
}

console.log(`\n输出：${出目录}`);
console.log(`接入：${游戏}`);

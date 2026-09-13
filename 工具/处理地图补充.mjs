/**
 * 处理地图补充素材（零依赖）
 *
 * 输入：`原图/17-地图补充/`（1024×1024，纯品红背景，正上方俯视）
 * 输出：`public/assets/map/` 里的三件成品
 *
 *   前台_接待台    → 96×48（挡路，占地 96×20）
 *   文化墙_照片墙  → 96×32（挡路，占地 96×10）
 *   工位名牌       → 24×16（桌面小件，不挡路）
 *
 * 用法：node 工具/处理地图补充.mjs
 */
import { mkdirSync, copyFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { 读取PNG, 写入PNG, 裁剪, 缩放到, 量化, 内容边界, 去毛边 } from './图像库.mjs';

const 根 = resolve(process.cwd());
const 源目录 = join(根, '美术/素材库/原图/17-地图补充');
const 出目录 = join(根, '美术/素材库/成品/道具/地图补充');
const 游戏 = join(根, 'liukanshan-career/public/assets/map');

const 件 = [
  { 源: '前台_接待台.png', 出: '前台_接待台.png', 游戏名: 'prop_front_前台.png', 成品W: 96, 成品H: 48 },
  { 源: '文化墙_照片墙.png', 出: '文化墙_照片墙.png', 游戏名: 'prop_front_文化墙.png', 成品W: 96, 成品H: 32 },
  { 源: '工位名牌.png', 出: '工位名牌.png', 游戏名: 'prop_desk_名牌.png', 成品W: 24, 成品H: 16 },
];

mkdirSync(出目录, { recursive: true });
mkdirSync(游戏, { recursive: true });

console.log('=== 处理地图补充素材 ===\n');

for (const 一 of 件) {
  const 原 = 读取PNG(join(源目录, 一.源));
  // 找非品红内容的紧致边界（内容边界 会把透明和品红都当背景）
  const b = 内容边界(原);
  if (!b) {
    console.log(`  ❌ ${一.源}：没找到内容`);
    continue;
  }
  // 留 3px 余量
  const 左 = Math.max(0, b.minX - 3);
  const 上 = Math.max(0, b.minY - 3);
  const 宽 = Math.min(原.width - 左, b.宽 + 6);
  const 高 = Math.min(原.height - 上, b.高 + 6);

  const 紧 = 裁剪(原, 左, 上, 宽, 高);
  const 缩 = 缩放到(紧, 一.成品W, 一.成品H);
  const 净 = 去毛边(缩);
  const 成品 = 量化(净);

  写入PNG(join(出目录, 一.出), 成品);
  copyFileSync(join(出目录, 一.出), join(游戏, 一.游戏名));

  const 用色 = new Set();
  for (let i = 0; i < 一.成品W * 一.成品H; i += 1) {
    用色.add((成品.rgb[i * 3] << 16) | (成品.rgb[i * 3 + 1] << 8) | 成品.rgb[i * 3 + 2]);
  }
  console.log(`  ✅ ${一.源}`);
  console.log(`     原图 ${原.width}×${原.height} · 内容 ${b.宽}×${b.高} → 成品 ${一.成品W}×${一.成品H} · ${用色.size} 色`);
  console.log(`     → ${一.游戏名}`);
}

console.log(`\n输出：${出目录}`);

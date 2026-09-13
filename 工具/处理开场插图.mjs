/**
 * 处理开场插图（零依赖）
 *
 * 三张的来源：
 *   开场_接到电话     1920×1088  16:9  → 直接缩
 *   开场_写字楼门口   1024×1024  1:1   → 先裁中间 16:9 一条再缩
 *   开场_工位第一天   1920×1072  16:9  → 直接缩
 *
 * 成品 512×288（游戏内部分辨率）+ 量化到 32 色板。
 *
 * 用法：node 工具/处理开场插图.mjs
 */
import { mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { 读取PNG, 写入PNG, 裁剪, 缩放到, 量化 } from './图像库.mjs';

const 根 = resolve(process.cwd());
const 源目录 = join(根, '美术/素材库/原图/16-开场插图');
const 背景目录 = join(根, '美术/素材库/成品/背景');
const 游戏目录 = join(根, 'liukanshan-career/public/assets/avg');

const 目标W = 512;
const 目标H = 288;

const 任务 = [
  { 源: '开场_接到电话.png', 出: '开场_接到电话.png', 游戏: 'bg_open_call.png' },
  // 1:1 的那张要裁中间一条。
  // ⚠️ 偏要取 1.0（贴底）：人物在源图 y 665~1000，靠下；
  //    取 0.55 会把人物切在底边（第一次就是这么错的）。
  { 源: '开场_写字楼门口.png', 出: '开场_写字楼门口.png', 游戏: 'bg_open_tower.png', 裁前下偏: 1.0 },
  { 源: '开场_工位第一天.png', 出: '开场_工位第一天.png', 游戏: 'bg_open_desk.png' },
];

mkdirSync(背景目录, { recursive: true });
mkdirSync(游戏目录, { recursive: true });

console.log('=== 处理开场插图 ===\n');

for (const 项 of 任务) {
  const 原 = 读取PNG(join(源目录, 项.源));
  let 图 = 原;
  let 裁记 = '';

  const 目标比 = 目标W / 目标H;
  const 原比 = 原.width / 原.height;
  if (Math.abs(原比 - 目标比) > 0.02) {
    // 需要裁成 16:9
    if (原比 > 目标比) {
      // 太宽：裁左右
      const 新W = Math.round(原.height * 目标比);
      const 左 = Math.round((原.width - 新W) / 2);
      图 = 裁剪(原, 左, 0, 新W, 原.height);
      裁记 = `裁左右 → ${新W}×${原.height}`;
    } else {
      // 太高：裁上下（用 裁前下偏 决定保留哪一段，0.5 = 居中）
      const 新H = Math.round(原.width / 目标比);
      const 偏 = 项.裁前下偏 ?? 0.5;
      const 上 = Math.max(0, Math.min(原.height - 新H, Math.round((原.height - 新H) * 偏)));
      图 = 裁剪(原, 0, 上, 原.width, 新H);
      裁记 = `裁上下（保留偏 ${偏}）→ ${原.width}×${新H}`;
    }
  }

  const 缩 = 缩放到(图, 目标W, 目标H);
  const 成品 = 量化(缩);

  const 用色 = new Set();
  for (let i = 0; i < 目标W * 目标H; i += 1) {
    用色.add((成品.rgb[i * 3] << 16) | (成品.rgb[i * 3 + 1] << 8) | 成品.rgb[i * 3 + 2]);
  }

  console.log(`  ✅ ${项.源}`);
  console.log(`     原图 ${原.width}×${原.height}${裁记 ? ' · ' + 裁记 : ''} → ${目标W}×${目标H} · ${用色.size} 色`);

  写入PNG(join(背景目录, 项.出), 成品);
  写入PNG(join(游戏目录, 项.游戏), 成品);
}

console.log(`\n输出：${背景目录}`);
console.log(`接入：${游戏目录}`);

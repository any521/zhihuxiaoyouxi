/**
 * 对称体检：拿网格算"正门 / 竖廊 / 前台 / 接待区家具"离**地图中轴**差多少。
 *
 * 为什么不用眼睛看：中轴在哪、门差几格，用像素截图根本量不准（相机裁切 + 缩放会骗人）。
 * 网格是唯一的事实来源。
 *
 * 用法：node tools/对称体检.mjs
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const 源 = readFileSync(resolve('src/game/map/level.ts'), 'utf8');
const 瓦片表 = {};
{
  const 块 = /export const 瓦片 = \{([\s\S]*?)\} as const;/.exec(源)?.[1] ?? '';
  for (const m of 块.matchAll(/^\s*([\u4e00-\u9fa5A-Za-z]+):\s*(\d+)/gm)) 瓦片表[m[1]] = Number(m[2]);
}
const 布局 = {};
{
  const 块 = /const 布局 = \{([\s\S]*?)\} as const;/.exec(源)?.[1] ?? '';
  for (const m of 块.matchAll(/^\s*([\u4e00-\u9fa5A-Za-z]+):\s*(\d+)/gm)) 布局[m[1]] = Number(m[2]);
  for (const m of 块.matchAll(/^\s*([\u4e00-\u9fa5A-Za-z]+):\s*\[(\d+),\s*(\d+)\]/gm)) {
    布局[m[1]] = [Number(m[2]), Number(m[3])];
  }
}
const 地图宽 = Number(/export const 地图宽 = (\d+)/.exec(源)[1]);
const 地图高 = Number(/export const 地图高 = (\d+)/.exec(源)[1]);
const 格 = Number(/export const 格 = (\d+)/.exec(源)[1]);

/** 地图中轴（像素）：45 格 = 1440px，中轴 720 = 第 22 格正中 */
const 中轴px = (地图宽 * 格) / 2;
const 中心 = (x) => x * 格 + 格 / 2; // 某一格中心的像素 x
const 偏 = (x) => 中心(x) - 中轴px;

console.log(`地图 ${地图宽}×${地图高} 格 = ${地图宽 * 格}×${地图高 * 格}px，中轴 x = ${中轴px}px（第 ${中轴px / 格} 格正中）\n`);

/* ── 1. 门的横向位置（手抄自 level.ts 的 门表；门表改了这里也要改） ── */
const 门表 = [
  ['北区南墙 · 会议室 A', 布局.北区南墙, 6],
  ['北区南墙 · 开放办公区西', 布局.北区南墙, 18],
  ['北区南墙 · 开放办公区东', 布局.北区南墙, 25],
  ['北区南墙 · 会议室 B', 布局.北区南墙, 37],
  ['南区北墙 · 茶水间', 布局.南区北墙, 6],
  ['南区北墙 · 文印区', 布局.南区北墙, 16],
  ['南区北墙 · 总监办公室', 布局.南区北墙, 28],
  ['南区北墙 · 储藏间', 布局.南区北墙, 38],
  ['竖廊穿南区南墙', 布局.南区南墙, 布局.竖廊西 + 1],
  ['公司正门', 布局.正门行, 布局.竖廊西 + 1],
];

console.log('门的位置（宽门 2 格，中心 = 左边那格中心 + 16px）：');
for (const [名, 行, 列] of 门表) {
  const 门中心 = 中心(列) + 16;
  const 差 = 门中心 - 中轴px;
  console.log(
    `  ${名.padEnd(22)} 行${String(行).padStart(2)} 列${列}-${列 + 1}  门中心 x=${门中心}px  ` +
      `离中轴 ${差 > 0 ? '+' : ''}${差}px（${(差 / 格).toFixed(2)} 格）`,
  );
}

/* ── 2. 竖廊 ── */
const 廊左 = 中心(布局.竖廊西);
const 廊右 = 中心(布局.竖廊东);
console.log(
  `\n竖向走廊：x${布局.竖廊西}-${布局.竖廊东}（${布局.竖廊东 - 布局.竖廊西 + 1} 格宽），` +
    `中心 x=${(廊左 + 廊右) / 2}px，离中轴 ${(廊左 + 廊右) / 2 - 中轴px}px`,
);
console.log(
  `  → 奇数条走廊时，只有 x${中轴px / 格 - 1}-${中轴px / 格 + 1}（3 格）能让中心正好落在地轴上；` +
    `2 格走廊永远差 16px。`,
);

/* ── 3. 房间边界 ── */
const 内左 = 布局.外墙;
const 内右 = 地图宽 - 布局.外墙 - 1;
console.log(
  `\n内部区 x${内左}..${内右}（中心 ${中心((内左 + 内右) / 2) || (中心(内左) + 中心(内右)) / 2}px）` +
    `，外墙圈 = 0..${布局.外墙 - 1} 和 ${地图宽 - 布局.外墙}..${地图宽 - 1}`,
);
const 南区 = { 茶水间: 布局.茶水间, 文印区: 布局.文印区, 总监办公室: 布局.总监办公室, 储藏间: 布局.储藏间 };
console.log('南区房间：');
for (const [名, [a, b]] of Object.entries(南区)) {
  console.log(`  ${名.padEnd(6)} x${a}..${b}  中心 ${(中心(a) + 中心(b)) / 2}px  离中轴 ${(中心(a) + 中心(b)) / 2 - 中轴px}px`);
}
console.log('南区四间房 + 竖廊（y14-21）：从上到下都是"房 / 墙 / 房"交替，竖廊夹在中间');
console.log('  → 竖廊取 3 格（x21-23）时中心正好落在地轴上，而且左右完全镜像：');
console.log('    茶水间 x2..10 ｜ 墙x11 ｜ 文印区 x12..20 ｜ 竖廊 x21..23 ｜ 墙x24 ｜ 总监办公室 x25..32 ｜ 墙x33 ｜ 储藏间 x34..42');

/* ── 4. 接待区家具 ── */
console.log('\n前台接待区家具（从 道具表 抠）：');
const 道具块 = /export const 道具表: 道具位\[\] = \[([\s\S]*?)\n\];/.exec(源)?.[1] ?? '';
const 接待 = [];
for (const m of 道具块.matchAll(/\{ 图: '([^']+)', x: (\d+), y: (\d+)([^}]*)\}/g)) {
  const [, 图, x, y] = m;
  if (Number(y) >= 布局.前台顶 && Number(y) <= 布局.前台底) 接待.push({ 图, x: Number(x), y: Number(y) });
}
for (const p of 接待) {
  console.log(
    `  ${p.图.padEnd(18)} (${p.x},${p.y})  精灵中心 x=${中心(p.x)}px  离中轴 ${中心(p.x) - 中轴px}px`,
  );
}

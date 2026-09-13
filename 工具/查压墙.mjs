/**
 * 检查「道具压墙」（零依赖）
 *
 * 问题：道具按**瓦片坐标**摆，但精灵宽度往往是 1.5 格（44~74px），
 * 摆在靠墙的那一格时，精灵会**盖到墙上去**（用户报的"投递箱压在墙上"就是这个）。
 *
 * 做法：把每件道具的精灵包围盒换算成像素，再和**挡路瓦片**（墙/玻璃）的格子求交，
 * 有交集就报出来。
 *
 * 用法：node 工具/查压墙.mjs
 */
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { 读取PNG } from './图像库.mjs';

const 根 = resolve(process.cwd());
const 游戏地图 = join(根, 'liukanshan-career/public/assets/map');

// 从 level.ts 里把 网格 / 瓦片 / 道具表 抠出来（不 import TS，直接正则读常量）
const level = readFileSync(join(根, 'liukanshan-career/src/game/map/level.ts'), 'utf8');

const 格 = 32;
const 宽 = Number(/export const 地图宽 = (\d+)/.exec(level)?.[1] ?? 0);
const 高 = Number(/export const 地图高 = (\d+)/.exec(level)?.[1] ?? 0);

/** 把 level.ts 里的 造网格 函数体照搬一份（保持和游戏完全一致） */
function 造网格(布局, 门表, 瓦片) {
  const g = [];
  for (let y = 0; y < 高; y += 1) g.push(new Array(宽).fill(瓦片.白墙));
  const 铺 = (x1, y1, x2, y2, t) => {
    for (let y = Math.max(0, y1); y <= Math.min(高 - 1, y2); y += 1)
      for (let x = Math.max(0, x1); x <= Math.min(宽 - 1, x2); x += 1) g[y][x] = t;
  };
  const 竖墙 = (x, y1, y2, t = 瓦片.白墙) => 铺(x, y1, x, y2, t);

  铺(布局.外墙, 布局.前台顶, 宽 - 布局.外墙 - 1, 布局.前台底, 瓦片.抛光砖);
  铺(布局.外墙, 布局.主走廊顶, 宽 - 布局.外墙 - 1, 布局.主走廊底, 瓦片.走廊地砖);
  铺(布局.竖廊西, 布局.南区北墙, 布局.竖廊东, 布局.前台顶 - 1, 瓦片.走廊地砖);
  铺(布局.会议室A[0], 布局.北区顶, 布局.会议室A[1], 布局.北区底, 瓦片.木地板);
  铺(布局.开放办公区[0], 布局.北区顶, 布局.开放办公区[1], 布局.北区底, 瓦片.浅灰地毯);
  铺(布局.会议室B[0], 布局.北区顶, 布局.会议室B[1], 布局.北区底, 瓦片.木地板);
  竖墙(布局.隔断西, 布局.北区顶, 布局.北区南墙, 瓦片.玻璃);
  竖墙(布局.隔断东, 布局.北区顶, 布局.北区南墙, 瓦片.玻璃);
  铺(布局.开放办公区[0], 布局.北区南墙, 布局.开放办公区[1], 布局.北区南墙, 瓦片.玻璃);
  铺(布局.茶水间[0], 布局.南区顶, 布局.茶水间[1], 布局.南区底, 瓦片.防滑砖);
  铺(布局.文印区[0], 布局.南区顶, 布局.文印区[1], 布局.南区底, 瓦片.防滑砖);
  铺(布局.总监办公室[0], 布局.南区顶, 布局.总监办公室[1], 布局.南区底, 瓦片.深灰地毯);
  铺(布局.储藏间[0], 布局.南区顶, 布局.储藏间[1], 布局.南区底, 瓦片.防滑砖);
  竖墙(布局.茶水间[1] + 1, 布局.南区顶, 布局.南区底);
  竖墙(布局.文印区[1] + 1, 布局.南区顶, 布局.南区底);
  竖墙(布局.总监办公室[0] - 1, 布局.南区顶, 布局.南区底);
  竖墙(布局.储藏间[0] - 1, 布局.南区顶, 布局.南区底);
  for (const [行, 列, w, t] of 门表) for (let i = 0; i < w; i += 1) g[行][列 + i] = t;
  for (let y = 0; y < 高; y += 1)
    for (let x = 0; x < 宽; x += 1) {
      const 外 = y < 布局.外墙 || y >= 高 - 布局.外墙 || x < 布局.外墙 || x >= 宽 - 布局.外墙;
      if (外) g[y][x] = 瓦片.白墙;
    }
  g[布局.正门行][布局.竖廊西] = 瓦片.门横;
  g[布局.正门行][布局.竖廊东] = 瓦片.门横;
  return g;
}

// 用正则把布局常量抠出来（简单可靠，不引入 TS 运行时）
const 取对象 = (名) => {
  const m = new RegExp(`const ${名} = \\{([\\s\\S]*?)\\} as const;`).exec(level);
  if (!m) return null;
  const o = {};
  for (const 行 of m[1].split('\n')) {
    // ⚠️ 数组值后面跟的是 `] as const,`，正则要允许中间有 ` as const`
    const mm = /^\s*([^\s:]+):\s*(\[[^\]]+\]|\d+)(?:\s+as const)?,/.exec(行);
    if (!mm) continue;
    o[mm[1]] = mm[2].startsWith('[')
      ? mm[2].slice(1, -1).split(',').map((s) => Number(s.trim()))
      : Number(mm[2]);
  }
  return o;
};

const 布局 = 取对象('布局');
const 瓦片m = /export const 瓦片 = \{([\s\S]*?)\} as const;/.exec(level);
const 瓦片 = {};
for (const 行 of 瓦片m[1].split('\n')) {
  const mm = /^\s*([^\s:]+):\s*(\d+),/.exec(行);
  if (mm) 瓦片[mm[1]] = Number(mm[2]);
}
const 门表 = [];
for (const m of level.matchAll(/\[布局\.(\w+), (布局\.\w+|\d+), (\d+), 瓦片\.(\w+)\]/g)) {
  const 行 = 布局[m[1]] ?? Number(m[1]);
  const 列 = typeof m[2] === 'string' && m[2].startsWith('布局') ? 布局[m[2].slice(3)] : Number(m[2]);
  门表.push([行, 列, Number(m[3]), 瓦片[m[4]]]);
}

const 网格 = 造网格(布局, 门表, 瓦片);
const 挡路 = new Set([瓦片.白墙, 瓦片.玻璃]);

/** 道具表：抠出 {图, x, y, 桌面, 偏移Y} */
const 道具表 = [];
for (const m of level.matchAll(/\{ 图: '([^']+)', x: (\d+), y: (\d+)([^}]*)\}/g)) {
  const 尾巴 = m[4] ?? '';
  道具表.push({
    图: m[1],
    x: Number(m[2]),
    y: Number(m[3]),
    桌面: /桌面: true/.test(尾巴),
    挂墙: /挂墙: true/.test(尾巴),
    偏移Y: Number(/偏移Y: (-?\d+)/.exec(尾巴)?.[1] ?? 0),
  });
}

console.log(`=== 检查道具压墙 ===\n  地图 ${宽}×${高} 格 · 道具 ${道具表.length} 件\n`);

let 问题数 = 0;
for (const p of 道具表) {
  if (p.桌面) continue; // 桌面小件压在桌上，不参与
  if (p.挂墙) continue; // 挂墙的（文化墙）本来就要压墙，是故意的
  const 路径 = join(游戏地图, `${p.图}.png`);
  let 精灵宽;
  try {
    精灵宽 = 读取PNG(路径).width;
  } catch {
    continue;
  }
  // 精灵：origin (0.5, 1) → 像素包围盒
  const 中心x = p.x * 格 + 格 / 2;
  const 底y = p.y * 格 + 格 + p.偏移Y;
  const 左 = 中心x - 精灵宽 / 2;
  const 右 = 中心x + 精灵宽 / 2 - 1;
  const 上 = 底y - 48;
  const 下 = 底y - 1;

  const gx1 = Math.floor(左 / 格);
  const gx2 = Math.floor(右 / 格);
  const gy1 = Math.floor(上 / 格);
  const gy2 = Math.floor(下 / 格);

  const 撞到 = [];
  for (let gy = gy1; gy <= gy2; gy += 1) {
    for (let gx = gx1; gx <= gx2; gx += 1) {
      if (gy < 0 || gx < 0 || gy >= 高 || gx >= 宽) continue;
      if (挡路.has(网格[gy][gx])) 撞到.push(`(${gx},${gy})`);
    }
  }
  if (撞到.length) {
    问题数 += 1;
    console.log(`  ❌ ${p.图.replace('prop_', '').padEnd(18)} 摆在 (${p.x},${p.y})  压到墙 ${撞到.length} 格：${撞到.slice(0, 6).join(' ')}`);
    console.log(`     精灵宽 ${精灵宽}px → 占格 x ${gx1}~${gx2}，建议挪到 x=${gx1 + (gx1 < p.x ? 1 : 0) + 1} 附近`);
  }
}

if (问题数 === 0) console.log('  ✅ 没有道具压在墙上');
else console.log(`\n  共 ${问题数} 件压墙，需要挪位置`);

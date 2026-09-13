/**
 * 道具重叠检查：两件**挡路**道具的占地矩形是不是压在一起。
 *
 * 为什么要单独做：`工具/查压墙.mjs` 只查"道具 vs 墙"，不查"道具 vs 道具" ——
 * 实测文印区两台打印机和投递箱挤成一团，工具却是绿的。
 *
 * 判定用的和游戏一样的数据：`占地表`（宽×高，底边对齐）。
 *
 * 用法：node tools/查重叠.mjs           # 全部挡路道具
 *      node tools/查重叠.mjs 2           # 只报重叠面积 ≥ 2 格的（默认 1 格）
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const 源 = readFileSync(resolve('src/game/map/level.ts'), 'utf8');
const 格 = Number(/export const 格 = (\d+)/.exec(源)[1]);

/** 占地表：图名 → [宽, 高] */
const 占地表 = {};
{
  const 块 = /export const 占地表: Record<string, \[number, number\]> = \{([\s\S]*?)\n\};/.exec(源)?.[1] ?? '';
  for (const m of 块.matchAll(/^\s*([A-Za-z_][\w\u4e00-\u9fa5]*):\s*\[(\d+),\s*(\d+)\]/gm)) {
    占地表[m[1]] = [Number(m[2]), Number(m[3])];
  }
}

/** 道具表里"挡路"的那些 */
const 道具 = [];
{
  const 块 = /export const 道具表: 道具位\[\] = \[([\s\S]*?)\n\];/.exec(源)?.[1] ?? '';
  for (const m of 块.matchAll(/\{ 图: '([^']+)', x: (\d+), y: (\d+)([^}]*)\}/g)) {
    const [, 图, x, y, 尾] = m;
    if (/桌面: true/.test(尾)) continue; // 桌面小件不挡路、也不算重叠
    const [宽, 高] = 占地表[图] ?? [44 * 0.85, 48 * 0.4];
    const 中心x = Number(x) * 格 + 格 / 2;
    const 底y = Number(y) * 格 + 格;
    const 偏移 = /偏移Y: (-?\d+)/.exec(尾);
    const 底 = 底y + (偏移 ? Number(偏移[1]) : 0);
    道具.push({
      图,
      x: Number(x),
      y: Number(y),
      左: 中心x - 宽 / 2,
      右: 中心x + 宽 / 2,
      上: 底 - 高,
      下: 底,
      宽,
      高,
    });
  }
}

const 阈值 = Number(process.argv[2] ?? 1) * 格 * 格;
const 重叠 = [];
for (let i = 0; i < 道具.length; i += 1) {
  for (let j = i + 1; j < 道具.length; j += 1) {
    const a = 道具[i];
    const b = 道具[j];
    const 横 = Math.min(a.右, b.右) - Math.max(a.左, b.左);
    const 纵 = Math.min(a.下, b.下) - Math.max(a.上, b.上);
    if (横 <= 0 || 纵 <= 0) continue;
    const 面积 = 横 * 纵;
    if (面积 >= 阈值) {
      重叠.push({ a, b, 横, 纵, 面积, 格数: +(面积 / (格 * 格)).toFixed(2) });
    }
  }
}

重叠.sort((p, q) => q.面积 - p.面积);
console.log(`挡路道具 ${道具.length} 件，重叠 ${重叠.length} 对（阈值 ${阈值 / (格 * 格)} 格²）\n`);
for (const o of 重叠) {
  console.log(
    `  ${o.a.图}(${o.a.x},${o.a.y})  与  ${o.b.图}(${o.b.x},${o.b.y})` +
      `   重叠 ${o.横}×${o.纵}px = ${o.格数} 格²`,
  );
}
if (!重叠.length) console.log('  （没有重叠）');

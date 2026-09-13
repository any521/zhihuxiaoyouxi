/**
 * 按「查压墙」的结果把压墙的道具挪进来（零依赖）
 *
 * 规则：精灵宽约 1.5 格，摆在贴着墙的那一格时一定会盖到墙上。
 *      所以**离墙至少留 1 格**。
 *
 * 用法：node 工具/挪压墙道具.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const 根 = resolve(process.cwd());
const 文件 = join(根, 'liukanshan-career/src/game/map/level.ts');
let 文 = readFileSync(文件, 'utf8');

/** [旧整行（含坐标，保证唯一）, 新整行] */
const 挪动 = [
  // 会议室 A：左边贴着外墙
  ["{ 图: 'prop_ws_绿植', x: 2, y: 3 },", "{ 图: 'prop_ws_绿植', x: 3, y: 3 },"],
  // 茶水间：左边贴着外墙
  ["{ 图: 'prop_pantry_咖啡机', x: 2, y: 16 },", "{ 图: 'prop_pantry_咖啡机', x: 3, y: 16 },"],
  ["{ 图: 'prop_ws_饮水机', x: 2, y: 19 },", "{ 图: 'prop_ws_饮水机', x: 3, y: 19 },"],
  // 茶水间：右下角贴着隔墙
  ["{ 图: 'prop_ws_垃圾桶', x: 10, y: 21 },", "{ 图: 'prop_ws_垃圾桶', x: 9, y: 21 },"],
  ["{ 图: 'prop_ws_绿植', x: 10, y: 19 },", "{ 图: 'prop_ws_绿植', x: 9, y: 19 },"],
  // 文印区：左边贴着隔墙（用户报的那件）
  ["{ 图: 'prop_dev_投递箱', x: 12, y: 16 },", "{ 图: 'prop_dev_投递箱', x: 13, y: 16 },"],
  ["{ 图: 'prop_dev_资料架', x: 12, y: 20 },", "{ 图: 'prop_dev_资料架', x: 13, y: 20 },"],
  // 文印区：右边贴着竖廊隔墙
  ["{ 图: 'prop_ws_垃圾桶', x: 20, y: 21 },", "{ 图: 'prop_ws_垃圾桶', x: 19, y: 21 },"],
  ["{ 图: 'prop_ws_绿植', x: 20, y: 19 },", "{ 图: 'prop_ws_绿植', x: 19, y: 19 },"],
  // 总监办公室：左边贴着隔墙
  ["{ 图: 'prop_ws_绿植', x: 24, y: 15 },", "{ 图: 'prop_ws_绿植', x: 25, y: 15 },"],
  ["{ 图: 'prop_ws_垃圾桶', x: 32, y: 21 },", "{ 图: 'prop_ws_垃圾桶', x: 31, y: 21 },"],
  // 储藏间：左边贴着隔墙
  ["{ 图: 'prop_ws_垃圾桶', x: 34, y: 21 },", "{ 图: 'prop_ws_垃圾桶', x: 35, y: 21 },"],
  // 主走廊的两盆绿植：摆在 y11 会顶到北区南墙，往下挪一格
  ["{ 图: 'prop_ws_绿植', x: 12, y: 11 },", "{ 图: 'prop_ws_绿植', x: 12, y: 12 },"],
  ["{ 图: 'prop_ws_绿植', x: 31, y: 11 },", "{ 图: 'prop_ws_绿植', x: 31, y: 12 },"],
];

let 改了 = 0;
const 没找到 = [];
for (const [旧, 新] of 挪动) {
  if (文.includes(旧)) {
    文 = 文.replace(旧, 新);
    改了 += 1;
  } else {
    没找到.push(旧);
  }
}

writeFileSync(文件, 文, 'utf8');

console.log('=== 挪压墙的道具 ===');
console.log(`  改了 ${改了} / ${挪动.length} 处`);
if (没找到.length) {
  console.log('  ⚠️ 没匹配到的：');
  没找到.forEach((x) => console.log(`     ${x}`));
}

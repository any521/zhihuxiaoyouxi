/**
 * 挡路体检：查"哪些家具把**通道**堵了"。
 *
 * 为什么要它：`查压墙.mjs` 查的是"道具压在墙上"、`查重叠.mjs` 查的是"道具互相压"，
 * 但**"家具把走道堵住"这两件都查不出来**（家具明明合法地放在地板上）。
 * 用户说的"右边的装饰要靠墙不要挡路"就是这个问题。
 *
 * 做法：
 *   一、先算"没家具时哪些格子是通的"（用瓦片：墙/玻璃/关门不可走）
 *   二、再算"加上家具占地之后通不通"
 *   三、把**关键连通对**各跑一遍 A*：过不去 = 被堵了
 *
 * 关键连通对（都该走得通）：
 *   前台 ←→ 主走廊        （进门动线）
 *   主走廊 ←→ 开放办公区   （两个门）
 *   主走廊 ←→ 茶水间 / 文印区 / 总监办公室 / 储藏间
 *   前台 ←→ 竖廊 ←→ 主走廊
 *
 * 用法（在游戏仓库根跑）：node 工具/查挡路.mjs
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const 源 = readFileSync(resolve('liukanshan-career/src/game/map/level.ts'), 'utf8');
const 格 = 32;
const 地图宽 = Number(/export const 地图宽 = (\d+)/.exec(源)[1]);
const 地图高 = Number(/export const 地图高 = (\d+)/.exec(源)[1]);

/** 瓦片号 */
const 瓦 = {};
{
  const 块 = /export const 瓦片 = \{([\s\S]*?)\} as const;/.exec(源)[1];
  for (const m of 块.matchAll(/^\s*([\u4e00-\u9fa5A-Za-z]+):\s*(\d+)/gm)) 瓦[m[1]] = Number(m[2]);
}
/** 占地表 */
const 占地表 = {};
{
  const 块 = /export const 占地表: Record<string, \[number, number\]> = \{([\s\S]*?)\n\};/.exec(源)[1];
  for (const m of 块.matchAll(/^\s*([A-Za-z_][\w\u4e00-\u9fa5]*):\s*\[(\d+),\s*(\d+)\]/gm)) {
    占地表[m[1]] = [Number(m[2]), Number(m[3])];
  }
}
/** 道具表 */
const 道具 = [];
{
  const 块 = /export const 道具表: 道具位\[\] = \[([\s\S]*?)\n\];/.exec(源)[1];
  for (const m of 块.matchAll(/\{ 图: '([^']+)', x: (\d+), y: (\d+)([^}]*)\}/g)) {
    道具.push({ 图: m[1], x: Number(m[2]), y: Number(m[3]), 尾: m[4] });
  }
}

/* ── 复刻 造网格()（按"只铺地、砌墙、最后开门"的顺序）── */
const 布局 = {};
{
  const 块 = /const 布局 = \{([\s\S]*?)\} as const;/.exec(源)[1];
  for (const m of 块.matchAll(/^\s*([\u4e00-\u9fa5A-Za-z]+):\s*(\d+)/gm)) 布局[m[1]] = Number(m[2]);
  for (const m of 块.matchAll(/^\s*([\u4e00-\u9fa5A-Za-z]+):\s*\[(\d+),\s*(\d+)\]/gm)) 布局[m[1]] = [Number(m[2]), Number(m[3])];
}
const g = [];
for (let y = 0; y < 地图高; y += 1) g.push(new Array(地图宽).fill(瓦.白墙));
const 铺 = (x1, y1, x2, y2, t) => {
  for (let y = Math.max(0, y1); y <= Math.min(地图高 - 1, y2); y += 1)
    for (let x = Math.max(0, x1); x <= Math.min(地图宽 - 1, x2); x += 1) g[y][x] = t;
};
const 竖墙 = (x, y1, y2, t = 瓦.白墙) => 铺(x, y1, x, y2, t);
铺(布局.外墙, 布局.前台顶, 地图宽 - 布局.外墙 - 1, 布局.前台底, 瓦.抛光砖);
铺(布局.外墙, 布局.主走廊顶, 地图宽 - 布局.外墙 - 1, 布局.主走廊底, 瓦.走廊地砖);
铺(布局.会议室A[0], 布局.北区顶, 布局.会议室A[1], 布局.北区底, 瓦.木地板);
铺(布局.开放办公区[0], 布局.北区顶, 布局.开放办公区[1], 布局.北区底, 瓦.浅灰地毯);
铺(布局.会议室B[0], 布局.北区顶, 布局.会议室B[1], 布局.北区底, 瓦.木地板);
竖墙(布局.隔断西, 布局.北区顶, 布局.北区南墙, 瓦.玻璃);
竖墙(布局.隔断东, 布局.北区顶, 布局.北区南墙, 瓦.玻璃);
铺(布局.开放办公区[0], 布局.北区南墙, 布局.开放办公区[1], 布局.北区南墙, 瓦.玻璃);
铺(布局.茶水间[0], 布局.南区顶, 布局.茶水间[1], 布局.南区底, 瓦.防滑砖);
铺(布局.文印区[0], 布局.南区顶, 布局.文印区[1], 布局.南区底, 瓦.防滑砖);
铺(布局.总监办公室[0], 布局.南区顶, 布局.总监办公室[1], 布局.南区底, 瓦.深灰地毯);
铺(布局.储藏间[0], 布局.南区顶, 布局.储藏间[1], 布局.南区底, 瓦.防滑砖);
竖墙(布局.茶水间[1] + 1, 布局.南区顶, 布局.南区底);
竖墙(布局.文印区[1] + 1, 布局.南区顶, 布局.南区底);
竖墙(布局.总监办公室[0] - 1, 布局.南区顶, 布局.南区底);
竖墙(布局.储藏间[0] - 1, 布局.南区顶, 布局.南区底);
// 外墙
for (let y = 0; y < 地图高; y += 1)
  for (let x = 0; x < 地图宽; x += 1)
    if (y < 布局.外墙 || y >= 地图高 - 布局.外墙 || x < 布局.外墙 || x >= 地图宽 - 布局.外墙) g[y][x] = 瓦.白墙;
// 竖廊（在墙之后）
铺(布局.竖廊西, 布局.南区北墙, 布局.竖廊东, 布局.前台顶 - 1, 瓦.走廊地砖);
// 门
const 门们 = [...源.matchAll(/\[布局\.(北区南墙|南区北墙|南区南墙|正门行),\s*(布局\.[\u4e00-\u9fa5]+|\d+),\s*瓦片\.门横左\]/g)]
  .map((m) => [布局[m[1]], m[2].startsWith('布局') ? 布局[m[2].slice(3)] : Number(m[2])]);
for (const [行, 列] of 门们) {
  g[行][列] = 瓦.门横左;
  g[行][列 + 1] = 瓦.门横右;
}

const 挡路瓦 = new Set([瓦.白墙, 瓦.玻璃]);
/** 只有瓦片时通不通（门算通） */
const 通瓦 = (x, y) => x >= 0 && y >= 0 && x < 地图宽 && y < 地图高 && !挡路瓦.has(g[y][x]);

/* ── 家具占格 ── */
const 家具挡 = new Set();
const 家具名 = new Map();
for (const p of 道具) {
  if (/桌面: true/.test(p.尾)) continue;
  const [宽, 高] = 占地表[p.图] ?? [44 * 0.85, 48 * 0.4];
  const 中心x = p.x * 格 + 格 / 2;
  const 底y = p.y * 格 + 格;
  const 偏 = /偏移Y: (-?\d+)/.exec(p.尾);
  const 底 = 底y + (偏 ? Number(偏[1]) : 0);
  const gx1 = Math.floor((中心x - 宽 / 2) / 格);
  const gx2 = Math.floor((中心x + 宽 / 2 - 1) / 格);
  const gy1 = Math.floor((底 - 高) / 格);
  const gy2 = Math.floor((底 - 1) / 格);
  for (let y = Math.max(0, gy1); y <= Math.min(地图高 - 1, gy2); y += 1)
    for (let x = Math.max(0, gx1); x <= Math.min(地图宽 - 1, gx2); x += 1) {
      if (!通瓦(x, y)) continue; // 本来就不可走的格子不参与
      家具挡.add(`${x},${y}`);
      家具名.set(`${x},${y}`, p.图);
    }
}

/** A*：从 (x1,y1) 到 (x2,y2)，障碍 = 挡路瓦片 + 家具 */
function 可达(x1, y1, x2, y2, 用家具) {
  const 键 = (x, y) => y * 地图宽 + x;
  const 通 = (x, y) => {
    if (!通瓦(x, y)) return false;
    if (用家具 && 家具挡.has(`${x},${y}`)) return false;
    return true;
  };
  if (!通(x1, y1) || !通(x2, y2)) return false;
  const 开 = [键(x1, y1)];
  const 来 = new Set([键(x1, y1)]);
  while (开.length) {
    const 当 = 开.shift();
    if (当 === 键(x2, y2)) return true;
    const cx = 当 % 地图宽;
    const cy = Math.floor(当 / 地图宽);
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = cx + dx;
      const ny = cy + dy;
      const k = 键(nx, ny);
      if (来.has(k) || !通(nx, ny)) continue;
      来.add(k);
      开.push(k);
    }
  }
  return false;
}

/** 关键连通对：名字 → [起点, 终点]（都用"房间中心/门口内侧"这类一定是可走地的点） */
const 点 = {
  前台: [21, 26],
  竖廊: [22, 20],
  主走廊中: [20, 12],
  主走廊西: [8, 12],
  主走廊东: [36, 12],
  茶水间: [6, 18],
  文印区: [15, 18],
  总监办公室: [28, 19],
  储藏间: [38, 18],
  开放办公区: [20, 6],
  // ⚠️ 会议室那两个点**不能取房间正中**：正中是会议长桌/小圆桌（不可走），
  //    那样测出来永远是"堵死"（踩过）。取门口内侧的空地。
  会议室A: [6, 9],
  会议室B: [37, 9],
};
const 对 = [
  ['前台 → 竖廊', 点.前台, 点.竖廊],
  ['竖廊 → 主走廊中', 点.竖廊, 点.主走廊中],
  ['主走廊西 → 主走廊东', 点.主走廊西, 点.主走廊东],
  ['主走廊中 → 茶水间', 点.主走廊中, 点.茶水间],
  ['主走廊中 → 文印区', 点.主走廊中, 点.文印区],
  ['主走廊中 → 总监办公室', 点.主走廊中, 点.总监办公室],
  ['主走廊西 → 开放办公区', 点.主走廊西, 点.开放办公区],
  ['主走廊中 → 会议室A', 点.主走廊中, 点.会议室A],
  ['主走廊中 → 会议室B', 点.主走廊中, 点.会议室B],
  ['前台 → 茶水间（整条动线）', 点.前台, 点.茶水间],
];

console.log('=== 通道连通体检（家具算不算挡路）===\n');
let 坏 = 0;
for (const [名, a, b] of 对) {
  const 无家具 = 可达(a[0], a[1], b[0], b[1], false);
  const 有家具 = 可达(a[0], a[1], b[0], b[1], true);
  const 判 = 有家具 ? (无家具 ? '✅ 通' : '✅ 通（本来就窄）') : '❌ 被家具堵死';
  if (!有家具) 坏 += 1;
  console.log(`  ${名.padEnd(22)} ${判}`);
}

/** 画一段网格：█ 墙 ▒ 玻璃 ╪ 门 × 家具 · 空地 */
function 画(标题, y1, y2, x1, x2) {
  console.log(`\n=== ${标题}（行 ${y1}~${y2}，列 ${x1}~${x2}）===\n`);
  let 标 = '     ';
  for (let x = x1; x <= x2; x += 1) 标 += x % 10 === 0 ? String((x / 10) % 10) : ' ';
  console.log(标);
  标 = '     ';
  for (let x = x1; x <= x2; x += 1) 标 += String(x % 10);
  console.log(标);
  for (let y = y1; y <= y2; y += 1) {
    let 行 = '';
    for (let x = x1; x <= x2; x += 1) {
      const t = g[y][x];
      if (t === 瓦.白墙) 行 += '█';
      else if (t === 瓦.玻璃) 行 += '▒';
      else if (t === 瓦.门横左 || t === 瓦.门横右) 行 += '╪';
      else if (家具挡.has(`${x},${y}`)) 行 += '×';
      else 行 += '·';
    }
    console.log(String(y).padStart(4) + ' ' + 行);
  }
}
if (坏) {
  画('开放办公区南侧到主走廊（找堵在哪）', 4, 12, 12, 31);
  画('会议室 A 到主走廊', 4, 12, 2, 12);
}

/* ── 逐件家具：把它拿掉，看有没有连通对被打开 ── */
console.log('\n=== 哪些家具压在"关键格"上（拿掉就能打开通道）===\n');
const 堵的 = [];
for (const k of 家具挡) {
  const [x, y] = k.split(',').map(Number);
  // 只看"家具本身在通路上"的：它四邻里有 2 个以上可走格（说明它在走廊/门口里）
  let 邻 = 0;
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (通瓦(x + dx, y + dy)) 邻 += 1;
  if (邻 >= 3) 堵的.push({ x, y, 图: 家具名.get(k) });
}
if (!堵的.length) console.log('  （没有家具卡在通路上）');
for (const d of 堵的) console.log(`  ${d.图.padEnd(20)} (${d.x},${d.y}) 三面以上是空地 → 像是摆在通道里`);
console.log(`\n关键连通对：${对.length} 组，堵死 ${坏} 组`);
process.exit(坏 ? 1 : 0);

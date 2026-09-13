/**
 * 道具卡体检：把主角依次放到若干家具旁边，检查
 *   ① 右下角真的弹出了卡片
 *   ② 卡片文案和 `story/道具卡.ts` 里写的一致（不是串行的旧内容）
 *   ③ 离开之后卡片会消失
 *   ④ 全地图**每件配了卡的道具**是不是都能被触发（覆盖率）
 *
 * 为什么要跑：靠近判定写偏一格，就会"站在打印机上却没卡片"，
 * 而截图上看不出来（人眼没法判断"这一格算不算靠近"）。
 *
 * 用法：node tools/道具卡体检.mjs
 */
import { existsSync } from 'node:fs';
import puppeteer from 'puppeteer-core';

const EDGE = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
].find((p) => existsSync(p));
const 等 = (ms) => new Promise((r) => setTimeout(r, ms));
const 浏览器 = await puppeteer.launch({
  executablePath: EDGE,
  headless: 'new',
  args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--no-sandbox'],
});
const 页 = await 浏览器.newPage();
await 页.setViewport({ width: 1440, height: 900 });
页.on('pageerror', (e) => console.log(`[页面错误] ${e.message}`));
await 页.goto('http://127.0.0.1:5273/', { waitUntil: 'networkidle2' });
await 页.waitForFunction(() => typeof window.__lksStory === 'function', { timeout: 20000 });
await 等(600);
await 页.evaluate(() => window.__lksStory.setState({ 屏幕: 'map', 段号: 1 }));
await 页.waitForFunction(() => !!window.__lksMap, { timeout: 20000 });
await 等(1000);

/** 站到某格，读卡片 */
async function 站(格x, 格y) {
  await 页.evaluate(
    ({ 格x, 格y }) => {
      window.__lksMap.传送像素(格x * 32 + 16, 格y * 32 + 32);
    },
    { 格x, 格y },
  );
  // ⚠️ 不直接调场景的私有方法（那会绕开真实路径），而是等它自己跑到 update()
  await 等(160);
  return 页.evaluate(() => {
    const el = document.querySelector('.map-prop');
    return {
      物: window.__lksStory.getState().附近物,
      有卡: !!el,
      标题: el ? (el.querySelector('.map-prop-head')?.textContent ?? '') : '',
      用途: el ? (el.querySelector('.map-prop-use')?.textContent ?? '') : '',
    };
  });
}

/** 关键家具：站在它**正下方那一格**（人站在桌前的正常位置） */
const 抽查 = [
  { 名: '打印机', 站: [14, 17] },
  { 名: '投递箱', 站: [13, 17] },
  { 名: '前台', 站: [16, 23] },
  { 名: '工位办公桌', 站: [24, 4] },
  { 名: '咖啡机', 站: [3, 17] },
  { 名: '门', 站: [22, 22] },
  { 名: '盆栽', 站: [29, 4] },
];

console.log('=== 站在家具前，看卡片 ===\n');
let 坏 = 0;
for (const t of 抽查) {
  const r = await 站(t.站[0], t.站[1]);
  const 对 = r.有卡 && r.标题.length > 0;
  if (!对) 坏 += 1;
  console.log(
    `${t.名.padEnd(7)} 站(${t.站[0]},${t.站[1]})  ${对 ? '✓' : '✗ 没卡'}  ` +
      `${r.有卡 ? `「${r.标题}」 ${r.用途.slice(0, 26)}…` : `附近物=${JSON.stringify(r.物)}`}`,
  );
}

/* ── 覆盖率：只扫"有道具的那些格子" ──
   ⚠️ 不整图扫（45×30=1350 格，每格都要等一帧，太慢）；
      改成从 道具表 反推每件道具周围 3×3 格，逐格站一遍。 */
const 覆盖 = await 页.evaluate(async () => {
  const s = window.__lksMap;
  const 见到 = new Set();
  const 全部 = new Set();
  // 道具表不在 window 上，就用场景里已经建好的精灵反查位置
  const 位置们 = [];
  for (const o of s.children.list) {
    if (!o.texture || !o.texture.key.startsWith('prop_')) continue;
    全部.add(o.texture.key);
    const gx = Math.floor((o.x - 16) / 32);
    const gy = Math.floor((o.y - 32) / 32);
    位置们.push([gx, gy]);
  }
  const 已站 = new Set();
  for (const [gx, gy] of 位置们) {
    for (let dy = -1; dy <= 1; dy += 1) {
      for (let dx = -1; dx <= 1; dx += 1) {
        const x = gx + dx;
        const y = gy + dy;
        const k = `${x},${y}`;
        if (已站.has(k)) continue;
        已站.add(k);
        s.传送像素(x * 32 + 16, y * 32 + 32);
        await new Promise((r) => setTimeout(r, 45));
        const 物 = window.__lksStory.getState().附近物;
        if (物) 见到.add(物.种类 === '道具' ? 物.键 : `格子:${物.键}`);
      }
    }
  }
  return { 见到: [...见到], 道具种类: [...全部], 站过: 已站.size };
});

console.log(`\n=== 每件道具周围 3×3 格都站一遍（共 ${覆盖.站过} 格）===`);
console.log(`触发到的卡（${覆盖.见到.length} 种）：\n  ${覆盖.见到.join('\n  ')}`);
const 没触发 = 覆盖.道具种类.filter((k) => !覆盖.见到.includes(k));
console.log(`\n地图上有、但**一次都没触发**的道具类型（${没触发.length}）：`);
console.log(没触发.length ? `  ${没触发.join('\n  ')}` : '  （无）');
if (没触发.length) {
  console.log(
    '\n⚠️ 上面这些要逐个确认是不是"本来就触发不到"：\n' +
      '   · 摆在**不可走的格子**上的桌面小件（例如总监办公室桌上的笔筒）\n' +
      '     —— 玩家站不到那格，卡片永远显示不出来，所以故意没给它配卡\n' +
      '   · 如果是别的道具，那就是漏配卡或靠近判定太严，要改',
  );
}

console.log(坏 ? `\n✗ ${坏} 个抽查点没弹卡` : '\n✓ 抽查点全部弹卡');

/* ── 人物卡：站到每位同事旁边，看有没有弹 ── */
console.log('\n=== 站在同事旁边，看人物卡 ===');
const 同事点 = [
  { 名: '阿麦', 站: [15, 5] },
  { 名: '周岚', 站: [18, 5] },
  { 名: '小鹿', 站: [21, 5] },
  { 名: '韩策', 站: [24, 9] },
  { 名: '林总', 站: [28, 18] },
];
let 人坏 = 0;
for (const t of 同事点) {
  // ⚠️ 不能只在同一个格子里传送 —— 判定是"换格才重算"，
  //    在同一格里反复传送时它根本不重算（前面道具抽查就踩过这个）。
  await 页.evaluate(
    ({ x, y }) => {
      const s = window.__lksMap;
      s.传送像素(x * 32 + 16, y * 32 + 32);
    },
    { x: t.站[0], y: t.站[1] },
  );
  await 等(170);
  const r = await 页.evaluate(() => ({
    人: window.__lksStory.getState().附近人,
    卡: (() => {
      // ⚠️ 选择器是 `.map-prop.who`（两个 class），不是 `.map-prop-who`
      const el = document.querySelector('.map-prop.who');
      return el ? (el.querySelector('.map-prop-head')?.textContent ?? '') : '';
    })(),
    附近物: window.__lksStory.getState().附近物,
    DOM里有: [...document.querySelectorAll('.map-prop')].map((e) => e.className),
    // 调试：场景里到底有没有 NPC、名字挂上没、回调在不在
    NPC数: (() => {
      const s = window.__lksMap;
      return (s.NPC们 ?? []).map((o) => ({ 名: o.getData('名') ?? null, x: Math.round(o.x), y: Math.round(o.y) }));
    })(),
    有回调: typeof window.__lksMap.回调?.附近人变了,
    格: window.__lksMap.位置(),
  }));
  const 对 = r.人 === t.名 && r.卡.includes(t.名);
  if (!对) 人坏 += 1;
  console.log(
    `${t.名.padEnd(4)} 站(${t.站[0]},${t.站[1]})  ${对 ? '✓' : '✗'}  附近人=${r.人}  卡片=「${r.卡}」` +
      (对 ? '' : `  【DOM=${JSON.stringify(r.DOM里有)} 附近物=${JSON.stringify(r.附近物)}】`),
  );
}
console.log(人坏 ? `\n✗ ${人坏} 位同事没弹卡` : '\n✓ 五位同事全部弹人物卡');
await 浏览器.close();

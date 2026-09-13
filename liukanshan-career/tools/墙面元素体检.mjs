/**
 * 墙面元素体检：查每件"挂墙"的东西**到底贴在什么上面**。
 *
 * 为什么要专门做：墙面元素允许压墙（查压墙工具会跳过它们），
 * 但"压在**玻璃**上""压门上""飘在地板上"都是错的 —— 那些工具都查不出来。
 * 实测踩过：出口牌摆到「开放办公区朝走廊的玻璃」那一格上，绿色牌子混在蓝色玻璃纹里，
 * 看着就不像贴在实墙上。
 *
 * 判定（按元素所在的那一格）：
 *   白墙   → ✅ 可以贴
 *   玻璃   → ❌ 不该贴（用户要求"把玻璃上的去掉"）
 *   门     → ❌ 不该贴（会挡住门口标识）
 *   地板   → ❌ 那是"掉在地上"，不是贴墙
 *
 * 用法（在游戏目录跑）：node tools/墙面元素体检.mjs
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

const r = await 页.evaluate(() => {
  const s = window.__lksMap;
  const 图层 = s.图层;
  const 名 = {
    0: '浅灰地毯', 1: '深灰地毯', 2: '防滑砖', 3: '抛光砖', 4: '走廊地砖', 5: '木地板',
    6: '白墙', 7: '玻璃', 8: '门', 9: '门', 10: '门', 11: '门', 12: '门', 13: '门', 14: '门', 15: '门', 16: '桌面',
  };
  const 格 = 32;
  return s.children.list
    .filter((o) => o.texture?.key?.startsWith('prop_wall_'))
    .map((o) => {
      const 左 = o.x - o.width / 2;
      const 右 = o.x + o.width / 2;
      const 顶 = o.y - o.height;
      const 底 = o.y;
      // 元素在 x 方向覆盖的格（列可能跨 1~2 格）
      const 列们 = [];
      for (let x = Math.floor(左 / 格); x <= Math.floor((右 - 1) / 格); x += 1) 列们.push(x);
      // 元素在 y 方向覆盖的行
      const 行们 = [];
      for (let y = Math.floor(顶 / 格); y <= Math.floor((底 - 1) / 格); y += 1) 行们.push(y);
      // 取覆盖到的瓦片：逐格读
      const 瓦 = [];
      for (const y of 行们) {
        for (const x of 列们) {
          const t = 图层.getTileAt(x, y);
          if (t) 瓦.push({ y, x, 名: 名[t.index] ?? '?' });
        }
      }
      const 有白墙 = 瓦.some((w) => w.名 === '白墙');
      const 有玻璃 = 瓦.some((w) => w.名 === '玻璃');
      const 有门 = 瓦.some((w) => w.名 === '门');
      return {
        名: o.texture.key.replace('prop_wall_', ''),
        锚格: [Math.floor((o.x - 16) / 格), Math.floor((o.y - 32) / 格)],
        覆盖行: [行们[0], 行们[行们.length - 1]],
        // 它压住的那一行是什么（优先报"墙上那一块"）
        压在: 有玻璃 ? '玻璃' : 有门 ? '门' : 有白墙 ? '白墙' : 瓦[0]?.名 ?? '?',
        列们,
      };
    })
    .sort((a, b) => a.覆盖行[0] - b.覆盖行[0] || a.锚格[0] - b.锚格[0]);
});

console.log('=== 墙面元素压在哪一行 ===\n');
let 坏 = 0;
for (const e of r) {
  const 玻璃 = e.压在 === '玻璃';
  const 门 = e.压在 === '门';
  const 白墙 = e.压在 === '白墙';
  const 判定 = 玻璃 ? '❌ 压在玻璃上' : 门 ? '❌ 压在门上' : 白墙 ? '✅ 贴实墙' : '❌ 没压墙（像掉在地上）';
  if (!白墙 || 玻璃 || 门) 坏 += 1;
  console.log(
    `  ${e.名.padEnd(6)} 锚格(${String(e.锚格[0]).padStart(2)},${String(e.锚格[1]).padStart(2)})  ` +
      `覆盖行 ${String(e.覆盖行[0]).padStart(2)}~${String(e.覆盖行[1]).padStart(2)}  ` +
      `列 ${e.列们[0]}~${e.列们[e.列们.length - 1]}  压在=${e.压在.padEnd(5)} ${判定}`,
  );
}
console.log(`\n共 ${r.length} 件，${坏} 件有问题`);
if (坏) console.log('⚠️ 压玻璃/门的要挪到实墙格；没压墙的要按 3.10 节调 y 和 偏移Y');
await 浏览器.close();
process.exit(坏 ? 1 : 0);

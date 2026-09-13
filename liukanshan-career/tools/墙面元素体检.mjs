/**
 * 墙面元素体检：查每件"挂墙"的东西**到底贴在什么上面**。
 *
 * 为什么要专门做：墙面元素允许压墙（查压墙工具会跳过它们），
 * 但"压在**玻璃**上""压在门上""根本没压到墙"都是错的 —— 那些工具都查不出来。
 * 实测踩过两次：出口牌摆到玻璃上、挂钟下端掉到墙下面的地砖上。
 *
 * 判定规则（**按"元素和墙的重叠比例"算，不按某一格是什么**）：
 *   · 元素占的像素矩形 × 每列对应的墙带（那一列最近的白墙瓦片占的 32px 高）
 *   · 重叠高度 ≥ 元素高度的 **50%** → ✅ 贴得够实
 *   · 否则如果重叠里夹着玻璃 → ❌ 压在玻璃上
 *   · 一点墙都没碰到 → ❌ 飘着（像掉在地上）
 *
 * ⚠️ 别改成"锚点那格是不是墙"：修正后的摆位**故意**让元素下端压过墙沿
 *    （看着才像挂在墙上），那种写法会误报（踩过）。
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

/**
 * 50% 是"贴得够实"的门槛。
 * ⚠️ 外墙那排（窗户）实测只有 40%：墙带 64px、元素 40px，按 `-道具高度-12` 提上去之后
 *    是挂在上沿、下端压过墙顶 16px。**这是有意的**（实拍就是这样最好看：
 *    像挂在墙上、下端和墙顶那条缝重合），所以门槛取 **40%**，
 *    别调到 50% 以上，否则外墙那排会误报（踩过一次）。
 */
const 门槛 = 0.4;

const r = await 页.evaluate((门槛) => {
  const s = window.__lksMap;
  const 图层 = s.图层;
  const 名 = {
    0: '浅灰地毯', 1: '深灰地毯', 2: '防滑砖', 3: '抛光砖', 4: '走廊地砖', 5: '木地板',
    6: '白墙', 7: '玻璃', 8: '门', 9: '门', 10: '门', 11: '门', 12: '门', 13: '门', 14: '门', 15: '门', 16: '桌面',
  };
  const 格 = 32;
  const 名号 = (t) => (t ? 名[t.index] ?? '?' : '（地图外）');
  /** 墙的遮挡层是"32×32 的瓦片、锚点脚底在行底" → 画出来的墙带其实有 64px 高（本行+上一行） */
  const 墙带高 = 64;

  return s.children.list
    .filter((o) => o.texture?.key?.startsWith('prop_wall_'))
    .map((o) => {
      const 左 = o.x - o.width / 2;
      const 右 = o.x + o.width / 2;
      const 顶 = o.y - o.height;
      const 底 = o.y;
      const 列们 = [];
      for (let x = Math.floor(左 / 格); x <= Math.floor((右 - 1) / 格); x += 1) 列们.push(x);

      /** 这一列上、离元素最近的墙类瓦片（白墙/玻璃/门）是哪一块、它的 64px 带子在哪 */
      const 每列 = [];
      for (const x of 列们) {
        const 候选 = [];
        for (let y = Math.floor(顶 / 格) - 2; y <= Math.floor(底 / 格) + 1; y += 1) {
          const t = 图层.getTileAt(x, y);
          const n = 名号(t);
          if (!['白墙', '玻璃', '门'].includes(n)) continue;
          // 墙带：行底往上 64px
          const 带顶 = (y + 1) * 格 - 墙带高;
          const 带底 = (y + 1) * 格;
          // 元素和这条带的重叠
          const 叠 = Math.max(0, Math.min(底, 带底) - Math.max(顶, 带顶));
          if (叠 > 0) 候选.push({ n, 叠, 带顶, 带底, 行: y });
        }
        // 取重叠最大的那一块墙
        候选.sort((a, b) => b.叠 - a.叠);
        每列.push(候选[0] ?? null);
      }

      const 实高 = 底 - 顶;
      const 总 = 实高 * 列们.length || 1;
      const 白 = 每列.filter((c) => c?.n === '白墙').reduce((a, c) => a + (c?.叠 ?? 0), 0);
      const 玻 = 每列.filter((c) => c?.n === '玻璃').reduce((a, c) => a + (c?.叠 ?? 0), 0);
      const 门 = 每列.filter((c) => c?.n === '门').reduce((a, c) => a + (c?.叠 ?? 0), 0);
      return {
        名: o.texture.key.replace('prop_wall_', ''),
        锚格: [Math.floor((o.x - 16) / 格), Math.floor((o.y - 32) / 格)],
        像素区间: [Math.round(顶), Math.round(底)],
        墙比: +(白 / 总).toFixed(2),
        玻璃比: +(玻 / 总).toFixed(2),
        门比: +(门 / 总).toFixed(2),
      };
    })
    .sort((a, b) => a.像素区间[0] - b.像素区间[0]);
}, 门槛);

console.log(`=== 墙面元素和"墙带"的重叠（墙带 = 瓦片那 64px 的贴面）===\n`);
let 坏 = 0;
for (const e of r) {
  const 判定 =
    e.玻璃比 >= 0.3
      ? '❌ 压在玻璃上'
      : e.门比 >= 0.3
        ? '❌ 压在门上'
        : e.墙比 >= 门槛
          ? '✅ 贴实墙'
          : '❌ 没贴够墙（像掉在地上/飘着）';
  if (判定.startsWith('❌')) 坏 += 1;
  console.log(
    `  ${e.名.padEnd(6)} 锚格(${String(e.锚格[0]).padStart(2)},${String(e.锚格[1]).padStart(2)})  ` +
      `像素 ${String(e.像素区间[0]).padStart(4)}~${String(e.像素区间[1]).padStart(4)}  ` +
      `落在白墙 ${(e.墙比 * 100).toFixed(0).padStart(3)}%` +
      `${e.玻璃比 ? ` · 玻璃 ${(e.玻璃比 * 100).toFixed(0)}%` : ''}` +
      `${e.门比 ? ` · 门 ${(e.门比 * 100).toFixed(0)}%` : ''}  ${判定}`,
  );
}
console.log(`\n共 ${r.length} 件，${坏} 件有问题`);
if (坏) console.log('⚠️ 压玻璃/门的要挪到白墙格；没贴够的按 3.10 节调 y 和 偏移Y');
await 浏览器.close();
process.exit(坏 ? 1 : 0);

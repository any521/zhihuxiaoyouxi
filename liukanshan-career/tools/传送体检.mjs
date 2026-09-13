/**
 * NPC 传送体检：验"剧情切到某个房间时，**相关人员已经先到那儿了**"。
 *
 * 用户报过的 bug：「切换到茶水间时相关人员并没有传送过来」——
 * 走到茶水间，房间里摆的还是**上一段那套**（大家都在工位上），空无一人。
 * 原因：同事站位原来只跟 `段号` 走，而"去房间"和"分段"不是一回事
 *       （事件二中间要去老板办公室、还要去茶水间，段号还没推进）。
 * 修法：`去房间` 那一拍先查 `房间对应排布`，把"目的地该有谁"定下来 → 人先到、玩家后走。
 *
 * 断言：
 *   ① 点「去茶水间」之后，store 的 NPC排布号 = 3
 *   ② 场景里 NPC 真的按第 3 套重建了（小鹿/阿麦 出现在茶水间那两把椅子上）
 *   ③ 走过去续播之后，NPC排布号 复位成 null（回到跟着段号走）
 *
 * 用法（在游戏目录跑）：node tools/传送体检.mjs
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
await 等(900);

let 坏 = 0;
const 断言 = (条件, 说明) => {
  console.log(`  ${条件 ? '✓' : '✗'} ${说明}`);
  if (!条件) 坏 += 1;
};

/** 读场景里所有同事的名 + 格坐标 */
const 读人 = () =>
  页.evaluate(() => {
    const s = window.__lksMap;
    const 图层 = s.图层;
    return s.NPC们.map((o) => ({
      名: o.getData('名'),
      格: [Math.floor((o.x - 16) / 32), Math.floor((o.y - 32) / 32)],
      动画: o.anims?.currentAnim?.key ?? null,
    }));
  });

const 读剧情 = () =>
  页.evaluate(() => {
    const s = window.__lksStory.getState();
    return {
      屏幕: s.屏幕,
      段号: s.段号,
      位置: s.位置,
      待去房间: s.待去房间,
      NPC排布号: s.NPC排布号,
    };
  });

console.log('=== ① 从事件二推到「去房间」 ===\n');
// ⚠️ 段号是 1-based 的：段 1 = 事件一、段 2 = 事件二。
//    所以要把段号设成 1、再用「我的工位」入口启动**事件二**（它才是段 2）。
await 页.evaluate(() => {
  window.__lksStory.setState({ 屏幕: 'map', 段号: 1 });
  window.__lksStory.getState().地图交互('我的工位');
});
await 等(300);
let 到了 = null;
for (let i = 0; i < 40; i += 1) {
  const s = await 读剧情();
  if (s.待去房间) {
    到了 = s;
    break;
  }
  await 页.evaluate(() => window.__lksStory.getState().推进一步());
  await 等(40);
}
if (!到了) {
  console.log('  ✗ 推了 40 步都没到「去房间」');
  await 浏览器.close();
  process.exit(1);
}
console.log(`  停在「去房间」：去哪=${到了.待去房间.去哪}`);

// 把"去哪"改成茶水间来测（事件二第一趟是老板办公室，这里直接指定茶水间）
console.log('\n=== ② 点「去茶水间」→ 人应该**先传送过去** ===\n');
await 页.evaluate(() => {
  window.__lksStory.setState({ 待去房间: { 去哪: '茶水间', 提示: '去茶水间' } });
  window.__lksStory.getState().去房间();
});
await 等(700);
const 剧情 = await 读剧情();
console.log('  剧情状态：', JSON.stringify(剧情));
断言(剧情.屏幕 === 'map', '切到地图了');
断言(剧情.NPC排布号 === 3, `NPC排布号 定成了 3（茶水间那套），实际 ${剧情.NPC排布号}`);

const 人 = await 读人();
console.log('  场景里的同事：');
for (const p of 人) console.log(`    ${String(p.名).padEnd(4)} 格(${p.格[0]},${p.格[1]})  动画=${p.动画}`);
const 小鹿 = 人.find((p) => p.名 === '小鹿');
const 阿麦 = 人.find((p) => p.名 === '阿麦');
断言(!!小鹿 && 小鹿.格[0] === 4 && 小鹿.格[1] === 20, `小鹿已经站在茶水间椅子 (4,20)（实际 ${小鹿 ? 小鹿.格 : '不在场'}）`);
断言(!!阿麦 && 阿麦.格[0] === 8 && 阿麦.格[1] === 20, `阿麦已经站在茶水间椅子 (8,20)（实际 ${阿麦 ? 阿麦.格 : '不在场'}）`);
断言(
  (小鹿?.动画 ?? '').startsWith('坐正_'),
  `小鹿用的是**正面坐姿**（茶水间要面对主角），实际 ${小鹿?.动画}`,
);

console.log('\n=== ③ 走到茶水间续播 → 排布号复位 ===\n');
await 页.evaluate(() => window.__lksStory.getState().地图交互('茶水间'));
await 等(400);
const 续 = await 读剧情();
console.log('  续播后：', JSON.stringify(续));
断言(续.屏幕 === 'avg', '回到微信继续播这一段');
断言(续.NPC排布号 === null, `NPC排布号 复位成 null（回到跟着段号走），实际 ${续.NPC排布号}`);

console.log(坏 ? `\n✗ ${坏} 项没过` : '\n✓ 传送全部通过（人先到位、玩家再走过去）');
await 浏览器.close();
process.exit(坏 ? 1 : 0);

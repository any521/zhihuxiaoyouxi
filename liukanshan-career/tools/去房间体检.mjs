/**
 * 「去房间」体检：验"房间内换场景要回地图自己走过去"这条规则。
 *
 * 用户要求：「这种切换场景的情况要切换到 2D 模式、走到对应的房间场景再继续，
 *           就像走到自己的工位上」。
 *
 * 验四件事：
 *   ① 播到「去房间」那条时，屏幕**切回地图**、指引线指向目标、**队列停在原地**
 *   ② 人在目标点上按空格 → **从下一条继续播**（不重播、不回到段首）
 *   ③ 底部提示用的是剧本给的 `提示`（"小鹿在工位上等你"）
 *   ④ 走错地方按空格 → 不该把剧情带跑（要么什么都不发生，要么只放支线小片段）
 *
 * 用法（在游戏目录跑）：node tools/去房间体检.mjs
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

/** 直接进事件二（平时靠走地图触发，这里为了量测抄近路） */
await 页.evaluate(() => {
  const s = window.__lksStory.getState();
  s.跳过开场();
  window.__lksStory.setState({ 屏幕: 'avg', 段号: 1 });
});
await 等(300);
await 页.evaluate(() => window.__lksStory.getState().地图交互('我的工位'));
await 等(400);

const 状态 = () =>
  页.evaluate(() => {
    const s = window.__lksStory.getState();
    return {
      屏幕: s.屏幕,
      位置: s.位置,
      目标: s.地图目标,
      续播: s.续播,
      续播提示: s.续播提示,
      待暂停: s.待暂停,
      本条: s.队列[s.位置]?.类型 ?? null,
      下一条: s.队列[s.位置 + 1]?.类型 ?? null,
    };
  });

console.log('=== ① 播到「去房间」应该切回地图并停住 ===\n');
let 到了 = null;
for (let i = 0; i < 40; i += 1) {
  const s = await 状态();
  if (s.续播) {
    到了 = s;
    break;
  }
  await 页.evaluate(() => window.__lksStory.getState().推进一步());
  await 等(40);
}
if (!到了) {
  console.log('✗ 推了 40 步都没碰到「去房间」');
  await 浏览器.close();
  process.exit(1);
}
console.log(`  屏幕=${到了.屏幕}（应为 map）  地图目标=${到了.目标}（应为 林总办公室）`);
console.log(`  队列停在 ${到了.位置}（本条=${到了.本条}，说明**没有**把位置推过去）`);
console.log(`  续播=${JSON.stringify(到了.续播)}  续播提示=${到了.续播提示}`);
console.log(`  底部提示用的应该是：${到了.续播提示}`);

console.log('\n=== ② 走错地方按空格（应什么都不发生）===\n');
const 前 = await 状态();
await 页.evaluate(() => window.__lksStory.getState().地图交互('茶水间'));
await 等(200);
const 错后 = await 状态();
console.log(
  `  在茶水间按空格：屏幕=${错后.屏幕}（应还是 map 或只放支线；续播=${JSON.stringify(错后.续播)} 应保持）`,
);
if (错后.屏幕 === 'avg' && !错后.续播) {
  console.log(`  ℹ️ 进的是支线小片段（支线中=${await 页.evaluate(() => window.__lksStory.getState().支线中)}），这不影响主线`);
}

console.log('\n=== ③ 走到目标按空格 → 从下一条继续播 ===\n');
await 页.evaluate(() => {
  // 先把可能开着的支线收掉，回到地图
  const s = window.__lksStory.getState();
  if (s.支线中) s.点暂停();
  else s.回地图();
});
await 等(200);
await 页.evaluate((去哪) => window.__lksStory.getState().地图交互(去哪), 前.目标);
await 等(300);
const 续 = await 状态();
console.log(`  屏幕=${续.屏幕}（应为 avg）  位置=${续.位置}（应为 ${前.位置 + 1}）`);
console.log(`  续播=${JSON.stringify(续.续播)}（应为 null，已经用掉了）`);
const 对 = 续.屏幕 === 'avg' && 续.位置 === 前.位置 + 1 && 续.续播 === null;
console.log(对 ? '  ✓ 从下一条接着播，没有重播' : '  ✗ 位置或屏幕不对');

console.log('\n=== ④ 剧情能一路播到段落结束 ===\n');
for (let i = 0; i < 60; i += 1) {
  const s = await 状态();
  if (s.待暂停) break;
  if (s.续播) break; // 又碰到下一个「去房间」
  await 页.evaluate(() => window.__lksStory.getState().推进一步());
  await 等(30);
}
const 末 = await 状态();
console.log(
  `  停在：待暂停=${末.待暂停}  续播=${JSON.stringify(末.续播)}（第二个「去房间」应该在事件二结尾前出现）`,
);

console.log(对 ? '\n✓ 「去房间」规则生效' : '\n✗ 有问题，看上面');
await 浏览器.close();

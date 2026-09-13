/**
 * AVG 行为体检：验三件事（都是用户明确要求的）
 *   ① **点暂停/切会话时，视图不自己跳**（玩家自己点左侧列表切换）
 *   ② 没看的会话累计**未读数字小红点**
 *   ③ 聊天流里**只显示时间提示**（时间），不显示剧情旁白（旁白）
 *
 * 用法：node tools/AVG体检.mjs
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
await 页.evaluate(() => window.__lksStory.setState({ 屏幕: 'avg' }));
await 等(500);

const 状态 = () =>
  页.evaluate(() => {
    const s = window.__lksStory.getState();
    return {
      查看: s.查看会话,
      活跃: s.活跃会话,
      会话: s.会话们.map((c) => ({ id: c.id, 未读: c.未读, 条数: c.条目.length })),
      待邀请: !!s.待接受邀请,
      待选择: !!s.待选择,
      待暂停: s.待暂停,
    };
  });

/** 连推若干步 */
const 推 = (次) =>
  页.evaluate(async (次) => {
    for (let i = 0; i < 次; i += 1) window.__lksStory.getState().推进一步();
    return true;
  }, 次);

console.log('=== ① 切会话不再自动跳视图 ===\n');
const 开始 = await 状态();
console.log(`开局视图 = ${开始.查看}（应为 lin）`);

// 推到"待接受邀请"
for (let i = 0; i < 40; i += 1) {
  const s = await 状态();
  if (s.待邀请) break;
  await 推(1);
  await 等(30);
}
const 邀请前 = await 状态();
console.log(`群邀请出现时视图 = ${邀请前.查看}（应仍是 lin，没被跳到群里）`);
// 邀请卡必须落在"发邀请的那个私聊"里，不能跑进群里
const 邀请卡在哪 = await 页.evaluate(() => {
  const s = window.__lksStory.getState();
  return s.会话们
    .filter((c) => c.条目.some((x) => x.种类 === '邀请'))
    .map((c) => ({ 会话: c.id, 名字: c.名字, 有几张: c.条目.filter((x) => x.种类 === '邀请').length }));
});
console.log(`邀请卡所在的会话 = ${JSON.stringify(邀请卡在哪)}（应该只有 lin，没有 group）`);
// 邀请卡在**当前会话的 DOM 里**也真的渲染出来了吗（状态对但没渲染 = 白改）
await 等(300);
const 邀请DOM = await 页.evaluate(() => ({
  视图: window.__lksStory.getState().查看会话,
  邀请卡数: document.querySelectorAll('.wc-invite').length,
  按钮: document.querySelector('.wc-list-foot button, .wc-invite + *')?.textContent ?? null,
  正文: document.querySelector('.wc-log')?.textContent?.slice(0, 60) ?? null,
}));
console.log(`DOM：视图 ${邀请DOM.视图} · .wc-invite ${邀请DOM.邀请卡数} 个 · 正文开头「${邀请DOM.正文}」`);
// 存一张图：邀请卡应该出现在**林总的私聊**里
const OUT0 = 'tools/shots/avg';
await import('node:fs').then((fs) => fs.mkdirSync(OUT0, { recursive: true }));
await 页.screenshot({ path: `${OUT0}/邀请卡在林总私聊.png` });
console.log(`截图：${OUT0}/邀请卡在林总私聊.png`);

// 接受邀请 → 应当切到群（这是"当场发生的事"）
await 页.evaluate(() => window.__lksStory.getState().接受邀请());
await 等(200);
const 邀请后 = await 状态();
console.log(`接受邀请后视图 = ${邀请后.查看}（应为 group，邀请当场就该看到）`);

console.log('\n=== ② 未读数字小红点 ===\n');
// 接受邀请后推进：群消息应该进 group；之后剧本会切到周岚私聊，此时 group 应积未读
for (let i = 0; i < 26; i += 1) {
  const s = await 状态();
  if (s.待选择) break;
  await 推(1);
  await 等(30);
}
const 群聊中 = await 状态();
console.log(`推到选择点时视图 = ${群聊中.查看}，会话未读：${JSON.stringify(群聊中.会话)}`);

// 选 A，继续推到汇合（剧本会切到周岚私聊）
await 页.evaluate(() => window.__lksStory.getState().选择(0));
for (let i = 0; i < 30; i += 1) {
  const s = await 状态();
  if (s.待暂停) break;
  await 推(1);
  await 等(30);
}
const 汇合 = await 状态();
const 有周岚 = 汇合.会话.find((c) => c.id === 'zhou');
console.log(`汇合时视图 = ${汇合.查看}（应还是 group —— 剧本切到周岚私聊但**不自动跳**）`);
console.log(`  zhou 会话：${JSON.stringify(有周岚)}`);
console.log(`  group 未读 = ${汇合.会话.find((c) => c.id === 'group')?.未读}`);

// 未读红点在 DOM 上真的渲染出来了吗
const 红点 = await 页.evaluate(() =>
  [...document.querySelectorAll('.wc-row')].map((r) => ({
    名字: r.querySelector('.wc-name')?.textContent ?? r.textContent?.slice(0, 8),
    红点: r.querySelector('.wc-badge')?.textContent ?? null,
  })),
);
console.log(`  列表上的红点：${JSON.stringify(红点)}`);

console.log('\n=== ③ 只显示时间提示，不显示旁白 ===\n');
// ⚠️ 事件一里本来就没有时间提示（时间提示在事件二、三），
//    所以这里**走完事件一的收尾、进事件二**再查 ——
//    否则"0 条时间"会让人误判成功能没生效。
await 页.evaluate(() => window.__lksStory.getState().点暂停());
await 等(300);
// 正常流程：点暂停后回到地图、指引线指向事件二的入口（我的工位），
// 走到那儿按空格才会把事件二的节拍装进队列。这里直接调 地图交互 跳过走路。
const 入口 = await 页.evaluate(() => {
  const s = window.__lksStory.getState();
  return { 目标: s.地图目标, 段号: s.段号 };
});
console.log(`（点暂停后：段号 ${入口.段号}，地图目标 ${入口.目标}）`);
await 页.evaluate((id) => window.__lksStory.getState().地图交互(id), 入口.目标 ?? '我的工位');
await 等(300);
for (let i = 0; i < 14; i += 1) {
  await 推(1);
  await 等(20);
}
const 事件二流 = await 页.evaluate(() => {
  const s = window.__lksStory.getState();
  const 全 = s.会话们.flatMap((c) => c.条目);
  return {
    段号: s.段号,
    查看: s.查看会话,
    旁白条数: 全.filter((x) => x.种类 === '旁白').length,
    时间文本: 全.filter((x) => x.种类 === '时间').map((x) => x.文本),
    DOM旁白: document.querySelectorAll('.wc-narration').length,
    DOM时间: document.querySelectorAll('.wc-time').length,
  };
});
console.log(`（现在段号 ${事件二流.段号}，视图 ${事件二流.查看}）`);
console.log(`聊天流里：旁白 ${事件二流.旁白条数} 条（应为 0）· 时间提示 ${事件二流.时间文本.length} 条`);
console.log(`  时间文本：${JSON.stringify(事件二流.时间文本)}`);
console.log(`  DOM 上：.wc-narration ${事件二流.DOM旁白} 个（应为 0）· .wc-time ${事件二流.DOM时间} 个`);

const 好 =
  邀请前.查看 === 'lin' &&
  邀请卡在哪.length === 1 &&
  邀请卡在哪[0]?.会话 === 'lin' &&
  邀请后.查看 === 'group' &&
  汇合.查看 === 'group' &&
  (有周岚?.未读 ?? 0) > 0 &&
  事件二流.旁白条数 === 0 &&
  事件二流.DOM旁白 === 0 &&
  事件二流.时间文本.length > 0;
console.log(好 ? '\n✓ 三项都符合预期' : '\n✗ 有不符合预期的项，看上面的数字');

// 顺手截一张，肉眼看时间提示的样式
const OUT = 'tools/shots/avg';
await import('node:fs').then((fs) => fs.mkdirSync(OUT, { recursive: true }));
await 页.screenshot({ path: `${OUT}/时间提示与小红点.png` });
console.log(`截图：${OUT}/时间提示与小红点.png`);
await 浏览器.close();

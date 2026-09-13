/**
 * 微信开关体检：复现"进行主线时打开微信被强制关闭"这个 bug。
 *
 * 做法：进地图 → 打开主线（走到入口按空格）→ 播几步 → 按 Tab 掏手机 →
 *      观察 ①屏幕有没有真的切到 avg ②会不会自己跳回 map ③主线进度有没有乱。
 *
 * 用法（在游戏目录跑）：node tools/微信开关体检.mjs
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

const 状态 = () =>
  页.evaluate(() => {
    const s = window.__lksStory.getState();
    return {
      屏幕: s.屏幕,
      段号: s.段号,
      位置: s.位置,
      队列长: s.队列.length,
      查看: s.查看会话,
      活跃: s.活跃会话,
      待选择: !!s.待选择,
      待邀请: !!s.待接受邀请,
      待暂停: s.待暂停,
      续播: s.续播,
      有地图: !!document.querySelector('.map-canvas canvas'),
      有微信: !!document.querySelector('.wc-row') || !!document.querySelector('.wc-log'),
    };
  });

console.log('=== ① 站在地图上，主线正播着（后台在推进）===\n');
await 页.evaluate(() => window.__lksStory.setState({ 屏幕: 'map', 段号: 1 }));
await 页.waitForFunction(() => !!window.__lksMap, { timeout: 20000 });
await 等(900);
// 制造"主线正在播"的状态：先开一段，再把屏幕切回地图（模拟玩家边走边播）
await 页.evaluate(() => window.__lksStory.getState().地图交互('我的工位'));
await 等(300);
for (let i = 0; i < 5; i += 1) {
  await 页.evaluate(() => window.__lksStory.getState().推进一步());
  await 等(50);
}
await 页.evaluate(() => window.__lksStory.getState().回地图());
await 等(400);
const 播中 = await 状态();
console.log('  地图上，剧情停在位置', 播中.位置, '/', 播中.队列长, '屏幕=', 播中.屏幕);
if (播中.屏幕 !== 'map') {
  console.log('  ⚠️ 没回到地图，后面的断言不可信');
}

console.log('\n=== ② 按 Tab 掏手机（这是用户报 bug 的那一步）===\n');
await 页.keyboard.press('Tab');
await 等(500);
const 掏了 = await 状态();
console.log('  按 Tab 后：', JSON.stringify(掏了));
const 切过去了 = 掏了.屏幕 === 'avg';

console.log('\n=== ③ 等 3 秒，看它会不会自己跳回地图 ===\n');
let 跳回 = false;
for (let i = 0; i < 12; i += 1) {
  await 等(250);
  const s = await 状态();
  if (s.屏幕 !== 'avg') {
    跳回 = true;
    console.log(`  ⚠️ 第 ${i} 次采样（${(i + 1) * 250}ms）屏幕变成了 ${s.屏幕}：`, JSON.stringify(s));
    break;
  }
}
if (!跳回) console.log('  3 秒内一直停留在微信 ✓');

console.log('\n=== ④ 在微信里再按一次 Tab（应回地图）===\n');
await 页.keyboard.press('Tab');
await 等(400);
const 回 = await 状态();
console.log('  再按 Tab：屏幕 =', 回.屏幕, '（应为 map）');

console.log(
  `\n${
    切过去了 && !跳回 && 回.屏幕 === 'map'
      ? '✓ 打开微信正常、没有被强制关闭，再按能回地图'
      : `✗ 有问题：切过去=${切过去了} 自己跳回=${跳回} 回地图=${回.屏幕}`
  }`,
);
await 浏览器.close();

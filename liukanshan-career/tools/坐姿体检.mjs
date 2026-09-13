/**
 * 坐姿体检：验"主角能坐椅子，而且**姿势按场景自动切**"。
 *
 * 用户的要求：「主角可以做空椅子，是背面还是正面坐要根据场景切换」。
 *
 * 断言四件事：
 *   ① 走到**开放办公区的工位椅**上按空格 → 坐下，用的是**背面**坐姿（背对走廊打字）
 *   ② 走到**茶水间的会议椅**上按空格 → 坐下，用的是**正面**坐姿（面对同事说话）
 *   ③ 坐着时按方向键 → 自动站起来（不用额外按键）
 *   ④ 非座位（走廊地板）按空格 → 不会"坐在空中"
 *
 * 用法（在游戏目录跑）：node tools/坐姿体检.mjs
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

/** 把主角瞬移到某个格（模拟"走过去"），等一拍让 update 把状态报上来 */
async function 站到(x, y) {
  await 页.evaluate((x, y) => {
    const s = window.__lksMap;
    const 像素 = s.格到像素(x, y);
    s.传送像素 ? s.传送像素(像素.x, 像素.y) : s.传送(x, y);
  }, x, y);
  await 等(350);
}

const 读 = () =>
  页.evaluate(() => {
    const s = window.__lksMap;
    const st = window.__lksStory.getState();
    return {
      格: s.位置(),
      坐在座位上: st.站在座位上,
      坐着: st.坐着,
      坐姿套: s.坐姿套(),
    };
  });

let 坏 = 0;
const 断言 = (条件, 说明) => {
  console.log(`  ${条件 ? '✓' : '✗'} ${说明}`);
  if (!条件) 坏 += 1;
};

console.log('=== ① 开放办公区的工位椅 → 应该坐**背面**坐姿 ===\n');
// (24,4) = 我的工位那把转椅
await 站到(24, 4);
let s = await 读();
console.log('  站上去：', JSON.stringify(s));
断言(s.坐在座位上 === true, '站在椅子上 → 场景报"在座位上"');
await 页.evaluate(() => window.__lksStory.getState().请求坐下());
await 等(300);
s = await 读();
断言(s.坐着 === true, '按了空格 → 坐下了');
断言(s.坐姿套 === 'back', `工位上用的是背面坐姿（实际 ${s.坐姿套}）`);

console.log('\n=== ② 坐着时按方向键 → 自动站起来 ===\n');
await 页.keyboard.down('ArrowLeft');
await 等(250);
await 页.keyboard.up('ArrowLeft');
await 等(200);
s = await 读();
断言(s.坐着 === false, '一按方向键就站起来了（不用额外按键）');

console.log('\n=== ③ 茶水间的会议椅 → 应该坐**正面**坐姿 ===\n');
// (4,20) = 茶水间靠西那把会议椅
await 站到(4, 20);
s = await 读();
console.log('  站上去：', JSON.stringify(s));
断言(s.坐在座位上 === true, '茶水间的椅子也认出来了');
await 页.evaluate(() => window.__lksStory.getState().请求坐下());
await 等(300);
s = await 读();
断言(s.坐着 === true, '坐下成功');
断言(s.坐姿套 === 'front', `茶水间用的是正面坐姿（实际 ${s.坐姿套}）`);
await 页.evaluate(() => window.__lksStory.getState().请求坐下());
await 等(200);

console.log('\n=== ④ 走廊地板（不是座位）→ 不该能坐 ===\n');
await 站到(20, 12);
s = await 读();
断言(s.坐在座位上 === false, '走廊地板上不算座位');
await 页.evaluate(() => window.__lksStory.getState().请求坐下());
await 等(250);
s = await 读();
断言(s.坐着 === false, '在走廊上按空格 → 不会"坐在空中"');

console.log(坏 ? `\n✗ ${坏} 项没过` : '\n✓ 坐姿全部通过（工位背面 / 茶水间正面 / 一按方向键就起身）');
await 浏览器.close();
process.exit(坏 ? 1 : 0);

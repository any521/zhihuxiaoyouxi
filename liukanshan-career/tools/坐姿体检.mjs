/**
 * 坐姿体检：验"主角能坐**工位椅 / 空椅子 / 空沙发**，而且姿势按场景自动切"。
 *
 * 用户的要求：「主角可以坐工位上、坐空椅子上、坐空沙发上，
 *              并且判断是背面坐还是正面坐」。
 *
 * 判据（`OfficeMapScene.坐哪套()`）：
 *   · **开放办公区**（13≤x≤30, 2≤y≤9）的椅子/沙发 → **背面**（自己工位，对着电脑）
 *   · 其它地方（茶水间 / 会议室 / 总监办公室 / 前台沙发）→ **正面**（对着人说话）
 *
 * ⚠️ 走的是**真实路径**（`地图交互`），不是直接调场景 —— 这样能一并验出
 *    "工位那个交互点会不会把'坐下'顶掉"（用户报过：站在工位上按空格永远坐不下去）。
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
    s.传送像素(像素.x, 像素.y);
  }, x, y);
  await 等(350);
}

/** 模拟"按一下空格" —— 走真实的 `地图交互`（不是直接调场景） */
async function 按空格(id) {
  await 页.evaluate((id) => window.__lksStory.getState().地图交互(id), id);
  await 等(300);
}

/** 直接请求"站起来"（场景会由 MapScreen 执行） */
async function 站起来() {
  await 页.evaluate(() => window.__lksStory.getState().要坐坐('站'));
  await 等(300);
}

const 读 = () =>
  页.evaluate(() => {
    const s = window.__lksMap;
    const st = window.__lksStory.getState();
    // ⚠️ 直接读主角精灵身上的动画 key，不调场景的 `坐姿套()`：
    //    那个方法在旧版本的 bundle 里没有兜底判空，会抛错（而且 dev server 换代码后
    //    页面里的旧模块还在）。直读最稳。
    const 键 = s.主角?.anims?.currentAnim?.key ?? null;
    return {
      格: s.位置(),
      在座位上: st.站在座位上,
      坐着: st.坐着,
      套: 键 === '坐_刘看山' ? 'back' : 键 === '坐正_刘看山' ? 'front' : null,
      屏幕: st.屏幕,
      续播: st.续播,
    };
  });

let 坏 = 0;
const 断言 = (条件, 说明) => {
  console.log(`  ${条件 ? '✓' : '✗'} ${说明}`);
  if (!条件) 坏 += 1;
};

console.log('=== ① 自己的工位 (24,4)：既要能坐下、又要用背面坐姿 ===\n');
// ⚠️ 这一格同时挂着「我的工位」交互点。真正的坑是：交互点先被判掉 → 永远坐不下去。
await 站到(24, 4);
let s = await 读();
console.log('  站上去：', JSON.stringify(s));
断言(s.在座位上 === true, '场景报"在座位上"');
await 按空格('我的工位');
s = await 读();
console.log('  按空格后：', JSON.stringify(s));
断言(s.坐着 === true, '在工位上按空格 → **真的坐下了**（交互点没有把坐下顶掉）');
断言(s.套 === 'back', `工位上用背面坐姿（实际 ${s.套}）`);

console.log('\n=== ② 坐着时按方向键 → 自动站起来 ===\n');
await 页.keyboard.down('ArrowLeft');
await 等(250);
await 页.keyboard.up('ArrowLeft');
await 等(200);
s = await 读();
断言(s.坐着 === false, '一按方向键就站起来了（不用额外按键）');

console.log('\n=== ③ 别人的空工位 (21,4) → 也能坐，同样是背面 ===\n');
await 站起来();
await 站到(21, 4);
await 按空格('我的工位');
s = await 读();
断言(s.坐着 === true, '空工位也能坐');
断言(s.套 === 'back', `开放办公区的工位一律背面（实际 ${s.套}）`);
await 站起来();

console.log('\n=== ④ 茶水间的空会议椅 (4,20) → 正面 ===\n');
await 站起来();
await 站到(4, 20);
await 按空格('茶水间');
s = await 读();
断言(s.坐着 === true, '茶水间的椅子能坐');
断言(s.套 === 'front', `茶水间用正面坐姿（实际 ${s.套}）`);

console.log('\n=== ⑤ 空沙发 (30,20) 总监办公室 → 正面 ===\n');
await 站起来();
await 站到(30, 20);
s = await 读();
断言(s.在座位上 === true, '沙发那一格算座位（用户要求"可以坐空沙发"）');
await 按空格('林总办公室');
s = await 读();
断言(s.坐着 === true, '沙发上能坐下');
断言(s.套 === 'front', `沙发用正面坐姿（实际 ${s.套}）`);

console.log('\n=== ⑥ 前台大厅的空沙发 (17,26) → 正面 ===\n');
await 站起来();
await 站到(17, 26);
s = await 读();
断言(s.在座位上 === true, '前台沙发那一格也算座位');
await 按空格('前台');
s = await 读();
断言(s.坐着 === true, '前台沙发上能坐下');
断言(s.套 === 'front', `前台沙发用正面坐姿（实际 ${s.套}）`);

console.log('\n=== ⑦ 走廊地板（不是座位）→ 不该能坐 ===\n');
// ⚠️ 测试是**瞬移**，不会触发"走路自动站起来"（那条判在 `走()` 里），
//    所以这里先显式站起来，再检查"走廊上坐不下去"。
await 站起来();
await 站到(20, 12);
s = await 读();
断言(s.在座位上 === false, '走廊地板上不算座位');
断言(s.坐着 === false, '走到走廊时已经自动站起来了');
// 走廊上没有交互点，所以这里直接请求"坐"——不该成功
await 页.evaluate(() => window.__lksStory.getState().要坐坐('坐'));
await 等(250);
s = await 读();
断言(s.坐着 === false, '在走廊上请求坐下 → 不会"坐在空中"');

console.log(
  坏
    ? `\n✗ ${坏} 项没过`
    : '\n✓ 坐姿全部通过（工位背面 / 空工位背面 / 茶水间正面 / 沙发正面 / 走廊坐不下）',
);
await 浏览器.close();
process.exit(坏 ? 1 : 0);

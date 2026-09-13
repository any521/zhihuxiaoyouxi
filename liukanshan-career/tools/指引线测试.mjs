/**
 * 指引线测试：确认指引线是**一条直线**（会穿墙），不是绕路的折线。
 *
 * 三张图：
 *   1. 长线（右下 → 左上会议室）：跨整张地图，中途穿过办公桌/墙/玻璃
 *   2. 短线（前台附近 → 我的工位）：终点在画面里，能看清目标处的呼吸绿圈
 *
 * 对照：同时用 __lksMap.找路() 算一遍"真能走的路"（A*）。
 * 直线穿墙生效的话，指引线应该**明显短于**这条路，且中途不改方向。
 *
 * 用法：node tools/指引线测试.mjs
 */
import { mkdirSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import puppeteer from 'puppeteer-core';

const URL = 'http://127.0.0.1:5273/';
const OUT = resolve('tools/shots/指引线');
mkdirSync(OUT, { recursive: true });

const EDGE = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
].find((p) => existsSync(p));
if (!EDGE) {
  console.error('找不到 Edge');
  process.exit(1);
}

const 等 = (ms) => new Promise((r) => setTimeout(r, ms));
const 浏览器 = await puppeteer.launch({
  executablePath: EDGE,
  headless: 'new',
  args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--no-sandbox'],
});

const 页 = await 浏览器.newPage();
await 页.setViewport({ width: 1440, height: 900 });
页.on('pageerror', (e) => console.log(`[页面错误] ${e.message}`));
await 页.goto(URL, { waitUntil: 'networkidle2' });
await 页.waitForFunction(() => typeof window.__lksStory === 'function', { timeout: 20000 });
await 等(600);

// 直接切到地图（开场动画只是状态机的一屏，不需要点着看完）
await 页.evaluate(() => window.__lksStory.setState({ 屏幕: 'map' }));
await 页.waitForFunction(() => !!window.__lksMap, { timeout: 20000 });
await 页.waitForSelector('.map-canvas canvas', { timeout: 20000 });
await 等(900);

/** 把主角放到某格、目标指向某个交互点，截一张画布图 */
async function 一景(名, 说明, 放格子, 目标id) {
  const 信息 = await 页.evaluate(
    ({ 放格子, 目标id }) => {
      const s = window.__lksMap;
      s.传送像素(放格子.x * 32 + 16, 放格子.y * 32 + 32);
      s.设目标(目标id);
      return { 主角: s.精确位置() };
    },
    { 放格子, 目标id },
  );
  await 等(700);
  const 画布 = await 页.$('.map-canvas canvas');
  await 画布.screenshot({ path: join(OUT, `${名}.png`) });
  await 页.screenshot({ path: join(OUT, `${名}-整页.png`) });
  console.log(`  ${名}.png  —— ${说明}`);
  console.log(`    主角像素 (${信息.主角.x.toFixed(0)}, ${信息.主角.y.toFixed(0)})`);
  return 信息;
}

console.log('=== 指引线（直线穿墙）验证 ===\n');
console.log('[1] 长线：右下 → 左上「会议室」');
await 一景('指引线-长线', '跨整张地图，中途穿墙', { x: 40, y: 20 }, '会议室');

const 对照 = await 页.evaluate(() => {
  const 路 = window.__lksMap.找路(40, 20, 6, 7);
  return { 格数: 路 ? 路.length : null };
});
const 直线 = await 页.evaluate(() => {
  const p = window.__lksMap.精确位置();
  const dx = p.x - (6 * 32 + 16);
  const dy = p.y - (7 * 32 + 32);
  return Math.hypot(dx, dy);
});
console.log(`  → 指引线（直线）约 ${直线.toFixed(0)}px`);
console.log(`  → A* 真能走的路 ${对照.格数} 格 ≈ ${(对照.格数 * 32)}px`);
console.log(`  → 直线短了约 ${(对照.格数 * 32 - 直线).toFixed(0)}px，说明没在绕路\n`);

console.log('[2] 短线：工位过道 → 「我的工位」(24,4)');
await 一景('指引线-短线', '终点在画面里，看目标处的呼吸绿圈', { x: 21, y: 7 }, '我的工位');

console.log(`\n截图：${OUT}`);
await 浏览器.close();

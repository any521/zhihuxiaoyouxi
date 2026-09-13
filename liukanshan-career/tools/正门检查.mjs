/**
 * 正门 / 竖廊 对称检查（看图用）：把相机对准前台正门截图，并在画面上标注地图中轴。
 *
 * 为什么要标注中轴：光看截图判断"歪没歪"没有基准线，量出来的才算。
 *
 * 用法：node tools/正门检查.mjs
 */
import { mkdirSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import puppeteer from 'puppeteer-core';

const URL = 'http://127.0.0.1:5273/';
const OUT = resolve('tools/shots/工位');
mkdirSync(OUT, { recursive: true });

const EDGE = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
].find((p) => existsSync(p));
if (!EDGE) {
  console.error('找不到 Edge');
  process.exit(1);
}

const 格 = 32;
const 等 = (ms) => new Promise((r) => setTimeout(r, ms));
const 浏览器 = await puppeteer.launch({
  executablePath: EDGE,
  headless: 'new',
  args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--no-sandbox'],
});
const 页 = await 浏览器.newPage();
await 页.setViewport({ width: 1440, height: 900 });
await 页.goto(URL, { waitUntil: 'networkidle2' });
await 页.waitForFunction(() => typeof window.__lksStory === 'function', { timeout: 20000 });
await 等(600);
await 页.evaluate(() => window.__lksStory.setState({ 屏幕: 'map', 段号: 1 }));
await 页.waitForFunction(() => !!window.__lksMap, { timeout: 20000 });
await 页.waitForSelector('.map-canvas canvas', { timeout: 20000 });
await 等(1000);

/** 打开调试标注：中轴线 + 每 5 格的刻度 */
const 开标注 = (开) =>
  页.evaluate((开) => {
    const s = window.__lksMap;
    if (!s.__标) {
      const g = s.add.graphics();
      g.setDepth(999999);
      s.__标 = g;
    }
    const g = s.__标;
    g.clear();
    if (!开) return;
    // 地图中轴 x = 720
    g.lineStyle(1, 0xff3b30, 1);
    g.lineBetween(720, 0, 720, 30 * 32);
    // 每 5 格的竖参考线
    g.lineStyle(1, 0x2c5fa8, 0.5);
    for (let x = 0; x <= 45; x += 5) g.lineBetween(x * 32, 0, x * 32, 30 * 32);
  }, 开);

async function 拍(名, 中心x, 中心y, 倍) {
  await 页.evaluate(
    ({ 中心x, 中心y, 格, 倍 }) => {
      const s = window.__lksMap;
      const cam = s.cameras.main;
      s.传送像素(中心x * 格, 中心y * 格);
      cam.stopFollow();
      cam.setZoom(倍);
      cam.setScroll(
        Math.max(0, 中心x * 格 - cam.width / 倍 / 2),
        Math.max(0, 中心y * 格 - cam.height / 倍 / 2),
      );
      s.设目标(null);
    },
    { 中心x, 中心y, 格, 倍 },
  );
  await 等(450);
  const 画布 = await 页.$('.map-canvas canvas');
  await 画布.screenshot({ path: join(OUT, `${名}.png`) });
  console.log(`  ${名}.png  ← 对准 (${中心x},${中心y}) ×${倍}`);
}

await 开标注(true);
await 拍('正门-带中轴', 22, 26, 3);
await 拍('正门-全景', 22, 24, 2);
// 主角 spawn 到正门，看一眼"进门第一眼"
await 页.evaluate(() => {
  const s = window.__lksMap;
  s.传送像素(22 * 32 + 16, 26 * 32 + 32);
  s.cameras.main.startFollow(s.主角, true, 0.12, 0.12);
});
await 等(600);
let 画布 = await 页.$('.map-canvas canvas');
await 画布.screenshot({ path: join(OUT, '正门-主角进场.png') });
console.log('  正门-主角进场.png ← 主角站在前台，相机跟随');

await 开标注(false);
console.log(`\n输出：${OUT}`);
await 浏览器.close();

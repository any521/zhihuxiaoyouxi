/**
 * 工位局部放大图：把镜头固定到一个工位上放大 N 倍截图，用来看清"家具之间到底对不对齐"。
 *
 * ⚠️ 为什么必须放大：整屏截图里一个工位只有 ~44px，缩略图上根本量不出偏差。
 *
 * 用法：node tools/工位放大.mjs [段号]
 * 输出：tools/shots/工位/工位-放大.png 等
 */
import { mkdirSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import puppeteer from 'puppeteer-core';

const 段号 = Number(process.argv[2] ?? 1);
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
const 图宽格 = 45;
const 图高格 = 30;
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
await 页.evaluate((段) => {
  window.__lksStory.setState({ 屏幕: 'map', 段号: 段 });
}, 段号);
await 页.waitForFunction(() => !!window.__lksMap, { timeout: 20000 });
await 页.waitForSelector('.map-canvas canvas', { timeout: 20000 });
await 等(900);

/**
 * 放大截一个区域。
 * 主角是相机跟随目标，所以先把主角挪到别处，再手动 setScroll 对准要看的格子，
 * 否则相机会把镜头拉回主角身上。
 */
async function 放大图(名, 中心格x, 中心格y, 倍 = 4) {
  await 页.evaluate(
    ({ 中心格x, 中心格y, 格, 倍 }) => {
      const s = window.__lksMap;
      const cam = s.cameras.main;
      // 主角挪远，免得相机 follow 把 scroll 拉回去
      s.传送像素(中心格x * 格, 中心格y * 格);
      cam.stopFollow();
      cam.setZoom(倍);
      const 视宽 = cam.width / 倍;
      const 视高 = cam.height / 倍;
      cam.setScroll(
        Math.max(0, 中心格x * 格 + 格 / 2 - 视宽 / 2),
        Math.max(0, 中心格y * 格 + 格 / 2 - 视高 / 2),
      );
      s.设目标(null); // 别把指引线画进放大图
    },
    { 中心格x, 中心格y, 格, 倍 },
  );
  await 等(500);
  const 画布 = await 页.$('.map-canvas canvas');
  await 画布.screenshot({ path: join(OUT, `${名}.png`) });
  console.log(`  ${名}.png  ← 中心格 (${中心格x}, ${中心格y}) ×${倍}`);
}

async function 对(中心格x, 中心格y, 倍 = 4) {
  await 页.evaluate(
    ({ 中心格x, 中心格y, 格, 倍 }) => {
      const s = window.__lksMap;
      const cam = s.cameras.main;
      s.传送像素(中心格x * 格, 中心格y * 格);
      cam.stopFollow();
      cam.setZoom(倍);
      cam.setScroll(
        Math.max(0, 中心格x * 格 + 格 / 2 - cam.width / 倍 / 2),
        Math.max(0, 中心格y * 格 + 格 / 2 - cam.height / 倍 / 2),
      );
      s.设目标(null);
    },
    { 中心格x, 中心格y, 格, 倍 },
  );
  await 等(500);
  const 画布 = await 页.$('.map-canvas canvas');
  return 画布;
}

/** 试验用：把所有"办公桌"道具整体挪 dy 像素（只在探索摆位时手动调，`--试挪` 开启） */
async function 试挪桌(dy, 名) {
  const 数 = await 页.evaluate((dy) => {
    const s = window.__lksMap;
    let n = 0;
    for (const o of s.children.list) {
      if (o.texture && o.texture.key === 'prop_ws_办公桌') {
        o.y += dy;
        n += 1;
      }
    }
    return n;
  }, dy);
  await 等(300);
  const 画布 = await 对(18, 4);
  await 画布.screenshot({ path: join(OUT, `${名}.png`) });
  console.log(`  ${名}.png  ← ${数} 张办公桌下移 ${dy}px`);
}

console.log(`=== 工位放大图（段号 ${段号}）===\n`);
if (process.argv.includes('--前台')) {
  await 放大图('前台-正门', 22, 27, 3);
  await 放大图('前台-接待区', 16, 25, 3);
} else {
  await 放大图('工位-1排-18-4', 18, 4);
  await 放大图('工位-2排-18-8', 18, 8);
  await 放大图('工位-总监办公室', 28, 17);
}

if (process.argv.includes('--整图')) {
  // 整张地图：相机不跟人、zoom 1、scroll 0 → 一屏就是整张地图的左上 480×300
  await 页.evaluate(() => {
    const s = window.__lksMap;
    const cam = s.cameras.main;
    s.传送像素(32, 32);
    cam.stopFollow();
    cam.setZoom(1);
    cam.setScroll(0, 0);
    s.设目标(null);
  });
  await 等(400);
  let 画布 = await 页.$('.map-canvas canvas');
  await 画布.screenshot({ path: join(OUT, '整图-1-左上.png') });

  await 页.evaluate(() => {
    const cam = window.__lksMap.cameras.main;
    cam.setScroll(0, 660);
  });
  await 等(400);
  画布 = await 页.$('.map-canvas canvas');
  await 画布.screenshot({ path: join(OUT, '整图-2-左下-前台.png') });

  await 页.evaluate(() => {
    const cam = window.__lksMap.cameras.main;
    cam.setScroll(960, 660);
  });
  await 等(400);
  画布 = await 页.$('.map-canvas canvas');
  await 画布.screenshot({ path: join(OUT, '整图-3-右下.png') });

  console.log('  整图 3 块（×1，一屏 480×300 世界像素）');
}

console.log(`\n输出：${OUT}`);
await 浏览器.close();

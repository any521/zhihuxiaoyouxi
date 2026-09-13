/**
 * 正门像素核对：把镜头固定在地图角落，直接读**世界坐标**上的像素色，
 * 确认"正门那两格到底画出了什么"（是门瓦片还是白墙）。
 *
 * ⚠️ 为什么不用截图看：门瓦片和墙都是浅色，缩略图上看不出区别（我踩过）。
 *    读具体坐标的颜色才作数。
 *
 * 用法：node tools/正门像素.mjs
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
// 让 WebGL 画布能读回来
await 页.evaluateOnNewDocument(() => {
  const 原 = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (类型, 选项) {
    if (类型 === 'webgl' || 类型 === 'webgl2' || 类型 === 'experimental-webgl') {
      return 原.call(this, 类型, { ...(选项 || {}), preserveDrawingBuffer: true });
    }
    return 原.call(this, 类型, 选项);
  };
});
await 页.goto('http://127.0.0.1:5273/', { waitUntil: 'networkidle2' });
await 页.waitForFunction(() => typeof window.__lksStory === 'function', { timeout: 20000 });
await 等(600);
await 页.evaluate(() => window.__lksStory.setState({ 屏幕: 'map', 段号: 1 }));
await 页.waitForFunction(() => !!window.__lksMap, { timeout: 20000 });
await 等(1000);

/**
 * 读若干**世界坐标**的像素色。
 * ⚠️ 画布只有 480×300（内部分辨率），一屏装不下整张地图，
 *    所以按"窗口"分几批：移动相机 → 再读。每次只读当前窗口内的点。
 */
const 窗口 = [
  { 名: '左上角(墙/走廊起点)', scroll: [0, 0], 点: { 墙_左上: [16, 16], 墙_外圈: [1440 - 16, 16] } },
  { 名: '主走廊', scroll: [0, 300], 点: { 走廊_主: [720, 368] } },
  { 名: '竖廊 + 两侧墙（y18）', scroll: [600, 420], 点: {
      x20y18: [655, 592], x21y18: [687, 592], x22y18_竖廊: [719, 592],
      x23y18_竖廊: [751, 592], x24y18: [783, 592], x25y18: [815, 592],
    } },
  { 名: '前台抛光砖', scroll: [480, 660], 点: { 抛光砖: [720, 752] } },
  { 名: '正门那一行（y28 = 世界 y896..928）', scroll: [480, 660], 点: {
      门行_x656: [656, 912], 门行_x688: [688, 912], 门行_x704: [704, 912],
      门行_x720: [720, 912], 门行_x736: [736, 912], 门行_x752: [752, 912],
      门行_x784: [784, 912],
      门行_上边908: [704, 908], 门行_下边924: [704, 924],
      门上一格_y880: [704, 880],
    } },
];

/** 按世界 x 扫一条横线，输出"色块分段"，用来定位墙/门/地板的真实边界 */
const 扫描 = [
  { 名: 'y=912（正门那一行）', y: 912, x1: 600, x2: 840, scroll: [480, 630] },
  { 名: 'y=930（门外那一行）', y: 930, x1: 600, x2: 840, scroll: [480, 630] },
  { 名: 'y=736（前台最上一行 / 前厅交界）', y: 736, x1: 600, x2: 840, scroll: [480, 460] },
  { 名: 'y=592（竖廊 y18）', y: 592, x1: 600, x2: 840, scroll: [480, 300] },
];
for (const s of 扫描) {
  const r = await 页.evaluate(
    ({ y, x1, x2, scroll }) => {
      const s2 = window.__lksMap;
      const cam = s2.cameras.main;
      s2.传送像素(32, 32);
      cam.stopFollow();
      cam.setZoom(1);
      cam.setScroll(scroll[0], scroll[1]);
      const cv = s2.game.canvas;
      const 临 = document.createElement('canvas');
      临.width = cv.width;
      临.height = cv.height;
      const ctx = 临.getContext('2d');
      ctx.drawImage(cv, 0, 0);
      const img = ctx.getImageData(0, 0, 临.width, 临.height).data;
      const h = (v) => v.toString(16).padStart(2, '0');
      const 段 = [];
      let 当前 = null;
      for (let wx = x1; wx <= x2; wx += 1) {
        const x = Math.round(wx - cam.scrollX);
        const yy = Math.round(y - cam.scrollY);
        if (x < 0 || yy < 0 || x >= 临.width || yy >= 临.height) continue;
        const i = (yy * 临.width + x) * 4;
        const 色 = `#${h(img[i])}${h(img[i + 1])}${h(img[i + 2])}`;
        if (!当前 || 当前.色 !== 色) {
          当前 = { 色, 起: wx, 止: wx };
          段.push(当前);
        } else 当前.止 = wx;
      }
      return 段;
    },
    s,
  );
  console.log(`\n[扫描] ${s.名}（世界 x${s.x1}..${s.x2}）`);
  for (const d of r) {
    if (d.止 - d.起 < 2) continue; // 只报 ≥3px 的色块
    console.log(`  x${String(d.起).padStart(4)}..${String(d.止).padStart(4)}  ${d.色}  (格 ${(d.起 / 32).toFixed(2)}..${((d.止 + 1) / 32).toFixed(2)})`);
  }
}

const 全部 = {};
for (const w of 窗口) {
  const r = await 页.evaluate(
    ({ scroll, 点 }) => {
      const s = window.__lksMap;
      const cam = s.cameras.main;
      s.传送像素(32, 32);
      cam.stopFollow();
      cam.setZoom(1);
      cam.setScroll(scroll[0], scroll[1]);
      s.设目标(null);
      const cv = s.game.canvas;
      const 临 = document.createElement('canvas');
      临.width = cv.width;
      临.height = cv.height;
      const ctx = 临.getContext('2d');
      ctx.drawImage(cv, 0, 0);
      const img = ctx.getImageData(0, 0, 临.width, 临.height).data;
      const out = {};
      for (const [k, [wx, wy]] of Object.entries(点)) {
        const x = Math.round(wx - cam.scrollX);
        const y = Math.round(wy - cam.scrollY);
        if (x < 0 || y < 0 || x >= 临.width || y >= 临.height) {
          out[k] = `越界(屏${x},${y})`;
          continue;
        }
        const i = (y * 临.width + x) * 4;
        const h = (v) => v.toString(16).padStart(2, '0');
        out[k] = `#${h(img[i])}${h(img[i + 1])}${h(img[i + 2])}`;
      }
      return { 滚动: [Math.round(cam.scrollX), Math.round(cam.scrollY)], out };
    },
    { scroll: w.scroll, 点: w.点 },
  );
  console.log(`\n[${w.名}] 相机滚动 ${r.滚动}`);
  for (const [k, v] of Object.entries(r.out)) console.log(`  ${k.padEnd(18)} ${v}`);
  全部[w.名] = r.out;
}
await 浏览器.close();

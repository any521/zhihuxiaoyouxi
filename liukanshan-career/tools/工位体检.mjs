/**
 * 工位体检：把地图上某一块区域的**逐像素颜色**统计出来，找"不该出现在那儿的东西"。
 *
 * 为什么要这个：截图会骗人。一眼看不出"白块"是在桌上、在椅子后面、还是飘在空中；
 * 但"某块区域大面积纯白/亮色"是能量出来的。
 *
 * ⚠️ 关键坑：WebGL 画布的 drawingBuffer 默认**合成后就被清空**，
 *    直接 `drawImage(canvas)` 或 `toDataURL()` 读回来是**全黑**（实测踩过）。
 *    所以这里用 `evaluateOnNewDocument` 在页面脚本之前劫持
 *    `HTMLCanvasElement.prototype.getContext`，强制 `preserveDrawingBuffer: true`。
 *    —— 不改游戏源码，只在自动化里开这个开关。
 *
 * 用法：
 *   node tools/工位体检.mjs                     # 默认扫开放办公区
 *   $env:扫X=416; $env:扫Y=64; node tools/工位体检.mjs
 */
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
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

/** 扫哪一块世界坐标（默认：开放办公区 4 列 2 排工位） */
const 扫x = Number(process.env.扫X ?? 416);
const 扫y = Number(process.env.扫Y ?? 64);
/** 一块统计多大（世界像素） */
const 块宽 = Number(process.env.块宽 ?? 8);
const 块高 = Number(process.env.块高 ?? 8);

const 等 = (ms) => new Promise((r) => setTimeout(r, ms));
const 浏览器 = await puppeteer.launch({
  executablePath: EDGE,
  headless: 'new',
  args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--no-sandbox'],
});
const 页 = await 浏览器.newPage();
await 页.setViewport({ width: 1440, height: 900 });
// ★ 让 WebGL 画布可以被读回来
await 页.evaluateOnNewDocument(() => {
  const 原 = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (类型, 选项) {
    if (类型 === 'webgl' || 类型 === 'webgl2' || 类型 === 'experimental-webgl') {
      return 原.call(this, 类型, { ...(选项 || {}), preserveDrawingBuffer: true });
    }
    return 原.call(this, 类型, 选项);
  };
});
await 页.goto(URL, { waitUntil: 'networkidle2' });
await 页.waitForFunction(() => typeof window.__lksStory === 'function', { timeout: 20000 });
await 等(600);
await 页.evaluate(() => window.__lksStory.setState({ 屏幕: 'map', 段号: 1 }));
await 页.waitForFunction(() => !!window.__lksMap, { timeout: 20000 });
await 页.waitForSelector('.map-canvas canvas', { timeout: 20000 });
await 等(1000);

const 结果 = await 页.evaluate(
  ({ 扫x, 扫y, 块宽, 块高 }) => {
    const s = window.__lksMap;
    const cam = s.cameras.main;
    s.传送像素(32, 32); // 主角挪开
    cam.stopFollow();
    cam.setZoom(1);
    cam.setScroll(扫x, 扫y);
    s.设目标(null);
    // 强制立刻重绘一帧（不然拿到的可能是上一帧/空缓冲）
    s.game.renderer.snapshotPixel?.(0, 0, () => {});

    const cv = s.game.canvas;
    const 临 = document.createElement('canvas');
    临.width = cv.width;
    临.height = cv.height;
    const ctx = 临.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(cv, 0, 0);
    const img = ctx.getImageData(0, 0, 临.width, 临.height).data;

    const 行 = [];
    let 非零 = 0;
    for (let by = 0; by < 临.height; by += 块高) {
      const 列 = [];
      for (let bx = 0; bx < 临.width; bx += 块宽) {
        let 白 = 0;
        let 总 = 0;
        const 计 = new Map();
        for (let y = by; y < Math.min(by + 块高, 临.height); y += 1) {
          for (let x = bx; x < Math.min(bx + 块宽, 临.width); x += 1) {
            const i = (y * 临.width + x) * 4;
            const r = img[i];
            const gg = img[i + 1];
            const b = img[i + 2];
            总 += 1;
            if (r || gg || b) 非零 += 1;
            if (r > 240 && gg > 240 && b > 235) 白 += 1;
            const k = ((r >> 4) << 8) | ((gg >> 4) << 4) | (b >> 4);
            计.set(k, (计.get(k) ?? 0) + 1);
          }
        }
        let 主 = 0;
        let 主k = 0;
        for (const [k, v] of 计) if (v > 主) { 主 = v; 主k = k; }
        const rr = ((主k >> 8) & 15) * 17;
        const gg = ((主k >> 4) & 15) * 17;
        const bb = (主k & 15) * 17;
        const 色 = `#${rr.toString(16).padStart(2, '0')}${gg.toString(16).padStart(2, '0')}${bb.toString(16).padStart(2, '0')}`;
        列.push({ 白比: +(白 / 总).toFixed(2), 主色: 色, 主色比: +(主 / 总).toFixed(2) });
      }
      行.push(列);
    }
    return {
      视口: { w: 临.width, h: 临.height },
      非零像素: 非零,
      滚动: { x: Math.round(cam.scrollX), y: Math.round(cam.scrollY) },
      行,
    };
  },
  { 扫x, 扫y, 块宽, 块高 },
);

console.log(
  `视口 ${结果.视口.w}×${结果.视口.h} · scroll (${结果.滚动.x},${结果.滚动.y}) · 非零像素 ${结果.非零像素}`,
);
if (!结果.非零像素) console.log('⚠️ 读回来是全黑 —— preserveDrawingBuffer 没生效，后面数据不可信');

// 主色网格
console.log(`\n主色网格（每格 ${块宽}×${块高} 世界像素；列 = 世界 x / 32，行 = 世界 y / 32）：`);
console.log('       ' + 结果.行[0].map((_, i) => String((i * 块宽 + 结果.滚动.x) / 32).padStart(7)).join(''));
结果.行.forEach((列, by) => {
  const y = (by * 块高 + 结果.滚动.y) / 32;
  console.log(String(y.toFixed(2)).padStart(6) + ' ' + 列.map((c) => c.主色.padStart(7)).join(''));
});

// 亮色块（白狐/衣服/白纸）
const 亮 = [];
结果.行.forEach((列, by) => {
  列.forEach((c, bx) => {
    const r = parseInt(c.主色.slice(1, 3), 16);
    const g2 = parseInt(c.主色.slice(3, 5), 16);
    const b2 = parseInt(c.主色.slice(5, 7), 16);
    if (r > 225 && g2 > 215 && b2 > 195) {
      亮.push({
        世: { x: Math.round(bx * 块宽 + 结果.滚动.x), y: Math.round(by * 块高 + 结果.滚动.y) },
        主色: c.主色,
        比: c.主色比,
      });
    }
  });
});
console.log(`\n亮块（主色接近米白/纯白）共 ${亮.length} 个：`);
for (const b of 亮.slice(0, 80)) {
  console.log(
    `  世界(${b.世.x},${b.世.y}) 格(${(b.世.x / 32).toFixed(2)},${(b.世.y / 32).toFixed(2)}) 主色 ${b.主色}（占该块 ${b.比}）`,
  );
}

writeFileSync(join(OUT, '工位体检.json'), JSON.stringify(结果, null, 1));
console.log(`\n原始数据：${join(OUT, '工位体检.json')}`);
await 浏览器.close();

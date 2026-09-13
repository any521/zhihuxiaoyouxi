/**
 * 读运行时网格：直接问 Phaser **游戏里真实的网格**（场景持有的那份），
 * 而不是去读源码或截图。
 *
 * 为什么需要：`tools/读网格.mjs` 是把 level.ts 的逻辑抄一遍跑的，
 * 抄错了就白量（我踩过：门表正则没抠到"布局.竖廊西 + 1"）。
 * 这个脚本读的是**游戏正在用的数据**，不含任何转述。
 *
 * 用法：node tools/读运行时网格.mjs [行1] [行2]
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
await 页.goto('http://127.0.0.1:5273/', { waitUntil: 'networkidle2' });
await 页.waitForFunction(() => typeof window.__lksStory === 'function', { timeout: 20000 });
await 等(600);
await 页.evaluate(() => window.__lksStory.setState({ 屏幕: 'map', 段号: 1 }));
await 页.waitForFunction(() => !!window.__lksMap, { timeout: 20000 });
await 等(1000);

const 行1 = Number(process.argv[2] ?? 0);
const 行2 = Number(process.argv[3] ?? 29);

const r = await 页.evaluate(
  ({ 行1, 行2 }) => {
    const s = window.__lksMap;
    const 图层 = s.图层;
    const 宽 = 图层.layer.width;
    const 高 = 图层.layer.height;
    /** tile.index → 名字（用场景里的瓦片名表反查） */
    const 行 = [];
    for (let y = 行1; y <= 行2; y += 1) {
      const 列 = [];
      for (let x = 0; x < 宽; x += 1) {
        const t = 图层.getTileAt(x, y);
        列.push(t ? t.index : -1);
      }
      行.push(列);
    }
    // 顺便把"场景里真实存在的门物理挡板数量"报一下
    return { 宽, 高, 行 };
  },
  { 行1, 行2 },
);

/** 瓦片号 → 名字 */
const 瓦片名 = {
  0: '浅灰地毯', 1: '深灰地毯', 2: '防滑砖', 3: '抛光砖', 4: '走廊地砖', 5: '木地板',
  6: '白墙', 7: '玻璃', 8: '门横左', 9: '门横右', 10: '门竖上', 11: '门竖下',
  12: '门横左关', 13: '门横右关', 14: '门竖上关', 15: '门竖下关', 16: '桌面',
};
const 符号 = {
  浅灰地毯: '·', 深灰地毯: ',', 防滑砖: ':', 抛光砖: '=', 走廊地砖: '-', 木地板: '~',
  白墙: '█', 玻璃: '▒', 门横左: 'L', 门横右: 'R', 门竖上: 'U', 门竖下: 'D',
  门横左关: 'l', 门横右关: 'r', 门竖上关: 'u', 门竖下关: 'd', 桌面: 'T',
};

console.log(`运行时网格 ${r.宽}×${r.高}`);
let 标 = '     ';
for (let x = 0; x < r.宽; x += 1) 标 += x % 10 === 0 ? String((x / 10) % 10) : ' ';
console.log(标);
标 = '     ';
for (let x = 0; x < r.宽; x += 1) 标 += String(x % 10);
console.log(标);
r.行.forEach((列, i) => {
  const y = 行1 + i;
  const s = 列.map((号) => 符号[瓦片名[号]] ?? (号 < 0 ? '?' : String(号))).join('');
  console.log(String(y).padStart(4) + ' ' + s);
});
await 浏览器.close();

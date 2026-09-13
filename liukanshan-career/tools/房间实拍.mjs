/**
 * 房间实拍：把某个房间放大截一张图，用来核对"同事是不是都在该在的地方、坐没坐对"。
 *
 * 用法（在游戏目录跑）：
 *   node tools/房间实拍.mjs 茶水间          # 按名字
 *   node tools/房间实拍.mjs 6 18 3          # 或直接给中心格 x y 和倍数
 *
 * 输出：tools/shots/房间/<名字>-段<段号>.png
 */
import { mkdirSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import puppeteer from 'puppeteer-core';

const OUT = resolve('tools/shots/房间');
mkdirSync(OUT, { recursive: true });
const EDGE = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
].find((p) => existsSync(p));

/** 房间名 → [中心格x, 中心格y, 建议倍数] */
const 房间表 = {
  茶水间: [6, 18, 3],
  开放办公区: [20, 5, 2],
  会议室A: [6, 6, 3],
  会议室B: [37, 6, 3],
  文印区: [15, 18, 3],
  总监办公室: [28, 18, 3],
  前台: [20, 25, 2],
};

const 参数 = process.argv.slice(2);
let 名;
let 中心x;
let 中心y;
let 倍;
if (参数.length >= 2 && !Number.isNaN(Number(参数[0]))) {
  [中心x, 中心y, 倍] = [Number(参数[0]), Number(参数[1]), Number(参数[2] ?? 3)];
  名 = `格${中心x}-${中心y}`;
} else {
  名 = 参数[0] ?? '茶水间';
  const 房 = 房间表[名];
  if (!房) {
    console.error(`不认识的房间「${名}」，可选：${Object.keys(房间表).join(' / ')}`);
    process.exit(1);
  }
  [中心x, 中心y, 倍] = 房;
}
const 段 = Number(参数[3] ?? 段号默认());
function 段号默认() {
  return 3;
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
await 页.goto('http://127.0.0.1:5273/', { waitUntil: 'networkidle2' });
await 页.waitForFunction(() => typeof window.__lksStory === 'function', { timeout: 20000 });
await 等(600);
await 页.evaluate((s) => window.__lksStory.setState({ 屏幕: 'map', 段号: s }), 段);
await 页.waitForFunction(() => !!window.__lksMap, { timeout: 20000 });
await 等(900);

await 页.evaluate(
  ({ 中心x, 中心y, 倍 }) => {
    const s = window.__lksMap;
    const cam = s.cameras.main;
    // ⚠️ 别手动 setScroll：相机有 bounds 夹取、又和自己的 zoom 耦合，
    //    实测 scroll 会被夹到别处（截出来的房间不对，白忙一场）。
    //    可靠做法：**把人传送到要看的位置，让相机跟着他**（跟随本来就是它的本职工作）。
    //    主角会出现在画面正中，所以要把要看的同事放在边上一点。
    s.传送像素(中心x * 32, 中心y * 32);
    cam.setZoom(倍);
    cam.startFollow(s.主角, true, 1, 1);
    s.设目标(null);
  },
  { 中心x, 中心y, 倍 },
);
await 等(600);
const 画布 = await 页.$('.map-canvas canvas');
const 文件 = join(OUT, `${名}-段${段}.png`);
await 画布.screenshot({ path: 文件 });
console.log(`${文件}  ← ${名} 中心格(${中心x},${中心y}) ×${倍} 段${段}`);
await 浏览器.close();

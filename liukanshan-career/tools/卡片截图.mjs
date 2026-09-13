/**
 * 卡片截图：把主角站到"既有家具又有同事"的地方，截一张图看两张卡片的实际观感。
 *
 * 用法：node tools/卡片截图.mjs
 */
import { mkdirSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import puppeteer from 'puppeteer-core';

const OUT = resolve('tools/shots/卡片');
mkdirSync(OUT, { recursive: true });
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

async function 拍(名, 格x, 格y) {
  await 页.evaluate(
    ({ 格x, 格y }) => {
      const s = window.__lksMap;
      s.传送像素(格x * 32 + 16, 格y * 32 + 32);
      s.cameras.main.startFollow(s.主角, true, 0.12, 0.12);
    },
    { 格x, 格y },
  );
  await 等(500);
  await 页.screenshot({ path: join(OUT, `${名}.png`) });
  const 有什么 = await 页.evaluate(() => ({
    道具卡: document.querySelector('.map-prop:not(.who) .map-prop-head')?.textContent ?? null,
    人物卡: document.querySelector('.map-prop.who .map-prop-head')?.textContent ?? null,
  }));
  console.log(`  ${名}.png  道具卡=${有什么.道具卡}  人物卡=${有什么.人物卡}`);
}

console.log('=== 卡片截图 ===\n');
await 拍('站工位旁（同事+工位）', 24, 4);
await 拍('站同事旁边（阿麦）', 15, 5);
await 拍('站打印机前', 18, 17);
await 拍('站会议室门口', 6, 11);
await 拍('站茶水间吧台', 6, 17);
console.log(`\n输出：${OUT}`);
await 浏览器.close();

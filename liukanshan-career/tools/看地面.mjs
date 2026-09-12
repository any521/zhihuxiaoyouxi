/**
 * 放大检查：截取关卡地面的一小块，放大后看是否有渲染接缝。
 * 用法：node tools/看地面.mjs
 */
import { resolve } from 'node:path';
import puppeteer from 'puppeteer-core';

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const sleep = (ms) => new Promise((d) => setTimeout(d, ms));

const browser = await puppeteer.launch({
  executablePath: EDGE,
  headless: true,
  args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-angle=swiftshader'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1400, height: 900, deviceScaleFactor: 1 });
await page.goto('http://127.0.0.1:5273/', { waitUntil: 'networkidle2' });
await page.waitForSelector('.frame canvas');
await sleep(1200);
const 按钮 = await page.$('.modal button');
if (按钮) await 按钮.click();
await sleep(1000);

// 找到画布在页面里的位置
const 框 = await page.evaluate(() => {
  const c = document.querySelector('.frame canvas');
  const r = c.getBoundingClientRect();
  return { x: r.x, y: r.y, w: r.width, h: r.height };
});
console.log('画布位置', JSON.stringify(框));

// 取画布中间偏下的一小块地面（避开角色与道具），放大 6 倍
await page.screenshot({
  path: resolve(process.cwd(), 'tools/shots/地面局部.png'),
  clip: { x: 框.x + 框.w * 0.25, y: 框.y + 框.h * 0.72, width: 96, height: 96 },
});
console.log('已保存 tools/shots/地面局部.png');
await browser.close();

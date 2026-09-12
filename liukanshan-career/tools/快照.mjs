/**
 * 快速快照：PC 与手机各截一组，不驱动机器人，20 秒内出图。
 * 用法：node tools/快照.mjs
 */
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import puppeteer from 'puppeteer-core';

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const OUT = resolve(process.cwd(), 'tools/shots');
const sleep = (ms) => new Promise((d) => setTimeout(d, ms));

const 设备 = [
  { 名: 'pc', 宽: 1400, 高: 900 },
  { 名: '手机', 宽: 420, 高: 900 },
];

const browser = await puppeteer.launch({
  executablePath: EDGE,
  headless: true,
  args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-angle=swiftshader'],
});

mkdirSync(OUT, { recursive: true });
const 全部错误 = [];

for (const 台 of 设备) {
  const page = await browser.newPage();
  await page.setViewport({ width: 台.宽, height: 台.高 });
  page.on('pageerror', (e) => 全部错误.push(`[${台.名}] ${e.message}`));
  page.on('response', (r) => {
    if (r.status() >= 400) 全部错误.push(`[${台.名}] HTTP ${r.status()} ${r.url()}`);
  });

  await page.goto('http://127.0.0.1:5273/', { waitUntil: 'networkidle2' });
  await page.waitForSelector('.frame canvas');
  await sleep(1200);
  await page.screenshot({ path: resolve(OUT, `快照-${台.名}-1-开始页.png`) });

  const 按钮 = await page.$('.modal button');
  if (按钮) await 按钮.click();
  await sleep(1000);
  await page.screenshot({ path: resolve(OUT, `快照-${台.名}-2-关卡.png`) });

  const 信息 = await page.evaluate(() => {
    const 探针 = window.__lksProbe?.();
    const canvas = document.querySelector('.frame canvas');
    return {
      方向: 探针?.orientation,
      地图像素: 探针 ? `${探针.grid[0].length * 探针.tile}×${探针.grid.length * 探针.tile}` : '?',
      画布: canvas ? `${canvas.width}×${canvas.height}` : '?',
    };
  });
  console.log(`[${台.名}] ${信息.方向} · 地图 ${信息.地图像素} · 画布 ${信息.画布}`);
  await page.close();
}

console.log(`\n快照：tools/shots/快照-*.png（PC + 手机各两张）`);
console.log(全部错误.length ? 全部错误.join('\n') : '无错误');
await browser.close();

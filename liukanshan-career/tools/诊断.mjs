/**
 * 诊断：检查 Phaser 里素材是否加载、背景图是否在场景里、碰撞层是否真隐藏。
 * 用法：node tools/诊断.mjs
 */
import puppeteer from 'puppeteer-core';

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const sleep = (ms) => new Promise((d) => setTimeout(d, ms));

const browser = await puppeteer.launch({
  executablePath: EDGE,
  headless: true,
  args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-angle=swiftshader'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1200, height: 800 });
const 失败 = [];
page.on('requestfailed', (r) => 失败.push(`${r.url()} :: ${r.failure()?.errorText}`));
page.on('response', (r) => {
  if (r.status() >= 400) 失败.push(`HTTP ${r.status()} ${r.url()}`);
});
page.on('pageerror', (e) => 失败.push(`[pageerror] ${e.message}`));

await page.goto('http://127.0.0.1:5273/', { waitUntil: 'networkidle2' });
await page.waitForSelector('.frame canvas');
await sleep(1500);

const 报告 = await page.evaluate(() => {
  const game = window.__lksGame;
  if (!game) return { 错误: '拿不到 game 实例' };
  const scene = game.scene.getScene('office');
  if (!scene) return { 错误: '拿不到 office 场景' };

  const 纹理 = game.textures.getTextureKeys().filter((k) => !k.startsWith('__'));

  // 看场景里所有显示对象
  const 对象 = scene.children.list.map((o) => ({
    类型: o.type,
    纹理: o.texture?.key ?? '',
    可见: o.visible,
    深度: o.depth,
    x: Math.round(o.x ?? 0),
    y: Math.round(o.y ?? 0),
  }));

  const 背景 = 对象.filter((o) => o.纹理.includes('jobfair'));
  const 瓦片层 = 对象.filter((o) => o.类型.includes('Tilemap'));

  return {
    纹理数: 纹理.length,
    纹理列表: 纹理,
    显示对象数: 对象.length,
    背景对象: 背景,
    瓦片层: 瓦片层,
    前八个对象: 对象.slice(0, 8),
  };
});

console.log(JSON.stringify(报告, null, 2));
console.log('\n=== 网络层失败 ===');
console.log(失败.length ? 失败.join('\n') : '（无）');

await browser.close();

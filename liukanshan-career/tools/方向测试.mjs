/**
 * 四方向行走动画验证：分别按 W / A / S / D，检查朝向、当前动画与贴图是否跟着变。
 * 用法：node tools/方向测试.mjs
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
await page.setViewport({ width: 1400, height: 900 });
await page.goto('http://127.0.0.1:5273/', { waitUntil: 'networkidle2' });
await page.waitForSelector('.frame canvas');
await sleep(1200);
const 按钮 = await page.$('.modal button');
if (按钮) await 按钮.click();
await sleep(500);

const 读 = () =>
  page.evaluate(() => {
    const s = window.__lksGame.scene.getScene('office');
    const p = window.__lksProbe();
    return {
      朝向: p.facing,
      动画: s.player.anims.currentAnim?.key ?? '(无)',
      播放中: s.player.anims.isPlaying,
      贴图: s.player.texture.key,
      翻转: s.player.flipX,
      位置: `${Math.round(p.x)},${Math.round(p.y)}`,
    };
  });

const 试 = async (键, 名) => {
  await page.keyboard.down(键);
  await sleep(400);
  const 中 = await 读();
  await page.keyboard.up(键);
  await sleep(300);
  const 停 = await 读();
  console.log(
    `${名}  走动中：朝向=${中.朝向} 动画=${中.动画} 翻转=${中.翻转} 贴图=${中.贴图}\n` +
      `      停下后：动画=${停.动画} 贴图=${停.贴图} 朝向=${停.朝向}`,
  );
};

await 试('a', 'A 左 ');
await 试('d', 'D 右 ');
await 试('w', 'W 上 ');
await 试('s', 'S 下 ');

await browser.close();


import { existsSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import puppeteer from 'puppeteer-core';
const EDGE = ['C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe','C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'].find((p) => existsSync(p));
const 出 = resolve('tools/shots/携带');
mkdirSync(出, { recursive: true });
const b = await puppeteer.launch({ executablePath: EDGE, headless: 'new', args: ['--enable-unsafe-swiftshader','--use-angle=swiftshader','--no-sandbox','--force-device-scale-factor=1'] });
const p = await b.newPage();
await p.setViewport({ width: 1440, height: 900 });
p.on('pageerror', (e) => console.log('[pageerror]', e.message));
await p.goto('http://127.0.0.1:5273/', { waitUntil: 'networkidle2' });
await p.waitForFunction(() => typeof window.__lksStory === 'function', { timeout: 20000 });
await new Promise((r) => setTimeout(r, 700));
await p.evaluate(() => {
  window.__lksStory.setState({ 屏幕: 'level', 关卡标题: '拍携带', 关卡提示: '', 待开小游戏: null });
});
await p.waitForFunction(() => !!window.__lksGame?.scene?.getScene('office'), { timeout: 20000 });
await new Promise((r) => setTimeout(r, 1200));
await p.evaluate(() => {
  const bt = [...document.querySelectorAll('.overlay button')].find((x) => x.textContent === '开始干活');
  bt?.click();
});
await new Promise((r) => setTimeout(r, 1200));
// 手上拿一份做过两道工序的稿子
await p.evaluate(() => {
  const 场 = window.__lksGame.scene.getScene('office');
  场.carrying = 'draft';
  场.carryTags = ['查资料', '写稿'];
});
for (const 朝向 of ['down', 'left', 'right', 'up']) {
  await p.evaluate((f) => {
    const 场 = window.__lksGame.scene.getScene('office');
    场.facing = f;
    场.player.anims.stop();
  }, 朝向);
  await new Promise((r) => setTimeout(r, 350));
  await p.screenshot({ path: join(出, `携带-${朝向}.png`), clip: { x: 540, y: 380, width: 360, height: 340 } });
  console.log('  → 携带-' + 朝向 + '.png');
}
await b.close();

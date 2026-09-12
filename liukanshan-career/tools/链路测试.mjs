/**
 * 完整链路测试：取简章 → 工位加工 → 投递箱交付
 *
 * 用"瞬移 + 按键"的方式快速验证交互逻辑（比机器人寻路快得多），
 * 每一步都打印实际坐标，便于定位是"没传送过去"还是"交互没触发"。
 *
 * 用法：node tools/链路测试.mjs
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
const 页面错误 = [];
page.on('pageerror', (e) => 页面错误.push(e.message));

await page.goto('http://127.0.0.1:5273/', { waitUntil: 'networkidle2' });
await page.waitForSelector('.frame canvas');
await sleep(1200);
const 开始按钮 = await page.$('.modal button');
if (开始按钮) await 开始按钮.click();
await sleep(700);

const 探针 = () => page.evaluate(() => window.__lksProbe());

/** 把主角瞬移到某个工位旁边的可站立格 */
function 站到旁边(kind) {
  return page.evaluate((目标工位) => {
    const 场景 = window.__lksGame.scene.getScene('office');
    const 点 = window.__lksProbe().approaches[目标工位];
    场景.player.setPosition(点.x, 点.y);
    场景.player.body.reset(点.x, 点.y);
    return 点;
  }, kind);
}

async function 按空格() {
  await page.keyboard.press('Space');
  await sleep(150);
}

const 初始 = await 探针();
console.log('工位坐标  ', JSON.stringify(初始.stations));
console.log('可站立点  ', JSON.stringify(初始.approaches));
console.log('');

// ① 资料架
await 站到旁边('shelf');
await sleep(150);
let 状态 = await 探针();
console.log(`① 站到资料架旁  位置(${状态.x},${状态.y})  最近工位=${状态.nearest}`);
await 按空格();
状态 = await 探针();
console.log(`   按空格        手上=${状态.carrying}  ${状态.carrying === 'flyer' ? '✅' : '❌'}`);

// ② 工位加工
await 站到旁边('desk');
await sleep(150);
状态 = await 探针();
console.log(`② 站到工位旁    位置(${状态.x},${状态.y})  最近工位=${状态.nearest}`);
await 按空格();
状态 = await 探针();
console.log(`   按空格        加工进度=${状态.processing}  ${状态.processing > 0 ? '✅ 开始加工' : '❌ 没开始'}`);
await sleep(1500);
状态 = await 探针();
console.log(`   等 1.5 秒     手上=${状态.carrying}  ${状态.carrying === 'resume' ? '✅ 加工完成' : '❌ 没完成'}`);

// ③ 投递箱
await 站到旁边('bin');
await sleep(150);
状态 = await 探针();
console.log(`③ 站到投递箱旁  位置(${状态.x},${状态.y})  最近工位=${状态.nearest}  箱子锁=${状态.binLocked}`);
await 按空格();
状态 = await 探针();
console.log(`   按空格        已交付=${状态.delivered} 份  手上=${状态.carrying}  ${状态.delivered === 1 ? '✅' : '❌'}`);

console.log('');
console.log(`页面错误：${页面错误.length ? 页面错误.join(' | ') : '无'}`);
await browser.close();

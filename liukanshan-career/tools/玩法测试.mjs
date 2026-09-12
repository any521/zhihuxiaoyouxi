/**
 * 玩法测试：订单匹配、按工序交付、丢下/捡起、NPC 动画。
 * 用法：node tools/玩法测试.mjs
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
const 错误 = [];
page.on('pageerror', (e) => 错误.push(e.message));
await page.goto('http://127.0.0.1:5273/', { waitUntil: 'networkidle2' });
await page.waitForSelector('.frame canvas');
await sleep(1200);
const 开始 = await page.$('.modal button');
if (开始) await 开始.click();
await sleep(700);

const 探针 = () => page.evaluate(() => window.__lksProbe());
const 瞬移 = (kind) =>
  page.evaluate((k) => {
    const s = window.__lksGame.scene.getScene('office');
    const p = window.__lksProbe().approaches[k];
    s.player.setPosition(p.x, p.y);
    s.player.body.reset(p.x, p.y);
  }, kind);
const 空格 = async () => {
  await page.keyboard.press('Space');
  await sleep(200);
};
const 站 = (s) => `手上=${s.carrying ?? '空'} 工序=[${s.carryTags.join(',')}]`;

const 初 = await 探针();
console.log('挂出订单：');
初.orders.forEach((o) => console.log(`   ${o.公司} · 需要 ${o.需要.join('+') || '直接投'}`));

// ① 取简历
await 瞬移('shelf');
await 空格();
console.log(`\n① 简历架取料      ${站(await 探针())}`);

// ② 按第一张订单需要的工序逐个上机
const 首单 = (await 探针()).orders[0];
console.log(`   目标订单：${首单.公司} 需要 ${首单.需要.join('+')}`);
for (const g of 首单.需要) {
  const 台 = { 排版: 'typeset', 打印: 'print', 盖章: 'stamp' }[g];
  await 瞬移(台);
  await 空格();
  await sleep(1100);
  console.log(`② 上机「${g}」      ${站(await 探针())}`);
}

// ③ 交付
await 瞬移('bin');
await 空格();
const 交付后 = await 探针();
console.log(`③ 投递箱交付      交付=${交付后.delivered} 投错=${交付后.failed}  ${站(交付后)}`);

// ④ 丢下 / 捡起
await 瞬移('shelf');
await 空格();
console.log(`\n④ 再取一份          ${站(await 探针())}`);
await page.keyboard.press('q');
await sleep(250);
const 丢后 = await 探针();
console.log(`   按 Q 丢下         ${站(丢后)}  地上=${丢后.ground.length} 件`);
await 空格();
const 捡后 = await 探针();
console.log(`   空格捡回          ${站(捡后)}  地上=${捡后.ground.length} 件`);

// ⑤ NPC 动画
const npc采样 = [];
for (let i = 0; i < 5; i += 1) {
  await sleep(260);
  npc采样.push(await page.evaluate(() => {
    const s = window.__lksGame.scene.getScene('office');
    return `${s.npc.anims.currentAnim?.key ?? '静止'}`;
  }));
}
console.log(`\n⑤ 学长动画采样     ${npc采样.join(' → ')}`);

// ⑥ Esc 暂停
await page.keyboard.press('Escape');
await sleep(400);
const 暂停态 = await page.evaluate(() => ({
  phase: window.__lksProbe && window.__lksProbe().running,
  有菜单: Boolean(document.querySelector('.modal.pause')),
}));
console.log(`\n⑥ Esc 菜单         显示=${暂停态.有菜单}`);
await page.keyboard.press('Escape');
await sleep(300);
console.log(`   再按 Esc 关闭     显示=${await page.evaluate(() => Boolean(document.querySelector('.modal.pause')))}`);

console.log(`\n页面错误：${错误.length ? 错误.join(' | ') : '无'}`);
await browser.close();

/**
 * 开场 / 微信式 AVG 截图。
 *
 * PC（1440×900）与手机（390×844）各来一套：
 *   开场 3 格 → 林总私聊 → 群邀请 → 群聊 → 选项 → 选择结果 → 周岚私聊 → 知乎卡
 *
 * 用法：node tools/剧情快照.mjs
 */
import { mkdirSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import puppeteer from 'puppeteer-core';

const URL = 'http://127.0.0.1:5273/';
const 出目录 = resolve('tools/shots/剧情');
mkdirSync(出目录, { recursive: true });

const EDGE = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
].find((p) => existsSync(p));
if (!EDGE) {
  console.error('找不到 Edge');
  process.exit(1);
}

const 浏览器 = await puppeteer.launch({
  executablePath: EDGE,
  headless: 'new',
  args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--no-sandbox', '--force-device-scale-factor=1'],
});

const 等 = (ms) => new Promise((r) => setTimeout(r, ms));

async function 抓(页, 名) {
  await 页.screenshot({ path: join(出目录, `${名}.png`) });
  console.log(`  ${名}.png`);
}

/** 连推数步直到满足条件或到上限 */
async function 推到(页, 条件, 上限 = 120, 每步等 = 60) {
  for (let i = 0; i < 上限; i += 1) {
    const 好 = await 页.evaluate(条件);
    if (好) return true;
    await 页.evaluate(() => window.__lksStory.getState().推进一步());
    await 等(每步等);
  }
  return false;
}

async function 一套(标签, 视口) {
  const 页 = await 浏览器.newPage();
  await 页.setViewport(视口);
  页.on('pageerror', (e) => console.log(`  [页面错误] ${e.message}`));
  await 页.goto(URL, { waitUntil: 'networkidle2' });
  await 等(700);

  // ── 开场动画 ──
  await 页.evaluate(() => window.__lksStory.setState({ 开场格: 1 }));
  await 等(1200);
  await 抓(页, `${标签}-1-开场`);
  await 页.evaluate(() => window.__lksStory.setState({ 开场格: 5 }));
  await 等(1400);
  await 抓(页, `${标签}-2-标题卡`);

  // ── 进微信，播到群邀请 ──
  await 页.evaluate(() => window.__lksStory.getState().跳过开场());
  await 等(300);
  await 推到(页, () => !!window.__lksStory.getState().待接受邀请);
  await 等(400);
  await 抓(页, `${标签}-3-林总私聊与邀请`);

  // ── 接受邀请 → 群聊 ──
  await 页.evaluate(() => window.__lksStory.getState().接受邀请());
  await 推到(页, () => !!window.__lksStory.getState().待选择);
  await 等(400);
  await 抓(页, `${标签}-4-群聊与选项`);

  // ── 选 A ──
  await 页.evaluate(() => window.__lksStory.getState().选择(0));
  for (let i = 0; i < 10; i += 1) {
    await 页.evaluate(() => window.__lksStory.getState().推进一步());
    await 等(60);
  }
  await 等(300);
  await 抓(页, `${标签}-5-选择结果`);

  // ── 播到周岚私聊 ──
  await 推到(页, () => {
    const st = window.__lksStory.getState();
    return st.查看会话 === 'zhou' && st.待暂停;
  });
  await 等(400);
  await 抓(页, `${标签}-6-周岚私聊`);

  // ── 回看群聊（点会话列表）──
  await 页.evaluate(() => window.__lksStory.getState().查看('group'));
  await 等(400);
  await 抓(页, `${标签}-7-回看群聊`);

  await 页.close();
}

console.log('=== 剧情屏快照 ===\n');
console.log('[PC 1440×900]');
await 一套('pc', { width: 1440, height: 900 });
console.log('\n[手机 390×844]');
await 一套('手机', { width: 390, height: 844, isMobile: true, hasTouch: true });

await 浏览器.close();
console.log(`\n输出：${出目录}`);

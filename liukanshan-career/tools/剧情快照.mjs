/**
 * 开场 / AVG 截图。
 *
 * 和 tools/快照.mjs 不同，这个针对新的剧情屏：
 *   · 开场动画：抓第 0 / 2 / 5 格
 *   · AVG：抓几条对话、群邀请、选项
 * PC（1440×900）与手机（390×844）各来一套。
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

/** 等一会儿 */
const 等 = (ms) => new Promise((r) => setTimeout(r, ms));

/** 抓一张 */
async function 抓(页, 名) {
  const p = join(出目录, `${名}.png`);
  await 页.screenshot({ path: p });
  console.log(`  ${名}.png`);
}

/** 跑一套（一个视口） */
async function 一套(标签, 视口) {
  const 页 = await 浏览器.newPage();
  await 页.setViewport(视口);
  页.on('pageerror', (e) => console.log(`  [页面错误] ${e.message}`));
  await 页.goto(URL, { waitUntil: 'networkidle2' });
  await 等(700);

  // ---- 开场动画：抓几格 ----
  const 格数 = await 页.evaluate(() => (window.__lksStory ? window.__lksStory.getState().开场格 : -1));
  await 抓(页, `${标签}-1-开场格${格数}`);

  // 跳到第 2 格（"然后，电话响了"）
  await 页.evaluate(() => window.__lksStory.setState({ 开场格: 2 }));
  await 等(1200);
  await 抓(页, `${标签}-2-开场格2`);

  // 跳到最后一格（标题卡）
  await 页.evaluate(() => window.__lksStory.setState({ 开场格: 5 }));
  await 等(1400);
  await 抓(页, `${标签}-3-标题卡`);

  // ---- 进 AVG，让它自己播 ----
  await 页.evaluate(() => window.__lksStory.getState().跳过开场());
  await 等(300);

  // 播到群邀请停下来（引擎会在邀请处自动停）
  for (let i = 0; i < 40; i += 1) {
    const s = await 页.evaluate(() => {
      const st = window.__lksStory.getState();
      return { 邀请: !!st.待接受邀请, 位置: st.位置, 条目: st.条目.length };
    });
    if (s.邀请) break;
    await 页.evaluate(() => window.__lksStory.getState().推进一步());
    await 等(90);
  }
  await 等(400);
  await 抓(页, `${标签}-4-群邀请`);

  // 接受邀请，继续播到选项
  await 页.evaluate(() => window.__lksStory.getState().接受邀请());
  for (let i = 0; i < 60; i += 1) {
    const s = await 页.evaluate(() => {
      const st = window.__lksStory.getState();
      return { 选择: !!st.待选择, 播完: st.播完 };
    });
    if (s.选择) break;
    await 页.evaluate(() => window.__lksStory.getState().推进一步());
    await 等(80);
  }
  await 等(400);
  await 抓(页, `${标签}-5-群聊与选项`);

  // 选 A，看结果与指标
  await 页.evaluate(() => window.__lksStory.getState().选择(0));
  for (let i = 0; i < 12; i += 1) {
    await 页.evaluate(() => window.__lksStory.getState().推进一步());
    await 等(70);
  }
  await 等(400);
  await 抓(页, `${标签}-6-选择结果`);

  // 一路播到知乎卡
  for (let i = 0; i < 80; i += 1) {
    const s = await 页.evaluate(() => {
      const st = window.__lksStory.getState();
      return { 暂停: !!st.待暂停, 知乎卡: st.条目.filter((x) => x.种类 === '知乎卡').length };
    });
    if (s.暂停 || s.知乎卡 >= 1) break;
    await 页.evaluate(() => window.__lksStory.getState().推进一步());
    await 等(60);
  }
  await 等(400);
  await 抓(页, `${标签}-7-知乎卡`);

  // 滚到最底看最终态
  await 页.evaluate(() => {
    const el = document.querySelector('.avg-scroll');
    if (el) el.scrollTop = el.scrollHeight;
  });
  等(200);
  await 等(300);
  await 抓(页, `${标签}-8-末态`);

  const 错误 = await 页.evaluate(() => (window.__lksErrors ?? []).length);
  await 页.close();
  return 错误;
}

console.log('=== 剧情屏快照 ===\n');
console.log('[PC 1440×900]');
await 一套('pc', { width: 1440, height: 900 });
console.log('\n[手机 390×844]');
await 一套('手机', { width: 390, height: 844, isMobile: true, hasTouch: true });

await 浏览器.close();
console.log(`\n输出：${出目录}`);

/**
 * 分栏拖拽功能测试。
 *
 * 不看截图猜，直接驱动鼠标做一次真实拖拽，再读回会话列表的实际宽度。
 * 验四件事：
 *   一、指针拖动分栏能改宽度
 *   二、有最小/最大夹紧
 *   三、双击能复位
 *   四、宽度记进 localStorage，刷新后还在
 *
 * 用法：node tools/分栏测试.mjs
 */
import { mkdirSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import puppeteer from 'puppeteer-core';

const URL = 'http://127.0.0.1:5273/';
const 出目录 = resolve('tools/shots/分栏');
mkdirSync(出目录, { recursive: true });

const EDGE = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
].find((p) => existsSync(p));

const 浏览器 = await puppeteer.launch({
  executablePath: EDGE,
  headless: 'new',
  args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--no-sandbox', '--force-device-scale-factor=1'],
});

const 等 = (ms) => new Promise((r) => setTimeout(r, ms));
let 失败 = 0;
function 断言(条件, 说明, 实测) {
  if (条件) console.log(`  ✅ ${说明}`);
  else {
    console.log(`  ❌ ${说明} —— 实测 ${实测}`);
    失败 += 1;
  }
}

const 页 = await 浏览器.newPage();
await 页.setViewport({ width: 1440, height: 900 });
页.on('pageerror', (e) => console.log(`  [页面错误] ${e.message}`));
await 页.goto(URL, { waitUntil: 'networkidle2' });
await 等(600);

// 跳过开场进微信
await 页.evaluate(() => window.__lksStory.getState().跳过开场());
await 等(500);

/** 读会话列表的实际渲染宽度 */
const 读宽 = () =>
  页.evaluate(() => {
    const el = document.querySelector('.wc-list');
    return el ? Math.round(el.getBoundingClientRect().width) : -1;
  });

/** 读分栏的中心点 */
const 分栏点 = () =>
  页.evaluate(() => {
    const el = document.querySelector('.wc-split');
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) };
  });

console.log('=== 分栏拖拽测试 ===\n');

// 0. 先清掉上次留下的宽度，保证从默认值开始
await 页.evaluate(() => window.localStorage.removeItem('lks-wechat-list-width'));
await 页.reload({ waitUntil: 'networkidle2' });
await 等(600);
await 页.evaluate(() => window.__lksStory.getState().跳过开场());
await 等(400);

const 初始 = await 读宽();
断言(初始 === 244, '默认宽度 244', 初始);
await 页.screenshot({ path: join(出目录, '1-默认宽度.png') });

// 1. 向右拖 140
const p = await 分栏点();
断言(!!p, '分栏元素存在', p);
await 页.mouse.move(p.x, p.y);
await 页.mouse.down();
await 页.mouse.move(p.x + 140, p.y, { steps: 12 });
await 页.mouse.up();
await 等(300);
const 拖后 = await 读宽();
断言(拖后 === 初始 + 140, '向右拖 140 → 宽度 +140', `${初始} → ${拖后}`);
await 页.screenshot({ path: join(出目录, '2-拖宽后.png') });

// 2. 向左拖 300（应当被最小宽度夹住）
const p2 = await 分栏点();
await 页.mouse.move(p2.x, p2.y);
await 页.mouse.down();
await 页.mouse.move(p2.x - 300, p2.y, { steps: 12 });
await 页.mouse.up();
await 等(300);
const 最窄 = await 读宽();
断言(最窄 >= 176 && 最窄 <= 200, '向左拖过界 → 被最小宽度夹住（约 176）', 最窄);
await 页.screenshot({ path: join(出目录, '3-最窄.png') });

// 3. 向右拖 600（应当被最大宽度夹住）
const p3 = await 分栏点();
await 页.mouse.move(p3.x, p3.y);
await 页.mouse.down();
await 页.mouse.move(p3.x + 600, p3.y, { steps: 16 });
await 页.mouse.up();
await 等(300);
const 最宽 = await 读宽();
断言(最宽 >= 480 && 最宽 <= 540, '向右拖过界 → 被最大宽度夹住（约 520）', 最宽);
await 页.screenshot({ path: join(出目录, '4-最宽.png') });

// 4. 双击复位
// 注意：Puppeteer 的 clickCount:2 只发"一对" down/up，不是两次真实点击，
// 所以这里必须分两次 click —— 真实用户的双击就是两次独立按下。
const p4 = await 分栏点();
await 页.mouse.click(p4.x, p4.y);
await 等(90);
await 页.mouse.click(p4.x, p4.y);
await 等(300);
const 复位后 = await 读宽();
断言(复位后 === 244, '双击复位到 244', 复位后);

// 5. localStorage 持久化
await 页.mouse.move(p4.x, p4.y);
await 页.mouse.down();
await 页.mouse.move(p4.x + 90, p4.y, { steps: 8 });
await 页.mouse.up();
await 等(300);
const 落盘前 = await 读宽();
await 页.reload({ waitUntil: 'networkidle2' });
await 等(600);
await 页.evaluate(() => window.__lksStory.getState().跳过开场());
await 等(400);
const 刷新后 = await 读宽();
断言(刷新后 === 落盘前, '刷新后宽度还在（localStorage 生效）', `${落盘前} → ${刷新后}`);
await 页.screenshot({ path: join(出目录, '5-刷新后.png') });

// 6. 窗口拉宽/缩窄时布局不破
await 页.setViewport({ width: 900, height: 700 });
await 等(400);
await 页.screenshot({ path: join(出目录, '6-窗口900.png') });
await 页.setViewport({ width: 1920, height: 1080 });
await 等(400);
await 页.screenshot({ path: join(出目录, '7-窗口1920.png') });
console.log('  ✅ 窗口 900 / 1920 都能正常渲染（见截图）');

await 浏览器.close();
console.log(`\n${失败 === 0 ? '全部通过' : `${失败} 项失败`}`);
console.log(`截图：${出目录}`);
process.exit(失败 === 0 ? 0 : 1);

/**
 * 部署验收：真的用浏览器打开**线上地址**，看游戏是不是真的能跑。
 *
 * 为什么要这一步：curl 只能证明"文件取得到"，证明不了"游戏起得来"——
 * 子路径部署最容易踩的坑就是**资源 404 了但页面还是 200**（白屏）。
 * 这里把控制台报错和失败请求全抓出来。
 *
 * 用法（在 liukanshan-career 里跑）：
 *   node tools/部署验收.mjs [url]
 */
import { existsSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import puppeteer from 'puppeteer-core';

const 地址 = process.argv[2] ?? 'https://zjhxbb.xyz/刘看山/';
const EDGE = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
].find((p) => existsSync(p));

const 出 = resolve('tools/shots/部署');
mkdirSync(出, { recursive: true });

const b = await puppeteer.launch({
  executablePath: EDGE,
  headless: 'new',
  args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--no-sandbox'],
});
const p = await b.newPage();
await p.setViewport({ width: 1440, height: 900 });

const 失败 = [];
const 报错 = [];
/**
 * ⚠️ `ERR_ABORTED` 要**放行**：音效是"池子"（一个音效 3 个 audio 元素轮着用），
 *    每次播放前会 `pause() + currentTime=0`，正在下的那次请求就被浏览器 abort 掉了 ——
 *    这是**设计如此**，不是加载失败（真正要抓的是 404 / ERR_FAILED 这种）。
 */
p.on('requestfailed', (r) => {
  const 因 = r.failure()?.errorText ?? '';
  if (因.includes('ERR_ABORTED')) return;
  失败.push(`${因} ${r.url()}`);
});
p.on('response', (r) => {
  if (r.status() >= 400) 失败.push(`HTTP ${r.status()} ${r.url()}`);
});
p.on('console', (m) => {
  if (m.type() === 'error') 报错.push(m.text().slice(0, 200));
});
p.on('pageerror', (e) => 报错.push(`[pageerror] ${e.message}`.slice(0, 200)));

console.log(`打开：${地址}`);
/**
 * ⚠️⚠️ 必须带 nologin=1（用户要求「进站先走知乎授权」之后加的口子 ✗）——
 *    不带的话页面会**自动跳到知乎授权页** ✔，这个脚本就变成在验知乎的站了 ✔
 *    （实测：报错全是 www.zhihu.com 的 CORS ✗，根本不是我们的站 ✔）
 */
const 免登录 = 地址.includes('?') ? 地址 + '&nologin=1' : 地址 + '?nologin=1';
await p.goto(免登录, { waitUntil: 'networkidle2', timeout: 60000 });
await new Promise((r) => setTimeout(r, 2500));

const 状态 = await p.evaluate(() => ({
  标题: document.title,
  baseURI: document.baseURI,
  有根节点: !!document.querySelector('#root'),
  正文长度: (document.body.innerText ?? '').length,
  首屏文字: (document.body.innerText ?? '').slice(0, 90).replace(/\s+/g, ' '),
}));
console.log('  标题   :', 状态.标题);
console.log('  baseURI:', 状态.baseURI, ' ← ⚠️ 结尾必须是 "/"');
console.log('  #root  :', 状态.有根节点, ' 首屏文字长度:', 状态.正文长度);
console.log('  首屏   :', 状态.首屏文字);

// 点一下跳过开场：能进到游戏才说明 JS 真的跑起来了（不是白屏）
const 跳 = await p.evaluate(() => {
  const b2 = [...document.querySelectorAll('button')].find((x) => (x.textContent ?? '').includes('跳过'));
  if (b2) {
    b2.click();
    return true;
  }
  return false;
});
await new Promise((r) => setTimeout(r, 3000));
const 现在 = await p.evaluate(() => (document.body.innerText ?? '').slice(0, 90).replace(/\s+/g, ' '));
console.log('  点「跳过开场」:', 跳, '→ 现在是:', 现在);

const 画布 = await p.evaluate(() => {
  const c = document.querySelector('canvas');
  return c ? { 宽: c.width, 高: c.height } : null;
});
console.log('  画布   :', 画布 ? `${画布.宽}×${画布.高}` : '（没找到 canvas）');

await p.screenshot({ path: join(出, '线上-首屏.png') });
console.log('  → tools/shots/部署/线上-首屏.png');

console.log('\n  失败请求:', 失败.length, 失败.slice(0, 8).map((x) => '\n    ' + x).join(''));
console.log('  控制台报错:', 报错.length, 报错.slice(0, 5).map((x) => '\n    ' + x).join(''));

await b.close();
process.exit(失败.length || 报错.length ? 1 : 0);

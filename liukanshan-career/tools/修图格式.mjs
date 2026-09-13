/**
 * 把"名字是 .png、其实是 JPEG"的图**转成真正的 PNG**（零新增依赖，用无头浏览器解码）。
 *
 * 为什么需要它：出图工具导出来的文件经常**扩展名是 .png、内容却是 JPEG**
 *   （实测 20-正面坐姿 那 7 张，文件头是 `FF D8 FF`）。
 *   项目的 `工具/图像库.mjs` 是**零依赖 PNG 解码器**，读到 JPEG 会直接报「不是 PNG」。
 *
 * 做法：用无头 Edge/Chrome 打开一个空白页 → 把图塞进 `<img>` → 画进 canvas →
 *      `toDataURL('image/png')` 取真正的 PNG、写回原文件名（原文件备份到 `_jpg原始/`）。
 *      （canvas 这条路会**重新编码**：AI 出图本来就是非像素画的连续调图像，
 *        后处理本来就只取内容边界 + 缩放，多一次重编码不影响成品质量。）
 *
 * 用法（在仓库根跑）：
 *   node 工具/修图格式.mjs <目录>            # 转换该目录下所有"假 PNG"
 *   node 工具/修图格式.mjs <目录> --只查      # 只报告，不改文件
 */
import { readdirSync, readFileSync, mkdirSync, writeFileSync, existsSync, copyFileSync } from 'node:fs';
import { join, resolve, basename } from 'node:path';
import puppeteer from 'puppeteer-core';

const EDGE = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
].find((p) => existsSync(p));
if (!EDGE) {
  console.error('找不到 Edge/Chrome，无法解码 JPEG');
  process.exit(1);
}

const 目录 = resolve(process.argv[2] ?? '.');
const 只查 = process.argv.includes('--只查');
if (!existsSync(目录)) {
  console.error(`目录不存在：${目录}`);
  process.exit(1);
}

/** 真 PNG 头：89 50 4E 47 */
const 是PNG = (buf) => buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47;
const 是JPEG = (buf) => buf[0] === 0xff && buf[1] === 0xd8;

const 文件们 = readdirSync(目录).filter((f) => f.toLowerCase().endsWith('.png'));
const 假PNG = [];
for (const f of 文件们) {
  const buf = readFileSync(join(目录, f));
  if (是PNG(buf)) continue;
  if (是JPEG(buf)) 假PNG.push(f);
  else console.log(`  ？ ${f}：既不是 PNG 也不是 JPEG（头 ${buf.subarray(0, 4).toString('hex')}）`);
}

console.log(`目录：${目录}`);
console.log(`PNG 文件 ${文件们.length} 个，其中"名字是 png、其实是 JPEG" 的有 ${假PNG.length} 个`);
for (const f of 假PNG) console.log(`  · ${f}`);
if (!假PNG.length) {
  console.log('没有要转换的 ✓');
  process.exit(0);
}
if (只查) {
  console.log('（--只查：没有改动任何文件）');
  process.exit(0);
}

const 备份 = join(目录, '_jpg原始');
mkdirSync(备份, { recursive: true });

const 等 = (ms) => new Promise((r) => setTimeout(r, ms));
const 浏览器 = await puppeteer.launch({
  executablePath: EDGE,
  headless: 'new',
  args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-angle=swiftshader'],
});
const 页 = await 浏览器.newPage();
await 页.goto('about:blank');

let 好 = 0;
for (const f of 假PNG) {
  const 路径 = join(目录, f);
  const 原 = readFileSync(路径);
  copyFileSync(路径, join(备份, f)); // 原始 JPEG 备份一份
  const b64 = 原.toString('base64');
  const png = await 页.evaluate(async (b64) => {
    const img = new Image();
    img.src = `data:image/jpeg;base64,${b64}`;
    await img.decode();
    const cv = document.createElement('canvas');
    cv.width = img.naturalWidth;
    cv.height = img.naturalHeight;
    const ctx = cv.getContext('2d');
    ctx.drawImage(img, 0, 0);
    return { 数据: cv.toDataURL('image/png'), 宽: cv.width, 高: cv.height };
  }, b64);
  const 出 = Buffer.from(png.数据.replace(/^data:image\/png;base64,/, ''), 'base64');
  writeFileSync(路径, 出);
  const 好了 = 是PNG(readFileSync(路径));
  if (好了) 好 += 1;
  console.log(`  ${好了 ? '✅' : '❌'} ${f}  ${png.宽}×${png.高}  ${(原.length / 1024).toFixed(0)}KB(JPEG) → ${(出.length / 1024).toFixed(0)}KB(PNG)`);
  await 等(30);
}
await 浏览器.close();

console.log(`\n转换完成：${好}/${假PNG.length} 张`);
console.log(`原始 JPEG 备份在：${备份}`);

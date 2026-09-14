/**
 * 白底素材 → 四方向行走表（32×48 × 16 帧，128×192）。
 *
 * ⚠️⚠️ 三条来之不易的规矩（每条都真出过血 ✗）：
 *  ① 白底必须**从四边泛洪**来抠 ✗ —— 全图抠白会把白色北极狐的脸/肚子一起吃掉 ✔
 *  ② 每格**只保留最大的连通块** ✗ —— 泛洪之后仍可能有零散小白点（JPEG 噪点/阴影 ✗），
 *     它们会把内容边界撑到头顶上 → 缩放后画面里就是**头上一块残留** ✔
 *  ③ 第 4 行（朝右）= 第 3 行（朝左）的水平镜像，**必须用 drawImage** ✗
 *     （putImageData 会忽略 canvas transform —— 我踩过 ✔）
 *
 * 用法（在 liukanshan-career 下跑 ✔）：node tools/切行走表.mjs <源图> <输出png>
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import puppeteer from 'puppeteer-core';
const EDGE = ['C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe','C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'].find((p) => existsSync(p));
const 源 = process.argv[2];
const 出 = process.argv[3];
const b = await puppeteer.launch({ executablePath: EDGE, headless: 'new', args: ['--enable-unsafe-swiftshader','--use-angle=swiftshader','--no-sandbox'] });
const p = await b.newPage();
const dataUrl = 'data:image/png;base64,' + readFileSync(源).toString('base64');
const png = await p.evaluate(async (url) => {
  const img = new Image();
  await new Promise((r) => { img.onload = r; img.src = url; });
  const W = img.width, H = img.height;
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(img, 0, 0);
  const 全 = ctx.getImageData(0, 0, W, H);
  const d = 全.data;
  const 近白 = (i) => d[i] > 228 && d[i + 1] > 228 && d[i + 2] > 228;
  const 访问 = new Uint8Array(W * H);
  const 栈 = [];
  for (let x = 0; x < W; x += 1) { 栈.push(x); 栈.push((H - 1) * W + x); }
  for (let y = 0; y < H; y += 1) { 栈.push(y * W); 栈.push(y * W + W - 1); }
  while (栈.length) {
    const i = 栈.pop();
    if (访问[i]) continue;
    访问[i] = 1;
    if (!近白(i * 4)) continue;
    d[i * 4 + 3] = 0;
    const x = i % W, y = (i - x) / W;
    if (x > 0) 栈.push(i - 1);
    if (x < W - 1) 栈.push(i + 1);
    if (y > 0) 栈.push(i - W);
    if (y < H - 1) 栈.push(i + W);
  }
  ctx.putImageData(全, 0, 0);
  const 格宽 = Math.floor(W / 4), 格高 = Math.floor(H / 4);
  const OUT = 32, OUTH = 48;
  const 出cv = document.createElement('canvas');
  出cv.width = OUT * 4; 出cv.height = OUTH * 4;
  const octx = 出cv.getContext('2d');
  octx.imageSmoothingEnabled = false;
  for (let r = 0; r < 4; r += 1) for (let c = 0; c < 4; c += 1) {
    const 片 = ctx.getImageData(c * 格宽, r * 格高, 格宽, 格高);
    const pd = 片.data;
    const 标 = new Int32Array(格宽 * 格高).fill(-1);
    let 最好起 = -1, 最好数 = 0, 编号 = 0;
    for (let i = 0; i < 格宽 * 格高; i += 1) {
      if (标[i] !== -1 || pd[i * 4 + 3] <= 16) continue;
      const 队 = [i]; 标[i] = 编号; let 数 = 0; let 头 = 0;
      while (头 < 队.length) {
        const j = 队[头]; 头 += 1; 数 += 1;
        const x = j % 格宽, y = (j - x) / 格宽;
        const 邻 = [];
        if (x > 0) 邻.push(j - 1);
        if (x < 格宽 - 1) 邻.push(j + 1);
        if (y > 0) 邻.push(j - 格宽);
        if (y < 格高 - 1) 邻.push(j + 格宽);
        for (const k of 邻) if (标[k] === -1 && pd[k * 4 + 3] > 16) { 标[k] = 编号; 队.push(k); }
      }
      if (数 > 最好数) { 最好数 = 数; 最好起 = 编号; }
      编号 += 1;
    }
    if (最好起 < 0) continue;
    for (let i = 0; i < 格宽 * 格高; i += 1) if (标[i] !== 最好起) pd[i * 4 + 3] = 0;
    ctx.putImageData(片, c * 格宽, r * 格高);
    let 左 = 格宽, 右 = -1, 上 = 格高, 下 = -1;
    for (let y = 0; y < 格高; y += 1) for (let x = 0; x < 格宽; x += 1) {
      if (pd[(y * 格宽 + x) * 4 + 3] > 16) { if (x < 左) 左 = x; if (x > 右) 右 = x; if (y < 上) 上 = y; if (y > 下) 下 = y; }
    }
    if (右 < 0) continue;
    const 内容宽 = 右 - 左 + 1, 内容高 = 下 - 上 + 1;
    const k = Math.min((OUTH * 0.92) / 内容高, (OUT * 0.92) / 内容宽);
    const 缩宽 = Math.max(1, Math.round(内容宽 * k)), 缩高 = Math.max(1, Math.round(内容高 * k));
    const t = document.createElement('canvas');
    t.width = 内容宽; t.height = 内容高;
    const tc = t.getContext('2d');
    tc.imageSmoothingEnabled = false;
    tc.drawImage(cv, 左 + c * 格宽, 上 + r * 格高, 内容宽, 内容高, 0, 0, 内容宽, 内容高);
    octx.drawImage(t, c * OUT + Math.round((OUT - 缩宽) / 2), r * OUTH + OUTH - 缩高, 缩宽, 缩高);
  }
  const 镜 = document.createElement('canvas');
  镜.width = OUT; 镜.height = OUTH;
  const mc = 镜.getContext('2d');
  mc.imageSmoothingEnabled = false;
  mc.translate(OUT, 0);
  mc.scale(-1, 1);
  mc.drawImage(出cv, 0, 2 * OUTH, OUT, OUTH, 0, 0, OUT, OUTH);
  octx.clearRect(0, 3 * OUTH, OUT, OUTH);
  octx.drawImage(镜, 0, 3 * OUTH);
  return 出cv.toDataURL('image/png');
}, dataUrl);
writeFileSync(出, Buffer.from(png.split(',')[1], 'base64'));
console.log('  ok:', 出);
await b.close();
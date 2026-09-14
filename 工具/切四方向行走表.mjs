
import { existsSync, writeFileSync } from 'node:fs';
import puppeteer from 'puppeteer-core';
const EDGE = ['C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe','C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'].find((p) => existsSync(p));
const b = await puppeteer.launch({ executablePath: EDGE, headless: 'new', args: ['--enable-unsafe-swiftshader','--use-angle=swiftshader','--no-sandbox'] });
const p = await b.newPage();
const 源 = process.argv[2];
const 出 = process.argv[3];
const dataUrl = 'data:image/png;base64,' + (await import('node:fs')).readFileSync(源).toString('base64');
const png = await p.evaluate(async (url) => {
  const img = new Image();
  await new Promise((r) => { img.onload = r; img.src = url; });
  const W = img.width, H = img.height;
  const 格宽 = Math.floor(W / 4), 格高 = Math.floor(H / 4);
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(img, 0, 0);
  const 全 = ctx.getImageData(0, 0, W, H);
  const 是白 = (i) => 全.data[i] > 235 && 全.data[i + 1] > 235 && 全.data[i + 2] > 235;
  // 把白底抠成透明
  for (let i = 0; i < 全.data.length; i += 4) if (是白(i)) 全.data[i + 3] = 0;
  ctx.putImageData(全, 0, 0);
  const OUT_W = 32, OUT_H = 48;
  const 出cv = document.createElement('canvas');
  出cv.width = OUT_W * 4; 出cv.height = OUT_H * 4;
  const octx = 出cv.getContext('2d');
  octx.imageSmoothingEnabled = false;
  const 行序 = [0, 1, 2, 3];
  for (let r = 0; r < 4; r += 1) {
    for (let c = 0; c < 4; c += 1) {
      const 片 = ctx.getImageData(c * 格宽, r * 格高, 格宽, 格高);
      let 左 = 格宽, 右 = -1, 上 = 格高, 下 = -1;
      for (let y = 0; y < 格高; y += 1) for (let x = 0; x < 格宽; x += 1) {
        if (片.data[(y * 格宽 + x) * 4 + 3] > 16) { if (x < 左) 左 = x; if (x > 右) 右 = x; if (y < 上) 上 = y; if (y > 下) 下 = y; }
      }
      if (右 < 0) continue;
      const 内容宽 = 右 - 左 + 1, 内容高 = 下 - 上 + 1;
      const 目标高 = Math.round(OUT_H * 0.92);
      const k = Math.min(目标高 / 内容高, (OUT_W * 0.92) / 内容宽);
      const 缩宽 = Math.max(1, Math.round(内容宽 * k));
      const 缩高 = Math.max(1, Math.round(内容高 * k));
      const t = document.createElement('canvas');
      t.width = 内容宽; t.height = 内容高;
      const tc = t.getContext('2d');
      tc.imageSmoothingEnabled = false;
      tc.drawImage(cv, 左 + c * 格宽, 上 + r * 格高, 内容宽, 内容高, 0, 0, 内容宽, 内容高);
      const 目标x = c * OUT_W + Math.round((OUT_W - 缩宽) / 2);
      const 目标y = r * OUT_H + OUT_H - 缩高;
      octx.drawImage(t, 目标x, 目标y, 缩宽, 缩高);
    }
  }
  // 第 4 行 = 第 3 行的水平镜像（项目规矩：不然会「走两步回一次头」）
  const 左行 = octx.getImageData(0, 2 * OUT_H, OUT_W, OUT_H);
  const 镜 = document.createElement('canvas');
  镜.width = OUT_W; 镜.height = OUT_H;
  const mc = 镜.getContext('2d');
  mc.imageSmoothingEnabled = false;
  mc.translate(OUT_W, 0); mc.scale(-1, 1);
  mc.putImageData(左行, 0, 0);
  octx.clearRect(0, 3 * OUT_H, OUT_W, OUT_H);
  octx.drawImage(镜, 0, 3 * OUT_H);
  return 出cv.toDataURL('image/png');
}, dataUrl);
writeFileSync(出, Buffer.from(png.split(',')[1], 'base64'));
console.log('  ✅ 写出:', 出);
await b.close();

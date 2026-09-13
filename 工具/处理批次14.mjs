/**
 * 处理批次14（零依赖）：沙漏合成 10 帧精灵表 + 三张结局插画缩到游戏尺寸。
 *
 * 沙漏：两张图各 5 帧，用连通块检测取出（不按固定网格切），
 *       统一缩放到 64×64，合成 640×64 的 10 帧精灵表。
 * 结局：1920×1088 → 512×288（游戏内部分辨率），面积平均 + 量化。
 *
 * 用法：node 工具/处理批次14.mjs
 */
import { mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { 读取PNG, 写入PNG, 缩放到, 去毛边, 量化, 抠品红, 是品红 } from './图像库.mjs';

const 根 = resolve(process.cwd());
const 源目录 = join(根, '美术/素材库/原图/14-转场结局');
const 出目录 = join(根, '美术/素材库/成品');

/** 连通块检测：返回按 x 排序的块 */
function 找块(img, 最小像素) {
  const W = img.width;
  const H = img.height;
  const 访问 = new Uint8Array(W * H);
  const 是内容 = (x, y) => {
    const i = (y * W + x) * 3;
    if (img.alpha && img.alpha[y * W + x] < 128) return false;
    return !是品红(img.rgb[i], img.rgb[i + 1], img.rgb[i + 2]);
  };
  const 块 = [];
  for (let sy = 0; sy < H; sy += 1) {
    for (let sx = 0; sx < W; sx += 1) {
      if (访问[sy * W + sx] || !是内容(sx, sy)) continue;
      const 栈 = [[sx, sy]];
      访问[sy * W + sx] = 1;
      let minX = sx, maxX = sx, minY = sy, maxY = sy, n = 0;
      while (栈.length) {
        const [x, y] = 栈.pop();
        n += 1;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
          if (访问[ny * W + nx] || !是内容(nx, ny)) continue;
          访问[ny * W + nx] = 1;
          栈.push([nx, ny]);
        }
      }
      if (n >= 最小像素) 块.push({ minX, minY, maxX, maxY, 宽: maxX - minX + 1, 高: maxY - minY + 1 });
    }
  }
  块.sort((a, b) => a.minX - b.minX);
  return 块;
}

/** 从原图裁一块出来 */
function 裁块(img, b) {
  const rgb = new Uint8Array(b.宽 * b.高 * 3);
  const alpha = new Uint8Array(b.宽 * b.高);
  for (let y = 0; y < b.高; y += 1) {
    for (let x = 0; x < b.宽; x += 1) {
      const si = ((b.minY + y) * img.width + (b.minX + x)) * 3;
      const di = (y * b.宽 + x) * 3;
      rgb[di] = img.rgb[si];
      rgb[di + 1] = img.rgb[si + 1];
      rgb[di + 2] = img.rgb[si + 2];
      alpha[y * b.宽 + x] = img.alpha ? img.alpha[(b.minY + y) * img.width + (b.minX + x)] : 255;
    }
  }
  return { width: b.宽, height: b.高, rgb, alpha };
}

/* ───────── 一、沙漏：合成 10 帧 640×64 ───────── */
console.log('=== 沙漏 10 帧 ===');
const 帧 = [];
for (const [名, 序号起] of [['特效_沙漏_10帧_a', 1], ['特效_沙漏_10帧_b', 6]]) {
  const img = 抠品红(读取PNG(join(源目录, `${名}.png`)));
  const 块 = 找块(img, 5000);
  console.log(`  ${名}：找到 ${块.length} 块（期望 5）`);
  for (const b of 块) 帧.push({ ...裁块(img, b), 来源: `${名}#${序号起 + 帧.length}` });
}
if (帧.length !== 10) console.log(`  ⚠️ 合计 ${帧.length} 帧，不是 10`);

// 统一缩放：所有帧用同一个系数，保证沙漏大小不变（这是动画的关键）
const 最大高 = Math.max(...帧.map((f) => f.height));
const 最大宽 = Math.max(...帧.map((f) => f.width));
const 内容高 = 60; // 64 的帧高里留 4px 余量
const 系数 = 内容高 / 最大高;
const 帧宽 = 64;
const 帧高 = 64;
const 表宽 = 帧宽 * 帧.length;
const 表 = new Uint8Array(表宽 * 帧高 * 3);
const 表A = new Uint8Array(表宽 * 帧高);
帧.forEach((f, i) => {
  const w = Math.max(1, Math.round(f.width * 系数));
  const h = Math.max(1, Math.round(f.height * 系数));
  const 缩 = 缩放到(f, w, h);
  const 左 = i * 帧宽 + Math.round((帧宽 - w) / 2);
  const 顶 = Math.round((帧高 - h) / 2); // 沙漏垂直居中
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const dx = 左 + x;
      const dy = 顶 + y;
      if (dx < 0 || dy < 0 || dx >= 表宽 || dy >= 帧高) continue;
      if (缩.alpha && 缩.alpha[y * w + x] < 128) continue;
      const si = (y * w + x) * 3;
      const di = (dy * 表宽 + dx) * 3;
      表[di] = 缩.rgb[si];
      表[di + 1] = 缩.rgb[si + 1];
      表[di + 2] = 缩.rgb[si + 2];
      表A[dy * 表宽 + dx] = 255;
    }
  }
  console.log(`   第 ${String(i + 1).padStart(2)} 帧  ${f.width}×${f.height} → ${w}×${h}`);
});
let 沙漏表 = 去毛边({ width: 表宽, height: 帧高, rgb: 表, alpha: 表A });
沙漏表 = 量化(沙漏表);
mkdirSync(join(出目录, '特效'), { recursive: true });
const 沙漏路径 = join(出目录, '特效', '沙漏_10帧_640x64.png');
写入PNG(沙漏路径, 沙漏表);
console.log(`  成品 ${表宽}×${帧高} → ${沙漏路径}`);

/* ───────── 二、三张结局缩到 512×288 ───────── */
console.log('\n=== 结局插画 ===');
mkdirSync(join(出目录, '结局'), { recursive: true });
for (const [文件, 名] of [
  ['插画_结局_转正', '结局_转正'],
  ['插画_结局_跳级升职', '结局_跳级升职'],
  ['插画_结局_结束实习', '结局_结束实习'],
]) {
  const img = 读取PNG(join(源目录, `${文件}.png`));
  const 缩 = 缩放到(img, 512, 288);
  let 小 = 去毛边(缩);
  小 = 量化(小);
  写入PNG(join(出目录, '结局', `${名}_512x288.png`), 小);
  console.log(`  ${文件}  ${img.width}×${img.height} → 512×288`);
}
console.log(`\n输出目录：${出目录}`);

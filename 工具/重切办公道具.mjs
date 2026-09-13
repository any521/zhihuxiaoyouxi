/**
 * 重切办公道具 · 第二版（零依赖）
 *
 * 第一版按"区域分块 + 取紧致边界"切，结果**打印机上方带进了两条残边** ——
 * 那是上面两件道具（投递箱/资料架）的下边缘，落在了打印机的区块里。
 *
 * 这一版改成：**在区块里只取面积最大的那一块连通区域**（四邻连通），
 * 零散的残边就自动被丢掉了。
 *
 * 用法：node 工具/重切办公道具.mjs
 */
import { mkdirSync, copyFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { 读取PNG, 写入PNG, 裁剪, 缩放到, 量化, 去毛边 } from './图像库.mjs';

const 根 = resolve(process.cwd());
const 源 = join(根, '美术/素材库/原图/06-道具/道具_办公_投递箱.png');
const 出目录 = join(根, '美术/素材库/成品/道具/办公设备');
const 游戏 = join(根, 'liukanshan-career/public/assets/map');

const 件 = [
  { 名: '投递箱', 区: [0, 0, 512, 430], 目标高: 48 },
  { 名: '资料架', 区: [512, 0, 1024, 430], 目标高: 48 },
  { 名: '打印机', 区: [0, 430, 1024, 1024], 目标高: 48 },
];

const 图 = 读取PNG(源);

/** 某点是不是"内容"（不透明、且不是品红背景） */
function 是内容(img, x, y) {
  const i = y * img.width + x;
  if (img.alpha && img.alpha[i] < 128) return false;
  const r = img.rgb[i * 3];
  const g = img.rgb[i * 3 + 1];
  const b = img.rgb[i * 3 + 2];
  return !(r > 200 && g < 90 && b > 200); // 品红背景
}

/** 取**面积最大的连通块**的包围盒（四邻连通，斜着挨着的残边不会连上） */
function 最大连通块(img) {
  const { width: W, height: H } = img;
  const 看过 = new Uint8Array(W * H);
  const 栈 = [];
  let 最好 = null;

  for (let sy = 0; sy < H; sy += 1) {
    for (let sx = 0; sx < W; sx += 1) {
      const 起 = sy * W + sx;
      if (看过[起] || !是内容(img, sx, sy)) continue;
      let 数 = 0;
      let x1 = sx;
      let y1 = sy;
      let x2 = sx;
      let y2 = sy;
      栈.length = 0;
      栈.push(起);
      看过[起] = 1;
      while (栈.length) {
        const p = 栈.pop();
        const px = p % W;
        const py = (p - px) / W;
        数 += 1;
        if (px < x1) x1 = px;
        if (py < y1) y1 = py;
        if (px > x2) x2 = px;
        if (py > y2) y2 = py;
        if (px > 0 && !看过[p - 1] && 是内容(img, px - 1, py)) {
          看过[p - 1] = 1;
          栈.push(p - 1);
        }
        if (px < W - 1 && !看过[p + 1] && 是内容(img, px + 1, py)) {
          看过[p + 1] = 1;
          栈.push(p + 1);
        }
        if (py > 0 && !看过[p - W] && 是内容(img, px, py - 1)) {
          看过[p - W] = 1;
          栈.push(p - W);
        }
        if (py < H - 1 && !看过[p + W] && 是内容(img, px, py + 1)) {
          看过[p + W] = 1;
          栈.push(p + W);
        }
      }
      if (!最好 || 数 > 最好.数) 最好 = { 数, x1, y1, x2, y2 };
    }
  }
  return 最好;
}

console.log(`=== 重切办公道具（第二版：只取最大连通块）===\n  源表 ${图.width}×${图.height}\n`);

for (const 一 of 件) {
  const [x1, y1, x2, y2] = 一.区;
  const 块 = 裁剪(图, x1, y1, x2 - x1, y2 - y1);
  const 主 = 最大连通块(块);
  if (!主) {
    console.log(`  ❌ ${一.名}：区块里没找到内容`);
    continue;
  }

  const 左 = Math.max(0, 主.x1 - 2);
  const 上 = Math.max(0, 主.y1 - 2);
  const 宽 = 主.x2 - 主.x1 + 5;
  const 高 = 主.y2 - 主.y1 + 5;

  const 紧 = 裁剪(块, 左, 上, 宽, 高);
  const 比例 = 一.目标高 / 高;
  const 目标宽 = Math.max(8, Math.round(宽 * 比例));
  const 缩 = 缩放到(紧, 目标宽, 一.目标高);
  const 净 = 去毛边(缩);
  const 成品 = 量化(净);

  mkdirSync(出目录, { recursive: true });
  写入PNG(join(出目录, `${一.名}.png`), 成品);
  copyFileSync(join(出目录, `${一.名}.png`), join(游戏, `prop_dev_${一.名}.png`));

  const 用色 = new Set();
  for (let i = 0; i < 目标宽 * 一.目标高; i += 1) {
    用色.add((成品.rgb[i * 3] << 16) | (成品.rgb[i * 3 + 1] << 8) | 成品.rgb[i * 3 + 2]);
  }
  console.log(`  ✅ ${一.名}`);
  console.log(`     最大连通块 ${主.x2 - 主.x1 + 1}×${主.y2 - 主.y1 + 1}（${主.数} 像素）`);
  console.log(`     成品 ${目标宽}×${一.目标高} · ${用色.size} 色`);
}

console.log(`\n输出：${出目录}`);

/**
 * 生成知乎/刘看山主题的像素壁纸（零依赖）
 *
 * 要求：可平铺、低对比（不能抢文字）、有主题辨识度。
 * 做法和瓦片一样：**环绕绘制**保证四边无缝；图案用「点阵字模」写死，一眼能认出是什么。
 *
 * 图案（都是刘看山/知乎的符号）：
 *   狐狸头（尖耳 + 大黑鼻子）· 赞同箭头 · 聊天气泡 · 问号 · 小星点
 *
 * 用法：node 工具/生成壁纸.mjs
 */
import { mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { 写入PNG, 量化 } from './图像库.mjs';

const 边长 = 128;
const 根 = resolve(process.cwd());
const 出目录 = join(根, '美术/素材库/成品/界面v2');
const 游戏目录 = join(根, 'liukanshan-career/public/assets/avg');

/* ── 配色：直接取 32 色板及其邻近阶 ── */
const 色 = {
  底: [27, 32, 40],      // #1b2028 微信深色底
  底亮: [31, 37, 48],    // 微弱底纹
  图暗: [20, 25, 33],    // 图案暗部
  图亮: [40, 49, 64],    // 图案亮部
  蓝: [44, 95, 168],     // #2c5fa8 知乎蓝
  蓝暗: [26, 52, 94],
};

/** 点阵字模：. = 不画，o = 暗，x = 亮，b = 知乎蓝，B = 深蓝 */
const 字模 = {
  狐狸头: [
    '..o......o..',
    '..oo....oo..',
    '..oxo..oxo..',
    '.oxxxooxxxo.',
    'oxxxxxxxxxxo',
    'oxxooxxooxxo',
    'oxxobbbboxxo',
    'oxxobbbboxxo',
    'oxxxobboxxxo',
    '.oxxxxxxxxxo',
    '..ooxxxxoo..',
    '....oooo....',
  ],
  赞同: [
    '...bb...',
    '..bbbb..',
    '.bbbbbb.',
    'bbbbbbbb',
    'BBBBBBBB',
    '...bb...',
    '...bb...',
    '...bb...',
    '...BB...',
    '...BB...',
  ],
  气泡: [
    '.oooooooooo.',
    'oxxxxxxxxxxo',
    'oxxoxxxoxxxo',
    'oxxxxxxxxxxo',
    'oxxoxxxoxxxo',
    'oxxxxxxxxxxo',
    '.oooooooooo.',
    '.....oo.....',
    '.....o......',
    '.....o......',
  ],
  问号: [
    '..oo..',
    '.oxxo.',
    'ox..xo',
    '....xo',
    '...xo.',
    '..xo..',
    '..oo..',
    '......',
    '..oo..',
    '..oo..',
  ],
  星点: [
    '..o..',
    '.ooo.',
    'ooooo',
    '.ooo.',
    '..o..',
  ],
};

const 字色 = {
  o: 色.图暗,
  x: 色.图亮,
  b: 色.蓝,
  B: 色.蓝暗,
};

/** 环绕绘制：超出边界的像素绕回另一侧，保证平铺无缝 */
function 画(画布, 字模表, 起点x, 起点y, 透明度 = 1) {
  for (let y = 0; y < 字模表.length; y += 1) {
    const 行 = 字模表[y];
    for (let x = 0; x < 行.length; x += 1) {
      const 符 = 行[x];
      if (符 === '.') continue;
      const 颜 = 字色[符];
      if (!颜) continue;
      const px = (((起点x + x) % 边长) + 边长) % 边长;
      const py = (((起点y + y) % 边长) + 边长) % 边长;
      const i = (py * 边长 + px) * 3;
      // 用透明度混色，让图案更含蓄
      画布[i] = Math.round(画布[i] * (1 - 透明度) + 颜[0] * 透明度);
      画布[i + 1] = Math.round(画布[i + 1] * (1 - 透明度) + 颜[1] * 透明度);
      画布[i + 2] = Math.round(画布[i + 2] * (1 - 透明度) + 颜[2] * 透明度);
    }
  }
}

/** 可平铺的值噪声（和瓦片同一套做法） */
function 随机数(种子) {
  let a = 种子 >>> 0;
  return () => {
    a += 0x6d2b79f5;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const 平滑 = (t) => t * t * (3 - 2 * t);

function 底纹() {
  const 随机 = 随机数(20260913);
  const N = 4;
  const 格 = Array.from({ length: N }, () => Array.from({ length: N }, () => 随机()));
  const 布 = new Uint8Array(边长 * 边长 * 3);
  for (let y = 0; y < 边长; y += 1) {
    for (let x = 0; x < 边长; x += 1) {
      const sx = (x / 边长) * N;
      const sy = (y / 边长) * N;
      const x0 = Math.floor(sx) % N;
      const y0 = Math.floor(sy) % N;
      const x1 = (x0 + 1) % N;
      const y1 = (y0 + 1) % N;
      const tx = 平滑(sx - Math.floor(sx));
      const ty = 平滑(sy - Math.floor(sy));
      const a = 格[y0][x0] * (1 - tx) + 格[y0][x1] * tx;
      const b = 格[y1][x0] * (1 - tx) + 格[y1][x1] * tx;
      const v = a * (1 - ty) + b * ty;
      // 只在"底"和"底亮"之间插值，幅度很小
      const t = v * 0.75;
      const i = (y * 边长 + x) * 3;
      布[i] = Math.round(色.底[0] * (1 - t) + 色.底亮[0] * t);
      布[i + 1] = Math.round(色.底[1] * (1 - t) + 色.底亮[1] * t);
      布[i + 2] = Math.round(色.底[2] * (1 - t) + 色.底亮[2] * t);
    }
  }
  return 布;
}

const 布 = 底纹();
const 随机 = 随机数(777);

// 按 32×32 的格子撒图案；每格随机选一个，透明度压低
const 格 = 32;
for (let gy = 0; gy < 边长 / 格; gy += 1) {
  for (let gx = 0; gx < 边长 / 格; gx += 1) {
    const r = 随机();
    let 名;
    if (r < 0.3) 名 = '狐狸头';
    else if (r < 0.52) 名 = '赞同';
    else if (r < 0.72) 名 = '气泡';
    else if (r < 0.88) 名 = '问号';
    else 名 = '星点';
    const 模 = 字模[名];
    const w = 模[0].length;
    const h = 模.length;
    // 格内随机偏移，但留出边距，避免图案互相压
    const 偏x = gx * 格 + Math.floor(随机() * (格 - w - 2)) + 1;
    const 偏y = gy * 格 + Math.floor(随机() * (格 - h - 2)) + 1;
    // 图案本身要含蓄：暗部 0.55，亮部 0.5，蓝色 0.42
    画(布, 模, 偏x, 偏y, 名 === '星点' ? 0.5 : 0.62);
  }
}

let 图 = { width: 边长, height: 边长, rgb: 布 };
图 = 量化(图);

mkdirSync(出目录, { recursive: true });
mkdirSync(游戏目录, { recursive: true });
写入PNG(join(出目录, '壁纸_知乎像素.png'), 图);
写入PNG(join(游戏目录, 'wallpaper.png'), 图);

// 用色统计
const 用色 = new Set();
for (let i = 0; i < 边长 * 边长; i += 1) {
  用色.add((布[i * 3] << 16) | (布[i * 3 + 1] << 8) | 布[i * 3 + 2]);
}
console.log('=== 生成知乎主题像素壁纸 ===');
console.log(`  ${边长}×${边长} · ${用色.size} 色 · 可平铺`);
console.log(`  输出：${join(出目录, '壁纸_知乎像素.png')}`);
console.log(`  输出：${join(游戏目录, 'wallpaper.png')}`);

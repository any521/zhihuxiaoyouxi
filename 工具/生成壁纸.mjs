/**
 * 生成界面底纹（零依赖）—— 米白 + 绿，浅色主题
 *
 * 上一版为什么不合格（记下来免得再犯）：
 *   一、底色用了 #1b2028，**太接近黑**，看起来还是黑背景
 *   二、图案按 32 像素**机械网格**排列，像老式桌布
 *
 * 这一版的两个关键改动：
 *   一、底色是**温暖米白** #f7efdd（聊天区）/ **沉稳深绿** #4a8f4f（侧栏）
 *   二、图案用**抖动散布 + 最小间距**（不是网格），而且**大小随机**
 *
 * 平铺无缝：所有绘制都做环绕取模，图案到边自然延续。
 *
 * 用法：node 工具/生成壁纸.mjs
 */
import { mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { 写入PNG, 量化 } from './图像库.mjs';

const 边长 = 256; // 比上一版大一倍，重复感更弱
const 根 = resolve(process.cwd());
const 出目录 = join(根, '美术/素材库/成品/界面v2');
const 游戏目录 = join(根, 'liukanshan-career/public/assets/avg');

/* ───────── 点阵字模 ─────────
   . 不画 · o 主色 · x 次色 · b 强调色 */
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
    '...oo...',
    '..oooo..',
    '.oooooo.',
    'oooooooo',
    'xxxxxxxx',
    '...oo...',
    '...oo...',
    '...oo...',
    '...xx...',
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
    '.o..o.',
    'o....o',
    '....o.',
    '...o..',
    '..o...',
    '..o...',
    '......',
    '..o...',
    '..o...',
  ],
  小星: ['..o..', '.o.o.', 'o...o', '.o.o.', '..o..'],
  小点: ['oo', 'oo'],
};

/* ───────── 工具 ───────── */

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

/** 可平铺的底纹噪声（只在两个很接近的色之间插值，幅度极小） */
function 底纹(底色, 底色2, 种子) {
  const 随机 = 随机数(种子);
  const N = 8;
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
      const i = (y * 边长 + x) * 3;
      布[i] = Math.round(底色[0] * (1 - v) + 底色2[0] * v);
      布[i + 1] = Math.round(底色[1] * (1 - v) + 底色2[1] * v);
      布[i + 2] = Math.round(底色[2] * (1 - v) + 底色2[2] * v);
    }
  }
  return 布;
}

/** 画一个图案，支持整数倍放大（保持像素方块感），并做环绕取模 */
function 画(布, 模, 起x, 起y, 倍, 配色) {
  for (let y = 0; y < 模.length; y += 1) {
    for (let x = 0; x < 模[y].length; x += 1) {
      const 符 = 模[y][x];
      if (符 === '.') continue;
      const 颜 = 配色[符];
      if (!颜) continue;
      // 放大：一个点铺成 倍×倍 的方块
      for (let dy = 0; dy < 倍; dy += 1) {
        for (let dx = 0; dx < 倍; dx += 1) {
          const px = (((起x + x * 倍 + dx) % 边长) + 边长) % 边长;
          const py = (((起y + y * 倍 + dy) % 边长) + 边长) % 边长;
          const i = (py * 边长 + px) * 3;
          布[i] = 颜[0];
          布[i + 1] = 颜[1];
          布[i + 2] = 颜[2];
        }
      }
    }
  }
}

/**
 * 抖动散布：反复随机取点，和已有点距离太近就重试。
 * 这是修掉"机械网格"的关键 —— 位置随机、大小也随机。
 */
function 撒点(数量, 最小间距, 种子) {
  const 随机 = 随机数(种子);
  const 点 = [];
  let 尝试 = 0;
  while (点.length < 数量 && 尝试 < 数量 * 60) {
    尝试 += 1;
    const x = Math.floor(随机() * 边长);
    const y = Math.floor(随机() * 边长);
    // 环绕距离：平铺后左右/上下是邻居，所以距离要按环面算
    const 太近 = 点.some((p) => {
      const dx = Math.min(Math.abs(p.x - x), 边长 - Math.abs(p.x - x));
      const dy = Math.min(Math.abs(p.y - y), 边长 - Math.abs(p.y - y));
      return Math.hypot(dx, dy) < 最小间距;
    });
    if (太近) continue;
    点.push({ x, y });
  }
  return 点;
}

/* ───────── 生成两张 ───────── */

const 任务 = [
  {
    名: '底纹_聊天区_米白',
    说明: '聊天区：温暖米白底 + 浅绿暗纹',
    底: [247, 239, 221], // #f7efdd
    底2: [241, 231, 208],
    配色: {
      o: [168, 217, 138], // #a8d98a 浅绿（主）
      x: [200, 224, 176], // 更淡的绿
      b: [124, 194, 107], // #7cc26b
    },
    数量: 30,
    间距: 34,
    种子: 20260913,
  },
  {
    名: '底纹_侧栏_绿',
    说明: '左侧栏：沉稳深绿底 + 深浅绿暗纹',
    底: [74, 143, 79], // #4a8f4f
    底2: [69, 134, 74],
    配色: {
      o: [47, 93, 58], // #2f5d3a 更深
      x: [124, 194, 107], // #7cc26b 更浅
      b: [60, 116, 66],
    },
    数量: 26,
    间距: 36,
    种子: 778899,
  },
];

mkdirSync(出目录, { recursive: true });
mkdirSync(游戏目录, { recursive: true });

const 名们 = Object.keys(字模);
console.log('=== 生成界面底纹 ===\n');

for (const 项 of 任务) {
  const 布 = 底纹(项.底, 项.底2, 项.种子);
  const 随机 = 随机数(项.种子 + 1);
  const 点 = 撒点(项.数量, 项.间距, 项.种子 + 2);

  for (const p of 点) {
    // 大小随机：小图案放大 1~2 倍，大图案只放 1 倍
    const 名 = 名们[Math.floor(随机() * 名们.length)];
    const 模 = 字模[名];
    const 大 = 模.length >= 10;
    const 倍 = 大 ? 1 : 随机() < 0.5 ? 1 : 2;
    画(布, 模, p.x, p.y, 倍, 项.配色);
  }

  let 图 = { width: 边长, height: 边长, rgb: 布 };
  图 = 量化(图);
  写入PNG(join(出目录, `${项.名}.png`), 图);
  写入PNG(join(游戏目录, `${项.名 === '底纹_聊天区_米白' ? 'wallpaper_chat' : 'wallpaper_rail'}.png`), 图);

  const 用色 = new Set();
  for (let i = 0; i < 边长 * 边长; i += 1) {
    用色.add((布[i * 3] << 16) | (布[i * 3 + 1] << 8) | 布[i * 3 + 2]);
  }
  console.log(`  ✅ ${项.名}`);
  console.log(`     ${项.说明}`);
  console.log(`     ${边长}×${边长} · ${用色.size} 色 · 撒了 ${点.length} 个图案（随机位置 + 随机大小）`);
}

console.log(`\n输出：${出目录}`);
console.log(`接入：${游戏目录}`);

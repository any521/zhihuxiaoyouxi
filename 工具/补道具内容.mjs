/**
 * 给"空白板"道具补内容（零依赖）
 *
 * 问题：AI 生成时漏了细节，这三件的内容区是一整块纯色，看着像没画完：
 *   资料架（8）  —— 架子上没有书
 *   隔断屏风（26）—— 屏风上没有任何贴的东西
 *   吧台（15）   —— 台面上空无一物
 *
 * 做法：先**自动找出**那块空白区的包围盒（按主色匹配），再往里画东西。
 * 颜色全部取自 32 色板，和现有素材同一套色。
 *
 * 用法：node 工具/补道具内容.mjs
 */
import { mkdirSync, copyFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { 读取PNG, 写入PNG, 量化 } from './图像库.mjs';

const 根 = resolve(process.cwd());
const 源目录 = join(根, '美术/素材库/成品/道具');
const 出目录 = join(根, '美术/素材库/成品/道具/_已补内容');
const 游戏目录 = join(根, 'liukanshan-career/public/assets/map');

const 色 = {
  书1: [44, 95, 168], // #2c5fa8 知乎蓝
  书2: [224, 79, 63], // #e04f3f 红
  书3: [47, 93, 58], // #2f5d3a 深绿
  书4: [217, 160, 102], // #d9a066 米黄
  书5: [69, 75, 87], // #454b57 深灰
  便签1: [240, 200, 150], // #f0c896 浅黄
  便签2: [168, 217, 138], // #a8d98a 浅绿
  便签3: [142, 195, 238], // #8ec3ee 浅蓝
  杯: [247, 239, 221], // #f7efdd
  杯口: [107, 68, 35], // #6b4423
  阴影: [20, 22, 28],
};

/**
 * 找出"大面积同色区域"的包围盒（那就是没画内容的空白区）。
 *
 * ⚠️ 两个坑（第一版都踩了）：
 *   一、**必须跳过透明像素** —— 透明处 RGB 读出来是 0,0,0，
 *      不跳过的话"出现最多的颜色"就是黑色，包围盒变成整张图。
 *   二、跳过接近黑的颜色（深色描边/框也会面积很大）。
 * 另外可以传 期望色 直接指定要找哪种颜色，更稳。
 */
function 找空白(img, 期望色 = null, 容差 = 26) {
  const { width: W, height: H, rgb, alpha } = img;
  const 透 = (i) => (alpha ? alpha[i] < 128 : false);
  const 计 = new Map();
  for (let i = 0; i < W * H; i += 1) {
    if (透(i)) continue;
    const r = rgb[i * 3];
    const g = rgb[i * 3 + 1];
    const b = rgb[i * 3 + 2];
    // 跳过近黑（描边/框）
    if (r + g + b < 110) continue;
    const k = (r << 16) | (g << 8) | b;
    计.set(k, (计.get(k) ?? 0) + 1);
  }
  let 底;
  if (期望色) {
    底 = (期望色[0] << 16) | (期望色[1] << 8) | 期望色[2];
  } else {
    let 最多 = -1;
    底 = 0;
    for (const [k, n] of 计) {
      if (n > 最多) {
        最多 = n;
        底 = k;
      }
    }
  }
  const r0 = (底 >> 16) & 255;
  const g0 = (底 >> 8) & 255;
  const b0 = 底 & 255;
  let x1 = W;
  let y1 = H;
  let x2 = -1;
  let y2 = -1;
  for (let y = 0; y < H; y += 1) {
    for (let x = 0; x < W; x += 1) {
      const i = (y * W + x) * 3;
      if (透(i)) continue;
      const d = Math.abs(rgb[i] - r0) + Math.abs(rgb[i + 1] - g0) + Math.abs(rgb[i + 2] - b0);
      if (d <= 容差) {
        if (x < x1) x1 = x;
        if (y < y1) y1 = y;
        if (x > x2) x2 = x;
        if (y > y2) y2 = y;
      }
    }
  }
  return { x1, y1, x2, y2, 底: [r0, g0, b0] };
}

function 点(布, W, x, y, 颜) {
  if (x < 0 || y < 0 || x >= W) return;
  const i = (y * W + x) * 3;
  if (i < 0 || i + 2 >= 布.length) return;
  布[i] = 颜[0];
  布[i + 1] = 颜[1];
  布[i + 2] = 颜[2];
}

function 块(布, W, x, y, w, h, 颜, 描边 = null) {
  for (let dy = 0; dy < h; dy += 1) {
    for (let dx = 0; dx < w; dx += 1) {
      const 边 = 描边 && (dx === 0 || dy === 0 || dx === w - 1 || dy === h - 1);
      点(布, W, x + dx, y + dy, 边 ? 描边 : 颜);
    }
  }
}

/** 资料架：往架子上排一排书 */
function 补资料架(img) {
  const 布 = img.rgb.slice();
  const W = img.width;
  const 空 = 找空白(img, [247, 239, 221]); // 米白层板
  const 书色 = [色.书1, 色.书2, 色.书3, 色.书4, 色.书5];
  // 上下两层的 y 位置（按空白区高度分）
  const 层高 = Math.floor((空.y2 - 空.y1) / 2);
  for (let 层 = 0; 层 < 2; 层 += 1) {
    const 底y = 空.y1 + 层高 * (层 + 1) - 1;
    let x = 空.x1 + 2;
    let i = 层 * 2;
    while (x < 空.x2 - 3) {
      const w = 3 + (i % 2);
      const h = 层高 - 3 - (i % 3);
      if (x + w > 空.x2 - 1) break;
      块(布, W, x, 底y - h, w, h, 书色[i % 书色.length], 色.阴影);
      // 书脊上的一道浅色横线
      const si = (底y - h + 2) * W;
      for (let dx = 1; dx < w - 1; dx += 1) 点(布, W, x + dx, 底y - h + 2, [247, 239, 221]);
      void si;
      x += w + 1;
      i += 1;
    }
  }
  return { ...img, rgb: 布 };
}

/** 隔断屏风：贴上三张便签 */
function 补屏风(img) {
  const 布 = img.rgb.slice();
  const W = img.width;
  const 空 = 找空白(img, [217, 160, 102]); // 浅棕色屏风面
  const 便签 = [色.便签1, 色.便签2, 色.便签3];
  const 尺寸 = 5;
  const 位 = [
    [空.x1 + 4, 空.y1 + 4],
    [空.x1 + 13, 空.y1 + 8],
    [空.x1 + 6, 空.y1 + 15],
  ];
  位.forEach(([px, py], i) => {
    块(布, W, px, py, 尺寸, 尺寸, 便签[i % 3], 色.阴影);
    // 便签上两道"字"的横线（不写字，只给个暗示）
    for (let d = 1; d < 尺寸 - 1; d += 1) {
      点(布, W, px + d, py + 2, 色.阴影);
      点(布, W, px + d, py + 4, 色.阴影);
    }
  });
  return { ...img, rgb: 布 };
}

/** 吧台：台面上放一只杯子和一个托盘 */
function 补吧台(img) {
  const 布 = img.rgb.slice();
  const W = img.width;
  // 台面是 #e8dcc0（y 8~24）；下面深棕是柜体，不能算成空白区
  const 空 = 找空白(img, [232, 220, 192]);
  const cy = Math.floor((空.y1 + 空.y2) / 2);
  // 托盘
  const tx = 空.x1 + 6;
  块(布, W, tx, cy - 2, 16, 7, [107, 68, 35], 色.阴影);
  块(布, W, tx + 2, cy, 12, 3, [184, 123, 74]);
  // 两只杯子
  for (const [i, ox] of [4, 10].entries()) {
    const x = tx + ox;
    块(布, W, x, cy - 6, 5, 5, 色.杯, 色.阴影);
    点(布, W, x + 2, cy - 5, 色.杯口);
    void i;
  }
  // 右侧摆一小盆绿植
  const px = 空.x2 - 12;
  块(布, W, px, cy - 6, 7, 7, [74, 143, 79], 色.阴影);
  块(布, W, px + 1, cy + 1, 5, 4, [107, 68, 35], 色.阴影);
  return { ...img, rgb: 布 };
}

const 任务 = [
  { 名: '资料架', 文件: '办公设备/资料架.png', 输出: 'prop_dev_资料架.png', 做: 补资料架 },
  { 名: '隔断屏风', 文件: '工位区/工位_隔断屏风.png', 输出: 'prop_ws_隔断屏风.png', 做: 补屏风 },
  { 名: '吧台', 文件: '茶水间/茶水_吧台.png', 输出: 'prop_pantry_吧台.png', 做: 补吧台 },
];

mkdirSync(出目录, { recursive: true });
console.log('=== 给空白板道具补内容 ===\n');

for (const 项 of 任务) {
  const 原 = 读取PNG(join(源目录, 项.文件));
  const 空 = 找空白(原);
  console.log(`  【${项.名}】${原.width}×${原.height}`);
  console.log(`     空白区  x ${空.x1}~${空.x2} · y ${空.y1}~${空.y2}  底色 #${空.底.map((v) => v.toString(16).padStart(2, '0')).join('')}`);
  const 补 = 项.做(原);
  const 成品 = 量化(补);
  写入PNG(join(出目录, `${项.名}.png`), 成品);
  copyFileSync(join(出目录, `${项.名}.png`), join(游戏目录, 项.输出));
  console.log(`     → 已补内容并写入 ${项.输出}\n`);
}

console.log(`输出：${出目录}`);

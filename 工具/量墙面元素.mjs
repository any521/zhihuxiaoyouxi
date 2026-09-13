/**
 * 量「墙面元素_6枚」这张表：把 3×2 六格分别量出内容包围盒，看每件有多大、居中不居中。
 *
 * 为什么要先量：六格是模型画的，**每格物体的大小/位置不可能自动对齐**。
 * 不量就切，切出来会一大一小、或者把水印切进去。
 *
 * 用法：node 工具/量墙面元素.mjs
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { 读取PNG, 内容边界, 是背景 } from './图像库.mjs';

const 表 = resolve('美术/素材库/原图/19-地图重做/墙面元素_6枚.png');
const 图 = 读取PNG(表);
console.log(`整张表 ${图.width}×${图.height}`);

/** 水印禁区（右下角「豆包AI生成」）——量边界时必须排除，否则第 6 格会被撑到右下角 */
const 水印 = { x0: 图.width - 470, y0: 图.height - 190 };

const 列数 = 3;
const 行数 = 2;
const 格W = Math.floor(图.width / 列数);
const 格H = Math.floor(图.height / 行数);
console.log(`每格 ${格W}×${格H}（${列数}×${行数}）\n`);

const 名 = ['①安全出口牌', '②灭火器', '③消防栓箱', '④挂钟', '⑤窗户', '⑥楼层指示牌'];

for (let r = 0; r < 行数; r += 1) {
  for (let c = 0; c < 列数; c += 1) {
    const i = r * 列数 + c;
    const x0 = c * 格W;
    const y0 = r * 格H;
    // 本格范围内的内容边界（用内容边界 + 自己排除水印）
    let minX = 格W;
    let minY = 格H;
    let maxX = -1;
    let maxY = -1;
    let 数 = 0;
    for (let y = 0; y < 格H; y += 1) {
      for (let x = 0; x < 格W; x += 1) {
        const ax = x0 + x;
        const ay = y0 + y;
        if (ax >= 水印.x0 && ay >= 水印.y0) continue; // 水印不算
        if (是背景(图, ay * 图.width + ax)) continue;
        const i2 = (ay * 图.width + ax) * 3;
        // 纯品红以外的都算内容（含白/红/绿/蓝）
        if (图.rgb[i2] > 170 && 图.rgb[i2 + 1] < 120 && 图.rgb[i2 + 2] > 170) continue;
        数 += 1;
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
    if (maxX < 0) {
      console.log(`${名[i].padEnd(10)} 这一格**没找到内容**（全品红？）`);
      continue;
    }
    const 内容W = maxX - minX + 1;
    const 内容H = maxY - minY + 1;
    // 边框检查：内容贴到格边了没有（贴边说明被裁了）
    const 贴边 = minX <= 1 || minY <= 1 || maxX >= 格W - 2 || maxY >= 格H - 2;
    console.log(
      `${名[i].padEnd(10)} 内容 ${String(内容W).padStart(4)}×${String(内容H).padStart(4)}` +
        `  偏移 (${minX},${minY})  中心 (${(minX + maxX) / 2 | 0},${(minY + maxY) / 2 | 0})` +
        `  格中心 (${格W / 2 | 0},${格H / 2 | 0})  像素数 ${数}` +
        `${贴边 ? '  ⚠️ 贴到格边（可能被裁）' : ''}`,
    );
  }
}

// 顺带看一眼调色板用了多少色（全表）
const 色 = new Set();
for (let i = 0; i < 图.width * 图.height; i += 7) {
  const j = i * 3;
  色.add((图.rgb[j] >> 3 << 10) | (图.rgb[j + 1] >> 3 << 5) | (图.rgb[j + 2] >> 3));
}
console.log(`\n整表粗采样色数（每 7 像素取一个，5 位量化）：${色.size}`);
void readFileSync;
void 内容边界;

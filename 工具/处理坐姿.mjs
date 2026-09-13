/**
 * 处理坐姿动画表（零依赖）
 *
 * 输入：`原图/11-角色动画/坐姿_XXX.png`（2048×2048，2×2 四格，纯品红背景）
 * 输出：`public/assets/map/sit_XXX.png`（128×48 = 4 帧 × 32×48 横排，给 Phaser 当 spritesheet）
 *
 * 三件要注意的事：
 *   一、**右下角有"豆包AI生成"的水印** —— 检测内容边界时必须把那一块排除，
 *      不然第 4 帧的边界会被水印撑到右下角，四帧就错位了。
 *   二、四帧要**共用同一个裁剪框**（取四格边界的并集），
 *      否则每帧单独裁会让角色在动画里抖动。
 *   三、只画到腰部以上，所以角色贴**画布上沿**放，下半部分留空给椅子。
 *
 * 用法：node 工具/处理坐姿.mjs
 */
import { mkdirSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { 读取PNG, 写入PNG, 裁剪, 量化, 去毛边 } from './图像库.mjs';

const 根 = resolve(process.cwd());
const 源目录 = join(根, '美术/素材库/原图/11-角色动画');
const 出目录 = join(根, '美术/素材库/成品/角色动画');
const 游戏 = join(根, 'liukanshan-career/public/assets/map');

const 角色们 = ['刘看山', '周岚', '阿麦', '韩策', '小鹿', '林总', '程女士'];

const 帧W = 32;
const 帧H = 48;
/** 角色在 32×48 里占的最大区域（贴上方，下面留给椅子）*/
const 内容W = 30;
const 内容H = 34;

/** 水印大概在整张图右下角，这块区域不算内容 */
const 水印禁区 = { x0: 2048 - 470, y0: 2048 - 190 };

function 是内容(img, x, y) {
  // 水印禁区
  if (x >= 水印禁区.x0 && y >= 水印禁区.y0) return false;
  const i = y * img.width + x;
  if (img.alpha && img.alpha[i] < 128) return false;
  const r = img.rgb[i * 3];
  const g = img.rgb[i * 3 + 1];
  const b = img.rgb[i * 3 + 2];
  // 品红背景
  return !(r > 190 && g < 100 && b > 190);
}

/** 在某个矩形范围里找内容边界 */
function 找边界(img, x0, y0, x1, y1) {
  let minX = x1;
  let minY = y1;
  let maxX = x0;
  let maxY = y0;
  for (let y = y0; y <= y1; y += 1) {
    for (let x = x0; x <= x1; x += 1) {
      if (!是内容(img, x, y)) continue;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  }
  return maxX < minX ? null : { minX, minY, maxX, maxY };
}

/** 最近邻缩放（保持像素锐利）*/
function 缩到(src, w, h) {
  const out = new Uint8Array(w * h * 3);
  const alpha = new Uint8Array(w * h);
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const sx = Math.min(src.width - 1, Math.floor((x * src.width) / w));
      const sy = Math.min(src.height - 1, Math.floor((y * src.height) / h));
      const si = (sy * src.width + sx) * 3;
      const di = (y * w + x) * 3;
      out[di] = src.rgb[si];
      out[di + 1] = src.rgb[si + 1];
      out[di + 2] = src.rgb[si + 2];
      alpha[y * w + x] = src.alpha ? src.alpha[sy * src.width + sx] : 255;
    }
  }
  return { width: w, height: h, rgb: out, alpha };
}

mkdirSync(出目录, { recursive: true });
mkdirSync(游戏, { recursive: true });

console.log('=== 处理坐姿动画 ===\n');

for (const 名 of 角色们) {
  const 源 = join(源目录, `坐姿_${名}.png`);
  if (!existsSync(源)) {
    console.log(`  ⬜ ${名}：还没生成`);
    continue;
  }
  const 图 = 读取PNG(源);
  const 半W = Math.floor(图.width / 2);
  const 半H = Math.floor(图.height / 2);

  // ① 四格各自的边界
  // ⚠️ 必须换算成**相对本格**的坐标再取并集。
  //    直接拿绝对坐标取并集的话，四个格的边界会横跨整张图
  //    （第一格从 x=100 起、第四格到 x=1960 止 → 框宽 1869，等于整张图）。
  const 边 = [];
  for (let r = 0; r < 2; r += 1) {
    for (let c = 0; c < 2; c += 1) {
      const b = 找边界(图, c * 半W, r * 半H, (c + 1) * 半W - 1, (r + 1) * 半H - 1);
      if (b) {
        边.push({
          minX: b.minX - c * 半W,
          minY: b.minY - r * 半H,
          maxX: b.maxX - c * 半W,
          maxY: b.maxY - r * 半H,
        });
      }
    }
  }
  const 有 = 边;
  if (!有.length) {
    console.log(`  ❌ ${名}：四格都没找到内容`);
    continue;
  }
  const 并 = {
    minX: Math.min(...有.map((b) => b.minX)),
    minY: Math.min(...有.map((b) => b.minY)),
    maxX: Math.max(...有.map((b) => b.maxX)),
    maxY: Math.max(...有.map((b) => b.maxY)),
  };
  const 框W = 并.maxX - 并.minX + 1;
  const 框H = 并.maxY - 并.minY + 1;

  // ② 四帧：**每帧按自己的内容居中**，但**缩放比例四帧共用**。
  //
  // ⚠️ 一开始是"四帧共用并集裁剪框"，结果人明显偏右（实测刘看山左右空 8/1、
  //    小鹿 9/1）—— 因为只要有一格里内容往左多伸一点（比如胳膊），
  //    并集框就被撑宽，其余格的角色在框里就偏了。
  //    改成每帧用自己的边界定位，比例仍用并集算（比例不共用的话动画会一胀一缩地抖）。
  const 比 = Math.min(内容W / 框W, 内容H / 框H);
  const 总 = new Uint8Array(帧W * 4 * 帧H * 3);
  const 总alpha = new Uint8Array(帧W * 4 * 帧H);
  let 帧号 = 0;
  for (let r = 0; r < 2; r += 1) {
    for (let c = 0; c < 2; c += 1) {
      const 格x = c * 半W;
      const 格y = r * 半H;
      const 本 = 边[帧号];
      if (!本) {
        帧号 += 1;
        continue;
      }
      const 本W = 本.maxX - 本.minX + 1;
      const 本H = 本.maxY - 本.minY + 1;
      const 片 = 裁剪(图, 格x + 本.minX, 格y + 本.minY, 本W, 本H);
      const 净 = 去毛边(片);
      const 小W = Math.max(1, Math.round(本W * 比));
      const 小H = Math.max(1, Math.round(本H * 比));
      const 小 = 缩到(净, 小W, 小H);
      // ⚠️ 水平位置用**重心**对齐，不用边界中点。
      //    实测有一格里有不对称的杂点把边界撑歪，按边界居中的话那一帧会明显偏（8/1）。
      //    重心对杂点不敏感（质量小、拉不动），四帧因此能对齐在同一个中轴上。
      let 质心 = 0;
      let 质量 = 0;
      for (let y = 0; y < 小H; y += 1) {
        for (let x = 0; x < 小W; x += 1) {
          if (小.alpha[y * 小W + x] < 128) continue;
          质心 += x;
          质量 += 1;
        }
      }
      const 中轴 = 质量 > 0 ? 质心 / 质量 : 小W / 2;
      const ox = Math.round(帧W / 2 - 中轴);
      // 垂直：**底边对齐**在固定的腰线上（对齐底边动画才不会上下跳）
      const oy = 内容H - 小H;
      for (let y = 0; y < 小H; y += 1) {
        for (let x = 0; x < 小W; x += 1) {
          const si = (y * 小W + x) * 3;
          const di = ((y + oy) * (帧W * 4) + 帧号 * 帧W + x + ox) * 3;
          总[di] = 小.rgb[si];
          总[di + 1] = 小.rgb[si + 1];
          总[di + 2] = 小.rgb[si + 2];
          总alpha[(y + oy) * (帧W * 4) + 帧号 * 帧W + x + ox] = 小.alpha[y * 小W + x];
        }
      }
      帧号 += 1;
    }
  }

  const 成品 = 量化({ width: 帧W * 4, height: 帧H, rgb: 总, alpha: 总alpha });
  写入PNG(join(出目录, `坐姿_${名}_32x48x4.png`), 成品);
  写入PNG(join(游戏, `sit_${名}.png`), 成品);

  // 用色统计要读**量化后**的 成品，不是量化前的 总（读错了会显示几百色，白担心）
  const 用色 = new Set();
  for (let i = 0; i < 帧W * 4 * 帧H; i += 1) {
    用色.add((成品.rgb[i * 3] << 16) | (成品.rgb[i * 3 + 1] << 8) | 成品.rgb[i * 3 + 2]);
  }
  const 小比 = Math.min(内容W / 框W, 内容H / 框H);
  console.log(
    `  ✅ ${名.padEnd(4)} 公共框 ${框W}×${框H} → 角色 ${Math.round(框W * 小比)}×${Math.round(框H * 小比)} · ${用色.size} 色`,
  );
}

console.log(`\n输出：${出目录}`);
console.log(`接入：${游戏}`);

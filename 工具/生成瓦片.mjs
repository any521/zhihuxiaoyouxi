/**
 * 程序生成瓦片（零依赖）
 *
 * 为什么不用 AI：材质是"纯重复纹理"，模型天生爱画规则图案（棋盘格、格纹），
 * 而且它给的细密噪点缩到 32×32 后会变成难看的花斑。
 * 程序生成能做到 AI 做不到的三件事：
 *   一、**绝对无缝**（用环绕插值的值噪声，数学保证四边对齐）
 *   二、**纹理单元尺寸完全可控**（想要 2px 就 2px，不会被缩没）
 *   三、**色板绝对统一**（直接取 32 色板里的颜色，量化误差为零）
 *
 * 用法：node 工具/生成瓦片.mjs [输出目录]
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { 写入PNG, 拼图 } from './图像库.mjs';

const 尺寸 = 32;
const 输出目录 = resolve(process.argv[2] ?? '美术/素材库/成品/瓦片v2');
const 预览目录 = resolve('美术/素材库/成品/_瓦片平铺测试');

/* ───────── 可平铺的值噪声 ───────── */

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

/**
 * 生成一张"可平铺"的噪声场：Nx×Ny 个随机格，用环绕插值铺满 尺寸×尺寸。
 * 关键是索引取模——这样左右、上下边界天然对齐，四边拼接绝对无缝。
 * Nx=1 表示横向不变化（得到竖向条纹），Ny=1 表示纵向不变化（得到横向条纹）。
 */
function 噪声场(Nx, Ny, 种子) {
  const 随机 = 随机数(种子);
  const 格 = Array.from({ length: Ny }, () => Array.from({ length: Nx }, () => 随机()));
  const 场 = new Float64Array(尺寸 * 尺寸);
  for (let y = 0; y < 尺寸; y += 1) {
    for (let x = 0; x < 尺寸; x += 1) {
      const sx = (x / 尺寸) * Nx;
      const sy = (y / 尺寸) * Ny;
      const x0 = Math.floor(sx) % Nx;
      const y0 = Math.floor(sy) % Ny;
      const x1 = (x0 + 1) % Nx;
      const y1 = (y0 + 1) % Ny;
      const tx = 平滑(sx - Math.floor(sx));
      const ty = 平滑(sy - Math.floor(sy));
      const a = 格[y0][x0] * (1 - tx) + 格[y0][x1] * tx;
      const b = 格[y1][x0] * (1 - tx) + 格[y1][x1] * tx;
      场[y * 尺寸 + x] = a * (1 - ty) + b * ty;
    }
  }
  return 场;
}

/**
 * 按分位数取阈值：保证"前 X% 的像素"一定会变成另一种颜色。
 * 固定阈值（例如 >0.7）有隐患——随机格子少的时候可能全都低于阈值，图案就消失了。
 */
function 分位阈值(场, 上比例) {
  const 排序 = Array.from(场).sort((a, b) => a - b);
  return 排序[Math.min(排序.length - 1, Math.floor(排序.length * (1 - 上比例)))];
}

function 画(取色) {
  const rgb = new Uint8Array(尺寸 * 尺寸 * 3);
  for (let y = 0; y < 尺寸; y += 1) {
    for (let x = 0; x < 尺寸; x += 1) {
      const [r, g, b] = 取色(x, y);
      const i = (y * 尺寸 + x) * 3;
      rgb[i] = r;
      rgb[i + 1] = g;
      rgb[i + 2] = b;
    }
  }
  return { width: 尺寸, height: 尺寸, rgb };
}

/* ───────── 六张瓦片 ───────── */

/** 办公地毯：接近纯色的浅灰蓝，只有稀疏的深色绒线团 */
function 办公地毯() {
  const 底 = [164, 172, 187]; // #a4acbb
  const 深 = [154, 163, 180]; // 比底色只深一点点
  const 噪 = 噪声场(6, 6, 1101);
  const 细 = 噪声场(12, 12, 1102);
  const 场 = new Float64Array(尺寸 * 尺寸);
  for (let i = 0; i < 场.length; i += 1) 场[i] = 噪[i] * 0.7 + 细[i] * 0.3;
  const 阈 = 分位阈值(场, 0.34);
  return 画((x, y) => (场[y * 尺寸 + x] > 阈 ? 深 : 底));
}

/** 走廊地砖：2×2 地砖，砖缝 2 像素（周期 16，平铺后是 16×16 的砖格） */
function 走廊地砖() {
  const 砖面 = [216, 210, 200]; // #d8d2c8
  const 砖面暗 = [201, 193, 180]; // #c9c1b4
  const 缝 = [110, 118, 134]; // #6e7686
  const 噪 = 噪声场(3, 3, 2202);
  const 阈 = 分位阈值(噪, 0.30);
  return 画((x, y) => {
    if (x % 16 < 2 || y % 16 < 2) return 缝;
    return 噪[y * 尺寸 + x] > 阈 ? 砖面暗 : 砖面;
  });
}

/** 木地板：竖向木板，板宽 14 + 板缝 2（周期 16），带竖向木纹 */
function 木地板() {
  const 板 = [217, 160, 102]; // #d9a066
  const 板亮 = [240, 200, 150]; // #f0c896
  const 板暗 = [184, 123, 74]; // #b87b4a
  const 缝 = [143, 90, 51]; // #8f5a33
  const 大 = 噪声场(2, 1, 3303); // 横向缓慢变化
  const 纹 = 噪声场(8, 1, 3304); // 竖向细木纹
  return 画((x, y) => {
    if (x % 16 < 2) return 缝;
    const i = y * 尺寸 + x;
    const v = 大[i] * 0.55 + 纹[i] * 0.45;
    if (v > 0.66) return 板亮;
    if (v < 0.34) return 板暗;
    return 板;
  });
}

/** 办公白墙：大面积纯色，极少量大块浅色差 */
function 办公白墙() {
  const 底 = [247, 239, 221]; // #f7efdd
  const 淡 = [243, 236, 219]; // 只比底色深一点点，远看几乎纯色
  const 噪 = 噪声场(4, 4, 4404);
  const 阈 = 分位阈值(噪, 0.12);
  return 画((x, y) => (噪[y * 尺寸 + x] > 阈 ? 淡 : 底));
}

/** 玻璃隔断：2×2 玻璃，窗框 2 像素，每块玻璃内一道斜向高光 */
function 玻璃隔断() {
  const 玻璃 = [142, 195, 238]; // #8ec3ee
  const 玻璃深 = [74, 143, 212]; // #4a8fd4
  const 框 = [69, 75, 87]; // #454b57
  const 高光 = [200, 210, 224]; // 淡蓝而不是纯白，避免太抢眼
  return 画((x, y) => {
    if (x % 16 < 2 || y % 16 < 2) return 框;
    // 每块玻璃内部画一道短的斜向高光，不碰到边框，避免接缝问题
    const 内x = x % 16;
    const 内y = y % 16;
    const 格号 = ((x >> 4) + (y >> 4)) % 2;
    const 偏移 = 格号 === 0 ? 1 : 12;
    if (内y >= 4 && 内y <= 11 && Math.abs(内x - (格号 === 0 ? 内y + 1 : 偏移 - 内y + 8)) === 0) return 高光;
    return 内x + 内y > 20 ? 玻璃深 : 玻璃;
  });
}

/** 木质桌面：横向木纹 */
function 木质桌面() {
  const 板 = [240, 200, 150]; // #f0c896
  const 板暗 = [217, 160, 102]; // #d9a066
  const 大 = 噪声场(1, 3, 5505);
  const 纹 = 噪声场(1, 7, 5506);
  return 画((x, y) => {
    const i = y * 尺寸 + x;
    const v = 大[i] * 0.6 + 纹[i] * 0.4;
    return v > 0.5 ? 板 : 板暗;
  });
}

/* ───────── 生成 ───────── */

const 清单 = [
  ['瓦片_地面_办公地毯', 办公地毯, 1101],
  ['瓦片_地面_走廊地砖', 走廊地砖, 2202],
  ['瓦片_地面_木地板', 木地板, 3303],
  ['瓦片_墙面_办公白墙', 办公白墙, 4404],
  ['瓦片_墙面_玻璃隔断', 玻璃隔断, 5505],
  ['瓦片_台面_木质桌面', 木质桌面, 6606],
];

mkdirSync(输出目录, { recursive: true });
mkdirSync(预览目录, { recursive: true });

console.log('=== 程序生成瓦片 ===\n');
const 预览小图 = [];
for (const [名, 生成] of 清单) {
  const 图 = 生成();
  写入PNG(join(输出目录, `${名}.png`), 图);

  // 3×3 平铺 + 8 倍放大预览
  const N = 3;
  const W = 尺寸 * N;
  const rgb = new Uint8Array(W * W * 3);
  for (let ty = 0; ty < N; ty += 1) {
    for (let tx = 0; tx < N; tx += 1) {
      for (let y = 0; y < 尺寸; y += 1) {
        for (let x = 0; x < 尺寸; x += 1) {
          const si = (y * 尺寸 + x) * 3;
          const di = ((ty * 尺寸 + y) * W + tx * 尺寸 + x) * 3;
          rgb[di] = 图.rgb[si];
          rgb[di + 1] = 图.rgb[si + 1];
          rgb[di + 2] = 图.rgb[si + 2];
        }
      }
    }
  }
  const S = 8;
  const H = W * S;
  const 放大 = new Uint8Array(H * H * 3);
  for (let y = 0; y < H; y += 1) {
    for (let x = 0; x < H; x += 1) {
      const si = (Math.floor(y / S) * W + Math.floor(x / S)) * 3;
      const di = (y * H + x) * 3;
      放大[di] = rgb[si];
      放大[di + 1] = rgb[si + 1];
      放大[di + 2] = rgb[si + 2];
    }
  }
  写入PNG(join(预览目录, `${名}_程序生成_平铺3x3_8x.png`), { width: H, height: H, rgb: 放大 });
  预览小图.push({ width: W, height: W, rgb });

  // 统计用色
  const 用色 = new Set();
  for (let i = 0; i < 尺寸 * 尺寸; i += 1) {
    用色.add((图.rgb[i * 3] << 16) | (图.rgb[i * 3 + 1] << 8) | 图.rgb[i * 3 + 2]);
  }
  console.log(`  ✅ ${名.padEnd(18)} 32×32 · ${用色.size} 色`);
}

// 拼一张总览
写入PNG(join(预览目录, '程序生成瓦片_总览_6x.png'), 拼图(预览小图, 3, 6, [24, 26, 32]));
console.log(`\n输出目录：${输出目录}`);
console.log(`预览：${join(预览目录, '程序生成瓦片_总览_6x.png')}`);

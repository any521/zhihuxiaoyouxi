/**
 * 处理角色动画（零依赖）—— 连通块切分版
 *
 * 为什么不按固定网格切（实测教训）：
 *   AI 画多格图时**不会严格按格线作画**。实测行走 16 帧里，
 *   "朝下"那行的脚伸出格线 5 像素、落进了"朝上"那行的格子里。
 *   按固定网格切会：① 把脚切掉 ② 让下一帧头顶多出一条杂线。
 *   而用**连通块检测**切，16 个角色全是完整独立的块，一个都不丢。
 *   实测 16 块的包围盒干净对上 4×4 网格，高度差只有 5.5%。
 *
 * 顺带解决三件事：
 *   一、**朝向间身高不一致** —— 按需归一化
 *   二、**帧间横向漂移** —— 每帧按自身内容居中
 *   三、**脚底不在同一基线** —— 统一对齐到同一条基线
 *
 * 两种缩放模式：
 *   --模式=等身   每帧各自缩放到"全表高度中位数" —— 行走/待机/朝向
 *   --模式=等比   全表一个系数，参考全表最大高度 —— 动作（弯腰本来就该变矮）
 *
 * 用法：
 *   node 工具/处理角色动画.mjs <多格图> <列> <行> <帧宽> <帧高> [输出目录] [--模式=等身]
 */
import { mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { 读取PNG, 写入PNG, 缩放到, 去毛边, 量化, 抠品红, 是品红 } from './图像库.mjs';

const 参数 = process.argv.slice(2);
const [输入, 列s, 行s, 帧宽s, 帧高s] = 参数;
if (!输入 || !列s || !行s || !帧宽s || !帧高s) {
  console.error('用法：node 工具/处理角色动画.mjs <多格图> <列> <行> <帧宽> <帧高> [输出目录] [--模式=等身|等比]');
  process.exit(1);
}
const 列 = Number(列s);
const 行 = Number(行s);
const 帧宽 = Number(帧宽s);
const 帧高 = Number(帧高s);
const 模式 = (参数.find((a) => a.startsWith('--模式=')) ?? '--模式=等身').split('=')[1];
const 输出目录 = resolve(
  参数.find((a, i) => i >= 5 && !a.startsWith('--')) ?? '美术/素材库/成品/_动画预览',
);

const img = 抠品红(读取PNG(resolve(输入)));
const W = img.width;
const H = img.height;
const 是内容 = (x, y) => {
  const i = (y * W + x) * 3;
  if (img.alpha && img.alpha[y * W + x] < 128) return false;
  return !是品红(img.rgb[i], img.rgb[i + 1], img.rgb[i + 2]);
};

// ── 1) 连通块检测（4 连通泛洪）────────────────────────────────────────
const 访问 = new Uint8Array(W * H);
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
    块.push({ minX, minY, maxX, maxY, 宽: maxX - minX + 1, 高: maxY - minY + 1, 像素: n });
  }
}

// 过滤碎屑：小于"最大块面积的 8%"的当噪点
const 最大面积 = Math.max(...块.map((b) => b.像素), 1);
const 有效 = 块.filter((b) => b.像素 >= 最大面积 * 0.08);
const 预期 = 列 * 行;

console.log(`【${输入.split(/[\\/]/).pop()}】`);
console.log(`  画布 ${W}×${H} · 期望 ${列}×${行}=${预期} 个块 · 实测 ${块.length} 个（过滤碎屑后 ${有效.length} 个）`);

if (有效.length !== 预期) {
  console.log(`  ⚠️ 块数不是 ${预期}——这个文件可能画错了，但仍然先按位置排布`);
}

// ── 2) 排布成网格：先按中心 Y 分行，每行内按中心 X 排序 ────────────────
const 带中心 = 有效.map((b) => ({ ...b, cx: (b.minX + b.maxX) / 2, cy: (b.minY + b.maxY) / 2 }));
带中心.sort((a, b) => a.cy - b.cy || a.cx - b.cx);
const 网格 = [];
for (let r = 0; r < 行; r += 1) {
  const 段 = 带中心.slice(r * 列, (r + 1) * 列);
  if (!段.length) continue;
  段.sort((a, b) => a.cx - b.cx);
  网格.push(段);
}

const 全部 = 网格.flat();
const 高们 = 全部.map((b) => b.高).sort((a, b) => a - b);
const 宽们 = 全部.map((b) => b.宽);
const 中位高 = 高们[Math.floor(高们.length / 2)];
const 最大高 = 高们[高们.length - 1];
const 最小高 = 高们[0];
const 参考高 = 模式 === '等比' ? 最大高 : 中位高;

console.log(`  块高度 ${最小高}~${最大高}（差 ${(((最大高 - 最小高) / 最大高) * 100).toFixed(1)}%）· 宽 ${Math.min(...宽们)}~${Math.max(...宽们)}`);
console.log(`  模式「${模式}」· 参考高 ${参考高} · 目标帧 ${帧宽}×${帧高}\n`);

// ── 3) 逐块裁切 → 缩放 → 居中 → 对齐脚底 ─────────────────────────────
const 内容高 = Math.round(帧高 * 0.92);
const 统一系数 = 内容高 / 参考高;
const 表宽 = 帧宽 * 列;
const 表高 = 帧高 * 行;
const 表 = new Uint8Array(表宽 * 表高 * 3);
const 表A = new Uint8Array(表宽 * 表高);

for (let r = 0; r < 网格.length; r += 1) {
  for (let c = 0; c < 网格[r].length; c += 1) {
    const b = 网格[r][c];
    const 系数 = 模式 === '等比' ? 统一系数 : 内容高 / b.高;
    const w = Math.max(1, Math.round(b.宽 * 系数));
    const h = Math.max(1, Math.round(b.高 * 系数));
    // 从原图裁出这一块
    const 片 = { width: b.宽, height: b.高, rgb: new Uint8Array(b.宽 * b.高 * 3), alpha: new Uint8Array(b.宽 * b.高) };
    for (let y = 0; y < b.高; y += 1) {
      for (let x = 0; x < b.宽; x += 1) {
        const si = ((b.minY + y) * W + (b.minX + x)) * 3;
        const di = (y * b.宽 + x) * 3;
        片.rgb[di] = img.rgb[si];
        片.rgb[di + 1] = img.rgb[si + 1];
        片.rgb[di + 2] = img.rgb[si + 2];
        片.alpha[y * b.宽 + x] = img.alpha ? img.alpha[(b.minY + y) * W + (b.minX + x)] : 255;
      }
    }
    // 用"面积平均"而不是块众数：实测块众数在边缘块上会让品红占多数，
    // 结果角色轮廓外挂一圈品红毛边（比噪点更难看）。面积平均会把边缘糊成
    // 过渡色，随后的去毛边正好把它清掉。
    const 缩 = 缩放到(片, w, h);
    const 左 = c * 帧宽 + Math.round((帧宽 - w) / 2);
    const 顶 = r * 帧高 + Math.round(帧高 * 0.92) - h;
    for (let y = 0; y < h; y += 1) {
      for (let x = 0; x < w; x += 1) {
        const dx = 左 + x;
        const dy = 顶 + y;
        if (dx < 0 || dy < 0 || dx >= 表宽 || dy >= 表高) continue;
        if (缩.alpha && 缩.alpha[y * w + x] < 128) continue;
        const si = (y * w + x) * 3;
        const di = (dy * 表宽 + dx) * 3;
        表[di] = 缩.rgb[si];
        表[di + 1] = 缩.rgb[si + 1];
        表[di + 2] = 缩.rgb[si + 2];
        表A[dy * 表宽 + dx] = 255;
      }
    }
    process.stdout.write(`   ${r + 1}行${c + 1}列 ${String(b.宽).padStart(3)}×${String(b.高).padStart(3)} → ${String(w).padStart(3)}×${String(h).padStart(3)} (${系数.toFixed(3)})   `);
    if (c === 网格[r].length - 1) process.stdout.write('\n');
  }
}

let 输出图 = 去毛边({ width: 表宽, height: 表高, rgb: 表, alpha: 表A });
输出图 = 量化(输出图);
mkdirSync(输出目录, { recursive: true });
const 基名 = 输入.split(/[\\/]/).pop().replace(/\.png$/i, '');
const 出 = join(输出目录, `${基名}_${帧宽}x${帧高}.png`);
写入PNG(出, 输出图);

// ── 4) 放大预览 ──────────────────────────────────────────────────────
const S = Math.max(2, Math.floor(640 / Math.max(表宽, 表高)));
const 预览W = 表宽 * S;
const 预览H = 表高 * S;
const 预览 = new Uint8Array(预览W * 预览H * 3);
const 预览A = new Uint8Array(预览W * 预览H);
for (let y = 0; y < 预览H; y += 1) {
  for (let x = 0; x < 预览W; x += 1) {
    const si = (Math.floor(y / S) * 表宽 + Math.floor(x / S)) * 3;
    const ai = Math.floor(y / S) * 表宽 + Math.floor(x / S);
    const di = (y * 预览W + x) * 3;
    预览[di] = 表[si];
    预览[di + 1] = 表[si + 1];
    预览[di + 2] = 表[si + 2];
    预览A[y * 预览W + x] = 表A[ai];
  }
}
const 预览路径 = join(输出目录, `${基名}_${帧宽}x${帧高}_放大${S}x.png`);
写入PNG(预览路径, { width: 预览W, height: 预览H, rgb: 预览, alpha: 预览A });

/**
 * ⚠️ 颜色数必须数**写出去的那张**（`输出图`，已经去过毛边 + 量化过），
 *    不能数中间缓冲 `表` —— 那还是一张连续调图，会报出七八千色，
 *    让人以为"后处理没生效"（实测：成品实际 23 色，旧代码报 7895 色）。
 */
const 用色 = new Set();
for (let i = 0; i < 表宽 * 表高; i += 1) {
  if (输出图.alpha && 输出图.alpha[i] < 128) continue;
  用色.add((输出图.rgb[i * 3] << 16) | (输出图.rgb[i * 3 + 1] << 8) | 输出图.rgb[i * 3 + 2]);
}
console.log(`\n  成品 ${表宽}×${表高}（${列}×${行} 帧，每帧 ${帧宽}×${帧高}）· ${用色.size} 色`);
console.log(`  输出：${出}`);
console.log(`  预览：${预览路径}`);
console.log('  ⚠️ 预览是**未去毛边、未量化**的原始缩放结果（故意留着，方便看品红残影和脚底基线）；');
console.log('     判断"干不干净"要看上面那个色数，或跑：node 工具/图片体检.mjs <输出图>');

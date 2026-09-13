/**
 * 帧差异检查（零依赖）
 *
 * 用来判断"多格动画图里的每一格是否真的不一样"。
 * 靠眼睛看 4 帧走路很容易被骗（腿只是移动了几个像素），
 * 所以这里直接算：把每一格裁出来、抠掉品红、对齐到同一画布，
 * 然后两两比对像素差异百分比。
 *
 * 用法：node 工具/帧差异检查.mjs <多格图> <列> <行> [--行名=a,b,c,d]
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { 读取PNG, 是品红 } from './图像库.mjs';

const 参数 = process.argv.slice(2);
const [输入, 列s, 行s] = 参数;
if (!输入 || !列s || !行s) {
  console.error('用法：node 工具/帧差异检查.mjs <多格图> <列> <行> [--行名=下,上,左,右]');
  process.exit(1);
}
const 列 = Number(列s);
const 行 = Number(行s);
const 行名 = (参数.find((a) => a.startsWith('--行名=')) ?? '').split('=')[1]?.split(',');

const img = 读取PNG(resolve(输入));
const 格W = Math.floor(img.width / 列);
const 格H = Math.floor(img.height / 行);

/** 裁一格，并把它"贴"到统一画布上（按内容包围盒居中），消除位置抖动带来的假差异 */
function 取格(c, r) {
  const 盒 = { x0: 1e9, y0: 1e9, x1: -1, y1: -1 };
  const 点 = [];
  for (let y = 0; y < 格H; y += 1) {
    for (let x = 0; x < 格W; x += 1) {
      const sx = c * 格W + x;
      const sy = r * 格H + y;
      const i = (sy * img.width + sx) * 3;
      if (是品红(img.rgb[i], img.rgb[i + 1], img.rgb[i + 2])) continue;
      if (sx < 盒.x0) 盒.x0 = sx;
      if (sx > 盒.x1) 盒.x1 = sx;
      if (sy < 盒.y0) 盒.y0 = sy;
      if (sy > 盒.y1) 盒.y1 = sy;
      点.push([x, y]);
    }
  }
  if (盒.x1 < 0) return null;
  const w = 盒.x1 - 盒.x0 + 1;
  const h = 盒.y1 - 盒.y0 + 1;
  // 包围盒内的不透明掩码 + 平均色
  const 掩码 = new Uint8Array(w * h);
  const 色 = new Uint8Array(w * h * 3);
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const sx = 盒.x0 + x;
      const sy = 盒.y0 + y;
      const i = (sy * img.width + sx) * 3;
      if (是品红(img.rgb[i], img.rgb[i + 1], img.rgb[i + 2])) continue;
      掩码[y * w + x] = 1;
      色[(y * w + x) * 3] = img.rgb[i];
      色[(y * w + x) * 3 + 1] = img.rgb[i + 1];
      色[(y * w + x) * 3 + 2] = img.rgb[i + 2];
    }
  }
  return { w, h, 掩码, 色, 盒, 脚底: 盒.y1 };
}

/** 两格差异：把两张都居中放到同一个大画布上再比 */
function 差异(a, b) {
  const W = Math.max(a.w, b.w);
  const H = Math.max(a.h, b.h);
  const 放 = (g) => {
    const m = new Uint8Array(W * H);
    const c = new Uint8Array(W * H * 3);
    const ox = Math.floor((W - g.w) / 2);
    const oy = Math.floor((H - g.h) / 2);
    for (let y = 0; y < g.h; y += 1) {
      for (let x = 0; x < g.w; x += 1) {
        if (!g.掩码[y * g.w + x]) continue;
        const di = (oy + y) * W + (ox + x);
        m[di] = 1;
        c[di * 3] = g.色[(y * g.w + x) * 3];
        c[di * 3 + 1] = g.色[(y * g.w + x) * 3 + 1];
        c[di * 3 + 2] = g.色[(y * g.w + x) * 3 + 2];
      }
    }
    return { m, c };
  };
  const A = 放(a);
  const B = 放(b);
  let 形状差 = 0;
  let 颜色差 = 0;
  let 并集 = 0;
  for (let i = 0; i < W * H; i += 1) {
    const a1 = A.m[i];
    const b1 = B.m[i];
    if (a1 || b1) 并集 += 1;
    if (a1 !== b1) { 形状差 += 1; continue; }
    if (!a1) continue;
    const d = Math.abs(A.c[i * 3] - B.c[i * 3]) + Math.abs(A.c[i * 3 + 1] - B.c[i * 3 + 1]) + Math.abs(A.c[i * 3 + 2] - B.c[i * 3 + 2]);
    if (d > 60) 颜色差 += 1;
  }
  return { 形状: (形状差 / 并集) * 100, 颜色: (颜色差 / 并集) * 100 };
}

console.log(`【${输入.split(/[\\/]/).pop()}】${列}×${行} = ${列 * 行} 格，每格 ${格W}×${格H}\n`);

const 全格 = [];
for (let r = 0; r < 行; r += 1) {
  const 本行 = [];
  for (let c = 0; c < 列; c += 1) 本行.push(取格(c, r));
  全格.push(本行);
}

let 问题 = 0;
for (let r = 0; r < 行; r += 1) {
  const 标签 = 行名?.[r] ?? `第${r + 1}行`;
  const 格们 = 全格[r].filter(Boolean);
  const 序号 = 全格[r].map((g, i) => (g ? i + 1 : null)).filter(Boolean);
  const 高度 = 格们.map((g) => g.h);
  const 宽度 = 格们.map((g) => g.w);
  const 基线 = 格们.map((g) => g.脚底);
  console.log(`── ${标签} ──  ${格们.length} 格`);
  console.log(`   内容尺寸  宽 ${Math.min(...宽度)}~${Math.max(...宽度)}  高 ${Math.min(...高度)}~${Math.max(...高度)}`);
  console.log(`   脚底位置  ${Math.min(...基线)}~${Math.max(...基线)}`);
  // 相邻帧差异
  const 差 = [];
  for (let i = 1; i < 格们.length; i += 1) {
    const d = 差异(格们[i - 1], 格们[i]);
    差.push(d);
  }
  // 首尾差异（走路循环首尾应当接近）
  const 首尾 = 格们.length > 2 ? 差异(格们[0], 格们[格们.length - 1]) : null;
  console.log('   相邻帧差异：' + 差.map((d, i) => `${序号[i]}→${序号[i + 1]} ${d.形状.toFixed(1)}%`).join('  '));
  if (首尾) console.log(`   首尾差异：  ${首尾.形状.toFixed(1)}%`);
  const 最大 = Math.max(...差.map((d) => d.形状));
  const 判定 = 最大 < 1.5 ? '❌ 几乎相同——没有做出动作' : 最大 < 4 ? '⚠️ 差异偏小，动作不明显' : '✅ 帧之间有可见差异';
  console.log(`   判定：      ${判定}（最大相邻差异 ${最大.toFixed(1)}%）`);
  if (最大 < 1.5) 问题 += 1;
  console.log('');
}

console.log(问题 === 0 ? '结论：每一行都做出了动作差异。' : `结论：有 ${问题} 行的帧几乎相同，需要重出。`);

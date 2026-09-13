/**
 * 切件（零依赖）—— 连通块切分版
 *
 * 把"多件一张图"切成一件一个 PNG。和 处理素材.mjs 里的「切片组」不同：
 * 那个按**固定网格**切，实测会被"邻格漏入"污染（模型的物件会跨越格线）；
 * 这个按**连通块**切，先找出每一件，再按位置排成网格，因此不会切错。
 *
 * 整组统一比例 + 统一画布：保证同一组里的道具**大小一致、画布一致**，
 * 摆到游戏里不会一大一小。
 *
 * 用法：
 *   node 工具/切件.mjs <多格图> <列> <行> <目标高> <输出目录> --帧名=甲,乙,丙 [--前缀=道具]
 */
import { mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { 读取PNG, 写入PNG, 缩放到, 去毛边, 量化, 抠品红, 是品红 } from './图像库.mjs';

const 参数 = process.argv.slice(2);
const [输入, 列s, 行s, 目标高s, 输出目录s] = 参数;
if (!输入 || !列s || !行s || !目标高s || !输出目录s) {
  console.error('用法：node 工具/切件.mjs <多格图> <列> <行> <目标高> <输出目录> --帧名=甲,乙 [--前缀=道具]');
  process.exit(1);
}
const 列 = Number(列s);
const 行 = Number(行s);
const 目标高 = Number(目标高s);
const 输出目录 = resolve(输出目录s);
const 帧名 = ((参数.find((a) => a.startsWith('--帧名=')) ?? '').split('=')[1] ?? '').split(',').filter(Boolean);
const 前缀 = ((参数.find((a) => a.startsWith('--前缀=')) ?? '--前缀=道具').split('=')[1]) || '道具';

const img = 抠品红(读取PNG(resolve(输入)));
const W = img.width;
const H = img.height;
const 是内容 = (x, y) => {
  const i = (y * W + x) * 3;
  if (img.alpha && img.alpha[y * W + x] < 128) return false;
  return !是品红(img.rgb[i], img.rgb[i + 1], img.rgb[i + 2]);
};

// ── 连通块 ────────────────────────────────────────────────────────────
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

// 碎屑过滤 + 合并：同一件的阴影有时是独立小块，按"面积占比"过滤掉太小的
const 最大面积 = Math.max(...块.map((b) => b.像素), 1);
const 有效 = 块.filter((b) => b.像素 >= 最大面积 * 0.10);
const 期望 = 列 * 行;

console.log(`【${输入.split(/[\\/]/).pop()}】${W}×${H}`);
console.log(`  连通块 ${块.length} 个（过滤碎屑后 ${有效.length} 个）· 期望 ${期望} 件`);
if (有效.length !== 期望) {
  console.log(`  ⚠️ 件数不等于 ${期望}，按位置排布后取前 ${期望} 件`);
}

// ── 排成网格 ──────────────────────────────────────────────────────────
const 带中心 = 有效.map((b) => ({ ...b, cx: (b.minX + b.maxX) / 2, cy: (b.minY + b.maxY) / 2 }));
带中心.sort((a, b) => a.cy - b.cy || a.cx - b.cx);
const 网格 = [];
for (let r = 0; r < 行; r += 1) {
  const 段 = 带中心.slice(r * 列, (r + 1) * 列);
  if (!段.length) continue;
  段.sort((a, b) => a.cx - b.cx);
  网格.push(段);
}

// ── 整组统一比例 + 统一画布 ───────────────────────────────────────────
const 全部 = 网格.flat();
const 最大H = Math.max(...全部.map((b) => b.高));
const 最大W = Math.max(...全部.map((b) => b.宽));
// 允许用 --系数= 强制指定缩放（多组之间保持一致的大小），
// 否则按本组最大件算（组内一致，但组间可能不一致）。
const 强制系数 = Number((参数.find((a) => a.startsWith('--系数=')) ?? '').split('=')[1]) || 0;
const 系数 = 强制系数 > 0 ? 强制系数 : 目标高 / 最大H;
const 画布W = Math.max(1, Math.round(最大W * 系数));
const 画布H = 目标高;
console.log(`  最大件 ${最大W}×${最大H} · 统一系数 ${系数.toFixed(3)} · 画布 ${画布W}×${画布H}\n`);

mkdirSync(输出目录, { recursive: true });
let i = 0;
for (let r = 0; r < 网格.length; r += 1) {
  for (let c = 0; c < 网格[r].length; c += 1) {
    const b = 网格[r][c];
    const w = Math.max(1, Math.round(b.宽 * 系数));
    const h = Math.max(1, Math.round(b.高 * 系数));
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
    const 缩 = 缩放到(片, w, h);
    const rgb = new Uint8Array(画布W * 画布H * 3);
    const alpha = new Uint8Array(画布W * 画布H);
    const 左 = Math.floor((画布W - w) / 2);
    const 顶 = 画布H - h; // 贴底对齐（道具都"站"在同一条基线上）
    for (let y = 0; y < h; y += 1) {
      for (let x = 0; x < w; x += 1) {
        const dx = 左 + x;
        const dy = 顶 + y;
        if (dx < 0 || dy < 0 || dx >= 画布W || dy >= 画布H) continue;
        if (缩.alpha && 缩.alpha[y * w + x] < 128) continue;
        const si = (y * w + x) * 3;
        const di = (dy * 画布W + dx) * 3;
        rgb[di] = 缩.rgb[si];
        rgb[di + 1] = 缩.rgb[si + 1];
        rgb[di + 2] = 缩.rgb[si + 2];
        alpha[dy * 画布W + dx] = 255;
      }
    }
    let 小 = 去毛边({ width: 画布W, height: 画布H, rgb, alpha });
    小 = 量化(小);
    const 名 = 帧名[i] ?? String(i + 1).padStart(2, '0');
    写入PNG(join(输出目录, `${前缀}_${名}.png`), 小);
    console.log(`  ${String(i + 1).padStart(2)}. ${(前缀 + '_' + 名).padEnd(22)} 原 ${String(b.宽).padStart(4)}×${String(b.高).padStart(4)} → ${w}×${h}`);
    i += 1;
  }
}
console.log(`\n输出目录：${输出目录}`);

/**
 * 九宫格体检（零依赖）
 *
 * 判断一张 UI 素材能不能切成九宫格。九宫格的硬指标是：
 *   **四条边的描边宽度必须一致**、**四角对称**。
 * 如果左边描边 12px、右边 6px，拉伸之后四条边的粗細就会明显不一样，一眼就露馅。
 *
 * 用法：node 工具/九宫格体检.mjs <图片> [<图片> ...]
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { 读取PNG, 是品红 } from './图像库.mjs';

const 文件们 = process.argv.slice(2);
if (文件们.length === 0) {
  console.error('用法：node 工具/九宫格体检.mjs <图片> [<图片> ...]');
  process.exit(1);
}

/** 深色描边的判定：亮度很低 */
const 是描边 = (r, g, b) => 0.299 * r + 0.587 * g + 0.114 * b < 90;

for (const 路径 of 文件们) {
  const img = 读取PNG(resolve(路径));
  const { width: W, height: H, rgb } = img;

  // 1) 找内容 bbox（非品红）
  let x0 = W, x1 = -1, y0 = H, y1 = -1;
  for (let y = 0; y < H; y += 1) {
    for (let x = 0; x < W; x += 1) {
      const i = (y * W + x) * 3;
      if (是品红(rgb[i], rgb[i + 1], rgb[i + 2])) continue;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  }
  if (x1 < 0) {
    console.log(`${路径}：全是品红，没找到内容`);
    continue;
  }
  const 内容W = x1 - x0 + 1;
  const 内容H = y1 - y0 + 1;

  // 2) 找气泡本体（排除尾巴）：逐行统计内容宽度，取出现次数最多的一档
  const 行宽 = [];
  for (let y = y0; y <= y1; y += 1) {
    let l = -1, r = -1;
    for (let x = x0; x <= x1; x += 1) {
      const i = (y * W + x) * 3;
      if (是品红(rgb[i], rgb[i + 1], rgb[i + 2])) continue;
      if (l < 0) l = x;
      r = x;
    }
    if (l >= 0) 行宽.push({ y, l, r, w: r - l + 1 });
  }
  const 最大宽 = Math.max(...行宽.map((o) => o.w));
  // 本体 = 宽度达到最大宽 95% 的那些行
  const 本体行 = 行宽.filter((o) => o.w >= 最大宽 * 0.95);
  const 本Top = 本体行[0].y;
  const 本Bottom = 本体行[本体行.length - 1].y;
  const 本Left = Math.min(...本体行.map((o) => o.l));
  const 本Right = Math.max(...本体行.map((o) => o.r));
  const 本W = 本Right - 本Left + 1;
  const 本H = 本Bottom - 本Top + 1;

  // 3) 量四条边的描边厚度（取中点，避开圆角与尾巴）
  //    注意：最外圈有几个像素是"品红与气泡的抗锯齿过渡"，不是描边，
  //    所以要跳过它们，找第一段连续的深色，才数得准。
  const 中y = Math.round((本Top + 本Bottom) / 2);
  const 中x = Math.round((本Left + 本Right) / 2);
  const 量 = (起, 止, 步, 扫描线, 轴) => {
    let 找到 = false;
    let n = 0;
    for (let k = 起; 步 > 0 ? k <= 止 : k >= 止; k += 步) {
      const x = 轴 === 'x' ? k : 扫描线;
      const y = 轴 === 'x' ? 扫描线 : k;
      const i = (y * W + x) * 3;
      if (是描边(rgb[i], rgb[i + 1], rgb[i + 2])) {
        找到 = true;
        n += 1;
      } else if (找到) {
        break; // 描边段结束
      }
    }
    return n;
  };
  // 用"内容边界"而不是"本体边界"——本体边界是宽度达 95% 的行，已经把上下边框排除了
  const 左 = 量(x0, x1, 1, 中y, 'x');
  const 右 = 量(x1, x0, -1, 中y, 'x');
  const 上 = 量(y0, y1, 1, 中x, 'y');
  const 下 = 量(y1, y0, -1, 中x, 'y');

  // 4) 取气泡填充色（本体中心附近）
  const ci = (中y * W + 中x) * 3;
  const 填充 = `#${[rgb[ci], rgb[ci + 1], rgb[ci + 2]].map((v) => v.toString(16).padStart(2, '0')).join('')}`;

  const 值 = [左, 右, 上, 下];
  const 最大 = Math.max(...值);
  const 最小 = Math.min(...值);
  const 偏差 = 最小 > 0 ? (最大 - 最小) / 最小 : 1;

  const 名字 = 路径.split(/[\\/]/).pop();
  console.log(`\n【${名字}】`);
  console.log(`  画布      ${W}×${H}`);
  console.log(`  气泡本体  ${本W}×${本H}（含尾巴的内容区 ${内容W}×${内容H}）`);
  console.log(`  本体位置  左${本Left} 上${本Top} 右${本Right} 下${本Bottom}`);
  console.log(`  描边厚度  左 ${左}px · 右 ${右}px · 上 ${上}px · 下 ${下}px`);
  console.log(`  填充色    ${填充}`);
  console.log(`  尾巴      内容区比本体 ${内容H - 本H > 8 ? `向下多 ${内容H - 本H}px（有尾巴）` : '几乎没有（无尾巴）'}`);
  const 判定 =
    偏差 <= 0.15 ? '✅ 四边一致，适合九宫格' : 偏差 <= 0.4 ? '⚠️ 略有偏差，拉伸后可能看出来' : '❌ 四边差太多，不能直接做九宫格';
  console.log(`  判定      ${判定}（最大/最小 = ${最大}/${最小}，偏差 ${(偏差 * 100).toFixed(0)}%）`);
}

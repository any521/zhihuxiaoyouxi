/**
 * 多格图"跨格/裁切"批量体检（零依赖）
 *
 * 检查每张多格图的每一格：
 *   一、内容是否**触及格子边界**（触边 = 可能被裁切，或溢出到邻格）
 *   二、逐行剖面里是否存在**多个不相连的内容段**（多段 = 有东西从邻格漏进来）
 *
 * 用法：node 工具/检查跨格.mjs <目录>            # 扫目录下全部 png
 *       node 工具/检查跨格.mjs <图片> <列> <行>   # 单张
 */
import { readdirSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { 读取PNG, 是品红 } from './图像库.mjs';

/** 已知的多格图规格（列, 行, 说明） */
const 规格表 = {
  '角色_刘看山_四方向行走16帧': [4, 4, '行走 4方向×4帧'],
  '角色_刘看山_待机8帧': [4, 2, '待机 4方向×2帧'],
  '角色_刘看山_动作8帧': [4, 2, '动作 4组×2帧'],
  '界面_头像框_四款': [2, 2, '头像框'],
  '界面_图标_微信6枚': [3, 2, '微信图标'],
  '界面_手机按钮_两态': [1, 2, '手机按钮'],
  '界面_小件_六种': [3, 2, '聊天小件'],
  '贴纸_刘看山12枚': [4, 3, '贴纸'],
  '道具_工位区9件': [3, 3, '工位区家具'],
  '道具_会议室6件': [3, 2, '会议室家具'],
  '道具_茶水间4件': [2, 2, '茶水间家具'],
  '道具_急件机器6件': [3, 2, '急件机器'],
  '道具_急件文件6件': [3, 2, '急件文件'],
  '道具_PPT6件': [3, 2, 'PPT 道具'],
};
// 这些批次的所有"朝向/表情"图都是 3×2 / 2×2
for (const 名 of ['林总', '周岚', '阿麦', '韩策', '小鹿', '程女士']) {
  规格表[`角色_${名}_朝向6帧`] = [3, 2, `${名} 朝向`];
  规格表[`角色_${名}_四表情`] = [2, 2, `${名} 四表情`];
}

/** 分析一格：返回内容包围盒 + 逐行内容段数 */
function 分析格(img, 左, 上, 宽, 高) {
  let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
  const 行数 = new Int32Array(高);
  for (let y = 0; y < 高; y += 1) {
    let n = 0;
    for (let x = 0; x < 宽; x += 1) {
      const sx = 左 + x;
      const sy = 上 + y;
      if (sx >= img.width || sy >= img.height) continue;
      const i = (sy * img.width + sx) * 3;
      if (是品红(img.rgb[i], img.rgb[i + 1], img.rgb[i + 2])) continue;
      n += 1;
      if (sx < x0) x0 = sx;
      if (sx > x1) x1 = sx;
      if (sy < y0) y0 = sy;
      if (sy > y1) y1 = sy;
    }
    行数[y] = n;
  }
  if (x1 < 0) return null;
  // 数一下有多少个"内容段"（连续的有内容的行）
  let 段数 = 0;
  let 在段中 = false;
  for (let y = 0; y < 高; y += 1) {
    const 有 = 行数[y] > 2;
    if (有 && !在段中) { 段数 += 1; 在段中 = true; }
    if (!有) 在段中 = false;
  }
  return {
    宽: x1 - x0 + 1,
    高: y1 - y0 + 1,
    左留白: x0 - 左,
    右留白: 左 + 宽 - 1 - x1,
    上留白: y0 - 上,
    下留白: 上 + 高 - 1 - y1,
    段数,
  };
}

function 检查一张(路径, 列, 行, 说明) {
  const img = 读取PNG(路径);
  const 格W = Math.floor(img.width / 列);
  const 格H = Math.floor(img.height / 行);
  const 问题 = [];
  const 高们 = [];
  for (let r = 0; r < 行; r += 1) {
    for (let c = 0; c < 列; c += 1) {
      const g = 分析格(img, c * 格W, r * 格H, 格W, 格H);
      if (!g) continue;
      高们.push(g.高);
      const 触 = [];
      if (g.左留白 <= 0) 触.push('左');
      if (g.右留白 <= 0) 触.push('右');
      if (g.上留白 <= 0) 触.push('上');
      if (g.下留白 <= 0) 触.push('下');
      if (触.length) 问题.push(`第${r + 1}行${c + 1}列 触及${触.join('/')}边界`);
      if (g.段数 > 1) 问题.push(`第${r + 1}行${c + 1}列 有 ${g.段数} 个不相连的内容段（邻格漏进来了）`);
    }
  }
  const 高差 = 高们.length ? (Math.max(...高们) - Math.min(...高们)) / Math.max(...高们) : 0;
  return { 说明, 格: 格W + '×' + 格H, 问题, 高差 };
}

const 参数 = process.argv.slice(2);
const 目标 = resolve(参数[0]);
const 结果 = [];

if (参数.length >= 3) {
  结果.push(检查一张(目标, Number(参数[1]), Number(参数[2]), ''));
} else {
  const 文件们 = readdirSync(目标).filter((f) => f.toLowerCase().endsWith('.png'));
  for (const f of 文件们) {
    const 基名 = f.replace(/\.png$/i, '');
    const 规格 = 规格表[基名];
    if (!规格) continue;
    结果.push(检查一张(join(目标, f), 规格[0], 规格[1], 规格[2]));
  }
}

console.log('=== 多格图跨格/裁切体检 ===\n');
let 好 = 0;
let 坏 = 0;
for (const r of 结果) {
  const ok = r.问题.length === 0;
  if (ok) 好 += 1; else 坏 += 1;
  const 标 = ok ? '✅' : '❌';
  const 高差标 = r.高差 > 0.12 ? `  ⚠️ 格间高度差 ${(r.高差 * 100).toFixed(0)}%` : '';
  console.log(`${标} ${r.说明 || ''}  ${r.格}${高差标}`);
  for (const p of r.问题) console.log(`     · ${p}`);
}
console.log(`\n合计：${好} 张干净，${坏} 张有问题`);

/**
 * 处理界面v2（零依赖）
 *
 * 这一批和之前的素材不一样：**气泡要按"描边宽度"来缩放**，而不是按固定高度。
 * 原因：九宫格拉伸时，描边的粗细是固定的（CSS border-width 决定），
 * 素材里的描边必须是整数像素（2px），否则渲染出来会一条粗一条细。
 *
 * 所以流程是：
 *   抠品红 → 裁到内容 → **量出描边宽度** → 算出"让描边变成 2px"的缩放比
 *   → 缩放 → 量化 → 保存 → 记录九宫格切片参数
 *
 * 用法：node 工具/处理界面v2.mjs
 */
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { 读取PNG, 写入PNG, 裁剪, 内容边界, 缩放到, 抠品红, 量化, 是品红, 去毛边 } from './图像库.mjs';

const 根 = resolve(process.cwd());
const 源目录 = join(根, '美术/素材库/原图/10-界面v2');
const 出目录 = join(根, '美术/素材库/成品/界面v2');

/** 深色描边的判定 */
const 是描边 = (r, g, b) => 0.299 * r + 0.587 * g + 0.114 * b < 90;

/** 量一张图四条边的描边宽度（取中点，跳过品红抗锯齿过渡） */
function 量描边(img, x0, x1, y0, y1) {
  const { width: W, rgb } = img;
  const 中y = Math.round((y0 + y1) / 2);
  const 中x = Math.round((x0 + x1) / 2);
  const 扫 = (起, 止, 步, 扫描线, 轴) => {
    let 找到 = false;
    let n = 0;
    for (let k = 起; 步 > 0 ? k <= 止 : k >= 止; k += 步) {
      const x = 轴 === 'x' ? k : 扫描线;
      const y = 轴 === 'x' ? 扫描线 : k;
      const i = (y * W + x) * 3;
      if (是描边(rgb[i], rgb[i + 1], rgb[i + 2])) {
        找到 = true;
        n += 1;
      } else if (找到) break;
    }
    return n;
  };
  return {
    左: 扫(x0, x1, 1, 中y, 'x'),
    右: 扫(x1, x0, -1, 中y, 'x'),
    上: 扫(y0, y1, 1, 中x, 'y'),
    下: 扫(y1, y0, -1, 中x, 'y'),
  };
}

/** 找出气泡本体（宽度达最大宽 95% 的行）用于算圆角与切片 */
function 量本体(img, x0, x1, y0, y1) {
  const { width: W, rgb } = img;
  const 行 = [];
  for (let y = y0; y <= y1; y += 1) {
    let l = -1;
    let r = -1;
    for (let x = x0; x <= x1; x += 1) {
      const i = (y * W + x) * 3;
      if (是品红(rgb[i], rgb[i + 1], rgb[i + 2])) continue;
      if (l < 0) l = x;
      r = x;
    }
    if (l >= 0) 行.push({ y, l, r, w: r - l + 1 });
  }
  const 最大 = Math.max(...行.map((o) => o.w));
  const 本体 = 行.filter((o) => o.w >= 最大 * 0.95);
  return {
    上: 本体[0].y,
    下: 本体[本体.length - 1].y,
    左: Math.min(...本体.map((o) => o.l)),
    右: Math.max(...本体.map((o) => o.r)),
  };
}

const 任务 = [
  { 文件: '界面_气泡_我方.png', 描边目标: 2, 类型: '气泡' },
  { 文件: '界面_气泡_对方.png', 描边目标: 2, 类型: '气泡' },
  { 文件: '界面_气泡_群聊.png', 描边目标: 2, 类型: '气泡' },
  { 文件: '界面_底_聊天区.png', 描边目标: 0, 类型: '底图', 目标宽: 128 },
  { 文件: '界面_列表项_两态.png', 描边目标: 0, 类型: '底图', 目标宽: 256, 网格: [1, 2] },
  { 文件: '界面_底_功能栏.png', 描边目标: 0, 类型: '底图', 目标宽: 48 },
  // ── 第二批：切片类（每格一件，整组统一比例 + 统一画布）──
  {
    文件: '界面_头像框_四款.png', 类型: '切片', 网格: [2, 2], 目标高: 96,
    帧名: ['方形', '圆形', '方形粗边', '圆形粗边'], 输出前缀: '头像框',
  },
  {
    文件: '界面_图标_微信6枚.png', 类型: '切片', 网格: [3, 2], 目标高: 32,
    帧名: ['会话', '通讯录', '设置', '搜索', '更多', '返回'], 输出前缀: '微信图标',
  },
  {
    文件: '界面_手机按钮_两态.png', 类型: '切片', 网格: [1, 2], 目标高: 48,
    帧名: ['普通', '有未读'], 输出前缀: '手机按钮',
  },
  {
    文件: '界面_小件_六种.png', 类型: '切片', 网格: [3, 2], 目标高: 24,
    帧名: ['时间戳', '入群邀请卡', '文件气泡', '系统消息', '未读红点', '右箭头'], 输出前缀: '小件',
  },
  {
    文件: '贴纸_刘看山12枚.png', 类型: '切片', 网格: [4, 3], 目标高: 64,
    帧名: ['探头', '点赞', '大哭', '震惊', '合十', '递咖啡', '抱头', '举手', '晕', '比心', '累了', '鞠躬'],
    输出前缀: '贴纸',
  },
  // ── 长条类：两步法的第二步——裁掉上下的品红，留下的就是横条 ──
  // 注意：这两个不能用「按描边缩放」——横条整体都是深色，描边会被量成整条宽度。
  { 文件: '界面_顶栏_移动端.png', 类型: '底图', 目标宽: 288 },
  { 文件: '界面_底栏_移动端.png', 类型: '底图', 目标宽: 288 },
];

mkdirSync(出目录, { recursive: true });
const 九宫格信息 = [];

console.log('=== 处理界面v2 ===\n');

for (const 项 of 任务) {
  const 源路径 = join(源目录, 项.文件);
  if (!existsSync(源路径)) {
    console.log(`  ⬜ ${项.文件}：还没生成`);
    continue;
  }
  const 原 = 读取PNG(源路径);
  // 抠品红之后立刻去毛边：清掉"品红与素材之间的抗锯齿过渡"，
  // 否则缩到 1× 时这些过渡像素会被量化成蓝边或黑边（实测出现过）
  const 抠 = 去毛边(抠品红(原));

  if (项.类型 === '气泡') {
    // 1) 裁到内容
    const 盒 = 内容边界(抠);
    if (!盒) {
      console.log(`  ⚠️ ${项.文件}：找不到内容`);
      continue;
    }
    const 内容 = 裁剪(抠, 盒.minX, 盒.minY, 盒.宽, 盒.高);
    // 2) 量描边
    const 边 = 量描边(内容, 0, 内容.width - 1, 0, 内容.height - 1);
    const 参考 = Math.max(边.左, 边.右, 边.上, 边.下);
    // 3) 缩放比 = 目标描边 / 实际描边
    const 比例 = 项.描边目标 / Math.max(1, 参考);
    const 新W = Math.max(8, Math.round(内容.width * 比例));
    const 新H = Math.max(8, Math.round(内容.height * 比例));
    let 图 = 缩放到(内容, 新W, 新H);
    图 = 量化(图);
    图 = 抠品红(图);
    // 4) 重新量一下缩放后的描边与本体，用来算切片
    const 边2 = 量描边(图, 0, 图.width - 1, 0, 图.height - 1);
    const 体 = 量本体(图, 0, 图.width - 1, 0, 图.height - 1);
    const 圆角 = Math.max(边2.上, 边2.左) + Math.round((体.左 - 0) * 0.5);
    const 切片 = Math.min(Math.round(图.height * 0.4), Math.max(6, 圆角));
    const 输出 = join(出目录, 项.文件);
    写入PNG(输出, 图);
    九宫格信息.push({
      文件: 项.文件,
      尺寸: `${图.width}×${图.height}`,
      描边: `${边2.左}/${边2.右}/${边2.上}/${边2.下}`,
      建议切片: 切片,
      建议borderWidth: 边2.左,
    });
    console.log(
      `  ✅ ${项.文件.padEnd(20)} ${内容.width}×${内容.height} → ${图.width}×${图.height}` +
        ` · 描边 ${参考}px → ${边2.左}px · 切片建议 ${切片}`,
    );
  } else if (项.类型 === '切片') {
    // 切片类：先逐格裁边，再按「整组统一比例」缩放，最后摆到统一画布上。
    // 统一比例是关键——不能每格各自缩到目标高，否则图标会一大一小。
    const [列, 行] = 项.网格;
    const 格W = Math.floor(抠.width / 列);
    const 格H = Math.floor(抠.height / 行);
    const 原片 = [];
    for (let i = 0; i < 列 * 行; i += 1) {
      const c = i % 列;
      const r = Math.floor(i / 列);
      const 片 = 裁剪(抠, c * 格W, r * 格H, 格W, 格H);
      const 盒 = 内容边界(片);
      if (!盒) continue;
      原片.push({ 序号: i, 图: 裁剪(片, 盒.minX, 盒.minY, 盒.宽, 盒.高) });
    }
    if (!原片.length) {
      console.log(`  ⚠️ ${项.文件}：切片后没找到内容`);
      continue;
    }
    const 最大W = Math.max(...原片.map((o) => o.图.width));
    const 最大H = Math.max(...原片.map((o) => o.图.height));
    const 比例 = 项.目标高 / 最大H;
    const 画布W = Math.max(1, Math.round(最大W * 比例));
    const 画布H = 项.目标高;
    let 计数 = 0;
    for (let k = 0; k < 原片.length; k += 1) {
      const { 图: 片, 序号 } = 原片[k];
      const w = Math.max(1, Math.round(片.width * 比例));
      const h = Math.max(1, Math.round(片.height * 比例));
      const 缩放后 = 缩放到(片, w, h);
      const rgb = new Uint8Array(画布W * 画布H * 3);
      const alpha = new Uint8Array(画布W * 画布H);
      const 左 = Math.floor((画布W - w) / 2);
      const 顶 = Math.floor((画布H - h) / 2);
      for (let y = 0; y < h; y += 1) {
        for (let x = 0; x < w; x += 1) {
          const dx = 左 + x;
          const dy = 顶 + y;
          if (dx < 0 || dy < 0 || dx >= 画布W || dy >= 画布H) continue;
          const si = (y * w + x) * 3;
          const di = (dy * 画布W + dx) * 3;
          rgb[di] = 缩放后.rgb[si];
          rgb[di + 1] = 缩放后.rgb[si + 1];
          rgb[di + 2] = 缩放后.rgb[si + 2];
          alpha[dy * 画布W + dx] = 缩放后.alpha ? 缩放后.alpha[y * w + x] : 255;
        }
      }
      let 小 = 去毛边({ width: 画布W, height: 画布H, rgb, alpha });
      小 = 量化(小);
      const 名 = 项.帧名?.[序号] ?? String(序号 + 1).padStart(2, '0');
      写入PNG(join(出目录, `${项.输出前缀}_${名}.png`), 小);
      计数 += 1;
    }
    console.log(`  ✅ ${项.文件.padEnd(20)} ${列}×${行} → ${计数} 张 · 每张 ${画布W}×${画布H}`);
  } else {
    // 底图：抠光 + 缩到目标宽
    const 盒 = 内容边界(抠);
    let 图 = 盒 ? 裁剪(抠, 盒.minX, 盒.minY, 盒.宽, 盒.高) : 抠;
    if (项.网格) {
      // 上下两态：按网格切成两张
      const [列, 行] = 项.网格;
      const 格W = Math.floor(图.width / 列);
      const 格H = Math.floor(图.height / 行);
      for (let i = 0; i < 行; i += 1) {
        const 片 = 裁剪(图, 0, i * 格H, 格W, 格H);
        const 盒2 = 内容边界(片);
        const 净 = 盒2 ? 裁剪(片, 盒2.minX, 盒2.minY, 盒2.宽, 盒2.高) : 片;
        const 比 = 项.目标宽 / 净.width;
        let 小 = 缩放到(净, 项.目标宽, Math.max(2, Math.round(净.height * 比)));
        小 = 量化(小);
        小 = 抠品红(小);
        const 名 = ['普通', '选中'][i] ?? String(i);
        写入PNG(join(出目录, `列表项_${名}.png`), 小);
        console.log(`  ✅ 列表项_${名}.png        ${净.width}×${净.height} → ${小.width}×${小.height}`);
      }
      continue;
    }
    const 比 = 项.目标宽 / 图.width;
    let 小 = 缩放到(图, 项.目标宽, Math.max(2, Math.round(图.height * 比)));
    小 = 量化(小);
    小 = 抠品红(小);
    写入PNG(join(出目录, 项.文件), 小);
    console.log(`  ✅ ${项.文件.padEnd(20)} ${图.width}×${图.height} → ${小.width}×${小.height}`);
  }
}

if (九宫格信息.length) {
  writeFileSync(join(出目录, '九宫格参数.json'), JSON.stringify(九宫格信息, null, 2), 'utf8');
  console.log('\n=== 九宫格参数（给代码用）===');
  for (const 条 of 九宫格信息) {
    console.log(`  ${条.文件}  ${条.尺寸}  描边 ${条.描边}  切片 ${条.建议切片}  border-width ${条.建议borderWidth}`);
  }
}

console.log(`\n输出：${出目录}`);

/**
 * 接入开场素材（零依赖）
 *
 * 开场 AVG 需要的素材分两类：
 *   一、需要**切**的：6 个 NPC 的四表情是 2×2 的 64×64 小图，要切成 4 张 64×64 头像
 *   二、直接**拷**的：背景、贴纸、头像框、气泡、结局插画等
 *
 * 游戏工程内部一律用 ASCII 文件名，避免 Web 端 URL 编码问题。
 *
 * 用法：node 工具/接入开场素材.mjs
 */
import { copyFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { 读取PNG, 写入PNG, 缩放到, 去毛边, 量化, 抠品红 } from './图像库.mjs';

const 根 = resolve(process.cwd());
const 成品 = (...p) => join(根, '美术/素材库/成品', ...p);
const 游戏 = (...p) => join(根, 'liukanshan-career/public/assets', ...p);

let 成功 = 0;
const 缺失 = [];
const 已切 = [];

/* ───────── 一、切头像 ───────── */

/** 每个 NPC 四表情格的语义名（顺序与提示词里 ①②③④ 一致） */
const 表情名表 = {
  林总: ['平静', '审视', '不悦', '满意'],
  周岚: ['平静', '认真', '担心', '欣慰'],
  阿麦: ['开心', '大笑', '好奇', '委屈'],
  韩策: ['面无表情', '专注', '疑惑', '认可'],
  小鹿: ['雀跃', '惊叹', '好奇', '害羞'],
  程女士: ['礼貌', '追问', '不悦', '认可'],
};

const 头像出目录 = 成品('表情');
mkdirSync(头像出目录, { recursive: true });

/** 把一张 2×2 的四表情表切成 4 张方形头像 */
function 切四表情(角色, 源路径, 目标边长) {
  const img = 抠品红(读取PNG(源路径));
  const 格W = Math.floor(img.width / 2);
  const 格H = Math.floor(img.height / 2);
  const 名们 = 表情名表[角色] ?? ['1', '2', '3', '4'];
  const 产出 = [];
  // 全组统一比例：四格的包围盒可能不同大，必须用一个系数，否则头像会一大一小
  const 盒们 = [];
  for (let i = 0; i < 4; i += 1) {
    const cx = i % 2;
    const cy = Math.floor(i / 2);
    let 最小X = 1e9, 最小Y = 1e9, 最大X = -1, 最大Y = -1;
    for (let y = 0; y < 格H; y += 1) {
      for (let x = 0; x < 格W; x += 1) {
        const sx = cx * 格W + x;
        const sy = cy * 格H + y;
        const k = (sy * img.width + sx) * 3;
        const a = img.alpha ? img.alpha[sy * img.width + sx] : 255;
        if (a < 128) continue;
        const r = img.rgb[k], g = img.rgb[k + 1], b = img.rgb[k + 2];
        // 品红当背景剔掉
        if (r > 200 && g < 90 && b > 200) continue;
        if (sx < 最小X) 最小X = sx;
        if (sx > 最大X) 最大X = sx;
        if (sy < 最小Y) 最小Y = sy;
        if (sy > 最大Y) 最大Y = sy;
      }
    }
    if (最大X < 0) { 盒们.push(null); continue; }
    盒们.push({ 最小X, 最小Y, 宽: 最大X - 最小X + 1, 高: 最大Y - 最小Y + 1 });
  }
  const 最大高 = Math.max(...盒们.filter(Boolean).map((b) => b.高));
  const 系数 = 目标边长 / 最大高;
  for (let i = 0; i < 4; i += 1) {
    const b = 盒们[i];
    if (!b) continue;
    const rgb = new Uint8Array(b.宽 * b.高 * 3);
    const alpha = new Uint8Array(b.宽 * b.高);
    for (let y = 0; y < b.高; y += 1) {
      for (let x = 0; x < b.宽; x += 1) {
        const si = ((b.最小Y + y) * img.width + (b.最小X + x)) * 3;
        const di = (y * b.宽 + x) * 3;
        rgb[di] = img.rgb[si];
        rgb[di + 1] = img.rgb[si + 1];
        rgb[di + 2] = img.rgb[si + 2];
        alpha[y * b.宽 + x] = img.alpha ? img.alpha[(b.最小Y + y) * img.width + (b.最小X + x)] : 255;
      }
    }
    const 缩 = 缩放到({ width: b.宽, height: b.高, rgb, alpha }, Math.max(1, Math.round(b.宽 * 系数)), 目标边长);
    // 摆到正方形画布上，水平居中、贴底
    const 画布 = new Uint8Array(目标边长 * 目标边长 * 3);
    const 画布A = new Uint8Array(目标边长 * 目标边长);
    const 左 = Math.floor((目标边长 - 缩.width) / 2);
    for (let y = 0; y < 缩.height && y < 目标边长; y += 1) {
      for (let x = 0; x < 缩.width; x += 1) {
        const dx = 左 + x;
        if (dx < 0 || dx >= 目标边长) continue;
        if (缩.alpha && 缩.alpha[y * 缩.width + x] < 128) continue;
        const si = (y * 缩.width + x) * 3;
        const di = (y * 目标边长 + dx) * 3;
        画布[di] = 缩.rgb[si];
        画布[di + 1] = 缩.rgb[si + 1];
        画布[di + 2] = 缩.rgb[si + 2];
        画布A[y * 目标边长 + dx] = 255;
      }
    }
    let 净 = 去毛边({ width: 目标边长, height: 目标边长, rgb: 画布, alpha: 画布A });
    净 = 量化(净);
    const 文件 = join(头像出目录, `${角色}_${名们[i]}.png`);
    写入PNG(文件, 净);
    产出.push(文件);
  }
  return 产出;
}

const 头像边长 = 64;
console.log('=== 一、切 NPC 四表情 → 头像 ===');
for (const 角色 of Object.keys(表情名表)) {
  const 源 = 成品('角色动画', `角色_${角色}_四表情_32x32.png`);
  if (!existsSync(源)) {
    缺失.push(`角色动画/角色_${角色}_四表情_32x32.png`);
    continue;
  }
  const 产出 = 切四表情(角色, 源, 头像边长);
  已切.push(...产出);
  console.log(`  ${角色}：${产出.length} 张 → ${产出.map((p) => p.split(/[\\/]/).pop()).join(' ')}`);
}

/* ───────── 二、拷贝素材 ───────── */

const 映射 = [
  // 开场动画与 AVG 的场景插图
  ['背景/章节封面_横版.png', 'avg/bg_chapter.png'],
  ['背景/出租屋_横版.png', 'avg/bg_room.png'],
  ['背景/招聘会_横版.png', 'avg/bg_jobfair.png'],
  ['背景/办公室工位.png', 'avg/bg_office.png'],

  // 头像框
  ['界面v2/头像框_方形.png', 'avg/frame_square.png'],
  ['界面v2/头像框_方形粗边.png', 'avg/frame_square_bold.png'],
  ['界面v2/头像框_圆形.png', 'avg/frame_round.png'],
  ['界面v2/头像框_圆形粗边.png', 'avg/frame_round_bold.png'],

  // 气泡（九宫格）与聊天件
  ['界面v2/界面_气泡_对方.png', 'avg/bubble_other.png'],
  ['界面v2/界面_气泡_我方.png', 'avg/bubble_me.png'],
  ['界面v2/界面_气泡_群聊.png', 'avg/bubble_group.png'],
  ['界面v2/界面_底_聊天区.png', 'avg/chat_bg.png'],
  ['界面v2/列表项_普通.png', 'avg/choice_idle.png'],
  ['界面v2/列表项_选中.png', 'avg/choice_hover.png'],
  ['界面v2/界面_底_功能栏.png', 'avg/rail_bg.png'],

  // 转场与结局
  ['特效/沙漏_10帧_640x64.png', 'avg/hourglass.png'],
  ['结局/结局_转正_512x288.png', 'avg/ending_good.png'],
  ['结局/结局_跳级升职_512x288.png', 'avg/ending_best.png'],
  ['结局/结局_结束实习_512x288.png', 'avg/ending_bad.png'],
];

// 贴纸 12 枚
for (const 名 of ['探头', '点赞', '大哭', '震惊', '合十', '递咖啡', '抱头', '举手', '晕', '比心', '累了', '鞠躬']) {
  映射.push([`界面v2/贴纸_${名}.png`, `avg/sticker_${名}.png`]);
}

// 刘看山 6 表情 + 学长 4 表情（老素材，96×96）
const 老表情 = {
  刘看山: ['平静', '开心', '疑惑', '尴尬', '疲惫', '震惊'],
  学长: ['01', '02', '03', '04'],
};
// 老表情直接拷，但统一缩到 64
for (const [角色, 名们] of Object.entries(老表情)) {
  for (const 名 of 名们) {
    const 源 = 成品('角色', `${角色}_表情${角色 === '刘看山' ? '6个' : '4个'}`, `${名}.png`);
    if (!existsSync(源)) { 缺失.push(`角色/${角色}_表情.../${名}.png`); continue; }
    const img = 读取PNG(源);
    const 缩 = 缩放到(img, 头像边长, 头像边长);
    let 净 = 去毛边(缩);
    净 = 量化(净);
    const 目标 = 游戏(`avg/face_${角色 === '刘看山' ? 'lks' : 'senior'}_${名}.png`);
    mkdirSync(dirname(目标), { recursive: true });
    写入PNG(目标, 净);
    成功 += 1;
  }
}

console.log('\n=== 二、拷贝素材 ===');
for (const [源, 目标] of 映射) {
  const 源路径 = 成品(源);
  if (!existsSync(源路径)) { 缺失.push(源); continue; }
  const 目标路径 = 游戏(目标);
  mkdirSync(dirname(目标路径), { recursive: true });
  copyFileSync(源路径, 目标路径);
  成功 += 1;
}

// NPC 头像一并拷进游戏
for (const p of 已切) {
  const 名 = p.split(/[\\/]/).pop();
  const 目标 = 游戏('avg', `face_${名.replace(/_.*$/, '')}_${名.replace(/^.*_/, '')}`);
  mkdirSync(dirname(目标), { recursive: true });
  copyFileSync(p, 目标);
  成功 += 1;
}

console.log(`\n已接入 ${成功} 个文件 → liukanshan-career/public/assets/avg/`);
if (缺失.length) {
  console.log(`⚠️ 缺失 ${缺失.length} 个：`);
  缺失.forEach((m) => console.log(`   ${m}`));
}
const 目录 = 游戏('avg');
if (existsSync(目录)) {
  const 文件 = readdirSync(目录);
  console.log(`\navg/ 共 ${文件.length} 个文件`);
}

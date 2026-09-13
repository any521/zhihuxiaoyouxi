/**
 * 接入地图素材（零依赖）
 *
 * 地图模式需要的三类素材：
 *   一、瓦片 6 种（地面 3 + 墙面 2 + 台面 1）—— Phaser 里会拼成一张 tileset
 *   二、道具 40+ 件（工位区 / 茶水间 / 会议室 / 办公设备 / 桌面小物）
 *   三、角色动画精灵表（刘看山 行走16帧 / 待机8帧 / 动作8帧 + 6 个 NPC 朝向）
 *
 * 游戏工程内部一律 ASCII 文件名。精灵表**不切**，直接按 frameWidth/frameHeight
 * 当 spritesheet 加载（Phaser 自己会切格）。
 *
 * 用法：node 工具/接入地图素材.mjs
 */
import { copyFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';

const 根 = resolve(process.cwd());
const 成品 = (...p) => join(根, '美术/素材库/成品', ...p);
const 游戏 = (...p) => join(根, 'liukanshan-career/public/assets', ...p);

const 映射 = [];

/* ── 一、瓦片 ── */
const 瓦片 = [
  ['瓦片v2/瓦片_地面_办公地毯.png', 'map/tile_carpet.png'],
  ['瓦片v2/瓦片_地面_走廊地砖.png', 'map/tile_tile.png'],
  ['瓦片v2/瓦片_地面_木地板.png', 'map/tile_wood.png'],
  ['瓦片v2/瓦片_墙面_办公白墙.png', 'map/tile_wall.png'],
  ['瓦片v2/瓦片_墙面_玻璃隔断.png', 'map/tile_glass.png'],
  ['瓦片v2/瓦片_台面_木质桌面.png', 'map/tile_desk.png'],
];
映射.push(...瓦片);

/* ── 二、道具：目录名 → 输出前缀 ── */
const 道具组 = [
  ['工位区', 'ws'],
  ['茶水间', 'pantry'],
  ['会议室', 'meeting'],
  ['办公设备', 'dev'],
  ['桌面', 'desk'],
];
for (const [目录, 前缀] of 道具组) {
  const 目录路径 = 成品('道具', 目录);
  if (!existsSync(目录路径)) continue;
  for (const f of readdirSync(目录路径).filter((x) => x.endsWith('.png') && !x.startsWith('_'))) {
    const 名 = f.replace(/\.png$/, '').replace(/^[^_]+_/, '');
    映射.push([`道具/${目录}/${f}`, `map/prop_${前缀}_${名}.png`]);
  }
}

/* ── 三、角色动画精灵表（不切，整张拷） ── */
const 角色表 = [
  ['角色_刘看山_四方向行走16帧_32x48.png', 'map/chr_lks_walk.png'],
  ['角色_刘看山_待机8帧_32x48.png', 'map/chr_lks_idle.png'],
  ['角色_刘看山_动作8帧_32x48.png', 'map/chr_lks_act.png'],
  ['角色_林总_朝向6帧_32x48.png', 'map/npc_boss.png'],
  ['角色_周岚_朝向6帧_32x48.png', 'map/npc_zhou.png'],
  ['角色_阿麦_朝向6帧_32x48.png', 'map/npc_mai.png'],
  ['角色_韩策_朝向6帧_32x48.png', 'map/npc_han.png'],
  ['角色_小鹿_朝向6帧_32x48.png', 'map/npc_lu.png'],
  ['角色_程女士_朝向6帧_32x48.png', 'map/npc_cheng.png'],
];
for (const [源, 目标] of 角色表) {
  映射.push([`角色动画/${源}`, 目标]);
}

let 成功 = 0;
const 缺失 = [];
for (const [源, 目标] of 映射) {
  const 源路径 = 成品(源);
  if (!existsSync(源路径)) {
    缺失.push(源);
    continue;
  }
  const 目标路径 = 游戏(目标);
  mkdirSync(dirname(目标路径), { recursive: true });
  copyFileSync(源路径, 目标路径);
  成功 += 1;
}

console.log('=== 接入地图素材 ===');
console.log(`已拷贝 ${成功} 个文件 → public/assets/map/`);
if (缺失.length) {
  console.log(`⚠️ 缺失 ${缺失.length} 个：`);
  缺失.forEach((m) => console.log(`   ${m}`));
}
const 目录 = 游戏('map');
if (existsSync(目录)) {
  const 文件 = readdirSync(目录);
  console.log(`\nmap/ 共 ${文件.length} 个文件`);
  console.log('  瓦片：' + 文件.filter((f) => f.startsWith('tile_')).join(' '));
  console.log('  角色：' + 文件.filter((f) => f.startsWith('chr_') || f.startsWith('npc_')).join(' '));
  console.log(`  道具：${文件.filter((f) => f.startsWith('prop_')).length} 件`);
}

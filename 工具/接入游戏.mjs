/**
 * 把 美术/素材库/成品 里 demo 需要的素材拷进游戏工程 public/assets/，
 * 并改成 ASCII 文件名（游戏工程内部一律 ASCII，避免 Web 端 URL 编码问题）。
 *
 * 用法：node 工具/接入游戏.mjs
 */
import { copyFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';

const 根 = resolve(process.cwd());
const 成品 = (...p) => join(根, '美术/素材库/成品', ...p);
const 游戏素材 = (...p) => join(根, 'liukanshan-career/public/assets', ...p);

// [成品相对路径, 游戏内相对路径]
const 映射 = [
  // 背景（章节封面/对话背景用；关卡内不再拿它当底板）
  ['背景/招聘会_横版.png', 'bg/jobfair_land.png'],
  ['背景/招聘会_竖版.png', 'bg/jobfair_port.png'],

  // 瓦片：关卡地面与墙体（无缝，可平铺）
  ['瓦片v2/瓦片_地面_办公地毯.png', 'tile/floor_carpet.png'],
  ['瓦片v2/瓦片_地面_木地板.png', 'tile/floor_wood.png'],
  ['瓦片v2/瓦片_墙面_办公白墙.png', 'tile/wall_plain.png'],
  ['瓦片v2/瓦片_墙面_玻璃隔断.png', 'tile/wall_glass.png'],

  // 主角：四视图 + 行走 4 帧
  ['角色/刘看山_三视图/正面.png', 'chr/lks_front.png'],
  ['角色/刘看山_三视图/侧面.png', 'chr/lks_side.png'],
  ['角色/刘看山_三视图/背面.png', 'chr/lks_back.png'],
  ['角色/刘看山_行走4帧/01.png', 'chr/lks_walk_1.png'],
  ['角色/刘看山_行走4帧/02.png', 'chr/lks_walk_2.png'],
  ['角色/刘看山_行走4帧/03.png', 'chr/lks_walk_3.png'],
  ['角色/刘看山_行走4帧/04.png', 'chr/lks_walk_4.png'],

  // 学长（AI 队友）
  ['角色/学长_三视图/正面.png', 'chr/senior_front.png'],
  ['角色/学长_三视图/侧面.png', 'chr/senior_side.png'],
  ['角色/学长_三视图/背面.png', 'chr/senior_back.png'],

  // 背景群像：就是低饱和的刘看山，用来当招聘会里的路人（保证"全员同族"）
  ['角色/背景群像_3人/01.png', 'chr/crowd_1.png'],
  ['角色/背景群像_3人/02.png', 'chr/crowd_2.png'],
  ['角色/背景群像_3人/03.png', 'chr/crowd_3.png'],
  ['角色/背景群像_3人/04.png', 'chr/crowd_4.png'],
  ['角色/背景群像_3人/05.png', 'chr/crowd_5.png'],
  ['角色/背景群像_3人/06.png', 'chr/crowd_6.png'],

  // 工位道具
  ['道具/办公设备/资料架.png', 'prop/shelf.png'],
  ['道具/办公设备/投递箱.png', 'prop/bin.png'],
  ['道具/办公设备/打印机.png', 'prop/printer.png'],
  ['道具/展位/折叠展位桌.png', 'prop/desk.png'],
  ['道具/展位/易拉宝.png', 'prop/banner.png'],
  ['道具/小物/简章.png', 'prop/flyer.png'],
  ['道具/小物/简历.png', 'prop/resume.png'],
  ['道具/小物/绿萝.png', 'prop/plant.png'],
  ['道具/小物/纸箱.png', 'prop/box.png'],
  ['道具/小物/马克杯.png', 'prop/mug.png'],

  // 界面
  ['界面/知乎入口/默认.png', 'ui/zhihu_idle.png'],
  ['界面/知乎入口/有内容.png', 'ui/zhihu_ready.png'],
  ['界面/评级徽章/S.png', 'ui/rank_s.png'],
  ['界面/评级徽章/A.png', 'ui/rank_a.png'],
  ['界面/评级徽章/B.png', 'ui/rank_b.png'],
  ['界面/评级徽章/C.png', 'ui/rank_c.png'],
  ['界面/图标/小票.png', 'ui/icon_ticket.png'],
  ['界面/图标/时钟.png', 'ui/icon_clock.png'],
  ['界面/图标/印章.png', 'ui/icon_stamp.png'],
  ['界面/图标/星星.png', 'ui/icon_star.png'],
  ['界面/图标/对勾.png', 'ui/icon_check.png'],
  ['界面/图标/绿植.png', 'ui/icon_plant.png'],
  ['界面/图标/咖啡.png', 'ui/icon_coffee.png'],
];

let 成功 = 0;
const 缺失 = [];
for (const [源, 目标] of 映射) {
  const 源路径 = 成品(源);
  if (!existsSync(源路径)) {
    缺失.push(源);
    continue;
  }
  const 目标路径 = 游戏素材(目标);
  mkdirSync(dirname(目标路径), { recursive: true });
  copyFileSync(源路径, 目标路径);
  成功 += 1;
}

console.log('=== 素材接入游戏工程 ===');
console.log(`已拷贝 ${成功} 个文件 → liukanshan-career/public/assets/`);
if (缺失.length > 0) {
  console.log(`⚠️  缺失 ${缺失.length} 个：`);
  缺失.forEach((m) => console.log(`   ${m}`));
}
console.log('\n目录：');
for (const 子 of ['bg', 'chr', 'prop', 'ui']) {
  const 目录 = 游戏素材(子);
  if (existsSync(目录)) {
    const { readdirSync } = await import('node:fs');
    console.log(`  ${子}/  ${readdirSync(目录).join(' ')}`);
  }
}

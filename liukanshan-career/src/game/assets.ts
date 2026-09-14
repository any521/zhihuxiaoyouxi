/**
 * 关卡（**工作关**）用到的素材 key ↔ 路径。
 *
 * ⚠️ 2026-09 改版：这一关原来是"招聘会 · 投简历"，用的是 `assets/chr` + `assets/prop`
 *    那一套老 demo 素材。用户要求「**小游戏画面和操作方式都要改为和现在主题一样**」。
 *    所以这里**改成直接用地图那一套**（`assets/map/`）：
 *
 *      · 瓦片    → 地图同一批 `tile_*.png`（编号也和 `map/level.ts` 的 瓦片 一致）
 *      · 主角    → 地图同一张 `chr_lks_walk.png`（四方向 4×4 帧）
 *      · 同事    → 地图同一批 `npc_*.png`
 *      · 家具    → 地图同一批 `prop_*.png`（办公桌/转椅/打印机/资料架/投递箱…）
 *
 *    于是"在办公室地图上走"和"在关卡里干活"看起来是**同一个公司、同一套像素**，
 *    而不是两个画风不同的 demo 拼在一起。
 *
 * ⚠️ 手里拿的那两件纸（任务单 / 稿子）暂时复用老 demo 的 `prop/flyer.png`、
 *    `prop/resume.png` —— 它们和地图素材出自同一条 32 色流水线，观感是一致的。
 *    地图里目前**没有**"一张纸"这类道具，要彻底换掉得先出一张（见 设计/剧本-新剧情参考.md 的素材待办）。
 */

const 路径 = (相对: string): string => new URL(`assets/${相对}`, document.baseURI).href;

/**
 * 关卡瓦片的**顺序**。
 * ⚠️ 必须和 `map/level.ts` 的 `瓦片` 枚举逐条对应（0 浅灰地毯 / 4 走廊地砖 / 6 白墙 / 7 玻璃 / 16 桌面…），
 *    因为 `greybox/level.ts` 的网格数据里写的就是那些编号。
 */
export const 瓦片顺序 = [
  'tile_carpet_grey', // 0 浅灰地毯（开放办公区）
  'tile_carpet_dark', // 1 深灰地毯（总监办公室）
  'tile_antislip', // 2 防滑砖（茶水间/文印区）
  'tile_polished', // 3 抛光砖（前台）
  'tile_tile', // 4 走廊地砖
  'tile_wood', // 5 木地板（会议室）
  'tile_wall', // 6 白墙
  'tile_glass', // 7 玻璃隔断
  'tile_door_h_l', // 8
  'tile_door_h_r', // 9
  'tile_door_v_u', // 10
  'tile_door_v_d', // 11
  'tile_door_h_l_c', // 12
  'tile_door_h_r_c', // 13
  'tile_door_v_u_c', // 14
  'tile_door_v_d_c', // 15
  'tile_desk', // 16 桌面
] as const;

export const 图 = {
  /** 拼好的瓦片集（运行时用 canvas 拼） */
  瓦片集: '关卡瓦片集',

  /* ── 角色（地图同一套精灵表） ── */
  主角_走: 'lks_walk', // 4 行 × 4 帧：下 / 上 / 左 / 右
  主角_待机: 'lks_idle',
  /* 帮手不再写死一个人：按工单的客户选"相关同事"（见 OfficeScene.选帮手），
     用的是 同事立绘 里那一批 npc_* 立绘 */

  /* ── 工位（地图同一批家具） ── */
  文件柜: 'prop_ws_文件柜',
  资料架: 'prop_dev_资料架',
  工位桌: 'prop_ws_办公桌',
  打印机: 'prop_dev_打印机',
  交稿箱: 'prop_dev_投递箱',

  /* ── 装饰（都是地图上真实存在的家具） ── */
  绿植: 'prop_ws_绿植',
  饮水机: 'prop_ws_饮水机',
  垃圾桶: 'prop_ws_垃圾桶',
  白板: 'prop_meeting_白板',
  咖啡机: 'prop_pantry_咖啡机',
  键盘: 'prop_desk_键盘',
  名牌: 'prop_desk_名牌',

  /* ── 手里拿的两件纸（2026-09 换成真素材，不再借老 demo 的 flyer/resume） ── */
  任务单: 'prop_desk_任务单_空白',
  稿子: 'prop_desk_任务单_写过',
} as const;

/**
 * **工序图标**：每做完一道工序，就在手里那份稿子上盖一枚（胡闹厨房式）。
 *
 * ⚠️ 这三枚有两条来源，**优先用真素材**：
 *   一、`美术/素材库/成品/界面/图标/界面_图标_工序_*.png` → 接进 `public/assets/map/`（真素材）
 *   二、素材没出图 / 加载失败 → `OfficeScene.制作工序图标()` **现画一枚**顶上（放大镜 / 稿纸 / 对勾）
 *    两条路用的是**同一个 key**，所以换素材不用改任何调用点。
 */
export const 工序图标: Record<string, string> = {
  查资料: 'ic_工序_查资料',
  写稿: 'ic_工序_写稿',
  校对: 'ic_工序_校对',
};

/** 需要按**普通图片**加载的素材 */
export const 图片清单: Array<[string, string]> = [
  ...瓦片顺序.map((名, i) => [`w${i}`, 路径(`map/${名}.png`)] as [string, string]),
  [图.文件柜, 路径('map/prop_ws_文件柜.png')],
  [图.资料架, 路径('map/prop_dev_资料架.png')],
  [图.工位桌, 路径('map/prop_ws_办公桌.png')],
  [图.打印机, 路径('map/prop_dev_打印机.png')],
  [图.交稿箱, 路径('map/prop_dev_投递箱.png')],
  [图.绿植, 路径('map/prop_ws_绿植.png')],
  [图.饮水机, 路径('map/prop_ws_饮水机.png')],
  [图.垃圾桶, 路径('map/prop_ws_垃圾桶.png')],
  [图.白板, 路径('map/prop_meeting_白板.png')],
  [图.咖啡机, 路径('map/prop_pantry_咖啡机.png')],
  [图.键盘, 路径('map/prop_desk_键盘.png')],
  [图.名牌, 路径('map/prop_desk_名牌.png')],
  [图.任务单, 路径('map/prop_desk_任务单_空白.png')],
  [图.稿子, 路径('map/prop_desk_任务单_写过.png')],
  // 工序图标（真素材；加载不到时 OfficeScene 会现画一枚顶上）
  [工序图标.查资料, 路径('map/ic_工序_查资料.png')],
  [工序图标.写稿, 路径('map/ic_工序_写稿.png')],
  [工序图标.校对, 路径('map/ic_工序_校对.png')],
];

/**
 * 需要按**精灵表**加载的素材。
 * 主角那张是地图的原件（128×192 = 4 列 × 4 行，每格 32×48）；
 * 同事那张是 96×96 = 3×2，地图用 `NPC朝向帧` 挑帧，这里同样处理。
 */
export const 精灵表清单: Array<[string, string]> = [
  [图.主角_走, 路径('map/chr_lks_walk.png')],
  [图.主角_待机, 路径('map/chr_lks_idle.png')],
];

/**
 * 同事的**四方向行走图**（和主角那张同一格式：128×192 = 4 列 × 4 行，行序 下/上/左/右）。
 *
 * ⚠️ 和 `同事立绘`（`npc_*.png`，只有 6 个姿势格）**不是一回事**：
 *    · `同事立绘` 给**地图上站着不动的同事**用（`npc_<名>.png`）
 *    · 这一份给**关卡里真的在走路的帮手**用（走真动画）
 *   有就用动画，没有就自动退回"朝向帧 + 1px 浮动"（见 `OfficeScene.走向`）。
 *
 * 素材来源：`美术/提示词-12-一键复制-关卡升级.md` 组 1 → `工具/处理角色动画.mjs`
 *          → `工具/修行走表.mjs`（把第 4 行做成第 3 行的镜像）→ `工具/接入地图素材.mjs`
 */
export const 同事行走图: Record<string, string> = {
  阿麦: 'chr_mai_walk',
  小鹿: 'chr_lu_walk',
  韩策: 'chr_han_walk',
  周岚: 'chr_zhou_walk',
};

/** 行走图的加载清单（4×4 帧，每格 32×48） */
export const 同事行走清单: Array<[string, string]> = Object.entries(同事行走图).map(([, key]) => [
  key,
  路径(`map/${key}.png`),
]);

/** 地图那几个同事的立绘（关卡里的"背景同事"，都用同一张表的第 0 帧） */
export const 同事立绘: Record<string, string> = {
  阿麦: 'npc_mai',
  小鹿: 'npc_lu',
  韩策: 'npc_han',
  周岚: 'npc_zhou',
  林总: 'npc_boss',
  程女士: 'npc_cheng',
};

export const 同事清单: Array<[string, string]> = Object.values(同事立绘).map((k) => [
  k,
  路径(`map/${k}.png`),
]);

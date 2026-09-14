/**
 * 工作关的关卡布局（**按窗口算出来的**，不是写死的两张图）。
 *
 * ⚠️ 全屏 + 整数倍像素完美 ⇒ **内部格数会随窗口变**（PC 约 15×7，手机约 12×21），
 *    所以布局是**按格数造**的，不是手写死的。
 *
 * ⚠️ 2026-09 用户要求「小游戏的地图做得**复杂一点**来增加趣味性」——
 *    原来就是一个空矩形（中间一条走廊 + 一排工位），走位没有任何选择。
 *    现在加了四层结构（**都保证不会把任何地方堵死**）：
 *
 *      ① 工位区**隔断**：相邻工位之间立一列玻璃（只到行 2）→ 每个工位像个小隔间，
 *         第 3 行整条通，所以只影响观感与"贴着隔间走"的手感
 *      ② **中央玻璃小间**：走廊下方一个玻璃围起来的房间，**顶边留一个口** → 可以进去（里面放咖啡机）
 *      ③ **左下储物间**：玻璃围的 3×2 小房间，**右边留一个口** → 一个值得绕过去的死角（放纸箱）
 *      ④ 走廊 + 两侧装饰列，地面分三种材质
 *
 *    ⚠️ 为什么这些结构**不可能**把地图堵死：
 *      ②③ 都是**封闭房间 + 一个口**，房间本身不在主通道上（左右/上下都有路绕）；
 *      ① 只占行 1-2，而行 3 及以上完全开放。
 *      即便如此，`tools/事件四验收.mjs` 里仍然用 **BFS 从出生点走一遍**验证
 *      "5 个工位 + 交稿箱全都到得了"——**加结构一定要配这条断言**。
 *
 * ⚠️ 瓦片编号**跟 `map/level.ts` 的 `瓦片` 完全一致**（0 浅灰地毯 / 4 走廊地砖 /
 *    5 木地板 / 6 白墙 / 7 玻璃 / 16 桌面）。`game/assets.ts` 的 `瓦片顺序` 就是按这张表加载的 ——
 *    三处（地图枚举 / 关卡网格 / 素材顺序）必须一一对应，改一处要三处一起改。
 */
import { TILE } from '../viewport';
import type { 工序 } from '../../state/orders';

export { TILE };

/** 瓦片编号（和 `map/level.ts` 对齐，只用到这几个） */
export const 关卡瓦片 = {
  地毯: 0,
  走廊: 4,
  木地板: 5,
  白墙: 6,
  玻璃: 7,
  桌面: 16,
} as const;

/**
 * 挡路的瓦片：白墙 + 玻璃。**桌面（16）不挡路**（和地图一致）。
 * ⚠️ 显式标 `number[]`：不标会被推断成字面量联合类型，`includes(变量)` 会报错
 *    （地图的 `挡路瓦片` 是同一个坑）。
 */
export const COLLIDING_TILES: number[] = [关卡瓦片.白墙, 关卡瓦片.玻璃];

export type StationKind = 'files' | 'library' | 'desk' | 'print' | 'bin';

/**
 * 这道工序**怎么推进**（用户要求：「盖章等改为**按 E 键**增加进度，不是时间；
 * 只有**打印**是时间自动倒计时，而且比较慢，8 秒才能完成一个」）。
 *
 *   `'连按'` —— 站在工位上**狂按 E**，每按一下加一截（查资料 / 写稿）
 *   `'等待'` —— 放手让它自己走，**8 秒**才好（打印机）
 */
export type 工序机制 = '连按' | '等待';

export interface StationDef {
  kind: StationKind;
  col: number;
  row: number;
  label: string;
  /** 这一台做什么（取料 / 交付留空） */
  工序?: 工序;
  /** 怎么推进（取料 / 交付留空） */
  机制?: 工序机制;
}

export type 装饰图 = '绿植' | '饮水机' | '垃圾桶' | '白板' | '咖啡机';

/**
 * **装饰的"贴地占地"**（碰撞用）。
 *
 * ⚠️⚠️ 原来装饰一律**不挡路**（`buildDecor` 只 `add.image`，一个物理体都没有）——
 *    用户报的「小游戏里咖啡机也要物理碰撞」就是这个：人能从咖啡机里**穿过去**。
 *
 * ⚠️ 只给**实体家具**登记：咖啡机 / 饮水机 / 垃圾桶。
 *    绿植、白板**不登记**（它们贴着墙根，挡了反而更容易把过道挤窄）。
 * ⚠️ 尺寸是"贴地那一小块"（不是整张立绘），和地图那张 `占地表` 同一个口径。
 * ⚠️ 原点是 (0.5, 1)，所以贴图底部对齐 occupанcy 的底边（见 OfficeScene 的用法）。
 */
export const 装饰占地: Partial<Record<装饰图, [number, number]>> = {
  咖啡机: [20, 12],
  饮水机: [18, 12],
  垃圾桶: [18, 14],
  // ⚠️ 用户要求「**为道具都加上物理碰撞，不要穿模**」→ 绿植和白板也补上 ✔
  绿植: [16, 14],
  白板: [34, 12],
};

export interface DecoDef {
  texture: 装饰图;
  col: number;
  row: number;
  dx?: number;
  dy?: number;
}

export interface 关卡数据 {
  cols: number;
  rows: number;
  rows_: number[][];
  stations: StationDef[];
  decos: DecoDef[];
  player: { col: number; row: number };
  npc: { col: number; row: number };
}

/* ───────── 玩法参数 ───────── */

/**
 * 一版稿子的交付时限（秒）。
 * ⚠️ 2026-09 从 180 提到 **240**：地图变复杂（15×7 → 22×11）走位变长，
 *    而且打印机改成 8 秒一台，时间不够就变成"跑不赢"而不是"玩不赢"。
 */
export const TIME_LIMIT = 240;
/** 要交出几版才算 S */
export const QUOTA = 8;
/** 连按型工位要按几下才算做完 */
export const 连按几下 = 4;
/** 等待型工位（打印机）一台要多久（秒）—— 用户指定 8 秒，而且"比较慢" */
export const 打印秒数 = 8;
/**
 * 帮手做同一道工序要多久（秒）。
 *
 * ⚠️ 用户要求「AI 帮手自己干活来完善这个任务，**但是很慢，大部分还是要玩家来完成**」。
 *    所以这个数明显大于 `PROCESS_TIME`：他做一道 = 玩家做两道多。
 *    另外他的**走路**也比玩家慢（`NPC_SPEED` < `PLAYER_SPEED`）。
 */
export const NPC_PROCESS_TIME = 2.4;
/** 帮手两次干活之间的"摸鱼"时长（秒）—— 他不会一直不停手 */
export const NPC_IDLE_RANGE: [number, number] = [4, 9];
/** 同时挂出的工单数量（像胡闹厨房的订单条） */
export const ORDER_SLOTS = 3;
/** 地面上最多同时躺几件东西 */
export const GROUND_LIMIT = 5;

export const INTERACT_RADIUS = 40;
export const PLAYER_SPEED = 96;
export const NPC_SPEED = 68;

/** 关卡最少要有多少格（不够就放大整数倍缩小时用，见 `screens/关卡.tsx` 的算尺寸） */
export const 最少格 = { cols: 11, rows: 7 };

/* ───────── 造关卡 ───────── */

const W = 关卡瓦片.白墙;
const C = 关卡瓦片.地毯;
const H = 关卡瓦片.走廊;
const D = 关卡瓦片.桌面;
const G = 关卡瓦片.玻璃;

/** 这一格能不能走（在界内 + 不是墙/玻璃）。给寻路、体检、生成器自己共用 */
export function 能走(关: 关卡数据, col: number, row: number): boolean {
  const 值 = 关.rows_[row]?.[col];
  return 值 !== undefined && !COLLIDING_TILES.includes(值);
}

/**
 * 按格数造一关。**纯函数**（给定 cols/rows 结果唯一）—— 测试能直接断言它，不用起浏览器。
 */
export function 造关卡(cols: number, rows: number): 关卡数据 {
  const 宽 = Math.max(最少格.cols, Math.floor(cols));
  const 高 = Math.max(最少格.rows, Math.floor(rows));

  /* ① 外圈墙 + 里面全铺地毯 */
  const 网格: number[][] = [];
  for (let y = 0; y < 高; y += 1) {
    const 行: number[] = [];
    for (let x = 0; x < 宽; x += 1) 行.push(y === 0 || y === 高 - 1 || x === 0 || x === 宽 - 1 ? W : C);
    网格.push(行);
  }

  const 左 = 2;
  const 右 = 宽 - 3;
  /**
   * 资料库想放的那一列（工位区左下）。
   * ⚠️ 后面立"带门竖隔断""办公桌岛"时要**避开这一列**，不然会和资料库叠上。
   */
  const 资料库列 = Math.min(宽 - 5, Math.max(3, Math.round(宽 * 0.3)));

  /* ③ 中间那条横向走廊（2 行地砖，纯观感 + 把地图分成上下两半）
        ⚠️ 竖向预算要**先算好**，不然结构会互相压：外墙上(1) + 工位行(1) + 工位通道(2)
           + 走廊(2) + 中央小间(2) + 储物间(2) + 外墙下(1) = 11 行 —— 所以 11 行是"结构齐全"的下限。 */
  const 廊起 = Math.max(3, 高 - 7);
  for (let y = 廊起; y <= 廊起 + 1 && y <= 高 - 2; y += 1) {
    for (let x = 2; x <= 宽 - 3; x += 1) 网格[y][x] = H;
  }

  /* ③b 高图（比如手机竖版 12×21）上半区太空 → 加一堵**带门的竖隔断**，
         让工位区也要绕一下。矮图（11 行）上面只剩 1 行，自动不生成。 */
  const 上起 = 3;
  const 上止 = 廊起 - 1;
  if (上止 - 上起 >= 2) {
    // 竖隔断要避开资料库那一列（资料库就在工位区最下面一行，会撞上）
    let 竖 = Math.min(宽 - 4, Math.max(3, Math.round(宽 * 0.35)));
    if (Math.abs(竖 - 资料库列) <= 1) 竖 = 资料库列 + 2;
    if (竖 >= 3 && 竖 <= 宽 - 4 && Math.abs(竖 - 资料库列) > 1) {
      for (let y = 上起; y <= 上止; y += 1) 网格[y][竖] = G;
      const 门 = Math.floor((上起 + 上止) / 2);
      网格[门][竖] = C; // ⚠️ 一定要留门，不然上半区会被切成两半
      if (门 + 1 <= 上止) 网格[门 + 1][竖] = C;
    }
  }

  /* ③c 上半区够高的话（手机竖版 21 行）再摆一个**办公桌岛**：
         3×2 的玻璃块，孤零零落在中场 —— 从工位区下到走廊必须绕它。
         矮图自动不生成（横版 11 行时上区只有 0 行）。 */
  if (上止 - 上起 >= 5) {
    const 岛中 = Math.round(宽 * 0.55);
    const 岛列 = [岛中 - 1, 岛中, 岛中 + 1].filter((c) => c >= 3 && c <= 宽 - 4 && Math.abs(c - 资料库列) > 1);
    const 岛起 = 上起 + 2;
    const 岛止 = Math.min(上止 - 1, 岛起 + 1);
    if (岛列.length >= 2 && 岛止 >= 岛起) {
      for (let y = 岛起; y <= 岛止; y += 1) {
        for (const x of 岛列) 网格[y][x] = G;
      }
    }
  }

  /* ④ 工位区隔断：相邻工位**正中间**立一列玻璃（只到行 2）——
        ⚠️ 2026-09 起四台机器**不再排成一排**（用户要求"不要放在一排上，尽量复杂不在一块"），
           所以隔断不再是"夹在相邻工位之间"，改成**三片固定位置的独立隔间墙**。
           只占行 1-2，行 3 及以上完全开放 —— 怎么摆都不会堵路。 */
  for (const 比例 of [0.33, 0.5, 0.67]) {
    const 中 = Math.round(宽 * 比例);
    if (中 < 3 || 中 > 宽 - 4) continue;
    if (中 <= 左 + 1 || 中 >= 右 - 1) continue; // 别贴着文件柜 / 我的工位
    if (Math.abs(中 - 资料库列) <= 1) continue; // 别压资料库那一列
    网格[1][中] = G;
    if (高 > 4) 网格[2][中] = G;
  }

  /* ⑤ 中央玻璃壁龛（走廊下面，**2 行**）：
        上一行 = 玻璃顶墙 + 一个门；下一行 = 房间地面（里面放咖啡机）。
        ⚠️ 为什么做成 2 行而不是"四边围起来的房间"：11 行的图（PC 横版）竖向预算刚好
           1 外墙 + 1 工位 + 2 通道 + 2 走廊 + 2 壁龛 + 2 储物间 + 1 外墙 = 11 ——
           再高一行就放不下储物间了（实测：3 行的岛在 11 行图上**根本不会生成**）。 */
  const 岛上 = 廊起 + 2;
  const 岛下 = 岛上 + 1;
  const 岛左 = Math.max(3, Math.round(宽 * 0.3));
  const 岛右 = Math.min(宽 - 4, Math.round(宽 * 0.62));
  const 有岛 = 岛下 <= 高 - 4 && 岛右 - 岛左 >= 4;
  if (有岛) {
    for (let x = 岛左; x <= 岛右; x += 1) {
      网格[岛上][x] = G; // 顶墙（两端也封住）
      网格[岛下][x] = C; // 房间地面
    }
    网格[岛下][岛左] = G; // 左端封口
    网格[岛下][岛右] = G; // 右端封口
    网格[岛上][岛左 + 1] = C; // ⚠️ 顶墙留一个门，不然进不去
  }

  /* ⑥ 左下储物间：2 行的玻璃小房间，**右边留一个口**（一个值得绕过去的死角） */
  const 储上 = 高 - 3;
  const 储下 = 高 - 2;
  const 储左 = 2;
  const 储右 = Math.min(宽 - 5, 4);
  const 有储 = 储上 >= 岛下 + 1 && 储右 - 储左 >= 2;
  if (有储) {
    for (let y = 储上; y <= 储下; y += 1) {
      for (let x = 储左; x <= 储右; x += 1) 网格[y][x] = G;
    }
    if (储下 > 储上) {
      for (let x = 储左 + 1; x < 储右; x += 1) 网格[储上 + 1][x] = C;
    }
    网格[储上][储右] = C; // 右边留口
  }

  /* ⑦ 五台设备：**散开摆成一圈动线**（用户要求"四个工具机器不要放在一排上，尽量复杂不在一块"）
        文件柜(左上) → 资料库(工位区左下) → 我的工位(右上) → 文印区(右下) → 交稿箱(下中)

        ⚠️ 位置是"先给首选格、再按结构让位"：`安放()` 从首选格往外螺旋找第一个
           **能走且没被占**的格子。地图上现在有隔断/壁龛/储物间/桌岛，
           硬写坐标迟早会把某台机器塞进墙里或塞进小房间的死角。 */
  const 空关卡: 关卡数据 = {
    cols: 宽,
    rows: 高,
    rows_: 网格,
    stations: [],
    decos: [],
    player: { col: 0, row: 0 },
    npc: { col: 0, row: 0 },
  };
  const 已用 = new Set<string>();
  const 安放 = (首选列: number, 首选行: number, 排除?: (c: number, r: number) => boolean): { col: number; row: number } => {
    for (let 距 = 0; 距 <= 10; 距 += 1) {
      for (let d = -距; d <= 距; d += 1) {
        for (const [c, r] of [
          [首选列 + d, 首选行 - 距],
          [首选列 + d, 首选行 + 距],
          [首选列 - 距, 首选行 + d],
          [首选列 + 距, 首选行 + d],
        ] as Array<[number, number]>) {
          if (c < 2 || c > 宽 - 3 || r < 1 || r > 高 - 2) continue;
          const 键 = `${c},${r}`;
          if (已用.has(键) || !能走(空关卡, c, r)) continue;
          if (排除?.(c, r)) continue;
          已用.add(键);
          return { col: c, row: r };
        }
      }
    }
    return { col: 左, row: 1 };
  };

  const 首选: StationDef[] = [
    { kind: 'files', col: 左, row: 1, label: '文件柜' },
    { kind: 'library', col: 资料库列, row: Math.max(2, 廊起 - 1), label: '资料库', 工序: '查资料', 机制: '连按' },
    { kind: 'desk', col: 右, row: 1, label: '我的工位', 工序: '写稿', 机制: '连按' },
    // ⚠️ 文印区就是那台**打印机**：只有它是"时间自动倒计时"，而且是"放进去等出来"
    {
      kind: 'print',
      col: 右,
      row: Math.min(高 - 2, Math.max(廊起 + 3, 高 - 3)),
      label: '文印区',
      工序: '校对',
      机制: '等待',
    },
  ];
  const stations: StationDef[] = 首选.map((s) => ({ ...s, ...安放(s.col, s.row) }));
  // 交稿箱：**别落进储物间 / 中央壁龛那两间小屋里**（那是死角，交稿要跑冤枉路）
  const 在储物间 = (c: number, r: number): boolean => 有储 && c <= 储右 + 1 && r >= 储上;
  const 在壁龛 = (c: number, r: number): boolean => 有岛 && r === 岛下 && c > 岛左 && c < 岛右;
  stations.push({
    kind: 'bin',
    label: '交稿箱',
    ...安放(Math.round(宽 * 0.55), 高 - 2, (c, r) => 在储物间(c, r) || 在壁龛(c, r)),
  });

  // 设备脚下铺"桌面"（纯观感）
  for (const s of stations) 网格[s.row][s.col] = D;

  /* ⑧ 装饰：两侧墙根 + 岛内 + 储物间内（装饰不挡路，只是观感） */
  const 已占 = new Set<string>(stations.map((s) => `${s.col},${s.row}`));
  const decos: DecoDef[] = [];
  const 放 = (texture: 装饰图, col: number, row: number, dy: number): void => {
    const 键 = `${col},${row}`;
    if (已占.has(键)) return;
    if (!能走({ cols: 宽, rows: 高, rows_: 网格, stations, decos, player: { col: 0, row: 0 }, npc: { col: 0, row: 0 } }, col, row)) return;
    已占.add(键);
    decos.push({ texture, col, row, dy });
  };
  // 左侧墙根
  ['绿植', '饮水机', '垃圾桶', '绿植', '垃圾桶'].forEach((t, i) => 放(t as 装饰图, 1, 2 + i * 2, 6));
  // 右侧墙根
  ['白板', '咖啡机', '垃圾桶', '绿植', '饮水机'].forEach((t, i) => 放(t as 装饰图, 宽 - 2, 2 + i * 2, 8));
  if (有岛) 放('咖啡机', 岛左 + 1, 岛上 + 1, 8);
  if (有储) {
    放('垃圾桶', 储左 + 1, 储下, 6);
    放('绿植', 储右 - 1, 储下, 6);
  }

  /* ⑨ 出生点：玩家在走廊里（视野开阔、离两头都近），帮手在右边两格 */
  const player = { col: Math.max(2, Math.round(宽 * 0.45)), row: 廊起 };
  const npc = { col: Math.min(宽 - 3, player.col + 2), row: 廊起 };

  return { cols: 宽, rows: 高, rows_: 网格, stations, decos, player, npc };
}

/* ───────── 给 Phaser 用的一份"当前关卡" ───────── */

/**
 * React 侧在**建 Phaser 游戏之前**调它把格数定下来；
 * `OfficeScene.create()` 再调 `取关卡()` 拿数据。
 *
 * ⚠️ 为什么走模块级的"当前关卡"而不是 `scene.start(key, data)`：
 *    场景是跟着 `new Phaser.Game()` 一起建的（自动启动），那一刻拿不到 data；
 *    而且关卡数据要在 `preload` 之前就定下来（要按它算世界尺寸）。
 */
let 当前: 关卡数据 = 造关卡(15, 7);

export function 设定关卡格数(cols: number, rows: number): void {
  当前 = 造关卡(cols, rows);
}

export function 取关卡(): 关卡数据 {
  return 当前;
}

export function 当前地图宽(): number {
  return 当前.cols * TILE;
}

export function 当前地图高(): number {
  return 当前.rows * TILE;
}

export function tileToWorld(col: number, row: number): { x: number; y: number } {
  return { x: col * TILE + TILE / 2, y: row * TILE + TILE / 2 };
}

import Phaser from 'phaser';
import { 图, 图片清单, 精灵表清单, 同事清单, 同事立绘, 同事行走图, 同事行走清单, 工序图标 } from '../assets';
import { bus, CMD } from '../../state/bus';
import { useGameStore, type CarryKind, type StationLabel } from '../../state/store';
import { 全部工序, 匹配订单, 缺少工序, 生成订单, 工单时限, type 订单, type 工序 } from '../../state/orders';
// ⚠️ 工位/装饰的碰撞尺寸借用**地图那张占地表**（同一批素材 ✔）
import { 占地表 } from '../map/level';
import { 下一张卡, 最多持卡, 每几版发一张, type SkillCard } from '../../state/cards';
import { 取动作, 虚拟输入 } from '../touch';
import { 播放 } from '../../story/audio';
import { 写关卡存档, 读关卡存档, 清关卡存档, type 关卡存档数据 } from '../../state/存档';
import { useStory } from '../../state/story';
import {
  COLLIDING_TILES,
  GROUND_LIMIT,
  INTERACT_RADIUS,
  NPC_IDLE_RANGE,
  NPC_PROCESS_TIME,
  NPC_SPEED,
  ORDER_SLOTS,
  PLAYER_SPEED,
  QUOTA,
  TIME_LIMIT,
  TILE,
  装饰占地,
  连按几下,
  打印秒数,
  取关卡,
  能走,
  tileToWorld,
  type StationDef,
  type 装饰图,
} from '../greybox/level';

interface StationRuntime extends StationDef {
  wx: number;
  wy: number;
  sprite: Phaser.GameObjects.Image;
  glow: Phaser.GameObjects.Image;
}

/** 地面上的一件东西：可以反复丢下/捡起（**自带工序图标**，一眼看出做到哪一步） */
interface GroundRuntime {
  id: number;
  工序: 工序[];
  kind: CarryKind;
  x: number;
  y: number;
  sprite: Phaser.GameObjects.Image;
  /** 盖在这件东西上的工序图标（每个已完成的工序一枚） */
  icons: Phaser.GameObjects.Image[];
}

type Facing = 'down' | 'up' | 'left' | 'right';

/**
 * 每台机器挂在头顶的那个**专属小图标**（相对 `public/assets/` 的路径，DOM 直接当 `<img>` 用）。
 * ⚠️ 加工位用的是**和稿子上盖的同一枚**工序图标 —— 这样玩家一看牌子就知道"这台做哪一步"。
 */
const 工位图标: Record<string, string> = {
  files: 'map/prop_desk_任务单_空白.png',
  library: `map/${工序图标.查资料}.png`,
  desk: `map/${工序图标.写稿}.png`,
  print: `map/${工序图标.校对}.png`,
  bin: 'ui/icon_check.png',
};

/**
 * 帮手的干活状态机。
 *
 * ⚠️ 用户要求：「AI 帮手自己干活来完善这个任务，**但是很慢，大部分还是要玩家来完成**」
 *    以及「AI 帮手又有自己的工作逻辑，要不然会卡住」。
 *    所以它是一条**完整的活链路**（领单 → 逐道工序 → 交稿），而不是"做一道就走"，
 *    并且每一步都有**限时看门狗**（`npcWatchdog`）：走太久没到位就换一件事做，
 *    绝不允许停在原地不动（那才叫"卡住"）。
 */
type NpcState = 'idle' | 'toFiles' | 'toStation' | 'working' | 'toBin';

/**
 * 能帮忙跑腿的同事（都是剧情里真实存在的同组同事）。
 * ⚠️ 林总 / 程女士不在里面 —— 总监和客户不会替实习生跑腿。
 */
const 帮手候选 = ['小鹿', '阿麦', '韩策', '周岚'] as const;

const NPC_TALK = [
  '程女士那边说，重点是学生那句。',
  '数据我标了出处，你直接用。',
  '记得交之前自己读一遍。',
  '文印区那台机器有点卡纸，慢点按。',
  '别急着交，先看看工单上要哪几道。',
];

/** 装饰贴图：装饰图的种类 → 素材 key */
const 装饰贴图: Record<装饰图, string> = {
  绿植: 图.绿植,
  饮水机: 图.饮水机,
  垃圾桶: 图.垃圾桶,
  白板: 图.白板,
  咖啡机: 图.咖啡机,
};

/** 工位用什么家具（全部是地图上真实存在的家具） */
const 工位贴图: Record<StationRuntime['kind'], string> = {
  files: 图.文件柜,
  library: 图.资料架,
  desk: 图.工位桌,
  print: 图.打印机,
  bin: 图.交稿箱,
};

/** 帮忙的同事朝向帧（和地图 OfficeMapScene 的 NPC朝向帧 一致：下/上/左/右） */
const NPC朝向帧 = [0, 3, 1, 2];
/** 四方向行走动画的行号（和地图一致：行 0 下 / 1 上 / 2 左 / 3 右） */
const 方向行: Record<Facing, number> = { down: 0, up: 1, left: 2, right: 3 };
const BIN_LOCK_INTERVAL = 46_000;
const BIN_LOCK_DURATION = 6_000;
/** 帮手某个状态最多待多久（秒）—— 超了就重新规划，防止卡住 */
const NPC_WATCHDOG: Record<NpcState, number> = {
  idle: 30,
  toFiles: 10,
  toStation: 14,
  working: 12,
  toBin: 14,
};

/**
 * 事件四关卡 · **工作关**（把这一版稿子做出来）
 *
 * 玩法按《胡闹厨房》的思路：
 *   · 顶部挂 3 张随机工单（客户 + 这一版要做哪几道工序），**不强制顺序**
 *   · 文件柜领任务单 → 任意顺序过 资料库 / 我的工位 / 文印区 → 交稿箱交付
 *   · 手上的东西**随时能扔在地上，也能再捡起来**，而且**工序图标跟着它走**
 *   · 交稿时只要工序覆盖了某张工单的要求就算过，多做了也认
 *
 * 画面与操作**和地图那一套完全对齐**：
 *   · 瓦片、主角精灵表、同事立绘、家具全部来自 `public/assets/map/`
 *   · 主角是同一套四方向行走动画（4 行 × 4 帧）
 *   · 操作和地图一致：方向键 / WASD 走，Shift 快走，空格交互，Esc 暂停
 *
 * ⚠️ 关卡网格**不是写死的**：由 `greybox/level.ts` 按窗口算出来的格数现造
 *    （用户要求全屏 → 内部格数随窗口变）。所以这里一律用 `取关卡()`，
 *    绝不写 `MAP_W` 那种模块常量。
 */
export class OfficeScene extends Phaser.Scene {
  private 关卡 = 取关卡();
  private mapW = 0;
  private mapH = 0;

  private player!: Phaser.Physics.Arcade.Sprite;
  private npc!: Phaser.Physics.Arcade.Sprite;
  private playerShadow!: Phaser.GameObjects.Image;
  private npcShadow!: Phaser.GameObjects.Image;
  /** 手里那件东西 + 盖在它上面的工序图标 */
  private carriedPaper!: Phaser.GameObjects.Image;
  private carriedIcons: Phaser.GameObjects.Image[] = [];
  private carriedIconTags: 工序[] = [];
  private npcPaper!: Phaser.GameObjects.Image;
  private npcIcons: Phaser.GameObjects.Image[] = [];
  private npcIconTags: 工序[] = [];
  private layer!: Phaser.Tilemaps.TilemapLayer;
  private stations: StationRuntime[] = [];
  private approaches = new Map<string, { x: number; y: number }>();
  private ground: GroundRuntime[] = [];
  private groundSeq = 0;
  private unsubscribe: Array<() => void> = [];

  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private keyW!: Phaser.Input.Keyboard.Key;
  private keyA!: Phaser.Input.Keyboard.Key;
  private keyS!: Phaser.Input.Keyboard.Key;
  private keyD!: Phaser.Input.Keyboard.Key;
  private keyShift!: Phaser.Input.Keyboard.Key;
  private fx!: Phaser.GameObjects.Particles.ParticleEmitter;
  private ring!: Phaser.GameObjects.Graphics;

  private running = false;
  private finished = false;
  private carrying: CarryKind = null;
  private carryTags: 工序[] = [];
  /**
   * **垃圾桶的世界坐标**（用户要求：可以把文件扔进垃圾桶丢弃）。
   * 垃圾桶是「装饰」不是「工位」，不在 stations 里，交互要单独认 ✔
   */
  private 垃圾桶们: Array<{ x: number; y: number }> = [];
  private processing = 0;
  private processingStation: StationRuntime | null = null;
  private orders: 订单[] = [];
  private delivered = 0;
  private failed = 0;
  private timeLeft = TIME_LIMIT;
  private syncAcc = 0;
  private facing: Facing = 'down';

  /* ── 帮手 ── */
  /** 这一局来帮忙的是谁（按工单的客户选"相关同事"，见 `选帮手`） */
  private 帮手名 = 帮手候选[0] as string;
  private npcState: NpcState = 'idle';
  private npcTimer = 0;
  private npcWatchdog = 0;
  private npcLastX = 0;
  private npcLastY = 0;
  private npcOrder: 订单 | null = null;
  private npcPlan: 工序[] = [];
  private npcCarrying: CarryKind = null;
  private npcTags: 工序[] = [];
  private npcProgress = 0;
  private npcTargetStation: StationRuntime | null = null;
  private npcTalkTimer = 9_000;
  /** 帮手当前这条路（格子序列，**不含起点**）*/
  private npcPath: Array<{ col: number; row: number }> = [];
  /** 这条路是通往哪一格的（目标格变了就重算）*/
  private npcPath目标 = '';
  /** 手里那件东西的**抱持相位**（走路时轻微上下，看着是"抱着走"） */
  private 携带相位 = 0;
  /**
   * **打印机里的那一份**。用户要求：
   * 「打印机是**直接可以把文章放进去等文章出来**就行了，**每次只能放一个**」。
   *
   * 所以它不是"站在旁边按住等"的工位，而是**一个槽**：
   *   放进去（按 E）→ 玩家可以走开干别的 → `打印秒数` 秒后**从出纸口吐出来**（一件地面物）→ 拿走。
   * `已有` 是放进去时那张稿子**已经做完的工序**，出纸时会原样带回来（不会白干）。
   */
  private 打印槽: { 已有: 工序[]; 目标: 工序; 剩余: number } | null = null;
  /** 已经吐出来、还躺在出纸口没拿走的那一份（没拿走之前不能再放新的） */
  private 打印产出id: number | null = null;

  /**
   * 技能卡"找人帮忙"的加速剩余时长（毫秒）。
   * > 0 时帮手做一道工序快 3 倍 —— 他是"来搭把手"的，不是替你干完。
   */
  private npcBoost = 0;
  /**
   * 帮手干活的**进度条**（浮在他头顶）。
   *
   * ⚠️ 用户报的「要真正的进行工作不是装样子」——他的活本来是算数的
   *    （`完成订单` 里 `delivered += 1`、能直接结算），但**看不出来**：
   *    人就站在工位旁边一动不动两秒多，远处看就是"杵着"。
   *    所以给他一条进度条：一眼能看出"他真的在干这一道工序"。
   */
  private npcBar: Phaser.GameObjects.Rectangle | null = null;
  /**
   * **"有没有在靠近目标"**的两个计数器（防卡死用）。
   *
   * ⚠️⚠️ 原来的看门狗判的是"**这一帧动没动**"（位移 > 0.4px 就算有进展）。
   *    可一个人**贴着墙/家具原地抖**也算动了 —— 于是看门狗永远不触发，
   *    他就那么抖到天荒地老（实测：模拟 14 秒还卡在 `toFiles`，一步没走）。
   *    正确判据是"**离目标更近了吗**"：连续若干帧都没更近 → 重规划。
   */
  private npc最近距 = Number.POSITIVE_INFINITY;
  private npc卡住帧 = 0;
  /** 最后 30 秒的"报时"计时（毫秒；归零就敲一下 `时间告急` 并重置成 5 秒） */
  private 报时 = 0;
  /** 关卡自动存档的计时（毫秒）—— 每 3 秒把这一局写进浏览器 */
  private 存档计时 = 0;
  /** 这一帧他在不在走（决定要不要做"走路浮动"） */
  private npcMoving = false;
  /** 他现在朝哪边（停下时要用这个朝向的站姿帧） */
  private npcFacing: Facing = 'down';
  /** 浮动相位 */
  private npcBob = 0;

  private binLockTimer = BIN_LOCK_INTERVAL;
  private binLockedFor = 0;

  constructor() {
    super('office');
  }

  preload(): void {
    for (const [key, url] of 图片清单) this.load.image(key, url);
    for (const [key, url] of 精灵表清单) {
      this.load.spritesheet(key, url, { frameWidth: 32, frameHeight: 48 });
    }
    // 同事的四方向行走图（128×192 = 4×4 帧）。缺了也不报错 —— 会退回"朝向帧 + 1px 浮动"
    for (const [key, url] of 同事行走清单) {
      if (!this.textures.exists(key)) this.load.spritesheet(key, url, { frameWidth: 32, frameHeight: 48 });
    }
    // 同事立绘（帮手 + 背景同事都可能用其中任意一张）
    for (const [key, url] of 同事清单) {
      if (!this.textures.exists(key)) this.load.spritesheet(key, url, { frameWidth: 32, frameHeight: 48 });
    }
  }

  create(): void {
    this.关卡 = 取关卡();
    this.mapW = this.关卡.cols * TILE;
    this.mapH = this.关卡.rows * TILE;
    this.timeLeft = TIME_LIMIT;
    // ⚠️ 有没有"上一次没打完的那一局"要先看一眼 —— 有的话**不能** setReady
    //    （那会弹开场简报、把这一局的状态清掉）
    const 上一局 = 读关卡存档();
    if (!上一局) useGameStore.getState().setReady(TIME_LIMIT, QUOTA);
    this.physics.world.setBounds(0, 0, this.mapW, this.mapH);

    // 先给一个临时值；真正的帮手在 `beginRun`（开完单之后）才定
    this.帮手名 = 帮手候选[0];

    this.制作瓦片集();
    this.制作小贴图();
    this.制作工序图标();
    this.制作动画();
    this.制作同事动画();

    this.buildTiles();
    this.buildDecor();
    this.buildStations();
    this.buildFx();
    this.buildActors();
    this.bindInput();

    this.cameras.main.setBounds(0, 0, this.mapW, this.mapH);
    this.cameras.main.setRoundPixels(true);
    this.cameras.main.setBackgroundColor('#262a33');

    if (上一局) {
      this.恢复关卡(上一局);
    } else {
      useGameStore
        .getState()
        .toast('系统', '按「开始干活」进入这一关；顶部工单条写着每一版稿子要做哪几道工序。');
    }
    this.exposeDevProbe();
  }

  /**
   * **接着上一次没打完的那一局**（用户要求："可以" —— 把这一局也存上）。
   *
   * ⚠️ 不恢复帮手的状态（他的计划/目标/进度是一串内部状态）：
   *    他回来时从"待命"重新开始，这一局照样能打 —— 收益不值那个复杂度。
   */
  private 恢复关卡(存: 关卡存档数据): void {
    this.timeLeft = Math.max(1, 存.剩余秒);
    this.delivered = 存.已交 ?? 0;
    this.failed = 存.交错 ?? 0;
    if (Array.isArray(存.订单) && 存.订单.length === ORDER_SLOTS) this.orders = 存.订单;
    this.carrying = 存.手上 ?? null;
    this.carryTags = Array.isArray(存.手上工序) ? [...存.手上工序] : [];
    for (const g of 存.地上 ?? []) this.造地面物(g.x, g.y, g.kind, [...g.工序]);
    if (存.打印槽) this.打印槽 = { ...存.打印槽, 已有: [...存.打印槽.已有] };

    (this.player.body as Phaser.Physics.Arcade.Body).reset(存.玩家.x, 存.玩家.y);
    this.facing = (存.玩家.朝向 as Facing) ?? 'down';

    // 接着打：直接进"进行中"，不再走一次开场简报
    this.running = true;
    this.finished = false;
    this.npcState = 'idle';
    this.npcTimer = 2;
    this.physics.world.resume();
    useGameStore.getState().beginPlay();
    useGameStore.getState().sync({
      delivered: this.delivered,
      failed: this.failed,
      timeLeft: this.timeLeft,
      carrying: this.carrying,
      carryTags: this.carryTags,
      orders: this.orders,
      ground: this.ground.map((g) => ({ id: g.id, 工序: g.工序, x: g.x, y: g.y })),
      processing: 0,
      processingTag: null,
      打印: this.打印槽 ? { 工序: this.打印槽.目标, 剩余: this.打印槽.剩余 } : null,
      帮手: { 名: this.帮手名, 状态: this.npcStateText(), 手上: null, 工序: [] },
    });
    this.say('系统', '接着上次那一局继续 —— 时间和进度都还在。');
  }

  /** 把这一局"存到能恢复"的最小集写进浏览器 */
  private 存这一局(): void {
    const 剧情 = useStory.getState();
    写关卡存档({
      标题: 剧情.关卡标题,
      提示: 剧情.关卡提示,
      剩余秒: Number(this.timeLeft.toFixed(1)),
      已交: this.delivered,
      交错: this.failed,
      订单: this.orders,
      手上: this.carrying,
      手上工序: [...this.carryTags],
      地上: this.ground.map((g) => ({ 工序: [...g.工序], kind: g.kind, x: g.x, y: g.y })),
      玩家: { x: this.player.x, y: this.player.y, 朝向: this.facing },
      打印槽: this.打印槽 ? { ...this.打印槽, 已有: [...this.打印槽.已有] } : null,
    });
  }

  /* ───────── 运行时生成的贴图 ───────── */

  /** 把 17 张地图瓦片拼成一张 17 格的 tileset（顺序 = `assets.ts` 的 `瓦片顺序`） */
  private 制作瓦片集(): void {
    const 数 = 17;
    const cv = document.createElement('canvas');
    cv.width = TILE * 数;
    cv.height = TILE;
    const ctx = cv.getContext('2d');
    if (!ctx) return;
    ctx.imageSmoothingEnabled = false;
    for (let i = 0; i < 数; i += 1) {
      const 源 = this.textures.get(`w${i}`).getSourceImage() as CanvasImageSource;
      ctx.drawImage(源, i * TILE, 0, TILE, TILE);
    }
    if (this.textures.exists(图.瓦片集)) this.textures.remove(图.瓦片集);
    const tex = this.textures.addCanvas(图.瓦片集, cv);
    tex?.setFilter(Phaser.Textures.FilterMode.NEAREST);
  }

  private 制作小贴图(): void {
    const g = this.add.graphics();
    g.fillStyle(0xffb020, 1);
    g.fillRect(0, 0, 4, 4);
    g.generateTexture('spark', 4, 4);
    g.destroy();

    const s = this.add.graphics();
    s.fillStyle(0x14161c, 0.32);
    s.fillEllipse(11, 4, 20, 7);
    s.generateTexture('shadow', 22, 8);
    s.destroy();
  }

  /**
   * **工序图标**（每做完一道工序，就在手里那份稿子上盖一枚）。
   *
   * ⚠️ 用户要求：「每个文件的状态在每个阶段都要能肉眼看出来，就像胡闹厨房一样
   *    每添加一样就在这个物体上显示特定的图标」。
   *
   * 为什么**程序画**而不是等美术素材：这三枚是 12×12 的功能图标，核心要求是
   * **缩到 12px 还能一眼分清**（所以三枚形状完全不同：放大镜 / 稿纸 / 对勾，不只靠颜色）。
   * 美术版做好之后，把 `图标键` 换成真实贴图即可，其余逻辑一行不用动。
   * （提示词见 `美术/提示词-12-关卡升级.md` 的"组 2"）
   */
  private 制作工序图标(): void {
    // ⚠️ 真素材已经在 `图片清单` 里加载了（`map/ic_工序_*.png`）。
    //    **只有三张都不在**（还没出图 / 加载失败）时才现画顶上 —— 用同一个 key，
    //    所以游戏逻辑一行都不用改。
    if (
      this.textures.exists(工序图标.查资料) &&
      this.textures.exists(工序图标.写稿) &&
      this.textures.exists(工序图标.校对)
    ) {
      return;
    }

    const 板 = (g: Phaser.GameObjects.Graphics): void => {
      g.fillStyle(0xf7efdd, 1);
      g.fillRect(1, 1, 12, 12);
      g.lineStyle(1, 0x241a12, 1);
      g.strokeRect(1, 1, 12, 12);
    };

    // 查资料：放大镜（圆 + 斜柄）
    const a = this.add.graphics();
    板(a);
    a.lineStyle(2, 0x4a8fd4, 1);
    a.strokeCircle(6.5, 6.5, 3.4);
    a.lineBetween(9, 9, 12, 12);
    a.generateTexture(工序图标.查资料, 14, 14);
    a.destroy();

    // 写稿：稿纸上的三行字 + 一支笔
    const b = this.add.graphics();
    板(b);
    b.fillStyle(0x7cc26b, 1);
    b.fillRect(3, 4, 8, 1);
    b.fillRect(3, 6, 6, 1);
    b.fillRect(3, 8, 8, 1);
    b.fillStyle(0xd9a066, 1);
    b.fillRect(9, 8, 3, 3);
    b.generateTexture(工序图标.写稿, 14, 14);
    b.destroy();

    // 校对：一个红对勾
    const c = this.add.graphics();
    板(c);
    c.lineStyle(2, 0xe04f3f, 1);
    c.beginPath();
    c.moveTo(3.5, 7.5);
    c.lineTo(6, 10);
    c.lineTo(11, 4);
    c.strokePath();
    c.generateTexture(工序图标.校对, 14, 14);
    c.destroy();
  }

  /**
   * 四方向行走动画 —— **和地图同样是那张 `chr_lks_walk.png`**（4 行 × 4 帧）。
   * 行号约定和地图一致：0 下 / 1 上 / 2 左 / 3 右。
   *
   * ⚠️ 同事（帮手 / 背景）**没有行走图**：`npc_*.png` 只有 6 个姿势格。
   *    所以他们的"走路"用**朝向帧 + 1 像素上下浮动**来表现（见 `走路的上下浮动`），
   *    等 `美术/提示词-12-关卡升级.md` 那套四方向行走图到位，把这里换成真动画即可。
   */
  private 制作动画(): void {
    const 表: Array<[Facing, string]> = [
      ['down', '走下'],
      ['up', '走上'],
      ['left', '走左'],
      ['right', '走右'],
    ];
    for (const [朝向, key] of 表) {
      if (this.anims.exists(key)) this.anims.remove(key);
      const 行 = 方向行[朝向];
      this.anims.create({
        key,
        frames: this.anims.generateFrameNumbers(图.主角_走, {
          frames: [行 * 4, 行 * 4 + 1, 行 * 4 + 2, 行 * 4 + 3],
        }),
        frameRate: 9,
        repeat: -1,
      });
    }
  }

  /**
   * 同事的四方向行走动画（**有行走图才建**）。
   *
   * ⚠️ 行序和主角那张完全一致：0 下 / 1 上 / 2 左 / 3 右，每行 4 帧。
   *    第 4 行必须是第 3 行的水平镜像（`工具/修行走表.mjs` 做的），否则会"走两步回一次头"。
   */
  /**
   * ⚠️⚠️ **这里原来有一整套"去掉几乎一样的帧"的逻辑，已经被删掉了。**
   *
   * 当初的想法：AI 画的走表常常是 **A A B A**（第一个姿势连着两帧），
   * 照 4 帧原样播会"走一下、卡一下"，所以按"相邻帧像素差"把重复帧去掉。
   *
   * 结果（用户两次报「AI 队友动画错乱、一直摆头」）：
   *    它把正常步态**砍成了 2~3 帧** —— 实测生成出来的动画是
   *    `下: [0,2]`、`左: [8,9,10]`、`上: [4,6]`、`右: [12,13,14]` ✗，
   *    播起来就是在两三帧之间**高频抖动** ✔（那才是"摆头"的真正来源）
   *    当时还给它加了"只剩两帧就放慢到 7fps"的补丁 —— **那是给自己挖的坑打补丁** ✗
   *
   * 结论：**帧去重这种事不要做**。素材有几帧就播几帧；
   *     美术冗余要用改素材（`工具/修行走表.mjs` / `处理角色动画.mjs`）解决，
   *     而不是在运行时把帧偷偷扔掉 ✔
   */

  private 制作同事动画(): void {
    for (const [名, key] of Object.entries(同事行走图)) {
      if (!this.textures.exists(key)) continue;
      for (const 朝向 of ['down', 'up', 'left', 'right'] as Facing[]) {
        const 动画 = `行_${名}_${朝向}`;
        if (this.anims.exists(动画)) this.anims.remove(动画);
        const 行 = 方向行[朝向];
        /**
         * ⚠️⚠️ **朝右这一行只播前两帧**（用户明确要求：
         *    「小鹿的动画还是左右摆头，**向右的后两帧错误**，将**前两帧一直重复**就行」）。
         *    素材里朝右那行的第 3、4 帧画坏了（头/身会扭），与其在运行时修 ✗
         *    不如按用户说的**只用前两帧循环** ✔（其余三个方向仍然是完整的 4 帧 ✔）
         */
        /**
         * ⚠️⚠️ **这里曾经把朝左/朝右砍成"只播前两帧"** —— 现在**删掉了**。
         *
         * 原因：那一版素材的左/右两行确实有"头转向反方向"的坏帧 ✗，
         *      所以当时按用户的要求（"前两帧一直重复"）绕开了第 3、4 帧 ✔。
         * **新的小鹿素材已经修好了**（2026-09-14 20:5x 那版，看图 4 行头朝向各自一致 ✔），
         *      再只播两帧就是**动画缺帧、看着一顿一顿** ✔（用户这次报的"动画是坏的"）
         *      → 恢复**四行都播完整 4 帧** ✔
         * 以后如果再遇到某一行有坏帧，**优先重新出图** ✗，别在运行时砍帧 ✗
         */
        const 只两帧 = false;
        const 帧号 = (只两帧 ? [0, 1] : [0, 1, 2, 3]).map((i) => 行 * 4 + i);
        this.anims.create({
          key: 动画,
          // ⚠️ 除此之外**一行 4 帧原样播**（不再"去重" ✗ —— 去重会把步态砍成 2 帧抽搐）
          frames: this.anims.generateFrameNumbers(key, { frames: 帧号 }),
          frameRate: 只两帧 ? 6 : 8,
          repeat: -1,
        });
      }
    }
  }

  /** 这个同事有没有四方向行走图（有就播真动画，没有就退回旧做法） */
  private 有行走图(名: string): boolean {
    const key = 同事行走图[名];
    return !!key && this.textures.exists(key);
  }

  /** 站住 / 停下来：停在当前朝向那一行的第一帧（站姿） */
  private 停下(): void {
    if (!this.有行走图(this.帮手名)) return;
    if (this.npc.anims.isPlaying) this.npc.anims.stop();
    this.npc.setTexture(同事行走图[this.帮手名], 方向行[this.npcFacing] * 4);
  }

  /* ───────── 场景搭建 ───────── */

  private buildTiles(): void {
    const map = this.make.tilemap({ data: this.关卡.rows_, tileWidth: TILE, tileHeight: TILE });
    const tileset = map.addTilesetImage(图.瓦片集, 图.瓦片集);
    if (!tileset) throw new Error('tileset 未绑定');
    const layer = map.createLayer(0, tileset, 0, 0);
    if (!layer) throw new Error('图层创建失败');
    this.layer = layer as Phaser.Tilemaps.TilemapLayer;
    this.layer.setCollision(COLLIDING_TILES);
    this.layer.setDepth(-50);
  }

  private buildDecor(): void {
    for (const d of this.关卡.decos) {
      const { x, y } = tileToWorld(d.col, d.row);
      const 图 = this.add
        .image(x + (d.dx ?? 0), y + (d.dy ?? 0), 装饰贴图[d.texture])
        .setOrigin(0.5, 1)
        .setDepth(y + (d.dy ?? 0));
      /**
       * ⚠️⚠️ **装饰也要挡路**（用户报的：「小游戏里咖啡机也要物理碰撞」）。
       *
       * 原来这里只 `add.image`，一个物理体都没有 —— 于是咖啡机、饮水机、垃圾桶
       * 全都能**直接穿过去**（摆着看而已）。
       *
       * ⚠️ 只给 **`占地表` 里有登记**的装饰加（表里的尺寸是"贴地那小块"，
       *    不是整张 44×48 的立绘）——没登记的（比如靠墙的绿植/白板）保持原样，
       *    免得凭空多出一堆挡路的东西把过道堵死。
       * ⚠️ 偏移算法和地图那一套**一模一样**（原点是 0.5,1：贴底居中）。
       */
      /**
       * ⚠️⚠️ 用户要求「**将所有的工具做物理碰撞**」——
       *    所以这里的口径改成：**默认一定有碰撞** ✔
       *    原来是 `if (!尺寸) continue;` ✗ —— 只要 `装饰占地` 表里漏登记一种，
       *    那件道具就又能穿过去了 ✔（留了个后门 ✗）
       *    现在：没登记的**按贴图算一个保守的贴地碰撞**（取宽 60% / 高 30% ✔，
       *    和地图里那个 `?? [s.width*0.85, s.height*0.4]` 是同一个思路 ✔）
       */
      // ⚠️ 垃圾桶要**单独记位置**：玩家可以把稿子扔进去丢弃（它不是工位 ✔）
      if (d.texture === '垃圾桶') this.垃圾桶们.push({ x: 图.x, y: 图.y });
      const 尺寸 = 装饰占地[d.texture] ?? [Math.round(图.width * 0.6), Math.round(图.height * 0.3)];
      this.physics.add.existing(图, true);
      const body = 图.body as Phaser.Physics.Arcade.StaticBody | null;
      if (!body) continue;
      const [宽, 高] = 尺寸;
      body.setSize(宽, 高);
      // ⚠️ 同上：直接摆位置（别用 setOffset ✗），和地图 `加占地` 一致
      body.position.set(图.x - 宽 / 2, 图.y - 高);
      body.updateCenter();
    }
    // ⚠️ 用户要求「**AI 队友去掉不干活的队友**」——所以这里**没有站桩同事**了。
    //    原来会摆 2~3 个只会站着（有碰撞体、会挡路）的背景同事，现在只留
    //    那个真的在干活的帮手（`this.npc`，在 `buildActors` 里建）。
  }

  private buildStations(): void {
    const 名牌: StationLabel[] = [];
    this.stations = this.关卡.stations.map((def) => {
      const { x, y } = tileToWorld(def.col, def.row);
      const sprite = this.add.image(x, y + 6, 工位贴图[def.kind]);
      sprite.setOrigin(0.5, 1);
      sprite.setDepth(y - 4);
      /**
       * ⚠️⚠️ **工位家具也要挡路**（用户报的「为道具都加上物理碰撞，不要穿模」）。
       *    原来这里只 `add.image` —— 一个物理体都没有 ✗，
       *    于是**文件柜 / 资料库 / 打印机 / 交稿箱 / 工位桌子全都能直接穿过去** ✔
       *    尺寸优先用地图那张 `占地表`（同一批素材 ✔），没有就退一个保守的默认值 ✔
       *    偏移算法和地图一致：原点是 (0.5,1)，贴底居中 ✔
       */
      const 尺寸 = 占地表[工位贴图[def.kind]] ?? [26, 14];
      this.physics.add.existing(sprite, true);
      const body = sprite.body as Phaser.Physics.Arcade.StaticBody | null;
      if (body) {
        const [宽, 高] = 尺寸;
        body.setSize(宽, 高);
        /**
         * ⚠️⚠️ **必须直接摆 position + updateCenter**，不能用 `setOffset` ✗
         *    （我第一次就是用 setOffset 写的 —— 在 origin(0.5,1) 的精灵上算出来是错的位置，
         *      实测玩家照样能穿过去 ✗）
         *    和地图里那个"验证过"的实现（`OfficeMapScene.加占地`）**一模一样** ✔
         *    静态体的坐标是左上角；精灵的脚底在 (sprite.x, sprite.y) ✔
         */
        body.position.set(sprite.x - 宽 / 2, sprite.y - 高);
        body.updateCenter();
      }

      const glow = this.add.image(x, y - 30, 'spark').setVisible(false).setDepth(9000).setScale(1.6);
      glow.setTint(0xffd166);
      this.tweens.add({ targets: glow, y: y - 34, duration: 620, yoyo: true, repeat: -1, ease: 'Sine.inOut' });

      // 每台机器挂**自己的**图标：加工位用那道工序的图标，取料/交付各用一个专属图标
      名牌.push({
        label: def.label,
        工序: def.工序 ?? null,
        x,
        y: y - 30,
        kind: def.kind,
        图标: 工位图标[def.kind],
      });
      return { ...def, wx: x, wy: y, sprite, glow };
    });
    useGameStore.getState().setStationLabels(名牌);
  }

  private buildActors(): void {
    const playerPos = tileToWorld(this.关卡.player.col, this.关卡.player.row);
    const npcPos = tileToWorld(this.关卡.npc.col, this.关卡.npc.row);

    this.playerShadow = this.add.image(playerPos.x, playerPos.y + 16, 'shadow').setDepth(1);
    this.npcShadow = this.add.image(npcPos.x, npcPos.y + 16, 'shadow').setDepth(1);

    this.player = this.physics.add.sprite(playerPos.x, playerPos.y, 图.主角_走, 0);
    this.player.setOrigin(0.5, 0.5).setCollideWorldBounds(true);
    this.setBody(this.player);

    const 帮手立绘 = 同事立绘[this.帮手名] ?? 'npc_mai';
    this.npc = this.physics.add.sprite(npcPos.x, npcPos.y, 帮手立绘, NPC朝向帧[0]);
    // 干活进度条（平时隐藏；`tickNpc` 的 working 那一支负责显示/更新）
    this.npcBar = this.add
      .rectangle(npcPos.x, npcPos.y - 44, 26, 4, 0xa8d98a)
      .setOrigin(0.5, 1)
      .setDepth(99999)
      .setVisible(false);
    this.npc.setOrigin(0.5, 0.5).setCollideWorldBounds(true);
    this.setBody(this.npc);

    this.carriedPaper = this.add.image(0, 0, 图.任务单).setVisible(false).setDepth(9500);
    this.npcPaper = this.add.image(0, 0, 图.任务单).setVisible(false).setDepth(9500);

    this.physics.add.collider(this.player, this.layer);
    this.physics.add.collider(this.npc, this.layer);
    this.physics.add.collider(this.player, this.npc);
  }

  private setBody(sprite: Phaser.Physics.Arcade.Sprite): void {
    const body = sprite.body as Phaser.Physics.Arcade.Body;
    body.setSize(14, 10);
    body.setOffset(9, 36);
  }

  private buildFx(): void {
    this.fx = this.add.particles(0, 0, 'spark', {
      speed: { min: 40, max: 120 },
      lifespan: 520,
      quantity: 12,
      scale: { start: 1.4, end: 0 },
      gravityY: 140,
      emitting: false,
    });
    this.fx.setDepth(9600);
    this.ring = this.add.graphics().setDepth(9600);
  }

  private bindInput(): void {
    /**
     * ⚠️⚠️ **总线监听必须绑在"有没有键盘"这道闸外面**。
     *
     * 用户报的「重新开始有好多 bug」的**主因**就是这里：
     *   原来 `bus.on(CMD.start)` 写在 `if (!keyboard) return` **后面** ✗ ——
     *   「开始干活」那颗按钮走的就是 `bus.emit(CMD.start)`，
     *   而**重新开始之后**新建的 Phaser 实例拿不到 keyboard → 这里提前 return →
     *   **监听压根没挂上 → 点「开始干活」毫无反应 → 简报不消失、工单 0 张 → 这一关玩不了** ✔
     *   （第一次进关卡是好的，所以只有"重来"才暴露 ✗）
     *
     * 结论：**按钮/剧情这类不依赖键盘的通道，不能关在键盘的 if 里面**。
     */
    this.unsubscribe.push(bus.on(CMD.start, () => this.beginRun()));
    this.unsubscribe.push(bus.on(CMD.restart, () => this.scene.restart()));

    const keyboard = this.input.keyboard;
    if (!keyboard) return;
    this.cursors = keyboard.createCursorKeys();
    this.keyW = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.W);
    this.keyA = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.A);
    this.keyS = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.S);
    this.keyD = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.D);
    this.keyShift = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SHIFT);

    keyboard.on('keydown-SPACE', this.onInteractKey, this);
    // ⚠️ E 是**干活键**（连按加进度 / 送进打印机），不再和空格同义
    keyboard.on('keydown-E', this.onWorkKey, this);
    keyboard.on('keydown-Q', this.onDropKey, this);
    // ⚠️⚠️ ESC **不在这里绑**：Phaser 的键盘事件依赖焦点，用户报过"按 Esc 没反应"。
    //    改由 React 那层挂 window 监听（见 `screens/关卡.tsx`），只留一个入口，
    //    免得两边都响应 → 开了又立刻关。

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      keyboard.off('keydown-SPACE', this.onInteractKey, this);
      keyboard.off('keydown-E', this.onWorkKey, this);
      keyboard.off('keydown-Q', this.onDropKey, this);
      this.unsubscribe.forEach((off) => off());
      this.unsubscribe = [];
    });
  }

  private onInteractKey(): void {
    this.interact();
  }

  private onDropKey(): void {
    if (!this.可以在关卡里操作()) return;
    if (!this.carrying) return;
    this.丢下();
  }

  /**
   * 开/关"设置"面板。**公开方法，给 React 的 window 监听调用**。
   *
   * ⚠️ 用户报"按 Esc 没出现设置页面"—— 根因是 Phaser 的键盘事件要画布有焦点，
   *    而 React 挂在 window 上的监听**不挑焦点**。所以唯一的 ESC 入口挪到了 React 那层
   *    （场景里**不再**绑 ESC，两边都响会"开了又立刻关"）。
   */
  切换设置(): void {
    if (this.finished) return;
    useGameStore.getState().开设置();
    const paused = useGameStore.getState().phase === 'paused';
    if (paused) this.physics.world.pause();
    else this.physics.world.resume();
  }

  private onWorkKey(): void {
    this.干活();
  }

  /**
   * 排空这一帧的**触摸动作**（手机右下角那三个键）。
   * ⚠️ 和键盘走**同一个入口**（干活 / interact / 丢下）—— 两条路不能各写一份。
   */
  private 处理触摸动作(): void {
    for (const 名 of 取动作()) {
      if (名 === 'E') this.干活();
      else if (名 === '空格') this.interact();
      else if (名 === 'Q') this.丢下();
    }
  }

  /**
   * **用掉一张技能卡**（React 那边按 1/2/3 或点卡片时调）。
   *
   * ⚠️ 效果全落在这一关的机制上，而且每张都对应剧情里学过的一课（见 cards.ts）：
   *    · 不懂就问   → 当前这台机器**立刻做完**（省掉连按/等待，但人得到机器跟前）
   *    · 带着笔记   → **+15 秒**
   *    · 先说我这边的时间 → **交稿箱不再被暂停**
   *    · 坐在最前面 → **20 秒内帮手快 3 倍**
   */
  用卡(卡: SkillCard): void {
    if (!this.可以在关卡里操作()) return;
    const 用 = 卡.关卡;
    if (!用) return;
    if (用.效果 === '立刻完工') {
      if (!this.carrying || !this.processingStation) {
        this.say('系统', '「不懂就问」要用在机器跟前：先站到工位上开工。');
        return;
      }
      this.工序完成(this.processingStation);
    } else if (用.效果 === '加时间') {
      const 加 = 用.数值 ?? 15;
      this.timeLeft += 加;
      this.say('系统', `续了 ${加} 秒。`);
    } else if (用.效果 === '解锁交稿箱') {
      this.binLockedFor = 0;
      this.binLockTimer = Number.POSITIVE_INFINITY;
      this.stationOf('bin').sprite.clearTint();
      this.say('系统', '交稿箱不会再被暂停了。');
    } else if (用.效果 === '帮手加速') {
      this.npcBoost = 20_000;
      this.say(卡.name, '这一阵子我帮你顶一下。');
    }
    播放('技能卡');
    useGameStore.getState().去掉卡(卡.id);
    this.fx.explode(8, this.player.x, this.player.y - 20);
  }

  private 可以在关卡里操作(): boolean {
    return this.running && !this.finished && useGameStore.getState().phase === 'playing';
  }

  /**
   * 造一张工单，并**盖上时限**（用户要求："增加任务的时间限制"）。
   * ⚠️ 一律走这里，别直接 `生成订单` —— 不然新补的单一进来就没有剩余时间 ✗
   */
  private 造单(已完成: number): 订单 {
    return { ...生成订单(已完成), 剩余: 工单时限 };
  }

  /**
   * **工单倒计时**（每帧跑）。到点没做完 → 作废 + 扣分 + 补一张新的。
   *
   * ⚠️ 用户要求：「时间到了没有做完就清除掉并且扣除分数，也要有**边框变红**的动画，
   *    变红后就消失同时扣除对应合理的分数」——
   *    红框那段在 UI 侧（`剩余 <= 8` 时加 `.urgent`，见 关卡.tsx 的工单卡）。
   *    这里只负责"到点作废 + 扣分"：扣分走 `failed`（和"交错"同一条记分 ✔），
   *    所以评级和结算会自然跟着降 ✔
   */
  private tickOrders(delta: number): void {
    if (!this.running || this.finished) return;
    const dt = delta / 1000;
    for (let i = this.orders.length - 1; i >= 0; i -= 1) {
      const 单 = this.orders[i];
      单.剩余 = (单.剩余 ?? 工单时限) - dt;
      if (单.剩余 > 0) continue;
      this.orders.splice(i, 1, this.造单(this.delivered));
      this.failed += 1;
      播放('指标下降');
      useGameStore.getState().toast('系统', `「${单.客户}」那一单超时作废了（记一次交错）`);
    }
  }

  private beginRun(): void {
    this.running = true;
    this.finished = false;
    // 开新的一局：把上一次的关卡存档丢掉，免得刷新之后又回到上一局
    清关卡存档();
    this.销毁地面物();
    this.orders = Array.from({ length: ORDER_SLOTS }, () => this.造单(0));
    // ⚠️ 帮手在**开单之后**才定：他要是"和这单活相关的同事"（用户要求），
    //    那得先有单子才知道是谁。所以 create 里那个只是临时默认值。
    this.换帮手(this.选帮手(this.orders));
    this.npcState = 'idle';
    this.npcTimer = 2;
    this.npcWatchdog = NPC_WATCHDOG.idle;
    this.physics.world.resume();
    useGameStore.getState().beginPlay();
    useGameStore
      .getState()
      .toast('系统', '去文件柜领一张任务单，按工单上的工序过资料库 / 工位 / 文印区，最后投进交稿箱。');
    // 开局就存一次：这样"刚开始就刷新"也能接着打
    this.存这一局();
  }

  /* ───────── 每帧 ───────── */

  update(_time: number, delta: number): void {
    this.sortDepth();
    this.followCarried();
    this.处理触摸动作();

    if (this.running && !this.finished && useGameStore.getState().phase === 'playing') {
      this.tickClock(delta);
      this.tickPlayer();
      this.tickNpc(delta);
    this.tickOrders(delta); // ⚠️ 工单倒计时（超时作废 + 扣分）
      this.tickProcessing(delta);
      this.tickPrinter(delta);
      this.tickInterference(delta);
      // 自动存档：每 3 秒写一次（localStorage 是同步 IO，不能每帧写）
      this.存档计时 += delta;
      if (this.存档计时 >= 3000) {
        this.存档计时 = 0;
        this.存这一局();
      }
    } else {
      (this.player.body as Phaser.Physics.Arcade.Body).setVelocity(0, 0);
      (this.npc.body as Phaser.Physics.Arcade.Body).setVelocity(0, 0);
    }

    this.updatePrompt();
    this.drawRing();
    this.pushSync(delta);
  }

  private sortDepth(): void {
    this.player.setDepth(this.player.y + 10);
    this.npc.setDepth(this.npc.y + 10);
    this.playerShadow.setPosition(this.player.x, this.player.y + 16).setDepth(1);
    this.npcShadow.setPosition(this.npc.x, this.npc.y + 16).setDepth(1);
    // ⚠️ 走路时的 1 像素浮动（**只有"没有行走图"的同事**才需要它来表示"在动"）。
    //    用 displayOrigin 而不是 `setY`：改 y 会和物理体重心打架（body 会把精灵拽回去），
    //    displayOrigin 只挪"画出来的位置"，物理一点不受影响。
    //
    // ⚠️⚠️ 但是——**有行走图的时候必须把原点还原成 (0.5, 0.5)**。
    //    原来这里无条件写 `48 + 浮动`：有行走图时浮动是 0，于是显示原点被设成
    //    `(16, 48)` = **原点 (0.5, 1)**，意思从"y 是精灵中心"变成了"y 是脚底"。
    //    后果有两个，都不好查：
    //      一、助手**看起来比该在的位置高 24px**；
    //      二、`携带位置()` 里按"y 是中心"算的偏移全部下移 24px →
    //          手里的稿子掉到**脚底下**，像隔空取物（用户报的"拿材料的姿势和主角不一样"）。
    //    实测：主角 origin (0.5,0.5) / 显示原点 (16,24)，助手却是 (0.5,1) / (16,48)。
    this.npc.setDisplayOrigin(16, this.有行走图(this.帮手名) ? 24 : 48 + this.走路的上下浮动());
  }

  /**
   * **手里那件东西拿在哪**。
   *
   * ⚠️ 用户要求：「拿文件的动画要优化，**不是和现在一样直接贴在头上**」。
   *    原来一律画在 `(x, y - 18)` —— 那正好是精灵的**头部**，所以看着像糊在脸上，
   *    而且深度写死 9500（永远压在所有东西最上面），更像贴了一张纸。
   *
   * 现在按朝向"**抱在身前**"，并且给一个正常的深度（人前面一点点 = 脚底 y + 11）：
   *   · 正面（下）：抱在胸腹前，画在人前面
   *   · 左 / 右：抱在**朝向那一侧的腰前**，画在人前面
   *   · 背面（上）：东西在身前、被身体挡着 —— 只从**右肩外侧**露一小截，
   *     而且**画在人后面**（不是顶在头上）
   * 走路时再加 1px 上下浮动，看着是"抱着走"而不是"粘在身上"。
   */
  private 携带位置(谁: '玩家' | '帮手'): { x: number; y: number; 深度: number; 缩放: number } {
    const 是玩家 = 谁 === '玩家';
    const 人 = 是玩家 ? this.player : this.npc;
    const 朝向 = 是玩家 ? this.facing : this.npcFacing;
    const 在走 = 是玩家 ? this.player.anims.isPlaying : this.npcMoving;
    const 浮 = 在走 ? Math.round(Math.sin(this.携带相位) * 1) : 0;

    // ⚠️ 关键：这件东西是 32×32，而人是 32×48 —— **原尺寸放不下**。
    //    不缩的话，抱在肚子高度会盖住下半张脸，抱低一点又会掉到脚底下。
    //    实测（tools/shots/携带/ 四张朝向图）：缩到 0.75、中心抬到 y+8 正好"卡在胸口到胯之间"，
    //    头上留出一整个脑袋、脚下还露着腿。
    if (朝向 === 'up') {
      // 背对镜头：东西在身前、被身体挡住 → **挪到右肩外侧**只露一角（不是顶在头上）
      return { x: 人.x + 10, y: 人.y - 13 + 浮, 深度: 人.y + 11, 缩放: 0.55 };
    }
    if (朝向 === 'left') return { x: 人.x - 8, y: 人.y + 8 + 浮, 深度: 人.y + 11, 缩放: 0.75 };
    if (朝向 === 'right') return { x: 人.x + 8, y: 人.y + 8 + 浮, 深度: 人.y + 11, 缩放: 0.75 };
    return { x: 人.x, y: 人.y + 8 + 浮, 深度: 人.y + 11, 缩放: 0.75 };
  }

  private followCarried(): void {
    if (this.player.anims.isPlaying) this.携带相位 += 0.16;

    const 我 = this.携带位置('玩家');
    this.carriedPaper
      .setPosition(我.x, 我.y)
      .setDepth(我.深度)
      .setScale(我.缩放)
      .setVisible(this.carrying !== null)
      .setTexture(this.carrying === 'draft' ? 图.稿子 : 图.任务单);

    const 他 = this.携带位置('帮手');
    this.npcPaper
      .setPosition(他.x, 他.y)
      .setDepth(他.深度)
      .setScale(他.缩放)
      .setVisible(this.npcCarrying !== null)
      .setTexture(this.npcCarrying === 'draft' ? 图.稿子 : 图.任务单);

    // 工序图标（用户要求"一眼看出做到哪一步"）：
    // ⚠️ 抱在手上时**盖在文件本身**（像盖在纸上的章），不再飘到纸的上方 ——
    //    飘上去正好压脸（实测 tools/shots/携带/ 四张朝向图）。
    this.同步图标(
      this.carriedIcons,
      this.carriedIconTags,
      this.carryTags,
      this.carrying ? 我.x : 0,
      this.carrying ? 我.y : 0,
      this.carrying !== null,
      0.62,
    );
    this.同步图标(
      this.npcIcons,
      this.npcIconTags,
      this.npcTags,
      this.npcCarrying ? 他.x : 0,
      this.npcCarrying ? 他.y : 0,
      this.npcCarrying !== null,
      0.62,
    );
  }

  private tickClock(delta: number): void {
    this.timeLeft = Math.max(0, this.timeLeft - delta / 1000);
    // 最后 30 秒：每 5 秒敲一下。**不吵**，但能让玩家感觉到"时间在走"——
    // 光看角落里的沙漏很容易忘（用户要求"时间要合理"）。
    if (this.timeLeft <= 30 && this.timeLeft > 0) {
      this.报时 -= delta;
      if (this.报时 <= 0) {
        this.报时 = 5000;
        播放('时间告急');
      }
    }
    if (this.timeLeft <= 0) this.endRun();
  }

  /** 四方向行走：动画来自地图那张 `chr_lks_walk`；Shift 走快一点（和地图同一套操作） */
  private tickPlayer(): void {
    const body = this.player.body as Phaser.Physics.Arcade.Body;
    const left = this.keyA.isDown || this.cursors.left.isDown;
    const right = this.keyD.isDown || this.cursors.right.isDown;
    const up = this.keyW.isDown || this.cursors.up.isDown;
    const down = this.keyS.isDown || this.cursors.down.isDown;

    // ⚠️ 移动端的虚拟摇杆走**同一条路**（DOM 写 `虚拟输入`，这里每帧读）——
    //    两套输入各写一份移动逻辑的话，迟早一边能斜走一边不能（键盘是 8 向、摇杆是任意角）。
    const 杆 = { x: 虚拟输入.x, y: 虚拟输入.y };
    const 有杆 = Math.abs(杆.x) > 0.15 || Math.abs(杆.y) > 0.15;
    const dx = 有杆 ? 杆.x : (right ? 1 : 0) - (left ? 1 : 0);
    const dy = 有杆 ? 杆.y : (down ? 1 : 0) - (up ? 1 : 0);

    if (dx === 0 && dy === 0) {
      body.setVelocity(0, 0);
      if (this.player.anims.isPlaying) this.player.anims.stop();
      this.player.setTexture(图.主角_走, 方向行[this.facing] * 4);
      return;
    }

    const 速度 = this.keyShift.isDown ? PLAYER_SPEED * 1.35 : PLAYER_SPEED;
    const 方向 = new Phaser.Math.Vector2(dx, dy).normalize().scale(速度);
    body.setVelocity(方向.x, 方向.y);

    /**
     * 朝向：**主轴优先**（和地图同一条规则）。
     * ⚠️ 原来写的是 `|dx| >= |dy|` —— 摇杆是模拟量，斜着推一点点就翻成左右；
     *    现在要求横向明显大于纵向（1.25 倍）才算横向，两者接近时保持上一次朝向。
     */
    const 横 = Math.abs(dx);
    const 纵 = Math.abs(dy);
    if (横 > 纵 * 1.25) this.facing = dx < 0 ? 'left' : 'right';
    else if (纵 > 横 * 1.25) this.facing = dy < 0 ? 'up' : 'down';

    const 名 = this.facing === 'down' ? '下' : this.facing === 'up' ? '上' : this.facing === 'left' ? '左' : '右';
    const 动画 = `走${名}`;
    if (!this.player.anims.isPlaying || this.player.anims.currentAnim?.key !== 动画) {
      this.player.anims.play(动画, true);
    }
  }

  /* ───────── 工序图标（胡闹厨房式：每加一样就在东西上盖一枚） ───────── */

  /** 图标 key（真素材优先；没出图时现画的那枚用的是**同一个 key**） */
  private static 图标键(工序: 工序): string {
    return 工序图标[工序] ?? `ic_${工序}`;
  }

  /**
   * 按"已完成的工序"造一串图标（水平排在 (x,y) 上）。
   * @param 缩放 图标大小。**抱在手上时调小**，让它像"盖在文件上的章"而不是第二张纸。
   */
  private 建图标(已完成: 工序[], x: number, y: number, 缩放 = 0.85): Phaser.GameObjects.Image[] {
    const 应显 = 全部工序.filter((g) => 已完成.includes(g));
    const 宽 = 8 * 缩放;
    return 应显.map((g, i) =>
      this.add
        .image(x - ((应显.length - 1) * 宽) / 2 + i * 宽, y, OfficeScene.图标键(g))
        .setDepth(9600)
        .setScale(缩放),
    );
  }

  private 清图标(图s: Phaser.GameObjects.Image[]): void {
    for (const i of 图s) i.destroy();
  }

  /**
   * 让一串图标跟着东西走。
   * ⚠️ 只有"工序变了"才重建（每帧重建会疯狂创建/销毁贴图对象）；
   *    没变就只挪位置。
   */
  private 同步图标(
    旧图: Phaser.GameObjects.Image[],
    旧标签: 工序[],
    新标签: 工序[],
    x: number,
    y: number,
    显示: boolean,
    缩放 = 0.85,
  ): void {
    const 变 = 旧标签.join(',') !== 新标签.join(',');
    if (变) {
      this.清图标(旧图);
      const 新图 = 显示 ? this.建图标(新标签, x, y, 缩放) : [];
      旧图.length = 0;
      旧图.push(...新图);
      旧标签.length = 0;
      旧标签.push(...新标签);
    } else {
      const 宽 = 8 * 缩放;
      for (const [i, img] of 旧图.entries()) {
        img.setPosition(x - ((旧图.length - 1) * 宽) / 2 + i * 宽, y).setScale(缩放).setVisible(显示);
      }
    }
  }

  /** 清空地面上的东西（连图标一起） */
  private 销毁地面物(): void {
    for (const g of this.ground) {
      g.sprite.destroy();
      this.清图标(g.icons);
    }
    this.ground = [];
  }

  /* ───────── 帮手：选谁、干什么、怎么不卡住 ───────── */

  /**
   * **选帮手**：优先选"和这单活相关的同事"，没有就随机抽一个。
   *
   * 用户要求：「AI 帮手是相关的同事，没有相关同事就是一个人，如果是多个就随机出一个」。
   * 工单的客户名长这样：`小鹿 · 校园方向`、`韩策 · 技术专栏`、`茶水间 · 内部通讯` ——
   * 所以判据就是"客户名里有没有出现某位能帮忙的同事"。
   */
  private 选帮手(订单们: 订单[]): string {
    const 相关 = 订单们.filter((o) => 帮手候选.some((名) => o.客户.includes(名)));
    if (相关.length) {
      const 单 = 相关[Phaser.Math.Between(0, 相关.length - 1)];
      return 帮手候选.find((名) => 单.客户.includes(名)) ?? 帮手候选[0];
    }
    // 一个相关的都没有 → 随机抽一位（"没有相关同事就是一个人"）
    return 帮手候选[Phaser.Math.Between(0, 帮手候选.length - 1)];
  }

  /** 换帮手（换贴图；有行走图就用行走图里的站姿帧） */
  private 换帮手(名: string): void {
    this.帮手名 = 名;
    this.npcFacing = 'down';
    /**
     * ⚠️⚠️ 用户日志里那条崩溃就是这行：
     *    Cannot read properties of undefined (reading 'isPlaying')
     *    **场景被销毁之后**（重来 / 退出关卡），旧监听还会跑 beginRun() →
     *    这时 this.npc 上的 anims 已经没了 ✗
     *    （总线那边做了异常隔离 ✔，但这里也不该抛 ✗）
     */
    if (this.npc?.anims?.isPlaying) this.npc.anims.stop();
    if (this.有行走图(名)) {
      this.npc.setTexture(同事行走图[名], 方向行.down * 4);
      return;
    }
    const key = 同事立绘[名];
    if (key && this.textures.exists(key)) this.npc.setTexture(key, NPC朝向帧[0]);
  }

  /**
   * 帮手的每帧逻辑。
   *
   * 他要干的事是一条**完整链路**：挑一单 → 去文件柜领单 → 逐道工序做完 → 交稿。
   * 但三件事让他**永远抢不过玩家**（用户要求"很慢，大部分还是要玩家来完成"）：
   *   一、走路比玩家慢（`NPC_SPEED` < `PLAYER_SPEED`）
   *   二、每道工序耗时是玩家的近三倍（`NPC_PROCESS_TIME`）
   *   三、干完一单会**歇一会儿**（`NPC_IDLE_RANGE`）
   */
  private tickNpc(delta: number): void {
    const body = this.npc.body as Phaser.Physics.Arcade.Body;
    const dt = delta / 1000;

    this.npcTalkTimer -= delta;
    if (this.npcTalkTimer <= 0) {
      this.npcTalkTimer = Phaser.Math.Between(15_000, 22_000);
      this.say(this.帮手名, NPC_TALK[Phaser.Math.Between(0, NPC_TALK.length - 1)]);
    }

    // ── 看门狗：判断"他还在动吗" ──
    // ⚠️ 这是用户点名的要求（"AI 帮手又有自己的工作逻辑，要不然会卡住"）。
    //    只要位置在变、或者正在做工，就算"有进展"；一旦卡住太久就重新规划 + 挪回出生点。
    const 这一帧动了 = Math.hypot(this.npc.x - this.npcLastX, this.npc.y - this.npcLastY) > 0.4;
    this.npcLastX = this.npc.x;
    this.npcLastY = this.npc.y;
    if (这一帧动了 || this.npcState === 'working') {
      this.npcWatchdog = NPC_WATCHDOG[this.npcState];
    } else {
      this.npcWatchdog -= dt;
      if (this.npcWatchdog <= 0) {
        this.帮手重规划();
        return;
      }
    }

    this.npcMoving = false;
    // 只有"正在做工"时才显示进度条 —— 其它状态一律收起来
    if (this.npcState !== 'working') this.npcBar?.setVisible(false);

    switch (this.npcState) {
      case 'idle': {
        body.setVelocity(0, 0);
        this.npcTimer -= dt;
        if (this.npcTimer <= 0) this.帮手接活();
        break;
      }
      case 'toFiles': {
        if (this.走向(this.空接近格('files'))) {
          this.npcCarrying = 'blank';
          this.npcTags = [];
          this.npcState = 'toStation';
          this.npcTargetStation = null;
        }
        break;
      }
      case 'toStation': {
        if (!this.npcTargetStation) {
          const 下一道 = this.npcPlan[0];
          const 台 = this.stations.find((s) => s.工序 === 下一道);
          if (!台) {
            // 这一单要的工序在关卡里找不到（数据不一致）→ 放弃，别卡着
            this.帮手重规划();
            return;
          }
          this.npcTargetStation = 台;
        }
        if (this.走向(this.空接近格(this.npcTargetStation.kind))) {
          this.npcState = 'working';
          this.npcProgress = 0;
          body.setVelocity(0, 0);
        }
        break;
      }
      case 'working': {
        body.setVelocity(0, 0);
        // 技能卡「坐在最前面（找人帮忙）」：20 秒内他快 3 倍
        this.npcProgress += dt / (NPC_PROCESS_TIME / (this.npcBoost > 0 ? 3 : 1));
        // 头顶进度条：让人一眼看出"他真的在干这一道工序"
        if (this.npcBar) {
          this.npcBar.setVisible(true);
          this.npcBar.setPosition(this.npc.x, this.npc.y - 44);
          this.npcBar.width = Math.max(2, 26 * Math.min(1, this.npcProgress));
        }
        if (this.npcProgress >= 1) {
          const 台 = this.npcTargetStation;
          this.npcProgress = 0;
          this.npcTargetStation = null;
          if (台?.工序) {
            if (!this.npcTags.includes(台.工序)) this.npcTags.push(台.工序);
            this.npcCarrying = 'draft';
            this.fx.explode(5, 台.wx, 台.wy - 18);
          }
          this.npcPlan.shift();
          this.npcState = this.npcPlan.length ? 'toStation' : 'toBin';
        }
        break;
      }
      case 'toBin': {
        if (this.走向(this.空接近格('bin'))) {
          const 命中 = 匹配订单(this.npcTags, this.orders);
          if (命中) {
            this.完成订单(命中, this.帮手名);
          } else {
            this.fx.explode(4, this.stationOf('bin').wx, this.stationOf('bin').wy - 18);
          }
          this.npcCarrying = null;
          this.npcTags = [];
          this.npcOrder = null;
          this.npcState = 'idle';
          this.npcTimer = Phaser.Math.Between(NPC_IDLE_RANGE[0] * 1000, NPC_IDLE_RANGE[1] * 1000) / 1000;
          body.setVelocity(0, 0);
        }
        break;
      }
    }
  }

  /** 接一单活：优先接"自己相关的"那一单，否则接工序最少的那单 */
  private 帮手接活(): void {
    if (!this.orders.length) {
      this.npcState = 'idle';
      this.npcTimer = 1.5;
      return;
    }
    const 自己的 = this.orders.filter((o) => o.客户.includes(this.帮手名));
    const 池 = 自己的.length ? 自己的 : this.orders;
    const 单 = [...池].sort((a, b) => a.需要.length - b.需要.length)[0];
    this.npcOrder = 单;
    this.npcPlan = [...单.需要];
    this.npcTargetStation = null;
    this.npcState = 'toFiles';
    this.npcWatchdog = NPC_WATCHDOG.toFiles;
  }

  /**
   * 卡住了 / 这一单做不下去了 → 丢掉手上的活回待命。
   * ⚠️ 顺手把人挪回出生点：卡住最常见的原因是"被家具或同事顶住了"，
   *    只清状态不挪人，下一轮还会原地卡住。
   */
  private 帮手重规划(): void {
    this.npcPath = [];
    this.npcPath目标 = '';
    this.npcOrder = null;
    this.npcPlan = [];
    this.npcCarrying = null;
    this.npcTags = [];
    this.npcProgress = 0;
    this.npcTargetStation = null;
    this.npcState = 'idle';
    this.npcTimer = Phaser.Math.Between(600, 1600) / 1000;
    this.npcWatchdog = NPC_WATCHDOG.idle;
    (this.npc.body as Phaser.Physics.Arcade.Body).setVelocity(0, 0);
    const 出 = tileToWorld(this.关卡.npc.col, this.关卡.npc.row);
    if (Phaser.Math.Distance.Between(this.npc.x, this.npc.y, 出.x, 出.y) > 6) {
      this.npc.setPosition(出.x, 出.y);
      this.npc.body?.reset(出.x, 出.y);
    }
  }

  /** 工位的名字（给帮手的状态文案用） */
  private 工位贴图名(kind: StationRuntime['kind']): string {
    return this.stations.find((s) => s.kind === kind)?.label ?? '工位';
  }

  /** 朝向 → 同事立绘的帧号（和地图的 NPC朝向帧 同一套：下/上/左/右） */
  private 朝向帧(朝向: Facing): number {
    return NPC朝向帧[朝向 === 'down' ? 0 : 朝向 === 'up' ? 1 : 朝向 === 'left' ? 2 : 3] ?? 0;
  }

  /**
   * 朝某个点走；到了返回 true。
   *
   * ⚠️ 同事**没有四方向行走图**（`npc_*.png` 只有 6 个姿势格），所以"走路"是
   *    **朝向帧 + 1 像素上下浮动**（见 `走路的上下浮动`）。
   *    真行走图到位之后（`美术/提示词-12-关卡升级.md` 组 1），把这里换成
   *    `sprite.anims.play(...)` 即可，其余逻辑不用动。
   */
  /** 格子坐标（关卡约定：`tileToWorld = col*32+16`，所以反算是 floor(像素/32)）*/
  private 格(x: number, y: number): { col: number; row: number } {
    return { col: Math.floor(x / TILE), row: Math.floor(y / TILE) };
  }

  /**
   * **BFS 找路**（4 邻接）。返回**不含起点**的格子序列；走不到返回 null。
   *
   * ⚠️ 为什么必须有它：地图加了隔断/小间之后，帮手原来那条"朝目标直线走"
   *    （`physics.moveTo`）会**直接撞在玻璃上卡住** ——
   *    实测：只加了 2 格玻璃，他就从 `toFiles` 直接掉进 `idle`（被看门狗救回来的）。
   *    地图越复杂，越必须让他**绕着走**。
   */
  private 找路(
    从: { col: number; row: number },
    到: { col: number; row: number },
  ): Array<{ col: number; row: number }> | null {
    const 键 = (c: number, r: number): number => c * 1000 + r;
    const 起 = 键(从.col, 从.row);
    if (起 === 键(到.col, 到.row)) return [];
    const 前 = new Map<number, number>();
    const 见 = new Set<number>([起]);
    const 队: Array<[number, number]> = [[从.col, 从.row]];
    let 找到 = false;
    while (队.length) {
      const [c, r] = 队.shift() as [number, number];
      if (c === 到.col && r === 到.row) {
        找到 = true;
        break;
      }
      for (const [dc, dr] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ] as Array<[number, number]>) {
        const nc = c + dc;
        const nr = r + dr;
        const k = 键(nc, nr);
        if (见.has(k) || !能走(this.关卡, nc, nr)) continue;
        见.add(k);
        前.set(k, 键(c, r));
        队.push([nc, nr]);
      }
    }
    if (!找到) return null;
    const 路: Array<{ col: number; row: number }> = [];
    let 游 = 键(到.col, 到.row);
    while (游 !== 起) {
      const 上一 = 前.get(游);
      if (上一 === undefined) return null;
      路.push({ col: Math.floor(游 / 1000), row: 游 % 1000 });
      游 = 上一;
    }
    return 路.reverse();
  }

  /**
   * **站位的"备选格"**。
   *
   * ⚠️ 用户报的「AI 队友会卡住」最常见的成因：他要去的那格**被玩家站住了** ——
   *    原来 `approachOf` 只给一格，走不到就一直在那儿挤（看门狗要等好几秒才重规划，
   *    玩家看到的就是"他卡住了"）。
   *    现在：主格被玩家占了就**就近换一格能走的**（仍在交互半径内，不算"没到位"）。
   */
  private 空接近格(kind: StationRuntime['kind']): { x: number; y: number } {
    const 主 = this.approachOf(kind);
    const 玩 = this.格(this.player.x, this.player.y);
    const 主格 = this.格(主.x, 主.y);
    if (!(主格.col === 玩.col && 主格.row === 玩.row)) return 主;
    const 台 = this.stationOf(kind);
    for (const [dx, dy] of [
      [0, 1],
      [0, -1],
      [1, 0],
      [-1, 0],
      [1, 1],
      [-1, 1],
      [1, -1],
      [-1, -1],
    ]) {
      const c = 台.col + dx;
      const r = 台.row + dy;
      if (c === 玩.col && r === 玩.row) continue;
      if (!能走(this.关卡, c, r)) continue;
      const 点 = tileToWorld(c, r);
      // ⚠️ 必须在交互半径内 —— 否则"他站在三格之外也算到位"，观感上就是"没走过去就干活了"
      if (Phaser.Math.Distance.Between(点.x, 点.y, 台.wx, 台.wy) <= INTERACT_RADIUS * 1.8) return 点;
    }
    return 主;
  }

  private 走向(目标: { x: number; y: number }): boolean {
    const 到 = this.格(目标.x, 目标.y);
    const 我 = this.格(this.npc.x, this.npc.y);
    const 目标键 = `${到.col},${到.row}`;

    // 目标格变了就重新找路（每帧找一次 BFS 是白烧 CPU）
    if (this.npcPath目标 !== 目标键) {
      this.npcPath = this.找路(我, 到) ?? [];
      this.npcPath目标 = 目标键;
      this.npc最近距 = Number.POSITIVE_INFINITY;
      this.npc卡住帧 = 0;
    }

    /**
     * **防卡死**：看"有没有比之前更接近目标"。
     * ⚠️ 不能用"这一帧动没动"——贴着墙抖也算动（那是原来失效的原因）。
     * ⚠️ 150 帧 ≈ 2.5 秒（60fps）：够他绕过一个人，又不至于让玩家干等。
     */
    const 距 = Phaser.Math.Distance.Between(this.npc.x, this.npc.y, 目标.x, 目标.y);
    if (距 < this.npc最近距 - 3) {
      this.npc最近距 = 距;
      this.npc卡住帧 = 0;
    } else {
      this.npc卡住帧 += 1;
      if (this.npc卡住帧 > 150) {
        this.npc卡住帧 = 0;
        this.npc最近距 = Number.POSITIVE_INFINITY;
        this.帮手重规划();
        return false;
      }
    }
    if (我.col === 到.col && 我.row === 到.row) this.npcPath = [];

    // 沿着路走：到下一格中心就换下一格
    if (this.npcPath.length) {
      const 下一 = this.npcPath[0];
      const 点 = tileToWorld(下一.col, 下一.row);
      if (Phaser.Math.Distance.Between(this.npc.x, this.npc.y, 点.x, 点.y) < 5) this.npcPath.shift();
    }
    const 走点 = this.npcPath.length ? tileToWorld(this.npcPath[0].col, this.npcPath[0].row) : 目标;

    if (!this.npcPath.length && Phaser.Math.Distance.Between(this.npc.x, this.npc.y, 目标.x, 目标.y) < 6) {
      (this.npc.body as Phaser.Physics.Arcade.Body).setVelocity(0, 0);
      this.npcMoving = false;
      this.停下();
      return true;
    }

    this.physics.moveTo(this.npc, 走点.x, 走点.y, NPC_SPEED);
    this.npcMoving = true;
    const dx = 走点.x - this.npc.x;
    const dy = 走点.y - this.npc.y;
    const 朝向: Facing = Math.abs(dx) >= Math.abs(dy) ? (dx < 0 ? 'left' : 'right') : dy < 0 ? 'up' : 'down';
    /**
     * ⚠️⚠️ 别每帧无条件改朝向 —— 用户报的「队友动画错乱、一直摆头」就是这么来的：
     *    他走到**航点那一帧**时 dx/dy 都≈0，原来的写法 `|dx| >= |dy| ? 左/右`
     *    会判成 **left** ✗ → 下一帧又变回去 → 相当于**每到一个格子就甩一次头** ✔
     *    现在：dx/dy 都很小 → **保持上一次朝向**；只有明显偏某个轴才换 ✔
     */
    if (Math.abs(dx) > 1 || Math.abs(dy) > 1) {
      const 横 = Math.abs(dx);
      const 纵 = Math.abs(dy);
      this.npcFacing =
        横 > 纵 * 1.15 ? (dx < 0 ? 'left' : 'right') : 纵 > 横 * 1.15 ? (dy < 0 ? 'up' : 'down') : this.npcFacing;
    }

    // ⚠️ 两条路：**有行走图就播真动画**；没有就退回"朝向帧 + 1px 浮动"（旧素材的兜底）
    if (this.有行走图(this.帮手名)) {
      const 动画 = `行_${this.帮手名}_${朝向}`;
      this.npc.setFlipX(false);
      if (!this.npc.anims.isPlaying || this.npc.anims.currentAnim?.key !== 动画) {
        this.npc.anims.play(动画, true);
      }
    } else {
      this.npc.setTexture(同事立绘[this.帮手名] ?? 'npc_mai', this.朝向帧(朝向));
      this.npc.setFlipX(false);
    }
    return false;
  }

  /**
   * 走路时的 1 像素浮动（0 或 -1）—— **只给"没有行走图"的同事兜底**。
   * ⚠️ 有真行走图时**必须返回 0**：动画本身已经在动，
   *    再叠一层浮动就是抖（而且 `setDisplayOrigin` 会和动画帧争夺绘制原点）。
   */
  private 走路的上下浮动(): number {
    if (!this.npcMoving) return 0;
    if (this.有行走图(this.帮手名)) return 0;
    this.npcBob += 0.016;
    return Math.floor(this.npcBob * 6) % 2 === 0 ? 0 : -1;
  }

  /* ───────── 加工（查资料 / 写稿 / 校对） ───────── */

  /** 这一台怎么推进（没写就按"等待"算） */
  private 机制(台: StationRuntime): '连按' | '等待' {
    return 台.机制 ?? '等待';
  }

  /**
   * 连按型工位（查资料 / 写稿）的进度**只在按 E 时涨**，所以这里只需要处理"人走开了 / 手上没东西了"。
   * ⚠️ 参数不用 delta（连按型不吃时间）—— 但保留签名，免得调用点看着莫名其妙。
   */
  private tickProcessing(_delta: number): void {
    if (!this.processingStation) return;
    const station = this.processingStation;
    const away =
      Phaser.Math.Distance.Between(this.player.x, this.player.y, station.wx, station.wy) > INTERACT_RADIUS + 10;
    if (away || !this.carrying) {
      this.processingStation = null;
      this.processing = 0;
      this.say('系统', '这一步中断了：离开工位就得重来。');
      return;
    }
    // ⚠️⚠️ **连按型的进度只在 `干活()`（E 键）里涨**，时间对它没有任何作用
    //    （用户要求："盖章等改为按 E 键来增加进度，不是时间来增加"）。
    //    而**打印机根本不走这里**：它是"放进去等出来"的槽，由 `tickPrinter()` 管，
    //    和玩家站在哪儿都无关（用户要求："直接可以把文章放进去等文章出来就行了"）。
    if (this.机制(station) !== '连按') {
      this.processingStation = null;
      this.processing = 0;
      return;
    }
  }

  /** 一道工序做完：盖章、飘字、把这件东西标记成"已经过这道工序" */
  private 工序完成(台: StationRuntime): void {
    const tag = 台.工序;
    this.processing = 0;
    this.processingStation = null;
    if (!tag) return;
    if (!this.carryTags.includes(tag)) this.carryTags.push(tag);
    this.carrying = 'draft';
    播放('工序完成');
    this.fx.explode(6, 台.wx, 台.wy - 18);
    this.cameras.main.shake(70, 0.002);
    this.say('系统', `做完「${tag}」`);
  }

  /**
   * **E 键：干活**（用户指定的新操作）。
   *
   *   · **连按型**（查资料 / 写稿）：按一下加一截，`连按几下` 下做完
   *   · **等待型**（打印机）：按一下"送进去"，然后自己走 `打印秒数` 秒，**人不能走开**
   *
   * 不在工位上时，E 退回原来那套上下文交互（捡东西 / 交稿）—— 老玩家按 E 也不会失灵。
   */
  private 干活(): void {
    if (!this.可以在关卡里操作()) return;
    const 台 = this.processingStation ?? this.nearestStation();
    if (!台 || !台.工序) {
      this.interact();
      return;
    }
    if (!this.carrying) {
      this.say('系统', '手上没有任务单，先去文件柜领一张。');
      return;
    }
    const 机制 = this.机制(台);
    if (机制 === '等待') {
      // ── 打印机：**放进去就完事**（每次只能放一个）──
      if (this.打印槽) {
        const 剩 = Math.max(0, this.打印槽.剩余).toFixed(1);
        this.say('系统', `打印机里已经有一份了，还差 ${剩} 秒出来。`);
        return;
      }
      if (this.打印产出id !== null) {
        this.say('系统', '出纸口那一份还没拿走呢（一次只能一份）。');
        return;
      }
      this.打印槽 = { 已有: [...this.carryTags], 目标: 台.工序, 剩余: 打印秒数 };
      this.carrying = null; // 稿子交给机器了，人空手 —— 可以先去干别的
      this.carryTags = [];
      播放('放进打印机');
      this.fx.explode(5, 台.wx, 台.wy - 18);
      this.say('系统', `放进去了：${打印秒数} 秒后出来，你去忙别的吧。`);
      return;
    }
    if (!this.processingStation) {
      this.processingStation = 台;
      this.processing = 0;
    }
    if (机制 === '连按') {
      this.processing = Math.min(1, this.processing + 1 / 连按几下);
      播放('干活');
      this.fx.explode(3, 台.wx, 台.wy - 18);
      if (this.processing >= 1) this.工序完成(台);
    }
  }

  private tickInterference(delta: number): void {
    if (this.binLockedFor > 0) {
      this.binLockedFor -= delta;
      if (this.binLockedFor <= 0) {
        this.stationOf('bin').sprite.clearTint();
        this.say('系统', '交稿箱重新开放。');
      }
      return;
    }
    this.binLockTimer -= delta;
    if (this.binLockTimer <= 0) {
      this.binLockTimer = BIN_LOCK_INTERVAL;
      this.binLockedFor = BIN_LOCK_DURATION;
      this.stationOf('bin').sprite.setTint(0xff6b4a);
      this.cameras.main.flash(160, 255, 90, 60);
      this.say('系统', '程女士那边在改要求：交稿箱暂停接收，先把手上这版做完。');
    }
  }

  /* ───────── 交互 ───────── */

  /** 空格：上下文交互。空手→捡地上的/领任务单；手上有→用工位/交稿；空地上→放下 */
  private interact(): void {
    if (!this.可以在关卡里操作()) return;
    if (this.processingStation) return;

    const 地面物 = this.附近的地面物();
    const 台 = this.nearestStation();

    if (!this.carrying) {
      if (地面物) {
        this.捡起(地面物);
        return;
      }
      if (台?.kind === 'files') {
        this.carrying = 'blank';
        this.carryTags = [];
        this.fx.explode(4, 台.wx, 台.wy - 18);
        return;
      }
      if (台?.工序) return this.say('系统', '手上没有任务单，先去文件柜领一张。');
      return;
    }

    if (台?.kind === 'bin') {
      if (this.binLockedFor > 0) return this.say('系统', '交稿箱暂停接收，等一下再交。');
      this.交付();
      return;
    }
    if (台?.工序) {
      // ⚠️ 加工**只走 E 键**（用户指定）。空格在这里只提醒，不改机制。
      const 机制 = this.机制(台);
      return this.say(
        '系统',
        机制 === '等待'
          ? `要打印就按 E（${打印秒数} 秒）`
          : `要${台.工序}就按 E（连按 ${连按几下} 下）`,
      );
    }
    if (台?.kind === 'files') return this.say('系统', '一次只能领一张任务单。');
    /**
     * ⚠️ 用户要求「**可以把文件扔进垃圾桶丢弃**」——
     *    判定放在「放地上」**之前** ✔（挨着垃圾桶时优先丢弃 ✗）
     *    只有拿着东西、且真的站在垃圾桶边上才会走这条 ✔
     */
    if (this.carrying && this.挨着垃圾桶()) return this.丢进垃圾桶();
    this.丢下();
  }

  private 附近的地面物(): GroundRuntime | null {
    let best: GroundRuntime | null = null;
    let bestDistance = 26;
    for (const item of this.ground) {
      const d = Phaser.Math.Distance.Between(this.player.x, this.player.y, item.x, item.y);
      if (d < bestDistance) {
        bestDistance = d;
        best = item;
      }
    }
    return best;
  }

  private 捡起(item: GroundRuntime): void {
    播放('拿放稿子');
    if (item.id === this.打印产出id) this.打印产出id = null;
    this.carrying = item.kind;
    this.carryTags = [...item.工序];
    item.sprite.destroy();
    this.清图标(item.icons);
    this.ground = this.ground.filter((g) => g !== item);
    this.say('系统', item.工序.length ? `捡起：已经做完 ${item.工序.join('、')}` : '捡起：还没动过的任务单');
  }

  /** 把手上的东西放到地上（胡闹厨房式：随时能扔，也随时能再捡）—— **工序图标一起落地** */
  /**
   * 在地上生成一件东西（**丢下**和**打印机出纸**共用）。
   * 超过 `GROUND_LIMIT` 就把最旧的一件清掉（免得满地都是纸）。
   */
  private 造地面物(x: number, y: number, kind: CarryKind, 工序们: 工序[]): GroundRuntime {
    this.groundSeq += 1;
    const sprite = this.add.image(x, y, kind === 'draft' ? 图.稿子 : 图.任务单);
    sprite.setDepth(4);
    const icons = this.建图标(工序们, x, y - 10);
    for (const i of icons) i.setDepth(5);
    const 物: GroundRuntime = { id: this.groundSeq, 工序: [...工序们], kind, x, y, sprite, icons };
    this.ground.push(物);
    if (this.ground.length > GROUND_LIMIT) {
      const 最旧 = this.ground.shift();
      最旧?.sprite.destroy();
      if (最旧) this.清图标(最旧.icons);
    }
    return 物;
  }

  /** 把手上的东西放到地上（胡闹厨房式：随时能扔，也随时能再捡）—— **工序图标一起落地** */
  /** 玩家是不是**挨着某个垃圾桶**（用于「扔进去丢弃」） */
  private 挨着垃圾桶(): boolean {
    return this.垃圾桶们.some(
      (t) => Phaser.Math.Distance.Between(this.player.x, this.player.y, t.x, t.y) < 40,
    );
  }

  /**
   * **把手上的稿子/任务单丢进垃圾桶**（用户要求新增的操作 ✔）。
   *
   * ⚠️ 和 丢下() 的区别：这个**直接销毁**、地上不留东西 ✔
   *    （放地上那份是「随时能再捡」，扔垃圾桶就是不要了 ✗）
   * ⚠️ 丢弃**不扣分** —— 这是玩家的正常操作，不是失误 ✗
   *    （真正扣分的只有「工单超时」，见 tickOrders ✔）
   */
  private 丢进垃圾桶(): void {
    if (!this.carrying) return;
    播放('交稿退回', 0.7);
    this.carrying = null;
    this.carryTags = [];
    useGameStore.getState().toast('系统', '扔进垃圾桶了。');
  }

  private 丢下(): void {
    if (!this.carrying) return;
    播放('拿放稿子');
    this.造地面物(
      this.player.x + (this.朝向向量().x || 0) * 14,
      this.player.y + 10,
      this.carrying,
      this.carryTags,
    );
    this.carrying = null;
    this.carryTags = [];
  }

  /**
   * **打印机**：放进去的那一份自己走时间，**和玩家在哪没关系**。
   * 到点从出纸口吐出一件地面物（工序原样带回来），玩家自己来拿。
   */
  private tickPrinter(delta: number): void {
    if (!this.打印槽) return;
    const 槽 = this.打印槽;
    槽.剩余 -= delta / 1000;
    const 台 = this.stationOf('print');
    // 工作的时候让机器有点动静（不然玩家不知道它在跑）
    台.sprite.setTint(0xbfe6ff);
    if (槽.剩余 > 0) return;
    this.打印槽 = null;
    台.sprite.clearTint();
    const 工序们 = 槽.已有.includes(槽.目标) ? 槽.已有 : [...槽.已有, 槽.目标];
    const 出纸口 = this.approachOf('print');
    const 物 = this.造地面物(出纸口.x, 出纸口.y, 'draft', 工序们);
    this.打印产出id = 物.id;
    播放('打印完成');
    this.fx.explode(8, 台.wx, 台.wy - 18);
    this.cameras.main.flash(70, 200, 230, 255);
    this.say('系统', '文章出来了 —— 就在打印机旁边，过去拿。');
  }

  private 朝向向量(): { x: number; y: number } {
    if (this.facing === 'left') return { x: -1, y: 0 };
    if (this.facing === 'right') return { x: 1, y: 0 };
    if (this.facing === 'up') return { x: 0, y: -1 };
    return { x: 0, y: 1 };
  }

  private 交付(): void {
    const 命中 = 匹配订单(this.carryTags, this.orders);
    if (!命中) {
      播放('交稿退回');
      this.failed += 1;
      const 最近 = this.orders
        .map((o) => ({ o, 缺: 缺少工序(this.carryTags, o) }))
        .sort((a, b) => a.缺.length - b.缺.length)[0];
      const 提示 = 最近 ? `还差「${最近.缺.join('、')}」，或者这版不对这个客户的活` : '没有对得上的工单';
      this.say('系统', `交错了：${提示}`);
      this.cameras.main.shake(120, 0.004);
      this.carrying = null;
      this.carryTags = [];
      return;
    }
    this.完成订单(命中, '你');
    this.carrying = null;
    this.carryTags = [];
  }

  private 完成订单(order: 订单, who: string): void {
    播放('交稿成功');
    const idx = this.orders.indexOf(order);
    if (idx >= 0) this.orders.splice(idx, 1, this.造单(this.delivered));
    this.delivered += 1;
    const bin = this.stationOf('bin');
    this.fx.explode(who === '你' ? 16 : 8, bin.wx, bin.wy - 18);
    if (who === '你') {
      this.cameras.main.flash(90, 255, 210, 120);
      this.cameras.main.shake(120, 0.006);
    }
    this.say(who === '你' ? '系统' : who, `${order.客户} 这一版交了（${order.需要.join('+') || '直接交'}）`);
    const store = useGameStore.getState();
    store.orderDone();
    // ⚠️ 技能卡**要在关内发**：打完才给就只是个结算装饰（用户要求"重新拿过来、使其合理并且有趣"）。
    //    每交 `每几版发一张` 版发一张，交稿数从 1 开始数（第 2、4、6…版）。
    if (this.delivered % 每几版发一张 === 0 && store.cards.length < 最多持卡) {
      const 新卡 = 下一张卡(store.cards, this.delivered);
      store.给卡(新卡);
      this.say('系统', `交得多了，攒下一张技能卡：「${新卡.name}」—— 按 1/2/3 用。`);
      this.fx.explode(10, this.player.x, this.player.y - 22);
    }
    if (this.delivered >= QUOTA) this.endRun();
  }

  private updatePrompt(): void {
    const 台 = this.nearestStation();
    const 地面物 = this.附近的地面物();
    for (const item of this.stations) item.glow.setVisible(false);
    if (台) 台.glow.setVisible(true);

    let text: string;
    const 打印剩 = this.打印槽 ? Math.max(0, this.打印槽.剩余) : 0;
    if (this.processingStation) {
      const 连台 = this.processingStation;
      const 还差 = Math.max(0, Math.ceil((1 - this.processing) * 连按几下));
      text = `按 E · 做「${连台.工序 ?? '活'}」 ${Math.round(this.processing * 100)}%（还差 ${还差} 下）`;
    } else if (台?.kind === 'print') {
      // 打印机是"放进去等出来"的槽 —— 站在旁边时把三种状态说清楚
      text = this.打印槽
        ? `打印机里在工作… 还差 ${打印剩.toFixed(1)} 秒（**你可以先干别的**）`
        : this.打印产出id !== null
          ? '空格 · 把出纸口那份文章拿走'
          : !this.carrying
            ? '先领一张任务单，做完前面的工序再来打印'
            : `按 E · 把稿子放进打印机（${打印秒数} 秒后出来，一次只能一份）`;
    } else if (!this.carrying) {
      if (地面物) text = '空格 · 捡起地上的东西';
      else if (台?.kind === 'files') text = '空格 · 领一张任务单';
      else text = '去文件柜领一张任务单';
    } else if (台?.kind === 'bin') {
      text = '空格 · 交稿';
    } else if (台?.工序) {
      text = `按 E · 做「${台.工序}」（连按 ${连按几下} 下）`;
    } else if (台?.kind === 'files') {
      text = '手上已经有一张任务单了';
    } else {
      // ⚠️ 挨着垃圾桶时提示改成「丢弃」（用户要求：文件可以扔进垃圾桶 ✔）
      text =
        this.carrying && this.挨着垃圾桶()
          ? '空格 · 丢进垃圾桶（丢弃这份）'
          : '空格 · 把手上的东西放下（Q 也可以丢）';
    }

    const store = useGameStore.getState();
    if (store.prompt !== text) store.setPrompt(text);
  }

  private say(speaker: string, text: string): void {
    const store = useGameStore.getState();
    store.toast(speaker, text);
    const latest = useGameStore.getState().toasts.at(-1);
    if (latest) this.time.delayedCall(3000, () => useGameStore.getState().dismissToast(latest.id));
  }

  private pushSync(delta: number): void {
    this.syncAcc += delta;
    if (this.syncAcc < 80) return;
    this.syncAcc = 0;
    useGameStore.getState().sync({
      delivered: this.delivered,
      failed: this.failed,
      timeLeft: this.timeLeft,
      carrying: this.carrying,
      carryTags: this.carryTags,
      orders: this.orders,
      ground: this.ground.map((g) => ({ id: g.id, 工序: g.工序, x: g.x, y: g.y })),
      processing: this.processing,
      processingTag: this.processingStation?.工序 ?? null,
      /** 打印机里那一份（"放进去等出来"，玩家走开也要能看到还剩几秒） */
      打印: this.打印槽 ? { 工序: this.打印槽.目标, 剩余: Number(this.打印槽.剩余.toFixed(1)) } : null,
      /** 帮手现在在干嘛（顶部任务条要显示，玩家才知道他在帮忙） */
      帮手: {
        名: this.帮手名,
        状态: this.npcState === 'working' ? `正在做「${this.npcTargetStation?.工序 ?? '活'}」` : this.npcStateText(),
        手上: this.npcCarrying,
        工序: this.npcTags,
      },
    });
  }

  /** 帮手状态说人话（给顶部任务条显示） */
  private npcStateText(): string {
    switch (this.npcState) {
      case 'idle':
        return '在歇一会儿';
      case 'toFiles':
        return '去文件柜领单';
      case 'toStation':
        return `去${this.npcTargetStation ? this.工位贴图名(this.npcTargetStation.kind) : '工位'}`;
      case 'working':
        return '正在做工';
      case 'toBin':
        return '去交稿';
      default:
        return '在忙';
    }
  }

  private endRun(): void {
    if (this.finished) return;
    this.finished = true;
    this.running = false;
    // 这一局结束了：关卡存档该清了（不然刷新会又跳回一个已经打完的局）
    清关卡存档();
    const rating =
      this.delivered >= QUOTA ? 'S' : this.delivered >= QUOTA - 1 ? 'A' : this.delivered >= QUOTA - 2 ? 'B' : 'C';
    useGameStore.getState().finish(rating);
    useGameStore.getState().setPrompt('');
    this.cameras.main.flash(200, 255, 255, 255);
  }

  private drawRing(): void {
    this.ring.clear();
    if (!this.processingStation) return;
    const { wx, wy } = this.processingStation;
    this.ring.lineStyle(3, 0xffb020, 1);
    this.ring.beginPath();
    this.ring.arc(wx, wy - 30, 11, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * this.processing, false);
    this.ring.strokePath();
  }

  private nearestStation(): StationRuntime | null {
    let best: StationRuntime | null = null;
    let bestDistance = INTERACT_RADIUS;
    for (const station of this.stations) {
      const distance = Phaser.Math.Distance.Between(this.player.x, this.player.y, station.wx, station.wy);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = station;
      }
    }
    return best;
  }

  private stationOf(kind: StationRuntime['kind']): StationRuntime {
    const station = this.stations.find((item) => item.kind === kind);
    if (!station) throw new Error(`缺少工位：${kind}`);
    return station;
  }

  /**
   * 工位旁边"能站人"的那一格。
   * ⚠️ 判据用 `!COLLIDING_TILES.includes(值)`，不是 `值 === 0` ——
   *    这一关的地面有地毯/走廊地砖两种，写死 0 的话走廊边上的工位会被判成"没有可站的相邻格"。
   */
  private approachOf(kind: StationRuntime['kind']): { x: number; y: number } {
    const cached = this.approaches.get(kind);
    if (cached) return cached;
    const station = this.stationOf(kind);
    const order: Array<[number, number]> = [
      [0, 1],
      [1, 0],
      [-1, 0],
      [0, -1],
    ];
    for (const [dc, dr] of order) {
      const col = station.col + dc;
      const row = station.row + dr;
      const value = this.关卡.rows_[row]?.[col];
      if (value !== undefined && !COLLIDING_TILES.includes(value)) {
        const point = tileToWorld(col, row);
        this.approaches.set(kind, point);
        return point;
      }
    }
    throw new Error(`工位 ${kind} 没有可站立的相邻格`);
  }

  private exposeDevProbe(): void {
    if (!import.meta.env.DEV) return;
    (window as unknown as Record<string, unknown>).__lksProbe = () => ({
      x: this.player.x,
      y: this.player.y,
      facing: this.facing,
      关卡: { cols: this.关卡.cols, rows: this.关卡.rows },
      npcX: this.npc.x,
      npcY: this.npc.y,
      npc名: this.帮手名,
      npcTexture: this.npc.texture.key,
      npcAnim: this.npc.anims.isPlaying ? (this.npc.anims.currentAnim?.key ?? null) : null,
      npcFacing: this.npcFacing,
      npcState: this.npcState,
      npcStateText: this.npcStateText(),
      npcPlan: this.npcPlan,
      npcTags: this.npcTags,
      npc订单: this.npcOrder?.客户 ?? null,
      npcProgress: Number(this.npcProgress.toFixed(3)),
      npcWatchdog: Number(this.npcWatchdog.toFixed(2)),
      carrying: this.carrying,
      carryTags: this.carryTags,
      orders: this.orders.map((o) => ({ 客户: o.客户, 类型: o.类型, 需要: o.需要 })),
      ground: this.ground.map((g) => ({ id: g.id, 工序: g.工序, x: g.x, y: g.y, 图标: g.icons.length })),
      processing: Number(this.processing.toFixed(3)),
      processingTag: this.processingStation?.工序 ?? null,
      nearest: this.nearestStation()?.kind ?? null,
      delivered: this.delivered,
      failed: this.failed,
      timeLeft: Number(this.timeLeft.toFixed(1)),
      running: this.running,
      finished: this.finished,
      prompt: useGameStore.getState().prompt,
      binLocked: this.binLockedFor > 0,
      stations: Object.fromEntries(this.stations.map((s) => [s.kind, { x: s.wx, y: s.wy }])),
      approaches: Object.fromEntries(
        this.stations.map((s) => {
          const spot = this.approachOf(s.kind);
          return [s.kind, { x: spot.x, y: spot.y }];
        }),
      ),
      grid: this.关卡.rows_,
      /**
       * 玩家当前逻辑格（BFS 可达性检查要用）。
       * ⚠️ 关卡的约定是 `tileToWorld(col,row) = (col*32+16, row*32+16)`（**中心**），
       *    所以反算是 `floor(像素 / 32)` —— 和地图的 `位置()` 不是同一个公式（那边是贴底）。
       */
      玩家格: { x: Math.floor(this.player.x / TILE), y: Math.floor(this.player.y / TILE) },
      /** 每个工位的逻辑格 */
      stations格子: Object.fromEntries(this.stations.map((s) => [s.kind, { col: s.col, row: s.row }])),
      tile: TILE,
      队友数: 1,
    });
  }
}




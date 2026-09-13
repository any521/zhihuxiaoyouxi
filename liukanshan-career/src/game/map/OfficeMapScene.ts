/**
 * 办公室地图场景。
 *
 * 和 AVG 的联系（这是这一块的设计核心）：
 *   一、**同一个地方** —— 地毯用 #2f5d3a 墨绿，这个色是从开场插图「工位第一天」
 *       量化后的主色里量出来的，也是 AVG 功能栏选中用的色。
 *       木地板 #b87b4a 和插图里的木头也是同一个色。
 *   二、**同一个人** —— 主角就是 AVG 里那个刘看山（同一套 16 帧四方向行走）。
 *   三、**同一批同事** —— 林总/周岚/阿麦/韩策/小鹿都在地图上站位。
 *   四、**走位触发剧情** —— 走到交互点按空格 → 回到 AVG 播对应对话。
 *
 * 画面规则沿用全局约定：内部 512×288（或竖屏 288×512），整数放大，NEAREST 过滤。
 * 文字一律不画在 Phaser 里（中文字号太小会糊），交给 DOM 覆盖层。
 */
import Phaser from 'phaser';
import {
  出生点,
  地图宽,
  地图高,
  格,
  网格,
  瓦片,
  挡路瓦片,
  门配对,
  门另一半,
  通行瓦片,
  交互点表,
  道具表,
  占地表,
  取NPC,
  type NPC位,
  type 交互点,
} from './level';
import { 报位置 } from './位置总线';
import { 取道具卡, 道具落地范围 } from '../../story/道具卡';

/** 地图像素尺寸 */
const 图宽 = 地图宽 * 格;
const 图高 = 地图高 * 格;

/** 走路速度（像素/秒） */
const 速度 = 92;

/** 交互半径（像素） */
const 交互半径 = 34;

/** 四个方向的帧行号：下 上 左 右 */
const 方向行 = [0, 1, 2, 3];

/** NPC 朝向 → 精灵表帧号（精灵表是 ①下 ②左 ③右 / ④上 ⑤点头 ⑥说话） */
const NPC朝向帧 = [0, 3, 1, 2];

/** 有坐姿动画的七个角色（文件名 = sit_名字.png）*/
const 有坐姿 = ['刘看山', '周岚', '阿麦', '韩策', '小鹿', '林总', '程女士'];

export interface 地图回调 {
  /** 附近的交互点变了（null = 附近没有） */
  附近变了: (点: 交互点 | null) => void;
  /** 玩家按了交互 */
  交互: (点: 交互点) => void;
  /** 点了某个同事（弹人物卡） */
  点人物: (名: string) => void;
  /** 附近的门变了（靠近门时提示"空格 开门/关门"） */
  附近门变了: (门: { x: number; y: number; 开: boolean } | null) => void;
  /** 附近的**东西**变了（靠近家具/门时弹"这东西是干嘛的"卡片） */
  附近道具变了?: (物: 附近物 | null) => void;
  /** 附近的**同事**变了（靠近同事时弹人物卡） */
  附近人变了?: (名: string | null) => void;
}

/**
 * 玩家旁边的东西（给地图上的"道具卡"用）。
 *
 * 分两种：`道具`（家具精灵，例如打印机）和 `格子`（门 / 玻璃这种瓦片 ——
 * 它们在 `道具表` 里查不到，只能按格子认）。
 */
export interface 附近物 {
  种类: '道具' | '格子';
  /** 道具的图名（如 prop_dev_打印机），或格子卡的名字（门 / 玻璃） */
  键: string;
}

export class OfficeMapScene extends Phaser.Scene {
  private 主角!: Phaser.Physics.Arcade.Sprite;
  private 光标!: Phaser.Types.Input.Keyboard.CursorKeys;
  private WASD?: Record<string, Phaser.Input.Keyboard.Key>;
  private 图层!: Phaser.Tilemaps.TilemapLayer;
  /** 所有挡路的东西（家具 + 同事）*/
  private 挡路!: Phaser.Physics.Arcade.StaticGroup;
  private NPC们: Phaser.GameObjects.Sprite[] = [];
  private 段号 = 1;
  private 指引线!: Phaser.GameObjects.Graphics;
  private 脚下影!: Phaser.GameObjects.Ellipse;
  private 回调?: 地图回调;
  private 当前附近: 交互点 | null = null;
  /** 玩家旁边那件东西（道具卡用）。**变了才回调**，免得每帧刷 React。 */
  private 当前附近物: 附近物 | null = null;
  /** 上一帧玩家在第几格 —— 没换格就不重算"旁边是什么" */
  private 上次格 = -1;
  /** 玩家旁边那位同事（人物卡用）。变了才回调。 */
  private 当前附近人: string | null = null;
  /** 地图上所有门的位置（开局从网格里扫出来） */
  private 门们: Array<{ x: number; y: number }> = [];
  private 当前附近门: { x: number; y: number; 开: boolean } | null = null;
  /** 通行表缓存（门一开关就置空重算）*/
  /** 每扇门的物理挡板：关着用 关挡，开着用 开挡 */
  private 门体 = new Map<string, { 关挡: Phaser.GameObjects.Rectangle; 开挡: Phaser.GameObjects.Rectangle }>();
  private 通行表: Uint8Array | null = null;
  private 朝向 = 0;
  private 目标 = 交互点表[0] as 交互点 | undefined;

  constructor() {
    super('办公室地图');
  }

  /** React 侧注入回调 */
  设回调(回调: 地图回调): void {
    this.回调 = 回调;
  }

  /** 换一个导航目标（指引线指向它） */
  设目标(id: string | null): void {
    this.目标 = id ? 交互点表.find((p) => p.id === id) : undefined;
  }

  /** 某格的门开着吗（开着的门瓦片 = 门横/门竖） */
  private 门开着(x: number, y: number): boolean {
    const t = 网格[y]?.[x];
    return 通行瓦片.includes(t);
  }

  /** 改一格门的瓦片 + 同步碰撞（putTileAt 换上来的新瓦片不会自动带挡路属性）*/
  private 改门格(x: number, y: number, 号: number): void {
    网格[y][x] = 号;
    this.图层.putTileAt(号 as number, x, y);
    const 挡 = 挡路瓦片.includes(号);
    const t = this.图层.getTileAt(x, y);
    t?.setCollision(挡, 挡, 挡, 挡, true);
  }

  /**
   * 开 / 关一扇门。
   * ⚠️ 改完瓦片要**手动设碰撞** —— putTileAt 换上去的新瓦片不会自动带上"挡路"属性
   *    （我是用 setCollision(索引数组) 设的，不是靠 tileset 自带属性）。
   * ⚠️ 宽门占 **2 格**，另一半必须一起改，只改一格会出现"半扇门"。
   */
  开关门(x: number, y: number): void {
    const 旧 = 网格[y]?.[x];
    if (旧 === undefined) return;
    const 新 = 门配对[旧];
    if (新 === undefined) return;
    this.通行表 = null; // 门的状态变了，通行表要重算
    this.改门格(x, y, 新);
    const 偏 = 门另一半[旧];
    if (!偏) return;
    const px = x + 偏[0];
    const py = y + 偏[1];
    const 另新 = 门配对[网格[py]?.[px]];
    if (另新 !== undefined) this.改门格(px, py, 另新);
    // 门的阻挡改由**物理挡板**负责（不再是瓦片），所以要跟着刷新
    this.刷新门体(x, y);
  }

  /**
   * 给门的**门框**加碰撞。
   *
   * 为什么需要：门瓦片整格都是"不挡路"的（不然开关门要改碰撞），
   * 所以人可以在整格 64px 里随便走 —— 会**蹭到门框的墙垛上**，看着像穿模。
   *
   * 做法：在每扇门的两侧各放一个静态碰撞体（门框宽度），把**实际可走宽度收到 51px**
   * （= 64 × 0.8，用户要求的 0.8 倍）。这样人只能从中间过，不会蹭到框。
   * 门框是固定的，不随开关变化，所以这些碰撞体建一次就行。
   */
  private 建门框碰撞(): void {
    /** 门框宽度（每侧）—— 2 格 64px 减去两侧 6.5px ≈ 51px */
    const 框宽 = 6.5;
    /** 开着的门扇有多宽（和门瓦片里画的一致）*/
    const 扇宽 = 14;
    /** 已经加过框的门（一扇门两格，别加两次）*/
    const 加过 = new Set<string>();

    /** 建一个静态碰撞矩形，返回它，方便之后开关 */
    const 建块 = (cx: number, cy: number, w: number, h: number): Phaser.GameObjects.Rectangle => {
      const r = this.add.rectangle(cx, cy, w, h);
      r.setVisible(false); // 只是碰撞体，画面上看不见
      this.physics.add.existing(r, true);
      this.挡路.add(r);
      return r;
    };

    for (const d of this.门们) {
      const 号 = 网格[d.y]?.[d.x];
      const 偏 = 门另一半[号];
      if (!偏) continue;
      // 用两格中"起始那格"做键，一扇门只处理一次
      const 头x = 偏[0] > 0 ? d.x : 偏[0] < 0 ? d.x + 偏[0] : d.x;
      const 头y = 偏[1] > 0 ? d.y : 偏[1] < 0 ? d.y + 偏[1] : d.y;
      const 键 = `${头x},${头y}`;
      if (加过.has(键)) continue;
      加过.add(键);

      const 是横门 = 偏[0] !== 0;
      const x0 = 头x * 格;
      const y0 = 头y * 格;

      if (是横门) {
        // 门框：左右各一块
        建块(x0 + 框宽 / 2, y0 + 格 / 2, 框宽, 格);
        建块(x0 + 格 * 2 - 框宽 / 2, y0 + 格 / 2, 框宽, 格);
        // **关着时**的挡板：填满门洞
        const 关挡 = 建块(x0 + 格, y0 + 格 / 2, 格 * 2 - 框宽 * 2, 格);
        // **开着时**的挡板：门扇立着占的那一条
        const 开挡 = 建块(x0 + 7 + 扇宽 / 2, y0 + 格 / 2, 扇宽, 格);
        this.门体.set(键, { 关挡, 开挡 });
      } else {
        建块(x0 + 格 / 2, y0 + 框宽 / 2, 格, 框宽);
        建块(x0 + 格 / 2, y0 + 格 * 2 - 框宽 / 2, 格, 框宽);
        const 关挡 = 建块(x0 + 格 / 2, y0 + 格, 格, 格 * 2 - 框宽 * 2);
        const 开挡 = 建块(x0 + 格 / 2, y0 + 7 + 扇宽 / 2, 格, 扇宽);
        this.门体.set(键, { 关挡, 开挡 });
      }
    }
    // 按当前状态把挡板启停一次
    for (const d of this.门们) this.刷新门体(d.x, d.y);
  }

  /** 按某扇门当前的开/关，启停它的两块挡板 */
  private 刷新门体(x: number, y: number): void {
    const 号 = 网格[y]?.[x];
    const 偏 = 门另一半[号];
    if (!偏) return;
    const 头x = 偏[0] > 0 ? x : 偏[0] < 0 ? x + 偏[0] : x;
    const 头y = 偏[1] > 0 ? y : 偏[1] < 0 ? y + 偏[1] : y;
    const 体 = this.门体.get(`${头x},${头y}`);
    if (!体) return;
    const 现在开 = 通行瓦片.includes(号);
    const a = 体.关挡.body as Phaser.Physics.Arcade.StaticBody | null;
    const b = 体.开挡.body as Phaser.Physics.Arcade.StaticBody | null;
    if (a) a.enable = !现在开;
    if (b) b.enable = 现在开;
  }

  /** 开局扫一遍网格，把所有门的位置记下来 */
  private 找门(): void {
    this.门们 = [];
    for (let y = 0; y < 地图高; y += 1) {
      for (let x = 0; x < 地图宽; x += 1) {
        if (门配对[网格[y][x]] !== undefined) this.门们.push({ x, y });
      }
    }
  }

  /** 最近的门（在交互半径内） */
  private 最近门(): { x: number; y: number; 开: boolean } | null {
    let 最好: { x: number; y: number; 开: boolean } | null = null;
    let 最近距 = 交互半径 + 10;
    for (const d of this.门们) {
      const px = d.x * 格 + 格 / 2;
      const py = d.y * 格 + 格;
      const dist = Phaser.Math.Distance.Between(this.主角.x, this.主角.y, px, py);
      if (dist < 最近距) {
        最近距 = dist;
        最好 = { x: d.x, y: d.y, 开: this.门开着(d.x, d.y) };
      }
    }
    return 最好;
  }

  /** 调试用：把主角直接挪到某个**瓦片坐标**（自动化测试走近交互点太慢） */
  传送(格x: number, 格y: number): void {
    const p = this.格到像素(格x, 格y);
    this.主角.setPosition(p.x, p.y);
    this.主角.body?.reset(p.x, p.y);
  }

  /**
   * 按**像素坐标**传送。
   * ⚠️ 和 传送() 的区别很重要：位置记忆存的是 精确位置() 的像素值，
   *    要是拿像素值去调 传送()（那个收的是瓦片坐标），会被算到地图外面、
   *    然后被世界边界夹到角落 —— 实测就是这么错的。
   */
  传送像素(px: number, py: number): void {
    const x = Phaser.Math.Clamp(px, 格, 图宽 - 格);
    const y = Phaser.Math.Clamp(py, 格, 图高 - 格);
    this.主角.setPosition(x, y);
    this.主角.body?.reset(x, y);
  }

  /** 调试用：读主角当前所在瓦片（用 floor —— round 会把"刚好停在物体边缘"读成下一格，误导判断）*/
  位置(): { x: number; y: number } {
    return {
      x: Math.floor((this.主角.x - 格 / 2) / 格),
      y: Math.floor((this.主角.y - 格) / 格),
    };
  }

  /** 调试用：主角的精确像素坐标 */
  精确位置(): { x: number; y: number } {
    return { x: Math.round(this.主角.x), y: Math.round(this.主角.y) };
  }

  preload(): void {
    const 基 = 'assets/map/';
    // ⚠️ 顺序必须和 level.ts 的 瓦片 枚举一一对应
    for (const [i, 名] of [
      'tile_carpet_grey',
      'tile_carpet_dark',
      'tile_antislip',
      'tile_polished',
      'tile_tile',
      'tile_wood',
      'tile_wall',
      'tile_glass',
      'tile_door_h_l',
      'tile_door_h_r',
      'tile_door_v_u',
      'tile_door_v_d',
      'tile_door_h_l_c',
      'tile_door_h_r_c',
      'tile_door_v_u_c',
      'tile_door_v_d_c',
      'tile_desk',
    ].entries()) {
      this.load.image(`t${i}`, `${基}${名}.png`);
    }
    // 坐姿表：4 帧 × 32×48 横排，直接当 spritesheet 用
    for (const 名 of 有坐姿) {
      this.load.spritesheet(`sit_${名}`, `${基}sit_${名}.png`, { frameWidth: 32, frameHeight: 48 });
    }
    for (const p of 道具表) {
      if (!this.textures.exists(p.图)) this.load.image(p.图, `${基}${p.图}.png`);
    }
    // 角色精灵表：不切，按 frameWidth/frameHeight 交给 Phaser
    this.load.spritesheet('lks_walk', `${基}chr_lks_walk.png`, { frameWidth: 32, frameHeight: 48 });
    this.load.spritesheet('lks_idle', `${基}chr_lks_idle.png`, { frameWidth: 32, frameHeight: 48 });
    // 同事的站位会随剧情换，所以**所有段出现过的**都要预加载，不能只加载当前段的
    const 所有NPC = new Set<string>();
    for (let i = 0; i < 8; i += 1) for (const n of 取NPC(i)) 所有NPC.add(n.图);
    for (const key of 所有NPC) {
      if (!this.textures.exists(key)) {
        this.load.spritesheet(key, `${基}${key}.png`, { frameWidth: 32, frameHeight: 48 });
      }
    }
  }

  create(): void {
    this.挡路 = this.physics.add.staticGroup();
    this.建瓦片集();
    this.建图层();
    this.建墙遮挡();
    this.建动画();
    this.建坐姿动画();
    this.建道具();
    this.建NPC();
    this.建主角();
    this.建镜头();
    this.建输入();
    this.建指引线();
    this.找门();
    this.建门框碰撞();
  }

  /* ───────── 搭建 ───────── */

  /** 把 6 张瓦片拼成一张 6 格的 tileset 贴图 */
  private 建瓦片集(): void {
    const 序 = ['t0','t1','t2','t3','t4','t5','t6','t7','t8','t9','t10','t11','t12','t13','t14','t15','t16'];
    const cv = document.createElement('canvas');
    cv.width = 格 * 序.length;
    cv.height = 格;
    const ctx = cv.getContext('2d');
    if (!ctx) throw new Error('取不到 2D 上下文');
    ctx.imageSmoothingEnabled = false;
    序.forEach((k, i) => {
      const 图 = this.textures.get(k).getSourceImage();
      ctx.drawImage(图 as CanvasImageSource, i * 格, 0, 格, 格);
    });
    const tex = this.textures.addCanvas('地图瓦片集', cv);
    tex?.setFilter(Phaser.Textures.FilterMode.NEAREST);
  }

  /**
   * 墙的遮挡层。
   *
   * 问题：主角的碰撞体只有 16px 宽（脚下那一小块），所以他可以贴到墙边，
   * 精灵上半身会**压到墙上**；而墙在 tilemap 里是整层 depth -100，
   * 永远被人盖住 → 看着像穿墙。
   *
   * 做法：墙和玻璃**另外用一层精灵重画一遍**，每块的深度 = 自己那一行的底部 y。
   * 这样：
   *   · 人在墙**南边**（脚底 y 更大）→ 深度更大 → 人画在墙前面 ✅
   *   · 人在墙**北边**（脚底 y 更小）→ 深度更小 → 墙把人挡住 ✅
   * 门不参与（门是可通行的，压在门上看着没问题，而且门要能动态开关）。
   */
  private 建墙遮挡(): void {
    const 要画的 = new Set<number>([瓦片.白墙, 瓦片.玻璃]);
    let 数 = 0;
    for (let y = 0; y < 地图高; y += 1) {
      for (let x = 0; x < 地图宽; x += 1) {
        const 号 = 网格[y][x];
        if (!要画的.has(号)) continue;
        const s = this.add.image(x * 格 + 格 / 2, y * 格 + 格, `t${号}`);
        s.setOrigin(0.5, 1);
        // 深度 = 本行底部 y（+1 让同格的人和墙有稳定先后）
        s.setDepth(y * 格 + 格 + 1);
        数 += 1;
      }
    }
  }

  private 建图层(): void {
    // 直接用 level.ts 的网格数据，场景里不再重复一份地图
    const map = this.make.tilemap({ data: 网格, tileWidth: 格, tileHeight: 格 });
    const tileset = map.addTilesetImage('地图瓦片集', '地图瓦片集');
    if (!tileset) throw new Error('tileset 未绑定');
    const layer = map.createLayer(0, tileset, 0, 0);
    if (!layer) throw new Error('图层创建失败');
    this.图层 = layer as Phaser.Tilemaps.TilemapLayer;
    // 墙和玻璃挡路（地毯/木地板/地砖/桌面不挡）
    // 墙和玻璃挡路；**门是通行的**（门洞要能走过去）
    this.图层.setCollision(挡路瓦片);
    this.图层.setDepth(-100);
  }

  private 建动画(): void {
    // 四方向行走：每行 4 帧
    const 名 = ['下', '上', '左', '右'];
    方向行.forEach((行, i) => {
      this.anims.create({
        key: `走${名[i]}`,
        frames: this.anims.generateFrameNumbers('lks_walk', {
          frames: [行 * 4, 行 * 4 + 1, 行 * 4 + 2, 行 * 4 + 3],
        }),
        frameRate: 9,
        repeat: -1,
      });
    });
  }

  /** 坐姿打字循环（每个角色一套）*/
  private 建坐姿动画(): void {
    for (const 名 of 有坐姿) {
      if (this.anims.exists(`坐_${名}`)) continue;
      this.anims.create({
        key: `坐_${名}`,
        frames: this.anims.generateFrameNumbers(`sit_${名}`, { frames: [0, 1, 2, 3] }),
        frameRate: 3, // 打字的小幅起伏，慢一点才像呼吸
        repeat: -1,
      });
    }
  }

  private 建道具(): void {
    for (const p of 道具表) {
      const { x, y } = this.格到像素(p.x, p.y);
      const s = this.add.image(x, y + (p.偏移Y ?? 0), p.图);
      s.setOrigin(0.5, 1);
      if (p.缩放) s.setScale(p.缩放);
      // 按脚底 y 排序：下面的人/物盖住上面的。
      // ⚠️ 桌面小件（键盘/鼠标/笔筒）视觉上在桌子面上：
      //    深度必须比桌子**大**才不会被桌子盖住，所以加 0.5。
      // ⚠️ **转椅要画在人前面**（加 2）：同事坐上去时，椅背要露在人的下半身前，
      //    看着才是"坐在椅子里"；不加的话人被画在椅子上面，像浮在椅子上。
      const 加 = p.桌面 ? 0.5 : p.图 === 'prop_ws_转椅' ? 2 : 0;
      s.setDepth(y + 加);

      // 桌面小件不挡路（它们摆在桌面上，人撞不到）
      if (p.桌面) continue;

      // 家具：加一个**贴地的占地**静态碰撞体。
      // ⚠️ 不能拿整张 44×48 的精灵当碰撞体 —— 那样人离桌子还有半个身位就被挡住。
      const [宽, 高] = 占地表[p.图] ?? [s.width * 0.85, s.height * 0.4];
      this.加占地(s, 宽, 高);
    }
  }

  /** 给一个"脚底在 (x,y)"的对象加贴地静态碰撞体 */
  private 加占地(
    目标: Phaser.GameObjects.Image | Phaser.GameObjects.Sprite,
    宽: number,
    高: number,
  ): void {
    this.physics.add.existing(目标, true);
    const body = 目标.body as Phaser.Physics.Arcade.StaticBody | null;
    if (!body) return;
    body.setSize(宽, 高);
    // 静态体的坐标是左上角；精灵的脚底在 (目标.x, 目标.y)
    body.position.set(目标.x - 宽 / 2, 目标.y - 高);
    body.updateCenter();
    this.挡路.add(目标);
  }

  private 建NPC(): void {
    this.建NPC批(取NPC(this.段号));
  }

  /** 按剧情换一批同事站位（销毁旧的、建新的） */
  换NPC(段号: number): void {
    this.段号 = 段号;
    for (const s of this.NPC们) s.destroy();
    this.NPC们 = [];
    this.建NPC批(取NPC(段号));
  }

  /** 这个格子是不是"转椅"（站在椅子上 = 坐着）*/
  private 是椅子(x: number, y: number): boolean {
    return 道具表.some((p) => p.图 === 'prop_ws_转椅' && p.x === x && p.y === y);
  }

  private 建NPC批(排布: NPC位[]): void {
    for (const n of 排布) {
      const { x, y } = this.格到像素(n.x, n.y);
      // 坐在椅子上 → 用坐姿动画；否则用站立朝向帧
      const 坐 = this.是椅子(n.x, n.y) && 有坐姿.includes(n.名) && this.textures.exists(`sit_${n.名}`);
      const s = 坐
        ? this.add.sprite(x, y, `sit_${n.名}`, 0)
        : this.add.sprite(x, y, n.图, NPC朝向帧[n.朝向] ?? 0);
      if (坐) s.anims.play(`坐_${n.名}`, true);
      s.setOrigin(0.5, 1);
      s.setDepth(y);
      // 名字挂在精灵上：靠过去弹人物卡时要按名字查人物卡库
      s.setData('名', n.名);
      // 同事也挡路（不能从人身上穿过去）
      this.加占地(s, 22, 14);
      // 点同事 → 弹人物卡。热区用整张精灵（比占地大，好点中）
      s.setInteractive({ useHandCursor: true });
      s.on('pointerover', () => s.setTint(0xfff2d0));
      s.on('pointerout', () => s.clearTint());
      s.on('pointerdown', () => this.回调?.点人物(n.名));
      this.NPC们.push(s);
    }
  }

  private 建主角(): void {
    const { x, y } = this.格到像素(出生点.x, 出生点.y);
    this.脚下影 = this.add.ellipse(x, y, 20, 7, 0x14161c, 0.28);
    this.脚下影.setDepth(y - 1);
    this.主角 = this.physics.add.sprite(x, y, 'lks_idle', 0);
    this.主角.setOrigin(0.5, 1);
    this.主角.body?.setSize(16, 12);
    this.主角.body?.setOffset(8, 34);
    this.主角.setCollideWorldBounds(true);
    this.主角.setDepth(y);
    this.physics.add.collider(this.主角, this.图层);
    // 家具和同事都挡路：人不能穿模
    this.physics.add.collider(this.主角, this.挡路);
  }

  private 建镜头(): void {
    this.physics.world.setBounds(0, 0, 图宽, 图高);
    const cam = this.cameras.main;
    cam.setBounds(0, 0, 图宽, 图高);
    cam.setRoundPixels(true);
    cam.startFollow(this.主角, true, 0.12, 0.12);
    cam.setBackgroundColor('#262a33');
  }

  private 建输入(): void {
    if (!this.input.keyboard) return;
    this.光标 = this.input.keyboard.createCursorKeys();
    // 空格（交互键）不在这里注册：交互由 React 层判定，见 MapScreen。
    // 只在这里管"走动"用的键。
    // WASD 也支持（提示里写了就得真的能用）
    this.WASD = this.input.keyboard.addKeys('W,A,S,D') as Record<string, Phaser.Input.Keyboard.Key>;
    this.input.keyboard.addCapture('UP,DOWN,LEFT,RIGHT,W,A,S,D');
  }

  private 建指引线(): void {
    this.指引线 = this.add.graphics();
    this.指引线.setDepth(99999);
  }

  /* ───────── 每帧 ───────── */

  update(): void {
    this.走();
    this.排序遮挡();
    this.查交互();
    this.查附近物();
    this.画指引线();
  }

  /**
   * 报"玩家旁边是什么东西" —— 给地图上的**道具卡**用（用户要求"一靠近就显示"）。
   *
   * ⚠️ **只在玩家换格时重算**：道具表有 90 多件，每帧全扫一遍是白烧 CPU，
   *    而且"旁边是什么"只跟人在哪一格有关，格没变就不可能变。
   *
   * 判定：把主角**脚下点**和每件道具的**落地矩形**比距离（不是比精灵坐标 ——
   * 精灵锚点在脚底，拿它当圆心判定圈会整体偏下一格）。
   * 横向容差半格+10px、纵向 1.25 格；取最近的一件，够不着就报 null（卡片自己消失）。
   *
   * 门 / 玻璃是**瓦片**不是道具，得单独看周围 4 格。
   */
  private 查附近物(): void {
    const 位 = this.位置();
    const 键 = 位.y * 地图宽 + 位.x;
    const 换格了 = 键 !== this.上次格;
    // 人物卡和道具卡共用这个开关：都在"换格"这一刻重算
    this.查附近人(换格了);
    if (!换格了) return;
    this.上次格 = 键;

    const 脚x = this.主角.x;
    const 脚y = this.主角.y;
    const 横容 = 格 / 2 + 10;
    const 纵容 = 格 * 1.25;

    let 最好: 附近物 | null = null;
    let 最好距 = Infinity;
    for (const p of 道具表) {
      if (!取道具卡(p.图)) continue; // 没配卡的就不弹（宁可没有，不弹空白卡）
      const 框 = 道具落地范围(p);
      const dx = Math.max(0, Math.abs(脚x - 框.x) - 框.宽 / 2);
      const dy = Math.max(0, Math.abs(脚y - 框.y) - 框.高 / 2);
      if (dx > 横容 || dy > 纵容) continue;
      const 距 = dx + dy;
      if (距 < 最好距) {
        最好距 = 距;
        最好 = { 种类: '道具', 键: p.图 };
      }
    }

    // 门 / 玻璃：按格子认（同一格或紧邻的一格）
    if (!最好 || 最好距 > 6) {
      for (const [x, y] of [
        [位.x, 位.y],
        [位.x + 1, 位.y],
        [位.x - 1, 位.y],
        [位.x, 位.y + 1],
        [位.x, 位.y - 1],
      ]) {
        const 号 = 网格[y]?.[x];
        if (号 === undefined) continue;
        if (门配对[号] !== undefined) {
          最好 = { 种类: '格子', 键: '门' };
          break;
        }
        if (号 === 瓦片.玻璃) {
          最好 = { 种类: '格子', 键: '玻璃' };
          break;
        }
      }
    }

    // 站在工位格 / 同格有小件 → 用"同格优先"那件（桌/椅/键盘挤一起时，桌子才是玩家关心的）
    const 优先 = this.同格优先();
    if (优先) 最好 = 优先;

    const 没变 =
      (最好 === null && this.当前附近物 === null) ||
      (最好 !== null && this.当前附近物 !== null && 最好.键 === this.当前附近物.键);
    if (没变) return;
    this.当前附近物 = 最好;
    this.回调?.附近道具变了?.(最好);
  }

  /**
   * 报"旁边是哪位同事" —— 给地图上的**人物卡**用。
   *
   * ⚠️ 和 `查附近物()` 共用"只在换格时重算"的开关：那个函数每帧先跑，
   *    换格时会把 `上次格` 更新掉，所以这里用自己的标记判断，
   *    不能再去比 `上次格`（会比不出来）。
   */
  private 查附近人(换格了: boolean): void {
    if (!换格了) return;
    let 谁: string | null = null;
    // 半径 40px = 一格多一点：站在同事**隔壁那一格**也该弹卡
    // （⚠️ 写 30 就太紧了：同事坐的椅子格和它上面那格正好差 32px，会弹不出来）
    let 最近 = 40;
    for (const s of this.NPC们) {
      const d = Phaser.Math.Distance.Between(this.主角.x, this.主角.y, s.x, s.y);
      if (d < 最近) {
        最近 = d;
        谁 = (s.getData('名') as string | undefined) ?? null;
      }
    }
    if (谁 === this.当前附近人) return;
    this.当前附近人 = 谁;
    this.回调?.附近人变了?.(谁);
  }

  /**
   * 挤在同一格的"小件 / 大件"里，挑玩家最可能想了解的那件。
   *
   * 为什么要这条：工位是 桌 + 椅 + 键盘 + 名牌 + 屏风 挤在一格半里，
   * 单纯比"谁近"会弹到椅子或键盘 —— 但玩家站在那儿想知道的是
   * 「这是我的工位」，不是「这是把椅子」。
   *   一、站在**工位的椅子格**上 → 一律给「办公桌」的卡（工位 = 桌+椅+屏风）
   *   二、否则如果同一格里有**桌面小件**（笔筒/名牌这种），优先给它
   *      （大件在隔壁格已经被算到"最近"了，小件是玩家真正踩上去的那个）
   */
  private 同格优先(): 附近物 | null {
    const 位 = this.位置();
    const 桌 = 道具表.find((p) => p.图 === 'prop_ws_办公桌' && p.x === 位.x && p.y === 位.y - 1);
    if (桌) return { 种类: '道具', 键: 桌.图 };
    const 小件 = 道具表.find((p) => p.桌面 && p.x === 位.x && p.y === 位.y);
    return 小件 ? { 种类: '道具', 键: 小件.图 } : null;
  }

  private 走(): void {
    const b = this.主角.body as Phaser.Physics.Arcade.Body | null;
    if (!b) return;
    const 键 = this.WASD ?? {};
    const 左 = (this.光标?.left.isDown ?? false) || (键.A?.isDown ?? false);
    const 右 = (this.光标?.right.isDown ?? false) || (键.D?.isDown ?? false);
    const 上 = (this.光标?.up.isDown ?? false) || (键.W?.isDown ?? false);
    const 下 = (this.光标?.down.isDown ?? false) || (键.S?.isDown ?? false);

    let vx = 0;
    let vy = 0;
    if (左) vx -= 1;
    if (右) vx += 1;
    if (上) vy -= 1;
    if (下) vy += 1;

    if (vx !== 0 && vy !== 0) {
      // 斜着走归一化，不然会更快
      vx *= 0.7071;
      vy *= 0.7071;
    }
    b.setVelocity(vx * 速度, vy * 速度);

    // 朝向：左右优先（横着走时更能看出侧的姿势）
    if (vx < 0) this.朝向 = 2;
    else if (vx > 0) this.朝向 = 3;
    else if (vy < 0) this.朝向 = 1;
    else if (vy > 0) this.朝向 = 0;

    const 在走 = vx !== 0 || vy !== 0;
    if (在走) {
      const key = `走${['下', '上', '左', '右'][this.朝向]}`;
      if (this.主角.anims.currentAnim?.key !== key) this.主角.anims.play(key, true);
      // 走的时候按住 Shift 加速（跑）
      const 加速 = this.光标?.shift.isDown ? 1.7 : 1;
      b.setVelocity(vx * 速度 * 加速, vy * 速度 * 加速);
    } else {
      this.主角.anims.stop();
      this.主角.setTexture('lks_idle', this.朝向);
    }

    const 影子 = { x: this.主角.x, y: this.主角.y - 1 };
    报位置(this.主角.x, this.主角.y);
    this.脚下影.setPosition(影子.x, 影子.y);
    this.脚下影.setDepth(this.主角.y - 1);
    this.主角.setDepth(this.主角.y);
  }

  /** 按脚底 y 排深度，主角走到家具后面会被挡住 */
  private 排序遮挡(): void {
    // 主角自己在 走() 里已设；NPC 与道具建好就固定了，这里不用每帧做
  }

  /** 找出最近的交互点，变化时通知 React */
  private 查交互(): void {
    let 最近: 交互点 | null = null;
    let 最近距 = 交互半径;
    for (const p of 交互点表) {
      const { x, y } = this.格到像素(p.x, p.y);
      const d = Phaser.Math.Distance.Between(this.主角.x, this.主角.y, x, y);
      // 挡住下半身也算靠近，所以对 y 宽容一点
      if (d < 最近距) {
        最近距 = d;
        最近 = p;
      }
    }
    if (最近?.id !== this.当前附近?.id) {
      this.当前附近 = 最近;
      this.回调?.附近变了(最近);
    }
    // 门单独查一遍（门不在"交互点"表里，是按瓦片扫出来的）
    const 门 = this.最近门();
    const 门变了 =
      (门?.x !== this.当前附近门?.x) || (门?.y !== this.当前附近门?.y) || (门?.开 !== this.当前附近门?.开);
    if (门变了) {
      this.当前附近门 = 门;
      this.回调?.附近门变了(门);
    }
    // ⚠️ 交互键（空格）不在 Phaser 里判定 —— Phaser 的键盘监听依赖画布焦点，
    //    实测自动化点不到、真人也要先点一下画布才行。改由 React 层统一处理
    //    （见 MapScreen：那边已经有 附近交互点 这个状态，判起来更直接）。
  }

  /**
   * 通行表：每格能不能走（墙 / 玻璃 / 关着的门 → 不能走）。
   * 门一开关就要重算，所以缓存在字段里，`开关门()` 里置空。
   */
  private 造通行表(): Uint8Array {
    const t = new Uint8Array(地图宽 * 地图高);
    for (let y = 0; y < 地图高; y += 1) {
      for (let x = 0; x < 地图宽; x += 1) {
        t[y * 地图宽 + x] = 挡路瓦片.includes(网格[y][x]) ? 0 : 1;
      }
    }

    // ⚠️ **家具也要算进去**。
    //    只按瓦片算的话，指引线会直接从文化墙、接待台、办公桌里穿过去 ——
    //    因为那些是"道具"，不在瓦片层里。
    //    这里用的是和游戏碰撞体**同一份数据**（占地表），
    //    所以寻路走出来的路，和玩家真能走的路是一致的。
    for (const p of 道具表) {
      if (p.桌面) continue; // 桌面小件不挡路
      const 占地 = 占地表[p.图];
      if (!占地) continue;
      const [宽, 高] = 占地;
      const 中心x = p.x * 格 + 格 / 2;
      const 底y = p.y * 格 + 格 + (p.偏移Y ?? 0);
      const gx1 = Math.floor((中心x - 宽 / 2) / 格);
      const gx2 = Math.floor((中心x + 宽 / 2 - 1) / 格);
      const gy1 = Math.floor((底y - 高) / 格);
      const gy2 = Math.floor((底y - 1) / 格);
      for (let y = Math.max(0, gy1); y <= Math.min(地图高 - 1, gy2); y += 1) {
        for (let x = Math.max(0, gx1); x <= Math.min(地图宽 - 1, gx2); x += 1) {
          t[y * 地图宽 + x] = 0;
        }
      }
    }
    return t;
  }

  private 取通行表(): Uint8Array {
    if (!this.通行表) this.通行表 = this.造通行表();
    return this.通行表;
  }

  /**
   * A* 找路（四方向）。
   *
   * ⚠️ **指引线不用它了** —— 用户要求指引线改成"直线穿墙"（见 `画指引线()`）。
   *    但这个方法**故意留着**（所以是 public，不是 private）：
   *    以后要做"点地自动寻路走过去"或"NPC 自己走到某处"，
   *    直接 `this.找路(起x, 起y, 终x, 终y)` 就能拿到一条**真能走**的格子路径；
   *    调试时也可以从控制台 `__lksMap.找路(...)` 问"这条路到底通不通"。
   *
   * 它解决的问题是：直线会**直接穿过墙**，玩家看到的是"指引线从墙里穿过去"，
   * 完全没法照着走 —— 所以真要"能照着走"的路线时，必须用这里算出来的路。
   *
   * 地图只有 45×30 = 1350 格，很小，A* 跑一次是微秒级。
   * 调用方记得缓存（只有主角换了格子或目标变了才重算），不然每帧跑一次白白浪费。
   */
  找路(起x: number, 起y: number, 终x: number, 终y: number): Array<{ x: number; y: number }> | null {
    const 通 = this.取通行表();
    const 键 = (x: number, y: number): number => y * 地图宽 + x;
    const 在图内 = (x: number, y: number): boolean => x >= 0 && y >= 0 && x < 地图宽 && y < 地图高;
    if (!在图内(终x, 终y) || !在图内(起x, 起y)) return null;

    // 目标格如果本身不可走（比如站在家具上），退而求其次找它周围能走的格
    let 目标x = 终x;
    let 目标y = 终y;
    if (!通[键(终x, 终y)]) {
      const 候选 = [
        [终x + 1, 终y],
        [终x - 1, 终y],
        [终x, 终y + 1],
        [终x, 终y - 1],
      ].find(([x, y]) => 在图内(x, y) && 通[键(x, y)]);
      if (!候选) return null;
      目标x = 候选[0];
      目标y = 候选[1];
    }

    const 开表: number[] = [键(起x, 起y)];
    const 来路 = new Map<number, number>();
    const g分 = new Map<number, number>([[键(起x, 起y), 0]]);
    const f分 = new Map<number, number>([
      [键(起x, 起y), Math.abs(起x - 目标x) + Math.abs(起y - 目标y)],
    ]);
    const 终键 = 键(目标x, 目标y);
    const 关过 = new Set<number>();
    /** 到这一格时"最后一步的方向"，用来算转弯惩罚 */
    const 来向 = new Map<number, number>();
    const 转弯罚 = 0.4;
    const 方向们: Array<[number, number, number]> = [
      [1, 0, 0],
      [-1, 0, 1],
      [0, 1, 2],
      [0, -1, 3],
    ];

    while (开表.length) {
      // 取 f 最小的（格子少，线性扫足够快）
      let 最好 = 0;
      for (let i = 1; i < 开表.length; i += 1) {
        if ((f分.get(开表[i]) ?? 1e9) < (f分.get(开表[最好]) ?? 1e9)) 最好 = i;
      }
      const 当前 = 开表.splice(最好, 1)[0];
      if (当前 === 终键) {
        // 回溯路径
        const 路: Array<{ x: number; y: number }> = [];
        let p: number | undefined = 当前;
        while (p !== undefined) {
          路.push({ x: p % 地图宽, y: Math.floor(p / 地图宽) });
          p = 来路.get(p);
        }
        return 路.reverse();
      }
      关过.add(当前);
      const cx = 当前 % 地图宽;
      const cy = Math.floor(当前 / 地图宽);
      const 旧向 = 来向.get(当前);
      for (const [dx, dy, 向] of 方向们) {
        const nx = cx + dx;
        const ny = cy + dy;
        if (!在图内(nx, ny) || !通[键(nx, ny)]) continue;
        const nk = 键(nx, ny);
        if (关过.has(nk)) continue;
        // ⚠️ 换了方向就加转弯惩罚。不加的话四方向代价都是 1，
        //    等代价路径有无数条，A* 会返回**阶梯状**的路（右一格、下一格、右一格…），
        //    看着像在乱绕，玩家会觉得"这不是最短路径"。
        //    取 0.4（远小于 1）：只在"多绕一格"和"多转一次弯"之间取舍，
        //    不会为了少转弯而明显绕远。
        const 罚 = 旧向 !== undefined && 旧向 !== 向 ? 转弯罚 : 0;
        const 新g = (g分.get(当前) ?? 1e9) + 1 + 罚;
        if (新g < (g分.get(nk) ?? 1e9)) {
          if (!开表.includes(nk)) 开表.push(nk);
          来路.set(nk, 当前);
          来向.set(nk, 向);
          g分.set(nk, 新g);
          f分.set(nk, 新g + Math.abs(nx - 目标x) + Math.abs(ny - 目标y));
        }
      }
    }
    return null;
  }

  /**
   * 指引线：从主角**拉一条直线**指向目标（流动绿点）。
   *
   * ⚠️ 这是**用户明确要求的**：线要**走直线，可以穿墙**。
   *    它只是一个"目标在哪边"的方向标，不是可走路线 ——
   *    所以不查通行表、不绕家具、不绕关着的门，一路直插过去。
   *    （旧版是 A* 沿地形寻路，见下面 `找路()` 的注释；那套代码保留着没删。）
   *
   * 这样做的代价：线可能横穿墙体/办公桌，看着"不合物理"。
   * 好处：永远是两点之间最短的一条，玩家一眼就知道该往哪个方向走，
   *      不会因为要绕远路而看起来在乱指。
   */
  private 画指引线(): void {
    const g = this.指引线;
    g.clear();
    const 目标 = this.目标;
    if (!目标) return;

    const 起x = this.主角.x;
    const 起y = this.主角.y - 6; // 从胸口起画，不从脚底
    const 终x = 目标.x * 格 + 格 / 2;
    const 终y = 目标.y * 格 + 格;

    const 距 = Phaser.Math.Distance.Between(起x, 起y, 终x, 终y);
    if (距 < 交互半径) return; // 已经到了就只留目标圈（不再画线）

    // 沿这条直线按固定间距铺流动的绿点
    const 步 = 9;
    const 流 = (this.time.now / 40) % 步;
    for (let t = 0; t < 距; t += 步) {
      const 实际 = (t - 流) % 步;
      if (实际 < 0.5 || 实际 > 步 - 0.5) continue;
      const 位 = t / 距;
      const x = Phaser.Math.Linear(起x, 终x, 位);
      const y = Phaser.Math.Linear(起y, 终y, 位);
      // 越靠近目标越亮；**明确用绿色**
      const 近 = Phaser.Math.Clamp(位, 0, 1);
      g.fillStyle(0x4a8f4f, 0.55 + 0.45 * 近); // 高亮墨绿
      g.fillRect(Math.round(x) - 1, Math.round(y) - 1, 3, 3);
    }

    // 目标处画一个呼吸的绿圈
    const r = 8 + Math.sin(this.time.now / 220) * 2;
    g.lineStyle(2, 0x2f5d3a, 1); // 墨绿
    g.strokeCircle(终x, 终y, r);
  }

  /* ───────── 工具 ───────── */

  private 格到像素(x: number, y: number): { x: number; y: number } {
    return { x: x * 格 + 格 / 2, y: y * 格 + 格 };
  }
}

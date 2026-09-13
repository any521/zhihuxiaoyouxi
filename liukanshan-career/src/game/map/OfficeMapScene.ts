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
  交互点表,
  道具表,
  占地表,
  取NPC,
  type NPC位,
  type 交互点,
} from './level';

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

export interface 地图回调 {
  /** 附近的交互点变了（null = 附近没有） */
  附近变了: (点: 交互点 | null) => void;
  /** 玩家按了交互 */
  交互: (点: 交互点) => void;
  /** 点了某个同事（弹人物卡） */
  点人物: (名: string) => void;
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

  /** 调试用：把主角直接挪到某个瓦片坐标（自动化测试走近交互点太慢） */
  传送(x: number, y: number): void {
    const p = this.格到像素(x, y);
    this.主角.setPosition(p.x, p.y);
    this.主角.body?.reset(p.x, p.y);
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
    for (const [i, 名] of [
      'tile_carpet',
      'tile_wall',
      'tile_glass',
      'tile_wood',
      'tile_tile',
      'tile_desk',
    ].entries()) {
      this.load.image(`t${i}`, `${基}${名}.png`);
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
    this.建动画();
    this.建道具();
    this.建NPC();
    this.建主角();
    this.建镜头();
    this.建输入();
    this.建指引线();
  }

  /* ───────── 搭建 ───────── */

  /** 把 6 张瓦片拼成一张 6 格的 tileset 贴图 */
  private 建瓦片集(): void {
    const 序 = [
      't0',
      't1',
      't2',
      't3',
      't4',
      't5',
    ];
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

  private 建图层(): void {
    // 直接用 level.ts 的网格数据，场景里不再重复一份地图
    const map = this.make.tilemap({ data: 网格, tileWidth: 格, tileHeight: 格 });
    const tileset = map.addTilesetImage('地图瓦片集', '地图瓦片集');
    if (!tileset) throw new Error('tileset 未绑定');
    const layer = map.createLayer(0, tileset, 0, 0);
    if (!layer) throw new Error('图层创建失败');
    this.图层 = layer as Phaser.Tilemaps.TilemapLayer;
    // 墙和玻璃挡路（地毯/木地板/地砖/桌面不挡）
    this.图层.setCollision([瓦片.白墙, 瓦片.玻璃]);
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

  private 建道具(): void {
    for (const p of 道具表) {
      const { x, y } = this.格到像素(p.x, p.y);
      const s = this.add.image(x, y + (p.偏移Y ?? 0), p.图);
      s.setOrigin(0.5, 1);
      if (p.缩放) s.setScale(p.缩放);
      // 按脚底 y 排序：下面的人/物盖住上面的。
      // ⚠️ 桌面小件（键盘/鼠标/笔筒）视觉上在桌子面上：
      //    它们视觉上往上挪了，但深度必须比桌子**大**才不会被桌子盖住，
      //    所以加 0.5 让它紧贴在桌子之后画。第一次没加，桌上的东西全被吃掉了。
      s.setDepth(y + (p.桌面 ? 0.5 : 0));

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

  private 建NPC批(排布: NPC位[]): void {
    for (const n of 排布) {
      const { x, y } = this.格到像素(n.x, n.y);
      const s = this.add.sprite(x, y, n.图, NPC朝向帧[n.朝向] ?? 0);
      s.setOrigin(0.5, 1);
      s.setDepth(y);
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
    this.画指引线();
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
    // ⚠️ 交互键（空格）不在 Phaser 里判定 —— Phaser 的键盘监听依赖画布焦点，
    //    实测自动化点不到、真人也要先点一下画布才行。改由 React 层统一处理
    //    （见 MapScreen：那边已经有 附近交互点 这个状态，判起来更直接）。
  }

  /** 指引线：从主角脚下拉一条流动虚线到目标点 */
  private 画指引线(): void {
    const g = this.指引线;
    g.clear();
    const 目标 = this.目标;
    if (!目标) return;
    const { x: tx, y: ty } = this.格到像素(目标.x, 目标.y);
    const d = Phaser.Math.Distance.Between(this.主角.x, this.主角.y, tx, ty);
    if (d < 交互半径) return; // 已经到了就不画

    const 步 = 9;
    const 流 = (this.time.now / 40) % 步;
    const 总数 = Math.floor(d / 步);
    for (let i = 0; i < 总数; i += 1) {
      const t = (i * 步 + 流) / d;
      if (t > 1) break;
      const x = Phaser.Math.Linear(this.主角.x, tx, t);
      const y = Phaser.Math.Linear(this.主角.y - 6, ty, t);
      // 越靠近目标越亮
      g.fillStyle(0xa8d98a, 0.25 + 0.5 * t);
      g.fillRect(Math.round(x) - 1, Math.round(y) - 1, 3, 3);
    }
    // 目标处画一个呼吸的圈
    const r = 8 + Math.sin(this.time.now / 220) * 2;
    g.lineStyle(2, 0x7cc26b, 0.9);
    g.strokeCircle(tx, ty, r);
  }

  /* ───────── 工具 ───────── */

  private 格到像素(x: number, y: number): { x: number; y: number } {
    return { x: x * 格 + 格 / 2, y: y * 格 + 格 };
  }
}

import Phaser from 'phaser';
import { 图, 素材清单 } from '../assets';
import { VIEWPORT } from '../viewport';
import { bus, CMD } from '../../state/bus';
import { useGameStore, type CarryKind, type StationLabel } from '../../state/store';
import {
  匹配订单,
  缺少工序,
  生成订单,
  工序表,
  type 订单,
  type 工序,
} from '../../state/orders';
import {
  COLLIDING_TILES,
  CROWD,
  DECOS,
  GROUND_LIMIT,
  INTERACT_RADIUS,
  LEVEL_ROWS,
  MAP_H,
  MAP_W,
  NPC_SPEED,
  NPC_START,
  ORDER_SLOTS,
  PLAYER_SPEED,
  PLAYER_START,
  PROCESS_TIME,
  QUOTA,
  STATIONS,
  TILE,
  TIME_LIMIT,
  tileToWorld,
  type StationDef,
} from '../greybox/level';

interface StationRuntime extends StationDef {
  wx: number;
  wy: number;
  sprite: Phaser.GameObjects.Image;
  glow: Phaser.GameObjects.Image;
}

/** 地面上的一件东西：可以反复丢下/捡起 */
interface GroundRuntime {
  id: number;
  工序: 工序[];
  kind: 'blank' | 'resume';
  x: number;
  y: number;
  sprite: Phaser.GameObjects.Image;
}

type Facing = 'down' | 'up' | 'left' | 'right';
type NpcState = 'toShelf' | 'toStation' | 'working' | 'toBin' | 'idle';

const NPC_TALK = [
  '客户在催了，快一点。',
  '这单我先拿去排版。',
  '岗位要求又改了，你看到了吗？',
  '章在右边那台，别忘了。',
];

const 装饰贴图: Record<string, string> = {
  plant: 图.绿萝,
  box: 图.纸箱,
  banner: 图.易拉宝,
  mug: 图.马克杯,
};

/** 工位用什么道具（两个加工台共用展位桌，靠染色区分；缺的机器后续补素材） */
const 工位贴图: Record<StationRuntime['kind'], string> = {
  shelf: 图.资料架,
  typeset: 图.工位桌,
  print: 图.打印机,
  stamp: 图.工位桌,
  bin: 图.投递箱,
};

const 工位染色: Partial<Record<StationRuntime['kind'], number>> = {
  typeset: 0x9ec6ff,
  stamp: 0xffb3a0,
};

const BIN_LOCK_INTERVAL = 46_000;
const BIN_LOCK_DURATION = 6_000;

/**
 * 第一章关卡 · 真素材版
 *
 * 玩法按《胡闹厨房》的思路：
 *   · 顶部挂 3 张随机订单（公司 + 需要的工序），**不强制顺序**
 *   · 简历架取空白简历 → 任意顺序过排版/打印/盖章三台机器 → 投递箱交付
 *   · 手上的东西**随时能扔在地上，也能再捡起来**（空格在空地丢，靠近地面的东西捡）
 *   · 交付时只要工序覆盖了某张订单的要求就算过，多做了也认
 */
export class OfficeScene extends Phaser.Scene {
  private player!: Phaser.Physics.Arcade.Sprite;
  private npc!: Phaser.Physics.Arcade.Sprite;
  private playerShadow!: Phaser.GameObjects.Image;
  private npcShadow!: Phaser.GameObjects.Image;
  private carriedSprite!: Phaser.GameObjects.Image;
  private npcCarriedSprite!: Phaser.GameObjects.Image;
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
  private fx!: Phaser.GameObjects.Particles.ParticleEmitter;
  private ring!: Phaser.GameObjects.Graphics;

  private running = false;
  private finished = false;
  private carrying: CarryKind = null;
  private carryTags: 工序[] = [];
  private npcCarrying: CarryKind = null;
  private npcTags: 工序[] = [];
  private processing = 0;
  private processingStation: StationRuntime | null = null;
  private orders: 订单[] = [];
  private delivered = 0;
  private failed = 0;
  private timeLeft = TIME_LIMIT;
  private syncAcc = 0;
  private facing: Facing = 'down';
  private npcState: NpcState = 'toShelf';
  private npcTimer = 0;
  private npcTarget: StationRuntime | null = null;
  private npcTalkTimer = 9_000;
  private binLockTimer = BIN_LOCK_INTERVAL;
  private binLockedFor = 0;

  constructor() {
    super('office');
  }

  preload(): void {
    for (const [key, url] of 素材清单) this.load.image(key, url);
  }

  create(): void {
    useGameStore.getState().setReady(TIME_LIMIT, QUOTA);
    this.physics.world.setBounds(0, 0, MAP_W, MAP_H);

    this.制作踏步帧(图.主角_正面, 图.主角_下_踏步);
    this.制作踏步帧(图.主角_背面, 图.主角_上_踏步);
    this.制作踏步帧(图.学长_正面, 图.学长_正面_踏步);
    this.制作踏步帧(图.学长_侧面, 图.学长_侧面_踏步);
    this.制作踏步帧(图.学长_背面, 图.学长_背面_踏步);
    this.制作瓦片集();
    this.制作小贴图();
    this.制作动画();

    this.buildTiles();
    this.buildDecor();
    this.buildStations();
    this.buildFx();
    this.buildActors();
    this.bindInput();

    this.cameras.main.setBounds(0, 0, MAP_W, MAP_H);
    this.cameras.main.setRoundPixels(true);
    this.cameras.main.setBackgroundColor('#1a1f2b');

    useGameStore.getState().toast('系统', '按「开始测试」进入关卡；顶部订单条列出每单需要的工序。');
    this.exposeDevProbe();
  }

  /* ───────── 运行时生成的贴图 ───────── */

  /**
   * 踏步帧：把正面/背面视图**压缩 2 像素**（脚底对齐），做出明显的踏步感。
   * 一开始只做"整体下沉 1px"，实测几乎看不出来 —— 压缩才是能看清的做法。
   * 真正的四方向行走图后续补素材。
   */
  private 制作踏步帧(源key: string, 新key: string): void {
    const 纹理 = this.textures.get(源key);
    const 源 = 纹理.getSourceImage() as CanvasImageSource;
    const 帧 = 源 as unknown as { width: number; height: number };
    const cv = document.createElement('canvas');
    cv.width = 帧.width;
    cv.height = 帧.height;
    const ctx = cv.getContext('2d');
    if (!ctx) return;
    ctx.imageSmoothingEnabled = false;
    const 压缩 = 2;
    ctx.drawImage(源, 0, 0, 帧.width, 帧.height, 0, 压缩, 帧.width, 帧.height - 压缩);
    if (this.textures.exists(新key)) this.textures.remove(新key);
    const tex = this.textures.addCanvas(新key, cv);
    tex?.setFilter(Phaser.Textures.FilterMode.NEAREST);
  }

  /** 把四张瓦片贴图拼成一张 4 格 tileset：0 地毯 / 1 隔板墙 / 2 办公墙 / 3 木地板 */
  private 制作瓦片集(): void {
    const cv = document.createElement('canvas');
    cv.width = TILE * 4;
    cv.height = TILE;
    const ctx = cv.getContext('2d');
    if (!ctx) return;
    ctx.imageSmoothingEnabled = false;
    const 顺序 = [图.地面_地毯, 图.墙_白墙, 图.墙_玻璃, 图.地面_木地板];
    顺序.forEach((key, i) => {
      const 源 = this.textures.get(key).getSourceImage() as CanvasImageSource;
      ctx.drawImage(源, i * TILE, 0, TILE, TILE);
    });
    if (this.textures.exists(图.瓦片集)) this.textures.remove(图.瓦片集);
    const tex = this.textures.addCanvas(图.瓦片集, cv);
    // ⚠️ 线性过滤会让平铺的瓦片互相渗色
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

  private 制作动画(): void {
    const 组: Array<[string, string[]]> = [
      ['主角_走_左右', [...图.主角_走]],
      ['主角_走_下', [图.主角_正面, 图.主角_下_踏步]],
      ['主角_走_上', [图.主角_背面, 图.主角_上_踏步]],
      ['学长_走_左右', [图.学长_侧面, 图.学长_侧面_踏步]],
      ['学长_走_下', [图.学长_正面, 图.学长_正面_踏步]],
      ['学长_走_上', [图.学长_背面, 图.学长_背面_踏步]],
    ];
    for (const [key, frames] of 组) {
      if (this.anims.exists(key)) this.anims.remove(key);
      this.anims.create({ key, frames: frames.map((k) => ({ key: k })), frameRate: 6, repeat: -1 });
    }
  }

  /* ───────── 场景搭建 ───────── */

  private buildTiles(): void {
    const map = this.make.tilemap({ data: LEVEL_ROWS, tileWidth: TILE, tileHeight: TILE });
    const tileset = map.addTilesetImage('tiles', 图.瓦片集);
    if (!tileset) throw new Error('tileset 未绑定');
    const layer = map.createLayer(0, tileset, 0, 0);
    if (!layer) throw new Error('图层创建失败');
    this.layer = layer as Phaser.Tilemaps.TilemapLayer;
    this.layer.setCollision(COLLIDING_TILES);
    this.layer.setDepth(-50);
  }

  private buildDecor(): void {
    for (const d of DECOS) {
      const { x, y } = tileToWorld(d.col, d.row);
      this.add.image(x + (d.dx ?? 0), y + (d.dy ?? 0), 装饰贴图[d.texture]).setDepth(y + (d.dy ?? 0));
    }
    CROWD.forEach((c, i) => {
      const { x, y } = tileToWorld(c.col, c.row);
      const 影 = this.add.image(x, y + 16, 'shadow').setDepth(1).setAlpha(0.6);
      const 人 = this.add.image(x, y - 6, 图.群像[i % 图.群像.length]).setDepth(y - 6).setAlpha(0.85);
      this.tweens.add({
        targets: [人, 影],
        y: '-=1',
        duration: 1400 + i * 120,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.inOut',
      });
    });
  }

  private buildStations(): void {
    const 名牌: StationLabel[] = [];
    this.stations = STATIONS.map((def) => {
      const { x, y } = tileToWorld(def.col, def.row);
      const sprite = this.add.image(x, y + 6, 工位贴图[def.kind]);
      sprite.setDepth(y - 4);
      const tint = 工位染色[def.kind];
      if (tint !== undefined) sprite.setTint(tint);

      const glow = this.add.image(x, y - 30, 图.简章).setVisible(false).setDepth(9000).setScale(0.7);
      this.tweens.add({ targets: glow, y: y - 34, duration: 620, yoyo: true, repeat: -1, ease: 'Sine.inOut' });

      名牌.push({ label: def.label, 工序: def.工序 ?? null, x, y: y - 26, kind: def.kind });
      return { ...def, wx: x, wy: y, sprite, glow };
    });
    // 站名交给 React 用 HTML 画（Phaser 在 512×288 上渲染 9px 中文一定糊）
    useGameStore.getState().setStationLabels(名牌);
  }

  private buildActors(): void {
    const playerPos = tileToWorld(PLAYER_START.col, PLAYER_START.row);
    const npcPos = tileToWorld(NPC_START.col, NPC_START.row);

    this.playerShadow = this.add.image(playerPos.x, playerPos.y + 16, 'shadow').setDepth(1);
    this.npcShadow = this.add.image(npcPos.x, npcPos.y + 16, 'shadow').setDepth(1);

    this.player = this.physics.add.sprite(playerPos.x, playerPos.y, 图.主角_正面);
    this.player.setOrigin(0.5, 0.5).setCollideWorldBounds(true);
    this.setBody(this.player);

    this.npc = this.physics.add.sprite(npcPos.x, npcPos.y, 图.学长_正面);
    this.npc.setOrigin(0.5, 0.5).setCollideWorldBounds(true);
    this.setBody(this.npc);

    this.carriedSprite = this.add.image(0, 0, 图.简章).setVisible(false).setDepth(9500);
    this.npcCarriedSprite = this.add.image(0, 0, 图.简章).setVisible(false).setDepth(9500);

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
    const keyboard = this.input.keyboard;
    if (!keyboard) return;
    this.cursors = keyboard.createCursorKeys();
    this.keyW = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.W);
    this.keyA = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.A);
    this.keyS = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.S);
    this.keyD = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.D);

    this.unsubscribe.push(bus.on(CMD.start, () => this.beginRun()));
    this.unsubscribe.push(bus.on(CMD.restart, () => this.scene.restart()));

    // 交互键用事件而不是逐帧 poll JustDown：Phaser 的 Key.onUp 会清掉 _justDown，
    // 同一帧内按下又抬起的快速点按会被吞掉。
    keyboard.on('keydown-SPACE', this.onInteractKey, this);
    keyboard.on('keydown-E', this.onInteractKey, this);
    keyboard.on('keydown-Q', this.onDropKey, this);
    keyboard.on('keydown-ESC', this.onPauseKey, this);

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      keyboard.off('keydown-SPACE', this.onInteractKey, this);
      keyboard.off('keydown-E', this.onInteractKey, this);
      keyboard.off('keydown-Q', this.onDropKey, this);
      keyboard.off('keydown-ESC', this.onPauseKey, this);
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

  private onPauseKey(): void {
    if (this.finished) return;
    useGameStore.getState().togglePause();
    const paused = useGameStore.getState().phase === 'paused';
    if (paused) this.physics.world.pause();
    else this.physics.world.resume();
  }

  private 可以在关卡里操作(): boolean {
    return this.running && !this.finished && useGameStore.getState().phase === 'playing';
  }

  private beginRun(): void {
    this.running = true;
    this.finished = false;
    for (const item of this.ground) item.sprite.destroy();
    this.ground = [];
    this.orders = Array.from({ length: ORDER_SLOTS }, () => 生成订单(0));
    this.physics.world.resume();
    useGameStore.getState().beginPlay();
    useGameStore.getState().toast('系统', '去简历架取一份空白简历，按订单要求过机器，最后投进投递箱。');
  }

  /* ───────── 每帧 ───────── */

  update(_time: number, delta: number): void {
    this.sortDepth();
    this.followCarried();

    if (this.running && !this.finished && useGameStore.getState().phase === 'playing') {
      this.tickClock(delta);
      this.tickPlayer();
      this.tickNpc(delta);
      this.tickProcessing(delta);
      this.tickInterference(delta);
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
  }

  private followCarried(): void {
    this.carriedSprite
      .setPosition(this.player.x, this.player.y - 18)
      .setVisible(this.carrying !== null)
      .setTexture(this.carrying === 'resume' ? 图.简历 : 图.简章);
    this.npcCarriedSprite
      .setPosition(this.npc.x, this.npc.y - 18)
      .setVisible(this.npcCarrying !== null)
      .setTexture(this.npcCarrying === 'resume' ? 图.简历 : 图.简章);
  }

  private tickClock(delta: number): void {
    this.timeLeft = Math.max(0, this.timeLeft - delta / 1000);
    if (this.timeLeft <= 0) this.endRun();
  }

  /** 四方向行走：左右用侧面 4 帧；上下用正面/背面 + 压缩踏步帧 */
  private tickPlayer(): void {
    const body = this.player.body as Phaser.Physics.Arcade.Body;
    const left = this.keyA.isDown || this.cursors.left.isDown;
    const right = this.keyD.isDown || this.cursors.right.isDown;
    const up = this.keyW.isDown || this.cursors.up.isDown;
    const down = this.keyS.isDown || this.cursors.down.isDown;

    const dx = (right ? 1 : 0) - (left ? 1 : 0);
    const dy = (down ? 1 : 0) - (up ? 1 : 0);

    if (dx === 0 && dy === 0) {
      body.setVelocity(0, 0);
      if (this.player.anims.isPlaying) this.player.anims.stop();
      this.player.setTexture(this.待机贴图(this.facing));
      this.player.setFlipX(this.facing === 'left');
      return;
    }

    const 方向 = new Phaser.Math.Vector2(dx, dy).normalize().scale(PLAYER_SPEED);
    body.setVelocity(方向.x, 方向.y);

    if (Math.abs(dx) >= Math.abs(dy)) this.facing = dx < 0 ? 'left' : 'right';
    else this.facing = dy < 0 ? 'up' : 'down';

    const 动画 = this.动画名(this.facing, '主角');
    if (!this.player.anims.isPlaying || this.player.anims.currentAnim?.key !== 动画) {
      this.player.anims.play(动画, true);
    }
    this.player.setFlipX(this.facing === 'left');
  }

  private 动画名(朝向: Facing, 谁: '主角' | '学长'): string {
    const 后缀 = 朝向 === 'up' ? '上' : 朝向 === 'down' ? '下' : '左右';
    return `${谁}_走_${后缀}`;
  }

  private 待机贴图(朝向: Facing, 谁: '主角' | '学长' = '主角'): string {
    if (谁 === '学长') {
      if (朝向 === 'up') return 图.学长_背面;
      if (朝向 === 'down') return 图.学长_正面;
      return 图.学长_侧面;
    }
    if (朝向 === 'up') return 图.主角_背面;
    if (朝向 === 'down') return 图.主角_正面;
    return 图.主角_侧面;
  }

  /* ───────── NPC ───────── */

  private tickNpc(delta: number): void {
    const body = this.npc.body as Phaser.Physics.Arcade.Body;

    this.npcTalkTimer -= delta;
    if (this.npcTalkTimer <= 0) {
      this.npcTalkTimer = Phaser.Math.Between(15_000, 22_000);
      this.say('学长', NPC_TALK[Phaser.Math.Between(0, NPC_TALK.length - 1)]);
    }

    switch (this.npcState) {
      case 'toShelf': {
        if (this.走向(this.npc, this.approachOf('shelf'), NPC_SPEED)) {
          this.npcCarrying = 'blank';
          this.npcTags = [];
          this.npcState = 'toStation';
          this.npcTarget = this.随机加工台();
        }
        break;
      }
      case 'toStation': {
        const 台 = this.npcTarget;
        if (!台) {
          this.npcState = 'toBin';
          break;
        }
        if (this.走向(this.npc, this.approachOf(台.kind), NPC_SPEED)) {
          this.npcState = 'working';
          this.npcTimer = 2000;
          body.setVelocity(0, 0);
        }
        break;
      }
      case 'working': {
        body.setVelocity(0, 0);
        this.npc.setTexture(this.待机贴图('down', '学长'));
        this.npcTimer -= delta;
        if (this.npcTimer <= 0) {
          const 台 = this.npcTarget;
          if (台?.工序) {
            this.npcCarrying = 'resume';
            if (!this.npcTags.includes(台.工序)) this.npcTags.push(台.工序);
            this.fx.explode(5, 台.wx, 台.wy - 18);
          }
          // 学长只做一道工序就去投，做多了会抢玩家的活
          this.npcState = 'toBin';
        }
        break;
      }
      case 'toBin': {
        if (this.走向(this.npc, this.approachOf('bin'), NPC_SPEED)) {
          const 命中 = 匹配订单(this.npcTags, this.orders);
          if (命中) {
            this.完成订单(命中, '学长');
          } else {
            this.fx.explode(4, this.stationOf('bin').wx, this.stationOf('bin').wy - 18);
          }
          this.npcCarrying = null;
          this.npcTags = [];
          this.npcState = 'idle';
          this.npcTimer = Phaser.Math.Between(8_000, 13_000);
          this.npc.setTexture(this.待机贴图('down', '学长'));
          body.setVelocity(0, 0);
        }
        break;
      }
      case 'idle': {
        body.setVelocity(0, 0);
        this.npcTimer -= delta;
        if (this.npcTimer <= 0) this.npcState = 'toShelf';
        break;
      }
    }
  }

  private 随机加工台(): StationRuntime {
    const 台 = this.stations.filter((s) => s.工序);
    return 台[Phaser.Math.Between(0, 台.length - 1)];
  }

  /** 朝某个点走；到了返回 true。自动按位移方向切换贴图/动画（这就是"人机也有动画"） */
  private 走向(sprite: Phaser.Physics.Arcade.Sprite, 目标: { x: number; y: number }, speed: number): boolean {
    const distance = Phaser.Math.Distance.Between(sprite.x, sprite.y, 目标.x, 目标.y);
    if (distance < 6) {
      (sprite.body as Phaser.Physics.Arcade.Body).setVelocity(0, 0);
      if (sprite.anims.isPlaying) sprite.anims.stop();
      sprite.setTexture(this.待机贴图('down', '学长'));
      return true;
    }
    this.physics.moveTo(sprite, 目标.x, 目标.y, speed);
    const dx = 目标.x - sprite.x;
    const dy = 目标.y - sprite.y;
    const 朝向: Facing = Math.abs(dx) >= Math.abs(dy) ? (dx < 0 ? 'left' : 'right') : dy < 0 ? 'up' : 'down';
    const 动画 = this.动画名(朝向, '学长');
    if (!sprite.anims.isPlaying || sprite.anims.currentAnim?.key !== 动画) sprite.anims.play(动画, true);
    sprite.setFlipX(朝向 === 'left');
    return false;
  }

  /* ───────── 加工 ───────── */

  private tickProcessing(delta: number): void {
    if (!this.processingStation) return;
    const station = this.processingStation;
    const away =
      Phaser.Math.Distance.Between(this.player.x, this.player.y, station.wx, station.wy) > INTERACT_RADIUS + 10;
    if (away || !this.carrying) {
      this.processingStation = null;
      this.processing = 0;
      this.say('系统', '加工中断了：离开机器就要重来。');
      return;
    }
    this.processing += delta / (PROCESS_TIME * 1000);
    if (this.processing >= 1) {
      const tag = station.工序;
      this.processing = 0;
      this.processingStation = null;
      if (tag) {
        if (!this.carryTags.includes(tag)) this.carryTags.push(tag);
        this.carrying = 'resume';
        this.fx.explode(6, station.wx, station.wy - 18);
        this.say('系统', `完成「${tag}」`);
      }
    }
  }

  private tickInterference(delta: number): void {
    if (this.binLockedFor > 0) {
      this.binLockedFor -= delta;
      if (this.binLockedFor <= 0) {
        this.stationOf('bin').sprite.clearTint();
        this.say('系统', '投递箱重新开放。');
      }
      return;
    }
    this.binLockTimer -= delta;
    if (this.binLockTimer <= 0) {
      this.binLockTimer = BIN_LOCK_INTERVAL;
      this.binLockedFor = BIN_LOCK_DURATION;
      this.stationOf('bin').sprite.setTint(0xff6b4a);
      this.cameras.main.flash(160, 255, 90, 60);
      this.say('系统', '岗位要求变更：投递箱暂停接收，先把手上这单做完。');
    }
  }

  /* ───────── 交互 ───────── */

  /** 空格：上下文交互。空手→捡地上的/取简历；手上有→用地上的机器/交付；空地上→放下 */
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
      if (台?.kind === 'shelf') {
        this.carrying = 'blank';
        this.carryTags = [];
        this.fx.explode(4, 台.wx, 台.wy - 18);
        return;
      }
      if (台?.工序) return this.say('系统', '手上没有简历，先去简历架取一份。');
      return;
    }

    // 手上有东西
    if (台?.kind === 'bin') {
      if (this.binLockedFor > 0) return this.say('系统', '投递箱暂停接收，等一下再投。');
      this.交付();
      return;
    }
    if (台?.工序) {
      this.processingStation = 台;
      this.processing = 0;
      return;
    }
    if (台?.kind === 'shelf') return this.say('系统', '一次只能拿一份。');
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
    this.carrying = item.kind;
    this.carryTags = [...item.工序];
    item.sprite.destroy();
    this.ground = this.ground.filter((g) => g !== item);
    this.say('系统', item.工序.length ? `捡起：已做过 ${item.工序.join('、')}` : '捡起：空白简历');
  }

  /** 把手上的东西放到地上（胡闹厨房式：随时能扔，也随时能再捡） */
  private 丢下(): void {
    if (!this.carrying) return;
    this.groundSeq += 1;
    const x = this.player.x + (this.朝向向量().x || 0) * 14;
    const y = this.player.y + 10;
    const sprite = this.add.image(x, y, this.carrying === 'resume' ? 图.简历 : 图.简章);
    sprite.setDepth(4);
    this.ground.push({ id: this.groundSeq, 工序: [...this.carryTags], kind: this.carrying, x, y, sprite });
    if (this.ground.length > GROUND_LIMIT) {
      const 最旧 = this.ground.shift();
      最旧?.sprite.destroy();
    }
    this.carrying = null;
    this.carryTags = [];
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
      this.failed += 1;
      const 最近 = this.orders
        .map((o) => ({ o, 缺: 缺少工序(this.carryTags, o) }))
        .sort((a, b) => a.缺.length - b.缺.length)[0];
      const 提示 = 最近 ? `还差「${最近.缺.join('、')}」，或者这份简历不对口` : '没有匹配的订单';
      this.say('系统', `投错了：${提示}`);
      this.cameras.main.shake(120, 0.004);
      // 投错也把东西消耗掉（避免玩家原地刷），但不计分
      this.carrying = null;
      this.carryTags = [];
      return;
    }
    this.完成订单(命中, '你');
    this.carrying = null;
    this.carryTags = [];
  }

  private 完成订单(order: 订单, who: '你' | '学长'): void {
    const idx = this.orders.indexOf(order);
    if (idx >= 0) this.orders.splice(idx, 1, 生成订单(this.delivered));
    this.delivered += 1;
    const bin = this.stationOf('bin');
    this.fx.explode(who === '你' ? 16 : 8, bin.wx, bin.wy - 18);
    if (who === '你') {
      this.cameras.main.flash(90, 255, 210, 120);
      this.cameras.main.shake(120, 0.006);
    }
    this.say(who === '你' ? '系统' : '学长', `${order.公司} 这一单交付成功（${order.需要.join('+') || '直接投'}）`);
    useGameStore.getState().orderDone();
    if (this.delivered >= QUOTA) this.endRun();
  }

  private updatePrompt(): void {
    const 台 = this.nearestStation();
    const 地面物 = this.附近的地面物();
    for (const item of this.stations) item.glow.setVisible(false);
    if (台) 台.glow.setVisible(true);

    let text: string;
    if (this.processingStation) {
      text = `加工中 ${Math.round(this.processing * 100)}%`;
    } else if (!this.carrying) {
      if (地面物) text = '空格 · 捡起地上的东西';
      else if (台?.kind === 'shelf') text = '空格 · 取一份空白简历';
      else text = '去简历架取一份空白简历';
    } else if (台?.kind === 'bin') {
      text = '空格 · 投出去';
    } else if (台?.工序) {
      text = `空格 · 上机做「${台.工序}」`;
    } else if (台?.kind === 'shelf') {
      text = '手上已有一份，先做订单';
    } else {
      text = '空格 · 把手上的东西放下（Q 也可以丢）';
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
    });
  }

  private endRun(): void {
    if (this.finished) return;
    this.finished = true;
    this.running = false;
    const rating = this.delivered >= QUOTA ? 'S' : this.delivered >= QUOTA - 1 ? 'A' : this.delivered >= QUOTA - 2 ? 'B' : 'C';
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
      const value = LEVEL_ROWS[row]?.[col];
      if (value === 0) {
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
      npcX: this.npc.x,
      npcY: this.npc.y,
      npcTexture: this.npc.texture.key,
      npcAnim: this.npc.anims.currentAnim?.key ?? null,
      npcState: this.npcState,
      carrying: this.carrying,
      carryTags: this.carryTags,
      orders: this.orders.map((o) => ({ 公司: o.公司, 需要: o.需要 })),
      ground: this.ground.map((g) => ({ id: g.id, 工序: g.工序, x: g.x, y: g.y })),
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
      orientation: VIEWPORT.orientation,
      stations: Object.fromEntries(this.stations.map((s) => [s.kind, { x: s.wx, y: s.wy }])),
      approaches: Object.fromEntries(
        this.stations.map((s) => {
          const spot = this.approachOf(s.kind);
          return [s.kind, { x: spot.x, y: spot.y }];
        }),
      ),
      grid: LEVEL_ROWS,
      tile: TILE,
    });
  }
}

void 工序表;

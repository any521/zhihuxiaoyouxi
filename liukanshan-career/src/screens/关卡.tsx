/**
 * 小游戏屏（**工作关**）—— 全屏 + 上下 1:4。
 *
 * 用户要求：
 *   一、「小游戏做一下优化改为**全屏**」
 *   二、「上下分为 1:4，**上面 1/5 显示需要的任务**」
 *   三、「不要这样的 ui，要做成**主题样式**和当前主题一致的 UI」
 *      → 顶部任务条、说明、按钮全部走 AVG/地图那一套米白 + 绿 + 棕，不再用深蓝游戏 HUD
 *
 * 布局：
 *   ┌──────────────────────────────────────────────┐
 *   │ 手上的活 · 标题 · 交稿 3/8 · 180s  [工单卡×3] │ ← 上 1/5（DOM，主题样式）
 *   ├──────────────────────────────────────────────┤
 *   │                                              │
 *   │            Phaser 画布（整数倍 = 像素完美）    │ ← 下 4/5
 *   │                                              │
 *   │  [现在该做什么] [操作]        [跳过这一关 ▸]   │ ← 浮在画布上的 DOM
 *   └──────────────────────────────────────────────┘
 *
 * ⚠️ **像素完美的做法**（和 `MapScreen` 同一套）：不去拉伸画布，而是反过来 ——
 *    按窗口算"内部该有多少格"，让"区域尺寸 ≥ 内部像素 × 整数倍"成立，
 *    画布用 CSS 放大整数倍。所以**全屏了也依然是整数倍 + 最近邻**。
 * ⚠️ 代价：**格数随窗口变**，所以关卡布局是"按格数现造"的
 *    （`greybox/level.ts` 的 `造关卡`），不是写死的两张图。
 * ⚠️ 窗口尺寸在**进关卡时算一次**（`useMemo`，没有依赖）：
 *    玩的中间改窗口不改布局（改了要重建关卡、手上的活会丢）。这是有意的。
 */
import { useEffect, useMemo, useRef, useState, type ReactElement } from 'react';
import { 按动作 } from '../game/touch';
import { 是触屏, 虚拟摇杆 } from './摇杆';
import Phaser from 'phaser';
import './关卡.css';
import { 造关卡游戏配置 } from '../game/config';
import { QUOTA, TIME_LIMIT, 最少格, 设定关卡格数 } from '../game/greybox/level';
import { bus, CMD } from '../state/bus';
import { useGameStore } from '../state/store';
import { useStory } from '../state/story';
import { 全部工序, 工序表, type 订单, type 工序 } from '../state/orders';
import { StartOverlay } from '../ui/StartOverlay';
import { PauseMenu } from '../ui/PauseMenu';
import { ResultPanel } from '../ui/ResultPanel';
import { Toasts } from '../ui/Toasts';
import { 播放 } from '../story/audio';

const 格 = 32;

interface 关卡尺寸 {
  倍: number;
  内宽: number;
  内高: number;
  格列: number;
  格行: number;
  顶高: number;
}

/** 再大就不像"一间办公室"了（也免得大屏变成越野跑） */
/**
 * 格子上限。
 * ⚠️ 原来是 { 26, 15 } ✗（注释写着「再大就不像一间办公室了」✔）——
 *    但用户明确要求：「把上面提示卡和游戏画面**中间那片空白**给画面，让它更大」✔
 *    窗口一宽/一矮，26×15 就顶到上限 ✗，画布再也长不大 → 多出来的空间成了奶色留白 ✔
 *    现在放宽到 **60×30**（只是防病态的兜底 ✗）：
 *    格子数改成由窗口算 → 画布基本铺满可用区域 ✔（余量 < 一格 32px ✗）
 * ⚠️ 代价：超大窗口下办公室会显得更空旷（原来那句设计顾虑 ✔）—— 这是用户要的取舍 ✔
 */
const 最大格 = { cols: 60, rows: 30 };
/** 想优先拿到的格数：格子多才有地方摆隔断/小间（用户要求"地图复杂一点"） */
const 优先格 = { cols: 16, rows: 10 };

/**
 * 按窗口算"上 1/5 任务条 + 下 4/5 画布"，并让画布保持整数倍。
 *
 * ⚠️ 整数倍的选法**不是"越大越好"**：
 *    倍越大 → 格子越少 → 地图越像空房间（原来 1440×900 上只有 15×7 格，
 *    想加隔断/小间都塞不下）。所以：
 *      一、先找一个"至少放得下 最少格"的倍；
 *      二、如果 **倍 = 2** 也在上下限之内，就用 2 —— 宁可像素块小一点，也要地图有结构。
 */
/**
 * 算这一关的格子数。
 *
 * ⚠️ `横板=true` = "**把关卡自己转 90°**来当横屏"（见下面 `横板` 的注释）——
 *    这时候宽高要**换过来算**，否则转完还是竖着的那套格子 ✗
 */
function 算尺寸(横板 = false): 关卡尺寸 {
  const W = Math.max(320, 横板 ? window.innerHeight : window.innerWidth);
  const H = Math.max(420, 横板 ? window.innerWidth : window.innerHeight);
  /**
   * 顶部任务条的高度。
   *
   * ⚠️⚠️ 原来写的是 `max(96, H/5)` —— **装不下内容** ✗：
   *    实测窄屏横板下任务条只有 93px，而里面有"标题那一行(~43) + 三张工单卡(96)" ≈ 139px，
   *    于是**工单卡被裁掉一半**（用户报的「上面显示的订单信息一部分被遮挡」）✔
   *    现在按"内容真需要的高度"给下限 150 ✔（宽屏仍然是 1/5，桌面端观感不变）
   */
  /**
   * ⚠️ 150 不够：任务条里其实是**三行**（标题行 ~44 + 工单卡行 ~100 + 手上/队友行 ~42），
   *    150 会把第三行裁掉一半 ✗（用户报「第三行显示的内容几乎完全不显示」）
   *    → 抬到 186 ✔（宽屏仍然按 H/5，桌面观感不变 ✔）
   */
  /**
   * 顶部任务条的高度：**4 : 8**（用户要求）—— 也就是上 1/3、下 2/3 ✔
   *
   * ⚠️ 上面这块里要放**四行**：标题行 / 工单卡行 / 手上行 / 队友行，
   *    每行占 1/4 ✔（见 关卡.css 末尾那段「四行布局」）
   * ⚠️ 不再用 max(186, H/5) ✗ —— 那是按内容兜底，和 4:8 的硬要求冲突 ✔
   *    **空间不够就把内容缩小**（字号/内边距在 CSS 里按行高缩放 ✗），不许挤压 ✔
   */
  /**
   * 顶部任务条高度：**2/12（1/6）** —— 用户要求「小游戏画面做成截图那样」：
   *    任务条尽量薄、画面尽量大 ✔（截图里那条约占全高 1/6，画面占 5/6 ✔）
   * ⚠️ 从 4/12 改成 2/12：**画面从 8/12 涨到 10/12** ✔
   * ⚠️ 四行内容仍然要装得下（见 关卡.css 的行高），不够就继续缩内容 ✗ 不许裁 ✔
   * ⚠️ 移动端比例不合就**留白**（不拉伸 ✗）—— 画面容器居中，多余空间自然留白 ✔
   */
  /**
   * 顶部任务条高度：**4/12（1/3）**。
   * ⚠️ 我先按「画面尽量大」改成了 2/12 ✗ —— 结果**太挤**：
   *    工单卡被截断成「阿麦·…」✗、工序块和「手上空」叠在一起 ✔
   *    用户给了对比图，明确要宽松的那个版本 ✔ → 回到 4/12 ✔
   * ⚠️ 别再为了「画面大」把它压到 2/12 ✗ —— 内容装不下就会挤 ✔
   */
  const 顶高 = Math.max(96, Math.round((H * 4) / 12));
  const 区宽 = W;
  const 区高 = H - 顶高; // 下 4/5

  const 格数 = (k: number): { c: number; r: number } => ({
    c: Math.floor(区宽 / (格 * k)),
    r: Math.floor(区高 / (格 * k)),
  });

  let 倍 = 1;
  for (let k = 4; k >= 1; k -= 1) {
    const { c, r } = 格数(k);
    if (c >= 最少格.cols && r >= 最少格.rows && c <= 最大格.cols && r <= 最大格.rows) {
      倍 = k;
      break;
    }
  }
  // 第二条：能上 2 就上 2
  const 二 = 格数(2);
  if (
    二.c >= Math.max(最少格.cols, 优先格.cols) &&
    二.r >= Math.max(最少格.rows, 优先格.rows) &&
    二.c <= 最大格.cols &&
    二.r <= 最大格.rows
  ) {
    倍 = 2;
  }

  const 格列 = Math.max(最少格.cols, Math.floor(区宽 / (格 * 倍)));
  const 格行 = Math.max(最少格.rows, Math.floor(区高 / (格 * 倍)));
  return { 倍, 内宽: 格列 * 格, 内高: 格行 * 格, 格列, 格行, 顶高 };
}

/**
 * 工序小图标（**和 Phaser 里画的是同一套形状**）。
 *
 * ⚠️ 为什么 DOM 里也要一份：顶部工单卡上要显示"这一版还缺哪几道"，
 *    而画布里的图标是 Phaser 程序画的，DOM 拿不到那些贴图。
 *    两边形状/颜色保持一致（放大镜 / 稿纸 / 对勾），玩家才能把"卡上的图标"
 *    和"稿子上盖的图标"对上号 —— 这正是"一眼看出做到哪一步"的关键。
 */
function 工序图标({ 名 }: { 名: 工序 }): ReactElement {
  return (
    <img
      className="lv-ico"
      src={new URL(`assets/map/ic_工序_${名}.png`, document.baseURI).href}
      alt=""
      draggable={false}
    />
  );
}

/**
 * 工位名牌：**Phaser 只算坐标，文字用 DOM 画**。
 *
 * ⚠️ 为什么必须由 DOM 画：画布里画 9~11px 中文必然糊（项目铁律）。
 * ⚠️ 坐标是**画布内部像素**，所以要乘整数倍缩放；外层 `.lv-canvas` 就是画布那一块，
 *    所以直接用 `left/top = 内部坐标 × 倍` 即可（不用再减去画布在区域里的偏移）。
 */
function 工位名牌({ 倍 }: { 倍: number }): ReactElement {
  const 名牌 = useGameStore((s) => s.stationLabels);
  return (
    <>
      {名牌.map((l) => (
        <span
          key={l.kind}
          className={`station-label${l.工序 ? ' machine' : ''}`}
          style={{ left: l.x * 倍, top: l.y * 倍 }}
        >
          {/*
            ⚠️ 用户要求「每个机器比如打印机要**显示出来**，并且提示不要盖住字体和素材」：
              所以每台机器 = **自己的小图标 + 名字**。图标用的是 public/assets 里的真素材
              （加工位就是"稿子上盖的那一枚"工序图标），用 <img> 走 DOM，保证像素锐利。
          */}
          {l.图标 ? (
            <img
              className="lv-station-ico"
              src={new URL(`assets/${l.图标}`, document.baseURI).href}
              alt=""
              draggable={false}
            />
          ) : null}
          {l.label}
        </span>
      ))}
    </>
  );
}

/** 当前这个关卡 Phaser 实例（设置面板、技能卡都要通过它找到场景） */
let 关卡游戏: Phaser.Game | null = null;

/** 开/关设置面板（Esc 和触屏的齿轮按钮共用同一个入口） */
function 切设置(): void {
  const 场 = 关卡游戏?.scene?.getScene('office') as { 切换设置?: () => void } | undefined;
  场?.切换设置?.();
}

/**
 * 是不是触屏设备。
 *
 * ⚠️ **小游戏原来在手机上一步都走不动**（用户问"移动端怎么移动和操作"）——
 *    因为 `tickPlayer()` 只读键盘。摇杆/按钮只在粗指针设备上显示：
 *    有键盘的机器上摆这两个东西纯属挡画面。
 *    也可以在 URL 上加 `?触屏=1` 手动打开（方便在电脑上核对布局）。
 */
/**
 * 移动端操作：**左下虚拟摇杆（共用组件）+ 右下动作键**。
 */
function 触屏操作(): ReactElement {
  /*
   * ⚠️ 这个组件里**不再有自己的钩子**：
   *    · `开规则` 删掉了 —— 规则入口已经从这颗「?」挪进设置/暂停菜单 ✗
   *      （留着会变成未使用变量，构建直接 TS6133 ✗）
   *    · ⚠️ 也不要写 `const 切设置 = ...`：那会**遮蔽模块级的 切设置()**（第 165 行），
   *      而且 store 里的动作叫 `开关设置`（不是 `开设置`）—— 我写错过一次，构建报 TS2339 ✗
   */
  return (
    <>
      <虚拟摇杆 />

      {/*
        ⚠️⚠️ 动作键绑 **onPointerDown**，不绑 onClick。
        原因（实测）：**两根手指同时按**（一根推摇杆、一根点动作键）时，
        浏览器**根本不合成 click** —— 于是"边走边按空格"完全没反应
        （用户报的"移动端移动和空格交互不能同时进行"）。
        实测：单指点击 → down+click 都有；两指同时 → **只有 down**。
        `preventDefault` 顺便挡住了"按钮拿到焦点后空格会去点它"的老问题。
      */}
      <div className="lv-actions">
        {/*
          ⚠️ 用户要求：「**设置也移动到右上角**」「**? 是重新开始**，修复也移动到右上角」——
          所以原来这里的 ⚙（设置）和 ?（规则）**都挪走了** ✔
          · ⚙ 设置 → 右上角 ✔
          · ? 改成 **↻ 重开本关** → 右上角 ✔
          · 规则仍能从设置（或 Esc）里看（暂停菜单里有"看完整规则"）✔
        */}
        <button
          type="button"
          className="lv-act q"
          onPointerDown={(e) => {
            e.preventDefault();
            按动作('Q');
          }}
          title="丢下（Q）"
        >
          <b>Q</b>
          <span>丢下</span>
        </button>
        <button
          type="button"
          className="lv-act space"
          onPointerDown={(e) => {
            e.preventDefault();
            按动作('空格');
          }}
          title="领单 / 捡 / 交稿 / 放下（空格）"
        >
          <b>空格</b>
          <span>交互</span>
        </button>
        <button
          type="button"
          className="lv-act e"
          onPointerDown={(e) => {
            e.preventDefault();
            按动作('E');
          }}
          title="干活：连按加工序 / 把稿子放进打印机（E）"
        >
          <b>E</b>
          <span>干活</span>
        </button>
      </div>
    </>
  );
}

/**
 * **竖屏时提示横过来**（用户要求："如果移动端竖屏拥挤能不能修改为横屏"）。
 *
 * 为什么横屏能解决拥挤：
 *   · 竖屏（390×844）：任务条占 1/5 高 = 169px，画布只剩 675px 的**窄高**区域，
 *     关卡网格被算成 12×21（细长条），工位全挤在窄条上，任务条里三行字也挤成一团。
 *   · 横屏（844×390）：任务条 78px、画布 312px 的**宽扁**区域，网格算成 26×9 —— 
 *     和 PC 上那块"一排工位 + 走廊"的布局基本一致，拥挤问题从根上消失。
 *
 * ⚠️ 显示期间**把场景暂停**：不暂停的话计时还在走，玩家看着提示却在掉时间。
 * ⚠️ 留一个「仍然竖屏玩」的出口：不能把人堵死（也能在电脑上核对竖版布局）。
 */
/**
 * **强制横屏**（用户要求：「小游戏强制横屏这个，依旧竖屏开始改为**开始游戏然后强制横屏**」）。
 *
 * 浏览器没有"直接命令手机转屏"的 API，能做的是这两步（都要在**用户手势**里调）：
 *   ① `requestFullscreen()` —— 全屏（不先进全屏，Android 上 orientation.lock 会被拒）
 *   ② `screen.orientation.lock('landscape')` —— 锁横屏
 * ⚠️ iOS Safari 两条都不支持（`lock` 不存在）——所以是 `try/catch` 的"尽力而为"，
 *    失败了就退回"请把手机横过来"的提示（下面的 `锁没锁上` 状态）。
 */
async function 强制横屏(): Promise<boolean> {
  try {
    if (!document.fullscreenElement) await document.documentElement.requestFullscreen?.();
  } catch {
    /* 全屏被拒也无所谓，继续试着锁方向 */
  }
  try {
    const 方向 = screen.orientation as unknown as { lock?: (o: string) => Promise<void> } | undefined;
    if (方向?.lock) {
      await 方向.lock('landscape');
      return true;
    }
  } catch {
    /* iOS 或没权限 —— 锁不上 */
  }
  return false;
}

function 请横屏({
  显示,
  开始,
  就绪,
}: {
  显示: boolean;
  /** 玩家点了「开始游戏」（true=已经把屏幕锁成横屏了）/「不横屏，直接玩」（false）*/
  开始: (锁上了: boolean) => void;
  /** ⚠️ 必须传进来当依赖：**子组件的 effect 比父组件建 Phaser 的 effect 先跑**，
   *    只依赖"显示"的话，第一次挂载时 `关卡游戏` 还是 null，暂停就白设了（实测踩到）。 */
  就绪: boolean;
}): ReactElement | null {
  void 就绪;
  /*
   * ⚠️ 暂停**不在这里做**（子组件的 effect 比父组件建 Phaser 的 effect 先跑，
   *    实测这里调 pause 根本没生效，场景状态仍是 RUNNING）。
   *    挪到父组件 关卡 里统一管（它手上有 游戏 ref 和全部依赖）。
   */

  if (!显示) return null;
  return (
    <div className="lv-rotate">
      <div className="lv-rotate-box">
        <div className="lv-rotate-pic" aria-hidden="true">
          <span className="lv-rotate-phone" />
        </div>
        <h2>横屏玩这一关</h2>
        <p>
          这一关是横向的办公室：横屏之后上面是任务条、下面是整间屋子，
          工位和按钮都不会挤在一起（和电脑上一样）。
          <br />
          点下面开始，<b>会自动切成横屏</b>。
        </p>
        <button
          type="button"
          className="lv-rotate-go"
          onPointerDown={async (e) => {
            e.preventDefault();
            // ⚠️ 必须在**用户手势里**调 —— 出了手势再锁，浏览器会拒
            const 锁上了 = await 强制横屏();
            // 锁不上（iPhone 常见）也照样放行：下面还留着"竖着玩"的提示
            开始(锁上了);
          }}
        >
          开始游戏 ▸
        </button>
        {/* ⚠️ 用户要求：「**去掉竖屏游戏的选项，强制横屏**」——"不横屏，直接玩"这个出口删掉了 ✔ */}
        <div className="lv-rotate-tip">（锁不上就自动把画面转成横的，不用你动手）</div>
      </div>
    </div>
  );
}

/** 一道工序的小徽章：做过的填色 + 打勾 */
function 工序标({ 名, 已完成 }: { 名: 工序; 已完成: boolean }): ReactElement {
  const info = 工序表[名];
  return (
    <span
      className={`lv-step${已完成 ? ' done' : ''}`}
      style={{ borderColor: info.色, color: 已完成 ? '#241a12' : info.色 }}
      title={`${info.说明}（${info.在哪}）`}
    >
      <工序图标 名={名} />
      {/* ⚠️ 名字单独包一层：窄屏上**工单卡里**的工序只留图标（三个字太占地方，
          三张卡就挤不下了），而"手上这一版"里仍然带名字 ——
          这样玩家还是能学会"哪个图标 = 哪道工序"。 */}
      <span className="lv-step-name">{名}</span>
    </span>
  );
}

/** 一张工单卡：客户 + 这一版要做的工序（手上已有的会打勾） */
function 工单卡({ 单, 手上 }: { 单: 订单; 手上: 工序[] }): ReactElement {
  /*
   * 用户要求：工单要有**时间限制**；快到时**边框变红**，变红后消失并扣分。
   * `剩余` 由场景每帧写进来（见 OfficeScene.tickOrders）——
   * 这里只负责"显示秒数 + 快到了给个红框脉冲" ✔
   *
   * ⚠️⚠️ 这段注释**必须在 `return (` 外面**：写在 return 里面会变成
   *    "返回两个表达式"，Vite 直接 PARSE_ERROR，**整个站点都起不来** ✗（实测踩到）
   */
  return (
    <article className={`lv-card${单.剩余 !== undefined &&单.剩余 <= 8 ? ' urgent' : ''}`}>
      <div className="lv-card-top">
        <b>{单.客户}</b>
        <span className="lv-card-type">{单.类型}</span>
        <span className="lv-card-pts">+{单.分}</span>
        {单.剩余 !== undefined ? <span className="lv-card-left">{Math.max(0, Math.ceil(单.剩余))}s</span> : null}
      </div>
      <div className="lv-card-steps">
        {单.需要.map((g) => (
          <工序标 key={g} 名={g} 已完成={手上.includes(g)} />
        ))}
      </div>
    </article>
  );
}

export function 关卡(): ReactElement {
  const 标题 = useStory((s) => s.关卡标题);
  const 提示 = useStory((s) => s.关卡提示);
  const 关卡结束 = useStory((s) => s.关卡结束);

  // 只在进关卡时算一次（玩的中间改窗口不重建关卡 —— 重建会把手上的活丢掉）
  /**
   * **重排计数**：竖屏点了「开始游戏」→ 强制横屏之后，视口变了，
   * 关卡网格必须**按新的视口重算** —— 否则会出现用户报的
   * 「点了横屏还是竖屏显示」✗（锁是锁上了，但布局还是进关卡那一刻按竖屏算的）。
   *
   * ⚠️ 只在"还没开始打"（简报/挡板阶段）才允许重排 —— 打到一半重建会把这一局丢掉，
   *    那条老规则（"玩的中间改窗口不重建关卡"）依然成立。
   */
  const [重排, set重排] = useState(0);
  /**
   * **横板**：把整个关卡**自己转 90°**，当成一块横屏板子玩。
   *
   * ⚠️⚠️ 为什么必须要有这个（用户第二次报「移动端小游戏还是竖屏」）：
   *    "请求系统锁横屏"（`screen.orientation.lock`）**在 iOS Safari 上根本不存在** ✗，
   *    微信内置浏览器也常常没有 ✗ —— 安卓 Chrome 全屏下才行。
   *    所以只靠锁方向，iPhone 上点了「开始游戏」**还是竖屏** ✔
   *    现在：锁成功了就真横屏 ✔，**锁不上就把板子转 90°** ✔（CSS 旋转，所有手机都生效）
   */
  const [横板, set横板] = useState(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const 尺寸 = useMemo(() => 算尺寸(横板), [重排, 横板]);
  const 挂载 = useRef<HTMLDivElement>(null);
  const 游戏 = useRef<Phaser.Game | null>(null);

  const delivered = useGameStore((s) => s.delivered);
  const failed = useGameStore((s) => s.failed);
  const quota = useGameStore((s) => s.quota);
  const orders = useGameStore((s) => s.orders);
  const carryTags = useGameStore((s) => s.carryTags);
  const carrying = useGameStore((s) => s.carrying);
  const timeLeft = useGameStore((s) => s.timeLeft);
  const timeLimit = useGameStore((s) => s.timeLimit);
  const prompt = useGameStore((s) => s.prompt);
  const 帮手 = useGameStore((s) => s.帮手);
  // ⚠️ 不再读 `cards`：技能卡已经从小游戏里移除了（用户要求"技能卡只在对话时使用"）
  /**
   * ⚠️⚠️ 钩子**必须和其它 useGameStore 放在一起**（都在函数最上面）。
   *    我第一次把它加在 `挡着` 那里 —— 那已经在若干提前 return 之后了 ✗，
   *    结果一打开规则弹层就报
   *    **"Rendered more hooks than during the previous render"**（Hooks 规则）✗
   */
  const 看规则 = useGameStore((s) => s.看规则);
  const 打印 = useGameStore((s) => s.打印);
  /** 触屏设备才画摇杆/按键（也可以用 ?触屏=1 强制打开来核对布局） */
  const [触屏设备] = useState(是触屏);
  /**
   * 竖屏 + 触屏 → 建议横过来。
   * ⚠️ 跟着窗口尺寸走：转屏之后提示自己消失（转回来又会出来，除非玩家点了"仍然竖屏玩"）。
   */
  const [竖着, set竖着] = useState(() => typeof window !== 'undefined' && window.innerHeight > window.innerWidth);
  const [不再提示, set不再提示] = useState(false);
  /** Phaser 建好了没有（请横屏的暂停要等它） */
  const [就绪, set就绪] = useState(false);
  useEffect(() => {
    const 看 = (): void => set竖着(window.innerHeight > window.innerWidth);
    window.addEventListener('resize', 看);
    window.addEventListener('orientationchange', 看);
    return () => {
      window.removeEventListener('resize', 看);
      window.removeEventListener('orientationchange', 看);
    };
  }, []);

  /** 竖屏挡板显示时（触屏设备）→ 暂停场景，玩家不会"看不见还在掉时间" */
  /** 打开规则弹层时也要停住（时间还在走的话，看一眼规则回来就输了 ✗）*/
  const 挡着 = (触屏设备 && 竖着 && !不再提示) || 看规则;
  useEffect(() => {
    const 拿场景 = (): { pause: () => void; resume: () => void } | undefined =>
      (游戏.current?.scene?.getScene('office') as { scene?: { pause: () => void; resume: () => void } } | undefined)
        ?.scene;
    if (!挡着) {
      拿场景()?.resume();
      return;
    }
    /**
     * ⚠️ 这里**不能只 pause 一次**：Phaser 的场景是"建 game 之后下一帧才创建"的，
     *    而 effect 的时机和它对不上（实测第一次调 pause 时场景还没好，或者被别处的
     *    resume 顶掉 —— 场景状态一直是 RUNNING）。
     *    改成"挡着期间每 300ms 补一次"，场景一就绪立刻暂停，自愈。
     */
    const 试 = (): void => 拿场景()?.pause();
    试();
    const 停 = window.setInterval(试, 300);
    return () => window.clearInterval(停);
  }, [挡着]);

  /* ── 建 Phaser（只建一次；尺寸是进关卡那一刻算好的） ── */
  useEffect(() => {
    const 宿主 = 挂载.current;
    if (!宿主 || 游戏.current) return;
    // ⚠️ 关卡网格必须在**建游戏之前**定下来（preload/create 都要按它算世界尺寸）
    设定关卡格数(尺寸.格列, 尺寸.格行);
    const g = new Phaser.Game(造关卡游戏配置(尺寸.内宽, 尺寸.内高, 宿主.id || 'lv-host'));
    游戏.current = g;
    关卡游戏 = g;
    set就绪(true);
    if (import.meta.env.DEV) {
      (window as unknown as Record<string, unknown>).__lksGame = g;
    }
    return () => {
      g.destroy(true);
      游戏.current = null;
      关卡游戏 = null;
      set就绪(false);
      // 离开关卡把游戏状态收干净（不然再进来会停在结算面板上）
      useGameStore.getState().setReady(TIME_LIMIT, QUOTA);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [重排]);

  /**
   * **Esc 开设置**：挂在 window 上，**不依赖画布焦点**。
   *
   * ⚠️ 用户报「按 esc 键没有出现设置页面」—— 根因是 Phaser 的键盘事件要画布拿到焦点，
   *    而玩家进关卡后未必点过画布。场景里**已经不再绑 ESC**（两边都响会"开了又立刻关"），
   *    唯一入口就是这里。简报阶段按也能开（`开设置()` 会记住回来的阶段）。
   */
  useEffect(() => {
    const 按键 = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      切设置();
    };
    window.addEventListener('keydown', 按键);
    return () => window.removeEventListener('keydown', 按键);
  }, []);

  /**
   * **技能卡：按 1 / 2 / 3 用掉**（也可以直接点卡片）。
   *
   * ⚠️ 和 Esc 一样挂在 window 上（不挑画布焦点）。效果在场景里落地
   *    （见 `OfficeScene.用卡`），这里只负责"把第 i 张递给场景"。
   */
  useEffect(() => {
    const 按键 = (e: KeyboardEvent): void => {
      const i = ['1', '2', '3'].indexOf(e.key);
      if (i < 0) return;
      const 卡 = useGameStore.getState().cards[i];
      if (!卡) return;
      e.preventDefault();
      const 场景 = 游戏.current?.scene?.getScene('office') as { 用卡?: (c: typeof 卡) => void } | undefined;
      场景?.用卡?.(卡);
    };
    window.addEventListener('keydown', 按键);
    return () => window.removeEventListener('keydown', 按键);
  }, []);

  const seconds = Math.ceil(timeLeft);
  const 比 = timeLimit > 0 ? Math.max(0, Math.min(1, timeLeft / timeLimit)) : 0;
  /** 时间紧张时沙漏翻得快一点（也给边框变红当提示） */
  const 吃紧 = seconds <= 30;

  return (
    <div
      className={`lv-root${触屏设备 ? ' lv-touch' : ''}${横板 ? ' lv-board' : ''}`}
      /*
       * ⚠️ 转 90° 的算法（原点取左上角）：
       *    元素的**宽 = 视口高、高 = 视口宽**（先按横屏铺好），
       *    再 `translateX(视口宽) rotate(90deg)` —— 旋转是"先转再平移"，
       *    所以转完正好铺满竖屏那块屏幕 ✔
       *    （变换会影响命中测试，所以摇杆/按键的手感在转完之后依然对准 ✔）
       */
      style={
        横板
          ? {
              position: 'fixed',
              inset: 'auto',
              left: 0,
              top: 0,
              width: window.innerHeight,
              height: window.innerWidth,
              transformOrigin: 'top left',
              transform: `translateX(${window.innerWidth}px) rotate(90deg)`,
            }
          : undefined
      }
    >
      {/* ── 上 1/5：任务条（主题样式） ── */}
      <header className="lv-top" style={{ height: 尺寸.顶高 }}>
        <div className="lv-top-line">
          <span className="lv-tag">手上的活</span>
          <b className="lv-title">{标题 || '把这一版稿子做出来'}</b>
          <span className="lv-prog">
            交稿 <b>{delivered}</b>/{quota}
            {failed > 0 ? <i className="lv-bad"> · 交错 {failed}</i> : null}
          </span>
          {提示 ? <span className="lv-sub">{提示}</span> : null}
          <span className="lv-clock">
            {/*
              用户要求：「沙漏和倒计时**移动到右上角**、和倒计时**合并**」——
              所以沙漏从右下角挪到这儿，和秒数并排 ✔
            */}
            <i
              className="lv-hour-img"
              style={
                {
                  backgroundImage: `url("${new URL('assets/avg/hourglass_v.png', document.baseURI).href}")`,
                  '--帧长': 吃紧 ? '0.9s' : '2.2s',
                } as React.CSSProperties
              }
            />
            <b className={seconds <= 20 ? 'low' : undefined}>{String(seconds).padStart(3, '0')}s</b>
            <i className="lv-bar">
              <i style={{ width: `${比 * 100}%` }} />
            </i>
          </span>
          {/*
            右上角的两颗（用户要求）：**⚙ 设置** + **↻ 重新开始**。
            ⚠️ 放在任务条的最右上（而不是画面右上角）—— 画面右上角是"我的工位"，
               盖上去会挡住工位和素材 ✗
            ⚠️ 和别的游戏内按钮一样绑 onPointerDown（触摸下 onClick 不一定合成 ✗）
          */}
          <div className="lv-tools">
            <button
              type="button"
              className="lv-tool"
              onPointerDown={(e) => {
                e.preventDefault();
                切设置();
              }}
              title="设置（Esc）"
              aria-label="设置"
            >
              ⚙
            </button>
            <button
              type="button"
              className="lv-tool"
              onPointerDown={(e) => {
                e.preventDefault();
                播放('按钮');
                bus.emit(CMD.restart);
              }}
              title="重新开始这一关"
              aria-label="重新开始"
            >
              ↻
            </button>
          </div>
        </div>

        {/*
          ⚠️ 这一排分两层包：`.lv-cards`（工单卡）和 `.lv-extra`（手上 + 帮手）。
          宽屏时两层都是 `display: contents`（等于没包，还是原来的一排横铺）；
          窄屏时变成**上下两行**：上面一行横向滚工单卡，下面一行放手上和帮手。
          不这么分的话，窄屏上"手上这一版"会被挤到屏幕外 —— 玩家看不到自己做到哪一步了（实测过）。
        */}
        <div className="lv-orders">
          <div className="lv-cards">
            {orders.length === 0 ? (
              <span className="lv-empty">点「开始干活」后这里会挂出工单</span>
            ) : (
              orders.map((o) => <工单卡 key={o.id} 单={o} 手上={carryTags} />)
            )}
          </div>

          <div className="lv-extra">
            {/* 手上这一版：把"已完成的工序"直接画出来（和稿子上盖的图标是同一套） */}
            <div className={`lv-carry${carrying ? ' on' : ''}`}>
              <span className="lv-carry-name">
                {carrying ? (carrying === 'draft' ? '手上的稿子' : '空白任务单') : '手上空'}
              </span>
              <span className="lv-carry-steps">
                {全部工序.map((g) => (
                   <工序标 key={g} 名={g} 已完成={carryTags.includes(g)} />
                ))}
              </span>
            </div>

            {/* 打印机里那一份：**放进去就能走开**，所以倒计时必须挂在任务条上 */}
            {打印 ? (
              <div className="lv-printer" title="放进去等出来，一次只能一份">
                <span className="lv-printer-name">打印机</span>
                <span className="lv-printer-do">
                  {打印.工序} · 还差 {打印.剩余.toFixed(1)}s
                </span>
              </div>
            ) : null}

            {/* 帮忙的同事（按工单客户选的"相关同事"） */}
            {帮手 ? (
              <div className="lv-helper" title="他干活比你慢得多，大头还得你自己来">
                <span className="lv-helper-who">{帮手.名}</span>
                <span className="lv-helper-do">{帮手.状态}</span>
              </div>
            ) : null}
          </div>
        </div>

        {/*
          ⚠️ 第三行：**所有文字都在任务条里**，画布上一个浮层都不留。
          用户要求「每个机器比如打印机要显示出来，并且**提示不要盖住字体和素材**」——
          原来"现在该做什么"和飘字是**浮在画布上**的：房间最上面那一排工位
          （文件柜 / 资料库 / 我的工位 / 文印区）连名牌一起被盖住。
          现在这一行放在任务条里，画布区域百分之百干净。
        */}
        <div className="lv-help">
          <span className="lv-now">
            <b>现在该做什么</b>
            {prompt || '等待开始'}
          </span>
          {/* 操作说明跟着输入方式走：触屏上写"方向键"只会让人找键盘 */}
          <span className="lv-keys">
            {触屏设备 ? (
              <>
                左下<b>摇杆</b>走动 · 右下<b>E</b> 干活 · <b>空格</b> 领单/捡/交稿 · <b>Q</b> 丢下 · 点<b>技能卡</b>使用
              </>
            ) : (
              <>
                <b>方向键</b>/<b>WASD</b> 走动 · <b>Shift</b> 快走 · <b>空格</b> 领单/捡/交稿/放下 ·{' '}
                <b>E</b> 干活 · <b>Q</b> 丢下 · <b>1/2/3</b> 用技能卡 · <b>Esc</b> 设置
              </>
            )}
          </span>
          <Toasts />
          <button
            className="lv-skip"
            // ⚠️ 同上：触摸下 onClick 不一定合成
            onPointerDown={(e) => {
              e.preventDefault();
              播放('按钮');
              关卡结束();
            }}
            title="直接跳过这一关，回到剧情（成绩按 0 交稿算）"
          >
            跳过这一关 ▸
          </button>
        </div>
      </header>

      {/* ── 下 4/5：画布 ── */}
      <div className="lv-stage">
        {/* 移动端：左下摇杆 + 右下动作键（键盘那一套在手机上够不着） */}
        {触屏设备 ? <触屏操作 /> : null}
        {/* 竖屏太挤 → 建议横过来（横屏是 26×9 的宽版布局，和 PC 一致） */}
        <请横屏
          显示={挡着}
          开始={(锁上了) => {
            set不再提示(true);
            // ⚠️ 系统不让锁（iPhone / 微信内置浏览器）→ **自己把板子转 90°**，
            //    这样"竖屏手机"上看到的关卡依然是横的 ✔
            if (!锁上了) {
              set横板(true);
              set重排((v) => v + 1);
              return;
            }
            /**
             * ⚠️ 锁了横屏之后视口才变，所以要**等它变完**再重排关卡
             *    （立刻重排会still读到竖屏的 innerWidth/innerHeight）。
             * ⚠️ 只有"还没开打"才重排：简报阶段重建不丢东西 ✔
             *    （打到一半重建会把手上那版稿子丢掉，那种情况就不重排了。）
             */
            if (锁上了 && !useGameStore.getState().phase.includes('playing')) {
              window.setTimeout(() => set重排((v) => v + 1), 450);
            }
          }}
          就绪={就绪}
        />

        {/*
          右下角的沙漏：**用户要求"右下角显示沙漏动画显示时间"**。
          ⚠️ 它是唯一允许压在画布上的东西（在右下角，那片是墙根/空地，
            工位和素材全在上半区）；体检里对此有专门断言：沙漏只能待在右下角，
            **不许压到工位那一排**。
        */}
        {/*
          左下角：**技能卡**。放在左下角（和右下角沙漏对称）—— 那片是墙根/空地，
          工位和素材都在上半区，压不到。
          ⚠️ 卡是**交稿攒出来的**（每 2 版一张），每一张都对应剧情里学过的一课，
             用掉就等于"把学到的东西用出来"，不是外挂。
        */}
        {/*
          ⚠️⚠️ 这里原来有一排**技能卡**（左下角"不懂就问"那些），已按用户要求**移除**：
          「将不懂就问贴在左侧的卡片移除，**技能卡只在对话时使用**，不是在游戏里」。
          小游戏里不再出现技能卡、也不再能"用卡"（不然它就成了关卡外挂 ✗）。
          ⚠️ 卡本身还在（`state/cards.ts`），后面要挪到**对话**里用 —— 见交接文档待办。
        */}

        <div className="lv-canvas" style={{ width: 尺寸.内宽 * 尺寸.倍, height: 尺寸.内高 * 尺寸.倍 }}>
          {/* Phaser 挂在这一层；名牌叠在它上面（都是 DOM） */}
          <div className="lv-host" id="lv-host" ref={挂载} />
          <工位名牌 倍={尺寸.倍} />
        </div>
      </div>

      {/* 模态（都已经换成主题样式）。它们只在打开时才有 DOM，平时不占画布 */}
      <StartOverlay />
      {/* ⚠️ 打到一半回看规则（只暂停，不影响这一局）*/}
      <StartOverlay 模式="回看" />
      <PauseMenu />
      <ResultPanel />
    </div>
  );
}

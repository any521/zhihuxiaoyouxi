/**
 * 地图模式的 React 外壳。
 *
 * 分工：Phaser 只画像素（瓦片/道具/角色），**文字一律 DOM**。
 *
 * 【满屏又不糊的做法】
 * 直接拉伸画布会让像素发虚，所以反过来做：**按窗口算内部分辨率**，
 * 让"窗口尺寸 = 内部分辨率 × 整数倍"精确成立。
 *   1440×900  →  倍率 3  →  内部 480×300  →  3× = 1440×900 ✅ 满屏且整数倍
 *   1920×1080 →  倍率 4  →  内部 480×270  →  4× = 1920×1080 ✅
 * 这样既没有黑边，也不会出现非整数缩放的发虚。
 *
 * 【按键】
 *   方向键 / WASD  走动（Shift 跑）
 *   空格           交互
 *   Tab            掏出手机（微信）/ 再按回地图
 *   Esc            设置
 *
 * 【位置记忆】切到微信时把主角坐标记进 store，回来时传送回去 —— 不会回到出生点。
 */
import { useCallback, useEffect, useRef, useState, type ReactElement } from 'react';
import { 是触屏, 虚拟摇杆 } from './摇杆';
import Phaser from 'phaser';
import { OfficeMapScene } from '../game/map/OfficeMapScene';
import { 交互点表 } from '../game/map/level';
import { 人物卡, 设置弹层 } from './Panels';
import { 小地图 } from './小地图';
import { 取道具卡, 格子卡 } from '../story/道具卡';
import { 取人物卡 } from '../story/人物卡';
import type { 说话人 } from '../story/types';
import { useStory } from '../state/story';
import { 播放 } from '../story/audio';

/** 按窗口算"内部分辨率 × 整数倍" */
function 算尺寸(): { 倍: number; 内宽: number; 内高: number } {
  const W = Math.max(320, window.innerWidth);
  const H = Math.max(240, window.innerHeight);
  const 竖 = H > W;
  const 目标宽 = 竖 ? 288 : 480;
  const 目标高 = 竖 ? 480 : 288;
  // 取最接近的整数倍；竖屏至少 2 倍，否则内部像素太多、视野太广
  let 倍 = Math.round(Math.min(W / 目标宽, H / 目标高));
  if (竖) 倍 = Math.max(2, 倍);
  倍 = Math.max(1, 倍);
  return { 倍, 内宽: Math.ceil(W / 倍), 内高: Math.ceil(H / 倍) };
}

export function MapScreen(): ReactElement {
  const 挂载 = useRef<HTMLDivElement>(null);
  const 场景 = useRef<OfficeMapScene | null>(null);
  const 游戏 = useRef<Phaser.Game | null>(null);
  const [尺寸, set尺寸] = useState(算尺寸);
  const [就绪, set就绪] = useState(false);
  /** 附近的门（靠近时底部提示改成开门/关门） */
  const [附近门, set附近门] = useState<{ x: number; y: number; 开: boolean } | null>(null);
  const 附近门ref = useRef<{ x: number; y: number; 开: boolean } | null>(null);

  const 附近 = useStory((s) => s.附近交互点);
  /** 触屏设备才画摇杆/交互键（也可以用 ?触屏=1 强制打开核对布局） */
  const 触屏 = 是触屏();
  const 附近物 = useStory((s) => s.附近物);
  const 设附近物 = useStory((s) => s.设附近物);
  const 附近人 = useStory((s) => s.附近人);
  const 设附近人 = useStory((s) => s.设附近人);
  /** 玩家脚下是不是椅子（按空格 = 坐下/站起来） */
  const 设站在座位上 = useStory((s) => s.设站在座位上);
  /** 已经坐着了（提示显示"站起来"） */
  const 坐着 = useStory((s) => s.坐着);
  const 站在座位上 = useStory((s) => s.站在座位上);
  /** 「去房间」时底部提示要改的话（例如"小鹿在工位上等你"） */
  const 续播提示 = useStory((s) => s.续播提示);
  const 目标id = useStory((s) => s.地图目标);
  const 设附近 = useStory((s) => s.设附近);
  const 地图交互 = useStory((s) => s.地图交互);
  const 掏手机 = useStory((s) => s.掏手机);
  const 段标签 = useStory((s) => s.段标签);
  const 段号 = useStory((s) => s.段号);
  const 看人物 = useStory((s) => s.看人物);
  const 开关设置 = useStory((s) => s.开关设置);

  /* ── 窗口尺寸变了就重算（保持整数倍满屏）── */
  useEffect(() => {
    const 算 = (): void => set尺寸(算尺寸());
    window.addEventListener('resize', 算);
    window.addEventListener('orientationchange', 算);
    return () => {
      window.removeEventListener('resize', 算);
      window.removeEventListener('orientationchange', 算);
    };
  }, []);

  /* ── 启动 Phaser（只启动一次，用首次算出的尺寸）── */
  useEffect(() => {
    if (!挂载.current || 游戏.current) return;
    const 初 = 算尺寸();

    const g = new Phaser.Game({
      type: Phaser.WEBGL,
      parent: 挂载.current,
      width: 初.内宽,
      height: 初.内高,
      backgroundColor: '#262a33',
      pixelArt: true,
      roundPixels: true,
      scale: {
        mode: Phaser.Scale.NONE,
        autoCenter: Phaser.Scale.NO_CENTER,
        width: 初.内宽,
        height: 初.内高,
      },
      physics: {
        default: 'arcade',
        arcade: { gravity: { x: 0, y: 0 }, debug: false },
      },
      scene: [OfficeMapScene],
    });
    游戏.current = g;

    // 不用 Phaser 的 ready 事件（时序不稳），轮询等场景建好
    let 次 = 0;
    const 试探 = window.setInterval(() => {
      次 += 1;
      const s = g.scene.getScene('办公室地图') as OfficeMapScene | null;
      if (s && s.scene.isActive()) {
        window.clearInterval(试探);
        场景.current = s;
        s.设回调({
          附近变了: (点) => 设附近(点 ? 点.id : null),
          交互: (点) => {
            播放('按钮');
            地图交互(点.id);
          },
          点人物: (名) => {
            
            看人物(名 as never);
          },
          // 靠近门 → 底部提示改成「空格 开门/关门」
          附近门变了: (门) => {
            附近门ref.current = 门;
            set附近门(门);
          },
          // 玩家脚下是不是椅子（按空格能不能坐下）—— 场景每帧回报变化
          附近道具变了: (物) => {
            设附近物(物);
          },
          // 每帧回报"脚下是不是椅子"，用来决定空格是坐下还是交互
          站在座位上变了: (在座位上, 格) => {
            设站在座位上(在座位上, 格);
          },
          // 坐下/站起来：单独一条回调（"在座位上"和"已经坐着"是两件事）
          坐姿变了: (在坐着) => {
            设站在座位上(useStory.getState().站在座位上, undefined, 在坐着);
          },
          // 靠近同事 → 弹人物卡（他是谁 / 现在有没有戏）
          附近人变了: (名) => {
            设附近人(名);
          },
        });
        // 回到记忆中的位置（切去微信再回来不会重置到出生点）
        const 记 = useStory.getState().地图位置;
        if (记) s.传送像素(记.x, 记.y);
        set就绪(true);
        if (import.meta.env.DEV) {
          (window as unknown as Record<string, unknown>).__lksMap = s;
        }
      } else if (次 > 120) {
        window.clearInterval(试探);
      }
    }, 50);

    return () => {
      window.clearInterval(试探);
      // 卸载前记下主角位置，回来还在原地
      const s = 场景.current;
      if (s) useStory.getState().记地图位置(s.精确位置());
      g.destroy(true);
      游戏.current = null;
      场景.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ── 尺寸变了：重设内部分辨率 ── */
  useEffect(() => {
    const g = 游戏.current;
    if (!g) return;
    g.scale.resize(尺寸.内宽, 尺寸.内高);
  }, [尺寸]);

  /* ── 目标变了：指引线改指向 ── */
  useEffect(() => {
    if (!就绪) return;
    场景.current?.设目标(目标id);
  }, [目标id, 就绪]);

  /* ── 剧情推进了：换一批同事站位 ──
     ⚠️ 优先用 `NPC排布号`（剧情"去房间"时定的：那个房间该有谁），
        没有才跟着 `段号` 走。见 `level.ts` 的 `房间对应排布`。 */
  const NPC排布号 = useStory((s) => s.NPC排布号);
  useEffect(() => {
    if (!就绪) return;
    场景.current?.换NPC(NPC排布号 ?? 段号);
  }, [段号, NPC排布号, 就绪]);

  /* ── 剧情说"要坐下/站起来"：一次性任务，执行完就清掉 ── */
  const 请求坐 = useStory((s) => s.请求坐);
  const 坐完了 = useStory((s) => s.坐完了);
  useEffect(() => {
    if (!就绪 || !请求坐) return;
    const s = 场景.current;
    if (s) {
      if (请求坐 === '站') s.站起来();
      else s.坐下();
    }
    坐完了();
  }, [请求坐, 就绪, 坐完了]);

  /**
   * **"交互"这一下**：坐下 / 开关门 / 交互点 / 站起来。
   *
   * ⚠️ 抽出来是因为**键盘空格和触屏上的「交互」按钮必须走同一个入口** ——
   *    两处各写一份的话，坐着/门/交互点的优先级迟早会不一样
   *    （空格那个 bug："按空格被坐座位抢先，主线触发不了"就是这么来的）。
   */
  const 按下交互 = useCallback((): void => {
    if (useStory.getState().屏幕 !== 'map') return;
    const s0 = 场景.current;
    const st = useStory.getState();

    // ① 座位：只有"还没坐下"时才吃掉这一次（判据必须和 state/story.ts 的地图交互②完全一致）
    if (s0 && st.站在座位上 && !st.坐着) {
      播放('选择确认', 0.5);
      st.要坐坐('坐');
      return;
    }

    // ② 门优先：站在门口时是开关门
    const 门 = 附近门ref.current;
    if (门 && s0) {
      播放(门.开 ? '按钮' : '选择确认', 0.5);
      s0.开关门(门.x, 门.y);
      return;
    }

    // ③ 交互点 —— 坐着也照样能交互（「坐在工位上开主线」那条路）
    /**
     * ⚠️⚠️ **优先读 store，读不到就问场景** ✗
     *    store 里那个 `附近交互点` 是场景**异步推**过去的 ✗，可能是旧值/空值 ✔
     *    场景的 当前交互点() 是**每帧现算**的，权威 ✔
     *    （用户报的「有时按空格不触发、按 Tab 进一次微信才触发」就是这个 ✗）
     */
    /**
     * ⚠️⚠️ **场景优先，store 兜底**（顺序很重要 ✗）
     *    场景的 `当前交互点()` 是**每帧现算**的 ✔；store 里那个 `附近交互点` 是异步推过来的 ✔，
     *    它可能是**上一格**的旧值 ✗ —— 旧值会让 `地图交互(旧id)` 打不到真正的目标 ✔
     *    （用户报「林总的对话触发不了」很可能就是这个 ✗）
     *    所以：**先问场景** ✗，场景说不出（还没建好/没挨着任何点）再用 store ✔
     */
    /**
     * ⚠️⚠️ 三层兜底（用户报「**在茶水间的对话没有触发，要点击进微信才触发**」✗）：
     *    ① 场景每帧现算的（权威 ✔）
     *    ② store 里异步推过来的（可能旧/空 ✗）
     *    ③ **剧情正等着「去某房间」时，直接当成到了那儿** ✔ ——
     *       这是最后一道保险 ✗：前两层都拿不到时，只要 `续播` 挂着，
     *       玩家按空格就按「走到目标房间」处理 ✔
     *       （story 里还会再校验 `续播.去哪 === id` ✔，不会乱触发别的段 ✔）
     *    症状对照：拿不到 id → 按空格没反应 ✗ → 一开微信（切到 avg）
     *    剧情时钟才开始跑 ✔ —— 正是用户描述的现象 ✔
     */
    /**
     * ⚠️⚠️ **第四层兜底（最终保险）** ✗ ——
     *    用户又报：「去会议室和周岚对话，也没有自动打开微信、无法推动剧情，
     *    只有手动打开微信才能继续」✔ —— 和茶水间那次是**同一类** ✗
     *    我上次只兜住了「续播」一条路 ✗，而剧情在等「去哪儿」其实有**三种说法** ✔
     *      · `续播.去哪`     —— 走到房间接着播（本段没演完 ✗）
     *      · `地图目标`      —— 去某段的入口开新段 ✔
     *      · `待去房间.去哪` —— 聊天区底下那个「去 XX ▸」按钮还没点 ✔
     *    所以这里把三种**一起兜住** ✔：只要剧情在等去哪儿，按空格就按到了那儿 ✔
     *    （每一步 story 里都会再校验 ✔，不会乱触发别的段 ✗）
     */
    const 目标 = st.续播?.去哪 ?? st.地图目标 ?? st.待去房间?.去哪 ?? null;
    const id = s0?.当前交互点()?.id ?? st.附近交互点 ?? 目标;
    if (id) {
      播放('按钮');
      地图交互(id);
      return;
    }

    // ④ 坐着、这格又没事可做 → 站起来（不然坐下去就出不来）
    if (st.坐着) {
      播放('按钮');
      st.要坐坐('站');
    }
  }, [地图交互]);

  /* ── 键盘：Tab 掏手机 / Esc 设置 / 空格 交互 ── */
  const 按键 = useCallback(
    (e: KeyboardEvent): void => {
      if (e.key === 'Tab') {
        e.preventDefault();
        // ⚠️⚠️ **必须判"我现在还在不在这一屏"**（用户报的 bug："打开微信会被强制关闭"）。
        //    原因：切屏是 React 重新渲染、**监听器的卸载/挂载发生在这同一个键盘事件之后**，
        //    所以按一次 Tab 会**先后触发两个监听器** —— 地图那个切到微信，
        //    微信那个紧接着又切回地图（实测：一次 Tab 之后屏幕停在 map）。
        //    加这道闸：已经不在 map 了就直接返回。
        if (useStory.getState().屏幕 !== 'map') return;
        播放('按钮');
        const s = 场景.current;
        if (s) useStory.getState().记地图位置(s.精确位置());
        掏手机();
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        if (useStory.getState().屏幕 !== 'map') return;
        播放('按钮');
        开关设置();
        return;
      }
      if (e.code === 'Space' || e.key === ' ') {
        if (useStory.getState().屏幕 !== 'map') return;
        // ⚠️⚠️ `preventDefault()` 必须**最先**调（用户报的 bug："按空格坐下没反应"）：
        //    Space 是浏览器的"激活"键 —— 如果此刻焦点在某个 `<button>` 上
        //    （右下角的"微信"很容易拿到焦点），浏览器会用空格去**点那个按钮**，
        //    并且这个默认行为发生在 keydown 之后、比我们的逻辑更"优先"。
        //    早于一切分支 preventDefault，才能保证空格是我们自己的键。
        e.preventDefault();
        // 交给共用的那一个入口（触屏上的「交互」按钮走的是同一个函数）
        按下交互();
        return;
      }
    },
    [掏手机, 开关设置, 按下交互],
  );

  useEffect(() => {
    window.addEventListener('keydown', 按键);
    return () => window.removeEventListener('keydown', 按键);
  }, [按键]);

  const 附近点 = 附近 ? 交互点表.find((p) => p.id === 附近) : null;
  const 是主线 = 目标id !== null && 附近点?.id === 目标id;

  /** 旁边那件东西的说明卡（道具用图名查，门/玻璃用格子卡查） */
  const 卡片 = 附近物
    ? 附近物.种类 === '道具'
      ? 取道具卡(附近物.键)
      : (格子卡[附近物.键] ?? null)
    : null;
  /** 旁边那位同事的人物卡 */
  const 人卡 = 附近人 ? 取人物卡(附近人 as 说话人) : null;

  /** 记位置再切去微信 */
  const 去微信 = (): void => {
    播放('按钮');
    const s = 场景.current;
    if (s) useStory.getState().记地图位置(s.精确位置());
    掏手机();
  };

  return (
    <div className={`map-wrap${触屏 ? ' map-touch' : ''}`}>
      {/* Phaser 画布：内部尺寸 = 内宽×内高，CSS 放大整数倍，正好铺满窗口 */}
      <div
        className="map-canvas"
        ref={挂载}
        style={
          {
            '--map-w': `${尺寸.内宽 * 尺寸.倍}px`,
            '--map-h': `${尺寸.内高 * 尺寸.倍}px`,
          } as React.CSSProperties
        }
      />

      {/* 右上：小地图（点击放大） */}
      <小地图 />

      {/* 左上：天数（小徽章） */}
      <div className="map-day">{段标签}</div>

      {/* 左边：旁边那件东西是干嘛的（道具卡，一靠近就显示） */}
      {卡片 ? (
        <div className="map-prop">
          <div className="map-prop-head">{卡片.名}</div>
          <div className="map-prop-use">{卡片.用途}</div>
          {卡片.补充 ? <div className="map-prop-more">{卡片.补充}</div> : null}
        </div>
      ) : null}

      {/* 右边：旁边是哪位同事（人物卡）。和道具卡**各占一角** ——
          工位上本来就有桌面小件，写成"二选一"的话人物卡永远弹不出来（实测踩过）。 */}
      {人卡 ? (
        <div className="map-prop who">
          <div className="map-prop-head">
            {人卡.谁}
            <span className="map-prop-post">{人卡.职位}</span>
          </div>
          <div className="map-prop-use">
            {人卡.关系} · {人卡.印象}
          </div>
          <div className="map-prop-more">{人卡.口风}</div>
        </div>
      ) : null}

      {/* 左下：操作说明 */}
      <div className="map-keys">
        <b>方向键</b> 走动 · <b>Shift</b> 跑 · <b>空格</b> 交互 · <b>Tab</b> 微信 · <b>Esc</b> 设置
      </div>

      {/* 底部中间：门优先（站在门口时空格是开关门） */}
      {附近门 ? (
        <div className="map-prompt door">
          <b>{附近门.开 ? '开着' : '关着'}</b>
          <span className="map-prompt-key">空格</span>
          <span className="map-prompt-act">{附近门.开 ? '把门关上' : '把门推开'}</span>
        </div>
      ) : 附近点 ? (
        <div className={`map-prompt${是主线 ? ' main' : ''}`}>
          <b>{附近点.名}</b>
          <span className="map-prompt-key">空格</span>
          {/* 「去房间」时优先显示剧本给的提示（"小鹿在工位上等你"），比交互点自己的话更贴当下。
              ⚠️ 主线入口还要看"坐没坐下"：没坐下时空格是**先坐下**（提示说"坐下看看"），
                 坐好了之后空格才是**开始这一段**。提示不跟着变的话，
                 玩家会以为空格失灵（用户报的正是"触发不了剧情"）。 */}
          <span className="map-prompt-act">
            {是主线
              ? 坐着
                ? '开始这一段'
                : (续播提示 ?? 附近点.提示)
              : 附近点.提示}
          </span>
          {是主线 ? <span className="map-prompt-star">主线</span> : null}
        </div>
      ) : 站在座位上 ? (
        // 脚下是椅子、但当下的交互点不在这儿（没有可选的事）→ 提示可以直接坐
        <div className="map-prompt seat">
          <b>{坐着 ? '坐着' : '椅子'}</b>
          <span className="map-prompt-key">空格</span>
          <span className="map-prompt-act">{坐着 ? '站起来' : '坐下看看'}</span>
        </div>
      ) : null}

      {/*
        移动端：**左下摇杆 + 右下「交互」键**。
        ⚠️ 地图原来也只能键盘走（手机上一步都动不了）。除了摇杆，场景那边还支持
           **点地面自动寻路走过去**（点一下地，A* 出一条路自己走）。
      */}
      {触屏 ? (
        <>
          <虚拟摇杆 />
          <div className="map-actions">
            <button
              type="button"
              className="map-act"
              // ⚠️ 和摇杆同时按的时候浏览器**不会合成 click** —— 必须绑 pointerdown
              onPointerDown={(e) => {
                e.preventDefault();
                播放('按钮');
                按下交互();
              }}
              title="和键盘空格一样：坐下 / 开关门 / 交互"
            >
              交互<small>空格</small>
            </button>
          </div>
        </>
      ) : null}

      {/* 右下：掏手机 */}
      <button
        className="map-phone"
        onPointerDown={(e) => {
          e.preventDefault();
          去微信();
        }}
        title="掏出手机（Tab）"
      >
        <span className="map-phone-dot" />
        微信
        <span className="map-phone-key">Tab</span>
      </button>

      {/* 右下角：设置 */}
      <button
        className="map-gear"
        onPointerDown={(e) => {
          e.preventDefault();
          播放('按钮');
          开关设置();
        }}
        title="设置（Esc）"
        aria-label="设置"
      >
        ⚙
      </button>

      {/* 点地图上的同事弹出来的人物卡 */}
      <人物卡 />
      {/* Esc 打开的设置 */}
      <设置弹层 />
    </div>
  );
}

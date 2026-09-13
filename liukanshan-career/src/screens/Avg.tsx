/**
 * AVG 剧情屏 —— 微信式界面。
 *
 * 为什么做成微信：剧本本来就是私聊 + 群聊，用真正的聊天界面
 * ① 玩家一眼就懂怎么操作  ② 选项落在输入框的位置，「发消息」就是「做选择」
 *
 * 布局（PC）：功能栏 56px + 会话列表 236px + 聊天窗口 flex
 * 布局（手机）：列表与聊天二选一，聊天窗口左上角有返回
 *
 * 素材：功能栏、列表项两态、聊天区底、气泡九宫格、头像框、微信图标、贴纸。
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactElement } from 'react';
import type { 说话人 } from '../story/types';
import { 头像, 贴纸表, 气泡图 } from '../story/assets';
import { 剧情间隔, useStory, type 侧栏面板, type 会话, type 渲染项 } from '../state/story';
import { 侧栏内容, 资料卡, 人物卡 } from './Panels';
import { 播放, 有声, 设声音 } from '../story/audio';

const 素材 = (名: string): string => new URL(`assets/avg/${名}`, document.baseURI).href;

/**
 * 统一的按钮反馈：划过轻响、按下出声，然后才执行自己的动作。
 * 所有可点的东西都套这个，玩家不用猜哪里能点。
 * @param 动作 - 按钮自己的回调
 */
function 按钮反馈(动作?: () => void) {
  return {
    onMouseEnter: () => 播放('选项悬停'),
    onFocus: () => 播放('选项悬停'),
    onClick: () => {
      播放('按钮');
      动作?.();
    },
  };
}

/* ───────── 可拖拽的分栏 ───────── */

const 列表宽范围 = { 最小: 176, 最大: 520, 默认: 244 };
const 宽度键 = 'lks-wechat-list-width';

/** 读上次拖的宽度（记在 localStorage，刷新后还在） */
function 读列表宽(): number {
  const 存 = Number(window.localStorage.getItem(宽度键));
  if (Number.isFinite(存) && 存 >= 列表宽范围.最小 && 存 <= 列表宽范围.最大) return 存;
  return 列表宽范围.默认;
}

/**
 * 拖拽调宽。用 pointer 事件（同时支持鼠标与触摸），
 * 拖的时候禁用文本选中、把光标锁定成 col-resize。
 */
function use拖拽宽度() {
  const [宽, set宽] = useState(读列表宽);
  const [拖拽中, set拖拽中] = useState(false);
  /** 上一次按下的时刻，用来自己判定"双击" */
  const 上次按下 = useRef(0);

  // 宽度一变就落盘
  useEffect(() => {
    window.localStorage.setItem(宽度键, String(宽));
  }, [宽]);

  const 开始拖 = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();

      // ⚠️ 不能用 onDoubleClick：pointerdown 里 preventDefault() 会把后续的
      // click/dblclick 一起吃掉，双击事件根本不会触发。所以自己判。
      const 现在 = Date.now();
      const 是双击 = 现在 - 上次按下.current < 320;
      上次按下.current = 现在;
      if (是双击) {
        set宽(列表宽范围.默认);
        return;
      }

      const 起x = e.clientX;
      const 起宽 = 宽;
      set拖拽中(true);
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';

      const 移动 = (ev: PointerEvent): void => {
        const 新 = 起宽 + (ev.clientX - 起x);
        set宽(Math.min(列表宽范围.最大, Math.max(列表宽范围.最小, 新)));
      };
      const 结束 = (): void => {
        set拖拽中(false);
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
        window.removeEventListener('pointermove', 移动);
        window.removeEventListener('pointerup', 结束);
        window.removeEventListener('pointercancel', 结束);
      };
      window.addEventListener('pointermove', 移动);
      window.addEventListener('pointerup', 结束);
      window.addEventListener('pointercancel', 结束);
    },
    [宽],
  );

  /** 双击复位到默认宽度 */
  const 复位 = useCallback(() => set宽(列表宽范围.默认), []);

  /** 键盘调宽用的设置器（做一次夹紧） */
  const 设宽 = useCallback((n: number) => {
    set宽(Math.min(列表宽范围.最大, Math.max(列表宽范围.最小, n)));
  }, []);

  return { 宽, 拖拽中, 开始拖, 复位, 设宽 };
}

/** 键盘也能调（左右方向键），方便不用鼠标时 */
function 键盘调宽(e: React.KeyboardEvent, 现宽: number, 设宽: (n: number) => void): void {
  const 步 = e.shiftKey ? 40 : 12;
  if (e.key === 'ArrowLeft') {
    e.preventDefault();
    设宽(Math.max(列表宽范围.最小, 现宽 - 步));
  } else if (e.key === 'ArrowRight') {
    e.preventDefault();
    设宽(Math.min(列表宽范围.最大, 现宽 + 步));
  }
}

/** 群头像拼不满 4 个时的兜底成员 */
const 兜底成员: 说话人[] = ['小鹿', '周岚', '阿麦', '韩策'];

/** 方形头像（带像素边框）。**可点**：点了弹人物卡，和地图上点同事是同一张卡。 */
function 头({ 谁, 尺寸 = 40 }: { 谁: 说话人; 尺寸?: number }): ReactElement | null {
  const 图 = 头像(谁);
  const 看人物 = useStory((s) => s.看人物);
  if (!图) return null;
  return (
    <button
      className="wc-face"
      style={{ width: 尺寸, height: 尺寸 }}
      onMouseEnter={() => 播放('选项悬停')}
      onClick={(e) => {
        e.stopPropagation();
        播放('按钮');
        看人物(谁);
      }}
      title={`看看${谁}`}
      aria-label={`查看${谁}的资料`}
    >
      <img src={图} alt={谁} draggable={false} />
    </button>
  );
}

/** 群聊头像：2×2 拼成员的脸（成员不够 4 个就用兜底名单补） */
function 群头({ 成员, 尺寸 = 40 }: { 成员?: 说话人[]; 尺寸?: number }): ReactElement {
  const 用 = (成员 && 成员.length ? 成员 : 兜底成员).filter((x) => x !== '刘看山').slice(0, 4);
  const 四个 = 用.length >= 4 ? 用 : [...用, ...兜底成员].slice(0, 4);
  return (
    <span className="wc-face group" style={{ width: 尺寸, height: 尺寸 }}>
      {四个.map((谁) => {
        const 图 = 头像(谁);
        return 图 ? <img key={谁} src={图} alt="" draggable={false} /> : null;
      })}
    </span>
  );
}

/** 会话列表里的一行 */
function 会话行({ 会话, 选中, 点 }: { 会话: 会话; 选中: boolean; 点: () => void }): ReactElement {  const 最后 = [...会话.条目].reverse().find((x) => x.种类 !== '输入中');
  let 预览 = '';
  if (最后) {
    if (最后.种类 === '消息') 预览 = 最后.文本;
    else if (最后.种类 === '贴纸') 预览 = '[贴纸]';
    else if (最后.种类 === '系统' || 最后.种类 === '旁白') 预览 = 最后.文本;
    else if (最后.种类 === '知乎卡') 预览 = `[知乎卡] ${最后.卡片.主题}`;
    else if (最后.种类 === '邀请') 预览 = 最后.标题;
    else if (最后.种类 === '指标') 预览 = '[指标变动]';
  }
  return (
    <button className={`wc-row${选中 ? ' on' : ''}`} {...按钮反馈(点)}>
      {会话.类型 === '群聊' ? <群头 成员={会话.成员} /> : 会话.对方 ? <头 谁={会话.对方} /> : null}
      <span className="wc-row-body">
        <span className="wc-row-name">{会话.名字}</span>
        <span className="wc-row-preview">{预览 || '　'}</span>
      </span>
      {会话.未读 > 0 ? <span className="wc-badge">{会话.未读}</span> : null}
    </button>
  );
}

/** 聊天气泡 */
function 气泡({
  谁,
  我方,
  图,
  文本,
  群聊,
}: {
  谁: 说话人;
  我方: boolean;
  图?: string;
  文本?: string;
  群聊: boolean;
}): ReactElement {
  return (
    <div className={`wc-msg ${我方 ? 'right' : 'left'}`}>
      {!我方 ? 头({ 谁, 尺寸: 38 }) : null}
      <div className="wc-msg-body">
        {群聊 && !我方 ? <div className="wc-msg-name">{谁}</div> : null}
        <div
          className={`wc-bubble${图 ? ' sticker' : ''}`}
          style={图 ? undefined : { borderImageSource: `url("${我方 ? 气泡图.我方 : 气泡图.对方}")` }}
        >
          {图 ? <img className="wc-sticker" src={图} alt="" draggable={false} /> : 文本}
        </div>
      </div>
      {我方 ? 头({ 谁, 尺寸: 38 }) : null}
    </div>
  );
}

/** 一条已渲染的条目 */
function 一条({ 项, 群聊 }: { 项: 渲染项; 群聊: boolean }): ReactElement | null {
  switch (项.种类) {
    case '消息':
      return <气泡 谁={项.谁} 我方={项.我方} 文本={项.文本} 群聊={群聊} />;
    case '贴纸':
      return <气泡 谁={项.谁} 我方={项.我方} 图={贴纸表[项.贴纸]} 群聊={群聊} />;
    case '输入中':
      return (
        <div className="wc-msg left">
          {头({ 谁: 项.谁, 尺寸: 38 })}
          <div className="wc-msg-body">
            {群聊 ? <div className="wc-msg-name">{项.谁}</div> : null}
            <div className="wc-bubble other typing">
              <span className="d" />
              <span className="d" />
              <span className="d" />
            </div>
          </div>
        </div>
      );
    case '系统':
      return <div className="wc-system">{项.文本}</div>;
    case '旁白':
      return <div className="wc-narration">{项.文本}</div>;
    case '指标': {
      const 片: string[] = [];
      if (项.变动.信任) 片.push(`老板信任 ${项.变动.信任 > 0 ? '+' : ''}${项.变动.信任}`);
      if (项.变动.协作) 片.push(`团队协作 ${项.变动.协作 > 0 ? '+' : ''}${项.变动.协作}`);
      if (项.变动.成长) 片.push(`职业成长 ${项.变动.成长 > 0 ? '+' : ''}${项.变动.成长}`);
      return <div className="wc-metric">{片.join('　')}</div>;
    }
    case '邀请':
      return (
        <div className="wc-invite">
          <div className="wc-invite-icon">群</div>
          <div className="wc-invite-body">
            <div className="wc-invite-title">{项.标题}</div>
            <div className="wc-invite-sub">{项.副标题}</div>
          </div>
          {项.已接受 ? <span className="wc-invite-done">已加入</span> : null}
        </div>
      );
    case '知乎卡':
      return (
        <div className={`wc-zhihu${项.卡片.已接入 ? '' : ' empty'}`}>
          <div className="wc-zhihu-head">知乎卡 · {项.卡片.主题}</div>
          {项.卡片.已接入 ? (
            <div className="wc-zhihu-body">
              <div className="wc-zhihu-title">{项.卡片.标题}</div>
              <div className="wc-zhihu-meta">
                {项.卡片.作者 ? <span>{项.卡片.作者}</span> : null}
                {/* 赞同 0 就别显示了：真实但看着尴尬，反而像没人认可 */}
                {项.卡片.赞同 ? <span>赞同 {项.卡片.赞同}</span> : null}
                <span className="wc-zhihu-from">来自知乎</span>
              </div>
              {项.卡片.摘录 ? <知乎正文 文本={项.卡片.摘录} /> : null}
              {项.卡片.链接 ? (
                <a
                  className="wc-zhihu-link"
                  href={项.卡片.链接}
                  target="_blank"
                  rel="noreferrer"
                  onMouseEnter={() => 播放('选项悬停')}
                  onClick={() => 播放('按钮')}
                >
                  查看原文 ▸
                </a>
              ) : null}
            </div>
          ) : (
            <div className="wc-zhihu-body placeholder">内容待接入 · 将用知乎开放平台检索真实原文</div>
          )}
        </div>
      );
    default:
      return null;
  }
}

/** 把命中的词包一层高亮 */
function 高亮({ 文本, 词 }: { 文本: string; 词: string }): ReactElement {
  if (!词) return <>{文本}</>;
  const 段 = 文本.split(词);
  return (
    <>
      {段.map((s, i) => (
        <span key={i}>
          {s}
          {i < 段.length - 1 ? <mark className="wc-hit">{词}</mark> : null}
        </span>
      ))}
    </>
  );
}

/** 一条可搜索的条目（把会话里的各类条目拍平成纯文本） */
function 条目文本(项: 渲染项): string {
  switch (项.种类) {
    case '消息':
      return 项.文本;
    case '贴纸':
      return `[贴纸] ${项.贴纸}`;
    case '系统':
    case '旁白':
      return 项.文本;
    case '邀请':
      return `[群邀请] ${项.标题}`;
    case '知乎卡':
      return `[知乎卡] ${项.卡片.主题}${项.卡片.标题 ? ' ' + 项.卡片.标题 : ''}`;
    case '指标': {
      const 片: string[] = [];
      if (项.变动.信任) 片.push(`老板信任 ${项.变动.信任}`);
      if (项.变动.协作) 片.push(`团队协作 ${项.变动.协作}`);
      if (项.变动.成长) 片.push(`职业成长 ${项.变动.成长}`);
      return 片.join(' ');
    }
    default:
      return '';
  }
}

/**
 * 聊天记录搜索。
 * 在全部分会话里找包含关键词的条目，点结果直接跳到对应会话。
 */
function 搜索结果({ 词 }: { 词: string }): ReactElement {
  const 会话们 = useStory((s) => s.会话们);
  const 查看 = useStory((s) => s.查看);
  const 开搜索 = useStory((s) => s.开搜索);

  const 关键词 = 词.trim();

  if (!关键词) {
    return (
      <div className="wc-search-tip">
        输入关键词，搜全部会话的聊天记录。
        <br />
        支持搜人名、话里的词、群名。
      </div>
    );
  }

  const 结果: Array<{ 会话: 会话; 谁: string; 文本: string; id: number }> = [];
  for (const c of 会话们) {
    for (const 项 of c.条目) {
      const 文 = 条目文本(项);
      if (!文 || !文.includes(关键词)) continue;
      const 谁 = 项.种类 === '消息' || 项.种类 === '贴纸' ? 项.谁 : c.名字;
      结果.push({ 会话: c, 谁, 文本: 文, id: 项.id });
    }
  }
  // 也让人名/群名能被搜到
  const 会话命中 = 会话们.filter((c) => c.名字.includes(关键词));

  return (
    <div className="wc-search-results">
      {会话命中.length ? (
        <div className="wc-search-group">
          <div className="wc-search-group-title">会话</div>
          {会话命中.map((c) => (
            <button
              key={c.id}
              className="wc-search-row"
              {...按钮反馈(() => {
                查看(c.id);
                开搜索(false);
              })}
            >
              {c.类型 === '群聊' ? <群头 成员={c.成员} 尺寸={36} /> : c.对方 ? <头 谁={c.对方} 尺寸={36} /> : null}
              <span className="wc-search-text">
                <b>
                  <高亮 文本={c.名字} 词={关键词} />
                </b>
                <span className="wc-search-sub">{c.条目.length} 条记录</span>
              </span>
            </button>
          ))}
        </div>
      ) : null}

      {结果.length ? (
        <div className="wc-search-group">
          <div className="wc-search-group-title">聊天记录（{结果.length}）</div>
          {结果.slice(0, 60).map((r) => (
            <button
              key={`${r.会话.id}-${r.id}`}
              className="wc-search-row"
              {...按钮反馈(() => {
                查看(r.会话.id);
                开搜索(false);
              })}
            >
              <span className="wc-search-text">
                <span className="wc-search-sub">
                  {r.会话.名字} · {r.谁}
                </span>
                <span className="wc-search-body">
                  <高亮 文本={r.文本.replace(/\s+/g, ' ').slice(0, 90)} 词={关键词} />
                </span>
              </span>
            </button>
          ))}
          {结果.length > 60 ? <div className="wc-search-more">只显示前 60 条</div> : null}
        </div>
      ) : null}

      {结果.length === 0 && 会话命中.length === 0 ? (
        <div className="wc-search-tip">没有找到「{关键词}」相关的记录。</div>
      ) : null}
    </div>
  );
}

/** 知乎卡正文：默认只露几行，点「展开全文」看全部（真实摘录有好几段，全铺开会太长） */
function 知乎正文({ 文本 }: { 文本: string }): ReactElement {
  const [展开, set展开] = useState(false);
  const 长 = 文本.length > 120;
  return (
    <>
      <div className={`wc-zhihu-text${长 && !展开 ? ' 收起' : ''}`}>{文本}</div>
      {长 ? (
        <button
          className="wc-zhihu-more"
          onMouseEnter={() => 播放('选项悬停')}
          onClick={(e) => {
            e.stopPropagation();
            播放('按钮');
            set展开((v) => !v);
          }}
        >
          {展开 ? '收起 ▴' : '展开全文 ▾'}
        </button>
      ) : null}
    </>
  );
}

export function Avg(): ReactElement {
  const 屏幕 = useStory((s) => s.屏幕);
  const 队列 = useStory((s) => s.队列);
  const 位置 = useStory((s) => s.位置);
  const 会话们 = useStory((s) => s.会话们);
  const 活跃会话 = useStory((s) => s.活跃会话);
  const 查看会话 = useStory((s) => s.查看会话);
  const 面板 = useStory((s) => s.移动端面板);
  const 待选择 = useStory((s) => s.待选择);
  const 待接受邀请 = useStory((s) => s.待接受邀请);
  const 待暂停 = useStory((s) => s.待暂停);
  const 播完 = useStory((s) => s.播完);
  const 指标 = useStory((s) => s.指标);
  const 速度 = useStory((s) => s.速度);
  const 段标签 = useStory((s) => s.段标签);
  const 侧栏面板 = useStory((s) => s.侧栏面板);
  const 切面板 = useStory((s) => s.切面板);
  const 开关资料卡 = useStory((s) => s.开关资料卡);
  const 回地图 = useStory((s) => s.回地图);
  const 搜索开 = useStory((s) => s.搜索开);
  const 搜索词 = useStory((s) => s.搜索词);
  const 开搜索 = useStory((s) => s.开搜索);
  const 设搜索词 = useStory((s) => s.设搜索词);
  const 推进一步 = useStory((s) => s.推进一步);
  const 接受邀请 = useStory((s) => s.接受邀请);
  const 选择 = useStory((s) => s.选择);
  const 点暂停 = useStory((s) => s.点暂停);
  const 查看 = useStory((s) => s.查看);
  const 回列表 = useStory((s) => s.回列表);
  const 重置 = useStory((s) => s.重置);

  const [开启声音, set开启声音] = useState(有声);
  const 消息区 = useRef<HTMLDivElement>(null);
  const { 宽: 列表宽, 拖拽中, 开始拖, 设宽 } = use拖拽宽度();
  const 当前 = 会话们.find((c) => c.id === 查看会话) ?? 会话们[0];
  const 是活跃 = 查看会话 === 活跃会话;
  const 活跃名 = 会话们.find((c) => c.id === 活跃会话)?.名字 ?? '';

  // 自动推进
  useEffect(() => {
    if (屏幕 !== 'avg') return;
    if (待选择 || 待接受邀请 || 待暂停 || 播完) return;
    const 本 = 队列[位置];
    // 倍速只影响等待时长；点聊天区仍然能立刻推进
    const t = window.setTimeout(() => 推进一步(), (本 ? 剧情间隔(本) : 900) / 速度);
    return () => window.clearTimeout(t);
  }, [屏幕, 队列, 位置, 待选择, 待接受邀请, 待暂停, 播完, 推进一步, 速度]);

  // 新消息滚到底
  /* 键盘：Tab 收起手机回地图；空格和点聊天区一样推进 */
  useEffect(() => {
    const 键 = (e: KeyboardEvent): void => {
      if (e.key === 'Tab') {
        e.preventDefault();
        播放('按钮');
        回地图();
        return;
      }
      if (e.code === 'Space' || e.key === ' ') {
        e.preventDefault();
        // 和点聊天区等价：有选项/邀请/暂停时不推进（那些要点按钮）
        const s = useStory.getState();
        if (s.待选择 || s.待接受邀请 || s.待暂停) return;
        推进一步();
      }
    };
    window.addEventListener('keydown', 键);
    return () => window.removeEventListener('keydown', 键);
  }, [回地图, 推进一步]);

  useLayoutEffect(() => {
    const el = 消息区.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [当前?.条目.length, 查看会话, 待选择]);

  if (屏幕 !== 'avg') return <></>;

  /** 功能栏上四个面板按钮：图标、面板名、无障碍标签 */
  const 侧栏按钮: Array<[string, 侧栏面板, string]> = [
    ['icon_chat', '会话', '会话'],
    ['icon_contacts', '通讯录', '通讯录'],
    ['icon_settings', '设置', '设置'],
  ];

  return (
    <div className={`wechat${面板 === '列表' ? ' show-list' : ' show-chat'}`}>
      {/* ── 功能栏 ── */}
      <aside className="wc-rail">
        {/* 点头像 = 打开自己的资料卡 */}
        <button
          className="wc-me"
          {...按钮反馈(() => 开关资料卡())}
          title="我的资料"
          aria-label="打开我的资料卡"
        >
          {头({ 谁: '刘看山', 尺寸: 36 })}
        </button>

        <nav className="wc-rail-icons">
          {侧栏按钮.map(([图标, 名, 标签]) => (
            <button
              key={名}
              className={`wc-icon${侧栏面板 === 名 ? ' on' : ''}`}
              {...按钮反馈(() => 切面板(名))}
              title={标签}
              aria-label={标签}
              aria-current={侧栏面板 === 名}
            >
              <img src={素材(`${图标}.png`)} alt="" draggable={false} />
            </button>
          ))}
        </nav>

        <button
          className={`wc-icon bottom${侧栏面板 === '更多' ? ' on' : ''}`}
          {...按钮反馈(() => 切面板('更多'))}
          title="更多"
          aria-label="更多"
        >
          <img src={素材('icon_more.png')} alt="" draggable={false} />
        </button>
      </aside>

      {/* ── 会话以外的面板：占满列表 + 聊天区 ── */}
      {侧栏面板 !== '会话' ? (
        <侧栏内容 面板={侧栏面板} />
      ) : (
        <>
      {/* ── 会话列表 ── */}
      <section className="wc-list" style={{ width: 列表宽 }}>
        {搜索开 ? (
          /* 搜索态：顶栏变成输入框（微信就是这个交互） */
          <header className="wc-list-head search">
            <input
              className="wc-search-input"
              value={搜索词}
              autoFocus
              placeholder="搜索聊天记录"
              onChange={(e) => 设搜索词(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') 开搜索(false);
              }}
            />
            <button className="wc-search-cancel" {...按钮反馈(() => 开搜索(false))}>
              取消
            </button>
          </header>
        ) : (
          <header className="wc-list-head">
            <span className="wc-list-title">微信</span>
            <button
              className="wc-list-search"
              {...按钮反馈(() => 开搜索(true))}
              title="搜索聊天记录"
              aria-label="搜索聊天记录"
            >
              <img src={素材('icon_search.png')} alt="" draggable={false} />
            </button>
          </header>
        )}

        {搜索开 ? (
          <搜索结果 词={搜索词} />
        ) : (
          <>
            <div className="wc-metrics">
              <span>信任 {指标.信任}</span>
              <span>协作 {指标.协作}</span>
              <span>成长 {指标.成长}</span>
            </div>

            <div className="wc-rows">
              {会话们.map((c) => (
                <会话行 key={c.id} 会话={c} 选中={c.id === 查看会话} 点={() => 查看(c.id)} />
              ))}
            </div>

            <div className="wc-list-foot">
              <button
                className="wc-reset"
                {...按钮反馈(() => {
                  const 新 = !开启声音;
                  set开启声音(新);
                  设声音(新);
                  if (新) 播放('按钮');
                })}
                title={开启声音 ? '关掉音效' : '打开音效'}
              >
                {开启声音 ? '🔊 音效开' : '🔇 音效关'}
              </button>
              <button className="wc-reset" {...按钮反馈(重置)}>
                重来
              </button>
            </div>
          </>
        )}
      </section>

      {/* ── 可拖拽分栏 ── */}
      <div
        className={`wc-split${拖拽中 ? ' dragging' : ''}`}
        onPointerDown={开始拖}
        onKeyDown={(e) => 键盘调宽(e, 列表宽, 设宽)}
        role="separator"
        aria-orientation="vertical"
        aria-label="拖动调整会话列表宽度"
        tabIndex={0}
        title="拖动调整宽度 · 双击复位"
      >
        <span className="wc-split-grip" />
      </div>

      {/* ── 聊天窗口 ── */}
      <section className="wc-chat">
        <header className="wc-head">
          <button className="wc-back" {...按钮反馈(回列表)} title="返回会话列表">
            <img src={素材('icon_back.png')} alt="返回" draggable={false} />
          </button>
          <span className="wc-head-name">{当前?.名字 ?? ''}</span>
          <span className="wc-head-count">
            {当前?.类型 === '群聊' ? `群聊 · ${(当前.成员?.length ?? 4) + 2} 人` : `在线 · ${段标签}`}
          </span>
          {!是活跃 ? <span className="wc-head-hint">回看历史中 · 新消息在「{活跃名}」</span> : null}
        </header>

        <div
          className="wc-body"
          ref={消息区}
          onClick={() => {
            if (是活跃) 推进一步();
          }}
        >
          <div className="wc-body-inner">
            {当前?.条目.map((项) => (
              <一条 key={项.id} 项={项} 群聊={当前.类型 === '群聊'} />
            ))}
          </div>
        </div>

        <footer className="wc-foot">
          {待接受邀请 ? (
            <button className="wc-btn" {...按钮反馈(接受邀请)}>
              {待接受邀请.按钮}
            </button>
          ) : null}

          {待选择 ? (
            <div className="wc-choices">
              <div className="wc-choices-hint">发送一条消息（选定不可撤销）</div>
              {待选择.map((o, i) => (
                <button
                  key={i}
                  className="wc-choice"
                  onMouseEnter={() => 播放('选项悬停')}
                  onFocus={() => 播放('选项悬停')}
                  onClick={() => 选择(i)}
                >
                  <span className="wc-choice-key">{'ABC'[i]}</span>
                  <span className="wc-choice-label">{o.标签}</span>
                </button>
              ))}
            </div>
          ) : null}

          {待暂停 ? (
            <button className="wc-btn" {...按钮反馈(点暂停)}>
              {待暂停}
            </button>
          ) : null}

          {!待选择 && !待接受邀请 && !待暂停 && !播完 ? (
            <div className="wc-hint">点聊天区或按空格加速 ▸</div>
          ) : null}

          {播完 ? <div className="wc-hint done">全部剧情播完了 —— 后面的事件还在写</div> : null}
        </footer>
      </section>
        </>
      )}

      {/* 个人资料卡（点功能栏里自己的头像打开） */}
      <资料卡 />

      {/* 人物卡（点聊天里的头像打开，和地图上点同事同一张） */}
      <人物卡 />
    </div>
  );
}

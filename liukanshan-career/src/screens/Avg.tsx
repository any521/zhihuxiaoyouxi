/**
 * AVG 剧情屏。
 *
 * 形式：**插图 + 卡片对话**。
 *   · 底：场景插图（像素画，nearest 放大铺满）
 *   · 上：一列卡片式对话。别人的在左、你的在右、系统与旁白居中
 *   · 底：选项卡片 / 继续按钮
 *
 * 逐条播放由 state/story 的队列驱动；这里只负责「等多久推一步」和「画成什么样」。
 * 点画面任意处 = 立刻推进（加速），不用等自动计时。
 */
import { useEffect, useLayoutEffect, useRef, type ReactElement } from 'react';
import type { 节拍, 说话人 } from '../story/types';
import { 头像, 插图表, 贴纸表, 气泡图, type 插图名 } from '../story/assets';
import { 剧情间隔, useStory, type 渲染项 } from '../state/story';

/** 说话人对应的头像框风格：客户用圆框，其他人用方框 */
const 用圆框 = new Set<说话人>(['程女士']);

function 头像块({ 谁 }: { 谁: 说话人 }): ReactElement | null {
  const 图 = 头像(谁);
  if (!图) return null;
  return (
    <div className={`avg-face${用圆框.has(谁) ? ' round' : ''}`}>
      <img src={图} alt={谁} draggable={false} />
    </div>
  );
}

function 气泡({
  谁,
  我方,
  图,
  文本,
}: {
  谁: 说话人;
  我方: boolean;
  图?: string;
  文本?: string;
}): ReactElement {
  const 风格 = 我方 ? 'me' : 'other';
  const 边 = 我方 ? 气泡图.我方 : 气泡图.对方;
  return (
    <div className={`avg-row ${我方 ? 'right' : 'left'}`} data-speaker={谁}>
      {!我方 && <头像块 谁={谁} />}
      <div className="avg-bubble-wrap">
        <div className="avg-name">{谁}</div>
        <div
          className={`avg-bubble ${风格}${图 ? ' sticker' : ''}`}
          style={{ borderImageSource: `url("${边}")` }}
        >
          {图 ? <img className="avg-sticker" src={图} alt="" draggable={false} /> : 文本}
        </div>
      </div>
      {我方 && <头像块 谁={谁} />}
    </div>
  );
}

function 条目({ 项 }: { 项: 渲染项 }): ReactElement | null {
  switch (项.种类) {
    case '消息':
      return <气泡 谁={项.谁} 我方={项.我方} 文本={项.文本} />;
    case '贴纸':
      return <气泡 谁={项.谁} 我方={项.我方} 图={贴纸表[项.贴纸]} />;
    case '系统':
      return <div className="avg-system">{项.文本}</div>;
    case '旁白':
      return <div className="avg-narration">{项.文本}</div>;
    case '输入中': {
      const 图 = 头像(项.谁);
      return (
        <div className="avg-row left">
          {图 ? (
            <div className="avg-face">
              <img src={图} alt="" draggable={false} />
            </div>
          ) : null}
          <div className="avg-bubble-wrap">
            <div className="avg-name">{项.谁}</div>
            <div className="avg-bubble other typing">
              <span className="d" />
              <span className="d" />
              <span className="d" />
            </div>
          </div>
        </div>
      );
    }
    case '邀请':
      return (
        <div className="avg-invite">
          <div className="avg-invite-icon">群</div>
          <div className="avg-invite-body">
            <div className="avg-invite-title">{项.标题}</div>
            <div className="avg-invite-sub">{项.副标题}</div>
          </div>
          {项.已接受 ? (
            <span className="avg-invite-done">已加入</span>
          ) : null}
        </div>
      );
    case '指标': {
      const 片: string[] = [];
      if (项.变动.信任) 片.push(`老板信任 ${项.变动.信任 > 0 ? '+' : ''}${项.变动.信任}`);
      if (项.变动.协作) 片.push(`团队协作 ${项.变动.协作 > 0 ? '+' : ''}${项.变动.协作}`);
      if (项.变动.成长) 片.push(`职业成长 ${项.变动.成长 > 0 ? '+' : ''}${项.变动.成长}`);
      return <div className="avg-metric">{片.join('　')}</div>;
    }
    case '知乎卡':
      return (
        <div className={`avg-zhihu${项.卡片.已接入 ? '' : ' empty'}`}>
          <div className="avg-zhihu-head">知乎卡 · {项.卡片.主题}</div>
          {项.卡片.已接入 ? (
            <div className="avg-zhihu-body">
              <div className="avg-zhihu-title">{项.卡片.标题}</div>
              <div className="avg-zhihu-meta">
                {项.卡片.作者 ? <span>{项.卡片.作者}</span> : null}
                {项.卡片.赞同 != null ? <span>赞同 {项.卡片.赞同}</span> : null}
              </div>
              {项.卡片.摘录 ? <div className="avg-zhihu-text">{项.卡片.摘录}</div> : null}
              {项.卡片.链接 ? (
                <a className="avg-zhihu-link" href={项.卡片.链接} target="_blank" rel="noreferrer">
                  查看原文 ▸
                </a>
              ) : null}
            </div>
          ) : (
            <div className="avg-zhihu-body placeholder">内容待接入 · 将用知乎开放平台检索真实原文</div>
          )}
        </div>
      );
    default:
      return null;
  }
}

export function Avg(): ReactElement {
  const 屏幕 = useStory((s) => s.屏幕);
  const 队列 = useStory((s) => s.队列);
  const 位置 = useStory((s) => s.位置);
  const 条目们 = useStory((s) => s.条目);
  const 待选择 = useStory((s) => s.待选择);
  const 待接受邀请 = useStory((s) => s.待接受邀请);
  const 待暂停 = useStory((s) => s.待暂停);
  const 播完 = useStory((s) => s.播完);
  const 指标 = useStory((s) => s.指标);
  const 推进一步 = useStory((s) => s.推进一步);
  const 接受邀请 = useStory((s) => s.接受邀请);
  const 选择 = useStory((s) => s.选择);
  const 点暂停 = useStory((s) => s.点暂停);
  const 重置 = useStory((s) => s.重置);

  const 滚动容器 = useRef<HTMLDivElement>(null);

  // 当前插图：从队列里最近一条「场景」节拍取
  const 当前插图 = (() => {
    for (let i = Math.min(位置, 队列.length - 1); i >= 0; i -= 1) {
      const b = 队列[i];
      if (b && b.类型 === '场景') return b.插图;
    }
    return '办公室';
  })();
  const 底图 = 插图表[当前插图 as 插图名] ?? 插图表.办公室;

  // 自动推进：等到这一条的间隔就走下一步；有任何待操作就停住
  useEffect(() => {
    if (屏幕 !== 'avg') return;
    if (待选择 || 待接受邀请 || 待暂停 || 播完) return;
    const 本: 节拍 | undefined = 队列[位置];
    const 等 = 本 ? 剧情间隔(本) : 900;
    const t = window.setTimeout(() => 推进一步(), 等);
    return () => window.clearTimeout(t);
  }, [屏幕, 队列, 位置, 待选择, 待接受邀请, 待暂停, 播完, 推进一步]);

  // 新条目进来就滚到底
  useLayoutEffect(() => {
    const el = 滚动容器.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [条目们.length, 待选择, 待接受邀请]);

  /** 点画面任意处加速推进（有等待操作时不响应） */
  const 点画面 = (): void => {
    if (待选择 || 待接受邀请 || 待暂停 || 播完) return;
    推进一步();
  };

  if (屏幕 !== 'avg') return <></>;

  return (
    <div className="avg" onClick={点画面}>
      <img className="avg-bg" src={底图} alt="" draggable={false} />
      <div className="avg-veil" />

      <header className="avg-head">
        <div className="avg-head-title">看山创意部</div>
        <div className="avg-head-sub">入职第 1 天</div>
        <div className="avg-metrics">
          <span>信任 {指标.信任}</span>
          <span>协作 {指标.协作}</span>
          <span>成长 {指标.成长}</span>
        </div>
        <button
          className="avg-reset"
          onClick={(e) => {
            e.stopPropagation();
            重置();
          }}
        >
          重来
        </button>
      </header>

      <div className="avg-scroll" ref={滚动容器}>
        <div className="avg-column">
          {条目们.map((项) => (
            <条目 key={项.id} 项={项} />
          ))}
        </div>
      </div>

      <footer className="avg-foot" onClick={(e) => e.stopPropagation()}>
        {待接受邀请 ? (
          <button
            className="avg-btn primary"
            onClick={() => {
              接受邀请();
            }}
          >
            {待接受邀请.按钮}
          </button>
        ) : null}

        {待选择 ? (
          <div className="avg-choices">
            <div className="avg-choices-hint">轮到你了 —— 选一句发出去（选定不可撤销）</div>
            {待选择.map((o, i) => (
              <button key={i} className="avg-choice" onClick={() => 选择(i)}>
                <span className="avg-choice-key">{'ABC'[i]}</span>
                <span className="avg-choice-label">{o.标签}</span>
              </button>
            ))}
          </div>
        ) : null}

        {待暂停 ? (
          <button className="avg-btn primary" onClick={点暂停}>
            {待暂停}
          </button>
        ) : null}

        {!待选择 && !待接受邀请 && !待暂停 && !播完 ? (
          <div className="avg-tip">点画面加速 ▸</div>
        ) : null}

        {播完 ? <div className="avg-tip done">本段结束 —— 关卡待接入</div> : null}
      </footer>
    </div>
  );
}

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
import { useEffect, useLayoutEffect, useRef, type ReactElement } from 'react';
import type { 说话人 } from '../story/types';
import { 头像, 贴纸表, 气泡图 } from '../story/assets';
import { 剧情间隔, useStory, type 会话, type 渲染项 } from '../state/story';

const 素材 = (名: string): string => new URL(`assets/avg/${名}`, document.baseURI).href;

/** 群聊头像用哪几个人的脸拼 */
const 群成员: 说话人[] = ['小鹿', '周岚', '阿麦', '韩策'];

/** 方形头像（带像素边框） */
function 头({ 谁, 尺寸 = 40 }: { 谁: 说话人; 尺寸?: number }): ReactElement | null {
  const 图 = 头像(谁);
  if (!图) return null;
  return (
    <span className="wc-face" style={{ width: 尺寸, height: 尺寸 }}>
      <img src={图} alt={谁} draggable={false} />
    </span>
  );
}

/** 群聊头像：2×2 拼四个人的脸 */
function 群头({ 尺寸 = 40 }: { 尺寸?: number }): ReactElement {
  return (
    <span className="wc-face group" style={{ width: 尺寸, height: 尺寸 }}>
      {群成员.map((谁) => {
        const 图 = 头像(谁);
        return 图 ? <img key={谁} src={图} alt="" draggable={false} /> : null;
      })}
    </span>
  );
}

/** 会话列表里的一行 */
function 会话行({ 会话, 选中, 点 }: { 会话: 会话; 选中: boolean; 点: () => void }): ReactElement {
  const 最后 = [...会话.条目].reverse().find((x) => x.种类 !== '输入中');
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
    <button className={`wc-row${选中 ? ' on' : ''}`} onClick={点}>
      {会话.类型 === '群聊' ? <群头 /> : 会话.对方 ? <头 谁={会话.对方} /> : null}
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
                {项.卡片.赞同 != null ? <span>赞同 {项.卡片.赞同}</span> : null}
              </div>
              {项.卡片.摘录 ? <div className="wc-zhihu-text">{项.卡片.摘录}</div> : null}
              {项.卡片.链接 ? (
                <a className="wc-zhihu-link" href={项.卡片.链接} target="_blank" rel="noreferrer">
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
  const 推进一步 = useStory((s) => s.推进一步);
  const 接受邀请 = useStory((s) => s.接受邀请);
  const 选择 = useStory((s) => s.选择);
  const 点暂停 = useStory((s) => s.点暂停);
  const 查看 = useStory((s) => s.查看);
  const 回列表 = useStory((s) => s.回列表);
  const 重置 = useStory((s) => s.重置);

  const 消息区 = useRef<HTMLDivElement>(null);
  const 当前 = 会话们.find((c) => c.id === 查看会话) ?? 会话们[0];
  const 是活跃 = 查看会话 === 活跃会话;
  const 活跃名 = 会话们.find((c) => c.id === 活跃会话)?.名字 ?? '';

  // 自动推进
  useEffect(() => {
    if (屏幕 !== 'avg') return;
    if (待选择 || 待接受邀请 || 待暂停 || 播完) return;
    const 本 = 队列[位置];
    const t = window.setTimeout(() => 推进一步(), 本 ? 剧情间隔(本) : 900);
    return () => window.clearTimeout(t);
  }, [屏幕, 队列, 位置, 待选择, 待接受邀请, 待暂停, 播完, 推进一步]);

  // 新消息滚到底
  useLayoutEffect(() => {
    const el = 消息区.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [当前?.条目.length, 查看会话, 待选择]);

  if (屏幕 !== 'avg') return <></>;

  return (
    <div className={`wechat${面板 === '列表' ? ' show-list' : ' show-chat'}`}>
      {/* ── 功能栏 ── */}
      <aside className="wc-rail">
        <span className="wc-me">{头({ 谁: '刘看山', 尺寸: 36 })}</span>
        <nav className="wc-rail-icons">
          {['icon_chat', 'icon_contacts', 'icon_settings'].map((n, i) => (
            <span key={n} className={`wc-icon${i === 0 ? ' on' : ''}`}>
              <img src={素材(`${n}.png`)} alt="" draggable={false} />
            </span>
          ))}
        </nav>
        <span className="wc-icon bottom">
          <img src={素材('icon_more.png')} alt="" draggable={false} />
        </span>
      </aside>

      {/* ── 会话列表 ── */}
      <section className="wc-list">
        <header className="wc-list-head">
          <span className="wc-list-title">微信</span>
          <span className="wc-list-icons">
            <img src={素材('icon_search.png')} alt="" draggable={false} />
            <img src={素材('icon_more.png')} alt="" draggable={false} />
          </span>
        </header>

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

        <button className="wc-reset" onClick={重置}>
          重来
        </button>
      </section>

      {/* ── 聊天窗口 ── */}
      <section className="wc-chat">
        <header className="wc-head">
          <button className="wc-back" onClick={回列表} title="返回会话列表">
            <img src={素材('icon_back.png')} alt="返回" draggable={false} />
          </button>
          <span className="wc-head-name">{当前?.名字 ?? ''}</span>
          <span className="wc-head-count">{当前?.类型 === '群聊' ? '群聊 · 6 人' : '在线'}</span>
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
            <button className="wc-btn" onClick={接受邀请}>
              {待接受邀请.按钮}
            </button>
          ) : null}

          {待选择 ? (
            <div className="wc-choices">
              <div className="wc-choices-hint">发送一条消息（选定不可撤销）</div>
              {待选择.map((o, i) => (
                <button key={i} className="wc-choice" onClick={() => 选择(i)}>
                  <span className="wc-choice-key">{'ABC'[i]}</span>
                  <span className="wc-choice-label">{o.标签}</span>
                </button>
              ))}
            </div>
          ) : null}

          {待暂停 ? (
            <button className="wc-btn" onClick={点暂停}>
              {待暂停}
            </button>
          ) : null}

          {!待选择 && !待接受邀请 && !待暂停 && !播完 ? (
            <div className="wc-hint">点聊天区加速 ▸</div>
          ) : null}

          {播完 ? <div className="wc-hint done">本段结束 —— 关卡待接入</div> : null}
        </footer>
      </section>
    </div>
  );
}

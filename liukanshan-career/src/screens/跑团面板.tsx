/**
 * 跑团面板 —— 会议室里"一轮一轮把需求钉死"的那块屏。
 *
 * 用户要求：「跑团剧情增加知乎 AI **不偏离剧情的丰富有趣对话**」。
 * 引擎（跑团.ts）和剧本（跑团脚本.ts）已经在别的文件里把"笼子"做好了，
 * 这个组件只负责**把那一局演给玩家看**：
 *
 *   掷骰 → 两颗骰子 + 档位 → 作者的兜底镜头（**立刻上屏**）
 *                            → AI 的话回来了就把这一格的文字换掉
 *                            → 台词用聊天气泡画（复用 AVG 的头像）
 *
 * ⚠️ 这里**一个数都不算**：骰子、档位、指标、线索、局况全部来自 `局状态`，
 *    本组件只读不算 —— 这样"UI 改坏了"绝不可能把分数改坏。
 * ⚠️ AI 那条只影响**文字**：`来源 === 'AI'` 时右上角挂一个小标记，
 *    让玩家知道这句是模型润的（而不是作者写的）。
 */
import type { ReactElement } from 'react';
import { 头像, 插图表 } from '../story/assets';
import { useStory } from '../state/story';
import type { 说话人 } from '../story/types';
import { 取回合, type 局况, type 判定档, type 跑团结果 } from '../story/跑团';

/** 档位配色：和三项指标的飘字保持一致（金/绿/灰/红） */
const 档色: Record<判定档, string> = {
  大成功: '#ffb020',
  成功: '#4a8f4f',
  失败: '#a4acbb',
  大失败: '#e04f3f',
};

/** 收束一句话 */
const 收束语: Record<Exclude<局况, '进行中'>, string> = {
  通关: '需求问清楚了，程女士把文件夹合上了。',
  翻车: '会开得不太顺，但笔记本上还是留了几行字。',
  超时: '时间到了。你至少把最要紧的那几条问了出来。',
};

/** 一颗骰子 */
function 骰({ 点, 亮 }: { 点: number; 亮: boolean }): ReactElement {
  return <span className={`pt-die${亮 ? ' on' : ''}`}>{点}</span>;
}

/** 一轮的结果卡（最新那一轮会多一个 pt-new 让它有个进入动画） */
function 结果卡({ 果, 新 }: { 果: 跑团结果; 新: boolean }): ReactElement {
  const 图 = 果.谁说 ? 头像(果.谁说 as 说话人) : null;
  return (
    <article className={`pt-r${新 ? ' new' : ''}`} style={{ borderLeftColor: 档色[果.档] }}>
      <header className="pt-r-head">
        <span className="pt-档" style={{ background: 档色[果.档] }}>
          {果.档}
        </span>
        <span className="pt-scene">{果.场景}</span>
        <span className="pt-dice" title={`2d6 ${果.骰子.join('+')}${果.修正 ? ' + 修正 ' + 果.修正 : ''} = ${果.合计}，难度 ${果.难度}`}>
          <骰 点={果.骰子[0]} 亮={果.档 === '大成功' || 果.档 === '大失败'} />
          <i className="pt-op">+</i>
          <骰 点={果.骰子[1]} 亮={果.档 === '大成功' || 果.档 === '大失败'} />
          {果.修正 > 0 ? <i className="pt-mod">+{果.修正}</i> : null}
          <i className="pt-op">=</i>
          <b>{果.合计}</b>
          <i className="pt-vs">难度 {果.难度}</i>
        </span>
        {果.来源 === 'AI' ? <span className="pt-ai">AI 润色</span> : null}
      </header>

      <p className="pt-act">{果.行动}</p>
      <p className="pt-txt">{果.叙述}</p>

      {果.对白 ? (
        <div className="pt-line">
          {图 ? <img className="pt-face" src={图} alt="" draggable={false} /> : null}
          <div className="pt-bubble">
            <b>{果.谁说}</b>
            <span>{果.对白}</span>
          </div>
        </div>
      ) : null}

      {果.指标.信任 || 果.指标.协作 || 果.指标.成长 || 果.线索 ? (
        <footer className="pt-r-foot">
          {果.指标.信任 ? <span className="pt-m">信任 {果.指标.信任 > 0 ? '+' : ''}{果.指标.信任}</span> : null}
          {果.指标.协作 ? <span className="pt-m">协作 {果.指标.协作 > 0 ? '+' : ''}{果.指标.协作}</span> : null}
          {果.指标.成长 ? <span className="pt-m">成长 {果.指标.成长 > 0 ? '+' : ''}{果.指标.成长}</span> : null}
          {果.线索 ? <span className="pt-clue">线索 · {果.线索}</span> : null}
        </footer>
      ) : null}
    </article>
  );
}

export function 跑团面板(): ReactElement | null {
  const 跑团局 = useStory((s) => s.跑团局);
  const 掷骰 = useStory((s) => s.跑团掷骰);
  const 收工 = useStory((s) => s.跑团收工);

  if (!跑团局) return null;
  const { 配置, 局, 等AI } = 跑团局;
  // 窄屏用竖版会议室插图（那张是 288×512，正好喂给竖着的舞台）
  const 窄屏 = typeof window !== 'undefined' && window.matchMedia('(max-width: 820px)').matches;
  const 场景图 = 窄屏 ? 插图表.会议室竖 : 插图表.会议室;
  const 轮 = Math.min(局.轮, 配置.回合.length - 1);
  const 本轮 = 取回合(配置, 轮);
  const 进行中 = 局.局况 === '进行中';
  const 最新 = 局.日志[局.日志.length - 1];
  const 旧 = 局.日志.slice(0, -1);

  return (
    <div className="pt-mask" role="dialog" aria-label={配置.标题 ?? '跑团'}>
      <section className="pt-panel">
        <header className="pt-head">
          <div className="pt-title">
            <span className="pt-tag">跑团</span>
            <b>{配置.标题 ?? 配置.id}</b>
          </div>
          <div className="pt-goal">{配置.目标}</div>
          <div className="pt-prog">
            <span>
              第 <b>{Math.min(局.轮 + (进行中 ? 1 : 0), 配置.上限)}</b>/{配置.上限} 轮
            </span>
            <span className="ok">命中 {局.命中}</span>
            <span className={局.失误 ? 'bad' : ''}>失误 {局.失误}</span>
            <span>线索 {局.线索.length}</span>
          </div>
        </header>

        <div className="pt-body">
          {/* 场景 + 这一轮要干的事 */}
          <div className="pt-stage" style={{ backgroundImage: `url("${场景图}")` }}>
            <div className="pt-stage-in">
              <b>{本轮.场景}</b>
              {进行中 ? (
                <>
                  <span className="pt-todo">这一轮你要做的事</span>
                  <p>{本轮.行动}</p>
                  <span className="pt-diff">
                    难度 <b>{本轮.难度}</b> · 在场：{本轮.在场.join('、')}
                  </span>
                </>
              ) : (
                <p className="pt-over">{收束语[局.局况 as Exclude<局况, '进行中'>]}</p>
              )}
            </div>
          </div>

          {/* 本轮结果 + 回看 */}
          <div className="pt-stream">
            {旧.length ? (
              <ol className="pt-log">
                {旧.map((g, i) => (
                  <li key={i}>
                    <span className="pt-log-档" style={{ background: 档色[g.档] }}>
                      {g.档}
                    </span>
                    <b>{g.场景}</b>
                    <span>{g.叙述}</span>
                    {g.对白 ? <i>{g.谁说}：{g.对白}</i> : null}
                  </li>
                ))}
              </ol>
            ) : (
              <div className="pt-empty">掷第一颗骰子，这一场戏就开始了。</div>
            )}
            {最新 ? <结果卡 果={最新} 新 /> : null}
          </div>
        </div>

        <footer className="pt-foot">
          {进行中 ? (
            <button className="pt-btn" onClick={掷骰} disabled={等AI}>
              {等AI ? 'AI 正在润色这一轮…' : 局.轮 === 0 ? '掷骰子 · 开始' : '掷骰子 · 下一轮'}
            </button>
          ) : (
            <button className="pt-btn done" onClick={收工}>
              收起笔记本 ▸
            </button>
          )}
          <span className="pt-hint">
            {进行中
              ? '骰子决定成败，作者写死后果；AI 只把这一轮说得好看，改不了任何分数。'
              : '这一段的成败只影响指标与线索，不会改变剧情走向。'}
          </span>
        </footer>
      </section>
    </div>
  );
}

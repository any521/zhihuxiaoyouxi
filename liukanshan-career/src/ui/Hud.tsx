import type { ReactElement } from 'react';
import { useGameStore } from '../state/store';
import { RATING_RULE, STARTER_CARD } from '../state/cards';
import { 工序表, type 订单, type 工序 } from '../state/orders';
import type { PixelLayout } from './usePixelFit';

const CARRY_LABEL: Record<'blank' | 'resume', string> = {
  blank: '空白简历',
  resume: '做过工序的简历',
};

const 图标 = (名: string): string => new URL(`assets/ui/icon_${名}.png`, document.baseURI).href;

const CHAPTER = '第一章 · 投出去的第 47 份简历';

function useCommon() {
  const delivered = useGameStore((s) => s.delivered);
  const failed = useGameStore((s) => s.failed);
  const quota = useGameStore((s) => s.quota);
  const timeLeft = useGameStore((s) => s.timeLeft);
  const timeLimit = useGameStore((s) => s.timeLimit);
  const carrying = useGameStore((s) => s.carrying);
  const carryTags = useGameStore((s) => s.carryTags);
  const processing = useGameStore((s) => s.processing);
  const phase = useGameStore((s) => s.phase);
  const prompt = useGameStore((s) => s.prompt);
  const cards = useGameStore((s) => s.cards);
  const orders = useGameStore((s) => s.orders);
  const ground = useGameStore((s) => s.ground);
  return {
    delivered,
    failed,
    quota,
    timeLeft,
    timeLimit,
    carrying,
    carryTags,
    processing,
    phase,
    prompt,
    cards,
    orders,
    ground,
    seconds: Math.ceil(timeLeft),
    timeRatio: timeLimit > 0 ? Math.max(0, Math.min(1, timeLeft / timeLimit)) : 0,
  };
}

/** 工序小徽章：做完的填色，没做的描边 */
function 工序标({ 名, 已完成 }: { 名: 工序; 已完成: boolean }): ReactElement {
  const info = 工序表[名];
  return (
    <span
      className={`gtag${已完成 ? ' done' : ''}`}
      style={{
        borderColor: info.色,
        background: 已完成 ? info.色 : 'transparent',
        color: 已完成 ? '#0d0f14' : info.色,
      }}
    >
      {名}
    </span>
  );
}

/** 一张订单卡：公司 + 需要的工序（手上已有的会高亮） */
function 订单卡({ 单, 手上 }: { 单: 订单; 手上: 工序[] }): ReactElement {
  return (
    <div className="order">
      <div className="order-top">
        <b>{单.公司}</b>
        <span className="order-ind">{单.行业}</span>
        <span className="order-pts">+{单.分}</span>
      </div>
      <div className="order-steps">
        {单.需要.map((g) => (
          <工序标 key={g} 名={g} 已完成={手上.includes(g)} />
        ))}
      </div>
    </div>
  );
}

/** 顶部：章节 + 订单条（替代原来的金色指令条） */
export function TopBar(): ReactElement {
  const { orders, carryTags, delivered, quota, seconds, carrying, failed } = useCommon();
  return (
    <div className="topbar">
      <div className="chapter">
        <span className="chapter-tag">今日任务</span>
        <b>{CHAPTER}</b>
        <span className="chapter-sub">
          交付 <b>{delivered}</b>/{quota}
          {failed > 0 && <span className="fail"> · 投错 {failed}</span>}
        </span>
      </div>

      <div className="orders">
        {orders.length === 0 && <span className="order-empty">点「开始测试」后这里会挂出订单</span>}
        {orders.map((o) => (
          <订单卡 key={o.id} 单={o} 手上={carryTags} />
        ))}
      </div>

      <div className="topright">
        <span className="pill">
          <img src={图标('clock')} alt="" />
          <b className={seconds <= 20 ? 'hot' : undefined}>{String(seconds).padStart(3, '0')}s</b>
        </span>
        <span className={`pill${carrying ? ' on' : ''}`}>
          {carrying ? CARRY_LABEL[carrying] : '手上空'}
        </span>
      </div>
    </div>
  );
}

/** 左边栏：剧情/指令 + 技能卡 + 操作说明 */
export function StoryRail({ width }: { width: number }): ReactElement {
  const { cards, prompt } = useCommon();
  return (
    <aside className="rail left" style={{ width }}>
      <div className="panel story">
        <h4>现在该做什么</h4>
        <div className="story-line">{prompt || '等待开始'}</div>
      </div>

      <div className="panel slot">
        <h4>
          <img src={图标('stamp')} alt="" />
          技能卡 · {cards.length}
        </h4>
        <div className="card">
          <div className="card-top">
            <span className="card-name">{STARTER_CARD.name}</span>
            {cards.length > 1 && <span className="tag rarity">+{cards.length - 1}</span>}
          </div>
          <div className="card-top start">
            <span className="tag type">{STARTER_CARD.type}</span>
            <span className="tag rarity">{STARTER_CARD.rarity}</span>
          </div>
          <div className="card-desc">{STARTER_CARD.effect}</div>
        </div>
        <div className="card-locked">对话到关键抉择时可插入</div>
      </div>

      <div className="panel help">
        <h4>操作</h4>
        <div>
          <kbd>W</kbd>
          <kbd>A</kbd>
          <kbd>S</kbd>
          <kbd>D</kbd> 移动
        </div>
        <div className="help-row">
          <kbd>空格</kbd> 取料 / 上机 / 交付 / 丢下
        </div>
        <div className="help-row">
          <kbd>Q</kbd> 随时把手上的东西扔地上
        </div>
        <div className="help-row">
          <kbd>Esc</kbd> 设置 / 暂停
        </div>
      </div>
    </aside>
  );
}

/** 右边栏：倒计时 + 手上简历的工序进度 + 地面物品 */
export function StatusRail({ width }: { width: number }): ReactElement {
  const { seconds, timeRatio, carrying, carryTags, ground, quota, delivered } = useCommon();
  return (
    <aside className="rail right" style={{ width }}>
      <div className="panel">
        <div className={`timer${seconds <= 20 ? ' low' : ''}`}>{String(seconds).padStart(3, '0')}s</div>
        <div className="bar">
          <i style={{ width: `${timeRatio * 100}%` }} />
        </div>
        <div className="pip-grid" style={{ marginTop: 8 }}>
          {Array.from({ length: quota }).map((_, i) => (
            <span key={i} className={`pip${i < delivered ? ' on' : ''}`} />
          ))}
        </div>
      </div>

      <div className="panel">
        <h4>手上的简历</h4>
        {carrying ? (
          <>
            <div className="carry-name">{CARRY_LABEL[carrying]}</div>
            <div className="order-steps">
              {(['排版', '打印', '盖章'] as 工序[]).map((g) => (
                <工序标 key={g} 名={g} 已完成={carryTags.includes(g)} />
              ))}
            </div>
            <div className="carry-hint">没亮的工序还没做</div>
          </>
        ) : (
          <div className="carry-empty">手上空</div>
        )}
      </div>

      <div className="panel">
        <h4>地上的东西 · {ground.length}</h4>
        {ground.length === 0 ? (
          <div className="carry-empty">地上干净</div>
        ) : (
          <ul className="ground-list">
            {ground.map((g) => (
              <li key={g.id}>{g.工序.length ? g.工序.join('+') : '空白'}</li>
            ))}
          </ul>
        )}
      </div>

      <div className="panel">
        <h4>计分</h4>
        <div className="rule">{RATING_RULE}</div>
      </div>
    </aside>
  );
}

/** 窄屏：顶部窄栏 + 订单条 */
export function CompactBars(): ReactElement {
  const { orders, carryTags, delivered, quota, seconds, carrying, failed } = useCommon();
  return (
    <>
      <div className="panel hud-bar compact-top">
        <b className={seconds <= 20 ? 'hot' : undefined}>{String(seconds).padStart(3, '0')}s</b>
        <span>
          交付 {delivered}/{quota}
        </span>
        {failed > 0 && <span className="hot">错{failed}</span>}
        <span className={carrying ? 'hot' : undefined}>{carrying ? CARRY_LABEL[carrying] : '手上空'}</span>
      </div>
      <div className="compact-orders">
        {orders.map((o) => (
          <订单卡 key={o.id} 单={o} 手上={carryTags} />
        ))}
      </div>
    </>
  );
}

export function CompactFoot(): ReactElement {
  const { prompt } = useCommon();
  return (
    <div className="compact-foot">
      <div className="panel story">
        <h4>现在该做什么</h4>
        <div className="story-line">{prompt || '等待开始'}</div>
      </div>
    </div>
  );
}

export function Toasts({ layout }: { layout: PixelLayout }): ReactElement | null {
  const toasts = useGameStore((s) => s.toasts);
  const phase = useGameStore((s) => s.phase);
  if (phase === 'ready') return null;
  const 最多 = layout.hudOutside ? 3 : 1;
  return (
    <div className="toasts" style={{ maxWidth: Math.max(320, layout.width * 0.8) }}>
      {toasts.slice(-最多).map((toast) => (
        <div key={toast.id} className="toast">
          <b>{toast.speaker}</b>
          <div>{toast.text}</div>
        </div>
      ))}
    </div>
  );
}

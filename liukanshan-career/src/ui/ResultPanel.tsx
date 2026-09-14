import type { ReactElement } from 'react';
import { useGameStore } from '../state/store';
import { bus, CMD } from '../state/bus';
import { useStory } from '../state/story';

/**
 * 结算面板。
 *
 * ⚠️ 2026-09 改版：从"招聘会结束了"改成"这一版交出去了"（工作关）。
 *    另外**从剧情里进来时多一个「回到剧情 ▸」**：
 *    点它 → `关卡结束()` → 把成绩写成一条系统消息 → 切回微信接着播剧本。
 */
const RATING_COPY: Record<string, string> = {
  S: '一版过。周岚连红笔都没拿出来。',
  A: '交上去了，只差一点点。',
  B: '交了，但明显是被时间推着走的。',
  C: '这一天基本在跑来跑去，至少跑完了。',
};

export function ResultPanel(): ReactElement | null {
  const phase = useGameStore((state) => state.phase);
  const rating = useGameStore((state) => state.rating);
  const delivered = useGameStore((state) => state.delivered);
  const quota = useGameStore((state) => state.quota);
  const timeLeft = useGameStore((state) => state.timeLeft);
  const drop = useGameStore((state) => state.drop);
  const 在剧情里 = useStory((s) => s.屏幕 === 'level');
  const 关卡结束 = useStory((s) => s.关卡结束);

  if (phase !== 'finished' || !rating) return null;

  return (
    <div className="overlay">
      <div className="modal">
        <div className="row">
          <div className={`rating ${rating}`}>{rating}</div>
          <div>
            <h2>这一版交出去了</h2>
            <p>{RATING_COPY[rating]}</p>
          </div>
        </div>

        <div className="metrics">
          <div>
            交稿 <b>{delivered}</b>/{quota}
          </div>
          <div>
            剩余 <b>{Math.ceil(timeLeft)}</b>s
          </div>
          <div>
            评级线 <b>S≥8 · A=7 · B=6</b>
          </div>
        </div>

        {drop ? (
          <div className="card" style={{ marginBottom: 16 }}>
            <div className="card-top">
              <span className="card-name">获得技能卡 · {drop.card.name}</span>
              {drop.upgraded && <span className="tag rarity">升为精通</span>}
            </div>
            <div className="card-top" style={{ marginTop: 4, justifyContent: 'flex-start' }}>
              <span className="tag type">{drop.card.type}</span>
              <span className="tag rarity">{drop.card.rarity}</span>
            </div>
            <div className="card-desc">{drop.card.effect}</div>
            <div className="card-locked">「{drop.card.flavor}」</div>
          </div>
        ) : (
          <div className="card" style={{ marginBottom: 16, borderColor: '#3a4557' }}>
            <div className="card-name" style={{ color: '#8fa2bb' }}>
              没有掉落技能卡
            </div>
            <div className="card-locked">C 级不掉卡。重打一次，第一次评级才算数。</div>
          </div>
        )}

        <div className="row" style={{ justifyContent: 'flex-end' }}>
          <button
          className="ghost"
          onPointerDown={(e) => {
            e.preventDefault();
            bus.emit(CMD.restart);
          }}
        >
            重打这一关
          </button>
          {/*
            ⚠️⚠️ 用户报的「完成了游戏但是主线剧情不动了」就是下面这颗按钮：
            它原来绑 `onClick`，而**刚推着摇杆玩完、手指还在屏幕上**时，
            浏览器**不会合成 click** ✗ —— 点了没反应，剧情就一直停在关卡里 ✔
            统一改成 onPointerDown + preventDefault ✔
            ⚠️⚠️ 这条注释本身也踩过坑：**JSX 注释里不能出现花括号** ✗ ——
               我在注释里写了一个左花括号，解析器照样去配对，直接 PARSE_ERROR、整站白屏 ✔
               （所以：注释里描述 JSX 时，别把花括号原样写进去 ✗）
          */}
          {在剧情里 ? (
          <button
            onPointerDown={(e) => {
              e.preventDefault();
              关卡结束();
            }}
            title="把成绩记进剧情，接着往下播"
          >
              回到剧情 ▸
            </button>
          ) : (
            <button disabled title="从剧本的「开小游戏」节拍进来才有这一步">
              回到剧情（未接入）
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

import type { ReactElement } from 'react';
import { useGameStore } from '../state/store';
import { bus, CMD } from '../state/bus';

const RATING_COPY: Record<string, string> = {
  S: '抢在所有人前面把简历交到了对的地方。',
  A: '节奏稳，只有几份简历没能赶上。',
  B: '交了，但明显是被时间推着走的。',
  C: '这一天基本在跑来跑去，没跑出结果。',
};

export function ResultPanel(): ReactElement | null {
  const phase = useGameStore((state) => state.phase);
  const rating = useGameStore((state) => state.rating);
  const delivered = useGameStore((state) => state.delivered);
  const quota = useGameStore((state) => state.quota);
  const timeLeft = useGameStore((state) => state.timeLeft);
  const drop = useGameStore((state) => state.drop);

  if (phase !== 'finished' || !rating) return null;

  return (
    <div className="overlay">
      <div className="modal">
        <div className="row">
          <div className={`rating ${rating}`}>{rating}</div>
          <div>
            <h2>招聘会结束了</h2>
            <p>{RATING_COPY[rating]}</p>
          </div>
        </div>

        <div className="metrics">
          <div>
            投出 <b>{delivered}</b>/{quota}
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
          <button className="ghost" onClick={() => bus.emit(CMD.restart)}>
            重打这一关
          </button>
          <button disabled title="下一步接对话式抉择">
            进入对话（未接入）
          </button>
        </div>
      </div>
    </div>
  );
}

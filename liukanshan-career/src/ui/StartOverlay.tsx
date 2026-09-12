import type { ReactElement } from 'react';
import { bus, CMD } from '../state/bus';
import { useGameStore } from '../state/store';
import { STARTER_CARD } from '../state/cards';
import { RATING_RULE } from '../state/cards';

export function StartOverlay(): ReactElement | null {
  const phase = useGameStore((state) => state.phase);
  if (phase !== 'ready') return null;

  return (
    <div className="overlay">
      <div className="modal">
        <h2>第一章 · 投出去的第 47 份简历</h2>
        <p>
          第一章关卡 Demo：招聘会场景与角色已换成 AI 生成的像素素材（32 色统一色板），
          用「背景整图 + 独立精灵」的混合法搭起来。
        </p>
        <ul>
          <li>
            <b>资料架</b> 取招聘简章 → <b>工位</b> 加工成匹配好的简历 → <b>投递箱</b> 投出去
          </li>
          <li>一次只能拿一样东西；离开工位，加工程度会作废</li>
          <li>队友「学长」会帮你跑腿，但他中途会去接电话——别指望他</li>
          <li>投递箱会周期性暂停接收（变红），逼你换路线、先处理手上的活</li>
          <li>{RATING_RULE}</li>
        </ul>
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card-top">
            <span className="card-name">开局技能卡 · {STARTER_CARD.name}</span>
            <span className="tag type">{STARTER_CARD.type}</span>
          </div>
          <div className="card-desc">{STARTER_CARD.effect}</div>
          <div className="card-locked">这张卡留给对话里的关键抉择，本关不用</div>
        </div>
        <div className="row" style={{ justifyContent: 'flex-end' }}>
          <button onClick={() => bus.emit(CMD.start)}>开始测试</button>
        </div>
      </div>
    </div>
  );
}

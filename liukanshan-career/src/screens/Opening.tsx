/**
 * 开场动画。
 *
 * 一格一格播：插图淡入 → 大字落下 → 停留 → 下一格。
 * 任意点击 = 跳到下一格；右下角「跳过」= 直接进剧情。
 *
 * 插图是 512×288 的像素画，用 `image-rendering: pixelated` 放大铺满，
 * 文字单独用 DOM 画在最上层（像素画上不能直接写字，会糊）。
 */
import { useEffect, useRef, type ReactElement } from 'react';
import { 插图表, type 插图名 } from '../story/assets';
import { 开场镜表, useStory } from '../state/story';

export function Opening(): ReactElement {
  const 开场格 = useStory((s) => s.开场格);
  const 跳过开场 = useStory((s) => s.跳过开场);
  const 计时器 = useRef<number | null>(null);

  const 镜 = 开场镜表[开场格];
  const 是最后一格 = 开场格 >= 开场镜表.length - 1;

  // 每格按自己的时长自动推进；到最后一格就进剧情
  useEffect(() => {
    if (!镜) return;
    if (计时器.current !== null) window.clearTimeout(计时器.current);
    计时器.current = window.setTimeout(() => {
      if (是最后一格) {
        跳过开场();
      } else {
        useStory.setState((s) => ({ 开场格: s.开场格 + 1 }));
      }
    }, 镜.停留);
    return () => {
      if (计时器.current !== null) window.clearTimeout(计时器.current);
    };
  }, [镜, 是最后一格, 跳过开场]);

  /** 点一下：不是最后一格就跳下一格，是最后一格就进剧情 */
  const 点一下 = (): void => {
    if (是最后一格) 跳过开场();
    else useStory.setState((s) => ({ 开场格: s.开场格 + 1 }));
  };

  if (!镜) return <div className="opening" />;

  const 图 = 插图表[镜.插图 as 插图名] ?? 插图表.章节封面;

  return (
    <div className={`opening ${镜.动效 === '黑场' ? 'is-black' : ''}`} onClick={点一下}>
      {/* key 让每次换格都重挂一次，动画才会重放 */}
      <div key={开场格} className={`opening-shot ${镜.动效 ?? ''}`}>
        <img className="opening-bg" src={图} alt="" draggable={false} />
        <div className="opening-veil" />
        <div className="opening-text">
          {镜.大字 ? <div className="opening-big">{镜.大字}</div> : null}
          {镜.小字 ? <div className="opening-small">{镜.小字}</div> : null}
        </div>
      </div>

      <div className="opening-dots">
        {开场镜表.map((_, i) => (
          <span key={i} className={`dot${i === 开场格 ? ' on' : ''}`} />
        ))}
      </div>

      <button
        className="opening-skip"
        onClick={(e) => {
          e.stopPropagation();
          跳过开场();
        }}
      >
        跳过 ▸
      </button>
    </div>
  );
}

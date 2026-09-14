import type { ReactElement } from 'react';
import { useGameStore } from '../state/store';

/**
 * 关卡里的飘字（"做完「写稿」""交错了：还差……"）。
 *
 * ⚠️ 原先是 `ui/Hud.tsx` 里的一个导出，随着 HUD 换成主题样式一起搬过来，
 *    并改成**米白 + 绿 + 棕**（和 AVG/地图同一套配色），不再是深色终端风。
 * ⚠️ 用户要求「提示**不要盖住字体和素材**」——
 *    所以这里**不再浮在画布上**，而是排在顶部任务条的第三行里（和"现在该做什么"同一行）。
 *    画布区域一个浮层都没有，工位、机器、名牌全都露得出来。
 * ⚠️ 只显示最近 2 条：这一行是任务条里的一行，多了会把条撑高。
 */
export function Toasts(): ReactElement | null {
  const toasts = useGameStore((s) => s.toasts);
  const phase = useGameStore((s) => s.phase);
  if (phase === 'ready') return null;
  return (
    <span className="lv-toasts">
      {toasts.slice(-2).map((t) => (
        <span key={t.id} className="lv-toast">
          <b>{t.speaker}</b>
          {t.text}
        </span>
      ))}
    </span>
  );
}

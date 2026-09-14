import type { ReactElement } from 'react';
import { bus, CMD } from '../state/bus';
import { useGameStore } from '../state/store';
import { STARTER_CARD, RATING_RULE } from '../state/cards';
import { useStory } from '../state/story';

/**
 * 关卡的**开场简报卡**。
 *
 * ⚠️ 2026-09 改动：原来它写死的是"第一章 · 投出去的第 47 份简历 / 招聘会"，
 *    但小游戏已经改成**工作关**（把这一版稿子做出来），而且它是从剧本的
 *    「开小游戏」节拍进来的 —— 所以标题和提示**由剧本给**（`关卡标题` / `关卡提示`），
 *    这里只兜底。
 */
/**
 * 开场简报卡。
 *
 * ⚠️ 用户要求：「在这个游戏的**合适位置增加个设置按钮**，可以**看到刚开始的游戏规则**」——
 *    所以它现在有**两种模式**：
 *      · `开场`：进关卡时弹（按钮是"开始干活"，点了真的开打）
 *      · `回看`：打到一半想再看一眼规则（按钮是"知道了"，**只关弹层、不影响这一局**）
 *    两者内容一模一样 —— 规则只有一份，不会写着写着两边不一致 ✔
 */
export function StartOverlay({ 模式 = '开场' }: { 模式?: '开场' | '回看' } = {}): ReactElement | null {
  const phase = useGameStore((state) => state.phase);
  const 看规则 = useGameStore((state) => state.看规则);
  const 关规则 = useGameStore((state) => state.关规则);
  /*
   * ⚠️⚠️ **这里绝对不能提前 return**！
   *    我第一版把 `if (模式 === '回看' ? !看规则 : false) return null;` 插在了
   *    下面的 useStory **前面** ✗ —— `看规则=false` 时那三个钩子被跳过，
   *    一打开规则弹层就报 **"Rendered more hooks than during the previous render"** 并崩掉 ✔
   *    所有钩子必须在**任何 return 之前**（这也是为什么下面还有一个同样的判断 ✔）。
   */
  const 标题 = useStory((s) => s.关卡标题);
  const 提示 = useStory((s) => s.关卡提示);
  const 在剧情里 = useStory((s) => s.屏幕 === 'level');
  // ⚠️ 回看模式不受"阶段"限制（打到一半也要能看）；开场模式只在待开始时弹
  if (模式 === '开场' && phase !== 'ready') return null;
  if (模式 === '回看' && !看规则) return null;

  return (
    <div className="overlay">
      <div className="modal">
        <h2>{标题 || '手上的活 · 把这一版稿子做出来'}</h2>
        <p>
          {提示 || '领任务单 → 查资料 / 写稿 / 校对 → 交稿'}
          {在剧情里 ? '　（这一关的成败只影响指标，不影响剧情走向）' : ''}
        </p>
        <ul>
          <li>
            <b>文件柜</b> 领一张任务单 → 按单子上的要求过 <b>资料库 / 我的工位 / 文印区</b> → <b>交稿箱</b> 交出去
          </li>
          <li>
            每做完一道工序，稿子上会**盖一枚图标**（放大镜 / 稿纸 / 对勾）——
            顶部「手上这一版」用的是同一套图标，一眼就知道还差哪一步
          </li>
          <li>一次只能拿一样东西；离开工位，做到一半的活会作废</li>
          <li>
            来帮你的是**相关的那位同事**（谁的单子谁来搭把手），但他干活很慢——
            <b>大头还得你自己来</b>
          </li>
          <li>交稿箱会周期性暂停接收（变红），逼你换路线、先处理手上的活</li>
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
          {/*
            ⚠️⚠️ 用 **onPointerDown**，不用 onClick。
            用户报的「**移动端**点开始干活没有反应」就是这个：
            触摸路径下这个 click 不一定合成（和当初"摇杆+空格不能同按"是同一类问题 ✗）。
            `preventDefault` 还能顺手挡掉"按钮拿到焦点后空格去点它"的老毛病。
          */}
          {模式 === '回看' ? (
            <button
              onPointerDown={(e) => {
                e.preventDefault();
                关规则();
              }}
            >
              知道了
            </button>
          ) : (
            <button
              onPointerDown={(e) => {
                e.preventDefault();
                bus.emit(CMD.start);
              }}
            >
              开始干活
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

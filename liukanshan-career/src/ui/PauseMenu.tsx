import type { ReactElement } from 'react';
import { useGameStore } from '../state/store';
import { bus, CMD } from '../state/bus';
import { useStory } from '../state/story';
import { 全部工序, 工序表 } from '../state/orders';

const 图标 = (名: string): string => new URL(`assets/ui/icon_${名}.png`, document.baseURI).href;

/**
 * Esc 设置 / 暂停菜单：玩法说明 + 工序表 + 重开。
 *
 * ⚠️ 2026-09 改版：这一关从"投简历"改成了"把这一版稿子做出来"，
 *    所以玩法说明、工序表、操作三块都按**工作关**重写了。
 *    另外从剧情里进来时多一个「跳过这一关」—— 卡住了不至于把剧情堵死。
 */
export function PauseMenu(): ReactElement | null {
  const phase = useGameStore((s) => s.phase);
  const togglePause = useGameStore((s) => s.togglePause);
  const orders = useGameStore((s) => s.orders);
  const delivered = useGameStore((s) => s.delivered);
  const quota = useGameStore((s) => s.quota);
  /** 是不是从剧本的「开小游戏」节拍进来的（是的话才给"跳过这一关"） */
  const 在剧情里 = useStory((s) => s.屏幕 === 'level');
  const 关卡结束 = useStory((s) => s.关卡结束);
  /**
   * 用户要求：「增加给**设置按钮**用来展示**游戏介绍和规则**」。
   * ⚠️ 规则**不在这里再写一份** —— 直接打开进关卡时那张开场说明（`开规则()`），
   *    规则只有一个来源，以后改说明不会两边不一致 ✔
   */
  const 开规则 = useGameStore((s) => s.开规则);

  if (phase !== 'paused') return null;

  return (
    <div className="overlay">
      <div className="modal pause">
        <h2>暂停 · 设置</h2>

        <section>
          <h3>怎么玩</h3>
          <ol className="manual">
            <li>顶部挂着几张工单，每单写着**这一版稿子要做哪几道工序**</li>
            <li>去「文件柜」领一张空白任务单</li>
            <li>
              按需要过工位 —— <b>顺序随便</b>，做够就行，多做也算过
            </li>
            <li>把稿子送到「交稿箱」交出去；交错会消耗掉这一版</li>
            <li>
              手上的东西<b>随时能扔地上</b>（<kbd>Q</kbd> 或空格），也能再捡起来
            </li>
          </ol>
        </section>

        <section>
          <h3>三道工序</h3>
          <ul className="manual">
            {全部工序.map((g) => (
              <li key={g}>
                <span className="gtag" style={{ borderColor: 工序表[g].色, color: 工序表[g].色 }}>
                  {g}
                </span>
                <span>
                  {工序表[g].说明}
                  <i className="pause-where">（{工序表[g].在哪}）</i>
                </span>
              </li>
            ))}
          </ul>
        </section>

        <section>
          <h3>操作</h3>
          <div className="keys">
            <div>
              <kbd>方向键</kbd>
              <kbd>W</kbd>
              <kbd>A</kbd>
              <kbd>S</kbd>
              <kbd>D</kbd>
              <span>走动（和地图上完全一样）</span>
            </div>
            <div>
              <kbd>Shift</kbd>
              <span>快走</span>
            </div>
            <div>
              <kbd>空格</kbd>
              <span>领任务单 / 做功位 / 交稿；在空地就是放下或捡起</span>
            </div>
            <div>
              <kbd>Q</kbd>
              <span>随时把手上的东西扔地上</span>
            </div>
            <div>
              <kbd>Esc</kbd>
              <span>开/关这个菜单</span>
            </div>
          </div>
        </section>

        <section>
          <h3>当前进度</h3>
          <div className="pause-progress">
            交稿 <b>{delivered}</b> / {quota} 版 · 挂着 {orders.length} 张工单
          </div>
        </section>

        <section>
          <h3>游戏介绍与规则</h3>
          <div className="pause-progress" style={{ fontWeight: 400 }}>
            完整目标、评分怎么算、技能卡怎么用 —— 就是进关卡时那张开场说明。
          </div>
          <button
            className="ghost"
            onPointerDown={(e) => {
              e.preventDefault();
              // 先收起这个暂停菜单，再打开规则层（不然两层叠着，规则被压在下面 ✗）
              togglePause();
              window.setTimeout(() => 开规则(), 0);
            }}
          >
            看完整规则
          </button>
        </section>

        <div className="row" style={{ justifyContent: 'space-between' }}>
          <button className="ghost" onClick={() => bus.emit(CMD.restart)}>
            重开本关
          </button>
          {在剧情里 ? (
            <button
              className="ghost"
              onClick={() => {
                togglePause();
                关卡结束();
              }}
              title="直接跳过这一关，回到剧情（成绩按 0 交稿算）"
            >
              跳过这一关，回到剧情 ▸
            </button>
          ) : null}
          <button onClick={() => togglePause()}>继续游戏</button>
        </div>

        <p className="pause-note">
          <img src={图标('ticket')} alt="" />
          从剧本的「开小游戏」进来时，这一关的成败**只影响指标与线索**，不会改变剧情走向。
        </p>
      </div>
    </div>
  );
}

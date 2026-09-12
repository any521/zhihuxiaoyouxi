import type { ReactElement } from 'react';
import { useGameStore } from '../state/store';
import { bus, CMD } from '../state/bus';
import { 工序表, type 工序 } from '../state/orders';

const 图标 = (名: string): string => new URL(`assets/ui/icon_${名}.png`, document.baseURI).href;

/** Esc 设置 / 暂停菜单：玩法说明 + 工序表 + 重开 */
export function PauseMenu(): ReactElement | null {
  const phase = useGameStore((s) => s.phase);
  const togglePause = useGameStore((s) => s.togglePause);
  const orders = useGameStore((s) => s.orders);
  const delivered = useGameStore((s) => s.delivered);
  const quota = useGameStore((s) => s.quota);

  if (phase !== 'paused') return null;

  return (
    <div className="overlay">
      <div className="modal pause">
        <h2>暂停 · 设置</h2>

        <section>
          <h3>怎么玩</h3>
          <ol className="manual">
            <li>
              顶部挂着几家公司的订单，每单写着这份简历**需要做哪几道工序**
            </li>
            <li>去「简历架」取一份空白简历</li>
            <li>
              按需要过机器 —— <b>顺序随便</b>，做够就行，多做也算过
            </li>
            <li>把简历送到「投递箱」交付；投错会消耗掉这份简历</li>
            <li>
              手上的东西<b>随时能扔地上</b>（<kbd>Q</kbd> 或空格），也能再捡起来
            </li>
          </ol>
        </section>

        <section>
          <h3>三道工序</h3>
          <ul className="manual">
            {(['排版', '打印', '盖章'] as 工序[]).map((g) => (
              <li key={g}>
                <span className="gtag" style={{ borderColor: 工序表[g].色, color: 工序表[g].色 }}>
                  {g}
                </span>
                <span>{工序表[g].说明}</span>
              </li>
            ))}
          </ul>
        </section>

        <section>
          <h3>操作</h3>
          <div className="keys">
            <div>
              <kbd>W</kbd>
              <kbd>A</kbd>
              <kbd>S</kbd>
              <kbd>D</kbd>
              <span>移动</span>
            </div>
            <div>
              <kbd>空格</kbd>
              <span>取料 / 上机 / 交付；在空地就是放下或捡起</span>
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
            交付 <b>{delivered}</b> / {quota} 单 · 挂着 {orders.length} 张订单
          </div>
        </section>

        <div className="row" style={{ justifyContent: 'space-between' }}>
          <button className="ghost" onClick={() => bus.emit(CMD.restart)}>
            重开本关
          </button>
          <button onClick={() => togglePause()}>继续游戏</button>
        </div>

        <p className="pause-note">
          <img src={图标('ticket')} alt="" />
          卡牌与剧情对话在后续版本接进来：关键抉择时会让你插入一张技能卡。
        </p>
      </div>
    </div>
  );
}

import { createRoot } from 'react-dom/client';
import { Root } from './screens/Root';
import { useGameStore } from './state/store';
import { useStory } from './state/story';
import { 剧本, 取段 } from './story/script';
import { 事件四跑团 } from './story/跑团脚本';
import './styles.css';
import './screens.css';
import './panels.css';
import './map.css';

const container = document.getElementById('root');
if (!container) throw new Error('#root 不存在');

if (import.meta.env.DEV) {
  (window as unknown as Record<string, unknown>).__lksStore = useGameStore;
  (window as unknown as Record<string, unknown>).__lksStory = useStory;
  /**
   * 剧本表也挂出来 —— 自动化验收要能"直接跳到某一段"。
   * ⚠️ 没有它的话，测试想到事件四就得**真的把事件一二三走一遍**
   *    （中间还有两次"走到房间按空格"），慢且脆。只在 DEV 下挂。
   */
  (window as unknown as Record<string, unknown>).__lks剧本 = { 剧本, 取段, 事件四跑团 };
}

createRoot(container).render(<Root />);

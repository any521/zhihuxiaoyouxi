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

/**
 * ⚠️ 知乎登录门**不在这里**了 ✗ —— 用户要求「**先播前面的插图，再做授权**」✔，
 *    所以门挪到了 Root 里、只包住 opening **之外**的屏幕 ✔（见 Root.tsx ✗）
 */
/**
 * ⚠️⚠️ **从知乎授权跳回来时不要再播开场** ✗
 *    （用户报的「过完插图去登录，登录完又要过插图」✔）
 *    原因：登录是**整页跳转** ✗ —— 离开页面 → 知乎 → 回调跳回来 → **页面重新加载** ✔；
 *    重载后从存档恢复，而首次访问时存档里还没有「已经看过开场」这个状态 ✔ → 开场又播一遍 ✔
 *    修法：回调带的是 `?zhihu=ok` ✗ —— 见到它就直接**跳过开场** ✔（刚授权完，不必再看 ✔）
 */
if (location.search.includes('zhihu=ok')) {
  try {
    useStory.getState().跳过开场();
  } catch {
    /* 跳过失败也不该拦住进入游戏 ✗ */
  }
}

createRoot(container).render(<Root />);

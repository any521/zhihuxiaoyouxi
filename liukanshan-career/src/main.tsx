import { createRoot } from 'react-dom/client';
import { Root } from './screens/Root';
import { useGameStore } from './state/store';
import { useStory } from './state/story';
import './styles.css';
import './screens.css';

const container = document.getElementById('root');
if (!container) throw new Error('#root 不存在');

if (import.meta.env.DEV) {
  (window as unknown as Record<string, unknown>).__lksStore = useGameStore;
  (window as unknown as Record<string, unknown>).__lksStory = useStory;
}

createRoot(container).render(<Root />);

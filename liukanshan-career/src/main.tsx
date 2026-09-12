import { createRoot } from 'react-dom/client';
import { App } from './ui/App';
import { useGameStore } from './state/store';
import './styles.css';

const container = document.getElementById('root');
if (!container) throw new Error('#root 不存在');

if (import.meta.env.DEV) {
  (window as unknown as Record<string, unknown>).__lksStore = useGameStore;
}

createRoot(container).render(<App />);

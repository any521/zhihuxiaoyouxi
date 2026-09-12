/**
 * 极简事件总线：只用于「命令」方向（React → Phaser）。
 * 状态方向（Phaser → React）统一走 zustand store，避免两套真相。
 */
type Handler = (payload?: unknown) => void;

const handlers = new Map<string, Set<Handler>>();

export const bus = {
  on(event: string, handler: Handler): () => void {
    const set = handlers.get(event) ?? new Set<Handler>();
    set.add(handler);
    handlers.set(event, set);
    return () => set.delete(handler);
  },
  emit(event: string, payload?: unknown): void {
    handlers.get(event)?.forEach((handler) => handler(payload));
  },
};

export const CMD = {
  start: 'lks:start',
  restart: 'lks:restart',
} as const;

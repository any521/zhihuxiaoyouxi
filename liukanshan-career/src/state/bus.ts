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
  /**
   * 触发一个命令。
   *
   * ⚠️⚠️ **每个处理器单独 try/catch**（用户报的"重新开始有好多 bug"就是这么修好的）：
   *    重来之后，**上一个 Phaser 场景可能还没摘掉监听**（销毁时序），
   *    它在被销毁的场景上跑 `beginRun()` 会**抛异常** ——
   *    而 `Set.forEach` 遇到异常会**中断后续** ✗，
   *    于是"新场景那个正确的监听"永远轮不到执行 → **点「开始干活」毫无反应** ✗
   *    （症状：简报不消失、工单 0 张，这一关直接玩不了。）
   *    隔离之后，坏的那个自己坏，好的照常跑 ✔
   */
  emit(event: string, payload?: unknown): void {
    const 们 = handlers.get(event);
    if (!们) return;
    for (const handler of [...们]) {
      try {
        handler(payload);
      } catch (e) {
        // ⚠️ 不吞掉错误：打出来，免得以后变成"静默失灵"
        console.error('[bus] 处理器抛错（已隔离，其它处理器照常跑）', event, e);
      }
    }
  },
};

export const CMD = {
  start: 'lks:start',
  restart: 'lks:restart',
} as const;

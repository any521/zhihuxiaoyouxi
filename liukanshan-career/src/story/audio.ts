/**
 * 音效播放。
 *
 * 音效是**程序合成的 8-bit 短音**（工具/生成音效.mjs），不是下载来的素材——
 * 零版权风险，而且方波/三角波和像素画面天然匹配。
 *
 * 设计要点：
 *   一、每个音效用一个"池"，允许叠播（消息连发时不吞音）
 *   二、浏览器禁止自动播放，所以第一次播放失败要静默忽略，
 *      等用户点过一下再补上（开场本来就要点跳过）
 *   三、开关状态记进 localStorage
 *
 * 代码里一律用**键名**引用（音效名.消息收到），文件名只在内部查表，
 * 免得中文下划线的文件名散落各处。
 */

const 素材 = (文件: string): string => new URL(`audio/${文件}.wav`, document.baseURI).href;

/** 音效键名。代码里一律用这个联合类型引用，不直接写文件名。 */
export type 音效 =
  | '消息收到'
  | '消息发出'
  | '贴纸'
  | '按钮'
  | '选项悬停'
  | '选择确认'
  | '指标上升'
  | '指标下降'
  | '转场'
  | '开场标题'
  | '群邀请'
  | '知乎卡';

/** 键名 → 文件名（与 工具/生成音效.mjs 的输出一一对应） */
export const 文件名: Record<音效, string> = {
  消息收到: '消息_收到',
  消息发出: '消息_发出',
  贴纸: '贴纸',
  按钮: '按钮',
  选项悬停: '选项悬停',
  选择确认: '选择确认',
  指标上升: '指标上升',
  指标下降: '指标下降',
  转场: '转场',
  开场标题: '开场标题',
  群邀请: '群邀请',
  知乎卡: '知乎卡',
};

/** 每个音效的默认音量（合成时已控过幅度，这里只做微调） */
const 默认音量: Record<音效, number> = {
  消息收到: 0.5,
  消息发出: 0.42,
  贴纸: 0.5,
  按钮: 0.4,
  选项悬停: 0.28,
  选择确认: 0.5,
  指标上升: 0.5,
  指标下降: 0.5,
  转场: 0.45,
  开场标题: 0.5,
  群邀请: 0.5,
  知乎卡: 0.45,
};

const 开关键 = 'lks-audio-on';
const 池大小 = 3;

/** 每个音效维护一个小池子，轮着用，避免连发时被截断 */
const 池 = new Map<音效, HTMLAudioElement[]>();
let 轮转 = 0;

function 取元素(名: 音效): HTMLAudioElement | null {
  let 组 = 池.get(名);
  if (!组) {
    组 = [];
    for (let i = 0; i < 池大小; i += 1) {
      const a = new Audio(素材(文件名[名]));
      a.preload = 'auto';
      组.push(a);
    }
    池.set(名, 组);
  }
  const a = 组[轮转 % 池大小];
  轮转 += 1;
  return a ?? null;
}

/** 是否开着声音（默认开） */
export function 有声(): boolean {
  return window.localStorage.getItem(开关键) !== '0';
}

/** 开/关声音 */
export function 设声音(开: boolean): void {
  window.localStorage.setItem(开关键, 开 ? '1' : '0');
}

/**
 * 播一个音效。
 * @param 名 - 音效键名
 * @param 音量 - 可选，覆盖默认音量
 */
export function 播放(名: 音效, 音量?: number): void {
  if (!有声()) return;
  const el = 取元素(名);
  if (!el) return;
  try {
    el.pause();
    el.currentTime = 0;
    el.volume = 音量 ?? 默认音量[名];
    // 浏览器可能因为"还没有用户交互"而拒绝，这是正常的，静默忽略
    void el.play().catch(() => {});
  } catch {
    /* 忽略 */
  }
}

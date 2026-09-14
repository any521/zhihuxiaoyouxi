import { create } from 'zustand';
import { rollDrop, STARTER_CARD, 最多持卡, type SkillCard } from './cards';
import type { 订单, 工序 } from './orders';

export type Phase = 'ready' | 'playing' | 'paused' | 'finished';
export type Rating = 'S' | 'A' | 'B' | 'C';
/**
 * 手上拿的是什么。
 * ⚠️ 2026-09 改版：原来的 `resume`（简历）换成了 `draft`（稿子）——
 *    这一关从"投简历"改成了"把这一版稿子做出来"。
 */
export type CarryKind = 'blank' | 'draft' | null;

export interface Toast {
  id: number;
  speaker: string;
  text: string;
}

export interface DropInfo {
  card: SkillCard;
  upgraded: boolean;
}

/** 地面上的一件东西（可以被反复捡起/丢下） */
export interface GroundItem {
  id: number;
  工序: 工序[];
  x: number;
  y: number;
}

/**
 * 帮手（AI 同事）现在在干嘛 —— 顶部任务条要显示，玩家才知道他在帮忙。
 *
 * ⚠️ 用户要求「AI 帮手是相关的同事」（按工单客户选人），所以这里连**名字**一起带上，
 *    界面上就能写出"阿麦 正在做「写稿」"。
 */
export interface 帮手状态 {
  名: string;
  状态: string;
  手上: CarryKind;
  工序: 工序[];
}

/** 工位名牌：由 Phaser 算好坐标，交给 React 用 HTML 渲染（Phaser 在 512×288 上画 9px 中文必然糊） */
export interface StationLabel {
  /**
   * 这一台自己的**小图标**（public/assets 下的相对路径）。
   * 用户要求「每个机器比如打印机要**显示出来**并且提示不要盖住字体和素材」——
   * 所以每台机器 = 图标 + 名字，做成一个小牌子挂在工位上方。
   */
  图标?: string;
  label: string;
  工序: 工序 | null;
  x: number;
  y: number;
  kind: string;
}

interface GameState {
  phase: Phase;
  delivered: number;
  failed: number;
  quota: number;
  timeLeft: number;
  timeLimit: number;
  rating: Rating | null;
  cards: SkillCard[];
  drop: DropInfo | null;
  carrying: CarryKind;
  carryTags: 工序[];
  orders: 订单[];
  ground: GroundItem[];
  processing: number;
  processingTag: 工序 | null;
  stationLabels: StationLabel[];
  toasts: Toast[];
  prompt: string;
  /** 帮手现在在干嘛（null = 还没开始） */
  帮手: 帮手状态 | null;
  /** 打到一半回看开局规则（用户要求："增加个设置按钮可以看到刚开始的游戏规则"） */
  看规则: boolean;
  开规则: () => void;
  关规则: () => void;
  setReady: (timeLimit: number, quota: number) => void;
  beginPlay: () => void;
  setStationLabels: (labels: StationLabel[]) => void;
  sync: (payload: {
    delivered: number;
    failed: number;
    timeLeft: number;
    carrying: CarryKind;
    carryTags: 工序[];
    orders: 订单[];
    ground: GroundItem[];
    processing: number;
    processingTag: 工序 | null;
    /** 打印机里那一份（"放进去等出来"，走开了也要看得到倒计时） */
    打印: { 工序: 工序; 剩余: number } | null;
    帮手: 帮手状态 | null;
  }) => void;
  orderDone: () => void;
  finish: (rating: Rating) => void;
  togglePause: () => void;
  /** 开/关设置面板：进行中、简报阶段都能开（继续时**回到原来那一阶段**） */
  开设置: () => void;
  /** 从哪一阶段开的设置（`null` = 没在设置里） */
  暂停前: Phase | null;
  toast: (speaker: string, text: string) => void;
  dismissToast: (id: number) => void;
  setPrompt: (text: string) => void;
  /** 打印机里那一份（"放进去等出来"——玩家走开了也要看得到倒计时） */
  打印: { 工序: 工序; 剩余: number } | null;
  /** 交稿够数就发一张技能卡（关卡里能用；最多 `最多持卡` 张） */
  给卡: (card: SkillCard) => void;
  /** 用掉一张（关卡里按 1/2/3 之后调） */
  去掉卡: (id: string) => void;
}

let toastSeq = 0;

export const useGameStore = create<GameState>((set) => ({
  phase: 'ready',
  暂停前: null,
  delivered: 0,
  failed: 0,
  quota: 8,
  timeLeft: 150,
  timeLimit: 150,
  rating: null,
  cards: [STARTER_CARD],
  drop: null,
  carrying: null,
  carryTags: [],
  orders: [],
  ground: [],
  processing: 0,
  processingTag: null,
  stationLabels: [],
  toasts: [],
  prompt: '',
  打印: null,
  帮手: null,

  看规则: false,

  开规则: () => set({ 看规则: true }),
  关规则: () => set({ 看规则: false }),

  setReady: (timeLimit, quota) =>
    set({
      看规则: false,
      phase: 'ready',
      暂停前: null,
      timeLimit,
      quota,
      timeLeft: timeLimit,
      delivered: 0,
      failed: 0,
      rating: null,
      drop: null,
      toasts: [],
      carrying: null,
      carryTags: [],
      orders: [],
      ground: [],
      processing: 0,
      processingTag: null,
      cards: [STARTER_CARD],
      prompt: '',
      帮手: null,
    }),

  beginPlay: () => set({ phase: 'playing', toasts: [] }),

  setStationLabels: (labels) => set({ stationLabels: labels }),

  给卡: (card) =>
    set((state) => (state.cards.length >= 最多持卡 ? {} : { cards: [...state.cards, card] })),

  去掉卡: (id) => set((state) => ({ cards: state.cards.filter((c) => c.id !== id) })),

  sync: (payload) => set(payload),

  orderDone: () => set((state) => ({ delivered: state.delivered + 1 })),

  finish: (rating) => {
    const { delivered } = useGameStore.getState();
    const dropped = rollDrop(rating, delivered);
    set((state) => ({
      phase: 'finished',
      rating,
      drop: dropped,
      cards: dropped ? [...state.cards, dropped.card] : state.cards,
    }));
  },

  开设置: () =>
    set((state) => {
      if (state.phase === 'finished') return {};
      if (state.phase === 'paused') return { phase: state.暂停前 ?? 'playing', 暂停前: null };
      return { 暂停前: state.phase, phase: 'paused' };
    }),

  togglePause: () =>
    set((state) => {
      if (state.phase === 'playing') return { phase: 'paused', 暂停前: 'playing' };
      if (state.phase === 'paused') return { phase: state.暂停前 ?? 'playing', 暂停前: null };
      return {};
    }),

  toast: (speaker, text) =>
    set((state) => {
      toastSeq += 1;
      const toasts = [...state.toasts, { id: toastSeq, speaker, text }].slice(-4);
      return { toasts };
    }),

  setPrompt: (text) => set({ prompt: text }),

  dismissToast: (id) => set((state) => ({ toasts: state.toasts.filter((toast) => toast.id !== id) })),
}));

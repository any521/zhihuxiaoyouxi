import { create } from 'zustand';
import { rollDrop, STARTER_CARD, type SkillCard } from './cards';
import type { 订单, 工序 } from './orders';

export type Phase = 'ready' | 'playing' | 'paused' | 'finished';
export type Rating = 'S' | 'A' | 'B' | 'C';
export type CarryKind = 'blank' | 'resume' | null;

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

/** 工位名牌：由 Phaser 算好坐标，交给 React 用 HTML 渲染（Phaser 在 512×288 上画 9px 中文必然糊） */
export interface StationLabel {
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
  }) => void;
  orderDone: () => void;
  finish: (rating: Rating) => void;
  togglePause: () => void;
  toast: (speaker: string, text: string) => void;
  dismissToast: (id: number) => void;
  setPrompt: (text: string) => void;
}

let toastSeq = 0;

export const useGameStore = create<GameState>((set) => ({
  phase: 'ready',
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

  setReady: (timeLimit, quota) =>
    set({
      phase: 'ready',
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
    }),

  beginPlay: () => set({ phase: 'playing', toasts: [] }),

  setStationLabels: (labels) => set({ stationLabels: labels }),

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

  togglePause: () =>
    set((state) => {
      if (state.phase === 'playing') return { phase: 'paused' };
      if (state.phase === 'paused') return { phase: 'playing' };
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

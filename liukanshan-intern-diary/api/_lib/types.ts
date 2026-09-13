export type ScoreDelta = {
  trust: number;
  team: number;
  growth: number;
};

export type StoryAction = {
  id: string;
  label: string;
  scores: ScoreDelta;
  bubbles?: string[];
  replies?: [string, string][];
};

export type EventCriterion = {
  id: string;
  label: string;
  keywords: string[];
  /** 失败时扣分要落到哪一项：未命中的标准各扣它对应的维度 1 分（规则书 §8）。 */
  dimension?: "trust" | "team" | "growth";
};

export type StoryEvent = {
  id: string;
  day: number;
  title: string;
  phaseLabel: string;
  channel: string;
  npc: string;
  mode: "fixed" | "ai" | "ppt_minigame" | "fixed_minigame";
  participants: string[];
  brief: string;
  keyword: string;
  fallbackReply: string;
  isMinigame?: boolean;
  actions?: StoryAction[];
  criteria?: EventCriterion[];
  deliveryMinigame?: boolean;
  /** 跑团式 AI 事件的轮次上限，达到上限仍未完成即判定失败。 */
  roundLimit?: number;
  /** 事件判定失败时由 NPC 说出的收束句。 */
  failText?: string;
};

export type ZhihuInsight = {
  title: string;
  author: string;
  summary: string;
  url: string;
};

export type ApiRequest = {
  method?: string;
  body?: unknown;
  query?: Record<string, string | string[] | undefined>;
  headers: Record<string, string | string[] | undefined>;
};

export type ApiResponse = {
  status: (statusCode: number) => ApiResponse;
  json: (value: unknown) => void;
  redirect: (statusOrUrl: number | string, url?: string) => void;
  setHeader: (name: string, value: string | string[]) => void;
};

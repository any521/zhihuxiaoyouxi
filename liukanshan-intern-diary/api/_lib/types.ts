export type ScoreDelta = {
  trust: number;
  team: number;
  growth: number;
};

export type StoryAction = {
  id: string;
  label: string;
  scores: ScoreDelta;
};

export type StoryEvent = {
  id: string;
  day: number;
  title: string;
  channel: "群聊" | "林总" | "阿麦";
  npc: "林总" | "阿麦";
  brief: string;
  keyword: string;
  fallbackReply: string;
  isMinigame?: boolean;
  actions: StoryAction[];
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

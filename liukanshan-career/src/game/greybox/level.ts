/**
 * 第一章关卡布局。
 *
 * 场景用瓦片拼（地面/墙），道具和路人都是真精灵。
 * 工位按《胡闹厨房》的思路排：**取料台 + 三个加工台 + 投递箱**，
 * 加工台各自对应一道工序（排版 / 打印 / 盖章），玩家想按什么顺序做都行。
 *
 * 瓦片编号：0 办公地毯地面 / 1 办公白墙 / 2 玻璃隔断（留给会议室场景）/ 3 木地板（工位台面）
 */
import { TILE, VIEWPORT } from '../viewport';
import type { 工序 } from '../../state/orders';

export { TILE };

export type StationKind = 'shelf' | 'typeset' | 'print' | 'stamp' | 'bin';

export interface StationDef {
  kind: StationKind;
  col: number;
  row: number;
  label: string;
  /** 这台机器做什么（取料/交付台留空） */
  工序?: 工序;
}

export interface DecoDef {
  texture: 'plant' | 'box' | 'banner' | 'mug';
  col: number;
  row: number;
  dx?: number;
  dy?: number;
}

interface OrientedLevel {
  rows: number[][];
  stations: StationDef[];
  decos: DecoDef[];
  crowd: Array<{ col: number; row: number }>;
  player: { col: number; row: number };
  npc: { col: number; row: number };
}

/** 横版 16×9 */
const 横版: OrientedLevel = {
  rows: [
    [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
    [1, 0, 3, 0, 0, 3, 0, 0, 3, 0, 0, 3, 0, 0, 0, 1],
    [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1],
    [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1],
    [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1],
    [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1],
    [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1],
    [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 3, 0, 1],
    [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
  ],
  stations: [
    { kind: 'shelf', col: 2, row: 1, label: '简历架' },
    { kind: 'typeset', col: 5, row: 1, label: '排版台', 工序: '排版' },
    { kind: 'print', col: 8, row: 1, label: '打印机', 工序: '打印' },
    { kind: 'stamp', col: 11, row: 1, label: '盖章台', 工序: '盖章' },
    { kind: 'bin', col: 13, row: 7, label: '投递箱' },
  ],
  decos: [
    { texture: 'plant', col: 1, row: 1, dy: 6 },
    { texture: 'banner', col: 4, row: 3, dy: 8 },
    { texture: 'plant', col: 14, row: 1, dy: 6 },
    { texture: 'banner', col: 14, row: 4, dy: 8 },
    { texture: 'box', col: 1, row: 7, dy: 8 },
    { texture: 'plant', col: 14, row: 7, dy: 6 },
    { texture: 'box', col: 4, row: 7, dy: 8 },
    { texture: 'mug', col: 9, row: 3, dy: 10 },
  ],
  crowd: [
    { col: 6, row: 4 },
    { col: 11, row: 4 },
    { col: 3, row: 5 },
    { col: 9, row: 6 },
    { col: 12, row: 5 },
  ],
  player: { col: 7, row: 4 },
  npc: { col: 10, row: 5 },
};

/** 竖版 9×16 */
const 竖版: OrientedLevel = {
  rows: [
    [1, 1, 1, 1, 1, 1, 1, 1, 1],
    [1, 0, 3, 0, 0, 0, 3, 0, 1],
    [1, 0, 0, 0, 0, 0, 0, 0, 1],
    [1, 0, 0, 0, 0, 0, 0, 0, 1],
    [1, 0, 3, 0, 0, 0, 0, 0, 1],
    [1, 0, 0, 0, 0, 0, 0, 0, 1],
    [1, 0, 0, 0, 0, 0, 3, 0, 1],
    [1, 0, 0, 0, 0, 0, 0, 0, 1],
    [1, 0, 0, 0, 0, 0, 0, 0, 1],
    [1, 0, 0, 0, 0, 0, 0, 0, 1],
    [1, 0, 0, 0, 3, 0, 0, 0, 1],
    [1, 0, 0, 0, 0, 0, 0, 0, 1],
    [1, 0, 0, 0, 0, 0, 0, 0, 1],
    [1, 0, 0, 0, 0, 0, 0, 0, 1],
    [1, 0, 0, 0, 0, 0, 0, 0, 1],
    [1, 1, 1, 1, 1, 1, 1, 1, 1],
  ],
  stations: [
    { kind: 'shelf', col: 2, row: 1, label: '简历架' },
    { kind: 'typeset', col: 6, row: 1, label: '排版台', 工序: '排版' },
    { kind: 'print', col: 2, row: 4, label: '打印机', 工序: '打印' },
    { kind: 'stamp', col: 6, row: 6, label: '盖章台', 工序: '盖章' },
    { kind: 'bin', col: 4, row: 10, label: '投递箱' },
  ],
  decos: [
    { texture: 'plant', col: 1, row: 2, dy: 6 },
    { texture: 'banner', col: 7, row: 3, dy: 8 },
    { texture: 'plant', col: 7, row: 8, dy: 6 },
    { texture: 'box', col: 1, row: 8, dy: 8 },
    { texture: 'banner', col: 1, row: 12, dy: 8 },
    { texture: 'plant', col: 7, row: 13, dy: 6 },
  ],
  crowd: [
    { col: 4, row: 3 },
    { col: 3, row: 7 },
    { col: 6, row: 9 },
    { col: 3, row: 12 },
    { col: 6, row: 12 },
  ],
  player: { col: 4, row: 7 },
  npc: { col: 6, row: 7 },
};

const 当前 = VIEWPORT.orientation === 'portrait' ? 竖版 : 横版;

export const LEVEL_ROWS = 当前.rows;
export const COLLIDING_TILES = [1, 2, 3];
export const STATIONS = 当前.stations;
export const DECOS = 当前.decos;
export const CROWD = 当前.crowd;
export const PLAYER_START = 当前.player;
export const NPC_START = 当前.npc;

export const MAP_COLS = LEVEL_ROWS[0].length;
export const MAP_ROWS = LEVEL_ROWS.length;
export const MAP_W = MAP_COLS * TILE;
export const MAP_H = MAP_ROWS * TILE;

export const TIME_LIMIT = 180;
export const QUOTA = 8;
export const PROCESS_TIME = 0.9;
/** 同时挂出的订单数量（像胡闹厨房的订单条） */
export const ORDER_SLOTS = 3;
/** 地面上最多同时躺几件东西 */
export const GROUND_LIMIT = 5;

export const INTERACT_RADIUS = 40;
export const PLAYER_SPEED = 96;
export const NPC_SPEED = 68;

export function tileToWorld(col: number, row: number): { x: number; y: number } {
  return { x: col * TILE + TILE / 2, y: row * TILE + TILE / 2 };
}

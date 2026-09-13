import { VIEWPORT } from './viewport';

/** public/ 下的路径 → 绝对 URL（兼容部署到子路径的情况） */
const 路径 = (相对: string): string => new URL(`assets/${相对}`, document.baseURI).href;

// 关卡现在是瓦片拼的，横竖版共用同一套素材，所以这里不再需要按方向分支
void VIEWPORT;

export const 图 = {
  地面_地毯: 'tile_floor_carpet',
  地面_木地板: 'tile_floor_wood',
  墙_白墙: 'tile_wall_plain',
  墙_玻璃: 'tile_wall_glass',
  瓦片集: 'tileset',

  主角_正面: 'chr_lks_front',
  主角_侧面: 'chr_lks_side',
  主角_背面: 'chr_lks_back',
  主角_走: ['chr_lks_walk_1', 'chr_lks_walk_2', 'chr_lks_walk_3', 'chr_lks_walk_4'],
  /** 上下行走的踏步帧（运行时由正面/背面各生成一张"下沉 1px"的变体） */
  主角_下_踏步: 'chr_lks_front_step',
  主角_上_踏步: 'chr_lks_back_step',

  学长_正面: 'chr_senior_front',
  学长_侧面: 'chr_senior_side',
  学长_背面: 'chr_senior_back',
  /** 学长的踏步帧（运行时由三视图各压缩 2px 生成） */
  学长_正面_踏步: 'chr_senior_front_step',
  学长_侧面_踏步: 'chr_senior_side_step',
  学长_背面_踏步: 'chr_senior_back_step',

  群像: ['chr_crowd_1', 'chr_crowd_2', 'chr_crowd_3', 'chr_crowd_4', 'chr_crowd_5', 'chr_crowd_6'],

  资料架: 'prop_shelf',
  投递箱: 'prop_bin',
  工位桌: 'prop_desk',
  打印机: 'prop_printer',
  易拉宝: 'prop_banner',
  简章: 'prop_flyer',
  简历: 'prop_resume',
  绿萝: 'prop_plant',
  纸箱: 'prop_box',
  马克杯: 'prop_mug',
} as const;

/** 本 demo 需要加载的素材：[缓存 key, 路径] */
export const 素材清单: Array<[string, string]> = [
  [图.地面_地毯, 路径('tile/floor_carpet.png')],
  [图.地面_木地板, 路径('tile/floor_wood.png')],
  [图.墙_白墙, 路径('tile/wall_plain.png')],
  [图.墙_玻璃, 路径('tile/wall_glass.png')],

  [图.主角_正面, 路径('chr/lks_front.png')],
  [图.主角_侧面, 路径('chr/lks_side.png')],
  [图.主角_背面, 路径('chr/lks_back.png')],
  [图.主角_走[0], 路径('chr/lks_walk_1.png')],
  [图.主角_走[1], 路径('chr/lks_walk_2.png')],
  [图.主角_走[2], 路径('chr/lks_walk_3.png')],
  [图.主角_走[3], 路径('chr/lks_walk_4.png')],

  [图.学长_正面, 路径('chr/senior_front.png')],
  [图.学长_侧面, 路径('chr/senior_side.png')],
  [图.学长_背面, 路径('chr/senior_back.png')],

  [图.群像[0], 路径('chr/crowd_1.png')],
  [图.群像[1], 路径('chr/crowd_2.png')],
  [图.群像[2], 路径('chr/crowd_3.png')],
  [图.群像[3], 路径('chr/crowd_4.png')],
  [图.群像[4], 路径('chr/crowd_5.png')],
  [图.群像[5], 路径('chr/crowd_6.png')],

  [图.资料架, 路径('prop/shelf.png')],
  [图.投递箱, 路径('prop/bin.png')],
  [图.工位桌, 路径('prop/desk.png')],
  [图.打印机, 路径('prop/printer.png')],
  [图.易拉宝, 路径('prop/banner.png')],
  [图.简章, 路径('prop/flyer.png')],
  [图.简历, 路径('prop/resume.png')],
  [图.绿萝, 路径('prop/plant.png')],
  [图.纸箱, 路径('prop/box.png')],
  [图.马克杯, 路径('prop/mug.png')],
];

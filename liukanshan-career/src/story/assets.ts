/**
 * 开场 AVG 用到的素材地址与查找表。
 *
 * 所有图都在 public/assets/avg/ 下。这里只做三件事：
 *   一、把文件名变成可用 URL（兼容部署到子路径）
 *   二、给出插图 / 头像框 / 气泡 / 贴纸的名字表
 *   三、把「说话人 + 表情」解析成一张头像，找不到就退回默认表情
 */
import type { 说话人 } from './types';

const 素材 = (名: string): string => new URL(`assets/avg/${名}`, document.baseURI).href;

/** 场景插图（512×288） */
export const 插图表 = {
  章节封面: 素材('bg_chapter.png'),
  出租屋: 素材('bg_room.png'),
  招聘会: 素材('bg_jobfair.png'),
  办公室: 素材('bg_office.png'),
} as const;
export type 插图名 = keyof typeof 插图表;

/** 头像框（96×96） */
export const 框 = {
  方形: 素材('frame_square.png'),
  方形粗: 素材('frame_square_bold.png'),
  圆形: 素材('frame_round.png'),
  圆形粗: 素材('frame_round_bold.png'),
} as const;

/** 聊天气泡（九宫格） */
export const 气泡图 = {
  对方: 素材('bubble_other.png'),
  我方: 素材('bubble_me.png'),
  群聊: 素材('bubble_group.png'),
} as const;

/** 贴纸（48×64） */
export const 贴纸表: Record<string, string> = Object.fromEntries(
  ['探头', '点赞', '大哭', '震惊', '合十', '递咖啡', '抱头', '举手', '晕', '比心', '累了', '鞠躬'].map((名) => [
    名,
    素材(`sticker_${名}.png`),
  ]),
);

/** 转场沙漏（640×64，10 帧） */
export const 沙漏图 = 素材('hourglass.png');

/** 每个角色有哪些表情，第一个是默认表情 */
export const 表情表: Record<说话人, string[]> = {
  刘看山: ['平静', '开心', '疑惑', '尴尬', '疲惫', '震惊'],
  学长: ['01', '02', '03', '04'],
  林总: ['平静', '审视', '不悦', '满意'],
  周岚: ['平静', '认真', '担心', '欣慰'],
  阿麦: ['开心', '大笑', '好奇', '委屈'],
  韩策: ['面无表情', '专注', '疑惑', '认可'],
  小鹿: ['雀跃', '惊叹', '好奇', '害羞'],
  程女士: ['礼貌', '追问', '不悦', '认可'],
  系统: [],
  旁白: [],
};

/** 头像文件名前缀 */
const 前缀: Record<string, string> = {
  刘看山: 'lks',
  学长: 'senior',
};

/** 头像地址（缓存，避免每次渲染都 new URL） */
const 头像缓存 = new Map<string, string>();

/**
 * 取某人的某张表情头像。找不到就退回这个角色的第一个表情。
 * @param 谁 - 说话人
 * @param 表情 - 想要的表情名；不传则用默认
 */
export function 头像(谁: 说话人, 表情?: string): string | null {
  const 可选 = 表情表[谁];
  if (!可选 || 可选.length === 0) return null;
  const 用 = 表情 && 可选.includes(表情) ? 表情 : 可选[0];
  const 键 = `${谁}/${用}`;
  const 已有 = 头像缓存.get(键);
  if (已有) return 已有;
  const 文件名 = 前缀[谁] ? `face_${前缀[谁]}_${用}.png` : `face_${谁}_${用}.png`;
  const url = 素材(文件名);
  头像缓存.set(键, url);
  return url;
}

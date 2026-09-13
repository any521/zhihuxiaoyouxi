/**
 * 左侧功能栏的四个面板 + 个人资料卡。
 *
 * 设计原则：这些面板要**和剧情互补但不打断剧情**——
 *   · 资料卡 看自己的签名/指标/技能卡/进度
 *   · 通讯录 看已经认识的人（没认识的人锁着，顺便当进度提示）
 *   · 设置   音效开关、消息速度、重置、素材授权
 *   · 更多   玩法说明 + 素材来源与授权（OFL / CC0 / AI 生成）
 *
 * 全部是只读展示或本地设置，**不碰剧情状态**，所以随便点都不会影响推进。
 */
import { useState, type ReactElement } from 'react';
import type { 说话人 } from '../story/types';
import { 头像 } from '../story/assets';
import { useStory, type 侧栏面板 } from '../state/story';
import { useGameStore } from '../state/store';
import { 播放, 有声, 设声音 } from '../story/audio';

/** 联系人档案：职位、关系、一句话印象。解锁的人从剧情里来，这里只补身份说明。 */
interface 联系人档案 {
  谁: 说话人;
  职位: string;
  关系: string;
  印象: string;
}

const 档案表: 联系人档案[] = [
  { 谁: '林总', 职位: '创意部总监', 关系: '你的直属上级', 印象: '说话短，不爱解释。「一句话就行」是他的口头禅。' },
  { 谁: '周岚', 职位: '项目经理', 关系: '项目对接人', 印象: '先说规则，再谈感情。撤回消息比谁都快。' },
  { 谁: '小鹿', 职位: '视觉设计', 关系: '坐窗户边的同事', 印象: '群里的气氛担当，也是拉你进茶水间群的人。' },
  { 谁: '阿麦', 职位: '文案策划', 关系: '同组同事', 印象: '楼下哪家饭馆好吃，问他准没错。' },
  { 谁: '韩策', 职位: '技术', 关系: '只在项目群说话', 印象: '排期表是他做的，改的人不是他。' },
  { 谁: '程女士', 职位: '客户 · 甲方项目负责人', 关系: '12 楼那位', 印象: '「她问什么答什么，答不了的，记下来。」' },
  { 谁: '学长', 职位: '比你早两年入职', 关系: '带过你一阵子', 印象: '会帮你跑腿，但中途经常去接电话。' },
];

/** 头像小图 */
function 脸({ 谁, 尺寸 = 44 }: { 谁: 说话人; 尺寸?: number }): ReactElement | null {
  const 图 = 头像(谁);
  if (!图) return null;
  return (
    <span className="pn-face" style={{ width: 尺寸, height: 尺寸 }}>
      <img src={图} alt={谁} draggable={false} />
    </span>
  );
}

/** 面板外壳：统一的标题 + 内容 */
function 面板壳({ 标题, 副题, children }: { 标题: string; 副题?: string; children: ReactElement }): ReactElement {
  return (
    <section className="pn">
      <header className="pn-head">
        <h2 className="pn-title">{标题}</h2>
        {副题 ? <span className="pn-sub">{副题}</span> : null}
      </header>
      <div className="pn-body">{children}</div>
    </section>
  );
}

/* ═══════════════ 个人资料卡 ═══════════════ */

function 资料卡内容(): ReactElement {
  const 指标 = useStory((s) => s.指标);
  const 会话们 = useStory((s) => s.会话们);
  const 段标签 = useStory((s) => s.段标签);
  const 卡片 = useGameStore((s) => s.cards);

  const 认识的人 = 会话们.filter((c) => c.类型 === '私聊' && c.对方).length;

  return (
    <div className="pn-profile">
      <div className="pn-profile-top">
        <脸 谁="刘看山" 尺寸={72} />
        <div className="pn-profile-meta">
          <div className="pn-profile-name">刘看山</div>
          {/* 剧本原文：新存档时签名就是这句 */}
          <div className="pn-profile-sign">该用户很懒，什么都没留下。</div>
        </div>
      </div>

      <div className="pn-sec">
        <div className="pn-sec-title">当前状态</div>
        <div className="pn-stats">
          <span>老板信任 {指标.信任}</span>
          <span>团队协作 {指标.协作}</span>
          <span>职业成长 {指标.成长}</span>
        </div>
      </div>

      <div className="pn-sec">
        <div className="pn-sec-title">进度</div>
        <div className="pn-kv">
          <span>时间</span>
          <b>{段标签}</b>
        </div>
        <div className="pn-kv">
          <span>已认识</span>
          <b>{认识的人} 位同事</b>
        </div>
      </div>

      <div className="pn-sec">
        <div className="pn-sec-title">技能卡（{卡片.length}）</div>
        {卡片.map((c) => (
          <div key={c.id} className="pn-card">
            <div className="pn-card-top">
              <b>{c.name}</b>
              <span className="pn-card-tag">{c.type}</span>
            </div>
            <div className="pn-card-fx">{c.effect}</div>
            <div className="pn-card-flavor">{c.flavor}</div>
          </div>
        ))}
        <div className="pn-note">技能卡在关键抉择里使用，目前先随剧情累积。</div>
      </div>
    </div>
  );
}

/* ═══════════════ 通讯录 ═══════════════ */

function 通讯录内容(): ReactElement {
  const 会话们 = useStory((s) => s.会话们);
  const 查看 = useStory((s) => s.查看);
  const 切面板 = useStory((s) => s.切面板);

  /** 已解锁 = 剧情里已经出现过私聊窗口的那些人；另外从群聊成员里也能认识人 */
  const 已认识 = new Set<说话人>();
  for (const c of 会话们) {
    if (c.对方) 已认识.add(c.对方);
    for (const m of c.成员 ?? []) if (m !== '刘看山') 已认识.add(m);
  }
  // 群聊成员里出现过、但还没私聊过的，也算认识（比如韩策只在群里说话）
  const 有私聊 = new Map(会话们.filter((c) => c.对方).map((c) => [c.对方 as 说话人, c.id]));

  const 已知 = 档案表.filter((a) => 已认识.has(a.谁));
  const 未知 = 档案表.filter((a) => !已认识.has(a.谁));

  return (
    <div className="pn-contacts">
      <div className="pn-sec">
        <div className="pn-sec-title">已认识（{已知.length}）</div>
        {已知.map((a) => {
          const id = 有私聊.get(a.谁);
          return (
            <button
              key={a.谁}
              className="pn-contact"
              onMouseEnter={() => 播放('选项悬停')}
              onClick={() => {
                播放('按钮');
                if (id) {
                  切面板('会话');
                  查看(id);
                }
              }}
              title={id ? `打开与${a.谁}的聊天` : `${a.谁}只在群里说话，没有私聊`}
            >
              <脸 谁={a.谁} />
              <span className="pn-contact-body">
                <span className="pn-contact-row">
                  <b>{a.谁}</b>
                  <em>{a.职位}</em>
                </span>
                <span className="pn-contact-rel">{a.关系}</span>
                <span className="pn-contact-imp">{a.印象}</span>
              </span>
              {!id ? <span className="pn-lock">仅群聊</span> : null}
            </button>
          );
        })}
        {已知.length === 0 ? <div className="pn-note">还没有认识任何人。</div> : null}
      </div>

      <div className="pn-sec">
        <div className="pn-sec-title">尚未认识（{未知.length}）</div>
        {未知.map((a) => (
          <div key={a.谁} className="pn-contact locked">
            <span className="pn-face" style={{ width: 44, height: 44 }} />
            <span className="pn-contact-body">
              <span className="pn-contact-row">
                <b>？？？</b>
              </span>
              <span className="pn-contact-rel">等着在剧情里遇见</span>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ═══════════════ 设置 ═══════════════ */

function 设置内容(): ReactElement {
  const 速度 = useStory((s) => s.速度);
  const 设速度 = useStory((s) => s.设速度);
  const 重置 = useStory((s) => s.重置);
  const [, 强制刷新] = useStateTick();

  const 声音开 = 有声();

  return (
    <div className="pn-settings">
      <div className="pn-sec">
        <div className="pn-sec-title">声音</div>
        <button
          className="pn-switch"
          onMouseEnter={() => 播放('选项悬停')}
          onClick={() => {
            设声音(!声音开);
            强制刷新();
            if (!声音开) 播放('按钮');
          }}
        >
          <span>音效</span>
          <b className={声音开 ? 'on' : ''}>{声音开 ? '开' : '关'}</b>
        </button>
        <div className="pn-note">
          音效是程序合成的 8-bit 短音（方波/三角波），没有版权问题。
        </div>
      </div>

      <div className="pn-sec">
        <div className="pn-sec-title">消息速度</div>
        <div className="pn-speed">
          {[
            [0.5, '慢'],
            [1, '正常'],
            [2, '快'],
            [3, '很快'],
          ].map(([v, 标签]) => (
            <button
              key={v}
              className={`pn-speed-btn${速度 === v ? ' on' : ''}`}
              onMouseEnter={() => 播放('选项悬停')}
              onClick={() => {
                播放('按钮');
                设速度(v as number);
              }}
            >
              {标签 as string}
            </button>
          ))}
        </div>
        <div className="pn-note">只影响消息出现的间隔。点聊天区随时可以立刻推进。</div>
      </div>

      <div className="pn-sec">
        <div className="pn-sec-title">进度</div>
        <button
          className="pn-danger"
          onMouseEnter={() => 播放('选项悬停')}
          onClick={() => {
            播放('按钮');
            重置();
          }}
        >
          重来（清空进度，从开场动画重新开始）
        </button>
      </div>
    </div>
  );
}

/** 一个极简的强制刷新钩子（音效开关不是 zustand 状态，改了要重画） */
function useStateTick(): [number, () => void] {
  const [n, setN] = useState(0);
  return [n, () => setN((x) => x + 1)];
}

/* ═══════════════ 更多 ═══════════════ */

function 更多内容(): ReactElement {
  return (
    <div className="pn-about">
      <div className="pn-sec">
        <div className="pn-sec-title">怎么玩</div>
        <ul className="pn-list">
          <li>剧情以微信聊天推进。<b>点聊天区可以加速</b>，不用等自动播放。</li>
          <li>遇到选项时，<b>选项就是你要发出去的消息</b>，选定不可撤销。</li>
          <li>三项指标（老板信任 / 团队协作 / 职业成长）跟着你的选择走。</li>
          <li>左侧功能栏：头像看自己、通讯录看同事、设置调声音、更多看这里。</li>
          <li>两个窗口之间的分隔线<b>可以拖动</b>调宽，<b>双击复位</b>。</li>
        </ul>
      </div>

      <div className="pn-sec">
        <div className="pn-sec-title">素材来源与授权</div>
        <ul className="pn-list">
          <li>
            <b>像素字体</b>：方舟像素字体 12px（Ark Pixel Font），SIL Open Font License 1.1，可商用。
          </li>
          <li>
            <b>音效</b>：全部由本项目程序合成（方波 / 三角波 / 噪声），无第三方素材、无版权问题。
          </li>
          <li>
            <b>瓦片与界面底纹</b>：程序生成（可平铺值噪声 + 点阵字模），无第三方素材。
          </li>
          <li>
            <b>角色与场景美术</b>：AI 生成后经本项目的像素化管线处理（抠背景 → 降采样 → 去毛边 → 量化到 32 色板）。
          </li>
          <li>
            <b>知乎内容</b>：卡片内容将取自知乎开放平台检索的真实原文，并保留原文链接；未接入前一律标注「待接入」，
            <b>不编造内容</b>。
          </li>
        </ul>
      </div>

      <div className="pn-sec">
        <div className="pn-sec-title">关于</div>
        <div className="pn-kv">
          <span>作品</span>
          <b>《刘看山打工日记》</b>
        </div>
        <div className="pn-kv">
          <span>第一章</span>
          <b>投出去的第 47 份简历</b>
        </div>
        <div className="pn-kv">
          <span>画面</span>
          <b>512×288 / 288×512 · 32 色板</b>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════ 对外入口 ═══════════════ */

/** 侧栏面板：会话以外的三个在这里渲染 */
export function 侧栏内容({ 面板 }: { 面板: 侧栏面板 }): ReactElement | null {
  if (面板 === '会话') return null;
  if (面板 === '通讯录') return <面板壳 标题="通讯录" 副题="你在这个公司认识的人"><通讯录内容 /></面板壳>;
  if (面板 === '设置') return <面板壳 标题="设置" 副题="都在本地生效"><设置内容 /></面板壳>;
  return <面板壳 标题="更多" 副题="玩法与素材说明"><更多内容 /></面板壳>;
}

/** 个人资料卡（点功能栏里自己的头像打开） */
export function 资料卡(): ReactElement | null {
  const 开 = useStory((s) => s.资料卡开);
  const 开关资料卡 = useStory((s) => s.开关资料卡);
  if (!开) return null;
  return (
    <div
      className="pn-modal"
      onClick={() => {
        播放('按钮');
        开关资料卡(false);
      }}
    >
      <div className="pn-modal-box" onClick={(e) => e.stopPropagation()}>
        <header className="pn-head">
          <h2 className="pn-title">个人资料</h2>
          <button
            className="pn-close"
            onMouseEnter={() => 播放('选项悬停')}
            onClick={() => {
              播放('按钮');
              开关资料卡(false);
            }}
          >
            关闭
          </button>
        </header>
        <div className="pn-body">
          <资料卡内容 />
        </div>
      </div>
    </div>
  );
}

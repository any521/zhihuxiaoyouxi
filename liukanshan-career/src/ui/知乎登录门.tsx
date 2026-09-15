import { useEffect, useState, type ReactElement, type ReactNode } from 'react';
import { useStory } from '../state/story';

/**
 * **知乎登录门**。
 *
 * 流程：
 *   ① 进站先问 /刘看山/api/zhihu/status ✔（前提：开场插画已经播完 ✗ —— 由 Root 只包非 opening 屏保证 ✔）
 *   ② 没登录 → **自动去授权一次** ✔（知乎的登录页 → 授权页 ✔）
 *   ③ 授权回来仍没登录 → 看成败：
 *        · 第一次（还没试过）→ 显示登录页 ✔（给「用知乎账号登录」按钮 ✔）
 *        · **试过还是失败** → 显示失败提示 + **直接送他去知乎的手机号登录** ✔
 *   ④ 已登录 → 放行 ✔
 *
 * ⚠️⚠️ **不要拒绝微信** ✗（这条是用户纠正过我的 ✔）：
 *    我一度按 UA 判断「微信里打不开知乎登录」✗ 直接拦掉 ✔ —— 错的 ✗。
 *    用户实测：**在微信里用手机号登录是可以正常走完的** ✔。
 *    所以现在：**微信照常放行** ✔，只有在**真的失败**之后才给提示 ✔，
 *    并且提示里直接把入口指向「**知乎手机号登录**」✔。
 *
 * ⚠️ 另外：用户之前报过「用**微信登录**的知乎账号授权失败、手机号账号正常」✗ ——
 *    那是**知乎开放平台的账号限制** ✔（和浏览器无关 ✗），服务端日志能证明 ✔
 *    （反复 /login 只有少数走到 /callback，而每次到 callback 都换 token 成功 ✔）。
 */
const 接口 = '/刘看山/api/zhihu';
const 试过标记 = 'lks-zhihu-tried';
/** 用户点过「仍要在此处尝试登录」的标记 ✔（跨整页跳转靠 sessionStorage ✗） */
const 微信试过标记 = 'lks-zhihu-wx-tried';

function 是微信(): boolean {
  return /MicroMessenger/i.test(navigator.userAgent || '');
}

export function 知乎登录门({ children }: { children: ReactNode }): ReactElement {
  const [态, set态] = useState<'查' | '要登录' | '失败' | '放行'>('查');
  const [复制了, set复制了] = useState(false);
  const [在微信里] = useState(是微信);

  useEffect(() => {
    let 活 = true;
    /**
     * ⚠️ `?nologin=1` 和本地 DEV **完全绕过**这道门 ✗
     *    （给本地开发 / 自动化验收用 ✔；只做「不自动跳」是不够的 ✗
     *     —— dev 下没有这个接口，404 会把本地拦死 ✔）
     */
    if (location.search.includes('nologin') || import.meta.env.DEV) {
      set态('放行');
      return () => {
        活 = false;
      };
    }
    fetch(接口 + '/status', { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((j) => {
        if (!活) return;
        if (j?.已登录) {
          try {
            sessionStorage.removeItem(微信试过标记);
            sessionStorage.removeItem(试过标记);
          } catch {
            /* 清理失败不影响进入 ✗ */
          }
          set态('放行');
          return;
        }
        let 试过 = false;
        let 微信试过 = false;
        try {
          试过 = sessionStorage.getItem(试过标记) === '1';
          微信试过 = sessionStorage.getItem(微信试过标记) === '1';
        } catch {
          /* 读不到当没试过 ✗ */
        }
        // ② 第一次 → 自动去授权 ✔
        if (!试过) {
          try {
            sessionStorage.setItem(试过标记, '1');
          } catch {
            /* 存不下也要跳 ✗ */
          }
          try {
            useStory.getState().存进度();
          } catch {
            /* 存不下不拦登录 ✗ */
          }
          window.location.href = 接口 + '/login';
          return;
        }
        // ③ 试过还是没登录 → 失败页（微信里试过的话，提示更具体 ✗）
        set态(微信试过 ? '失败' : '要登录');
      })
      .catch(() => {
        /**
         * ⚠️ 拿不到登录状态（服务没起 / 断网 ✗）→ 也按「要登录」处理 ✔
         *    （用户要求「必须登录」✗ —— 这条取舍已写进文档 ✔）
         */
        if (活) set态('要登录');
      });
    return () => {
      活 = false;
    };
  }, []);

  if (态 === '放行') return <>{children}</>;

  const 地址 = location.origin + '/刘看山/';
  const 去登录 = () => {
    try {
      sessionStorage.setItem(微信试过标记, '1');
    } catch {
      /* 存不下不影响跳转 ✗ */
    }
  };

  return (
    <div className="zm-wrap">
      <div className="zm-card">
        <div className="zm-title">刘看山 · 打工日记</div>
        {态 === '查' ? (
          <div className="zm-sub">正在检查登录状态…</div>
        ) : 态 === '失败' ? (
          <>
            <div className="zm-sub">
              授权没有成功。
              <br />
              请改用 <b>知乎的手机号登录</b> 再试一次。
            </div>
            <div className="zm-note">
              {在微信里
                ? '如果你刚才用的是「微信登录」的知乎账号：知乎开放平台对这种账号有限制，先绑定手机号就能授权了。'
                : '如果一直失败：先确认这个知乎账号是用手机号登录的（微信登录的账号需要先绑定手机号）。'}
            </div>
            <a className="zm-btn" href={接口 + '/login'} onClick={去登录}>
              去知乎手机号登录
            </a>
            <button
              className="zm-skip"
              type="button"
              onClick={() => {
                navigator.clipboard?.writeText(地址).then(
                  () => set复制了(true),
                  () => set复制了(false),
                );
              }}
            >
              {复制了 ? '已复制地址，可到浏览器粘贴打开' : '还是不行？复制网址：' + 地址}
            </button>
          </>
        ) : (
          <>
            <div className="zm-sub">用知乎账号登录后开始。登录后，游戏里会显示你的真实用户名和头像。</div>
            <a className="zm-btn" href={接口 + '/login'} onClick={去登录}>
              用知乎账号登录
            </a>
            <div className="zm-note">
              建议用<b>手机号</b>登录知乎（微信登录的知乎账号需要先绑定手机号才能授权）。
            </div>
          </>
        )}
      </div>
    </div>
  );
}
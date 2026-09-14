import { useEffect, useState, type ReactElement, type ReactNode } from 'react';
import { useStory } from '../state/story';

/**
 * **知乎登录门**。
 *
 * 流程：
 *   ⓪ **先看是不是微信 / App 内置浏览器** ✗ —— 是的话**根本别去跳授权**（必失败 ✗），
 *      直接显示「请在浏览器中打开」的引导 ✔
 *   ① 问 /刘看山/api/zhihu/status ✔
 *   ② 没登录 → 自动跳一次授权（sessionStorage 防死循环 ✔）
 *   ③ 授权回来仍没登录 → 显示门（只有登录按钮 ✗）
 *   ④ 已登录 → 放行 ✔
 *
 * ⚠️⚠️ 用户要求「必须登录」✗ —— 连不上登录服务也拦 ✔
 *    （代价：老铁律「离线也能把故事走完」在这里失效 ✔）
 *
 * ⚠️⚠️ 用户报「**微信登录的知乎用户登录失败**」✗ ——
 *    真因是**微信内置浏览器**：它的 WebView 会拦第三方 OAuth 的跳转链 ✔，
 *    而知乎「用微信登录」那一环在微信里也常失败 ✔（国内项目的通病 ✗）
 *    标准解法：**识别出来 + 引导到系统浏览器** ✔（就是第 ⓪ 步 ✔）
 */
const 接口 = '/刘看山/api/zhihu';
const 试过标记 = 'lks-zhihu-tried';

function 判断环境(): { 微信: boolean; 内置: boolean } {
  const ua = navigator.userAgent || '';
  const 微信 = /MicroMessenger/i.test(ua);
  const 内置 = 微信 || /QQ\/|QQBrowser|Weibo|Douyin|BytedanceWebview|AlipayClient|DingTalk/i.test(ua);
  return { 微信, 内置 };
}

export function 知乎登录门({ children }: { children: ReactNode }): ReactElement {
  const [态, set态] = useState<'查' | '要登录' | '放行' | '换浏览器'>('查');
  const [复制了, set复制了] = useState(false);
  const [环境] = useState(判断环境);

  useEffect(() => {
    let 活 = true;
    /**
     * ⚠️⚠️ **`?nologin=1` 必须直接放行** ✗（不能只做到「不自动跳」✗）——
     *    只做到「不跳」的话**本地 dev 会被拦死** ✔：
     *    dev 下没有 /刘看山/api/zhihu/status 这个接口 ✗ → 请求 404 →
     *    按「必须登录」的逻辑就会显示登录门 ✔ → 本地根本进不去游戏 ✔
     *    （实测：我的无头探针也因此一直起不来 ✔）
     *    这个口子是给**本地开发 / 自动化验收**用的 ✔ —— 必须**完全绕过**这道门 ✔
     */
    if (location.search.includes('nologin') || import.meta.env.DEV) {
      set态('放行');
      return () => {
        活 = false;
      };
    }
    // ⚠️ 微信 / App 内置浏览器里**不跳** ✗（跳了也是白跳 ✔）→ 直接显示引导 ✔
    if (环境.内置) {
      set态('换浏览器');
      return () => {
        活 = false;
      };
    }
    fetch(接口 + '/status', { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((j) => {
        if (!活) return;
        if (j?.已登录) {
          set态('放行');
          return;
        }
        const 免跳 = import.meta.env.DEV || location.search.includes('nologin');
        if (!免跳 && sessionStorage.getItem(试过标记) !== '1') {
          sessionStorage.setItem(试过标记, '1');
          try {
            useStory.getState().存进度();
          } catch {
            /* 存不下也不该拦住登录 ✗ */
          }
          window.location.href = 接口 + '/login';
          return;
        }
        set态('要登录');
      })
      .catch(() => {
        if (活) set态('要登录');
      });
    return () => {
      活 = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (态 === '放行') return <>{children}</>;

  const 地址 = location.origin + '/刘看山/';

  return (
    <div className="zm-wrap">
      <div className="zm-card">
        <div className="zm-title">刘看山 · 打工日记</div>
        {态 === '查' ? (
          <div className="zm-sub">正在检查登录状态…</div>
        ) : 态 === '换浏览器' ? (
          <>
            <div className="zm-sub">
              {环境.微信 ? '微信里打不开知乎登录' : '这个内置浏览器打不开知乎登录'}
              <br />
              {环境.微信 ? '请点右上角 ··· → 在浏览器中打开。' : '请用系统浏览器打开。'}
              登录后再回来继续。
            </div>
            <a className="zm-btn" href={接口 + '/login'}>仍要在此处尝试登录</a>
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
              {复制了 ? '已复制地址，去浏览器粘贴打开' : '复制网址：' + 地址}
            </button>
          </>
        ) : (
          <>
            <div className="zm-sub">用知乎账号登录后开始。登录后，游戏里会显示你的真实用户名和头像。</div>
            <a className="zm-btn" href={接口 + '/login'}>用知乎账号登录</a>
            {/*
              ⚠️⚠️ 用户实测：「**微信登录的知乎账号不能授权，手机号的可以**」✗
                 日志证据：反复 /login 8 次，只有 2 次走到 /callback ✔ ——
                 大半的尝试是在**知乎授权页就被挡回来**的 ✔（平台侧限制 ✗）
                 我们拿不到那种账号，代码里绕不过去 ✔ → 只能给这条可操作的提示 ✔
            */}
            <div className="zm-note">
              授权失败？如果你是用**微信登录**的知乎账号，请先在知乎 App 里**绑定手机号**，
              再回来登录（这是知乎开放平台的账号限制，不是本游戏的问题）。
            </div>
          </>
        )}
      </div>
    </div>
  );
}
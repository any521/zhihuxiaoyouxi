/**
 * 知乎 OAuth 登录服务（刘看山小游戏用）。
 *
 * ⚠️ 为什么必须**服务端**做（不能在前端 ✗）：
 *    · app_key 绝不能进浏览器 ✗（进了就等于公开 ✗）
 *    · 换 token 的接口有 CORS 限制 ✗，浏览器直连拿不到 ✔
 *
 * ⚠️ 密钥来源：**只从环境变量读** ✔
 *    ZHIHU_APP_ID / ZHIHU_APP_KEY / ZHIHU_REDIRECT_URI
 *    我把它们写在服务器上的 /etc/liukanshan-zhihu.env（权限 600 ✔），不进代码包、不进仓库 ✔
 *
 * ⚠️ 官方要求（读了 hackathon skill 的 SKILL.md ✗）：
 *    · 回调必须是**公网 HTTPS** ✗（127.0.0.1/localhost 不算 ✔）
 *    · token **只存进程内存**（不落盘 ✔）
 *    · 授权页最后那个确认按钮**必须用户本人点** ✗，服务端不代点 ✔
 *
 * 路由（挂在 /刘看山/api/zhihu/ 下，nginx 转发到 127.0.0.1:5310 ✔）：
 *   GET  /status    → 当前登录状态 + 资料
 *   GET  /login     → 302 到知乎授权页
 *   GET  /callback  → 收 authorization_code → 换 token → 拉 /user → 回游戏
 *   POST /logout    → 退出
 */
import http from 'node:http';
import { writeFileSync } from 'node:fs';

const APP_ID = process.env.ZHIHU_APP_ID ?? '';
const APP_KEY = process.env.ZHIHU_APP_KEY ?? '';
const REDIRECT = process.env.ZHIHU_REDIRECT_URI ?? '';
const PORT = Number(process.env.PORT ?? 5310);
const 授权地址 = 'https://openapi.zhihu.com/authorize';
const 换码地址 = 'https://openapi.zhihu.com/access_token';
const 用户地址 = 'https://openapi.zhihu.com/user';

/** ⚠️ 会话只存内存（官方要求 ✗ 不落盘 ✔）：cookieId → { token, 资料, 过期 } */
const 会话表 = new Map();

const 发json = (res, code, 体) => {
  const s = JSON.stringify(体);
  res.writeHead(code, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    'Access-Control-Allow-Origin': 'https://zjhxbb.xyz',
    'Access-Control-Allow-Credentials': 'true',
  });
  res.end(s);
};

const 读cookie = (req, 名) => {
  const raw = req.headers.cookie ?? '';
  const hit = raw.split(';').map((x) => x.trim()).find((x) => x.startsWith(名 + '='));
  return hit ? decodeURIComponent(hit.slice(名.length + 1)) : null;
};

const 会话 = (req) => {
  const id = 读cookie(req, 'lks_zhihu');
  if (!id) return null;
  const s = 会话表.get(id);
  if (!s) return null;
  if (s.过期 && s.过期 < Date.now()) { 会话表.delete(id); return null; }
  return s;
};

/** 把 /user 的响应整理成前端好用的形状（⚠️ 没有正式 schema ✗，所以字段全部防御式取 ✗） */
function 整理资料(原始) {
  const d = 原始?.data ?? 原始?.Data ?? 原始 ?? {};
  const 取 = (...名们) => { for (const n of 名们) { const v = d[n]; if (v !== undefined && v !== null && v !== '') return v; } return null; };
  /**
   * ⚠️⚠️ **字段名是实测出来的**（官方没有 schema ✗）——
   *    我在服务器上落了原始响应 ✔（/tmp/lks-user-raw.json ✗），真实长这样：
   *    { fullname, avatar_path, headline, description, uid, hash_id, url, gender }
   *    名字是 **fullname** ✗（不是我猜的 name/nickname ✗）
   *    头像是 **avatar_path** ✗（不是 avatar_url/avatar ✗）
   * ⚠️ 以后改这里，先 `cat /tmp/lks-user-raw.json` 对一遍 ✗
   */
  return {
    名字: 取('fullname', 'name', 'Name', 'nickname', 'display_name'),
    头像: 取('avatar_path', 'avatar_url', 'avatar', 'AvatarUrl', 'picture'),
    签名: 取('headline', 'description', 'bio', 'signature'),
    /**
     * ⚠️⚠️ 用户报「打开知乎主页 404」：接口返回的 url 是 **API 地址** ✗
     *    （形如 `openapi.zhihu.com/users/2003756...` ✔）—— 那是给程序调的，浏览器打开就是 404 ✔
     *    改法：把它**改写成网页地址** ✔（知乎的人主页是 /people/<token> ✗）
     */
    /**
     * ⚠️⚠️ **知乎 OAuth 的 /user 不返回网页用的 `url_token`** ✗ ——
     *    实测只有 uid / hash_id / 一个 openapi.zhihu.com 的 **API 地址** ✔
     *    我一开始把那个 API 地址改写成 /people/<uid> 拼了个网页链接 ✗
     *    → 用户点开是「**用户不存在**」✔（死链比没有更糟 ✗）
     *    所以：**只有在真的拿到 url_token 时**才给主页 ✔，否则给 null ✔
     *    （前端是 `资料.主页 ? 渲染链接 : 不渲染` ✔ → 会自动不显示 ✗）
     */
    主页: (() => {
      const token = 取('url_token', 'UrlToken');
      if (token && /^[A-Za-z0-9_-]+$/.test(String(token))) return 'https://www.zhihu.com/people/' + token;
      return null;
    })(),
    原始字段: Object.keys(d).slice(0, 40),
  };
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', 'http://127.0.0.1');
  /**
   * ⚠️⚠️ Node 给的 `req.url` 是**百分号编码**的 ✗ —— 中文路径必须**先解码再匹配** ✔
   *    （我第一版直接拿编码后的 pathname 去和「/刘看山/api/zhihu」比 ✗
   *      → 永远匹配不上 → 接口返回 400 / 空响应 ✔）
   */
  /**
   * ⚠️ 支持**两种前缀** ✔：
   *    · /刘看山/api/zhihu/…  （原来的中文路径 ✗）
   *    · /lks-zhihu/          （**纯英文别名** ✗ —— 有些平台的回调字段只让填字母数字 ✔）
   *    两条都转发到这里，谁登记的是哪条都能通 ✔
   * ⚠️ 仍然要先 decodeURIComponent（Node 给的是百分号编码 ✗）
   */
  const p = decodeURIComponent(url.pathname).replace(/^\/刘看山\/api\/zhihu|^\/lks-zhihu/, '') || '/';
  /**
   * ⚠️ **每一步都记一行日志**（用户反馈「还是不行」✗ 时必须能看出卡在哪 ✗）
   *    ⚠️ 只记流程 ✗，**绝不记 code / token / app_key** ✔（官方硬要求 ✔）
   */
  console.log('[zhihu]', new Date().toISOString().slice(11, 19), p, url.search ? '有查询参数' : '');
  try {
    if (p === '/status') {
      const s = 会话(req);
      return 发json(res, 200, { ok: true, 已登录: !!s, 资料: s?.资料 ?? null, 配置好: !!(APP_ID && APP_KEY && REDIRECT) });
    }
    if (p === '/login') {
      if (!APP_ID || !REDIRECT) return 发json(res, 500, { ok: false, 错误: '服务端缺少 ZHIHU_APP_ID / ZHIHU_REDIRECT_URI' });
      const u = new URL(授权地址);
      u.searchParams.set('redirect_uri', REDIRECT);
      u.searchParams.set('app_id', APP_ID);
      // ⚠️ 官方参考实现（hello-world-oauth/lib/oauth.mjs 的 start()）**带 state** ✔
      //    知乎回调**不保证返 state**（文档没写 ✗），所以那边只做「返了就校验」✔
      const state = Math.random().toString(36).slice(2) + Date.now().toString(36);
      u.searchParams.set('state', state);
      u.searchParams.set('response_type', 'code');
      /**
       * ⚠️⚠️ 用户反馈（手机 + App 内置浏览器）：「**没登录知乎的用户点授权直接报错**
       *    （授权页一条红条：出错了！请稍后再试。）」✔
       *    要求：**没登录的用户先跳去知乎登录页** ✗
       * 改法：不再直接怼授权页 ✔，而是先到知乎登录页、成功后由 next 落回授权页 ✔
       *    `?direct=1` 可以跳过这一步直连授权页（调试/已登录时更快 ✗）
       * ⚠️ 注意：知乎登录页的参数名就叫 `next`（值为**编码后的完整地址**✔）
       */
      const 授权 = u.toString();
      const 直连 = url.searchParams.get('direct') === '1';
      const 目标 = 直连 ? 授权 : 'https://www.zhihu.com/signin?next=' + encodeURIComponent(授权);
      res.writeHead(302, { Location: 目标, 'Cache-Control': 'no-store' });
      return res.end();
    }
    if (p === '/callback') {
      // ⚠️ 回调参数名是 authorization_code（不是 code ✗）；官方**不返 state** ✔ → 两种都兼容
      const 码 = url.searchParams.get('authorization_code') ?? url.searchParams.get('code');
      if (!码) return 发json(res, 400, { ok: false, 错误: '回调里没有 authorization_code' });
      const 体 = new URLSearchParams({
        app_id: APP_ID, app_key: APP_KEY, grant_type: 'authorization_code', redirect_uri: REDIRECT, code: 码,
      });
      const tr = await fetch(换码地址, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 体 });
      const tj = await tr.json().catch(() => ({}));
      const token = tj.access_token ?? tj.data?.access_token ?? tj.Data?.access_token ?? null;
      if (!token) {
        console.log('[zhihu] 换 token 失败 ✗ 返回的字段:', Object.keys(tj ?? {}).join(','), '错误码:', tj?.code ?? tj?.Code ?? tj?.error ?? '-');
        return 发json(res, 401, { ok: false, 错误: '换 token 失败', 详情: tj });
      }
      console.log('[zhihu] 换 token 成功 ✔ 开始拉 /user');
      let 资料 = null;
      try {
        const ur = await fetch(用户地址, { headers: { Authorization: 'Bearer ' + token } });
        const 原始 = await ur.json().catch(() => ({}));
        /**
         * ⚠️ 把**原始响应**落盘（600 权限）✗ —— 用户反馈「名字显示成知乎用户」说明
         *    我猜的字段名不对 ✔，而 `/user` 官方**没有 schema** ✗，只能看真实响应 ✔
         *    （文件里**不含 token** ✗，只有资料字段 ✔）
         */
        try {
          writeFileSync('/tmp/lks-user-raw.json', JSON.stringify(原始, null, 2), { mode: 0o600 });
        } catch { /* 落盘失败不影响登录 ✗ */ }
        资料 = 整理资料(原始);
      } catch { 资料 = null; }
      const id = Math.random().toString(36).slice(2) + Date.now().toString(36);
      会话表.set(id, { token, 资料, 过期: Date.now() + 7 * 24 * 3600 * 1000 });
      res.writeHead(302, {
        /**
         * ⚠️⚠️ **HTTP 响应头里不能有非 ASCII 字符** ✗ —— 用户报的
         *    `Invalid character in header content ["Location"]` 就是这个 ✔
         *    我原来写的是 `Location: /刘看山/?zhihu=ok` ✗ 和 `Path=/刘看山/` ✗，Node 直接拒收 ✔
         *    （结果：**授权其实成功了，但最后一步跳不回游戏** ✔）
         * 改法：Location 用**百分号编码** ✔；Cookie 的 Path 用根路径 ✔
         *    （这个 cookie 只被本服务读 ✔，Path=/ 足够 ✔）
         */
        Location: '/%E5%88%98%E7%9C%8B%E5%B1%B1/?zhihu=ok',
        'Set-Cookie': 'lks_zhihu=' + id + '; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=604800',
        'Cache-Control': 'no-store',
      });
      return res.end();
    }
    if (p === '/logout') {
      const id = 读cookie(req, 'lks_zhihu');
      if (id) 会话表.delete(id);
      // ⚠️ 同样：Path 里不能有中文 ✗（用根路径 ✔）
      res.writeHead(200, { 'Content-Type': 'application/json', 'Set-Cookie': 'lks_zhihu=; Path=/; Max-Age=0' });
      return res.end(JSON.stringify({ ok: true }));
    }
    return 发json(res, 404, { ok: false, 错误: '没有这个接口' });
  } catch (e) {
    发json(res, 500, { ok: false, 错误: String(e?.message ?? e).slice(0, 200) });
  }
});

server.listen(PORT, '127.0.0.1', () => {
  process.stdout.write('zhihu-oauth 服务已启动: http://127.0.0.1:' + PORT + '/  (配置完整: ' + !!(APP_ID && APP_KEY && REDIRECT) + ')\n');
});

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
  return {
    名字: 取('name', 'Name', 'nickname', 'display_name'),
    头像: 取('avatar_url', 'avatar', 'AvatarUrl', 'picture'),
    签名: 取('headline', 'description', 'bio', 'signature'),
    主页: 取('url', 'Url', 'profile_url'),
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
      res.writeHead(302, { Location: u.toString(), 'Cache-Control': 'no-store' });
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
      if (!token) return 发json(res, 401, { ok: false, 错误: '换 token 失败', 详情: tj });
      let 资料 = null;
      try {
        const ur = await fetch(用户地址, { headers: { Authorization: 'Bearer ' + token } });
        资料 = 整理资料(await ur.json().catch(() => ({})));
      } catch { 资料 = null; }
      const id = Math.random().toString(36).slice(2) + Date.now().toString(36);
      会话表.set(id, { token, 资料, 过期: Date.now() + 7 * 24 * 3600 * 1000 });
      res.writeHead(302, {
        Location: '/刘看山/?zhihu=ok',
        'Set-Cookie': 'lks_zhihu=' + id + '; Path=/刘看山/; HttpOnly; Secure; SameSite=Lax; Max-Age=604800',
        'Cache-Control': 'no-store',
      });
      return res.end();
    }
    if (p === '/logout') {
      const id = 读cookie(req, 'lks_zhihu');
      if (id) 会话表.delete(id);
      res.writeHead(200, { 'Content-Type': 'application/json', 'Set-Cookie': 'lks_zhihu=; Path=/刘看山/; Max-Age=0' });
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

import { useEffect, useState, type ReactElement } from 'react';

/**
 * **知乎账号**（用户要求：接知乎登录 + 在「刘看山」后面显示真实用户名 + 展示真实数据）。
 *
 * ⚠️ 登录**必须在服务端**完成（app_key 不能进浏览器 ✗、换 token 有 CORS ✗）——
 *    服务在 liukanshan-career/server/zhihu-oauth.mjs，nginx 把
 *    /刘看山/api/zhihu/ 转到 127.0.0.1:5310 ✔
 * ⚠️ 未登录 / 服务没起 / 接口报错，这里都**只是不显示**（不影响游戏 ✗）——
 *    这个项目要求「离线也能把故事走完」✔
 */
interface 资料 {
  名字: string | null;
  头像: string | null;
  签名: string | null;
  主页: string | null;
}

const 接口 = '/刘看山/api/zhihu';

export function 知乎账号(): ReactElement | null {
  const [状, set状] = useState<{ 已登录: boolean; 资料: 资料 | null } | null>(null);
  const [坏, set坏] = useState(false);

  useEffect(() => {
    let 活 = true;
    fetch(接口 + '/status', { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((j) => {
        if (活) set状({ 已登录: !!j.已登录, 资料: j.资料 ?? null });
      })
      .catch(() => {
        if (活) set坏(true);
      });
    return () => {
      活 = false;
    };
  }, []);

  // ⚠️ 接口不通（没部署服务 / 离线）就整块不显示 —— 不能因为登录挂了就不让玩 ✗
  if (坏 || !状) return null;

  if (!状.已登录) {
    return (
      <div className="pn-sec">
        <div className="pn-sec-title">知乎账号</div>
        <div className="pn-note">登录后会在这里显示你的知乎用户名和资料。</div>
        <a className="pn-btn" href={接口 + '/login'}>
          用知乎账号登录
        </a>
      </div>
    );
  }

  const 名 = 状.资料?.名字 ?? '知乎用户';
  return (
    <div className="pn-sec">
      <div className="pn-sec-title">知乎账号</div>
      <div className="pn-zhihu">
        {状.资料?.头像 ? <img className="pn-zhihu-avatar" src={状.资料.头像} alt="" /> : null}
        <div className="pn-zhihu-name">刘看山（{名}）</div>
      </div>
      {状.资料?.签名 ? <div className="pn-note">{状.资料.签名}</div> : null}
      {状.资料?.主页 ? (
        <div className="pn-note">
          <a href={状.资料.主页} target="_blank" rel="noreferrer noopener">
            打开知乎主页
          </a>
        </div>
      ) : null}
      <button
        className="pn-btn"
        onClick={() => {
          fetch(接口 + '/logout', { method: 'POST', credentials: 'include' }).finally(() => {
            window.location.reload();
          });
        }}
      >
        退出知乎账号
      </button>
    </div>
  );
}
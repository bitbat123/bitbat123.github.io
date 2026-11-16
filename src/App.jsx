import React, { useEffect, useState } from 'react';
import { GAMES } from './games.js';
import AuthPanel from './components/AuthPanel.jsx';
import AdminPanel from './components/AdminPanel.jsx';
import MemberList from './components/MemberList.jsx';
import { callAuth, getToken, clearToken } from './cloud.js';

// 管理员用户名（与云函数中的常量保持一致）
const ADMIN_USERNAME = 'bitbat';

/**
 * 首页流程：
 * - 默认先显示登录页（登录 / 注册 / 免登录游玩）；
 * - 登录成功（或选择免登录游玩）后进入游戏列表；
 * - 游客只能玩单机，登录用户以后可解锁联机。
 */
export default function App() {
  const [user, setUser] = useState(null);      // { username } | null
  const [guest, setGuest] = useState(false);   // 是否选择了免登录游玩
  const [checking, setChecking] = useState(true);

  // 启动时用本地令牌恢复会话，恢复成功则直接进入游戏列表
  useEffect(() => {
    const token = getToken();
    if (!token) { setChecking(false); return; }
    callAuth('session', { token })
      .then((r) => { if (r.ok) setUser({ username: r.username }); else clearToken(); })
      .catch(() => clearToken())
      .finally(() => setChecking(false));
  }, []);

  const logout = () => { clearToken(); setUser(null); setGuest(false); };

  if (checking) {
    return <div className="home"><p className="muted center">加载中…</p></div>;
  }

  // 未登录且未选择游客：显示登录页
  if (!user && !guest) {
    return (
      <div className="home">
        <header className="home-hero">
          <div className="home-logo">🎮</div>
          <h1>中预三班游戏&amp;工具盒</h1>
        </header>
        <AuthPanel
          onLogin={(u) => setUser(u)}
          onGuest={() => setGuest(true)}
        />
        <footer className="home-foot">© 中预三班 · 由Bitbat搭建</footer>
      </div>
    );
  }

  // 已登录或游客：显示游戏列表
  return (
    <div className="home">
      <header className="home-hero">
        <div className="home-logo">🎮</div>
        <h1>中预三班游戏&amp;工具盒</h1>
        <div className="account-bar">
          {user ? (
            <>
              <span>你好，{user.username}</span>
              <button className="logout" onClick={logout}>退出登录</button>
            </>
          ) : (
            <>
              <span className="muted">当前为游客：仅可玩单机模式</span>
              <button className="logout" onClick={() => setGuest(false)}>去登录</button>
            </>
          )}
        </div>
      </header>

      {user && user.username === ADMIN_USERNAME && <AdminPanel />}

      <MemberList />

      <main className="home-grid">
        {GAMES.map((g) => (
          <a key={g.id} className="game-card" href={g.href}>
            <div className="gc-icon">{g.icon}</div>
            <div className="gc-body">
              <h2>{g.name}</h2>
              <p>{g.tagline}</p>
              <div className="gc-tags">
                {g.tags.map((t) => (
                  <span key={t} className="gc-tag">{t}</span>
                ))}
                {g.multiplayer && <span className="gc-tag mp">联机（需登录）</span>}
              </div>
            </div>
            <span className="gc-go">开始 ›</span>
          </a>
        ))}

        <div className="game-card placeholder">
          <div className="gc-icon">🧩</div>
          <div className="gc-body">
            <h2>更多游戏即将上线</h2>
            <p>敬请期待新的游戏与工具。</p>
          </div>
        </div>
      </main>

      <footer className="home-foot">© 中预三班 · 由Bitbat搭建</footer>
    </div>
  );
}

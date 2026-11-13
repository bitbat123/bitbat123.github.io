import React, { useEffect, useState } from 'react';
import { GAMES } from './games.js';
import AuthPanel from './components/AuthPanel.jsx';
import { callAuth, getToken, clearToken } from './cloud.js';

/**
 * 主页：所有人（包括游客）都能看到游戏列表并玩单机模式。
 * 登录 / 注册是可选入口：登录后可玩联机模式（联机功能以后再做）。
 */
export default function App() {
  const [user, setUser] = useState(null);
  const [checking, setChecking] = useState(true);
  const [showAuth, setShowAuth] = useState(false);

  // 启动时用本地令牌恢复会话（失败则视为游客）
  useEffect(() => {
    const token = getToken();
    if (!token) { setChecking(false); return; }
    callAuth('session', { token })
      .then((r) => { if (r.ok) setUser({ username: r.username }); else clearToken(); })
      .catch(() => clearToken())
      .finally(() => setChecking(false));
  }, []);

  const logout = () => { clearToken(); setUser(null); };

  return (
    <div className="home">
      <header className="home-hero">
        <div className="home-logo">🎮</div>
        <h1>中预三班游戏&amp;工具盒</h1>
        <div className="account-bar">
          {checking ? (
            <span className="muted">检查登录状态…</span>
          ) : user ? (
            <>
              <span>你好，{user.username}</span>
              <button className="logout" onClick={logout}>退出登录</button>
            </>
          ) : (
            <>
              <span className="muted">当前为游客：可玩单机模式</span>
              <button className="logout" onClick={() => setShowAuth((v) => !v)}>
                {showAuth ? '收起' : '登录 / 注册（解锁联机）'}
              </button>
            </>
          )}
        </div>
      </header>

      {!user && showAuth && (
        <div className="auth-slot">
          <AuthPanel onLogin={(u) => { setUser(u); setShowAuth(false); }} />
        </div>
      )}

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

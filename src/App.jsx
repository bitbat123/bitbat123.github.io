import React, { useEffect, useState } from 'react';
import { GAMES } from './games.js';
import AuthPanel from './components/AuthPanel.jsx';
import { callAuth, getToken, clearToken } from './cloud.js';

/** 主页：登录后显示游戏列表；未登录显示登录 / 注册 */
export default function App() {
  const [user, setUser] = useState(null);
  const [checking, setChecking] = useState(true);

  // 启动时用本地令牌恢复会话
  useEffect(() => {
    const token = getToken();
    if (!token) { setChecking(false); return; }
    callAuth('session', { token })
      .then((r) => { if (r.ok) setUser({ username: r.username }); else clearToken(); })
      .catch(() => clearToken())
      .finally(() => setChecking(false));
  }, []);

  const logout = () => { clearToken(); setUser(null); };

  if (checking) {
    return <div className="home"><p className="muted center">加载中…</p></div>;
  }

  if (!user) {
    return (
      <div className="home">
        <header className="home-hero">
          <div className="home-logo">🎮</div>
          <h1>中预三班游戏&amp;工具盒</h1>
        </header>
        <AuthPanel onLogin={setUser} />
        <footer className="home-foot">© 中预三班 · 由Bitbat搭建</footer>
      </div>
    );
  }

  return (
    <div className="home">
      <header className="home-hero">
        <div className="home-logo">🎮</div>
        <h1>中预三班游戏&amp;工具盒</h1>
        <p>
          你好，{user.username}
          <button className="logout" onClick={logout}>退出登录</button>
        </p>
      </header>

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

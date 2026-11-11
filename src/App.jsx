import React from 'react';
import { GAMES } from './games.js';

/** 主页：列出所有游戏与工具，点击卡片进入对应页面 */
export default function App() {
  return (
    <div className="home">
      <header className="home-hero">
        <div className="home-logo">🎮</div>
        <h1>中预三班游戏&amp;工具盒</h1>
        <p>一起玩，一起学。更多游戏和工具正在路上。</p>
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

      <footer className="home-foot">© 中预三班 · 由班主任亲手搭建</footer>
    </div>
  );
}

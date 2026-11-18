import React, { useEffect, useState } from 'react';
import { usePollingMatch } from '../net/usePollingMatch.js';

const GAME_NAMES = { bomb: '炸弹人大赛', gomoku: '五子棋大赛', racing: '赛车大赛' };
const STATUS_TEXT = { coding: '编写代码中', ready: '准备中', playing: '对局中', finished: '已结束' };

/**
 * 轮询式联机面板（不需要任何常驻服务）：
 * 创建/加入对战号 → 双方编写代码并准备 → 服务端记录回合数 → 对局结束写入结果。
 */
export default function PollingMatch({ game = 'bomb', me, onOpenGame }) {
  const m = usePollingMatch(game);
  const [code, setCode] = useState('');
  const [src, setSrc] = useState('');
  const [list, setList] = useState([]);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      const r = await import('../cloud.js').then(({ callAuth }) => callAuth('matchList', { game }));
      if (alive && r.ok) setList(r.matches || []);
    };
    load();
    const t = setInterval(load, 5000);
    return () => { alive = false; clearInterval(t); };
  }, [game]);

  const isOwner = m.match && m.match.p1 === me;
  const isP2 = m.match && m.match.p2 === me;

  if (!m.match) {
    return (
      <section className="polling-card">
        <h2>🌐 联机对战（轮询模式）</h2>
        <p className="muted small">
          不需要任何服务器：对局状态存在云端数据库，双方各自轮询同步。
        </p>

        <div className="row">
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="对战号（3–10 位字母数字）"
            aria-label="对战号"
          />
          <button className="btn-primary" disabled={!code || m.busy} onClick={() => m.create(code)}>创建</button>
          <button className="btn-small" disabled={!code || m.busy} onClick={() => m.join(code)}>加入</button>
        </div>

        {m.error && <div className="errors">{m.error}</div>}

        <h3 className="section-title">进行中的对战</h3>
        {list.length === 0 && <p className="muted small">还没有对战。</p>}
        <div className="match-list">
          {list.map((x) => (
            <div key={x.code} className="match-item">
              <div>
                <b>{x.code}</b>
                <span className="muted small"> · {GAME_NAMES[x.game] || x.game} · {STATUS_TEXT[x.status]}</span>
              </div>
              <div className="match-players">
                <span>{x.p1}</span>
                <span className="vs">vs</span>
                <span>{x.p2 || '等待加入'}</span>
              </div>
              <button className="btn-small" onClick={() => m.join(x.code)}>加入</button>
            </div>
          ))}
        </div>
      </section>
    );
  }

  const match = m.match;
  const bothReady = match.p1Ready && match.p2Ready;

  return (
    <section className="polling-card">
      <div className="polling-head">
        <h2>对战号 {match.code}</h2>
        <span className={`room-status s-${match.status === 'playing' ? 'playing' : 'open'}`}>
          {STATUS_TEXT[match.status]}
        </span>
        <button className="btn-small" onClick={m.leave}>离开</button>
      </div>

      <div className="match-players">
        <span className={match.p1Ready ? 'ready' : ''}>{match.p1}{match.p1Ready && ' ✅'}</span>
        <span className="vs">vs</span>
        <span className={match.p2Ready ? 'ready' : ''}>{match.p2 || '等待加入…'}{match.p2Ready && ' ✅'}</span>
      </div>

      {m.error && <div className="errors">{m.error}</div>}

      {match.status === 'coding' && (
        <>
          <label>你的代码（提交后双方都点「准备」即可开始）</label>
          <textarea
            value={src}
            onChange={(e) => setSrc(e.target.value)}
            rows={8}
            placeholder="在这里粘贴你的程序…"
          />
          <div className="row">
            <button className="btn-small" onClick={() => m.submitCode(src)}>提交代码</button>
            <button className="btn-primary" onClick={() => m.setReady(true)}>✅ 准备</button>
          </div>
        </>
      )}

      {bothReady && match.p2 && (
        <p className="ok-line">双方已就绪，可以开始对局了。</p>
      )}

      {match.status === 'playing' && (
        <div className="turn-box">
          <p>当前回合：<b>{match.turns}</b></p>
          <div className="row">
            <button className="btn-small" onClick={() => m.advance(1)}>推进 1 回合</button>
            <button className="btn-small" onClick={() => m.advance(5)}>推进 5 回合</button>
            <button className="btn-small" onClick={() => m.finish(isOwner ? 'player1 win' : 'player2 win')}>结束对局</button>
          </div>
          <p className="muted small">
            两人都会推进，服务端用乐观锁保证只有一个生效，不会重复计算。
          </p>
        </div>
      )}

      {match.status === 'finished' && (
        <p className="result-line">对局结束：{match.result || '（无结果）'}</p>
      )}

      {onOpenGame && (
        <button className="btn-small" onClick={() => onOpenGame(match)}>在游戏页面继续</button>
      )}
    </section>
  );
}

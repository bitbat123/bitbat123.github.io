import React, { useCallback, useEffect, useState } from 'react';
import { callAuth } from '../cloud.js';

/** 房间内部：显示成员、房主可以批准/拒绝、可以离开 */
export default function RoomView({ room, me, onLeave }) {
  const [members, setMembers] = useState([]);
  const [err, setErr] = useState(null);
  const [msg, setMsg] = useState(null);

  const isOwner = room.owner === me;

  const load = useCallback(async () => {
    try {
      const r = await callAuth('roomMembers', { code: room.code });
      if (r.ok) setMembers(r.members || []);
      else setErr(r.message);
    } catch (e) { setErr(e.message); }
  }, [room.code]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const t = setInterval(load, 4000);
    return () => clearInterval(t);
  }, [load]);

  const approve = async (username) => {
    setMsg(null);
    setErr(null);
    try {
      const r = await callAuth('roomApprove', { code: room.code, username });
      if (r.ok) { setMsg(`${username} 已加入（${r.seat === 'player1' ? '玩家1' : '玩家2'}）`); load(); }
      else setErr(r.message);
    } catch (e) { setErr(e.message); }
  };

  const leave = async () => {
    try { await callAuth('roomLeave', { code: room.code }); } catch {}
    onLeave();
  };

  return (
    <section className="room-view">
      <div className="room-view-head">
        <div>
          <h2>🏠 房间 {room.code}</h2>
          <span className="muted small">你是{room.seat === 'player1' ? '玩家 1' : '玩家 2'} · 房主 {room.owner}</span>
        </div>
        <button className="btn-small" onClick={leave}>离开房间</button>
      </div>

      {err && <div className="errors">{err}</div>}
      {msg && <div className="ok-line">{msg}</div>}

      <div className="room-members">
        <h3>成员（{members.length}/2）</h3>
        <ul>
          {members.map((m) => (
            <li key={m.username}>
              <b>{m.username}</b>
              <span className="muted small"> · {m.seat === 'player1' ? '玩家1' : '玩家2'}</span>
              {m.username === room.owner && <span className="room-title"> 房主</span>}
            </li>
          ))}
          {members.length === 0 && <li className="muted small">还没有成员</li>}
        </ul>
      </div>

      {isOwner && (
        <div className="room-approve">
          <h3>房主批准加入</h3>
          <p className="muted small">没有设密钥的玩家需要你批准。输入用户名后点同意。</p>
          <ApproveBox onApprove={approve} />
        </div>
      )}

      <p className="muted small">
        提示：这个房间用于协调双方进入同一个游戏实例。对局本身请在游戏页面里用相同房间号开始。
      </p>
    </section>
  );
}

function ApproveBox({ onApprove }) {
  const [name, setName] = useState('');
  return (
    <div className="row">
      <input value={name} onChange={(e) => setName(e.target.value)} placeholder="待批准的用户名" aria-label="待批准用户名" />
      <button className="btn-small" disabled={!name.trim()} onClick={() => { onApprove(name.trim()); setName(''); }}>
        同意
      </button>
    </div>
  );
}

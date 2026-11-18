import React, { useCallback, useEffect, useState } from 'react';
import { callAuth } from '../cloud.js';

const GAME_NAMES = {
  bomb: '炸弹人大赛',
  gomoku: '五子棋大赛',
  racing: '赛车大赛',
  'class-sim': '班主任模拟器',
};

/** 房间大厅：查看所有房间、创建房间（可设密钥）、加入房间 */
export default function RoomLobby({ me, game, onEnter }) {
  const [rooms, setRooms] = useState([]);
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  const [joinCode, setJoinCode] = useState('');
  const [joinKey, setJoinKey] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState({ code: '', title: '', passKey: '' });

  const load = useCallback(async () => {
    try {
      const r = await callAuth('roomList', game ? { game } : {});
      if (r.ok) setRooms(r.rooms || []);
      else setErr(r.message);
    } catch (e) { setErr(e.message); }
  }, [game]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, [load]);

  const randomCode = () => Math.random().toString(36).slice(2, 7).toUpperCase();

  const create = async () => {
    setErr(null);
    setBusy(true);
    try {
      const r = await callAuth('roomCreate', {
        game: game || 'class-sim',
        code: (form.code || randomCode()).toUpperCase(),
        title: form.title,
        passKey: form.passKey,
      });
      if (!r.ok) { setErr(r.message); return; }
      onEnter({ code: r.room.code, seat: 'player1', owner: me });
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };

  const join = async (code, key) => {
    setErr(null);
    setBusy(true);
    try {
      const r = await callAuth('roomJoin', { code: String(code).toUpperCase(), passKey: key || '' });
      if (!r.ok) { setErr(r.message); return; }
      onEnter({ code: r.room.code, seat: r.seat, owner: r.room.owner });
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };

  return (
    <section className="lobby">
      <div className="lobby-head">
        <h2>🎮 联机房间大厅</h2>
        <div className="lobby-actions">
          <button className="btn-small" onClick={load}>刷新</button>
          <button className="btn-primary" onClick={() => setCreateOpen((v) => !v)}>
            {createOpen ? '取消创建' : '＋ 创建房间'}
          </button>
        </div>
      </div>

      {err && <div className="errors">{err}</div>}

      {createOpen && (
        <div className="create-box">
          <label>房间号（3–10 位字母或数字）</label>
          <div className="row">
            <input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} placeholder={randomCode()} />
            <button className="btn-small" onClick={() => setForm({ ...form, code: randomCode() })}>随机</button>
          </div>
          <label>房间名（可选）</label>
          <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          <label>密钥（可选，设了密钥就不用房主批准）</label>
          <input value={form.passKey} onChange={(e) => setForm({ ...form, passKey: e.target.value })} placeholder="留空则需房主批准" />
          <button className="btn-primary" disabled={busy} onClick={create}>创建并进入</button>
        </div>
      )}

      <div className="join-box-inline">
        <input value={joinCode} onChange={(e) => setJoinCode(e.target.value.toUpperCase())} placeholder="房间号" aria-label="房间号" />
        <input value={joinKey} onChange={(e) => setJoinKey(e.target.value)} placeholder="密钥（有则填）" aria-label="密钥" />
        <button className="btn-small" disabled={!joinCode || busy} onClick={() => join(joinCode, joinKey)}>加入</button>
      </div>

      <div className="room-list">
        {rooms.length === 0 && <p className="muted small">还没有房间，创建一个吧。</p>}
        {rooms.map((r) => (
          <div key={r.id} className="room-item">
            <div className="room-info">
              <b>{r.code}</b>
              {r.title && <span className="room-title">{r.title}</span>}
              <span className="muted small">
                {GAME_NAMES[r.game] || r.game} · 房主 {r.owner} · {r.members}/2 人
                {r.locked && ' · 🔒 需要密钥'}
              </span>
            </div>
            <div className="room-item-actions">
              <span className={`room-status s-${r.status}`}>
                {r.status === 'open' ? '等待中' : r.status === 'playing' ? '游戏中' : '已结束'}
              </span>
              {r.owner === me ? (
                <button className="btn-small" onClick={() => onEnter({ code: r.code, seat: 'player1', owner: me })}>进入</button>
              ) : (
                <button className="btn-small" disabled={busy} onClick={() => join(r.code, '')}>申请加入</button>
              )}
            </div>
          </div>
        ))}
      </div>

      <p className="muted small">
        无密钥的房间：房主批准后即可进入（房主可在房间里点「同意」）。
        有密钥的房间：密钥正确直接进入。
      </p>
    </section>
  );
}

import React, { useCallback, useEffect, useState } from 'react';
import { callAuth, getToken } from '../cloud.js';

/** 管理员审核面板：仅管理员账号可见，用于通过 / 拒绝待审核的注册申请 */
export default function AdminPanel({ onCountChange }) {
  const [users, setUsers] = useState([]);
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await callAuth('listPending', { token: getToken() });
      if (r.ok) {
        setUsers(r.users || []);
        onCountChange?.(r.users?.length || 0);
      } else {
        setMsg({ type: 'err', text: r.message });
      }
    } catch (e) {
      setMsg({ type: 'err', text: '加载失败：' + e.message });
    }
  }, [onCountChange]);

  useEffect(() => { load(); }, [load]);

  const review = async (username, decision) => {
    setBusy(true);
    setMsg(null);
    try {
      const r = await callAuth('review', { token: getToken(), username, decision });
      if (r.ok) {
        setMsg({ type: 'ok', text: `${username}：${r.message}` });
        await load();
      } else {
        setMsg({ type: 'err', text: r.message });
      }
    } catch (e) {
      setMsg({ type: 'err', text: '操作失败：' + e.message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="admin-card">
      <div className="admin-head">
        <h2>🛠 管理员审核</h2>
        <button className="btn-mini" onClick={load} disabled={busy}>刷新</button>
      </div>

      {msg && <div className={`auth-msg ${msg.type}`}>{msg.text}</div>}

      {users.length === 0 ? (
        <p className="muted small">暂无待审核的注册申请。</p>
      ) : (
        <ul className="admin-list">
          {users.map((u) => (
            <li key={u.username} className="admin-item">
              <div>
                <b>{u.username}</b>
                <small className="muted">学号 {u.studentId}</small>
                {u.note && <small className="admin-note">备注：{u.note}</small>}
              </div>
              <div className="admin-actions">
                <button className="btn-approve" disabled={busy} onClick={() => review(u.username, 'approve')}>通过</button>
                <button className="btn-reject" disabled={busy} onClick={() => review(u.username, 'reject')}>拒绝</button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

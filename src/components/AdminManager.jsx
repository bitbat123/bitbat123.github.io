import React, { useCallback, useEffect, useState } from 'react';
import { callAuth } from '../cloud.js';

/**
 * 管理员管理面板（仅超级管理员可见）：
 * - 查看所有管理员
 * - 添加 / 删除管理员、调整角色
 * - 同时展示待审核注册申请（管理员共同审核）
 */
export default function AdminManager({ me }) {
  const [admins, setAdmins] = useState([]);
  const [pending, setPending] = useState([]);
  const [who, setWho] = useState(null);
  const [name, setName] = useState('');
  const [role, setRole] = useState('admin');
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const w = await callAuth('adminWhoAmI', {});
    setWho(w);
    if (!w.ok || !w.isAdmin) return;
    const l = await callAuth('adminList', {});
    if (l.ok) setAdmins(l.admins || []);
    const p = await callAuth('listPending', {});
    if (p.ok) setPending(p.users || []);
    else setMsg({ type: 'err', text: p.message });
  }, []);

  useEffect(() => { load(); }, [load]);

  const doAdd = async () => {
    if (!name.trim()) return;
    setBusy(true);
    setMsg(null);
    try {
      const r = await callAuth('adminAdd', { username: name.trim(), role });
      if (r.ok) { setAdmins(r.admins || []); setName(''); setMsg({ type: 'ok', text: `已添加 ${name.trim()}` }); }
      else setMsg({ type: 'err', text: r.message });
    } finally { setBusy(false); }
  };

  const doRemove = async (username) => {
    setBusy(true);
    setMsg(null);
    try {
      const r = await callAuth('adminRemove', { username });
      if (r.ok) { setAdmins(r.admins || []); setMsg({ type: 'ok', text: `已移除 ${username}` }); }
      else setMsg({ type: 'err', text: r.message });
    } finally { setBusy(false); }
  };

  const doSetRole = async (username, newRole) => {
    setBusy(true);
    setMsg(null);
    try {
      const r = await callAuth('adminSetRole', { username, role: newRole });
      if (r.ok) { setAdmins(r.admins || []); setMsg({ type: 'ok', text: `${username} 已设为 ${newRole}` }); }
      else setMsg({ type: 'err', text: r.message });
    } finally { setBusy(false); }
  };

  const review = async (username, decision) => {
    setBusy(true);
    try {
      const r = await callAuth('review', { username, decision });
      if (r.ok) { setMsg({ type: 'ok', text: `${username}：${r.message}` }); load(); }
      else setMsg({ type: 'err', text: r.message });
    } finally { setBusy(false); }
  };

  if (!who) return <section className="admin-card"><p className="muted small">加载中…</p></section>;
  if (!who.isAdmin) return null;

  return (
    <>
      <section className="admin-card">
        <div className="admin-head">
          <h2>🛠 管理员</h2>
          <span className="muted small">
            你：{who.username} · {who.isSuper ? '超级管理员' : '管理员'}
          </span>
        </div>

        {msg && <div className={msg.type === 'ok' ? 'ok-line' : 'errors'}>{msg.text}</div>}

        {who.isSuper && (
          <div className="admin-add">
            <h3>添加管理员</h3>
            <div className="row">
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="用户名（须已注册）" aria-label="新管理员用户名" />
              <select value={role} onChange={(e) => setRole(e.target.value)} aria-label="角色">
                <option value="admin">管理员</option>
                <option value="super">超级管理员</option>
              </select>
              <button className="btn-small" disabled={busy || !name.trim()} onClick={doAdd}>添加</button>
            </div>
          </div>
        )}

        <h3 className="section-title">管理员列表（{admins.length}）</h3>
        <ul className="admin-list">
          {admins.map((a) => (
            <li key={a.username} className="admin-item">
              <div>
                <b>{a.username}</b>
                <span className={`role-tag ${a.role === 'super' ? 'super' : ''}`}>
                  {a.role === 'super' ? '超级管理员' : '管理员'}
                </span>
                {a.grantedBy && <small className="muted"> 由 {a.grantedBy} 授予</small>}
              </div>
              {who.isSuper && a.role !== 'super' && (
                <div className="admin-actions">
                  <button className="btn-small" disabled={busy} onClick={() => doSetRole(a.username, 'super')}>升为超管</button>
                  <button className="btn-reject" disabled={busy} onClick={() => doRemove(a.username)}>移除</button>
                </div>
              )}
            </li>
          ))}
        </ul>

        <h3 className="section-title">待审核注册（{pending.length}）</h3>
        {pending.length === 0 ? (
          <p className="muted small">暂无待审核的注册申请。</p>
        ) : (
          <ul className="admin-list">
            {pending.map((u) => (
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
    </>
  );
}

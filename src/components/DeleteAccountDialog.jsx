import React, { useState } from 'react';
import { callAuth, getToken } from '../cloud.js';

/** 注销账号确认框：需要输入密码 + 勾选确认，注销后账号数据被删除且无法恢复 */
export default function DeleteAccountDialog({ username, onCancel, onDone }) {
  const [password, setPassword] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);

  const submit = async () => {
    setMsg(null);
    setBusy(true);
    try {
      const r = await callAuth('deleteAccount', { token: getToken(), password });
      if (r.ok) {
        onDone();
      } else {
        setMsg({ type: 'err', text: r.message });
      }
    } catch (e) {
      setMsg({ type: 'err', text: '网络或服务异常：' + e.message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="dialog-mask">
      <div className="dialog card">
        <h2>注销账号</h2>
        <p className="muted small">
          将永久删除账号「{username}」及其注册信息，无法恢复。注销后学号会被释放，可重新注册。
        </p>

        <label>请输入密码确认</label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
          disabled={busy}
        />

        <label className="check">
          <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} disabled={busy} />
          我已了解注销不可恢复
        </label>

        {msg && <div className={`auth-msg ${msg.type}`}>{msg.text}</div>}

        <div className="dialog-actions">
          <button className="btn-mini" onClick={onCancel} disabled={busy}>取消</button>
          <button
            className="btn-reject"
            onClick={submit}
            disabled={busy || !confirmed || !password}
          >
            {busy ? '注销中…' : '确认注销'}
          </button>
        </div>
      </div>
    </div>
  );
}

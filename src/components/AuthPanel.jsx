import React, { useState } from 'react';
import { callAuth, saveToken } from '../cloud.js';

// 登录 / 注册开关：设为 false 可临时停用登录（控件变灰），只保留游客入口。
const DISABLE_AUTH = false;

/**
 * 登录 / 注册面板：注册需管理员审核，审核通过后方可登录。
 * onLogin(user)：登录成功回调；onGuest()：选择免登录游玩（仅单机）。
 */
export default function AuthPanel({ onLogin, onGuest }) {
  const [mode, setMode] = useState('login'); // login | register
  const [username, setUsername] = useState('');
  const [studentId, setStudentId] = useState('');
  const [note, setNote] = useState('');
  const [password, setPassword] = useState('');
  const [password2, setPassword2] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null); // { type: 'ok' | 'err', text }

  const submit = async (e) => {
    e.preventDefault();
    setMsg(null);
    if (mode === 'register' && password !== password2) {
      setMsg({ type: 'err', text: '两次输入的密码不一致' });
      return;
    }
    setBusy(true);
    try {
      if (mode === 'register') {
        const r = await callAuth('register', { username, studentId, password, note });
        if (r.ok) {
          setMsg({ type: 'ok', text: r.message });
          setMode('login');
          setPassword(''); setPassword2(''); setNote('');
        } else setMsg({ type: 'err', text: r.message });
      } else {
        const r = await callAuth('login', { username, password });
        if (r.ok) {
          saveToken(r.token);
          onLogin({ username: r.username, studentId: r.studentId });
        } else setMsg({ type: 'err', text: r.message });
      }
    } catch (err) {
      setMsg({ type: 'err', text: '网络或服务异常：' + err.message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth-wrap">
      <form className="auth-card" onSubmit={submit}>
        <div className="auth-hero">
          <div className="auth-logo">🎮</div>
          <h2>{mode === 'login' ? '登录' : '注册账号'}</h2>
          <p>{mode === 'login' ? '欢迎回来' : '注册后需管理员审核通过才能登录'}</p>
        </div>

        <label>用户名</label>
        <input value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" required disabled={DISABLE_AUTH} />

        {mode === 'register' && (
          <>
            <label>学号（必须是真实的，否则无视）</label>
            <input value={studentId} onChange={(e) => setStudentId(e.target.value)} placeholder="如 17" required disabled={DISABLE_AUTH} />
            <label>备注（可选）</label>
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="想告诉管理员的话"
              maxLength={100}
              disabled={DISABLE_AUTH}
            />
          </>
        )}

        <label>密码</label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
          required
          disabled={DISABLE_AUTH}
        />

        {mode === 'register' && (
          <>
            <label>再次输入密码</label>
            <input
              type="password"
              value={password2}
              onChange={(e) => setPassword2(e.target.value)}
              autoComplete="new-password"
              required
              disabled={DISABLE_AUTH}
            />
          </>
        )}

        {msg && <div className={`auth-msg ${msg.type}`}>{msg.text}</div>}

        <button className="auth-btn" disabled={busy || DISABLE_AUTH}>
          {busy ? '请稍候…' : mode === 'login' ? '登录' : '提交注册'}
        </button>

        <button
          type="button"
          className="auth-switch"
          disabled={DISABLE_AUTH}
          onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setMsg(null); }}
        >
          {mode === 'login' ? '没有账号？去注册' : '已有账号？去登录'}
        </button>
        {DISABLE_AUTH && <small className="muted center">登录功能维护中，暂不可用</small>}

        <div className="auth-divider"><span>或</span></div>

        <button type="button" className="auth-guest" onClick={onGuest}>
          🎮 免登录游玩（仅单机模式）
        </button>
        <small className="muted center">登录后可解锁联机模式（以后开放）</small>
      </form>
    </div>
  );
}

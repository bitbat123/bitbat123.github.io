import React, { useCallback, useEffect, useRef, useState } from 'react';
import { callAuth } from '../cloud.js';
import { renderMarkdown } from '../markdown.js';

const POLL_MS = 2000;

/** 把纯文本转成安全的 HTML（只转义 + 保留换行） */
function plainToHtml(text) {
  const esc = String(text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
  return esc.replace(/\n/g, '<br>');
}

/**
 * 聊天室侧边栏：右下角悬浮按钮开合。
 * - 公共频道 + 私聊
 * - 每条消息显示发送者与时间
 * - 发送前可选 Markdown / 纯文本
 * - Enter 换行，Ctrl+Enter 发送
 */
export default function ChatSidebar({ me }) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState('public');   // 'public' | 用户名
  const [messages, setMessages] = useState([]);
  const [body, setBody] = useState('');
  const [format, setFormat] = useState('markdown');
  const [peers, setPeers] = useState([]);
  const [peerInput, setPeerInput] = useState('');
  const [err, setErr] = useState(null);
  const [unread, setUnread] = useState(0);
  const lastIdRef = useRef(0);
  const listRef = useRef(null);

  // 可私聊的成员
  useEffect(() => {
    callAuth('listMembers')
      .then((r) => { if (r.ok) setPeers((r.users || []).filter((u) => u.username !== me)); })
      .catch(() => {});
  }, [me]);

  const fetchMessages = useCallback(async (reset = false) => {
    try {
      const payload = reset ? {} : { after: lastIdRef.current };
      if (mode !== 'public') payload.to = mode;
      const r = await callAuth('chatFetch', payload);
      if (!r.ok) { setErr(r.message); return; }
      setErr(null);
      const list = r.messages || [];
      if (reset) {
        lastIdRef.current = 0;
        setMessages(list);
      } else if (list.length) {
        setMessages((m) => [...m, ...list]);
        if (!open) setUnread((n) => n + list.filter((x) => x.sender !== me).length);
      }
      const last = list[list.length - 1];
      if (last) lastIdRef.current = Math.max(lastIdRef.current, Number(last.id));
    } catch (e) {
      setErr(e.message);
    }
  }, [mode, open, me]);

  // 切换频道时重置
  useEffect(() => {
    setMessages([]);
    lastIdRef.current = 0;
    setErr(null);
    fetchMessages(true);
  }, [mode]); // eslint-disable-line react-hooks/exhaustive-deps

  // 轮询
  useEffect(() => {
    const t = setInterval(() => fetchMessages(false), POLL_MS);
    return () => clearInterval(t);
  }, [fetchMessages]);

  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [messages.length, open]);

  const send = async () => {
    const text = body;
    if (!text.trim()) return;
    setErr(null);
    try {
      const r = await callAuth('chatSend', {
        body: text,
        format,
        ...(mode === 'public' ? {} : { to: mode }),
      });
      if (!r.ok) { setErr(r.message); return; }
      setBody('');
      lastIdRef.current = 0;
      await fetchMessages(true);
    } catch (e) {
      setErr(e.message);
    }
  };

  // Enter 换行；Ctrl/Cmd+Enter 发送；输入法组合中不发送
  const onKeyDown = (e) => {
    if (e.key !== 'Enter') return;
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      if (!e.nativeEvent.isComposing) send();
    }
  };

  if (!open) {
    return (
      <button className="chat-fab" onClick={() => { setOpen(true); setUnread(0); }} title="打开聊天室">
        <span>💬</span>
        <span className="chat-fab-text">聊天室</span>
        {unread > 0 && <span className="chat-fab-badge">{unread > 99 ? '99+' : unread}</span>}
      </button>
    );
  }

  return (
    <aside className="chat-sidebar" aria-label="聊天室">
      <header className="chat-sidebar-head">
        <h3>💬 聊天室</h3>
        <button className="chat-close" onClick={() => setOpen(false)} aria-label="收起聊天室">×</button>
      </header>

      <div className="chat-tabs">
        <button className={mode === 'public' ? 'on' : ''} onClick={() => setMode('public')}>🌐 公共</button>
        <select
          value={mode === 'public' ? '' : mode}
          onChange={(e) => setMode(e.target.value || 'public')}
          aria-label="选择私聊对象"
        >
          <option value="">私聊…</option>
          {peers.map((u) => <option key={u.username} value={u.username}>{u.username}</option>)}
        </select>
      </div>

      {mode !== 'public' && (
        <div className="chat-with">🔒 与 <b>{mode}</b> 私聊</div>
      )}

      <div className="chat-msgs" ref={listRef}>
        {messages.length === 0 && <div className="muted small">还没有消息。</div>}
        {messages.map((m) => (
          <div key={m.id} className={`chat-msg ${m.sender === me ? 'mine' : ''}`}>
            <div className="chat-meta">
              <b>{m.sender}</b>
              <span className="muted small">
                {m.format === 'plain' && <em className="chat-plain-tag">纯文本</em>}
                {m.at ? new Date(Number(m.at)).toLocaleTimeString('zh-CN', { hour12: false }) : ''}
              </span>
            </div>
            <div
              className="chat-text"
              dangerouslySetInnerHTML={{ __html: m.format === 'plain' ? plainToHtml(m.body) : renderMarkdown(m.body) }}
            />
          </div>
        ))}
      </div>

      {err && <div className="chat-err">{err}</div>}

      <div className="chat-format">
        <label>
          <input type="radio" checked={format === 'markdown'} onChange={() => setFormat('markdown')} />
          Markdown
        </label>
        <label>
          <input type="radio" checked={format === 'plain'} onChange={() => setFormat('plain')} />
          纯文本
        </label>
      </div>

      <div className="chat-input">
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={format === 'markdown' ? 'Markdown。Enter 换行，Ctrl+Enter 发送' : '纯文本。Enter 换行，Ctrl+Enter 发送'}
          rows={3}
        />
        <button className="btn-primary" onClick={send} disabled={!body.trim()}>发送</button>
      </div>
      <small className="muted">Enter 换行 · Ctrl+Enter 发送</small>
    </aside>
  );
}

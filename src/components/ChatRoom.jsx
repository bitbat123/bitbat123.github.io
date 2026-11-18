import React, { useEffect, useRef, useState, useCallback } from 'react';
import { callAuth } from '../cloud.js';
import { renderMarkdown } from '../markdown.js';

const POLL_MS = 2000;

/** 聊天室：公共频道 + 私聊，Markdown 渲染，Enter 换行 / Ctrl+Enter 发送 */
export default function ChatRoom({ me }) {
  const [mode, setMode] = useState('public');  // 'public' | 用户名
  const [messages, setMessages] = useState([]);
  const [body, setBody] = useState('');
  const [peers, setPeers] = useState([]);
  const [peerInput, setPeerInput] = useState('');
  const [err, setErr] = useState(null);
  const lastIdRef = useRef(0);
  const listRef = useRef(null);
  const taRef = useRef(null);

  // 从成员名单里取可以私聊的人
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
      if (reset) {
        lastIdRef.current = 0;
        setMessages(r.messages || []);
      } else if (r.messages?.length) {
        setMessages((m) => [...m, ...r.messages]);
      }
      const last = (r.messages || []).at(-1);
      if (last) lastIdRef.current = Math.max(lastIdRef.current, last.id);
    } catch (e) {
      setErr(e.message);
    }
  }, [mode]);

  // 切换频道时重置
  useEffect(() => {
    setMessages([]);
    lastIdRef.current = 0;
    setErr(null);
    fetchMessages(true);
  }, [mode, fetchMessages]);

  // 轮询
  useEffect(() => {
    const t = setInterval(() => fetchMessages(false), POLL_MS);
    return () => clearInterval(t);
  }, [fetchMessages]);

  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [messages.length]);

  const send = async () => {
    const text = body;
    if (!text.trim()) return;
    setErr(null);
    try {
      const r = await callAuth('chatSend', {
        body: text,
        ...(mode === 'public' ? {} : { to: mode }),
      });
      if (!r.ok) { setErr(r.message); return; }
      setBody('');
      lastIdRef.current = 0;
      fetchMessages(true);
    } catch (e) {
      setErr(e.message);
    }
  };

  // Enter 换行，Ctrl+Enter 发送；输入法组合期间不发送
  const onKeyDown = (e) => {
    if (e.key !== 'Enter') return;
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      if (!e.nativeEvent.isComposing) send();
    }
    // 普通 Enter 不做任何处理，交给 textarea 换行
  };

  return (
    <section className="chat-card">
      <div className="chat-head">
        <h2>💬 聊天室</h2>
        <span className="muted small">Enter 换行 · Ctrl+Enter 发送</span>
      </div>

      <div className="chat-body">
        <aside className="chat-side">
          <button
            className={`chat-channel ${mode === 'public' ? 'on' : ''}`}
            onClick={() => setMode('public')}
          >
            🌐 公共频道
          </button>

          <div className="chat-side-title">私聊</div>
          <div className="chat-peers">
            {peers.length === 0 && <span className="muted small">还没有其他成员</span>}
            {peers.map((u) => (
              <button
                key={u.username}
                className={`chat-peer ${mode === u.username ? 'on' : ''}`}
                onClick={() => setMode(u.username)}
              >
                {u.username}
              </button>
            ))}
          </div>

          <div className="chat-peer-add">
            <input
              value={peerInput}
              onChange={(e) => setPeerInput(e.target.value)}
              placeholder="用户名"
              aria-label="私聊对象"
            />
            <button className="btn-small" onClick={() => { if (peerInput.trim()) setMode(peerInput.trim()); }}>
              私聊
            </button>
          </div>
        </aside>

        <div className="chat-main">
          <div className="chat-title">
            {mode === 'public' ? '🌐 公共频道（所有人可见）' : `🔒 与 ${mode} 的私聊`}
          </div>

          <div className="chat-list" ref={listRef}>
            {messages.length === 0 && <div className="muted small">还没有消息。</div>}
            {messages.map((m) => (
              <div key={m.id} className={`chat-msg ${m.sender === me ? 'mine' : ''}`}>
                <div className="chat-meta">
                  <b>{m.sender}</b>
                  <span className="muted small">{new Date(m.at).toLocaleTimeString('zh-CN', { hour12: false })}</span>
                </div>
                <div className="chat-text" dangerouslySetInnerHTML={{ __html: renderMarkdown(m.body) }} />
              </div>
            ))}
          </div>

          {err && <div className="errors">{err}</div>}

          <div className="chat-input">
            <textarea
              ref={taRef}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="Markdown 可用。Enter 换行，Ctrl+Enter 发送"
              rows={3}
            />
            <button className="btn-primary" onClick={send} disabled={!body.trim()}>发送</button>
          </div>
        </div>
      </div>
    </section>
  );
}

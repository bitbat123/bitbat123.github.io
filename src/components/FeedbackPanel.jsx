import React, { useCallback, useEffect, useState } from 'react';
import { callAuth } from '../cloud.js';

const GAME_NAMES = {
  home: '主页',
  'class-teacher': '班主任模拟器',
  bomb: '炸弹人大赛',
  gomoku: '五子棋大赛',
  racing: '赛车大赛',
  chat: '聊天室',
};
const STATUS_TEXT = { new: '待处理', read: '已读', done: '已处理', rejected: '不处理' };
const STATUS_COLOR = { new: '#fbbf24', read: '#94a3b8', done: '#22c55e', rejected: '#ef4444' };

/**
 * 反馈面板：
 * - 所有人可提交反馈（game 区分来自哪个页面）
 * - 管理员可查看全部反馈并标记处理 / 回复
 * 以右下角悬浮按钮打开侧边抽屉。
 */
export default function FeedbackPanel({ game = 'home', me, isAdmin }) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState('write');   // write | mine | all
  const [body, setBody] = useState('');
  const [contact, setContact] = useState('');
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);
  const [mine, setMine] = useState([]);
  const [all, setAll] = useState([]);
  const [replyFor, setReplyFor] = useState(null);
  const [replyText, setReplyText] = useState('');

  const loadMine = useCallback(async () => {
    if (!me) return;
    const r = await callAuth('feedbackMy', {});
    if (r.ok) setMine(r.items || []);
  }, [me]);

  const loadAll = useCallback(async () => {
    if (!isAdmin) return;
    const r = await callAuth('feedbackList', {});
    if (r.ok) setAll(r.items || []);
  }, [isAdmin]);

  useEffect(() => {
    if (!open) return;
    if (tab === 'mine') loadMine();
    if (tab === 'all' && isAdmin) loadAll();
  }, [open, tab, isAdmin, loadMine, loadAll]);

  const submit = async () => {
    if (!body.trim() || busy) return;
    setBusy(true);
    setMsg(null);
    try {
      const r = await callAuth('feedbackAdd', { game, body, contact });
      if (r.ok) {
        setMsg({ type: 'ok', text: '感谢反馈！已收到。' });
        setBody('');
        setContact('');
        loadMine();
      } else {
        setMsg({ type: 'err', text: r.message });
      }
    } catch (e) {
      setMsg({ type: 'err', text: e.message });
    } finally {
      setBusy(false);
    }
  };

  const review = async (item, status) => {
    setBusy(true);
    try {
      const r = await callAuth('feedbackReview', { id: item.id, status, reply: replyText });
      if (r.ok) {
        setMsg({ type: 'ok', text: `#${item.id} 已标记为「${STATUS_TEXT[status]}」` });
        setReplyFor(null);
        setReplyText('');
        loadAll();
      } else {
        setMsg({ type: 'err', text: r.message });
      }
    } finally {
      setBusy(false);
    }
  };

  if (!me) return null;

  if (!open) {
    return (
      <button className="feedback-fab" onClick={() => setOpen(true)} title="反馈与建议">
        <span>📮</span>
        <span className="feedback-fab-text">反馈</span>
      </button>
    );
  }

  return (
    <aside className="feedback-drawer" aria-label="反馈">
      <header className="feedback-head">
        <h3>📮 反馈与建议</h3>
        <button className="chat-close" onClick={() => setOpen(false)} aria-label="关闭">×</button>
      </header>

      <div className="feedback-tabs">
        <button className={tab === 'write' ? 'on' : ''} onClick={() => setTab('write')}>写反馈</button>
        <button className={tab === 'mine' ? 'on' : ''} onClick={() => setTab('mine')}>我的</button>
        {isAdmin && <button className={tab === 'all' ? 'on' : ''} onClick={() => setTab('all')}>管理</button>}
      </div>

      {msg && <div className={msg.type === 'ok' ? 'ok-line' : 'errors'}>{msg.text}</div>}

      {tab === 'write' && (
        <div className="feedback-write">
          <p className="muted small">来自：{GAME_NAMES[game] || game}</p>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={7}
            maxLength={2000}
            placeholder="遇到什么问题？想要什么功能？"
          />
          <input
            value={contact}
            onChange={(e) => setContact(e.target.value)}
            maxLength={100}
            placeholder="联系方式（可选）"
            aria-label="联系方式"
          />
          <div className="feedback-actions">
            <span className="muted small">{body.length} / 2000</span>
            <button className="btn-primary" onClick={submit} disabled={!body.trim() || busy}>
              {busy ? '提交中…' : '提交反馈'}
            </button>
          </div>
        </div>
      )}

      {tab === 'mine' && (
        <div className="feedback-list">
          {mine.length === 0 && <p className="muted small">还没有提交过反馈。</p>}
          {mine.map((f) => (
            <div key={f.id} className="feedback-item">
              <div className="feedback-item-head">
                <span className="feedback-status" style={{ color: STATUS_COLOR[f.status] }}>
                  {STATUS_TEXT[f.status]}
                </span>
                <span className="muted small">#{f.id} · {GAME_NAMES[f.game] || f.game} · {new Date(f.at).toLocaleString('zh-CN', { hour12: false })}</span>
              </div>
              <div className="feedback-body">{f.body}</div>
              {f.reply && <div className="feedback-reply">回复：{f.reply}</div>}
            </div>
          ))}
        </div>
      )}

      {tab === 'all' && isAdmin && (
        <div className="feedback-list">
          <button className="btn-small" onClick={loadAll}>刷新</button>
          {all.length === 0 && <p className="muted small">暂无反馈。</p>}
          {all.map((f) => (
            <div key={f.id} className="feedback-item">
              <div className="feedback-item-head">
                <span className="feedback-status" style={{ color: STATUS_COLOR[f.status] }}>
                  {STATUS_TEXT[f.status]}
                </span>
                <span className="muted small">#{f.id} · {f.sender} · {GAME_NAMES[f.game] || f.game}</span>
              </div>
              <div className="feedback-body">{f.body}</div>
              {f.contact && <div className="muted small">联系方式：{f.contact}</div>}
              {f.reply && <div className="feedback-reply">已回复：{f.reply}</div>}

              {replyFor === f.id ? (
                <div className="feedback-reply-box">
                  <input
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    placeholder="回复内容（可选）"
                    aria-label="回复内容"
                  />
                  <div className="row">
                    <button className="btn-small" onClick={() => review(f, 'done')}>标记已处理</button>
                    <button className="btn-small" onClick={() => review(f, 'read')}>仅标记已读</button>
                    <button className="btn-small" onClick={() => { setReplyFor(null); setReplyText(''); }}>取消</button>
                  </div>
                </div>
              ) : (
                <div className="row">
                  <button className="btn-small" onClick={() => { setReplyFor(f.id); setReplyText(f.reply || ''); }}>处理</button>
                  <button className="btn-small" onClick={() => review(f, 'rejected')} disabled={busy}>不处理</button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </aside>
  );
}

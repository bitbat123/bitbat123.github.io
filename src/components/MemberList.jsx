import React, { useEffect, useState } from 'react';
import { callAuth } from '../cloud.js';

// 管理员用户名（与云函数常量一致，名单中会高亮）
const ADMIN_USERNAME = 'bitbat';

/** 已注册学生名单：只显示审核通过且未隐藏的账号 */
export default function MemberList() {
  const [users, setUsers] = useState([]);
  const [err, setErr] = useState(null);

  useEffect(() => {
    let alive = true;
    callAuth('listMembers')
      .then((r) => {
        if (!alive) return;
        if (r.ok) setUsers(r.users || []);
        else setErr(r.message);
      })
      .catch((e) => alive && setErr(e.message));
    return () => { alive = false; };
  }, []);

  return (
    <section className="member-card">
      <div className="member-head">
        <h2>👥 班级成员（{users.length}）</h2>
      </div>
      {err ? (
        <p className="muted small">名单加载失败：{err}</p>
      ) : users.length === 0 ? (
        <p className="muted small">还没有通过审核的同学。</p>
      ) : (
        <ul className="member-grid">
          {users.map((u) => (
            <li
              key={u.username}
              className={u.username === ADMIN_USERNAME ? 'member member-admin' : 'member'}
            >
              <span className="member-name">{u.username}</span>
              <span className="member-sid">{u.studentId} 号</span>
              {u.username === ADMIN_USERNAME && <span className="member-tag">管理员</span>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

import React, { useEffect, useState } from 'react';
import { callAuth } from '../cloud.js';

// 管理员用户名（与云函数常量一致，名单中会高亮）
const ADMIN_USERNAME = 'bitbat';
// 分组显示名：main = 本班，external = 外班
const GROUP_NAMES = { main: '本班', external: '外班' };

/** 已注册学生名单：按分组（本班 / 外班）展示，只显示审核通过且未隐藏的账号 */
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

  // 按分组归并，保持 main 在前
  const groups = users.reduce((acc, u) => {
    const g = u.group || 'main';
    (acc[g] = acc[g] || []).push(u);
    return acc;
  }, {});
  const order = ['main', 'external'].filter((g) => groups[g]?.length);

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
        order.map((g) => (
          <div key={g} className="member-group">
            <h3 className="member-group-title">
              {GROUP_NAMES[g] || g}（{groups[g].length}）
            </h3>
            <ul className="member-grid">
              {groups[g].map((u) => (
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
          </div>
        ))
      )}
    </section>
  );
}

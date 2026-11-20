// 反馈与管理员的数据库访问（social.feedback、social.admins）。
// 与 social.js 共用同一套转义规则；ExecutePGSql 不支持绑定参数。
const tencentcloud = require('tencentcloud-sdk-nodejs-tcb');

const ENV_ID = process.env.TCB_ENV || 'interim-toucan-d4g2tnti4470549e1';
const TcbClient = tencentcloud.tcb.v20180608.Client;

const client = new TcbClient({
  credential: {
    secretId: process.env.TCB_SECRET_ID || '',
    secretKey: process.env.TCB_SECRET_KEY || '',
  },
  region: 'ap-shanghai',
  profile: { httpProfile: { endpoint: 'tcb.tencentcloudapi.com' } },
});

const USERNAME_RE = /^[A-Za-z0-9_\u4e00-\u9fa5]{2,20}$/;
const ROLE_SET = new Set(['super', 'admin']);
const STATUS_SET = new Set(['new', 'read', 'done', 'rejected']);
const GAMES = new Set(['home', 'class-teacher', 'bomb', 'gomoku', 'racing', 'chat']);

function checkUsername(u) {
  if (!USERNAME_RE.test(u)) throw new Error('非法用户名');
  return u;
}
function litText(v) {
  return `'${String(v ?? '').replace(/\u0000/g, '').replace(/'/g, "''")}'`;
}
function lit(v) {
  const s = String(v);
  if (!/^[\w\u4e00-\u9fa5.\-:+ T]*$/.test(s)) throw new Error('非法字符');
  return `'${s.replace(/'/g, "''")}'`;
}
async function run(sql) {
  return client.ExecutePGSql({ EnvId: ENV_ID, Sql: sql });
}
function rows(res) {
  return (res.Rows || []).map((r) => {
    const cols = res.Columns || [];
    const arr = JSON.parse(r);
    const o = {};
    cols.forEach((c, i) => { o[c] = arr[i]; });
    return o;
  });
}

// ---------------- 管理员 ----------------
const admins = {
  /** 返回该用户的角色：'super' | 'admin' | null */
  async roleOf(username) {
    if (!username || !USERNAME_RE.test(username)) return null;
    const res = await run(`SELECT role FROM social.admins WHERE username = ${lit(username)} LIMIT 1`);
    const r = rows(res)[0];
    return r ? r.role : null;
  },

  async list() {
    const res = await run(
      `SELECT username, role, granted_by, extract(epoch from created_at) * 1000 AS ms
         FROM social.admins ORDER BY role DESC, created_at`,
    );
    return rows(res).map((r) => ({
      username: r.username,
      role: r.role,
      grantedBy: r.granted_by || '',
      createdAt: Number(r.ms),
    }));
  },

  async add(username, role, grantedBy) {
    checkUsername(username);
    if (!ROLE_SET.has(role)) throw new Error('非法角色');
    const exist = await run(`SELECT username FROM social.admins WHERE username = ${lit(username)} LIMIT 1`);
    if (rows(exist).length) throw new Error('该用户已经是管理员');
    await run(
      `INSERT INTO social.admins (username, role, granted_by) VALUES (${lit(username)}, ${lit(role)}, ${lit(grantedBy)})`,
    );
    return admins.list();
  },

  async remove(username) {
    checkUsername(username);
    const exist = await run(`SELECT role FROM social.admins WHERE username = ${lit(username)} LIMIT 1`);
    const r = rows(exist)[0];
    if (!r) throw new Error('该用户不是管理员');
    if (r.role === 'super') throw new Error('不能删除超级管理员');
    await run(`DELETE FROM social.admins WHERE username = ${lit(username)}`);
    return admins.list();
  },

  async setRole(username, role) {
    checkUsername(username);
    if (!ROLE_SET.has(role)) throw new Error('非法角色');
    const exist = await run(`SELECT role FROM social.admins WHERE username = ${lit(username)} LIMIT 1`);
    const r = rows(exist)[0];
    if (!r) throw new Error('该用户不是管理员');
    if (r.role === 'super' && role !== 'super') throw new Error('不能降级超级管理员');
    await run(`UPDATE social.admins SET role = ${lit(role)} WHERE username = ${lit(username)}`);
    return admins.list();
  },
};

// ---------------- 反馈 ----------------
const feedback = {
  async add({ sender, game, body, contact }) {
    checkUsername(sender);
    const g = GAMES.has(game) ? game : 'home';
    const text = String(body || '').slice(0, 2000).trim();
    if (!text) throw new Error('反馈内容不能为空');
    const c = String(contact || '').slice(0, 100);
    const res = await run(
      `WITH ins AS (
         INSERT INTO social.feedback (sender, game, body, contact)
         VALUES (${lit(sender)}, ${lit(g)}, ${litText(text)}, ${litText(c)})
         RETURNING id, created_at
       ) SELECT id, created_at FROM ins`,
    );
    const r = rows(res)[0];
    if (!r) throw new Error('提交失败');
    return { id: Number(r.id), at: r.created_at };
  },

  async list(status, sender) {
    const conds = [];
    if (status && STATUS_SET.has(status)) conds.push(`status = ${lit(status)}`);
    if (sender && USERNAME_RE.test(sender)) conds.push(`sender = ${lit(sender)}`);
    const where = conds.length ? 'WHERE ' + conds.join(' AND ') : '';
    const res = await run(
      `SELECT id, sender, game, body, contact, status, reply,
              extract(epoch from created_at) * 1000 AS ms
         FROM social.feedback ${where}
        ORDER BY id DESC LIMIT 200`,
    );
    return rows(res).map((r) => ({
      id: Number(r.id),
      sender: r.sender,
      game: r.game,
      body: r.body,
      contact: r.contact || '',
      status: r.status,
      reply: r.reply || '',
      at: Number(r.ms),
    }));
  },

  async setStatus(id, status, reply) {
    if (!STATUS_SET.has(status)) throw new Error('非法状态');
    const rep = String(reply || '').slice(0, 1000);
    const res = await run(
      `UPDATE social.feedback
          SET status = ${lit(status)}, reply = ${litText(rep)}, updated_at = now()
        WHERE id = ${Number(id)}`,
    );
    return (res.AffectedRows || 0) > 0;
  },

  async countNew() {
    const res = await run("SELECT COUNT(*) AS n FROM social.feedback WHERE status = 'new'");
    const r = rows(res)[0];
    return Number(r ? r.n : 0);
  },
};

module.exports = { admins, feedback, run, rows };

// 账号存储：通过 CloudBase 管控面 ExecutePGSql 访问 auth_private.users
// ExecutePGSql 接口只接收 SQL 文本、不支持绑定参数，所以这里对每个值做严格校验 + 字面量转义。
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
const STATUS_SET = new Set(['pending', 'approved', 'rejected']);
const HEX_RE = /^[0-9a-f]+$/i;

/** 字符串字面量：只允许白名单字符，再做单引号转义（双保险） */
function lit(value) {
  const s = String(value);
  if (!/^[\w\u4e00-\u9fa5.\-:+ T]*$/.test(s)) throw new Error('非法字符');
  return `'${s.replace(/'/g, "''")}'`;
}

/** 自由文本（如备注）：允许任意字符，仅转义单引号并拒绝空字节 */
function litText(value) {
  const s = String(value ?? '').replace(/\u0000/g, '');
  return `'${s.replace(/'/g, "''")}'`;
}

function checkUsername(u) {
  if (!USERNAME_RE.test(u)) throw new Error('非法用户名');
  return u;
}

async function run(sql) {
  const res = await client.ExecutePGSql({ EnvId: ENV_ID, Sql: sql });
  return res;
}

function parseRows(res) {
  return (res.Rows || []).map((r) => {
    const cols = res.Columns || [];
    const arr = JSON.parse(r);
    const obj = {};
    cols.forEach((c, i) => { obj[c] = arr[i]; });
    return obj;
  });
}

const store = {
  async findUser(username) {
    checkUsername(username);
    const res = await run(
      `SELECT username, student_id, salt, hash, status FROM auth_private.users WHERE username = ${lit(username)} LIMIT 1`,
    );
    const row = parseRows(res)[0];
    if (!row) return null;
    return { username: row.username, studentId: row.student_id, salt: row.salt, hash: row.hash, status: row.status };
  },

  async listPending() {
    const res = await run(
      "SELECT username, student_id, note, extract(epoch from created_at) * 1000 AS created_ms FROM auth_private.users WHERE status = 'pending' ORDER BY created_at",
    );
    return parseRows(res).map((r) => ({
      username: r.username,
      studentId: r.student_id,
      note: r.note || '',
      createdAt: Number(r.created_ms),
    }));
  },

  async findByStudentId(studentId) {
    if (!/^\d{1,4}$/.test(String(studentId))) throw new Error('非法学号');
    const res = await run(
      `SELECT username FROM auth_private.users WHERE student_id = ${lit(studentId)} LIMIT 1`,
    );
    return parseRows(res)[0] || null;
  },

  /** 公开名单：已通过审核且未隐藏（管理员可见，测试账号被隐藏） */
  async listMembers() {
    const res = await run(
      "SELECT username, student_id FROM auth_private.users WHERE status = 'approved' AND hidden = false ORDER BY student_id",
    );
    return parseRows(res).map((r) => ({ username: r.username, studentId: r.student_id }));
  },

  async addUser(u) {
    checkUsername(u.username);
    if (!/^\d{1,4}$/.test(String(u.studentId))) throw new Error('非法学号');
    if (!HEX_RE.test(u.salt) || !HEX_RE.test(u.hash)) throw new Error('非法哈希');
    if (!STATUS_SET.has(u.status)) throw new Error('非法状态');
    const note = typeof u.note === 'string' ? u.note.slice(0, 100) : '';
    await run(
      `INSERT INTO auth_private.users (username, student_id, salt, hash, note, status, hidden) VALUES (${lit(u.username)}, ${lit(u.studentId)}, ${lit(u.salt)}, ${lit(u.hash)}, ${litText(note)}, ${lit(u.status)}, ${u.hidden === true})`,
    );
  },

  async setStatus(username, status) {
    checkUsername(username);
    if (!STATUS_SET.has(status)) throw new Error('非法状态');
    const res = await run(
      `UPDATE auth_private.users SET status = ${lit(status)} WHERE username = ${lit(username)}`,
    );
    return (res.AffectedRows || 0) > 0;
  },
};

module.exports = { store };

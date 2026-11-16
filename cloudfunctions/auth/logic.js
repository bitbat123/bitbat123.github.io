// 账号业务逻辑（与存储实现解耦，便于本地测试）
// store 接口（均返回 Promise）：
//   findUser(username)            -> { username, studentId, salt, hash, status } | null
//   listPending()                 -> [{ username, studentId, createdAt }]
//   addUser(user)                 -> void
//   setStatus(username, status)   -> boolean（是否找到并更新）
const crypto = require('crypto');

const ADMIN_USERNAME = 'bitbat';

function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return { salt, hash };
}

function verifyPassword(password, salt, hash) {
  const h = crypto.scryptSync(password, salt, 64);
  const expected = Buffer.from(hash, 'hex');
  return expected.length === h.length && crypto.timingSafeEqual(h, expected);
}

// 会话令牌：HMAC 签名，7 天有效
function signSession(username, secret) {
  const payload = Buffer.from(JSON.stringify({ username, exp: Date.now() + 7 * 864e5 })).toString('base64url');
  const sig = crypto.createHmac('sha256', secret).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

function verifySession(token, secret) {
  if (!token || !token.includes('.')) return null;
  const [payload, sig] = token.split('.');
  const expect = crypto.createHmac('sha256', secret).update(payload).digest('base64url');
  if (sig.length !== expect.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expect))) return null;
  const data = JSON.parse(Buffer.from(payload, 'base64url').toString());
  if (data.exp < Date.now()) return null;
  return data;
}

const ok = (data = {}) => ({ ok: true, ...data });
const fail = (message) => ({ ok: false, message });

function validate({ username, studentId, password }) {
  if (!username || !/^[A-Za-z0-9_\u4e00-\u9fa5]{2,20}$/.test(username)) return '用户名 2–20 位，仅字母、数字、下划线或中文';
  if (!studentId || !/^\d{1,4}$/.test(String(studentId))) return '班级学号为 1–4 位数字';
  if (!password || password.length < 6) return '密码至少 6 位';
  return null;
}

/**
 * 处理一次请求。
 * @param {object} event 请求体 { action, ... }
 * @param {object} store 存储接口（见文件头）
 * @param {{secret: string, seedAdminPassword?: string, seedTestPassword?: string}} cfg 配置
 */
async function handle(event = {}, store, cfg) {
  const { action } = event;
  const secret = cfg.secret;
  if (!secret) return fail('服务未配置 AUTH_SECRET');

  if (action === 'register') {
    const err = validate(event);
    if (err) return fail(err);
    if (await store.findUser(event.username)) return fail('用户名已存在');
    // 学号唯一：已被占用（含待审核申请）则拒绝，防止用同一学号注册小号
    const sid = String(event.studentId).padStart(2, '0');
    if (await store.findByStudentId(sid)) return fail('该学号已被注册，不能重复注册');
    const { salt, hash } = hashPassword(event.password);
    await store.addUser({
      username: event.username,
      studentId: String(event.studentId).padStart(2, '0'),
      salt,
      hash,
      note: typeof event.note === 'string' ? event.note.slice(0, 100) : '',
      status: 'pending',
      createdAt: Date.now(),
    });
    return ok({ message: '注册成功，请等待管理员审核' });
  }

  if (action === 'login') {
    const user = await store.findUser(event.username || '');
    if (!user || !verifyPassword(event.password || '', user.salt, user.hash)) return fail('用户名或密码错误');
    if (user.status !== 'approved') return fail('账号尚未通过管理员审核');
    return ok({ token: signSession(user.username, secret), username: user.username, studentId: user.studentId });
  }

  if (action === 'session') {
    const sess = verifySession(event.token, secret);
    if (!sess) return fail('登录已过期');
    return ok({ username: sess.username });
  }

  // 公开名单：所有已通过审核、且未标记 hidden 的学生（管理员 bitbat 也显示）
  if (action === 'listMembers') {
    return ok({ users: await store.listMembers() });
  }

  if (action === 'listPending' || action === 'review') {
    const sess = verifySession(event.token, secret);
    if (!sess || sess.username !== ADMIN_USERNAME) return fail('无管理员权限');

    if (action === 'listPending') {
      return ok({ users: await store.listPending() });
    }

    if (!['approve', 'reject'].includes(event.decision)) return fail('无效的审核决定');
    const status = event.decision === 'approve' ? 'approved' : 'rejected';
    const updated = await store.setStatus(event.username || '', status);
    if (!updated) return fail('用户不存在');
    return ok({ message: status === 'approved' ? '已通过' : '已拒绝' });
  }

  return fail('未知操作');
}

module.exports = { handle, hashPassword, verifyPassword, signSession, verifySession };

// 共享存储：房间/聊天室数据，同样通过 CloudBase 管控面 ExecutePGSql 访问 social.*
// 与 pgstore.js 共用转义规则（该接口不支持绑定参数，只能拼 SQL 文本）。
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
const GAME_SET = new Set(['bomb', 'gomoku', 'racing', 'class-sim']);
const STATUS_SET = new Set(['open', 'playing', 'finished']);
const CODE_RE = /^[A-Z0-9]{3,10}$/;

function checkUsername(u) {
  if (!USERNAME_RE.test(u)) throw new Error('非法用户名');
  return u;
}
function checkCode(c) {
  if (!CODE_RE.test(c)) throw new Error('非法房间号');
  return c;
}
/** 自由文本：只转义单引号、去掉空字节 */
function litText(value) {
  const s = String(value ?? '').replace(/\u0000/g, '');
  return `'${s.replace(/'/g, "''")}'`;
}
/** 受限标识符：白名单字符 */
function lit(value) {
  const s = String(value);
  if (!/^[\w\u4e00-\u9fa5.\-:+ T]*$/.test(s)) throw new Error('非法字符');
  return `'${s.replace(/'/g, "''")}'`;
}

async function run(sql) {
  return client.ExecutePGSql({ EnvId: ENV_ID, Sql: sql });
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

// ---------------- 房间 ----------------
const rooms = {
  async create({ game, code, owner, title, passKey }) {
    if (!GAME_SET.has(game)) throw new Error('未知游戏');
    checkCode(code);
    checkUsername(owner);
    const t = String(title || '').slice(0, 40);
    // 房间号唯一：已存在则报错（由调用方转成友好提示）
    const dup = await run(`SELECT id FROM social.rooms WHERE code = ${lit(code)} LIMIT 1`);
    if (parseRows(dup).length) throw new Error('房间号已被占用');
    const res = await run(
      `INSERT INTO social.rooms (game, code, owner, title, pass_key, status) VALUES (${lit(game)}, ${lit(code)}, ${lit(owner)}, ${litText(t)}, ${litText(passKey || '')}, 'open') RETURNING id, code, owner, title, game, status, (pass_key <> '') AS locked`,
    );
    const row = parseRows(res)[0];
    await rooms.addMember(row.id, owner, 'player1');
    return row;
  },

  async list(game) {
    const where = game && GAME_SET.has(game) ? `WHERE game = ${lit(game)} AND status <> 'finished'` : `WHERE status <> 'finished'`;
    const res = await run(
      `SELECT r.id, r.game, r.code, r.owner, r.title, r.status, (r.pass_key <> '') AS locked,
              r.created_at, COUNT(m.id) AS members
         FROM social.rooms r LEFT JOIN social.room_members m ON m.room_id = r.id
         ${where}
        GROUP BY r.id
        ORDER BY r.created_at DESC LIMIT 50`,
    );
    return parseRows(res).map((r) => ({
      id: Number(r.id),
      game: r.game,
      code: r.code,
      owner: r.owner,
      title: r.title || '',
      status: r.status,
      locked: r.locked === true || r.locked === 'true' || r.locked === 't',
      members: Number(r.members || 0),
    }));
  },

  async get(code) {
    checkCode(code);
    const res = await run(
      `SELECT id, game, code, owner, title, status, pass_key FROM social.rooms WHERE code = ${lit(code)} LIMIT 1`,
    );
    const r = parseRows(res)[0];
    if (!r) return null;
    return {
      id: Number(r.id),
      game: r.game,
      code: r.code,
      owner: r.owner,
      title: r.title || '',
      status: r.status,
      passKey: r.pass_key || '',
    };
  },

  async setStatus(code, status) {
    checkCode(code);
    if (!STATUS_SET.has(status)) throw new Error('非法状态');
    await run(`UPDATE social.rooms SET status = ${lit(status)}, updated_at = now() WHERE code = ${lit(code)}`);
  },

  async addMember(roomId, username, seat) {
    checkUsername(username);
    if (!['player1', 'player2'].includes(seat)) throw new Error('非法座位');
    await run(
      `INSERT INTO social.room_members (room_id, username, seat) VALUES (${Number(roomId)}, ${lit(username)}, ${lit(seat)})
       ON CONFLICT (room_id, username) DO UPDATE SET seat = EXCLUDED.seat`,
    );
  },

  async members(roomId) {
    const res = await run(
      `SELECT username, seat FROM social.room_members WHERE room_id = ${Number(roomId)} ORDER BY joined_at`,
    );
    return parseRows(res).map((r) => ({ username: r.username, seat: r.seat }));
  },

  async removeMember(roomId, username) {
    checkUsername(username);
    await run(
      `DELETE FROM social.room_members WHERE room_id = ${Number(roomId)} AND username = ${lit(username)}`,
    );
  },

  /** 房间主审批：把申请者放到 empty seat，返回 seat 或 null（满员） */
  async approve(roomId, username) {
    checkUsername(username);
    const cur = await rooms.members(roomId);
    const taken = new Set(cur.map((m) => m.seat));
    const seat = !taken.has('player1') ? 'player1' : (!taken.has('player2') ? 'player2' : null);
    if (!seat) return null;
    await rooms.addMember(roomId, username, seat);
    return seat;
  },
};

// ---------------- 聊天室 ----------------
const chat = {
  async send({ channel, sender, body }) {
    checkUsername(sender);
    const ch = String(channel || 'public').slice(0, 40);
    const text = String(body || '').slice(0, 2000);
    if (!text.trim()) throw new Error('消息为空');
    const res = await run(
      `INSERT INTO social.messages (channel, sender, body) VALUES (${litText(ch)}, ${lit(ch)}, ${litText(text)}) RETURNING id, created_at`,
    );
    const r = parseRows(res)[0];
    return { id: Number(r.id), at: r.created_at };
  },

  /** 拉取某频道 id 之后的消息（轮询用） */
  async since(channel, afterId = 0, limit = 100) {
    const ch = String(channel || 'public').slice(0, 40);
    const res = await run(
      `SELECT id, channel, sender, body, extract(epoch from created_at) * 1000 AS ms
         FROM social.messages
        WHERE channel = ${litText(ch)} AND id > ${Number(afterId) || 0}
        ORDER BY id ASC LIMIT ${Math.min(Number(limit) || 100, 200)}`,
    );
    return parseRows(res).map((r) => ({
      id: Number(r.id),
      channel: r.channel,
      sender: r.sender,
      body: r.body,
      at: Number(r.ms),
    }));
  },

  /** 私聊频道名：两个用户名排序后拼接，保证双方一致 */
  dmChannel(a, b) {
    checkUsername(a);
    checkUsername(b);
    return `dm:${[a, b].sort().join('|')}`;
  },
};

module.exports = { rooms, chat, parseRows, run };

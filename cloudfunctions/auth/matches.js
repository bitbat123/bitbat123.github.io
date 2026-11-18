// 轮询式联机对战：把对局状态存进 PostgreSQL，客户端定时拉取。
// 不使用 WebSocket —— 云端函数无法常驻长连接，GitHub Pages 也不允许 ws://。
//
// 一致性：每个动作都带 expectedTurn，服务端用 UPDATE ... WHERE turns = N 做乐观锁，
// 两个客户端同时推进时只有一个成功，另一个会拿到最新状态重试。
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
const CODE_RE = /^[A-Z0-9]{3,10}$/;
const GAMES = new Set(['bomb', 'gomoku', 'racing']);
const STATUS = new Set(['coding', 'ready', 'playing', 'finished']);
const MAX_CODE = 20000;

function checkUsername(u) {
  if (!USERNAME_RE.test(u)) throw new Error('非法用户名');
  return u;
}
function checkCode(c) {
  if (!CODE_RE.test(c)) throw new Error('非法房间号');
  return c;
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

/** 统一把 DB 行转成对外的 match 对象 */
function toMatch(r) {
  if (!r) return null;
  return {
    code: r.code,
    game: r.game,
    seed: Number(r.seed),
    status: r.status,
    p1: r.p1,
    p2: r.p2,
    p1Ready: r.p1_ready === true || r.p1_ready === 't' || r.p1_ready === 'true',
    p2Ready: r.p2_ready === true || r.p2_ready === 't' || r.p2_ready === 'true',
    result: r.result || '',
    turns: Number(r.turns || 0),
    mapOrder: (r.map_order || '').split(',').filter(Boolean).map(Number),
    updatedAt: r.updated_ms ? Number(r.updated_ms) : Date.now(),
  };
}

const SELECT = `id, code, game, seed, status, p1, p2, p1_ready, p2_ready, result, turns, map_order,
                extract(epoch from updated_at) * 1000 AS updated_ms`;

const matches = {
  /** 创建/加入：只有两人，房主先创建，第二个人 join 后自动进入准备阶段 */
  async create({ code, game, owner, seed, mapOrder }) {
    checkCode(code);
    checkUsername(owner);
    if (!GAMES.has(game)) throw new Error('未知游戏');
    const dup = await run(`SELECT id FROM social.matches WHERE code = ${lit(code)} LIMIT 1`);
    if (rows(dup).length) throw new Error('对战号已存在');
    const order = (mapOrder || []).slice(0, 5).join(',');
    const res = await run(
      `WITH ins AS (
         INSERT INTO social.matches (code, game, seed, p1, map_order, status)
         VALUES (${lit(code)}, ${lit(game)}, ${Number(seed) || 1}, ${lit(owner)}, ${litText(order)}, 'coding')
         RETURNING ${SELECT}
       ) SELECT * FROM ins`,
    );
    const row = rows(res)[0];
    if (!row) throw new Error('创建失败');
    return toMatch(row);
  },

  async get(code) {
    checkCode(code);
    const res = await run(`SELECT ${SELECT} FROM social.matches WHERE code = ${lit(code)} LIMIT 1`);
    return toMatch(rows(res)[0]);
  },

  /** 第二个人加入，占用 p2 */
  async join(code, username) {
    checkCode(code);
    checkUsername(username);
    const m = await matches.get(code);
    if (!m) throw new Error('对战不存在');
    if (m.p1 === username) return m;
    if (m.p2 && m.p2 !== username) throw new Error('对战已满');
    await run(
      `UPDATE social.matches SET p2 = ${lit(username)}, updated_at = now()
        WHERE code = ${lit(code)} AND (p2 = '' OR p2 = ${lit(username)})`,
    );
    return matches.get(code);
  },

  /** 提交代码。code 只能在 coding 阶段改 */
  async submitCode(code, username, src) {
    checkCode(code);
    checkUsername(username);
    if (typeof src !== 'string' || src.length > MAX_CODE) throw new Error('代码过长');
    const m = await matches.get(code);
    if (!m) throw new Error('对战不存在');
    if (m.status !== 'coding') throw new Error('编写阶段已结束');
    const field = m.p1 === username ? 'p1_code' : (m.p2 === username ? 'p2_code' : null);
    if (!field) throw new Error('你不在这个对战中');
    await run(
      `UPDATE social.matches SET ${field} = ${litText(src)}, updated_at = now() WHERE code = ${lit(code)}`,
    );
    return matches.get(code);
  },

  /** 双方都点准备后进入 playing */
  async setReady(code, username, ready) {
    checkCode(code);
    checkUsername(username);
    const m = await matches.get(code);
    if (!m) throw new Error('对战不存在');
    const field = m.p1 === username ? 'p1_ready' : (m.p2 === username ? 'p2_ready' : null);
    if (!field) throw new Error('你不在这个对战中');
    await run(
      `UPDATE social.matches SET ${field} = ${ready ? 'true' : 'false'}, updated_at = now() WHERE code = ${lit(code)}`,
    );
    const after = await matches.get(code);
    if (after.p1Ready && after.p2Ready && after.status === 'coding' && after.p2) {
      await run(`UPDATE social.matches SET status = 'playing', updated_at = now() WHERE code = ${lit(code)}`);
      return matches.get(code);
    }
    return after;
  },

  /**
   * 推进回合：客户端带 expectedTurns，服务端用乐观锁更新。
   * 返回 { applied, match }：applied=false 表示别人已经推进过，调用方应直接用返回的 match。
   */
  async advance(code, expectedTurns, delta = 1) {
    checkCode(code);
    const n = Math.max(1, Math.min(Number(delta) || 1, 10));
    const res = await run(
      `WITH upd AS (
         UPDATE social.matches
            SET turns = turns + ${n}, updated_at = now()
          WHERE code = ${lit(code)} AND turns = ${Number(expectedTurns) || 0} AND status = 'playing'
         RETURNING ${SELECT}
       ) SELECT * FROM upd`,
    );
    const row = rows(res)[0];
    if (row) return { applied: true, match: toMatch(row) };
    return { applied: false, match: await matches.get(code) };
  },

  /** 结束对战并写入结果 */
  async finish(code, result) {
    checkCode(code);
    await run(
      `UPDATE social.matches SET status = 'finished', result = ${litText(String(result || '').slice(0, 200))}, updated_at = now()
        WHERE code = ${lit(code)}`,
    );
    return matches.get(code);
  },

  /** 最近的对战列表（用于大厅） */
  async list(game) {
    const where = game && GAMES.has(game) ? `WHERE game = ${lit(game)} AND status <> 'finished'` : `WHERE status <> 'finished'`;
    const res = await run(`SELECT ${SELECT} FROM social.matches ${where} ORDER BY updated_at DESC LIMIT 30`);
    return rows(res).map(toMatch);
  },
};

module.exports = { matches, toMatch, SELECT, run, rows };

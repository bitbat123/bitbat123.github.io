// 云函数入口：账号（auth_private.users）、房间与聊天室（social.*）都在 PostgreSQL 里，
// 统一通过 ExecutePGSql 访问。所有写操作都先校验会话令牌。
const { handle } = require('./logic.js');
const { store } = require('./pgstore.js');
const { rooms, chat } = require('./social.js');
const { matches } = require('./matches.js');
const { admins, feedback } = require('./feedback.js');

const ADMIN_USERNAME = 'bitbat';
const ROOM_GAMES = ['bomb', 'gomoku', 'racing', 'class-sim'];

/** 从令牌里取出当前用户名；无效返回 null */
function sessionUser(event, secret) {
  try {
    return require('./logic.js').verifySession(event.token, secret)?.username || null;
  } catch {
    return null;
  }
}

async function handleSocial(event, secret) {
  const { action } = event;
  const me = sessionUser(event, secret);
  if (!me) return { ok: false, message: '请先登录' };

  switch (action) {
    // ---- 房间 ----
    case 'roomCreate': {
      const game = String(event.game || '');
      if (!ROOM_GAMES.includes(game)) return { ok: false, message: '未知游戏' };
      const code = String(event.code || '').toUpperCase();
      if (!/^[A-Z0-9]{3,10}$/.test(code)) return { ok: false, message: '房间号 3–10 位字母或数字' };
      try {
        const room = await rooms.create({
          game,
          code,
          owner: me,
          title: event.title,
          passKey: event.passKey,
        });
        return { ok: true, room };
      } catch (e) {
        return { ok: false, message: e.message };
      }
    }
    case 'roomList': {
      const list = await rooms.list(event.game);
      return { ok: true, rooms: list };
    }
    case 'roomJoin': {
      const code = String(event.code || '').toUpperCase();
      const room = await rooms.get(code);
      if (!room) return { ok: false, message: '房间不存在' };
      // 有密钥：密钥正确即可直接加入；无密钥：需要房主批准
      if (room.passKey) {
        if (String(event.passKey || '') !== room.passKey) return { ok: false, message: '密钥错误' };
        const seat = room.owner === me ? 'player1' : await rooms.approve(room.id, me);
        if (!seat) return { ok: false, message: '房间已满' };
        await rooms.setStatus(code, 'playing');
        return { ok: true, room, seat, approved: true };
      }
      if (room.owner === me) {
        return { ok: true, room, seat: 'player1', approved: true };
      }
      const seat = await rooms.approve(room.id, me);
      if (!seat) return { ok: false, message: '房间已满' };
      return { ok: true, room, seat, approved: true, message: '已加入' };
    }
    case 'roomApprove': {
      const code = String(event.code || '').toUpperCase();
      const room = await rooms.get(code);
      if (!room) return { ok: false, message: '房间不存在' };
      if (room.owner !== me) return { ok: false, message: '只有房主可以批准' };
      const seat = await rooms.approve(room.id, String(event.username || ''));
      if (!seat) return { ok: false, message: '房间已满' };
      return { ok: true, seat };
    }
    case 'roomLeave': {
      const code = String(event.code || '').toUpperCase();
      const room = await rooms.get(code);
      if (!room) return { ok: false, message: '房间不存在' };
      await rooms.removeMember(room.id, me);
      return { ok: true };
    }
    case 'roomMembers': {
      const code = String(event.code || '').toUpperCase();
      const room = await rooms.get(code);
      if (!room) return { ok: false, message: '房间不存在' };
      return { ok: true, members: await rooms.members(room.id) };
    }

    // ---- 聊天室 ----
    case 'chatSend': {
      const body = String(event.body || '');
      if (!body.trim()) return { ok: false, message: '消息为空' };
      if (body.length > 2000) return { ok: false, message: '消息过长（最多 2000 字）' };
      const to = event.to ? String(event.to) : '';
      let channel = 'public';
      if (to) {
        if (to === me) return { ok: false, message: '不能给自己发私聊' };
        const exists = await store.findUser(to);
        if (!exists) return { ok: false, message: '对方不存在' };
        channel = chat.dmChannel(me, to);
      }
      const saved = await chat.send({ channel, sender: me, body, format: event.format });
      return { ok: true, message: saved };
    }
    case 'chatFetch': {
      const to = event.to ? String(event.to) : '';
      const channel = to ? chat.dmChannel(me, to) : 'public';
      const messages = await chat.since(channel, event.after || 0, event.limit || 100);
      return { ok: true, channel, messages };
    }

    // ---- 轮询式联机对战（不需要常驻 WebSocket 服务） ----
    case 'matchCreate': {
      const code = String(event.code || '').toUpperCase();
      if (!/^[A-Z0-9]{3,10}$/.test(code)) return { ok: false, message: '对战号 3–10 位字母或数字' };
      if (!['bomb', 'gomoku', 'racing'].includes(String(event.game))) return { ok: false, message: '未知游戏' };
      try {
        const m = await matches.create({
          code,
          game: String(event.game),
          owner: me,
          seed: Number(event.seed) || Math.floor(Math.random() * 1e9),
          mapOrder: event.mapOrder || [0, 1, 2],
        });
        return { ok: true, match: m };
      } catch (e) {
        return { ok: false, message: e.message };
      }
    }
    case 'matchJoin': {
      try {
        const m = await matches.join(String(event.code || '').toUpperCase(), me);
        return { ok: true, match: m };
      } catch (e) {
        return { ok: false, message: e.message };
      }
    }
    case 'matchState': {
      const m = await matches.get(String(event.code || '').toUpperCase());
      if (!m) return { ok: false, message: '对战不存在' };
      return { ok: true, match: m, me };
    }
    case 'matchList': {
      return { ok: true, matches: await matches.list(event.game) };
    }
    case 'matchCode': {
      try {
        const m = await matches.submitCode(String(event.code || '').toUpperCase(), me, event.src || '');
        return { ok: true, match: m };
      } catch (e) {
        return { ok: false, message: e.message };
      }
    }
    case 'matchReady': {
      try {
        const m = await matches.setReady(String(event.code || '').toUpperCase(), me, event.ready !== false);
        return { ok: true, match: m };
      } catch (e) {
        return { ok: false, message: e.message };
      }
    }
    case 'matchAdvance': {
      try {
        const r = await matches.advance(String(event.code || '').toUpperCase(), event.turns, event.delta);
        return { ok: true, applied: r.applied, match: r.match };
      } catch (e) {
        return { ok: false, message: e.message };
      }
    }
    case 'matchFinish': {
      try {
        const m = await matches.finish(String(event.code || '').toUpperCase(), event.result);
        return { ok: true, match: m };
      } catch (e) {
        return { ok: false, message: e.message };
      }
    }

    // ---- 反馈 ----
    case 'feedbackAdd': {
      try {
        const r = await feedback.add({
          sender: me,
          game: String(event.game || 'home'),
          body: event.body,
          contact: event.contact,
        });
        return { ok: true, feedback: r };
      } catch (e) {
        return { ok: false, message: e.message };
      }
    }
    case 'feedbackMy': {
      return { ok: true, items: await feedback.list(event.status, me) };
    }
    // ---- 管理员：审核权限 ----
    case 'adminWhoAmI': {
      const role = await admins.roleOf(me);
      return { ok: true, username: me, role: role || null, isAdmin: !!role, isSuper: role === 'super' };
    }
    case 'feedbackList': {
      if (!(await admins.roleOf(me))) return { ok: false, message: '需要管理员权限' };
      return { ok: true, items: await feedback.list(event.status) };
    }
    case 'feedbackReview': {
      if (!(await admins.roleOf(me))) return { ok: false, message: '需要管理员权限' };
      try {
        const ok2 = await feedback.setStatus(event.id, String(event.status || 'done'), event.reply);
        if (!ok2) return { ok: false, message: '反馈不存在' };
        return { ok: true };
      } catch (e) {
        return { ok: false, message: e.message };
      }
    }
    // ---- 超级管理员：管理员增删改 ----
    case 'adminList': {
      if (!(await admins.roleOf(me))) return { ok: false, message: '需要管理员权限' };
      return { ok: true, admins: await admins.list() };
    }
    case 'adminAdd': {
      if ((await admins.roleOf(me)) !== 'super') return { ok: false, message: '需要超级管理员权限' };
      try {
        const list = await admins.add(String(event.username || ''), String(event.role || 'admin'), me);
        return { ok: true, admins: list };
      } catch (e) {
        return { ok: false, message: e.message };
      }
    }
    case 'adminRemove': {
      if ((await admins.roleOf(me)) !== 'super') return { ok: false, message: '需要超级管理员权限' };
      try {
        const list = await admins.remove(String(event.username || ''));
        return { ok: true, admins: list };
      } catch (e) {
        return { ok: false, message: e.message };
      }
    }
    case 'adminSetRole': {
      if ((await admins.roleOf(me)) !== 'super') return { ok: false, message: '需要超级管理员权限' };
      try {
        const list = await admins.setRole(String(event.username || ''), String(event.role || 'admin'));
        return { ok: true, admins: list };
      } catch (e) {
        return { ok: false, message: e.message };
      }
    }

    default:
      return { ok: false, message: '未知操作' };
  }
}

exports.main = async (event = {}) => {
  try {
    const secret = process.env.AUTH_SECRET || '';
    const socialActions = new Set([
      'roomCreate', 'roomList', 'roomJoin', 'roomApprove', 'roomLeave', 'roomMembers',
      'chatSend', 'chatFetch',
      'matchCreate', 'matchJoin', 'matchState', 'matchList', 'matchCode',
      'matchReady', 'matchAdvance', 'matchFinish',
      'feedbackAdd', 'feedbackMy', 'feedbackList', 'feedbackReview',
      'adminWhoAmI', 'adminList', 'adminAdd', 'adminRemove', 'adminSetRole',
    ]);
    if (socialActions.has(event.action)) {
      return await handleSocial(event, secret);
    }
    // 审核类操作额外传入「是否为管理员」的查询函数（权限来自 social.admins 表）
    return await handle(event, store, { secret, isAdmin: async (u) => !!(await admins.roleOf(u)) });
  } catch (e) {
    return { ok: false, message: '服务器错误：' + e.message };
  }
};

module.exports.ADMIN_USERNAME = ADMIN_USERNAME;

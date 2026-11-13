// 云函数入口：账号数据保存在 PostgreSQL 的 auth_private.users 表中（通过 ExecutePGSql 访问）
const { handle } = require('./logic.js');
const { store } = require('./pgstore.js');

exports.main = async (event = {}) => {
  try {
    return await handle(event, store, {
      secret: process.env.AUTH_SECRET || '',
    });
  } catch (e) {
    return { ok: false, message: '服务器错误：' + e.message };
  }
};

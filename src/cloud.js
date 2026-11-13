import cloudbase from '@cloudbase/js-sdk';

// 环境 ID 与 Publishable Key（公开信息，用于匿名初始化 SDK；安全靠云函数与数据库规则保证）
const ENV_ID = 'interim-toucan-d4g2tnti4470549e1';
const PUBLISHABLE_KEY = 'eyJhbGciOiJSUzI1NiIsImtpZCI6ImJiZDBjZTU4LWUwNmUtNDRhZC04N2I2LWZlYWU2MjkzZmUwOSJ9.eyJpc3MiOiJodHRwczovL2ludGVyaW0tdG91Y2FuLWQ0ZzJ0bnRpNDQ3MDU0OWUxLmFwLXNoYW5naGFpLnRjYi1hcGkudGVuY2VudGNsb3VkYXBpLmNvbSIsInN1YiI6ImFub24iLCJhdWQiOiJpbnRlcmltLXRvdWNhbi1kNGcydG50aTQ0NzA1NDllMSIsImV4cCI6NDA5ODA3NTU5MiwiaWF0IjoxNzk0MzkyMzkyLCJub25jZSI6ImJKY04zLVN6UVFLTHdGSDNYN3NGQVEiLCJhdF9oYXNoIjoiYkpjTjMtU3pRUUtMd0ZIM1g3c0ZBUSIsIm5hbWUiOiJBbm9ueW1vdXMiLCJzY29wZSI6ImFub255bW91cyIsInByb2plY3RfaWQiOiJpbnRlcmltLXRvdWNhbi1kNGcydG50aTQ0NzA1NDllMSIsIm1ldGEiOnsicGxhdGZvcm0iOiJQdWJsaXNoYWJsZUtleSJ9LCJyb2xlIjoiYW5vbiIsImlzX2Fub255bW91cyI6dHJ1ZSwiYXBwX21ldGFkYXRhIjp7InByb3ZpZGVyIjoiYW5vbnltb3VzIiwicHJvdmlkZXJzIjpbImFub255bW91cyJdfSwidXNlcl9tZXRhZGF0YSI6eyJuYW1lIjoiQW5vbnltb3VzIn0sInVzZXJfdHlwZSI6IiIsImNsaWVudF90eXBlIjoiY2xpZW50X3VzZXIiLCJpc19zeXN0ZW1fYWRtaW4iOmZhbHNlfQ.TTEpUSgY-NO9zDk0yADRFc1BXgTvXR9KbmIhXLAJ-PvQrgvGQMF9IpdYc-flXJRL6VqUKgrpKQO8flZyd5sDJwA5x1h_Hz94mJCr2NwxYzzXKdmmlA4H90JtSkikanfY63pdjRgoDvWGICby4z4d6bMlEurxq8axk1T7MpelcqTYcOhEWPkmT2vV-s77GGihHw16eePpg0w2ip7d8__r3lyXTEQ7AXJ4_M5aMGF6on1_zjnYXip8MUgX1Dc9GXJYooNtSUp6eJtUivCT4zgAZgEkrLAiqrNJG1UapkBeeRL7T3uLivu6rbO9ySGSzm2kAmRETEX8Q0zWHrw3hjbjtg';

// 共享的 Temp 账号：用于让前端能调用 auth 云函数（方案 Y）。
// 注意：此密码会出现在前端代码中，任何访问者都能获取。这是用户确认接受的设计。
const SHARED_USER = 'Temp';
const SHARED_PASSWORD = 'TestTest123';

let app = null;
let loginPromise = null;

function getApp() {
  if (!app) app = cloudbase.init({ env: ENV_ID, persistence: 'local', accessKey: PUBLISHABLE_KEY });
  return app;
}

/** 确保以 Temp 身份登录一次（之后 SDK 会复用登录态） */
async function ensureSharedLogin() {
  const a = getApp();
  if (!loginPromise) {
    loginPromise = a.auth().signInWithPassword({ username: SHARED_USER, password: SHARED_PASSWORD })
      .then((r) => {
        if (r.error) throw new Error('共享账号登录失败：' + r.error.message);
      })
      .catch((e) => {
        loginPromise = null; // 失败后允许重试
        throw e;
      });
  }
  return loginPromise;
}

/** 调用云函数 auth（所有业务判断都在服务端） */
export async function callAuth(action, payload = {}) {
  await ensureSharedLogin();
  const res = await getApp().callFunction({ name: 'auth', data: { action, ...payload } });
  return res.result;
}

const TOKEN_KEY = 'authToken';
export const saveToken = (t) => localStorage.setItem(TOKEN_KEY, t);
export const getToken = () => localStorage.getItem(TOKEN_KEY);
export const clearToken = () => localStorage.removeItem(TOKEN_KEY);

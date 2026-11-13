const cloudbase = require('@cloudbase/js-sdk');
const src = require('fs').readFileSync('src/cloud.js', 'utf8');
const key = src.match(/PUBLISHABLE_KEY = '([^']+)'/)[1];
const app = cloudbase.init({ env: 'interim-toucan-d4g2tnti4470549e1', accessKey: key });
app.callFunction({ name: 'auth', data: { action: 'register', username: 'probe_' + Date.now().toString(36), studentId: '99', password: 'probe123' } })
  .then((r) => console.log('RESULT', JSON.stringify(r.result)))
  .catch((e) => console.log('ERR', e.code || '', e.message));

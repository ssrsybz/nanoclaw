// 独立测试 DeepSeek 端点连通性 — 完全不经过 okclaw 代码
// 只验证：是 LLM 服务本身的问题，还是 okclaw 修改导致的问题。
const fs = require('fs');
const path = require('path');

const envPath = path.join(__dirname, '.env');
const envText = fs.readFileSync(envPath, 'utf8');
const env = {};
for (const line of envText.split('\n')) {
  const t = line.trim();
  if (!t || t.startsWith('#')) continue;
  const i = t.indexOf('=');
  if (i === -1) continue;
  let v = t.slice(i + 1).trim().replace(/^["']|["']$/g, '');
  env[t.slice(0, i).trim()] = v;
}

const baseUrl = env.ANTHROPIC_BASE_URL;
const apiKey = env.ANTHROPIC_API_KEY;
const model = env.MODEL;

console.log('base_url:', baseUrl);
console.log('model   :', model);
console.log('api_key :', apiKey ? apiKey.slice(0, 6) + '***(' + apiKey.length + ' chars)' : 'MISSING');

const url = baseUrl.replace(/\/$/, '') + '/v1/messages';
console.log('POST   :', url);

const body = JSON.stringify({
  model,
  max_tokens: 32,
  messages: [{ role: 'user', content: '回复OK' }],
});

const start = Date.now();
fetch(url, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'x-api-key': apiKey,
    'anthropic-version': '2023-06-01',
    'Authorization': 'Bearer ' + apiKey,
  },
  body,
}).then(async (res) => {
  const text = await res.text();
  console.log('\n=== HTTP', res.status, '(', Date.now() - start, 'ms ) ===');
  console.log(text.slice(0, 800));
}).catch((err) => {
  console.log('\n=== 网络错误 ===');
  console.log(err.message);
});

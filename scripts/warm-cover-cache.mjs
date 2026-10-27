const BASE = 'http://127.0.0.1:8787';
const ADMIN = { account: '13456693544', password: 'weilan0576' };
const api = async (path, { method = 'GET', body, token } = {}) => {
  const res = await fetch(BASE + path, {
    method,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const t = await res.text();
  try { return JSON.parse(t); } catch { return null; }
};
const login = await api('/api/auth/login', { method: 'POST', body: ADMIN });
const token = login?.data?.token;
const qs = (await api('/api/admin/covers/queries', { token }))?.data?.queries || [];
console.log('搜索词 ' + qs.length + ' 个');
let ok = 0, cached = 0, fail = 0;
for (let i = 0; i < qs.length; i++) {
  const q = qs[i];
  const t0 = Date.now();
  const r = await api('/api/admin/covers/warm', { method: 'POST', token, body: { query: q } });
  const sec = ((Date.now() - t0) / 1000).toFixed(1);
  if (r?.data?.ok) { ok++; if (r.data.cached) cached++; console.log('[' + (i+1) + '/' + qs.length + '] ' + q + '  ' + r.data.note + '  ' + sec + 's'); }
  else { fail++; console.log('[' + (i+1) + '/' + qs.length + '] ' + q + '  ✗ ' + (r?.data?.note || '') + '  ' + sec + 's'); }
}
console.log('完成：成功 ' + ok + '（其中已有缓存 ' + cached + '）/ 失败 ' + fail);
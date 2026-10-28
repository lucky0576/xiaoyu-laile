const BASE = 'http://127.0.0.1:8787';
const api = async (p) => { const r = await fetch(BASE + p); return r.ok ? r.json() : null; };
const j = await api('/api/listings?status=published&pageSize=300');
const items = (j && j.data && j.data.items) || [];
const ids = [];
for (const it of items) {
  const m = /^\/files\/([^/]+)\//.exec(it.coverUrl || '');
  if (m) ids.push(m[1]);
}
const uniq = [...new Set(ids)];
console.log('需要预热的图: ' + uniq.length + ' 张');
let ok = 0, fail = 0;
for (let i = 0; i < uniq.length; i++) {
  for (const w of [400, 800]) {
    try {
      const r = await fetch(BASE + '/api/img/' + uniq[i] + '?w=' + w);
      if (r.ok) ok++; else fail++;
      await r.arrayBuffer();
    } catch { fail++; }
  }
  if ((i + 1) % 20 === 0) console.log('  进度 ' + (i + 1) + '/' + uniq.length);
}
console.log('完成：成功 ' + ok + ' / 失败 ' + fail);
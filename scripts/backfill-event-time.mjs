/**
 * 回填活动开始时间（从正文/标题里抓明确日期）
 *
 * 背景：19 条已发布活动里有一半 event.startAt 是空的，
 * 大多是新闻/公告采集来的，原文里其实写了日期（如「11月20日举办」），
 * 只是没有结构化字段。
 *
 * 原则：只填「正文里明确写了日期」的；抓不到的保持空（前端显示「时间待定」），
 * 绝不按发布时间瞎猜。
 *
 * 用法：node scripts/backfill-event-time.mjs
 */
const BASE = process.env.XYL_BASE || 'http://127.0.0.1:8787';
const ADMIN = { account: '13456693544', password: 'weilan0576' };

async function req(path, { method = 'GET', body, token } = {}) {
  const res = await fetch(BASE + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, json: await res.json().catch(() => null) };
}

/** 从文本里找日期，返回 YYYY-MM-DD 或 '' */
function findDate(text) {
  const s = String(text || '');
  const now = new Date();
  const year = now.getFullYear();

  // 2026年11月20日 / 2026-11-20 / 2026/11/20
  let m = /(20\d{2})\s*[年\-/.]\s*(\d{1,2})\s*[月\-/.]\s*(\d{1,2})/.exec(s);
  if (m) {
    const y = Number(m[1]);
    const mo = Number(m[2]);
    const d = Number(m[3]);
    if (mo >= 1 && mo <= 12 && d >= 1 && d <= 31) return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  }

  // 11月20日（没写年份 → 用今年，若已过去半年则算明年）
  m = /(\d{1,2})\s*月\s*(\d{1,2})\s*[日号]/.exec(s);
  if (m) {
    const mo = Number(m[1]);
    const d = Number(m[2]);
    if (mo >= 1 && mo <= 12 && d >= 1 && d <= 31) {
      let y = year;
      const guess = new Date(y, mo - 1, d);
      if (guess.getTime() < now.getTime() - 180 * 86400000) y += 1;
      return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    }
  }
  return '';
}

/** 从文本里找时间，返回 HH:MM 或 '' */
function findClock(text) {
  const m = /(\d{1,2})\s*[:：]\s*(\d{2})/.exec(String(text || ''));
  if (!m) return '';
  const h = Number(m[1]);
  const mi = Number(m[2]);
  if (h >= 0 && h <= 23 && mi >= 0 && mi <= 59) return `${String(h).padStart(2, '0')}:${String(mi).padStart(2, '0')}`;
  return '';
}

const login = await req('/api/auth/login', { method: 'POST', body: ADMIN });
const token = login.json?.data?.token;
if (!token) {
  console.error('登录失败：', JSON.stringify(login.json).slice(0, 200));
  process.exit(1);
}

const list = await req('/api/listings?category=event&pageSize=100&status=all', { token });
const items = list.json?.data?.items || [];
console.log(`活动共 ${items.length} 条`);

let filled = 0;
let skipped = 0;
const detail = [];

for (const it of items) {
  if (it.event?.startAt) {
    skipped++;
    continue;
  }
  const full = await req(`/api/listings/${it.id}`, { token });
  const l = full.json?.data?.listing;
  if (!l) {
    skipped++;
    continue;
  }
  const hay = `${l.title || ''}\n${l.subtitle || ''}\n${l.text || ''}\n${l.ai?.summary || ''}`;
  const date = findDate(hay);
  if (!date) {
    skipped++;
    continue;
  }
  const clock = findClock(hay) || '09:00';
  const startAt = `${date}T${clock}`;

  const up = await req(`/api/listings/${it.id}`, {
    method: 'PUT',
    token,
    body: { startAt },
  });
  if (up.status >= 200 && up.status < 300) {
    filled++;
    detail.push(`${(l.title || '').slice(0, 26)} → ${startAt}`);
  } else {
    skipped++;
  }
}

console.log(`已回填 ${filled} 条，跳过 ${skipped} 条`);
for (const d of detail) console.log('  ' + d);

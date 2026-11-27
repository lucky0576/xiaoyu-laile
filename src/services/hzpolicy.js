/**
 * 杭州政策通 — 服务层
 *
 * 三块数据：
 *   · 政府官网导航  —— 静态（8 个部门，固定不变）
 *   · 政策补贴      —— 落库，可后台编辑与批量导入
 *   · 最新通知文件  —— 落库，可后台编辑与批量导入
 *
 * 为什么政策与通知要落库：
 *   政策每年变、通知每周更新。写死在代码里每改一次都要发版，
 *   所以首次访问把静态数据播种进库，之后全走数据库 + 后台导入。
 */

import db, { newId } from '../store/db.js';
import {
  HZ_PORTALS,
  HZ_POLICIES,
  HZ_NOTICES,
  HZ_POLICY_CATEGORIES,
  HZ_NOTICE_TAGS,
  HZ_SOURCES,
} from '../data/hz-policies.js';

const policiesCol = () => db.collection('hz_policies');
const noticesCol = () => db.collection('hz_notices');

export { HZ_PORTALS, HZ_POLICY_CATEGORIES, HZ_NOTICE_TAGS, HZ_SOURCES };

export const SOURCE = { seed: 'seed', import: 'import', manual: 'manual' };

/* ------------------------------------------------------------------ */
/* 播种                                                                */
/* ------------------------------------------------------------------ */
let seeded = false;

export function ensureSeeded() {
  if (seeded) return;
  seeded = true;
  try {
    const now = new Date().toISOString();
    /*
     * 增量播种：不只判断「集合为空」，而是逐条比对 id。
     * 原因是静态数据会随版本增加（比如政策从 6 条扩到 26 条），
     * 如果只在空集合时播种，老环境的库里永远只有最初那几条。
     * 逐条补缺能保证升级后自动补齐，且不覆盖用户在后台改过的数据。
     */
    const existP = new Set(policiesCol().all().map((x) => x.id));
    for (const p of HZ_POLICIES) {
      if (existP.has(p.id)) continue;
      policiesCol().insert({ ...p, enabled: true, source: SOURCE.seed, createdAt: now, updatedAt: now });
    }
    const existN = new Set(noticesCol().all().map((x) => x.id));
    for (const n of HZ_NOTICES) {
      if (existN.has(n.id)) continue;
      noticesCol().insert({ ...n, enabled: true, source: SOURCE.seed, createdAt: now, updatedAt: now });
    }
    db.flush();
  } catch {
    /* 播种失败不阻塞读取 */
  }
}

function allPolicies() {
  ensureSeeded();
  const list = policiesCol().all();
  if (!list.length) return HZ_POLICIES.map((p) => ({ ...p, enabled: true, source: SOURCE.seed }));
  return list.filter((p) => p.enabled !== false);
}

function allNotices() {
  ensureSeeded();
  const list = noticesCol().all();
  if (!list.length) return HZ_NOTICES.map((n) => ({ ...n, enabled: true, source: SOURCE.seed }));
  return list.filter((n) => n.enabled !== false);
}

/* ------------------------------------------------------------------ */
/* 读取                                                                */
/* ------------------------------------------------------------------ */

export function listPolicies({ q = '', category = '' } = {}) {
  let list = allPolicies().slice();
  if (category) list = list.filter((p) => p.category === category);
  const kw = String(q || '').trim().toLowerCase();
  if (kw) {
    list = list.filter((p) =>
      `${p.name} ${p.dept} ${p.amount} ${(p.conditions || []).join(' ')}`
        .toLowerCase()
        .includes(kw),
    );
  }
  list.sort((a, b) => Number(a.seq || 0) - Number(b.seq || 0));
  return list.map((p) => ({
    id: p.id,
    seq: p.seq,
    name: p.name,
    category: p.category,
    categoryName: (HZ_POLICY_CATEGORIES.find((c) => c.id === p.category) || {}).name || p.category,
    dept: p.dept,
    amount: p.amount,
    note: p.note || '',
    source: p.source || '',
  }));
}

export function getPolicy(id) {
  return allPolicies().find((p) => p.id === String(id || '')) || null;
}

export function listNotices({ q = '', dept = '', tag = '', limit = 100 } = {}) {
  let list = allNotices().slice();
  if (dept) list = list.filter((n) => n.deptId === dept);
  if (tag) list = list.filter((n) => n.tag === tag);
  const kw = String(q || '').trim().toLowerCase();
  if (kw) list = list.filter((n) => `${n.title} ${n.dept}`.toLowerCase().includes(kw));
  list.sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
  return list.slice(0, limit);
}

/** 统计 */
export function policyStats() {
  const ps = allPolicies();
  const ns = allNotices();
  const byCategory = {};
  for (const p of ps) byCategory[p.category] = (byCategory[p.category] || 0) + 1;
  const byDept = {};
  for (const n of ns) byDept[n.deptId] = (byDept[n.deptId] || 0) + 1;
  return {
    policies: ps.length,
    notices: ns.length,
    portals: HZ_PORTALS.length,
    byCategory,
    byDept,
  };
}

/* ------------------------------------------------------------------ */
/* 后台：政策 CRUD                                                     */
/* ------------------------------------------------------------------ */

const POLICY_FIELDS = ['name', 'category', 'dept', 'amount', 'note', 'conditions', 'enabled', 'seq'];

export function createPolicy(body = {}) {
  ensureSeeded();
  const now = new Date().toISOString();
  const maxSeq = allPolicies().reduce((m, p) => Math.max(m, Number(p.seq) || 0), 0);
  const doc = {
    id: newId('hzp'),
    seq: Number(body.seq) || maxSeq + 1,
    name: String(body.name || '').trim().slice(0, 200),
    category: String(body.category || 'other').trim(),
    dept: String(body.dept || '').trim().slice(0, 100),
    amount: String(body.amount || '').trim().slice(0, 2000),
    note: String(body.note || '').trim().slice(0, 1000),
    conditions: Array.isArray(body.conditions)
      ? body.conditions.map((x) => String(x).slice(0, 300)).slice(0, 30)
      : String(body.conditions || '').split('\n').map((x) => x.trim()).filter(Boolean).slice(0, 30),
    enabled: body.enabled !== false,
    source: SOURCE.manual,
    createdAt: now,
    updatedAt: now,
  };
  if (!doc.name) {
    const e = new Error('政策名称不能为空');
    e.status = 400;
    e.code = 'name_required';
    throw e;
  }
  const saved = policiesCol().insert(doc);
  db.flush();
  return saved;
}

export function updatePolicy(id, patch = {}) {
  ensureSeeded();
  const cur = getPolicy(id);
  if (!cur) {
    const e = new Error('政策不存在');
    e.status = 404;
    e.code = 'not_found';
    throw e;
  }
  const next = {};
  for (const k of POLICY_FIELDS) {
    if (patch[k] === undefined) continue;
    if (k === 'enabled') next[k] = Boolean(patch[k]);
    else if (k === 'seq') next[k] = Number(patch[k]) || cur.seq;
    else if (k === 'conditions') {
      next[k] = Array.isArray(patch[k])
        ? patch[k].map((x) => String(x).slice(0, 300)).slice(0, 30)
        : String(patch[k]).split('\n').map((x) => x.trim()).filter(Boolean).slice(0, 30);
    } else next[k] = String(patch[k]).slice(0, 2000);
  }
  next.updatedAt = new Date().toISOString();
  const saved = policiesCol().update(id, next);
  db.flush();
  return saved;
}

export function deletePolicy(id) {
  ensureSeeded();
  const ok = policiesCol().remove(id);
  if (ok) db.flush();
  return ok;
}

/* ------------------------------------------------------------------ */
/* 后台：通知 CRUD                                                     */
/* ------------------------------------------------------------------ */

const NOTICE_FIELDS = ['title', 'dept', 'deptId', 'date', 'url', 'tag', 'enabled'];

export function createNotice(body = {}) {
  ensureSeeded();
  const now = new Date().toISOString();
  const doc = {
    id: newId('hzn'),
    title: String(body.title || '').trim().slice(0, 500),
    dept: String(body.dept || '').trim().slice(0, 100),
    deptId: String(body.deptId || 'jxj').trim(),
    date: String(body.date || '').trim().slice(0, 20),
    url: String(body.url || '').trim().slice(0, 800),
    tag: String(body.tag || '其他').trim(),
    enabled: body.enabled !== false,
    source: SOURCE.manual,
    createdAt: now,
    updatedAt: now,
  };
  if (!doc.title) {
    const e = new Error('通知标题不能为空');
    e.status = 400;
    e.code = 'title_required';
    throw e;
  }
  const saved = noticesCol().insert(doc);
  db.flush();
  return saved;
}

export function updateNotice(id, patch = {}) {
  ensureSeeded();
  const cur = allNotices().find((n) => n.id === String(id || ''));
  if (!cur) {
    const e = new Error('通知不存在');
    e.status = 404;
    e.code = 'not_found';
    throw e;
  }
  const next = {};
  for (const k of NOTICE_FIELDS) {
    if (patch[k] === undefined) continue;
    if (k === 'enabled') next[k] = Boolean(patch[k]);
    else next[k] = String(patch[k]).slice(0, 800);
  }
  next.updatedAt = new Date().toISOString();
  const saved = noticesCol().update(id, next);
  db.flush();
  return saved;
}

export function deleteNotice(id) {
  ensureSeeded();
  const ok = noticesCol().remove(id);
  if (ok) db.flush();
  return ok;
}

/* ------------------------------------------------------------------ */
/* 后台：批量导入                                                      */
/* ------------------------------------------------------------------ */

/**
 * 导入政策或通知。
 *
 * 输入：JSON 数组，或 TSV（制表符分隔，从 Excel 直接复制）。
 *
 * 去重：政策按「名称」，通知按「标题」。
 */
export function importBatch(kind, rawText) {
  ensureSeeded();
  const isNotice = kind === 'notices';
  const col = isNotice ? noticesCol() : policiesCol();
  const text = String(rawText || '').trim();
  if (!text) {
    const e = new Error('导入内容为空');
    e.status = 400;
    e.code = 'empty';
    throw e;
  }

  let rows = [];
  if (text.startsWith('[')) {
    try {
      rows = JSON.parse(text);
    } catch {
      const e = new Error('JSON 格式有误，请检查括号与引号');
      e.status = 400;
      e.code = 'bad_json';
      throw e;
    }
    if (!Array.isArray(rows)) rows = [rows];
  } else {
    const lines = text.split(/\r?\n/).filter((l) => l.trim());
    let start = 0;
    if (lines.length && /标题|名称|序号|日期|部门/.test(lines[0]) && !/^\d{4}-/.test(lines[0])) start = 1;
    for (let i = start; i < lines.length; i++) {
      const c = lines[i].split('\t');
      if (isNotice) {
        // 标题 | 部门 | 日期 | 链接 | 标签
        rows.push({ title: c[0], dept: c[1], date: c[2], url: c[3], tag: c[4] });
      } else {
        // 名称 | 分类 | 部门 | 补贴金额 | 申报条件(用 | 分隔) | 备注
        rows.push({
          name: c[0],
          category: c[1],
          dept: c[2],
          amount: c[3],
          conditions: (c[4] || '').split('|'),
          note: c[5],
        });
      }
    }
  }

  const now = new Date().toISOString();
  const added = [];
  const skipped = [];
  const failed = [];

  const guessCategory = (t) => {
    const s = String(t || '');
    if (/创业|大学生|人才/.test(s)) return 'startup';
    if (/房租|场地|孵化器/.test(s)) return 'rent';
    if (/社保|招工|就业|毕业生/.test(s)) return 'employ';
    if (/认定|高新|科技型|专精特新|小巨人/.test(s)) return 'qualify';
    if (/补贴|奖励|资助|贴息/.test(s)) return 'subsidy';
    return 'other';
  };

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i] || {};
    try {
      if (isNotice) {
        const title = String(r.title || '').trim();
        if (!title) {
          failed.push({ row: i + 1, reason: '缺少标题' });
          continue;
        }
        const dup = col.findOne((x) => String(x.title || '').trim() === title);
        if (dup) {
          skipped.push({ row: i + 1, reason: `已存在：${title.slice(0, 30)}`, id: dup.id });
          continue;
        }
        const doc = {
          id: newId('hzn'),
          title: title.slice(0, 500),
          dept: String(r.dept || '').trim().slice(0, 100),
          deptId: String(r.deptId || 'jxj').trim(),
          date: String(r.date || '').trim().slice(0, 20),
          url: String(r.url || '').trim().slice(0, 800),
          tag: String(r.tag || '其他').trim(),
          enabled: true,
          source: SOURCE.import,
          createdAt: now,
          updatedAt: now,
        };
        col.insert(doc);
        added.push({ id: doc.id, name: doc.title.slice(0, 40) });
      } else {
        const name = String(r.name || '').trim();
        if (!name) {
          failed.push({ row: i + 1, reason: '缺少政策名称' });
          continue;
        }
        const dup = col.findOne((x) => String(x.name || '').trim() === name);
        if (dup) {
          skipped.push({ row: i + 1, reason: `已存在：${name.slice(0, 30)}`, id: dup.id });
          continue;
        }
        const maxSeq = col.all().reduce((m, x) => Math.max(m, Number(x.seq) || 0), 0);
        const conds = Array.isArray(r.conditions)
          ? r.conditions.map((x) => String(x).trim()).filter(Boolean).slice(0, 30)
          : String(r.conditions || '').split('\n').map((x) => x.trim()).filter(Boolean).slice(0, 30);
        const doc = {
          id: newId('hzp'),
          seq: maxSeq + 1,
          name: name.slice(0, 200),
          category: String(r.category || guessCategory(name)).trim() || 'other',
          dept: String(r.dept || '').trim().slice(0, 100),
          amount: String(r.amount || '').trim().slice(0, 2000),
          conditions: conds,
          note: String(r.note || '').trim().slice(0, 1000),
          enabled: true,
          source: SOURCE.import,
          createdAt: now,
          updatedAt: now,
        };
        col.insert(doc);
        added.push({ id: doc.id, name: doc.name.slice(0, 40) });
      }
    } catch (err) {
      failed.push({ row: i + 1, reason: err.message || '写入失败' });
    }
  }

  db.flush();
  return {
    kind: isNotice ? 'notices' : 'policies',
    parsed: rows.length,
    added: added.length,
    skipped: skipped.length,
    failed: failed.length,
    addedItems: added.slice(0, 50),
    skippedItems: skipped.slice(0, 50),
    failedItems: failed.slice(0, 50),
  };
}

/** 清空导入数据 */
export function clearImported(kind) {
  const col = kind === 'notices' ? noticesCol() : policiesCol();
  let n = 0;
  for (const x of col.all()) {
    if (x.source === SOURCE.import) {
      col.remove(x.id);
      n++;
    }
  }
  if (n) db.flush();
  return n;
}

/** 后台：全量列表（含下架） */
export function listPoliciesAdmin({ q = '' } = {}) {
  let list = policiesCol().all();
  if (!list.length) list = HZ_POLICIES.map((p) => ({ ...p, enabled: true, source: SOURCE.seed }));
  const kw = String(q || '').trim().toLowerCase();
  if (kw) list = list.filter((p) => `${p.name} ${p.dept}`.toLowerCase().includes(kw));
  list.sort((a, b) => Number(a.seq || 0) - Number(b.seq || 0));
  return list.map((p) => ({ ...p, enabled: p.enabled !== false }));
}

export function listNoticesAdmin({ q = '' } = {}) {
  let list = noticesCol().all();
  if (!list.length) list = HZ_NOTICES.map((n) => ({ ...n, enabled: true, source: SOURCE.seed }));
  const kw = String(q || '').trim().toLowerCase();
  if (kw) list = list.filter((n) => String(n.title || '').toLowerCase().includes(kw));
  list.sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
  return list.map((n) => ({ ...n, enabled: n.enabled !== false }));
}

export default {
  HZ_PORTALS,
  HZ_POLICY_CATEGORIES,
  HZ_NOTICE_TAGS,
  HZ_SOURCES,
  SOURCE,
  ensureSeeded,
  listPolicies,
  getPolicy,
  listNotices,
  policyStats,
  createPolicy,
  updatePolicy,
  deletePolicy,
  createNotice,
  updateNotice,
  deleteNotice,
  importBatch,
  clearImported,
  listPoliciesAdmin,
  listNoticesAdmin,
};

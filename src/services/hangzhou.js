/**
 * 小鱼来了 — 场景广场交易（杭州 AI+X 场景供需对接）
 *
 * 数据流：
 *   首次访问时把 src/data/hangzhou-scenes.js 的静态数据**播种**到数据库，
 *   之后一切读写都走数据库。这样从「杭州场景创新平台」导出的新需求/能力
 *   可以直接批量导入，不用改代码发版。
 *
 * 为什么保留静态数据：它是「出厂默认值」。库被清空能自动恢复。
 *
 * 三件事：
 *   1. 需求 / 能力的 CRUD 与批量导入
 *   2. 供需双向匹配（关键词可解释打分）
 *   3. 对接意向落库
 */

import db, { newId } from '../store/db.js';
import {
  HZ_NEEDS,
  HZ_CAPS,
  HZ_CATEGORIES,
  HZ_CONTACT,
} from '../data/hangzhou-scenes.js';

const needsCol = () => db.collection('hangzhou_needs');
const capsCol = () => db.collection('hangzhou_caps');
const intents = () => db.collection('hangzhou_intents');

export { HZ_CATEGORIES, HZ_CONTACT };

/** 对接意向状态 */
export const INTENT_STATUS = {
  submitted: '已提交',
  matched: '已匹配能力方',
  contacted: '已电话对接',
  closed: '已结束',
};

/** 数据来源标记，便于区分出厂数据与导入数据 */
export const SOURCE = { seed: 'seed', import: 'import', manual: 'manual' };

/* ------------------------------------------------------------------ */
/* 播种                                                                */
/* ------------------------------------------------------------------ */
let seedChecked = false;

export function ensureSeeded() {
  if (seedChecked) return;
  seedChecked = true;
  try {
    const now = new Date().toISOString();
    if (needsCol().count() === 0) {
      for (const n of HZ_NEEDS) {
        needsCol().insert({ ...n, source: SOURCE.seed, enabled: true, createdAt: now, updatedAt: now });
      }
    }
    if (capsCol().count() === 0) {
      for (const c of HZ_CAPS) {
        capsCol().insert({ ...c, source: SOURCE.seed, enabled: true, createdAt: now, updatedAt: now });
      }
    }
    db.flush();
  } catch {
    /* 播种失败不阻塞读取，下面会回退到静态数据 */
  }
}

/* ------------------------------------------------------------------ */
/* 内部：取全量（DB 优先，空则回退静态）                                */
/* ------------------------------------------------------------------ */
function allNeeds() {
  ensureSeeded();
  let list = needsCol().all();
  if (!list.length) {
    return HZ_NEEDS.map((n) => ({ ...n, source: SOURCE.seed, enabled: true }));
  }
  return list.filter((n) => n.enabled !== false);
}

function allCaps() {
  ensureSeeded();
  let list = capsCol().all();
  if (!list.length) {
    return HZ_CAPS.map((c) => ({ ...c, source: SOURCE.seed, enabled: true }));
  }
  return list.filter((c) => c.enabled !== false);
}

/* ------------------------------------------------------------------ */
/* 读取                                                                */
/* ------------------------------------------------------------------ */

function briefNeed(n) {
  return {
    id: n.id,
    seq: n.seq,
    org: n.org,
    scene: n.scene,
    mode: n.mode,
    area: n.area || '',
    category: n.category || '',
    source: n.source || '',
    summary: String(n.content || '').replace(/\s+/g, ' ').slice(0, 70),
  };
}

function briefCap(c) {
  return {
    id: c.id,
    seq: c.seq,
    company: c.company,
    project: c.project,
    category: c.category,
    categoryName: (HZ_CATEGORIES.find((x) => x.id === c.category) || {}).name || c.category,
    categoryRaw: c.categoryRaw,
    mode: c.mode,
    source: c.source || '',
    summary: String(c.ability || '').replace(/\s+/g, ' ').slice(0, 70),
  };
}

/** 需求列表 */
export function listNeeds({ q = '', type = '' } = {}) {
  let list = allNeeds().slice();
  const kw = String(q || '').trim().toLowerCase();
  if (kw) {
    list = list.filter((n) =>
      `${n.org} ${n.scene} ${n.content} ${n.mode} ${n.area || ''}`.toLowerCase().includes(kw),
    );
  }
  if (type === 'withContent') list = list.filter((n) => n.content);
  list.sort((a, b) => Number(a.seq || 0) - Number(b.seq || 0));
  return list.map(briefNeed);
}

/** 能力列表 */
export function listCaps({ q = '', category = '' } = {}) {
  let list = allCaps().slice();
  if (category) list = list.filter((c) => c.category === category);
  const kw = String(q || '').trim().toLowerCase();
  if (kw) {
    list = list.filter((c) =>
      `${c.company} ${c.project} ${c.categoryRaw} ${c.ability} ${c.mode}`.toLowerCase().includes(kw),
    );
  }
  list.sort((a, b) => Number(a.seq || 0) - Number(b.seq || 0));
  return list.map(briefCap);
}

/** 后台：全部需求（含下架） */
export function listNeedsAdmin({ q = '' } = {}) {
  let list = needsCol().all();
  if (!list.length) list = HZ_NEEDS.map((n) => ({ ...n, source: SOURCE.seed, enabled: true }));
  const kw = String(q || '').trim().toLowerCase();
  if (kw) list = list.filter((n) => `${n.org} ${n.scene}`.toLowerCase().includes(kw));
  list.sort((a, b) => Number(a.seq || 0) - Number(b.seq || 0));
  return list.map((n) => ({ ...briefNeed(n), enabled: n.enabled !== false, hasContent: Boolean(n.content) }));
}

/** 后台：全部能力（含下架） */
export function listCapsAdmin({ q = '', category = '' } = {}) {
  let list = capsCol().all();
  if (!list.length) list = HZ_CAPS.map((c) => ({ ...c, source: SOURCE.seed, enabled: true }));
  if (category) list = list.filter((c) => c.category === category);
  const kw = String(q || '').trim().toLowerCase();
  if (kw) list = list.filter((c) => `${c.company} ${c.project}`.toLowerCase().includes(kw));
  list.sort((a, b) => Number(a.seq || 0) - Number(b.seq || 0));
  return list.map((c) => ({ ...briefCap(c), enabled: c.enabled !== false, hasAbility: Boolean(c.ability) }));
}

export function getNeed(id) {
  return allNeeds().find((n) => n.id === String(id || '')) || null;
}

export function getCap(id) {
  const c = allCaps().find((x) => x.id === String(id || ''));
  if (!c) return null;
  return {
    ...c,
    categoryName: (HZ_CATEGORIES.find((x) => x.id === c.category) || {}).name || c.category,
  };
}

/** 统计 */
export function sceneStats() {
  const needs = allNeeds();
  const caps = allCaps();
  const byCategory = {};
  for (const c of caps) byCategory[c.category] = (byCategory[c.category] || 0) + 1;
  return {
    needs: needs.length,
    caps: caps.length,
    byCategory,
    importedNeeds: needs.filter((n) => n.source === SOURCE.import).length,
    importedCaps: caps.filter((c) => c.source === SOURCE.import).length,
  };
}

/* ------------------------------------------------------------------ */
/* 供需匹配                                                            */
/* ------------------------------------------------------------------ */

const KEYWORD_BANK = [
  '工业视觉', '机器视觉', '视觉', '缺陷检测', '缺陷识别', '外观检测', '质检', '图像识别',
  '图像采集', '多模态检测', '异物检测', 'OCR',
  '预测性维护', '设备诊断', '故障诊断', '设备状态', '排产', '高级排产', '数字孪生',
  '工业软件', '工业大数据', '工业物联网', '云边协同', '边缘计算', '传感器', '传感网关',
  '数据采集', '时序预测', '异常检测', '产线', '产线信号', 'DCS', '工单',
  '大模型', '智能体', '知识库', '知识图谱', 'RAG', 'AI 应用', 'AI应用', '算法',
  '数据治理', '数据空间', '算力', 'GPU', '私有化部署', '本地部署', 'SaaS', 'API',
  '低代码', '小程序', '数字员工', '数据中台', '模型训练', '模型部署',
  '招投标', '标书', '投标', '招标文件', '评审', '合规', '文档解析', '排版',
  '语音识别', '语音合成', '多语种', '译制', '配音', '字幕', '多模态',
  '游戏', '美术', '动画', '三维', '渲染', '骨骼',
  '动作捕捉', '具身智能', '机器人', '无人机', '机器狗', '避障', '巡检', '灵巧手',
  '康养', '养老', '独居', '健康', '营养', '医疗', '康复', '慢病',
  '食品安全', '检疫', '屠宰', '溯源',
  '文旅', '文博', '博物馆', '讲解', '景区', '活动', '报名', '核销', '演出',
  '教育', '教辅', '学情', '考试', '课程', '培训', '研学',
  '金融', '尽调', '风控', '授信', '招商', '产业数据', '企业画像', '客群',
  '农业', '种植', '种业', '农机', '农事',
];

function pickKeywords(text) {
  const t = String(text || '');
  const hit = [];
  for (const k of KEYWORD_BANK) if (t.includes(k)) hit.push(k);
  return hit;
}

function inferNeedCategory(need) {
  const t = `${need.scene} ${need.content}`;
  const rules = [
    ['gov', /民政|政府|政务|城市|公安|海事|应急|招商|产业|园区/],
    ['industry', /制造|工厂|产线|设备|质检|车间|工业|排产|物流|生产/],
    ['culture', /文化|文博|博物馆|文旅|景区|活动|赛事|演出|影视|游戏|内容/],
    ['edu', /教育|教辅|教学|学校|课程|培训|研学/],
    ['health', /康养|养老|健康|医疗|护理|康复|营养|独居/],
    ['agri', /农业|种植|种业|农机|生猪|屠宰|检疫|食品/],
    ['finance', /金融|投资|融资|授信|股权/],
    ['consume', /消费|零售|商业|本地生活/],
    ['biz', /数字化|企业|管理|办公|投标|标书/],
  ];
  for (const [cid, re] of rules) if (re.test(t)) return cid;
  return '';
}

/** 给某条需求推荐能力方 */
export function matchCapsForNeed(needId, limit = 6) {
  const need = getNeed(needId);
  if (!need) return null;

  const needKw = new Set(pickKeywords(`${need.scene} ${need.content}`));
  const needCat = inferNeedCategory(need);
  const scored = [];

  for (const c of allCaps()) {
    const capKw = pickKeywords(`${c.project} ${c.categoryRaw} ${c.ability}`);
    const common = capKw.filter((k) => needKw.has(k));
    let score = common.length * 2;
    const reasons = [];

    if (common.length) reasons.push(`共同技术方向：${common.slice(0, 4).join('、')}`);
    if (score > 0) reasons.push(`${c.company} 在「${c.categoryRaw || c.project}」方向有落地能力`);

    if (score === 0 && needCat && needCat === c.category) {
      score = 1;
      reasons.push(`同属「${(HZ_CATEGORIES.find((x) => x.id === c.category) || {}).name || c.category}」方向，可进一步沟通`);
    }

    if (score > 0) scored.push({ ...briefCap(c), score, commonWords: common, reasons });
  }

  scored.sort((a, b) => b.score - a.score || a.seq - b.seq);
  return { need: briefNeed(need), total: scored.length, items: scored.slice(0, limit) };
}

/** 反向：能力方可以对接哪些需求 */
export function matchNeedsForCap(capId, limit = 6) {
  const cap = getCap(capId);
  if (!cap) return null;
  const capKw = new Set(pickKeywords(`${cap.project} ${cap.categoryRaw} ${cap.ability}`));

  const scored = [];
  for (const n of allNeeds()) {
    const needKw = pickKeywords(`${n.scene} ${n.content}`);
    const common = needKw.filter((k) => capKw.has(k));
    if (!common.length) continue;
    scored.push({
      ...briefNeed(n),
      score: common.length * 2,
      commonWords: common,
      reasons: [`该需求提到：${common.slice(0, 4).join('、')}`],
    });
  }
  scored.sort((a, b) => b.score - a.score);
  return { cap, total: scored.length, items: scored.slice(0, limit) };
}

/* ------------------------------------------------------------------ */
/* 后台：CRUD                                                          */
/* ------------------------------------------------------------------ */

const NEED_FIELDS = ['org', 'scene', 'content', 'mode', 'area', 'category', 'enabled', 'seq'];
const CAP_FIELDS = ['company', 'project', 'category', 'categoryRaw', 'ability', 'mode', 'enabled', 'seq'];

function nextId(prefix, col) {
  const max = col.all().reduce((m, x) => Math.max(m, Number(String(x.id || '').replace(/\D/g, '')) || 0), 0);
  return `${prefix}${String(max + 1).padStart(2, '0')}`;
}

function nextSeq(col) {
  return col.all().reduce((m, x) => Math.max(m, Number(x.seq) || 0), 0) + 1;
}

export function createNeed(body = {}) {
  ensureSeeded();
  const now = new Date().toISOString();
  const doc = {
    id: nextId('hz-n', needsCol()),
    seq: Number(body.seq) || nextSeq(needsCol()),
    org: String(body.org || '').trim().slice(0, 200),
    scene: String(body.scene || '').trim().slice(0, 300),
    content: String(body.content || '').trim().slice(0, 5000),
    mode: String(body.mode || '').trim().slice(0, 200),
    area: String(body.area || '').trim().slice(0, 100),
    category: String(body.category || '').trim(),
    enabled: body.enabled !== false,
    source: SOURCE.manual,
    createdAt: now,
    updatedAt: now,
  };
  if (!doc.scene) {
    const e = new Error('需求场景不能为空');
    e.status = 400;
    e.code = 'scene_required';
    throw e;
  }
  const saved = needsCol().insert(doc);
  db.flush();
  return saved;
}

export function updateNeed(id, patch = {}) {
  ensureSeeded();
  const cur = getNeed(id);
  if (!cur) {
    const e = new Error('需求不存在');
    e.status = 404;
    e.code = 'not_found';
    throw e;
  }
  const next = {};
  for (const k of NEED_FIELDS) {
    if (patch[k] === undefined) continue;
    if (k === 'enabled') next[k] = Boolean(patch[k]);
    else if (k === 'seq') next[k] = Number(patch[k]) || cur.seq;
    else next[k] = String(patch[k]).slice(0, 5000);
  }
  next.updatedAt = new Date().toISOString();
  const saved = needsCol().update(id, next);
  db.flush();
  return saved;
}

export function deleteNeed(id) {
  ensureSeeded();
  const ok = needsCol().remove(id);
  if (ok) db.flush();
  return ok;
}

export function createCap(body = {}) {
  ensureSeeded();
  const now = new Date().toISOString();
  const doc = {
    id: nextId('hz-c', capsCol()),
    seq: Number(body.seq) || nextSeq(capsCol()),
    company: String(body.company || '').trim().slice(0, 200),
    project: String(body.project || '').trim().slice(0, 300),
    category: String(body.category || 'other').trim(),
    categoryRaw: String(body.categoryRaw || '').trim().slice(0, 200),
    ability: String(body.ability || '').trim().slice(0, 8000),
    mode: String(body.mode || '').trim().slice(0, 500),
    enabled: body.enabled !== false,
    source: SOURCE.manual,
    createdAt: now,
    updatedAt: now,
  };
  if (!doc.company) {
    const e = new Error('企业名称不能为空');
    e.status = 400;
    e.code = 'company_required';
    throw e;
  }
  const saved = capsCol().insert(doc);
  db.flush();
  return saved;
}

export function updateCap(id, patch = {}) {
  ensureSeeded();
  const cur = getCap(id);
  if (!cur) {
    const e = new Error('能力方不存在');
    e.status = 404;
    e.code = 'not_found';
    throw e;
  }
  const next = {};
  for (const k of CAP_FIELDS) {
    if (patch[k] === undefined) continue;
    if (k === 'enabled') next[k] = Boolean(patch[k]);
    else if (k === 'seq') next[k] = Number(patch[k]) || cur.seq;
    else next[k] = String(patch[k]).slice(0, 8000);
  }
  next.updatedAt = new Date().toISOString();
  const saved = capsCol().update(id, next);
  db.flush();
  return saved;
}

export function deleteCap(id) {
  ensureSeeded();
  const ok = capsCol().remove(id);
  if (ok) db.flush();
  return ok;
}

/* ------------------------------------------------------------------ */
/* 后台：批量导入                                                      */
/* ------------------------------------------------------------------ */

/**
 * 批量导入需求或能力。
 *
 * 支持两种输入：
 *   1. JSON 数组：[{...}, {...}]
 *   2. TSV / 制表符文本：每行一条，字段按 tab 分隔
 *
 * 去重规则：需求按「场景 + 需求单位」判重，能力按「企业名称」判重。
 *   —— 这两个字段是最能代表"同一条"的。重名不重场景算两条。
 *
 * 导入的条目 source 标记为 import，便于和出厂数据区分、也方便回滚。
 */
export function importBatch(kind, rawText) {
  ensureSeeded();
  const isCaps = kind === 'caps';
  const col = isCaps ? capsCol() : needsCol();
  const text = String(rawText || '').trim();
  if (!text) {
    const e = new Error('导入内容为空');
    e.status = 400;
    e.code = 'empty';
    throw e;
  }

  /* ---------- ① 解析 ---------- */
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
    // TSV：跳过表头行（第一行含常见表头词）
    const lines = text.split(/\r?\n/).filter((l) => l.trim());
    let start = 0;
    if (lines.length && /需求单位|企业名称|序号|场景|单位/.test(lines[0]) && !/^\d/.test(lines[0])) {
      start = 1;
    }
    for (let i = start; i < lines.length; i++) {
      const cells = lines[i].split('\t');
      if (isCaps) {
        // 序号 企业名称 项目及场景简介 场景类别 可提供能力 合作模式
        const off = /^\d+$/.test((cells[0] || '').trim()) ? 1 : 0;
        rows.push({
          company: cells[off] || '',
          project: cells[off + 1] || '',
          categoryRaw: cells[off + 2] || '',
          ability: cells[off + 3] || '',
          mode: cells[off + 4] || '',
        });
      } else {
        // 序号 场景需求单位 需求场景 需求具体内容 合作模式
        const off = /^\d+$/.test((cells[0] || '').trim()) ? 1 : 0;
        rows.push({
          org: cells[off] || '',
          scene: cells[off + 1] || '',
          content: cells[off + 2] || '',
          mode: cells[off + 3] || '',
        });
      }
    }
  }

  /* ---------- ② 逐条校验 + 去重 + 写入 ---------- */
  const now = new Date().toISOString();
  const added = [];
  const skipped = [];
  const failed = [];

  const guessCategory = (text) => {
    const t = String(text || '');
    const rules = [
      ['gov', /政务|城市治理|公安|海事|应急|招商|园区|产业/],
      ['industry', /工业|制造|工厂|产线|设备|质检|排产|物流|半导体|机器视觉/],
      ['culture', /文旅|文博|博物馆|文化|影视|游戏|活动|景区/],
      ['edu', /教育|教辅|学情|课程|培训/],
      ['health', /康养|养老|健康|医疗|康复|营养/],
      ['finance', /金融|投融资|尽调|风控/],
      ['consume', /消费|零售|商业|本地生活/],
      ['agri', /农业|种植|种业|农机|食品/],
      ['biz', /数字化|企业|管理|办公|投标|标书/],
    ];
    for (const [cid, re] of rules) if (re.test(t)) return cid;
    return 'other';
  };

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i] || {};
    try {
      if (isCaps) {
        const company = String(r.company || '').trim();
        if (!company) {
          failed.push({ row: i + 1, reason: '缺少企业名称' });
          continue;
        }
        const dup = col.findOne(
          (x) => String(x.company || '').trim() === company &&
                 String(x.project || '').trim() === String(r.project || '').trim(),
        );
        if (dup) {
          skipped.push({ row: i + 1, reason: `已存在：${company}`, id: dup.id });
          continue;
        }
        const doc = {
          id: nextId('hz-c', capsCol()),
          seq: nextSeq(capsCol()),
          company: company.slice(0, 200),
          project: String(r.project || '').trim().slice(0, 300),
          category: r.category || guessCategory(`${r.project} ${r.categoryRaw} ${r.ability}`),
          categoryRaw: String(r.categoryRaw || '').trim().slice(0, 200),
          ability: String(r.ability || '').trim().slice(0, 8000),
          mode: String(r.mode || '').trim().slice(0, 500),
          enabled: true,
          source: SOURCE.import,
          createdAt: now,
          updatedAt: now,
        };
        col.insert(doc);
        added.push({ id: doc.id, name: company });
      } else {
        const scene = String(r.scene || '').trim();
        const org = String(r.org || '').trim();
        if (!scene) {
          failed.push({ row: i + 1, reason: '缺少需求场景' });
          continue;
        }
        const dup = col.findOne(
          (x) => String(x.scene || '').trim() === scene && String(x.org || '').trim() === org,
        );
        if (dup) {
          skipped.push({ row: i + 1, reason: `已存在：${scene}（${org}）`, id: dup.id });
          continue;
        }
        const doc = {
          id: nextId('hz-n', needsCol()),
          seq: nextSeq(needsCol()),
          org: org.slice(0, 200),
          scene: scene.slice(0, 300),
          content: String(r.content || '').trim().slice(0, 5000),
          mode: String(r.mode || '').trim().slice(0, 200),
          area: String(r.area || '').trim().slice(0, 100),
          category: r.category || guessCategory(`${scene} ${r.content}`),
          enabled: true,
          source: SOURCE.import,
          createdAt: now,
          updatedAt: now,
        };
        col.insert(doc);
        added.push({ id: doc.id, name: scene });
      }
    } catch (err) {
      failed.push({ row: i + 1, reason: err.message || '写入失败' });
    }
  }

  db.flush();
  return {
    kind: isCaps ? 'caps' : 'needs',
    parsed: rows.length,
    added: added.length,
    skipped: skipped.length,
    failed: failed.length,
    addedItems: added.slice(0, 50),
    skippedItems: skipped.slice(0, 50),
    failedItems: failed.slice(0, 50),
  };
}

/** 删除某次导入的全部数据（source=import） */
export function clearImported(kind) {
  const isCaps = kind === 'caps';
  const col = isCaps ? capsCol() : needsCol();
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

/* ------------------------------------------------------------------ */
/* 对接意向                                                            */
/* ------------------------------------------------------------------ */

export function submitIntent(user, body = {}) {
  const kind = body.kind === 'cap' ? 'cap' : 'need';
  const targetId = String(body.targetId || '').trim();
  const target = kind === 'need' ? getNeed(targetId) : getCap(targetId);
  if (!target) {
    const err = new Error('对接对象不存在');
    err.status = 404;
    err.code = 'target_not_found';
    throw err;
  }

  const existing = intents().findOne(
    (x) => x.userId === user.id && x.targetId === targetId && x.status !== 'closed',
  );
  if (existing) {
    const err = new Error('你已提交过这条对接意向，请等待跟进');
    err.status = 409;
    err.code = 'duplicate_intent';
    throw err;
  }

  const now = new Date().toISOString();
  return intents().insert({
    id: newId('hzi'),
    userId: user.id,
    kind,
    targetId,
    targetName: kind === 'need' ? target.scene : target.company,
    companyName: String(body.companyName || '').trim().slice(0, 120),
    contactName: String(body.contactName || '').trim().slice(0, 40),
    contactPhone: String(body.contactPhone || '').replace(/[^\d+]/g, '').slice(0, 20),
    note: String(body.note || '').trim().slice(0, 1000),
    status: 'submitted',
    createdAt: now,
    updatedAt: now,
  });
}

export function listMyIntents(userId) {
  return intents()
    .where('userId', userId)
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
    .map((x) => ({ ...x, statusName: INTENT_STATUS[x.status] || x.status }));
}

export function listAllIntents({ status = '', limit = 100 } = {}) {
  let list = intents().all();
  if (status) list = list.filter((x) => x.status === status);
  list.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  return list.slice(0, limit).map((x) => ({ ...x, statusName: INTENT_STATUS[x.status] || x.status }));
}

export function setIntentStatus(id, status) {
  if (!INTENT_STATUS[status]) {
    const err = new Error('状态不合法');
    err.status = 400;
    err.code = 'bad_status';
    throw err;
  }
  return intents().update(id, { status });
}

export default {
  HZ_CATEGORIES,
  HZ_CONTACT,
  INTENT_STATUS,
  SOURCE,
  ensureSeeded,
  listNeeds,
  listCaps,
  listNeedsAdmin,
  listCapsAdmin,
  getNeed,
  getCap,
  sceneStats,
  matchCapsForNeed,
  matchNeedsForCap,
  createNeed,
  updateNeed,
  deleteNeed,
  createCap,
  updateCap,
  deleteCap,
  importBatch,
  clearImported,
  submitIntent,
  listMyIntents,
  listAllIntents,
  setIntentStatus,
};

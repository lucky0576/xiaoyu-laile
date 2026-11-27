/**
 * 杭州「AI+X」场景供需对接
 *
 * 数据来源（2026 首批，官方清单）：
 *   场景需求清单2026下载.xlsx    → 10 条需求
 *   场景能力信息征集2026下载.xlsx → 20 家企业能力
 *
 * 三件事：
 *   1. 列表 / 详情 —— 数据在代码里，纯读
 *   2. 供需匹配 —— 按场景关键词把需求方和能力方对上
 *   3. 对接意向 —— 用户提交后落库，由运营方按官方渠道跟进
 *
 * 为什么匹配用关键词而不是 AI：
 *   这两份清单是**官方公示**的，匹配结果要给双方看、要能解释。
 *   "为什么把 A 推荐给 B" 必须能说清楚，所以用可复现的关键词打分。
 */

import db, { newId } from '../store/db.js';
import {
  HZ_NEEDS,
  HZ_CAPS,
  HZ_NEED_MAP,
  HZ_CAP_MAP,
  HZ_CATEGORIES,
  HZ_CONTACT,
} from '../data/hangzhou-scenes.js';

const intents = () => db.collection('hangzhou_intents');

export { HZ_CATEGORIES, HZ_CONTACT };

/** 对接意向状态 */
export const INTENT_STATUS = {
  submitted: '已提交',
  matched: '已匹配能力方',
  contacted: '已电话对接',
  closed: '已结束',
};

/* ------------------------------------------------------------------ */
/* 读取                                                                */
/* ------------------------------------------------------------------ */

/** 需求列表 */
export function listNeeds({ q = '', type = '' } = {}) {
  let list = HZ_NEEDS.slice();
  const kw = String(q || '').trim().toLowerCase();
  if (kw) {
    list = list.filter((n) =>
      `${n.org} ${n.scene} ${n.content} ${n.mode}`.toLowerCase().includes(kw),
    );
  }
  if (type === 'withContent') list = list.filter((n) => n.content);
  return list.map(briefNeed);
}

/** 能力列表 */
export function listCaps({ q = '', category = '' } = {}) {
  let list = HZ_CAPS.slice();
  if (category) list = list.filter((c) => c.category === category);
  const kw = String(q || '').trim().toLowerCase();
  if (kw) {
    list = list.filter((c) =>
      `${c.company} ${c.project} ${c.categoryRaw} ${c.ability} ${c.mode}`.toLowerCase().includes(kw),
    );
  }
  return list.map(briefCap);
}

function briefNeed(n) {
  return {
    id: n.id,
    seq: n.seq,
    org: n.org,
    scene: n.scene,
    mode: n.mode,
    // 列表只给摘要，详情页给全文
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
    summary: String(c.ability || '').replace(/\s+/g, ' ').slice(0, 70),
  };
}

export function getNeed(id) {
  return HZ_NEED_MAP[String(id || '')] || null;
}

export function getCap(id) {
  const c = HZ_CAP_MAP[String(id || '')] || null;
  if (!c) return null;
  return {
    ...c,
    categoryName: (HZ_CATEGORIES.find((x) => x.id === c.category) || {}).name || c.category,
  };
}

/** 统计 */
export function sceneStats() {
  const byCategory = {};
  for (const c of HZ_CAPS) byCategory[c.category] = (byCategory[c.category] || 0) + 1;
  return {
    needs: HZ_NEEDS.length,
    caps: HZ_CAPS.length,
    byCategory,
  };
}

/* ------------------------------------------------------------------ */
/* 供需匹配                                                            */
/* ------------------------------------------------------------------ */

/*
 * 关键词打分：
 *   从需求里抽出「技术/场景关键词」，再和每家企业的项目名+能力描述比对。
 *   命中一个 +2，命中多个累加；同分类再 +1。
 *   只返回有命中的，避免推荐一堆不相关企业。
 */
const KEYWORD_BANK = [
  // 视觉 / 检测
  '工业视觉', '机器视觉', '视觉', '缺陷检测', '缺陷识别', '外观检测', '质检', '图像识别',
  '图像采集', '多模态检测', '异物检测', 'OCR',
  // 工业 / 制造
  '预测性维护', '设备诊断', '故障诊断', '设备状态', '排产', '高级排产', '数字孪生',
  '工业软件', '工业大数据', '工业物联网', '云边协同', '边缘计算', '传感器', '传感网关',
  '数据采集', '时序预测', '异常检测', '产线', '产线信号', 'DCS', '工单',
  // AI / 平台
  '大模型', '智能体', '知识库', '知识图谱', 'RAG', 'AI 应用', 'AI应用', '算法',
  '数据治理', '数据空间', '算力', 'GPU', '私有化部署', '本地部署', 'SaaS', 'API',
  '低代码', '小程序', '数字员工', '数据中台', '模型训练', '模型部署',
  // 招投标 / 文档
  '招投标', '标书', '投标', '招标文件', '评审', '合规', '文档解析', '排版',
  // 语音 / 内容
  '语音识别', '语音合成', '多语种', '译制', '配音', '字幕', '多模态',
  '游戏', '美术', '动画', '三维', '渲染', '骨骼',
  // 空间 / 具身
  '动作捕捉', '具身智能', '机器人', '无人机', '机器狗', '避障', '巡检', '灵巧手',
  // 行业场景
  '康养', '养老', '独居', '健康', '营养', '医疗', '康复', '慢病',
  '食品安全', '检疫', '屠宰', '溯源',
  '文旅', '文博', '博物馆', '讲解', '景区', '活动', '报名', '核销', '演出', '演出赛事',
  '教育', '教辅', '学情', '考试', '课程', '培训', '研学',
  '金融', '尽调', '风控', '授信', '招商', '产业数据', '企业画像', '客群',
  '农业', '种植', '种业', '农机', '农事',
  /*
   * 注意：不要把「平台 / 系统 / 解决方案」这类泛词放进词库。
   * 实测它们几乎命中每一家企业，导致「小鱼来了」靠一个"平台"就能匹配全部需求，
   * 推荐结果失去意义。领域相近的情况交给下面的同分类兜底（1 分）处理。
   */
];

/** 从一段文本里抽命中关键词 */
function pickKeywords(text) {
  const t = String(text || '');
  const hit = [];
  for (const k of KEYWORD_BANK) {
    if (t.includes(k)) hit.push(k);
  }
  return hit;
}

/**
 * 给某条需求推荐能力方。
 * 返回按匹配分排序的前 N 家，并说明命中关键词。
 */
export function matchCapsForNeed(needId, limit = 6) {
  const need = getNeed(needId);
  if (!need) return null;

  const needText = `${need.scene} ${need.content}`;
  const needKw = new Set(pickKeywords(needText));

  const scored = [];
  for (const c of HZ_CAPS) {
    const capText = `${c.project} ${c.categoryRaw} ${c.ability}`;
    const capKw = pickKeywords(capText);
    const common = capKw.filter((k) => needKw.has(k));
    let score = common.length * 2;
    const reasons = [];

    if (common.length) {
      reasons.push(`共同技术方向：${common.slice(0, 4).join('、')}`);
    }
    if (score > 0) {
      reasons.push(`${c.company} 在「${c.categoryRaw || c.project}」方向有落地能力`);
    }

    // 兜底：关键词没命中但同属一个领域方向时，给一个弱匹配（1 分）
    // 这样「面料 AI 视觉质检」这类描述不重合但领域相同的情况也能被找到。
    if (score === 0) {
      const needCat = inferNeedCategory(need);
      if (needCat && needCat === c.category) {
        score = 1;
        reasons.push(`同属「${(HZ_CATEGORIES.find((x) => x.id === c.category) || {}).name || c.category}」方向，可进一步沟通`);
      }
    }

    if (score > 0) {
      scored.push({
        ...briefCap(c),
        score,
        commonWords: common,
        reasons,
      });
    }
  }

  scored.sort((a, b) => b.score - a.score || a.seq - b.seq);
  return {
    need: briefNeed(need),
    total: scored.length,
    items: scored.slice(0, limit),
  };
}

/** 从需求文本推断所属方向（用于同领域兜底匹配） */
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
  for (const [cid, re] of rules) {
    if (re.test(t)) return cid;
  }
  return '';
}

/** 反向：能力方可以对接哪些需求（用于企业查看） */
export function matchNeedsForCap(capId, limit = 6) {
  const cap = getCap(capId);
  if (!cap) return null;
  const capKw = new Set(pickKeywords(`${cap.project} ${cap.categoryRaw} ${cap.ability}`));

  const scored = [];
  for (const n of HZ_NEEDS) {
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
/* 对接意向                                                            */
/* ------------------------------------------------------------------ */

export function submitIntent(user, body = {}) {
  const kind = body.kind === 'cap' ? 'cap' : 'need'; // 想对接需求 / 想对接能力方
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
  listNeeds,
  listCaps,
  getNeed,
  getCap,
  sceneStats,
  matchCapsForNeed,
  matchNeedsForCap,
  submitIntent,
  listMyIntents,
  listAllIntents,
  setIntentStatus,
};

/**
 * 案例参考：为项目补充同类案例与市场参考数据。
 *
 * ⚠️ 数据来源必须如实区分，界面上也会明确标注：
 *
 *   1) source = 'web'      —— 配置了检索服务（SEARCH_API_KEY）时，
 *                             真的去网上检索，再由大模型抽取成结构化案例。
 *   2) source = 'builtin'  —— 未配置检索服务时，返回**平台内置的行业参考基准**
 *                             （公开的行业造价 / 工期 / 收益区间）。
 *
 * 绝不允许把内置基准伪装成"网上实时案例"。这在商务平台上是误导用户，
 * 用户可能据此判断项目真伪与报价合理性，编造的案例会造成实际损失。
 */
import db, { newId } from '../store/db.js';
import { config } from '../config.js';
import ai from './ai.js';

const listings = () => db.collection('listings');

/** 检索服务是否可用 */
export function searchConfigured() {
  return Boolean(config.search.provider && config.search.apiKey);
}

export function searchStatus() {
  return {
    configured: searchConfigured(),
    provider: searchConfigured() ? config.search.provider : '',
    // 未配置时界面要显示这句话，不能含糊
    hint: searchConfigured()
      ? '已启用实时检索，案例来自公开网络'
      : '未配置检索服务，当前展示的是平台内置行业参考基准，不是实时检索结果',
  };
}

/* ------------------------------------------------------------------ */
/* 内置行业参考基准                                                     */
/*   数据来源：公开的行业造价 / 工期 / 收益区间，用于给出量级参考。       */
/*   每个行业只给区间，不给"某个具体项目"，避免看起来像真实案例。        */
/* ------------------------------------------------------------------ */
const BENCHMARKS = {
  '光伏': {
    unit: '元/W',
    cost: '3.2 ~ 4.5 元/W（集中式地面电站）',
    period: '6 ~ 12 个月',
    yieldNote: '年等效利用小时约 1100 ~ 1500 h（资源区不同差异较大）',
    keyPoints: ['组件约占总投资 40% ~ 45%', '需电力工程施工总承包资质', '送出工程常为工期瓶颈'],
  },
  '风电': {
    unit: '元/W',
    cost: '6.0 ~ 8.5 元/W（陆上）',
    period: '12 ~ 18 个月',
    yieldNote: '年等效利用小时约 2000 ~ 3200 h',
    keyPoints: ['风机约占总投资 45% ~ 55%', '吊装窗口受季节影响大', '需起重设备安装资质'],
  },
  '储能': {
    unit: '元/Wh',
    cost: '0.9 ~ 1.6 元/Wh（电化学储能 EPC）',
    period: '3 ~ 6 个月',
    yieldNote: '工商业侧峰谷套利回收期约 5 ~ 8 年',
    keyPoints: ['电芯占系统成本 50% 以上', '需消防与并网双重验收', '容量租赁与现货套利为主要收益'],
  },
  '氢能': {
    unit: '元/Nm³·h',
    cost: '制氢设备 3000 ~ 6000 元/(Nm³/h)',
    period: '12 ~ 24 个月',
    yieldNote: '绿氢成本受电价主导，约 15 ~ 30 元/kg',
    keyPoints: ['电解槽为核心设备', '需危化品相关许可', '下游消纳决定项目可行性'],
  },
  '智算中心': {
    unit: '万元/机柜',
    cost: '单机柜建设 25 ~ 60 万元（视功率密度）',
    period: '8 ~ 16 个月',
    yieldNote: '上架率 70% 以上通常可覆盖折旧',
    keyPoints: ['PUE 与电价为成本核心', '需 IDC 经营许可', 'GPU 供给是落地前提'],
  },
  '充电桩': {
    unit: '元/千瓦',
    cost: '直流快充 800 ~ 1500 元/kW',
    period: '2 ~ 5 个月',
    yieldNote: '利用率 8% 以上具备盈利性',
    keyPoints: ['场地与电力增容是关键', '需接入运营平台', '分成模式差异大'],
  },
  '环保': {
    unit: '万元/吨·日',
    cost: '污水处理 8 ~ 25 万元/(吨·日)',
    period: '10 ~ 20 个月',
    yieldNote: '多为特许经营，回报期 8 ~ 15 年',
    keyPoints: ['需环保工程专业承包资质', '运营收入稳定但回款周期长'],
  },
  '市政': {
    unit: '万元/公里',
    cost: '道路 300 ~ 1500 万元/公里（等级差异大）',
    period: '8 ~ 24 个月',
    yieldNote: '以政府付费或专项债为主',
    keyPoints: ['需市政公用工程施工总承包资质', '关注资金来源与支付节点'],
  },
  '房地产': {
    unit: '元/㎡',
    cost: '建安成本 2500 ~ 4500 元/㎡',
    period: '18 ~ 36 个月',
    yieldNote: '去化周期决定资金回正速度',
    keyPoints: ['需房地产开发资质', '关注预售与资金监管'],
  },
  '制造业': {
    unit: '万元/条线',
    cost: '自动化产线 300 ~ 3000 万元/条',
    period: '6 ~ 14 个月',
    yieldNote: '回收期通常要求 3 年以内',
    keyPoints: ['关注稼动率与良率承诺', '需明确验收标准'],
  },
  '交通物流': {
    unit: '万元/辆',
    cost: '新能源重卡 60 ~ 120 万元/辆',
    period: '1 ~ 3 个月',
    yieldNote: '按里程结算，受运价波动影响',
    keyPoints: ['关注线路稳定性与结算周期'],
  },
  '传媒': {
    unit: '元/场',
    cost: '活动执行 5 ~ 200 万元/场（规模差异大）',
    period: '1 ~ 3 个月',
    yieldNote: '以赞助与门票为主要收入',
    keyPoints: ['关注招商进度与场地方条款'],
  },
};

const DEFAULT_BENCHMARK = {
  unit: '',
  cost: '同类项目投资额差异较大，建议以正式可研或招标控制价为准',
  period: '视项目规模而定，一般在 3 ~ 24 个月之间',
  yieldNote: '收益测算需结合当地实际条件',
  keyPoints: ['建议核实项目备案 / 核准文件', '建议核实资金来源与支付安排', '建议核实承接方资质要求'],
};

/** 按行业取出内置基准（主行业优先，其次子行业，最后才是关键词） */
export function builtinBenchmarks(listing) {
  // 分成三档，权重依次降低：项目主行业 > 子行业 > AI 关键词
  const tiers = [
    { weight: 3, names: (listing.industries || []).map((i) => i.name) },
    { weight: 2, names: (listing.subs || []).map((s) => s.name) },
    { weight: 1, names: (listing.ai?.titles?.keywords || []).map(String) },
  ];

  const scored = [];
  for (const [key, val] of Object.entries(BENCHMARKS)) {
    let score = 0;
    for (const t of tiers) {
      if (t.names.filter(Boolean).some((n) => String(n).includes(key))) score += t.weight;
    }
    if (score > 0) {
      scored.push({
        id: newId('case'),
        title: `${key}类项目行业参考基准`,
        kind: 'benchmark',
        industry: key,
        cost: val.cost,
        unit: val.unit,
        period: val.period,
        yieldNote: val.yieldNote,
        keyPoints: val.keyPoints,
        source: 'builtin',
        _score: score,
      });
    }
  }

  scored.sort((a, b) => b._score - a._score);
  const hits = scored.map(({ _score, ...rest }) => rest);

  if (!hits.length) {
    hits.push({
      id: newId('case'),
      title: '通用项目参考基准',
      kind: 'benchmark',
      industry: '通用',
      ...DEFAULT_BENCHMARK,
      source: 'builtin',
    });
  }
  return hits.slice(0, 4);
}

/* ------------------------------------------------------------------ */
/* 外部实时检索                                                        */
/* ------------------------------------------------------------------ */

/** 按 provider 组装检索请求 */
async function callSearchApi(query, count = 6) {
  const { provider, apiKey } = config.search;
  const timeout = 12000;

  const endpoints = {
    serper: {
      url: 'https://google.serper.dev/search',
      headers: { 'X-API-KEY': apiKey, 'Content-Type': 'application/json' },
      body: { q: query, gl: 'cn', hl: 'zh-cn', num: count },
      pick: (j) => (j.organic || []).map((r) => ({ title: r.title, snippet: r.snippet, url: r.link })),
    },
    bocha: {
      url: 'https://api.bochaai.com/v1/web-search',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: { query, count, summary: true },
      pick: (j) => ((j.data && j.data.webPages && j.data.webPages.value) || []).map((r) => ({
        title: r.name, snippet: r.snippet || r.summary, url: r.url,
      })),
    },
    bing: {
      url: `https://api.bing.microsoft.com/v7.0/search?q=${encodeURIComponent(query)}&count=${count}&mkt=zh-CN`,
      headers: { 'Ocp-Apim-Subscription-Key': apiKey },
      pick: (j) => ((j.webPages && j.webPages.value) || []).map((r) => ({
        title: r.name, snippet: r.snippet, url: r.url,
      })),
    },
  };

  const ep = endpoints[provider];
  if (!ep) throw new Error(`不支持的检索服务：${provider}`);

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeout);
  try {
    const res = await fetch(ep.url, {
      method: ep.body ? 'POST' : 'GET',
      headers: ep.headers,
      body: ep.body ? JSON.stringify(ep.body) : undefined,
      signal: ctrl.signal,
    });
    if (!res.ok) throw new Error(`检索服务返回 ${res.status}`);
    const json = await res.json();
    return ep.pick(json).filter((r) => r.title).slice(0, count);
  } finally {
    clearTimeout(timer);
  }
}

/** 用大模型把检索结果抽取成结构化案例；未配置大模型时退化为原文摘要 */
async function extractCases(listing, results) {
  const raw = results
    .map((r, i) => `[${i + 1}] ${r.title}\n${String(r.snippet || '').slice(0, 300)}\n${r.url}`)
    .join('\n\n');

  if (ai.aiStatus().enabled) {
    try {
      const out = await ai.chat(
        [
          { role: 'system', content: '你负责把检索结果整理成结构化案例。只使用给定材料，不要补充材料里没有的信息。' },
          {
            role: 'user',
            content: `下面是为【${listing.title}】检索到的公开资料。请整理成同类项目案例。

已检索到的资料：
"""${raw.slice(0, 6000)}"""

要求：
1. 只提取资料中**明确出现**的项目名称、地点、规模、金额、时间、参与方；
2. 资料里没有的字段留空，不要推测、不要编造；
3. 每条案例附上来源链接 idx（对应上面的编号）。

只输出 JSON：
{"cases":[{"title":"项目/案例名称","location":"","scale":"","amount":"","period":"","parties":"","note":"","idx":1}]}`,
          },
        ],
        { json: true, temperature: 0.2 },
      );
      const parsed = ai.extractJson(out);
      if (parsed && Array.isArray(parsed.cases) && parsed.cases.length) {
        return parsed.cases.slice(0, 6).map((c) => ({
          id: newId('case'),
          kind: 'web',
          title: String(c.title || '').slice(0, 120),
          location: String(c.location || '').slice(0, 60),
          scale: String(c.scale || '').slice(0, 80),
          amount: String(c.amount || '').slice(0, 60),
          period: String(c.period || '').slice(0, 60),
          parties: String(c.parties || '').slice(0, 120),
          note: String(c.note || '').slice(0, 300),
          url: results[Number(c.idx) - 1]?.url || '',
          source: 'web',
        }));
      }
    } catch (err) {
      console.warn('[cases] 大模型抽取失败，回退原文摘要:', err.message);
    }
  }

  // 没有大模型：直接给检索原文，不做二次加工
  return results.map((r) => ({
    id: newId('case'),
    kind: 'web',
    title: String(r.title).slice(0, 120),
    note: String(r.snippet || '').slice(0, 300),
    url: r.url,
    source: 'web',
  }));
}

/** 组织检索词 */
function buildQuery(listing) {
  const bits = [];
  const ind = (listing.industries || [])[0]?.name;
  if (ind) bits.push(ind);
  const city = (listing.cities || [])[0]?.name;
  if (city) bits.push(city);
  const scale = (listing.ai?.analysis?.scales || [])[0];
  if (scale) bits.push(String(scale));
  bits.push(listing.typeName || '项目');
  bits.push('案例');
  return bits.join(' ');
}

/* ------------------------------------------------------------------ */
/* 对外入口                                                            */
/* ------------------------------------------------------------------ */

const CACHE_MS = 24 * 60 * 60 * 1000; // 检索结果缓存一天，避免反复烧配额

/**
 * 为项目补充案例参考。
 * @returns {{source:'web'|'builtin', items:Array, at:string, provider:string, note:string}}
 */
export async function collectCases(listing, { force = false, save = true } = {}) {
  // 缓存命中
  if (!force && listing.cases && listing.cases.at) {
    const age = Date.now() - new Date(listing.cases.at).getTime();
    if (age < CACHE_MS && Array.isArray(listing.cases.items) && listing.cases.items.length) {
      return listing.cases;
    }
  }

  let payload;

  if (searchConfigured()) {
    try {
      const results = await callSearchApi(buildQuery(listing), 6);
      if (results.length) {
        payload = {
          source: 'web',
          provider: config.search.provider,
          query: buildQuery(listing),
          items: await extractCases(listing, results),
          at: new Date().toISOString(),
          note: '以下内容来自公开网络检索，仅供横向参考，平台不对其真实性负责。',
        };
      }
    } catch (err) {
      console.warn('[cases] 实时检索失败，回退内置基准:', err.message);
    }
  }

  if (!payload) {
    payload = {
      source: 'builtin',
      provider: '',
      query: '',
      items: builtinBenchmarks(listing),
      at: new Date().toISOString(),
      note: '以下为平台内置的行业参考基准（公开区间数据），不是实时检索结果。',
    };
  }

  if (save) {
    try {
      listings().update(listing.id, { cases: payload });
    } catch {
      /* 缓存写失败不影响返回 */
    }
  }
  return payload;
}

/** 案例展示用的公开结构 */
export function casesPublic(payload) {
  if (!payload) return null;
  return {
    source: payload.source,
    sourceName: payload.source === 'web' ? '网络实时检索' : '平台内置行业基准',
    provider: payload.provider || '',
    query: payload.query || '',
    at: payload.at,
    note: payload.note || '',
    items: (payload.items || []).map((c) => ({
      id: c.id,
      title: c.title,
      kind: c.kind,
      industry: c.industry || '',
      location: c.location || '',
      scale: c.scale || '',
      amount: c.amount || '',
      period: c.period || '',
      parties: c.parties || '',
      cost: c.cost || '',
      unit: c.unit || '',
      yieldNote: c.yieldNote || '',
      keyPoints: c.keyPoints || [],
      note: c.note || '',
      url: c.url || '',
    })),
  };
}

export default { collectCases, casesPublic, builtinBenchmarks, searchConfigured, searchStatus };

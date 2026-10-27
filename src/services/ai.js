/**
 * 小鱼来了 — AI 引擎
 *
 * 双通道设计：
 *   1) 配置了 AI_API_KEY（任何 OpenAI 兼容接口：DeepSeek / 通义 / Moonshot / GPT…）
 *      → 走大模型，输出结构化 JSON；
 *   2) 没配置或调用失败
 *      → 走内置本地规则引擎（词表 + 正则 + 评分模型），保证平台永远可用。
 *
 * 所有对外函数都会在返回值里带上 `source` 字段：'ai' 或 'local'。
 */
import settingsSvc, { effectiveAiConfig } from './settings.js';
import { config } from '../config.js';
import { kindOf, listFiles } from './files.js';

/**
 * 是否接上了大模型。
 *
 * 不能用 config.js 里那个同名函数 —— 它只看环境变量，
 * 管理端在线保存的 API Key 它看不见，会导致「填了 Key 却仍走规则引擎」。
 * 这里统一以 effectiveAiConfig()（在线设置 > 环境变量）为准。
 */
function aiConfigured() {
  return Boolean(effectiveAiConfig().apiKey);
}

/* ------------------------------------------------------------------ */
/* 行业/城市/类型 词表（延迟加载，缺失时降级）                            */
/* ------------------------------------------------------------------ */
let TAX = null;
async function tax() {
  if (TAX) return TAX;
  try {
    TAX = await import('../data/taxonomy.js');
  } catch {
    TAX = {
      INDUSTRIES: [],
      PROJECT_TYPES: [],
      TRADE_TYPES: [],
      EVENT_TYPES: [],
      CITIES: [],
      HELPER: {},
    };
  }
  return TAX;
}

let cityIndex = null;
async function cityList() {
  const t = await tax();
  if (cityIndex && cityIndex.src === t.CITIES) return cityIndex.list;
  const list = [];
  for (const prov of t.CITIES || []) {
    for (const c of prov.cities || []) {
      list.push({ id: c.id, name: c.name, short: c.short || c.name.replace(/[市省]$/, ''), province: prov.name, provinceId: prov.id });
    }
    if (!prov.cities || !prov.cities.length) {
      list.push({ id: prov.id, name: prov.name, short: prov.short || prov.name, province: prov.name, provinceId: prov.id });
    }
  }
  list.sort((a, b) => b.name.length - a.name.length);
  cityIndex = { src: t.CITIES, list };
  return list;
}

/* ------------------------------------------------------------------ */
/* 文本工具                                                            */
/* ------------------------------------------------------------------ */
export function cleanText(t) {
  return String(t || '')
    .replace(/\r/g, '\n')
    .replace(/[ \t\u00a0]+/g, ' ')
    .replace(/\n{2,}/g, '\n')
    .trim();
}

function sentences(t) {
  return cleanText(t)
    .split(/[\n。；;！!？?]+/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 4);
}

const AMOUNT_RE = /(\d[\d,]*(?:\.\d+)?)\s*(亿|万|千)?\s*(元|人民币|美元|欧元|港币|港元|日元)/g;
const SCALE_RE = /(\d+(?:\.\d+)?)\s*(GW|MW|kW|MWh|GWh|kWh|MWp|万吨|吨|万台|台|万套|套|平方米|万平米|亩|公里|km|千米)/gi;
const PHONE_RE = /(?:\+?86[-\s]?)?(1[3-9]\d{9})/g;
const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const WECHAT_RE = /(?:微信|weixin|wechat|vx|V信|WX)[号码:：\s]*([A-Za-z][A-Za-z0-9_-]{5,19})/gi;

function uniq(arr) {
  return [...new Set(arr)];
}

export function extractAmounts(t) {
  const out = [];
  let m;
  AMOUNT_RE.lastIndex = 0;
  while ((m = AMOUNT_RE.exec(t))) out.push(m[0].replace(/\s/g, ''));
  return uniq(out).slice(0, 6);
}

export function extractScales(t) {
  const out = [];
  let m;
  SCALE_RE.lastIndex = 0;
  while ((m = SCALE_RE.exec(t))) out.push(m[0].replace(/\s/g, ''));
  return uniq(out).slice(0, 6);
}

export function extractContacts(t) {
  const out = { phones: [], emails: [], wechat: [] };
  let m;
  PHONE_RE.lastIndex = 0;
  while ((m = PHONE_RE.exec(t))) out.phones.push(m[1]);
  EMAIL_RE.lastIndex = 0;
  while ((m = EMAIL_RE.exec(t))) out.emails.push(m[0]);
  WECHAT_RE.lastIndex = 0;
  while ((m = WECHAT_RE.exec(t))) out.wechat.push(m[1]);
  out.phones = uniq(out.phones);
  out.emails = uniq(out.emails);
  out.wechat = uniq(out.wechat);
  return out;
}

/** 在文本里匹配行业 / 子行业 */
export async function matchIndustries(t) {
  const { INDUSTRIES } = await tax();
  const hits = [];
  for (const ind of INDUSTRIES || []) {
    for (const sub of ind.subs || []) {
      if (sub.name && t.includes(sub.name)) hits.push({ industryId: ind.id, industry: ind.name, subId: sub.id, sub: sub.name, weight: 3 });
    }
    if (ind.name && t.includes(ind.name)) hits.push({ industryId: ind.id, industry: ind.name, subId: '', sub: '', weight: 2 });
  }
  // 去重：同一行业保留权重最高的若干条
  const byInd = new Map();
  for (const h of hits) {
    const cur = byInd.get(h.industryId);
    if (!cur || h.weight > cur.weight) byInd.set(h.industryId, h);
  }
  return [...byInd.values()].slice(0, 5);
}

/** 在文本里匹配城市 */
export async function matchCities(t) {
  const list = await cityList();
  const hits = [];
  for (const c of list) {
    if (c.name.length >= 2 && t.includes(c.name)) hits.push({ id: c.id, name: c.name, province: c.province });
    if (hits.length >= 40) break;
  }
  // 优先长名（"张家口" 优于 "张家"）
  hits.sort((a, b) => b.name.length - a.name.length);
  const seen = new Set();
  const out = [];
  for (const h of hits) {
    if (seen.has(h.name)) continue;
    seen.add(h.name);
    out.push(h);
    if (out.length >= 5) break;
  }
  return out;
}

/** 在文本里匹配项目/贸易/活动类型 */
export async function matchTypes(t, category) {
  const T = await tax();
  const pool =
    category === 'event' ? T.EVENT_TYPES : category === 'trade' ? T.TRADE_TYPES : T.PROJECT_TYPES;
  const extra = t.toUpperCase();
  const hits = [];
  for (const ty of pool || []) {
    if (!ty.name) continue;
    if (t.includes(ty.name) || (ty.name.length <= 5 && extra.includes(ty.name.toUpperCase()))) {
      hits.push({ id: ty.id, name: ty.name, len: ty.name.length });
    }
  }
  // 更具体的类型优先：EPC / 融资租赁 / 股权投资 应排在泛化的「投资」之前
  hits.sort((a, b) => b.len - a.len);
  return hits.slice(0, 4).map(({ id, name }) => ({ id, name }));
}

/** 按金额量级从大到小排序（标题里优先展示最重要的金额） */
function amountValue(a) {
  const m = /([\d,.]+)\s*(亿|万|千)?/.exec(String(a));
  if (!m) return 0;
  const n = Number.parseFloat(m[1].replace(/,/g, ''));
  if (!Number.isFinite(n)) return 0;
  const mult = { 亿: 1e8, 万: 1e4, 千: 1e3 }[m[2]] || 1;
  return n * mult;
}

export function sortAmountsDesc(amounts = []) {
  return [...amounts].sort((a, b) => amountValue(b) - amountValue(a));
}

/* ------------------------------------------------------------------ */
/* 风险词表与评分                                                      */
/* ------------------------------------------------------------------ */
const RISK_PATTERNS = [
  { re: /保本|保收益|包赚|稳赚|躺赚|无风险|零风险|高回报|暴利/, level: 'high', msg: '出现"保本/无风险/高回报"等承诺性表述，涉嫌违规话术' },
  { re: /日入|日结|刷单|返利|资金盘|传销|拉人头|原始股|内幕/, level: 'high', msg: '出现疑似资金盘 / 传销 / 内幕交易特征词' },
  { re: /虚拟币|代币|数字货币|USDT|挖矿/, level: 'high', msg: '涉及虚拟货币相关业务，境内属高风险领域' },
  { re: /过桥|垫资|借贷|民间借贷|高息/, level: 'medium', msg: '涉及资金过桥/借贷，需核实资金方资质与合规性' },
  { re: /股权代持|代持|抽屉协议/, level: 'medium', msg: '涉及股权代持，存在权属与合规风险' },
  { re: /中介费|居间费|保证金|诚意金|押金/, level: 'medium', msg: '涉及前置费用，务必走平台流程留痕并核对收款主体' },
];

const VAGUE_PATTERNS = [
  { re: /近期|尽快|随时|大概|可能|预计|左右/, msg: '时间/数量表述较模糊，建议给出明确节点' },
  { re: /面议|价格另议|详谈/, msg: '价格/条件为"面议"，建议给出区间以提升对接效率' },
];

/* ------------------------------------------------------------------ */
/* 本地规则引擎                                                        */
/* ------------------------------------------------------------------ */
async function localAnalyze(input) {
  const text = cleanText([input.text, input.extraText].filter(Boolean).join('\n'));
  const files = input.files || [];
  const chars = text.length;

  const [industries, cities, types] = await Promise.all([
    matchIndustries(text),
    matchCities(text),
    matchTypes(text, input.category || 'project'),
  ]);
  const amounts = extractAmounts(text);
  const scales = extractScales(text);
  const contacts = extractContacts(text);

  const findings = [];
  const risks = [];
  const suggestions = [];
  let score = 48;

  if (amounts.length) {
    score += 12;
    findings.push(`披露了金额信息：${amounts.join('、')}`);
  } else {
    score -= 6;
    suggestions.push('补充投资额 / 合同额 / 预算金额，便于对方快速判断体量');
  }

  if (scales.length) {
    score += 7;
    findings.push(`给出了规模指标：${scales.join('、')}`);
  }

  if (cities.length) {
    score += 8;
    findings.push(`明确了项目所在地：${cities.map((c) => c.name).join('、')}`);
  } else {
    score -= 7;
    suggestions.push('补充项目所在城市，平台会按城市精准推送');
  }

  if (industries.length) {
    score += 9;
    findings.push(`行业归属清晰：${industries.map((i) => i.sub || i.industry).join('、')}`);
  } else {
    score -= 5;
    suggestions.push('补充所属行业（如光伏、储能、算力、机器人等）');
  }

  if (types.length) {
    score += 8;
    findings.push(`合作方式明确：${types.map((t) => t.name).join('、')}`);
  } else {
    score -= 4;
    suggestions.push('明确合作方式（股权投资 / 融资 / EPC / EMC / 转让 / 融资租赁 / 采购 / 招投标…）');
  }

  const hasContact =
    contacts.phones.length || contacts.emails.length || contacts.wechat.length || input.hasContact;
  if (hasContact) {
    score += 6;
    findings.push('提供了联系方式');
  } else {
    score -= 5;
    suggestions.push('留下电话或微信，方便对方直接对接');
  }

  if (chars >= 400) {
    score += 8;
    findings.push('项目描述充分，信息密度高');
  } else if (chars >= 150) {
    score += 3;
  } else {
    score -= 10;
    risks.push('正文过短，关键条件（主体、金额、周期、回报方式）缺失');
    suggestions.push('补充项目背景、商业模式、财务测算与交易结构');
  }

  const fileKinds = uniq(files.map((f) => f.kind || kindOf(f.name || '')));
  if (files.length) {
    score += Math.min(8, files.length * 3);
    findings.push(`已上传 ${files.length} 个附件（${fileKinds.join('、')}）`);
  }
  if (fileKinds.includes('pdf') || fileKinds.includes('word') || fileKinds.includes('excel')) {
    score += 4;
    findings.push('提供了可核验的正式文档材料');
  }

  for (const p of RISK_PATTERNS) {
    if (p.re.test(text)) {
      score -= p.level === 'high' ? 22 : 9;
      risks.push(p.msg);
    }
  }
  for (const p of VAGUE_PATTERNS) {
    if (p.re.test(text)) {
      score -= 3;
      suggestions.push(p.msg);
    }
  }

  if (/资质|许可证|营业执照|认证|ISO|安全生产/.test(text) || input.hasQualification) {
    score += 6;
    findings.push('提及企业资质，可提交平台认证提升可信度');
  } else {
    suggestions.push('上传营业执照 / 资质证书完成企业认证，可显著提升对接成功率');
  }

  score = Math.max(5, Math.min(98, Math.round(score)));
  const level = score >= 80 ? 'high' : score >= 65 ? 'good' : score >= 45 ? 'medium' : 'low';
  const label = { high: '可靠性高', good: '较为可靠', medium: '一般，需补充材料', low: '信息不足，谨慎对接' }[level];

  const firstLine = sentences(text)[0] || '(未提供描述)';
  const summary = [
    industries.length ? `所属${industries.map((i) => i.industry).join('/')}行业` : '行业待确认',
    cities.length ? `位于${cities.map((c) => c.name).join('、')}` : '地点待确认',
    amounts.length ? `涉及金额${amounts.slice(0, 2).join('、')}` : '金额未披露',
    types.length ? `合作方式为${types.map((t) => t.name).join('、')}` : '合作方式待明确',
  ].join('；') + `。\n核心内容：${firstLine.slice(0, 160)}`;

  const keywords = uniq([
    ...industries.map((i) => i.sub || i.industry),
    ...cities.map((c) => c.short || c.name),
    ...types.map((t) => t.name),
    ...amounts.slice(0, 2),
  ]).slice(0, 12);

  return {
    summary,
    reliability: { score, level, label, findings, risks, suggestions },
    industries: industries.map((i) => ({ id: i.industryId, name: i.industry })),
    subs: industries.filter((i) => i.subId).map((i) => ({ id: i.subId, name: i.sub, industryId: i.industryId })),
    cities,
    types,
    amounts,
    scales,
    contacts,
    keywords,
    fileKinds,
    stats: { chars, sentences: sentences(text).length, files: files.length },
    source: 'local',
  };
}

/** 本地标题生成 */
async function localTitles(input) {
  const text = cleanText([input.text, input.extraText].filter(Boolean).join('\n'));
  const [industries, cities, types] = await Promise.all([
    matchIndustries(text),
    matchCities(text),
    matchTypes(text, input.category || 'project'),
  ]);
  const amounts = sortAmountsDesc(extractAmounts(text));
  const scales = extractScales(text);
  // 「0.45 元/kWh」这类单价不适合放进标题当金额
  const bigAmounts = amounts.filter((a) => amountValue(a) >= 10000);
  const headlineAmounts = bigAmounts; // 标题：只认万元以上的量级
  const detailAmounts = bigAmounts.length ? bigAmounts : amounts; // 副标题：容许小额（如报名费）

  const region = cities[0]?.short || cities[0]?.name || '';
  const industry = industries[0]?.sub || industries[0]?.industry || '';
  const type = types[0]?.name || '';

  /* 核心短语：
     中文商务信息习惯把标题写在第一行，优先采用；
     但用户常常把整段内容写在一行里，那时第一行是整段话，
     要退回到「第一句」，否则会被按分数挑出「项目位于……」这类叙述句当标题。 */
  const lines = text.split('\n').map((s) => s.trim()).filter(Boolean);
  const firstLine = (lines[0] || '').replace(/[。；;，,、\s]+$/, '');
  const firstSent = (sentences(lines[0] || '')[0] || '').replace(/[。；;，,、\s]+$/, '');
  const sents = sentences(text).filter((s) => s.length >= 8);

  let core = '';
  const candidate = firstLine.length <= 46 ? firstLine : firstSent;
  if (candidate.length >= 6 && candidate.length <= 46) {
    core = candidate;
  } else if (sents.length) {
    const scored = sents
      .map((s) => {
        let sc = Math.min(s.length, 60);
        if (/招标|采购|转让|融资|投资|合作|承建|建设|寻求|收购|出租|出售|招募|招商/.test(s)) sc += 30;
        if (/\d/.test(s)) sc += 10;
        return { s, sc };
      })
      .sort((a, b) => b.sc - a.sc);
    core = scored[0].s;
  }
  core = core.replace(/^[，,、\s]+/, '').replace(/(。|；|;)$/, '');
  // 去掉与标题头重复的地区前缀
  if (region && core.startsWith(region)) {
    core = core.slice(region.length).replace(/^[·、,，\s]+/, '');
  }
  if (!core) core = sentences(text)[0] || '';

  // 地区前缀：核心短语里已经出现城市名时不再重复（避免「东营市｜山东东营…」）
  // 城市对象常常只有 name（如「东营市」），所以额外去掉省/市/区/县后缀再比对
  const cityNames = cities
    .flatMap((c) => [c.short, c.name, String(c.name || '').replace(/[省市区县]$/, '')])
    .filter(Boolean);
  const coreHasCity = cityNames.some((n) => n && core.includes(n));
  const headParts = [];
  if (region && !coreHasCity) headParts.push(region);
  if (industry && !core.includes(industry)) headParts.push(industry);
  const head = headParts.length ? `${headParts.join('·')}｜` : '';

  // 尾部：核心短语里已有的类型 / 规模 / 金额不再重复
  // （比较时去掉空格，「8.6 亿元」与「8.6亿元」应视为同一个）
  const coreCompact = core.replace(/\s+/g, '');
  const hasInCore = (v) => Boolean(v) && coreCompact.includes(String(v).replace(/\s+/g, ''));
  const usedInHead = new Set(headParts);

  const tailParts = [];
  if (type && !hasInCore(type) && !usedInHead.has(type)) tailParts.push(type);
  if (headlineAmounts.length && !hasInCore(headlineAmounts[0])) tailParts.push(headlineAmounts[0]);
  else if (scales.length && !hasInCore(scales[0]) && !usedInHead.has(scales[0])) tailParts.push(scales[0]);
  const tail = tailParts.length ? `（${tailParts.join(' / ')}）` : '';

  // 超长时截断「核心短语」本身，保住前缀与括号里的金额，而不是把整条标题切掉
  const budget = 46 - head.length - tail.length;
  let coreOut = core;
  if (coreOut.length > budget) coreOut = `${coreOut.slice(0, Math.max(6, budget - 1))}…`;

  let title = `${head}${coreOut}`.trim();
  if (!title) title = `${head}${type || input.categoryName || '项目'}信息发布`.trim();
  title = `${title}${tail}`;

  const subBits = [];
  if (type) subBits.push(`合作方式：${type}`);
  if (detailAmounts.length) subBits.push(`金额：${detailAmounts.slice(0, 2).join('、')}`);
  if (scales.length) subBits.push(`规模：${scales.slice(0, 2).join('、')}`);
  if (cities.length) subBits.push(`地点：${cities.map((c) => c.name).join('、')}`);
  if (industries.length) subBits.push(`行业：${industries.map((i) => i.sub || i.industry).join('、')}`);
  let subtitle = subBits.join(' · ');
  if (!subtitle) {
    subtitle = (sents[1] || core || '').slice(0, 60) || '欢迎留言咨询，发布方将尽快回复';
  }
  if (subtitle.length > 68) subtitle = subtitle.slice(0, 67) + '…';

  const alternatives = [];
  if (core) {
    alternatives.push({
      title: `${region ? region + '·' : ''}${core}${type ? `｜${type}` : ''}`.slice(0, 46),
      subtitle,
    });
  }
  if (amounts.length) {
    alternatives.push({
      title: `${region ? region + '·' : ''}${amounts[0]}${industry || type || '项目'}寻合作`.slice(0, 46),
      subtitle,
    });
  }
  if (scales.length) {
    alternatives.push({
      title: `${region ? region + '·' : ''}${scales[0]}${industry || ''}${type || '项目'}`.slice(0, 46),
      subtitle,
    });
  }

  return {
    title,
    subtitle,
    keywords: uniq([industry, ...(cities.map((c) => c.name) || []), type, ...amounts.slice(0, 2)]).filter(Boolean).slice(0, 10),
    alternatives,
    source: 'local',
  };
}

/* ------------------------------------------------------------------ */
/* 本地留言自动回复                                                    */
/* ------------------------------------------------------------------ */
async function localReply({ listing, comment, history }) {
  const q = cleanText(comment?.content || '');
  if (!q) return { reply: '', source: 'local' };

  const text = cleanText(listing?.text || '');
  const title = listing?.title || '';
  const contact = listing?.contact || {};

  const has = (...words) => words.some((w) => q.includes(w));

  if (has('联系方式', '电话', '手机', '微信', '怎么联系', '联系谁')) {
    const bits = [];
    if (contact.phone) bits.push(`电话 ${contact.phone}`);
    if (contact.wechat) bits.push(`微信 ${contact.wechat}`);
    if (contact.email) bits.push(`邮箱 ${contact.email}`);
    return {
      reply: bits.length
        ? `发布方联系方式：${bits.join('，')}。也可以在下方点击"项目对接"，平台会为双方建立专属项目群，全程留痕。`
        : `发布方尚未公开联系方式。您可以点击"项目对接"提交对接意向，平台会通知发布方主动联系您；也可以直接在留言区留下您的联系方式。`,
      source: 'local',
    };
  }
  if (has('多少钱', '费用', '价格', '报价', '收费', '居间费', '佣金')) {
    const amt = extractAmounts(text);
    return {
      reply: amt.length
        ? `本项目披露的金额信息为：${amt.join('、')}。具体费用结构、居间费比例以正式协议为准，建议通过"项目对接"进入一对一沟通。`
        : `发布方暂未公开报价。建议点击"项目对接"，平台会建立项目群，由双方就价格与服务条款直接确认。`,
      source: 'local',
    };
  }
  if (has('资质', '证书', '营业执照', '认证', '靠谱吗', '可靠', '真实')) {
    return {
      reply: `平台对项目做了 AI 可靠性解析，当前评分 ${listing?.ai?.reliability?.score ?? '—'} 分（${listing?.ai?.reliability?.label || '待评估'}）。同时支持发布方提交营业执照与行业资质进行企业认证。涉及资金往来时，请务必通过平台流程留存协议与付款凭证。`,
      source: 'local',
    };
  }
  if (has('截止', '什么时候', '时间', '周期', '多久', '有效期')) {
    const until = listing?.expiresAt ? new Date(listing.expiresAt).toLocaleDateString('zh-CN') : '';
    return {
      reply: until
        ? `该信息有效期至 ${until}。若已过期，平台会自动下架；您也可以留言请发布方续期。`
        : `发布方未标注明确周期，建议通过项目对接进一步确认时间安排。`,
      source: 'local',
    };
  }
  if (has('报名', '参加', '如何参与', '怎么参加')) {
    return {
      reply: `点击活动页的"立即报名"按钮填写信息即可${listing?.event?.fee > 0 ? `，报名费 ${listing.event.fee} 元，支付成功后名额锁定` : ''}。报名成功后会收到站内通知，并可加入活动群聊。`,
      source: 'local',
    };
  }
  if (has('条件', '要求', '门槛', '资格')) {
    const req = /要求|条件|资质|业绩|注册资本/;
    const hit = sentences(text).filter((s) => req.test(s)).slice(0, 3);
    return {
      reply: hit.length
        ? `根据项目描述，主要要求如下：\n${hit.map((h) => `· ${h.slice(0, 90)}`).join('\n')}\n具体条件以发布方确认为准，建议发起项目对接。`
        : `项目描述中未明确列出承接条件，建议点击"项目对接"与发布方直接确认资质与业绩要求。`,
      source: 'local',
    };
  }
  if (has('文件', '资料', '附件', '方案', '图纸', 'PPT')) {
    // listing.files 是文件 ID 数组，必须解析后才知道 kind
    const fileRecords = Array.isArray(listing?.fileList) && listing.fileList.length
      ? listing.fileList
      : listFiles(listing?.files || []);
    const n = fileRecords.length;
    const kinds = uniq(fileRecords.map((f) => f.kind).filter(Boolean)).slice(0, 4).join('、');
    return {
      reply: n
        ? `该项目共有 ${n} 个附件${kinds ? `（含 ${kinds} 等）` : ''}。登录并完成对接后，可查看/下载完整资料。`
        : '发布方暂未上传附件资料，可留言请其补充，或发起对接后索取。',
      source: 'local',
    };
  }

  // 兜底：基于项目上下文给出摘要式回答
  const first = sentences(text).slice(0, 2).join('；');
  return {
    reply: `您好，关于「${title}」：${first ? first.slice(0, 160) : '发布方尚未填写详细描述'}。\n您的提问已同步给发布方，如需更快对接可点击"项目对接"建立项目群。`,
    source: 'local',
  };
}

/* ------------------------------------------------------------------ */
/* 大模型调用                                                          */
/* ------------------------------------------------------------------ */
export async function chat(messages, opts = {}) {
  if (!aiConfigured()) return null;
  // 通过 settings 读配置：管理端在线填的 Key 优先于环境变量
  const conf = effectiveAiConfig();
  const { temperature = 0.4, maxTokens = 2200, json = false, timeoutMs = conf.timeoutMs } = opts;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const payload = {
      model: opts.model || conf.model,
      messages,
      temperature,
      max_tokens: maxTokens,
    };
    if (json) payload.response_format = { type: 'json_object' };
    const res = await fetch(`${conf.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${conf.apiKey}`,
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`AI 接口返回 ${res.status}: ${body.slice(0, 300)}`);
    }
    const data = await res.json();
    return data?.choices?.[0]?.message?.content ?? '';
  } finally {
    clearTimeout(timer);
  }
}

export function extractJson(text) {
  if (!text) return null;
  let s = String(text).trim();
  const fence = /```(?:json)?\s*([\s\S]*?)```/i.exec(s);
  if (fence) s = fence[1].trim();
  const start = s.indexOf('{');
  const end = s.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(s.slice(start, end + 1));
  } catch {
    return null;
  }
}

const SYSTEM_PROMPT = `你是"小鱼来了"产业信息发布平台的资深产业分析师与编辑，服务中国企业间的项目对接、投融资、EPC/EMC 工程、贸易采供与活动运营。
你的输出必须是严格合法的 JSON，不要输出任何解释文字或 Markdown 代码块之外的额外内容。`;

/* ------------------------------------------------------------------ */
/* 对外：标题生成                                                      */
/* ------------------------------------------------------------------ */
/* ------------------------------------------------------------------ */
/* 文本回流                                                            */
/* ------------------------------------------------------------------ */

/**
 * 把文档提取出来的**硬换行**合并成自然段。
 *
 * 为什么必须做：
 *   PDF / PPT 里粗体数字常常单独占一行，提取出来是这样：
 *       项目总投资
 *       50
 *       亿元人民币，分三期建设推进：
 *   直接按换行切句会把「项目总投资」和「50亿元」拆开，
 *   于是汇总里出现「建设周期控制在。」这种缺了关键数字的残句。
 *   回流之后再切句，数字就落回它该在的位置了。
 */
export function reflowLines(text) {
  const lines = String(text || '')
    .split(/[\n\r]+/)
    .map((s) => s.replace(/[ \t\u00a0]+/g, ' ').trim())
    .filter(Boolean);

  /* ---- 先剥掉目录区 ---- */
  // 目录在提取文本里长这样（点线被清掉之后）：
  //   目录 / 第一章执行摘要 / 第二章项目概况 / 2.1项目名称与定位 …
  // 这些内容会被当成正文喂给模型，摘要就会以「目录」开头，必须去掉。
  const isTocEntry = (l) =>
    /^\d+(\.\d+)*\s*\S{2,30}$/.test(l) || // 2.1 项目名称与定位
    /^第[一二三四五六七八九十百]+[章节]\s*\S{2,40}$/.test(l) || // 第一章 执行摘要
    /^[.·。…\s\d]{6,}$/.test(l); // 纯点线

  const cleaned = [];
  let tocDepth = 0;
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (/^目\s*录$/.test(l)) {
      tocDepth = 1;
      continue;
    }
    if (tocDepth) {
      // 连续多个目录条目 → 判定为目录区，继续跳过
      if (isTocEntry(l)) continue;
      // 目录区结束：出现长句正文
      if (l.length > 40 || /[。！？]/.test(l)) tocDepth = 0;
      else continue;
    }
    if (isTocEntry(l)) continue;
    cleaned.push(l);
  }

  const out = [];
  let buf = '';
  const flush = () => {
    const s = buf.trim();
    if (s) out.push(s);
    buf = '';
  };

  for (const line of cleaned) {
    // 纯数字行要**粘回上一行**，不能当页码丢掉。
    // PDF 里粗体数字经常被单独拆成一行：
    //     项目总投资 / 50 / 亿元人民币…
    //     建设周期控制在 / 12 / 个月内
    // 丢掉它就会得到「一期投资亿元」「建设周期控制在个月内」这种缺数字的残句。
    if (/^\d{1,4}(\.\d+)?$/.test(line) && buf) {
      buf += line;
      continue;
    }
    if (!buf) {
      buf = line;
      continue;
    }
    // 上一段已经以句末标点收尾 → 另起一段；否则接着拼
    if (/[。！？；]$/.test(buf)) {
      flush();
      buf = line;
      continue;
    }
    buf += line;
    if (buf.length > 1200) flush();
  }
  flush();

  return out.join('\n');
}

/**
 * 表格单元格会被粘成超长句，例如：
 *   分期投资额建设规模建设周期备注一期亿元个kW标准高密机柜…合计175MW个月
 * 这种句子直接进摘要毫无可读性。这里按「章节号 / 冒号 / 期次 / 数字+单位」等
 * 边界把长句再切成较短的片段。
 */
function splitLongSentences(list, max = 180) {
  const out = [];
  for (const s of list) {
    if (s.length <= max) {
      out.push(s);
      continue;
    }
    const parts = s
      .split(/(?=第[一二三四五六七八九十]+[章节])|(?=\d+\.\d+\s*\S)|(?<=：)|(?<=——)|(?=合计\d)|\s{2,}/)
      .map((x) => x.trim())
      .filter((x) => x.length >= 6);
    if (parts.length <= 1) {
      out.push(s);
      continue;
    }
    for (const p of parts) out.push(p);
  }
  return out;
}

/** 目录/术语表一类的句子：章节号或“术语全称”密集出现，信息量为负 */
function looksLikeToc(s) {
  const chapters = (s.match(/第[一二三四五六七八九十]+章/g) || []).length;
  const numbered = (s.match(/\d+\.\d+/g) || []).length;
  if (chapters >= 2 || numbered >= 3) return true;
  if (/术语全称|术语\s*全称|解释\s*PUEPower|PowerUsageEffectiveness/.test(s)) return true;
  return false;
}

/** 取关键词附近的上下文窗口（比整句更聚焦） */
function around(text, keyword, before = 15, after = 90) {
  const i = String(text).indexOf(keyword);
  if (i < 0) return '';
  const s = String(text)
    .slice(Math.max(0, i - before), i + after)
    .replace(/\s+/g, ' ')
    .trim();
  // 开头常常带出上一句的半截词（「与定位项目名称：…」），
  // 从最后一个句读之后重新开始
  const cut = Math.max(s.lastIndexOf('。'), s.lastIndexOf('：'), s.lastIndexOf('；'), s.lastIndexOf(' '));
  if (cut > 0 && cut < 40) return s.slice(cut + 1).trim();
  return s;
}

/** 规模优先取大单位：MW/GW/亩/平方米 比 kW 更能代表项目体量 */
function bestScale(text) {
  const list = extractScales(text);
  const big = list.filter((s) => /(MW|GW|MWh|GWh|万吨|亩|平方米|万平米)/i.test(s) && !/kW\b/i.test(s));
  return big[0] || list[0] || '';
}

/* ------------------------------------------------------------------ */
/* 第一步：AI 汇总                                                     */
/*   把用户填写的文字 + 导入文件的解析文本，先汇总成一份结构化摘要，      */
/*   再拿摘要去生成主副标题与可靠性分析。                               */
/*   好处：长文档、多附件、口语化描述混杂时，生成结果更稳定、更少遗漏。   */
/* ------------------------------------------------------------------ */

/** 从文本里按正则抠出一个字段（取第一个命中） */
function grab(text, patterns, max = 160) {
  for (const re of patterns) {
    const m = re.exec(text);
    if (m) {
      const v = String(m[1] !== undefined ? m[1] : m[0]).replace(/\s+/g, ' ').trim();
      if (v) return v.slice(0, max);
    }
  }
  return '';
}

/** 找到含关键词的第一句完整话 */
function sentenceWith(list, words, max = 200) {
  for (const s of list) {
    if (words.some((w) => s.includes(w))) return s.slice(0, max);
  }
  return '';
}

/** 汇总里会尝试抽取的字段（界面按这个顺序展示） */
export const SUMMARY_FACT_KEYS = [
  'projectName', 'positioning', 'location', 'industry',
  'totalInvest', 'funding', 'amount', 'scale', 'period',
  'powerPrice', 'payback', 'rights',
  'scope', 'cooperation', 'requirements', 'payment', 'contact',
];

export function localSummary(input) {
  // 先回流再切句：否则数字与标签会被硬换行拆散
  const raw = reflowLines(`${input.text || ''}\n${input.fileText || ''}`);
  const flat = raw.replace(/\n/g, ' ');

  // 切句 → 再切超长句 → 丢掉目录/术语表一类噪音
  const all = splitLongSentences(sentences(raw), 180).filter((s) => s.length >= 6 && !looksLikeToc(s));

  const scored = all
    .map((s) => {
      let score = 0;
      if (/\d[\d,]*(?:\.\d+)?\s*(亿|万|千)?\s*(元|人民币)/.test(s)) score += 4;
      if (/(GW|MW|MWh|GWp|MWp|万吨|吨|万台|台|万套|套|平方米|亩|EFLOPS)/i.test(s)) score += 3;
      if (/资质|许可|总承包|认证|业绩/.test(s)) score += 3;
      if (/工期|周期|交付|个月|日历天/.test(s)) score += 2;
      if (/位于|地点|地址|省|市|县|区/.test(s)) score += 2;
      if (/招标|采购|投资|融资|转让|合作|EPC|EMC|居间/.test(s)) score += 2;
      if (s.length > 140) score -= 2;
      if (s.length < 8) score -= 2;
      return { s, score };
    })
    .sort((a, b) => b.score - a.score);

  const picked = uniq(scored.filter((x) => x.score > 0).map((x) => x.s));
  const ranked = picked.length ? picked : all;

  // 让「像标题的那句」排在摘要最前面
  const lead = all.find(
    (s) =>
      s.length >= 8 &&
      s.length <= 60 &&
      /项目|工程|采购|招标|交易|融资|转让|建设|服务/.test(s) &&
      !/^(项目)?位于|^地址|^地点/.test(s),
  );
  const usePoints = (lead ? [lead, ...ranked.filter((s) => s !== lead)] : ranked).slice(0, 12);

  const digest = usePoints
    .slice(0, 7)
    .map((s) => s.replace(/[。；;，,]+$/, ''))
    .join('。') + (usePoints.length ? '。' : '');

  /* ---- 结构化字段 ---- */
  // 金额优先取「总投资 / 本次融资」紧邻的数字。
  // 直接拿全文最大金额会取到地区 GDP 这类无关数字（实测踩过）。
  const pickAmountNear = (kw, win = 80) => {
    const i = flat.indexOf(kw);
    if (i < 0) return '';
    const seg = flat.slice(i, i + win);
    const list2 = sortAmountsDesc(extractAmounts(seg));
    return list2[0] || '';
  };

  const cityMatch = /([\u4e00-\u9fa5]{2,8}(?:省|自治区|市))([\u4e00-\u9fa5]{2,12}(?:区|县|市|镇|园区|新区))?/.exec(flat);
  // 「X省Y市」是最可靠的选址写法，优先用它
  const provCity = /([\u4e00-\u9fa5]{2,6}(?:省|自治区))([\u4e00-\u9fa5]{2,10}(?:市|州|区))/.exec(flat);

  const facts = {
    // 必须要求「项目名称：」这种带冒号的真实标签，
    // 否则会匹配到目录里的「2.1项目名称与定位」，把整段目录当成字段值（实测踩过）
    projectName: grab(flat, [
      /项目名称\s*[：:]\s*([^\n。；]{3,80})/,
      /^([^\n。；]{4,50}数据中心[^\n。；]{0,20}项目)/,
    ], 70),
    positioning:
      around(flat, '项目定位', 0, 160) ||
      around(flat, '定位：', 0, 160) ||
      sentenceWith(all, ['打造', '标杆', '承接'], 180),
    location:
      grab(flat, [/(?:项目选址|建设地点|项目地址|选址)\s*[：:]\s*([^\n。；]{2,60})/], 80) ||
      (provCity ? `${provCity[1]}${provCity[2]}` : '') ||
      (cityMatch ? `${cityMatch[1]}${cityMatch[2] || ''}` : ''),
    industry: '',
    totalInvest:
      pickAmountNear('项目总投资', 60) ||
      grab(flat, [/总投资[约为：:\s]*([\d.,]+\s*[亿万]?\s*元[^\n。；]{0,40})/], 80),
    funding:
      pickAmountNear('融资规模', 60) ||
      pickAmountNear('本次融资', 80) ||
      grab(flat, [/(?:融资规模|募集(?:资金|规模))\s*[：:约为\s。]*([\d.,]+\s*[亿万]?\s*元[^\n。；]{0,30})/], 70),
    amount:
      pickAmountNear('项目总投资', 60) ||
      pickAmountNear('本次融资', 80) ||
      pickAmountNear('总投资', 60) ||
      (sortAmountsDesc(extractAmounts(flat))[0] || ''),
    scale: bestScale(flat),
    period: grab(flat, [
      /(?:建设周期|工期)[约为：:\s]*([\d.,]+\s*(?:个月|年)[^\n。；]{0,40})/,
      /(\d+\s*个月内(?:完成)?[^\n。；]{0,30})/,
    ], 70),
    // 电价：先在「到户电价 / 优惠电价」附近找确切数字，
    // 直接搜「电价」会命中市场分析里那段没有数字的论述
    powerPrice:
      grab(around(flat, '到户电价', 0, 90), [/([\d.,]+\s*元\s*\/\s*kWh[^\n。；]{0,50})/], 100) ||
      grab(around(flat, '优惠电价', 0, 90), [/([\d.,]+\s*元\s*\/\s*kWh[^\n。；]{0,50})/], 100) ||
      grab(flat, [/([\d.]+)\s*元\s*\/\s*kWh/], 60) ||
      around(flat, '电价', 6, 90),
    payback: around(flat, '回收期', 10, 90) || around(flat, 'IRR', 20, 80),
    rights: around(flat, '退出机制', 0, 150) || around(flat, '回购', 20, 100),
    scope: around(flat, '建设内容', 0, 160) || around(flat, '建设规模', 0, 160) || around(flat, '算力规模', 0, 140),
    cooperation: grab(flat, [/合作方式\s*[：:]\s*([^\n。；]{2,60})/], 80),
    requirements: around(flat, '资质', 20, 100),
    payment: grab(flat, [/付款方式\s*[：:]\s*([^\n。；]{2,60})/], 80),
    contact: '',
  };

  const missing = [];
  for (const [k, label] of [
    ['projectName', '项目名称'],
    ['location', '项目地点'],
    ['totalInvest', '投资总额'],
    ['funding', '本次融资规模'],
    ['period', '建设周期'],
  ]) {
    if (!facts[k]) missing.push(label);
  }
  if (!facts.amount) missing.push('金额');
  if (!facts.scale) missing.push('项目规模');
  if (!/资质|许可|总承包/.test(flat)) missing.push('对承接方的资质要求');
  if (!/付款|预付|结算|月结/.test(flat)) missing.push('付款方式');

  return {
    digest: digest.slice(0, 1200),
    points: usePoints.map((s) => s.slice(0, 240)),
    facts,
    missing,
    charCount: raw.length,
    source: 'local',
  };
}

/* ------------------------------------------------------------------ */
/* 长文档：分块提炼再合并                                               */
/* ------------------------------------------------------------------ */

/**
 * 单次能安全塞进模型的字数。
 *
 * deepseek-chat 上下文 64K token，中文大致 1 字 ≈ 1 token，
 * 这里取 24000 字，给提示词与输出留足余量。
 *
 * 之前固定只取 12000 字 —— 一份 47 页、3 万字的商业计划书，
 * 有 60% 的内容根本没进模型，用户看到的就是「提取不全」。
 */
export const SINGLE_SHOT_CHARS = 24000;
/** 分块大小：略小于单次上限，块内保留完整上下文 */
export const CHUNK_CHARS = 14000;

/** 按段落/句子边界切块，避免把一句话劈成两半 */
export function splitChunks(text, size = CHUNK_CHARS) {
  const src = String(text || '');
  if (!src.trim()) return [];
  if (src.length <= size) return [src];

  const chunks = [];
  let buf = '';
  // 先按换行切，再按句末标点切，最后才硬切
  const lines = src.split(/\n/);
  for (const line of lines) {
    if ((buf + line).length > size && buf) {
      chunks.push(buf);
      buf = '';
    }
    if (line.length > size) {
      // 单行超长：按句子切
      const parts = line.split(/(?<=[。！？；])/);
      for (const p of parts) {
        if ((buf + p).length > size && buf) {
          chunks.push(buf);
          buf = '';
        }
        if (p.length > size) {
          // 仍然超长，硬切
          for (let i = 0; i < p.length; i += size) {
            chunks.push(p.slice(i, i + size));
          }
        } else {
          buf += p;
        }
      }
      continue;
    }
    buf += (buf ? '\n' : '') + line;
  }
  if (buf.trim()) chunks.push(buf);
  return chunks.filter((c) => c.trim());
}

const CHUNK_PROMPT = `你在阅读一份长资料的第 {N}/{TOTAL} 部分。
请只提炼**这一部分里实际写出的事实**，不要推测，不要补全没写的内容。

输出 JSON：
{"digest":"这部分讲了什么，200 字以内","facts":{"projectName":"","positioning":"","location":"","industry":"","totalInvest":"","funding":"","amount":"","scale":"","period":"","powerPrice":"","payback":"","rights":"","scope":"","cooperation":"","requirements":"","payment":"","contact":""},"points":["这部分的要点，每条一句话"]}
facts 里没有的字段写空字符串。`;

/**
 * 长文档汇总：分块提炼（map）→ 合并成最终结果（reduce）。
 *
 * 好处是不丢内容，代价是 N+1 次调用（用 DeepSeek 约 0.1 元量级）。
 */
async function summarizeLongDoc({ input, local, full }) {
  const chunks = splitChunks(full);
  const partials = [];

  for (let i = 0; i < chunks.length; i++) {
    try {
      const raw = await chat(
        [
          { role: 'system', content: SYSTEM_PROMPT },
          {
            role: 'user',
            content: `${CHUNK_PROMPT.replace('{N}', String(i + 1)).replace('{TOTAL}', String(chunks.length))}
${input.filename ? `\n（资料名称：${input.filename}）` : ''}

资料内容：
"""${chunks[i]}"""`,
          },
        ],
        { json: true, temperature: 0.2, maxTokens: 1600 },
      );
      const p = extractJson(raw);
      if (p) partials.push({ index: i, digest: String(p.digest || ''), facts: p.facts || {}, points: p.points || [] });
    } catch (err) {
      // 单块失败不影响整体，记下来继续
      console.warn(`[ai] 第 ${i + 1}/${chunks.length} 块提炼失败:`, err.message);
    }
  }

  if (!partials.length) return { ...local, note: '分段提炼全部失败，已回退本地引擎' };

  // 合并：把各块结果作为「分部分摘要」再让模型汇总一次
  const factLines = partials
    .map((p) => {
      const f = Object.entries(p.facts || {})
        .filter(([, v]) => String(v || '').trim())
        .map(([k, v]) => `${k}=${v}`)
        .join('；');
      return `【第 ${p.index + 1} 部分】\n摘要：${p.digest}\n字段：${f || '（无）'}\n要点：${(p.points || []).join(' / ')}`;
    })
    .join('\n\n');

  const reduceUser = `下面是一份长资料分段提炼的结果（共 ${partials.length} 段）。请把它们合并成一份完整的汇总。

要求：
1. digest：150-300 字客观概述整体，只陈述资料里有的内容；
2. points：6-10 条要点，覆盖主体、地点、规模与金额、建设或交易内容、工期、资质、合作方式、付款、风险或待确认项；
3. facts：合并各段字段，同一字段取更完整准确的那个；资料里没有的留空，不要猜。
   字段：${SUMMARY_FACT_KEYS.join(' / ')}
4. missing：列出资料里缺失、但发布时建议补上的信息。

分段结果：
${factLines}

请只输出如下 JSON：
{"digest":"","points":[""],"facts":{${SUMMARY_FACT_KEYS.map((k) => `"${k}":""`).join(',')}},"missing":[""]}`;

  try {
    const raw = await chat(
      [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: reduceUser },
      ],
      { json: true, temperature: 0.3, maxTokens: 2600 },
    );
    const parsed = extractJson(raw);
    if (!parsed || (!parsed.digest && !parsed.points)) {
      return {
        ...local,
        digest: partials.map((p) => p.digest).filter(Boolean).join(' ').slice(0, 800) || local.digest,
        points: partials.flatMap((p) => p.points || []).slice(0, 12),
        source: 'ai',
        note: '合并失败，已用分段结果拼接',
      };
    }

    const facts = {};
    const factsSrc = parsed.facts && typeof parsed.facts === 'object' ? parsed.facts : {};
    for (const k of SUMMARY_FACT_KEYS) {
      const v = factsSrc[k];
      if (v !== undefined && v !== null && String(v).trim()) {
        facts[k] = String(v).trim().slice(0, 200);
        continue;
      }
      // 合并结果没给，就看各分块里有没有
      const fromChunks = partials.map((p) => String(p.facts?.[k] || '').trim()).filter(Boolean);
      facts[k] = fromChunks.length ? fromChunks.sort((a, b) => b.length - a.length)[0].slice(0, 200) : '';
    }

    return {
      digest: String(parsed.digest || '').trim().slice(0, 800) || local.digest,
      points: Array.isArray(parsed.points)
        ? parsed.points.map((p) => String(p || '').trim().slice(0, 200)).filter(Boolean).slice(0, 12)
        : partials.flatMap((p) => p.points || []).slice(0, 12),
      facts,
      missing: Array.isArray(parsed.missing)
        ? parsed.missing.map((m) => String(m || '').trim().slice(0, 80)).filter(Boolean).slice(0, 12)
        : local.missing,
      charCount: full.length,
      source: 'ai',
      chunked: { chunks: chunks.length, ok: partials.length },
    };
  } catch (err) {
    console.warn('[ai] 长文档合并失败:', err.message);
    return {
      ...local,
      digest: partials.map((p) => p.digest).filter(Boolean).join(' ').slice(0, 800) || local.digest,
      points: partials.flatMap((p) => p.points || []).slice(0, 12),
      source: 'ai',
      note: `合并调用失败：${err.message}`,
    };
  }
}

export async function summarizeProject(input) {
  const local = localSummary(input);
  if (!aiConfigured()) return local;

  const bodyText = String(input.text || '');
  const fileText = String(input.fileText || '');
  const fileList = (input.files || []).map((f) => `${f.name}（${f.kind}）`).join('、');

  // 长文档走分块提炼，不再粗暴截断。
  // 之前固定 slice(0,12000)：3 万字的 PDF 有 60% 内容根本没进模型。
  const full = [bodyText, fileText].filter(Boolean).join('\n\n');
  if (full.length > SINGLE_SHOT_CHARS) {
    return summarizeLongDoc({ input, local, full });
  }

  const user = `请先把下面这些原始资料汇总成一份结构化摘要，供后续生成【${input.categoryName || '项目'}】发布信息使用。

汇总要求：
1. digest：用 150-300 字客观概述这个项目——是什么、在哪、多大规模、要做什么、有什么条件。只陈述资料里有的内容，不要评价、不要营销词、不要编造；
2. points：6-10 条要点，每条一句话，尽量覆盖：项目主体、地点、规模与金额、建设或交易内容、工期、资质要求、合作方式、付款条件、关键风险或待确认项；
3. facts：把能确定的字段抽出来，资料里没有的留空字符串，不要猜：
   项目名称 projectName / 项目定位 positioning / 项目选址 location / 行业 industry
   项目总投资 totalInvest / 本次融资规模 funding / 金额 amount / 规模 scale
   建设周期 period / 电价或单位成本 powerPrice / 投资回报（IRR、回收期）payback
   投资者权益（回购、退出）rights / 建设内容 scope / 合作方式 cooperation
   资质与资格要求 requirements / 付款条件 payment / 联系方式 contact
   注意：投资总额与融资规模要分开写；带「亿元/万元」的完整数值不要漏掉单位。
4. missing：列出原始资料里缺失、但发布时建议补上的信息。

用户填写的原始正文：
"""${bodyText.slice(0, 12000)}"""
${fileText ? `\n从附件里提取的内容：\n"""${fileText}"""` : ''}
${fileList ? `\n附件清单：${fileList}` : ''}
${input.filename ? `\n主要附件：${input.filename}` : ''}

请只输出如下 JSON（facts 里每个字段都要出现，资料里没有的写空字符串）：
{"digest":"","points":[""],"facts":{${SUMMARY_FACT_KEYS.map((k) => `"${k}":""`).join(',')}},"missing":[""]}`;

  try {
    const raw = await chat(
      [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: user },
      ],
      { json: true, temperature: 0.3 },
    );
    const parsed = extractJson(raw);
    if (!parsed || (!parsed.digest && !parsed.points)) return local;

    const points = Array.isArray(parsed.points)
      ? parsed.points.map((p) => String(p || '').trim().slice(0, 200)).filter(Boolean).slice(0, 12)
      : local.points;
    const factsSrc = parsed.facts && typeof parsed.facts === 'object' ? parsed.facts : {};
    // AI 成功时**以 AI 为准**：它没给值的字段就留空。
    //
    // 之前是以 local.facts 打底，AI 没返回的字段会漏出规则引擎的粗糙输出，
    // 例如 powerPrice = "5元/kWh庆阳数据中心集群专项优惠电价，较一般工商业低约价格来源…"。
    // 混在大模型干净的结果里既难看出是拼凑的，也会被误当成 AI 的结论。
    const facts = {};
    for (const k of SUMMARY_FACT_KEYS) {
      const v = factsSrc[k];
      if (v !== undefined && v !== null) {
        facts[k] = String(v).trim().slice(0, 200);
        continue;
      }
      // AI 漏了这一项：本地值只在「干净短文本」时补位，
      // 带残句特征（缺数字的「≥，」、结尾冒号、连续逗号）的一律丢弃
      const lv = String(local.facts?.[k] || '').trim();
      facts[k] = lv && lv.length <= 40 && !/[，,]{2}|≥\s*[，,]|[：:]\s*$/.test(lv) ? lv : '';
    }
    const missing = Array.isArray(parsed.missing)
      ? parsed.missing.map((m) => String(m || '').trim().slice(0, 80)).filter(Boolean).slice(0, 12)
      : local.missing;

    return {
      digest: String(parsed.digest || local.digest).trim().slice(0, 800),
      points: points.length ? points : local.points,
      facts,
      missing,
      charCount: local.charCount,
      source: 'ai',
    };
  } catch (err) {
    console.warn('[ai] 资料汇总失败，回退本地引擎:', err.message);
    return { ...local, note: `AI 调用失败：${err.message}` };
  }
}

/* ------------------------------------------------------------------ */
/* 对外：生成主副标题                                                    */
/* ------------------------------------------------------------------ */

/* ------------------------------------------------------------------ */
/* 视觉理解（智谱 GLM-4V-Flash，免费）                                  */
/* ------------------------------------------------------------------ */

export function visionConfigured() {
  try {
    return settingsSvc.effectiveVisionConfig().enabled;
  } catch {
    return false;
  }
}

/**
 * 看图：把若干帧（data URL 或公网 URL）交给视觉模型描述画面。
 */
export async function visionDescribe({ images = [], prompt = '' } = {}) {
  const list = (images || []).filter(Boolean).slice(0, 6);
  if (!list.length) return { ok: false, text: '', note: '没有可分析的画面' };
  if (!visionConfigured()) return { ok: false, text: '', note: '未配置视觉模型' };

  const ask =
    prompt ||
    '这是一条短视频的若干画面截图（按时间顺序）。请用中文简洁描述：\n' +
      '1. 画面里的主要对象和场景（人、设备、地点、工程类型等）\n' +
      '2. 如果是施工现场/产品/场地，说清是什么类型\n' +
      '3. 一句话总结这条视频在讲什么\n' +
      '只输出 3 行以内的纯文本，不要编号，不要客套。';

  const content = [{ type: 'text', text: ask }];
  for (const url of list) content.push({ type: 'image_url', image_url: { url } });

  const eff = settingsSvc.effectiveVisionConfig();

  // 共享/免费模型在高峰期经常返回 503（模型过载）或 429（限流）。
  // 这里按「主模型 → 备用模型」跑两轮，中间指数退避，
  // 不要一次失败就当没有内容。
  const models = [eff.model, ...(eff.fallbackModels || [])].filter(Boolean);
  const attempts = [...models, ...models]; // 两轮

  const notes = [];
  for (let i = 0; i < attempts.length; i++) {
    const model = attempts[i];
    const isLast = i === attempts.length - 1;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), eff.timeoutMs || 60000);
    try {
      const res = await fetch(`${eff.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${eff.apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages: [{ role: 'user', content }],
          temperature: 0.3,
          max_tokens: 400,
        }),
        signal: ctrl.signal,
      });
      const txt = await res.text();

      if (!res.ok) {
        const retryable = res.status === 429 || res.status >= 500;
        notes.push(`${model} ${res.status}`);
        if (retryable && !isLast) {
          await new Promise((r) => setTimeout(r, Math.min(1200 * (i + 1), 5000)));
          continue;
        }
        return { ok: false, text: '', note: `视觉模型 ${res.status}：${txt.slice(0, 200)}` };
      }

      let json = {};
      try {
        json = JSON.parse(txt);
      } catch {
        notes.push(`${model} 非 JSON`);
        if (!isLast) { await new Promise((r) => setTimeout(r, 800)); continue; }
        return { ok: false, text: '', note: '返回不是 JSON' };
      }

      const out = json && json.choices && json.choices[0] && json.choices[0].message
        ? json.choices[0].message.content
        : '';
      const text =
        typeof out === 'string'
          ? out.trim()
          : Array.isArray(out)
            ? out.map((x) => (typeof x === 'string' ? x : (x && x.text) || '')).join(' ').trim()
            : '';
      if (text) return { ok: true, text, model };
      notes.push(`${model} 空内容`);
      if (!isLast) { await new Promise((r) => setTimeout(r, 800)); continue; }
      return { ok: false, text: '', note: '模型返回空内容' };
    } catch (err) {
      notes.push(`${model} ${err.name === 'AbortError' ? '超时' : err.message}`);
      if (!isLast) { await new Promise((r) => setTimeout(r, 800)); continue; }
      return { ok: false, text: '', note: `视觉模型调用失败：${err.message}` };
    } finally {
      clearTimeout(timer);
    }
  }

  return { ok: false, text: '', note: `视觉模型全部失败（${notes.slice(-3).join('；')}）` };
}

/* ------------------------------------------------------------------ */
/* 语音转写（硅基流动 SenseVoice）                                      */
/* ------------------------------------------------------------------ */


/* ------------------------------------------------------------------ */
/* 图片文字识别（OCR）                                                  */
/*   只上传了图片（微信截图 / 文件截图 / 照片）时用：                    */
/*   让视觉模型把图里的文字逐字读出来，拼进 fileText 再交给标题/解析模型  */
/* ------------------------------------------------------------------ */

const OCR_PROMPT =
  '这是一份项目资料中的图片（可能是微信聊天截图、文件截图、报价单、图纸或照片）。请：\n' +
  '1. 把图中所有可见文字逐字提取出来，保持原有先后顺序和分段，不要总结、不要改写、不要漏行；\n' +
  '2. 如果有表格，按「字段：值」的形式逐行列出；\n' +
  '3. 如果图中几乎没有文字，就用一两句话描述画面里是什么；\n' +
  '4. 只输出提取到的内容本身，不要加「以下是文字」这类开场白。';

/**
 * 批量识别图片里的文字。
 * @param {{ images: string[], prompt?: string, perImage?: number }} input
 * @returns {Promise<{ ok: boolean, text: string, count: number, note?: string }>}
 */
export async function ocrImages({ images = [], prompt = '', perImage = 6 } = {}) {
  const list = (images || []).filter(Boolean).slice(0, Math.max(1, Math.min(9, perImage)));
  if (!list.length) return { ok: false, text: '', count: 0, note: '没有图片' };
  if (!visionConfigured()) return { ok: false, text: '', count: 0, note: '未配置视觉模型' };

  // 并发 3 张：既提速，又不至于一上来就把限流打满
  const CONCURRENCY = 3;
  const results = new Array(list.length).fill(null);
  const notes = [];
  let cursor = 0;

  const worker = async () => {
    while (cursor < list.length) {
      const i = cursor++;
      const r = await visionDescribe({ images: [list[i]], prompt: prompt || OCR_PROMPT });
      if (r.ok && r.text) results[i] = r.text;
      else if (r.note) notes.push(r.note);
    }
  };

  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, list.length) }, () => worker()),
  );

  const out = [];
  let done = 0;
  results.forEach((txt, i) => {
    if (txt) {
      done += 1;
      out.push(`【图片 ${i + 1}】\n${txt}`);
    }
  });

  if (!out.length) {
    return {
      ok: false,
      text: '',
      count: 0,
      total: list.length,
      note: `图片识别全部失败（共 ${list.length} 张）：${notes.slice(0, 2).join('；') || '未知原因'}`,
    };
  }
  return { ok: true, text: out.join('\n\n'), count: done, total: list.length, partial: done < list.length };
}


/* ------------------------------------------------------------------ */
/* 从一段文字里提取联系信息                                            */
/* ------------------------------------------------------------------ */

/** 先用正则捞手机号/微信号，可靠且免费；姓名与企业名再交给模型 */
function regexContact(text) {
  const t = String(text || '');
  // 手机号：允许中间有空格或横线
  const phoneM =
    t.match(/(?:\+?86[-\s]?)?(1[3-9]\d)[-\s]?(\d{4})[-\s]?(\d{4})/) ||
    t.match(/(0\d{2,3})[-\s]?(\d{7,8})/);
  const phone = phoneM ? phoneM.slice(1).filter(Boolean).join('') : '';

  let wechat = '';
  const wxLabel = t.match(/(?:微信|wechat|weixin|vx|v信|威信)[号：:\s]*([A-Za-z][-_A-Za-z0-9]{5,19})/i);
  if (wxLabel) wechat = wxLabel[1];

  // 「微信同号」「微信同手机」这类说法，直接把手机号当微信号
  if (!wechat && phone && /微信[^。；;，,\n]{0,6}(同号|同手机|即手机|同)/.test(t)) {
    wechat = phone;
  }

  return { phone, wechat };
}

/**
 * 把用户的一句话搜索需求解析成检索条件。
 *
 * 例：「呼和浩特有哪些风电项目在转让」
 *   → { keywords:['风电','转让'], category:'project', city:'呼和浩特市', industry:'风电' }
 *
 * AI 没配好或解析失败时，退回基于词典的规则解析（城市/行业/类型），
 * 至少能比纯关键词搜索准一点。
 */
export async function parseSearchIntent(text = '') {
  const src = String(text || '').trim().slice(0, 200);
  const empty = {
    q: src,
    keywords: [],
    category: '',
    city: '',
    industry: '',
    typeName: '',
    amountMin: null,
    amountMax: null,
    intent: '',
    source: 'rule',
  };
  if (!src) return empty;

  // 先把「城市 / 行业」用词典捞出来，AI 失败时也有得用
  const rule = { ...empty };
  try {
    const [cities, inds] = await Promise.all([matchCities(src), matchIndustries(src)]);
    if (cities && cities.length) rule.city = cities[0].name || '';
    if (inds && inds.length) rule.industry = inds[0].sub || inds[0].industry || '';
  } catch {
    /* 词典匹配失败就跳过 */
  }
  try {
    const types = await matchTypes(src, '');
    if (types && types.length) rule.typeName = types[0].name || '';
  } catch {
    /* ignore */
  }

  if (!aiConfigured()) return rule;

  const user = `把用户的一句话搜索需求，解析成结构化检索条件。只输出 JSON，不要解释：
{"keywords":["检索词"],"category":"project|event|trade|bounty|tech|","city":"城市名","industry":"行业名","typeName":"类型名","amountMin":null,"amountMax":null,"intent":"一句中文说明"}

规则：
1. keywords 给 1~3 个最有区分度的检索词（产品、动作、专有名词），不要把城市和类别再塞进去；
2. category 只能取 project(项目) / event(活动) / trade(贸易) / bounty(悬赏) / tech(科技成果转化)，判断不出给空字符串；
3. city 填可能出现的城市全名（如「杭州市」），没有给空字符串；
4. industry 填行业名（如「光伏」「储能」「算力」），没有给空字符串；
5. amountMin / amountMax 单位是「万元」，判断不出给 null；
6. intent 用一句中文说明你理解他在找什么，不要超过 20 字。

用户说的是：
"""${src}"""`;

  try {
    const raw = await chat(
      [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: user },
      ],
      { json: true, temperature: 0.1 },
    );
    const j = extractJson(raw) || {};
    const kw = Array.isArray(j.keywords) ? j.keywords : [];
    const out = {
      q: src,
      keywords: kw.map((x) => String(x || '').trim()).filter(Boolean).slice(0, 4),
      category: ['project', 'event', 'trade', 'bounty', 'tech'].includes(String(j.category || '')) ? String(j.category) : '',
      city: String(j.city || '').trim().slice(0, 20) || rule.city,
      industry: String(j.industry || '').trim().slice(0, 20) || rule.industry,
      typeName: String(j.typeName || '').trim().slice(0, 20) || rule.typeName,
      amountMin: Number.isFinite(Number(j.amountMin)) && j.amountMin !== null ? Number(j.amountMin) : null,
      amountMax: Number.isFinite(Number(j.amountMax)) && j.amountMax !== null ? Number(j.amountMax) : null,
      intent: String(j.intent || '').trim().slice(0, 40),
      source: 'ai',
    };
    if (!out.keywords.length) out.keywords = [src.slice(0, 12)];
    return out;
  } catch {
    return rule;
  }
}

/**
 * 从名片照片或聊天截图里提取联系信息。
 *
 * 直接用视觉模型出 JSON，比「先 OCR 再正则」准得多 ——
 * 名片上的「手机」「Tel」「M」「微信/WeChat」这些标法太杂，正则很难覆盖。
 * 视觉模型失败时退回：先用 ocrImages 拿文字，再走 extractContactInfo。
 */
export async function extractContactFromImages({ images = [] } = {}) {
  const list = (images || []).filter(Boolean).slice(0, 3);
  if (!list.length) return { ok: false, note: '没有图片', name: '', phone: '', wechat: '', company: '' };
  if (!visionConfigured()) {
    return { ok: false, note: '未配置视觉模型（后台 → AI 设置里绑定支持读图的模型）', name: '', phone: '', wechat: '', company: '' };
  }

  const prompt = [
    '这是一张名片，或包含联系方式的截图/照片。请提取联系信息。只输出 JSON，不要解释：',
    '{"name":"联系人姓名","phone":"手机号或座机号","wechat":"微信号","company":"公司全称","title":"职务"}',
    '规则：',
    '1. 找不到的字段给空字符串，不要编造；',
    '2. name 只填人名，不要带职务；',
    '3. phone 手机号优先，11 位纯数字，不要带空格横线；座机保留区号；',
    '4. wechat 只填微信号本身，不要把手机号当微信号；',
    '5. company 填完整的企业/单位名称；',
    '6. title 填职务（如 总经理、项目经理），没有就留空。',
  ].join('\n');

  try {
    const r = await visionDescribe({ images: list, prompt });
    if (r.ok && r.text) {
      const j = extractJson(r.text);
      if (j && typeof j === 'object') {
        const out = {
          name: String(j.name || '').trim().slice(0, 20),
          phone: String(j.phone || '').replace(/[^\d\-]/g, '').slice(0, 20),
          wechat: String(j.wechat || '').trim().slice(0, 40),
          company: String(j.company || '').trim().slice(0, 60),
          title: String(j.title || '').trim().slice(0, 20),
          source: 'vision',
        };
        if (out.name || out.phone || out.wechat || out.company) {
          return { ok: true, ...out, note: '' };
        }
      }
      // 视觉模型没吐合法 JSON，退回「文字 + 正则」
      const rx = regexContact(r.text);
      const fallback = { ...rx, name: '', company: '' };
      return {
        ok: Boolean(fallback.phone || fallback.wechat),
        ...fallback,
        source: 'vision-text',
        note: fallback.phone || fallback.wechat ? '' : '名片上没识别到电话或微信',
      };
    }
    return { ok: false, note: r.note || '图片识别失败', name: '', phone: '', wechat: '', company: '' };
  } catch (err) {
    return { ok: false, note: err.message || '识别失败', name: '', phone: '', wechat: '', company: '' };
  }
}

export async function extractContactInfo({ text = '' } = {}) {
  const src = String(text || '').trim().slice(0, 2000);
  if (!src) return { ok: false, note: '没有可识别的文字', name: '', phone: '', wechat: '', company: '' };

  const rx = regexContact(src);

  if (!aiConfigured()) {
    return { ok: Boolean(rx.phone || rx.wechat), ...rx, name: '', company: '', source: 'regex' };
  }

  const user = `从下面这段文字里提取联系信息。只输出 JSON，不要解释：
{"name":"联系人姓名","phone":"手机号或座机号","wechat":"微信号","company":"企业全称"}

规则：
1. 找不到的字段给空字符串，不要编造；
2. name 只填人名（如「张工」「李经理」「王总」），不要带职务后缀之外的修饰；
3. company 填完整的企业/单位名称，没有就留空；
4. phone 优先手机号，保留 11 位数字，不要带空格横线；
5. wechat 只填微信号本身，不要把手机号当微信号。

文字：
"""${src}"""`;

  try {
    const raw = await chat(
      [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: user },
      ],
      { json: true, temperature: 0.1 },
    );
    const j = extractJson(raw) || {};
    const out = {
      name: String(j.name || '').trim().slice(0, 20),
      phone: String(j.phone || '').replace(/[^\d]/g, '').slice(0, 20) || rx.phone,
      wechat: String(j.wechat || '').trim().slice(0, 40) || rx.wechat,
      company: String(j.company || '').trim().slice(0, 60),
      source: 'ai',
    };
    const ok = Boolean(out.name || out.phone || out.wechat || out.company);
    return { ok, ...out, note: ok ? '' : '没识别到联系信息' };
  } catch (err) {
    return {
      ok: Boolean(rx.phone || rx.wechat),
      name: '', company: '', ...rx,
      source: 'regex',
      note: `AI 识别失败，已用规则提取：${err.message}`,
    };
  }
}


/* ------------------------------------------------------------------ */
/* 多条目识别与拆分                                                    */
/*   用户常常一次贴一堆项目/活动，这时应该拆成多条分别发布。            */
/*   贸易（采购供应）除外 —— 一个采购清单本身就是一条。                */
/* ------------------------------------------------------------------ */

const SPLIT_LABEL = {
  project: '项目',
  bounty: '悬赏任务',
  event: '活动',
};

export async function splitItems({ text = '', fileText = '', category = 'project' } = {}) {
  const body = `${String(text || '').trim()}\n\n${String(fileText || '').trim()}`.trim();
  const unit = SPLIT_LABEL[category] || '项目';

  if (!body) return { ok: false, count: 0, items: [], note: '没有可分析的内容' };
  if (category === 'trade') return { ok: true, count: 1, items: [], note: '贸易类不拆分' };
  if (!aiConfigured()) return { ok: false, count: 0, items: [], note: '未配置 AI' };

  const user = `下面是一段资料。请判断它包含几个彼此独立的【${unit}】。

规则：
1. 如果只有一个${unit}，返回 {"count":1,"items":[]}；
2. 如果有多个，逐个拆开，每个${unit}单独一条，提取：
   - title：该${unit}的标题（不超过 40 字，要能独立看懂）
   - subtitle：一句话补充（金额/规模/地点/时间，能提取就写，没有就空）
   - text：该${unit}的正文要点（保留原文关键信息，不要编造，150~500 字）
3. count 必须等于 items 的长度；
4. 只是同一${unit}的不同方面（如既有金额又有工期）不算多个，不要拆；
5. 不要编造资料里没有的${unit}。

只输出 JSON，不要解释：
{"count":2,"items":[{"title":"...","subtitle":"...","text":"..."}]}

资料：
"""${body.slice(0, 12000)}"""`;

  try {
    const raw = await chat(
      [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: user },
      ],
      { json: true, temperature: 0.1 },
    );
    const j = extractJson(raw) || {};
    let items = Array.isArray(j.items) ? j.items : [];
    items = items
      .map((x) => ({
        title: String((x && x.title) || '').trim().slice(0, 80),
        subtitle: String((x && x.subtitle) || '').trim().slice(0, 200),
        text: String((x && x.text) || '').trim().slice(0, 4000),
      }))
      .filter((x) => x.title || x.text);

    const count = Math.max(items.length, Number(j.count) || 0);
    if (items.length <= 1) {
      return { ok: true, count: items.length === 1 ? 1 : Math.min(count, 1), items: [], note: '' };
    }
    return { ok: true, count: items.length, items, note: '' };
  } catch (err) {
    return { ok: false, count: 0, items: [], note: `拆分判断失败：${err.message}` };
  }
}


/* ------------------------------------------------------------------ */
/* 贸易：从文字里汇总出物资明细表格                                    */
/* ------------------------------------------------------------------ */

const TRADE_ITEM_KEYS = ['name', 'spec', 'quantity', 'unit', 'price', 'note'];

export async function extractTradeItems({ text = '', fileText = '' } = {}) {
  const body = `${String(text || '').trim()}\n\n${String(fileText || '').trim()}`.trim().slice(0, 14000);
  if (!body) return { ok: false, items: [], note: '没有可分析的内容' };
  if (!aiConfigured()) return { ok: false, items: [], note: '未配置 AI' };

  const user = `从下面的供应 / 采购资料里，把所有物资逐条整理成明细表。

规则：
1. 每一种物资算一条，不要合并不同规格；
2. 字段：
   - name     品名（必填，如 单晶硅光伏组件）
   - spec     规格型号（如 550W 单玻）
   - quantity 数量（只写数字，如 2000）
   - unit     单位（如 块 / 吨 / 套 / 米）
   - price    单价或价格条件（如 0.85 元/W、电议、面议）
   - note     备注（品牌、交期、质量标准等，没有就空）
3. 资料里没有的字段一律给空字符串，不要编造；
4. 如果资料里只有一种物资，也只输出一条；
5. 最多 30 条。

只输出 JSON，不要解释：
{"items":[{"name":"","spec":"","quantity":"","unit":"","price":"","note":""}]}

资料：
"""${body}"""`;

  try {
    const raw = await chat(
      [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: user },
      ],
      { json: true, temperature: 0.1 },
    );
    const j = extractJson(raw) || {};
    const rawItems = Array.isArray(j.items) ? j.items : Array.isArray(j) ? j : [];
    const items = rawItems
      .map((it) => {
        const o = {};
        for (const k of TRADE_ITEM_KEYS) {
          o[k] = String((it && it[k]) || '').trim().slice(0, k === 'note' ? 120 : 60);
        }
        return o;
      })
      .filter((o) => o.name || o.spec)
      .slice(0, 30);

    if (!items.length) return { ok: false, items: [], note: '没识别出物资明细' };
    return { ok: true, items, count: items.length, note: '' };
  } catch (err) {
    return { ok: false, items: [], note: `汇总失败：${err.message}` };
  }
}

export function asrConfigured() {
  try {
    return settingsSvc.effectiveAsrConfig().enabled;
  } catch {
    return false;
  }
}

export async function speechToText(audio, filename = 'audio.wav') {
  if (!audio || !audio.length) return { ok: false, text: '', note: '没有音频' };
  if (!asrConfigured()) return { ok: false, text: '', note: '未配置语音转写' };

  const eff = settingsSvc.effectiveAsrConfig();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), eff.timeoutMs || 90000);
  try {
    const fd = new FormData();
    fd.append('model', eff.model);
    fd.append('file', new Blob([audio]), filename);
    fd.append('response_format', 'json');

    const res = await fetch(`${eff.baseUrl}/audio/transcriptions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${eff.apiKey}` },
      body: fd,
      signal: ctrl.signal,
    });
    const txt = await res.text();
    if (!res.ok) return { ok: false, text: '', note: `语音转写 ${res.status}：${txt.slice(0, 200)}` };
    let text = '';
    try {
      const json = JSON.parse(txt);
      text = String(json.text || json.transcription || '').trim();
    } catch {
      text = String(txt || '').trim();
    }
    return { ok: Boolean(text), text };
  } catch (err) {
    return { ok: false, text: '', note: `语音转写失败：${err.message}` };
  } finally {
    clearTimeout(timer);
  }
}

export async function generateTitles(input) {
  const local = await localTitles(input);
  if (!aiConfigured()) return local;

  // 第二步的主输入是第一步的 digest，这里放宽附件上限避免正文缺信息
  const fileText = String(input.fileText || '').slice(0, 20000);
  const user = `请为下面这条【${input.categoryName || '项目'}】信息生成发布用主标题与副标题。

要求：
1. 主标题不超过 30 个汉字，包含地区、行业/领域、核心动作与合作方式，信息量优先，不要标题党、不要夸张承诺；
2. 副标题不超过 40 个汉字，补充关键条件：金额、规模、周期、地点、合作方式（选最重要的 3-4 项，用" · "分隔）；
3. 再给出 2 个备选主标题；
4. 提炼 5-10 个关键词（用于行业/城市分类与检索）。

${input.digest ? `资料汇总（第一步已完成，优先以此为准）：\n"""${String(input.digest).slice(0, 2000)}"""\n` : ''}
用户填写/导入的原始内容：
"""${String(input.text || '').slice(0, 5000)}"""
${fileText ? `\n从附件中提取的内容：\n"""${fileText}"""` : ''}
${input.filename ? `\n主要附件：${input.filename}` : ''}

请只输出如下 JSON：
{"title":"","subtitle":"","keywords":[""],"alternatives":[{"title":"","subtitle":""}]}`;

  try {
    const raw = await chat(
      [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: user },
      ],
      { json: true, temperature: 0.5 },
    );
    const parsed = extractJson(raw);
    if (!parsed || !parsed.title) return local;
    const title = String(parsed.title).trim().slice(0, 60) || local.title;
    const subtitle = String(parsed.subtitle || local.subtitle).trim().slice(0, 80);
    const keywords = Array.isArray(parsed.keywords)
      ? parsed.keywords.map((k) => String(k).trim()).filter(Boolean).slice(0, 12)
      : local.keywords;
    const alternatives = Array.isArray(parsed.alternatives)
      ? parsed.alternatives
          .map((a) => ({ title: String(a?.title || '').trim().slice(0, 60), subtitle: String(a?.subtitle || subtitle).trim().slice(0, 80) }))
          .filter((a) => a.title)
          .slice(0, 3)
      : local.alternatives;
    return { title, subtitle, keywords, alternatives, source: 'ai' };
  } catch (err) {
    console.warn('[ai] 标题生成失败，回退本地引擎:', err.message);
    return { ...local, note: `AI 调用失败：${err.message}` };
  }
}

/* ------------------------------------------------------------------ */
/* 对外：项目解析（可靠性分析）                                          */
/* ------------------------------------------------------------------ */
export async function analyzeProject(input) {
  const local = await localAnalyze(input);
  if (!aiConfigured()) return local;

  const fileText = String(input.fileText || '').slice(0, 20000);
  const fileList = (input.files || []).map((f) => `${f.name}（${f.kind}）`).join('、');
  const user = `请对下面这条【${input.categoryName || '项目'}】信息做结构化解析与可靠性评估。

${input.digest ? `资料汇总（第一步已完成，优先以此为准）：\n"""${String(input.digest).slice(0, 3000)}"""\n` : ''}
原始正文：
"""${String(input.text || '').slice(0, 6000)}"""
${fileText ? `\n附件提取内容：\n"""${fileText}"""` : ''}
${fileList ? `\n附件清单：${fileList}` : ''}
${input.company ? `\n发布方企业：${input.company}` : ''}

评估维度：信息完整度（主体、金额、地点、周期、交易结构、回报方式）、商业合理性、合规风险（承诺保本/资金盘/虚拟币/前置费用等）、可执行性。

请只输出如下 JSON：
{
 "summary":"150字以内的项目摘要，说明是什么项目、体量、合作方式、亮点",
 "reliability":{"score":0-100,"level":"high|good|medium|low","label":"中文评级","findings":["正面发现"],"risks":["风险点"],"suggestions":["建议补充的信息"]},
 "industries":[{"id":"","name":""}],
 "subs":[{"id":"","name":"","industryId":""}],
 "cities":[{"id":"","name":"","province":""}],
 "types":[{"id":"","name":""}],
 "keywords":["关键词"],
 "coverSuggestion":{"reason":"建议用什么图做主图"}
}`;

  try {
    const raw = await chat(
      [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: user },
      ],
      { json: true, temperature: 0.3, maxTokens: 2600 },
    );
    const parsed = extractJson(raw);
    if (!parsed) return local;

    const rel = parsed.reliability || {};
    const num = Number(rel.score);
    const score = Number.isFinite(num) ? Math.max(0, Math.min(100, Math.round(num))) : local.reliability.score;
    const level = ['high', 'good', 'medium', 'low'].includes(rel.level)
      ? rel.level
      : score >= 80
        ? 'high'
        : score >= 65
          ? 'good'
          : score >= 45
            ? 'medium'
            : 'low';

    const arr = (v) => (Array.isArray(v) ? v.map((x) => String(x).trim()).filter(Boolean).slice(0, 10) : []);
    const objArr = (v, keys) =>
      Array.isArray(v)
        ? v
            .map((x) => {
              const o = {};
              for (const k of keys) if (x && x[k]) o[k] = String(x[k]);
              return o;
            })
            .filter((o) => Object.keys(o).length)
            .slice(0, 6)
        : [];

    return {
      ...local,
      summary: String(parsed.summary || local.summary).slice(0, 600),
      reliability: {
        score,
        level,
        label: String(rel.label || local.reliability.label).slice(0, 30),
        findings: arr(rel.findings).length ? arr(rel.findings) : local.reliability.findings,
        risks: arr(rel.risks).length ? arr(rel.risks) : local.reliability.risks,
        suggestions: arr(rel.suggestions).length ? arr(rel.suggestions) : local.reliability.suggestions,
      },
      industries: objArr(parsed.industries, ['id', 'name']).length ? objArr(parsed.industries, ['id', 'name']) : local.industries,
      subs: objArr(parsed.subs, ['id', 'name', 'industryId']).length ? objArr(parsed.subs, ['id', 'name', 'industryId']) : local.subs,
      cities: objArr(parsed.cities, ['id', 'name', 'province']).length ? objArr(parsed.cities, ['id', 'name', 'province']) : local.cities,
      types: objArr(parsed.types, ['id', 'name']).length ? objArr(parsed.types, ['id', 'name']) : local.types,
      keywords: arr(parsed.keywords).length ? arr(parsed.keywords) : local.keywords,
      coverSuggestion: {
        reason: String(parsed?.coverSuggestion?.reason || '').slice(0, 120) || undefined,
      },
      source: 'ai',
    };
  } catch (err) {
    console.warn('[ai] 项目解析失败，回退本地引擎:', err.message);
    return { ...local, note: `AI 调用失败：${err.message}` };
  }
}

/* ------------------------------------------------------------------ */
/* 对外：留言自动回复                                                   */
/* ------------------------------------------------------------------ */
export async function replyComment(input) {
  const local = await localReply(input);
  if (!aiConfigured()) return local;

  const listing = input.listing || {};
  const history = (input.history || [])
    .slice(-8)
    .map((c) => `${c.authorName || (c.isAI ? 'AI 助手' : '用户')}：${String(c.content || '').slice(0, 200)}`)
    .join('\n');

  const user = `你是"小鱼来了"平台的项目助理，代表发布方在项目页留言区作答。

【信息标题】${listing.title || ''}
【副标题】${listing.subtitle || ''}
【类型】${listing.categoryName || ''} / ${listing.typeName || ''}
【行业】${(listing.industryNames || []).join('、')}
【城市】${(listing.cityNames || []).join('、')}
【有效期至】${listing.expiresAt ? new Date(listing.expiresAt).toLocaleDateString('zh-CN') : '未标注'}
【AI 可靠性评分】${listing?.ai?.reliability?.score ?? '未评估'}（${listing?.ai?.reliability?.label || ''}）
【项目正文】
"""${String(listing.text || '').slice(0, 3000)}"""
${listing.fileText ? `\n【附件要点】\n"""${String(listing.fileText).slice(0, 2000)}"""` : ''}

【最近留言】
${history || '（无）'}

【本次提问】${String(input.comment?.content || '').slice(0, 500)}

要求：
1. 只根据上面的资料回答，**绝对不要编造**金额、时间、资质、联系人等信息；资料里没有的就明确说"发布方未公开，建议发起项目对接"；
2. 语气专业、简洁，80-180 字，可分点；
3. 适当引导用户使用"项目对接""留言""关注"功能；
4. 纯文本输出，不要 JSON，不要 Markdown 标题。`;

  try {
    const reply = await chat(
      [
        { role: 'system', content: '你是严谨、克制、不说空话的中文商务助理。' },
        { role: 'user', content: user },
      ],
      { temperature: 0.5, maxTokens: 600 },
    );
    const text = String(reply || '').trim();
    if (!text) return local;
    return { reply: text.slice(0, 1200), source: 'ai' };
  } catch (err) {
    console.warn('[ai] 自动回复失败，回退本地引擎:', err.message);
    return local;
  }
}

/* ------------------------------------------------------------------ */
/* 对外：会议纪要                                                       */
/* ------------------------------------------------------------------ */
const ACTION_RE = /(负责|跟进|完成|提供|发送|对接|安排|确认|整理|报价|出方案|签订|付款|交付)/;

export function localMinutes({ meeting, transcript, participants }) {
  const text = cleanText(
    Array.isArray(transcript)
      ? transcript.map((t) => `${t.speaker || '参会人'}：${t.text || ''}`).join('\n')
      : String(transcript || ''),
  );
  const lines = text.split('\n').filter(Boolean);
  const sents = sentences(text);

  const decisions = [];
  const actions = [];
  for (const s of sents) {
    if (/决定|确认|敲定|达成|同意|一致|定下来|就这么/.test(s)) decisions.push(s.slice(0, 140));
    if (ACTION_RE.test(s) && s.length >= 8) {
      const speaker = lines.find((l) => l.includes(s.slice(0, 10)));
      const owner = speaker ? speaker.split('：')[0] : '待指派';
      actions.push({ owner, task: s.slice(0, 140), due: extractDue(s) });
    }
  }

  const summary = sents.length
    ? `本次会议共 ${lines.length} 条发言，围绕「${meeting?.title || '项目'}」展开。核心内容：${sents.slice(0, 3).join('；').slice(0, 300)}`
    : '本次会议未捕获到有效语音内容。';

  const followUp =
    '【会议纪要确认】\n' +
    `主题：${meeting?.title || '项目沟通会'}\n` +
    `时间：${meeting?.startAt ? new Date(meeting.startAt).toLocaleString('zh-CN') : new Date().toLocaleString('zh-CN')}\n` +
    `参会：${(participants || []).map((p) => p.name || p).join('、') || '—'}\n` +
    `\n一、会议要点\n${sents.slice(0, 5).map((s) => `· ${s.slice(0, 120)}`).join('\n') || '· （无）'}\n` +
    `\n二、已达成的共识\n${decisions.slice(0, 5).map((s) => `· ${s}`).join('\n') || '· （无）'}\n` +
    `\n三、双方后续跟进事项\n${
      actions.slice(0, 8).map((a, i) => `${i + 1}. ${a.owner}：${a.task}${a.due ? `（${a.due}）` : ''}`).join('\n') || '1. 待补充'
    }\n` +
    '\n请双方确认以上内容。确认后该纪要会归档到项目跟进记录。';

  return {
    summary,
    decisions: uniq(decisions).slice(0, 8),
    actions: actions.slice(0, 12),
    followUp,
    keyPoints: sents.slice(0, 8).map((s) => s.slice(0, 160)),
    source: 'local',
  };
}

function extractDue(s) {
  const m = /(\d{1,2}\s*月\s*\d{1,2}\s*[日号])|(\d{4}[-\/年]\d{1,2}[-\/月]\d{1,2})|(下周[一二三四五六日天]?)|(本周[一二三四五六日天]?)|(明后天?)|(\d+\s*个工作日内?)|(\d+\s*天内?)/.exec(s);
  return m ? m[0] : '';
}

export async function meetingMinutes(input) {
  const local = localMinutes(input);
  if (!aiConfigured()) return local;

  const transcriptText = Array.isArray(input.transcript)
    ? input.transcript.map((t) => `${t.speaker || '参会人'}：${t.text || ''}`).join('\n')
    : String(input.transcript || '');

  if (!transcriptText.trim()) return local;

  const user = `下面是一场项目对接会议（含语音转写）的记录。请整理成正式会议纪要。

【会议主题】${input.meeting?.title || ''}
【所属项目】${input.listing?.title || ''}（${input.listing?.categoryName || ''}）
【参会人】${(input.participants || []).map((p) => p.name || p).join('、')}

【转写原文】
"""${transcriptText.slice(0, 9000)}"""

请只输出如下 JSON：
{
 "summary":"200字以内会议摘要",
 "keyPoints":["要点"],
 "decisions":["已达成的共识/决定"],
 "actions":[{"owner":"负责人","task":"具体事项","due":"截止时间或空字符串"}],
 "followUp":"发给双方确认的完整纪要文本，含会议要点、共识、双方后续跟进事项，纯文本带序号"
}
要求：只依据转写内容，不要编造。转写有误时按上下文合理推断，但不得虚构金额、日期与结论。`;

  try {
    const raw = await chat(
      [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: user },
      ],
      { json: true, temperature: 0.3, maxTokens: 2600 },
    );
    const parsed = extractJson(raw);
    if (!parsed || !parsed.summary) return local;
    const arr = (v) => (Array.isArray(v) ? v.map((x) => String(x).trim()).filter(Boolean).slice(0, 12) : []);
    return {
      summary: String(parsed.summary).slice(0, 800),
      keyPoints: arr(parsed.keyPoints).length ? arr(parsed.keyPoints) : local.keyPoints,
      decisions: arr(parsed.decisions).length ? arr(parsed.decisions) : local.decisions,
      actions: Array.isArray(parsed.actions) && parsed.actions.length
        ? parsed.actions
            .map((a) => ({ owner: String(a?.owner || '待指派'), task: String(a?.task || ''), due: String(a?.due || '') }))
            .filter((a) => a.task)
            .slice(0, 12)
        : local.actions,
      followUp: String(parsed.followUp || local.followUp).slice(0, 4000),
      source: 'ai',
    };
  } catch (err) {
    console.warn('[ai] 会议纪要失败，回退本地引擎:', err.message);
    return { ...local, note: `AI 调用失败：${err.message}` };
  }
}

/* ------------------------------------------------------------------ */
/* 对外：自定义问答（用于项目 AI 助手对话）                              */
/* ------------------------------------------------------------------ */
export async function askAboutListing({ listing, question, history = [] }) {
  const base = await replyComment({
    listing,
    comment: { content: question },
    history,
  });
  return base;
}

export function aiStatus() {
  const conf = effectiveAiConfig();
  const on = Boolean(conf.enabled && conf.apiKey);
  return {
    mode: on ? 'ai' : 'local',
    provider: on ? conf.baseUrl : '内置规则引擎',
    model: on ? conf.model : 'rule-based-v1',
    enabled: true,
    source: conf.source,
  };
}

export default {
  extractContactFromImages,
  parseSearchIntent,
  extractTradeItems,
  splitItems,
  extractContactInfo,
  ocrImages,
  visionDescribe,
  speechToText,
  visionConfigured,
  asrConfigured,
  summarizeProject,
  localSummary,
  generateTitles,
  analyzeProject,
  replyComment,
  meetingMinutes,
  askAboutListing,
  chat,
  aiStatus,
  extractJson,
};

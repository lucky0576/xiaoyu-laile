/**
 * 联系方式自动隐藏
 *
 * 背景：平台早就强制隐藏了结构化的「联系方式」字段，
 * 但用户完全可以把手机号直接打进标题或正文 —— 实测确实会原样泄漏。
 * 本模块负责把自由文本里的联系方式识别出来并隐去。
 *
 * 设计取舍：
 *   · 只做「隐藏」，不阻止发布。写错了内容不该被拒绝，
 *     但展示时必须隐去 —— 这样发布者也看得见自己写了什么。
 *   · 全角数字先归一化再匹配：１２３ 是常见的绕过手法。
 *   · 宁可漏一点，也不要把金额、日期、项目编号误伤成联系方式。
 */

/* ------------------------------------------------------------------ */
/* 归一化                                                              */
/* ------------------------------------------------------------------ */

/** 全角数字/符号转半角，防止用 １２３ 这类写法绕过识别 */
export function normalizeFullWidth(text) {
  return String(text ?? '').replace(/[\uFF10-\uFF19\uFF20\uFF0B\uFF0D\uFF1A\uFF0E]/g, (c) => {
    const code = c.charCodeAt(0);
    if (code >= 0xff10 && code <= 0xff19) return String.fromCharCode(code - 0xfee0); // ０-９
    if (code === 0xff20) return '@';
    if (code === 0xff0b) return '+';
    if (code === 0xff0d) return '-';
    if (code === 0xff1a) return ':';
    if (code === 0xff0e) return '.';
    return c;
  });
}

/* ------------------------------------------------------------------ */
/* 识别规则                                                            */
/* ------------------------------------------------------------------ */

/**
 * kind 用于界面提示「已隐藏：手机号 ×2」。
 * 顺序有讲究：先匹配更长更具体的，避免手机号被座机规则截胡。
 */
const RULES = [
  // 邮箱
  { kind: '邮箱', re: /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g },
  // 手机号：可带 +86 / 86，数字间可有空格或短横线
  { kind: '手机号', re: /(?:\+?86[\s-]?)?1[3-9]\d[\s-]?\d{4}[\s-]?\d{4}(?!\d)/g },
  // 400 / 800 服务电话
  { kind: '服务电话', re: /[48]00[\s-]?\d{3}[\s-]?\d{4}(?!\d)/g },
  // 座机：区号-号码，必须有分隔符或整体够长，避免误伤日期
  { kind: '固定电话', re: /0\d{2,3}[\s-]\d{7,8}(?!\d)|0\d{2,3}\d{7,8}(?!\d)/g },
  // 微信 / QQ 等社交账号（带中文或英文前缀）
  {
    kind: '社交账号',
    re: /(?:微信|微.?信|weixin|wechat|wx|vx|VX|V信|QQ|qq|企鹅)\s*(?:号|号码|ID|id)?\s*[:：]?\s*[A-Za-z0-9_-]{4,20}/g,
  },
  // 纯 QQ 号
  { kind: 'QQ', re: /QQ\s*[:：]?\s*\d{5,12}/gi },
  // 「V:xxx」「电话:xxx」这类简写前缀
  { kind: '联系方式', re: /(?:电话|手机|联系|联络|Tel|TEL|tel|Phone|phone|Call|call)\s*[:：]?\s*[A-Za-z0-9+][A-Za-z0-9\s\-+]{5,20}/g },
];

/** 占位符：不用部分遮掩（138****1234）——那仍然泄漏了大部分信息 */
export const MASK = '【联系方式已隐藏】';

/**
 * 扫描文本里的联系方式。
 * @returns {{kind:string, raw:string, index:number}[]}
 */
export function scanContacts(text) {
  const src = normalizeFullWidth(text);
  if (!src) return [];

  const hits = [];
  // 已被前一条规则覆盖的区间，避免同一段文字被重复计算
  const taken = [];

  for (const { kind, re } of RULES) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(src)) !== null) {
      const start = m.index;
      const end = start + m[0].length;
      if (taken.some(([s, e]) => start < e && end > s)) continue;
      taken.push([start, end]);
      hits.push({ kind, raw: m[0], index: start });
      if (m[0].length === 0) re.lastIndex++; // 防死循环
    }
  }

  return hits.sort((a, b) => a.index - b.index);
}

/**
 * 隐藏文本里的联系方式。
 * @returns {{text:string, hits:object[], count:number, kinds:string[]}}
 */
export function maskContacts(text) {
  const original = String(text ?? '');
  if (!original) return { text: original, hits: [], count: 0, kinds: [] };

  const hits = scanContacts(original);
  if (!hits.length) return { text: original, hits: [], count: 0, kinds: [] };

  // 按原串位置替换：先把归一化后的命中位置映射回原串
  const norm = normalizeFullWidth(original);
  // 归一化是等长替换，位置可直接复用
  if (norm.length !== original.length) {
    // 理论上不会发生，真发生了就退化为正则替换
    let out = original;
    for (const { raw } of hits) out = out.split(raw).join(MASK);
    return { text: out, hits, count: hits.length, kinds: [...new Set(hits.map((h) => h.kind))] };
  }

  let out = '';
  let cursor = 0;
  for (const h of hits) {
    if (h.index < cursor) continue;
    out += original.slice(cursor, h.index) + MASK;
    cursor = h.index + h.raw.length;
  }
  out += original.slice(cursor);

  return {
    text: out,
    hits,
    count: hits.length,
    kinds: [...new Set(hits.map((h) => h.kind))],
  };
}

/** 是否含有联系方式（发布前提示用） */
export function hasContact(text) {
  return scanContacts(text).length > 0;
}

export default { normalizeFullWidth, scanContacts, maskContacts, hasContact, MASK, RULES };

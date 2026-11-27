/**
 * 杭州政策通 — 通知自动抓取
 *
 * 背景：
 *   8 个政府官网的**首页**是服务端渲染，真实通知列表就在 HTML 里；
 *   但「栏目的内页」（/col/colXXX/index.html）是 JS 异步加载，GET 只能拿到壳。
 *   所以抓取策略是：**只抓首页，从中筛出目标栏目的文章链接**。
 *
 * 这样做的好处是零依赖——不需要装 Chromium/Playwright，用 Node 内置 fetch 就够。
 *
 * 去重：按文章 URL 判重（同一篇文章 URL 唯一）。
 * 增量：只入库库里没有的 URL，且只保留最近 N 天。
 */

import db, { newId } from '../store/db.js';

const noticesCol = () => db.collection('hz_notices');

/* ------------------------------------------------------------------ */
/* 站点配置                                                            */
/* ------------------------------------------------------------------ */

/**
 * cols：该站首页上属于「通知/政策/公示」栏目的路径前缀。
 *       命中任一即收录；若一个都没命中，退回收录全部 /art/ 链接。
 */
const SITES = [
  {
    id: 'jxj', name: '市经信局', base: 'https://jxj.hangzhou.gov.cn/',
    cols: [
      '/col/col1229252271/', // 通知文件
      '/col/col1229145718/', // 规范性文件
      '/col/col1229252265/', // 公告公示
      '/col/col1229252269/', // 评审申报
      '/col/col1229145719/', // 其他文件
    ],
  },
  {
    id: 'kjj', name: '市科技局', base: 'https://kj.hangzhou.gov.cn/',
    cols: ['/col/col1693961/', '/col/col1229397648/', '/col/col1229323591/', '/col/col1228922131/'],
  },
  {
    id: 'swj', name: '市商务局', base: 'https://sww.hangzhou.gov.cn/',
    cols: ['/col/col1229460831/', '/col/col1551465/'],
  },
  {
    id: 'scjg', name: '市市监局', base: 'https://scjg.hangzhou.gov.cn/',
    cols: ['/col/col1693484/', '/col/col1693485/', '/col/col1693508/'],
  },
  {
    id: 'zj-jxt', name: '省经信厅', base: 'https://jxt.zj.gov.cn/',
    cols: ['/col/col1229886900/', '/col/col1229892974/', '/col/col1229123402/', '/col/col1229123362/'],
  },
  {
    id: 'zj-kjt', name: '省科技厅', base: 'https://kjt.zj.gov.cn/',
    cols: ['/col/col1229225203/', '/col/col1228971337/', '/col/col1228971387/'],
  },
  {
    id: 'miit', name: '工业和信息化部', base: 'https://www.miit.gov.cn/',
    cols: ['/zwgk/zcwj/', '/zwgk/wjgs/', '/zwgk/zcjd/'],
  },
];

export { SITES as CRAWL_SITES };

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';

/* ------------------------------------------------------------------ */
/* 解析                                                                */
/* ------------------------------------------------------------------ */

const ENTITY = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&nbsp;': ' ' };
function decode(s) {
  return String(s || '').replace(/&(amp|lt|gt|quot|#39|nbsp);/g, (m) => ENTITY[m] || m).trim();
}

/** 从一段 HTML 里解析文章链接 */
export function parseArticles(html, site) {
  const out = [];
  const seen = new Set();

  // 匹配：href 后可能跟 target/title 等属性，再取 title
  const re = /<a\b[^>]*?href="([^"]*?\/art\/\d{4}\/art_[^"]*?\.html)"[^>]*?>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = re.exec(html))) {
    const rawHref = m[1];
    const inner = m[2];
    // 整段 a 标签，用来抠 title 属性和日期
    const fullTag = m[0].slice(0, m[0].indexOf('>') + 1);

    let title = '';
    const tm = /title="([^"]+)"/i.exec(fullTag);
    if (tm) title = decode(tm[1]);
    if (!title) {
      // 退回链接文字（可能是截断的，但比没有好）
      title = decode(inner.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' '));
    }
    if (!title || title.length < 6) continue;
    // 过滤纯图片链接与占位
    if (/^(查看|更多|详情|下一页|上一页)$/.test(title)) continue;

    const url = rawHref.startsWith('http') ? rawHref : new URL(rawHref, site.base).href;
    if (seen.has(url)) continue;
    seen.add(url);

    /*
     * 日期提取：限定在**本条所在的 <li> 块**里找。
     * 不能简单用「前后 300 字符窗口」——多个条目挨得近时会把邻条的日期串过来，
     * 实测科技局会出现多条同日期。经信局的列表里则根本没有日期，只能留空，
     * 后面由 fillMissingDates 抓文章页补。
     */
    const pos = m.index;
    const liStart = html.lastIndexOf('<li', pos);
    const liEnd = html.indexOf('</li>', pos);
    let win;
    if (liStart >= 0 && liEnd > pos && pos - liStart < 3000) {
      win = html.slice(liStart, liEnd);
    } else {
      win = html.slice(Math.max(0, pos - 200), Math.min(html.length, pos + m[0].length + 200));
    }
    const dm = /(\d{4})-(\d{2})-(\d{2})/.exec(win);

    out.push({
      url,
      title,
      date: dm ? `${dm[1]}-${dm[2]}-${dm[3]}` : '',
      col: (rawHref.match(/(\/col\/col\d+\/|\/zwgk\/[a-z]+\/)/) || [])[1] || '',
      year: (rawHref.match(/\/art\/(\d{4})\//) || [])[1] || '',
    });
  }
  return out;
}

/** 按目标栏目筛选 */
function filterByCols(list, site) {
  const hit = list.filter((a) => site.cols.some((c) => a.url.includes(c)));
  return hit.length ? hit : list;
}

/** 推断标签 */
function guessTag(title) {
  const t = String(title || '');
  if (/公示/.test(t)) return '名单公示';
  if (/公布/.test(t)) return '名单公布';
  if (/申报|征集|组织开展|开展.*工作/.test(t)) return '申报通知';
  if (/管理办法|实施方案|行动方案|工作指引|意见|办法/.test(t)) return '规范性文件';
  if (/解读/.test(t)) return '政策解读';
  if (/通知|公告|通告/.test(t)) return '政策文件';
  return '其他';
}

/* ------------------------------------------------------------------ */
/* 补日期：列表页没有日期的，抓文章页取「发布时间」                      */
/* ------------------------------------------------------------------ */

const DAY = 86400_000;

function dateFromArticleHtml(html) {
  let m = /发布时间[：:]\s*(\d{4})-(\d{2})-(\d{2})/.exec(html);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = /(\d{4})-(\d{2})-(\d{2})/.exec(html);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : '';
}

/**
 * 给缺日期的条目补日期。
 * 只补最近 keepDays 内的、且总量不超过 maxFetch 条，避免一次抓太多拖慢任务。
 */
async function fillMissingDates(items, { maxFetch = 60, concurrency = 4 } = {}) {
  const targets = items.filter((a) => !a.date).slice(0, maxFetch);
  if (!targets.length) return 0;
  let filled = 0;
  const queue = targets.slice();

  async function worker() {
    while (queue.length) {
      const a = queue.shift();
      try {
        const html = await fetchHtml(a.url, 12000);
        const d = dateFromArticleHtml(html);
        if (d) {
          a.date = d;
          filled++;
        }
      } catch {
        /* 补不到就留空 */
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, targets.length) }, worker));
  return filled;
}

/* ------------------------------------------------------------------ */
/* 抓取                                                                */
/* ------------------------------------------------------------------ */

async function fetchHtml(url, timeoutMs = 15000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': UA, 'Accept-Language': 'zh-CN,zh;q=0.9' },
      signal: ctrl.signal,
    });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

/**
 * 抓取全部站点，返回每个站点的结果（不写库）。
 * 供测试与后台「立即抓取」使用。
 */
export async function crawlAll({ concurrency = 3, keepDays = 120 } = {}) {
  const results = [];
  const queue = SITES.slice();

  const cutoff = keepDays > 0
    ? new Date(Date.now() - keepDays * 86400_000).toISOString().slice(0, 10)
    : '';

  async function worker() {
    while (queue.length) {
      const site = queue.shift();
      const started = Date.now();
      try {
        const html = await fetchHtml(site.base);
        const all = parseArticles(html, site);
        const picked = filterByCols(all, site).slice(0, 30);
        // 列表页没日期的，抓文章页补
        if (picked.some((a) => !a.date)) {
          try {
            await fillMissingDates(picked);
          } catch {
            /* 补日期失败不影响整体 */
          }
        }
        const kept = picked.filter((a) => !cutoff || !a.date || a.date >= cutoff);
        results.push({
          id: site.id,
          name: site.name,
          ok: true,
          total: all.length,
          picked: kept.length,
          ms: Date.now() - started,
          items: kept,
        });
      } catch (err) {
        results.push({
          id: site.id,
          name: site.name,
          ok: false,
          error: err.message,
          ms: Date.now() - started,
          items: [],
        });
      }
    }
  }

  await Promise.all(Array.from({ length: Math.max(1, Math.min(concurrency, SITES.length)) }, worker));
  return results;
}

/**
 * 抓取并写库。只插入库里没有的 URL。
 */
export async function crawlAndSave(opts = {}) {
  const results = await crawlAll(opts);
  const col = noticesCol();
  const now = new Date().toISOString();

  const existing = new Set(col.all().map((n) => String(n.url || '')));
  let added = 0;
  const addedItems = [];

  for (const r of results) {
    if (!r.ok) continue;
    for (const a of r.items) {
      if (existing.has(a.url)) continue;
      existing.add(a.url);
      const doc = {
        id: newId('hzn'),
        title: a.title.slice(0, 500),
        dept: r.name,
        deptId: r.id,
        date: a.date || `${a.year}-01-01`,
        url: a.url,
        tag: guessTag(a.title),
        enabled: true,
        source: 'crawl',
        createdAt: now,
        updatedAt: now,
      };
      try {
        col.insert(doc);
        added++;
        addedItems.push({ dept: r.name, title: a.title.slice(0, 50), date: doc.date });
      } catch {
        /* 单条失败不影响整体 */
      }
    }
  }
  if (added) db.flush();

  return {
    sites: results.map((r) => ({
      id: r.id, name: r.name, ok: r.ok, picked: r.picked || 0, error: r.error || '', ms: r.ms,
    })),
    okCount: results.filter((r) => r.ok).length,
    failCount: results.filter((r) => !r.ok).length,
    added,
    addedItems: addedItems.slice(0, 60),
  };
}

/** 上次抓取时间存在 notices 集合里不合适，单独用一条 meta 记录 */
const metaCol = () => db.collection('hz_crawl_meta');

export function getLastRun() {
  const rec = metaCol().findOne((x) => x.key === 'last');
  return rec || null;
}

export function markRun(summary) {
  const col = metaCol();
  const cur = col.findOne((x) => x.key === 'last');
  const now = new Date().toISOString();
  if (cur) col.update(cur.id, { at: now, summary });
  else col.insert({ id: newId('hzcm'), key: 'last', at: now, summary });
  db.flush();
}

/** 是否到点该跑（默认每天跑一次，且距上次 >= 20 小时） */
export function isDue(hours = 20) {
  const last = getLastRun();
  if (!last) return true;
  const t = Date.parse(last.at);
  if (!Number.isFinite(t)) return true;
  return Date.now() - t >= hours * 3600_000;
}

export default {
  CRAWL_SITES: SITES,
  parseArticles,
  crawlAll,
  crawlAndSave,
  getLastRun,
  markRun,
  isDue,
};

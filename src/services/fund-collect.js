/**
 * 小鱼来了 — 政府基金动向采集
 *
 * 思路：财经媒体的基金新闻比政务站好抓（没有 IP 封锁）。
 *   1. 从投资界等源的列表页取文章链接
 *   2. 标题命中「产业基金 / 引导基金 / 母基金 / 募资…」才收
 *   3. 抓正文 → AI 抽成结构化字段（地区、基金名、规模、投向、管理方）
 *   4. 先入「待审核」，管理员审核通过后才出现在前台
 *
 * 为什么必须过审核：AI 抽取会出错（把「拟设立」写成「已设立」、
 * 规模单位搞错），基金的规模数字很敏感，错了会误导别人。
 */

import crypto from 'node:crypto';
import db from '../store/db.js';
import ai from './ai.js';
import { fetchWebpage } from '../lib/webpage.js';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const funds = () => db.collection('funds');

/** 标题命中这些词才收 */
const FUND_KW = /(产业基金|引导基金|母基金|政府投资基金|基金设立|基金揭牌|基金成立|基金落地|基金完成备案|募资|LP|出资人)/;

/**
 * 综述 / 盘点类文章跳过。
 * 「LP 周报」「募资月报」「一文梳理」这类是好多条消息拼起来的，
 * 抽出来只会得到一个四不像的基金，规模数字还容易串行。
 */
const ROUNDUP_KW = /(周报|月报|季报|年报|盘点|梳理|全景|榜单|排行|周刊|本周|一周|速递|汇总)/;

/** 地域识别：标题或正文里出现这些词就归到对应地区 */
const PROVINCE_ALIAS = {
  沪: '上海', 上海: '上海',
  苏: '江苏', 江苏: '江苏',
  浙: '浙江', 浙江: '浙江',
};

const REGIONS = [
  { province: '上海', words: ['上海', '沪', '浦东', '嘉定', '临港', '虹口', '黄浦', '徐汇', '闵行', '静安', '宝山', '青浦', '松江', '奉贤', '金山', '崇明'] },
  { province: '江苏', words: ['江苏', '南京', '苏州', '无锡', '常州', '南通', '扬州', '镇江', '泰州', '盐城', '淮安', '连云港', '宿迁', '徐州', '昆山', '江阴', '张家港'] },
  { province: '浙江', words: ['浙江', '杭州', '宁波', '温州', '嘉兴', '湖州', '绍兴', '金华', '衢州', '舟山', '台州', '丽水', '玉环', '余杭', '萧山', '滨江', '义乌'] },
];

const SOURCES = [
  { id: 'pedaily', name: '投资界', list: 'https://news.pedaily.cn/', base: 'https://news.pedaily.cn' },
  { id: 'pedaily-fund', name: '投资界·基金', list: 'https://news.pedaily.cn/fund/', base: 'https://news.pedaily.cn' },
];

/** 只要半年内的新闻 —— 把 2022 年的旧闻当成「动向」发出去是误导 */
const MAX_AGE_DAYS = 180;

/** 从投资界 URL 里读日期：/202610/571135.shtml → 2026-10 */
function dateFromUrl(url) {
  const m = /\/(20\d{2})(0[1-9]|1[0-2])\//.exec(String(url));
  if (!m) return null;
  return `${m[1]}-${m[2]}-01`;
}

function isFresh(url) {
  const d = dateFromUrl(url);
  if (!d) return true; // 读不出日期就不拦，交给人工审核
  const ts = Date.parse(`${d}T00:00:00+08:00`);
  if (!Number.isFinite(ts)) return true;
  return Date.now() - ts <= MAX_AGE_DAYS * 86400000;
}

function guessRegion(text) {
  for (const r of REGIONS) {
    for (const w of r.words) {
      if (String(text).includes(w)) return { province: r.province, city: '' };
    }
  }
  return { province: '全国', city: '' };
}

async function getHtml(url) {
  const res = await fetch(url, {
    headers: { 'User-Agent': UA, 'Accept-Language': 'zh-CN,zh;q=0.9' },
    redirect: 'follow',
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

/** 从列表页取候选文章 */
export function parseLinks(html, source) {
  const out = [];
  const seen = new Set();
  const re = /<a[^>]+href="([^"]{10,200})"[^>]*>([\s\S]{4,100}?)<\/a>/g;
  let m;
  while ((m = re.exec(html))) {
    let href = m[1];
    const title = String(m[2] || '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
    if (!title || title.length < 6) continue;
    if (!FUND_KW.test(title)) continue;
    // 综述类不跳过，进 collect 里走「拆条」分支
    if (!isFresh(href)) continue; // 半年以前的旧闻跳过
    if (href.startsWith('/')) href = new URL(href, source.list).toString();
    if (!/^https?:/i.test(href) || seen.has(href)) continue;
    // 只收文章页，别收频道页
    if (!/\/\d{6}\/\d+\.s?html?$/.test(href) && !/article\/\d+/.test(href) && !/\/a\/\d+/.test(href)) continue;
    seen.add(href);
    out.push({ url: href, title, roundup: ROUNDUP_KW.test(title) });
    if (out.length >= 12) break;
  }
  return out;
}

/** AI 把综述拆成多只基金 */
async function aiSplitRoundup({ title, text }) {
  const st = ai.aiStatus ? ai.aiStatus() : null;
  if (!st || st.mode !== 'ai') return [];
  try {
    const out = await ai.chat(
      [
        {
          role: 'system',
          content:
            '这篇是产业基金周报/月报，里面提到多只基金。请把每一只基金拆成一条，只输出 JSON：' +
            '{"items":[{"name":"基金名称","province":"省份(上海/江苏/浙江/其他)","city":"城市或区县，没有就空",' +
            '"scale":"规模，如 200 亿元","status":"拟定/已设立/已备案/已揭牌/已投首批","manager":"管理机构或出资方",' +
            '"focus":["投向"],"note":"一句话，20 字以内"}]}' +
            '最多 6 条；只收原文明确提到的基金，规模数字必须来自原文，没写的填空字符串，不要编造。',
        },
        { role: 'user', content: `标题：${title}\n\n正文：\n${String(text).slice(0, 8000)}` },
      ],
      { temperature: 0.1, maxTokens: 1200 },
    );
    const j = ai.extractJson ? ai.extractJson(out) : null;
    const arr = (j && j.items) || [];
    return arr.slice(0, 6);
  } catch (err) {
    console.warn('[fund-collect] 拆条失败:', err.message);
    return [];
  }
}

/** 规则兜底抽取 */
export function ruleExtract(text, title) {
  const t = `${title}\n${text}`.slice(0, 20000);
  const grab = (re) => {
    const m = re.exec(t);
    return m ? String(m[1]).trim() : '';
  };
  const scale = grab(/(?:总规模|规模|认缴规模|目标规模|首关|首期)[^0-9]{0,6}([\d,.]+\s*(?:亿元|亿|万元))/);
  const focusRaw = grab(/(?:投向|聚焦|重点投向|投资方向)[：:\s]*([^\n。；]{6,60})/);
  return {
    scale: scale || '',
    focus: focusRaw ? focusRaw.split(/[、,，/]/).map((x) => x.trim()).filter(Boolean).slice(0, 6) : [],
  };
}

/** AI 抽取 */
async function aiExtract({ title, text }) {
  const st = ai.aiStatus ? ai.aiStatus() : null;
  if (!st || st.mode !== 'ai') return null;
  try {
    const out = await ai.chat(
      [
        {
          role: 'system',
          content:
            '你是政府投资基金新闻的信息抽取助手。从标题和正文里抽取结构化信息，只输出 JSON：\n' +
            '{"name":"基金名称","province":"省份(上海/江苏/浙江/其他)","city":"城市或区县，没有就空",' +
            '"scale":"规模，如 200 亿元（保留原文数字与单位）","status":"拟定/已设立/已备案/已揭牌/已投首批，按原文判断",' +
            '"manager":"管理机构或出资方，没有就空","focus":["投向1","投向2"],"note":"一句话说明，30 字以内"}\n' +
            '严格按原文，原文没说的一律填空字符串或空数组，绝对不要编造规模和状态。',
        },
        { role: 'user', content: `标题：${title}\n\n正文：\n${String(text).slice(0, 6000)}` },
      ],
      { temperature: 0.1, maxTokens: 600 },
    );
    const j = ai.extractJson ? ai.extractJson(out) : null;
    if (!j || typeof j !== 'object') return null;
    return {
      name: String(j.name || '').trim().slice(0, 80),
      province: String(j.province || '').trim().slice(0, 20),
      city: String(j.city || '').trim().slice(0, 30),
      scale: String(j.scale || '').trim().slice(0, 60),
      status: String(j.status || '').trim().slice(0, 20),
      manager: String(j.manager || '').trim().slice(0, 120),
      focus: Array.isArray(j.focus) ? j.focus.map((x) => String(x).trim()).filter(Boolean).slice(0, 6) : [],
      note: String(j.note || '').trim().slice(0, 120),
    };
  } catch (err) {
    console.warn('[fund-collect] AI 抽取失败:', err.message);
    return null;
  }
}

/**
 * 跑一次采集。
 * @param {object} opts { limit, sourceId, dryRun }
 */
export async function collect({ limit = 5, sourceId = '', dryRun = false } = {}) {
  const sources = sourceId ? SOURCES.filter((s) => s.id === sourceId) : SOURCES;
  const report = { scanned: 0, picked: 0, created: 0, skipped: 0, failed: 0, items: [], errors: [] };

  /*
   * 待审核积压保护：后台还没有审核界面，采集不能无限往里堆。
   * 超过上限就停采，等都审完了再继续 —— 否则文件集合越滚越大，
   * AI 额度也白烧。
   */
  const PENDING_CAP = 200;
  const pendingCount = funds().all().filter((f) => (f.reviewStatus || 'pending') === 'pending').length;
  report.pendingBefore = pendingCount;
  if (pendingCount >= PENDING_CAP) {
    report.note = `待审核已积压 ${pendingCount} 条（上限 ${PENDING_CAP}），本次不采。审完或清掉后会自动恢复。`;
    return report;
  }

  for (const src of sources) {
    let html = '';
    try {
      html = await getHtml(src.list);
    } catch (err) {
      report.errors.push(`${src.name} 列表页打不开：${err.message}`);
      continue;
    }

    const links = parseLinks(html, src);
    report.scanned += links.length;

    for (const link of links) {
      if (report.created >= limit) break;
      report.picked += 1;

      // 去重：同一个链接采过就跳过
      // 被驳回的条目不算「采过」，可以重采（AI 抽取质量在迭代，驳回后要能重试）
      const dup = funds().findOne((f) => f.link === link.url && f.reviewStatus !== 'rejected');
      if (dup) {
        report.skipped += 1;
        continue;
      }

      try {
        const r = await fetchWebpage(link.url, { keepAll: true });
        if (!r || !r.ok || !String(r.text || '').trim()) {
          report.failed += 1;
          continue;
        }

        const title = String(link.title || r.title || '').slice(0, 120);

        /* ---------- 综述类（周报/月报）：AI 拆成多只基金，一只一条 ---------- */
        if (link.roundup) {
          const arr = await aiSplitRoundup({ title, text: r.text });
          if (!arr.length) {
            report.failed += 1;
            report.errors.push(`${title.slice(0, 16)}：综述拆条失败`);
            continue;
          }
          let added = 0;
          for (const it of arr) {
            const name = String(it.name || '').trim().slice(0, 80);
            if (!name) continue;
            const prov = PROVINCE_ALIAS[String(it.province || '').replace(/省|市/g, '').trim()] || '其他地区';
            const province = ['上海', '江苏', '浙江'].includes(prov) ? prov : '其他地区';
            // 同名同省已存在就跳过
            if (funds().findOne((f) => f.name === name && f.province === province)) continue;
            const scaleV = String(it.scale || '').trim();
            const doc = {
              id: `fund_${crypto.randomBytes(8).toString('hex')}`,
              name,
              province,
              city: province === '其他地区' ? '' : String(it.city || '').slice(0, 30),
              scale: /[亿万]/.test(scaleV) ? scaleV.slice(0, 60) : '',
              status: String(it.status || '').slice(0, 20),
              date: dateFromUrl(link.url) || new Date().toISOString().slice(0, 10),
              manager: String(it.manager || '').slice(0, 120),
              focus: Array.isArray(it.focus) ? it.focus.slice(0, 6) : [],
              note: String(it.note || '').slice(0, 120),
              title: `${name}（来自：${title.slice(0, 24)}）`,
              link: link.url,
              sourceName: src.name,
              extractedBy: 'ai-split',
              reviewStatus: 'pending',
              createdAt: new Date().toISOString(),
            };
            if (!dryRun) funds().insert(doc);
            added += 1;
            report.created += 1;
            if (report.created >= limit) break;
            report.items.push({ id: doc.id, name: doc.name, province: doc.province, scale: doc.scale, link: doc.link, split: true });
          }
          if (!added) report.skipped += 1;
          await new Promise((r2) => setTimeout(r2, 1200));
          continue;
        }

        const rule = ruleExtract(r.text, title);
        const aiRes = await aiExtract({ title, text: r.text });
        /*
         * 地区规范化：只保留江浙沪，别的省份一律归「其他地区」。
         * 这个专题是江浙沪专题，混进澳门、四川的基金会让读者以为本地也能申报。
         */
        let region = aiRes && aiRes.province
          ? { province: String(aiRes.province).replace(/省|市|自治区/g, '').trim(), city: aiRes.city || '' }
          : guessRegion(`${title}${r.text.slice(0, 2000)}`);
        region.province = PROVINCE_ALIAS[region.province] || (['上海', '江苏', '浙江'].includes(region.province) ? region.province : '其他地区');
        if (region.province === '其他地区') region.city = '';

        const doc = {
          id: `fund_${crypto.randomBytes(8).toString('hex')}`,
          name: (aiRes && aiRes.name) || title.slice(0, 60),
          province: region.province || '全国',
          city: region.city || '',
          // 规模必须带「亿 / 万」单位，避免抽出「569」这种没头没尾的数字
          scale: (() => {
            const v = String((aiRes && aiRes.scale) || rule.scale || '').trim();
            return /[亿万]/.test(v) ? v : '';
          })(),
          status: (aiRes && aiRes.status) || '',
          date: dateFromUrl(link.url) || new Date().toISOString().slice(0, 10),
          manager: (aiRes && aiRes.manager) || '',
          focus: (aiRes && aiRes.focus && aiRes.focus.length ? aiRes.focus : rule.focus) || [],
          note: (aiRes && aiRes.note) || '',
          title,
          link: link.url,
          sourceName: src.name,
          extractedBy: aiRes ? 'ai' : 'rule',
          status2: '',
          reviewStatus: 'pending',
          createdAt: new Date().toISOString(),
        };

        if (dryRun) {
          report.items.push({ ...doc, text: undefined });
          report.created += 1;
          continue;
        }

        funds().insert(doc);
        report.created += 1;
        report.items.push({ id: doc.id, name: doc.name, province: doc.province, scale: doc.scale, link: doc.link });

        await new Promise((r2) => setTimeout(r2, 1200));
      } catch (err) {
        report.failed += 1;
        report.errors.push(`${String(link.title).slice(0, 16)}：${err.message}`);
      }
    }
  }

  report.pendingAfter = funds().all().filter((f) => (f.reviewStatus || 'pending') === 'pending').length;
  return report;
}

/** 待审核 / 已发布 列表 */
export function listFunds({ reviewStatus = 'pending', limit = 50 } = {}) {
  let rows = funds().all();
  if (reviewStatus && reviewStatus !== 'all') rows = rows.filter((f) => (f.reviewStatus || 'pending') === reviewStatus);
  rows.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  return rows.slice(0, limit);
}

/** 审核 */
export function reviewFund(id, action) {
  const f = funds().get(id);
  if (!f) return null;
  funds().update(id, {
    reviewStatus: action === 'approve' ? 'published' : 'rejected',
    reviewedAt: new Date().toISOString(),
  });
  return funds().get(id);
}

/** 前台用的已发布列表 */
export function publishedFunds({ limit = 60 } = {}) {
  return funds()
    .all()
    .filter((f) => f.reviewStatus === 'published')
    .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')))
    .slice(0, limit);
}

export default { collect, parseLinks, ruleExtract, listFunds, reviewFund, publishedFunds, SOURCES };

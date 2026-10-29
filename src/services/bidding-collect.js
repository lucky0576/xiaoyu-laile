/**
 * 小鱼来了 — 江浙沪招投标采集
 *
 * 思路：
 *   1. 从政府采购网的「采购公告」列表页取出公告链接
 *   2. 逐条抓详情页，用 keepAll 模式把正文原样复制过来（不摘要、不改写）
 *   3. 建成一条招投标信息，标题、招标人、预算等能识别就填，识别不了留空
 *
 * 注意：
 *   · 政府站点普遍有反爬，采集要慢（默认每条间隔 1.5 秒），失败就跳过
 *   · 只抓「采购公告」这一类的公开信息，不碰登录区、不碰个人数据
 *   · 抓来的内容保留原文出处链接，读者可以点回原文核对
 */

import crypto from 'node:crypto';
import { fetchWebpage } from '../lib/webpage.js';
import listingsSvc from './listings.js';
import db from '../store/db.js';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36';

/** 江浙沪关键词：标题命中才收，避免收进全国各地的公告 */
const REGION_WORDS = [
  '江苏', '浙江', '上海', '南京', '苏州', '无锡', '常州', '南通', '扬州', '镇江', '泰州', '盐城', '淮安', '连云港', '宿迁', '徐州',
  '杭州', '宁波', '温州', '嘉兴', '湖州', '绍兴', '金华', '衢州', '舟山', '台州', '丽水',
  '浦东', '浦西', '闵行', '嘉定', '松江', '青浦', '奉贤', '宝山', '余杭', '萧山', '滨江',
];

/** 公告源：目前打通了江苏站，浙江/上海留了位置 */
export const SOURCES = [
  {
    id: 'jiangsu',
    name: '江苏政府采购网',
    listUrl: 'http://www.ccgp-jiangsu.gov.cn/',
    base: 'http://www.ccgp-jiangsu.gov.cn',
    // 列表页里公告链接长这样：/jiangsu/js_cggg/details.html?gglb=gkzb&ggid=xxx
    linkRe: /<a[^>]+href="([^"]*js_cggg\/details\.html\?[^"]+)"[^>]*>([^<]{6,120})<\/a>/g,
  },
  {
    id: 'zhejiang',
    name: '浙江政府采购网',
    listUrl: 'https://zfcg.czt.zj.gov.cn/',
    base: 'https://zfcg.czt.zj.gov.cn',
    linkRe: /<a[^>]+href="([^"]*(?:site\/detail|portal\/detail)[^"]*)"[^>]*>([^<]{6,120})<\/a>/g,
  },
];

async function getHtml(url) {
  const res = await fetch(url, {
    headers: { 'User-Agent': UA, 'Accept-Language': 'zh-CN,zh;q=0.9' },
    redirect: 'follow',
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

/** 从列表页取公告链接 */
export function parseLinks(html, source) {
  const out = [];
  const seen = new Set();
  source.linkRe.lastIndex = 0;
  let m;
  while ((m = source.linkRe.exec(html))) {
    let href = String(m[1] || '').trim();
    const title = String(m[2] || '').replace(/\s+/g, ' ').trim();
    if (!href || title.length < 6) continue;
    if (href.startsWith('/')) href = source.base + href;
    if (!/^https?:/i.test(href)) continue;
    if (seen.has(href)) continue;
    seen.add(href);
    out.push({ url: href, title });
  }
  return out;
}

/** 标题里是否提到江浙沪 */
export function matchRegion(title) {
  const t = String(title || '');
  return REGION_WORDS.find((w) => t.includes(w)) || '';
}

/** 从正文里抠出招标人 / 预算 / 编号这类硬字段（抠不到就留空，不猜） */
export function extractFields(text) {
  const t = String(text || '').replace(/\r/g, '');
  const pick = (re) => {
    const m = re.exec(t);
    return m ? String(m[1] || '').trim().slice(0, 80) : '';
  };
  return {
    tenderNo: pick(/项目编号[：:]\s*([^\s，,。；;]{4,60})/),
    tenderer: pick(/(?:采购人|招标人|采购单位)(?:名称)?[：:]\s*([^\n，,。；;]{2,60})/),
    agency: pick(/(?:代理机构|采购代理机构)(?:名称)?[：:]\s*([^\n，,。；;]{2,60})/),
    budget: pick(/(?:预算金额|采购预算|最高限价)[^0-9]{0,6}([\d,.]+\s*(?:万元|元|亿元))/),
    bidDeadline: '',
    bidOpenAt: '',
    bidPlace: '',
    qualification: '',
    contact: '',
  };
}

/**
 * 跑一次采集。
 * @param {object} opts { limit, sourceId, dryRun }
 */
export async function collect({ limit = 5, sourceId = '', dryRun = false } = {}) {
  /*
   * 现状（2026-10 实测）：
   *   列表页能解析出公告链接，也能筛出江浙沪，
   *   但详情页走 /pss/jsp/dynamicLoading.jsp 动态加载，
   *   直接抓只能拿到站点模板，正文抽不出来。
   * 所以这里默认只允许 dryRun（探测），
   * 要真正落库必须显式开 ALLOW_BETA_COLLECT=1，
   * 否则宁可不收，也不往库里塞模板文字。
   */
  if (!dryRun && process.env.ALLOW_BETA_COLLECT !== '1') {
    throw new Error('采集尚在验证阶段：详情页有反爬，正文抽不出来。请先用 dryRun 探测，或改用「从链接导入正文」。');
  }

  const admin = db.collection('users').findOne((u) => u.isAdmin && u.status !== 'banned');
  if (!admin && !dryRun) throw new Error('没有可用的管理员账号，无法落库');

  const sources = sourceId ? SOURCES.filter((s) => s.id === sourceId) : SOURCES;
  const report = { scanned: 0, picked: 0, created: 0, skipped: 0, failed: 0, items: [], errors: [] };

  for (const src of sources) {
    let html = '';
    try {
      html = await getHtml(src.listUrl);
    } catch (err) {
      report.errors.push(`${src.name} 列表页打不开：${err.message}`);
      continue;
    }

    const links = parseLinks(html, src);
    report.scanned += links.length;

    const hits = links.filter((l) => matchRegion(l.title));
    for (const link of hits) {
      if (report.created >= limit) break;
      report.picked += 1;

      try {
        const r = await fetchWebpage(link.url, { keepAll: true });
        if (!r || !r.ok || !String(r.text || '').trim()) {
          report.failed += 1;
          continue;
        }

        const fields = extractFields(r.text);
        const item = {
          title: String(r.title || link.title).slice(0, 118),
          subtitle: `来源：${src.name} · ${fields.tenderer || '采购公告'}`,
          text: String(r.text).slice(0, 120000),
          link: link.url,
          ...fields,
          sourceName: src.name,
        };

        if (dryRun) {
          report.items.push({ ...item, text: item.text.slice(0, 200) });
          report.created += 1;
          continue;
        }

        await listingsSvc.createListing({
          user: admin,
          body: {
            category: 'bidding',
            type: 'tender',
            title: item.title,
            subtitle: item.subtitle,
            text: item.text,
            link: item.link,
            tenderNo: item.tenderNo,
            tenderer: item.tenderer,
            agency: item.agency,
            budget: item.budget,
            publish: '1',
            durationDays: 30,
          },
        });
        report.created += 1;
        report.items.push({ id: item.title, title: item.title, url: link.url });

        // 慢一点，别把对方站点打疼
        await new Promise((r2) => setTimeout(r2, 1500));
      } catch (err) {
        report.failed += 1;
        report.errors.push(`${link.title.slice(0, 20)}：${err.message}`);
      }
    }
  }

  return report;
}

export default { collect, parseLinks, matchRegion, extractFields, SOURCES };

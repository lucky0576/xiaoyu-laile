/**
 * 小鱼来了 — 新闻资讯服务
 *
 * 能力：
 *   1. 定时抓取官方/媒体的政策与行业新闻列表
 *   2. 按行业关键词判定相关性并打标
 *   3. 逐条抓正文（复用 lib/webpage.js：编码识别 + 正文抽取 + 去广告/联系方式）
 *   4. 新条目推送给关注了对应行业的用户
 *
 * 设计取舍：
 *   · 抓取失败一律静默降级，单个源坏掉不影响其他源，更不影响主站
 *   · 每轮最多处理 N 条新链接，避免一次抓太多把人拖住
 *   · 用 URL 去重（newsUrlKey），重复刷新不会产生重复条目
 */

import crypto from 'node:crypto';
import db, { newId } from '../store/db.js';
import { NEWS_SOURCES, NEWS_TAGS } from '../data/news-sources.js';
import { fetchWebpage, fetchHtml } from '../lib/webpage.js';
import { notifyMany } from './notify.js';

const news = () => db.collection('news');

/* ------------------------------------------------------------------ */
/* 工具                                                                */
/* ------------------------------------------------------------------ */

function urlKey(u) {
  return crypto.createHash('sha1').update(String(u || '')).digest('hex').slice(0, 16);
}

function textOf(html) {
  return String(html || '');
}

/** 从列表页 HTML 里挑出文章链接 */
function extractLinks(html, source) {
  const out = [];
  const seen = new Set();
  const re = /<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = re.exec(html))) {
    const href = m[1];
    if (!href || href.startsWith('#') || href.startsWith('javascript:')) continue;

    let abs;
    try {
      abs = new URL(href, source.url).toString();
    } catch {
      continue;
    }
    if (!/^https?:/i.test(abs)) continue;
    if (source.linkRe && !source.linkRe.test(abs)) continue;
    if (seen.has(abs)) continue;

    // 标题：去标签、压空白
    const title = textOf(m[2])
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/gi, ' ')
      .replace(/&amp;/gi, '&')
      .replace(/\s+/g, ' ')
      .trim();

    if (title.length < 8 || title.length > 120) continue;
    // 过滤导航类
    if (/^(更多|首页|下一页|上一页|返回|登录|注册|网站地图)$/.test(title)) continue;

    seen.add(abs);
    out.push({ url: abs, title });
  }
  return out;
}

/** HTML 实体解码（feed 里常见） */
function decodeEntities(str) {
  const map = {
    '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&apos;': "'",
    '&nbsp;': ' ', '&ldquo;': '\u201c', '&rdquo;': '\u201d', '&mdash;': '\u2014',
    '&ndash;': '\u2013', '&hellip;': '\u2026', '&middot;': '\u00b7',
  };
  return String(str || '')
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&[a-z#0-9]+;/gi, (m) => map[m.toLowerCase()] || m);
}

/** 从 XML 片段取一个标签的文本 */
function feedTag(block, tag) {
  const re = new RegExp('<' + tag + '\\b[^>]*>([\\s\\S]*?)<\\/' + tag + '>', 'i');
  const m = re.exec(block);
  if (!m) return '';
  return decodeEntities(
    m[1]
      .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim(),
  );
}

/** Atom 的 <link href="..."/> */
function feedLink(block) {
  const direct = feedTag(block, 'link');
  if (direct && /^https?:/i.test(direct)) return direct;
  const m = /<link\b[^>]*href\s*=\s*["']([^"']+)["']/i.exec(block);
  return m ? decodeEntities(m[1]) : '';
}

function feedDate(block) {
  const raw =
    feedTag(block, 'pubDate') ||
    feedTag(block, 'published') ||
    feedTag(block, 'updated') ||
    feedTag(block, 'dc:date');
  if (!raw) return '';
  const t = Date.parse(raw);
  return Number.isFinite(t) ? new Date(t).toISOString() : '';
}

/**
 * 解析 RSS 2.0 / Atom。
 *
 * 为什么需要它：
 *   官方新闻室（华为/苹果/微软/宇树）基本都是 JS 渲染，
 *   简单抓 HTML 拿不到列表；而 IT之家、cnBeta、Solidot 等
 *   科技媒体都提供稳定 RSS，且能覆盖特斯拉/马斯克/苹果/华为/
 *   微软/阿里/DeepSeek/宇树这些龙头。
 */
function parseFeed(xml) {
  const out = [];
  const push = (block) => {
    const title = feedTag(block, 'title');
    const url = feedLink(block);
    if (!title || !url || !/^https?:/i.test(url)) return;
    const desc = feedTag(block, 'description') || feedTag(block, 'summary') || feedTag(block, 'content');
    out.push({ url, title, desc, publishedAt: feedDate(block) });
  };

  for (const m of String(xml || '').matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/gi)) push(m[1]);
  if (!out.length) {
    for (const m of String(xml || '').matchAll(/<entry\b[^>]*>([\s\S]*?)<\/entry>/gi)) push(m[1]);
  }
  return out;
}

/** 判定行业标签；没有命中任何行业但含政策词，标 policy */
function tagOf(title, text) {
  const titleStr = String(title || '');
  const bodyStr = String(text || '').slice(0, 1200);
  const tags = [];
  let titleHit = false;
  for (const t of NEWS_TAGS) {
    // scope:'title' 的标签（科技龙头）只看标题，避免正文页脚的品牌名误命中
    const hay = t.scope === 'title' ? titleStr : titleStr + '\n' + bodyStr;
    if (!t.words.some((w) => hay.includes(w))) continue;
    tags.push(t.id);
    // 至少有一个标签是标题里命中的，才算跟本平台相关
    if (!titleHit && t.words.some((w) => titleStr.includes(w))) titleHit = true;
  }
  return { tags, titleHit };
}

/** 标题清洗：去掉装饰符号、站点前缀与后缀 */
function cleanTitle(raw) {
  let t = String(raw || '').trim();

  // 去掉栏目前缀：「头条新闻 - 」「图片新闻 - 」「视频 - 」等
  t = t.replace(/^(头条新闻|图片新闻|视频新闻|滚动新闻|最新|要闻|推荐)\s*[-—–·]\s*/, '');

  // 去掉 RDF 风格编码残留（feed 偶尔会带 &#8211; 这类没解干净的实体）
  t = t
    .replace(/&#8211;/g, '\u2013')
    .replace(/&#8212;/g, '\u2014')
    .replace(/&#8217;/g, '\u2019')
    .replace(/&amp;/g, '&');


  /*
   * 去掉尾部站点名：「标题 - IT之家」「标题 | 爱范儿」「标题 – 量子位」
   * 只在后半段很短（<=14 字）且前面还有像样内容时才切，
   * 避免把「光伏 - 储能协同」这种正文破折号也切掉。
   */
  const tailMatch = /^([\s\S]{8,}?)\s*[-—–|｜]\s*([^\-—–|｜]{1,14})\s*$/.exec(t);
  if (tailMatch && tailMatch[1].trim().length >= 8) {
    t = tailMatch[1].trim();
  }
  // 「站点名 - 栏目 - 真标题」：取最后一段
  if ((t.match(/\s-\s/g) || []).length >= 2) {
    const seg = t.split(/\s-\s/).map((x) => x.trim()).filter(Boolean);
    if (seg.length >= 2) t = seg[seg.length - 1];
  }

  // 去掉开头的装饰符号
  t = t.replace(/^[●■◆★▲\-—·•\s【\[\(（]+/, '');
  // 去掉结尾的装饰符号与书名号包裹
  t = t.replace(/[】\]\)）|｜\s]+$/, '');

  // 去掉站点前缀：「国家发展改革委 」「中国储能网 」
  t = t.replace(/^(中国储能网|中国能源网|北极星[^\s]{0,6}网|索比[^\s]{0,6}网|国际能源网|世纪新能源网)[\s·|｜:：-]*/i, '');

  // 去掉各种后缀
  const suffixRes = [
    /[-_—|｜]\s*(国家发展和改革委员会|中华人民共和国国家发展和改革委员会|国家能源局|中国政府网|国务院)\s*$/,
    /[-_—|｜]\s*[^\s|_—-]{2,20}(网|报|资讯|传媒|客户端|新闻|头条)\s*$/,
    /\s*[-_—|｜]\s*(新闻|资讯|财经|头条|要闻|热点|推荐|关注)\s*$/,
    /_?[A-Za-z][A-Za-z\s]{6,}(Network|Net|News|Com|Website)\s*$/i,
    /\s*[-_—|｜]\s*$/,
  ];
  let changed = true;
  let guard = 0;
  while (changed && guard < 4) {
    changed = false;
    guard += 1;
    for (const re of suffixRes) {
      const before = t;
      t = t.replace(re, '');
      if (t !== before) changed = true;
    }
  }

  // 去掉残留的「} 」「}」等页面脚本碎片
  t = t.replace(/[}{<>]+/g, ' ');
  t = t.replace(/\s{2,}/g, ' ').trim();
  return t.slice(0, 180);
}

/** 从 URL 里抽发布日期：/20261024/ 或 /t20261024_ 或 /202609/11/ */
function dateFromUrl(url) {
  const u = String(url || '');
  let m = /[t/]?(20\d{2})(\d{2})(\d{2})[_/]/.exec(u) || /[t/](20\d{2})(\d{2})(\d{2})/.exec(u);
  if (m) {
    const y = Number(m[1]), mo = Number(m[2]), d = Number(m[3]);
    if (mo >= 1 && mo <= 12 && d >= 1 && d <= 31) {
      return new Date(Date.UTC(y, mo - 1, d)).toISOString();
    }
  }
  // /202609/11/50029005.html
  m = /\/(20\d{2})(\d{2})\/(\d{2})\//.exec(u);
  if (m) {
    const y = Number(m[1]), mo = Number(m[2]), d = Number(m[3]);
    if (mo >= 1 && mo <= 12 && d >= 1 && d <= 31) {
      return new Date(Date.UTC(y, mo - 1, d)).toISOString();
    }
  }
  return '';
}

/** 标题里能看出日期就抽出来，抽不到用抓取时间 */
function guessPublishedAt(title, text) {
  const hay = `${title || ''} ${String(text || '').slice(0, 200)}`;
  const m =
    /(20\d{2})[-年/.](\d{1,2})[-月/.](\d{1,2})/.exec(hay) ||
    /(20\d{2})[-年/.](\d{1,2})/.exec(hay);
  if (m) {
    const y = Number(m[1]);
    const mo = Number(m[2]);
    const d = m[3] ? Number(m[3]) : 1;
    if (y >= 2020 && mo >= 1 && mo <= 12 && d >= 1 && d <= 31) {
      return new Date(Date.UTC(y, mo - 1, d)).toISOString();
    }
  }
  return '';
}

/** 由正文生成一句话摘要（不调 AI，纯抽取，省钱又快） */
function pickSummary(text, title = '') {
  const norm = (s) => String(s || '').replace(/[\s\u3000"'"'《》【】()（）:：,，。.!！?？\-—_/]/g, '');

  const lines = String(text || '')
    .split('\n')
    .map((x) => x.trim())
    .filter(Boolean);

  const titleCore = norm(title).slice(0, 18);
  const NAV_START = /^(首页|栏目|导航|欢迎您|返回|当前位置|数字储能网|数字能源网|PVTIME|世纪新能源网|关于我们|登录|注册|分享到)/;

  const isJunk = (l) => {
    if (l.length < 24) return true;
    if ((l.match(/[|｜]/g) || []).length >= 1) return true;
    if (NAV_START.test(l)) return true;
    // 导航样：空格切出很多 2~4 字的短词
    const tokens = l.split(/\s+/).filter(Boolean);
    if (tokens.length >= 5) {
      const short = tokens.filter((t) => t.length <= 4).length;
      if (short / tokens.length > 0.6) return true;
    }
    // 重复标题
    const core = norm(l);
    if (titleCore && core.startsWith(titleCore)) return true;
    return false;
  };

  const good = lines.filter((l) => !isJunk(l));
  const src = good.length ? good.join(' ') : lines.join(' ');

  // 从正文里挑第一句像样的话
  const sentences = String(src)
    .split(/(?<=[。！？])/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 20);
  const first = sentences[0] || src;

  return String(first).replace(/\s+/g, ' ').trim().slice(0, 160);
}

/* ------------------------------------------------------------------ */
/* 抓取                                                                */
/* ------------------------------------------------------------------ */

export async function refresh({ maxPerSource = 6, maxTotal = 24, maxAgeDays = 120 } = {}) {
  const stat = { sources: 0, found: 0, added: 0, pushed: 0, skipped: 0, errors: [] };
  const store = news();
  const known = new Set(store.all().map((n) => n.urlKey));

  const cutoff = Date.now() - maxAgeDays * 86400_000;
  let budget = maxTotal;

  for (const source of NEWS_SOURCES) {
    if (budget <= 0) break;
    stat.sources += 1;
    let page;
    try {
      page = await fetchHtml(source.url);
    } catch (err) {
      stat.errors.push(`${source.name}: ${err.message}`);
      continue;
    }
    if (!page || !page.ok) {
      stat.errors.push(`${source.name}: ${page?.note || '抓取失败'}`);
      continue;
    }

    const html = page.html || '';
    if (!html) {
      stat.errors.push(`${source.name}: 列表页为空`);
      continue;
    }

    // feed 源（RSS/Atom）走专用解析；普通站点走链接提取
    const looksFeed = source.type === 'rss' || /<rss\b|<feed\b|<channel\b/i.test(html.slice(0, 3000));
    const links = (looksFeed ? parseFeed(html) : extractLinks(html, source)).slice(0, maxPerSource);
    stat.found += links.length;

    for (const link of links) {
      if (budget <= 0) break;
      const key = urlKey(link.url);
      if (known.has(key)) { stat.skipped += 1; continue; }

      let art;
      try {
        art = await fetchWebpage(link.url);
      } catch {
        art = null;
      }
      // 正文抓不到（反爬/JS 渲染）时，用 feed 自带的描述兜底
      let bodyText = art && art.ok && art.text ? art.text : '';
      if (bodyText.length < 120 && link.desc && link.desc.length >= 60) {
        bodyText = link.desc;
      }
      if (!bodyText || bodyText.length < 60) continue;

      const { tags, titleHit } = tagOf(link.title, bodyText);
      // 要求「标题命中」：正文里到处是页脚导航，只靠正文容易混进
      // 完全不相干的新闻（比如选举、娱乐）
      if (!tags.length || !titleHit) continue;

      // 日期优先级：feed 发布时间 → URL 里的日期 → 正文/标题里的日期 → 抓取时间
      const publishedAt = link.publishedAt ||
        dateFromUrl(link.url) || guessPublishedAt(link.title, bodyText) || new Date().toISOString();
      if (Date.parse(publishedAt) < cutoff) continue;

      /*
       * 标题优先用列表页 / feed 里的标题。
       * 之前是 art.title 优先，结果 cnBeta 的页面 <title> 被抽成
       * "cnBeta.COM"（站点名），把正常的 RSS 标题盖掉了。
       */
      const finalTitle = cleanTitle(link.title) || cleanTitle(art?.title) || '（无标题）';

      store.insert({
        id: newId('nw'),
        urlKey: key,
        url: link.url,
        title: finalTitle.slice(0, 200),
        sourceName: source.name,
        sourceCategory: source.category,
        tags,
        summary: pickSummary(bodyText, finalTitle),
        text: bodyText.slice(0, 120000),
        coverUrl: '',
        publishedAt,
        fetchedAt: new Date().toISOString(),
        hot: false,
      });

      known.add(key);
      stat.added += 1;
      budget -= 1;
    }
  }

  // 新条目推送给关注相关行业的用户
  if (stat.added > 0) {
    try {
      stat.pushed = await pushLatest();
    } catch (err) {
      stat.errors.push(`推送失败: ${err.message}`);
    }
  }

  console.log('[news] 刷新完成', stat);
  return stat;
}

/** 把最新一批还没推送过的新闻发给匹配的用户 */
export async function pushLatest({ limit = 5 } = {}) {
  const store = news();
  const pending = store
    .find((n) => !n.pushedAt)
    .sort((a, b) => String(b.publishedAt).localeCompare(String(a.publishedAt)))
    .slice(0, limit);

  if (!pending.length) return 0;

  const users = db.collection('users').all();
  const interested = users.filter(
    (u) => u && !u.disabled && !u.banned && u.settings?.notifyNews !== false,
  );
  if (!interested.length) return 0;

  let sent = 0;
  for (const item of pending) {
    const targets = [];
    for (const u of interested) {
      // 用户关注了这些行业中的任一 → 推送；没设行业则全推
      const follow = Array.isArray(u.followTags) && u.followTags.length ? u.followTags : null;
      if (follow && !item.tags.some((t) => follow.includes(t))) continue;
      targets.push(u.id);
    }
    if (!targets.length) continue;

    notifyMany(targets, {
      type: 'news',
      title: `📰 ${item.title}`.slice(0, 120),
      body: item.summary || '',
      link: `#/news/${item.id}`,
      meta: { newsId: item.id, tags: item.tags, sourceName: item.sourceName },
    });
    sent += targets.length;

    store.update(item.id, { pushedAt: new Date().toISOString() });
  }
  return sent;
}

/* ------------------------------------------------------------------ */
/* 查询                                                                */
/* ------------------------------------------------------------------ */

export function newsPublic(n) {
  if (!n) return null;
  const { text, ...rest } = n;
  return { ...rest, hasText: Boolean(text) };
}

export function listNews({ tag = '', q = '', page = 1, size = 20 } = {}) {
  // 软删除的不出现在前台
  let rows = news().all().filter((n) => !n.deletedAt);

  if (tag) rows = rows.filter((n) => Array.isArray(n.tags) && n.tags.includes(tag));
  if (q) {
    const kw = String(q).toLowerCase();
    rows = rows.filter(
      (n) =>
        String(n.title || '').toLowerCase().includes(kw) ||
        String(n.summary || '').toLowerCase().includes(kw),
    );
  }

  rows.sort((a, b) => String(b.publishedAt).localeCompare(String(a.publishedAt)));

  const total = rows.length;
  const p = Math.max(1, Number(page) || 1);
  const sz = Math.min(50, Math.max(1, Number(size) || 20));
  const items = rows.slice((p - 1) * sz, p * sz).map(newsPublic);
  return { items, total, page: p, size: sz, hasMore: p * sz < total };
}

export function getNews(id) {
  const n = news().get(id);
  if (!n || n.deletedAt) return null;
  return n;
}

export function newsStats() {
  const rows = news().all().filter((n) => !n.deletedAt);
  const counts = {};
  for (const n of rows) {
    for (const t of n.tags || []) counts[t] = (counts[t] || 0) + 1;
  }
  return {
    total: rows.length,
    tags: NEWS_TAGS.map((t) => ({ id: t.id, name: t.name, icon: t.icon, count: counts[t.id] || 0 })),
    lastAt: rows.reduce((m, n) => (n.fetchedAt > m ? n.fetchedAt : m), ''),
  };
}

/**
 * 用户发布的新闻资讯。
 *
 * 抓取来的新闻有 urlKey 去重；用户发的是原创内容，urlKey 留空即可。
 * 字段跟抓取来的保持一致，这样列表页 / 详情页不用区分来源。
 */
export function createNews({
  user,
  title,
  summary,
  text,
  tags,
  coverUrl,
  sourceName,
  link,
  attachments,
} = {}) {
  const store = news();
  const now = new Date().toISOString();
  const row = {
    id: newId('nw'),
    urlKey: '',
    url: '',
    title: String(title || '').trim().slice(0, 200),
    sourceName: String(sourceName || '小鱼来了').trim().slice(0, 60) || '小鱼来了',
    sourceCategory: 'user',
    tags: Array.isArray(tags) ? tags.filter(Boolean).slice(0, 4) : [],
    summary: String(summary || '').trim().slice(0, 500),
    // 正文尽量跟原文一致，别在存储这一层又砍一刀
    text: String(text || '').trim().slice(0, 200000),
    coverUrl: String(coverUrl || '').trim().slice(0, 500),
    // 用户填的原文链接（跟抓取来的 url 复用同一个字段）
    url: String(link || '').trim().slice(0, 800),
    // 附件：文档 / 视频 / 图片，详情页按类型分别渲染
    attachments: Array.isArray(attachments)
      ? attachments
          .filter((f) => f && f.url)
          .slice(0, 9)
          .map((f) => ({
            id: String(f.id || ''),
            name: String(f.name || '附件').slice(0, 120),
            mime: String(f.mime || ''),
            size: Number(f.size) || 0,
            url: String(f.url),
            kind: String(f.kind || 'other'),
          }))
      : [],
    publishedAt: now,
    fetchedAt: now,
    hot: false,
    // 记录是谁发的，详情页可显示作者
    authorId: user?.id || '',
    authorName: user?.nickname || user?.name || '',
    fromUser: true,
  };
  store.insert(row);
  return row;
}

/**
 * 删除资讯 —— 改成软删除。
 *
 * 之前是真删，一旦误删（比如清理测试数据时条件写宽了）就再也找不回来，
 * 而抓取来的资讯源站轮换后也补不回来。现在只打 deletedAt 标记：
 *   · 列表 / 详情默认都看不到
 *   · 管理端可以从回收站恢复
 *   · 保留 30 天后由定时任务真正清掉
 */
export function deleteNews(id, operator) {
  const store = news();
  const row = store.get(id);
  if (!row) return false;
  if (row.deletedAt) return true; // 已经删过
  store.update(id, {
    deletedAt: new Date().toISOString(),
    deletedBy: operator?.id || '',
    deletedByName: operator?.nickname || '',
  });
  return true;
}

/** 从回收站恢复 */
export function restoreNews(id) {
  const store = news();
  const row = store.get(id);
  if (!row || !row.deletedAt) return false;
  store.update(id, { deletedAt: '', deletedBy: '', deletedByName: '' });
  return true;
}

/** 回收站列表 */
export function listDeletedNews({ page = 1, size = 20 } = {}) {
  const rows = news()
    .all()
    .filter((n) => n.deletedAt)
    .sort((a, b) => String(b.deletedAt).localeCompare(String(a.deletedAt)));
  const p = Math.max(1, Number(page) || 1);
  const sz = Math.min(100, Math.max(1, Number(size) || 20));
  return {
    items: rows.slice((p - 1) * sz, p * sz),
    total: rows.length,
    page: p,
    size: sz,
  };
}

/** 超期清理：回收站里放了 30 天的真删掉 */
export function purgeDeleted(days = 30) {
  const store = news();
  const cutoff = Date.now() - days * 86400_000;
  let removed = 0;
  for (const n of store.all()) {
    if (!n.deletedAt) continue;
    if (Date.parse(n.deletedAt) < cutoff) {
      store.remove(n.id);
      removed += 1;
    }
  }
  return { removed };
}

export { cleanTitle, dateFromUrl };

export default {
  refresh,
  pushLatest,
  listNews,
  getNews,
  newsPublic,
  newsStats,
  deleteNews,
  createNews,
  restoreNews,
  listDeletedNews,
  purgeDeleted,
};

/**
 * 小鱼来了 — 新闻资讯
 *
 * 后台每 3 小时抓一轮官方政策与行业媒体，
 * 这里只负责展示：行业标签筛选 + 列表 + 正文阅读。
 */

import { service } from './api.js';
import { copyText as copyToClipboard } from './clipboard.js';
import * as ui from './ui.js';

const TAG_META = {
  pv: { name: '光伏', icon: '☀️' },
  storage: { name: '储能', icon: '🔋' },
  wind: { name: '风电', icon: '🌬️' },
  compute: { name: '算力', icon: '🖥️' },
  ai: { name: '人工智能', icon: '🤖' },
  robot: { name: '机器人', icon: '🦾' },
  uav: { name: '无人机', icon: '🛩️' },
  evtol: { name: '飞行汽车', icon: '🚁' },
  hydrogen: { name: '氢能', icon: '💧' },
  finance: { name: '投融资', icon: '💰' },
  policy: { name: '政策', icon: '📜' },
};

function relTime(iso) {
  if (!iso) return '';
  const t = Date.parse(iso);
  if (!t) return '';
  const d = Date.now() - t;
  if (d < 3600_000) return `${Math.max(1, Math.floor(d / 60_000))} 分钟前`;
  if (d < 86400_000) return `${Math.floor(d / 3600_000)} 小时前`;
  if (d < 7 * 86400_000) return `${Math.floor(d / 86400_000)} 天前`;
  return new Date(t).toLocaleDateString('zh-CN');
}

function tagsHtml(tags = []) {
  return (tags || [])
    .slice(0, 4)
    .map((id) => {
      const m = TAG_META[id];
      return m ? `<span class="news-tag">${m.icon} ${m.name}</span>` : '';
    })
    .join('');
}

function newsCard(n) {
  return `<a class="news-card" href="#/news/${ui.esc(n.id)}">
    <div class="news-card-main">
      <div class="news-card-title">${ui.esc(n.title)}</div>
      ${n.summary ? `<div class="news-card-sum">${ui.esc(n.summary)}</div>` : ''}
      <div class="news-card-foot">
        <span class="news-src">${ui.esc(n.sourceName || '')}</span>
        <span class="news-dot">·</span>
        <span>${relTime(n.publishedAt)}</span>
        ${n.hot ? '<span class="news-hot">热点</span>' : ''}
      </div>
      ${(n.tags || []).length ? `<div class="news-tags">${tagsHtml(n.tags)}</div>` : ''}
    </div>
    <span class="news-card-arrow">›</span>
  </a>`;
}

/**
 * 分享一条资讯。
 * 手机上走系统分享（微信/QQ 都在里面），桌面端复制链接，
 * 两条路都不通再让用户长按复制。
 */
async function shareNews(n) {
  const url = `${location.origin}/#/news/${n.id}`;
  const payload = { title: n.title || '小鱼来了', text: n.summary || n.title || '', url };

  if (navigator.share) {
    try {
      await navigator.share(payload);
      return;
    } catch (err) {
      // 用户取消不算失败，不弹提示
      if (err && err.name === 'AbortError') return;
    }
  }

  // copyToClipboard 内部已做多级兜底，返回 'ok' | 'manual' | 'fail'
  const cr = await copyToClipboard(`${payload.title}\n${url}`);
  const ok = cr === 'ok';
  ui.toast(ok ? '链接已复制，粘到微信就行' : '复制失败，请长按地址手动复制', ok ? 'ok' : 'err');
}

/* ------------------------------------------------------------------ */
/* 列表页                                                              */
/* ------------------------------------------------------------------ */

export async function renderNews(ctx, query = {}) {
  const tag = query.tag || '';
  const q = query.q || '';

  const [meta, list] = await Promise.all([
    service.newsMeta().catch(() => ({ total: 0, tags: [] })),
    service.newsList({ tag, q, size: 30, page: Number(query.page) || 1 }).catch(() => ({ items: [], total: 0 })),
  ]);

  const total = list?.total || 0;
  const items = list?.items || [];

  const tabHtml = [
    `<a class="news-tab ${!tag && !q ? 'active' : ''}" href="#/news">全部 <i>${meta?.total || 0}</i></a>`,
    ...(meta?.tags || [])
      .filter((t) => t.count > 0)
      .map(
        (t) =>
          `<a class="news-tab ${tag === t.id ? 'active' : ''}" href="#/news?tag=${t.id}">${t.icon} ${ui.esc(t.name)} <i>${t.count}</i></a>`,
      ),
  ].join('');

  const body = items.length
    ? items.map(newsCard).join('')
    : `<div class="empty">${
        meta?.total === 0
          ? '资讯还在路上 —— 后台每 3 小时抓取一次官方政策与行业媒体，稍后再来看看'
          : '这个分类下暂时没有资讯'
      }</div>`;

  return {
    title: '新闻资讯',
    activeTab: 'news',
    showBack: false,
    content: `<div class="page news-page">
      <div class="news-hero">
        <div class="news-hero-t">
          <span class="news-hero-ico">📰</span>
          <span>新闻资讯</span>
        </div>
        <div class="news-hero-d">自动抓取官方政策与行业媒体的最新动态，按你关注的行业分类</div>
        <form class="news-search" id="news-search-form">
          <input class="input" id="news-q" placeholder="搜标题关键词，或直接说想找什么，如 江浙沪储能政策" value="${ui.esc(q)}">
          <button class="btn btn-sm btn-primary" type="submit">搜索</button>
          <button class="btn btn-sm" type="button" id="news-ai-btn" style="flex:none">🤖 AI</button>
        </form>
        <div class="tiny dim" id="news-ai-tip" style="margin-top:6px"></div>
        <div class="news-list" id="news-ai-list"></div>
        ${total ? `<div class="news-hero-f">共 ${total} 条${meta?.lastAt ? ` · 最近更新 ${relTime(meta.lastAt)}` : ''}</div>` : ''}
      </div>

      <a class="news-topic-bar" href="#/contest">
        <span class="ntb-ico">🏆</span>
        <span class="ntb-t">江浙沪创业大赛 · 政策速查</span>
        <span class="ntb-d">报名条件 / 时间节点 / 补贴政策</span>
        <span class="ntb-go">›</span>
      </a>

      <div class="news-tabs">${tabHtml}</div>
      <div class="news-list">${body}</div>
    </div>`,
    mount(root) {
      const form = root.querySelector('#news-search-form');
      if (form) {
        form.addEventListener('submit', (e) => {
          e.preventDefault();
          const v = (root.querySelector('#news-q')?.value || '').trim();
          location.hash = v ? `#/news?q=${encodeURIComponent(v)}` : '#/news';
        });
      }

      /* ---------------- AI 搜索 ---------------- */
      const aiBtn = root.querySelector('#news-ai-btn');
      const aiList = root.querySelector('#news-ai-list');
      const aiTip = root.querySelector('#news-ai-tip');
      const mainList = root.querySelector('.news-list:not(#news-ai-list)');
      const tabs = root.querySelector('.news-tabs');

      const clearAi = () => {
        if (aiList) aiList.innerHTML = '';
        if (aiTip) aiTip.textContent = '';
        if (mainList) mainList.style.display = '';
        if (tabs) tabs.style.display = '';
      };

      aiBtn?.addEventListener('click', async () => {
        const query = (root.querySelector('#news-q')?.value || '').trim();
        if (!query) {
          ui.toast('先说想找什么，比如「江浙沪储能政策」', 'err');
          root.querySelector('#news-q')?.focus();
          return;
        }
        const old = aiBtn.textContent;
        aiBtn.disabled = true;
        aiBtn.textContent = '搜索中…';
        try {
          const r = await service.newsAiSearch({ query });
          const items = (r && r.items) || [];
          if (!items.length) {
            if (aiTip) aiTip.textContent = (r && r.note) || '没找到相关的，换个说法试试';
            ui.toast('没找到相关的资讯', 'err');
            return;
          }
          if (mainList) mainList.style.display = 'none';
          if (tabs) tabs.style.display = 'none';
          if (aiList) aiList.innerHTML = items.map(newsCard).join('');
          if (aiTip) {
            aiTip.innerHTML = `<span>${r.mode === 'ai' ? 'AI' : '关键词'}在全库 ${r.scanned || 0} 条里找到 ${items.length} 条</span>
              <a href="javascript:;" id="news-ai-clear" style="margin-left:8px;color:#0b74ff">清除</a>`;
          }
          root.querySelector('#news-ai-clear')?.addEventListener('click', clearAi);
          ui.toast(`找到 ${items.length} 条`, 'ok');
        } catch (err) {
          ui.toast(err.message || 'AI 搜索失败', 'err');
        } finally {
          aiBtn.disabled = false;
          aiBtn.textContent = old;
        }
      });
    },
  };
}

/* ------------------------------------------------------------------ */
/* 详情页                                                              */
/* ------------------------------------------------------------------ */

export async function renderNewsDetail(ctx, { id }) {
  let n = null;
  try {
    n = await service.newsDetail(id);
  } catch {
    n = null;
  }

  if (!n) {
    return {
      title: '资讯不存在',
      content: '<div class="page"><div class="empty">这条资讯不存在或已下线</div></div>',
    };
  }

  /*
   * 正文渲染：普通段落照旧，连续的 Markdown 表格行合并成真正的 <table>。
   *
   * 从链接导入的资讯里常常带表格（报价、参数、时间表），
   * 拍平成文字后数字对不上表头，读者根本看不出来这是张表。
   */
  const splitCells = (line) =>
    line
      .replace(/^\|/, '')
      .replace(/\|$/, '')
      .split('|')
      .map((c) => c.trim());

  const isTableLine = (line) => /^\|.*\|$/.test(line.trim());
  const isSeparator = (line) => /^\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?$/.test(line.trim());

  const renderTable = (rows) => {
    if (!rows.length) return '';
    const head = splitCells(rows[0]);
    const bodyRows = rows.slice(1).filter((r) => !isSeparator(r)).map(splitCells);
    const th = head.map((c) => `<th>${ui.esc(c)}</th>`).join('');
    const tb = bodyRows
      .map((r) => `<tr>${head.map((_, i) => `<td>${ui.esc(r[i] || '')}</td>`).join('')}</tr>`)
      .join('');
    return `<div class="news-table-wrap"><table class="news-table"><thead><tr>${th}</tr></thead><tbody>${tb}</tbody></table></div>`;
  };

  const bodyHtml = (text) => {
    const lines = String(text || '').split('\n');
    const out = [];
    let i = 0;
    while (i < lines.length) {
      const line = lines[i].trim();
      if (isTableLine(line)) {
        const rows = [];
        while (i < lines.length && isTableLine(lines[i].trim())) {
          rows.push(lines[i].trim());
          i += 1;
        }
        const html = renderTable(rows);
        if (html) out.push(html);
        continue;
      }
      if (line) out.push(`<p>${ui.esc(line)}</p>`);
      i += 1;
    }
    return out.join('');
  };

  const paras = bodyHtml(n.text);

  /* 封面 */
  const cover = n.coverUrl ? ui.safeUrl(n.coverUrl) : '';
  const coverHtml = cover
    ? `<div class="news-cover-wrap"><img class="news-cover" src="${ui.esc(cover)}" alt="" loading="lazy"></div>`
    : '';

  /*
   * 附件：按类型分别渲染
   *   图片 → 直接铺开
   *   视频 → 原生播放器
   *   文档 → 卡片 + 「预览」（走 /api/preview）
   *   其他 → 下载
   */
  const files = Array.isArray(n.attachments) ? n.attachments : [];
  const imgFiles = files.filter((f) => /^image\//i.test(f.mime || '') || f.kind === 'image');
  const vidFiles = files.filter((f) => /^video\//i.test(f.mime || '') || f.kind === 'video');
  const docFiles = files.filter((f) => !imgFiles.includes(f) && !vidFiles.includes(f));

  const docPreviewable = (f) => {
    const name = String(f.name || '').toLowerCase();
    const ext = (name.split('.').pop() || '').toLowerCase();
    if (ext === 'pdf') return true;
    return ['ppt', 'pptx', 'pps', 'ppsx', 'doc', 'docx', 'xls', 'xlsx', 'odt', 'ods', 'odp'].includes(ext);
  };

  const imgsHtml = imgFiles.length
    ? `<div class="news-imgs">${imgFiles
        .map((f) => `<img src="${ui.esc(ui.safeUrl(f.url))}" alt="${ui.esc(f.name || '')}" loading="lazy">`)
        .join('')}</div>`
    : '';

  const vidsHtml = vidFiles.length
    ? `<div class="news-vids">${vidFiles
        .map(
          (f) => `<video class="news-vid" controls preload="metadata" playsinline
            src="${ui.esc(ui.safeUrl(f.url))}"></video>`,
        )
        .join('')}</div>`
    : '';

  const docsHtml = docFiles.length
    ? `<div class="card card-pad mt12">
        <div class="strong mb8">📎 附件（${docFiles.length}）</div>
        ${docFiles
          .map(
            (f) => `<div class="news-file-row">
              <span class="nfr-ico">📄</span>
              <span class="nfr-name">${ui.esc(f.name || '附件')}</span>
              <span class="nfr-size">${f.size ? `${Math.max(1, Math.round(f.size / 1024))} KB` : ''}</span>
              ${
                docPreviewable(f)
                  ? `<button class="btn btn-sm news-doc-open" type="button" data-fid="${ui.esc(f.id || '')}" data-fname="${ui.esc(f.name || '文档')}">👁 预览</button>`
                  : ''
              }
              <a class="btn btn-sm" href="${ui.esc(ui.safeUrl(f.url))}" target="_blank" rel="noopener">下载</a>
            </div>`,
          )
          .join('')}
      </div>`
    : '';

  const linkHtml = n.url
    ? `<div class="card card-pad mt12">
        <a class="btn btn-block" href="${ui.esc(ui.safeUrl(n.url))}" target="_blank" rel="noopener noreferrer nofollow">
          🔗 查看原文（${ui.esc(n.sourceName || '来源')}）
        </a>
        ${n.fromUser ? '' : '<div class="tiny dim center mt8">原文版权归原作者所有，本站仅做摘要与索引</div>'}
      </div>`
    : '';

  const result = {
    title: n.title,
    showBack: true,
    content: `<div class="page news-detail">
      <div class="card card-pad">
        <h1 class="news-detail-t">${ui.esc(n.title)}</h1>
        <div class="news-detail-meta">
          <span class="news-src">${ui.esc(n.sourceName || '')}</span>
          <span class="news-dot">·</span>
          <span>${new Date(n.publishedAt).toLocaleString('zh-CN')}</span>
          ${n.authorName ? `<span class="news-dot">·</span><span>${ui.esc(n.authorName)}</span>` : ''}
          <a class="news-share" href="javascript:;" id="news-share">🔗 分享</a>
        </div>
        ${(n.tags || []).length ? `<div class="news-tags mt8">${tagsHtml(n.tags)}</div>` : ''}
      </div>

      ${coverHtml}

      ${imgsHtml}

      <div class="card card-pad mt12 news-body">${
        paras || `<p class="muted">${n.fromUser ? '这条资讯没有正文' : '正文抓取失败，请查看原文'}</p>`
      }</div>

      ${vidsHtml}

      ${docsHtml}

      ${linkHtml}
    </div>`,
    async mount(root) {
      /* 文档预览复用首页那套 /api/preview 翻页器 */
      const btns = root.querySelectorAll('.news-doc-open');
      if (!btns.length) return;
      root.querySelector('#news-share')?.addEventListener('click', () => shareNews(n));

      let mod = null;
      try {
        mod = await import('./views-home.js');
      } catch {
        return;
      }
      btns.forEach((b) => {
        b.addEventListener('click', () => {
          mod.openDocPreview({ id: b.dataset.fid, name: b.dataset.fname || '文档' });
        });
      });
    },
  };

  return result;
}

export default { renderNews, renderNewsDetail };

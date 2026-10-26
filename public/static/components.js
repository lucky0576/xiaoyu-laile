/**
 * 小鱼来了 — 共享视图片段
 */
import {
  esc, safeUrl, fmtRelative, fmtDate, fmtSize, daysLeft, avatarHtml,
  KIND_ICON, KIND_LABEL, reliabilityColor, nl2br, initials,
} from './ui.js';

/* ---------------- 信息列表项 ---------------- */
export function itemHtml(l) {
  if (!l) return '';
  const cover = safeUrl(l.coverUrl);
  const badges = [];
  if (l.categoryName) badges.push(`<span class="badge">${esc(l.categoryName)}</span>`);
  if (l.typeName) badges.push(`<span class="badge gray">${esc(l.typeName)}</span>`);
  if (l.reliability && l.reliability.score != null) {
    badges.push(`<span class="badge ${l.reliability.level === 'high' ? 'ok' : l.reliability.level === 'low' ? 'danger' : 'accent'}">AI ${l.reliability.score}分</span>`);
  }

  const region = (l.cities || []).slice(0, 1).map((c) => c.name).join('');
  const industry = (l.subs || []).slice(0, 1).map((s) => s.name).join('') || (l.industries || []).slice(0, 1).map((s) => s.name).join('');
  const left = daysLeft(l.expiresAt);
  const expiry = l.expiresAt ? (left > 0 ? `剩 ${left} 天` : '已到期') : '';

  return `<a class="item" href="#/detail/${esc(l.id)}">
    ${cover
      ? `<img class="item-thumb" src="${esc(cover)}" alt="" loading="lazy">`
      : `<div class="item-thumb" style="display:grid;place-items:center;font-size:26px">${esc(categoryIcon(l.category))}</div>`}
    <div class="item-body">
      <div class="item-title clamp2">${esc(l.title)}</div>
      <div class="item-sub clamp2">${esc(l.subtitle || l.summary || '')}</div>
      <div class="item-meta">
        ${badges.join('')}
        ${region ? `<span>📍${esc(region)}</span>` : ''}
        ${industry ? `<span>· ${esc(industry)}</span>` : ''}
        ${expiry ? `<span>· ${esc(expiry)}</span>` : ''}
      </div>
      <div class="item-meta">
        <span>👁 ${l.stats?.views || 0}</span>
        <span>💬 ${l.stats?.comments || 0}</span>
        <span>⭐ ${l.stats?.followers || 0}</span>
        <span class="grow"></span>
        <span>${esc(fmtRelative(l.publishedAt || l.createdAt))}</span>
      </div>
    </div>
  </a>`;
}

export function categoryIcon(category) {
  return { project: '📁', bounty: '🎯', event: '🎪', trade: '🤝', tech: '🔬' }[category] || '📄';
}

export function categoryName(category) {
  return { project: '项目', bounty: '悬赏', event: '活动', trade: '贸易', tech: '科技成果转化' }[category] || '信息';
}

/* ---------------- AI 解析卡片 ---------------- */
export function aiCardHtml(ai) {
  if (!ai || !ai.reliability) return '';
  const r = ai.reliability;
  const color = reliabilityColor(r.level);
  const list = (arr, cls) => (arr || []).length
    ? `<ul class="ai-list ${cls}">${arr.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>`
    : '';
  return `<div class="card card-pad ai-card">
    <div class="row between mb8">
      <div class="ai-head">🤖 AI 项目解析</div>
      <span class="tiny dim">${ai.source === 'ai' ? '大模型分析' : '内置规则引擎'}</span>
    </div>
    <div class="row gap12">
      <div class="score-ring" style="background:${color}">${r.score}</div>
      <div class="grow">
        <div class="strong" style="color:${color}">${esc(r.label || '可靠性评估')}</div>
        <div class="tiny dim">综合信息完整度、商业合理性、合规风险得出</div>
      </div>
    </div>
    ${ai.summary ? `<div class="small mt12" style="color:var(--text-2)">${nl2br(ai.summary)}</div>` : ''}
    ${(r.findings || []).length ? `<div class="strong small mt12">✅ 可信之处</div>${list(r.findings, 'good')}` : ''}
    ${(r.risks || []).length ? `<div class="strong small mt12">⚠️ 风险提示</div>${list(r.risks, 'risk')}` : ''}
    ${(r.suggestions || []).length ? `<div class="strong small mt12">💡 建议补充</div>${list(r.suggestions, 'tip')}` : ''}
  </div>`;
}

/* ---------------- 附件 ---------------- */
export function filesHtml(files, { title = '附件资料' } = {}) {
  if (!files || !files.length) return '';
  return `<div class="card card-pad">
    <div class="strong mb8">📎 ${esc(title)}（${files.length}）</div>
    <div class="row wrap gap8">
      ${files.map(fileCardHtml).join('')}
    </div>
  </div>`;
}

export function fileCardHtml(f, { link = true } = {}) {
  if (!f) return '';
  const url = safeUrl(f.url);
  const inner = `<div class="file-card" style="min-width:200px;flex:1">
    <div class="fico">${KIND_ICON[f.kind] || '📎'}</div>
    <div class="grow" style="min-width:0">
      <div class="fname ellipsis">${esc(f.name)}</div>
      <div class="fmeta">${esc(KIND_LABEL[f.kind] || f.kind || '文件')} · ${fmtSize(f.size)}</div>
    </div>
  </div>`;
  return link && url ? `<a href="${esc(url)}" target="_blank" rel="noopener" style="flex:1;min-width:200px">${inner}</a>` : inner;
}

/* ---------------- 项目流程 ---------------- */
export function pipelineHtml(stages, history) {
  if (!stages || !stages.length) return '';
  const hist = new Map();
  for (const h of history || []) {
    if (!hist.has(h.stage)) hist.set(h.stage, []);
    hist.get(h.stage).push(h);
  }
  return `<div class="card card-pad">
    <div class="strong mb8">🔄 项目推进流程</div>
    <div class="pipeline">
      ${stages.map((s) => {
        const records = hist.get(s.id) || [];
        return `<div class="stage ${s.done ? 'done' : ''} ${s.current ? 'current' : ''}">
          <div class="dot">${s.done ? '✓' : s.index + 1}</div>
          <div class="body">
            <div class="name">${esc(s.name)}${s.current ? ' <span class="badge">当前</span>' : ''}</div>
            ${s.desc ? `<div class="desc">${esc(s.desc)}</div>` : ''}
            ${records.map((r) => `<div class="desc">· ${esc(fmtDate(r.at, true))} ${esc(r.byName || '')}${r.note ? `：${esc(String(r.note).slice(0, 80))}` : ''}</div>`).join('')}
          </div>
        </div>`;
      }).join('')}
    </div>
  </div>`;
}

/* ---------------- 留言 ---------------- */
export function commentHtml(c, { isReply = false } = {}) {
  const canDelete = c.mine;
  return `<div class="comment ${c.isAI ? 'ai' : ''}" style="${isReply ? 'margin-left:34px;padding-top:8px' : ''}" data-comment="${esc(c.id)}">
    ${c.isAI
      ? '<div class="avatar">🐟</div>'
      : avatarHtml({ nickname: c.authorName, avatar: c.authorAvatar })}
    <div class="body">
      <div class="name">
        <span>${esc(c.authorName || '用户')}</span>
        ${c.isAI ? '<span class="badge accent">AI 助理</span>' : ''}
        ${c.authorVerified ? '<span class="badge ok">已认证</span>' : ''}
        ${c.isOwner ? '<span class="badge">发布方</span>' : ''}
        <span class="dim tiny" style="font-weight:400">${esc(fmtRelative(c.createdAt))}</span>
      </div>
      <div class="content">${nl2br(c.content)}</div>
      ${(c.files || []).length ? `<div class="row wrap gap8 mt8">${c.files.map((f) => fileCardHtml(f)).join('')}</div>` : ''}
      <div class="row gap12 mt8 tiny">
        <a href="javascript:;" data-reply="${esc(c.id)}" data-name="${esc(c.authorName || '')}">回复</a>
        ${canDelete ? `<a href="javascript:;" style="color:var(--danger)" data-del="${esc(c.id)}">删除</a>` : ''}
      </div>
      ${(c.replies || []).map((r) => commentHtml(r, { isReply: true })).join('')}
    </div>
  </div>`;
}

/* ---------------- 用户卡片 ---------------- */
export function userCardHtml(u, { showContact = true } = {}) {
  if (!u) return '';
  return `<a class="item" href="#/user/${esc(u.id)}">
    ${avatarHtml(u, 'lg')}
    <div class="item-body">
      <div class="item-title">${esc(u.nickname || '用户')} ${u.verified ? '<span class="badge ok">已认证</span>' : ''}</div>
      <div class="item-sub">${esc([u.company, u.profession].filter(Boolean).join(' · ') || '未填写企业与职业')}</div>
      <div class="item-meta">
        ${u.industry ? `<span class="badge gray">${esc(u.industry)}</span>` : ''}
        ${u.city ? `<span>📍${esc(u.city)}</span>` : ''}
        ${showContact && u.contact?.phone ? `<span>📞${esc(u.contact.phone)}</span>` : ''}
      </div>
    </div>
  </a>`;
}

/* ---------------- 顶部筛选 ---------------- */
export function filtersHtml({ industries = [], cities = [], types = [], query = {} }) {
  const indChips = (industries || []).slice(0, 12)
    .map((i) => `<a class="chip ${query.industry === i.id ? 'active' : ''}" href="javascript:;" data-filter="industry" data-value="${esc(i.id)}">${esc(i.name)}${i.count ? ` ${i.count}` : ''}</a>`)
    .join('');
  const cityChips = (cities || []).slice(0, 12)
    .map((c) => `<a class="chip ${query.city === c.id ? 'active' : ''}" href="javascript:;" data-filter="city" data-value="${esc(c.id)}">${esc(c.name)}${c.count ? ` ${c.count}` : ''}</a>`)
    .join('');
  const typeChips = (types || []).slice(0, 10)
    .map((t) => `<a class="chip ${query.type === t.id ? 'active' : ''}" href="javascript:;" data-filter="type" data-value="${esc(t.id)}">${esc(t.name)}</a>`)
    .join('');
  return `
    ${indChips ? `<div class="chips scroll mb8">${indChips}</div>` : ''}
    ${cityChips ? `<div class="chips scroll mb8">${cityChips}</div>` : ''}
    ${typeChips ? `<div class="chips scroll mb8">${typeChips}</div>` : ''}`;
}

export function sortBarHtml(query = {}) {
  const opts = [
    { id: 'latest', name: '最新' },
    { id: 'hot', name: '最热' },
    { id: 'reliability', name: 'AI 评分' },
    { id: 'expiring', name: '即将到期' },
  ];
  return `<div class="chips scroll mb12">
    ${opts.map((o) => `<a class="chip ${(query.sort || 'latest') === o.id ? 'active' : ''}" href="javascript:;" data-sort="${o.id}">${o.name}</a>`).join('')}
  </div>`;
}

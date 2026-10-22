/**
 * 小鱼来了 — 论坛视图
 *
 * 路由：
 *   #/forums              板块总览（热门板块横向滚动 + 最新讨论两列卡片）
 *   #/forum/:slug         板块内帖子（两列卡片，与首页「最新发布」一致）
 *   #/post/:id            帖子详情
 *   #/post/new?forum=xxx  发帖
 *
 * 版式复用首页的 home-sec-head / home-scroll / home-tile / home-list2 / home-item，
 * 保证与「热门行业」「最新发布」完全一致。
 */

import { service, isLoggedIn } from './api.js';
import * as ui from './ui.js';

const FORUM_ICON_FALLBACK = '💬';

const TILE_GRAD = [
  'linear-gradient(135deg,#dbeafe,#bfdbfe)',
  'linear-gradient(135deg,#ffedd5,#fed7aa)',
  'linear-gradient(135deg,#dcfce7,#bbf7d0)',
  'linear-gradient(135deg,#ede9fe,#ddd6fe)',
  'linear-gradient(135deg,#cffafe,#a5f3fc)',
  'linear-gradient(135deg,#fce7f3,#fbcfe8)',
];

function clip(s, n) {
  const t = String(s || '').replace(/\s+/g, ' ').trim();
  return t.length > n ? `${t.slice(0, n)}…` : t;
}

/* ------------------------------------------------------------------ */
/* 板块方块（同「热门行业」）                                            */
/* ------------------------------------------------------------------ */
function forumTile(f, i) {
  return `<a class="home-tile" href="#/forum/${ui.esc(f.slug)}">
    <div class="art" style="background:${TILE_GRAD[i % TILE_GRAD.length]}">${f.icon || FORUM_ICON_FALLBACK}</div>
    <div class="t">${ui.esc(f.name)}</div>
    <div class="d">${ui.esc(f.postCount ? `${f.postCount} 帖` : '查看讨论')}</div>
  </a>`;
}

/* ------------------------------------------------------------------ */
/* 帖子卡片（同「最新发布」）                                            */
/* ------------------------------------------------------------------ */
function postCard(p, i) {
  const firstImg = (p.images || [])[0];
  const cover = firstImg
    ? `<img src="/files/${ui.esc(firstImg)}/view" alt="" style="width:100%;height:100%;object-fit:cover" loading="lazy" onerror="this.style.display='none'">`
    : `<span style="font-size:26px">${p.forumIcon || FORUM_ICON_FALLBACK}</span>`;

  return `<a class="home-item" href="#/post/${ui.esc(p.id)}">
    <div class="cover" ${firstImg ? '' : `style="background:${TILE_GRAD[i % TILE_GRAD.length]}"`}>
      ${cover}
      ${p.pinned ? '<span class="badge2">置顶</span>' : ''}
    </div>
    <div class="body">
      <div class="t">${ui.esc(clip(p.title, 40))}</div>
      <div class="m">
        <span>${ui.esc(p.forumName || '')}</span>
        <span>${ui.fmtRelative(p.createdAt)}</span>
      </div>
    </div>
  </a>`;
}

/* ================================================================== */
/* 板块总览                                                             */
/* ================================================================== */
export async function renderForums(ctx, query) {
  void query;
  const [listRes, ovRes] = await Promise.all([
    service.forums().catch(() => ({ groups: [], forums: [] })),
    service.forumOverview().catch(() => ({ totalPosts: 0, todayPosts: 0, totalForums: 0, recent: [] })),
  ]);
  const forums = listRes.forums || [];
  const ov = ovRes || {};

  const tileHtml = `<div class="home-sec-head"><h2>热门板块</h2><span class="tiny dim">共 ${forums.length} 个</span></div>
    <div class="home-panel" style="padding:0">
      <div class="home-scroll">
        ${forums.map((f, i) => forumTile(f, i)).join('')}
      </div>
    </div>`;

  const recentHtml = `<div class="home-sec-head"><h2>最新讨论</h2><a href="#/forum/solar">全部 ›</a></div>
    <div class="home-list2">
      ${(ov.recent || []).length
        ? ov.recent.map((p, i) => postCard(p, i)).join('')
        : ui.emptyState('💬', '还没有人发帖，来发第一个')}
    </div>`;

  const statsHtml = `<div class="home-stats">
    <div><div class="n">${forums.length}</div><div class="l">行业板块</div></div>
    <div><div class="n">${ov.totalPosts || 0}</div><div class="l">讨论帖</div></div>
    <div><div class="n">${ov.todayPosts || 0}</div><div class="l">今日新增</div></div>
  </div>`;

  return {
    title: '行业论坛',
    content: `<div class="home-wrap">
      <div class="home-sec-head"><h2>行业论坛</h2><button class="btn btn-sm btn-primary" id="fm-new">发帖</button></div>
      <div class="small muted" style="margin:-6px 0 10px">光伏 · 储能 · 风电 · 工程 · 投资 · 算力 · 机器人 · AI · 无人机 …… 按行业分区，只聊真问题。</div>
      ${statsHtml}
      ${tileHtml}
      ${recentHtml}
    </div>`,
    showBack: false,
    mount(root) {
      root.querySelector('#fm-new')?.addEventListener('click', () => {
        if (!isLoggedIn()) return ctx.nav('#/login?redirect=' + encodeURIComponent('#/post/new'));
        ctx.nav('#/post/new');
      });
    },
  };
}

/* ================================================================== */
/* 板块帖子列表                                                          */
/* ================================================================== */
export async function renderForum(ctx, { slug, page = 1, sort = 'new' } = {}) {
  const [res, listRes] = await Promise.all([
    service.forumPosts(slug, { page, pageSize: 20, sort }).catch(() => null),
    service.forums().catch(() => ({ forums: [] })),
  ]);
  if (!res || !res.forum) {
    return {
      title: '板块不存在',
      content: ui.emptyState('🧭', '该板块不存在或已下线', '<a class="btn btn-primary mt16" href="#/forums">返回论坛</a>'),
      showBack: true,
    };
  }
  const f = res.forum;
  const items = res.items || [];
  const forums = listRes.forums || [];

  const pager = [];
  for (let i = 1; i <= Math.min(res.pages || 1, 10); i++) {
    pager.push(
      `<a class="chip ${i === res.page ? 'active' : ''}" href="#/forum/${ui.esc(f.slug)}?page=${i}&sort=${sort}">${i}</a>`
    );
  }

  return {
    title: f.name,
    content: `<div class="home-wrap">
      <div class="home-sec-head">
        <h2>${f.icon || FORUM_ICON_FALLBACK} ${ui.esc(f.name)}</h2>
        <button class="btn btn-sm btn-primary" id="fp-new">发帖</button>
      </div>
      <div class="small muted" style="margin:-6px 0 10px">${ui.esc(f.desc || '')}</div>

      <div class="chips scroll mb12">
        <a class="chip ${sort !== 'hot' ? 'active' : ''}" href="#/forum/${ui.esc(f.slug)}?sort=new">最新</a>
        <a class="chip ${sort === 'hot' ? 'active' : ''}" href="#/forum/${ui.esc(f.slug)}?sort=hot">最热</a>
        <span class="tiny dim" style="align-self:center;margin-left:6px">${res.total} 帖</span>
      </div>

      <div class="home-list2">
        ${items.length ? items.map((p, i) => postCard(p, i)).join('') : ui.emptyState('💬', '这个板块还没有帖子，来发第一个')}
      </div>

      ${res.pages > 1 ? `<div class="chips mt12">${pager.join('')}</div>` : ''}

      <div class="home-sec-head mt16"><h2>切换板块</h2><a href="#/forums">全部 ›</a></div>
      <div class="home-panel" style="padding:0">
        <div class="home-scroll">
          ${forums.map((x, i) => forumTile(x, i)).join('')}
        </div>
      </div>
    </div>`,
    showBack: true,
    mount(root) {
      root.querySelector('#fp-new')?.addEventListener('click', () => {
        const to = '#/post/new?forum=' + encodeURIComponent(f.slug);
        if (!isLoggedIn()) return ctx.nav('#/login?redirect=' + encodeURIComponent(to));
        ctx.nav(to);
      });
    },
  };
}

/* ================================================================== */
/* 帖子详情                                                              */
/* ================================================================== */
export async function renderPost(ctx, { id } = {}) {
  if (!id) {
    return { title: '帖子', content: ui.emptyState('🧭', '帖子不存在'), showBack: true };
  }
  const res = await service.post(id).catch(() => null);
  if (!res?.post) {
    return {
      title: '帖子不存在',
      content: ui.emptyState('🧭', '帖子不存在或已删除', '<a class="btn btn-primary mt16" href="#/forums">返回论坛</a>'),
      showBack: true,
    };
  }
  const p = res.post;
  const comments = res.comments || [];

  const imgHtml = (p.images || []).length
    ? `<div class="po-detail-imgs">${p.images.map((fid) => `<img src="/files/${ui.esc(fid)}/view" alt="" loading="lazy" onerror="this.style.display='none'">`).join('')}</div>`
    : '';

  const cHtml = (c) => `<div class="cm-item">
      <div class="cm-head">
        <span class="cm-name">${ui.esc(c.authorName)}</span>
        <span class="cm-time">${ui.fmtRelative(c.createdAt)}</span>
      </div>
      <div class="cm-body">${ui.nl2br(ui.esc(c.content))}</div>
    </div>`;

  return {
    title: p.title,
    content: `<div class="page">
      <div class="po-detail">
        <div class="po-detail-f">
          <a class="po-detail-forum" href="#/forum/${ui.esc(p.forumSlug)}">${p.forumIcon || ''} ${ui.esc(p.forumName || '')}</a>
        </div>
        <h1 class="po-detail-t">${ui.esc(p.title)}</h1>
        <div class="po-detail-m">
          <span>${ui.esc(p.authorName || '')}${p.authorVerified ? ' <i class="v-badge">✓</i>' : ''}</span>
          <span>${ui.fmtRelative(p.createdAt)}</span>
          <span>👁 ${p.viewCount || 0}</span>
        </div>
        <div class="po-detail-b">${ui.nl2br(ui.esc(p.body || ''))}</div>
        ${imgHtml}
        ${p.contactHidden ? `<div class="warn-note mt12">🔒 正文中的联系方式已自动隐藏，如需对接请在下方留言。</div>` : ''}
        <div class="po-actions">
          <button class="btn btn-outline btn-sm ${p.liked ? 'active' : ''}" id="po-like">
            ${p.liked ? '❤️' : '🤍'} <span id="po-like-n">${p.likeCount || 0}</span>
          </button>
          <button class="btn btn-outline btn-sm" id="po-reply">💬 回复</button>
          ${isLoggedIn() && (p.authorId === (service.meCached?.() || {}).id) ? '<button class="btn btn-ghost btn-sm" id="po-del">删除</button>' : ''}
        </div>
      </div>

      <div class="card mt12">
        <div class="card-t">回复 <span class="dim">(${comments.length})</span></div>
        ${comments.length ? comments.map(cHtml).join('') : '<div class="dim small center" style="padding:16px 0">还没有回复</div>'}
      </div>
    </div>`,
    showBack: true,
    async mount(root) {
      root.querySelector('#po-like')?.addEventListener('click', async (e) => {
        if (!isLoggedIn()) return ctx.nav('#/login?redirect=' + encodeURIComponent('#/post/' + id));
        try {
          const r = await service.likePost(id);
          const btn = e.currentTarget;
          btn.classList.toggle('active', r.liked);
          btn.innerHTML = `${r.liked ? '❤️' : '🤍'} <span id="po-like-n">${r.likeCount}</span>`;
        } catch (err) {
          ui.toast(err.message || '操作失败', 'err');
        }
      });

      root.querySelector('#po-reply')?.addEventListener('click', async () => {
        if (!isLoggedIn()) return ctx.nav('#/login?redirect=' + encodeURIComponent('#/post/' + id));
        const text = await ui.promptDialog({ title: '回复帖子', label: '内容', multiline: true, okText: '发布' });
        if (!text) return;
        try {
          await service.addPostComment(id, text);
          ui.toast('回复成功', 'ok');
          ctx.nav('#/post/' + id, { replace: true });
        } catch (err) {
          ui.toast(err.message || '回复失败', 'err');
        }
      });

      root.querySelector('#po-del')?.addEventListener('click', async () => {
        const ok = await ui.confirmDialog({ title: '删除帖子', message: '删除后不可恢复，确定吗？', danger: true, okText: '删除' });
        if (!ok) return;
        try {
          await service.deletePost(id);
          ui.toast('已删除', 'ok');
          ctx.nav('#/forums');
        } catch (err) {
          ui.toast(err.message || '删除失败', 'err');
        }
      });
    },
  };
}

/* ================================================================== */
/* 发帖                                                                 */
/* ================================================================== */
export async function renderPostNew(ctx, { forum } = {}) {
  if (!isLoggedIn()) {
    return {
      title: '发帖',
      content: ui.emptyState('🔒', '请先登录后再发帖', `<a class="btn btn-primary mt16" href="#/login?redirect=${encodeURIComponent('#/post/new')}">立即登录</a>`),
      showBack: true,
    };
  }

  const listRes = await service.forums().catch(() => ({ forums: [] }));
  const forums = listRes.forums || [];
  const current = forum || forums[0]?.slug || 'solar';

  const opts = forums
    .map((f) => `<option value="${ui.esc(f.slug)}" ${f.slug === current ? 'selected' : ''}>${f.icon || ''} ${ui.esc(f.name)}</option>`)
    .join('');

  return {
    title: '发帖',
    content: `<div class="page">
      <div class="card">
        <div class="field">
          <label>选择板块</label>
          <select class="input" id="np-forum">${opts}</select>
        </div>
        <div class="field">
          <label>标题</label>
          <input class="input" id="np-title" maxlength="120" placeholder="一句话说清楚你要讨论的问题（至少 4 字）" />
        </div>
        <div class="field">
          <label>内容</label>
          <textarea class="input" id="np-body" rows="8" maxlength="20000" placeholder="把背景、问题、你的判断写清楚，方便同行给出有价值的回复。"></textarea>
        </div>
        <div class="field">
          <label>配图（选填，最多 9 张）</label>
          <input type="file" id="np-files" accept="image/*" multiple />
          <div class="tiny dim mt6">有现场照片的帖子更容易被看到</div>
        </div>
        <div class="warn-note">🔒 正文中的手机号、微信、邮箱会自动隐藏，保护隐私。</div>
        <button class="btn btn-primary btn-block mt16" id="np-submit">发布</button>
      </div>
    </div>`,
    showBack: true,
    mount(root) {
      root.querySelector('#np-submit')?.addEventListener('click', async (e) => {
        const btn = e.currentTarget;
        const forumSlug = root.querySelector('#np-forum').value;
        const title = (root.querySelector('#np-title').value || '').trim();
        const body = (root.querySelector('#np-body').value || '').trim();
        if (title.length < 4) return ui.toast('标题至少 4 个字', 'err');
        if (body.length < 4) return ui.toast('内容至少 4 个字', 'err');

        const files = [...(root.querySelector('#np-files').files || [])].slice(0, 9);
        const fd = new FormData();
        fd.append('forumSlug', forumSlug);
        fd.append('title', title);
        fd.append('body', body);
        for (const f of files) fd.append('file', f, f.name);
        if (files.length) fd.append('fileFields', JSON.stringify(files.map(() => 'image')));

        btn.disabled = true;
        btn.textContent = '发布中…';
        try {
          const r = await service.createPost(fd);
          ui.toast('发布成功', 'ok');
          ctx.nav('#/post/' + r.post.id);
        } catch (err) {
          ui.toast(err.message || '发布失败', 'err');
          btn.disabled = false;
          btn.textContent = '发布';
        }
      });
    },
  };
}

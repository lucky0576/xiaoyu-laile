/**
 * 小鱼来了 — 后台：短视频管理
 *
 * 管理员在这里看全部短视频，可以把不合适的直接下架。
 * 下架后前台列表和详情都不再出现，但记录还在，可以恢复。
 */
import { service } from './api.js';
import * as ui from './ui.js';

const KIND_NAME = { short: '短视频', live: '直播' };

function relTime(iso) {
  if (!iso) return '';
  const t = Date.parse(iso);
  if (!t) return '';
  const d = Date.now() - t;
  if (d < 60_000) return '刚刚';
  if (d < 3600_000) return `${Math.floor(d / 60_000)} 分钟前`;
  if (d < 86400_000) return `${Math.floor(d / 3600_000)} 小时前`;
  if (d < 7 * 86400_000) return `${Math.floor(d / 86400_000)} 天前`;
  return new Date(t).toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' });
}

export async function renderAdminShorts(ctx) {
  if (!ctx.state.user?.isAdmin) {
    return {
      title: '短视频管理',
      showBack: true,
      content: '<div class="page"><div class="empty">只有管理员可以访问</div></div>',
    };
  }

  const state = { q: '', type: '', list: [], loading: true };

  const load = async () => {
    const r = await service.adminFeeds({ q: state.q, type: state.type });
    state.list = r?.items || [];
    state.loading = false;
    return state.list;
  };

  await load();

  const rowHtml = (f) => {
    const removed = f.status === 'removed';
    const isAuto = f.source === 'collect';
    return `<div class="sh-admin-row ${removed ? 'removed' : ''}" data-id="${ui.esc(f.id)}">
      <div class="sh-admin-thumb">
        ${
          f.coverUrl
            ? `<img src="${ui.esc(f.coverUrl)}" alt="" loading="lazy">`
            : '<div class="sh-admin-ph">无封面</div>'
        }
      </div>
      <div class="sh-admin-body">
        <div class="sh-admin-title">${ui.esc(f.title || '(无标题)')}</div>
        <div class="sh-admin-meta">
          ${isAuto ? '<span class="badge">自动</span>' : ''}
          ${removed ? '<span class="badge danger">已下架</span>' : ''}
          <span>${ui.esc(KIND_NAME[f.type] || f.type || '短视频')}</span>
          <span>·</span>
          <span>${ui.esc(relTime(f.createdAt))}</span>
          ${f.stats ? `<span>· 👁 ${f.stats.views || 0}</span>` : ''}
        </div>
        <div class="sh-admin-act">
          ${
            removed
              ? `<button class="btn btn-sm btn-outline" data-restore>恢复上架</button>`
              : `<button class="btn btn-sm btn-outline danger" data-takedown>下架</button>`
          }
          ${f.video && f.video.url ? `<a class="btn btn-sm btn-outline" href="${ui.esc(f.video.url)}" target="_blank" rel="noopener">看视频</a>` : ''}
        </div>
      </div>
    </div>`;
  };

  const listHtml = () => (state.list.length
    ? state.list.map(rowHtml).join('')
    : '<div class="empty">没有内容</div>');

  const removedCount = () => state.list.filter((x) => x.status === 'removed').length;

  const html = `<div class="page">
    <div class="row between mb8">
      <div>
        <h2 style="font-size:19px">🎬 短视频管理</h2>
        <div class="tiny dim mt4">不合适的可以直接下架，下架后前台看不到，可随时恢复</div>
      </div>
      <span class="tiny dim" id="sh-count">共 ${state.list.length} 条 / 已下架 ${removedCount()}</span>
    </div>

    <div class="card card-pad mb12">
      <div class="input-group">
        <input class="input" id="sh-q" placeholder="搜标题" value="${ui.esc(state.q)}">
        <button class="btn btn-primary" id="sh-search" type="button" style="flex:none">搜索</button>
      </div>
      <div class="row gap8 mt8" id="sh-filter">
        <button class="chip ${state.type === '' ? 'active' : ''}" data-type="" type="button">全部</button>
        <button class="chip ${state.type === 'short' ? 'active' : ''}" data-type="short" type="button">短视频</button>
        <button class="chip ${state.type === 'live' ? 'active' : ''}" data-type="live" type="button">直播</button>
      </div>
    </div>

    <div id="sh-list">${listHtml()}</div>
  </div>`;

  return {
    title: '短视频管理',
    showBack: true,
    content: html,
    async mount(root) {
      const $ = (s) => root.querySelector(s);
      const rerender = () => {
        $('#sh-list').innerHTML = listHtml();
        $('#sh-count').textContent = `共 ${state.list.length} 条 / 已下架 ${removedCount()}`;
      };

      const reload = async () => {
        try {
          ui.showLoading('加载中…');
          await load();
          rerender();
        } finally {
          ui.hideLoading();
        }
      };

      $('#sh-search')?.addEventListener('click', () => {
        state.q = ($('#sh-q')?.value || '').trim();
        reload();
      });
      $('#sh-q')?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          state.q = ($('#sh-q')?.value || '').trim();
          reload();
        }
      });
      $('#sh-filter')?.addEventListener('click', (e) => {
        const b = e.target.closest('[data-type]');
        if (!b) return;
        state.type = b.dataset.type || '';
        root.querySelectorAll('#sh-filter .chip').forEach((c) => c.classList.toggle('active', c === b));
        reload();
      });

      $('#sh-list')?.addEventListener('click', async (e) => {
        const row = e.target.closest('[data-id]');
        if (!row) return;
        const id = row.dataset.id;
        const item = state.list.find((x) => x.id === id);
        if (!item) return;

        if (e.target.closest('[data-takedown]')) {
          const ok = await ui.confirmDialog({
            title: '下架这条内容',
            message: `「${item.title}」下架后前台列表与详情都不再出现，可以随时恢复。`,
            okText: '确认下架',
            danger: true,
          });
          if (!ok) return;
          try {
            await service.adminFeedTakedown(id);
            item.status = 'removed';
            rerender();
            ui.toast('已下架', 'ok');
          } catch (err) {
            ui.toast(err.message || '下架失败', 'err');
          }
          return;
        }

        if (e.target.closest('[data-restore]')) {
          try {
            await service.adminFeedRestore(id);
            item.status = 'published';
            rerender();
            ui.toast('已恢复上架', 'ok');
          } catch (err) {
            ui.toast(err.message || '操作失败', 'err');
          }
        }
      });
    },
  };
}

export default { renderAdminShorts };

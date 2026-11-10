/**
 * 后台：首页板块（横栏）排序
 *
 * 管理员可把首页的横栏 / 板块上下移动，保存后首页按新顺序渲染。
 */

import * as ui from './ui.js';
import { api } from './api.js';

export async function renderAdminHome(ctx) {
  if (!ctx.requireLogin || !ctx.requireLogin()) return { title: '首页排序', content: '', showBack: true };
  if (!ctx.state.user?.isAdmin) {
    return { title: '首页排序', content: ui.emptyState('🔒', '仅管理员可操作'), showBack: true };
  }

  let layout;
  try {
    layout = await api.get('/api/admin/home-layout');
  } catch (err) {
    return { title: '首页排序', content: ui.emptyState('⚠️', err.message || '读取失败'), showBack: true };
  }

  let order = [...layout.order];
  const names = Object.fromEntries((layout.sections || []).map((s) => [s.id, s]));

  const rowsHtml = () =>
    order
      .map((id, i) => {
        const s = names[id] || { name: id, desc: '' };
        return `<div class="admin-sort-row">
          <div class="admin-sort-idx">${i + 1}</div>
          <div class="admin-sort-body">
            <div class="admin-sort-name">${ui.esc(s.name)}</div>
            <div class="admin-sort-desc">${ui.esc(s.desc || '')}</div>
          </div>
          <div class="admin-sort-btns">
            <button class="btn btn-sm" type="button" data-up="${ui.esc(id)}" ${i === 0 ? 'disabled' : ''}>↑ 上移</button>
            <button class="btn btn-sm" type="button" data-down="${ui.esc(id)}" ${i === order.length - 1 ? 'disabled' : ''}>↓ 下移</button>
          </div>
        </div>`;
      })
      .join('');

  const html = `<div class="page">
    <div class="card card-pad mb12">
      <div class="strong mb6">首页板块排序</div>
      <div class="tiny dim">用「上移 / 下移」调整首页各横栏与板块的先后顺序；保存后立即生效（前端会重新拉取）。</div>
    </div>
    <div class="card card-pad">
      <div id="admin-sort-list">${rowsHtml()}</div>
      <div class="row gap8 mt12">
        <button class="btn btn-primary grow" id="admin-sort-save" type="button">保存顺序</button>
        <button class="btn grow" id="admin-sort-reset" type="button">恢复默认</button>
      </div>
      <div class="tiny dim center mt8" id="admin-sort-status"></div>
    </div>
  </div>`;

  return {
    title: '首页排序',
    content: html,
    showBack: true,
    mount(root) {
      const list = root.querySelector('#admin-sort-list');
      const status = root.querySelector('#admin-sort-status');

      const paint = () => {
        list.innerHTML = rowsHtml();
      };

      const move = (id, dir) => {
        const i = order.indexOf(id);
        const j = i + dir;
        if (i < 0 || j < 0 || j >= order.length) return;
        [order[i], order[j]] = [order[j], order[i]];
        paint();
      };

      root.addEventListener('click', (e) => {
        const up = e.target.closest('[data-up]');
        if (up) return move(up.dataset.up, -1);
        const down = e.target.closest('[data-down]');
        if (down) return move(down.dataset.down, 1);
      });

      root.querySelector('#admin-sort-save')?.addEventListener('click', async (e) => {
        const btn = e.currentTarget;
        btn.disabled = true;
        status.textContent = '保存中…';
        try {
          const r = await api.put('/api/admin/home-layout', { order });
          order = r.order || order;
          paint();
          status.textContent = '✅ 已保存，首页刷新后生效';
          ui.toast('首页顺序已保存', 'ok');
        } catch (err) {
          status.textContent = '保存失败：' + (err.message || '未知错误');
          ui.toast('保存失败', 'err');
        } finally {
          btn.disabled = false;
        }
      });

      root.querySelector('#admin-sort-reset')?.addEventListener('click', () => {
        order = (names.__default || []) && order;
        // 用服务端板块定义顺序恢复
        order = (layout.sections || []).map((s) => s.id);
        paint();
        status.textContent = '已恢复默认顺序，记得点「保存顺序」';
      });
    },
  };
}

export default { renderAdminHome };

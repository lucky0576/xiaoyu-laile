/**
 * 小鱼来了 — 场景广场交易 · 后台管理
 *
 * 路由：#/admin-hangzhou
 *
 * 为什么要有这个页面：
 *   场景需求/能力来自「杭州场景创新平台」（小程序 + 官网，需登录），
 *   数据会持续新增。之前写在代码里，加一条就要发版。
 *   现在数据落库，这里可以直接粘贴导入、编辑、删除。
 *
 * 三个标签页：
 *   需求管理  场景需求清单 + 新建/编辑/删除
 *   能力管理  场景能力清单 + 新建/编辑/删除
 *   批量导入  粘贴 TSV 或 JSON，批量入库（自动去重）
 */

import { service, store } from './api.js';
import * as ui from './ui.js';

export async function renderAdminHangzhou(ctx) {
  const me = store.user;
  if (!me || !me.isAdmin) {
    return {
      title: '场景管理',
      content: `<div class="page">${ui.emptyState('⛔', me ? '需要管理员权限' : '需要管理员登录')}</div>`,
      showBack: true,
    };
  }

  const [metaRes, needRes, capRes] = await Promise.all([
    service.hangzhouMeta().catch(() => null),
    service.adminHzNeeds().catch(() => ({ items: [] })),
    service.adminHzCaps().catch(() => ({ items: [] })),
  ]);

  const meta = metaRes || { stats: {}, categories: [] };
  const needs = needRes.items || [];
  const caps = capRes.items || [];
  const stats = meta.stats || {};

  const html = `
  <div class="page hzadm-page">
    <div class="hzadm-hero">
      <div class="hzadm-hero-t">场景广场交易 · 后台管理</div>
      <div class="hzadm-hero-s">
        需求 ${needs.length} 条（导入 ${stats.importedNeeds || 0}）·
        能力 ${caps.length} 家（导入 ${stats.importedCaps || 0}）
      </div>
    </div>

    <div class="hzadm-tabs">
      <a class="hzadm-tab active" data-tab="needs">需求管理 <i>${needs.length}</i></a>
      <a class="hzadm-tab" data-tab="caps">能力管理 <i>${caps.length}</i></a>
      <a class="hzadm-tab" data-tab="import">批量导入</a>
    </div>

    <div class="hzadm-panel" id="hzadm-needs">
      <div class="hzadm-actions">
        <button class="btn btn-primary btn-sm" id="hzadm-new-need">＋ 新建需求</button>
      </div>
      <div id="hzadm-need-list"></div>
    </div>

    <div class="hzadm-panel hide" id="hzadm-caps">
      <div class="hzadm-actions">
        <button class="btn btn-primary btn-sm" id="hzadm-new-cap">＋ 新建能力</button>
      </div>
      <div id="hzadm-cap-list"></div>
    </div>

    <div class="hzadm-panel hide" id="hzadm-import">
      <div class="card card-pad">
        <div class="strong mb8">批量导入</div>
        <div class="hzadm-hint">
          支持两种格式：<b>TSV</b>（从 Excel / 平台表格直接复制粘贴，制表符分隔）或 <b>JSON 数组</b>。
          系统会自动去重：需求按「场景 + 单位」，能力按「企业名称 + 项目」。
        </div>

        <div class="hzadm-kind" id="hzadm-kind">
          <button class="hzadm-kind-btn active" data-kind="needs">导入需求</button>
          <button class="hzadm-kind-btn" data-kind="caps">导入能力</button>
        </div>

        <textarea class="textarea hzadm-ta" id="hzadm-text" rows="12"
          placeholder="需求格式（从表格复制，含表头也行）：&#10;序号	场景需求单位	需求场景	需求的具体内容	合作模式&#10;11	杭州市某医院	基层门诊AI辅助诊断	需要影像辅助诊断能力	解决方案共创&#10;&#10;能力格式：&#10;序号	企业名称	项目及场景简介	场景类别	可提供能力的具体内容	合作模式"></textarea>

        <div class="hzadm-import-actions">
          <button class="btn btn-primary" id="hzadm-do-import">开始导入</button>
          <button class="btn btn-sm" id="hzadm-clear">删除所有导入数据</button>
        </div>

        <div class="hzadm-result hide" id="hzadm-result"></div>
      </div>
    </div>
  </div>`;

  return {
    title: '场景管理',
    content: html,
    showBack: true,
    async mount(root) {
      /* 标签切换 */
      root.querySelector('.hzadm-tabs')?.addEventListener('click', (e) => {
        const a = e.target.closest('[data-tab]');
        if (!a) return;
        [...root.querySelectorAll('.hzadm-tab')].forEach((el) => el.classList.toggle('active', el === a));
        ['needs', 'caps', 'import'].forEach((t) => {
          root.querySelector(`#hzadm-${t}`)?.classList.toggle('hide', t !== a.dataset.tab);
        });
      });

      const needList = root.querySelector('#hzadm-need-list');
      const capList = root.querySelector('#hzadm-cap-list');

      const renderNeeds = (items) => {
        if (!items.length) {
          needList.innerHTML = ui.emptyState('📋', '还没有需求');
          return;
        }
        needList.innerHTML = items
          .map(
            (n) => `<div class="hzadm-row">
              <div class="hzadm-row-main">
                <div class="hzadm-row-top">
                  <span class="hzadm-seq">${n.seq}</span>
                  <span class="hzadm-name">${ui.esc(n.scene)}</span>
                  ${n.source === 'import' ? '<span class="hzadm-badge import">导入</span>' : ''}
                  ${n.enabled ? '' : '<span class="hzadm-badge off">已下架</span>'}
                </div>
                <div class="hzadm-row-meta">
                  <span>${ui.esc(n.org || '—')}</span>
                  ${n.mode ? `<span>${ui.esc(n.mode.slice(0, 20))}</span>` : ''}
                </div>
              </div>
              <div class="hzadm-row-ops">
                <button class="hzadm-op" data-act="edit-need" data-id="${n.id}">编辑</button>
                <button class="hzadm-op danger" data-act="del-need" data-id="${n.id}">删除</button>
              </div>
            </div>`,
          )
          .join('');
      };

      const renderCaps = (items) => {
        if (!items.length) {
          capList.innerHTML = ui.emptyState('🏢', '还没有能力方');
          return;
        }
        capList.innerHTML = items
          .map(
            (c) => `<div class="hzadm-row">
              <div class="hzadm-row-main">
                <div class="hzadm-row-top">
                  <span class="hzadm-seq">${c.seq}</span>
                  <span class="hzadm-name">${ui.esc(c.company)}</span>
                  ${c.source === 'import' ? '<span class="hzadm-badge import">导入</span>' : ''}
                  ${c.enabled ? '' : '<span class="hzadm-badge off">已下架</span>'}
                </div>
                <div class="hzadm-row-meta">
                  <span>${ui.esc((c.project || '').slice(0, 26))}</span>
                  <span>${ui.esc(c.categoryName || '')}</span>
                </div>
              </div>
              <div class="hzadm-row-ops">
                <button class="hzadm-op" data-act="edit-cap" data-id="${c.id}">编辑</button>
                <button class="hzadm-op danger" data-act="del-cap" data-id="${c.id}">删除</button>
              </div>
            </div>`,
          )
          .join('');
      };

      renderNeeds(needs);
      renderCaps(caps);

      const refresh = async () => {
        const [n, c] = await Promise.all([
          service.adminHzNeeds().catch(() => ({ items: [] })),
          service.adminHzCaps().catch(() => ({ items: [] })),
        ]);
        renderNeeds(n.items || []);
        renderCaps(c.items || []);
      };

      /* 行操作 */
      root.addEventListener('click', async (e) => {
        const btn = e.target.closest('[data-act]');
        if (!btn) return;
        const { act, id } = btn.dataset;

        if (act === 'edit-need') {
          const item = (await service.adminHzNeeds().catch(() => ({ items: [] }))).items.find((x) => x.id === id);
          if (!item) return ui.toast('读取失败', 'err');
          openNeedForm(item, async () => { await refresh(); ui.toast('已保存', 'ok'); });
          return;
        }
        if (act === 'edit-cap') {
          const item = (await service.adminHzCaps().catch(() => ({ items: [] }))).items.find((x) => x.id === id);
          if (!item) return ui.toast('读取失败', 'err');
          openCapForm(item, async () => { await refresh(); ui.toast('已保存', 'ok'); });
          return;
        }
        if (act === 'del-need' || act === 'del-cap') {
          const ok = await ui.confirmDialog({ title: '确认删除', message: '删除后前台立即不可见，且不可恢复。', okText: '删除', cancelText: '取消' });
          if (!ok) return;
          try {
            if (act === 'del-need') await service.adminHzNeedDelete(id);
            else await service.adminHzCapDelete(id);
            await refresh();
            ui.toast('已删除', 'ok');
          } catch (err) {
            ui.toast(err.message || '删除失败', 'err');
          }
        }
      });

      /* 新建 */
      root.querySelector('#hzadm-new-need')?.addEventListener('click', () => {
        openNeedForm(null, async () => { await refresh(); ui.toast('已创建', 'ok'); });
      });
      root.querySelector('#hzadm-new-cap')?.addEventListener('click', () => {
        openCapForm(null, async () => { await refresh(); ui.toast('已创建', 'ok'); });
      });

      /* 导入 */
      let importKind = 'needs';
      root.querySelector('#hzadm-kind')?.addEventListener('click', (e) => {
        const b = e.target.closest('[data-kind]');
        if (!b) return;
        importKind = b.dataset.kind;
        [...root.querySelectorAll('.hzadm-kind-btn')].forEach((el) => el.classList.toggle('active', el === b));
      });

      root.querySelector('#hzadm-do-import')?.addEventListener('click', async () => {
        const text = root.querySelector('#hzadm-text')?.value || '';
        if (!text.trim()) return ui.toast('请先粘贴要导入的内容', 'err');
        const btn = root.querySelector('#hzadm-do-import');
        btn.disabled = true;
        btn.textContent = '导入中…';
        try {
          const r = await service.adminHzImport(importKind, text);
          const resEl = root.querySelector('#hzadm-result');
          resEl.classList.remove('hide');
          resEl.innerHTML = `
            <div class="hzadm-res-ok">导入完成：解析 ${r.parsed} 条，新增 <b>${r.added}</b>，跳过 ${r.skipped}（已存在），失败 ${r.failed}</div>
            ${(r.addedItems || []).length ? `<div class="hzadm-res-list"><b>新增：</b>${r.addedItems.map((x) => ui.esc(x.name)).join('、')}</div>` : ''}
            ${(r.skippedItems || []).length ? `<div class="hzadm-res-skip"><b>跳过：</b>${r.skippedItems.map((x) => ui.esc(x.reason)).join('；')}</div>` : ''}
            ${(r.failedItems || []).length ? `<div class="hzadm-res-fail"><b>失败：</b>${r.failedItems.map((x) => `第${x.row}行 ${ui.esc(x.reason)}`).join('；')}</div>` : ''}`;
          await refresh();
          ui.toast(`新增 ${r.added} 条`, 'ok');
        } catch (err) {
          ui.toast(err.message || '导入失败', 'err');
        } finally {
          btn.disabled = false;
          btn.textContent = '开始导入';
        }
      });

      root.querySelector('#hzadm-clear')?.addEventListener('click', async () => {
        const ok = await ui.confirmDialog({
          title: '删除所有导入数据',
          message: '只删除通过「批量导入」进来的条目，出厂数据和手工新建的不受影响。确定吗？',
          okText: '删除',
          cancelText: '取消',
        });
        if (!ok) return;
        try {
          const r = await service.adminHzClearImported(importKind);
          await refresh();
          ui.toast(`已删除 ${r.removed} 条`, 'ok');
        } catch (err) {
          ui.toast(err.message || '操作失败', 'err');
        }
      });
    },
  };
}

/* ------------------------------------------------------------------ */
/* 需求表单                                                            */
/* ------------------------------------------------------------------ */
function openNeedForm(item, onSaved) {
  const isNew = !item;
  const n = item || { org: '', scene: '', content: '', mode: '', area: '' };
  ui.openSheet({
    title: isNew ? '新建需求' : '编辑需求',
    className: 'sheet-lg',
    content: `
      <div class="hzadm-form">
        <div class="field"><label>需求场景 <span class="req">*</span></label>
          <input class="input" id="f-scene" value="${ui.esc(n.scene || '')}" placeholder="如：基层门诊AI辅助诊断"></div>
        <div class="field"><label>需求单位</label>
          <input class="input" id="f-org" value="${ui.esc(n.org || '')}" placeholder="如：杭州市某医院"></div>
        <div class="field"><label>需求具体内容</label>
          <textarea class="textarea" id="f-content" rows="6">${ui.esc(n.content || '')}</textarea></div>
        <div class="field"><label>合作模式</label>
          <input class="input" id="f-mode" value="${ui.esc(n.mode || '')}" placeholder="如：解决方案共创、采购"></div>
        <div class="field"><label>机会区域</label>
          <input class="input" id="f-area" value="${ui.esc(n.area || '')}" placeholder="如：萧山区"></div>
        <button class="btn btn-primary btn-block" id="f-save">${isNew ? '创建' : '保存'}</button>
      </div>`,
    onMount(sheet, close) {
      sheet.querySelector('#f-save')?.addEventListener('click', async (ev) => {
        const pick = (s) => (sheet.querySelector(s)?.value || '').trim();
        const body = {
          scene: pick('#f-scene'), org: pick('#f-org'), content: pick('#f-content'),
          mode: pick('#f-mode'), area: pick('#f-area'),
        };
        if (!body.scene) return ui.toast('请填写需求场景', 'err');
        const btn = ev.currentTarget;
        btn.disabled = true;
        try {
          if (isNew) await service.adminHzNeedCreate(body);
          else await service.adminHzNeedUpdate(item.id, body);
          close();
          onSaved?.();
        } catch (err) {
          btn.disabled = false;
          ui.toast(err.message || '保存失败', 'err');
        }
      });
    },
  });
}

/* ------------------------------------------------------------------ */
/* 能力表单                                                            */
/* ------------------------------------------------------------------ */
function openCapForm(item, onSaved) {
  const isNew = !item;
  const c = item || { company: '', project: '', categoryRaw: '', ability: '', mode: '' };
  const cats = [
    ['gov', '政务与城市治理'], ['industry', '工业制造'], ['culture', '文旅与文博'],
    ['edu', '智慧教育'], ['health', '智慧康养'], ['biz', '企业数字化'],
    ['finance', '金融服务'], ['consume', '商业消费'], ['agri', '现代农业与食品安全'],
    ['other', '其他'],
  ];
  ui.openSheet({
    title: isNew ? '新建能力' : '编辑能力',
    className: 'sheet-lg',
    content: `
      <div class="hzadm-form">
        <div class="field"><label>企业名称 <span class="req">*</span></label>
          <input class="input" id="f-company" value="${ui.esc(c.company || '')}"></div>
        <div class="field"><label>项目 / 技术名称</label>
          <input class="input" id="f-project" value="${ui.esc(c.project || '')}"></div>
        <div class="field"><label>分类</label>
          <select class="input" id="f-category">
            ${cats.map(([id, name]) => `<option value="${id}" ${c.category === id ? 'selected' : ''}>${name}</option>`).join('')}
          </select></div>
        <div class="field"><label>原表场景类别</label>
          <input class="input" id="f-catraw" value="${ui.esc(c.categoryRaw || '')}"></div>
        <div class="field"><label>可提供能力的具体内容</label>
          <textarea class="textarea" id="f-ability" rows="7">${ui.esc(c.ability || '')}</textarea></div>
        <div class="field"><label>合作模式</label>
          <input class="input" id="f-mode" value="${ui.esc(c.mode || '')}"></div>
        <button class="btn btn-primary btn-block" id="f-save">${isNew ? '创建' : '保存'}</button>
      </div>`,
    onMount(sheet, close) {
      sheet.querySelector('#f-save')?.addEventListener('click', async (ev) => {
        const pick = (s) => (sheet.querySelector(s)?.value || '').trim();
        const body = {
          company: pick('#f-company'), project: pick('#f-project'),
          category: pick('#f-category'), categoryRaw: pick('#f-catraw'),
          ability: pick('#f-ability'), mode: pick('#f-mode'),
        };
        if (!body.company) return ui.toast('请填写企业名称', 'err');
        const btn = ev.currentTarget;
        btn.disabled = true;
        try {
          if (isNew) await service.adminHzCapCreate(body);
          else await service.adminHzCapUpdate(item.id, body);
          close();
          onSaved?.();
        } catch (err) {
          btn.disabled = false;
          ui.toast(err.message || '保存失败', 'err');
        }
      });
    },
  });
}

export default { renderAdminHangzhou };

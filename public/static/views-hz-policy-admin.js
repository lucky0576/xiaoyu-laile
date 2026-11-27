/**
 * 小鱼来了 — 杭州政策通 · 后台管理
 *
 * 路由：#/admin-hz-policy
 *
 * 四个标签页：
 *   抓取日志   每次自动抓取的结果（哪个站成功、抓到几条、新增几条）
 *   政策管理   26 条政策的新增/编辑/删除
 *   通知管理   通知文件的新增/编辑/删除
 *   批量导入   粘贴 JSON / TSV 批量入库
 */

import { service, store } from './api.js';
import * as ui from './ui.js';

const CAT_ICON = {
  startup: '🚀', qualify: '🏅', subsidy: '💰', rent: '🏢',
  employ: '👥', talent: '🎓', tax: '📊', other: '📌',
};

export async function renderAdminHzPolicy(ctx) {
  const me = store.user;
  if (!me || !me.isAdmin) {
    return {
      title: '政策管理',
      content: `<div class="page">${ui.emptyState('⛔', me ? '需要管理员权限' : '需要管理员登录')}</div>`,
      showBack: true,
    };
  }

  const [metaRes, polRes, notRes, logRes] = await Promise.all([
    service.hzPolicyMeta().catch(() => null),
    service.adminHzPolicyPolicies().catch(() => ({ items: [] })),
    service.adminHzPolicyNotices().catch(() => ({ items: [] })),
    service.adminHzCrawlLogs({ limit: 30 }).catch(() => ({ items: [] })),
  ]);

  const meta = metaRes || { stats: {}, categories: [] };
  const policies = polRes.items || [];
  const notices = notRes.items || [];
  const logs = logRes.items || [];
  const stats = meta.stats || {};
  const catMap = Object.fromEntries((meta.categories || []).map((c) => [c.id, c]));

  const html = `
  <div class="page hpadm-page">
    <div class="hpadm-hero">
      <div class="hpadm-hero-t">杭州政策通 · 后台管理</div>
      <div class="hpadm-hero-s">
        政策 ${stats.policies || policies.length} 条 · 通知 ${stats.notices || notices.length} 条 ·
        官网 ${stats.portals || 8} 个 · 抓取记录 ${logs.length} 次
      </div>
    </div>

    <div class="hpadm-tabs">
      <a class="hpadm-tab active" data-tab="log">抓取日志 <i>${logs.length}</i></a>
      <a class="hpadm-tab" data-tab="policy">政策管理 <i>${policies.length}</i></a>
      <a class="hpadm-tab" data-tab="notice">通知管理 <i>${notices.length}</i></a>
      <a class="hpadm-tab" data-tab="import">批量导入</a>
    </div>

    <div class="hpadm-panel" id="hpadm-log">
      <div class="hpadm-actions">
        <button class="btn btn-primary btn-sm" id="hpadm-crawl">立即抓取一次</button>
        <span class="tiny dim" id="hpadm-crawl-hint">自动抓取：每 20 小时一次（服务端定时任务）</span>
      </div>
      <div id="hpadm-log-list"></div>
    </div>

    <div class="hpadm-panel hide" id="hpadm-policy">
      <div class="hpadm-actions">
        <button class="btn btn-primary btn-sm" id="hpadm-new-policy">＋ 新建政策</button>
      </div>
      <div id="hpadm-policy-list"></div>
    </div>

    <div class="hpadm-panel hide" id="hpadm-notice">
      <div class="hpadm-actions">
        <button class="btn btn-primary btn-sm" id="hpadm-new-notice">＋ 新建通知</button>
      </div>
      <div id="hpadm-notice-list"></div>
    </div>

    <div class="hpadm-panel hide" id="hpadm-import">
      <div class="card card-pad">
        <div class="strong mb8">批量导入</div>
        <div class="hpadm-hint">
          支持 <b>TSV</b>（从 Excel 直接复制粘贴，制表符分隔）或 <b>JSON 数组</b>。
          自动去重：政策按「名称」，通知按「标题」。
        </div>
        <div class="hpadm-kind" id="hpadm-kind">
          <button class="hpadm-kind-btn active" data-kind="policies">导入政策</button>
          <button class="hpadm-kind-btn" data-kind="notices">导入通知</button>
        </div>
        <textarea class="textarea hpadm-ta" id="hpadm-text" rows="12"
          placeholder="政策 TSV 列序：名称 | 分类 | 部门 | 补贴金额 | 申报条件(用竖线分隔) | 备注&#10;通知 TSV 列序：标题 | 部门 | 日期(YYYY-MM-DD) | 链接 | 标签"></textarea>
        <div class="hpadm-import-actions">
          <button class="btn btn-primary" id="hpadm-do-import">开始导入</button>
          <button class="btn btn-sm" id="hpadm-clear">删除所有导入数据</button>
        </div>
        <div class="hpadm-result hide" id="hpadm-result"></div>
      </div>
    </div>
  </div>`;

  return {
    title: '政策管理',
    content: html,
    showBack: true,
    async mount(root) {
      /* 标签切换 */
      root.querySelector('.hpadm-tabs')?.addEventListener('click', (e) => {
        const a = e.target.closest('[data-tab]');
        if (!a) return;
        [...root.querySelectorAll('.hpadm-tab')].forEach((el) => el.classList.toggle('active', el === a));
        ['log', 'policy', 'notice', 'import'].forEach((t) => {
          root.querySelector(`#hpadm-${t}`)?.classList.toggle('hide', t !== a.dataset.tab);
        });
      });

      const logList = root.querySelector('#hpadm-log-list');
      const polList = root.querySelector('#hpadm-policy-list');
      const notList = root.querySelector('#hpadm-notice-list');

      /* ---------- 抓取日志 ---------- */
      const renderLogs = (items) => {
        if (!items.length) {
          logList.innerHTML = ui.emptyState('📜', '还没有抓取记录', '点上面的「立即抓取一次」试试');
          return;
        }
        logList.innerHTML = items
          .map((lg) => {
            const sites = lg.sites || [];
            const fails = sites.filter((s) => !s.ok);
            const okSites = sites.filter((s) => s.ok);
            const when = String(lg.at || '').replace('T', ' ').slice(0, 16);
            return `<div class="hpadm-log">
              <div class="hpadm-log-top">
                <span class="hpadm-log-when">${ui.esc(when)}</span>
                <span class="hpadm-log-trigger">${lg.trigger === 'manual' ? '手动' : '自动'}</span>
                <span class="hpadm-log-added">+${lg.added || 0} 条</span>
              </div>
              <div class="hpadm-log-meta">
                抓取 ${lg.totalPicked || 0} 条 · 成功 ${lg.okCount || 0} 站 · 失败 ${lg.failCount || 0} 站
              </div>
              <div class="hpadm-log-sites">
                ${okSites
                  .map((s) => `<span class="hpadm-site ok">${ui.esc(s.name)} ${s.picked || 0}</span>`)
                  .join('')}
                ${fails
                  .map((s) => `<span class="hpadm-site fail" title="${ui.esc(s.error || '')}">${ui.esc(s.name)} ✗</span>`)
                  .join('')}
              </div>
              ${
                fails.length
                  ? `<div class="hpadm-log-err">失败原因：${fails
                      .map((s) => `${ui.esc(s.name)} — ${ui.esc(s.error || '未知')}`)
                      .join('；')}</div>`
                  : ''
              }
            </div>`;
          })
          .join('');
      };
      renderLogs(logs);

      root.querySelector('#hpadm-crawl')?.addEventListener('click', async (ev) => {
        const btn = ev.currentTarget;
        btn.disabled = true;
        btn.textContent = '抓取中…（约 5—10 秒）';
        try {
          await service.adminHzCrawlNow();
          ui.toast('已触发，10 秒后自动刷新', 'ok');
          setTimeout(async () => {
            const r = await service.adminHzCrawlLogs({ limit: 30 }).catch(() => ({ items: [] }));
            renderLogs(r.items || []);
            btn.disabled = false;
            btn.textContent = '立即抓取一次';
          }, 10000);
        } catch (err) {
          btn.disabled = false;
          btn.textContent = '立即抓取一次';
          ui.toast(err.message || '触发失败', 'err');
        }
      });

      /* ---------- 政策列表 ---------- */
      const renderPolicies = (items) => {
        if (!items.length) {
          polList.innerHTML = ui.emptyState('📋', '还没有政策');
          return;
        }
        polList.innerHTML = items
          .map((p) => {
            const cat = catMap[p.category];
            return `<div class="hpadm-row">
              <div class="hpadm-row-main">
                <div class="hpadm-row-top">
                  <span class="hpadm-seq">${p.seq}</span>
                  <span class="hpadm-name">${ui.esc(p.name)}</span>
                  ${p.source === 'import' ? '<span class="hpadm-badge import">导入</span>' : ''}
                  ${p.enabled ? '' : '<span class="hpadm-badge off">已下架</span>'}
                </div>
                <div class="hpadm-row-meta">
                  <span>${cat ? `${cat.icon} ${cat.name}` : p.category}</span>
                  <span>${ui.esc((p.dept || '').slice(0, 20))}</span>
                  <span>${(p.conditions || []).length} 条条件</span>
                </div>
              </div>
              <div class="hpadm-row-ops">
                <button class="hpadm-op" data-act="edit-policy" data-id="${p.id}">编辑</button>
                <button class="hpadm-op danger" data-act="del-policy" data-id="${p.id}">删除</button>
              </div>
            </div>`;
          })
          .join('');
      };

      /* ---------- 通知列表 ---------- */
      const renderNotices = (items) => {
        if (!items.length) {
          notList.innerHTML = ui.emptyState('📢', '还没有通知');
          return;
        }
        notList.innerHTML = items
          .map(
            (n) => `<div class="hpadm-row">
              <div class="hpadm-row-main">
                <div class="hpadm-row-top">
                  <span class="hpadm-name">${ui.esc((n.title || '').slice(0, 60))}</span>
                  ${n.source === 'import' ? '<span class="hpadm-badge import">导入</span>' : ''}
                </div>
                <div class="hpadm-row-meta">
                  <span>${ui.esc(n.dept || '')}</span>
                  <span>${ui.esc(n.date || '')}</span>
                  <span>${ui.esc(n.tag || '')}</span>
                </div>
              </div>
              <div class="hpadm-row-ops">
                <a class="hpadm-op" href="${ui.esc(n.url || '#')}" target="_blank" rel="noopener">原文</a>
                <button class="hpadm-op danger" data-act="del-notice" data-id="${n.id}">删除</button>
              </div>
            </div>`,
          )
          .join('');
      };

      renderPolicies(policies);
      renderNotices(notices);

      const refreshPolicies = async () => {
        const r = await service.adminHzPolicyPolicies().catch(() => ({ items: [] }));
        renderPolicies(r.items || []);
      };
      const refreshNotices = async () => {
        const r = await service.adminHzPolicyNotices().catch(() => ({ items: [] }));
        renderNotices(r.items || []);
      };

      /* ---------- 行操作 ---------- */
      root.addEventListener('click', async (e) => {
        const btn = e.target.closest('[data-act]');
        if (!btn) return;
        const { act, id } = btn.dataset;

        if (act === 'edit-policy') {
          const item = (await service.adminHzPolicyPolicies().catch(() => ({ items: [] }))).items.find((x) => x.id === id);
          if (!item) return ui.toast('读取失败', 'err');
          openPolicyForm(item, async () => { await refreshPolicies(); ui.toast('已保存', 'ok'); });
          return;
        }
        if (act === 'del-policy') {
          const ok = await ui.confirmDialog({ title: '确认删除', message: '删除后前台立即不可见。', okText: '删除', cancelText: '取消' });
          if (!ok) return;
          try {
            await service.adminHzPolicyDelete(id);
            await refreshPolicies();
            ui.toast('已删除', 'ok');
          } catch (err) { ui.toast(err.message || '删除失败', 'err'); }
          return;
        }
        if (act === 'del-notice') {
          const ok = await ui.confirmDialog({ title: '确认删除', message: '删除后前台立即不可见。', okText: '删除', cancelText: '取消' });
          if (!ok) return;
          try {
            await service.adminHzNoticeDelete(id);
            await refreshNotices();
            ui.toast('已删除', 'ok');
          } catch (err) { ui.toast(err.message || '删除失败', 'err'); }
        }
      });

      root.querySelector('#hpadm-new-policy')?.addEventListener('click', () => {
        openPolicyForm(null, async () => { await refreshPolicies(); ui.toast('已创建', 'ok'); });
      });
      root.querySelector('#hpadm-new-notice')?.addEventListener('click', () => {
        openNoticeForm(null, async () => { await refreshNotices(); ui.toast('已创建', 'ok'); });
      });

      /* ---------- 导入 ---------- */
      let importKind = 'policies';
      root.querySelector('#hpadm-kind')?.addEventListener('click', (e) => {
        const b = e.target.closest('[data-kind]');
        if (!b) return;
        importKind = b.dataset.kind;
        [...root.querySelectorAll('.hpadm-kind-btn')].forEach((el) => el.classList.toggle('active', el === b));
      });

      root.querySelector('#hpadm-do-import')?.addEventListener('click', async () => {
        const text = root.querySelector('#hpadm-text')?.value || '';
        if (!text.trim()) return ui.toast('请先粘贴要导入的内容', 'err');
        const btn = root.querySelector('#hpadm-do-import');
        btn.disabled = true;
        btn.textContent = '导入中…';
        try {
          const r = await service.adminHzPolicyImport(importKind, text);
          const resEl = root.querySelector('#hpadm-result');
          resEl.classList.remove('hide');
          resEl.innerHTML = `
            <div class="hpadm-res-ok">导入完成：解析 ${r.parsed} 条，新增 <b>${r.added}</b>，跳过 ${r.skipped}（已存在），失败 ${r.failed}</div>
            ${(r.addedItems || []).length ? `<div class="hpadm-res-list"><b>新增：</b>${r.addedItems.map((x) => ui.esc(x.name)).join('、')}</div>` : ''}
            ${(r.failedItems || []).length ? `<div class="hpadm-res-fail"><b>失败：</b>${r.failedItems.map((x) => `第${x.row}行 ${ui.esc(x.reason)}`).join('；')}</div>` : ''}`;
          if (importKind === 'policies') await refreshPolicies();
          else await refreshNotices();
          ui.toast(`新增 ${r.added} 条`, 'ok');
        } catch (err) {
          ui.toast(err.message || '导入失败', 'err');
        } finally {
          btn.disabled = false;
          btn.textContent = '开始导入';
        }
      });

      root.querySelector('#hpadm-clear')?.addEventListener('click', async () => {
        const ok = await ui.confirmDialog({
          title: '删除所有导入数据',
          message: '只删通过「批量导入」进来的条目，出厂数据与抓取数据不受影响。',
          okText: '删除', cancelText: '取消',
        });
        if (!ok) return;
        try {
          const r = await service.adminHzPolicyClearImported(importKind);
          if (importKind === 'policies') await refreshPolicies();
          else await refreshNotices();
          ui.toast(`已删除 ${r.removed} 条`, 'ok');
        } catch (err) { ui.toast(err.message || '操作失败', 'err'); }
      });
    },
  };
}

/* ------------------------------------------------------------------ */
/* 政策表单                                                            */
/* ------------------------------------------------------------------ */
function openPolicyForm(item, onSaved) {
  const isNew = !item;
  const p = item || { name: '', category: 'qualify', dept: '', amount: '', note: '', conditions: [] };
  const cats = [
    ['startup', '创业扶持'], ['qualify', '企业认定'], ['subsidy', '资金补贴'],
    ['rent', '场地房租'], ['employ', '招工就业'], ['talent', '人才政策'],
    ['tax', '税收优惠'], ['other', '其他'],
  ];
  ui.openSheet({
    title: isNew ? '新建政策' : '编辑政策',
    className: 'sheet-lg',
    content: `
      <div class="hpadm-form">
        <div class="field"><label>政策名称 <span class="req">*</span></label>
          <input class="input" id="f-name" value="${ui.esc(p.name || '')}"></div>
        <div class="field"><label>分类</label>
          <select class="input" id="f-category">
            ${cats.map(([id, n]) => `<option value="${id}" ${p.category === id ? 'selected' : ''}>${n}</option>`).join('')}
          </select></div>
        <div class="field"><label>主管部门</label>
          <input class="input" id="f-dept" value="${ui.esc(p.dept || '')}"></div>
        <div class="field"><label>补贴内容</label>
          <textarea class="textarea" id="f-amount" rows="5">${ui.esc(p.amount || '')}</textarea></div>
        <div class="field"><label>申报条件（一行一条）</label>
          <textarea class="textarea" id="f-conditions" rows="7">${ui.esc((p.conditions || []).join('\n'))}</textarea></div>
        <div class="field"><label>提示</label>
          <textarea class="textarea" id="f-note" rows="3">${ui.esc(p.note || '')}</textarea></div>
        <button class="btn btn-primary btn-block" id="f-save">${isNew ? '创建' : '保存'}</button>
      </div>`,
    onMount(sheet, close) {
      sheet.querySelector('#f-save')?.addEventListener('click', async (ev) => {
        const pick = (s) => (sheet.querySelector(s)?.value || '').trim();
        const body = {
          name: pick('#f-name'),
          category: pick('#f-category'),
          dept: pick('#f-dept'),
          amount: pick('#f-amount'),
          note: pick('#f-note'),
          conditions: pick('#f-conditions').split('\n').map((x) => x.trim()).filter(Boolean),
        };
        if (!body.name) return ui.toast('请填写政策名称', 'err');
        const btn = ev.currentTarget;
        btn.disabled = true;
        try {
          if (isNew) await service.adminHzPolicyCreate(body);
          else await service.adminHzPolicyUpdate(item.id, body);
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
/* 通知表单                                                            */
/* ------------------------------------------------------------------ */
function openNoticeForm(item, onSaved) {
  const isNew = !item;
  const n = item || { title: '', dept: '', date: '', url: '', tag: '申报通知' };
  const tags = ['申报通知', '政策文件', '规范性文件', '名单公示', '名单公布', '政策解读', '其他'];
  ui.openSheet({
    title: isNew ? '新建通知' : '编辑通知',
    className: 'sheet-lg',
    content: `
      <div class="hpadm-form">
        <div class="field"><label>标题 <span class="req">*</span></label>
          <textarea class="textarea" id="f-title" rows="3">${ui.esc(n.title || '')}</textarea></div>
        <div class="field"><label>部门</label>
          <input class="input" id="f-dept" value="${ui.esc(n.dept || '')}"></div>
        <div class="field"><label>日期</label>
          <input class="input" id="f-date" value="${ui.esc(n.date || '')}" placeholder="2026-11-27"></div>
        <div class="field"><label>原文链接</label>
          <input class="input" id="f-url" value="${ui.esc(n.url || '')}"></div>
        <div class="field"><label>标签</label>
          <select class="input" id="f-tag">
            ${tags.map((t) => `<option value="${t}" ${n.tag === t ? 'selected' : ''}>${t}</option>`).join('')}
          </select></div>
        <button class="btn btn-primary btn-block" id="f-save">${isNew ? '创建' : '保存'}</button>
      </div>`,
    onMount(sheet, close) {
      sheet.querySelector('#f-save')?.addEventListener('click', async (ev) => {
        const pick = (s) => (sheet.querySelector(s)?.value || '').trim();
        const body = {
          title: pick('#f-title'), dept: pick('#f-dept'), date: pick('#f-date'),
          url: pick('#f-url'), tag: pick('#f-tag'),
        };
        if (!body.title) return ui.toast('请填写标题', 'err');
        const btn = ev.currentTarget;
        btn.disabled = true;
        try {
          if (isNew) await service.adminHzNoticeCreate(body);
          else await service.adminHzNoticeUpdate(item.id, body);
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

export default { renderAdminHzPolicy };

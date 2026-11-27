/**
 * 小鱼来了 — 浙江省政策 · 后台管理
 *
 * 路由：#/admin-zhejiang
 *
 * 为什么要有这个页面：
 *   之前 40 条政策写死在代码里，改一个字都要发版。
 *   现在政策存在数据库里，这里可以直接增删改、上下架、补当年申报通知链接。
 *
 * 三个标签页：
 *   政策管理    列表 + 新建 / 编辑 / 上下架 / 删除 / 重置
 *   申报管理    用户提交的申报，可改状态
 *   分类说明    当前分类与官方入口的对照
 */

import { service, store } from './api.js';
import * as ui from './ui.js';

const LEVEL_NAME = { national: '国家级', province: '省级', city: '市级', district: '区县级' };

export async function renderAdminZhejiang(ctx) {
  const me = store.user;
  if (!me) {
    return {
      title: '政策管理',
      content: `<div class="page">${ui.emptyState('🔒', '需要管理员登录', '请先用管理员账号登录')}</div>`,
      showBack: true,
    };
  }
  if (!me.isAdmin) {
    return {
      title: '政策管理',
      content: `<div class="page">${ui.emptyState('⛔', '需要管理员权限', '当前账号不是管理员')}</div>`,
      showBack: true,
    };
  }

  const [meta, listRes, appRes] = await Promise.all([
    service.zhejiangMeta().catch(() => null),
    service.adminZhejiangPolicies().catch(() => ({ items: [], total: 0 })),
    service.adminZhejiangApplications().catch(() => ({ items: [], total: 0 })),
  ]);

  const cats = (meta && meta.categories) || [];
  const catMap = Object.fromEntries(cats.map((c) => [c.id, c]));
  const levels = (meta && meta.levels) || [];
  const policies = listRes.items || [];
  const apps = appRes.items || [];

  const html = `
  <div class="page zjadm-page">
    <div class="zjadm-hero">
      <div class="zjadm-hero-t">浙江省政策 · 后台管理</div>
      <div class="zjadm-hero-s">
        共 ${policies.length} 条政策 · ${apps.length} 条申报。修改即时生效，无需发版。
      </div>
    </div>

    <div class="zjadm-tabs">
      <a class="zjadm-tab active" data-tab="policies">政策管理 <i>${policies.length}</i></a>
      <a class="zjadm-tab" data-tab="apps">申报管理 <i>${apps.length}</i></a>
      <a class="zjadm-tab" data-tab="info">分类说明</a>
    </div>

    <div class="zjadm-panel" id="zjadm-panel-policies">
      <div class="zjadm-actions">
        <button class="btn btn-primary btn-sm" id="zjadm-new">＋ 新建政策</button>
        <button class="btn btn-sm" id="zjadm-reset">恢复出厂数据</button>
      </div>
      <div id="zjadm-list"></div>
    </div>

    <div class="zjadm-panel hide" id="zjadm-panel-apps">
      <div id="zjadm-apps"></div>
    </div>

    <div class="zjadm-panel hide" id="zjadm-panel-info">
      <div class="card card-pad">
        <div class="strong mb8">分类</div>
        ${cats
          .map(
            (c) =>
              `<div class="zjadm-kv"><span>${c.icon || ''} ${ui.esc(c.name)}</span><b>${((meta?.stats?.byCategory || {})[c.id]) || 0} 条</b></div>`,
          )
          .join('')}
      </div>
      <div class="card card-pad mt12">
        <div class="strong mb8">层级</div>
        ${levels
          .map(
            (l) =>
              `<div class="zjadm-kv"><span>${ui.esc(l.name)}</span><b>${((meta?.stats?.byLevel || {})[l.id]) || 0} 条</b></div>`,
          )
          .join('')}
      </div>
      <div class="card card-pad mt12">
        <div class="strong mb8">官方申报入口</div>
        ${Object.values(meta?.portals || {})
          .map(
            (p) =>
              `<div class="zjadm-kv"><span>${ui.esc(p.name)}</span><a href="${ui.esc(p.url)}" target="_blank" rel="noopener" class="zjadm-link">打开 ↗</a></div>`,
          )
          .join('')}
      </div>
    </div>
  </div>`;

  return {
    title: '政策管理',
    content: html,
    showBack: true,
    async mount(root) {
      /* 标签切换 */
      root.querySelector('.zjadm-tabs')?.addEventListener('click', (e) => {
        const a = e.target.closest('[data-tab]');
        if (!a) return;
        [...root.querySelectorAll('.zjadm-tab')].forEach((el) => el.classList.toggle('active', el === a));
        ['policies', 'apps', 'info'].forEach((t) => {
          root.querySelector(`#zjadm-panel-${t}`)?.classList.toggle('hide', t !== a.dataset.tab);
        });
      });

      const listEl = root.querySelector('#zjadm-list');
      const appsEl = root.querySelector('#zjadm-apps');

      /* -------- 政策列表 -------- */
      const renderPolicies = (items) => {
        if (!items.length) {
          listEl.innerHTML = ui.emptyState('📋', '还没有政策', '点上面的「新建政策」添加');
          return;
        }
        listEl.innerHTML = items
          .map((p) => {
            const cat = catMap[p.category];
            return `<div class="zjadm-row ${p.enabled ? '' : 'off'}">
              <div class="zjadm-row-main">
                <div class="zjadm-row-top">
                  <span class="zjadm-seq">${p.seq}</span>
                  <span class="zjadm-name">${ui.esc(p.name)}</span>
                  ${p.enabled ? '' : '<span class="zjadm-off">已下架</span>'}
                  ${p.hasNotice ? '<span class="zjadm-notice">有通知</span>' : ''}
                </div>
                <div class="zjadm-row-meta">
                  <span>${cat ? `${cat.icon} ${cat.name}` : p.category}</span>
                  <span>${ui.esc(LEVEL_NAME[p.level] || p.level)}</span>
                  <span>${ui.esc(p.dept || '')}</span>
                </div>
              </div>
              <div class="zjadm-row-ops">
                <button class="zjadm-op" data-act="edit" data-id="${p.id}">编辑</button>
                <button class="zjadm-op" data-act="toggle" data-id="${p.id}" data-enabled="${p.enabled ? '1' : '0'}">${p.enabled ? '下架' : '上架'}</button>
                <button class="zjadm-op danger" data-act="del" data-id="${p.id}">删除</button>
              </div>
            </div>`;
          })
          .join('');
      };

      renderPolicies(policies);

      /* -------- 申报列表 -------- */
      const renderApps = (items) => {
        if (!items.length) {
          appsEl.innerHTML = ui.emptyState('📮', '还没有申报记录', '用户提交后会出现在这里');
          return;
        }
        appsEl.innerHTML = items
          .map(
            (a) => `<div class="zjadm-app">
              <div class="zjadm-app-top">
                <span class="zjadm-app-name">${ui.esc(a.policyName)}</span>
                <span class="zjadm-app-status">${ui.esc(a.statusName)}</span>
              </div>
              <div class="zjadm-app-meta">
                <span>${ui.esc(a.companyName || '—')}</span>
                <span>${ui.esc(a.contactName || '')} ${ui.esc(a.contactPhone || '')}</span>
                <span>${ui.fmtRelative(a.createdAt)}</span>
              </div>
              ${a.note ? `<div class="zjadm-app-note">${ui.esc(a.note)}</div>` : ''}
            </div>`,
          )
          .join('');
      };
      renderApps(apps);

      /* -------- 操作 -------- */
      const refreshPolicies = async () => {
        const r = await service.adminZhejiangPolicies().catch(() => ({ items: [] }));
        renderPolicies(r.items || []);
      };

      listEl.addEventListener('click', async (e) => {
        const btn = e.target.closest('[data-act]');
        if (!btn) return;
        const { act, id } = btn.dataset;

        if (act === 'edit') {
          const r = await service.adminZhejiangPolicy(id).catch(() => null);
          if (!r?.policy) return ui.toast('读取失败', 'err');
          openPolicyForm(r.policy, async () => {
            await refreshPolicies();
            ui.toast('已保存', 'ok');
          });
          return;
        }

        if (act === 'toggle') {
          const want = btn.dataset.enabled !== '1';
          try {
            await service.adminZhejiangToggle(id, want);
            await refreshPolicies();
            ui.toast(want ? '已上架' : '已下架', 'ok');
          } catch (err) {
            ui.toast(err.message || '操作失败', 'err');
          }
          return;
        }

        if (act === 'del') {
          const ok = await ui.confirmDialog({
            title: '确认删除',
            message: '删除后前台立即不可见。如果是误删，可以用「恢复出厂数据」找回初始 40 条（但后台改过的内容会丢失）。',
            okText: '删除',
            cancelText: '取消',
          });
          if (!ok) return;
          try {
            await service.adminZhejiangDelete(id);
            await refreshPolicies();
            ui.toast('已删除', 'ok');
          } catch (err) {
            ui.toast(err.message || '删除失败', 'err');
          }
        }
      });

      root.querySelector('#zjadm-new')?.addEventListener('click', () => {
        openPolicyForm(null, async () => {
          await refreshPolicies();
          ui.toast('已创建', 'ok');
        });
      });

      root.querySelector('#zjadm-reset')?.addEventListener('click', async () => {
        const ok = await ui.confirmDialog({
          title: '恢复出厂数据',
          message: '会删除所有后台新增/修改的政策，恢复为代码里的初始 40 条。确定吗？',
          okText: '确定恢复',
          cancelText: '取消',
        });
        if (!ok) return;
        try {
          const r = await service.adminZhejiangReset();
          await refreshPolicies();
          ui.toast(`已恢复 ${r.restored} 条`, 'ok');
        } catch (err) {
          ui.toast(err.message || '恢复失败', 'err');
        }
      });
    },
  };
}

/* ------------------------------------------------------------------ */
/* 政策编辑表单                                                        */
/* ------------------------------------------------------------------ */
function openPolicyForm(policy, onSaved) {
  const isNew = !policy;
  const p = policy || {
    name: '',
    dept: '',
    cycle: '',
    category: 'qualify',
    level: 'province',
    amount: '',
    policy: '',
    materials: '',
    portalUrl: 'https://www.zjzwfw.gov.cn',
    portalName: '浙江政务服务网',
    noticeUrl: '',
    seq: '',
  };

  const content = `
    <div class="zjadm-form">
      <div class="field"><label>政策名称 <span class="req">*</span></label>
        <input class="input" id="f-name" value="${ui.esc(p.name)}" placeholder="如：浙江省科技型中小企业"></div>
      <div class="field zjadm-2col">
        <div><label>主管部门</label><input class="input" id="f-dept" value="${ui.esc(p.dept || '')}" placeholder="如：区经信科技局"></div>
        <div><label>序号</label><input class="input" id="f-seq" type="number" value="${p.seq || ''}" placeholder="留空自动"></div>
      </div>
      <div class="field zjadm-2col">
        <div><label>分类</label>
          <select class="input" id="f-category">
            ${['talent','qualify','rnd','project','tech','smart','ip','certify','carrier','other']
              .map((c) => `<option value="${c}" ${p.category === c ? 'selected' : ''}>${c}</option>`)
              .join('')}
          </select></div>
        <div><label>层级</label>
          <select class="input" id="f-level">
            ${['national','province','city','district']
              .map((l) => `<option value="${l}" ${p.level === l ? 'selected' : ''}>${LEVEL_NAME[l]}</option>`)
              .join('')}
          </select></div>
      </div>
      <div class="field"><label>申报周期</label>
        <input class="input" id="f-cycle" value="${ui.esc(p.cycle || '')}" placeholder="如：每年1-3月、9-11月"></div>
      <div class="field"><label>官方申报入口</label>
        <input class="input" id="f-portalName" value="${ui.esc(p.portalName || '')}" placeholder="如：浙江省科学技术厅">
        <input class="input mt6" id="f-portalUrl" value="${ui.esc(p.portalUrl || '')}" placeholder="https://…"></div>
      <div class="field"><label>本年申报通知链接（可选）</label>
        <input class="input" id="f-noticeUrl" value="${ui.esc(p.noticeUrl || '')}" placeholder="https://… 填了详情页会显示「查看申报通知」"></div>
      <div class="field"><label>预估补贴金额</label>
        <textarea class="textarea" id="f-amount" rows="4">${ui.esc(p.amount || '')}</textarea></div>
      <div class="field"><label>申报条件 / 政策文件</label>
        <textarea class="textarea" id="f-policy" rows="8">${ui.esc(p.policy || '')}</textarea></div>
      <div class="field"><label>申报材料</label>
        <textarea class="textarea" id="f-materials" rows="5">${ui.esc(p.materials || '')}</textarea></div>

      <button class="btn btn-primary btn-block" id="f-save">${isNew ? '创建政策' : '保存修改'}</button>
    </div>`;

  ui.openSheet({
    title: isNew ? '新建政策' : '编辑政策',
    content,
    className: 'sheet-lg',
    onMount(sheet, close) {
      sheet.querySelector('#f-save')?.addEventListener('click', async (ev) => {
        const pick = (sel) => (sheet.querySelector(sel)?.value || '').trim();
        const body = {
          name: pick('#f-name'),
          dept: pick('#f-dept'),
          cycle: pick('#f-cycle'),
          category: pick('#f-category'),
          level: pick('#f-level'),
          amount: pick('#f-amount'),
          policy: pick('#f-policy'),
          materials: pick('#f-materials'),
          portalName: pick('#f-portalName'),
          portalUrl: pick('#f-portalUrl'),
          noticeUrl: pick('#f-noticeUrl'),
        };
        const seqRaw = pick('#f-seq');
        if (seqRaw) body.seq = Number(seqRaw);

        if (!body.name) return ui.toast('请填写政策名称', 'err');

        const btn = ev.currentTarget;
        btn.disabled = true;
        btn.textContent = '保存中…';
        try {
          if (isNew) await service.adminZhejiangCreate(body);
          else await service.adminZhejiangUpdate(policy.id, body);
          close();
          onSaved?.();
        } catch (err) {
          btn.disabled = false;
          btn.textContent = isNew ? '创建政策' : '保存修改';
          ui.toast(err.message || '保存失败', 'err');
        }
      });
    },
  });
}

export default { renderAdminZhejiang };

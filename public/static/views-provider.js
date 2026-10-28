/**
 * 小鱼来了 — 成为服务商
 *
 * 路由：#/provider          入驻申请 + 我的状态
 *       #/provider?tab=list  直接看服务商名录
 *       #/providers          服务商名录
 */

import { service, isLoggedIn } from './api.js';
import * as ui from './ui.js';

const STATUS_CLASS = { pending: 'warn', approved: 'accent', rejected: 'gray' };

export async function renderProvider(ctx, params) {
  const tab = params?.tab === 'list' ? 'list' : 'apply';

  const [metaRes, meRes] = await Promise.all([
    service.providerMeta().catch(() => null),
    isLoggedIn() ? service.myProvider().catch(() => ({ application: null })) : Promise.resolve({ application: null }),
  ]);
  const meta = metaRes || { types: [], regions: [], total: 0, byType: {} };
  const app = meRes?.application || null;

  const listRes = tab === 'list'
    ? await service.providers({ pageSize: 20 }).catch(() => ({ items: [], total: 0 }))
    : { items: [], total: 0 };

  const typesHtml = (app?.serviceTypeIds || []).length
    ? app.serviceTypeIds
    : [];

  const formHtml = `
    <div class="card card-pad mt12">
      <div class="strong mb8">入驻申请</div>
      <div class="step-hint mb12">
        成为服务商后，你的公司会出现在「服务商名录」里，项目方可以直接检索到你并对接。
        平台不收入驻费，审核通过后即可展示。
      </div>

      <div class="field">
        <label>公司全称 <span class="tiny dim">（必填）</span></label>
        <input class="input" id="sp-company" maxlength="60" placeholder="如：山东某某电力工程有限公司" value="${ui.esc(app?.companyName || '')}">
      </div>
      <div class="field">
        <label>简称 <span class="tiny dim">（选填，用于列表展示）</span></label>
        <input class="input" id="sp-short" maxlength="20" placeholder="如：某某电力" value="${ui.esc(app?.shortName || '')}">
      </div>
      <div class="field">
        <label>统一社会信用代码 <span class="tiny dim">（选填）</span></label>
        <input class="input" id="sp-credit" maxlength="30" placeholder="18 位" value="${ui.esc(app?.creditCode || '')}">
      </div>

      <div class="field">
        <label>服务商种类 <span class="tiny dim">（必选，单选）</span></label>
        <div class="chips" id="sp-kinds">
          ${(meta.kinds || []).map((k) => `<a class="chip ${app?.kind === k.id ? 'active' : ''}" data-kind="${ui.esc(k.id)}">${ui.esc(k.name)}</a>`).join('')}
        </div>
        <div class="chips mt8 hide" id="sp-kind-subs"></div>
      </div>

      <div class="field">
        <label>服务类型 <span class="tiny dim">（可多选，至少一个）</span></label>
        <div class="chips" id="sp-types">
          ${(meta.types || []).map((t) => `<a class="chip ${typesHtml.includes(t.id) ? 'active' : ''}" data-type="${ui.esc(t.id)}">${ui.esc(t.name)}</a>`).join('')}
        </div>
        <div class="chips mt8 hide" id="sp-type-subs"></div>
      </div>

      <div class="field">
        <label>服务区域 <span class="tiny dim">（可多选，默认全国）</span></label>
        <div class="chips" id="sp-regions">
          ${(meta.regions || []).map((r) => `<a class="chip ${(app?.regions || ['全国']).includes(r) ? 'active' : ''}" data-region="${ui.esc(r)}">${ui.esc(r)}</a>`).join('')}
        </div>
      </div>

      <div class="field">
        <label>公司简介 <span class="tiny dim">（选填）</span></label>
        <textarea class="textarea" id="sp-intro" rows="3" maxlength="1000" placeholder="主营业务、核心能力、擅长领域">${ui.esc(app?.intro || '')}</textarea>
      </div>

      <div class="field">
        <label>代表案例 <span class="tiny dim">（选填，越具体越容易被选中）</span></label>
        <textarea class="textarea" id="sp-cases" rows="3" maxlength="2000" placeholder="如：2025 年 山东东营 200MW 渔光互补 EPC 总包，合同额 8.6 亿，14 个月并网">${ui.esc(app?.cases || '')}</textarea>
      </div>

      <div class="field">
        <label>资质证书 <span class="tiny dim">（选填）</span></label>
        <textarea class="textarea" id="sp-quals" rows="2" maxlength="1000" placeholder="如：电力工程施工总承包一级、承装（修、试）二级">${ui.esc(app?.qualifications || '')}</textarea>
      </div>

      <div class="row gap8">
        <div class="field grow">
          <label>成立年份</label>
          <input class="input" id="sp-year" maxlength="8" placeholder="2015" value="${ui.esc(app?.establishedYear || '')}">
        </div>
        <div class="field grow">
          <label>员工规模</label>
          <input class="input" id="sp-staff" maxlength="20" placeholder="如：120 人" value="${ui.esc(app?.staffCount || '')}">
        </div>
      </div>

      <div class="row gap8">
        <div class="field grow">
          <label>联系人 <span class="tiny dim">（必填）</span></label>
          <input class="input" id="sp-cname" maxlength="20" placeholder="张三" value="${ui.esc(app?.contactName || '')}">
        </div>
        <div class="field grow">
          <label>手机号 <span class="tiny dim">（必填）</span></label>
          <input class="input" id="sp-cphone" maxlength="11" placeholder="13800138000" value="${ui.esc(app?.contactPhone || '')}">
        </div>
      </div>

      <div class="field">
        <label>官网 / 公众号 <span class="tiny dim">（选填）</span></label>
        <input class="input" id="sp-web" maxlength="120" placeholder="https://" value="${ui.esc(app?.website || '')}">
      </div>

      <button class="btn btn-primary btn-block mt16" id="sp-submit" style="height:46px">
        ${app ? '更新申请' : '提交入驻申请'}
      </button>
      <div class="tiny dim center mt8" id="sp-status"></div>
    </div>`;

  const statusHtml = app ? `<div class="card card-pad mt12">
    <div class="row between mb8">
      <div class="strong">入驻状态</div>
      <span class="badge ${STATUS_CLASS[app.status] || 'gray'}">${ui.esc(app.statusName)}</span>
    </div>
    <div class="kv-table">
      <div class="kv"><span class="k">公司</span><span class="v">${ui.esc(app.companyName)}</span></div>
      <div class="kv"><span class="k">种类</span><span class="v">${ui.esc(app.kindName || '—')}</span></div>
          <div class="kv"><span class="k">服务类型</span><span class="v">${ui.esc((app.serviceTypes || []).join(' / ') || '—')}</span></div>
      <div class="kv"><span class="k">服务区域</span><span class="v">${ui.esc((app.regions || []).join(' / ') || '—')}</span></div>
      <div class="kv"><span class="k">提交时间</span><span class="v">${ui.esc(ui.fmtDate(app.createdAt, true))}</span></div>
      ${app.reviewedAt ? `<div class="kv"><span class="k">审核时间</span><span class="v">${ui.esc(ui.fmtDate(app.reviewedAt, true))}</span></div>` : ''}
    </div>
    ${app.status === 'rejected' && app.reviewNote ? `<div class="warn-note mt12">审核意见：${ui.esc(app.reviewNote)}<br>修改后重新提交即可。</div>` : ''}
    ${app.status === 'pending' ? '<div class="tiny dim mt12">平台会在 1 个工作日内审核，通过后会收到站内通知。</div>' : ''}
    ${app.status === 'approved' ? '<div class="file-unlocked-tip mt12">✅ 已通过审核，你的公司已进入服务商名录</div>' : ''}
  </div>` : '';

  const listHtml = tab === 'list' ? `<div class="card card-pad mt12" id="sp-list-card">
    <div class="row between mb8">
      <div class="strong">服务商名录</div>
      <span class="tiny dim">共 ${listRes.total || 0} 家</span>
    </div>
    <input class="input mb12" id="sp-q" placeholder="搜索公司名 / 业务 / 案例">
    <div class="chips scroll mb12" id="sp-filter-kind">
      <a class="chip active" data-k="">全部种类</a>
      ${(meta.kinds || []).map((k) => `<a class="chip" data-k="${ui.esc(k.id)}">${ui.esc(k.name)}</a>`).join('')}
    </div>
    <div class="chips scroll mb12" id="sp-filter-type">
      <a class="chip active" data-t="">全部类型</a>
      ${(meta.types || []).map((t) => `<a class="chip" data-t="${ui.esc(t.id)}">${ui.esc(t.name)}</a>`).join('')}
    </div>
    <div id="sp-list">${providerListHtml(listRes.items || [])}</div>
  </div>` : '';

  const html = `<div class="page">
    <div class="sp-hero">
      <div class="sp-hero-t">🤝 成为服务商</div>
      <div class="sp-hero-s">
        已入驻 <b>${meta.total || 0}</b> 家 · EPC · 设计 · 施工 · 设备 · 运维 · 咨询<br>
        免费入驻，审核通过后进入服务商名录，项目方可直接找到你。
      </div>
      <div class="chips mt12">
        <a class="chip ${tab === 'apply' ? 'active' : ''}" href="#/provider">入驻申请</a>
        <a class="chip ${tab === 'list' ? 'active' : ''}" href="#/provider?tab=list">服务商名录</a>
      </div>
    </div>

    ${statusHtml}
    ${tab === 'apply' ? formHtml : ''}
    ${listHtml}
  </div>`;

  return {
    title: '成为服务商',
    content: html,
    showBack: true,
    activeTab: 'home',
    mount(root) {
      const $ = (s) => root.querySelector(s);

      /* ---------- 申请表单 ---------- */
      if ($('#sp-submit')) {
        const picked = {
          types: new Set(typesHtml),
          kind: app?.kind || '',
          kindSub: app?.kindSub || '',
          typeSubs: { ...(app?.typeSubs || {}) },
          regions: new Set(app?.regions || ['全国']),
        };
        const syncChips = (host, set, attr) => {
          host.querySelectorAll('.chip').forEach((c) =>
            c.classList.toggle('active', set.has(c.dataset[attr])),
          );
        };

        /* ---------- 种类：单选 + 子类型 ---------- */
        const kindSubBox = $('#sp-kind-subs');
        const renderKindSubs = () => {
          if (!kindSubBox) return;
          const def = (meta.kinds || []).find((k) => k.id === picked.kind);
          const subs = def?.subs || [];
          if (!subs.length) {
            kindSubBox.classList.add('hide');
            kindSubBox.innerHTML = '';
            return;
          }
          kindSubBox.classList.remove('hide');
          kindSubBox.innerHTML =
            `<span class="tiny dim" style="align-self:center;margin-right:2px">${ui.esc(def.name)}：</span>` +
            subs.map((x) => `<a class="chip ${picked.kindSub === x.id ? 'active' : ''}" data-ksub="${ui.esc(x.id)}">${ui.esc(x.name)}</a>`).join('');
          kindSubBox.querySelectorAll('[data-ksub]').forEach((c) =>
            c.addEventListener('click', (e) => {
              e.preventDefault();
              picked.kindSub = c.dataset.ksub;
              renderKindSubs();
            }),
          );
        };
        $('#sp-kinds')?.querySelectorAll('.chip').forEach((chip) =>
          chip.addEventListener('click', (e) => {
            e.preventDefault();
            picked.kind = chip.dataset.kind;
            picked.kindSub = '';
            syncChips($('#sp-kinds'), new Set([picked.kind]), 'kind');
            renderKindSubs();
          }),
        );
        renderKindSubs();

        /* ---------- 类型：多选 + 子类型 ---------- */
        const typeSubBox = $('#sp-type-subs');
        const renderTypeSubs = () => {
          if (!typeSubBox) return;
          const withSubs = [...picked.types]
            .map((id) => (meta.types || []).find((t) => t.id === id))
            .filter((t) => t && (t.subs || []).length);
          if (!withSubs.length) {
            typeSubBox.classList.add('hide');
            typeSubBox.innerHTML = '';
            return;
          }
          typeSubBox.classList.remove('hide');
          typeSubBox.innerHTML = withSubs
            .map((t) => `<div class="tsub-row">
              <span class="tiny dim">${ui.esc(t.name)}：</span>
              ${t.subs.map((x) => `<a class="chip ${picked.typeSubs[t.id] === x.id ? 'active' : ''}" data-tsub="${ui.esc(t.id)}|${ui.esc(x.id)}">${ui.esc(x.name)}</a>`).join('')}
            </div>`)
            .join('');
          typeSubBox.querySelectorAll('[data-tsub]').forEach((c) =>
            c.addEventListener('click', (e) => {
              e.preventDefault();
              const [tid, sid] = (c.dataset.tsub || '').split('|');
              picked.typeSubs[tid] = sid;
              renderTypeSubs();
            }),
          );
        };
        $('#sp-types').querySelectorAll('.chip').forEach((chip) =>
          chip.addEventListener('click', (e) => {
            e.preventDefault();
            const id = chip.dataset.type;
            if (picked.types.has(id)) {
              picked.types.delete(id);
              delete picked.typeSubs[id];
            } else {
              picked.types.add(id);
            }
            syncChips($('#sp-types'), picked.types, 'type');
            renderTypeSubs();
          }),
        );
        renderTypeSubs();

        $('#sp-regions').querySelectorAll('.chip').forEach((chip) =>
          chip.addEventListener('click', (e) => {
            e.preventDefault();
            const r = chip.dataset.region;
            if (picked.regions.has(r)) picked.regions.delete(r);
            else picked.regions.add(r);
            syncChips($('#sp-regions'), picked.regions, 'region');
          }),
        );

        $('#sp-submit').addEventListener('click', async (e) => {
          const btn = e.currentTarget;
          const st = $('#sp-status');
          const companyName = ($('#sp-company').value || '').trim();
          const contactName = ($('#sp-cname').value || '').trim();
          const contactPhone = ($('#sp-cphone').value || '').trim();

          if (!companyName) return ui.toast('请填写公司全称', 'err');
          if (!picked.kind) return ui.toast('请选择服务商种类', 'err');
          const kindDef = (meta.kinds || []).find((k) => k.id === picked.kind);
          if ((kindDef?.subs || []).length && !picked.kindSub) {
            return ui.toast(`请选择${kindDef.name}的具体类型`, 'err');
          }
          if (!picked.types.size) return ui.toast('请至少选择一个服务类型', 'err');
          /* 带子类型的服务类型必须选子类型 */
          for (const tid of picked.types) {
            const t = (meta.types || []).find((x) => x.id === tid);
            if ((t?.subs || []).length && !picked.typeSubs[tid]) {
              return ui.toast(`请选择「${t.name}」的具体类型`, 'err');
            }
          }
          if (!contactName) return ui.toast('请填写联系人', 'err');
          if (!/^\d{11}$/.test(contactPhone)) return ui.toast('请填写 11 位手机号', 'err');

          btn.disabled = true;
          btn.textContent = '提交中…';
          try {
            await service.providerApply({
              companyName,
              shortName: ($('#sp-short').value || '').trim(),
              creditCode: ($('#sp-credit').value || '').trim(),
              kind: picked.kind,
              kindSub: picked.kindSub,
              typeSubs: { ...picked.typeSubs },
              serviceTypes: [...picked.types],
              regions: [...picked.regions],
              intro: ($('#sp-intro').value || '').trim(),
              cases: ($('#sp-cases').value || '').trim(),
              qualifications: ($('#sp-quals').value || '').trim(),
              establishedYear: ($('#sp-year').value || '').trim(),
              staffCount: ($('#sp-staff').value || '').trim(),
              contactName,
              contactPhone,
              website: ($('#sp-web').value || '').trim(),
            });
            ui.toast('已提交，等待平台审核', 'ok');
            ctx.nav('#/provider', { replace: true });
          } catch (err) {
            ui.toast(err.message || '提交失败', 'err');
            btn.disabled = false;
            btn.textContent = app ? '更新申请' : '提交入驻申请';
          }
        });
      }

      /* ---------- 名录筛选 ---------- */
      if ($('#sp-list-card')) {
        let keyword = '';
        let typeFilter = '';
        let kindFilter = '';
        let timer = null;

        const reload = async () => {
          const box = $('#sp-list');
          if (box) box.innerHTML = '<div class="tiny dim center" style="padding:20px">加载中…</div>';
          try {
            const r = await service.providers({ q: keyword, serviceType: typeFilter, kind: kindFilter, pageSize: 20 });
            if (box) box.innerHTML = providerListHtml(r.items || []);
          } catch {
            if (box) box.innerHTML = '<div class="tiny dim center" style="padding:20px">加载失败</div>';
          }
        };

        $('#sp-q').addEventListener('input', (e) => {
          keyword = e.target.value.trim();
          clearTimeout(timer);
          timer = setTimeout(reload, 350);
        });

        $('#sp-filter-kind')?.querySelectorAll('.chip').forEach((chip) =>
          chip.addEventListener('click', (e) => {
            e.preventDefault();
            kindFilter = chip.dataset.k || '';
            $('#sp-filter-kind').querySelectorAll('.chip').forEach((c) => c.classList.toggle('active', c === chip));
            reload();
          }),
        );

        $('#sp-filter-type').querySelectorAll('.chip').forEach((chip) =>
          chip.addEventListener('click', (e) => {
            e.preventDefault();
            typeFilter = chip.dataset.t || '';
            $('#sp-filter-type').querySelectorAll('.chip').forEach((c) => c.classList.toggle('active', c === chip));
            reload();
          }),
        );
      }
    },
  };
}

function providerListHtml(items) {
  if (!items.length) {
    return '<div class="tiny dim center" style="padding:24px">还没有符合条件的服务商</div>';
  }
  return items
    .map(
      (p) => `<a class="sp-item" href="#/provider/${ui.esc(p.id)}">
        <div class="sp-logo">${ui.esc(ui.initials(p.shortName || p.companyName))}</div>
        <div class="sp-body">
          <div class="sp-name">${ui.esc(p.companyName)}</div>
          <div class="sp-tags">
            ${(p.serviceTypes || []).map((t) => `<span class="sp-tag">${ui.esc(t)}</span>`).join('')}
            ${(p.regions || []).slice(0, 2).map((r) => `<span class="sp-tag gray">${ui.esc(r)}</span>`).join('')}
          </div>
          ${p.intro ? `<div class="sp-intro">${ui.esc(p.intro)}</div>` : ''}
          ${p.contactName ? `<div class="sp-contact">${ui.esc(p.contactName)}${p.contactPhone ? ` · ${ui.esc(p.contactPhone)}` : ''}</div>` : ''}
        </div>
        <span class="sp-go">›</span>
      </a>`,
    )
    .join('');
}

/* ================================================================== */
/* 服务商详情                                                          */
/* ================================================================== */

export async function renderProviderDetail(ctx, params) {
  const id = params?.id || '';
  const res = await service.provider(id).catch(() => null);
  const p = res?.provider || null;

  if (!p) {
    return {
      title: '服务商详情',
      showBack: true,
      content: `<div class="page"><div class="empty">服务商不存在或未通过审核</div>
        <div class="center mt12"><a class="btn btn-outline" href="#/provider?tab=list">返回服务商名录</a></div>
      </div>`,
    };
  }

  const initials = ui.initials(p.shortName || p.companyName);
  const tags = (p.serviceTypes || []).map((t) => `<span class="sp-tag">${ui.esc(t)}</span>`).join('');
  const regions = (p.regions || []).map((r) => `<span class="sp-tag gray">${ui.esc(r)}</span>`).join('');

  const kv = (k, v) => (v ? `<div class="kv"><span class="k">${ui.esc(k)}</span><span class="v">${ui.esc(String(v))}</span></div>` : '');

  return {
    title: p.shortName || p.companyName || '服务商详情',
    showBack: true,
    content: `<div class="page spd-page">
      <div class="spd-hero">
        <div class="spd-logo">${ui.esc(initials)}</div>
        <div class="spd-head">
          <div class="spd-name">${ui.esc(p.companyName || '')}</div>
          ${p.kindName ? `<div class="spd-kind">${ui.esc(p.kindName)}</div>` : ''}
        </div>
      </div>

      <div class="card card-pad mt12">
        <div class="sp-tags mb12">${tags}${regions}</div>
        ${p.intro ? `<div class="spd-intro">${ui.esc(p.intro)}</div>` : ''}
      </div>

      ${
        p.cases
          ? `<div class="card card-pad mt12">
              <div class="spd-sec-t">代表案例</div>
              <div class="spd-body">${ui.esc(p.cases)}</div>
            </div>`
          : ''
      }

      ${
        p.qualifications
          ? `<div class="card card-pad mt12">
              <div class="spd-sec-t">资质证书</div>
              <div class="spd-body">${ui.esc(p.qualifications)}</div>
            </div>`
          : ''
      }

      <div class="card card-pad mt12">
        <div class="spd-sec-t">基本信息</div>
        ${kv('种类', p.kindName)}
        ${kv('服务类型', (p.serviceTypes || []).join(' / '))}
        ${kv('服务区域', (p.regions || []).join(' / '))}
        ${kv('成立年份', p.establishedYear)}
        ${kv('人员规模', p.staffCount)}
        ${kv('官网', p.website)}
        ${kv('浏览量', p.viewCount ? `${p.viewCount} 次` : '')}
      </div>

      ${
        p.contactName || p.contactPhone
          ? `<div class="card card-pad mt12">
              <div class="spd-sec-t">联系方式</div>
              <div class="kv"><span class="k">联系人</span><span class="v">${ui.esc(p.contactName || '—')}</span></div>
              ${p.contactPhone ? `<div class="kv"><span class="k">电话</span><span class="v mono">${ui.esc(p.contactPhone)}</span></div>` : ''}
              ${p.contactEmail ? `<div class="kv"><span class="k">邮箱</span><span class="v">${ui.esc(p.contactEmail)}</span></div>` : ''}
            </div>`
          : ''
      }

      <button class="btn btn-primary btn-block mt16" id="spd-contact" type="button">📮 联系这家服务商</button>
      <div class="tiny dim center mt8">通过平台留言，管理员会协助对接</div>
    </div>`,
    mount(root) {
      root.querySelector('#spd-contact')?.addEventListener('click', () => {
        const q = encodeURIComponent(`想联系服务商：${p.companyName || ''}`);
        ctx.nav(`#/contact-us?topic=consult&about=${q}`);
      });
    },
  };
}

/* ================================================================== */
/* 管理端：服务商审核                                                  */
/* ================================================================== */
export async function renderAdminProviders(ctx, params) {
  if (!isLoggedIn()) {
    ctx.nav('#/login?redirect=%23/admin-providers');
    return { title: '服务商审核', content: '<div class="page"></div>' };
  }
  if (!ctx.state.user?.isAdmin) {
    await ctx.refreshMe?.().catch(() => null);
  }
  if (!ctx.state.user?.isAdmin) {
    return { title: '服务商审核', content: ui.emptyState('🔒', '需要管理员权限'), showBack: true };
  }

  const status = params?.status || 'pending';
  const res = await service.adminProviders({ status, pageSize: 50 }).catch(() => null);
  if (!res) {
    return { title: '服务商审核', content: ui.emptyState('⚠️', '加载失败'), showBack: true };
  }

  const items = res.items || [];
  const itemHtml = (p) => `<div class="card card-pad mb12" data-sp="${ui.esc(p.id)}">
    <div class="row between">
      <div class="strong">${ui.esc(p.companyName)}</div>
      <span class="badge ${STATUS_CLASS[p.status] || 'gray'}">${ui.esc(p.statusName)}</span>
    </div>
    <div class="sp-tags mt8">
      ${(p.serviceTypes || []).map((t) => `<span class="sp-tag">${ui.esc(t)}</span>`).join('')}
      ${(p.regions || []).map((r) => `<span class="sp-tag gray">${ui.esc(r)}</span>`).join('')}
    </div>
    <div class="kv-table mt12">
      <div class="kv"><span class="k">信用代码</span><span class="v">${ui.esc(p.creditCode || '—')}</span></div>
      <div class="kv"><span class="k">联系人</span><span class="v">${ui.esc(p.contactName || '—')} ${ui.esc(p.contactPhone || '')}</span></div>
      <div class="kv"><span class="k">成立/规模</span><span class="v">${ui.esc(p.establishedYear || '—')} / ${ui.esc(p.staffCount || '—')}</span></div>
      <div class="kv"><span class="k">提交时间</span><span class="v">${ui.esc(ui.fmtDate(p.createdAt, true))}</span></div>
    </div>
    ${p.intro ? `<div class="small muted mt8" style="line-height:1.7">${ui.esc(p.intro)}</div>` : ''}
    ${p.cases ? `<div class="small mt8" style="line-height:1.7"><b>案例：</b>${ui.esc(p.cases)}</div>` : ''}
    ${p.qualifications ? `<div class="small mt8" style="line-height:1.7"><b>资质：</b>${ui.esc(p.qualifications)}</div>` : ''}
    ${p.reviewNote ? `<div class="tiny dim mt8">审核意见：${ui.esc(p.reviewNote)}</div>` : ''}
    ${p.status === 'pending'
      ? `<div class="row gap8 mt12">
          <button class="btn btn-sm btn-primary grow" data-approve="${ui.esc(p.id)}">通过</button>
          <button class="btn btn-sm grow" data-reject="${ui.esc(p.id)}">拒绝</button>
        </div>`
      : `<div class="row gap8 mt12">
          <button class="btn btn-sm btn-outline" data-toggle="${ui.esc(p.id)}" data-to="${p.status === 'approved' ? 'rejected' : 'approved'}">
            ${p.status === 'approved' ? '撤销（改为未通过）' : '改为通过'}
          </button>
        </div>`}
  </div>`;

  const html = `<div class="page">
    <div class="card card-pad">
      <div class="row between mb8">
        <div class="strong">🤝 服务商审核</div>
        <span class="badge ${res.pendingCount ? 'warn' : 'gray'}">待审核 ${res.pendingCount}</span>
      </div>
      <div class="chips scroll">
        <a class="chip ${status === 'pending' ? 'active' : ''}" href="#/admin-providers?status=pending">待审核 ${res.pendingCount}</a>
        <a class="chip ${status === 'approved' ? 'active' : ''}" href="#/admin-providers?status=approved">已通过 ${res.approvedCount}</a>
        <a class="chip ${status === 'rejected' ? 'active' : ''}" href="#/admin-providers?status=rejected">未通过 ${res.rejectedCount}</a>
        <a class="chip ${!status ? 'active' : ''}" href="#/admin-providers?status=">全部</a>
      </div>
    </div>

    <div class="mt12">
      ${items.length ? items.map(itemHtml).join('') : ui.emptyState('📭', '这个状态下没有申请')}
    </div>
  </div>`;

  return {
    title: '服务商审核',
    content: html,
    showBack: true,
    mount(root) {
      const act = async (id, approve, note = '') => {
        try {
          await service.adminReviewProvider(id, { approve, note });
          ui.toast(approve ? '已通过' : '已拒绝', 'ok');
          ctx.nav(`#/admin-providers?status=${status}`, { replace: true });
        } catch (err) {
          ui.toast(err.message || '操作失败', 'err');
        }
      };

      root.querySelectorAll('[data-approve]').forEach((b) =>
        b.addEventListener('click', () => act(b.dataset.approve, true)),
      );
      root.querySelectorAll('[data-reject]').forEach((b) =>
        b.addEventListener('click', async () => {
          const note = await ui.promptDialog({ title: '拒绝原因', label: '可以告诉对方需要补充什么', multiline: true, okText: '确定拒绝' });
          if (note === null) return;
          act(b.dataset.reject, false, note || '');
        }),
      );
      root.querySelectorAll('[data-toggle]').forEach((b) =>
        b.addEventListener('click', () => act(b.dataset.toggle, b.dataset.to === 'approved')),
      );
    },
  };
}

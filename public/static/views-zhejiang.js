/**
 * 小鱼来了 — 浙江省政策项目申报
 *
 * 路由：
 *   #/zhejiang        政策列表（分类 / 层级 / 关键词筛选）
 *   #/zhejiang/:id    单个政策详情 + 申报
 *
 * 数据来自《浙江省政策项目申报计划表（全项目）新.xlsx》，共 40 个项目。
 * 每个项目是一个独立子页面，可以看详情、提交申报意向。
 */

import { service, isLoggedIn, store } from './api.js';
import * as ui from './ui.js';

/* 分类配色：让列表一眼能分辨政策类型 */
const CAT_TONE = {
  talent: '#7c5cff',
  qualify: '#1a6dff',
  rnd: '#0ea5a4',
  tech: '#f59e0b',
  smart: '#e04545',
  ip: '#8b5cf6',
  carrier: '#22a06b',
  subsidy: '#d97706',
  other: '#607089',
};

const LEVEL_NAME = {
  national: '国家级',
  province: '省级',
  city: '市级',
  district: '区县级',
};

const LEVEL_CLASS = {
  national: 'lv-national',
  province: 'lv-province',
  city: 'lv-city',
  district: 'lv-district',
};

/* ------------------------------------------------------------------ */
/* 列表页                                                              */
/* ------------------------------------------------------------------ */
export async function renderZhejiang(ctx, params) {
  const [metaRes, listRes] = await Promise.all([
    service.zhejiangMeta().catch(() => null),
    service.zhejiangPolicies().catch(() => ({ items: [], total: 0 })),
  ]);

  const meta = metaRes || { categories: [], levels: [], stats: { total: 0, byCategory: {}, byLevel: {} } };
  const items = listRes?.items || [];

  // 支持从创业服务专区深链过来：#/zhejiang?cat=talent&level=province
  let activeCat = String(params?.cat || '').trim();
  let activeLevel = String(params?.level || '').trim();
  let keyword = '';
  let current = items;

  const cats = meta.categories || [];
  const levels = meta.levels || [];
  const stats = meta.stats || { total: 0, byLevel: {} };

  const catChips = [
    `<a class="zj-chip ${!activeCat ? 'active' : ''}" data-cat="">全部 ${stats.total || items.length}</a>`,
    ...cats.map((c) => {
      const n = (stats.byCategory || {})[c.id] || 0;
      return `<a class="zj-chip ${activeCat === c.id ? 'active' : ''}" data-cat="${ui.esc(c.id)}">${c.icon || ''} ${ui.esc(c.name)} ${n}</a>`;
    }),
  ].join('');

  const levelChips = [
    `<a class="zj-chip zj-chip-sm ${!activeLevel ? 'active' : ''}" data-level="">不限层级</a>`,
    ...levels.map((l) => {
      const n = (stats.byLevel || {})[l.id] || 0;
      return `<a class="zj-chip zj-chip-sm ${activeLevel === l.id ? 'active' : ''}" data-level="${ui.esc(l.id)}">${ui.esc(l.name)} ${n}</a>`;
    }),
  ].join('');

  const html = `
  <div class="page zj-page">
    <div class="zj-hero">
      <div class="zj-hero-t">浙江省政策项目申报</div>
      <div class="zj-hero-s">
        覆盖人才、资质、研发、技改、智能制造、知识产权等 ${stats.total || items.length} 个政策项目，
        按条件匹配后提交申报意向，由平台协助对接主管部门。
      </div>
      <div class="zj-hero-stats">
        <div><b>${stats.total || items.length}</b><span>政策项目</span></div>
        <div><b>${(stats.byLevel || {}).province || 0}</b><span>省级</span></div>
        <div><b>${(stats.byLevel || {}).city || 0}</b><span>市级</span></div>
        <div><b>${(stats.byLevel || {}).district || 0}</b><span>区县级</span></div>
      </div>
    </div>

    <div class="zj-filters">
      <div class="zj-search-row">
        <input class="input zj-search" id="zj-q" placeholder="搜政策名称 / 主管部门 / 关键词" autocomplete="off">
        <button class="zj-match-btn" id="zj-match-btn">🎯 资格自测</button>
      </div>
      <div class="zj-chips" id="zj-cats">${catChips}</div>
      <div class="zj-chips" id="zj-levels">${levelChips}</div>
    </div>

    <div class="zj-count" id="zj-count"></div>
    <div id="zj-list" class="zj-list"></div>

    <div class="zj-mine card card-pad mt12 hide" id="zj-mine"></div>

    <div class="zj-foot">
      政策信息来自公开渠道整理，最终以主管部门发布的正式通知为准。
    </div>
  </div>`;

  return {
    title: '浙江省政策项目申报',
    content: html,
    showBack: true,
    async mount(root) {
      const listEl = root.querySelector('#zj-list');
      const countEl = root.querySelector('#zj-count');

      const renderList = () => {
        const kw = keyword.trim().toLowerCase();
        const filtered = current.filter((p) => {
          if (activeCat && p.category !== activeCat) return false;
          if (activeLevel && p.level !== activeLevel) return false;
          if (kw) {
            const hay = `${p.name} ${p.dept}`.toLowerCase();
            if (!hay.includes(kw)) return false;
          }
          return true;
        });

        countEl.textContent = `共 ${filtered.length} 个项目`;

        if (!filtered.length) {
          listEl.innerHTML = ui.emptyState('🔍', '没有匹配的政策项目', '换个关键词或清除筛选试试');
          return;
        }

        listEl.innerHTML = filtered
          .map((p) => {
            const tone = CAT_TONE[p.category] || CAT_TONE.other;
            const lvName = LEVEL_NAME[p.level] || '';
            const lvCls = LEVEL_CLASS[p.level] || '';
            const amount = (p.amount || '').split('\n')[0].slice(0, 46);
            return `<a class="zj-card" href="#/zhejiang/${ui.esc(p.id)}">
              <div class="zj-card-top">
                <span class="zj-lv ${lvCls}">${ui.esc(lvName)}</span>
                <span class="zj-dept">${ui.esc(p.dept || '')}</span>
              </div>
              <div class="zj-card-name">
                <span class="zj-seq" style="background:${tone}">${p.seq}</span>
                ${ui.esc(p.name)}
              </div>
              <div class="zj-card-meta">
                <span class="zj-cycle">🗓 ${ui.esc((p.cycle || '').replace(/\n/g, ' / '))}</span>
                <span class="zj-amount">💰 ${ui.esc(amount || '以正式通知为准')}</span>
                <span class="zj-portal-mini">🏛 ${ui.esc(p.portalName || '')}</span>
              </div>
            </a>`;
          })
          .join('');
      };

      root.querySelector('#zj-cats').addEventListener('click', (e) => {
        const a = e.target.closest('[data-cat]');
        if (!a) return;
        activeCat = a.dataset.cat || '';
        [...root.querySelectorAll('#zj-cats .zj-chip')].forEach((el) => el.classList.toggle('active', el === a));
        renderList();
      });

      root.querySelector('#zj-levels').addEventListener('click', (e) => {
        const a = e.target.closest('[data-level]');
        if (!a) return;
        activeLevel = a.dataset.level || '';
        [...root.querySelectorAll('#zj-levels .zj-chip')].forEach((el) => el.classList.toggle('active', el === a));
        renderList();
      });

      const onSearch = ui.debounce(() => {
        keyword = root.querySelector('#zj-q').value || '';
        renderList();
      }, 200);
      root.querySelector('#zj-q').addEventListener('input', onSearch);

      renderList();

      /* 资格自测：填企业情况 → 匹配政策 */
      let matchResult = null;

      const renderMatch = (res) => {
        matchResult = res;
        countEl.textContent = `匹配到 ${res.total} 个项目，其中高匹配 ${res.high} 个`;
        if (!res.items.length) {
          listEl.innerHTML = ui.emptyState('🎯', '暂时没有匹配的项目', '试试放宽成立年限，或直接浏览全部政策');
          return;
        }
        listEl.innerHTML = res.items
          .map((p) => {
            const tone = CAT_TONE[p.category] || CAT_TONE.other;
            const lvName = LEVEL_NAME[p.level] || '';
            const lvCls = LEVEL_CLASS[p.level] || '';
            const badge =
              p.matchLevel === 'high'
                ? '<span class="zj-match-badge high">高匹配</span>'
                : p.matchLevel === 'medium'
                  ? '<span class="zj-match-badge medium">较匹配</span>'
                  : '<span class="zj-match-badge low">可关注</span>';
            const reasons = (p.reasons || []).length
              ? `<div class="zj-reasons">${p.reasons.map((r) => `<span>✓ ${ui.esc(r)}</span>`).join('')}</div>`
              : '';
            const warns = (p.warnings || []).length
              ? `<div class="zj-warns">${p.warnings.map((w) => `<span>! ${ui.esc(w)}</span>`).join('')}</div>`
              : '';
            return `<a class="zj-card zj-card-match" href="#/zhejiang/${ui.esc(p.id)}">
              <div class="zj-card-top">
                <span class="zj-lv ${lvCls}">${ui.esc(lvName)}</span>
                <span class="zj-dept">${ui.esc(p.dept || '')}</span>
                ${badge}
              </div>
              <div class="zj-card-name">
                <span class="zj-seq" style="background:${tone}">${p.seq}</span>
                ${ui.esc(p.name)}
              </div>
              <div class="zj-card-meta">
                <span class="zj-cycle">🗓 ${ui.esc((p.cycle || '').replace(/\n/g, ' / '))}</span>
                <span class="zj-amount">💰 ${ui.esc((p.amount || '').split('\n')[0].slice(0, 40) || '以正式通知为准')}</span>
              </div>
              ${reasons}
              ${warns}
            </a>`;
          })
          .join('');
      };

      root.querySelector('#zj-match-btn')?.addEventListener('click', () => {
        openMatchSheet((profile) => {
          const btn = root.querySelector('#zj-match-btn');
          btn.textContent = '匹配中…';
          service
            .zhejiangMatch(profile)
            .then((res) => {
              renderMatch(res);
              btn.textContent = '🎯 重新自测';
            })
            .catch((err) => {
              btn.textContent = '🎯 资格自测';
              ui.toast(err.message || '匹配失败', 'err');
            });
        });
      });

      /* 我的申报：登录后才显示 */
      if (isLoggedIn()) {
        const mineEl = root.querySelector('#zj-mine');
        try {
          const res = await service.zhejiangMyApplications();
          const apps = res?.items || [];
          if (apps.length) {
            mineEl.classList.remove('hide');
            mineEl.innerHTML = `
              <div class="strong mb8">我的申报 <span class="dim">(${apps.length})</span></div>
              ${apps
                .map(
                  (a) => `<div class="zj-mine-row">
                    <div class="zj-mine-name">${ui.esc(a.policyName)}</div>
                    <div class="zj-mine-meta">
                      <span class="zj-mine-status">${ui.esc(a.statusName)}</span>
                      <span class="dim">${ui.fmtRelative(a.createdAt)}</span>
                    </div>
                  </div>`,
                )
                .join('')}`;
          }
        } catch {
          /* 拿不到就不显示 */
        }
      }
    },
  };
}

/* ------------------------------------------------------------------ */
/* 详情页                                                              */
/* ------------------------------------------------------------------ */
export async function renderZhejiangDetail(ctx, params) {
  const id = params?.id || '';
  let policy = null;
  try {
    const res = await service.zhejiangPolicy(id);
    policy = res?.policy || null;
  } catch {
    policy = null;
  }

  if (!policy) {
    return {
      title: '政策详情',
      content: `<div class="page">${ui.emptyState('📋', '政策项目不存在', '可能已下线')}</div>`,
      showBack: true,
    };
  }

  /* 正文按行拆分，保留原始编号结构 */
  const renderBlocks = (text) =>
    String(text || '')
      .split('\n')
      .map((line) => {
        const t = line.trim();
        if (!t) return '';
        // 形如 "1." "（1）" "一、" 的行加粗
        if (/^(\d+\.|（\d+）|\(|一、|二、|三、|四、|五、|六、)/.test(t)) {
          return `<div class="zj-line zj-line-strong">${ui.esc(t)}</div>`;
        }
        return `<div class="zj-line">${ui.esc(t)}</div>`;
      })
      .join('');

  const lvName = LEVEL_NAME[policy.level] || '';
  const lvCls = LEVEL_CLASS[policy.level] || '';
  const tone = CAT_TONE[policy.category] || CAT_TONE.other;

  const html = `
  <div class="page zj-detail">
    <div class="zj-detail-head">
      <div class="zj-detail-badges">
        <span class="zj-lv ${lvCls}">${ui.esc(lvName)}</span>
        <span class="zj-seq" style="background:${tone}">No.${policy.seq}</span>
      </div>
      <h1 class="zj-detail-title">${ui.esc(policy.name)}</h1>
      <div class="zj-detail-meta">
        <div><span>主管部门</span><b>${ui.esc(policy.dept || '—')}</b></div>
        <div><span>申报周期</span><b>${ui.esc((policy.cycle || '—').replace(/\n/g, ' / '))}</b></div>
        <div><span>预估补贴</span><b>${ui.esc((policy.amount || '以正式通知为准').split('\n')[0])}</b></div>
      </div>
    </div>

    <div class="card card-pad mt12">
      <div class="strong mb8">💰 扶持力度</div>
      <div class="zj-pre">${renderBlocks(policy.amount) || '<div class="zj-line dim">以主管部门正式通知为准</div>'}</div>
    </div>

    <div class="card card-pad mt12">
      <div class="strong mb8">📋 申报条件 / 政策文件</div>
      <div class="zj-pre">${renderBlocks(policy.policy) || '<div class="zj-line dim">暂无</div>'}</div>
    </div>

    <div class="card card-pad mt12">
      <div class="strong mb8">📎 申报材料</div>
      <div class="zj-pre">${renderBlocks(policy.materials) || '<div class="zj-line dim">暂无</div>'}</div>
    </div>

    <div class="card card-pad mt12 zj-portal">
      <div class="strong mb8">🔗 官方申报入口</div>
      <div class="zj-portal-note">
        正式申报须在主管部门系统完成。下面是该政策对应的官方门户，可先查看当年的申报通知。
      </div>
      ${policy.noticeUrl ? `<a class="zj-portal-item zj-portal-notice-item" href="${ui.esc(policy.noticeUrl)}" target="_blank" rel="noopener">
          <span class="zj-portal-name">📢 查看本年申报通知</span>
          <span class="zj-portal-arrow">↗</span>
        </a>` : ''}
      <div class="zj-portal-list">
        <a class="zj-portal-item" href="${ui.esc(policy.portalUrl)}" target="_blank" rel="noopener">
          <span class="zj-portal-name">${ui.esc(policy.portalName || '主管部门官网')}</span>
          <span class="zj-portal-arrow">↗</span>
        </a>
        <a class="zj-portal-item" href="https://www.zjzwfw.gov.cn" target="_blank" rel="noopener">
          <span class="zj-portal-name">浙江政务服务网（统一办事入口）</span>
          <span class="zj-portal-arrow">↗</span>
        </a>
      </div>
      <div class="zj-portal-tip">
        提示：在官方平台搜索「${ui.esc(policy.name)}」可找到最新申报通知。
      </div>
    </div>

    <div class="zj-apply-bar">
      <button class="btn btn-primary btn-block" id="zj-apply-btn">立即申报 · ${ui.esc(policy.name.slice(0, 12))}${policy.name.length > 12 ? '…' : ''}</button>
      <div class="zj-apply-hint">
        提交后平台会核对你的条件，并指导你到主管部门系统完成正式申报。
      </div>
    </div>
  </div>`;

  return {
    title: policy.name,
    content: html,
    showBack: true,
    async mount(root) {
      root.querySelector('#zj-apply-btn')?.addEventListener('click', () => openApplySheet(policy));
    },
  };
}

/* ------------------------------------------------------------------ */
/* 申报表单                                                            */
/* ------------------------------------------------------------------ */
function openApplySheet(policy) {
  if (!isLoggedIn()) {
    ui.toast('请先登录后再申报', 'err');
    ctxNav('#/login');
    return;
  }

  const me = store.user || {};
  const content = `
    <div class="zj-apply-form">
      <div class="zj-apply-target">${ui.esc(policy.name)}</div>
      <div class="zj-apply-dept">${ui.esc(policy.dept || '')} · ${ui.esc(LEVEL_NAME[policy.level] || '')}</div>

      <div class="field mt12">
        <label>企业 / 申报主体名称 <span style="color:var(--danger)">*</span></label>
        <input class="input" id="zj-f-company" value="${ui.esc(me.company || '')}" placeholder="营业执照上的全称">
      </div>
      <div class="field">
        <label>联系人 <span style="color:var(--danger)">*</span></label>
        <input class="input" id="zj-f-name" value="${ui.esc(me.nickname || '')}" placeholder="姓名">
      </div>
      <div class="field">
        <label>联系电话 <span style="color:var(--danger)">*</span></label>
        <input class="input" id="zj-f-phone" value="${ui.esc(me.phone || '')}" placeholder="手机号">
      </div>
      <div class="field">
        <label>所属行业</label>
        <input class="input" id="zj-f-industry" value="${ui.esc(me.industry || '')}" placeholder="如：人工智能、新能源">
      </div>
      <div class="field">
        <label>所在城市（区县）</label>
        <input class="input" id="zj-f-city" value="${ui.esc(me.city || '')}" placeholder="如：杭州市余杭区">
      </div>
      <div class="field">
        <label>补充说明</label>
        <textarea class="textarea" id="zj-f-note" rows="3" maxlength="1000" placeholder="简述企业当前情况，便于平台判断匹配度"></textarea>
      </div>

      <button class="btn btn-primary btn-block" id="zj-f-submit">提交申报意向</button>
      <div class="tiny dim center mt8">
        提交后可在「我的申报」查看进度。平台不收取代办费。
      </div>
    </div>`;

  ui.openSheet({
    title: '申报意向',
    content,
    async onMount(sheet, close) {
      const btn = sheet.querySelector('#zj-f-submit');
      btn?.addEventListener('click', async () => {
        const pick = (sel) => (sheet.querySelector(sel)?.value || '').trim();
        const body = {
          policyId: policy.id,
          companyName: pick('#zj-f-company'),
          contactName: pick('#zj-f-name'),
          contactPhone: pick('#zj-f-phone'),
          industry: pick('#zj-f-industry'),
          city: pick('#zj-f-city'),
          note: pick('#zj-f-note'),
        };

        if (!body.companyName) return ui.toast('请填写企业名称', 'err');
        if (!body.contactName) return ui.toast('请填写联系人', 'err');
        if (!/^1\d{10}$|^\+?\d{7,15}$/.test(body.contactPhone.replace(/\s/g, ''))) {
          return ui.toast('请填写正确的联系电话', 'err');
        }

        btn.disabled = true;
        btn.textContent = '提交中…';
        try {
          await service.zhejiangApply(body);
          close();
          ui.toast('已提交，平台会尽快联系你', 'ok');
        } catch (err) {
          btn.disabled = false;
          btn.textContent = '提交申报意向';
          ui.toast(err.message || '提交失败', 'err');
        }
      });
    },
  });
}

/* ------------------------------------------------------------------ */
/* 资格自测表单                                                         */
/* ------------------------------------------------------------------ */
function openMatchSheet(onSubmit) {
  const content = `
    <div class="zj-match-form">
      <div class="zj-match-intro">
        填写企业基本情况，系统按各政策的硬条件匹配出你能申报的项目。
        匹配结果会说明推荐理由，条件不够的也会提示还差什么。
      </div>

      <div class="field mt12">
        <label>企业成立年限</label>
        <div class="zj-match-years">
          <input class="input" id="zj-m-age" type="number" min="0" max="30" placeholder="如：2" inputmode="numeric">
          <span class="zj-unit">年</span>
        </div>
      </div>

      <div class="field">
        <label>是否高层次人才 / 人才项目负责人</label>
        <div class="zj-switch-row" id="zj-m-talent">
          <button class="zj-opt" data-v="0">不是</button>
          <button class="zj-opt active" data-v="1">是</button>
        </div>
      </div>

      <div class="field">
        <label>是否已有专利 / 软著 / 知识产权</label>
        <div class="zj-switch-row" id="zj-m-ip">
          <button class="zj-opt active" data-v="0">没有</button>
          <button class="zj-opt" data-v="1">已有</button>
        </div>
      </div>

      <div class="field">
        <label>所属行业</label>
        <input class="input" id="zj-m-industry" placeholder="如：人工智能、新能源、新材料">
      </div>

      <div class="field">
        <label>所在城市 / 区县</label>
        <input class="input" id="zj-m-city" placeholder="如：杭州市余杭区">
      </div>

      <button class="btn btn-primary btn-block" id="zj-m-go">开始匹配</button>
      <div class="tiny dim center mt8">只做条件匹配，不代表最终审核结论</div>
    </div>`;

  ui.openSheet({
    title: '资格自测',
    content,
    onMount(sheet, close) {
      const state = { isTalent: true, hasIp: false };

      const bindSwitch = (id, key) => {
        const wrap = sheet.querySelector(id);
        wrap?.addEventListener('click', (e) => {
          const b = e.target.closest('[data-v]');
          if (!b) return;
          state[key] = b.dataset.v === '1';
          [...wrap.querySelectorAll('.zj-opt')].forEach((el) => el.classList.toggle('active', el === b));
        });
      };
      bindSwitch('#zj-m-talent', 'isTalent');
      bindSwitch('#zj-m-ip', 'hasIp');

      sheet.querySelector('#zj-m-go')?.addEventListener('click', () => {
        const ageRaw = sheet.querySelector('#zj-m-age')?.value || '';
        const age = ageRaw === '' ? NaN : Number(ageRaw);
        if (Number.isNaN(age) || age < 0) {
          return ui.toast('请填写企业成立年限', 'err');
        }
        close();
        onSubmit({
          companyAge: age,
          isTalent: state.isTalent,
          hasIp: state.hasIp,
          industry: (sheet.querySelector('#zj-m-industry')?.value || '').trim(),
          city: (sheet.querySelector('#zj-m-city')?.value || '').trim(),
        });
      });
    },
  });
}

/* 路由跳转小工具：避免直接依赖 app.js */
function ctxNav(hash) {
  if (typeof location !== 'undefined') location.hash = hash;
}

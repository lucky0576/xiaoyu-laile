/**
 * 小鱼来了 — 杭州「AI+X」场景供需对接
 *
 * 路由：#/hangzhou
 * 入口：需求广场（#/latest）顶部区块
 *
 * 两个清单：
 *   场景需求清单（10 条）—— 谁需要什么，能怎么合作
 *   场景能力清单（20 家）—— 谁能提供什么，怎么合作
 *
 * 核心能力是「供需匹配」：点开一条需求，自动列出能接的企业；
 * 点开一家企业，自动列出它可能能接的需求。
 */

import { service, isLoggedIn } from './api.js';
import * as ui from './ui.js';

const CAT_ICON = {
  gov: '🏛',
  industry: '🏭',
  culture: '🎭',
  edu: '🎓',
  health: '🏥',
  biz: '💼',
  finance: '💰',
  consume: '🛍',
  agri: '🌾',
  other: '📌',
};

export async function renderHangzhou(ctx, query = {}) {
  const [metaRes, needRes, capRes] = await Promise.all([
    service.hangzhouMeta().catch(() => null),
    service.hangzhouNeeds().catch(() => ({ items: [] })),
    service.hangzhouCaps().catch(() => ({ items: [] })),
  ]);

  const meta = metaRes || { categories: [], contact: { phones: [] }, stats: {} };
  const needs = needRes.items || [];
  const caps = capRes.items || [];
  const cats = meta.categories || [];
  const stats = meta.stats || {};

  let activeTab = query.tab === 'caps' ? 'caps' : 'needs';
  let activeCat = '';
  let keyword = '';

  const catChips = [
    `<a class="hz-chip active" data-cat="">全部 ${caps.length}</a>`,
    ...cats.map((c) => {
      const n = (stats.byCategory || {})[c.id] || 0;
      if (!n) return '';
      return `<a class="hz-chip" data-cat="${ui.esc(c.id)}">${CAT_ICON[c.id] || '📌'} ${ui.esc(c.name)} ${n}</a>`;
    }),
  ].join('');

  const html = `
  <div class="page hz-page">
    <div class="hz-hero">
      <div class="hz-hero-badge">🤖 杭州 AI+X · 官方场景对接</div>
      <h1 class="hz-hero-t">场景需求 × 技术能力，直接对上</h1>
      <div class="hz-hero-d">
        收录杭州市「AI+X」首批 ${stats.needs || needs.length} 条场景需求与
        ${stats.caps || caps.length} 家企业能力，点开任意一条可看详情、匹配对方、提交对接意向。
      </div>
      <div class="hz-hero-stats">
        <div><b>${stats.needs || needs.length}</b><span>场景需求</span></div>
        <div><b>${stats.caps || caps.length}</b><span>能力企业</span></div>
        <div><b>${(meta.contact && meta.contact.phones ? meta.contact.phones.length : 0)}</b><span>官方对接电话</span></div>
      </div>
      <div class="hz-contact">
        <span class="hz-contact-label">官方对接</span>
        ${(meta.contact?.phones || [])
          .map(
            (p) =>
              `<a class="hz-phone" href="tel:${ui.esc(p.replace(/[^\d]/g, ''))}">${ui.esc(p)}</a>`,
          )
          .join('')}
      </div>
    </div>

    <div class="hz-tabs">
      <a class="hz-tab ${activeTab === 'needs' ? 'active' : ''}" data-tab="needs">📋 场景需求 <i>${needs.length}</i></a>
      <a class="hz-tab ${activeTab === 'caps' ? 'active' : ''}" data-tab="caps">🏢 能力供给 <i>${caps.length}</i></a>
    </div>

    <div class="hz-filters">
      <input class="input hz-search" id="hz-q" placeholder="搜场景 / 企业 / 技术关键词" autocomplete="off">
      <div class="hz-chips" id="hz-cats">${catChips}</div>
    </div>

    <div class="hz-count" id="hz-count"></div>
    <div id="hz-list" class="hz-list"></div>

    <div class="hz-foot">
      数据来自杭州市 AI+X 首批场景供需清单（官方征集）。如需官方渠道对接，请拨打上方电话。
    </div>
  </div>`;

  return {
    title: '场景广场交易',
    content: html,
    showBack: true,
    async mount(root) {
      const listEl = root.querySelector('#hz-list');
      const countEl = root.querySelector('#hz-count');
      const catsEl = root.querySelector('#hz-cats');

      const matches = (text, kw) => !kw || String(text || '').toLowerCase().includes(kw);

      const renderNeeds = () => {
        const kw = keyword.trim().toLowerCase();
        const list = needs.filter(
          (n) => matches(`${n.org} ${n.scene} ${n.summary}`, kw),
        );
        countEl.textContent = `共 ${list.length} 条场景需求`;
        listEl.innerHTML = list.length
          ? list
              .map(
                (n) => `<div class="hz-card" data-kind="need" data-id="${ui.esc(n.id)}">
                  <div class="hz-card-top">
                    <span class="hz-seq">${n.seq}</span>
                    <span class="hz-card-title">${ui.esc(n.scene)}</span>
                  </div>
                  <div class="hz-card-org">${ui.esc(n.org)}</div>
                  <div class="hz-card-sum">${ui.esc(n.summary)}</div>
                  <div class="hz-card-meta">
                    <span class="hz-mode">🤝 ${ui.esc(n.mode || '合作模式待沟通')}</span>
                    <span class="hz-more">查看详情与匹配 ›</span>
                  </div>
                </div>`,
              )
              .join('')
          : ui.emptyState('🔍', '没有匹配的需求', '换个关键词试试');
      };

      const renderCaps = () => {
        const kw = keyword.trim().toLowerCase();
        const list = caps.filter((c) => {
          if (activeCat && c.category !== activeCat) return false;
          return matches(`${c.company} ${c.project} ${c.categoryRaw} ${c.summary}`, kw);
        });
        countEl.textContent = `共 ${list.length} 家企业能力`;
        listEl.innerHTML = list.length
          ? list
              .map(
                (c) => `<div class="hz-card" data-kind="cap" data-id="${ui.esc(c.id)}">
                  <div class="hz-card-top">
                    <span class="hz-seq">${c.seq}</span>
                    <span class="hz-card-title">${ui.esc(c.project)}</span>
                  </div>
                  <div class="hz-card-org">${ui.esc(c.company)}</div>
                  <div class="hz-card-tags">
                    <span class="hz-tag">${CAT_ICON[c.category] || '📌'} ${ui.esc(c.categoryName)}</span>
                    ${c.categoryRaw ? `<span class="hz-tag dim">${ui.esc(c.categoryRaw)}</span>` : ''}
                  </div>
                  <div class="hz-card-sum">${ui.esc(c.summary)}</div>
                  <div class="hz-card-meta">
                    <span class="hz-mode">🤝 ${ui.esc((c.mode || '').slice(0, 40))}</span>
                    <span class="hz-more">查看详情与匹配 ›</span>
                  </div>
                </div>`,
              )
              .join('')
          : ui.emptyState('🔍', '没有匹配的企业', '换个分类或关键词试试');
      };

      const render = () => (activeTab === 'needs' ? renderNeeds() : renderCaps());

      root.querySelector('.hz-tabs')?.addEventListener('click', (e) => {
        const a = e.target.closest('[data-tab]');
        if (!a) return;
        activeTab = a.dataset.tab;
        [...root.querySelectorAll('.hz-tab')].forEach((el) => el.classList.toggle('active', el === a));
        catsEl.style.display = activeTab === 'caps' ? '' : 'none';
        render();
      });

      catsEl.style.display = activeTab === 'caps' ? '' : 'none';

      catsEl?.addEventListener('click', (e) => {
        const a = e.target.closest('[data-cat]');
        if (!a) return;
        activeCat = a.dataset.cat || '';
        [...catsEl.querySelectorAll('.hz-chip')].forEach((el) => el.classList.toggle('active', el === a));
        render();
      });

      root.querySelector('#hz-q')?.addEventListener(
        'input',
        ui.debounce((e) => {
          keyword = e.target.value || '';
          render();
        }, 200),
      );

      listEl.addEventListener('click', (e) => {
        const card = e.target.closest('.hz-card');
        if (!card) return;
        if (card.dataset.kind === 'need') openNeedDetail(card.dataset.id);
        else openCapDetail(card.dataset.id);
      });

      render();
    },
  };
}

/* ------------------------------------------------------------------ */
/* 需求详情 + 匹配能力方                                                */
/* ------------------------------------------------------------------ */
async function openNeedDetail(id) {
  ui.showLoading('加载中…');
  let need = null;
  let match = null;
  try {
    const [n, m] = await Promise.all([
      service.hangzhouNeed(id),
      service.hangzhouNeedMatch(id).catch(() => null),
    ]);
    need = n?.need || null;
    match = m;
  } finally {
    ui.hideLoading();
  }
  if (!need) return ui.toast('需求不存在', 'err');

  const content = `
    <div class="hz-detail">
      <div class="hz-detail-scene">${ui.esc(need.scene)}</div>
      <div class="hz-detail-org">${ui.esc(need.org)}</div>

      <div class="hz-sec">
        <div class="hz-sec-t">需求内容</div>
        <div class="hz-pre">${ui.esc(need.content || '（未填写详细内容）')}</div>
      </div>

      <div class="hz-sec">
        <div class="hz-sec-t">合作模式</div>
        <div class="hz-mode-big">${ui.esc(need.mode || '待沟通')}</div>
      </div>

      ${
        match && match.items.length
          ? `<div class="hz-sec">
              <div class="hz-sec-t">可对接的能力方 <span class="dim">(${match.total} 家匹配)</span></div>
              ${match.items
                .map(
                  (c) => `<div class="hz-match" data-capid="${ui.esc(c.id)}">
                    <div class="hz-match-head">
                      <b>${ui.esc(c.company)}</b>
                      <span class="hz-match-score">匹配 ${c.score}</span>
                    </div>
                    <div class="hz-match-proj">${ui.esc(c.project)}</div>
                    <div class="hz-match-reason">✓ ${ui.esc((c.reasons || [])[0] || '')}</div>
                  </div>`,
                )
                .join('')}
            </div>`
          : `<div class="hz-sec">
              <div class="hz-sec-t">可对接的能力方</div>
              <div class="dim" style="font-size:12.5px;line-height:1.7">暂未在首批能力清单里匹配到对应企业，可通过官方电话咨询。</div>
            </div>`
      }

      <button class="btn btn-primary btn-block mt12" id="hz-intent-btn">提交对接意向</button>
      <div class="tiny dim center mt8">提交后平台会联系你核对需求，并按官方渠道推进对接</div>
    </div>`;

  ui.openSheet({
    title: '场景需求详情',
    content,
    className: 'sheet-lg',
    onMount(sheet, close) {
      sheet.querySelector('#hz-intent-btn')?.addEventListener('click', () => {
        close();
        openIntentForm({ kind: 'need', targetId: need.id, targetName: need.scene, org: need.org });
      });
      sheet.querySelectorAll('.hz-match').forEach((el) => {
        el.addEventListener('click', () => {
          close();
          openCapDetail(el.dataset.capid);
        });
      });
    },
  });
}

/* ------------------------------------------------------------------ */
/* 能力详情 + 匹配可对接需求                                            */
/* ------------------------------------------------------------------ */
async function openCapDetail(id) {
  ui.showLoading('加载中…');
  let cap = null;
  let match = null;
  try {
    const [c, m] = await Promise.all([
      service.hangzhouCap(id),
      service.hangzhouCapMatch(id).catch(() => null),
    ]);
    cap = c?.cap || null;
    match = m;
  } finally {
    ui.hideLoading();
  }
  if (!cap) return ui.toast('企业不存在', 'err');

  const content = `
    <div class="hz-detail">
      <div class="hz-detail-scene">${ui.esc(cap.company)}</div>
      <div class="hz-detail-org">${ui.esc(cap.project)}</div>
      <div class="hz-card-tags mt8">
        <span class="hz-tag">${CAT_ICON[cap.category] || '📌'} ${ui.esc(cap.categoryName)}</span>
        ${cap.categoryRaw ? `<span class="hz-tag dim">${ui.esc(cap.categoryRaw)}</span>` : ''}
      </div>

      <div class="hz-sec">
        <div class="hz-sec-t">可提供的能力</div>
        <div class="hz-pre">${ui.esc(cap.ability || '（未填写）')}</div>
      </div>

      <div class="hz-sec">
        <div class="hz-sec-t">合作模式</div>
        <div class="hz-mode-big">${ui.esc(cap.mode || '待沟通')}</div>
      </div>

      ${
        match && match.items.length
          ? `<div class="hz-sec">
              <div class="hz-sec-t">可能可对接的场景需求 <span class="dim">(${match.total} 条匹配)</span></div>
              ${match.items
                .map(
                  (n) => `<div class="hz-match" data-needid="${ui.esc(n.id)}">
                    <div class="hz-match-head">
                      <b>${ui.esc(n.scene)}</b>
                      <span class="hz-match-score">匹配 ${n.score}</span>
                    </div>
                    <div class="hz-match-proj">${ui.esc(n.org)}</div>
                    <div class="hz-match-reason">✓ ${ui.esc((n.reasons || [])[0] || '')}</div>
                  </div>`,
                )
                .join('')}
            </div>`
          : `<div class="hz-sec">
              <div class="hz-sec-t">可能可对接的场景需求</div>
              <div class="dim" style="font-size:12.5px;line-height:1.7">首批需求清单里暂未匹配到对口场景，可主动提交对接意向说明能力。</div>
            </div>`
      }

      <button class="btn btn-primary btn-block mt12" id="hz-intent-btn">联系这家企业 / 提交对接意向</button>
    </div>`;

  ui.openSheet({
    title: '企业能力详情',
    content,
    className: 'sheet-lg',
    onMount(sheet, close) {
      sheet.querySelector('#hz-intent-btn')?.addEventListener('click', () => {
        close();
        openIntentForm({ kind: 'cap', targetId: cap.id, targetName: cap.company, org: cap.company });
      });
      sheet.querySelectorAll('.hz-match').forEach((el) => {
        el.addEventListener('click', () => {
          close();
          openNeedDetail(el.dataset.needid);
        });
      });
    },
  });
}

/* ------------------------------------------------------------------ */
/* 对接意向表单                                                        */
/* ------------------------------------------------------------------ */
function openIntentForm({ kind, targetId, targetName, org }) {
  if (!isLoggedIn()) {
    ui.toast('请先登录后再提交对接', 'err');
    if (typeof location !== 'undefined') location.hash = '#/login';
    return;
  }

  const content = `
    <div class="hz-intent">
      <div class="hz-intent-target">
        <div class="hz-intent-kind">${kind === 'need' ? '对接需求' : '对接企业'}</div>
        <div class="hz-intent-name">${ui.esc(targetName)}</div>
        <div class="hz-intent-org">${ui.esc(org || '')}</div>
      </div>

      <div class="field mt12"><label>企业名称 <span class="req">*</span></label>
        <input class="input" id="hz-i-company" placeholder="营业执照上的全称"></div>
      <div class="field"><label>联系人 <span class="req">*</span></label>
        <input class="input" id="hz-i-name" placeholder="姓名"></div>
      <div class="field"><label>联系电话 <span class="req">*</span></label>
        <input class="input" id="hz-i-phone" placeholder="手机号"></div>
      <div class="field"><label>补充说明</label>
        <textarea class="textarea" id="hz-i-note" rows="3" maxlength="800" placeholder="说明你能提供的能力或需要的资源，便于匹配"></textarea></div>

      <button class="btn btn-primary btn-block" id="hz-i-submit">提交对接意向</button>
      <div class="tiny dim center mt8">平台不收取撮合费用</div>
    </div>`;

  ui.openSheet({
    title: '提交对接意向',
    content,
    onMount(sheet, close) {
      sheet.querySelector('#hz-i-submit')?.addEventListener('click', async (ev) => {
        const pick = (sel) => (sheet.querySelector(sel)?.value || '').trim();
        const body = {
          kind,
          targetId,
          companyName: pick('#hz-i-company'),
          contactName: pick('#hz-i-name'),
          contactPhone: pick('#hz-i-phone'),
          note: pick('#hz-i-note'),
        };
        if (!body.companyName) return ui.toast('请填写企业名称', 'err');
        if (!body.contactName) return ui.toast('请填写联系人', 'err');
        if (!/^1\d{10}$|^\+?\d{7,15}$/.test(body.contactPhone.replace(/\s/g, ''))) {
          return ui.toast('请填写正确的联系电话', 'err');
        }
        const btn = ev.currentTarget;
        btn.disabled = true;
        btn.textContent = '提交中…';
        try {
          await service.hangzhouIntent(body);
          close();
          ui.toast('已提交，平台会尽快联系你', 'ok');
        } catch (err) {
          btn.disabled = false;
          btn.textContent = '提交对接意向';
          ui.toast(err.message || '提交失败', 'err');
        }
      });
    },
  });
}

export default { renderHangzhou };

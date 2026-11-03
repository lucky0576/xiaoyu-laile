/**
 * 小鱼来了 — 主理人（#/steward）
 *
 * 三类：城市主理人 / 行业主理人 / 渠道主理人
 *
 * 和服务商的区别：
 *   服务商 = 能干活的公司（EPC、设计、施工…）
 *   主理人 = 帮平台在一个城市 / 一个行业 / 一条渠道里张罗事的人
 *
 * 这个页面要让用户看懂：
 *   1. 三类分别是什么、要什么条件
 *   2. 成为之后有什么权益
 *   3. 怎么申请、审核要多久
 */

import * as ui from './ui.js';
import { service, isLoggedIn } from './api.js';

const KINDS = [
  {
    id: 'city',
    icon: '🏙️',
    name: '城市主理人',
    sub: '一个城市 / 一个区县',
    desc: '帮平台在你所在的城市组织活动、对接本地项目与资源。',
    need: ['本地人或有本地资源', '每月能组织 1 场活动', '能对接政府 / 园区 / 商协会'],
    gain: ['本地活动优先推荐位', '本市项目线索优先对接', '活动收益分成'],
    field: 'city',
    placeholder: '你负责的城市，如：杭州 / 台州椒江',
    fieldLabel: '负责城市',
  },
  {
    id: 'industry',
    icon: '🏭',
    name: '行业主理人',
    sub: '一个行业方向',
    desc: '深耕一个行业，负责该行业的内容、专家与项目对接。',
    need: ['该行业 3 年以上经验', '能判断项目质量', '有行业人脉或专家资源'],
    gain: ['行业内容署名与曝光', '行业项目优先推送', '行业报告联合发布'],
    field: 'industry',
    placeholder: '你深耕的行业，如：储能 / 光伏 / 新材料',
    fieldLabel: '负责行业',
  },
  {
    id: 'channel',
    icon: '🔗',
    name: '渠道主理人',
    sub: '一条渠道 / 一批客户',
    desc: '手里有稳定的客户或渠道，帮平台把服务推给需要的人。',
    need: ['有企业客户资源', '能对接决策人', '有服务交付或转介绍经验'],
    gain: ['服务佣金 / 分成', '合作方案支持', '联合拜访与培训'],
    field: 'channel',
    placeholder: '你的渠道类型，如：商协会 / 园区服务商 / 财税代理',
    fieldLabel: '渠道类型',
  },
];

function mineHtml(items) {
  if (!items.length) return '';
  const statusText = { pending: '审核中', approved: '已通过', rejected: '未通过' };
  const badge = { pending: 'warn', approved: 'ok', rejected: 'gray' };
  return `<div class="card card-pad mt12">
    <div class="strong mb8">📋 我的申请</div>
    ${items
      .map(
        (s) => `<div class="st-mine">
          <div class="st-mine-head">
            <span class="st-mine-name">${ui.esc(s.kindName || '')}</span>
            <span class="badge ${badge[s.status] || 'gray'}">${statusText[s.status] || s.status}</span>
          </div>
          <div class="st-mine-meta">${ui.esc(
            [s.city, s.industry, s.channel].filter(Boolean).join(' · ') || '未填写定位',
          )} · ${ui.fmtRelative(s.createdAt)}</div>
          ${s.reason ? `<div class="st-mine-reason">原因：${ui.esc(s.reason)}</div>` : ''}
        </div>`,
      )
      .join('')}
  </div>`;
}

export async function renderSteward(ctx) {
  if (!isLoggedIn()) {
    ctx.nav(`#/login?redirect=${encodeURIComponent('#/steward')}`);
    return { title: '成为主理人', content: '<div class="page"><div class="empty">正在跳转登录…</div></div>' };
  }

  const [metaRes, mineRes, listRes] = await Promise.all([
    service.stewardMeta().catch(() => ({})),
    service.stewardMine().catch(() => ({ items: [] })),
    service.stewards({}).catch(() => ({ items: [] })),
  ]);
  const counts = metaRes?.counts || {};
  const mine = mineRes?.items || [];
  const approved = listRes?.items || [];

  const html = `<div class="page st-page">
    <div class="st-hero">
      <div class="st-hero-t">🤝 成为主理人</div>
      <div class="st-hero-d">
        平台不自己铺人 —— 每个城市、每个行业、每条渠道，
        由一位<b>主理人</b>来张罗。你出人脉和判断，我们出平台和工具。
      </div>
      <div class="st-hero-tags">
        <span>城市主理人 ${counts.city || 0}</span>
        <span>行业主理人 ${counts.industry || 0}</span>
        <span>渠道主理人 ${counts.channel || 0}</span>
      </div>
    </div>

    ${KINDS.map(
      (k) => `<div class="st-card" data-kind-card="${k.id}">
        <div class="st-card-head">
          <div class="st-card-ico">${k.icon}</div>
          <div class="st-card-title">
            <div class="st-card-name">${ui.esc(k.name)}</div>
            <div class="st-card-sub">${ui.esc(k.sub)}</div>
          </div>
          <button class="btn btn-sm btn-primary" data-apply="${k.id}" type="button">申请</button>
        </div>
        <div class="st-card-desc">${ui.esc(k.desc)}</div>
        <div class="st-two-col">
          <div>
            <div class="st-col-t">需要什么</div>
            ${k.need.map((x) => `<div class="st-li">· ${ui.esc(x)}</div>`).join('')}
          </div>
          <div>
            <div class="st-col-t">能得到什么</div>
            ${k.gain.map((x) => `<div class="st-li">· ${ui.esc(x)}</div>`).join('')}
          </div>
        </div>
      </div>`,
    ).join('')}

    <div class="card card-pad mt12">
      <div class="strong mb8">📌 审核与结算</div>
      <div class="small muted" style="line-height:1.9">
        1. 提交申请后 1~3 个工作日内审核<br>
        2. 通过后会在下方「已通过的主理人」里展示（不公开你的手机号）<br>
        3. 合作方式与分成比例按城市/行业/渠道单独约定<br>
        4. 一切以书面协议为准，平台不收取任何入驻费用
      </div>
    </div>

    ${mineHtml(mine)}

    ${
      approved.length
        ? `<div class="card card-pad mt12">
            <div class="strong mb8">👥 已通过的主理人（${approved.length}）</div>
            ${approved
              .slice(0, 20)
              .map(
                (s) => `<div class="st-row">
                  <span class="st-row-kind">${ui.esc(s.kindName || '')}</span>
                  <span class="st-row-name">${ui.esc(s.name || '')}</span>
                  <span class="st-row-meta">${ui.esc([s.city, s.industry, s.channel].filter(Boolean).join(' · '))}</span>
                </div>`,
              )
              .join('')}
          </div>`
        : ''
    }

    <div class="tiny dim center mt16" style="padding-bottom:24px">
      对合作方式有疑问？<a href="#/contact-us" style="color:#0b74ff">写信给管理员 ›</a>
    </div>
  </div>`;

  return {
    title: '成为主理人',
    content: html,
    showBack: true,
    mount(root) {
      const openForm = (kindId) => {
        const k = KINDS.find((x) => x.id === kindId);
        if (!k) return;
        const mask = document.createElement('div');
        mask.className = 'cbook-mask';
        mask.innerHTML = `<div class="cbook-sheet cbook-form">
          <div class="cbook-head">
            <div class="strong">${k.icon} 申请${ui.esc(k.name)}</div>
            <button class="cbook-x" type="button" aria-label="关闭">✕</button>
          </div>
          <div class="cbook-fields">
            <label class="cbook-label">${ui.esc(k.fieldLabel)} <span class="cbook-req">*必填</span></label>
            <input class="input" id="st-field" maxlength="60" placeholder="${ui.esc(k.placeholder)}">
            <label class="cbook-label">姓名 <span class="cbook-req">*必填</span></label>
            <input class="input" id="st-name" maxlength="40" value="${ui.esc(ctx.state.user?.nickname || '')}">
            <label class="cbook-label">手机号</label>
            <input class="input" id="st-phone" maxlength="20" inputmode="tel" value="${ui.esc(ctx.state.user?.phone || '')}">
            <label class="cbook-label">微信</label>
            <input class="input" id="st-wechat" maxlength="40" placeholder="微信号（选填）">
            <label class="cbook-label">你的资源 / 优势 <span class="tiny dim">（选填，但写清楚更容易过）</span></label>
            <textarea class="input" id="st-res" rows="3" maxlength="800" placeholder="例如：在杭州有 3 个产业园区关系，每年组织 6 场活动"></textarea>
            <label class="cbook-label">自我介绍 <span class="tiny dim">（选填）</span></label>
            <textarea class="input" id="st-intro" rows="2" maxlength="800"></textarea>
          </div>
          <button class="btn btn-primary btn-block mt12" id="st-submit" type="button">提交申请</button>
          <div class="tiny dim center mt8">1~3 个工作日审核，通过后会在这里显示</div>
        </div>`;
        document.body.appendChild(mask);
        const close = () => mask.remove();
        mask.querySelector('.cbook-x').addEventListener('click', close);
        mask.addEventListener('click', (e) => {
          if (e.target === mask) close();
        });
        mask.querySelector('#st-field').focus();

        mask.querySelector('#st-submit').addEventListener('click', async () => {
          const value = (mask.querySelector('#st-field').value || '').trim();
          const name = (mask.querySelector('#st-name').value || '').trim();
          const phone = (mask.querySelector('#st-phone').value || '').trim();
          const wechat = (mask.querySelector('#st-wechat').value || '').trim();
          if (!value) return ui.toast(`请填写${k.fieldLabel}`, 'err');
          if (!name) return ui.toast('请填写姓名', 'err');
          if (!phone && !wechat) return ui.toast('手机号或微信至少填一个', 'err');

          const body = {
            kind: k.id,
            name,
            phone,
            wechat,
            resources: (mask.querySelector('#st-res').value || '').trim(),
            intro: (mask.querySelector('#st-intro').value || '').trim(),
          };
          if (k.id === 'city') body.city = value;
          if (k.id === 'industry') body.industry = value;
          if (k.id === 'channel') body.channel = value;

          const btn = mask.querySelector('#st-submit');
          btn.disabled = true;
          btn.textContent = '提交中…';
          try {
            await service.stewardApply(body);
            ui.toast('已提交，审核通过后会通知你', 'ok');
            close();
            ctx.nav(`#/steward?t=${Date.now()}`);
          } catch (err) {
            ui.toast(err.message || '提交失败', 'err');
            btn.disabled = false;
            btn.textContent = '提交申请';
          }
        });
      };

      root.querySelectorAll('[data-apply]').forEach((btn) => {
        btn.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          openForm(btn.getAttribute('data-apply'));
        });
      });
    },
  };
}

export default { renderSteward };

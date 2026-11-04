/**
 * 小鱼来了 — 主理人（#/steward）
 *
 * 三类：城市主理人 / 行业主理人 / 渠道主理人
 *
 * 2026-11 起收年费，流程：
 *   提交申请 → 审核（1~3 工作日）→ 审核通过 → 付年费 → 管理员确认到账 → 开通一年
 *
 * 和服务商的区别：
 *   服务商 = 能干活的公司（EPC、设计、施工…）
 *   主理人 = 帮平台在一个城市 / 一个行业 / 一条渠道里张罗事的人
 */

import * as ui from './ui.js';
import { service, isLoggedIn } from './api.js';

/* 三类主理人的文案（价格从后台 meta 拿，前台不写死） */
const KIND_META = [
  {
    id: 'city',
    icon: '🏙️',
    name: '城市主理人',
    sub: '一个城市 / 一个区县',
    desc: '帮平台在你所在的城市组织活动、对接本地项目与资源。',
    need: ['本地人或有本地资源', '每月能组织 1 场活动', '能对接政府 / 园区 / 商协会'],
    gain: ['本市主理人独家身份', '本地活动优先推荐位', '本市项目线索优先对接', '活动收益分成'],
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
    gain: ['行业内容署名与曝光', '行业项目优先推送', '行业报告联合发布', '行业活动主讲席位'],
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
    gain: ['服务佣金 / 分成', '合作方案支持', '联合拜访与培训', '渠道专属物料'],
    field: 'channel',
    placeholder: '你的渠道类型，如：商协会 / 园区服务商 / 财税代理',
    fieldLabel: '渠道类型',
  },
];

const money = (n) => '¥' + Number(n || 0).toLocaleString('zh-CN');

const STATUS_TEXT = { pending: '审核中', approved: '已通过', rejected: '未通过' };
const STATUS_BADGE = { pending: 'warn', approved: 'ok', rejected: 'gray' };

function payLabel(s) {
  if (s.paymentStatus === 'paid' && s.expiresAt) {
    const t = Date.parse(s.expiresAt);
    const ok = Number.isFinite(t) && t > Date.now();
    return ok ? `年费有效至 ${ui.fmtDate(s.expiresAt)}` : '年费已到期';
  }
  if (s.paymentStatus === 'claimed') return '已提交付款，等待核对';
  if (s.status === 'approved') return '待支付年费';
  return '';
}

function mineHtml(items) {
  if (!items.length) return '';
  return `<div class="card card-pad mt12">
    <div class="strong mb8">📋 我的主理人申请</div>
    ${items
      .map((s) => {
        const pay = payLabel(s);
        // 申请提交后就能付：只要没被驳回、钱还没到账，就给付款入口
        const needPay = s.status !== 'rejected' && s.paymentStatus !== 'paid';
        return `<div class="st-mine">
          <div class="st-mine-head">
            <span class="st-mine-name">${ui.esc(s.kindName || '')}</span>
            <span class="badge ${STATUS_BADGE[s.status] || 'gray'}">${STATUS_TEXT[s.status] || s.status}</span>
          </div>
          <div class="st-mine-meta">${ui.esc(
            [s.city, s.industry, s.channel].filter(Boolean).join(' · ') || '未填写定位',
          )} · ${ui.fmtRelative(s.createdAt)}</div>
          <div class="st-mine-fee">年费 ${money(s.fee)} / 年${pay ? ' · ' + ui.esc(pay) : ''}</div>
          ${s.reason ? `<div class="st-mine-reason">原因：${ui.esc(s.reason)}</div>` : ''}
          ${
            needPay
              ? `<button class="btn btn-sm btn-primary mt8" type="button" data-pay="${ui.esc(s.id)}" data-fee="${s.fee}" data-kindname="${ui.esc(
                  s.kindName || '',
                )}">💳 支付年费 ${money(s.fee)}</button>`
              : ''
          }
        </div>`;
      })
      .join('')}
  </div>`;
}

export async function renderSteward(ctx) {
  if (!isLoggedIn()) {
    ctx.nav(`#/login?redirect=${encodeURIComponent('#/steward')}`);
    return { title: '成为主理人', content: '<div class="page"><div class="empty">正在跳转登录…</div></div>' };
  }

  const [metaRes, mineRes, listRes, payRes] = await Promise.all([
    service.stewardMeta().catch(() => ({})),
    service.stewardMine().catch(() => ({ items: [] })),
    service.stewards({}).catch(() => ({ items: [] })),
    service.levels().catch(() => ({})),
  ]);
  const counts = metaRes?.counts || {};
  const fees = metaRes?.fees || {};
  const payCfg = payRes?.payment || {};
  const mine = mineRes?.items || [];
  const active = listRes?.items || [];

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

    <div class="card card-pad mt12">
      <div class="strong mb8">💳 关于年费</div>
      <div class="small muted" style="line-height:1.9">
        · 主理人是<b>独家身份</b>（一个城市 / 一个行业 / 一条渠道只授权一位），所以要收年费，
          避免占坑不用。<br>
        · 流程：提交申请（<b>同时即可付款</b>）→ 审核 1~3 个工作日 + 确认到账 → 开通一年。<br>
        · 审核与付款并行：钱先到、审核后通过，两者都齐了才开通主理人身份。<br>
        · <b>若审核未通过，已付年费原路全额退回</b>；开通后 30 天内不满意也可申请全额退款。<br>
        · 年费到期前 30 天会提醒续费，不续则自动下架主理人身份。
      </div>
    </div>

    ${KIND_META.map(
      (k) => `<div class="st-card" data-kind-card="${k.id}">
        <div class="st-card-head">
          <div class="st-card-ico">${k.icon}</div>
          <div class="st-card-title">
            <div class="st-card-name">${ui.esc(k.name)}</div>
            <div class="st-card-sub">${ui.esc(k.sub)}</div>
          </div>
          <button class="btn btn-sm btn-primary" data-apply="${k.id}" type="button">申请</button>
        </div>
        <div class="st-fee">年费 <b>${money(fees[k.id] || 0)}</b> / 年</div>
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

    ${mineHtml(mine)}

    ${
      active.length
        ? `<div class="card card-pad mt12">
            <div class="strong mb8">👥 已开通的主理人（${active.length}）</div>
            ${active
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
      /* ---------------- 申请表单 ---------------- */
      const openForm = (kindId) => {
        const k = KIND_META.find((x) => x.id === kindId);
        if (!k) return;
        const fee = fees[k.id] || 0;
        const mask = document.createElement('div');
        mask.className = 'cbook-mask';
        mask.innerHTML = `<div class="cbook-sheet cbook-form">
          <div class="cbook-head">
            <div class="strong">${k.icon} 申请${ui.esc(k.name)}</div>
            <button class="cbook-x" type="button" aria-label="关闭">✕</button>
          </div>
          <div class="st-form-fee">年费 <b>${money(fee)}</b> / 年 · 审核通过后支付</div>
          <div class="cbook-fields">
            <label class="cbook-label">${ui.esc(k.fieldLabel)} <span class="cbook-req">*必填</span></label>
            <input class="input" id="st-field" maxlength="60" placeholder="${ui.esc(k.placeholder)}">
            <label class="cbook-label">姓名 <span class="cbook-req">*必填</span></label>
            <input class="input" id="st-name" maxlength="40" value="${ui.esc(ctx.state.user?.nickname || '')}">
            <label class="cbook-label">手机号</label>
            <input class="input" id="st-phone" maxlength="20" inputmode="tel" value="${ui.esc(ctx.state.user?.phone || '')}">
            <label class="cbook-label">微信</label>
            <input class="input" id="st-wechat" maxlength="40" placeholder="微信号（选填）">
            <label class="cbook-label">你的资源 / 优势 <span class="tiny dim">（选填，写清楚更容易过）</span></label>
            <textarea class="input" id="st-res" rows="3" maxlength="800" placeholder="例如：在杭州有 3 个产业园区关系，每年组织 6 场活动"></textarea>
            <label class="cbook-label">自我介绍 <span class="tiny dim">（选填）</span></label>
            <textarea class="input" id="st-intro" rows="2" maxlength="800"></textarea>
            <label class="st-agree">
              <input type="checkbox" id="st-agree-fee">
              <span>我已知晓：审核通过后需支付年费 <b>${money(fee)}</b>，才能开通主理人身份</span>
            </label>
          </div>
          <button class="btn btn-primary btn-block mt12" id="st-submit" type="button">提交申请</button>
          <div class="tiny dim center mt8">提交后可直接付款，审核 1~3 个工作日；未通过全额退款</div>
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
          const agreed = mask.querySelector('#st-agree-fee').checked;
          if (!value) return ui.toast(`请填写${k.fieldLabel}`, 'err');
          if (!name) return ui.toast('请填写姓名', 'err');
          if (!phone && !wechat) return ui.toast('手机号或微信至少填一个', 'err');
          if (!agreed) return ui.toast('请先勾选「已知晓年费」', 'err');

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
            const r = await service.stewardApply(body);
            const app = r?.application || r || {};
            close();
            ui.toast('申请已提交，可直接付款', 'ok');
            /*
             * 提交后直接进付款：审核与付款并行，
             * 钱到账 + 审核通过 → 开通一年；审核没过则全额退款。
             */
            if (app.id) openPay(app.id, app.fee || fee, k.name);
            else ctx.nav(`#/steward?t=${Date.now()}`);
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

      /* ---------------- 付年费（扫码 / 转账 + 我已付款） ---------------- */
      const openPay = (id, fee, kindName) => {
        const pay = payCfg || {};
        const mask = document.createElement('div');
        mask.className = 'cbook-mask';
        mask.innerHTML = `<div class="cbook-sheet cbook-form">
          <div class="cbook-head">
            <div>
              <div class="strong">💳 支付年费</div>
              <div class="tiny dim">${ui.esc(kindName)} · ${money(fee)} / 年</div>
            </div>
            <button class="cbook-x" type="button" aria-label="关闭">✕</button>
          </div>
          <div class="pay-tabs" style="margin-top:10px">
            <button class="pay-tab on" data-mode="wechat" type="button">💚 微信</button>
            <button class="pay-tab" data-mode="alipay" type="button">💙 支付宝</button>
            <button class="pay-tab" data-mode="bank" type="button">🏦 银行卡</button>
          </div>
          <div class="pay-body">
            <div class="pay-pane" data-pane="wechat">
              ${
                pay.wechatQr
                  ? `<img class="pay-qr" src="${ui.esc(ui.safeUrl(pay.wechatQr))}" alt="微信收款码">
                     <div class="pay-qr-tip">微信「扫一扫」付款</div>
                     ${pay.wechatName ? `<div class="pay-qr-name">收款人：${ui.esc(pay.wechatName)}</div>` : ''}`
                  : '<div class="empty">暂未配置微信收款码，请用银行卡转账</div>'
              }
            </div>
            <div class="pay-pane hide" data-pane="alipay">
              ${
                pay.alipayQr
                  ? `<img class="pay-qr" src="${ui.esc(ui.safeUrl(pay.alipayQr))}" alt="支付宝收款码">
                     <div class="pay-qr-tip">支付宝「扫一扫」付款</div>
                     ${pay.alipayName ? `<div class="pay-qr-name">收款人：${ui.esc(pay.alipayName)}</div>` : ''}`
                  : '<div class="empty">暂未配置支付宝收款码</div>'
              }
            </div>
            <div class="pay-pane hide" data-pane="bank">
              ${
                pay.bankAccount
                  ? `<div class="pay-bank">
                       <div class="pay-bank-row"><span>开户行</span><b>${ui.esc(pay.bankName || '—')}</b></div>
                       <div class="pay-bank-row"><span>户名</span><b>${ui.esc(pay.bankHolder || '—')}</b></div>
                       <div class="pay-bank-row hi"><span>卡号</span><b class="pay-card" data-copy="${ui.esc(
                         pay.bankAccount,
                       )}">${ui.esc(pay.bankAccount)}</b></div>
                     </div>
                     <button class="btn btn-outline btn-block mt8" id="st-copy-card" type="button">复制卡号</button>
                     <div class="pay-qr-tip">转账后请点下方「我已付款」</div>`
                  : '<div class="empty">暂未配置银行卡信息，请联系管理员</div>'
              }
            </div>
          </div>
          <button class="btn btn-primary btn-block mt12" id="st-paid" type="button">我已付款</button>
          <div class="tiny dim center mt8">管理员核对到账后开通（一般 1 个工作日内）</div>
        </div>`;
        document.body.appendChild(mask);
        const close = () => mask.remove();
        mask.querySelector('.cbook-x').addEventListener('click', close);
        mask.addEventListener('click', (e) => {
          if (e.target === mask) close();
        });
        mask.querySelector('.pay-tabs').addEventListener('click', (e) => {
          const b = e.target.closest('[data-mode]');
          if (!b) return;
          mask.querySelectorAll('.pay-tab').forEach((x) => x.classList.toggle('on', x === b));
          mask.querySelectorAll('.pay-pane').forEach((p) => {
            p.classList.toggle('hide', p.getAttribute('data-pane') !== b.dataset.mode);
          });
        });
        mask.querySelector('#st-copy-card')?.addEventListener('click', async () => {
          const { copyWithFeedback } = await import('./clipboard.js');
          await copyWithFeedback(String(pay.bankAccount || ''), { okText: '卡号已复制' }, ui);
        });

        mask.querySelector('#st-paid').addEventListener('click', async () => {
          const btn = mask.querySelector('#st-paid');
          btn.disabled = true;
          btn.textContent = '提交中…';
          try {
            await service.stewardClaimPaid(id);
            ui.toast('已提交，管理员核对到账后开通', 'ok');
            close();
            ctx.nav(`#/steward?t=${Date.now()}`);
          } catch (err) {
            ui.toast(err.message || '提交失败', 'err');
            btn.disabled = false;
            btn.textContent = '我已付款';
          }
        });
      };

      root.querySelectorAll('[data-pay]').forEach((btn) => {
        btn.addEventListener('click', (e) => {
          e.preventDefault();
          openPay(btn.getAttribute('data-pay'), Number(btn.getAttribute('data-fee')) || 0, btn.getAttribute('data-kindname') || '');
        });
      });
    },
  };
}

export default { renderSteward };

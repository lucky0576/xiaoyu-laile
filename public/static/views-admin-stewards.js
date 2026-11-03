/**
 * 小鱼来了 — 后台：主理人审核
 *
 * 三个页签：
 *   待审核   刚提交的申请 → 通过 / 驳回（填原因）
 *   已通过   审核过了 → 看缴费状态，确认到账 / 撤销
 *   已驳回   留档
 *
 * 为什么要有这个页面：
 *   主理人现在是收费的（年费），审核和确认到账是两个动作，
 *   以前只能靠接口或直接看数据库，很容易漏单。
 */

import * as ui from './ui.js';
import { service } from './api.js';

const KIND_ICON = { city: '🏙️', industry: '🏭', channel: '🔗' };
const PAY_TEXT = {
  unpaid: '待支付',
  claimed: '已声明付款 · 待核对',
  paid: '已到账',
  expired: '已到期',
};

const money = (n) => '¥' + Number(n || 0).toLocaleString('zh-CN');

function payBadge(s) {
  if (s.paymentStatus === 'paid') {
    const t = Date.parse(s.expiresAt || '');
    const ok = Number.isFinite(t) && t > Date.now();
    return `<span class="badge ${ok ? 'ok' : 'gray'}">${ok ? '已开通 · 至 ' + ui.fmtDate(s.expiresAt) : '年费已到期'}</span>`;
  }
  if (s.paymentStatus === 'claimed') return '<span class="badge warn">已声明付款 · 待核对</span>';
  return '<span class="badge gray">待支付年费</span>';
}

function card(s, tab) {
  const locate = [s.city, s.industry, s.channel].filter(Boolean).join(' · ');
  return `<div class="as-card" data-id="${ui.esc(s.id)}">
    <div class="as-head">
      <div class="as-kind">${KIND_ICON[s.kind] || '🤝'} ${ui.esc(s.kindName || '')}</div>
      <div class="row gap6">
        ${payBadge(s)}
      </div>
    </div>
    <div class="as-name">${ui.esc(s.name || '未填姓名')} <span class="tiny dim">${ui.esc(locate || '未填定位')}</span></div>
    <div class="as-meta">
      ${s.phone ? `<span>📱 ${ui.esc(s.phone)}</span>` : ''}
      ${s.wechat ? `<span>💬 ${ui.esc(s.wechat)}</span>` : ''}
      <span>💰 ${money(s.fee)} / 年</span>
      <span>🕒 ${ui.fmtRelative(s.createdAt)}</span>
    </div>
    ${s.resources ? `<div class="as-block"><b>资源：</b>${ui.esc(s.resources)}</div>` : ''}
    ${s.intro ? `<div class="as-block"><b>介绍：</b>${ui.esc(s.intro)}</div>` : ''}
    ${s.reason ? `<div class="as-block as-reason"><b>驳回原因：</b>${ui.esc(s.reason)}</div>` : ''}
    <div class="as-actions">
      ${
        tab === 'pending'
          ? `<button class="btn btn-sm btn-primary" data-act="approve" type="button">通过</button>
             <button class="btn btn-sm" data-act="reject" type="button">驳回</button>`
          : ''
      }
      ${
        tab === 'approved' && s.status === 'approved'
          ? s.paymentStatus === 'paid'
            ? `<button class="btn btn-sm" data-act="unpay" type="button">撤销到账</button>`
            : `<button class="btn btn-sm btn-primary" data-act="pay" type="button">确认到账 ¥${Number(s.fee || 0)}</button>`
          : ''
      }
    </div>
  </div>`;
}

export async function renderAdminStewards(ctx, params = {}) {
  const me = ctx.state.user;
  if (!me || !me.isAdmin) {
    return { title: '主理人审核', content: ui.emptyState('🔒', '需要管理员权限'), showBack: true };
  }
  const tab = ['pending', 'approved', 'all'].includes(params.tab) ? params.tab : 'pending';

  const res = await service.adminStewards({ status: tab }).catch(() => null);
  const items = res?.items || [];
  const raw = await service.stewardMineProbe?.();

  const tabs = [
    { id: 'pending', name: '待审核' },
    { id: 'approved', name: '已通过 / 缴费' },
    { id: 'all', name: '全部' },
  ];

  const html = `<div class="page">
    <div class="row between mb8" style="align-items:baseline">
      <div class="strong" style="font-size:17px">🤝 主理人审核</div>
      <span class="tiny dim">${items.length} 条</span>
    </div>
    <div class="chips scroll mb12">
      ${tabs
        .map((t) => `<a class="chip ${t.id === tab ? 'active' : ''}" href="#/admin-stewards?tab=${t.id}">${t.name}</a>`)
        .join('')}
    </div>
    <div class="as-list">
      ${items.length ? items.map((s) => card(s, tab)).join('') : ui.emptyState('📭', tab === 'pending' ? '没有待审核的申请' : '暂无记录')}
    </div>
    <div class="tiny dim center mt16" style="padding-bottom:20px">
      年费到账后点「确认到账」，主理人身份立即生效一年
    </div>
  </div>`;

  return {
    title: '主理人审核',
    content: html,
    showBack: true,
    noTab: true,
    async mount(root) {
      root.querySelectorAll('.as-actions').forEach((bar) => {
        bar.addEventListener('click', async (e) => {
          const btn = e.target.closest('[data-act]');
          if (!btn) return;
          const cardEl = bar.closest('.as-card');
          const id = cardEl?.getAttribute('data-id');
          if (!id) return;
          const act = btn.getAttribute('data-act');

          if (act === 'approve') {
            try {
              await service.adminStewardReview(id, { status: 'approved' });
              ui.toast('已通过，等待用户付年费', 'ok');
              ctx.nav(`#/admin-stewards?tab=${tab}&t=${Date.now()}`);
            } catch (err) {
              ui.toast(err.message || '操作失败', 'err');
            }
            return;
          }
          if (act === 'reject') {
            const reason = await ui.promptDialog({
              title: '驳回申请',
              label: '驳回原因（会展示给申请人）',
              value: '资料不足，请补充后重新提交',
              multiline: true,
              okText: '确认驳回',
            });
            if (!reason) return;
            try {
              await service.adminStewardReview(id, { status: 'rejected', reason });
              ui.toast('已驳回', 'ok');
              ctx.nav(`#/admin-stewards?tab=${tab}&t=${Date.now()}`);
            } catch (err) {
              ui.toast(err.message || '操作失败', 'err');
            }
            return;
          }
          if (act === 'pay' || act === 'unpay') {
            const ok = await ui.confirmDialog({
              title: act === 'pay' ? '确认到账' : '撤销到账',
              message:
                act === 'pay'
                  ? '确认已收到这笔年费？确认后立即开通一年。'
                  : '撤销后主理人身份立即失效（有效期清空）。',
              danger: act === 'unpay',
              okText: act === 'pay' ? '确认已到账' : '确认撤销',
            });
            if (!ok) return;
            try {
              await service.adminStewardPay(id, { status: act === 'pay' ? 'paid' : 'unpaid' });
              ui.toast(act === 'pay' ? '已开通一年' : '已撤销', 'ok');
              ctx.nav(`#/admin-stewards?tab=${tab}&t=${Date.now()}`);
            } catch (err) {
              ui.toast(err.message || '操作失败', 'err');
            }
          }
        });
      });
    },
  };
}

export default { renderAdminStewards };

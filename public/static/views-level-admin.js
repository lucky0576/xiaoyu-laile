/**
 * 小鱼来了 — 会员订单管理（管理员）
 *
 * #/admin-level-orders
 *   待确认 / 已确认 / 已驳回 三栏
 *   确认到账 → 自动激活用户会员并通知
 */

import { service } from './api.js';
import * as ui from './ui.js';

const MODE_NAME = { wechat: '💚 微信', alipay: '💙 支付宝', bank: '🏦 银行卡' };
const STATUS = {
  pending: { t: '待确认', c: 'lo-pending' },
  paid: { t: '已确认', c: 'lo-paid' },
  rejected: { t: '已驳回', c: 'lo-rejected' },
};

function rel(iso) {
  if (!iso) return '';
  const t = Date.parse(iso);
  if (!t) return '';
  const d = Date.now() - t;
  if (d < 60_000) return '刚刚';
  if (d < 3600_000) return `${Math.floor(d / 60_000)} 分钟前`;
  if (d < 86400_000) return `${Math.floor(d / 3600_000)} 小时前`;
  if (d < 7 * 86400_000) return `${Math.floor(d / 86400_000)} 天前`;
  return new Date(t).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function row(o) {
  const st = STATUS[o.status] || STATUS.pending;
  return `<div class="card card-pad mt12 lo-card">
    <div class="row between mb8">
      <span class="lo-status ${st.c}">${st.t}</span>
      <span class="tiny dim">${rel(o.createdAt)}</span>
    </div>
    <div class="lo-main">
      <div class="lo-lv">${ui.esc(o.levelName || o.level)}</div>
      <div class="lo-amt">¥${o.price}</div>
    </div>
    <div class="lo-meta">
      <span>下单人</span><b>${ui.esc(o.userName || '—')}</b>
      <span>手机</span><b>${ui.esc(o.userPhone || '—')}</b>
      <span>付款方式</span><b>${MODE_NAME[o.payMode] || ui.esc(o.payMode || '—')}</b>
      ${o.payerNote ? `<span>转账备注</span><b>${ui.esc(o.payerNote)}</b>` : ''}
      ${o.confirmedAt ? `<span>确认时间</span><b>${rel(o.confirmedAt)}</b>` : ''}
      ${o.expiresAt ? `<span>有效期至</span><b>${String(o.expiresAt).slice(0, 10)}</b>` : ''}
      ${o.rejectReason ? `<span>驳回原因</span><b>${ui.esc(o.rejectReason)}</b>` : ''}
    </div>
    ${
      o.status === 'pending'
        ? `<div class="row gap8 mt12">
            <button class="btn btn-primary grow" data-confirm="${ui.esc(o.id)}" type="button">✅ 确认到账并开通</button>
            <button class="btn btn-outline" data-reject="${ui.esc(o.id)}" type="button" style="flex:none;color:#c0392b">驳回</button>
          </div>`
        : ''
    }
  </div>`;
}

export async function renderAdminLevelOrders(ctx) {
  const cur = ctx.query?.status || 'pending';
  const res = await service.adminLevelOrders({ status: cur }).catch(() => null);
  const items = res?.items || [];
  const stats = res?.stats || {};

  const tabs = [
    ['pending', `待确认 ${stats.pending ?? 0}`],
    ['paid', `已确认 ${stats.paid ?? 0}`],
    ['rejected', `已驳回 ${stats.rejected ?? 0}`],
    ['', '全部'],
  ];

  return {
    title: '会员订单',
    showBack: true,
    content: `<div class="page">
      <div class="card card-pad">
        <div class="row between">
          <div class="strong">💰 会员订单</div>
          <span class="tiny dim">${stats.pending ? `${stats.pending} 条待确认` : ''}</span>
        </div>
        <div class="news-tabs mt8">
          ${tabs.map(([k, label]) => `<a class="news-tab ${cur === k ? 'active' : ''}" href="#/admin-level-orders${k ? `?status=${k}` : ''}">${ui.esc(label)}</a>`).join('')}
        </div>
      </div>
      ${
        items.length
          ? items.map(row).join('')
          : '<div class="empty">暂无订单</div>'
      }
    </div>`,
    mount(root) {
      root.querySelectorAll('[data-confirm]').forEach((b) => {
        b.addEventListener('click', async () => {
          const card = b.closest('.lo-card');
          const who = card?.querySelector('.lo-meta b')?.textContent || '';
          const ok = await ui.confirmDialog({
            title: '确认到账',
            message: `确认已收到 ${who} 的款项？确认后立即开通会员并通知对方。`,
            okText: '确认开通',
          });
          if (!ok) return;
          b.disabled = true;
          b.textContent = '处理中…';
          try {
            await service.adminLevelConfirm(b.dataset.confirm);
            ui.toast('已确认，会员已开通', 'ok');
            ctx.nav('#/admin-level-orders?t=' + Date.now());
          } catch (err) {
            ui.toast(err.message || '操作失败', 'err');
            b.disabled = false;
            b.textContent = '✅ 确认到账并开通';
          }
        });
      });

      root.querySelectorAll('[data-reject]').forEach((b) => {
        b.addEventListener('click', async () => {
          const reason = await ui.promptDialog({
            title: '驳回订单',
            label: '原因（会通知用户）',
            placeholder: '例如：未收到对应款项',
            multiline: true,
            okText: '驳回',
          });
          if (reason === null) return;
          try {
            await service.adminLevelReject(b.dataset.reject, reason || '');
            ui.toast('已驳回', 'ok');
            ctx.nav('#/admin-level-orders?t=' + Date.now());
          } catch (err) {
            ui.toast(err.message || '操作失败', 'err');
          }
        });
      });
    },
  };
}

export default { renderAdminLevelOrders };

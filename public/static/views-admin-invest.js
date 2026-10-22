/**
 * 小鱼来了 — 投资管理后台
 *
 * 路由：#/admin-invest
 * 功能：查看所有投资意向、预览打款凭证、核验通过/驳回、募集统计
 */

import { service, isLoggedIn } from './api.js';
import * as ui from './ui.js';

const STATUS_TABS = [
  { k: 'all', t: '全部' },
  { k: 'pending', t: '待确认' },
  { k: 'confirmed', t: '待打款' },
  { k: 'proof_uploaded', t: '待核验' },
  { k: 'verified', t: '已完成' },
  { k: 'rejected', t: '已驳回' },
];

function num(n) {
  return Number(n || 0).toLocaleString('zh-CN');
}
function money(n) {
  return `${num(n)} 万元`;
}
function fmt(v, withTime = false) {
  if (!v) return '—';
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return '—';
  const p = (x) => String(x).padStart(2, '0');
  const day = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  return withTime ? `${day} ${p(d.getHours())}:${p(d.getMinutes())}` : day;
}
function isImg(url) {
  return /\.(png|jpe?g|webp|gif)$/i.test(String(url || ''));
}

export async function renderAdminInvest(ctx, query) {
  if (!isLoggedIn()) {
    ctx.nav('#/login?redirect=' + encodeURIComponent('#/admin-invest'));
    return { title: '投资管理', content: '<div class="page"></div>' };
  }
  // 登录态可能还没拉回来（例如直接打开链接），先补一次再判断权限
  if (!ctx.state.user?.isAdmin && typeof ctx.refreshMe === 'function') {
    await ctx.refreshMe().catch(() => null);
  }
  if (!ctx.state.user?.isAdmin) {
    return { title: '投资管理', content: ui.emptyState('🔒', '需要管理员权限'), showBack: true };
  }

  const active = query.status || 'proof_uploaded';
  const [res, allRes, planRes] = await Promise.all([
    service.adminInvest(active).catch(() => ({ items: [], total: 0 })),
    service.adminInvest('all').catch(() => ({ items: [] })),
    service.investPlan().catch(() => null),
  ]);

  const plan = planRes?.plan || { raiseAmount: 100, minInvest: 5 };
  const all = allRes.items || [];
  const items = res.items || [];

  /* ---------- 统计 ---------- */
  const raised = all.filter((i) => i.status === 'verified').reduce((s, i) => s + Number(i.amount || 0), 0);
  const pledged = all
    .filter((i) => ['confirmed', 'proof_uploaded'].includes(i.status))
    .reduce((s, i) => s + Number(i.amount || 0), 0);
  const pendingCount = all.filter((i) => i.status === 'proof_uploaded').length;
  const investors = new Set(all.filter((i) => i.status === 'verified').map((i) => i.phone)).size;
  const remain = Math.max(0, Number(plan.raiseAmount) - raised);

  const tabs = STATUS_TABS.map(
    (t) =>
      `<a class="chip ${t.k === active ? 'active' : ''}" href="#/admin-invest?status=${t.k}">${t.t}${
        t.k === 'proof_uploaded' && pendingCount ? ` (${pendingCount})` : ''
      }</a>`
  ).join('');

  /* ---------- 列表 ---------- */
  const card = (i) => {
    const canVerify = i.status === 'proof_uploaded';
    const proofHtml = i.proof
      ? `<div class="ai-proof">
          <div class="ai-proof-l">
            ${isImg(i.proof.url)
              ? `<img src="${ui.esc(ui.safeUrl(i.proof.url))}" alt="打款凭证" onclick="window.open(this.src,'_blank')">`
              : `<a class="btn btn-sm btn-outline" href="${ui.esc(ui.safeUrl(i.proof.url))}" target="_blank" rel="noopener">查看凭证文件</a>`}
          </div>
          <div class="ai-proof-r">
            <div><span>凭证文件</span><b>${ui.esc(i.proof.name || '')}</b></div>
            <div><span>上传时间</span><b>${fmt(i.proof.uploadedAt, true)}</b></div>
            ${i.proof.note ? `<div><span>备注</span><b>${ui.esc(i.proof.note)}</b></div>` : ''}
          </div>
        </div>`
      : '';

    return `<div class="ai-card" data-id="${ui.esc(i.id)}">
      <div class="ai-card-head">
        <div>
          <div class="ai-name">${ui.esc(i.name)} <span class="ai-phone">${ui.esc(i.phone)}</span></div>
          <div class="ai-meta">
            <span>提交 ${fmt(i.createdAt, true)}</span>
            ${i.agreementNo ? `<span>协议 ${ui.esc(i.agreementNo)}</span>` : ''}
            ${i.certNo ? `<span>股权证 ${ui.esc(i.certNo)}</span>` : ''}
          </div>
        </div>
        <span class="inv-badge inv-badge-${ui.esc(i.status)}">${ui.esc(i.statusName)}</span>
      </div>

      <div class="ai-amount">
        <div><span>认购金额</span><b>${money(i.amount)}</b></div>
        <div><span>认购股数</span><b>${num(i.shares)} 股</b></div>
        <div><span>占比</span><b>${((Number(i.amount) / Number(plan.raiseAmount || 100)) * Number(plan.stake || 10)).toFixed(2)}%</b></div>
      </div>

      ${i.note ? `<div class="ai-note">用户备注：${ui.esc(i.note)}</div>` : ''}
      ${i.rejectReason ? `<div class="ai-reject">驳回原因：${ui.esc(i.rejectReason)}</div>` : ''}
      ${proofHtml}

      ${
        canVerify
          ? `<div class="ai-actions">
              <button class="btn btn-sm btn-primary" data-act="approve" data-id="${ui.esc(i.id)}">核验通过</button>
              <button class="btn btn-sm" data-act="reject" data-id="${ui.esc(i.id)}">驳回</button>
            </div>`
          : ''
      }
    </div>`;
  };

  return {
    title: '投资管理',
    content: `<div class="page">
      <div class="ai-stats">
        <div><b>${money(raised)}</b><span>已到账</span></div>
        <div><b>${money(pledged)}</b><span>待核验</span></div>
        <div><b>${money(remain)}</b><span>剩余额度</span></div>
        <div><b>${investors}</b><span>投资人</span></div>
      </div>

      <div class="chips scroll mb12 mt12">${tabs}</div>

      ${items.length ? items.map(card).join('') : ui.emptyState('📭', '该状态下暂无记录')}
    </div>`,
    showBack: true,
    noTab: false,
    mount(root) {
      root.querySelectorAll('[data-act]').forEach((btn) => {
        btn.addEventListener('click', async () => {
          const id = btn.dataset.id;
          const act = btn.dataset.act;

          if (act === 'approve') {
            const ok = await ui.confirmDialog({
              title: '核验通过',
              message: '确认已收到该笔投资款？通过后将自动签发股权证。',
              okText: '通过并签发股权证',
            });
            if (!ok) return;
            btn.disabled = true;
            try {
              const r = await service.adminVerifyInvest(id, { agree: true, note: '金额与账户核对无误' });
              ui.toast(`已通过，股权证 ${r.interest.certNo}`, 'ok');
              ctx.nav(`#/admin-invest?status=proof_uploaded`, { replace: true });
            } catch (err) {
              ui.toast(err.message || '操作失败', 'err');
              btn.disabled = false;
            }
          } else {
            const reason = await ui.promptDialog({
              title: '驳回打款凭证',
              label: '驳回原因（会展示给投资人）',
              placeholder: '如：金额不符 / 未查询到该笔转账',
              multiline: true,
              okText: '确认驳回',
            });
            if (reason === null) return;
            btn.disabled = true;
            try {
              await service.adminVerifyInvest(id, { agree: false, note: reason || '' });
              ui.toast('已驳回', 'ok');
              ctx.nav(`#/admin-invest?status=proof_uploaded`, { replace: true });
            } catch (err) {
              ui.toast(err.message || '操作失败', 'err');
              btn.disabled = false;
            }
          }
        });
      });
    },
  };
}

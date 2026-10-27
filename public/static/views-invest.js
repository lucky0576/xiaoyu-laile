/**
 * 小鱼来了 — 种子轮融资
 *
 * 路由：
 *   #/invest                 融资方案 + 意向登记
 *   #/invest/mine            我的投资
 *   #/invest/:id             投资详情（确认 → 打款 → 上传凭证 → 股权证）
 *   #/invest/:id/agreement   投资协议书（可打印）
 *   #/invest/:id/cert        股权证（可打印）
 */

import { service, isLoggedIn, store } from './api.js';
import { openInvestShare } from './share.js';
import * as ui from './ui.js';

const FALLBACK_PLAN = {
  round: '种子轮',
  raiseAmount: 100,
  valuation: 1000,
  stake: 10,
  pricePerShare: 1,
  minInvest: 5,
  minShares: 5,
  totalShares: 1000,
  rights: '仅享有收益权，不享有投票权与经营权',
  usage: [
    { name: '平台建设', amount: 40, note: '产品迭代、服务器与带宽、AI 能力接入' },
    { name: '模式验证', amount: 35, note: '首批产业资源人招募与分佣体系跑通' },
    { name: '运维与合规', amount: 25, note: '日常运营、资质与合规投入' },
  ],
};

const STATUS_FLOW = ['pending', 'confirmed', 'proof_uploaded', 'verified'];
const STATUS_LABEL = {
  pending: '待确认',
  confirmed: '待打款',
  proof_uploaded: '待核验',
  verified: '已完成',
  rejected: '已驳回',
};

function num(n) {
  return Number(n || 0).toLocaleString('zh-CN');
}
function money(n) {
  return `${num(n)} 万元`;
}
function fmtDate(v, withTime = false) {
  if (!v) return '—';
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return '—';
  const p = (x) => String(x).padStart(2, '0');
  const day = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  return withTime ? `${day} ${p(d.getHours())}:${p(d.getMinutes())}` : day;
}
function maskCard(c) {
  const s = String(c || '').replace(/\s/g, '');
  if (s.length < 8) return c || '—';
  return `${s.slice(0, 4)} ${s.slice(4, 8)} **** **** ${s.slice(-4)}`;
}

/* ================================================================== */
/* 1. 融资方案 + 意向登记                                               */
/* ================================================================== */
export async function renderInvest(ctx) {
  const res = await service.investPlan().catch(() => null);
  const p = res?.plan || FALLBACK_PLAN;
  const q = res?.quota || {
    total: p.raiseAmount,
    used: 0,
    verified: 0,
    remaining: p.raiseAmount,
    percent: 0,
    closed: false,
    investors: 0,
  };

  const usageRows = (p.usage || [])
    .map(
      (u) => `<div class="inv-use-row">
        <div class="inv-use-name">${ui.esc(u.name)}</div>
        <div class="inv-use-bar"><i style="width:${Math.round((u.amount / p.raiseAmount) * 100)}%"></i></div>
        <div class="inv-use-amt">${u.amount} 万</div>
        <div class="inv-use-note">${ui.esc(u.note || '')}</div>
      </div>`
    )
    .join('');

  const quotaHtml = `<div class="card card-pad mt12">
    <div class="row between mb8">
      <div class="inv-sec-t" style="margin-bottom:0">募集进度</div>
      <div class="inv-quota-tag ${q.closed ? 'closed' : ''}">${q.closed ? '本轮已满' : '认购中'}</div>
    </div>
    <div class="inv-quota-bar"><i style="width:${q.percent}%"></i></div>
    <div class="inv-quota-nums">
      <div><b>${num(q.used)} 万</b><span>已认购</span></div>
      <div><b>${num(q.remaining)} 万</b><span>剩余额度</span></div>
      <div><b>${num(q.total)} 万</b><span>本轮总额</span></div>
      <div><b>${num(q.investors)}</b><span>意向人数</span></div>
    </div>
    ${q.closed
      ? `<div class="inv-warn mt12">本轮融资额度已认购完毕，暂不再接受新的投资意向。感谢关注。</div>`
      : `<div class="inv-tip">剩余额度 ${num(q.remaining)} 万元，单笔最低 ${num(p.minInvest)} 万元，先到先得。</div>`}
  </div>`;

  return {
    title: '小鱼来了融资',
    content: `<div class="page">
      <div class="inv-hero">
        <div class="inv-hero-badge">${ui.esc(p.round)}融资中</div>
        <div class="inv-hero-title">小鱼来了 · ${ui.esc(p.round)}融资</div>
        <div class="inv-hero-sub">让每一条好项目，都被对的人看见</div>
        <div class="inv-hero-nums">
          <div><b>${num(p.raiseAmount)}<i>万</i></b><span>融资总额</span></div>
          <div><b>${num(p.valuation)}<i>万</i></b><span>投后估值</span></div>
          <div><b>${num(p.stake)}<i>%</i></b><span>出让股份</span></div>
        </div>
        <div class="row gap8 mt12" style="justify-content:center;position:relative;z-index:2">
          <button class="btn btn-sm inv-share-btn" id="inv-share" type="button">📤 分享融资信息</button>
        </div>
      </div>

      ${quotaHtml}

      <div class="card card-pad mt12">
        <div class="inv-sec-t">认购规则</div>
        <div class="inv-kv">
          <div><span>每股价格</span><b>${num(p.pricePerShare)} 元 / 股</b></div>
          <div><span>总股本</span><b>${num(p.totalShares)} 万股</b></div>
          <div><span>最低起投</span><b>${num(p.minInvest)} 万元</b></div>
          <div><span>最低股数</span><b>${num(p.minShares)} 万股</b></div>
        </div>
        <div class="inv-formula">
          ${num(p.minInvest)} 万元 ÷ ${num(p.pricePerShare)} 元/股 = <b>${num(p.minShares)} 万股</b>
        </div>
        <div class="inv-tip">按 1 元/股计，本轮 ${num(p.raiseAmount)} 万元对应 ${num(p.raiseAmount / p.pricePerShare)} 万股，占投后总股本 ${num(p.totalShares)} 万股的 ${num(p.stake)}%。</div>
      </div>

      <div class="card card-pad mt12">
        <div class="inv-sec-t">投资人权利</div>
        <div class="inv-rights">
          <div class="inv-right inv-yes">
            <div class="inv-right-ico">✅</div>
            <div><div class="inv-right-t">收益权</div>
            <div class="inv-right-d">按持股比例享有公司分红与退出收益</div></div>
          </div>
          <div class="inv-right inv-no">
            <div class="inv-right-ico">❌</div>
            <div><div class="inv-right-t">投票权</div>
            <div class="inv-right-d">不参与股东会表决，不参与重大事项决策</div></div>
          </div>
          <div class="inv-right inv-no">
            <div class="inv-right-ico">❌</div>
            <div><div class="inv-right-t">经营权</div>
            <div class="inv-right-d">不参与公司日常经营管理</div></div>
          </div>
        </div>
        <div class="inv-warn">本轮投资仅享有<b>收益权</b>，不享有投票权与经营权。投资前请充分理解该安排。</div>
      </div>

      <div class="card card-pad mt12">
        <div class="inv-sec-t">资金用途（共 ${num(p.raiseAmount)} 万元）</div>
        ${usageRows}
      </div>

      <div class="card card-pad mt12">
        <div class="inv-sec-t">为什么是现在</div>
        <div class="inv-points">
          <div><b>产品已上线</b><span>项目 / 悬赏 / 活动 / 贸易 / 群聊 / 会议 / 论坛全模块可用</span></div>
          <div><b>技术底座自建</b><span>零第三方依赖，3 万行代码，909 项自动化测试</span></div>
          <div><b>模式已验证</b><span>AI + 产业资源人分佣，降低单个成交的边际成本</span></div>
          <div><b>赛道确定</b><span>新能源与算力产业对接，信息不对称长期存在</span></div>
        </div>
      </div>

      <div class="card card-pad mt12" id="inv-form-card">
        <div class="inv-sec-t">投资意向登记</div>
        ${q.closed ? `<div class="inv-closed">
          <div class="inv-closed-ico">🔒</div>
          <div class="inv-closed-t">本轮融资已满</div>
          <div class="inv-closed-d">${num(q.used)} 万元额度已全部认购完毕。<br>如有意参与下一轮，欢迎保持关注。</div>
          <a class="btn btn-outline btn-block mt12" href="#/invest/mine">查看我的投资</a>
        </div>` : `
        <div class="tiny dim mb12">提交后可在线确认意向、查看投资协议、上传打款凭证并领取股权证。</div>
        <div class="field">
          <label>姓名 <span style="color:var(--danger)">*</span></label>
          <input class="input" id="inv-name" maxlength="40" placeholder="真实姓名" value="${ui.esc(store.user?.nickname || '')}">
        </div>
        <div class="field">
          <label>手机号 <span style="color:var(--danger)">*</span></label>
          <input class="input" id="inv-phone" type="tel" maxlength="11" placeholder="11 位手机号" value="${ui.esc(store.user?.phone || '')}">
        </div>
        <div class="field">
          <label>意向认购金额（万元）<span style="color:var(--danger)">*</span></label>
          <input class="input" id="inv-amount" type="number" min="${p.minInvest}" max="${q.remaining}" step="1" placeholder="最低 ${p.minInvest} 万元，最多 ${q.remaining} 万元">
          <div class="tiny dim mt6" id="inv-shares-hint">对应股数：—</div>
        </div>
        <div class="field">
          <label>备注（选填）</label>
          <textarea class="input" id="inv-note" rows="2" maxlength="500" placeholder="你想了解的问题、可提供的资源等"></textarea>
        </div>
        <button class="btn btn-primary btn-block mt8" id="inv-submit">提交意向</button>
        `}
        <div class="center mt12 small"><a href="#/invest/mine">查看我的投资 ›</a></div>
      </div>

      <div class="inv-risk">
        <div class="inv-risk-t">⚠️ 风险提示与法律声明</div>
        <div class="inv-risk-b">
          <p>1. 本页面仅用于向特定对象展示融资方案并收集投资意向，<b>不构成公开募集、要约或要约邀请</b>。</p>
          <p>2. 本轮认购仅享有<b>收益权</b>，不享有投票权与经营权，投资人无法参与公司经营决策。</p>
          <p>3. 创业投资具有<b>高风险</b>，可能出现本金全部损失的情形，请确保投资金额在你的风险承受范围内。</p>
          <p>4. 本页所述财务数据、估值与业务情况基于当前经营状况，<b>不构成对未来收益的任何承诺</b>。</p>
          <p>5. 最终认购条件以双方签署的正式协议为准，本页面内容不具法律约束力。</p>
        </div>
      </div>
    </div>`,
    showBack: true,
    mount(root) {
      const $ = (s) => root.querySelector(s);

      /* 分享融资方案 */
      $('#inv-share')?.addEventListener('click', () => {
        openInvestShare(p, q).catch(() => ui.toast('生成分享内容失败', 'err'));
      });
      const amountEl = $('#inv-amount');
      const hintEl = $('#inv-shares-hint');

      amountEl?.addEventListener('input', () => {
        const v = Number(amountEl.value || 0);
        hintEl.textContent = v > 0 ? `对应股数：${num((v * 10000) / p.pricePerShare)} 股（按 ${p.pricePerShare} 元/股）` : '对应股数：—';
      });

      $('#inv-submit')?.addEventListener('click', async () => {
        const name = ($('#inv-name').value || '').trim();
        const phone = ($('#inv-phone').value || '').trim();
        const amount = Number($('#inv-amount').value || 0);
        const note = ($('#inv-note').value || '').trim();

        if (!name) return ui.toast('请填写姓名', 'err');
        if (!/^1[3-9]\d{9}$/.test(phone)) return ui.toast('请填写正确的手机号', 'err');
        if (amount < p.minInvest) return ui.toast(`最低认购 ${p.minInvest} 万元`, 'err');
        if (amount > q.remaining) return ui.toast(`剩余可认购额度仅 ${q.remaining} 万元`, 'err');

        const btn = $('#inv-submit');
        btn.disabled = true;
        btn.textContent = '提交中…';
        try {
          const r = await service.investInterest({ name, phone, amount, note });
          ui.toast('意向已提交', 'ok');
          ctx.nav('#/invest/' + r.interest.id);
        } catch (err) {
          ui.toast(err.message || '提交失败', 'err');
          btn.disabled = false;
          btn.textContent = '提交意向';
          // 额度变化（别人抢完了）时刷新页面数据
          if (err.code === 'round_closed' || err.code === 'over_quota') {
            setTimeout(() => ctx.nav('#/invest', { replace: true }), 1200);
          }
        }
      });
    },
  };
}

/* ================================================================== */
/* 2. 我的投资                                                          */
/* ================================================================== */
export async function renderMyInvest(ctx) {
  if (!isLoggedIn()) {
    ctx.nav('#/login?redirect=' + encodeURIComponent('#/invest/mine'));
    return { title: '我的投资', content: '<div class="page"></div>' };
  }
  const res = await service.myInvestInterests().catch(() => ({ items: [] }));
  const items = res.items || [];

  const row = (i) => `<a class="inv-list-row" href="#/invest/${ui.esc(i.id)}">
    <div class="inv-list-main">
      <div class="inv-list-t">${money(i.amount)} · ${num(i.shares)} 股</div>
      <div class="inv-list-m">
        <span>${fmtDate(i.createdAt, true)}</span>
        ${i.agreementNo ? `<span>协议 ${ui.esc(i.agreementNo)}</span>` : ''}
        ${i.certNo ? `<span>股权证 ${ui.esc(i.certNo)}</span>` : ''}
      </div>
    </div>
    <span class="inv-badge inv-badge-${ui.esc(i.status)}">${ui.esc(i.statusName)}</span>
  </a>`;

  return {
    title: '我的投资',
    content: `<div class="page">
      <div class="inv-sec-t">我的投资</div>
      ${items.length ? items.map(row).join('') : ui.emptyState('💰', '还没有投资记录', '<a class="btn btn-primary mt16" href="#/invest">去看看融资方案</a>')}
    </div>`,
    showBack: true,
  };
}

/* ================================================================== */
/* 3. 投资详情                                                          */
/* ================================================================== */
export async function renderInvestDetail(ctx, { id } = {}) {
  if (!isLoggedIn()) {
    ctx.nav('#/login?redirect=' + encodeURIComponent('#/invest/' + (id || '')));
    return { title: '投资详情', content: '<div class="page"></div>' };
  }
  const res = await service.investDetail(id).catch(() => null);
  if (!res?.interest) {
    return {
      title: '投资详情',
      content: ui.emptyState('🧭', '投资记录不存在或无权查看', '<a class="btn btn-primary mt16" href="#/invest/mine">返回我的投资</a>'),
      showBack: true,
    };
  }
  const i = res.interest;
  const plan = res.plan || FALLBACK_PLAN;

  /* 进度条 */
  const idx = STATUS_FLOW.indexOf(i.status);
  const steps = [
    { k: 'pending', t: '提交意向' },
    { k: 'confirmed', t: '确认协议' },
    { k: 'proof_uploaded', t: '上传凭证' },
    { k: 'verified', t: '获得股权证' },
  ];
  const progress = steps
    .map((s, n) => {
      const done = i.status !== 'rejected' && n <= idx;
      const cur = i.status !== 'rejected' && n === idx;
      return `<div class="inv-step ${done ? 'done' : ''} ${cur ? 'cur' : ''}">
        <div class="inv-step-dot">${done ? '✓' : n + 1}</div>
        <div class="inv-step-t">${s.t}</div>
      </div>`;
    })
    .join('');

  /* 各阶段内容 */
  let actionHtml = '';

  if (i.status === 'pending') {
    actionHtml = `<div class="card card-pad mt12">
      <div class="inv-sec-t">确认投资意向</div>
      <div class="tiny dim mb12">确认后系统将生成投资协议书，并展示收款账户。</div>
      <div class="inv-confirm-box">
        <div><span>认购金额</span><b>${money(i.amount)}</b></div>
        <div><span>认购股数</span><b>${num(i.shares)} 股</b></div>
        <div><span>每股价格</span><b>${num(plan.pricePerShare)} 元</b></div>
        <div><span>所占比例</span><b>${((i.amount / plan.valuation) * 100).toFixed(2)}%</b></div>
      </div>
      <div class="inv-warn mt12">本轮投资<b>仅享有收益权</b>，不享有投票权与经营权。确认即表示你已理解并接受该安排。</div>
      <button class="btn btn-primary btn-block mt12" id="iv-confirm">确认投资意向</button>
    </div>`;
  } else if (i.status === 'confirmed') {
    const b = i.bank || {};
    actionHtml = `<div class="card card-pad mt12">
      <div class="inv-sec-t">请按以下账户打款</div>
      <div class="inv-bank">
        <div class="inv-bank-row"><span>户名</span><b>${ui.esc(b.name || '—')}</b></div>
        <div class="inv-bank-row"><span>卡号</span><b class="mono">${ui.esc(b.card || '—')}</b>
          <button class="btn btn-sm btn-outline" id="iv-copy-card">复制</button></div>
        <div class="inv-bank-row"><span>开户行</span><b>${ui.esc(b.branch || '—')}</b></div>
        <div class="inv-bank-row"><span>打款金额</span><b style="color:var(--brand)">${money(i.amount)}</b></div>
        <div class="inv-bank-row"><span>打款备注</span><b>${ui.esc(i.agreementNo || '')} 投资款</b></div>
      </div>
      <div class="inv-warn mt12">⚠️ 请务必按上述金额打款，并在备注中填写协议编号，便于对账。</div>
      <a class="btn btn-outline btn-block mt12" href="#/invest/${ui.esc(i.id)}/agreement">查看投资协议书</a>
      <div class="inv-sec-t mt12">上传打款凭证</div>
      <div class="tiny dim mb12">上传银行转账截图或回单，我们会尽快核验。</div>
      <input type="file" id="iv-proof-file" accept="image/*,.pdf" class="input">
      <input class="input mt8" id="iv-proof-note" maxlength="200" placeholder="备注（选填），如打款时间、流水号">
      <button class="btn btn-primary btn-block mt12" id="iv-proof-submit">上传并提交核验</button>
    </div>`;
  } else if (i.status === 'proof_uploaded') {
    actionHtml = `<div class="card card-pad mt12">
      <div class="inv-sec-t">打款凭证已提交</div>
      <div class="tiny dim mb12">我们正在核验你的打款，通常 1 个工作日内完成。核验通过后自动签发股权证。</div>
      ${i.proof ? `<div class="inv-proof">
        <div class="inv-proof-meta">
          <div><span>凭证文件</span><b>${ui.esc(i.proof.name || '')}</b></div>
          <div><span>上传时间</span><b>${fmtDate(i.proof.uploadedAt, true)}</b></div>
          ${i.proof.note ? `<div><span>备注</span><b>${ui.esc(i.proof.note)}</b></div>` : ''}
        </div>
        ${/\.(png|jpe?g|webp|gif)$/i.test(i.proof.url || '') ? `<img src="${ui.esc(ui.safeUrl(i.proof.url))}" alt="打款凭证" class="inv-proof-img">` : `<a class="btn btn-outline btn-sm" href="${ui.esc(ui.safeUrl(i.proof.url))}" target="_blank" rel="noopener">查看凭证</a>`}
      </div>` : ''}
      <button class="btn btn-outline btn-block mt12" id="iv-reupload">重新上传凭证</button>
    </div>`;
  } else if (i.status === 'verified') {
    actionHtml = `<div class="card card-pad mt12">
      <div class="inv-sec-t">投资已确认完成</div>
      <div class="inv-done">
        <div class="inv-done-ico">🎉</div>
        <div class="inv-done-t">股权证已签发</div>
        <div class="inv-done-d">编号 ${ui.esc(i.certNo)} · 签发于 ${fmtDate(i.certIssuedAt)}</div>
      </div>
      <a class="btn btn-primary btn-block mt12" href="#/invest/${ui.esc(i.id)}/cert">查看股权证</a>
      <a class="btn btn-outline btn-block mt8" href="#/invest/${ui.esc(i.id)}/agreement">查看投资协议书</a>
    </div>`;
  } else if (i.status === 'rejected') {
    actionHtml = `<div class="card card-pad mt12">
      <div class="inv-sec-t" style="border-left-color:var(--danger)">核验未通过</div>
      <div class="inv-warn">${ui.esc(i.rejectReason || '打款凭证未能核验，请核对后重新提交')}</div>
      <button class="btn btn-primary btn-block mt12" id="iv-reupload">重新上传凭证</button>
    </div>`;
  }

  return {
    title: '投资详情',
    content: `<div class="page">
      <div class="inv-hero-sm">
        <div class="inv-hero-sm-t">${money(i.amount)} · ${num(i.shares)} 股</div>
        <div class="inv-hero-sm-s">${ui.esc(i.name)} · ${fmtDate(i.createdAt, true)}</div>
        ${i.agreementNo ? `<div class="inv-hero-sm-n">协议编号 ${ui.esc(i.agreementNo)}</div>` : ''}
      </div>

      <div class="inv-steps mt12">${progress}</div>

      ${actionHtml}

      <div class="inv-risk mt12">
        <div class="inv-risk-t">⚠️ 提示</div>
        <div class="inv-risk-b">
          <p>1. 本轮认购仅享有<b>收益权</b>，不享有投票权与经营权。</p>
          <p>2. 创业投资具有<b>高风险</b>，可能出现本金全部损失的情形。</p>
          <p>3. 打款前请务必核对收款账户与金额，谨防诈骗。</p>
        </div>
      </div>
    </div>`,
    showBack: true,
    mount(root) {
      const $ = (s) => root.querySelector(s);

      $('#iv-confirm')?.addEventListener('click', async () => {
        const ok = await ui.confirmDialog({
          title: '确认投资意向',
          message: `确认认购 ${money(i.amount)}（${num(i.shares)} 股）？确认后将生成投资协议书。`,
          okText: '确认',
        });
        if (!ok) return;
        try {
          await service.confirmInvest(i.id);
          ui.toast('已确认，请按页面账户打款', 'ok');
          ctx.nav(`#/invest/${i.id}`, { replace: true });
        } catch (err) {
          ui.toast(err.message || '操作失败', 'err');
        }
      });

      $('#iv-copy-card')?.addEventListener('click', async () => {
        const card = String((i.bank || {}).card || '').replace(/\s/g, '');
        if (!card) return ui.toast('卡号未配置', 'err');
        const done = await ui.copyText(card);
        ui.toast(done ? '卡号已复制' : '复制失败，请手动记录', done ? 'ok' : 'err');
      });

      const doUpload = async () => {
        const input = $('#iv-proof-file');
        const file = input?.files?.[0];
        if (!file) return ui.toast('请选择打款凭证文件', 'err');
        const btn = $('#iv-proof-submit') || $('#iv-reupload');
        if (btn) {
          btn.disabled = true;
          btn.textContent = '上传中…';
        }
        try {
          const fd = new FormData();
          fd.append('file', file, file.name);
          fd.append('note', ($('#iv-proof-note')?.value || '').trim());
          await service.uploadProof(i.id, fd);
          ui.toast('凭证已提交，等待核验', 'ok');
          ctx.nav(`#/invest/${i.id}`, { replace: true });
        } catch (err) {
          ui.toast(err.message || '上传失败', 'err');
          if (btn) {
            btn.disabled = false;
            btn.textContent = '上传并提交核验';
          }
        }
      };

      $('#iv-proof-submit')?.addEventListener('click', doUpload);

      $('#iv-reupload')?.addEventListener('click', async () => {
        // 已提交/被驳回时，直接弹出文件选择
        const pick = document.createElement('input');
        pick.type = 'file';
        pick.accept = 'image/*,.pdf';
        pick.onchange = async () => {
          if (!pick.files?.[0]) return;
          const fd = new FormData();
          fd.append('file', pick.files[0], pick.files[0].name);
          try {
            ui.showLoading('上传中…');
            await service.uploadProof(i.id, fd);
            ui.hideLoading();
            ui.toast('凭证已重新提交', 'ok');
            ctx.nav(`#/invest/${i.id}`, { replace: true });
          } catch (err) {
            ui.hideLoading();
            ui.toast(err.message || '上传失败', 'err');
          }
        };
        pick.click();
      });
    },
  };
}

/* ================================================================== */
/* 4. 投资协议书                                                        */
/* ================================================================== */
export async function renderAgreement(ctx, { id } = {}) {
  const res = await service.investDetail(id).catch(() => null);
  if (!res?.interest) {
    return { title: '投资协议书', content: ui.emptyState('🧭', '协议不存在'), showBack: true };
  }
  const i = res.interest;
  const plan = res.plan || FALLBACK_PLAN;
  const today = fmtDate(i.agreedAt || i.createdAt);

  return {
    title: '投资协议书',
    content: `<div class="page doc-page">
      <div class="doc-toolbar">
        <button class="btn btn-primary btn-sm" id="doc-print">打印 / 保存为 PDF</button>
        <a class="btn btn-outline btn-sm" href="#/invest/${ui.esc(i.id)}">返回</a>
      </div>

      <div class="doc">
        <div class="doc-title">小鱼来了 种子轮投资协议</div>
        <div class="doc-sub">协议编号：${ui.esc(i.agreementNo || '—')}</div>

        <div class="doc-party">
          <p><b>甲方（目标公司 / 创始方）</b></p>
          <p>公司名称（拟）：小鱼来了</p>
          <p>统一代码（拟）：以工商登记为准</p>
          <p>联系负责人：卢云</p>
        </div>

        <div class="doc-party">
          <p><b>乙方（投资人）</b></p>
          <p>姓名：${ui.esc(i.name)}</p>
          <p>手机号：${ui.esc(i.phone)}</p>
        </div>

        <p class="doc-p">鉴于甲方拟开展「小鱼来了」产业对接平台的研发与运营，乙方认可该项目并愿意参与本轮融资。依据《中华人民共和国民法典》等相关法律法规，双方经友好协商，达成如下协议：</p>

        <div class="doc-h">第一条　投资金额与持股</div>
        <p class="doc-p">1.1 本轮融资总额为人民币 <b>${money(plan.raiseAmount)}</b>，投后估值人民币 <b>${money(plan.valuation)}</b>，出让股份比例 <b>${num(plan.stake)}%</b>。</p>
        <p class="doc-p">1.2 乙方以人民币 <b>${money(i.amount)}</b> 认购，对应公司股份 <b>${num(i.shares)} 股</b>，每股价格人民币 <b>${num(plan.pricePerShare)} 元</b>。</p>
        <p class="doc-p">1.3 公司总股本为 <b>${num(plan.totalShares)} 万股</b>，乙方持股比例为其认购股数除以总股本。</p>

        <div class="doc-h">第二条　投资性质与权利</div>
        <p class="doc-p">2.1 乙方本轮认购的股份<b>仅享有收益权</b>，即按持股比例享有公司分红、清算及退出所得收益。</p>
        <p class="doc-p">2.2 乙方<b>不享有投票权</b>，不参与股东会表决，不参与公司重大事项决策。</p>
        <p class="doc-p">2.3 乙方<b>不享有经营权</b>，不参与公司日常经营管理，不担任公司职务（另有约定除外）。</p>
        <p class="doc-p">2.4 乙方确认已充分理解上述权利安排，并自愿接受。</p>

        <div class="doc-h">第三条　付款方式</div>
        <p class="doc-p">3.1 乙方应于本协议确认之日起 7 个工作日内，将投资款人民币 <b>${money(i.amount)}</b> 汇入甲方以下指定账户。</p>
        <div class="doc-bank">
          <div class="doc-bank-t">甲方指定收款账户</div>
          <div><span>户　　名</span><b>${ui.esc((i.bank || {}).name || '—')}</b></div>
          <div><span>卡　　号</span><b class="doc-bank-card">${ui.esc((i.bank || {}).card || '—')}</b></div>
          <div><span>开 户 行</span><b>${ui.esc((i.bank || {}).branch || '—')}</b></div>
          <div><span>打款金额</span><b>人民币 ${money(i.amount)}</b></div>
          <div><span>打款备注</span><b>${ui.esc(i.agreementNo || '—')} 投资款</b></div>
        </div>
        <p class="doc-p">3.2 乙方应在打款备注中填写本协议编号 <b>${ui.esc(i.agreementNo || '—')}</b>，便于甲方对账。</p>
        <p class="doc-p">3.3 乙方打款前应核对上述账户名称、卡号与金额；因乙方未核对导致的损失，由乙方自行承担。</p>
        <p class="doc-p">3.4 甲方收到款项并核验打款凭证无误后，按本协议第四条签发股权证。</p>

        <div class="doc-h">第四条　股权证的签发</div>
        <p class="doc-p">4.1 甲方核验乙方打款凭证无误后，向乙方签发电子股权证，载明持股数量、编号与签发日期。</p>
        <p class="doc-p">4.2 股权证是乙方持股的凭证，具体法律形式以公司正式工商登记与章程为准。</p>

        <div class="doc-h">第五条　风险提示</div>
        <p class="doc-p">5.1 乙方确认已阅读并理解平台展示的风险提示，知悉创业投资具有高风险，可能出现本金全部损失的情形。</p>
        <p class="doc-p">5.2 甲方不对未来收益作任何承诺或保证。</p>

        <div class="doc-h">第六条　其他</div>
        <p class="doc-p">6.1 本协议自双方确认之日起生效。电子确认与书面签署具有同等效力。</p>
        <p class="doc-p">6.2 本协议未尽事宜，双方可另行协商补充。</p>
        <p class="doc-p">6.3 本协议一式两份，甲乙双方各执一份。</p>

        <div class="doc-sign">
          <div class="doc-sign-col">
            <div class="doc-sign-t">甲方（签署）</div>
            <div class="doc-sign-line">　　　　　　　　</div>
            <div class="doc-sign-d">日期：${today}</div>
          </div>
          <div class="doc-sign-col">
            <div class="doc-sign-t">乙方（签署）</div>
            <div class="doc-sign-line">${ui.esc(i.name)}</div>
            <div class="doc-sign-d">日期：${today}</div>
          </div>
        </div>

        <div class="doc-foot">本协议由「小鱼来了」平台生成 · 协议编号 ${ui.esc(i.agreementNo || '—')}</div>
      </div>
    </div>`,
    showBack: true,
    mount(root) {
      root.querySelector('#doc-print')?.addEventListener('click', () => window.print());
    },
  };
}

/* ================================================================== */
/* 5. 股权证                                                            */
/* ================================================================== */
export async function renderCertificate(ctx, { id } = {}) {
  const res = await service.investDetail(id).catch(() => null);
  if (!res?.interest) {
    return { title: '股权证', content: ui.emptyState('🧭', '股权证不存在'), showBack: true };
  }
  const i = res.interest;
  const plan = res.plan || FALLBACK_PLAN;
  if (i.status !== 'verified' || !i.certNo) {
    return {
      title: '股权证',
      content: ui.emptyState('🔒', '打款核验通过后才会签发股权证', `<a class="btn btn-primary mt16" href="#/invest/${ui.esc(i.id)}">返回投资详情</a>`),
      showBack: true,
    };
  }

  return {
    title: '股权证',
    content: `<div class="page doc-page">
      <div class="doc-toolbar">
        <button class="btn btn-primary btn-sm" id="doc-print">打印 / 保存为 PDF</button>
        <a class="btn btn-outline btn-sm" href="#/invest/${ui.esc(i.id)}">返回</a>
      </div>

      <div class="cert">
        <div class="cert-border">
          <div class="cert-head">
            <div class="cert-brand">🐟 小鱼来了</div>
            <div class="cert-title">股 权 证 书</div>
            <div class="cert-en">EQUITY CERTIFICATE</div>
          </div>

          <div class="cert-no">证书编号：${ui.esc(i.certNo)}</div>

          <div class="cert-body">
            <p>兹证明</p>
            <div class="cert-name">${ui.esc(i.name)}</div>
            <p>（身份证件以投资协议所载为准）已通过「小鱼来了」平台完成种子轮投资。</p>
          </div>

          <div class="cert-grid">
            <div><span>认购金额</span><b>${money(i.amount)}</b></div>
            <div><span>持有股数</span><b>${num(i.shares)} 股</b></div>
            <div><span>每股价格</span><b>${num(plan.pricePerShare)} 元</b></div>
            <div><span>持股比例</span><b>${((i.shares / (plan.totalShares * 10000)) * 100).toFixed(4)}%</b></div>
            <div><span>投资轮次</span><b>${ui.esc(plan.round)}</b></div>
            <div><span>签发日期</span><b>${fmtDate(i.certIssuedAt)}</b></div>
          </div>

          <div class="cert-rights">
            本证书持有人<b>仅享有收益权</b>，不享有投票权与经营权。
          </div>

          <div class="cert-sign">
            <div class="cert-seal">
              <div class="cert-seal-inner">小鱼来了<br><span>投资专用章</span></div>
            </div>
            <div class="cert-sign-meta">
              <div>签发方：小鱼来了</div>
              <div>签发日期：${fmtDate(i.certIssuedAt)}</div>
              <div class="cert-verify">验证编号：${ui.esc(i.certNo)}</div>
            </div>
          </div>

          <div class="cert-foot">
            本股权证由「小鱼来了」平台电子签发，可通过平台验证。最终以公司工商登记与章程为准。
          </div>
        </div>
      </div>
    </div>`,
    showBack: true,
    mount(root) {
      root.querySelector('#doc-print')?.addEventListener('click', () => window.print());
    },
  };
}

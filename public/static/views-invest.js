/**
 * 小鱼来了 — 种子轮融资页
 *
 * 路由：#/invest
 * 说明：仅作融资方案展示与投资意向登记，不构成公开募集或要约。
 */

import { service, isLoggedIn, store } from './api.js';
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

function num(n) {
  return Number(n || 0).toLocaleString('zh-CN');
}

export async function renderInvest(ctx) {
  const res = await service.investPlan().catch(() => null);
  const p = res?.plan || FALLBACK_PLAN;

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

  return {
    title: '小鱼来了融资',
    content: `<div class="page">
      <!-- 顶部主视觉 -->
      <div class="inv-hero">
        <div class="inv-hero-badge">${ui.esc(p.round)}融资中</div>
        <div class="inv-hero-title">小鱼来了 · ${ui.esc(p.round)}融资</div>
        <div class="inv-hero-sub">让每一条好项目，都被对的人看见</div>
        <div class="inv-hero-nums">
          <div><b>${num(p.raiseAmount)}<i>万</i></b><span>融资总额</span></div>
          <div><b>${num(p.valuation)}<i>万</i></b><span>投后估值</span></div>
          <div><b>${num(p.stake)}<i>%</i></b><span>出让股份</span></div>
        </div>
      </div>

      <!-- 认购规则 -->
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
        <div class="inv-tip">按 1 元/股计，本轮 ${num(p.raiseAmount)} 万元对应 ${num((p.raiseAmount / p.pricePerShare))} 万股，占投后总股本 ${num(p.totalShares)} 万股的 ${num(p.stake)}%。</div>
      </div>

      <!-- 投资人权利 -->
      <div class="card card-pad mt12">
        <div class="inv-sec-t">投资人权利</div>
        <div class="inv-rights">
          <div class="inv-right inv-yes">
            <div class="inv-right-ico">✅</div>
            <div>
              <div class="inv-right-t">收益权</div>
              <div class="inv-right-d">按持股比例享有公司分红与退出收益</div>
            </div>
          </div>
          <div class="inv-right inv-no">
            <div class="inv-right-ico">❌</div>
            <div>
              <div class="inv-right-t">投票权</div>
              <div class="inv-right-d">不参与股东会表决，不参与重大事项决策</div>
            </div>
          </div>
          <div class="inv-right inv-no">
            <div class="inv-right-ico">❌</div>
            <div>
              <div class="inv-right-t">经营权</div>
              <div class="inv-right-d">不参与公司日常经营管理</div>
            </div>
          </div>
        </div>
        <div class="inv-warn">本轮投资仅享有<b>收益权</b>，不享有投票权与经营权。投资前请充分理解该安排。</div>
      </div>

      <!-- 资金用途 -->
      <div class="card card-pad mt12">
        <div class="inv-sec-t">资金用途（共 ${num(p.raiseAmount)} 万元）</div>
        ${usageRows}
      </div>

      <!-- 项目亮点 -->
      <div class="card card-pad mt12">
        <div class="inv-sec-t">为什么是现在</div>
        <div class="inv-points">
          <div><b>产品已上线</b><span>项目 / 悬赏 / 活动 / 贸易 / 群聊 / 会议 / 论坛全模块可用</span></div>
          <div><b>技术底座自建</b><span>零第三方依赖，3 万行代码，909 项自动化测试</span></div>
          <div><b>模式已验证</b><span>AI + 产业资源人分佣，降低单个成交的边际成本</span></div>
          <div><b>赛道确定</b><span>新能源与算力产业对接，信息不对称长期存在</span></div>
        </div>
      </div>

      <!-- 意向登记 -->
      <div class="card card-pad mt12" id="inv-form-card">
        <div class="inv-sec-t">投资意向登记</div>
        <div class="tiny dim mb12">填写后我们会与你联系，进一步沟通投资细节。此登记不构成任何认购承诺。</div>
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
          <input class="input" id="inv-amount" type="number" min="${p.minInvest}" max="${p.raiseAmount}" step="1" placeholder="最低 ${p.minInvest} 万元">
          <div class="tiny dim mt6" id="inv-shares-hint">对应股数：—</div>
        </div>
        <div class="field">
          <label>备注（选填）</label>
          <textarea class="input" id="inv-note" rows="2" maxlength="500" placeholder="你想了解的问题、可提供的资源等"></textarea>
        </div>
        <button class="btn btn-primary btn-block mt8" id="inv-submit">提交意向</button>
      </div>

      <!-- 风险提示 -->
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
      const amountEl = $('#inv-amount');
      const hintEl = $('#inv-shares-hint');

      amountEl?.addEventListener('input', () => {
        const v = Number(amountEl.value || 0);
        hintEl.textContent = v > 0
          ? `对应股数：${num(v * 10000 / p.pricePerShare)} 股（按 ${p.pricePerShare} 元/股）`
          : '对应股数：—';
      });

      $('#inv-submit')?.addEventListener('click', async () => {
        const name = ($('#inv-name').value || '').trim();
        const phone = ($('#inv-phone').value || '').trim();
        const amount = Number($('#inv-amount').value || 0);
        const note = ($('#inv-note').value || '').trim();

        if (!name) return ui.toast('请填写姓名', 'err');
        if (!/^1[3-9]\d{9}$/.test(phone)) return ui.toast('请填写正确的手机号', 'err');
        if (amount < p.minInvest) return ui.toast(`最低认购 ${p.minInvest} 万元`, 'err');
        if (amount > p.raiseAmount) return ui.toast(`不能超过本轮融资总额 ${p.raiseAmount} 万元`, 'err');

        const btn = $('#inv-submit');
        btn.disabled = true;
        btn.textContent = '提交中…';
        try {
          const r = await service.investInterest({ name, phone, amount, note });
          ui.toast('意向已提交，我们会尽快联系你', 'ok');
          root.querySelector('#inv-form-card').innerHTML = `
            <div class="inv-sec-t">已收到你的投资意向</div>
            <div class="inv-done">
              <div class="inv-done-ico">✅</div>
              <div class="inv-done-t">${ui.esc(r.interest.name)}，认购 ${num(r.interest.amount)} 万元</div>
              <div class="inv-done-d">对应 <b>${num(r.interest.shares)}</b> 股 · 意向编号 ${ui.esc(r.interest.id)}</div>
              <div class="inv-done-n">我们会在 1-2 个工作日内与你联系</div>
            </div>`;
        } catch (err) {
          ui.toast(err.message || '提交失败', 'err');
          btn.disabled = false;
          btn.textContent = '提交意向';
        }
      });
    },
  };
}

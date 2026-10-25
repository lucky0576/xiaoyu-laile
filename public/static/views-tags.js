/**
 * 小鱼来了 — 用户标签 + 会员等级
 *
 * 路由：
 *   #/tags        我的标签（5 类，多选 + 自定义填空）
 *   #/membership  会员等级（免费 + 5 档月付）
 */

import { service, isLoggedIn, store } from './api.js';
import * as ui from './ui.js';

function num(n) {
  return Number(n || 0).toLocaleString('zh-CN');
}
function fmtDate(v) {
  if (!v) return '';
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return '';
  const p = (x) => String(x).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/* ================================================================== */
/* 1. 我的标签                                                          */
/* ================================================================== */
export async function renderTags(ctx) {
  if (!isLoggedIn()) {
    ctx.nav('#/login?redirect=' + encodeURIComponent('#/tags'));
    return { title: '我的标签', content: '<div class="page"></div>' };
  }

  const res = await service.myTags().catch(() => null);
  if (!res) {
    return { title: '我的标签', content: ui.emptyState('🧭', '加载失败，请稍后重试'), showBack: true };
  }

  const categories = res.categories || [];
  const tags = res.tags || {};

  const section = (cat) => {
    const picked = tags[cat.key] || [];
    const presetSet = new Set(cat.options || []);
    const chips = (cat.options || [])
      .map(
        (o) =>
          `<span class="tag-chip ${picked.includes(o) ? 'on' : ''}" data-cat="${ui.esc(cat.key)}" data-val="${ui.esc(o)}">${ui.esc(o)}</span>`
      )
      .join('');
    const customs = picked.filter((v) => !presetSet.has(v));
    const customChips = customs
      .map(
        (o) =>
          `<span class="tag-chip on tag-custom" data-cat="${ui.esc(cat.key)}" data-val="${ui.esc(o)}">${ui.esc(o)}<i class="tag-x">×</i></span>`
      )
      .join('');

    return `<div class="card card-pad mt12 tag-sec" data-cat="${ui.esc(cat.key)}">
      <div class="row between mb8">
        <div class="tag-sec-t">${cat.icon || ''} ${ui.esc(cat.name)}</div>
        <div class="tiny dim"><span class="tag-count" data-cat="${ui.esc(cat.key)}">${picked.length}</span> / ${cat.max}</div>
      </div>
      <div class="tiny dim mb12">${ui.esc(cat.desc || '')}</div>
      <div class="tag-wrap">${chips}${customChips}</div>
      <div class="tag-add mt10">
        <input class="input" data-cat="${ui.esc(cat.key)}" maxlength="12" placeholder="没有合适的？自己填一个，回车添加">
        <button class="btn btn-sm btn-outline" data-add="${ui.esc(cat.key)}">添加</button>
      </div>
    </div>`;
  };

  return {
    title: '我的标签',
    content: `<div class="page">
      <div class="tag-hero">
        <div class="tag-hero-t">我的标签</div>
        <div class="tag-hero-s">选得越准，平台推给你的项目和对接方越对。</div>
      </div>

      ${categories.map(section).join('')}

      <button class="btn btn-primary btn-block mt16" id="tag-save">保存标签</button>
      <div class="center mt12 small"><a href="#/membership">看看会员权益 ›</a></div>
    </div>`,
    showBack: true,
    mount(root) {
      const state = {};
      for (const cat of categories) state[cat.key] = [...(tags[cat.key] || [])];

      const catOf = (key) => categories.find((c) => c.key === key);

      const syncCount = (key) => {
        const el = root.querySelector(`.tag-count[data-cat="${key}"]`);
        if (el) el.textContent = state[key].length;
      };
      const syncChips = (key) => {
        const sec = root.querySelector(`.tag-sec[data-cat="${key}"]`);
        if (!sec) return;
        const preset = new Set(catOf(key).options || []);
        const wrap = sec.querySelector('.tag-wrap');
        const base = wrap.querySelectorAll('.tag-chip:not(.tag-custom)');
        base.forEach((c) => c.classList.toggle('on', state[key].includes(c.dataset.val)));
        // 重建自定义 chip
        wrap.querySelectorAll('.tag-custom').forEach((n) => n.remove());
        const customs = state[key].filter((v) => !preset.has(v));
        for (const v of customs) {
          const span = document.createElement('span');
          span.className = 'tag-chip on tag-custom';
          span.dataset.cat = key;
          span.dataset.val = v;
          span.innerHTML = `${v.replace(/[<>&"]/g, '')}<i class="tag-x">×</i>`;
          wrap.appendChild(span);
        }
        syncCount(key);
      };

      const toggle = (key, val) => {
        const cat = catOf(key);
        const arr = state[key];
        const i = arr.indexOf(val);
        if (i >= 0) arr.splice(i, 1);
        else {
          if (arr.length >= cat.max) return ui.toast(`「${cat.name}」最多选 ${cat.max} 个`, 'err');
          arr.push(val);
        }
        syncChips(key);
      };

      const addCustom = (key) => {
        const input = root.querySelector(`.tag-add input[data-cat="${key}"]`);
        const v = (input.value || '').trim().slice(0, 12);
        if (!v) return;
        const cat = catOf(key);
        if (state[key].includes(v)) {
          input.value = '';
          return ui.toast('已经加过了', 'err');
        }
        if (state[key].length >= cat.max) return ui.toast(`「${cat.name}」最多选 ${cat.max} 个`, 'err');
        state[key].push(v);
        input.value = '';
        syncChips(key);
      };

      root.addEventListener('click', (e) => {
        const chip = e.target.closest('.tag-chip');
        if (chip) return toggle(chip.dataset.cat, chip.dataset.val);
        const addBtn = e.target.closest('[data-add]');
        if (addBtn) return addCustom(addBtn.dataset.add);
      });

      root.querySelectorAll('.tag-add input').forEach((input) => {
        input.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            addCustom(input.dataset.cat);
          }
        });
      });

      root.querySelector('#tag-save')?.addEventListener('click', async (e) => {
        const btn = e.currentTarget;
        btn.disabled = true;
        btn.textContent = '保存中…';
        try {
          const r = await service.saveTags({ tags: state });
          ui.toast(`已保存，${r.filled} 类标签已填写`, 'ok');
          await ctx.refreshMe().catch(() => null);
        } catch (err) {
          ui.toast(err.message || '保存失败', 'err');
        } finally {
          btn.disabled = false;
          btn.textContent = '保存标签';
        }
      });
    },
  };
}

/* ================================================================== */
/* 2. 会员等级                                                          */
/* ================================================================== */
export async function renderMembership(ctx) {
  if (!isLoggedIn()) {
    ctx.nav('#/login?redirect=' + encodeURIComponent('#/membership'));
    return { title: '会员等级', content: '<div class="page"></div>' };
  }

  const res = await service.levels().catch(() => null);
  if (!res) {
    return { title: '会员等级', content: ui.emptyState('🧭', '加载失败，请稍后重试'), showBack: true };
  }
  const levels = res.levels || [];
  const payCfg = res.payment || {};
  const cur = res.current || { key: 'free', name: '免费用户', icon: '🐟', color: '#8a95a5' };

  const card = (lv) => {
    const isCurrent = lv.key === cur.key;
    const isFree = lv.price === 0;
    return `<div class="lv-card ${isCurrent ? 'cur' : ''}" style="--lv:${lv.color}">
      <div class="lv-head">
        <div class="lv-icon" style="background:${lv.color}1a;color:${lv.color}">${lv.icon}</div>
        <div class="lv-title">
          <div class="lv-name">${ui.esc(lv.name)}${isCurrent ? ' <span class="lv-cur">当前</span>' : ''}</div>
          <div class="lv-tagline">${ui.esc(lv.tagline || '')}</div>
        </div>
        <div class="lv-price">
          ${isFree ? '<b>免费</b>' : `<b>¥${num(lv.price)}</b><span>${ui.esc(lv.unit)}</span>`}
        </div>
      </div>
      <div class="lv-perks">
        ${(lv.perks || []).map((p) => `<div class="lv-perk"><span class="lv-dot" style="color:${lv.color}">✓</span>${ui.esc(p)}</div>`).join('')}
      </div>
      ${
        isFree
          ? ''
          : isCurrent
            ? `<button class="btn btn-block mt12" id="lv-cancel">取消会员</button>`
            : `<button class="btn btn-primary btn-block mt12" data-buy="${ui.esc(lv.key)}">开通 ${ui.esc(lv.name)}</button>`
      }
    </div>`;
  };

  return {
    title: '会员等级',
    content: `<div class="page">
      <div class="lv-hero">
        <div class="lv-hero-cur">
          当前等级
          <b>${cur.icon} ${ui.esc(cur.name)}</b>
          ${cur.expiresAt ? `<span class="lv-hero-exp">有效期至 ${fmtDate(cur.expiresAt)}</span>` : ''}
        </div>
      </div>

      <div class="tiny dim center mt12 mb12">会员按月计费，可随时取消。支持微信 / 支付宝扫码，或银行转账。</div>

      ${levels.map(card).join('')}

      <div class="inv-risk mt12">
        <div class="inv-risk-t">💡 说明</div>
        <div class="inv-risk-b">
          <p>1. 会员按自然月计费，开通后立即生效，有效期 30 天。</p>
          <p>2. 升级更高等级按当前到期日顺延 30 天。</p>
          <p>3. 取消会员立即降回免费用户，已支付费用不退还。</p>
          <p>4. 扫码或转账后请点「我已付款」，管理员确认到账后立即开通（一般 1 个工作日内）。</p>
        </div>
      </div>
    </div>`,
    showBack: true,
    mount(root) {
      /* ---------------- 付款弹层：微信 / 支付宝 / 银行卡 ---------------- */
      const openPaySheet = (lv) => {
        const pay = payCfg || {};
        let mode = 'wechat';

        const wrap = document.createElement('div');
        wrap.className = 'pay-mask';
        wrap.innerHTML = `<div class="pay-sheet">
          <div class="pay-head">
            <div>
              <div class="pay-t">开通 ${ui.esc(lv.name)}</div>
              <div class="pay-d">${ui.esc(lv.tagline || '')}</div>
            </div>
            <div class="pay-amt">¥${num(lv.price)}<span>${ui.esc(lv.unit || '')}</span></div>
            <button class="pay-x" type="button" aria-label="关闭">✕</button>
          </div>

          <div class="pay-tabs">
            <button class="pay-tab on" data-mode="wechat" type="button">💚 微信</button>
            <button class="pay-tab" data-mode="alipay" type="button">💙 支付宝</button>
            <button class="pay-tab" data-mode="bank" type="button">🏦 银行卡</button>
          </div>

          <div class="pay-body">
            <div class="pay-pane" data-pane="wechat">
              ${pay.wechatQr
                ? `<img class="pay-qr" src="${ui.esc(ui.safeUrl(pay.wechatQr))}" alt="微信收款码">
                   <div class="pay-qr-tip">微信「扫一扫」识别二维码付款</div>
                   <div class="pay-qr-name">收款人：${ui.esc(pay.wechatName || '')}</div>`
                : '<div class="empty">暂未配置微信收款码</div>'}
            </div>

            <div class="pay-pane hide" data-pane="alipay">
              ${pay.alipayQr
                ? `<img class="pay-qr" src="${ui.esc(ui.safeUrl(pay.alipayQr))}" alt="支付宝收款码">
                   <div class="pay-qr-tip">支付宝「扫一扫」识别二维码付款</div>
                   <div class="pay-qr-name">收款人：${ui.esc(pay.alipayName || '')}</div>`
                : '<div class="empty">暂未配置支付宝收款码</div>'}
            </div>

            <div class="pay-pane hide" data-pane="bank">
              ${
                pay.bankAccount
                  ? `<div class="pay-bank">
                      <div class="pay-bank-row"><span>开户行</span><b data-copy="${ui.esc(pay.bankName || '')}">${ui.esc(pay.bankName || '—')}</b></div>
                      <div class="pay-bank-row"><span>户名</span><b data-copy="${ui.esc(pay.bankHolder || '')}">${ui.esc(pay.bankHolder || '—')}</b></div>
                      <div class="pay-bank-row hi"><span>卡号</span><b class="pay-card" data-copy="${ui.esc(pay.bankAccount || '')}">${ui.esc(pay.bankAccount || '—')}</b></div>
                     </div>
                     <button class="btn btn-outline btn-block mt8" data-copy-card type="button">复制卡号</button>
                     <div class="pay-qr-tip">转账后请务必在下方填写转账备注（姓名/手机号），方便核对</div>`
                  : '<div class="empty">暂未配置银行卡信息，请用微信或支付宝</div>'
              }
            </div>
          </div>

          <div class="field mt12">
            <label>转账备注 <span class="tiny dim">（选填，方便管理员核对到账）</span></label>
            <input class="input" id="pay-note" maxlength="120" placeholder="例如：微信转账 备注「小鱼 张工」">
          </div>

          <button class="btn btn-primary btn-block" id="pay-done" type="button">我已付款，提交订单</button>
          <div class="pay-foot">${ui.esc(pay.note || '转账后请点上面按钮提交订单，管理员确认到账后立即开通。')}</div>
        </div>`;

        document.body.appendChild(wrap);
        requestAnimationFrame(() => wrap.classList.add('show'));

        const close = () => {
          wrap.classList.remove('show');
          setTimeout(() => wrap.remove(), 220);
        };
        wrap.querySelector('.pay-x').addEventListener('click', close);
        wrap.addEventListener('click', (ev) => { if (ev.target === wrap) close(); });

        // 切换付款方式
        wrap.querySelectorAll('.pay-tab').forEach((tab) => {
          tab.addEventListener('click', () => {
            mode = tab.dataset.mode;
            wrap.querySelectorAll('.pay-tab').forEach((t) => t.classList.toggle('on', t === tab));
            wrap.querySelectorAll('.pay-pane').forEach((p) => {
              p.classList.toggle('hide', p.dataset.pane !== mode);
            });
          });
        });

        // 复制卡号
        wrap.querySelector('[data-copy-card]')?.addEventListener('click', async () => {
          const card = wrap.querySelector('.pay-card')?.dataset.copy || '';
          const ok = await ui.copyText(card);
          ui.toast(ok ? '卡号已复制' : '复制失败，请长按手动复制', ok ? 'ok' : 'err');
        });

        // 已付款 → 下单
        wrap.querySelector('#pay-done').addEventListener('click', async (ev) => {
          const btn = ev.currentTarget;
          btn.disabled = true;
          btn.textContent = '提交中…';
          try {
            const r = await service.submitLevelOrder({
              level: lv.key,
              payMode: mode,
              payerNote: (wrap.querySelector('#pay-note')?.value || '').trim(),
            });
            ui.toast(r?.reused ? '订单已在等待确认，请耐心等候' : '订单已提交，管理员确认到账后开通', 'ok');
            close();
            ctx.nav('#/membership?t=' + Date.now());
          } catch (err) {
            ui.toast(err.message || '提交失败', 'err');
            btn.disabled = false;
            btn.textContent = '我已付款，提交订单';
          }
        });
      };

      root.querySelectorAll('[data-buy]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const key = btn.dataset.buy;
          const lv = levels.find((l) => l.key === key);
          if (!lv) return;
          openPaySheet(lv);
        });
      });

      root.querySelector('#lv-cancel')?.addEventListener('click', async () => {
        const ok = await ui.confirmDialog({
          title: '取消会员',
          message: '取消后立即降回免费用户，已支付费用不退还。确定吗？',
          danger: true,
          okText: '取消会员',
        });
        if (!ok) return;
        try {
          await service.cancelLevel();
          ui.toast('已取消会员', 'ok');
          await ctx.refreshMe().catch(() => null);
          ctx.nav('#/membership', { replace: true });
        } catch (err) {
          ui.toast(err.message || '操作失败', 'err');
        }
      });
    },
  };
}

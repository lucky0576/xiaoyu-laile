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

      <div class="tiny dim center mt12 mb12">会员价格按月计，可随时取消。以下为演示开通，实际扣费需接入微信支付 / 支付宝。</div>

      ${levels.map(card).join('')}

      <div class="inv-risk mt12">
        <div class="inv-risk-t">💡 说明</div>
        <div class="inv-risk-b">
          <p>1. 会员按自然月计费，开通后立即生效，有效期 30 天。</p>
          <p>2. 升级更高等级按当前到期日顺延 30 天。</p>
          <p>3. 取消会员立即降回免费用户，已支付费用不退还。</p>
          <p>4. 当前为演示开通，未接入真实支付渠道。</p>
        </div>
      </div>
    </div>`,
    showBack: true,
    mount(root) {
      root.querySelectorAll('[data-buy]').forEach((btn) => {
        btn.addEventListener('click', async () => {
          const key = btn.dataset.buy;
          const lv = levels.find((l) => l.key === key);
          const ok = await ui.confirmDialog({
            title: `开通 ${lv.name}`,
            message: `价格 ¥${num(lv.price)}${lv.unit}。当前为演示开通，不会真实扣费。确认开通？`,
            okText: '确认开通',
          });
          if (!ok) return;
          btn.disabled = true;
          btn.textContent = '开通中…';
          try {
            await service.setLevel({ level: key });
            ui.toast(`${lv.name} 已开通`, 'ok');
            await ctx.refreshMe().catch(() => null);
            ctx.nav('#/membership', { replace: true });
          } catch (err) {
            ui.toast(err.message || '开通失败', 'err');
            btn.disabled = false;
            btn.textContent = `开通 ${lv.name}`;
          }
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

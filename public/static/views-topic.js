/**
 * 小鱼来了 — 专题页：江浙沪创业大赛与政策速查（#/contest）
 *
 * 数据来自后端 /api/contest/list（src/data/contests.js 是唯一数据源），
 * 页面负责渲染倒计时、关注按钮与分享。
 */

import * as ui from './ui.js';
import { service, isLoggedIn } from './api.js';

const COLOR_MAP = {
  green: '#0e8f7a',
  blue: '#0b74ff',
  orange: '#e07c1c',
  purple: '#7c3aed',
  teal: '#0d9488',
};

/* ---------------- 倒计时文案 ---------------- */
function countdownHtml(c) {
  const d = c.daysLeft;
  if (d === null || d === undefined) {
    return `<span class="cd cd-unknown">报名时间以官方通知为准</span>`;
  }
  if (d < 0) {
    const next = c.nextExpected ? ` · ${c.nextExpected}` : '';
    return `<span class="cd cd-over">本届已截止${next}</span>`;
  }
  if (d === 0) return `<span class="cd cd-urgent">今天报名截止</span>`;
  if (d <= 7) return `<span class="cd cd-urgent">报名还剩 ${d} 天</span>`;
  if (d <= 30) return `<span class="cd cd-soon">报名还剩 ${d} 天</span>`;
  return `<span class="cd cd-ok">报名还剩 ${d} 天</span>`;
}

function rowsHtml(rows) {
  return (rows || [])
    .map(
      ([k, v]) =>
        `<div class="tp-row"><div class="tp-k">${ui.esc(k)}</div><div class="tp-v">${v
          .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
          .replace(/&/g, '&amp;')
          .replace(/&amp;lt;/g, '&lt;')}</div></div>`,
    )
    .join('');
}

function contestCard(c, followed) {
  const color = COLOR_MAP[c.color] || COLOR_MAP.blue;
  const where = c.city ? `${c.province} · ${c.city}` : c.province;
  const closed = c.daysLeft !== null && c.daysLeft !== undefined && c.daysLeft < 0;
  return `<div class="tp-card" id="cd-${ui.esc(c.id)}">
    <div class="tp-head" style="border-left:4px solid ${color}">
      <div class="row between" style="align-items:flex-start">
        <div style="flex:1;min-width:0">
          <div class="tp-prov" style="color:${color}">${ui.esc(where)}</div>
          <div class="tp-name">${ui.esc(c.name)}</div>
          <div class="tp-sub">${ui.esc(c.sub || '')}</div>
        </div>
        <button class="tp-follow ${followed ? 'on' : ''}" type="button"
          data-follow="${ui.esc(c.id)}" title="${followed ? '取消关注' : '关注，截止前提醒我'}">
          ${followed ? '已关注' : '+ 关注'}
        </button>
      </div>
      <div class="tp-badges">
        ${(c.badges || []).map((b) => `<span class="tp-badge">${ui.esc(b)}</span>`).join('')}
        ${countdownHtml(c)}
      </div>
    </div>
    <div class="tp-body">${rowsHtml(c.rows)}</div>
    ${c.highlight ? `<div class="tp-highlight">💡 ${ui.esc(c.highlight)}</div>` : ''}
    <div class="tp-links">
      ${(c.links || [])
        .map(
          (l) =>
            `<a class="tp-link" href="${ui.esc(l.url)}" target="_blank" rel="noopener">${ui.esc(l.text)} ↗</a>`,
        )
        .join('')}
      ${c.contact ? `<span class="tiny dim">${ui.esc(c.contact)}</span>` : ''}
      ${closed ? '<span class="tiny dim">本届已截止，可先关注下届提醒</span>' : ''}
    </div>
  </div>`;
}

export async function renderContest(ctx, query) {
  let payload = null;
  try {
    payload = await service.contestList();
  } catch {
    payload = null;
  }

  if (!payload || !(payload.contests || []).length) {
    return {
      title: '江浙沪创业大赛',
      content: '<div class="page"><div class="empty">专题内容加载失败，请稍后重试</div></div>',
      showBack: true,
    };
  }

  let follows = [];
  if (isLoggedIn()) {
    try {
      const r = await service.contestFollows();
      follows = (r && r.ids) || [];
    } catch {
      follows = [];
    }
  }

  const contests = payload.contests;
  const policies = payload.policies || [];

  /* 30 天内要截止的，置顶提醒 */
  const urgent = contests
    .filter((c) => c.daysLeft !== null && c.daysLeft !== undefined && c.daysLeft >= 0 && c.daysLeft <= 30)
    .sort((a, b) => a.daysLeft - b.daysLeft);

  const urgentHtml = urgent.length
    ? `<div class="cd-banner">⏰ ${urgent
        .map((c) => `${ui.esc(c.name)}：${c.daysLeft === 0 ? '今天截止' : `还剩 ${c.daysLeft} 天`}`)
        .join('　·　')}</div>`
    : '';

  const html = `<div class="page tp-page">
    <div class="tp-hero">
      <div class="tp-hero-t">🏆 江浙沪创业大赛 <span class="tp-hero-dot">·</span> 政策速查</div>
      <div class="tp-hero-d">报名条件、截止倒计时、奖励与配套政策 · 更新于 ${ui.esc(payload.updatedAt || '')}</div>
      <div class="row gap8 mt12" style="justify-content:center">
        <button class="btn btn-sm btn-primary" id="tp-share" type="button">🔗 分享这个专题</button>
        <button class="btn btn-sm" id="tp-copy" type="button">📋 复制转发文案</button>
      </div>
    </div>

    ${urgentHtml}

    <div class="tp-sec-title">一、赛事一览（${contests.length} 个）</div>
    ${contests.map((c) => contestCard(c, follows.includes(c.id))).join('')}

    <div class="tp-sec-title">二、三地政策工具包</div>
    <div class="tp-pol">
      ${policies
        .map(
          (p) => `<div class="tp-pol-col">
            <div class="tp-pol-h">${ui.esc(p.province)}</div>
            ${p.items
              .map(
                ([k, v]) =>
                  `<div class="tp-pol-i"><div class="tp-pol-k">${ui.esc(k)}</div><div class="tp-pol-v">${ui.esc(v)}</div></div>`,
              )
              .join('')}
          </div>`,
        )
        .join('')}
    </div>
    <div class="tp-note">
      具体补贴金额各区县每年调整，以当地人社局最新文件为准。
      报名条件里「注册未满 5 年」「上年收入 ≤ 3000 万」这类硬门槛最容易卡人，先对号再报。
      点「+ 关注」的赛事，截止前 7 天会收到站内提醒。
    </div>

    <div class="tp-sec-title">三、需要帮忙对接？</div>
    <div class="card card-pad">
      <div class="small muted" style="line-height:1.8">
        平台上有大量正在做项目的团队和投资人。<br>
        你可以把自己的项目发出来，让对的人看到；也可以看看别人在做什么。
      </div>
      <div class="row gap8 mt12">
        <a class="btn btn-sm btn-primary grow" href="#/publish?category=project">发布我的项目</a>
        <a class="btn btn-sm grow" href="#/list/project">看看别人的项目</a>
      </div>
    </div>

    <div class="center tiny dim mt16" style="padding-bottom:24px">
      小鱼来了 · 让每一条好项目，都被对的人看见
    </div>
  </div>`;

  return {
    title: '江浙沪创业大赛',
    content: html,
    showBack: true,
    activeTab: '',
    async mount(root) {
      const url = `${location.origin}/#/contest`;

      /* ---------------- 关注 / 取消关注 ---------------- */
      root.addEventListener('click', async (ev) => {
        const btn = ev.target.closest('[data-follow]');
        if (!btn) return;
        ev.preventDefault();

        if (!isLoggedIn()) {
          ui.toast('关注需要先登录', 'err');
          ctx.nav(`#/login?redirect=${encodeURIComponent('#/contest')}`);
          return;
        }

        const id = btn.getAttribute('data-follow');
        const on = !btn.classList.contains('on');
        btn.disabled = true;
        try {
          const r = await service.contestFollow(id, on);
          const now = ((r && r.ids) || []).includes(id);
          btn.classList.toggle('on', now);
          btn.textContent = now ? '已关注' : '+ 关注';
          btn.title = now ? '取消关注' : '关注，截止前提醒我';
          ui.toast(now ? '已关注，截止前 7 天提醒你' : '已取消关注', 'ok');
        } catch (err) {
          ui.toast(err.message || '操作失败', 'err');
        } finally {
          btn.disabled = false;
        }
      });

      /* ---------------- 分享 ---------------- */
      root.querySelector('#tp-share')?.addEventListener('click', async () => {
        if (navigator.share) {
          try {
            await navigator.share({
              title: '江浙沪创业大赛与政策速查',
              text: '报名条件、截止倒计时、奖励与配套政策一页看全',
              url,
            });
            return;
          } catch (err) {
            if (err && err.name === 'AbortError') return;
          }
        }
        const ok = await copyText(`江浙沪创业大赛与政策速查\n${url}`);
        ui.toast(ok ? '链接已复制' : '复制失败，请长按地址手动复制', ok ? 'ok' : 'err');
      });

      /* ---------------- 转发文案 ---------------- */
      root.querySelector('#tp-copy')?.addEventListener('click', async () => {
        const lines = ['【江浙沪创业大赛 · 报名与政策速查】', ''];
        for (const c of contests) {
          const where = c.city ? `${c.province}·${c.city}` : c.province;
          let cd = '';
          if (c.daysLeft !== null && c.daysLeft !== undefined) {
            cd =
              c.daysLeft < 0
                ? '（本届已截止）'
                : c.daysLeft === 0
                  ? '（今天截止）'
                  : `（还剩 ${c.daysLeft} 天）`;
          }
          lines.push(`· ${where}｜${c.name}${cd}`);
          if ((c.badges || []).length) lines.push(`  ${c.badges.join(' / ')}`);
        }
        lines.push('');
        lines.push('三地政策：创业担保贷款、一次性创业补贴、场地租金补贴、科技型中小企业技术创新资金');
        lines.push('');
        lines.push('完整版（报名入口 + 原文链接 + 截止倒计时）：');
        lines.push(url);

        const ok = await copyText(lines.join('\n'));
        ui.toast(ok ? '文案已复制，粘到微信就行' : '复制失败，请手动复制', ok ? 'ok' : 'err');
      });
    },
  };
}

/** 剪贴板兜底：非安全上下文 / 无手势时 clipboard API 会被拒 */
async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      ta.remove();
      return ok;
    } catch {
      return false;
    }
  }
}

export default { renderContest };

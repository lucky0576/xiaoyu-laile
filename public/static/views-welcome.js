/**
 * 小鱼来了 — 引导页（#/welcome）
 *
 * 用户需求：主页前面加一个引导页，从上到下依次是
 *   ① 短视频
 *   ② AI 搜索 横栏
 *   ③ 发布信息 横栏
 *   30 秒后自动进主页，也可以点「立即进入」
 *   广告语：招商引资、产业落地、投融资（创业——IPO）、项目和工程，小鱼来了
 *
 * 为什么单独一页而不是弹层：
 *   引导页要有「品牌第一屏」的仪式感，弹层会被当成广告直接关掉。
 *   这一页只在一次会话里出现一次（sessionStorage 记着），
 *   之后直接进主页，不会烦人。
 */

import * as ui from './ui.js';
import { service } from './api.js';

const SLOGAN = '招商引资、产业落地、投融资（创业——IPO）、项目和工程，小鱼来了';
const WAIT_SECONDS = 30;

export async function renderWelcome(ctx) {
  /* 短视频：取 3 条，第一条做背景预览 */
  let shorts = [];
  try {
    const r = await service.feeds({ type: 'short', limit: 3 });
    shorts = (r && r.items) || [];
  } catch {
    shorts = [];
  }
  const lead = shorts[0];
  const leadVideo = lead && (lead.videoUrl || (lead.video && lead.video.url));
  const leadCover = lead && (lead.coverUrl || (lead.cover && lead.cover.url));

  const html = `<div class="welcome-page">
    <div class="wl-brand">
      <img src="/static/logo.png" alt="小鱼来了" width="150" height="22">
      <span class="wl-brand-sub">产业信息 · 短视频 · AI</span>
    </div>

    <div class="wl-slogan">${ui.esc(SLOGAN)}</div>

    <!-- ① 短视频：直接播放（静音自动播，点一下进短视频页） -->
    <div class="wl-hero">
      ${
        leadVideo
          ? `<video class="wl-hero-video" id="wl-hero-video"
               src="${ui.esc(ui.safeUrl(leadVideo))}"
               ${leadCover ? `poster="${ui.esc(ui.safeUrl(leadCover))}"` : ''}
               muted autoplay playsinline loop preload="auto"></video>`
          : leadCover
            ? `<img class="wl-hero-video" src="${ui.esc(ui.safeUrl(leadCover))}" alt="">`
            : '<div class="wl-hero-ph">🎬</div>'
      }
      <div class="wl-hero-mask"></div>
      <a class="wl-hero-link" href="#/shorts" aria-label="进入短视频"></a>
      <div class="wl-hero-top">
        <span class="wl-hero-tag">🎬 短视频</span>
        ${
          leadVideo
            ? '<button class="wl-sound" id="wl-sound" type="button" aria-label="声音">🔇</button>'
            : ''
        }
      </div>
      <div class="wl-hero-info">
        <div class="wl-hero-title">${ui.esc((lead && lead.title) || '项目现场、路演、工厂实拍')}</div>
        <div class="wl-hero-go">刷一刷全部短视频 ›</div>
      </div>
    </div>

    <!-- ② AI 搜索 -->
    <form class="wl-block wl-search" id="wl-search-form">
      <div class="wl-block-t">🤖 AI 搜索</div>
      <div class="wl-search-row">
        <input class="input" id="wl-q" maxlength="60" placeholder="说一句：浙江储能项目 / 有预算的工程">
        <button class="btn btn-primary" type="submit">搜</button>
      </div>
      <div class="wl-chips">
        ${['储能项目', '光伏 EPC', '政府招商', '融资项目']
          .map((k) => `<a class="wl-chip" href="#/list/project?q=${encodeURIComponent(k)}">${ui.esc(k)}</a>`)
          .join('')}
      </div>
    </form>

    <!-- ③ 发布信息 -->
    <a class="wl-block wl-publish" href="#/publish">
      <div class="wl-publish-ico">✍️</div>
      <div class="wl-block-body">
        <div class="wl-block-t">发布信息</div>
        <div class="wl-block-d">项目 · 活动 · 贸易 · 成果转化，免费发布</div>
      </div>
      <div class="wl-block-go">去发布 ›</div>
    </a>

    <div class="wl-foot">
      <button class="btn btn-primary btn-block" id="wl-enter" type="button">
        立即进入 <span class="wl-count" id="wl-count">${WAIT_SECONDS}</span> 秒后自动进入
      </button>
      <div class="wl-foot-note">小鱼来了 · 让每一条好项目，都被对的人看见</div>
    </div>
  </div>`;

  return {
    title: '小鱼来了',
    content: html,
    noTab: true,
    fullscreen: true, // 引导页不显示顶栏/底栏，纯落地页
    mount(root) {
      /* 会话内只出现一次 */
      try {
        sessionStorage.setItem('xyl_welcome_seen', '1');
      } catch {
        /* ignore */
      }

      let left = WAIT_SECONDS;
      const countEl = root.querySelector('#wl-count');
      const enter = () => {
        clearInterval(timer);
        ctx.nav('#/home');
      };
      const timer = setInterval(() => {
        left -= 1;
        if (countEl) countEl.textContent = String(Math.max(0, left));
        if (left <= 0) enter();
      }, 1000);

      root.querySelector('#wl-enter')?.addEventListener('click', enter);

      /* 短视频直接播：muted + autoplay 是浏览器允许自动播放的唯一方式 */
      const video = root.querySelector('#wl-hero-video');
      if (video) {
        video.muted = true;
        const tryPlay = () => {
          const p = video.play();
          if (p && p.catch) p.catch(() => {});
        };
        tryPlay();
        // 有些浏览器要等 canplay 才肯播
        video.addEventListener('canplay', tryPlay, { once: true });

        /* 声音开关：点一下取消静音并从头播 */
        const soundBtn = root.querySelector('#wl-sound');
        soundBtn?.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          video.muted = !video.muted;
          if (!video.muted) {
            tryPlay();
            soundBtn.textContent = '🔊';
          } else {
            soundBtn.textContent = '🔇';
          }
        });
      }

      /* AI 搜索：没有登录也能搜（走列表关键词），登录后可用 AI 精排 */
      root.querySelector('#wl-search-form')?.addEventListener('submit', (e) => {
        e.preventDefault();
        const q = String(root.querySelector('#wl-q')?.value || '').trim();
        if (!q) {
          root.querySelector('#wl-q')?.focus();
          return;
        }
        clearInterval(timer);
        ctx.nav(`#/list/project?q=${encodeURIComponent(q)}`);
      });

      /* 页面被隐藏或点其它链接时停掉倒计时，避免跳走又跳回 */
      window.addEventListener(
        'hashchange',
        () => {
          clearInterval(timer);
        },
        { once: true },
      );
    },
  };
}

export default { renderWelcome };

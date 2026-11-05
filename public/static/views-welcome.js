/**
 * 小鱼来了 — 引导页（Apple 风格重设计版）
 *
 * 设计语言：
 *   · 浅色底（#f5f5f7）+ 顶部极淡的彩色光晕，接近 iOS 的克制感
 *   · 大字号标题、紧字距、深墨色（#1d1d1f），关键短语用品牌渐变
 *   · 卡片：白底 + 22~28px 圆角 + 极轻阴影，不使用重色块
 *   · 毛玻璃胶囊（backdrop-filter），只在需要的地方出现
 *   · 黑色胶囊主按钮（Apple 的默认 CTA）
 *   · 入场动画：自下而上 + 淡入，逐块错开 60ms
 *   · 支持深色模式（prefers-color-scheme）
 *
 * 功能不变：
 *   ① 短视频 5 秒预览（全浏览器兜底）
 *   ② AI 搜索横栏
 *   ③ 发布信息横栏
 *   30 秒倒计时自动进首页，也可立即进入
 */

import * as ui from './ui.js';
import { service } from './api.js';

const SLOGAN_MAIN = '招商引资、产业落地、投融资';
const SLOGAN_SUB = '（创业——IPO）、项目和工程';
const SLOGAN_END = '小鱼来了';
const WAIT_SECONDS = 30;

export async function renderWelcome(ctx) {
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

  const html = `<div class="aw-page">
    <div class="aw-glow"></div>

    <header class="aw-head aw-rise" style="--d:0ms">
      <div class="aw-wordmark">
        <span class="aw-dot"></span>
        <span class="aw-name">小鱼来了</span>
      </div>
      <div class="aw-head-note">产业信息 · 短视频 · AI</div>
    </header>

    <h1 class="aw-title aw-rise" style="--d:60ms">
      ${ui.esc(SLOGAN_MAIN)}<span class="aw-br"></span>${ui.esc(SLOGAN_SUB)}<span class="aw-br"></span><span class="aw-accent">${ui.esc(SLOGAN_END)}</span>
    </h1>

    <p class="aw-lead aw-rise" style="--d:120ms">
      让每一条好项目，都被对的人看见。
    </p>

    <!-- ① 短视频：5 秒预览 -->
    <section class="aw-video aw-rise" style="--d:180ms">
      <div class="aw-video-frame">
        ${
          leadVideo
            ? `<video class="aw-video-el" id="wl-hero-video"
                 src="${ui.esc(ui.safeUrl(leadVideo))}"
                 ${leadCover ? `poster="${ui.esc(ui.safeUrl(leadCover))}"` : ''}
                 muted autoplay playsinline webkit-playsinline x5-playsinline
                 x5-video-player-type="h5-page" disablePictureInPicture
                 preload="auto"></video>`
            : leadCover
              ? `<img class="aw-video-el" src="${ui.esc(ui.safeUrl(leadCover))}" alt="">`
              : '<div class="aw-video-ph">🎬</div>'
        }
        <a class="aw-video-link" href="#/shorts" aria-label="进入短视频"></a>

        <div class="aw-video-top">
          <span class="aw-chip">
            <span class="aw-chip-dot"></span> 5 秒预览
          </span>
          ${
            leadVideo
              ? '<button class="aw-icon-btn" id="wl-sound" type="button" aria-label="声音">🔇</button>'
              : ''
          }
        </div>

        <button class="aw-play hide" id="wl-hero-play" type="button" aria-label="播放预览">▶</button>

        <div class="aw-video-bottom">
          <div class="aw-video-title">${ui.esc((lead && lead.title) || '项目现场 · 路演 · 工厂实拍')}</div>
          <div class="aw-video-sub">进入短视频 <span class="aw-chev">›</span></div>
        </div>
      </div>
    </section>

    <!-- ② AI 搜索 -->
    <section class="aw-card aw-rise" style="--d:240ms">
      <div class="aw-card-head">
        <span class="aw-card-title">AI 搜索</span>
        <span class="aw-card-hint">说一句就能找</span>
      </div>
      <form class="aw-search" id="wl-search-form">
        <input class="aw-input" id="wl-q" maxlength="60" placeholder="例如：浙江储能项目、有预算的光伏 EPC" autocomplete="off">
        <button class="aw-send" type="submit" aria-label="搜索">
          <span class="aw-send-arrow">↗</span>
        </button>
      </form>
      <div class="aw-tags">
        ${['储能项目', '光伏 EPC', '政府招商', '融资项目']
          .map((k) => `<a class="aw-tag" href="#/list/project?q=${encodeURIComponent(k)}">${ui.esc(k)}</a>`)
          .join('')}
      </div>
    </section>

    <!-- ③ 发布信息 -->
    <a class="aw-row aw-rise" style="--d:300ms" href="#/publish">
      <span class="aw-row-icon">✍️</span>
      <span class="aw-row-body">
        <span class="aw-row-title">发布信息</span>
        <span class="aw-row-sub">项目 · 活动 · 贸易 · 成果转化</span>
      </span>
      <span class="aw-row-go">免费发布 <span class="aw-chev">›</span></span>
    </a>

    <footer class="aw-foot aw-rise" style="--d:360ms">
      <button class="aw-cta" id="wl-enter" type="button">
        进入小鱼来了
      </button>
      <div class="aw-count" id="wl-count-line">${WAIT_SECONDS} 秒后自动进入</div>
      <div class="aw-legal">小鱼来了科技有限公司 · xiaoyulaile.online</div>
    </footer>
  </div>`;

  return {
    title: '小鱼来了',
    content: html,
    noTab: true,
    fullscreen: true,
    mount(root) {
      try {
        localStorage.setItem('xyl_welcome_at', String(Date.now()));
      } catch {
        /* ignore */
      }

      /* 倒计时 */
      let left = WAIT_SECONDS;
      const line = root.querySelector('#wl-count-line');
      const enter = () => {
        clearInterval(timer);
        ctx.nav('#/home');
      };
      const timer = setInterval(() => {
        left -= 1;
        if (line) line.textContent = left > 0 ? `${left} 秒后自动进入` : '即将进入…';
        if (left <= 0) enter();
      }, 1000);
      root.querySelector('#wl-enter')?.addEventListener('click', enter);

      /* 短视频 5 秒预览（全浏览器兜底，逻辑同上一版） */
      const video = root.querySelector('#wl-hero-video');
      const playBtn = root.querySelector('#wl-hero-play');
      const PREVIEW_SECONDS = 5;
      if (video) {
        video.muted = true;
        video.loop = false;
        let previewTimer = null;
        const stopAtPreview = () => {
          clearTimeout(previewTimer);
          previewTimer = setTimeout(() => {
            try {
              video.pause();
            } catch {
              /* ignore */
            }
            playBtn?.classList.remove('hide');
          }, PREVIEW_SECONDS * 1000);
        };
        const startPreview = () => {
          try {
            video.currentTime = 0;
          } catch {
            /* ignore */
          }
          playBtn?.classList.add('hide');
          const p = video.play();
          if (p && p.catch) {
            p.catch(() => playBtn?.classList.remove('hide'));
          }
          stopAtPreview();
        };
        video.addEventListener('playing', () => {
          playBtn?.classList.add('hide');
          stopAtPreview();
        });
        video.addEventListener('ended', () => playBtn?.classList.remove('hide'));
        video.addEventListener(
          'canplay',
          () => {
            if (video.paused) startPreview();
          },
          { once: true },
        );
        startPreview();
        setTimeout(() => {
          if (video.paused && !video.ended) playBtn?.classList.remove('hide');
        }, 800);

        playBtn?.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          startPreview();
        });

        const soundBtn = root.querySelector('#wl-sound');
        soundBtn?.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          video.muted = !video.muted;
          soundBtn.textContent = video.muted ? '🔇' : '🔊';
          if (!video.muted) startPreview();
        });
      }

      /* AI 搜索 */
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

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

// 大字标题固定为品牌名，宣传语放在下面小字（2026-11 调整）
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

    <h1 class="aw-hero-title aw-rise" style="--d:60ms">小鱼来了</h1>
    <p class="aw-hero-sub aw-rise" style="--d:100ms">
      招商引资 · 产业落地 · 投融资（创业→IPO）· 项目和工程
    </p>
    <p class="aw-lead aw-rise" style="--d:140ms">
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

        <!-- 中间提示：点击全屏播放（不再用小箭头按钮） -->
        <button class="aw-fs-hint" id="wl-hero-play" type="button">
          <span class="aw-fs-ico">▶</span>
          <span class="aw-fs-text">点击全屏播放</span>
        </button>

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

    <!-- ③.5 战略合作伙伴：BrainCo 强脑科技 -->
    <a class="aw-row aw-rise aw-brainco" style="--d:330ms" href="#/brainco">
      <span class="aw-row-icon">🧠</span>
      <span class="aw-row-body">
        <span class="aw-row-title">BrainCo 强脑科技 · 战略合作伙伴</span>
        <span class="aw-row-sub">脑机接口 · 灵巧手 · 双臂机器人 · 高校解决方案</span>
      </span>
      <span class="aw-row-go">进入专题 <span class="aw-chev">›</span></span>
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

      /* 短视频 5 秒预览 → 中间提示「点击全屏播放」 */
      const video = root.querySelector('#wl-hero-video');
      const playBtn = root.querySelector('#wl-hero-play');
      const PREVIEW_SECONDS = 5;

      const goFullscreen = async () => {
        if (!video) {
          ctx.nav('#/shorts');
          return;
        }
        try {
          video.muted = false;
          const soundBtn = root.querySelector('#wl-sound');
          if (soundBtn) soundBtn.textContent = '🔊';
          // iOS Safari 只认 webkitEnterFullscreen
          if (typeof video.webkitEnterFullscreen === 'function') {
            video.webkitEnterFullscreen();
            video.play().catch(() => {});
            return;
          }
          if (video.requestFullscreen) {
            await video.requestFullscreen();
            video.controls = true;
            await video.play().catch(() => {});
            return;
          }
          ctx.nav('#/shorts');
        } catch {
          ctx.nav('#/shorts');
        }
      };

      if (video) {
        video.muted = true;
        video.loop = false;
        let previewTimer = null;
        const showHint = () => playBtn?.classList.add('show');
        const hideHint = () => playBtn?.classList.remove('show');

        const stopAtPreview = () => {
          clearTimeout(previewTimer);
          previewTimer = setTimeout(() => {
            try {
              video.pause();
            } catch {
              /* ignore */
            }
            showHint();
          }, PREVIEW_SECONDS * 1000);
        };
        const startPreview = () => {
          try {
            video.currentTime = 0;
          } catch {
            /* ignore */
          }
          hideHint();
          const p = video.play();
          if (p && p.catch) p.catch(() => showHint());
          stopAtPreview();
        };

        video.addEventListener('playing', () => {
          hideHint();
          stopAtPreview();
        });
        video.addEventListener('ended', showHint);
        video.addEventListener(
          'canplay',
          () => {
            if (video.paused) startPreview();
          },
          { once: true },
        );
        startPreview();
        setTimeout(() => {
          if (video.paused && !video.ended) showHint();
        }, 800);

        playBtn?.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          goFullscreen();
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

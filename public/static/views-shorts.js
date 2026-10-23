/**
 * 小鱼来了 — 短视频沉浸式播放（仿抖音上下滑动）
 *
 * 路由：#/shorts            从头开始滑
 *       #/shorts?id=fd_xxx  从指定视频开始
 *
 * 交互：
 *   · 上下滑动切换视频（scroll-snap，一屏一个）
 *   · 滑到哪个播哪个，其余自动暂停
 *   · 单击暂停/播放，双击点赞
 *   · 右侧：点赞 / 分享 / 评论
 *   · 底部：作者、标题、简介
 */

import { service, isLoggedIn } from './api.js';
import * as ui from './ui.js';

const PAGE_SIZE = 20;

export async function renderShorts(ctx, params) {
  const startId = params.id || '';
  const res = await service.feeds({ type: 'short', limit: PAGE_SIZE }).catch(() => ({ items: [] }));
  let list = (res.items || []).filter((f) => f.type === 'short');

  // 从指定视频开始：把它放到第一位
  if (startId) {
    const idx = list.findIndex((f) => f.id === startId);
    if (idx > 0) {
      list = [list[idx], ...list.slice(0, idx), ...list.slice(idx + 1)];
    } else if (idx < 0) {
      const one = await service.feed(startId).catch(() => null);
      if (one?.feed) list = [one.feed, ...list];
    }
  }

  if (!list.length) {
    return {
      title: '短视频',
      content: `<div class="page">${ui.emptyState('🎬', '还没有短视频', '<a class="btn btn-primary mt16" href="#/publish?category=short">发布第一条</a>')}</div>`,
      showBack: true,
      activeTab: 'home',
    };
  }

  const slideHtml = (f, i) => `<section class="short-slide" data-idx="${i}" data-id="${ui.esc(f.id)}">
    <video
      class="short-video"
      src="${ui.esc(ui.safeUrl(f.videoUrl))}"
      poster="${ui.esc(ui.safeUrl(f.coverUrl || ''))}"
      loop muted playsinline webkit-playsinline preload="metadata"></video>

    <div class="short-center-play" data-center="${i}">▶</div>

    <div class="short-side">
      <button class="short-act" data-like="${i}" aria-label="点赞">
        <span class="short-act-ico ${f.liked ? 'liked' : ''}" data-likeico="${i}">${f.liked ? '❤️' : '🤍'}</span>
        <span class="short-act-n" data-likecount="${i}">${f.stats?.likes || 0}</span>
      </button>
      <button class="short-act" data-comment="${i}" aria-label="评论">
        <span class="short-act-ico">💬</span>
        <span class="short-act-n">${f.stats?.comments || 0}</span>
      </button>
      <button class="short-act" data-share="${i}" aria-label="分享">
        <span class="short-act-ico">↗️</span>
        <span class="short-act-n">分享</span>
      </button>
      <button class="short-act" data-mute="${i}" aria-label="声音">
        <span class="short-act-ico" data-muteico="${i}">🔇</span>
        <span class="short-act-n">声音</span>
      </button>
    </div>

    <div class="short-info">
      <div class="short-author">
        <span class="short-avatar">${ui.esc(ui.initials(f.owner?.nickname || '用户'))}</span>
        <span class="short-name">${ui.esc(f.owner?.nickname || '用户')}</span>
        <span class="short-views">👁 ${f.stats?.views || 0}</span>
      </div>
      <div class="short-title">${ui.esc(f.title || '')}</div>
      ${f.description ? `<div class="short-desc">${ui.esc(f.description.slice(0, 80))}</div>` : ''}
    </div>

    <div class="short-progress"><i data-bar="${i}"></i></div>
  </section>`;

  const html = `<div class="shorts-wrap">
    <div class="shorts-feed" id="shorts-feed">
      ${list.map((f, i) => slideHtml(f, i)).join('')}
    </div>
    <div class="shorts-topbar">
      <button class="shorts-back" id="shorts-back">←</button>
      <span class="shorts-count" id="shorts-count">1 / ${list.length}</span>
    </div>
    <div class="shorts-loading hide" id="shorts-loading">加载中…</div>
  </div>`;

  return {
    title: '短视频',
    content: html,
    fullscreen: true,
    noTab: true,
    mount(root) {
      const feed = root.querySelector('#shorts-feed');

      // 沉浸播放页不显示安装引导与微信提示，避免遮挡内容
      const installBar = document.getElementById('install-bar');
      if (installBar) installBar.style.display = 'none';
      const wxTip = document.getElementById('wx-tip');
      if (wxTip) wxTip.style.display = 'none';
      document.body.classList.add('shorts-mode');
      const countEl = root.querySelector('#shorts-count');
      const loadingEl = root.querySelector('#shorts-loading');
      const slides = () => [...feed.querySelectorAll('.short-slide')];

      let current = 0;
      let muted = true;
      const viewed = new Set();

      root.querySelector('#shorts-back').addEventListener('click', () => {
        if (history.length > 1) history.back();
        else ctx.nav('#/home');
      });

      const playSlide = (i) => {
        slides().forEach((el, k) => {
          const v = el.querySelector('video');
          if (!v) return;
          if (k === i) {
            v.muted = muted;
            v.play().catch(() => {});
            el.classList.add('playing');
          } else {
            v.pause();
            el.classList.remove('playing');
          }
        });
        current = i;
        if (countEl) countEl.textContent = `${i + 1} / ${slides().length}`;
        const s = slides()[i];
        if (s && !viewed.has(s.dataset.id)) {
          viewed.add(s.dataset.id);
          service.viewFeed(s.dataset.id).catch(() => {});
        }
      };

      // 用 IntersectionObserver 判断当前屏
      const io = new IntersectionObserver(
        (entries) => {
          entries.forEach((e) => {
            if (e.isIntersecting && e.intersectionRatio > 0.6) {
              const i = Number(e.target.dataset.idx);
              if (i !== current) playSlide(i);
            }
          });
        },
        { root: feed, threshold: [0.0, 0.6, 1.0] },
      );
      slides().forEach((s) => io.observe(s));

      // 进度条
      let rafTimer = null;
      const tick = () => {
        const v = slides()[current]?.querySelector('video');
        const bar = feed.querySelector(`[data-bar="${current}"]`);
        if (v && bar && v.duration) {
          bar.style.width = `${(v.currentTime / v.duration) * 100}%`;
        }
        rafTimer = requestAnimationFrame(tick);
      };
      rafTimer = requestAnimationFrame(tick);

      // 单击暂停 / 播放
      feed.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-like],[data-comment],[data-share],[data-mute]');
        if (btn) return;
        const slide = e.target.closest('.short-slide');
        if (!slide) return;
        const v = slide.querySelector('video');
        if (!v) return;
        if (v.paused) {
          v.play().catch(() => {});
          slide.classList.add('playing');
        } else {
          v.pause();
          slide.classList.remove('playing');
        }
      });

      // 双击点赞
      let lastTap = 0;
      feed.addEventListener('touchend', (e) => {
        const slide = e.target.closest('.short-slide');
        if (!slide) return;
        const now = Date.now();
        if (now - lastTap < 300) {
          const likeBtn = slide.querySelector('[data-like]');
          if (likeBtn && !likeBtn.dataset.done) likeBtn.click();
          e.preventDefault();
        }
        lastTap = now;
      });

      // 点赞
      feed.addEventListener('click', async (e) => {
        const btn = e.target.closest('[data-like]');
        if (!btn) return;
        if (!isLoggedIn()) {
          ui.toast('登录后才能点赞', 'err');
          return;
        }
        const i = Number(btn.dataset.like);
        const slide = slides()[i];
        if (!slide) return;
        try {
          const r = await service.likeFeed(slide.dataset.id);
          const ico = feed.querySelector(`[data-likeico="${i}"]`);
          const cnt = feed.querySelector(`[data-likecount="${i}"]`);
          if (ico) ico.textContent = r.liked ? '❤️' : '🤍';
          if (ico) ico.classList.toggle('liked', r.liked);
          if (cnt) cnt.textContent = r.feed?.stats?.likes ?? r.likes ?? '';
        } catch (err) {
          ui.toast(err.message || '操作失败', 'err');
        }
      });

      // 静音切换
      feed.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-mute]');
        if (!btn) return;
        muted = !muted;
        slides().forEach((el) => {
          const v = el.querySelector('video');
          if (v) v.muted = muted;
        });
        slides().forEach((el, i) => {
          const ico = feed.querySelector(`[data-muteico="${i}"]`);
          if (ico) ico.textContent = muted ? '🔇' : '🔊';
        });
      });

      // 分享
      feed.addEventListener('click', async (e) => {
        const btn = e.target.closest('[data-share]');
        if (!btn) return;
        const i = Number(btn.dataset.share);
        const slide = slides()[i];
        if (!slide) return;
        const url = `${location.origin}/#/live/${slide.dataset.id}`;
        const title = slide.querySelector('.short-title')?.textContent || '小鱼来了 · 短视频';
        if (navigator.share) {
          try {
            await navigator.share({ title, url });
            return;
          } catch { /* 取消 */ }
        }
        const ok = await ui.copyText(`${title}\n${url}`);
        ui.toast(ok ? '链接已复制，可粘贴到微信' : '复制失败', ok ? 'ok' : 'err');
      });

      // 评论 → 跳到详情页
      feed.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-comment]');
        if (!btn) return;
        const i = Number(btn.dataset.comment);
        const slide = slides()[i];
        if (slide) ctx.nav(`#/live/${slide.dataset.id}`);
      });

      // 滑到底自动加载更多
      feed.addEventListener('scroll', async () => {
        if (loadingEl) return;
        const nearEnd = feed.scrollTop + feed.clientHeight >= feed.scrollHeight - feed.clientHeight * 1.5;
        if (!nearEnd) return;
        const last = slides()[slides().length - 1];
        if (!last || feed.dataset.loading === '1') return;
        feed.dataset.loading = '1';
        try {
          const more = await service.feeds({ type: 'short', limit: PAGE_SIZE }).catch(() => ({ items: [] }));
          const known = new Set(slides().map((s) => s.dataset.id));
          const fresh = (more.items || []).filter((f) => f.type === 'short' && !known.has(f.id));
          if (fresh.length) {
            const base = slides().length;
            feed.insertAdjacentHTML('beforeend', fresh.map((f, k) => slideHtml(f, base + k)).join(''));
            feed.querySelectorAll('.short-slide').forEach((s) => io.observe(s));
          }
        } finally {
          feed.dataset.loading = '';
        }
      }, { passive: true });

      // 初始播放第一个
      playSlide(0);
      feed.scrollTop = 0;

      // 离开页面时停掉所有视频，避免后台继续耗电
      return () => {
        if (rafTimer) cancelAnimationFrame(rafTimer);
        io.disconnect();
        slides().forEach((el) => el.querySelector('video')?.pause());
        document.body.classList.remove('shorts-mode');
      };
    },
  };
}

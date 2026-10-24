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
      loop playsinline webkit-playsinline preload="auto"
      data-poster="${ui.esc(ui.safeUrl(f.coverUrl || ''))}"></video>

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
      <button class="short-act" data-fav="${i}" aria-label="收藏">
        <span class="short-act-ico ${f.favorited ? 'faved' : ''}" data-favico="${i}">${f.favorited ? '⭐' : '☆'}</span>
        <span class="short-act-n" data-favcount="${i}">${f.stats?.favorites || 0}</span>
      </button>
      <button class="short-act" data-contact="${i}" aria-label="联系我">
        <span class="short-act-ico">📮</span>
        <span class="short-act-n">联系我</span>
      </button>
      <button class="short-act" data-share="${i}" aria-label="分享">
        <span class="short-act-ico">↗️</span>
        <span class="short-act-n">分享</span>
      </button>
      <button class="short-act" data-mute="${i}" aria-label="声音">
        <span class="short-act-ico" data-muteico="${i}">🔊</span>
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
      // 默认**不静音**：进页面就带声音自动播
      let muted = false;
      // 浏览器会因为「没有用户交互」拦截有声播放，这里记下状态
      let soundBlocked = false;
      const viewed = new Set();

      /** 同步右侧静音图标 */
      const syncMuteIcons = () => {
        slides().forEach((el, i) => {
          const ico = feed.querySelector(`[data-muteico="${i}"]`);
          if (ico) ico.textContent = muted ? '🔇' : '🔊';
        });
      };

      /** 浏览器拦了有声播放 → 显示一个轻提示 */
      const showSoundTip = () => {
        let tip = feed.querySelector('#shorts-sound-tip');
        if (!tip) {
          tip = document.createElement('div');
          tip.id = 'shorts-sound-tip';
          tip.className = 'shorts-sound-tip';
          tip.innerHTML = '<span>🔊</span> 点击屏幕开启声音';
          feed.appendChild(tip);
        }
        tip.classList.add('on');
      };
      const hideSoundTip = () => {
        feed.querySelector('#shorts-sound-tip')?.classList.remove('on');
      };

      /** 用户第一次触摸/点击 → 解锁声音，之后所有视频都有声 */
      const unlockSound = () => {
        soundBlocked = false;
        muted = false;
        hideSoundTip();
        const v = slides()[current]?.querySelector('video');
        if (v) {
          v.muted = false;
          v.play().catch(() => {});
        }
        syncMuteIcons();
      };

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
            const attempt = v.play();
            if (attempt && typeof attempt.catch === 'function') {
              attempt.catch((err) => {
                // NotAllowedError：浏览器要求先有用户交互才能出声
                if (err && err.name === 'NotAllowedError' && !v.muted) {
                  soundBlocked = true;
                  v.muted = true;
                  v.play().catch(() => {});
                  showSoundTip();
                  syncMuteIcons();
                }
              });
            }
            // 横屏视频：加标记，CSS 会给它加模糊背景并完整居中显示
            const markOrientation = () => {
              const vw = v.videoWidth || 0;
              const vh = v.videoHeight || 0;
              if (!vw || !vh) return;
              el.dataset.orient = vw >= vh ? 'landscape' : 'portrait';
              // 横屏视频的背景模糊图用封面
              if (vw >= vh) {
                const poster = v.dataset.poster || '';
                if (poster) el.style.setProperty('--poster', 'url(' + JSON.stringify(poster) + ')');
              }
            };
            markOrientation();
            if (!v.dataset.orientBound) {
              v.dataset.orientBound = '1';
              v.addEventListener('loadedmetadata', markOrientation, { once: true });
            }
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
        const btn = e.target.closest('[data-like],[data-comment],[data-share],[data-mute],[data-fav],[data-contact]');
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
        soundBlocked = false;
        hideSoundTip();
        slides().forEach((el) => {
          const v = el.querySelector('video');
          if (v) {
            v.muted = muted;
            // 从静音切到有声时，如果视频是暂停的，顺手播放
            if (!muted && v.paused) v.play().catch(() => {});
          }
        });
        syncMuteIcons();
      });

      // 收藏 / 取消收藏
      feed.addEventListener('click', async (e) => {
        const btn = e.target.closest('[data-fav]');
        if (!btn) return;
        e.stopPropagation();
        if (!isLoggedIn()) {
          ui.toast('登录后才能收藏', 'err');
          return;
        }
        const i = Number(btn.dataset.fav);
        const slide = slides()[i];
        if (!slide) return;
        btn.disabled = true;
        try {
          const r = await service.toggleFavorite(slide.dataset.id);
          const ico = feed.querySelector(`[data-favico="${i}"]`);
          const cnt = feed.querySelector(`[data-favcount="${i}"]`);
          if (ico) {
            ico.textContent = r.favorited ? '⭐' : '☆';
            ico.classList.toggle('faved', Boolean(r.favorited));
          }
          if (cnt) cnt.textContent = r.count ?? '';
          ui.toast(r.favorited ? '已收藏' : '已取消收藏', 'ok');
        } catch (err) {
          ui.toast(err.message || '操作失败', 'err');
        } finally {
          btn.disabled = false;
        }
      });

      // 联系我：联系视频发布者
      feed.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-contact]');
        if (!btn) return;
        e.stopPropagation();
        const i = Number(btn.dataset.contact);
        const slide = slides()[i];
        if (!slide) return;
        openContactSheet(slide);
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

      /* 联系我：向视频发布者提问（走 feedback，管理员同时可见） */
      const openContactSheet = async (slide) => {
        const feedId = slide.dataset.id;
        let data = null;
        try {
          const r = await service.feed(feedId);
          data = r?.feed || r?.data?.feed || null;
        } catch { /* 拿不到就用页面上的信息 */ }

        const ownerName =
          data?.owner?.nickname ||
          slide.querySelector('.short-name')?.textContent ||
          '发布者';
        const ownerId = data?.ownerId || data?.owner?.id || '';
        const feedTitle = data?.title || slide.querySelector('.short-title')?.textContent || '';

        if (isLoggedIn() && ownerId && (ctx.state?.user?.id || '') === ownerId) {
          ui.toast('这是你自己发布的视频', 'err');
          return;
        }

        const wrap = document.createElement('div');
        wrap.className = 'fb-sheet-mask';
        wrap.innerHTML = `<div class="fb-sheet">
          <div class="fb-sheet-head">
            <div>
              <div class="fb-sheet-t">📮 联系发布者</div>
              <div class="fb-sheet-d">${ui.esc(ownerName)}${feedTitle ? ' · ' + ui.esc(feedTitle.slice(0, 18)) : ''}</div>
            </div>
            <button class="fb-sheet-x" type="button" aria-label="关闭">✕</button>
          </div>
          <div class="field">
            <label>你想了解什么？</label>
            <textarea class="textarea" rows="3" maxlength="1000" placeholder="例如：视频里这套设备能租多久？报价多少？"></textarea>
          </div>
          <div class="field">
            <label>你的联系方式 <span class="tiny dim">（选填，方便对方直接联系你）</span></label>
            <input class="input" maxlength="60" placeholder="手机号 / 微信号">
          </div>
          <button class="btn btn-primary btn-block" type="button" data-send>发送给发布者</button>
          <div class="tiny dim center mt8">发布者和管理员都会看到这条提问</div>
        </div>`;

        document.body.appendChild(wrap);
        requestAnimationFrame(() => wrap.classList.add('show'));

        const close = () => {
          wrap.classList.remove('show');
          setTimeout(() => wrap.remove(), 220);
        };
        wrap.querySelector('.fb-sheet-x').addEventListener('click', close);
        wrap.addEventListener('click', (ev) => { if (ev.target === wrap) close(); });

        wrap.querySelector('[data-send]').addEventListener('click', async (ev) => {
          const btn = ev.currentTarget;
          const text = (wrap.querySelector('textarea')?.value || '').trim();
          const contact = (wrap.querySelector('input')?.value || '').trim();
          if (!text) return ui.toast('先写下你想问的内容', 'err');
          if (!isLoggedIn()) {
            close();
            ctx.nav(`#/login?redirect=${encodeURIComponent('#/shorts')}`);
            return;
          }
          btn.disabled = true;
          btn.textContent = '发送中…';
          try {
            await service.feedbackSubmit({
              text,
              contact,
              page: `短视频 ${feedTitle || feedId}`,
              feedId,
              toUserId: ownerId,
              toName: ownerName,
            });
            ui.toast('已发送，发布者会收到通知', 'ok');
            close();
          } catch (err) {
            ui.toast(err.message || '发送失败', 'err');
            btn.disabled = false;
            btn.textContent = '发送给发布者';
          }
        });
      };

      // 任意一次触摸/点击就解锁声音（浏览器自动播放策略要求）
      const onFirstGesture = () => {
        unlockSound();
        feed.removeEventListener('touchstart', onFirstGesture);
        feed.removeEventListener('click', onFirstGesture);
      };
      feed.addEventListener('touchstart', onFirstGesture, { passive: true });
      feed.addEventListener('click', onFirstGesture);

      // 初始播放第一个（进页面即自动播）
      playSlide(0);
      feed.scrollTop = 0;
      syncMuteIcons();

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

/* ================================================================== */
/* 我的收藏                                                            */
/* ================================================================== */

export async function renderFavorites(ctx) {
  if (!isLoggedIn()) {
    ctx.nav(`#/login?redirect=${encodeURIComponent('#/favorites')}`);
    return { title: '我的收藏', content: '<div class="page"></div>', noTab: true };
  }

  let items = [];
  try {
    const r = await service.favorites({});
    items = r?.items || [];
  } catch {
    items = [];
  }

  const card = (f) => `<a class="fav-card" href="#/shorts/${ui.esc(f.id)}">
    <div class="fav-thumb">
      ${f.coverUrl
        ? `<img src="${ui.esc(ui.safeUrl(f.coverUrl))}" alt="" loading="lazy">`
        : '<div class="fav-ph">🎬</div>'}
      <span class="fav-badge">⭐</span>
    </div>
    <div class="fav-t">${ui.esc(f.title || '')}</div>
    <div class="fav-m">
      <span>👁 ${f.stats?.views || 0}</span>
      <span>❤ ${f.stats?.likes || 0}</span>
      <span>⭐ ${f.stats?.favorites || 0}</span>
    </div>
  </a>`;

  return {
    title: '我的收藏',
    showBack: true,
    activeTab: 'me',
    content: `<div class="page fav-page">
      <div class="fav-head">
        <div class="fav-head-t">⭐ 我的收藏</div>
        <div class="fav-head-d">${items.length ? `共 ${items.length} 条` : '还没有收藏任何内容'}</div>
      </div>
      ${
        items.length
          ? `<div class="fav-grid">${items.map(card).join('')}</div>`
          : `<div class="empty">在短视频里点「☆」就能收藏到这里</div>`
      }
    </div>`,
  };
}

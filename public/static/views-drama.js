/**
 * 短剧频道（#/drama）与剧集播放页（#/drama/:id）
 *
 * 短剧是外接内容：平台只做展示与分发，不生成剧情。
 * 播放器复用站内短视频的播放方式（原生 video + 竖屏容器）。
 */

import * as ui from './ui.js';
import { service } from './api.js';

const FOLLOW_KEY = 'xyl_drama_follows';

function getFollows() {
  try {
    return JSON.parse(localStorage.getItem(FOLLOW_KEY) || '[]');
  } catch {
    return [];
  }
}

function setFollow(id, on) {
  const list = getFollows().filter((x) => x !== id);
  if (on) list.push(id);
  try {
    localStorage.setItem(FOLLOW_KEY, JSON.stringify(list));
  } catch {
    /* ignore */
  }
}

function cardHtml(d) {
  return `<a class="drama-card" href="#/drama/${ui.esc(d.id)}">
    <div class="drama-cover">
      ${
        d.coverUrl
          ? `<img src="${ui.esc(ui.safeUrl(d.coverUrl))}" alt="" loading="lazy">`
          : '<div class="drama-cover-ph">🎬</div>'
      }
      <span class="drama-badge">${ui.esc(d.categoryName || '短剧')}</span>
      ${d.featured ? '<span class="drama-hot">推荐</span>' : ''}
    </div>
    <div class="drama-meta">
      <div class="drama-title">${ui.esc(d.title)}</div>
      <div class="drama-sub">${ui.esc(d.subtitle || '')}${d.subtitle ? ' · ' : ''}共 ${d.totalEpisodes || 0} 集</div>
      <div class="drama-free">前 ${d.freeEpisodes || 1} 集免费 · ${d.views || 0} 次播放</div>
    </div>
  </a>`;
}

export async function renderDramas(ctx, params) {
  let meta = { categories: [] };
  let list = [];
  let featured = [];
  let myFollows = getFollows();
  try {
    const [m, r, f] = await Promise.all([
      service.dramaMeta().catch(() => ({ categories: [] })),
      service.dramas({ size: 30 }).catch(() => ({ items: [] })),
      service.dramas({ size: 6, featured: 1 }).catch(() => ({ items: [] })),
    ]);
    meta = m || meta;
    list = (r && r.items) || [];
    featured = (f && f.items) || [];
  } catch {
    /* ignore */
  }

  const html = `<div class="page drama-page">
    <div class="drama-hero">
      <div class="drama-hero-t">🎬 短剧频道</div>
      <div class="drama-hero-d">真实项目改编 · 商战创业题材 · 每集 1~2 分钟</div>
    </div>

    ${
      featured.length
        ? `<div class="drama-section-t">🔥 编辑推荐</div>
           <div class="drama-scroll">${featured.map(cardHtml).join('')}</div>`
        : ''
    }

    <div class="drama-section-t">全部短剧</div>
    <div class="drama-chips" id="drama-chips">
      <a class="chip active" data-cat="">全部</a>
      ${(meta.categories || []).map((c) => `<a class="chip" data-cat="${ui.esc(c.id)}">${ui.esc(c.name)}</a>`).join('')}
      ${myFollows.length ? `<a class="chip" data-cat="__follow">我的追剧 ${myFollows.length}</a>` : ''}
    </div>

    <div class="drama-grid" id="drama-grid">
      ${
        list.length
          ? list.map(cardHtml).join('')
          : `<div class="empty" style="grid-column:1/-1">
               短剧频道正在引入内容<br>
               <span class="tiny dim">内容方上传后，这里会展示剧集；也可以直接从短视频流刷到短剧切片</span>
             </div>`
      }
    </div>

    <div class="tiny dim center mt16" style="padding-bottom:20px">
      短剧为外接内容，平台仅提供分发与播放 · 侵权投诉请通过「联系我」反馈
    </div>
  </div>`;

  return {
    title: '短剧',
    content: html,
    showBack: true,
    activeTab: '',
    mount(root) {
      const grid = root.querySelector('#drama-grid');
      const chips = root.querySelectorAll('#drama-chips .chip');
      const paint = (items) => {
        grid.innerHTML = items.length
          ? items.map(cardHtml).join('')
          : `<div class="empty" style="grid-column:1/-1">这个分类还没有短剧</div>`;
      };
      chips.forEach((chip) => {
        chip.addEventListener('click', (e) => {
          e.preventDefault();
          chips.forEach((c) => c.classList.remove('active'));
          chip.classList.add('active');
          const cat = chip.dataset.cat || '';
          if (cat === '__follow') {
            paint(list.filter((d) => myFollows.includes(d.id)));
          } else if (!cat) {
            paint(list);
          } else {
            paint(list.filter((d) => d.category === cat));
          }
        });
      });
    },
  };
}

export async function renderDrama(ctx, params) {
  const id = params && (params.id || (params.segs && params.segs[1]));
  if (!id) {
    ctx.nav('#/drama');
    return { title: '短剧', content: '', noTab: true };
  }
  let data = null;
  try {
    data = await service.dramaDetail(id);
  } catch {
    data = null;
  }
  if (!data) {
    return {
      title: '短剧',
      content: `<div class="page"><div class="empty">短剧不存在或已下架<br><a class="btn btn-sm mt12" href="#/drama">回短剧频道</a></div></div>`,
      showBack: true,
    };
  }
  const d = data.drama;
  const eps = (data.episodes || []).filter((e) => e.videoUrl);
  const isAdmin = Boolean(ctx.state?.user?.isAdmin);
  const followed = getFollows().includes(d.id);

  const html = `<div class="page drama-detail">
    <div class="drama-player-wrap">
      <video id="drama-video" class="drama-player" controls playsinline preload="metadata"
        ${d.coverUrl ? `poster="${ui.esc(ui.safeUrl(d.coverUrl))}"` : ''}></video>
      <div class="drama-player-lock hide" id="drama-lock">
        <div class="drama-lock-t">这一集需要解锁</div>
        <div class="drama-lock-d">看广告解锁即将上线；当前可先观看前 ${d.freeEpisodes || 1} 集</div>
      </div>
    </div>

    <div class="drama-head">
      <div class="drama-head-t">${ui.esc(d.title)}</div>
      <div class="drama-head-sub">${ui.esc(d.subtitle || '')} · ${ui.esc(d.categoryName || '')} · 共 ${d.totalEpisodes || eps.length} 集</div>
      <div class="row gap8 mt8">
        <button class="btn btn-sm ${followed ? 'btn-primary' : ''}" id="drama-follow" type="button">
          ${followed ? '已追剧' : '＋ 追剧'}
        </button>
        <button class="btn btn-sm" id="drama-share" type="button">↗ 分享</button>
      </div>
    </div>

    ${
      d.intro
        ? `<div class="card card-pad mt12"><div class="strong mb6">剧情简介</div><div class="small muted" style="line-height:1.8">${ui.esc(d.intro)}</div></div>`
        : ''
    }

    <div class="drama-section-t">选集（${eps.length} 集）</div>
    <div class="drama-eps" id="drama-eps">
      ${eps
        .map((e) => {
          const locked = !e.free && !isAdmin;
          return `<button class="drama-ep ${locked ? 'locked' : ''}" type="button" data-ep="${e.episodeNo}" data-video="${ui.esc(ui.safeUrl(e.videoUrl))}" data-free="${e.free ? 1 : 0}">
            <span class="drama-ep-no">${e.episodeNo}</span>
            <span class="drama-ep-t">${ui.esc(e.title || '第 ' + e.episodeNo + ' 集')}</span>
            ${locked ? '<span class="drama-ep-lock">🔒</span>' : ''}
          </button>`;
        })
        .join('')}
    </div>

    <div class="tiny dim mt12">内容方：${ui.esc(data.provider || '平台引入')} · ${ui.esc(data.licenseNote || '已获授权')}</div>
    <div class="tiny dim center mt16" style="padding-bottom:20px">短剧为演绎内容 · 与真实项目信息请以项目详情页为准</div>
  </div>`;

  return {
    title: d.title,
    content: html,
    showBack: true,
    activeTab: '',
    mount(root) {
      const video = root.querySelector('#drama-video');
      const lock = root.querySelector('#drama-lock');
      let currentEp = 0;
      const playEp = (no) => {
        const ep = eps.find((e) => Number(e.episodeNo) === Number(no));
        if (!ep) return;
        currentEp = Number(no);
        const locked = !ep.free && !isAdmin;
        if (locked) {
          lock.classList.remove('hide');
          video.removeAttribute('src');
          video.load();
          return;
        }
        lock.classList.add('hide');
        video.src = ui.safeUrl(ep.videoUrl);
        const p = video.play();
        if (p && p.catch) p.catch(() => {});
        root.querySelectorAll('.drama-ep').forEach((b) => {
          b.classList.toggle('active', Number(b.dataset.ep) === currentEp);
        });
      };
      root.querySelectorAll('.drama-ep').forEach((b) => {
        b.addEventListener('click', () => playEp(b.dataset.ep));
      });
      if (eps.length) playEp(eps[0].episodeNo);
      video.addEventListener('ended', () => {
        const next = eps.find((e) => Number(e.episodeNo) === Number(currentEp) + 1);
        if (next) playEp(next.episodeNo);
      });
      root.querySelector('#drama-follow')?.addEventListener('click', (e) => {
        const btn = e.currentTarget;
        const on = !getFollows().includes(d.id);
        setFollow(d.id, on);
        btn.classList.toggle('btn-primary', on);
        btn.textContent = on ? '已追剧' : '＋ 追剧';
        ui.toast(on ? '已加入追剧，更新后可再来看看' : '已取消追剧', 'ok');
      });
      root.querySelector('#drama-share')?.addEventListener('click', async () => {
        const url = `${location.origin}/#/drama/${d.id}`;
        try {
          if (navigator.share) {
            await navigator.share({ title: d.title, text: '小鱼来了 · 短剧频道', url });
            return;
          }
        } catch {
          /* ignore */
        }
        try {
          await navigator.clipboard.writeText(`${d.title}｜小鱼来了短剧\n${url}`);
          ui.toast('链接已复制，去微信粘贴', 'ok');
        } catch {
          ui.toast(url, 'ok');
        }
      });
    },
  };
}

export default { renderDramas, renderDrama };

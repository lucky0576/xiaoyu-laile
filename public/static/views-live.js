/**
 * 小鱼来了 — 短视频与直播间
 *
 * 路由：
 *   #/live/:id      短视频播放页 / 直播间（观看或开播）
 *   #/feed/new      发布短视频或预约直播
 *   #/feeds         短视频与直播列表
 */
import { service, store, isLoggedIn } from './api.js';
import * as ui from './ui.js';
import { MeetingRoom } from './meeting.js';
import { openInviteSheet } from './views-meeting.js';

/* ================================================================== */
/* 视频 / 直播列表                                                     */
/* ================================================================== */
export async function renderFeeds(ctx, params) {
  void params;
  const tab = params.type || 'all';
  const [all, live] = await Promise.all([
    service.feeds({ limit: 30 }).catch(() => ({ items: [] })),
    service.feeds({ type: 'live', limit: 10 }).catch(() => ({ items: [] })),
  ]);
  const items = tab === 'live' ? all.items.filter((f) => f.type === 'live')
    : tab === 'short' ? all.items.filter((f) => f.type === 'short')
      : all.items;

  const card = (f) => `<a class="fd-card" href="#/live/${ui.esc(f.id)}">
    <div class="fd-cover" ${f.coverUrl ? `style="background-image:url('${ui.esc(ui.safeUrl(f.coverUrl))}')"` : ''}>
      ${f.type === 'live' && f.liveStatus === 'live' ? '<span class="fd-live">直播中</span>' : ''}
      <span class="fd-dur">${f.type === 'live' ? '直播' : '短视频'}</span>
      <span class="fd-play">▶</span>
    </div>
    <div class="fd-body">
      <div class="fd-t">${ui.esc(f.title)}</div>
      <div class="fd-m">
        <span>${ui.esc(f.owner?.nickname || '')}</span>
        <span>👁 ${f.stats.views} · ❤ ${f.stats.likes}</span>
      </div>
    </div>
  </a>`;

  return {
    title: '短视频 · 直播',
    content: `<div class="page">
      <div class="chips scroll mb12">
        <a class="chip ${tab === 'all' ? 'active' : ''}" href="#/feeds">全部</a>
        <a class="chip ${tab === 'live' ? 'active' : ''}" href="#/feeds?type=live">直播（${live.items.filter((f) => f.liveStatus === 'live').length} 场进行中）</a>
        <a class="chip ${tab === 'short' ? 'active' : ''}" href="#/feeds?type=short">短视频</a>
        <a class="chip" href="#/feed/new">＋ 发布</a>
      </div>
      <div class="fd-grid">
        ${items.length ? items.map(card).join('') : ui.emptyState('🎬', '还没有短视频或直播', '<a class="btn btn-primary mt16" href="#/feed/new">发布第一条</a>')}
      </div>
    </div>`,
    showBack: true,
    activeTab: 'home',
  };
}

/* ================================================================== */
/* 播放页 / 直播间                                                     */
/* ================================================================== */
export async function renderLive(ctx, params) {
  const id = params.id;
  let info;
  try {
    info = await service.liveInfo(id);
  } catch (err) {
    return { title: '内容不存在', content: `<div class="page">${ui.emptyState('🔍', err.message)}</div>`, showBack: true };
  }
  const f = info.feed;
  if (!f) return { title: '内容不存在', content: `<div class="page">${ui.emptyState('🔍', '内容已被删除')}</div>`, showBack: true };

  /* ---------- 短视频 ---------- */
  if (f.type === 'short') {
    return {
      title: f.title,
      content: `<div class="page fd-page">
        <div class="fd-player">
          ${f.videoUrl
            ? `<video id="fd-video" controls autoplay playsinline preload="metadata"
                 ${f.coverUrl ? `poster="${ui.esc(ui.safeUrl(f.coverUrl))}"` : ''}
                 src="${ui.esc(ui.safeUrl(f.videoUrl))}"></video>`
            : `<div class="fd-noplay"><div style="font-size:40px">🎬</div><div class="mt8">该短视频文件已不存在</div></div>`}
        </div>
        <div class="card card-pad mt12">
          <div class="strong" style="font-size:17px">${ui.esc(f.title)}</div>
          ${f.subtitle ? `<div class="small muted mt4">${ui.esc(f.subtitle)}</div>` : ''}
          <div class="tiny dim mt8">👁 ${f.stats.views} 次播放 · ${ui.esc(ui.fmtRelative(f.createdAt))}</div>
          ${f.description ? `<div class="small mt12" style="white-space:pre-wrap">${ui.esc(f.description)}</div>` : ''}
          <div class="row gap8 mt12">
            <button class="btn btn-sm ${f.liked ? 'btn-primary' : ''}" id="fd-like">${f.liked ? '❤ 已赞' : '🤍 点赞'} ${f.stats.likes}</button>
            <button class="btn btn-sm" id="fd-share">🔗 分享</button>
            ${f.listingId ? `<a class="btn btn-sm" href="#/detail/${ui.esc(f.listingId)}">📁 关联项目</a>` : ''}
          </div>
        </div>
        <a class="card card-pad mt12 row gap8" href="#/user/${ui.esc(f.ownerId)}" style="display:flex">
          <div class="avatar">${ui.esc(ui.initials(f.owner?.nickname || '?'))}</div>
          <div class="grow">
            <div class="strong small">${ui.esc(f.owner?.nickname || '')}</div>
            <div class="tiny dim">${ui.esc(f.owner?.company || '')}</div>
          </div>
          <span class="dim">›</span>
        </a>
      </div>`,
      showBack: true,
      activeTab: 'home',
      async mount(root) {
        void ctx;
        root.querySelector('#fd-like')?.addEventListener('click', async (e) => {
          if (!isLoggedIn()) return ui.toast('请先登录', 'err');
          try {
            const r = await service.likeFeed(id);
            e.currentTarget.classList.toggle('btn-primary', r.liked);
            e.currentTarget.textContent = `${r.liked ? '❤ 已赞' : '🤍 点赞'} ${r.likes}`;
          } catch (err) { ui.toast(err.message, 'err'); }
        });
        root.querySelector('#fd-share')?.addEventListener('click', async () => {
          try {
            openInviteSheet(await service.feedShare(id));
          } catch (err) { ui.toast(err.message, 'err'); }
        });
      },
    };
  }

  /* ---------- 直播 ---------- */
  const isHost = info.isHost;
  const live = f.liveStatus === 'live';
  const meetingId = f.liveMeetingId || '';

  const html = `<div class="live-page">
    <div class="live-stage" id="live-stage">
      <video id="live-video" autoplay playsinline ${isHost ? 'muted' : ''}></video>
      <div class="live-cover" id="live-cover" ${f.coverUrl ? `style="background-image:url('${ui.esc(ui.safeUrl(f.coverUrl))}')"` : ''}>
        ${live ? '' : `<div class="live-cover-txt">${isHost ? (f.liveStatus === 'ended' ? '直播已结束' : '准备开播') : (f.liveStatus === 'ended' ? '直播已结束' : '主播还未开播')}</div>`}
      </div>
      <div class="live-top">
        <span class="live-badge ${live ? 'on' : ''}">${live ? '● LIVE' : '未开播'}</span>
        <span class="live-stat" id="live-viewers">👁 ${f.stats.views}</span>
      </div>
      <div class="live-host">
        <div class="avatar sm">${ui.esc(ui.initials(f.owner?.nickname || '?'))}</div>
        <div class="grow">
          <div class="live-host-name">${ui.esc(f.owner?.nickname || '')}</div>
          <div class="live-host-sub">${ui.esc(f.owner?.company || '')}</div>
        </div>
        ${isHost ? '' : `<button class="btn btn-sm btn-primary" id="live-follow">关注</button>`}
      </div>
    </div>

    <div class="card card-pad mt12">
      <div class="strong" style="font-size:16px">${ui.esc(f.title)}</div>
      ${f.subtitle ? `<div class="small muted mt4">${ui.esc(f.subtitle)}</div>` : ''}
      <div class="tiny dim mt8">
        ${meetingId ? `会议号 ${ui.esc(info.meeting?.number || '')} · ` : ''}创建于 ${ui.esc(ui.fmtRelative(f.createdAt))}
      </div>
      <div class="row gap8 mt12" style="flex-wrap:wrap">
        ${isHost && !live ? '<button class="btn btn-primary btn-sm" id="live-start">开始直播</button>' : ''}
        ${isHost && live ? '<button class="btn btn-sm" id="live-end" style="color:var(--danger)">结束直播</button>' : ''}
        <button class="btn btn-sm" id="live-like">🤍 点赞 ${f.stats.likes}</button>
        <button class="btn btn-sm" id="live-share">🔗 分享</button>
        ${f.listingId ? `<a class="btn btn-sm" href="#/detail/${ui.esc(f.listingId)}">📁 关联项目</a>` : ''}
      </div>
      ${isHost && !live ? `<div class="tiny dim mt8">开播后观众可通过链接、二维码或会议号进入直播间。直播走点对点推流，观众数受你的上行带宽限制（家用宽带约 5–10 人）。</div>` : ''}
      ${isHost && live ? '<div class="tiny dim mt8" id="live-tip">正在直播中…观众加入后画面会自动推送到他们。</div>' : ''}
    </div>

    <div class="card mt12" style="overflow:hidden">
      <div class="row between" style="padding:12px 14px;border-bottom:1px solid var(--line)">
        <span class="strong small">💬 直播间聊天</span>
        <span class="tiny dim" id="live-chat-state">${live ? '已连接' : '等待开播'}</span>
      </div>
      <div class="live-chat" id="live-chat"></div>
      <div class="live-input">
        <input id="live-text" placeholder="说点什么…" maxlength="200" ${live ? '' : 'disabled'}>
        <button class="btn btn-sm btn-primary" id="live-send" ${live ? '' : 'disabled'}>发送</button>
      </div>
    </div>
  </div>`;

  return {
    title: f.title,
    content: html,
    showBack: true,
    activeTab: 'home',
    async mount(root) {
      const $ = (s) => root.querySelector(s);
      const videoEl = $('#live-video');
      let room = null;
      let meetingIdNow = meetingId;
      let liveNow = live;

      const pushChat = (msg) => {
        const box = $('#live-chat');
        if (!box) return;
        if (msg.system) {
          box.insertAdjacentHTML('beforeend', `<div class="live-msg sys">${ui.esc(msg.text)}</div>`);
        } else {
          box.insertAdjacentHTML('beforeend', `<div class="live-msg"><b>${ui.esc(msg.name)}</b>：${ui.esc(msg.text)}</div>`);
        }
        while (box.children.length > 200) box.removeChild(box.firstChild);
        box.scrollTop = box.scrollHeight;
      };

      const loadChat = async () => {
        if (!meetingIdNow) return;
        try {
          const r = await service.meetingChat(meetingIdNow);
          (r.items || []).forEach(pushChat);
        } catch { /* ignore */ }
      };

      const send = async () => {
        const input = $('#live-text');
        const text = input?.value.trim();
        if (!text || !meetingIdNow) return;
        input.value = '';
        try {
          const r = await service.sendMeetingChat(meetingIdNow, text);
          pushChat(r.entry);
        } catch (err) { ui.toast(err.message, 'err'); }
      };
      $('#live-send')?.addEventListener('click', send);
      $('#live-text')?.addEventListener('keydown', (e) => { if (e.key === 'Enter') send(); });

      /* ---------- 观众：加入收流 ---------- */
      const watch = async () => {
        if (!meetingIdNow || !liveNow) return;
        if (isLoggedIn()) {
          try {
            const res = await service.joinMeeting(meetingIdNow, { muted: true, cameraOff: true });
            meetingIdNow = res.meeting.id;
          } catch (err) {
            ui.toast(`加入直播间失败：${err.message}`, 'err');
            return;
          }
        }
        room = new MeetingRoom(meetingIdNow, {
          mode: 'live',
          isBroadcaster: false,
          onSignal(sig) {
            if (sig.type !== 'track') return;
            if (videoEl.srcObject !== sig.stream) {
              videoEl.srcObject = sig.stream;
              videoEl.play().catch(() => {});
              $('#live-cover')?.classList.add('hide');
            }
          },
          onChat: pushChat,
          onEnded() {
            ui.toast('主播已结束直播', '');
            const badge = root.querySelector('.live-badge');
            if (badge) { badge.textContent = '已结束'; badge.classList.remove('on'); }
            liveNow = false;
          },
        });
        room.connect();
        await room.broadcastJoin();
        await loadChat();
      };

      /* ---------- 主播：开播推流 ---------- */
      const broadcast = async () => {
        if (!meetingIdNow) return;
        try {
          await room.startMedia({ audio: true, video: true });
        } catch (err) {
          ui.toast(`无法打开摄像头/麦克风：${err.message}`, 'err');
          return false;
        }
        videoEl.srcObject = room.localStream;
        videoEl.muted = true;
        videoEl.play().catch(() => {});
        $('#live-cover')?.classList.add('hide');
        await room.broadcastJoin();
        await loadChat();
        return true;
      };

      const openRoom = () => {
        room = new MeetingRoom(meetingIdNow, {
          mode: 'live',
          isBroadcaster: true,
          onChat: pushChat,
          onStatus() {},
        });
        room.connect();
      };

      if (liveNow && meetingIdNow) {
        if (isHost) {
          openRoom();
          await broadcast();
        } else {
          await watch();
        }
      }
      await loadChat();

      /* ---------- 开播 ---------- */
      $('#live-start')?.addEventListener('click', async (e) => {
        const btn = e.currentTarget;
        btn.disabled = true;
        btn.textContent = '正在开播…';
        try {
          const r = await service.startLive(id, {});
          meetingIdNow = r.meeting.id;
          liveNow = true;
          ui.toast(`直播已开始，会议号 ${r.meeting.number}`, 'ok');
          ctx.nav(`#/live/${id}`);
        } catch (err) {
          ui.toast(err.message, 'err');
          btn.disabled = false;
          btn.textContent = '开始直播';
        }
      });

      /* ---------- 结束直播 ---------- */
      $('#live-end')?.addEventListener('click', async () => {
        const ok = await ui.confirmDialog({ title: '结束直播', message: '结束后观众会看到直播已结束。', danger: true, okText: '结束' });
        if (!ok) return;
        try {
          room?.stopMedia();
          room?.disconnect();
          await service.endLive(id);
          ui.toast('直播已结束', 'ok');
          ctx.nav(`#/live/${id}`);
        } catch (err) { ui.toast(err.message, 'err'); }
      });

      /* ---------- 点赞 / 分享 / 关注 ---------- */
      $('#live-like')?.addEventListener('click', async (e) => {
        if (!isLoggedIn()) return ui.toast('请先登录', 'err');
        try {
          const r = await service.likeFeed(id);
          e.currentTarget.textContent = `${r.liked ? '❤ 已赞' : '🤍 点赞'} ${r.likes}`;
        } catch (err) { ui.toast(err.message, 'err'); }
      });
      $('#live-share')?.addEventListener('click', async () => {
        try {
          openInviteSheet(await service.feedShare(id));
        } catch (err) { ui.toast(err.message, 'err'); }
      });
      $('#live-follow')?.addEventListener('click', async (e) => {
        if (!isLoggedIn()) return ui.toast('请先登录', 'err');
        try {
          await service.follow(f.ownerId);
          e.currentTarget.textContent = '已关注';
          e.currentTarget.disabled = true;
          ui.toast('已关注主播，开播时会通知你', 'ok');
        } catch (err) { ui.toast(err.message, 'err'); }
      });

      /* 心跳：刷新观看数 */
      const hb = setInterval(async () => {
        try {
          const r = await service.liveHeartbeat(id);
          liveNow = r.live;
        } catch { /* ignore */ }
      }, 15000);
      const feed = await service.feed(id).catch(() => null);
      if (feed?.feed) {
        const v = $('#live-viewers');
        if (v) v.textContent = `👁 ${feed.feed.stats.views} · ❤ ${feed.feed.stats.likes}`;
      }

      window.addEventListener('beforeunload', () => {
        clearInterval(hb);
        room?.stopMedia();
        room?.disconnect();
      }, { once: true });
      void store;
    },
  };
}

/* ================================================================== */
/* 发布短视频 / 直播                                                   */
/* ================================================================== */
export async function renderFeedNew(ctx, params) {
  if (!isLoggedIn()) {
    ctx.nav(`#/login?redirect=${encodeURIComponent('#/feed/new')}`);
    return { title: '发布', content: '<div class="page"></div>', noTab: true };
  }
  void params;

  const html = `<div class="page">
    <div class="card card-pad">
      <div class="strong mb12">发布短视频 / 直播</div>
      <div class="chips mb12" id="fd-type">
        <a class="chip active" data-type="short">🎬 短视频</a>
        <a class="chip" data-type="live">📡 直播</a>
      </div>

      <div class="field">
        <label>标题</label>
        <input class="input" id="fd-title" maxlength="80" placeholder="一句话说清内容">
      </div>
      <div class="field">
        <label>副标题（选填）</label>
        <input class="input" id="fd-subtitle" maxlength="120" placeholder="补充说明，会显示在首页轮播">
      </div>

      <div class="field" id="fd-file-field">
        <label>视频文件</label>
        <input type="file" id="fd-file" accept="video/*" class="input">
        <div class="tiny dim mt4">支持 MP4 / MOV / WebM，建议 1080p 以内、单条 200MB 以内</div>
      </div>

      <div class="field">
        <label>封面（选填）</label>
        <input type="file" id="fd-cover" accept="image/*" class="input">
      </div>

      <div class="field">
        <label>简介（选填）</label>
        <textarea class="input" id="fd-desc" rows="3" maxlength="2000" placeholder="详细介绍内容、产品、项目背景"></textarea>
      </div>

      <label class="row gap8 mb12" style="cursor:pointer">
        <input type="checkbox" id="fd-featured" checked>
        <span class="small">放到首页轮播位</span>
      </label>

      <button class="btn btn-primary btn-block" id="fd-submit">发布</button>
    </div>

    <div class="card card-pad mt12">
      <div class="small muted">
        <div>· <b>短视频</b>：上传后立即显示在首页轮播，静音自动播放</div>
        <div>· <b>直播</b>：先创建直播间，再点「开始直播」推流；观众用链接、二维码或会议号进入</div>
        <div>· 直播走点对点推流，观众数受你上行带宽限制（家用宽带约 5–10 人）</div>
      </div>
    </div>
  </div>`;

  return {
    title: '发布短视频 / 直播',
    content: html,
    showBack: true,
    activeTab: 'home',
    async mount(root) {
      const $ = (s) => root.querySelector(s);
      let type = 'short';

      root.querySelectorAll('#fd-type .chip').forEach((chip) => {
        chip.addEventListener('click', () => {
          type = chip.dataset.type;
          root.querySelectorAll('#fd-type .chip').forEach((c) => c.classList.toggle('active', c === chip));
          $('#fd-file-field').style.display = type === 'short' ? '' : 'none';
          $('#fd-submit').textContent = type === 'short' ? '发布短视频' : '创建直播间';
        });
      });

      $('#fd-submit').addEventListener('click', async (e) => {
        const btn = e.currentTarget;
        const title = $('#fd-title').value.trim();
        if (!title) return ui.toast('请填写标题', 'err');
        const file = $('#fd-file').files[0];
        if (type === 'short' && !file) return ui.toast('请选择视频文件', 'err');

        const fd = new FormData();
        fd.append('type', type);
        fd.append('title', title);
        fd.append('subtitle', $('#fd-subtitle').value.trim());
        fd.append('description', $('#fd-desc').value.trim());
        fd.append('featured', $('#fd-featured').checked ? '1' : '0');
        if (file) fd.append('file', file);
        const cover = $('#fd-cover').files[0];
        if (cover) fd.append('file', cover);

        btn.disabled = true;
        btn.textContent = '上传中…';
        try {
          const r = await service.createFeed(fd, {
            onProgress: (p) => { btn.textContent = `上传中 ${p}%`; },
          });
          ui.toast(type === 'short' ? '短视频已发布' : '直播间已创建', 'ok');
          ctx.nav(`#/live/${r.feed.id}`);
        } catch (err) {
          ui.toast(err.message, 'err');
          btn.disabled = false;
          btn.textContent = type === 'short' ? '发布短视频' : '创建直播间';
        }
      });
    },
  };
}

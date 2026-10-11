/**
 * 小鱼来了 — 群聊与线上会议
 */
import { service, store, isLoggedIn } from './api.js';
import * as ui from './ui.js';
import { fileCardHtml } from './components.js';
import { openInviteSheet } from './views-meeting.js';

function roomIcon(type) {
  return { project: '📁', event: '🎪', group: '👥', direct: '💬' }[type] || '👥';
}

/* ================================================================== */
/* 群聊列表                                                            */
/* ================================================================== */
export async function renderChat(ctx, params) {
  if (params.roomId) return renderRoom(ctx, params);
  if (!isLoggedIn()) {
    ctx.nav('#/login?redirect=%23/chat');
    return { title: '消息', content: '<div class="page"></div>' };
  }

  const [roomsRes, meetingsRes] = await Promise.all([
    service.rooms(),
    service.meetings().catch(() => ({ items: [] })),
  ]);

  const html = `<div class="page">
    <div class="card card-pad">
      <div class="row gap8">
        <button class="btn btn-primary grow" id="ct-join-meeting">🔢 输入会议号加入</button>
        <button class="btn grow" id="ct-new-meeting">📹 快速发起会议</button>
      </div>
      <div class="row gap8 mt8">
        <button class="btn grow" id="ct-new-room">＋ 创建群聊</button>
        <a class="btn grow" href="#/contacts">📇 通讯录邀请</a>
      </div>
    </div>

    ${(meetingsRes.items || []).length ? `
      <div class="section-head mt16"><h2>📹 我的会议</h2></div>
      <div class="card" style="overflow:hidden">
        ${meetingsRes.items.slice(0, 8).map((m) => `<a class="item" href="#/meeting/${ui.esc(m.id)}">
          <div class="avatar">📹</div>
          <div class="item-body">
            <div class="item-title">${ui.esc(m.title)}
              <span class="badge ${m.status === 'live' ? 'danger' : m.status === 'ended' ? 'gray' : ''}">${m.status === 'live' ? '进行中' : m.status === 'ended' ? '已结束' : '待开始'}</span>
              ${m.number ? `<span class="badge gray">${ui.esc(m.number)}</span>` : ''}
            </div>
            <div class="item-sub">${ui.esc(ui.fmtDate(m.startAt, true))} · ${m.participantCount} 人参会${m.joinedCount ? ` · ${m.joinedCount} 人在会` : ''}</div>
          </div>
        </a>`).join('')}
      </div>
    ` : ''}

    <div class="section-head mt16"><h2>会话（${(roomsRes.items || []).length}）</h2></div>
    <div class="card" style="overflow:hidden">
      ${(roomsRes.items || []).length
        ? roomsRes.items.map((r) => `<a class="item" href="#/chat/${ui.esc(r.id)}">
            <div class="avatar">${roomIcon(r.type)}</div>
            <div class="item-body">
              <div class="item-title">${ui.esc(r.name)} ${r.unread ? `<span class="badge danger">${r.unread}</span>` : ''}</div>
              <div class="item-sub clamp2">${ui.esc(r.lastMessage ? `${r.lastMessage.byName}：${r.lastMessage.text}` : '暂无消息')}</div>
              <div class="item-meta">${r.memberCount} 人 · ${ui.esc(ui.fmtRelative(r.lastMessage?.at || r.createdAt))}</div>
            </div>
          </a>`).join('')
        : ui.emptyState('💬', '还没有会话', '<a class="btn btn-primary mt16" href="#/home">去看看项目</a>')}
    </div>
  </div>`;

  return {
    title: '消息',
    content: html,
    showBack: true,
    noTab: false,
    activeTab: 'chat',
    async mount(root) {
      root.querySelector('#ct-join-meeting')?.addEventListener('click', () => ctx.nav('#/join'));
      root.querySelector('#ct-new-meeting')?.addEventListener('click', async () => {
        const title = await ui.promptDialog({ title: '发起会议', label: '会议主题', value: '项目沟通会', okText: '创建' });
        if (!title) return;
        const usePassword = await ui.confirmDialog({
          title: '需要入会密码吗？',
          message: '设置密码后，参会人需要输入密码才能加入（更安全）。',
          okText: '设置密码',
          cancelText: '不需要',
        });
        try {
          const res = await service.createMeeting({ title, durationMin: 60, usePassword });
          ctx.nav(`#/meeting/${res.meeting.id}`);
        } catch (err) {
          ui.toast(err.message, 'err');
        }
      });
      root.querySelector('#ct-new-room')?.addEventListener('click', async () => {
        const name = await ui.promptDialog({ title: '创建群聊', label: '群聊名称', placeholder: '例如：光伏项目对接群', okText: '创建' });
        if (!name) return;
        try {
          const res = await service.createRoom({ type: 'group', name });
          ctx.nav(`#/chat/${res.room.id}`);
        } catch (err) {
          ui.toast(err.message, 'err');
        }
      });
    },
  };
}

/* ================================================================== */
/* 群聊房间                                                            */
/* ================================================================== */
export async function renderRoom(ctx, params) {
  if (!isLoggedIn()) {
    ctx.nav(`#/login?redirect=${encodeURIComponent(`#/chat/${params.roomId}`)}`);
    return { title: '群聊', content: '<div class="page"></div>', noTab: true };
  }
  const roomId = params.roomId;
  const res = await service.messages(roomId, { limit: 100 });
  const room = res.room;
  const me = ctx.state.user?.id;

  const html = `<div class="chat-page">
    <div class="topbar">
      <button class="icon-btn" id="nav-back">←</button>
      <div class="title">${ui.esc(room.name)}
        <span class="tiny dim" style="font-weight:400"> · ${room.memberCount} 人</span>
      </div>
      <button class="icon-btn" id="room-invite" title="邀请好友加入">🔗</button>
      <button class="icon-btn" id="room-meeting" title="发起会议">📹</button>
      <button class="icon-btn" id="room-info" title="群信息">⋯</button>
    </div>
    ${room.announcement?.text ? `<div class="announce">📢 <b>群公告</b>：${ui.esc(room.announcement.text)}
      <span class="dim">— ${ui.esc(room.announcement.by || '')} ${ui.esc(ui.fmtRelative(room.announcement.at))}</span></div>` : ''}
    <div class="chat-body" id="chat-body">
      ${(res.items || []).length
        ? res.items.map((m) => msgHtml(m, me)).join('')
        : '<div class="empty"><div class="ico">👋</div><div>还没有消息，打个招呼吧</div></div>'}
    </div>
    <div class="chat-input">
      <button class="icon-btn" id="chat-file">📎</button>
      <textarea id="chat-text" rows="1" placeholder="输入消息…"></textarea>
      <button class="btn btn-primary btn-sm" id="chat-send" style="height:40px">发送</button>
      <input type="file" id="chat-file-input" multiple style="display:none">
    </div>
  </div>`;

  return {
    title: room.name,
    content: html,
    fullscreen: true,
    noTab: true,
    async mount(root) {
      const body = root.querySelector('#chat-body');
      const input = root.querySelector('#chat-text');
      const scrollDown = () => { body.scrollTop = body.scrollHeight; };
      scrollDown();

      root.querySelector('#nav-back').addEventListener('click', () => ctx.nav('#/chat'));

      /* 实时消息 */
      let es = null;
      try {
        es = new EventSource(`/api/chat/rooms/${roomId}/stream?token=${encodeURIComponent(store.token)}`);
        es.addEventListener('message', (e) => {
          try {
            const { message } = JSON.parse(e.data);
            if (!message || message.userId === me) return;
            if (body.querySelector('.empty')) body.innerHTML = '';
            body.insertAdjacentHTML('beforeend', msgHtml(message, me, { fileList: message.fileList }));
            scrollDown();
          } catch { /* ignore */ }
        });
      } catch { /* ignore */ }

      const send = async () => {
        const text = input.value.trim();
        if (!text) return;
        input.value = '';
        input.style.height = 'auto';
        try {
          const fd = new FormData();
          fd.append('text', text);
          const res = await service.sendMessage(roomId, fd);
          if (body.querySelector('.empty')) body.innerHTML = '';
          body.insertAdjacentHTML('beforeend', msgHtml(res.message, me, { fileList: res.message.fileList }));
          scrollDown();
        } catch (err) {
          ui.toast(err.message, 'err');
          input.value = text;
        }
      };

      root.querySelector('#chat-send').addEventListener('click', send);
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
          e.preventDefault();
          send();
        }
      });
      input.addEventListener('input', () => {
        input.style.height = 'auto';
        input.style.height = `${Math.min(120, input.scrollHeight)}px`;
      });

      root.querySelector('#chat-file').addEventListener('click', () => root.querySelector('#chat-file-input').click());
      root.querySelector('#chat-file-input').addEventListener('change', async (e) => {
        const files = [...e.target.files];
        if (!files.length) return;
        const fd = new FormData();
        fd.append('text', input.value.trim() || `[发送了 ${files.length} 个文件]`);
        for (const f of files) fd.append('file', f, f.name);
        input.value = '';
        ui.showLoading(`上传中（${files.length} 个文件）…`);
        try {
          const res = await service.sendMessage(roomId, fd);
          ui.hideLoading();
          if (body.querySelector('.empty')) body.innerHTML = '';
          body.insertAdjacentHTML('beforeend', msgHtml(res.message, me, { fileList: res.message.fileList }));
          scrollDown();
        } catch (err) {
          ui.hideLoading();
          ui.toast(err.message, 'err');
        }
      });

      root.querySelector('#room-info').addEventListener('click', () => {
        ui.openSheet({
          title: '群聊信息',
          content: `<div class="strong mb8">${ui.esc(room.name)}</div>
            <div class="tiny dim mb12">${room.type === 'project' ? '项目对接群' : room.type === 'direct' ? '好友会话' : '群聊'} · ${room.memberCount} 人</div>
            ${(room.members || []).map((m) => `<div class="row gap8 mb8">
              <div class="avatar sm">${ui.esc(ui.initials(m.name))}</div>
              <div class="grow small">${ui.esc(m.name)} ${m.role === 'owner' ? '<span class="badge">群主</span>' : ''} ${m.userId === me ? '<span class="badge gray">我</span>' : ''}</div>
            </div>`).join('')}
            <div class="row gap8 mt12">
              <button class="btn grow" id="room-invite-user">搜索平台用户</button>
              <button class="btn grow" id="room-share">邀请链接 / 二维码</button>
            </div>
            ${room.ownerId === me ? '<button class="btn btn-block mt8" id="room-announce">发布群公告</button>' : ''}
            <button class="btn btn-block mt8" id="room-leave" style="color:var(--danger)">退出群聊</button>`,
          onMount(sheet, close) {
            sheet.querySelector('#room-share').addEventListener('click', async () => {
              close();
              try {
                openInviteSheet(await service.roomInvite(roomId));
              } catch (err) {
                ui.toast(err.message, 'err');
              }
            });
            sheet.querySelector('#room-announce')?.addEventListener('click', async () => {
              close();
              const text = await ui.promptDialog({
                title: '发布群公告',
                label: '公告内容（所有成员进入群聊都会看到）',
                multiline: true,
                value: room.announcement?.text || '',
                okText: '发布',
              });
              if (!text) return;
              try {
                await service.setAnnouncement(roomId, text);
                ui.toast('群公告已发布', 'ok');
                ctx.nav(`#/chat/${roomId}`);
              } catch (err) {
                ui.toast(err.message, 'err');
              }
            });
            sheet.querySelector('#room-invite-user').addEventListener('click', async () => {
              close();
              const kw = await ui.promptDialog({ title: '邀请成员', label: '输入昵称或企业名搜索平台用户', placeholder: '如：李经理', okText: '搜索' });
              if (!kw) return;
              try {
                const r = await service.users({ q: kw, pageSize: 10 });
                if (!r.items.length) return ui.toast('没有找到匹配用户', 'err');
                ui.pickSheet({
                  title: '选择要邀请的用户',
                  options: r.items.map((u) => ({ value: u.id, label: u.nickname, desc: [u.company, u.profession].filter(Boolean).join(' · ') })),
                  multiple: true,
                  async onPick(ids) {
                    if (!ids.length) return;
                    try {
                      await service.addMembers(roomId, ids);
                      ui.toast(`已邀请 ${ids.length} 位成员`, 'ok');
                      ctx.nav(`#/chat/${roomId}`);
                    } catch (err) {
                      ui.toast(err.message, 'err');
                    }
                  },
                });
              } catch (err) {
                ui.toast(err.message, 'err');
              }
            });
            sheet.querySelector('#room-leave').addEventListener('click', async () => {
              close();
              const ok = await ui.confirmDialog({ title: '退出群聊', message: '退出后将不再接收该群消息。', danger: true, okText: '退出' });
              if (!ok) return;
              try {
                await api.del(`/api/chat/rooms/${roomId}/members/${me}`);
                ui.toast('已退出群聊', 'ok');
                ctx.nav('#/chat');
              } catch (err) {
                ui.toast(err.message, 'err');
              }
            });
          },
        });
      });

      root.querySelector('#room-invite').addEventListener('click', async () => {
        try {
          openInviteSheet(await service.roomInvite(roomId));
        } catch (err) {
          ui.toast(err.message, 'err');
        }
      });

      root.querySelector('#room-meeting').addEventListener('click', async () => {
        const title = await ui.promptDialog({ title: '发起线上会议', label: '会议主题', value: `${room.name} · 沟通会`, okText: '创建并进入' });
        if (!title) return;
        try {
          const usePassword = await ui.confirmDialog({
            title: '需要入会密码吗？',
            message: '设置密码后，参会人需要输入密码才能加入（更安全）。',
            okText: '设置密码',
            cancelText: '不需要',
          });
          const res = await service.createMeeting({ roomId, title, listingId: room.listingId || '', durationMin: 60, usePassword });
          ctx.nav(`#/meeting/${res.meeting.id}`);
        } catch (err) {
          ui.toast(err.message, 'err');
        }
      });

      await service.readRoom(roomId).catch(() => {});
    },
    // 离开页面时关闭 SSE
    onLeave() {
      /* EventSource 会随页面替换自动断开 */
    },
  };
}

function msgHtml(m, me, extra = {}) {
  const isMe = m.userId === me;
  if (m.type === 'system') {
    return `<div class="msg system"><div class="bubble">${ui.esc(m.text)}</div></div>`;
  }
  const files = extra.fileList || m.fileList || [];
  return `<div class="msg ${isMe ? 'me' : ''}">
    ${ui.avatarHtml({ nickname: m.authorName, avatar: m.authorAvatar }, 'sm')}
    <div style="max-width:78%">
      ${!isMe ? `<div class="meta">${ui.esc(m.authorName || '')}</div>` : ''}
      <div class="bubble">${ui.esc(m.text || '')}
        ${files.length ? `<div class="mt8">${files.map((f) => fileCardHtml(f)).join('')}</div>` : ''}
      </div>
      <div class="meta" style="text-align:${isMe ? 'right' : 'left'}">${ui.esc(ui.fmtRelative(m.at))}</div>
    </div>
  </div>`;
}

/* 会议视图已拆分到 ./views-meeting.js（会前预览 + 会议中 + 邀请） */
export { renderJoin, renderMeeting, openInviteSheet } from './views-meeting.js';

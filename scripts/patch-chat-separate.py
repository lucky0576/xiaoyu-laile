#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""消息页：群聊与会议分开，话题群单独成组"""

import io
import os

D = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
C = os.path.join(D, "public", "static", "views-chat.js")
c = io.open(C, "r", encoding="utf-8").read()

OLD = """    ${(meetingsRes.items || []).length ? `
      <div class="section-head mt16"><h2>📹 我的会议</h2></div>
      <div class="card" style="overflow:hidden">
        ${meetingsRes.items.slice(0, 8).map((m) => `<a class="item" href="#/meeting/${ui.esc(m.id)}">
          <div class="avatar">📹</div>
          <div class="item-body">
            <div class="item-title">${ui.esc(m.title)}
              <span class="badge ${m.status === 'live' ? 'danger' : m.status === 'ended' ? 'gray' : ''}">${m.status === 'live' ? '进行中' : m.status === 'ended' ? '已结束' : '预约中'}</span>
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
  </div>`;"""

NEW = """    ${(meetingsRes.items || []).length ? `
      <div class="section-head mt16">
        <h2>📹 会议</h2>
        <span class="tiny dim">${(meetingsRes.items || []).length} 场</span>
      </div>
      <div class="card" style="overflow:hidden">
        ${meetingsRes.items.slice(0, 8).map((m) => `<a class="item" href="#/meeting/${ui.esc(m.id)}">
          <div class="avatar">📹</div>
          <div class="item-body">
            <div class="item-title">${ui.esc(m.title)}
              <span class="badge ${m.status === 'live' ? 'danger' : m.status === 'ended' ? 'gray' : ''}">${m.status === 'live' ? '进行中' : m.status === 'ended' ? '已结束' : '预约中'}</span>
              ${m.number ? `<span class="badge gray">${ui.esc(m.number)}</span>` : ''}
            </div>
            <div class="item-sub">${ui.esc(ui.fmtDate(m.startAt, true))} · ${m.participantCount} 人参会${m.joinedCount ? ` · ${m.joinedCount} 人在会` : ''}</div>
          </div>
        </a>`).join('')}
      </div>
    ` : ''}

    <div class="section-head mt20">
      <h2>💬 话题群</h2>
      <span class="tiny dim">${(roomsRes.topics || []).length} 个 · 点进去即可发言</span>
    </div>
    <div class="topic-grid">
      ${(roomsRes.topics || []).map((t) => `<a class="topic-card" href="#/chat/${ui.esc(t.id)}">
        <div class="topic-ico">${ui.esc(t.icon || '💬')}</div>
        <div class="topic-body">
          <div class="topic-name">${ui.esc(t.name)}
            ${t.isMember ? '<span class="topic-joined">已加入</span>' : ''}
            ${t.unread ? `<span class="badge danger">${t.unread}</span>` : ''}
          </div>
          <div class="topic-desc">${ui.esc(t.desc || '')}</div>
          <div class="topic-meta">${t.memberCount} 人${t.messageCount ? ` · ${t.messageCount} 条消息` : ' · 暂无消息'}</div>
        </div>
      </a>`).join('')}
    </div>

    <div class="section-head mt20">
      <h2>🗨️ 我的会话</h2>
      <span class="tiny dim">${(roomsRes.items || []).length} 个</span>
    </div>
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
        : ui.emptyState('💬', '还没有私聊或项目群', '<div class="tiny dim mt8">上方话题群可以直接加入，或者点「＋ 创建群聊」建一个</div>')}
    </div>
  </div>`;"""

if OLD not in c:
    print("ERROR: 未找到消息页布局")
    raise SystemExit(1)
c = c.replace(OLD, NEW, 1)

# 顶部按钮区：明确区分「开会」和「建群」
OLD2 = """      <div class="row gap8">
        <button class="btn btn-primary grow" id="ct-join-meeting">🔢 输入会议号加入</button>
        <button class="btn grow" id="ct-new-meeting">📹 快速发起会议</button>
      </div>
      <div class="row gap8 mt8">
        <button class="btn grow" id="ct-new-room">＋ 创建群聊</button>
        <a class="btn grow" href="#/contacts">📇 通讯录邀请</a>
      </div>"""

NEW2 = """      <div class="ct-group-label">📹 会议</div>
      <div class="row gap8">
        <button class="btn btn-primary grow" id="ct-new-meeting">📹 发起 / 预约会议</button>
        <button class="btn grow" id="ct-join-meeting">🔢 输入会议号加入</button>
      </div>
      <div class="ct-group-label mt12">💬 群聊</div>
      <div class="row gap8">
        <button class="btn grow" id="ct-new-room">＋ 创建群聊</button>
        <a class="btn grow" href="#/contacts">📇 通讯录邀请</a>
      </div>"""

if OLD2 not in c:
    print("ERROR: 未找到顶部按钮区")
    raise SystemExit(1)
c = c.replace(OLD2, NEW2, 1)

io.open(C, "w", encoding="utf-8").write(c)
print("OK 消息页已分离会议与群聊")

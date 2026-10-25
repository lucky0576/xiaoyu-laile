/**
 * 小鱼来了 — 联系我
 *
 * 用户端：#/contact-us
 *   写下问题 → 管理员回复后在这里看到
 *   支持继续追加补充说明
 *
 * 管理端：#/admin-feedback
 *   按状态分栏，逐条回复 / 关闭 / 删除
 */

import { service, isLoggedIn } from './api.js';
import * as ui from './ui.js';

/* 话题 id → 展示名 */
const TOPIC_NAMES = {
  invest: '投资 小鱼来了',
  system: '系统定制',
  event: '活动赛事策划',
  consult: '咨询',
  other: '其他',
  agency: '代理合作商',
  ad: '广告',
  promo: '宣传(全国行)',
};

function relTime(iso) {
  if (!iso) return '';
  const t = Date.parse(iso);
  if (!t) return '';
  const d = Date.now() - t;
  if (d < 60_000) return '刚刚';
  if (d < 3600_000) return `${Math.floor(d / 60_000)} 分钟前`;
  if (d < 86400_000) return `${Math.floor(d / 3600_000)} 小时前`;
  if (d < 7 * 86400_000) return `${Math.floor(d / 86400_000)} 天前`;
  return new Date(t).toLocaleDateString('zh-CN');
}

const STATUS_TEXT = {
  open: { text: '待回复', cls: 'fb-open' },
  replied: { text: '已回复', cls: 'fb-replied' },
  closed: { text: '已结束', cls: 'fb-closed' },
};

function threadHtml(item, { admin = false } = {}) {
  const st = STATUS_TEXT[item.status] || STATUS_TEXT.open;
  const msgs = [
    `<div class="fb-msg fb-msg-user">
      <div class="fb-avatar">${ui.esc((item.userName || '?').slice(0, 1))}</div>
      <div class="fb-bubble">
        <div class="fb-meta">${ui.esc(item.userName || '用户')} · ${relTime(item.createdAt)}</div>
        <div class="fb-text">${ui.esc(item.text)}</div>
      </div>
    </div>`,
    ...(item.replies || []).map(
      (r) => `<div class="fb-msg ${r.by === 'admin' ? 'fb-msg-admin' : 'fb-msg-user'}">
        <div class="fb-avatar ${r.by === 'admin' ? 'is-admin' : ''}">${r.by === 'admin' ? '🛡️' : ui.esc((r.name || '?').slice(0, 1))}</div>
        <div class="fb-bubble">
          <div class="fb-meta">${ui.esc(r.name || (r.by === 'admin' ? '管理员' : '用户'))} · ${relTime(r.at)}</div>
          <div class="fb-text">${ui.esc(r.text)}</div>
        </div>
      </div>`,
    ),
  ].join('');

  return `<div class="card card-pad mt12 fb-thread" data-thread="${ui.esc(item.id)}">
    <div class="row between mb8">
      <span class="fb-status ${st.cls}">${st.text}</span>
      <span class="tiny dim">${relTime(item.updatedAt)}</span>
    </div>
    ${
      (item.topics || []).length
        ? `<div class="chips mb8">${item.topics
            .map((id) => `<span class="chip active fb-topic">${ui.esc(TOPIC_NAMES[id] || id)}</span>`)
            .join('')}</div>`
        : ''
    }
    ${item.page ? `<div class="tiny dim mb8">来自：${ui.esc(item.page)}</div>` : ''}
    <div class="fb-msgs">${msgs}</div>
    ${
      admin
        ? `<div class="row gap8 mt12">
            <input class="input grow" data-reply-input="${ui.esc(item.id)}" maxlength="2000" placeholder="写下回复…">
            <button class="btn btn-sm btn-primary" data-reply="${ui.esc(item.id)}" type="button" style="flex:none">回复</button>
          </div>
          <div class="row gap8 mt8">
            ${item.status !== 'closed' ? `<button class="btn btn-sm btn-outline" data-close="${ui.esc(item.id)}" type="button">结束会话</button>` : ''}
            <button class="btn btn-sm btn-outline" data-del="${ui.esc(item.id)}" type="button" style="color:#c0392b">删除</button>
          </div>`
        : item.status !== 'closed'
          ? `<div class="row gap8 mt12">
              <input class="input grow" data-more-input="${ui.esc(item.id)}" maxlength="2000" placeholder="还有补充？继续写…">
              <button class="btn btn-sm btn-outline" data-more="${ui.esc(item.id)}" type="button" style="flex:none">发送</button>
            </div>`
          : ''
    }
  </div>`;
}

/* ================================================================== */
/* 用户端                                                              */
/* ================================================================== */

export async function renderContactUs(ctx) {
  if (!isLoggedIn()) {
    ctx.nav(`#/login?redirect=${encodeURIComponent('#/contact-us')}`);
    return { title: '联系我', content: '<div class="page"></div>', noTab: true };
  }

  let items = [];
  let topics = [];
  try {
    const [r, t] = await Promise.all([
      service.feedbackMine(),
      service.feedbackTopics().catch(() => ({ topics: [] })),
    ]);
    items = r?.items || [];
    topics = t?.topics || [];
  } catch {
    items = [];
  }

  const listHtml = items.length
    ? items.map((it) => threadHtml(it)).join('')
    : '<div class="empty">还没有提问记录</div>';

  return {
    title: '联系我',
    showBack: true,
    content: `<div class="page contact-us-page">
      <div class="cu-hero">
        <div class="cu-hero-t">📮 联系我</div>
        <div class="cu-hero-d">有任何问题、建议或合作意向，写在这里，管理员会尽快回复你</div>
      </div>

      <div class="card card-pad mt12">
        <div class="field">
          <label>想聊哪方面 <span class="tiny dim">（可多选）</span></label>
          <div class="chips" id="cu-topics">
            ${topics.map((t) => `<a class="chip" data-topic="${ui.esc(t.id)}">${ui.esc(t.name)}</a>`).join('')}
          </div>
        </div>
        <div class="field">
          <label>你的问题 <span class="tiny dim">（必填）</span></label>
          <textarea class="textarea" id="cu-text" rows="4" maxlength="2000"
            placeholder="例如：我想发布一条项目信息，但上传文件一直失败，怎么处理？"></textarea>
        </div>
        <div class="field">
          <label>联系方式 <span class="tiny dim">（选填，方便管理员更快联系你）</span></label>
          <input class="input" id="cu-contact" maxlength="60" placeholder="手机号 / 微信号">
        </div>
        <button class="btn btn-primary btn-block" id="cu-submit" type="button">发送给管理员</button>
        <div class="tiny dim center mt8" id="cu-tip">通常 24 小时内回复，复杂问题可能需要更久</div>
      </div>

      <div class="row between mt16" style="align-items:baseline">
        <div class="strong">我的提问</div>
        <span class="tiny dim">${items.length} 条</span>
      </div>
      <div class="fb-list">${listHtml}</div>
    </div>`,
    mount(root) {
      /* 话题多选 */
      const pickedTopics = new Set();
      root.querySelectorAll('#cu-topics [data-topic]').forEach((chip) => {
        chip.addEventListener('click', (e) => {
          e.preventDefault();
          const id = chip.dataset.topic;
          if (pickedTopics.has(id)) pickedTopics.delete(id);
          else pickedTopics.add(id);
          chip.classList.toggle('active', pickedTopics.has(id));
        });
      });

      const btn = root.querySelector('#cu-submit');
      const textEl = root.querySelector('#cu-text');
      const contactEl = root.querySelector('#cu-contact');
      const tip = root.querySelector('#cu-tip');

      const submit = async () => {
        const text = (textEl?.value || '').trim();
        if (!text) {
          if (tip) { tip.textContent = '请先写下你的问题'; tip.style.color = '#c0392b'; }
          return;
        }
        btn.disabled = true;
        btn.textContent = '发送中…';
        try {
          await service.feedbackSubmit({
            text,
            contact: (contactEl?.value || '').trim(),
            topics: [...pickedTopics],
            page: location.hash,
          });
          ui.toast('已发送给管理员', 'ok');
          ctx.nav('#/contact-us?t=' + Date.now());
        } catch (err) {
          ui.toast(err.message || '发送失败', 'err');
          btn.disabled = false;
          btn.textContent = '发送给管理员';
        }
      };
      btn?.addEventListener('click', submit);

      // 追加补充
      root.querySelectorAll('[data-more]').forEach((b) => {
        b.addEventListener('click', async () => {
          const id = b.dataset.more;
          const inp = root.querySelector(`[data-more-input="${id}"]`);
          const v = (inp?.value || '').trim();
          if (!v) return;
          b.disabled = true;
          try {
            await service.feedbackAppend(id, v);
            ui.toast('已发送', 'ok');
            ctx.nav('#/contact-us?t=' + Date.now());
          } catch (err) {
            ui.toast(err.message || '发送失败', 'err');
            b.disabled = false;
          }
        });
      });
    },
  };
}

/* ================================================================== */
/* 管理端                                                              */
/* ================================================================== */

export async function renderAdminFeedback(ctx) {
  const [res, stats] = await Promise.all([
    service.adminFeedback({}).catch(() => ({ items: [] })),
    service.adminFeedbackStats().catch(() => ({})),
  ]);

  const items = res?.items || [];
  const cur = ctx.query?.status || '';
  const tabs = [
    ['', `全部 ${stats.total || 0}`],
    ['open', `待回复 ${stats.open || 0}`],
    ['replied', `已回复 ${stats.replied || 0}`],
    ['closed', `已结束 ${stats.closed || 0}`],
  ];
  const shown = cur ? items.filter((i) => i.status === cur) : items;

  return {
    title: '留言管理',
    showBack: true,
    content: `<div class="page admin-feedback-page">
      <div class="card card-pad">
        <div class="row between">
          <div class="strong">📮 留言管理</div>
          <span class="tiny dim">${stats.unread ? `${stats.unread} 条未读` : ''}</span>
        </div>
        <div class="news-tabs mt8">
          ${tabs.map(([k, label]) => `<a class="news-tab ${cur === k ? 'active' : ''}" href="#/admin-feedback${k ? `?status=${k}` : ''}">${ui.esc(label)}</a>`).join('')}
        </div>
      </div>
      <div class="fb-list">
        ${shown.length ? shown.map((it) => threadHtml(it, { admin: true })).join('') : '<div class="empty">暂无留言</div>'}
      </div>
    </div>`,
    mount(root) {
      root.querySelectorAll('[data-reply]').forEach((b) => {
        b.addEventListener('click', async () => {
          const id = b.dataset.reply;
          const inp = root.querySelector(`[data-reply-input="${id}"]`);
          const v = (inp?.value || '').trim();
          if (!v) return ui.toast('请先写回复内容', 'err');
          b.disabled = true;
          b.textContent = '发送中…';
          try {
            await service.adminFeedbackReply(id, v);
            ui.toast('已回复，用户会收到通知', 'ok');
            ctx.nav('#/admin-feedback?t=' + Date.now());
          } catch (err) {
            ui.toast(err.message || '回复失败', 'err');
            b.disabled = false;
            b.textContent = '回复';
          }
        });
      });

      root.querySelectorAll('[data-close]').forEach((b) => {
        b.addEventListener('click', async () => {
          try {
            await service.adminFeedbackClose(b.dataset.close);
            ui.toast('已结束会话', 'ok');
            ctx.nav('#/admin-feedback?t=' + Date.now());
          } catch (err) {
            ui.toast(err.message || '操作失败', 'err');
          }
        });
      });

      root.querySelectorAll('[data-del]').forEach((b) => {
        b.addEventListener('click', async () => {
          const ok = await ui.confirmDialog({
            title: '删除留言',
            message: '删除后不可恢复，确定吗？',
            danger: true,
            okText: '删除',
          });
          if (!ok) return;
          try {
            await service.adminFeedbackDelete(b.dataset.del);
            ui.toast('已删除', 'ok');
            ctx.nav('#/admin-feedback?t=' + Date.now());
          } catch (err) {
            ui.toast(err.message || '删除失败', 'err');
          }
        });
      });
    },
  };
}

export default { renderContactUs, renderAdminFeedback };

/**
 * 小鱼来了 — 推荐有礼
 *
 * 每个用户有专属推荐码与二维码。
 * 被推荐人通过推荐链接注册后，会自动出现在你的通讯录里。
 */

import { service } from './api.js';
import { copyText as copyToClipboard } from './clipboard.js';
import * as ui from './ui.js';

/* 相对时间 */
function relTime(iso) {
  if (!iso) return '';
  const t = Date.parse(iso);
  if (!t) return '';
  const d = Date.now() - t;
  if (d < 60_000) return '刚刚';
  if (d < 3600_000) return `${Math.floor(d / 60_000)} 分钟前`;
  if (d < 86400_000) return `${Math.floor(d / 3600_000)} 小时前`;
  if (d < 7 * 86400_000) return `${Math.floor(d / 86400_000)} 天前`;
  return new Date(t).toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' });
}

export async function renderReferral(ctx) {
  let info = null;
  try {
    info = await service.referralMe();
  } catch {
    info = null;
  }

  // 注意用可选链：这行在 if (!info) 判空之前，info 可能为 null
  const ss = info?.shareStats || { total: 0, today: 0, week: 0, byChannel: {}, conversion: 0, lastAt: '' };

  if (!info) {
    return {
      title: '推荐有礼',
      content: '<div class="page"><div class="empty">请先登录后再查看推荐码</div></div>',
    };
  }

  const qr = service.qrUrl(info.qrText || info.url, 260);
  const invited = info.invited || [];

  const invitedHtml = invited.length
    ? invited
        .map(
          (u) => `<div class="ref-user">
            <div class="ref-ava">${ui.esc((u.nickname || '?').slice(0, 1))}</div>
            <div class="ref-body">
              <div class="ref-name">${ui.esc(u.nickname || '未命名')}</div>
              <div class="ref-meta">${ui.esc([u.company, u.industry, u.city].filter(Boolean).join(' · ') || '—')}</div>
            </div>
            <a class="btn btn-sm btn-outline" href="#/user/${ui.esc(u.id)}">查看</a>
          </div>`,
        )
        .join('')
    : '<div class="empty">还没有人通过你的推荐码入驻</div>';

  return {
    title: '推荐有礼',
    showBack: true,
    content: `<div class="page ref-page">
      <div class="ref-hero">
        <div class="ref-hero-t">🎁 推荐有礼</div>
        <div class="ref-hero-d">把小鱼来了推荐给同行，对方通过你的专属码入驻后，会自动加入你的通讯录</div>

        <div class="ref-code-box">
          <div class="ref-code-label">我的推荐码</div>
          <div class="ref-code" id="ref-code">${ui.esc(info.code)}</div>
          <div class="ref-qr">
            <img src="${ui.esc(qr)}" alt="推荐二维码" id="ref-qr-img">
            <div class="ref-qr-cap">扫一扫，用我的推荐码入驻</div>
          </div>
        </div>

        <div class="ref-actions">
          <button class="btn btn-primary grow" id="ref-copy" type="button">📋 复制推荐链接</button>
          <button class="btn btn-outline grow" id="ref-share" type="button">💚 转发到微信</button>
        </div>
        <div class="ref-link" id="ref-link">${ui.esc(info.url)}</div>
      </div>

      <div class="ref-stats">
        <div class="ref-stat"><b>${info.invitedCount || 0}</b><span>已推荐入驻</span></div>
        <div class="ref-stat"><b>${info.contactCount || 0}</b><span>通讯录新增</span></div>
        <div class="ref-stat"><b>${ss.total || 0}</b><span>累计分享</span></div>
        <div class="ref-stat"><b>${ss.today || 0}</b><span>今日分享</span></div>
      </div>

      <div class="card card-pad mt12">
        <div class="row between mb8">
          <div class="strong">📊 我的分享数据</div>
          <span class="tiny dim">${ss.invitedCount > 0 && ss.conversion ? `平均 ${ss.conversion} 次分享带来 1 个注册` : (ss.total ? `已分享 ${ss.total} 次，暂无注册` : `还没分享过`)}</span>
        </div>
        <div class="sh-stat-grid">
          <div class="sh-stat"><b>${ss.byChannel?.poster || 0}</b><span>🖼 海报</span></div>
          <div class="sh-stat"><b>${ss.byChannel?.text || 0}</b><span>📝 文案</span></div>
          <div class="sh-stat"><b>${ss.byChannel?.link || 0}</b><span>🔗 链接</span></div>
          <div class="sh-stat"><b>${ss.week || 0}</b><span>近 7 天</span></div>
        </div>
        <div class="sh-tip">
          ${ss.total
            ? `最近一次分享：${relTime(ss.lastAt)}`
            : '还没有分享记录，点下面的按钮把平台发给同行吧'}
        </div>
      </div>

      <div class="card card-pad mt12">
        <div class="row between mb8">
          <div class="strong">我推荐的人</div>
          <a class="tiny" href="#/contacts">查看通讯录 ›</a>
        </div>
        <div class="ref-users">${invitedHtml}</div>
      </div>

      <div class="card card-pad mt12">
        <div class="strong mb8">怎么用</div>
        <div class="ref-how">
          <div class="ref-step"><span>1</span>把上面的二维码或链接发给同行</div>
          <div class="ref-step"><span>2</span>对方扫码打开注册页，推荐码会自动填好</div>
          <div class="ref-step"><span>3</span>对方完成注册后，会自动进入你的通讯录</div>
          <div class="ref-step"><span>4</span>你可以直接查看他的公司、行业、城市等基础信息</div>
        </div>
      </div>
    </div>`,
    mount(root) {
      const code = info.code;
      const url = info.url;

      root.querySelector('#ref-copy')?.addEventListener('click', async () => {
        const text = `我在用「小鱼来了」找项目、找投资、找产业，用我的推荐码 ${code} 入驻：${url}`;
        const cr = await copyToClipboard(text);
        if (cr === 'ok') ui.toast('推荐链接已复制', 'ok');
        else ui.toast('复制失败，请长按上面的链接手动复制', 'err');
      });

      root.querySelector('#ref-share')?.addEventListener('click', () => {
        // 唤起系统分享（微信里会走微信自己的分享面板）
        if (navigator.share) {
          navigator.share({
            title: '小鱼来了 · 推荐有礼',
            text: `用我的推荐码 ${code} 入驻小鱼来了，找项目、找投资、找产业`,
            url,
          }).catch(() => {});
        } else {
          ui.toast('请复制上面的链接，粘贴到微信发送', 'ok');
        }
      });

      // 长按二维码可保存
      const img = root.querySelector('#ref-qr-img');
      if (img) {
        img.style.cursor = 'pointer';
        img.addEventListener('click', () => {
          window.open(img.src, '_blank');
        });
      }
    },
  };
}

export default { renderReferral };

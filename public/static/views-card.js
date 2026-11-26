/**
 * 卢云 · 电子名片
 * 路由：#/card
 */

import * as ui from './ui.js';

const CARD_URL = 'https://xiaoyulaile.online/#/card';
const TEL = '15606768989';
const EMAIL = 'service@xiaoyulaile.online';

function vcardText() {
  return [
    'BEGIN:VCARD',
    'VERSION:3.0',
    'N:卢;云;;;',
    'FN:卢云',
    'ORG:杭州硕鱼科技有限公司',
    'TITLE:创始人兼 CEO',
    `TEL;TYPE=CELL:${TEL}`,
    `EMAIL;TYPE=WORK:${EMAIL}`,
    'URL:https://xiaoyulaile.online',
    'NOTE:AI 驱动的产业互联网 B2B/B2G 平台',
    'END:VCARD',
  ].join('\r\n');
}

function downloadVcard() {
  const blob = new Blob([vcardText()], { type: 'text/vcard;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = '卢云-小鱼来了.vcf';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 3000);
  ui.toast('名片已保存，打开文件可添加到通讯录');
}

async function copyEmail() {
  try {
    await navigator.clipboard.writeText(EMAIL);
    ui.toast('邮箱已复制');
  } catch {
    const ta = document.createElement('textarea');
    ta.value = EMAIL;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
    ui.toast('邮箱已复制');
  }
}

async function shareCard() {
  if (navigator.share) {
    try {
      await navigator.share({ title: '卢云 · 小鱼来了', text: '小鱼来了 · AI 驱动的产业互联网平台', url: CARD_URL });
      return;
    } catch {}
  }
  try {
    await navigator.clipboard.writeText(CARD_URL);
    ui.toast('名片链接已复制，可发给微信好友');
  } catch {
    ui.toast('请复制浏览器地址分享');
  }
}

export async function renderCard() {
  const html = `<div class="page bc-page">
    <div class="bc-stage">
      <div class="bc-card" id="business-card">
        <div class="bc-glow"></div>
        <div class="bc-head">
          <img class="bc-logo" src="/static/logo-white@2x.png" alt="小鱼来了">
          <div class="bc-chip">AI · 产业互联网</div>
        </div>
        <div class="bc-person">
          <div class="bc-avatar">卢</div>
          <div class="bc-person-info">
            <div class="bc-name">卢云</div>
            <div class="bc-role">创始人兼 CEO</div>
            <div class="bc-company">杭州硕鱼科技有限公司</div>
          </div>
        </div>
        <div class="bc-tagline">AI 驱动的产业互联网 B2B / B2G 平台</div>
        <div class="bc-slogan">让每一条好项目，都被对的人看见</div>
        <div class="bc-bio">专注产业互联网与 AI 应用，连接项目、资金、服务商与政府园区。</div>
        <div class="bc-foot">
          <div class="bc-contacts">
            <a href="tel:${TEL}"><span class="bc-ci">电话</span>${TEL}</a>
            <a href="mailto:${EMAIL}"><span class="bc-ci">邮箱</span>${EMAIL}</a>
            <a href="https://xiaoyulaile.online" target="_blank" rel="noopener"><span class="bc-ci">网址</span>xiaoyulaile.online</a>
          </div>
          <div class="bc-qr">
            <img src="/static/card-qr.png" alt="扫码打开电子名片">
            <span>扫码看名片</span>
          </div>
        </div>
        <div class="bc-strip">杭州　|　产业信息 · AI 内容 · 项目对接</div>
      </div>

      <div class="bc-actions">
        <a class="bc-btn bc-btn-main" href="tel:${TEL}">打电话</a>
        <button class="bc-btn" type="button" data-card="copy">复制邮箱</button>
        <button class="bc-btn" type="button" data-card="vcard">保存到通讯录</button>
        <button class="bc-btn" type="button" data-card="share">分享名片</button>
      </div>
      <div class="bc-hint">保存到通讯录后，微信/手机通讯录可直接拨号、发邮件。</div>
    </div>
  </div>`;

  return {
    title: '卢云 · 小鱼来了',
    content: html,
    activeTab: '',
    showBack: true,
    noTab: true,
    afterRender() {
      document.querySelectorAll('[data-card]').forEach((el) => {
        el.addEventListener('click', () => {
          const action = el.getAttribute('data-card');
          if (action === 'copy') copyEmail();
          else if (action === 'vcard') downloadVcard();
          else if (action === 'share') shareCard();
        });
      });
    },
  };
}

// 页面内容由 app.js 插入，按钮用全局事件委托，避免依赖路由生命周期钩子
document.addEventListener('click', (e) => {
  const el = e.target && e.target.closest ? e.target.closest('[data-card]') : null;
  if (!el) return;
  const action = el.getAttribute('data-card');
  if (action === 'copy') copyEmail();
  else if (action === 'vcard') downloadVcard();
  else if (action === 'share') shareCard();
});

export default { renderCard };

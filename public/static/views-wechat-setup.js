/**
 * 小鱼来了 — 微信公众号接入配置
 *
 * 路由：#/wechat-setup
 * 说明：分享卡片（自定义标题/摘要/封面）依赖公众号 JS-SDK。
 * 代码已完整实现，只差 AppID/AppSecret 与公众号后台域名配置。
 */

import { service, isLoggedIn } from './api.js';
import * as ui from './ui.js';

const STEPS = [
  {
    n: 1,
    t: '注册 / 登录微信公众平台',
    d: '打开 mp.weixin.qq.com，使用订阅号或服务号（服务号权限更全）。已有公众号可直接用。',
  },
  {
    n: 2,
    t: '拿到 AppID 与 AppSecret',
    d: '公众号后台 → 开发 → 开发管理 → 基本配置。AppSecret 只显示一次，务必当场保存。',
  },
  {
    n: 3,
    t: '设置「JS 接口安全域名」',
    d: '公众号后台 → 设置与开发 → 公众号设置 → 功能设置 → JS 接口安全域名，填 xiaoyulaile.online（不带 https://）。',
    warn: '这一步不做，微信会报 invalid signature，分享卡片不会生效。',
  },
  {
    n: 4,
    t: '设置「网页授权域名」（用于微信登录）',
    d: '同一页面下的「网页授权域名」，同样填 xiaoyulaile.online。用于微信一键登录。',
  },
  {
    n: 5,
    t: '填写服务器 Token',
    d: '公众号后台 → 开发 → 基本配置 → 服务器配置。URL 填 https://xiaoyulaile.online/api/wechat/callback，Token 自己定一个字符串。',
    warn: '服务器配置点「提交」时微信会来校验，Token 必须与服务器 .env 里的 WECHAT_TOKEN 一致。',
  },
  {
    n: 6,
    t: '把三个值写进服务器 .env 并重启',
    d: '在 /opt/xiaoyu-laile/.env 里加上 WECHAT_APP_ID / WECHAT_APP_SECRET / WECHAT_TOKEN，然后 systemctl restart xiaoyu-laile。',
  },
];

export async function renderWechatSetup(ctx) {
  if (!isLoggedIn()) {
    ctx.nav('#/login?redirect=' + encodeURIComponent('#/wechat-setup'));
    return { title: '公众号接入', content: '<div class="page"></div>' };
  }
  if (!ctx.state.user?.isAdmin && typeof ctx.refreshMe === 'function') {
    await ctx.refreshMe().catch(() => null);
  }
  if (!ctx.state.user?.isAdmin) {
    return { title: '公众号接入', content: ui.emptyState('🔒', '需要管理员权限'), showBack: true };
  }

  const st = await service.wechatStatus().catch(() => null);
  if (!st) {
    return { title: '公众号接入', content: ui.emptyState('🧭', '加载失败，请稍后重试'), showBack: true };
  }

  const envTemplate = `# 微信公众号（分享卡片 + 微信登录）
WECHAT_APP_ID=${st.filled.WECHAT_APP_ID ? st.appIdMasked : 'wx________________'}
WECHAT_APP_SECRET=${st.filled.WECHAT_APP_SECRET ? '********（已配置）' : '你的AppSecret'}
WECHAT_TOKEN=${st.filled.WECHAT_TOKEN ? '********（已配置）' : '自定义Token'}`;

  const fieldRows = (st.fields || [])
    .map(
      (f) => `<div class="wxsetup-field ${f.filled ? 'ok' : ''}">
        <div class="wxsetup-field-ico">${f.filled ? '✅' : '⬜'}</div>
        <div>
          <div class="wxsetup-field-k">${ui.esc(f.key)}</div>
          <div class="wxsetup-field-l">${ui.esc(f.label)}</div>
          <div class="wxsetup-field-d">${ui.esc(f.desc)}</div>
        </div>
      </div>`
    )
    .join('');

  const stepsHtml = STEPS.map(
    (s) => `<div class="wxsetup-step">
      <div class="wxsetup-step-n">${s.n}</div>
      <div>
        <div class="wxsetup-step-t">${ui.esc(s.t)}</div>
        <div class="wxsetup-step-d">${ui.esc(s.d)}</div>
        ${s.warn ? `<div class="warn-note mt8">⚠️ ${ui.esc(s.warn)}</div>` : ''}
      </div>
    </div>`
  ).join('');

  return {
    title: '公众号接入',
    content: `<div class="page">
      <div class="wxsetup-hero ${st.jsSdkReady ? 'ok' : ''}">
        <div class="wxsetup-hero-t">💚 微信公众号接入</div>
        <div class="wxsetup-hero-s">
          ${st.jsSdkReady
            ? '公众号已配置，微信内转发卡片会显示自定义标题、摘要与封面图。'
            : '代码已就绪，填入 AppID / AppSecret 后，微信内转发卡片即可显示自定义标题与封面。'}
        </div>
      </div>

      <div class="card card-pad mt12">
        <div class="inv-sec-t">当前状态</div>
        <div class="wxsetup-grid">
          <div class="wxsetup-stat ${st.jsSdkReady ? 'ok' : ''}">
            <b>${st.jsSdkReady ? '已接入' : '未接入'}</b><span>公众号 JS-SDK</span>
          </div>
          <div class="wxsetup-stat ${st.mpReady ? 'ok' : ''}">
            <b>${st.mpReady ? '已接入' : '未接入'}</b><span>微信登录（网页授权）</span>
          </div>
          <div class="wxsetup-stat ${st.openReady ? 'ok' : ''}">
            <b>${st.openReady ? '已接入' : '未接入'}</b><span>开放平台扫码登录</span>
          </div>
        </div>
        ${(st.notes || []).map((n) => `<div class="tiny dim mt8">· ${ui.esc(n)}</div>`).join('')}
      </div>

      <div class="card card-pad mt12">
        <div class="inv-sec-t">配置项</div>
        ${fieldRows}
      </div>

      <div class="card card-pad mt12">
        <div class="row between mb8">
          <div class="inv-sec-t" style="margin-bottom:0">服务器 .env 模板</div>
          <button class="btn btn-sm btn-outline" id="wx-copy-env">复制</button>
        </div>
        <pre class="wxsetup-code">${ui.esc(envTemplate)}</pre>
        <div class="tiny dim mt8">改完执行：<code>systemctl restart xiaoyu-laile</code></div>
      </div>

      <div class="card card-pad mt12">
        <div class="inv-sec-t">接入步骤</div>
        ${stepsHtml}
      </div>

      <div class="card card-pad mt12">
        <div class="inv-sec-t">签名自检</div>
        <div class="tiny dim mb12">在微信内打开本页时，可用下面的按钮确认 JS-SDK 签名是否正常。</div>
        <button class="btn btn-outline btn-block" id="wx-test">测试 JS-SDK 签名</button>
        <div id="wx-test-result" class="mt12"></div>
      </div>

      <div class="inv-risk mt12">
        <div class="inv-risk-t">⚠️ 说明</div>
        <div class="inv-risk-b">
          <p>1. 未配置公众号时，微信内转发<b>功能正常</b>，只是卡片标题/封面不能自定义。</p>
          <p>2. 即使接入成功，微信也不允许网页<b>直接触发转发</b>，仍需用户点右上角「···」。</p>
          <p>3. 公众号需完成<b>微信认证</b>后，部分接口（如网页授权）才完全可用。</p>
        </div>
      </div>
    </div>`,
    showBack: true,
    mount(root) {
      root.querySelector('#wx-copy-env')?.addEventListener('click', async () => {
        const ok = await ui.copyText(envTemplate);
        ui.toast(ok ? '已复制 .env 模板' : '复制失败', ok ? 'ok' : 'err');
      });

      root.querySelector('#wx-test')?.addEventListener('click', async (e) => {
        const btn = e.currentTarget;
        const box = root.querySelector('#wx-test-result');
        btn.disabled = true;
        btn.textContent = '测试中…';
        try {
          const cfg = await service.wechatJsConfig(location.href.split('#')[0]);
          if (!cfg || !cfg.signature) {
            box.innerHTML = '<div class="wx-status">❌ 未返回签名，说明公众号还没配置（或 AppID/AppSecret 不正确）</div>';
          } else {
            box.innerHTML = `<div class="wx-status ok">
              ✅ 签名正常<br>
              <span class="tiny">appId: ${ui.esc(cfg.appId || '')}<br>
              timestamp: ${ui.esc(String(cfg.timestamp || ''))}<br>
              nonceStr: ${ui.esc(cfg.nonceStr || '')}<br>
              signature: ${ui.esc(String(cfg.signature || '').slice(0, 16))}…</span>
            </div>`;
          }
        } catch (err) {
          box.innerHTML = `<div class="wx-status">❌ ${ui.esc(err.message || '测试失败')}</div>`;
        } finally {
          btn.disabled = false;
          btn.textContent = '测试 JS-SDK 签名';
        }
      });
    },
  };
}

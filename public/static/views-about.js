/**
 * 小鱼来了 — 平台简介页（#/about）
 *
 * 主要给政府 / 园区 / 国资平台看的版本：
 * 讲清楚「我们是谁、能为地方做什么、怎么合作」。
 */

import * as ui from './ui.js';
import { copyText as copyToClipboard } from './clipboard.js';
import { isLoggedIn } from './api.js';

const CAPABILITIES = [
  {
    icon: '🎯',
    title: '招商引智',
    desc: '把园区载体、产业基金与扶持政策标准化发布，AI 自动解析成结构化要素，经微信生态一键群发，让全国项目方与投资机构精准触达本地招商方向。',
    points: ['园区 / 载体信息标准化', 'AI 解析项目要素', '一键群发到微信'],
  },
  {
    icon: '🤝',
    title: '产业撮合',
    desc: '本地企业发布采购、供应、融资、技术攻关需求，平台按行业、区域、金额做 AI 匹配，把外部资源直接推给对口决策人，对接过程全程留痕。',
    points: ['供需双向发布', 'AI 三维匹配', '对接链路可追踪'],
  },
  {
    icon: '📊',
    title: '线索沉淀',
    desc: '持续抓取全网产业项目信息，AI 提取金额、地点与阶段并给出可信度评分，为招商团队沉淀可长期运营的线索池。',
    points: ['全网项目信息抓取', 'AI 提取关键要素', '可信度评分'],
  },
];

const AUDIENCES = ['政府招商部门', '产业园区', '国资 / 城投平台', '投资机构', '本地规模企业', '服务商'];

export function renderAbout(ctx, query) {
  // 二维码指向本站首页（手机上扫开就能看），用绝对地址
  const shareUrl = `${location.origin}/#/about`;

  const html = `<div class="page about-page">
    <div class="about-hero">
      <div class="about-logo">
        <img src="/static/logo.png" srcset="/static/logo@2x.png 2x" width="132" height="19" alt="小鱼来了">
      </div>
      <h1>AI 驱动的产业项目对接平台</h1>
      <p class="about-lead">
        把地方在招什么发出去，把全国在找的接回来。
      </p>
      <div class="chips about-aud">
        <span class="tiny dim" style="flex:none">面向：</span>
        ${AUDIENCES.map((x) => `<span class="chip sm">${ui.esc(x)}</span>`).join('')}
      </div>
    </div>

    <div class="card card-pad mt12">
      <div class="strong mb8">🪧 平台定位</div>
      <div class="small" style="line-height:1.75">
        「小鱼来了」是 AI 驱动的产业项目对接平台。面向地方政府与国资平台，
        我们把本地的园区载体与政策发布出去、把全国的项目线索抓回来、
        把本地企业的供需接起来：AI 自动解析项目要素、按行业区域金额匹配对口资源、
        给出可信度评分，并通过微信生态一键分发。
      </div>
      <div class="about-kv mt12">
        <div class="about-kv-item"><b>免费发布</b><span>不按条收费</span></div>
        <div class="about-kv-item"><b>无需开发</b><span>浏览器直接使用</span></div>
        <div class="about-kv-item"><b>可私有化</b><span>支持部署到本地</span></div>
      </div>
    </div>

    <div class="card card-pad mt12">
      <div class="strong mb8">🚀 三个能力</div>
      ${CAPABILITIES.map(
        (c) => `<div class="about-cap">
          <div class="about-cap-ico">${c.icon}</div>
          <div class="about-cap-body">
            <div class="about-cap-title">${ui.esc(c.title)}</div>
            <div class="small muted" style="line-height:1.7">${ui.esc(c.desc)}</div>
            <div class="about-cap-points">
              ${c.points.map((p) => `<span class="about-point">· ${ui.esc(p)}</span>`).join('')}
            </div>
          </div>
        </div>`,
      ).join('')}
    </div>

    <div class="card card-pad mt12">
      <div class="strong mb8">🧩 合作方式</div>
      <div class="small muted" style="line-height:1.8">
        <div>· <b>直接使用</b>：注册后即可发布园区、政策、项目与合作需求。</div>
        <div>· <b>区域专区</b>：为地方开设独立专区页，集中展示本地载体与招商方向。</div>
        <div>· <b>私有化部署</b>：部署到本地机房或政务云，数据不出域。</div>
        <div>· <b>定制开发</b>：按需对接本地已有平台与数据。</div>
      </div>
    </div>

    <div class="card card-pad mt12">
      <div class="strong mb8">📮 联系我们</div>
      <div class="about-contact">
        <div class="about-qr-wrap">
          <img class="about-qr" alt="扫码打开"
            src="/api/share/qrcode?size=300&text=${encodeURIComponent(shareUrl)}">
          <div class="tiny dim center mt6">扫码在手机上打开</div>
        </div>
        <div class="about-contact-info">
          <div class="about-c-label">电话 / 微信</div>
          <a class="about-c-phone" id="about-phone" href="tel:13456693544">13456693544</a>
          <div class="tiny dim" style="margin-top:-2px">手机上点号码可直接拨号</div>
          <div class="tiny dim" style="margin-bottom:10px">卢云 · 小鱼来了</div>
          <button class="btn btn-sm btn-outline btn-block" id="about-copy" type="button">📋 复制号码</button>
          <a class="btn btn-sm btn-primary btn-block mt8" href="#/contact-us">在线留言</a>
          <div class="tiny dim mt8">想了解具体怎么落地，留言后可约时间详聊。</div>
        </div>
      </div>
      <div class="row gap8 mt12">
        ${isLoggedIn() ? '<a class="btn btn-sm grow" href="#/publish?category=project">先发布一条试试</a>' : '<a class="btn btn-sm grow" href="#/register">免费注册</a>'}
        <a class="btn btn-sm grow" href="#/home">看看站里有什么</a>
      </div>
    </div>

    <div class="center tiny dim mt16" style="padding-bottom:24px">
      小鱼来了 · 让每一条好项目，都被对的人看见
    </div>
  </div>`;

  return {
    title: '平台简介',
    content: html,
    showBack: true,
    noTab: false,
    activeTab: '',
    mount(root) {
      root.querySelector('#about-copy')?.addEventListener('click', async () => {
        const phone = root.querySelector('#about-phone')?.innerText?.trim() || '13456693544';
        // copyToClipboard 内部已做多级兜底（含 iOS 友好的选中方式）
        const cr = await copyToClipboard(phone);
        const ok = cr === 'ok';
        ui.toast(ok ? '号码已复制：' + phone : '复制失败，请长按号码手动复制', ok ? 'ok' : 'err');
      });
    },
  };
}

export default { renderAbout };

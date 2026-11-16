/**
 * AI 自动化招投标助手（小额交易 400 万以下）· 独立购买/介绍页
 * 路由：#/bid-assistant
 *
 * 产品：一套 10,000 元/年；页面不直接收款，提交购买意向后由负责人联系开通。
 */

import * as ui from './ui.js';

const PRICE = '10,000 元 / 年';

const DISTRICTS = [
  { name: '萧山', items: ['CA 锁 + 品茗软件锁', '保证金项目人工操作，每周上传一次汇票', '动态核查每周一，社保每月'] },
  { name: '余杭', items: ['项目经理 + 施工员 + 安全员备案，2 个工作日', '动态核查每周一，社保每月'] },
  { name: '临平', items: ['项目经理 + 施工员 + 安全员备案，2 个工作日', '动态核查每周一，社保每 5 个工作日'] },
  { name: '滨江', items: ['登录扫码 / 法人锁', '易滨通走浙里办扫码 / 法人锁', '保证金项目手动上传，保函分线上线下'] },
  { name: '富阳', items: ['项目经理备案', '投标资料盖章版', '社保投标当日并盖章', '声明函/中小企业承诺书盖实体章并签字'] },
  { name: '临安', items: ['动态核查有时要盖章版', '保证金项目人工操作，每周上传一次'] },
];

const FEATURES = [
  ['📋', '各区细则速查', '杭州已收集 6 个区的 CA 锁、人员备案、动态核查、社保、保证金要求，投标前先对一遍。'],
  ['✅', '材料清单', '按项目生成投标资料清单，盖章、社保、保函、承诺书逐项核对，减少漏项。'],
  ['⏰', '节点提醒', '备案 2 个工作日、动态核查周一、社保月度等节点，提前提醒。'],
  ['🔎', '公告筛选', '浙江政府采购 + 各地市公告，按地区、类型筛选，直接看原文。'],
  ['📤', '分享协作', '公告和资料清单一键分享到微信，项目组直接转发。'],
  ['🛠️', '上线配置', '一套软件年费，含上线配置与使用培训。'],
];

function contactHref(about) {
  return `#/contact-us?topic=consult&about=${encodeURIComponent(about)}`;
}

export async function renderBidAssistant() {
  const html = `<div class="page ba-page">
    <section class="ba-hero">
      <div class="ba-badge">📑 AI自动化招投标助手（小额交易400万以下）</div>
      <h1 class="ba-title">AI自动化招投标助手</h1>
      <div class="ba-sub">专注小额交易（400 万元以下）：AI 自动寻标、读标、匹配资质业绩、编制与核查标书、读取 CA 完成投标操作。</div>
      <div class="ba-price-row">
        <div class="ba-price">${PRICE}</div>
        <div class="ba-price-note">一套 · 年费 · 含上线配置与培训</div>
      </div>
      <div class="ba-actions">
        <a class="ba-btn ba-btn-primary" href="${contactHref('我想购买【AI自动化招投标助手（小额交易400万以下）】一套 10,000 元/年')}">立即咨询购买</a>
        <a class="ba-btn" href="#/bidding">先看浙江招投标专题 ›</a>
      </div>
      <div class="ba-hero-note">政策与平台规则以各区交易中心、招标文件最新通知为准；软件交付范围以合同为准。</div>
    </section>

    <section class="ba-section ba-video-section">
      <div class="ba-section-t">先看 49 秒演示 · 小额交易自动投标</div>
      <div class="ba-video-wrap">
        <video controls preload="metadata" playsinline poster="/docs/bid-software-poster.jpg">
          <source src="/docs/bid-software-intro-safe.mp4" type="video/mp4">
        </video>
      </div>
      <div class="ba-tech">
        <div><b>① 标讯检索 + 多格式解析</b><span>直接读 PDF、压缩包；按资质/业务偏好筛选 400 万以下小额项目，去重、分类、打分。</span></div>
        <div><b>② 资质 + 评标 + 标书核查</b><span>匹配资信业绩、模拟评分、一键导出最佳资信；按格式撰写标书，做资格性/响应性/形式性核查。</span></div>
        <div><b>③ 读取 CA + 自主操作投标</b><span>读取 CA 锁信息、打开网页/登录/上传标书、签到与结果查询，减少多系统锁冲突。</span></div>
      </div>
    </section>

    <section class="ba-section">
      <div class="ba-section-t">为什么需要它</div>
      <div class="ba-pains">
        <div><b>① 小额项目流程一样重</b><span>400 万以下项目金额不大，但找标、读标、备案、做标、投标一样不少，人工投不划算。</span></div>
        <div><b>② 找标和读标耗人</b><span>公告分散、附件是 PDF/压缩包，资质和人员要求要逐条对，容易漏标。</span></div>
        <div><b>③ 标书和 CA 易错</b><span>格式审查、盖章、社保、保函、多系统 CA 锁，投标前才发现少一项。</span></div>
      </div>
    </section>

    <section class="ba-section">
      <div class="ba-section-t">软件包含什么</div>
      <div class="ba-features">
        ${FEATURES.map(([ico, t, d]) => `<div class="ba-feature"><div class="ba-f-ico">${ico}</div><div><div class="ba-f-t">${ui.esc(t)}</div><div class="ba-f-d">${ui.esc(d)}</div></div></div>`).join('')}
      </div>
    </section>

    <section class="ba-section">
      <div class="ba-section-h">
        <div class="ba-section-t">杭州各区细则（已收集 6 个区）</div>
        <a class="ba-link" href="#/bidding">在招投标专题查看 ›</a>
      </div>
      <div class="ba-districts">
        ${DISTRICTS.map((d) => `<div class="ba-district"><b>${ui.esc(d.name)}</b><ul>${d.items.map((x) => `<li>${ui.esc(x)}</li>`).join('')}</ul></div>`).join('')}
      </div>
      <div class="ba-pending">上城、拱墅、西湖、钱塘的细则待补充；<a href="#/contact-us?topic=consult&about=我想补充杭州上城/拱墅/西湖/钱塘招投标细则" style="color:#B45309;font-weight:700">提交你所在区的实操细则 ›</a></div>
    </section>

    <section class="ba-section">
      <div class="ba-section-t">适合谁</div>
      <div class="ba-who">
        <span>施工企业</span><span>服务商</span><span>货物供应商</span><span>经常投 400 万以下小额项目</span><span>没有专职投标团队的小企业</span>
      </div>
    </section>

    <section class="ba-section">
      <div class="ba-section-t">开通流程</div>
      <div class="ba-steps">
        <div><b>1</b><span>提交购买意向</span></div>
        <div><b>2</b><span>确认需求 / 开票</span></div>
        <div><b>3</b><span>付款</span></div>
        <div><b>4</b><span>开通 + 培训</span></div>
      </div>
      <div class="ba-cta">
        <div><div class="ba-cta-t">一套 ${PRICE}</div><div class="ba-cta-d">先提交需求，负责人 1 个工作日内联系</div></div>
        <a class="ba-btn ba-btn-primary" href="${contactHref('我想购买【AI自动化招投标助手（小额交易400万以下）】一套 10,000 元/年')}">立即咨询购买</a>
      </div>
    </section>

    <section class="ba-section ba-faq">
      <div class="ba-section-t">常见问题</div>
      <details><summary>能直接在线付款吗？</summary><div>目前提交意向后由负责人确认需求、开票并安排付款与开通；不在页面直接收款。</div></details>
      <details><summary>只支持 400 万以下吗？</summary><div>产品定位是 400 万元以下小额交易；超过该金额或特殊类型项目，先按招标文件与平台规则做可行性评估，再决定是否使用。</div></details>
      <details><summary>包含几个账号？</summary><div>按“一套软件/一个使用主体”交付；具体账号数与交付范围在合同中确认。</div></details>
      <details><summary>其他区细则什么时候补？</summary><div>上城、拱墅、西湖、钱塘等区的细则需要实操版本核验后补充，不编造；可先提交你所在区的规则。</div></details>
      <details><summary>规则会变吗？</summary><div>会。各区交易中心、招标文件可能调整，软件内规则会标注更新日期；投标前仍以官方最新通知为准。</div></details>
    </section>
  </div>`;

  return {
    title: 'AI自动化招投标助手（小额交易400万以下）',
    content: html,
    activeTab: '',
    showBack: true,
    noTab: true,
  };
}

export default { renderBidAssistant };

/**
 * 小鱼来了 — 合规章节：隐私政策 / 用户协议 / 免责声明
 *
 * 为什么要有这几页：
 *   浏览器（尤其是微信、QQ、华为等内置浏览器）判断一个站点「有风险」，
 *   除了备案和黑名单，还会看它有没有基本的合规页面：
 *   谁在运营、数据怎么用、内容谁负责、怎么举报。
 *   缺这些，站点看起来就像个来路不明的页面。
 */

import * as ui from './ui.js';

const OPERATOR = '小鱼来了科技有限公司';
const CONTACT = '13456693544';
const EMAIL = 'service@xiaoyulaile.online';
const UPDATED = '2026-11-01';

const PRIVACY = {
  title: '隐私政策',
  intro: '我们收集哪些信息、用来做什么、你能怎么控制。',
  sections: [
    {
      h: '一、我们收集的信息',
      p: [
        '账号信息：手机号或邮箱、昵称、头像。手机号用于登录和找回账号。',
        '发布内容：你主动填写的项目、贸易、活动等信息，以及上传的图片和文档。',
        '使用记录：浏览、收藏、留言等操作记录，用于改进产品与安全风控。',
        '设备与日志：IP 地址、浏览器类型、访问时间，用于安全防护与故障排查。',
      ],
    },
    {
      h: '二、我们如何使用这些信息',
      p: [
        '提供核心功能：发布信息、检索、对接、通知。',
        '安全与合规：防止刷注册、诈骗、侵权内容传播。',
        '改进产品：统计功能使用情况，不针对个人做画像推送。',
        '我们不会出售你的个人信息。',
      ],
    },
    {
      h: '三、联系方式如何保护',
      p: [
        '默认情况下，联系方式仅本人、管理员以及已完成对接的成员可见。',
        '居间信息（介绍人、居间费、结算约定）仅发布者、管理员与发布者指定手机号可见，接口层按身份下发。',
        '公开页面不会下发隐藏字段，不是「前端藏起来」，是服务端根本不给。',
      ],
    },
    {
      h: '四、你的权利',
      p: [
        '你可以随时修改或删除自己发布的内容。',
        '你可以申请注销账号：删除账号及其内容（法律要求保留的除外）。',
        '如需导出或删除数据，可通过下方联系方式提出。',
      ],
    },
    {
      h: '五、数据存储与安全',
      p: [
        '数据存储在位于中国香港的服务器上，传输全程使用 HTTPS 加密。',
        '我们采取访问控制、限流、参数校验等措施降低风险，但无法承诺绝对安全。',
        '内容以软删除方式保留一段时间以便恢复与审计。',
      ],
    },
    {
      h: '六、联系我们',
      p: [`运营主体：${OPERATOR}`, `联系电话：${CONTACT}`, `邮箱：${EMAIL}`],
    },
  ],
};

const TERMS = {
  title: '用户协议',
  intro: '使用本平台前请阅读。继续使用即表示你同意以下条款。',
  sections: [
    {
      h: '一、服务内容',
      p: [
        '本平台提供产业项目、贸易供需、活动赛事、科技成果、招投标等信息的发布、检索与对接服务。',
        '平台仅提供信息展示与撮合工具，不参与交易本身，不构成对任何一方的担保。',
      ],
    },
    {
      h: '二、账号与实名',
      p: [
        '你应使用真实、有效的手机号或邮箱注册，并对账号下的行为负责。',
        '涉及资质核验的场景，需要完成实名认证或提交相应证明材料。',
      ],
    },
    {
      h: '三、发布规范',
      p: [
        '禁止发布违法违规、虚假、侵权、涉密、传销、诈骗等内容。',
        '禁止发布与产业无关的广告、刷屏信息，或冒用他人身份发布。',
        '平台有权对违规内容下架、限制功能或封禁账号。',
      ],
    },
    {
      h: '四、信息来源说明',
      p: [
        '平台部分内容来自公开渠道（政府网站、公共资源交易平台、媒体）的采集与整理，并标注来源链接。',
        '转发、引用前请自行核实，遵守原发布方的版权与使用要求。',
      ],
    },
    {
      h: '五、知识产权',
      p: [
        '你发布的内容，你保留权利，并授权平台在本服务范围内展示、检索与分享。',
        '平台的界面、代码与产品设计归运营方所有。',
      ],
    },
    {
      h: '六、免责与争议',
      p: [
        '因不可抗力、网络故障、第三方服务中断造成的损失，平台不承担责任。',
        '用户之间因交易产生的纠纷由双方自行解决，平台可协助提供必要记录。',
      ],
    },
    {
      h: '七、联系我们',
      p: [`运营主体：${OPERATOR}`, `联系电话：${CONTACT}`, `邮箱：${EMAIL}`],
    },
  ],
};

const DISCLAIMER = {
  title: '免责声明',
  intro: '关于信息真实性、来源与使用风险。',
  sections: [
    {
      h: '一、信息真实性',
      p: [
        '平台内容由用户发布或由公开渠道采集整理，平台不对其真实性、准确性、完整性做绝对保证。',
        'AI 生成的标题、摘要、要素与评分仅供参考，不构成尽调结论。',
      ],
    },
    {
      h: '二、采集信息说明',
      p: [
        '招投标、政策、基金动向等信息来自政府网站与公开媒体的整理，已标注原文链接。',
        '如权利人认为内容侵权，可通过下方方式联系我们，我们会在核实后及时处理。',
      ],
    },
    {
      h: '三、不构成建议',
      p: [
        '平台上的项目、价格、政策解读等信息不构成投资建议、法律意见或交易承诺。',
        '涉及资金、资质、合同的决策，请咨询专业人士并自行核实。',
      ],
    },
    {
      h: '四、第三方链接',
      p: ['站内指向第三方网站的链接，其内容与安全由该网站负责，平台不承担连带责任。'],
    },
    { h: '五、举报与投诉', p: [`举报电话：${CONTACT}`, `举报邮箱：${EMAIL}`, '也可直接在站内「联系我们」提交，注明具体链接与问题。'] },
  ],
};

const PAGES = { privacy: PRIVACY, terms: TERMS, disclaimer: DISCLAIMER };

function renderDoc(key) {
  const doc = PAGES[key] || PRIVACY;
  const html = `<div class="page legal-page">
    <div class="legal-head">
      <div class="legal-title">${ui.esc(doc.title)}</div>
      <div class="legal-sub">${ui.esc(doc.intro)}</div>
      <div class="legal-meta">更新日期：${UPDATED} · 运营主体：${ui.esc(OPERATOR)}</div>
    </div>
    ${doc.sections
      .map(
        (s) => `<div class="legal-sec">
          <div class="legal-h">${ui.esc(s.h)}</div>
          ${s.p.map((t) => `<p class="legal-p">${ui.esc(t)}</p>`).join('')}
        </div>`,
      )
      .join('')}
    <div class="legal-foot">
      对以上内容有疑问，或需要举报违规信息：<br>
      📞 ${CONTACT}　✉️ ${EMAIL}<br>
      <a class="btn btn-sm mt8" href="#/contact-us">在线联系管理员</a>
    </div>
    <div class="legal-links">
      <a href="#/privacy">隐私政策</a>·<a href="#/terms">用户协议</a>·<a href="#/disclaimer">免责声明</a>
    </div>
  </div>`;
  return {
    title: doc.title,
    content: html,
    showBack: true,
    activeTab: '',
  };
}

export function renderPrivacy(ctx) {
  return renderDoc('privacy');
}
export function renderTerms(ctx) {
  return renderDoc('terms');
}
export function renderDisclaimer(ctx) {
  return renderDoc('disclaimer');
}

export default { renderPrivacy, renderTerms, renderDisclaimer };

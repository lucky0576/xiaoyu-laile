/**
 * 小鱼来了 — 开放接口说明（#/api）
 *
 * 为什么要有这个页面：
 *   1. 有合作方来问「你们有接口吗」时，直接发链接，不用每次手写说明；
 *   2. 软著 / 数字版权登记时，"软件功能说明"可以直接引用这个页面；
 *   3. 自己排查问题也方便 —— 所有接口的入参出参集中在一处。
 *
 * 说明的策略：
 *   · 只写「已上线、已验证」的接口，不画饼
 *   · 公开接口（免登录）与需登录接口分开标
 *   · 每条给一个能直接复制跑的 curl
 */

import * as ui from './ui.js';
import { copyWithFeedback } from './clipboard.js';

const BASE = 'https://xiaoyulaile.online';

const PUBLIC_APIS = [
  {
    method: 'GET',
    path: '/api/site',
    desc: '站点基本信息（名称、备案、运营主体、公告）',
    params: '无',
    sample: `${BASE}/api/site`,
  },
  {
    method: 'GET',
    path: '/api/stats',
    desc: '平台统计（信息数、用户数、成交量等）',
    params: '无',
    sample: `${BASE}/api/stats`,
  },
  {
    method: 'GET',
    path: '/api/listings',
    desc: '信息列表（项目 / 活动 / 贸易 / 成果 / 招投标…）',
    params:
      'category=project|event|trade|tech|bidding · city=城市 · q=关键词 · industry=行业 · sort=latest|hot · page=1 · pageSize=20',
    sample: `${BASE}/api/listings?category=project&city=杭州&pageSize=5`,
  },
  {
    method: 'GET',
    path: '/api/listings/:id',
    desc: '单条信息详情（含 AI 摘要、城市、行业、附件列表）',
    params: '路径参数 id，如 l_xxxxx',
    sample: `${BASE}/api/listings/<信息ID>`,
  },
  {
    method: 'GET',
    path: '/api/listings/:id/share',
    desc: '分享页所需数据（标题、封面、二维码短链）',
    params: '路径参数 id',
    sample: `${BASE}/api/listings/<信息ID>/share`,
  },
  {
    method: 'GET',
    path: '/api/search/suggest',
    desc: '搜索联想词',
    params: 'q=关键词',
    sample: `${BASE}/api/search/suggest?q=储能`,
  },
  {
    method: 'GET',
    path: '/api/taxonomy',
    desc: '行业 / 城市 / 类型分类字典（做筛选器时用）',
    params: '无',
    sample: `${BASE}/api/taxonomy`,
  },
  {
    method: 'GET',
    path: '/api/news',
    desc: '资讯列表（备案期间只返回标题 + 摘要 + 原文链接）',
    params: 'size=条数',
    sample: `${BASE}/api/news?size=5`,
  },
  {
    method: 'GET',
    path: '/api/feeds',
    desc: '短视频 / 直播列表',
    params: 'type=short|live · featured=1 · limit=条数',
    sample: `${BASE}/api/feeds?type=short&limit=5`,
  },
  {
    method: 'GET',
    path: '/api/cases',
    desc: '项目案例列表',
    params: 'category=（可选）· pageSize=条数',
    sample: `${BASE}/api/cases?pageSize=5`,
  },
  {
    method: 'GET',
    path: '/api/levels',
    desc: '会员档位、权益与收款方式（做付费引导时用）',
    params: '无',
    sample: `${BASE}/api/levels`,
  },
  {
    method: 'GET',
    path: '/api/contest/list',
    desc: '创业大赛专题数据（赛制、时间、奖励）',
    params: '无',
    sample: `${BASE}/api/contest/list`,
  },
];

const AUTH_APIS = [
  {
    method: 'POST',
    path: '/api/auth/login',
    desc: '登录换 token（手机号 + 密码）',
    params: '{ account, password }',
    sample: `curl -X POST ${BASE}/api/auth/login \\
  -H "Content-Type: application/json" \\
  -d '{"account":"手机号","password":"密码"}'`,
  },
  {
    method: 'GET',
    path: '/api/auth/me',
    desc: '当前登录用户信息',
    params: 'Header: Authorization: Bearer <token>',
    sample: `curl ${BASE}/api/auth/me -H "Authorization: Bearer <token>"`,
  },
  {
    method: 'POST',
    path: '/api/listings',
    desc: '发布信息（项目 / 活动 / 贸易 / 成果 / 招投标）',
    params: '{ category, title, text, startAt（活动必填）, contactName, phone … }',
    sample: `curl -X POST ${BASE}/api/listings \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer <token>" \\
  -d '{"category":"project","title":"示例项目","text":"项目描述"}'`,
  },
  {
    method: 'POST',
    path: '/api/ai/summarize',
    desc: 'AI 汇总资料：生成标题、摘要、行业/城市/类型标签',
    params: '{ text, files[] }',
    sample: `curl -X POST ${BASE}/api/ai/summarize \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer <token>" \\
  -d '{"text":"一段项目内容"}'`,
  },
  {
    method: 'POST',
    path: '/api/ai/preview',
    desc: 'AI 快速解析（不落库，发布页实时用）',
    params: '{ text }',
    sample: `curl -X POST ${BASE}/api/ai/preview \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer <token>" \\
  -d '{"text":"一段项目内容"}'`,
  },
  {
    method: 'GET',
    path: '/api/contacts',
    desc: '我的通讯录',
    params: 'size · q=关键词',
    sample: `curl "${BASE}/api/contacts?size=50" -H "Authorization: Bearer <token>"`,
  },
  {
    method: 'POST',
    path: '/api/contacts',
    desc: '新建联系人（姓名/网名中英文均可）',
    params: '{ name, nickname, phone, wechat, company, city, note }',
    sample: `curl -X POST ${BASE}/api/contacts \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer <token>" \\
  -d '{"name":"Lucas","phone":"13800001111"}'`,
  },
  {
    method: 'POST',
    path: '/api/broadcast/text',
    desc: '生成群发文案（最多 30 条）',
    params: '{ ids: [], includeLink, onlyUser }',
    sample: `curl -X POST ${BASE}/api/broadcast/text \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer <token>" \\
  -d '{"ids":["l_xxx"],"includeLink":true}'`,
  },
];

const CURL_DEMO = `# 1. 拿一条杭州的项目列表
curl "${BASE}/api/listings?category=project&city=杭州&pageSize=3"

# 2. 返回结构（统一包一层）
{
  "ok": true,
  "data": {
    "items": [
      { "id": "l_xxx", "title": "…", "cities": [{"name":"杭州市"}], "ai": {"summary":"…"} }
    ],
    "total": 63,
    "page": 1,
    "pageSize": 3
  }
}`;

const NOTES = [
  '所有接口都是 HTTPS + JSON，返回统一为 { ok, data } 或 { ok:false, error, code }。',
  '免登录接口有 IP 限流（一般 60~300 次/分钟），批量抓取请先联系平台开通白名单。',
  '需要登录的接口用 Header「Authorization: Bearer <token>」，token 由 /api/auth/login 返回。',
  '联系方式属于隐私字段，公开接口只返回「是否留了联系方式」，具体号码需登录并完成对接后才能看。',
  '附件下载走 /api/files/:id，未登录只能拿到公开封面，资料类附件需要权限。',
  '目前没有独立的「开放平台 AppKey」，第三方接入请联系管理员单独约定配额与用途。',
];

function rowHtml(a, withCopy) {
  return `<div class="apidoc-row">
    <div class="apidoc-line">
      <span class="apidoc-method is-${a.method.toLowerCase()}">${a.method}</span>
      <code class="apidoc-path">${ui.esc(a.path)}</code>
      ${withCopy ? `<button class="apidoc-copy" data-copy="${ui.esc(a.sample)}" type="button">复制示例</button>` : ''}
    </div>
    <div class="apidoc-desc">${ui.esc(a.desc)}</div>
    <div class="apidoc-params"><b>参数：</b>${ui.esc(a.params)}</div>
    <pre class="apidoc-code">${ui.esc(a.sample)}</pre>
  </div>`;
}

export async function renderApiDoc() {
  const html = `<div class="page apidoc-page">
    <div class="apidoc-hero">
      <div class="apidoc-hero-t">🔌 小鱼来了 · 开放接口</div>
      <div class="apidoc-hero-d">
        平台所有功能都是标准 HTTPS + JSON 接口，下面列出可直接调用的部分。
        合作对接、数据同步、二次开发都可以基于这些接口做。
      </div>
      <div class="apidoc-hero-meta">
        <span>接口数 ${PUBLIC_APIS.length + AUTH_APIS.length}</span>
        <span>格式 JSON</span>
        <span>鉴权 Bearer Token</span>
      </div>
    </div>

    <div class="card card-pad mt12">
      <div class="strong mb8">📌 使用说明</div>
      <div class="apidoc-notes">
        ${NOTES.map((n) => `<div class="apidoc-note">· ${ui.esc(n)}</div>`).join('')}
      </div>
    </div>

    <div class="row between mt16" style="align-items:baseline">
      <div class="strong">🌐 公开接口</div>
      <span class="tiny dim">无需登录</span>
    </div>
    <div class="apidoc-list">
      ${PUBLIC_APIS.map((a) => rowHtml(a, true)).join('')}
    </div>

    <div class="row between mt16" style="align-items:baseline">
      <div class="strong">🔐 需要登录</div>
      <span class="tiny dim">带 Authorization 头</span>
    </div>
    <div class="apidoc-list">
      ${AUTH_APIS.map((a) => rowHtml(a, true)).join('')}
    </div>

    <div class="card card-pad mt12">
      <div class="row between mb6">
        <div class="strong">🧪 完整调用示例</div>
        <button class="btn btn-sm" id="api-copy-demo" type="button">复制</button>
      </div>
      <pre class="apidoc-code">${ui.esc(CURL_DEMO)}</pre>
    </div>

    <div class="card card-pad mt12">
      <div class="strong mb8">🤝 想接入 / 要更多接口？</div>
      <div class="small muted" style="line-height:1.9">
        需要批量数据、定制字段、更高配额，或者要把小鱼来了的信息同步到你的系统里，
        写信说明用途和量级即可，一般 2 个工作日内回复。
      </div>
      <a class="btn btn-primary btn-block mt12" href="#/contact-us?topic=cooperation">联系管理员开通 ›</a>
    </div>

    <div class="tiny dim center mt16" style="padding-bottom:24px">
      运营主体：小鱼来了科技有限公司
    </div>
  </div>`;

  return {
    title: '开放接口',
    content: html,
    showBack: true,
    mount(root) {
      root.querySelectorAll('[data-copy]').forEach((btn) => {
        btn.addEventListener('click', async (e) => {
          e.preventDefault();
          await copyWithFeedback(btn.getAttribute('data-copy') || '', { okText: '示例已复制' }, ui);
        });
      });
      root.querySelector('#api-copy-demo')?.addEventListener('click', async () => {
        await copyWithFeedback(CURL_DEMO, { okText: '示例已复制' }, ui);
      });
    },
  };
}

export default { renderApiDoc };

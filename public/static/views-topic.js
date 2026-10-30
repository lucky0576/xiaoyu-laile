/**
 * 小鱼来了 — 专题页：江浙沪创业大赛与政策速查（#/contest）
 *
 * 内容口径：2026 年已核实的公开信息，每条都带原文链接。
 * 维护方式：改下面的 CONTESTS / POLICIES 数组即可，页面自动渲染。
 */

import * as ui from './ui.js';

/* ------------------------------------------------------------------ */
/* 数据（更新时间写在这里，页面上会显示）                                */
/* ------------------------------------------------------------------ */

export const UPDATED_AT = '2026-10-30';

export const CONTESTS = [
  {
    id: 'zj',
    province: '浙江',
    color: 'green',
    name: '「奇思妙想浙江行」2026 创业大赛',
    sub: '暨「创赢未来」2026 创业大赛浙江省选拔赛',
    badges: ['4 主体赛 + 2 专项赛', '5 月市赛', '含 AI OPC 专项'],
    rows: [
      ['赛制', '主体赛：科技成果+创业 / 产业发展+创业 / 职业技能+创业 / 民生需求+创业<br>专项赛：青年创新专项赛、人工智能 OPC（一人公司）专项赛'],
      ['时间', '2 月启动 → 县区选拔 4 月底前 → 市（地）选拔 5 月'],
      ['参赛门槛', '年满 16 周岁；主体赛需在本地注册且**未满 5 年**（截至 2026-04-30）'],
      ['奖励（以温州为例）', '一等奖 1 名 1 万元 / 二等奖 2 名 6000 元 / 三等奖 3 名 3000 元'],
      ['配套', '纳入市创业项目库、创业担保贷款及贴息、优秀创业者能力提升培训'],
      ['依据', '人社部函〔2026〕5号、浙人社函〔2026〕32号'],
    ],
    links: [
      { text: '温州市选拔赛通知（原文）', url: 'https://hrss.wenzhou.gov.cn/col/col1229204115/art/2026/art_bcc3288a18184b3593881d3453c2c089.html' },
      { text: '浙江省人社厅', url: 'https://rlsbt.zj.gov.cn/' },
    ],
    highlight: '「人工智能 OPC（一人公司）专项赛」与平台用户画像高度重合 —— 一个人 + AI 工具做生意的群体，正好是这个赛道。',
  },
  {
    id: 'sh',
    province: '上海',
    color: 'blue',
    name: '2026「创·在上海」国际创新创业大赛',
    sub: '全市分区赛 + 市级复赛，赛道对应「2+3+6+6」现代化产业体系',
    badges: ['团队组 / 初创组 / 成长组', '5-31 报名截止', '5000 万投资可直通复赛'],
    rows: [
      ['组别', '团队组 / 初创企业组 / 成长企业组'],
      ['初创组门槛', '2023-01-01 至 2025-12-31 在沪注册的非上市公司，上年总收入 ≤ 3000 万元'],
      ['成长组门槛', '2018-01-01 至 2025-12-31 在沪注册的非上市公司，上年总收入 ≤ 2 亿元'],
      ['以投代评', '2024 年起获备案投资机构 **5000 万元及以上**股权投资，可直接晋级市赛复赛'],
      ['赛道', '集成电路、生物医药、人工智能、新一代电子信息、智能网联新能源汽车、高端装备、先进材料、新能源及绿色低碳'],
      ['报名与时间', '官网报名截止 5 月 31 日；资格确认 6 月 15 日；区域赛路演 7 月中下旬（8 分钟汇报 + 7 分钟问答）'],
      ['政策', '按《上海市科技型中小企业技术创新资金管理办法》（沪科规〔2025〕7号）获奖能级定额资助；团队组立项资格保留 2 年'],
    ],
    links: [
      { text: '大赛官网 www.startup-sh.cn', url: 'http://www.startup-sh.cn' },
      { text: '上海市政府 · 虹口区域赛通知（原文）', url: 'https://www.shanghai.gov.cn/nw17239/20260430/31f146c3363b4d9082f853d5d13f774f.html' },
    ],
    contact: '市级咨询 8008205114 / 4008205114',
  },
  {
    id: 'js',
    province: '江苏',
    color: 'orange',
    name: '中国江苏人才创新创业大赛 + 省博士后创新创业大赛',
    sub: '「苏荟英才」人才创新创业系列赛',
    badges: ['13 省内赛区 + 5 海外赛区', '7 大赛道', '揭榜领题 7 亿元'],
    rows: [
      ['办赛体系', '13 个省内赛区 + 5 个海外赛区 + 南京总决赛；海内外项目同台、同等政策支持'],
      ['大赛道', '人工智能、电子信息、高端装备、生物医药及大健康、先进材料、新能源、综合类'],
      ['博士后赛', '面向在站 / 出站 / 拟进站博士后，六大产业赛道，新增「揭榜领题」模式'],
      ['揭榜领题', '首批发布 **107 个企业真实技术需求，总资金约 7 亿元**'],
      ['报名', '江苏省人才服务云平台下载申报材料并报名'],
    ],
    links: [
      { text: '江苏省人社厅 · 发布会报道（原文）', url: 'http://jshrss.jiangsu.gov.cn/art/2026/6/25/art_78497_11795002.html' },
      { text: '江苏省人才服务云平台', url: 'http://jshrss.jiangsu.gov.cn/' },
    ],
  },
];

export const POLICIES = [
  {
    province: '浙江',
    items: [
      ['创业担保贷款及贴息', '个人最高 50 万元、小微企业最高 300 万元，财政贴息'],
      ['一次性创业补贴', '首次创业并正常经营满 6 个月可申领'],
      ['创业孵化基地', '入驻可享场地租金减免、水电补贴'],
      ['大学生创业扶持', '省级 + 各地市加码细则（杭州、宁波、温州各不相同）'],
    ],
  },
  {
    province: '江苏',
    items: [
      ['富民创业贷', '个人最高 50 万元，合伙创业可上浮'],
      ['一次性创业补贴', '首次创业正常经营满 6 个月可申领'],
      ['苏荟英才赛事配套', '揭榜领题资金、落地支持、基地与工作站优先'],
      ['创业孵化基地', '省级示范基地有专项奖补'],
    ],
  },
  {
    province: '上海',
    items: [
      ['科技型中小企业技术创新资金', '沪科规〔2025〕7号，按获奖能级定额资助'],
      ['创业场地房租补贴', '入驻市级创业孵化示范基地可享'],
      ['青年创业见习补贴', '见习学员与带教老师双向补贴'],
      ['区域专项政策', '临港、浦东、虹桥各有独立人才与创业政策'],
    ],
  },
];

/* ------------------------------------------------------------------ */
/* 渲染                                                                */
/* ------------------------------------------------------------------ */

const COLOR_MAP = { green: '#0e8f7a', blue: '#0b74ff', orange: '#e07c1c' };

function rowsHtml(rows) {
  return rows
    .map(
      ([k, v]) =>
        `<div class="tp-row"><div class="tp-k">${ui.esc(k)}</div><div class="tp-v">${v
          .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
          .replace(/&/g, '&amp;')
          .replace(/&amp;lt;/g, '&lt;')}</div></div>`,
    )
    .join('');
}

function contestCard(c) {
  const color = COLOR_MAP[c.color] || COLOR_MAP.blue;
  return `<div class="tp-card">
    <div class="tp-head" style="border-left:4px solid ${color}">
      <div class="tp-prov" style="color:${color}">${ui.esc(c.province)}</div>
      <div class="tp-name">${ui.esc(c.name)}</div>
      <div class="tp-sub">${ui.esc(c.sub)}</div>
      <div class="tp-badges">${(c.badges || []).map((b) => `<span class="tp-badge">${ui.esc(b)}</span>`).join('')}</div>
    </div>
    <div class="tp-body">${rowsHtml(c.rows)}</div>
    ${
      c.highlight
        ? `<div class="tp-highlight">💡 ${ui.esc(c.highlight)}</div>`
        : ''
    }
    <div class="tp-links">
      ${(c.links || [])
        .map(
          (l) =>
            `<a class="tp-link" href="${ui.esc(l.url)}" target="_blank" rel="noopener">${ui.esc(l.text)} ↗</a>`,
        )
        .join('')}
      ${c.contact ? `<span class="tiny dim">${ui.esc(c.contact)}</span>` : ''}
    </div>
  </div>`;
}

export function renderContest(ctx, query) {
  const html = `<div class="page tp-page">
    <div class="tp-hero">
      <div class="tp-hero-t">🏆 江浙沪创业大赛 <span class="tp-hero-dot">·</span> 政策速查</div>
      <div class="tp-hero-d">报名条件、时间节点、奖励与配套政策，一页看全 ·
        <span style="white-space:nowrap">更新于 ${UPDATED_AT}</span></div>
      <div class="row gap8 mt12" style="justify-content:center">
        <button class="btn btn-sm btn-primary" id="tp-share" type="button">🔗 分享这个专题</button>
        <button class="btn btn-sm" id="tp-copy" type="button">📋 复制转发文案</button>
      </div>
    </div>

    <div class="tp-sec-title">一、正在进行的赛事</div>
    ${CONTESTS.map(contestCard).join('')}

    <div class="tp-sec-title">二、三地政策工具包</div>
    <div class="tp-pol">
      ${POLICIES.map(
        (p) => `<div class="tp-pol-col">
          <div class="tp-pol-h">${ui.esc(p.province)}</div>
          ${p.items
            .map(
              ([k, v]) =>
                `<div class="tp-pol-i"><div class="tp-pol-k">${ui.esc(k)}</div><div class="tp-pol-v">${ui.esc(v)}</div></div>`,
            )
            .join('')}
        </div>`,
      ).join('')}
    </div>
    <div class="tp-note">
      具体补贴金额各区县每年调整，以当地人社局最新文件为准。
      报名条件里「注册未满 5 年」「上年收入 ≤ 3000 万」这类硬门槛最容易卡人，先对号再报。
    </div>

    <div class="tp-sec-title">三、需要帮忙对接？</div>
    <div class="card card-pad">
      <div class="small muted" style="line-height:1.8">
        平台上有大量正在做项目的团队和投资人。<br>
        你可以把自己的项目发出来，让对的人看到；也可以看看别人在做什么。
      </div>
      <div class="row gap8 mt12">
        <a class="btn btn-sm btn-primary grow" href="#/publish?category=project">发布我的项目</a>
        <a class="btn btn-sm grow" href="#/list/project">看看别人的项目</a>
      </div>
    </div>

    <div class="center tiny dim mt16" style="padding-bottom:24px">
      小鱼来了 · 让每一条好项目，都被对的人看见
    </div>
  </div>`;

  return {
    title: '江浙沪创业大赛',
    content: html,
    showBack: true,
    activeTab: '',
    mount(root) {
      const url = `${location.origin}/#/contest`;

      /* 分享：手机走系统分享，桌面复制链接 */
      root.querySelector('#tp-share')?.addEventListener('click', async () => {
        if (navigator.share) {
          try {
            await navigator.share({ title: '江浙沪创业大赛与政策速查', text: '报名条件、时间节点、奖励与配套政策一页看全', url });
            return;
          } catch (err) {
            if (err && err.name === 'AbortError') return;
          }
        }
        const ok = await copyText(`江浙沪创业大赛与政策速查\n${url}`);
        ui.toast(ok ? '链接已复制' : '复制失败，请长按地址手动复制', ok ? 'ok' : 'err');
      });

      /* 转发文案：给微信用的一段话 */
      root.querySelector('#tp-copy')?.addEventListener('click', async () => {
        const text =
          '【江浙沪创业大赛 2026 · 报名与政策速查】\n\n' +
          '浙江：「奇思妙想浙江行」2026 创业大赛\n' +
          '  4 主体赛 + 2 专项赛（含人工智能 OPC 一人公司专项赛）\n' +
          '  16 周岁以上，本地注册未满 5 年可报，市赛 5 月\n\n' +
          '上海：2026「创·在上海」国际创新创业大赛\n' +
          '  团队组 / 初创组 / 成长组，报名截止 5-31\n' +
          '  获 5000 万以上股权投资可直通市赛复赛\n\n' +
          '江苏：中国江苏人才创新创业大赛 + 省博士后创新创业大赛\n' +
          '  13 省内赛区 + 5 海外赛区，7 大赛道\n' +
          '  博士后「揭榜领题」107 个需求，总资金约 7 亿元\n\n' +
          '三地政策：创业担保贷款、一次性创业补贴、场地租金补贴、\n' +
          '科技型中小企业技术创新资金\n\n' +
          `完整版（报名入口 + 原文链接）：\n${url}`;
        const ok = await copyText(text);
        ui.toast(ok ? '文案已复制，粘到微信就行' : '复制失败，请手动复制', ok ? 'ok' : 'err');
      });
    },
  };
}

/** 剪贴板兜底：非安全上下文 / 无手势时 clipboard API 会被拒 */
async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      ta.remove();
      return ok;
    } catch {
      return false;
    }
  }
}

export default { renderContest };

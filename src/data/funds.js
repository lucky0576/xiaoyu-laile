/**
 * 小鱼来了 — 各地政府投资基金动向（服务端数据源）
 *
 * 只收公开信息，每条带原文链接与发布日期。
 * 更新方式：往 FUNDS 数组前面加新条目（最新在最前），改 UPDATED_AT。
 */

export const UPDATED_AT = '2026-10-31';

export const FUNDS = [
  {
    id: 'sh-linghang-200',
    province: '上海',
    city: '市级',
    scale: '200 亿元',
    name: '上海领航科创基金',
    status: '设立中',
    date: '2026-10-30',
    manager: '国泰海通开元（GP）· 工银资本（共同执行事务合伙人）',
    focus: ['新一代信息技术', '高端装备', '新材料', '生物医药', '人工智能', '数字经济'],
    note: '认缴规模 200 亿元，其中国泰海通开元认缴 40 亿元。基金只投经合伙人会议通过的下层基金，不直接投项目。',
    links: [
      { text: '每日经济新闻 · 一周产业基金', url: 'https://finance.eastmoney.com/a/202610303916670626.html' },
    ],
  },
  {
    id: 'sh-futeng-s2',
    province: '上海',
    city: '市级',
    scale: '目标 20 亿元（首关 7.1 亿元）',
    name: '孚腾 S 基金二期（引领接力行远）',
    status: '已备案',
    date: '2026-10',
    manager: '孚腾资本（上海国投为基石投资人）',
    focus: ['硬科技', '先进制造', '生物医药'],
    note: 'S 策略为主，收优质存量基金份额与成熟组合资产，已交割首个投资项目。',
    links: [
      { text: '每日经济新闻 · 一周产业基金', url: 'https://finance.eastmoney.com/a/202610303916670626.html' },
    ],
  },
  {
    id: 'sh-jiading-future',
    province: '上海',
    city: '嘉定区',
    scale: '总规模 8 亿元（首期 2 亿元）',
    name: '嘉定区未来产业基金',
    status: '已发布',
    date: '2026-02-03',
    manager: '政府指导、市场化运作；区财政 + 区属国企 + 街镇集体企业共同出资',
    focus: ['未来智能', '未来能源', '未来材料', '未来健康', '未来空间'],
    note: '采用「子基金投资 + 直接投资」双模式，重点投早投小、支持颠覆性与前沿平台技术。',
    links: [
      { text: '上海市政府 · 嘉定区未来产业基金发布', url: 'https://www.shanghai.gov.cn/nw15343/20260206/f52bde1bf53f43aba4afe927c35b79f9.html' },
    ],
  },
  {
    id: 'js-100-zengzi',
    province: '江苏',
    city: '省级',
    scale: '百亿级',
    name: '江苏增资扩产战新产业基金',
    status: '已揭牌',
    date: '2026',
    manager: '落地苏州东沙湖基金小镇',
    focus: ['战略性新兴产业', '增资扩产'],
    note: '面向省内战略性新兴产业企业的增资扩产需求，与地方产业载体联动。',
    links: [
      { text: '上海证券报 · 基金揭牌报道', url: 'https://www.cnstock.com/commonDetail/711858' },
    ],
  },
  {
    id: 'zj-shebao-kechuang',
    province: '浙江',
    city: '省级',
    scale: '首批项目投资超 16 亿元',
    name: '浙江社保科创基金',
    status: '已投首批',
    date: '2026',
    manager: '—',
    focus: ['科技创新', '硬科技'],
    note: '首批 9 个项目完成签约，投资总额超 16 亿元。',
    links: [
      { text: '上海证券报 · 首批项目签约', url: 'https://www.cnstock.com/commonDetail/617507' },
    ],
  },
  {
    id: 'zj-yuhuan-ganghang',
    province: '浙江',
    city: '玉环市（台州）',
    scale: '10 亿元',
    name: '玉环港航专项产业基金（清澜股权投资）',
    status: '已成立',
    date: '2026-10',
    manager: '玉环市国投集团牵头 · 苏民嘉禾任管理人',
    focus: ['远洋航线培育', '船舶与集装箱资产', '港航物流', '跨境供应链', '冷链配套', '航运数字化'],
    note: '浙江首只县级港航专项基金，通过组建船公司、布局船舶资产推动「港—船—贸」一体化。',
    links: [
      { text: '每日经济新闻 · 一周产业基金', url: 'https://finance.eastmoney.com/a/202610303916670626.html' },
    ],
  },
];

export default { FUNDS, UPDATED_AT };

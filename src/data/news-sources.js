/**
 * 小鱼来了 — 新闻资讯数据源
 *
 * 只放「列表页 + 稳定的内容链接」的官方/媒体站点：
 * 抓列表页拿标题与链接，再逐条抓正文（复用 lib/webpage.js 的解析与清洗）。
 *
 * 说明：
 *   · 不依赖任何搜索 API，纯 HTTP 抓取，零依赖、零费用
 *   · 站点改版会让某个源失效，所以每个源独立 try/catch，坏一个不影响其他
 *   · linkRe 用来从列表页里挑出「像文章」的链接，减少噪音
 */

export const NEWS_SOURCES = [
  /* ---------- 官方政策 ---------- */
  {
    id: 'ndrc-tz',
    name: '发改委 · 通知',
    category: 'policy',
    url: 'https://www.ndrc.gov.cn/xxgk/zcfb/tz/',
    linkRe: /\/xxgk\/zcfb\/tz\/\d{6}\/t\d{8}_\d+\.html/,
  },
  {
    id: 'ndrc-gh',
    name: '发改委 · 规划文本',
    category: 'policy',
    url: 'https://www.ndrc.gov.cn/xxgk/zcfb/ghwb/',
    linkRe: /\/xxgk\/zcfb\/ghwb\/\d{6}\/t\d{8}_\d+\.html/,
  },
  {
    id: 'nea-news',
    name: '国家能源局',
    category: 'energy',
    url: 'https://www.nea.gov.cn/xwzx/index.htm',
    linkRe: /\/\d{8}\/[0-9a-f]{32}\/c\.html/,
  },

  /* ---------- 行业媒体 ---------- */
  {
    id: 'solarbe',
    name: '索比光伏网',
    category: 'pv',
    url: 'https://news.solarbe.com/',
    linkRe: /news\.solarbe\.com\/\d{6}\/\d{2}\/\d+\.html/,
  },
  {
    id: 'escn',
    name: '储能网',
    category: 'storage',
    url: 'https://www.escn.com.cn/',
    linkRe: /\/news\/show-\d+\.html/,
  },
  {
    id: 'ne21',
    name: '北极星光伏',
    category: 'pv',
    url: 'https://www.ne21.com/',
    linkRe: /ne21\.com\/news\/show-\d+\.html/,
  },
  {
    id: 'china5e',
    name: '中国能源网',
    category: 'energy',
    url: 'https://www.china5e.com/',
    linkRe: /china5e\.com\/news\/news-\d+-\d+\.html/,
  },

];

/**
 * 行业关键词 → 标签。
 * 用来判断一条新闻「跟我们平台相关」并打标，同时决定推给谁。
 */
export const NEWS_TAGS = [
  { id: 'pv', name: '光伏', icon: '☀️', words: ['光伏', '硅料', '硅片', '组件', '逆变器', '分布式', '渔光', '农光'] },
  { id: 'storage', name: '储能', icon: '🔋', words: ['储能', '电芯', '电池', '新型储能', '抽水蓄能', '液流'] },
  { id: 'wind', name: '风电', icon: '🌬️', words: ['风电', '风机', '海上风电', '风电场'] },
  { id: 'compute', name: '算力', icon: '🖥️', words: ['算力', '数据中心', '智算', 'IDC', '机柜'] },
  { id: 'ai', name: '人工智能', icon: '🤖', words: ['人工智能', '大模型', 'AI', '智能体'] },
  { id: 'robot', name: '机器人', icon: '🦾', words: ['机器人', '人形机器人', '具身智能'] },
  { id: 'uav', name: '无人机', icon: '🛩️', words: ['无人机', '低空经济', 'eVTOL', '通用航空'] },
  { id: 'evtol', name: '飞行汽车', icon: '🚁', words: ['飞行汽车', '飞行器', 'eVTOL'] },
  { id: 'hydrogen', name: '氢能', icon: '💧', words: ['氢能', '氢', '加氢站', '绿氢'] },
  { id: 'finance', name: '投融资', icon: '💰', words: ['融资', '投资', '基金', '并购', 'IPO', '发债', 'REITs'] },
  { id: 'policy', name: '政策', icon: '📜', words: ['政策', '通知', '意见', '办法', '规划', '方案', '试点', '批复', '目录'] },
];

export default { NEWS_SOURCES, NEWS_TAGS };

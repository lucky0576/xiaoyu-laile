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

  /* ---------- 科技龙头：官方新闻室大多是 JS 渲染，改走科技媒体 ---------- */
  /* IT之家 / cnBeta 的 RSS 能覆盖 特斯拉、马斯克、苹果、华为、微软、阿里、宇树 */
  {
    id: 'ithome-rss',
    name: 'IT之家',
    category: 'tech',
    type: 'rss',
    url: 'https://www.ithome.com/rss/',
  },
  {
    id: 'cnbeta-rss',
    name: 'cnBeta',
    category: 'tech',
    type: 'rss',
    url: 'https://www.cnbeta.com.tw/backend.php',
  },
  {
    id: 'solidot-rss',
    name: 'Solidot 奇客',
    category: 'tech',
    type: 'rss',
    url: 'https://www.solidot.org/index.rss',
  },
  {
    id: 'qbitai',
    name: '量子位',
    category: 'ai',
    url: 'https://www.qbitai.com/',
    linkRe: /qbitai\.com\/\d{4}\/\d{2}\/\d+\.html/,
  },
  {
    id: 'ifanr',
    name: '爱范儿',
    category: 'tech',
    url: 'https://www.ifanr.com/',
    linkRe: /ifanr\.com\/\d{5,}/,
  },

];

/**
 * 行业关键词 → 标签。
 * 用来判断一条新闻「跟我们平台相关」并打标，同时决定推给谁。
 */
export const NEWS_TAGS = [
  { id: 'pv', name: '光伏', icon: '☀️', words: ['光伏', '硅料', '硅片', '组件', '逆变器', '分布式', '渔光', '农光', '光储', '新能源', '大基地', '沙戈荒', '智慧能源', '绿电', '风光'] },
  { id: 'storage', name: '储能', icon: '🔋', words: ['储能', '电芯', '电池', '新型储能', '抽水蓄能', '液流', '网荷储', '源网荷储', '长时储能', '独立储能'] },
  { id: 'wind', name: '风电', icon: '🌬️', words: ['风电', '风机', '海上风电', '风电场', '陆上风电'] },
  { id: 'compute', name: '算力', icon: '🖥️', scope: 'title', words: ['算力', '数据中心', '智算', 'IDC', '机柜', '算电协同', '服务器', 'GPU', '液冷'] },
  { id: 'ai', name: '人工智能', icon: '🤖', scope: 'title', words: ['人工智能', '大模型', 'AI', '智能体', '具身智能', '讯飞', '通义', '文心', '多模态', '推理模型'] },
  { id: 'robot', name: '机器人', icon: '🦾', scope: 'title', words: ['机器人', '人形机器人', '具身智能', '机器狗'] },
  { id: 'uav', name: '无人机', icon: '🛩️', scope: 'title', words: ['无人机', '低空经济', 'eVTOL', '通用航空'] },
  { id: 'evtol', name: '飞行汽车', icon: '🚁', scope: 'title', words: ['飞行汽车', '飞行器', 'eVTOL'] },
  { id: 'hydrogen', name: '氢能', icon: '💧', words: ['氢能', '氢', '加氢站', '绿氢', '电解槽'] },
  { id: 'finance', name: '投融资', icon: '💰', scope: 'title', words: ['融资', '投资', '基金', '并购', 'IPO', '发债', 'REITs', '估值', '募资'] },
  { id: 'policy', name: '政策', icon: '📜', words: ['政策', '通知', '意见', '办法', '规划', '方案', '试点', '批复', '目录', '国家能源局', '发改委', '能源局', '工信部', '国务院', '示范', '指导意见', '标准'] },

  /*
   * ---------- 科技龙头 ----------
   * 全部 scope: 'title'：只匹配标题。
   * 这些品牌词在科技站正文页脚/相关推荐里到处都是，
   * 连正文一起扫的话，「某国选举」这种新闻也会被打上
   * 苹果/华为/微软/阿里标签，内容就乱了。
   */
  { id: 'tesla', name: '特斯拉 / 马斯克', icon: '🚗', scope: 'title', words: ['特斯拉', '马斯克', 'Tesla', 'Musk', 'SpaceX', '星链', 'Optimus', '擎天柱'] },
  { id: 'unitree', name: '宇树科技', icon: '🐕', scope: 'title', words: ['宇树', 'Unitree'] },
  { id: 'apple', name: '苹果', icon: '🍎', scope: 'title', words: ['苹果', 'Apple', 'iPhone', 'iPad', 'MacBook', 'Vision Pro', '库克', 'iOS', 'Mac'] },
  { id: 'huawei', name: '华为', icon: '📱', scope: 'title', words: ['华为', 'Huawei', '鸿蒙', 'HarmonyOS', '昇腾', '问界', 'Mate', '麒麟'] },
  { id: 'microsoft', name: '微软', icon: '🪟', scope: 'title', words: ['微软', 'Microsoft', 'Azure', 'Copilot', 'Windows'] },
  { id: 'alibaba', name: '阿里巴巴', icon: '🛒', scope: 'title', words: ['阿里巴巴', '阿里', 'Alibaba', '阿里云', '通义', 'Qwen', '淘宝', '蚂蚁'] },
  { id: 'deepseek', name: 'DeepSeek', icon: '🐋', scope: 'title', words: ['DeepSeek', '深度求索', '幻方'] },
];

export default { NEWS_SOURCES, NEWS_TAGS };

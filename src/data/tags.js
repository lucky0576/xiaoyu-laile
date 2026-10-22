/**
 * 小鱼来了 — 用户标签库
 *
 * 5 类标签，每类都支持「多选预设」+「自定义填空」。
 * 前端按这里渲染，后端只接受这里出现的值或用户自填（长度受限）。
 */

export const TAG_CATEGORIES = [
  {
    key: 'cities',
    name: '城市',
    icon: '📍',
    desc: '你常驻或经常跑的城市，方便平台就近匹配项目',
    max: 10,
    options: [
      '北京', '上海', '广州', '深圳', '杭州', '南京', '苏州', '成都',
      '重庆', '武汉', '西安', '天津', '青岛', '济南', '宁波', '无锡',
      '常州', '合肥', '长沙', '郑州', '大连', '厦门', '福州', '昆明',
      '贵阳', '南宁', '南昌', '太原', '石家庄', '沈阳', '长春', '哈尔滨',
      '兰州', '银川', '西宁', '乌鲁木齐', '呼和浩特', '海口', '三亚',
      '香港', '澳门', '台北',
    ],
  },
  {
    key: 'industries',
    name: '行业',
    icon: '🏭',
    desc: '你所在的细分行业，决定你能看到哪些项目',
    max: 12,
    options: [
      '光伏', '储能', '风电', '氢能', '充电桩', '电力工程', '建筑工程',
      '市政工程', '算力', '数据中心', '半导体', '人工智能', '机器人',
      '无人机', '新材料', '新能源汽车', '环保', '化工', '钢铁', '有色金属',
      '装备制造', '贸易', '物流', '金融', '投资', '融资租赁', '产业园区',
      '招商引资', '房地产', '文旅', '农业', '医疗健康', '教育',
    ],
  },
  {
    key: 'businessTypes',
    name: '业务类型',
    icon: '💼',
    desc: '你在产业链里的角色，决定谁能跟你对上',
    max: 10,
    options: [
      '项目方', 'EPC 总包', '专业分包', '设备厂商', '材料供应',
      '设计院', '监理', '咨询服务', '工程造价', '投资方', '基金',
      '银行', '融资租赁', '政府园区', '招商机构', '贸易商', '代理商',
      '终端用户', '运维服务',
    ],
  },
  {
    key: 'personality',
    name: '性格标签',
    icon: '🎭',
    desc: '让对接方提前知道怎么跟你沟通更舒服',
    max: 8,
    options: [
      '务实', '直接', '开放', '谨慎', '幽默', '严谨', '热情', '低调',
      '果断', '耐心', '善于倾听', '行动派', '思考型', '细节控',
      '大局观', '守时', '靠谱', '快节奏', '慢热',
    ],
  },
  {
    key: 'hobbies',
    name: '爱好标签',
    icon: '🎯',
    desc: '线下见面时的破冰话题',
    max: 10,
    options: [
      '钓鱼', '围棋', '象棋', '书法', '摄影', '徒步', '骑行', '跑步',
      '健身', '游泳', '羽毛球', '网球', '高尔夫', '滑雪', '露营',
      '自驾', '读书', '历史', '收藏', '茶道', '咖啡', '美食', '旅行',
      '音乐', '吉他', '电影', '游戏', '养宠', '烹饪',
    ],
  },
];

export const TAG_KEYS = TAG_CATEGORIES.map((c) => c.key);

export const TAG_BY_KEY = Object.fromEntries(TAG_CATEGORIES.map((c) => [c.key, c]));

/** 自定义标签的字符限制 */
export const CUSTOM_TAG_MAX_LEN = 12;

/** 归一化一批标签：去空、去重、限长、限量 */
export function normalizeTags(input = {}) {
  const out = {};
  for (const cat of TAG_CATEGORIES) {
    const raw = Array.isArray(input[cat.key]) ? input[cat.key] : [];
    const seen = new Set();
    const list = [];
    for (const v of raw) {
      const s = String(v || '').trim().slice(0, CUSTOM_TAG_MAX_LEN);
      if (!s || seen.has(s)) continue;
      seen.add(s);
      list.push(s);
      if (list.length >= cat.max) break;
    }
    out[cat.key] = list;
  }
  return out;
}

/** 用户已填标签的空壳 */
export function emptyTags() {
  const out = {};
  for (const cat of TAG_CATEGORIES) out[cat.key] = [];
  return out;
}

export default { TAG_CATEGORIES, TAG_KEYS, TAG_BY_KEY, CUSTOM_TAG_MAX_LEN, normalizeTags, emptyTags };

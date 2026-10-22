/**
 * 小鱼来了 — 论坛板块定义
 *
 * 每个板块 slug 稳定不变（用于 URL），name/desc/icon 可随时调整。
 */

export const FORUM_GROUPS = {
  energy: '能源与电力',
  engineering: '工程与园区',
  capital: '资本与招商',
  tech: '科技与算力',
};

export const FORUMS = [
  {
    slug: 'solar',
    name: '光伏',
    icon: '☀️',
    group: 'energy',
    order: 1,
    desc: '组件、逆变器、支架、分布式与集中式电站、渔光互补、屋顶光伏的选型与落地经验。',
    tags: ['分布式', '集中式', '组件', '逆变器', '渔光互补'],
  },
  {
    slug: 'storage',
    name: '储能',
    icon: '🔋',
    group: 'energy',
    order: 2,
    desc: '大储、工商业储能、用户侧储能、EMC 合同能源管理、调频调峰与项目收益测算。',
    tags: ['大储', '工商业储能', 'EMC', '调频', '收益测算'],
  },
  {
    slug: 'wind',
    name: '风电',
    icon: '🌬️',
    group: 'energy',
    order: 3,
    desc: '陆上风电、分散式风电、风资源评估、吊装施工与运维。',
    tags: ['陆上风电', '分散式', '风资源', '吊装', '运维'],
  },
  {
    slug: 'engineering',
    name: '工程',
    icon: '🏗️',
    group: 'engineering',
    order: 4,
    desc: 'EPC 总承包、专业分包、施工资质、造价与结算、招投标实务。',
    tags: ['EPC', '分包', '资质', '造价', '招投标'],
  },
  {
    slug: 'park',
    name: '园区',
    icon: '🏭',
    group: 'engineering',
    order: 5,
    desc: '产业园区规划、标准厂房、入园政策、能耗指标与环评。',
    tags: ['园区规划', '标准厂房', '入园政策', '能耗指标'],
  },
  {
    slug: 'investment',
    name: '投资',
    icon: '📈',
    group: 'capital',
    order: 6,
    desc: '股权投资、并购、估值与条款、基金与 LP 对接口径。',
    tags: ['股权投资', '并购', '估值', '条款', '基金'],
  },
  {
    slug: 'finance',
    name: '融资贷款',
    icon: '🏦',
    group: 'capital',
    order: 7,
    desc: '银行信贷、融资租赁、供应链金融、政策性资金与贴息申报。',
    tags: ['信贷', '融资租赁', '供应链金融', '贴息'],
  },
  {
    slug: 'industry-invest',
    name: '产业投资',
    icon: '💼',
    group: 'capital',
    order: 8,
    desc: '产业基金、政府引导基金、项目投资决策与投后管理。',
    tags: ['产业基金', '引导基金', '投资决策', '投后'],
  },
  {
    slug: 'attraction',
    name: '招商引资',
    icon: '🤝',
    group: 'capital',
    order: 9,
    desc: '地方招商政策、落地流程、奖励兑现、载体与土地指标。',
    tags: ['招商政策', '落地流程', '奖励兑现', '土地指标'],
  },
  {
    slug: 'computing',
    name: '算力',
    icon: '⚡',
    group: 'tech',
    order: 10,
    desc: '智算中心、算力消纳、绿电算力、PUE 与投资结构。',
    tags: ['智算中心', '算力消纳', '绿电算力', 'PUE'],
  },
  {
    slug: 'hardware',
    name: '算力硬件',
    icon: '🖥️',
    group: 'tech',
    order: 11,
    desc: 'GPU、液冷、机柜、UPS、变压器、柴发与配套供应链。',
    tags: ['GPU', '液冷', '机柜', 'UPS', '柴发'],
  },
  {
    slug: 'ai',
    name: 'AI',
    icon: '🤖',
    group: 'tech',
    order: 12,
    desc: '大模型应用、行业智能体、AI 落地场景与选型。',
    tags: ['大模型', '智能体', '行业应用', '选型'],
  },
  {
    slug: 'robotics',
    name: '机器人（具身）',
    icon: '🦾',
    group: 'tech',
    order: 13,
    desc: '具身智能、工业机器人、巡检与服务机器人、产线改造。',
    tags: ['具身智能', '工业机器人', '巡检', '产线改造'],
  },
  {
    slug: 'uav',
    name: '无人机',
    icon: '🛩️',
    group: 'tech',
    order: 14,
    desc: '巡检、测绘、植保、物流无人机与低空经济政策。',
    tags: ['巡检', '测绘', '植保', '低空经济'],
  },
];

export const FORUMS_BY_SLUG = Object.fromEntries(FORUMS.map((f) => [f.slug, f]));

export function forumBySlug(slug) {
  return FORUMS_BY_SLUG[String(slug || '').toLowerCase()] || null;
}

export default { FORUMS, FORUM_GROUPS, FORUMS_BY_SLUG, forumBySlug };

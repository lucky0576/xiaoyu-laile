/**
 * 小鱼来了 — 会员等级与定价
 *
 * 定价原则（2026-11 调价）：
 *   原定价 9 / 99 / 999 / 9999 / 99999 是拍脑袋定的，最贵一档 99999/月
 *   等于一年 120 万，现实中没人会买，摆在页面上反而显得不专业。
 *   现在按「用户实际愿意为什么付钱」重排：
 *     入门  → 想把信息发出去
 *     专业  → 想稳定拿到客户
 *     团队  → 想有人帮他对接
 *     定制  → 要私有化 / 数据服务，走合同
 *   月付为主，同时给年付价（年付 ≈ 10 个月价）。
 *
 * 注意：扣费仍是「扫码/转账 + 管理员确认」，没接自动支付。
 * 接微信支付需要 ICP 备案 + 商户号，这条还没走完。
 */

export const LEVELS = [
  {
    key: 'free',
    name: '免费用户',
    icon: '🐟',
    color: '#8a95a5',
    price: 0,
    unit: '/ 永久',
    tagline: '先看看平台上都有什么',
    perks: [
      '浏览项目列表与摘要',
      '每月发布 3 条信息',
      '查看公开联系方式（隐藏的看不到）',
      '加入群聊与论坛',
    ],
    limits: { postPerMonth: 3, fullProjectView: 5 },
  },
  {
    key: 'tadpole',
    name: '入门版',
    icon: '🐸',
    color: '#12a05a',
    price: 29,
    yearPrice: 299,
    unit: '/ 月',
    tagline: '偶尔发信息，想被更多人看到',
    perks: [
      '每月发布 20 条信息',
      'AI 生成标题与摘要（每月 30 次）',
      '可查看 AI 可靠性评分',
      '支持批量转发文案',
      '入门版标识',
    ],
    limits: { postPerMonth: 20, fullProjectView: 60 },
  },
  {
    key: 'lobster',
    name: '专业版',
    icon: '🦞',
    color: '#e0672a',
    price: 199,
    yearPrice: 1999,
    unit: '/ 月',
    tagline: '靠平台稳定拿客户',
    perks: [
      '不限量发布信息',
      'AI 解析每月 300 次',
      '信息进入「优先推荐」，排在列表前面',
      '上传的资质文件可设为「需申请查看」',
      '联系方式对已对接方自动可见',
      '专业版标识',
    ],
    limits: { postPerMonth: -1, fullProjectView: -1 },
  },
  {
    key: 'eel',
    name: '团队版',
    icon: '⚡',
    color: '#7c5cf0',
    price: 499,
    yearPrice: 4999,
    unit: '/ 月',
    tagline: '有团队，需要有人帮着对接',
    perks: [
      '包含专业版全部权益',
      '5 个子账号，共享发布与检索',
      '专属对接顾问（每月 1 次会议）',
      'AI 项目尽调报告（每月 3 份）',
      '信息可由平台代为转发到合作渠道',
      '团队版标识',
    ],
    limits: { postPerMonth: -1, fullProjectView: -1 },
  },
  {
    key: 'shark',
    name: '定制服务',
    icon: '🦈',
    color: '#0b74ff',
    price: 0,
    custom: true,
    unit: '',
    tagline: '私有化部署 / 数据服务 / 联合运营',
    perks: [
      '部署到你自己的服务器（数据不出内网）',
      '按行业与区域定制信息库',
      '定制 AI 抽取与检索规则',
      '专属运维与培训',
      '年度服务合同，可开专票',
    ],
    limits: { postPerMonth: -1, fullProjectView: -1 },
  },
];

export const LEVEL_BY_KEY = Object.fromEntries(LEVELS.map((l) => [l.key, l]));

export const PAID_LEVELS = LEVELS.filter((l) => l.price > 0 || l.custom);

export function levelOf(user) {
  return LEVEL_BY_KEY[user?.level] || LEVEL_BY_KEY.free;
}

/** 会员是否仍在有效期内（免费 / 定制类恒为 true） */
export function levelActive(user) {
  const lv = levelOf(user);
  if (!lv || lv.price === 0) return true;
  if (!user.levelExpiresAt) return false;
  return new Date(user.levelExpiresAt).getTime() > Date.now();
}

/** 当前生效的等级 key（过期则回落 free） */
export function effectiveLevelKey(user) {
  return levelActive(user) ? levelOf(user).key : 'free';
}

export function publicLevel(user) {
  const lv = levelOf(user);
  const active = levelActive(user);
  return {
    key: active ? lv.key : 'free',
    name: active ? lv.name : '免费用户',
    icon: active ? lv.icon : '🐟',
    color: active ? lv.color : '#8a95a5',
    price: lv.price,
    yearPrice: lv.yearPrice || 0,
    custom: Boolean(lv.custom),
    unit: lv.unit,
    expiresAt: user?.levelExpiresAt || '',
    active,
  };
}

export default { LEVELS, LEVEL_BY_KEY, PAID_LEVELS, levelOf, levelActive, effectiveLevelKey, publicLevel };

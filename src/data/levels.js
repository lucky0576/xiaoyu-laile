/**
 * 小鱼来了 — 会员等级
 *
 * 免费 + 5 档月付（蝌蚪 → 龙虾 → 电鳗 → 鲨鱼 → 鲸鱼）
 * 价格按月计；实际扣费需接入微信支付/支付宝，当前为演示开通。
 */

export const LEVELS = [
  {
    key: 'free',
    name: '免费用户',
    icon: '🐟',
    color: '#8a95a5',
    price: 0,
    unit: '/ 永久',
    tagline: '基础功能，先逛逛看看',
    perks: [
      '浏览项目列表（摘要）',
      '发布基础项目 / 悬赏信息',
      '加入群聊与部分会议',
      '参与行业论坛讨论',
    ],
    limits: { postPerMonth: 3, fullProjectView: 5 },
  },
  {
    key: 'tadpole',
    name: '蝌蚪级',
    icon: '🐸',
    color: '#12a05a',
    price: 9,
    unit: '/ 月',
    tagline: '刚开始对接，先试试水',
    perks: [
      '浏览全部项目（含 AI 评分）',
      '每月发布 10 条信息',
      '发起项目群聊与会议',
      'AI 项目摘要',
      '蝌蚪级专属标识',
    ],
    limits: { postPerMonth: 10, fullProjectView: 30 },
  },
  {
    key: 'lobster',
    name: '龙虾级',
    icon: '🦞',
    color: '#e0672a',
    price: 99,
    unit: '/ 月',
    tagline: '认真做业务，需要稳定客源',
    perks: [
      '不限量发布项目与悬赏',
      '不限量查看完整项目信息',
      'AI 项目分析与匹配推荐',
      '优先参与线下活动',
      '龙虾级专属标识',
    ],
    limits: { postPerMonth: -1, fullProjectView: -1 },
  },
  {
    key: 'eel',
    name: '电鳗级',
    icon: '⚡',
    color: '#7c5cf0',
    price: 999,
    unit: '/ 月',
    tagline: '团队作业，要效率与优先权',
    perks: [
      '包含龙虾级全部权益',
      '项目信息优先推荐给潜在对接方',
      'AI 深度尽调分析',
      '可查看匿名项目方联系方式',
      '电鳗级专属标识',
    ],
    limits: { postPerMonth: -1, fullProjectView: -1 },
  },
  {
    key: 'shark',
    name: '鲨鱼级',
    icon: '🦈',
    color: '#0b74ff',
    price: 9999,
    unit: '/ 月',
    tagline: '大额交易，需要专人盯着',
    perks: [
      '包含电鳗级全部权益',
      '专属对接顾问 1v1 服务',
      '首页与推荐位曝光',
      '重点项目的优先对接资格',
      '鲨鱼级专属标识',
    ],
    limits: { postPerMonth: -1, fullProjectView: -1 },
  },
  {
    key: 'whale',
    name: '鲸鱼级',
    icon: '🐋',
    color: '#0e7490',
    price: 99999,
    unit: '/ 月',
    tagline: '产业级合作，深度绑定',
    perks: [
      '包含鲨鱼级全部权益',
      '定制化产业对接服务',
      '联合品牌与活动露出',
      '平台种子轮优先投资份额',
      '鲸鱼级专属标识',
    ],
    limits: { postPerMonth: -1, fullProjectView: -1 },
  },
];

export const LEVEL_BY_KEY = Object.fromEntries(LEVELS.map((l) => [l.key, l]));

export const PAID_LEVELS = LEVELS.filter((l) => l.price > 0);

export function levelOf(user) {
  return LEVEL_BY_KEY[user?.level] || LEVEL_BY_KEY.free;
}

/** 会员是否仍在有效期内（免费用户恒为 true） */
export function levelActive(user) {
  const lv = levelOf(user);
  if (lv.price === 0) return true;
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
    unit: lv.unit,
    expiresAt: user?.levelExpiresAt || '',
    active,
  };
}

export default { LEVELS, LEVEL_BY_KEY, PAID_LEVELS, levelOf, levelActive, effectiveLevelKey, publicLevel };

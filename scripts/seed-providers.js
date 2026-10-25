// 造 5 条演示服务商（必须 UTF-8 保存）
const fs = require('fs');
const P = 'data/collections/providers.json';

const OWNER_ID = 'use_mvjijwrp0sc518'; // 平台管理员
const OWNER_NAME = '卢云';

const now = Date.now();
const iso = (d) => new Date(now - d * 86400000).toISOString();

const seeds = [
  {
    id: 'sp_demo_epc',
    companyName: '华能绿能工程有限公司',
    shortName: '华能绿能',
    creditCode: '',
    kind: 'enterprise',
    kindSub: 'central',
    serviceTypes: ['engineering', 'bidding'],
    typeSubs: { engineering: 'epc' },
    regions: ['全国', '华东', '华北'],
    intro:
      '专注光伏、风电、储能 EPC 总承包，具备电力工程施工总承包一级资质。累计并网容量超 3.2GW，覆盖渔光互补、农光互补、山地风电等场景。',
    cases:
      '2025 年 山东东营 200MW 渔光互补 EPC 总包，合同额 8.6 亿，14 个月全容量并网；2024 年 内蒙古乌兰察布 500MW 风电项目，提前 45 天并网。',
    qualifications: '电力工程施工总承包一级、承装（修、试）电力设施许可证一级',
    establishedYear: '2008',
    staffCount: '1200 人',
    website: '',
    contactName: '李经理',
    contactPhone: '13800001234',
    contactEmail: '',
    daysAgo: 12,
    views: 89,
  },
  {
    id: 'sp_demo_storage',
    companyName: '远景储能科技（上海）有限公司',
    shortName: '远景储能',
    creditCode: '',
    kind: 'enterprise',
    kindSub: 'private',
    serviceTypes: ['manufacturer', 'ip'],
    typeSubs: {},
    regions: ['华东', '华南', '全国'],
    intro:
      '工商业储能系统集成商，自研 PCS 与 EMS，主推 215kWh / 372kWh 液冷一体柜。具备 UL9540A、IEC62619 认证，支持 EMC 与融资租赁模式。',
    cases:
      '2025 年 江苏常州工业园区 100MWh 工商业储能 EMC 项目，投资方分成 70%；2024 年 浙江嘉兴 42MWh 用户侧储能，年峰谷套利收益 860 万元。',
    qualifications: 'UL9540A、IEC62619、TÜV 认证',
    establishedYear: '2016',
    staffCount: '380 人',
    website: '',
    contactName: '王总',
    contactPhone: '13700003456',
    contactEmail: '',
    daysAgo: 8,
    views: 156,
  },
  {
    id: 'sp_demo_gov',
    companyName: '东营市投资促进中心',
    shortName: '东营投促',
    creditCode: '',
    kind: 'government',
    kindSub: '',
    serviceTypes: ['attract'],
    typeSubs: {},
    regions: ['华东'],
    intro:
      '负责东营市新能源、新材料、高端装备产业的招商引资与项目落地服务，可提供土地、税收、人才等一揽子政策对接。',
    cases: '2025 年引进渔光互补、海上风电装备制造等 12 个亿元以上项目，总投资 186 亿元。',
    qualifications: '',
    establishedYear: '',
    staffCount: '',
    website: '',
    contactName: '招商一处',
    contactPhone: '13800001234',
    contactEmail: '',
    daysAgo: 5,
    views: 64,
  },
  {
    id: 'sp_demo_expert',
    companyName: '张工（光伏系统独立顾问）',
    shortName: '张工',
    creditCode: '',
    kind: 'individual',
    kindSub: 'expert',
    serviceTypes: ['ip'],
    typeSubs: {},
    regions: ['全国'],
    intro:
      '15 年光伏电站设计与运维经验，专注水面光伏桩基防腐、组串失配诊断与发电量提升。可提供方案评审、技术尽调、故障诊断。',
    cases:
      '累计完成 40+ 电站技术尽调，帮助业主挽回发电量损失约 3200 万度/年；主导编写企业标准《水面光伏桩基防腐技术规范》。',
    qualifications: '注册电气工程师、高级工程师',
    establishedYear: '',
    staffCount: '1 人',
    website: '',
    contactName: '张工',
    contactPhone: '13800001234',
    contactEmail: '',
    daysAgo: 3,
    views: 213,
  },
  {
    id: 'sp_demo_fund',
    companyName: '绿电产业投资基金管理有限公司',
    shortName: '绿电基金',
    creditCode: '',
    kind: 'enterprise',
    kindSub: 'state',
    serviceTypes: ['investment', 'agent'],
    typeSubs: { agent: 'industry' },
    regions: ['全国', '华东', '华南'],
    intro:
      '专注新能源基础设施股权投资，管理规模 68 亿元。可提供项目资本金、并购融资、REITs 退出方案，单笔投资 5000 万～5 亿元。',
    cases:
      '2025 年参与山东 300MW 渔光互补项目资本金投资 2.4 亿元；2024 年完成江苏 120MWh 储能资产包并购。',
    qualifications: '私募基金管理人登记备案',
    establishedYear: '2015',
    staffCount: '46 人',
    website: '',
    contactName: '陈总',
    contactPhone: '13800001234',
    contactEmail: '',
    daysAgo: 1,
    views: 178,
  },
];

const arr = JSON.parse(fs.readFileSync(P, 'utf8'));
const existingIds = new Set(arr.map((x) => x.id));
const kept = arr.filter((x) => !String(x.id || '').startsWith('sp_demo_'));
const before = arr.length;

for (const s of seeds) {
  if (existingIds.has(s.id)) continue;
  kept.push({
    id: s.id,
    ownerId: OWNER_ID,
    ownerName: OWNER_NAME,
    companyName: s.companyName,
    shortName: s.shortName,
    creditCode: s.creditCode,
    kind: s.kind,
    kindSub: s.kindSub,
    serviceTypes: s.serviceTypes,
    typeSubs: s.typeSubs,
    regions: s.regions,
    intro: s.intro,
    cases: s.cases,
    qualifications: s.qualifications,
    establishedYear: s.establishedYear,
    staffCount: s.staffCount,
    website: s.website,
    contactName: s.contactName,
    contactPhone: s.contactPhone,
    contactEmail: s.contactEmail,
    status: 'approved',
    reviewNote: '',
    createdAt: iso(s.daysAgo),
    updatedAt: iso(s.daysAgo),
    reviewedAt: iso(s.daysAgo),
    reviewedBy: OWNER_ID,
    viewCount: s.views,
  });
}

fs.writeFileSync(P, JSON.stringify(kept, null, 2));
console.log('BEFORE=' + before + ' AFTER=' + kept.length);
for (const x of kept) {
  console.log('  ' + x.companyName + '  kind=' + x.kind + '/' + (x.kindSub || '-') +
    '  types=' + (x.serviceTypes || []).join(',') + '  status=' + x.status);
}

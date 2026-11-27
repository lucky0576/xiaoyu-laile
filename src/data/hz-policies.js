/**
 * 杭州政策通 — 数据源
 *
 * 三块内容：
 *   1. HZ_PORTALS   政府官网导航（用户提供 8 个部门，均可直达）
 *   2. HZ_POLICIES  杭州市企业政策补贴（来源：用户提供的《杭州市政策补贴信息》PDF 第 1 页）
 *   3. HZ_NOTICES   最新通知与文件（来源：gov.cn 官网公开栏目）
 *
 * 重要说明：
 *   · PDF 只导出了 8 页中的第 1 页，所以这里只有 6 条政策。
 *     剩余内容由后台「批量导入」补充，或用户提供完整 PDF 后补齐。
 *   · 政策条目中的补贴金额与条件均来自 PDF 原文，未做任何加工。
 *     最终以主管部门当年正式通知为准——页面会显示这条免责说明。
 *   · 通知条目来自官网公开列表页，标题与日期为抓取当时的状态，
 *     可能随官网更新而变化，点击链接以官网原文为准。
 */

/* ------------------------------------------------------------------ */
/* 一、政府官网导航                                                    */
/* ------------------------------------------------------------------ */

/**
 * 8 个主管部门。
 * noticeUrl 是「通知公告/政策文件」栏目的直达地址（有则填，没有就退回首页）。
 */
export const HZ_PORTALS = [
  {
    id: 'jxj',
    name: '杭州市经济和信息化局',
    short: '市经信局',
    level: 'city',
    url: 'https://jxj.hangzhou.gov.cn/',
    noticeUrl: 'https://jxj.hangzhou.gov.cn/col/col1229252271/index.html',
    tags: ['工信项目', '技改', '专精特新', '智能工厂', '首台套', '软件和信息服务'],
    desc: '工业与信息化领域项目申报主责部门',
  },
  {
    id: 'kjj',
    name: '杭州市科学技术局',
    short: '市科技局',
    level: 'city',
    url: 'https://kj.hangzhou.gov.cn/',
    noticeUrl: 'https://kj.hangzhou.gov.cn/col/col1693961/index.html',
    tags: ['高新技术企业', '科技型中小企业', '研发补助', '人才', '孵化器'],
    desc: '科技企业认定、研发项目与创新载体管理',
  },
  {
    id: 'swj',
    name: '杭州市商务局',
    short: '市商务局',
    level: 'city',
    url: 'https://sww.hangzhou.gov.cn/',
    noticeUrl: 'https://sww.hangzhou.gov.cn/col/col1229460831/index.html',
    tags: ['外贸', '跨境电商', '服务贸易', '会展', '商贸流通'],
    desc: '内外贸易、电子商务与商贸服务',
  },
  {
    id: 'tzcj',
    name: '杭州市投资促进局',
    short: '市投促局',
    level: 'city',
    url: 'https://tzcj.hangzhou.gov.cn/',
    noticeUrl: 'https://tzcj.hangzhou.gov.cn/col/col1621408/index.html',
    tags: ['招商引资', '产业落地', '项目对接', '园区'],
    desc: '招商引资与产业项目落地服务',
  },
  {
    id: 'scjg',
    name: '杭州市市场监督管理局',
    short: '市市监局',
    level: 'city',
    url: 'https://scjg.hangzhou.gov.cn/',
    noticeUrl: 'https://scjg.hangzhou.gov.cn/col/col1693484/index.html',
    tags: ['知识产权', '专利', '商标', '标准', '质量奖'],
    desc: '知识产权、标准化与质量监管',
  },
  {
    id: 'zj-jxt',
    name: '浙江省经济和信息化厅',
    short: '省经信厅',
    level: 'province',
    url: 'https://jxt.zj.gov.cn/',
    noticeUrl: 'https://jxt.zj.gov.cn/col/col1229886900/index.html',
    tags: ['省级工信项目', '未来工厂', '单项冠军', '绿色工厂', '首版次'],
    desc: '省级工业与信息化政策制定',
  },
  {
    id: 'zj-kjt',
    name: '浙江省科学技术厅',
    short: '省科技厅',
    level: 'province',
    url: 'https://kjt.zj.gov.cn/',
    noticeUrl: 'https://kjt.zj.gov.cn/col/col1229225203/index.html',
    tags: ['尖兵领雁', '省重点研发', '企业研究院', '技术中心'],
    desc: '省级科技计划与创新平台管理',
  },
  {
    id: 'miit',
    name: '中华人民共和国工业和信息化部',
    short: '国家工信部',
    level: 'national',
    url: 'https://wap.miit.gov.cn/',
    noticeUrl: 'https://www.miit.gov.cn/zwgk/zcwj/index.html',
    tags: ['国家级小巨人', '制造业单项冠军', '智能制造', '工业互联网'],
    desc: '国家层面工业与信息化政策',
  },
];

/* ------------------------------------------------------------------ */
/* 二、杭州市企业政策补贴                                              */
/* ------------------------------------------------------------------ */

export const HZ_POLICY_CATEGORIES = [
  { id: 'startup', name: '创业扶持', icon: '🚀' },
  { id: 'qualify', name: '企业认定', icon: '🏅' },
  { id: 'subsidy', name: '资金补贴', icon: '💰' },
  { id: 'rent', name: '场地房租', icon: '🏢' },
  { id: 'employ', name: '招工社保', icon: '👥' },
  { id: 'other', name: '其他', icon: '📌' },
];

export const HZ_POLICIES = [
  {
    id: 'hzp-01',
    seq: 1,
    name: '大学生创业无偿项目资助',
    category: 'startup',
    dept: '杭州市人力资源和社会保障局',
    amount: '一次性无偿资助 5 万 / 10 万 / 20 万元（按项目整体质量定档）；房租补贴三年共 10 万元（4 万 + 3 万 + 3 万）。两项符合条件可同时享受。',
    conditions: [
      '法定代表人具有全日制大专及以上学历',
      '法定代表人毕业时间不超过 5 年',
      '法定代表人在本公司占股 30% 及以上',
      '法定代表人在本公司缴纳社保满 6 个月',
      '有实际办公场地（需接受上门检查）',
      '当年注册的企业需提供验资报告；上一年度注册的需提供审计报告',
    ],
    note: '适合毕业 5 年内的大学生创业企业，是门槛最低、金额最高的一类启动资金。',
  },
  {
    id: 'hzp-02',
    seq: 2,
    name: '入驻孵化器房租补贴（滨江区）',
    category: 'rent',
    dept: '滨江区科技局 / 各孵化器',
    amount: '补贴面积按企业上年度 1—12 月社保人数平均值计算（人均 15 平方米）；补贴单价按实际缴纳租金单价的 60%，若单价超过 2 元/平方米/天，最高按 2 元的 60% 补贴。',
    conditions: [
      '企业注册时间 2 年以内',
      '属于科技、信息技术、生物医药、人工智能领域',
      '注册地址在孵化器内，且拥有知识产权 2 件（软著、实用新型或发明专利）',
      '研发费用单独做账，不低于营业收入的 5%；或已认定为省科小 / 国科小（研发费用以税务系统报表为准）',
    ],
    note: '知识产权 2 件是硬门槛，没有的话要先补软著（周期约 1—2 个月）。',
  },
  {
    id: 'hzp-03',
    seq: 3,
    name: '浙江省科技型中小企业',
    category: 'qualify',
    dept: '杭州市科学技术局',
    amount: '认定奖励：滨江区、西湖区、拱墅区、萧山区、钱塘区各 1 万元；上城区 2 万元。常年申报、季度集中审核、年底发证。',
    conditions: [
      '公司注册成立满 1 年',
      '拥有自主知识产权 1—2 件（软著、实用新型或发明专利）',
      '研发人员占职工总数不低于 10%',
      '研发费用单独做账，不低于营业收入的 5%',
      '年销售额 40 万元以上，且 3 人以上社保连续缴纳满 6 个月',
    ],
    note: '省级科技型中小企业是申报高企、润苗计划、研发补助的前置条件，建议尽早拿下。',
  },
  {
    id: 'hzp-04',
    seq: 4,
    name: '杭州市「润苗计划」',
    category: 'startup',
    dept: '杭州市科学技术局',
    amount: '一次性奖励 10 万元；贷款贴息按最高 1% 年利率给予，单个企业每年最高 20 万元；对「好苗子」企业，研发投入增量部分给予 5% 补贴，最高补助 200 万元。',
    conditions: [
      '已认定为浙江省科技型中小企业',
      '企业成立不满 5 年，职工总数不超过 100 人',
      '研发人员占职工总数比例不低于 10%',
      '研发费用不低于营业收入的 5%',
      '拥有自主知识产权，上年度知识产权 5 个以上，营业收入 50 万元以上',
      '融资额不超过 2000 万元，或估值不超过 2 亿元的优质科技型初创企业',
    ],
    note: '专为早期科技企业设计，补贴上限高（最高 200 万），但要求已认定省科小。',
  },
  {
    id: 'hzp-05',
    seq: 5,
    name: '国家高新技术企业',
    category: 'qualify',
    dept: '杭州市科学技术局',
    amount: '区级奖励：滨江、余杭、萧山、西湖各 60 万元，拱墅 50 万元，其他区 20 万元；规上企业再补 30 万元。研发费用按实际发生额的 200% 计算加计扣除；企业所得税由 25% 减按 15% 征收。',
    conditions: [
      '公司注册成立满 2 年',
      '近 3 年研发费用不低于销售收入的 5%',
      '最近一年高新技术产品（服务）收入不低于总收入的 60%',
      '拥有自主申请知识产权 10—15 件',
      '社保人数建议 10 人以上，连续缴纳满 6 个月',
      '企业营业收入 300 万元以上',
    ],
    note: '金额最大、含金量最高的一项认定，但门槛也最高。建议按 12 个月周期提前规划知识产权与研发费用归集。',
  },
  {
    id: 'hzp-06',
    seq: 6,
    name: '小微企业招纳高校毕业生社保补贴',
    category: 'employ',
    dept: '杭州市人力资源和社会保障局',
    amount: '补贴标准为基本养老、医疗和失业保险费之和（以社保基数 4986 元测算，约可补贴 1.55 万元/人）。补贴期限自缴纳社保当月起算，最长不超过 12 个月。',
    conditions: [
      '补贴对象为在杭州市依法纳税的小微企业',
      '新招用毕业 2 年以内的高校毕业生（不含本单位法定代表人、负责人）',
      '补贴标准为基本养老、医疗和失业保险之和',
      '补贴时限自缴纳社保当月起算，最长不超过 12 个月',
    ],
    note: '属于「单位享受」类补贴，不需要员工申请，由企业直接申报。',
  },
];

/* ------------------------------------------------------------------ */
/* 三、最新通知与文件                                                  */
/* ------------------------------------------------------------------ */

/**
 * 初始通知数据来自市经信局官网公开栏目（抓取时间 2026-11-27）。
 * 后台可继续导入更新。
 */
export const HZ_NOTICES = [
  {
    id: 'hzn-01',
    title: '关于组织开展2026年第二批杭州市新一轮推进软件和信息技术服务业高质量发展若干政策项目申报工作的通知',
    dept: '市经信局',
    deptId: 'jxj',
    date: '2026-11-24',
    url: 'https://jxj.hangzhou.gov.cn/col/col1229252271/art/2026/art_2298b6e1dc5c459884a31ae17e4eb344.html',
    tag: '申报通知',
  },
  {
    id: 'hzn-02',
    title: '关于公布2026年杭州市生物医药特色产业园区名单的通知',
    dept: '市经信局',
    deptId: 'jxj',
    date: '2026-11-13',
    url: 'https://jxj.hangzhou.gov.cn/col/col1229252271/art/2026/art_5b7751095fd14482a674f8b939313bbc.html',
    tag: '名单公布',
  },
  {
    id: 'hzn-03',
    title: '市经信局（市数字经济局）关于组织开展2026年第五批杭州市工信领域项目申报工作的通知',
    dept: '市经信局',
    deptId: 'jxj',
    date: '2026-10-29',
    url: 'https://jxj.hangzhou.gov.cn/col/col1229252271/art/2026/art_46567b1226af4f6d94f9aee596d24dd5.html',
    tag: '申报通知',
  },
  {
    id: 'hzn-04',
    title: '杭州市经信局（市数字经济局）关于组织申报2026年度杭州市专精特新企业融通创新典型案例的通知',
    dept: '市经信局',
    deptId: 'jxj',
    date: '2026-10-26',
    url: 'https://jxj.hangzhou.gov.cn/col/col1229252271/art/2026/art_7429372ed3254b4cb20052ad4e5ac0ae.html',
    tag: '申报通知',
  },
  {
    id: 'hzn-05',
    title: '杭州市经济和信息化局关于印发《杭州市促进航空航天产业高质量发展三年行动方案（2026—2028年）》的通知',
    dept: '市经信局',
    deptId: 'jxj',
    date: '2026-10-23',
    url: 'https://jxj.hangzhou.gov.cn/col/col1229252271/art/2026/art_ee73dd07ae974fe7850161749e415a44.html',
    tag: '政策文件',
  },
  {
    id: 'hzn-06',
    title: '杭州市经济和信息化局 杭州市财政局关于印发杭州市中小微企业服务券管理办法的通知',
    dept: '市经信局',
    deptId: 'jxj',
    date: '2026-05-13',
    url: 'https://jxj.hangzhou.gov.cn/col/col1229145718/art/2026/art_230e0c4f8399488eb6180403a9682dd5.html',
    tag: '规范性文件',
  },
  {
    id: 'hzn-07',
    title: '关于印发杭州市加快发展人工智能终端产业行动方案（2026—2027年）的通知',
    dept: '市经信局',
    deptId: 'jxj',
    date: '2026-01-28',
    url: 'https://jxj.hangzhou.gov.cn/col/col1229145718/art/2026/art_67c919e26018424397ce807d0032dcd4.html',
    tag: '政策文件',
  },
  {
    id: 'hzn-08',
    title: '关于印发杭州市具身智能机器人「强链补链」行动方案（2026—2027年）的通知',
    dept: '市经信局',
    deptId: 'jxj',
    date: '2026-01-06',
    url: 'https://jxj.hangzhou.gov.cn/col/col1229145718/art/2026/art_c481ea5c8eaf4ffaa82bc3d4a93825a4.html',
    tag: '政策文件',
  },
  {
    id: 'hzn-09',
    title: '关于2026年第二批浙江省专精特新中小企业认定和复核通过名单的公示',
    dept: '市经信局',
    deptId: 'jxj',
    date: '2026-11-27',
    url: 'https://jxj.hangzhou.gov.cn/col/col1229252265/art/2026/art_c08d6a3373ea41a7be8ca01aa4b14773.html',
    tag: '名单公示',
  },
  {
    id: 'hzn-10',
    title: '市经信局 市科技局 市卫健委 市市场监管局 市医保局关于组织开展2026年杭州市生物医药产业高质量发展专项申报工作的通知',
    dept: '市经信局',
    deptId: 'jxj',
    date: '2026-06-08',
    url: 'https://jxj.hangzhou.gov.cn/col/col1229252269/art/2026/art_fa36d213544fd87749ee629b37b5f8d8.html',
    tag: '申报通知',
  },

  /* ---- 以下为各部门真实通知，抓取自官网公开栏目（2026-11-27） ---- */
  {
    id: 'hzn-11',
    title: '关于组织申报2026年度杭州市科技保险补助项目的通知',
    dept: '市科技局', deptId: 'kjj', date: '2026-10-23',
    url: 'https://kj.hangzhou.gov.cn/col/col1693961/art/2026/art_5a740c011b4d46fcb69ee0b3df35fae7.html',
    tag: '申报通知',
  },
  {
    id: 'hzn-12',
    title: '关于印发《杭州市「AI+OPC」社区建设工作指引》的通知',
    dept: '市科技局', deptId: 'kjj', date: '2026-07-29',
    url: 'https://kj.hangzhou.gov.cn/col/col1229397648/art/2026/art_cf232d6793ea4b4a87c0e7c994c3cf5c.html',
    tag: '政策文件',
  },
  {
    id: 'hzn-13',
    title: '关于印发杭州市重点科研计划项目管理办法的通知',
    dept: '市科技局', deptId: 'kjj', date: '2026-06-22',
    url: 'https://kj.hangzhou.gov.cn/col/col1229397648/art/2026/art_3d9e8613489047cd90c77aaac6f8c43d.html',
    tag: '规范性文件',
  },
  {
    id: 'hzn-14',
    title: '关于公布2026年度杭州市知识产权强企名单的通知',
    dept: '市市监局', deptId: 'scjg', date: '2026-09-20',
    url: 'https://scjg.hangzhou.gov.cn/col/col1693485/art/2026/art_b798231d4e5449d0b45e45a2a650c4bd.html',
    tag: '名单公布',
  },
  {
    id: 'hzn-15',
    title: '关于开展第五批杭州市重点商标保护名录申报工作的通知',
    dept: '市市监局', deptId: 'scjg', date: '2026-08-19',
    url: 'https://scjg.hangzhou.gov.cn/col/col1693485/art/2026/art_0926c1cca8204b9eae41741e19f3d100.html',
    tag: '申报通知',
  },
  {
    id: 'hzn-16',
    title: '关于组织申报2026年杭州市企业运营类专利导航高价值专利组合项目的通知',
    dept: '市市监局', deptId: 'scjg', date: '2026-07-29',
    url: 'https://scjg.hangzhou.gov.cn/col/col1693485/art/2026/art_861c0cb7a46b4d8284190fa10bf83dbc.html',
    tag: '申报通知',
  },
  {
    id: 'hzn-17',
    title: '2026年杭州市支持平台经济高质量发展专项第三批资金资助（补助）名单公示',
    dept: '市市监局', deptId: 'scjg', date: '2026-11-09',
    url: 'https://scjg.hangzhou.gov.cn/col/col1693484/art/2026/art_d38b6de9f03143ffbb845412435bacfc.html',
    tag: '名单公示',
  },
  {
    id: 'hzn-18',
    title: '关于组织开展2026年浙江省零碳工厂建设工作的通知',
    dept: '省经信厅', deptId: 'zj-jxt', date: '2026-11-23',
    url: 'https://jxt.zj.gov.cn/col/col1229886900/art/2026/art_ab1d06109cfc4625beaf416ef02dd68e.html',
    tag: '申报通知',
  },
  {
    id: 'hzn-19',
    title: '浙江省经济和信息化厅 浙江省财政厅关于开展2027年浙江省制造业创新中心培育建设工作的通知',
    dept: '省经信厅', deptId: 'zj-jxt', date: '2026-11-17',
    url: 'https://jxt.zj.gov.cn/col/col1229886900/art/2026/art_7e38114b0acb4081aab832dddbd3243b.html',
    tag: '申报通知',
  },
  {
    id: 'hzn-20',
    title: '关于印发《浙江省人工智能应用服务商培育行动方案（2026—2028年）》的通知',
    dept: '省经信厅', deptId: 'zj-jxt', date: '2026-11-12',
    url: 'https://jxt.zj.gov.cn/col/col1229886900/art/2026/art_c2dec9171f414f5999525f790103126d.html',
    tag: '政策文件',
  },
  {
    id: 'hzn-21',
    title: '关于2026年度浙江省拟认定技术先进型服务企业名单的公示',
    dept: '省经信厅', deptId: 'zj-jxt', date: '2026-11-24',
    url: 'https://jxt.zj.gov.cn/col/col1229892974/art/2026/art_62dd84ecde8c45ac8974160405041d45.html',
    tag: '名单公示',
  },
  {
    id: 'hzn-22',
    title: '关于开展2026年度国际联合实验室、国际科技合作基地申报工作的通知',
    dept: '省科技厅', deptId: 'zj-kjt', date: '2026-11-13',
    url: 'https://kjt.zj.gov.cn/col/col1229225203/art/2026/art_363f38455ca14221b14816aaffa50622.html',
    tag: '申报通知',
  },
  {
    id: 'hzn-23',
    title: '转发《关于开展2026年度长三角科技创新共同体联合攻关（基础研究）项目申报的通知》',
    dept: '省科技厅', deptId: 'zj-kjt', date: '2026-11-05',
    url: 'https://kjt.zj.gov.cn/col/col1229225203/art/2026/art_546be60d45c84f478e6dd5171ae120b4.html',
    tag: '申报通知',
  },
  {
    id: 'hzn-24',
    title: '浙江省科学技术厅关于组织申报国家重点研发计划「关键基础件及制造工艺」重点专项2026年度公开竞争项目的通知',
    dept: '省科技厅', deptId: 'zj-kjt', date: '2026-11-18',
    url: 'https://kjt.zj.gov.cn/col/col1229225203/art/2026/art_c5ad043b8a814551b9fd9e0720daf65b.html',
    tag: '申报通知',
  },
  {
    id: 'hzn-25',
    title: '三部门关于印发《新一代通信网建设实施方案》的通知',
    dept: '工业和信息化部', deptId: 'miit', date: '2026-11-26',
    url: 'https://www.miit.gov.cn/zwgk/zcwj/wjfb/tz/art/2026/art_808db1814bb74a0e87965d66e74f5b4b.html',
    tag: '政策文件',
  },
  {
    id: 'hzn-26',
    title: '工业和信息化部关于公布第八批国家工业遗产及通过复核的第四批国家工业遗产名单的通知',
    dept: '工业和信息化部', deptId: 'miit', date: '2026-11-27',
    url: 'https://www.miit.gov.cn/zwgk/zcwj/wjfb/tz/art/2026/art_ac5336bf4803411a9264602ae2ef14b7.html',
    tag: '名单公布',
  },
  {
    id: 'hzn-27',
    title: '工业和信息化部第八批产业技术基础公共服务平台名单公示',
    dept: '工业和信息化部', deptId: 'miit', date: '2026-11-27',
    url: 'https://www.miit.gov.cn/zwgk/wjgs/art/2026/art_5d82c62e976e415d83d3af279ec2d096.html',
    tag: '名单公示',
  },
  {
    id: 'hzn-28',
    title: '杭州市促进服务消费高质量发展实施方案',
    dept: '市商务局', deptId: 'swj', date: '2026-03-24',
    url: 'https://sww.hangzhou.gov.cn/col/col1551465/art/2026/art_4c962a797a6e46a9bd91eb03f03ca4dd.html',
    tag: '政策文件',
  },
];

/** 数据来源与免责说明 */
export const HZ_SOURCES = {
  pdfNote: '政策补贴信息整理自《杭州市政策补贴信息》（共 8 页，当前收录第 1 页 6 条）',
  noticeNote: '通知文件抓取自 8 个主管部门官网公开栏目（2026-11-27），点击可查看原文',
  portalsNote: '官网栏目内页多为 JS 异步加载，若列表为空请直接点击「官网首页」进站查看',
  disclaimer: '政策条件与补贴金额以主管部门当年正式发布的通知为准，本页信息仅供参考，不构成申报依据。',
};

export const HZ_NOTICE_TAGS = ['申报通知', '政策文件', '规范性文件', '名单公示', '名单公布', '其他'];

export default { HZ_PORTALS, HZ_POLICIES, HZ_NOTICES, HZ_POLICY_CATEGORIES, HZ_NOTICE_TAGS, HZ_SOURCES };

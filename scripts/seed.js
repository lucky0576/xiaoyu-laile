/**
 * 演示数据：首次启动自动写入，让你打开页面就能看到完整效果。
 * 重新生成：删除 data/collections/*.json 后重启，或运行 node scripts/seed.js --force
 */
import fs from 'node:fs';
import path from 'node:path';
import db from '../src/store/db.js';
import { DATA_DIR, UPLOAD_DIR, PUBLIC_DIR } from '../src/config.js';
import { createUser, hashPassword } from '../src/services/auth.js';
import listingsSvc from '../src/services/listings.js';

const users = () => db.collection('users');
const listings = () => db.collection('listings');
const cases = () => db.collection('cases');

/* ------------------------------------------------------------------ */
/* 项目案例                                                            */
/* ------------------------------------------------------------------ */
export const DEMO_CASES = [
  {
    id: 'case-pv-001',
    category: 'project',
    title: '山东东营 200MW 渔光互补光伏电站 EPC 总承包',
    subtitle: '总投资 8.6 亿元 · 工期 14 个月 · 已完成备案',
    industry: '新能源 / 光伏',
    city: '东营',
    amount: '8.6 亿元',
    highlight: '3 天完成 12 家总包方匹配，21 天签约',
    result: '发布对接 → 资质核验 → 线上会议 3 场 → 线下踏勘 → 初步协议 → 施工合同',
    tags: ['EPC', '光伏', '渔光互补'],
  },
  {
    id: 'case-pv-002',
    category: 'project',
    title: '江苏常州 100MWh 用户侧储能 EMC 合同能源管理',
    subtitle: '分享型合同能源管理 · 业主零投入 · 分成期 8 年',
    industry: '新能源 / 储能',
    city: '常州',
    amount: '2.4 亿元',
    highlight: '通过 AI 解析自动识别出 3 处条款风险，避免损失',
    result: 'EMC 合同签署 → 并网验收 → 收益分成按月结算',
    tags: ['EMC', '储能', '合同能源管理'],
  },
  {
    id: 'case-wind-001',
    category: 'project',
    title: '内蒙古乌兰察布 500MW 风电项目股权融资',
    subtitle: '寻求产业投资人 · 出让 30% 股权 · 已取得核准',
    industry: '新能源 / 风电',
    city: '乌兰察布',
    amount: '12 亿元',
    highlight: 'AI 可靠性评分 87 分，匹配 6 家产业资本',
    result: '股权融资 → 尽调 → 投资协议 → 交割',
    tags: ['股权投资', '风电', '产业投资'],
  },
  {
    id: 'case-compute-001',
    category: 'project',
    title: '长三角智算中心 2000 机柜算力项目招商',
    subtitle: '总装机 20MW · 面向大模型训练 · 可分期入驻',
    industry: '算力',
    city: '苏州',
    amount: '15 亿元',
    highlight: '发布当日获 23 条有效留言，AI 自动回复 19 条',
    result: '招商 → 意向登记 → 框架协议 → 机柜预订',
    tags: ['算力', '智算中心', '招商'],
  },
  {
    id: 'case-robot-001',
    category: 'project',
    title: '汽车零部件产线机器人自动化改造招标',
    subtitle: '6 条产线 · 焊接 + 搬运 + 视觉检测 · 交钥匙工程',
    industry: '机器人',
    city: '宁波',
    amount: '6800 万元',
    highlight: '平台比价后节约采购成本约 9%',
    result: '招标 → 技术交流 → 中标 → 验收',
    tags: ['机器人', '招投标', '产线改造'],
  },
  {
    id: 'case-uav-001',
    category: 'trade',
    title: '农业无人机植保服务网络区域代理招募',
    subtitle: '覆盖 6 省 · 提供整机 + 飞手培训 + 作业补贴结算',
    industry: '无人机',
    city: '郑州',
    amount: '首批 300 台',
    highlight: '通过通讯录邀请功能，7 天拓展 32 家县级服务商',
    result: '代理招募 → 资质审核 → 区域授权 → 首批交付',
    tags: ['无人机', '代理经销', '招商加盟'],
  },
  {
    id: 'case-realestate-001',
    category: 'project',
    title: '杭州钱塘区商业综合体整体转让',
    subtitle: '建面 8.6 万㎡ · 年租金 7200 万元 · 产权清晰',
    industry: '房产',
    city: '杭州',
    amount: '13.8 亿元',
    highlight: 'AI 自动生成主副标题并推荐主图，3 分钟完成发布',
    result: '转让 → 尽调 → 意向协议 → 产权过户',
    tags: ['转让', '商业地产', '并购'],
  },
  {
    id: 'case-mfg-001',
    category: 'trade',
    title: '大型制造企业年度钢材集中采购',
    subtitle: '年需求 12 万吨 · 热轧/冷轧/型材 · 账期 60 天',
    industry: '制造业',
    city: '唐山',
    amount: '4.8 亿元/年',
    highlight: '从发布到定标 11 天，共 18 家钢贸商参与报价',
    result: '采购公告 → 供应商入库 → 报价 → 年框协议',
    tags: ['采购', '钢材', '年度框架'],
  },
  {
    id: 'case-hydrogen-001',
    category: 'project',
    title: '宁夏宁东绿氢制取与加氢站一体化项目',
    subtitle: '年产绿氢 1.2 万吨 · 配套 3 座加氢站 · 寻求联合体',
    industry: '新能源 / 氢能',
    city: '银川',
    amount: '9.5 亿元',
    highlight: '在线会议 AI 纪要自动生成双方 7 项跟进事项',
    result: '联合体组建 → 可行性研究 → 立项 → 开工',
    tags: ['氢能', '联合体', 'EPC'],
  },
  {
    id: 'case-event-001',
    category: 'event',
    title: '2026 中国新型储能产业大会 · 项目路演专场',
    subtitle: '300 人规模 · 20 个项目路演 · 对接投资人 60+',
    industry: '新能源 / 储能',
    city: '深圳',
    amount: '报名费 980 元/人',
    highlight: '活动报名 + 付费 + 群聊 + 会议全流程线上闭环',
    result: '报名 → 缴费 → 入群 → 路演 → 会后纪要',
    tags: ['活动', '赛事', '路演'],
  },
];

/* ------------------------------------------------------------------ */
/* 信息                                                                */
/* ------------------------------------------------------------------ */
const DEMO_LISTINGS = [
  {
    owner: 0,
    category: 'project',
    type: 'epc',
    days: 90,
    text: `山东东营 200MW 渔光互补光伏电站 EPC 总承包招标。
项目位于山东省东营市垦利区，利用 4200 亩坑塘水面建设渔光互补光伏电站，装机容量 200MW，配套建设 220kV 升压站及送出线路。
总投资约 8.6 亿元人民币，计划工期 14 个月，2026 年 4 月开工，2027 年 6 月全容量并网。
招标范围：光伏场区设计、设备采购（不含组件）、土建施工、安装调试、并网手续办理，交钥匙工程。
投标人资格要求：电力工程施工总承包一级及以上资质；近三年至少 2 个 100MW 以上光伏 EPC 业绩；注册资本不低于 2 亿元；具备安全生产许可证。
接受联合体投标，联合体成员不超过 3 家。投标保证金 500 万元。
联系人：张工 13800001234 微信：zhang_energy`,
  },
  {
    owner: 1,
    category: 'project',
    type: 'emc',
    days: 90,
    text: `江苏常州工业园区 100MWh 用户侧储能 EMC 合同能源管理项目。
园区内 12 家制造业企业，合计变压器容量 80MVA，峰谷电价差 0.72 元/kWh。
拟建设 100MWh 磷酸铁锂储能系统，采用分享型合同能源管理模式，业主零投入，投资方负责全部设备投资、建设与运维。
收益分成期 8 年，前 5 年投资方分成 85%，业主 15%；后 3 年投资方 70%，业主 30%。
预计年收益 4200 万元，静态回收期约 5.2 年。
寻求具备储能 EMC 投资运营经验的合作方，要求具备电力业务许可证（供电类）或与持证方组成联合体。
联系人：李经理 13900002345`,
  },
  {
    owner: 2,
    category: 'project',
    type: 'equity-investment',
    days: 180,
    text: `内蒙古乌兰察布 500MW 风电项目股权融资。
项目已取得自治区发改委核准批复与电网接入意见，风资源年利用小时数 3200 小时以上，上网电价 0.29 元/kWh。
项目公司注册资本 3 亿元，现寻求产业投资人以股权投资方式进入，拟出让 30% 股权，融资金额 12 亿元。
资金用途：风机采购 7.2 亿元、塔筒及基础 1.8 亿元、集电线路及升压站 1.5 亿元、其他 1.5 亿元。
已签订 EPC 总承包框架协议，主机厂商已锁定产能。
要求投资人有新能源电站投资业绩，能提供项目融资支持者优先。
联系人：王总 13700003456 邮箱：wang@example-energy.com`,
  },
  {
    owner: 0,
    category: 'project',
    type: 'investment',
    days: 90,
    text: `长三角智算中心 2000 机柜算力项目招商。
项目位于苏州工业园区，建筑面积 2.4 万平方米，设计 IT 负载 20MW，部署 2000 个高密度机柜（单柜 10kW），PUE 设计值 1.25。
面向大模型训练与推理客户，提供整柜租赁、按卡时计费、以及算力入股三种合作模式。
一期 800 机柜计划 2026 年 6 月投产，目前已锁定 2 家头部 AI 企业意向订单，合计 450 机柜。
寻求算力需求方、IDC 运营合作方、以及绿色电力供应商。
电价可提供 0.45 元/kWh 的优惠结算，可签 5 年以上长协。
联系人：陈总 13600004567`,
  },
  {
    owner: 1,
    category: 'project',
    type: 'bidding',
    days: 90,
    text: `宁波汽车零部件产业园 6 条产线机器人自动化改造招标。
招标内容包括：焊接机器人工作站 18 台套、搬运码垛机器人 12 台套、机器视觉检测系统 6 套、以及产线 MES 对接。
项目为交钥匙工程，预算金额 6800 万元（含税），计划工期 10 个月。
要求投标人具备工业机器人系统集成能力，近三年完成过 3 个以上 3000 万元以上自动化产线项目，具备 ISO9001 质量管理体系认证。
设备品牌要求：六轴机器人采用进口一线品牌或国产一线品牌，减速机与伺服系统需提供原厂授权。
质保期 24 个月，验收合格后支付 90%，留 10% 质保金。
联系人：刘工 13500005678 微信：liu_robot`,
  },
  {
    owner: 2,
    category: 'project',
    type: 'transfer',
    days: 180,
    text: `杭州钱塘区商业综合体整体转让。
标的物业位于杭州市钱塘区核心商圈，总建筑面积 8.6 万平方米，地上 6 层、地下 3 层（车位 1200 个）。
当前出租率 92%，主力租户为大型超市、连锁餐饮、影院及儿童教育培训，年租金收入 7200 万元，净收益率约 5.8%。
产权清晰，无抵押、无诉讼，土地性质为商业用地，剩余年限 32 年。
转让方式：100% 股权转让，报价 13.8 亿元，可接受分期支付。
要求受让方具备商业地产运营经验，能一次性支付不低于 50% 的转让款。
联系人：赵总 13400006789`,
  },
  {
    owner: 0,
    category: 'project',
    type: 'financial-leasing',
    days: 90,
    text: `四川成都 3 条锂电池隔膜生产线融资租赁项目。
项目采购 3 条湿法隔膜生产线，设备总价 2.2 亿元，已与设备厂商签订采购合同。
寻求融资租赁公司以售后回租或直接租赁方式提供融资，融资金额 1.8 亿元，期限 5 年，按季等额本息还款。
承租方为高新技术企业，2025 年营业收入 6.8 亿元，净利润 8200 万元，资产负债率 46%。
可提供设备抵押、应收账款质押及实际控制人连带责任担保。
要求租赁公司具备新能源材料行业投放经验，年化综合成本不超过 7.5%。
联系人：孙经理 13300007890 邮箱：sun@example-lithium.com`,
  },
  {
    owner: 1,
    category: 'project',
    type: 'equity-investment',
    days: 180,
    text: `宁夏宁东绿氢制取与加氢站一体化项目寻求联合体。
建设内容：100MW 光伏 + 60MW 电解水制氢装置，年产绿氢 1.2 万吨；配套 3 座 35MPa 加氢站。
总投资 9.5 亿元，已完成可研与环评公示，正在申报国家绿氢示范项目。
现寻求具备化工工程 EPC 资质、加氢站运营经验、或氢能下游消纳能力的企业组成联合体共同投标。
联合体牵头方拟由我方担任，出资比例可协商，接受技术入股。
项目建成后可为宁东能源化工基地内企业提供绿氢替代，已与 2 家化工企业签订意向消纳协议。
联系人：马总 13200008901`,
  },
  {
    owner: 2,
    category: 'project',
    type: 'joint-development',
    days: 90,
    text: `广东佛山制造业厂房分布式光伏 30MW 合作开发。
佛山市顺德区家电制造企业 8 个厂区屋顶，合计可用面积 26 万平方米，可建设分布式光伏 30MW。
业主自用比例约 85%，电价折扣模式（业主按目录电价 85 折结算），合作期 25 年。
屋顶结构已完成荷载评估，满足安装条件，需进行局部防水处理。
项目总投资约 1.1 亿元，预计年发电量 3300 万度，年收益 1500 万元。
寻求分布式光伏投资商，要求具备 50MW 以上分布式项目投资业绩。
联系人：黄经理 13100009012 微信：huang_pv`,
  },
  {
    owner: 0,
    category: 'trade',
    type: 'procurement',
    days: 30,
    text: `河北唐山大型制造企业年度钢材集中采购。
采购品类：热轧卷板 5 万吨、冷轧卷板 3 万吨、H 型钢 2 万吨、螺纹钢 2 万吨，年度总需求 12 万吨。
材质要求：Q235B / Q355B，执行国标 GB/T 3274、GB/T 11263。
交货地点：唐山市曹妃甸区厂区仓库，要求分批次月度交付。
结算方式：月结，账期 60 天，接受银行承兑汇票。
报价方式：以订货日"我的钢铁网"唐山地区市场价为基准，下浮比例报价。
投标人须为钢厂一级代理或具备年供货 5 万吨以上的钢贸企业，需提供近两年财务报表。
联系人：周经理 13000010123 邮箱：zhou@example-mfg.com`,
  },
  {
    owner: 1,
    category: 'trade',
    type: 'supply',
    days: 60,
    text: `江苏无锡光伏支架及配件长期供应能力。
我司为光伏支架专业制造商，年产能 15 万吨，具备热镀锌与锌铝镁双工艺产线。
可供应：固定支架、跟踪支架、屋顶支架、光伏车棚，支持按图纸定制。
已通过 ISO9001、ISO14001、ISO45001 体系认证，具备 TUV 与 CE 认证。
合作方式：接受年度框架协议，也接受单项目投标供货；交货周期 15-25 天。
长三角地区可提供现场技术服务与安装指导。
寻求 EPC 总包方、电站投资商、以及分布式开发商的长期合作。
联系人：吴经理 18900011234 微信：wu_bracket`,
  },
  {
    owner: 2,
    category: 'trade',
    type: 'commissioned-processing',
    days: 60,
    text: `汽车铝合金压铸件委托加工寻产能。
我司承接新能源汽车电控壳体订单，月需求 8 万件，零件重量 1.2-3.5kg，材质 ADC12 / A380。
需委托方具备：800-1600 吨压铸机不少于 6 台；具备 X 光探伤与气密性检测能力；具备 CNC 精加工与清洗线。
质量要求：IATF16949 体系，PPAP 文件齐全，气密性泄漏率小于 1cc/min。
结算方式：月度对账，账期 45 天，模具费可一次性支付或分摊到单价。
交货地点：江苏省常州市，我方自提。
联系人：徐经理 18800012345 微信：xu_casting`,
  },
  {
    owner: 0,
    category: 'trade',
    type: 'inquiry',
    days: 30,
    text: `询价：采购储能集装箱 20 套（5MWh）。
技术规格：20 尺标准集装箱，磷酸铁锂电芯，容量 5MWh，液冷温控，消防采用 Pack 级 + 舱级双重探测。
要求：电芯为一线品牌，具备 UL9540A 与 GB/T 36276 认证，循环寿命不低于 8000 次。
交付时间：2026 年 5 月前完成交付，交付地点为内蒙古乌兰察布项目现场。
付款方式：预付 30%，到货验收 60%，质保金 10%，质保期 5 年。
请提供含税报价、供货周期、质保条款及同类项目业绩。
联系人：李工 18700013456`,
  },
  {
    owner: 1,
    category: 'event',
    type: 'summit',
    days: 90,
    needPay: true,
    fee: 980,
    text: `2026 中国新型储能产业大会 · 项目路演专场。
时间：2026 年 5 月 18 日 09:00 - 18:00
地点：深圳会展中心 5 号馆
规模：300 人，其中投资机构 60 家以上。
议程：
09:00-09:30 签到
09:30-10:30 主题演讲：新型储能政策与市场趋势
10:30-12:00 圆桌论坛：储能商业模式与收益测算
13:30-17:00 项目路演（20 个项目，每个 12 分钟 + 5 分钟问答）
17:00-18:00 自由对接
报名费：980 元/人（含午餐、会议资料、会后项目清单）
早鸟价 680 元，4 月 30 日前报名有效。
路演项目征集中，每家限报 1 个项目，需提供 15 页以内 PPT 与 3 分钟视频介绍。
主办：深圳市储能产业协会  承办：小鱼来了平台`,
  },
  {
    owner: 2,
    category: 'event',
    type: 'course',
    days: 60,
    needPay: true,
    fee: 2980,
    text: `EPC 工程项目全过程管理与招投标实战训练营（第 12 期）。
开班时间：2026 年 4 月 10 日 - 12 日（三天两晚）
地点：杭州市滨江区*培训基地
适合人群：工程公司项目经理、商务经理、投标负责人、业主方工程管理人员。
课程大纲：
第一天：EPC 项目策划与设计管理、工程量清单与控制价编制
第二天：招投标法规解读、投标策略与报价技巧、废标风险防范
第三天：合同谈判与风险条款、变更索赔、项目结算与审计应对
讲师：具备 20 年以上央企工程管理经验的实战专家。
学费：2980 元/人（含教材、午餐、证书），3 人以上团报 2680 元/人。
结业颁发《EPC 项目管理实战能力证书》。
报名截止：2026 年 4 月 8 日，限 40 人。`,
  },
  {
    owner: 0,
    category: 'event',
    type: 'competition',
    days: 60,
    needPay: false,
    text: `首届"新能源杯"产业创新创业大赛（新能源 & 机器人赛道）。
报名时间：即日起至 2026 年 6 月 30 日
初赛：线上材料评审（7 月 1 日 - 7 月 15 日）
复赛：线上路演（7 月 20 日 - 7 月 25 日）
决赛：深圳现场（8 月 8 日）
参赛对象：成立 8 年以内的科技型企业，2025 年营业收入不超过 4 亿元。
赛道设置：光伏与储能技术、氢能、风电、算力与 AI 基础设施、工业与服务机器人、无人机应用。
奖项设置：一等奖 1 名 20 万元，二等奖 3 名各 10 万元，三等奖 6 名各 5 万元；获奖项目优先对接大赛合作基金（合计规模 50 亿元）。
报名免费，需提交商业计划书 PDF 与 5 分钟演示视频。
报名入口：本页面"立即报名"按钮。`,
  },
];

/* ------------------------------------------------------------------ */
/* 写入                                                                */
/* ------------------------------------------------------------------ */
const DEMO_USERS = [
  {
    nickname: '鲁能新能源-张工',
    phone: '13800001234',
    wechatId: 'zhang_energy',
    company: '山东鲁能新能源工程有限公司',
    profession: '工程总监',
    industry: '新能源',
    city: '东营',
    bio: '专注光伏、风电 EPC 总承包 15 年，累计建成电站 2.6GW。',
    verified: true,
  },
  {
    nickname: '常州储能-李经理',
    phone: '13900002345',
    wechatId: 'li_storage',
    company: '常州中科储能科技有限公司',
    profession: '商务经理',
    industry: '新能源',
    city: '常州',
    bio: '用户侧储能 EMC 投资运营，已投运项目 380MWh。',
    verified: true,
  },
  {
    nickname: '乌兰察布风电-王总',
    phone: '13700003456',
    wechatId: 'wang_wind',
    company: '内蒙古北方风力发电有限公司',
    profession: '总经理',
    industry: '新能源',
    city: '乌兰察布',
    bio: '风电、光伏电站开发与股权投资。',
    verified: false,
  },
  {
    nickname: '平台管理员',
    phone: '18800000000',
    email: 'admin@xiaoyu.local',
    company: '小鱼来了运营中心',
    profession: '平台运营',
    industry: '互联网',
    city: '深圳',
    bio: '平台官方账号，负责资质审核与内容治理。',
    isAdmin: true,
    verified: true,
  },
];

export async function seedIfEmpty(force = false) {
  const existing = users().count();
  if (existing > 0 && !force) {
    // 老库补种：短视频/直播是后加的功能，已有数据时单独补上演示内容，
    // 否则首页轮播位会一直空着（不需要重置整个数据库）。
    let added = 0;
    try {
      if (db.collection('feeds').count() === 0) {
        const people = users().all();
        const owners = people.filter((u) => !u.isAdmin);
        if (owners.length) added = await seedFeeds(owners);
      }
    } catch {
      /* ignore */
    }
    return { created: false, users: 0, listings: 0, cases: 0, feeds: added };
  }

  /* 用户 */
  const createdUsers = [];
  for (const spec of DEMO_USERS) {
    const u = createUser({ ...spec, password: spec.isAdmin ? 'admin123456' : 'demo123456' });
    const patch = {
      verified: Boolean(spec.verified),
      bio: spec.bio,
      settings: { ...u.settings, wechatBind: true },
    };
    if (spec.verified) {
      patch.qualification = {
        status: 'approved',
        companyName: spec.company,
        types: ['business_license', 'iso9001'],
        files: [],
        submittedAt: new Date().toISOString(),
        reviewedAt: new Date().toISOString(),
        reviewerNote: '演示数据自动通过',
      };
    }
    users().update(u.id, patch);
    createdUsers.push(users().get(u.id));
  }
  const admin = createdUsers.find((u) => u.isAdmin);

  /* 案例 */
  for (const c of DEMO_CASES) {
    cases().insert({ ...c, createdAt: new Date().toISOString() });
  }

  /* 信息 */
  let created = 0;
  for (const spec of DEMO_LISTINGS) {
    const owner = createdUsers[spec.owner] || createdUsers[0];
    const doc = await listingsSvc.createListing({
      user: owner,
      body: {
        category: spec.category,
        type: spec.type,
        text: spec.text,
        durationDays: spec.days || 30,
        hideContact: false,
      },
      files: [],
    });
    const patch = {};
    if (spec.category === 'event') {
      patch.event = {
        ...doc.event,
        startAt: new Date(Date.now() + 30 * 86400_000).toISOString(),
        endAt: new Date(Date.now() + 30 * 86400_000 + 8 * 3600_000).toISOString(),
        address: '详见正文',
        online: false,
        capacity: 300,
        fee: spec.fee || 0,
        needPay: Boolean(spec.needPay),
        organizer: owner.company,
        agenda: '',
      };
    }
    if (Object.keys(patch).length) listings().update(doc.id, patch);
    listingsSvc.publishListing(doc.id, owner, { days: spec.days || 30 });
    created++;
  }

  /* 一些演示留言 */
  const first = listings().all().filter((l) => l.status === 'published').slice(0, 3);
  for (const l of first) {
    try {
      await listingsSvc.addComment(l.id, createdUsers[1], '请问项目目前进展到哪一步了？对承接方的资质有什么硬性要求？', {});
    } catch {
      /* ignore */
    }
  }

  /* 首页轮播用的短视频与直播 */
  let feedCount = 0;
  try {
    feedCount = await seedFeeds(createdUsers);
  } catch {
    /* ignore */
  }

  /* 默认封面图 */
  try {
    await ensureDefaultCover();
  } catch {
    /* ignore */
  }

  db.flush();
  return { created: true, users: createdUsers.length, listings: created, cases: DEMO_CASES.length, feeds: feedCount, admin: admin?.id };
}

/**
 * 生成一张竖向渐变的演示封面，写进上传目录并登记为文件记录。
 * 纯代码绘制，不依赖任何外部素材。
 */
async function makeCoverPng({ name, from, to, accent }) {
  const png = await import('../src/lib/png.js');
  const W = 540;
  const H = 960;
  const rgba = Buffer.alloc(W * H * 4);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      const t = y / H;
      rgba[i] = Math.round(from[0] + (to[0] - from[0]) * t);
      rgba[i + 1] = Math.round(from[1] + (to[1] - from[1]) * t);
      rgba[i + 2] = Math.round(from[2] + (to[2] - from[2]) * t);
      rgba[i + 3] = 255;
    }
  }
  // 右下角一个柔和的圆形高光，避免纯色显得呆板
  const cx = Math.round(W * 0.72);
  const cy = Math.round(H * 0.42);
  const R = Math.round(W * 0.42);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const d = Math.hypot(x - cx, y - cy);
      if (d > R) continue;
      const a = (1 - d / R) ** 2 * 0.55;
      const i = (y * W + x) * 4;
      rgba[i] = Math.round(rgba[i] * (1 - a) + accent[0] * a);
      rgba[i + 1] = Math.round(rgba[i + 1] * (1 - a) + accent[1] * a);
      rgba[i + 2] = Math.round(rgba[i + 2] * (1 - a) + accent[2] * a);
    }
  }
  const id = db.newId('fl');
  const dir = path.join(UPLOAD_DIR, id);
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, name);
  const buf = png.encodePNG({ width: W, height: H, rgba });
  fs.writeFileSync(file, buf);
  return db.collection('files').insert({
    id,
    ownerId: '',
    listingId: '',
    role: 'feed-cover',
    name,
    ext: 'png',
    kind: 'image',
    mime: 'image/png',
    size: buf.length,
    path: file,
    url: `/files/${id}/${encodeURIComponent(name)}`,
    text: '',
    meta: { width: W, height: H },
    notes: [],
    createdAt: new Date().toISOString(),
  });
}

/** 首页轮播的短视频 / 直播演示内容 */
async function seedFeeds(createdUsers) {
  const feedCol = () => db.collection('feeds');
  if (feedCol().count() > 0) return 0;
  const host = createdUsers[0];
  const second = createdUsers[1] || host;
  const now = Date.now();

  const specs = [
    {
      type: 'live',
      title: '【直播】东营 200MW 渔光互补项目对接答疑',
      subtitle: 'EPC 总包方、组件供应商、储能集成商可直接连麦',
      description: '本场直播由项目业主方主持，说明地块条件、并网方案、资质门槛与报价区间，并现场回答承接方提问。',
      owner: host,
      cover: { name: 'live-pv.png', from: [12, 42, 110], to: [20, 150, 160], accent: [110, 220, 255] },
      liveStatus: 'live',
      views: 386,
      likes: 42,
    },
    {
      type: 'short',
      title: '储能集装箱产线实拍：从电芯到 PACK 全流程',
      subtitle: '2 分 30 秒看完一条 2GWh 产线',
      description: '厂区实拍，展示电芯分选、模组装配、PACK 集成、EOL 测试全流程，适合需要考察供应商产能的采购方。',
      owner: second,
      cover: { name: 'short-ess.png', from: [18, 22, 52], to: [96, 78, 200], accent: [180, 150, 255] },
      liveStatus: 'off',
      views: 1240,
      likes: 158,
    },
    {
      type: 'short',
      title: '低空经济：无人机巡检在光伏电站的落地效果',
      subtitle: '37 分钟完成 2000 亩组件热斑排查',
      description: '对比人工巡检与无人机红外巡检的效率与成本，含设备选型与飞手资质要求。',
      owner: host,
      cover: { name: 'short-uav.png', from: [10, 60, 70], to: [16, 168, 120], accent: [150, 255, 210] },
      liveStatus: 'off',
      views: 892,
      likes: 96,
    },
  ];

  let n = 0;
  for (const s of specs) {
    let coverFile = null;
    try {
      coverFile = await makeCoverPng(s.cover);
    } catch {
      coverFile = null;
    }
    feedCol().insert({
      id: db.newId('fd'),
      type: s.type,
      title: s.title,
      subtitle: s.subtitle,
      description: s.description,
      fileId: '',
      coverFileId: coverFile ? coverFile.id : '',
      ownerId: s.owner.id,
      ownerSnapshot: {
        id: s.owner.id,
        nickname: s.owner.nickname,
        avatar: s.owner.avatar,
        company: s.owner.company,
        verified: true,
      },
      listingId: '',
      liveMeetingId: '',
      liveStatus: s.liveStatus,
      liveStartedAt: s.liveStatus === 'live' ? new Date(now - 12 * 60_000).toISOString() : '',
      featured: true,
      sort: 0,
      views: s.views,
      likes: s.likes,
      likedBy: [],
      commentCount: 0,
      createdAt: new Date(now - n * 3600_000).toISOString(),
      expiresAt: new Date(now + 90 * 86400_000).toISOString(),
    });
    n++;
  }
  return n;
}

/** 生成一张默认分享封面 PNG（纯代码绘制，无需外部素材） */
async function ensureDefaultCover() {
  const target = path.join(PUBLIC_DIR, 'static', 'share-default.png');
  if (fs.existsSync(target)) return;
  let png;
  try {
    png = await import('../src/lib/png.js');
  } catch {
    return;
  }
  const W = 500;
  const H = 400;
  const rgba = Buffer.alloc(W * H * 4);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      const t = (x + y) / (W + H);
      rgba[i] = Math.round(13 + t * 20);
      rgba[i + 1] = Math.round(110 + t * 40);
      rgba[i + 2] = Math.round(253 - t * 30);
      rgba[i + 3] = 255;
    }
  }
  // 画一个简单的白色"鱼"形色块，作为无图时的默认封面
  const put = (cx, cy, r, color) => {
    for (let y = Math.max(0, cy - r); y < Math.min(H, cy + r); y++) {
      for (let x = Math.max(0, cx - r); x < Math.min(W, cx + r); x++) {
        if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r) {
          const i = (y * W + x) * 4;
          rgba[i] = color[0];
          rgba[i + 1] = color[1];
          rgba[i + 2] = color[2];
          rgba[i + 3] = 255;
        }
      }
    }
  };
  put(250, 190, 62, [255, 255, 255]);
  for (let x = 310; x < 360; x++) {
    for (let y = 150; y < 230; y++) {
      const t = (x - 310) / 50;
      const half = Math.round(26 * (1 - t));
      if (Math.abs(y - 190) <= half) {
        const i = (y * W + x) * 4;
        rgba[i] = 255;
        rgba[i + 1] = 255;
        rgba[i + 2] = 255;
        rgba[i + 3] = 255;
      }
    }
  }
  put(228, 172, 10, [13, 110, 253]);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, png.encodePNG({ width: W, height: H, rgba }));
}

/* 直接运行时执行 */
if (process.argv[1] && process.argv[1].endsWith('seed.js')) {
  const force = process.argv.includes('--force');
  seedIfEmpty(force).then((r) => {
    console.log('[seed]', r);
    db.flush();
    process.exit(0);
  });
}

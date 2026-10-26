// 造电商演示数据（转让/出售 + 贸易供应 + 收购）
// 用 Node 跑，避免 PowerShell 的编码问题：node scripts/seed-ecommerce.mjs
const BASE = 'https://xiaoyulaile.online';
const ACCOUNT = '13456693544';
const PASSWORD = 'weilan0576';

const NE = [{ id: 'new-energy', name: '新能源' }];
const city = (id, name, province) => [{ id, name, province }];

const seeds = [
  {
    category: 'project',
    type: 'transfer',
    title: '济南市·光伏｜山东 50MW 农光互补电站整体转让',
    subtitle: '已并网 3 年 · 年发电 6200 万度 · 含 25 年电价合同',
    text: `【项目概况】
山东济南商河县 50MW 农光互补光伏电站，2023 年 6 月全容量并网，占地 1300 亩（其中农业大棚 420 亩）。

【核心指标】
· 装机容量 50MW，单晶 PERC 双面组件 + 固定可调支架
· 年均发电量 6200 万度，等效利用小时 1240 小时
· 上网电价 0.3949 元/度，已签 25 年购售电合同
· 2025 年实际发电 6380 万度，营收约 2450 万元

【财务情况】
· 总投资 3.2 亿元，已折旧 3 年
· 存量银行贷款 1.1 亿元（可承接或由买方置换）
· 年运维成本约 260 万元

【转让方式】
· 整体股权转让，报价 2.1 亿元（可谈）
· 接受分期支付，首付不低于 60%
· 可配合尽调，提供近三年发电与财务报表

【转让原因】
集团战略调整，聚焦制造业，退出电站持有环节。`,
    cities: city('jinan', '济南市', '山东省'),
    tags: ['出售转让', '光伏电站', '农光互补', '山东'],
    project: { investAmount: '2.1 亿元', cooperation: '股权转让', stage: '已并网运营', period: '25 年电价合同' },
    daysAgo: 1,
  },
  {
    category: 'trade',
    type: 'supply',
    title: '杭州市·光伏｜A 级组件尾单 500MW 现货供应（TOPCon 580W）',
    subtitle: '一线品牌 A 级 · 出厂价含税 · 30 天内可发完全部货',
    text: `【供应概况】
现有 TOPCon 双玻组件尾单 500MW 现货，一线品牌 A 级品，非 B 级非拆机。

【规格参数】
· 功率 580W，尺寸 2278×1134×30mm
· 转换效率 22.5%，双面率 80%
· 质保：产品 12 年，功率 30 年（首年衰减 ≤1%，之后每年 ≤0.4%）
· 认证齐全：TUV / CE / CQC / 领跑者

【价格与交付】
· 出厂价 0.68 元/W（含 13% 增值税，不含运费）
· 单次提货满 20MW 可再谈
· 现货在杭州仓，30 天内可发完
· 支持验货，可提供第三方检测报告

【交易方式】
· 现款现货，或 30% 预付 + 发货前付清
· 可开增值税专用发票

【备注】
这批是海外订单取消留下的尾单，不是库存积压品，功率爬坡已到位。`,
    cities: city('hangzhou', '杭州市', '浙江省'),
    tags: ['供应', '光伏组件', 'TOPCon', '现货'],
    trade: {
      tradeType: '供应',
      payment: '现款现货 / 30% 预付',
      delivery: '30 天内发货',
      destination: '杭州仓',
      items: [
        { name: 'TOPCon 双玻组件', spec: '580W / 2278×1134×30mm', quantity: '500', unit: 'MW', price: '0.68 元/W', note: '一线品牌 A 级，质保 30 年' },
        { name: '配套 MC4 连接器', spec: '1500V / IP68', quantity: '40000', unit: '对', price: '9.5 元/对', note: '随组件配套' },
      ],
    },
    daysAgo: 2,
  },
  {
    category: 'project',
    type: 'acquisition',
    title: '上海市·新能源｜收购工商业分布式光伏电站资产包（50~300MW）',
    subtitle: '要求已并网满 1 年 · 江浙沪皖优先 · 单笔 2~10 亿元',
    text: `【收购方背景】
新能源产业基金，管理规模 40 亿元，专注分布式光伏与储能资产投资。

【收购标的】
· 工商业屋顶分布式光伏电站，已并网运行满 1 年
· 单体规模 5MW 以上，资产包合计 50~300MW
· 优先区域：江苏、浙江、上海、安徽
· 屋顶产权清晰，用电方为优质工商业企业

【交易条件】
· 单笔投资 2~10 亿元
· 要求 IRR ≥ 7%，回收期 ≤ 10 年
· 可承接存量贷款，或一次性现金收购
· 尽调周期 4~6 周，决策快

【我们提供】
· 资金已到位，无需募集
· 可签框架协议后分批交割
· 原业主可保留运维服务合同（优先考虑）

【对接方式】
通过平台「项目对接」发起，我们会在 2 个工作日内回复。`,
    cities: city('shanghai', '上海市', '上海市'),
    tags: ['收购', '分布式光伏', '资产包', '江浙沪'],
    project: { investAmount: '2~10 亿元', cooperation: '股权/资产收购', stage: '已并网 1 年以上', target: '单体 5MW 以上，优先江浙沪皖' },
    daysAgo: 3,
  },
  {
    category: 'trade',
    type: 'supply',
    title: '南京市·储能｜二手储能集装箱 2MWh 现货 12 台（2023 年设备）',
    subtitle: '循环 800 次左右 · 含 PCS 与消防 · 可现场验货',
    text: `【供应概况】
12 台 2MWh 储能集装箱，2023 年投运，因项目扩容置换下来。

【设备参数】
· 单体容量 2MWh，磷酸铁锂电芯
· 直流侧电压 1331.2V，含 BMS
· 配套 PCS 1MW / 台，含液冷系统与消防
· 循环次数约 800 次（设计 6000 次）
· SOH 实测 96% 以上，有第三方检测报告

【价格】
· 整柜 0.62 元/Wh（含 PCS 与消防）
· 12 台全要可再谈，打包价可降 3~5%
· 不含运输与吊装

【交易方式】
· 支持现场验货，可带第三方机构检测
· 现款现货 / 30% 预付
· 可协助联系运输与吊装队伍

【适合场景】
工商业峰谷套利、电网侧调频、临时保电、微电网。`,
    cities: city('nanjing', '南京市', '江苏省'),
    tags: ['供应', '二手储能', '储能集装箱', '现货'],
    trade: {
      tradeType: '供应',
      payment: '现款现货 / 30% 预付',
      delivery: '付款后 15 天内',
      destination: '南京仓',
      items: [
        { name: '储能集装箱', spec: '2MWh / 1331.2V 液冷', quantity: '12', unit: '台', price: '0.62 元/Wh', note: '含 BMS、消防，SOH ≥96%' },
        { name: '储能 PCS', spec: '1MW / 含变压器', quantity: '12', unit: '台', price: '含在整柜价', note: '随柜配套' },
      ],
    },
    daysAgo: 4,
  },
  {
    category: 'project',
    type: 'transfer',
    title: '呼和浩特市·风电｜内蒙古 200MW 风电项目开发权转让',
    subtitle: '指标与环评齐备 · 未开工 · 含 220kV 送出线路批复',
    text: `【项目概况】
内蒙古呼和浩特市武川县 200MW 风电项目，前期手续全部完成，尚未开工。

【手续情况】
· 已取得自治区风电建设指标
· 已完成环评、水保、地灾、压覆矿产等专项批复
· 220kV 送出线路已取得接入系统批复
· 已完成土地预审，租地协议已签 20 年
· 测风塔运行 14 个月，年均风速 7.2m/s

【技术条件】
· 规划装机 200MW，拟装 32 台 6.25MW 机组
· 预计年发电量 5.2 亿度，利用小时 2600 小时
· 上网电价按蒙西燃煤基准价 0.2829 元/度

【转让方式】
· 开发权整体转让，报价 4800 万元（含已发生前期费用）
· 可配合办理主体变更
· 转让后原团队可提供 6 个月过渡支持

【转让原因】
原开发方资金链调整，无力继续投入建设。`,
    cities: city('hohhot', '呼和浩特市', '内蒙古自治区'),
    tags: ['出售转让', '风电', '项目开发权', '内蒙古'],
    project: { investAmount: '4800 万元', cooperation: '开发权转让', stage: '前期手续完备，未开工', period: '建设期 12 个月' },
    daysAgo: 5,
  },
  {
    category: 'trade',
    type: 'supply',
    title: '杭州市·光伏｜光伏支架热镀锌加工产能供应（月产能 8000 吨）',
    subtitle: '自有产线 · 锌层厚度可定制 · 江浙沪 3 天到货',
    text: `【供应能力】
自有热镀锌产线 2 条，月加工产能 8000 吨，长期承接光伏支架镀锌。

【工艺参数】
· 锌层厚度 65~120μm 可定制（常规 85μm）
· 最大加工件尺寸 12m × 1.2m × 0.6m
· 执行标准 GB/T 13912-2020
· 附着力、盐雾试验按客户要求出报告

【价格】
· 加工费 1250 元/吨（含税，不含运费）
· 月量满 3000 吨可降至 1180 元/吨
· 来料加工与包工包料都可

【交付】
· 江浙沪 3 天到货，其他地区 5~7 天
· 可代加工 C 型钢、U 型钢、圆管、连接件

【资质】
ISO9001、ISO14001，可提供第三方镀层检测报告。`,
    cities: city('hangzhou', '杭州市', '浙江省'),
    tags: ['供应', '光伏支架', '热镀锌', '代加工'],
    trade: {
      tradeType: '供应',
      payment: '月结 30 天',
      delivery: '江浙沪 3 天',
      destination: '杭州 / 全国',
      items: [
        { name: '热镀锌加工', spec: '锌层 65~120μm', quantity: '8000', unit: '吨/月', price: '1250 元/吨', note: 'GB/T 13912-2020' },
        { name: 'C 型钢', spec: '41×41 / 41×52 / 41×62', quantity: '3000', unit: '吨/月', price: '按米计价', note: '可代加工' },
      ],
    },
    daysAgo: 6,
  },
];

async function main() {
  const lr = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ account: ACCOUNT, password: PASSWORD }),
  });
  const lj = await lr.json();
  const token = lj?.data?.token;
  if (!token) throw new Error('登录失败');

  let ok = 0;
  let fail = 0;

  for (const s of seeds) {
    const payload = {
      category: s.category,
      type: s.type,
      title: s.title,
      subtitle: s.subtitle,
      text: s.text,
      publish: true,
      skipAuto: true,
      durationDays: 90,
      industries: NE,
      cities: s.cities,
      tags: s.tags,
      ...(s.project || {}),
      ...(s.trade || {}),
    };

    const r = await fetch(`${BASE}/api/listings`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json; charset=utf-8',
      },
      body: JSON.stringify(payload),
    });
    const j = await r.json();
    if (r.ok && j?.data?.listing?.id) {
      ok += 1;
      console.log(`  ✅ [${s.type}] ${s.title.slice(0, 40)}`);
    } else {
      fail += 1;
      console.log(`  ❌ ${s.title.slice(0, 30)}  ${JSON.stringify(j).slice(0, 90)}`);
    }
  }

  console.log('');
  console.log(`  完成：成功 ${ok}，失败 ${fail}`);

  const er = await fetch(`${BASE}/api/listings?category=ecommerce&pageSize=30`);
  const ej = await er.json();
  console.log('');
  console.log(`  电商现在的条目：共 ${ej?.data?.total ?? '?'} 条`);
  for (const it of ej?.data?.items || []) {
    console.log(`    [${it.typeName}] ${it.title.slice(0, 42)}`);
  }
}

main().catch((e) => {
  console.error('  失败:', e.message);
  process.exit(1);
});

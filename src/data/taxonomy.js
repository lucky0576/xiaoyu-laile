/**
 * 「小鱼来了」纯数据模块 —— 行业 / 项目类型 / 贸易类型 / 活动类型 / 省市 / 流程 / 资质
 *
 * 约束：ESM、零依赖、无副作用、无副作用式副作用导入。
 * 所有查找函数对未知 id 均返回 null 或原样返回传入的 id，不抛异常。
 */

/* ------------------------------------------------------------------ *
 * 1. INDUSTRIES —— 行业细分树
 * ------------------------------------------------------------------ */

export const INDUSTRIES = [
  {
    id: 'new-energy',
    name: '新能源',
    icon: '☀️',
    subs: [
      { id: 'pv', name: '光伏' },
      { id: 'storage', name: '储能' },
      { id: 'wind', name: '风电' },
      { id: 'hydrogen', name: '氢能' },
      { id: 'battery', name: '蓄电' },
      { id: 'hydro', name: '水力发电' },
      { id: 'hydrogen-power', name: '氢能发电' },
      { id: 'distributed-energy', name: '分布式能源' },
      { id: 'microgrid', name: '微电网' },
      { id: 'charging-pile', name: '充电桩' },
      { id: 'contract-energy', name: '合同能源管理' },
      { id: 'energy-saving', name: '节能改造' },
      { id: 'waste-heat', name: '余热利用' },
      { id: 'biomass', name: '生物质能' },
      { id: 'geothermal', name: '地热能' },
      { id: 'ocean-energy', name: '海洋能' },
      { id: 'solar-thermal', name: '光热发电' },
      { id: 'power-station', name: '电站建设' },
      { id: 'energy-storage-material', name: '储能材料' },
      { id: 'carbon-asset', name: '碳资产与碳交易' }
    ]
  },
  {
    id: 'computing-power',
    name: '算力',
    icon: '🖥️',
    subs: [
      { id: 'idc', name: '数据中心' },
      { id: 'intelligent-computing', name: '智算中心' },
      { id: 'supercomputing', name: '超算中心' },
      { id: 'cloud-computing', name: '云计算' },
      { id: 'edge-computing', name: '边缘计算' },
      { id: 'gpu-cluster', name: 'GPU 集群' },
      { id: 'liquid-cooling', name: '液冷散热' },
      { id: 'server', name: '服务器' },
      { id: 'network-equipment', name: '网络设备' },
      { id: 'optical-module', name: '光模块' },
      { id: 'computing-scheduling', name: '算力调度' },
      { id: 'computing-rental', name: '算力租赁' },
      { id: 'computing-chip', name: '算力芯片' },
      { id: 'storage-device', name: '存储设备' },
      { id: 'model-training', name: '大模型训练' },
      { id: 'inference-service', name: '推理服务' },
      { id: 'green-computing', name: '绿色算力' }
    ]
  },
  {
    id: 'robotics',
    name: '机器人',
    icon: '🤖',
    subs: [
      { id: 'industrial-robot', name: '工业机器人' },
      { id: 'service-robot', name: '服务机器人' },
      { id: 'humanoid-robot', name: '人形机器人' },
      { id: 'medical-robot', name: '医疗机器人' },
      { id: 'agv', name: '移动机器人与 AGV' },
      { id: 'robot-arm', name: '机械臂' },
      { id: 'core-parts', name: '核心零部件' },
      { id: 'reducer', name: '减速器' },
      { id: 'servo-motor', name: '伺服电机' },
      { id: 'sensor', name: '传感器' },
      { id: 'vision-system', name: '机器视觉' },
      { id: 'integration', name: '系统集成' },
      { id: 'special-robot', name: '特种机器人' },
      { id: 'education-robot', name: '教育机器人' },
      { id: 'logistics-robot', name: '物流机器人' },
      { id: 'cleaning-robot', name: '清洁机器人' },
      { id: 'exoskeleton', name: '外骨骼机器人' }
    ]
  },
  {
    id: 'drone',
    name: '无人机',
    icon: '🛩️',
    subs: [
      { id: 'multi-rotor', name: '多旋翼无人机' },
      { id: 'fixed-wing', name: '固定翼无人机' },
      { id: 'vtol', name: '垂直起降无人机' },
      { id: 'industrial-uav', name: '工业级无人机' },
      { id: 'agricultural-uav', name: '农业植保无人机' },
      { id: 'inspection-uav', name: '巡检无人机' },
      { id: 'logistics-uav', name: '物流无人机' },
      { id: 'emergency-uav', name: '应急救援无人机' },
      { id: 'mapping-uav', name: '测绘无人机' },
      { id: 'counter-uav', name: '反无人机' },
      { id: 'uav-parts', name: '无人机零部件' },
      { id: 'flight-control', name: '飞控系统' },
      { id: 'payload', name: '任务载荷' },
      { id: 'uav-training', name: '无人机培训' },
      { id: 'low-altitude', name: '低空经济' },
      { id: 'uav-operation', name: '无人机服务运营' }
    ]
  },
  {
    id: 'real-estate',
    name: '房产',
    icon: '🏠',
    subs: [
      { id: 'residential', name: '住宅开发' },
      { id: 'commercial', name: '商业地产' },
      { id: 'office', name: '写字楼' },
      { id: 'industrial-park', name: '产业园区' },
      { id: 'property-management', name: '物业管理' },
      { id: 'second-hand', name: '二手房' },
      { id: 'leasing', name: '房屋租赁' },
      { id: 'land', name: '土地开发' },
      { id: 'urban-renewal', name: '城市更新' },
      { id: 'affordable-housing', name: '保障性住房' },
      { id: 'decoration', name: '装修装饰' },
      { id: 'intermediary', name: '房产中介' },
      { id: 'parking', name: '车位车库' },
      { id: 'hotel-property', name: '酒店物业' },
      { id: 'logistics-property', name: '物流地产' },
      { id: 'pension-property', name: '养老地产' }
    ]
  },
  {
    id: 'manufacturing',
    name: '制造业',
    icon: '🏭',
    subs: [
      { id: 'equipment', name: '装备制造' },
      { id: 'cnc', name: '数控机床' },
      { id: 'mold', name: '模具' },
      { id: 'precision', name: '精密加工' },
      { id: 'welding', name: '焊接加工' },
      { id: 'casting', name: '铸造' },
      { id: 'forging', name: '锻造' },
      { id: 'sheet-metal', name: '钣金' },
      { id: 'surface-treatment', name: '表面处理' },
      { id: 'assembly', name: '组装代工' },
      { id: 'automation', name: '自动化产线' },
      { id: 'intelligent-manufacturing', name: '智能制造' },
      { id: 'oem', name: '代工生产' },
      { id: 'quality-inspection', name: '检测认证' },
      { id: 'spare-parts', name: '零部件' },
      { id: 'tooling', name: '工装夹具' },
      { id: 'packaging-machinery', name: '包装机械' },
      { id: 'food-machinery', name: '食品机械' },
      { id: 'textile-machinery', name: '纺织机械' },
      { id: 'other-manufacturing', name: '其他制造' }
    ]
  },
  {
    id: 'power-energy',
    name: '电力能源',
    icon: '⚡',
    subs: [
      { id: 'power-generation', name: '发电' },
      { id: 'thermal-power', name: '火电' },
      { id: 'nuclear-power', name: '核电' },
      { id: 'transmission', name: '输电' },
      { id: 'substation', name: '变电站' },
      { id: 'distribution-network', name: '配电网' },
      { id: 'power-grid', name: '电网建设' },
      { id: 'power-supply', name: '供电服务' },
      { id: 'electricity-sales', name: '售电业务' },
      { id: 'transformer', name: '变压器' },
      { id: 'switchgear', name: '开关柜' },
      { id: 'cable', name: '电线电缆' },
      { id: 'power-inspection', name: '电力检修' },
      { id: 'relay-protection', name: '继电保护' },
      { id: 'smart-grid', name: '智能电网' },
      { id: 'energy-management', name: '能源管理' },
      { id: 'operation-maintenance', name: '运维服务' },
      { id: 'gas-power', name: '燃气发电' }
    ]
  },
  {
    id: 'petrochemical',
    name: '石油化工',
    icon: '🛢️',
    subs: [
      { id: 'oil-gas-exploration', name: '油气勘探' },
      { id: 'drilling', name: '钻井工程' },
      { id: 'refining', name: '炼油' },
      { id: 'ethylene', name: '乙烯化工' },
      { id: 'chemical-fertilizer', name: '化肥' },
      { id: 'fine-chemical', name: '精细化工' },
      { id: 'coal-chemical', name: '煤化工' },
      { id: 'natural-gas', name: '天然气' },
      { id: 'pipeline', name: '油气管道' },
      { id: 'storage-tank', name: '储罐' },
      { id: 'chemical-equipment', name: '化工装备' },
      { id: 'catalyst', name: '催化剂' },
      { id: 'coatings', name: '涂料' },
      { id: 'plastic-chemical', name: '塑胶化工' },
      { id: 'hazardous-chemical', name: '危化品' },
      { id: 'oil-service', name: '油田服务' }
    ]
  },
  {
    id: 'environmental-water',
    name: '环保水务',
    icon: '🌱',
    subs: [
      { id: 'sewage-treatment', name: '污水处理' },
      { id: 'water-supply', name: '供水工程' },
      { id: 'water-reuse', name: '中水回用' },
      { id: 'desalination', name: '海水淡化' },
      { id: 'solid-waste', name: '固废处理' },
      { id: 'hazardous-waste', name: '危废处置' },
      { id: 'sludge', name: '污泥处理' },
      { id: 'garbage-incineration', name: '垃圾焚烧发电' },
      { id: 'soil-remediation', name: '土壤修复' },
      { id: 'air-treatment', name: '大气治理' },
      { id: 'voc', name: 'VOC 治理' },
      { id: 'dust-removal', name: '除尘脱硫脱硝' },
      { id: 'environmental-monitoring', name: '环境监测' },
      { id: 'river-treatment', name: '河道治理' },
      { id: 'sponge-city', name: '海绵城市' },
      { id: 'pipe-network', name: '管网工程' },
      { id: 'environmental-equipment', name: '环保设备' },
      { id: 'carbon-neutral', name: '双碳服务' }
    ]
  },
  {
    id: 'transport-infrastructure',
    name: '交通基建',
    icon: '🚧',
    subs: [
      { id: 'highway', name: '高速公路' },
      { id: 'railway', name: '铁路工程' },
      { id: 'subway', name: '城市轨道交通' },
      { id: 'bridge', name: '桥梁工程' },
      { id: 'tunnel', name: '隧道工程' },
      { id: 'airport', name: '机场建设' },
      { id: 'municipal-road', name: '市政道路' },
      { id: 'traffic-safety', name: '交通安全设施' },
      { id: 'road-maintenance', name: '公路养护' },
      { id: 'asphalt', name: '沥青路面' },
      { id: 'traffic-signal', name: '交通信号' },
      { id: 'parking-facility', name: '停车场设施' },
      { id: 'charging-network', name: '充电网络' },
      { id: 'smart-transport', name: '智慧交通' },
      { id: 'utility-corridor', name: '综合管廊' }
    ]
  },
  {
    id: 'municipal-engineering',
    name: '市政工程',
    icon: '🏙️',
    subs: [
      { id: 'road-project', name: '道路工程' },
      { id: 'water-drainage', name: '给排水' },
      { id: 'heating', name: '供热工程' },
      { id: 'gas-pipeline', name: '燃气工程' },
      { id: 'landscaping', name: '园林绿化' },
      { id: 'lighting', name: '城市照明' },
      { id: 'municipal-bridge', name: '市政桥梁' },
      { id: 'municipal-pipe', name: '市政管网' },
      { id: 'pipe-jacking', name: '顶管工程' },
      { id: 'underground-corridor', name: '地下管廊' },
      { id: 'sanitation', name: '环卫工程' },
      { id: 'square-park', name: '广场公园' },
      { id: 'old-community', name: '老旧小区改造' },
      { id: 'demolition', name: '拆迁工程' }
    ]
  },
  {
    id: 'water-conservancy',
    name: '水利工程',
    icon: '💧',
    subs: [
      { id: 'reservoir', name: '水库工程' },
      { id: 'dam', name: '大坝工程' },
      { id: 'flood-control', name: '防洪工程' },
      { id: 'irrigation', name: '灌溉工程' },
      { id: 'water-diversion', name: '引水调水' },
      { id: 'river-dredging', name: '河道疏浚' },
      { id: 'pumping-station', name: '泵站建设' },
      { id: 'groundwater', name: '地下水治理' },
      { id: 'hydraulic-monitor', name: '水利监测' },
      { id: 'hydraulic-equipment', name: '水工设备' },
      { id: 'soil-water-conservation', name: '水土保持' },
      { id: 'rural-water', name: '农村饮水安全' },
      { id: 'levee', name: '堤防工程' },
      { id: 'hydro-power-station', name: '水电站建设' }
    ]
  },
  {
    id: 'metallurgy-mining',
    name: '冶金矿山',
    icon: '⛏️',
    subs: [
      { id: 'iron-steel', name: '钢铁' },
      { id: 'nonferrous', name: '有色金属' },
      { id: 'aluminum', name: '铝业' },
      { id: 'copper', name: '铜业' },
      { id: 'rare-earth', name: '稀土' },
      { id: 'precious-metal', name: '贵金属' },
      { id: 'coal-mining', name: '煤矿' },
      { id: 'metal-mining', name: '金属矿开采' },
      { id: 'nonmetal-mining', name: '非金属矿' },
      { id: 'mineral-processing', name: '选矿' },
      { id: 'smelting', name: '冶炼' },
      { id: 'rolling', name: '轧钢' },
      { id: 'scrap-recycling', name: '废钢回收' },
      { id: 'mine-equipment', name: '矿山机械' },
      { id: 'mine-safety', name: '矿山安全' },
      { id: 'tailings', name: '尾矿处理' }
    ]
  },
  {
    id: 'building-materials',
    name: '建材',
    icon: '🧱',
    subs: [
      { id: 'cement', name: '水泥' },
      { id: 'concrete', name: '混凝土' },
      { id: 'ready-mix', name: '预拌砂浆' },
      { id: 'steel-structure', name: '钢结构' },
      { id: 'glass', name: '玻璃' },
      { id: 'ceramic', name: '建筑陶瓷' },
      { id: 'stone', name: '石材' },
      { id: 'waterproof', name: '防水材料' },
      { id: 'thermal-insulation', name: '保温材料' },
      { id: 'pipe-material', name: '管材' },
      { id: 'door-window', name: '门窗幕墙' },
      { id: 'architectural-coating', name: '建筑涂料' },
      { id: 'gypsum', name: '石膏板' },
      { id: 'brick', name: '砖瓦砌块' },
      { id: 'aluminum-profile', name: '铝型材' },
      { id: 'decoration-material', name: '装饰材料' }
    ]
  },
  {
    id: 'automobile',
    name: '汽车',
    icon: '🚗',
    subs: [
      { id: 'complete-vehicle', name: '整车制造' },
      { id: 'auto-parts', name: '汽车零部件' },
      { id: 'new-energy-vehicle', name: '新能源汽车' },
      { id: 'charging-swap', name: '充换电设施' },
      { id: 'auto-sales', name: '汽车销售' },
      { id: 'used-car', name: '二手车' },
      { id: 'auto-repair', name: '汽车维修' },
      { id: 'auto-beauty', name: '汽车美容' },
      { id: 'tire', name: '轮胎' },
      { id: 'auto-electronics', name: '汽车电子' },
      { id: 'autonomous-driving', name: '智能驾驶' },
      { id: 'auto-leasing', name: '汽车租赁' },
      { id: 'commercial-vehicle', name: '商用车' },
      { id: 'motorcycle', name: '摩托车' },
      { id: 'battery-recycling', name: '动力电池回收' },
      { id: 'auto-aftermarket', name: '汽车后市场' }
    ]
  },
  {
    id: 'electronic-information',
    name: '电子信息',
    icon: '💻',
    subs: [
      { id: 'display', name: '显示面板' },
      { id: 'led', name: 'LED' },
      { id: 'pcb', name: '印制电路板' },
      { id: 'electronic-components', name: '电子元器件' },
      { id: 'connector', name: '连接器' },
      { id: 'consumer-electronics', name: '消费电子' },
      { id: 'smart-terminal', name: '智能终端' },
      { id: 'instrument', name: '仪器仪表' },
      { id: 'industrial-control', name: '工控设备' },
      { id: 'embedded', name: '嵌入式系统' },
      { id: 'software', name: '软件开发' },
      { id: 'information-security', name: '信息安全' },
      { id: 'big-data', name: '大数据' },
      { id: 'iot', name: '物联网' },
      { id: 'artificial-intelligence', name: '人工智能' },
      { id: 'blockchain', name: '区块链' },
      { id: 'system-integration', name: '系统集成' },
      { id: 'smart-city', name: '智慧城市' }
    ]
  },
  {
    id: 'semiconductor',
    name: '半导体',
    icon: '🔌',
    subs: [
      { id: 'wafer', name: '晶圆制造' },
      { id: 'chip-design', name: '芯片设计' },
      { id: 'packaging-testing', name: '封装测试' },
      { id: 'semiconductor-equipment', name: '半导体设备' },
      { id: 'lithography', name: '光刻设备' },
      { id: 'semiconductor-material', name: '半导体材料' },
      { id: 'silicon-wafer', name: '硅片' },
      { id: 'photoresist', name: '光刻胶' },
      { id: 'electronic-gas', name: '电子特气' },
      { id: 'power-semiconductor', name: '功率半导体' },
      { id: 'analog-chip', name: '模拟芯片' },
      { id: 'silicon-carbide', name: '碳化硅' },
      { id: 'third-gen', name: '第三代半导体' },
      { id: 'sensor-chip', name: '传感器芯片' },
      { id: 'storage-chip', name: '存储芯片' }
    ]
  },
  {
    id: 'communication',
    name: '通信',
    icon: '📡',
    subs: [
      { id: '5g', name: '5G 建设' },
      { id: 'optical-fiber', name: '光纤光缆' },
      { id: 'base-station', name: '基站建设' },
      { id: 'communication-tower', name: '通信铁塔' },
      { id: 'network-optimization', name: '网络优化' },
      { id: 'data-communication', name: '数据通信' },
      { id: 'satellite', name: '卫星通信' },
      { id: 'quantum-communication', name: '量子通信' },
      { id: 'radio-management', name: '无线电管理' },
      { id: 'communication-pipeline', name: '通信管线' },
      { id: 'communication-terminal', name: '通信终端' },
      { id: 'communication-room', name: '通信机房' },
      { id: 'private-network', name: '专网通信' },
      { id: 'communication-service', name: '通信服务' }
    ]
  },
  {
    id: 'healthcare',
    name: '医疗健康',
    icon: '🏥',
    subs: [
      { id: 'hospital', name: '医院建设' },
      { id: 'medical-device', name: '医疗器械' },
      { id: 'medical-equipment', name: '医疗设备' },
      { id: 'medical-consumables', name: '医用耗材' },
      { id: 'ivd', name: '体外诊断' },
      { id: 'rehabilitation', name: '康复医疗' },
      { id: 'elderly-care', name: '养老照护' },
      { id: 'health-management', name: '健康管理' },
      { id: 'telemedicine', name: '互联网医疗' },
      { id: 'tcm', name: '中医药' },
      { id: 'medical-informatization', name: '医疗信息化' },
      { id: 'medical-gas', name: '医用气体' },
      { id: 'laboratory', name: '实验室建设' },
      { id: 'disinfection', name: '消毒感控' },
      { id: 'ophthalmic-dental', name: '眼科口腔' },
      { id: 'medical-textile', name: '医用纺织' }
    ]
  },
  {
    id: 'biomedicine',
    name: '生物医药',
    icon: '🧬',
    subs: [
      { id: 'chemical-drug', name: '化学药' },
      { id: 'biological-drug', name: '生物药' },
      { id: 'vaccine', name: '疫苗' },
      { id: 'antibody', name: '抗体药物' },
      { id: 'cell-therapy', name: '细胞治疗' },
      { id: 'gene-therapy', name: '基因治疗' },
      { id: 'traditional-medicine', name: '中药' },
      { id: 'api', name: '原料药' },
      { id: 'cdmo', name: 'CDMO' },
      { id: 'clinical-trial', name: '临床试验' },
      { id: 'reagent', name: '诊断试剂' },
      { id: 'biotech-service', name: '生物技术服务' },
      { id: 'fermentation', name: '发酵工程' },
      { id: 'medical-packaging', name: '医药包装' },
      { id: 'medical-cold-chain', name: '医药冷链' }
    ]
  },
  {
    id: 'agriculture',
    name: '农业',
    icon: '🌾',
    subs: [
      { id: 'planting', name: '种植业' },
      { id: 'grain', name: '粮食' },
      { id: 'vegetable', name: '蔬菜' },
      { id: 'fruit', name: '水果' },
      { id: 'greenhouse', name: '设施农业' },
      { id: 'seed', name: '种业' },
      { id: 'fertilizer', name: '肥料' },
      { id: 'pesticide', name: '农药' },
      { id: 'agricultural-machinery', name: '农机' },
      { id: 'farmland-irrigation', name: '农田灌溉' },
      { id: 'livestock', name: '畜牧养殖' },
      { id: 'poultry', name: '家禽' },
      { id: 'aquaculture', name: '水产养殖' },
      { id: 'agricultural-processing', name: '农产品加工' },
      { id: 'smart-agriculture', name: '智慧农业' },
      { id: 'agricultural-base', name: '农业基地' },
      { id: 'land-transfer', name: '土地流转' },
      { id: 'agricultural-service', name: '农事服务' }
    ]
  },
  {
    id: 'forestry',
    name: '林业',
    icon: '🌳',
    subs: [
      { id: 'afforestation', name: '造林绿化' },
      { id: 'nursery', name: '苗木花卉' },
      { id: 'forest-management', name: '森林经营' },
      { id: 'forestry-economy', name: '林下经济' },
      { id: 'timber', name: '木材加工' },
      { id: 'bamboo', name: '竹产业' },
      { id: 'forest-products', name: '林产品' },
      { id: 'forest-tourism', name: '森林旅游' },
      { id: 'forest-fire', name: '森林防火' },
      { id: 'pest-control', name: '林业有害生物防治' },
      { id: 'wetland', name: '湿地保护' },
      { id: 'desertification', name: '防沙治沙' },
      { id: 'forest-carbon-sink', name: '林业碳汇' }
    ]
  },
  {
    id: 'fishery',
    name: '渔业',
    icon: '🐟',
    subs: [
      { id: 'marine-fishing', name: '海洋捕捞' },
      { id: 'mariculture', name: '海水养殖' },
      { id: 'freshwater-aquaculture', name: '淡水养殖' },
      { id: 'aquatic-seedling', name: '水产种苗' },
      { id: 'aquatic-feed', name: '水产饲料' },
      { id: 'aquatic-processing', name: '水产品加工' },
      { id: 'cold-storage', name: '冷库仓储' },
      { id: 'fishing-port', name: '渔港建设' },
      { id: 'aquaculture-equipment', name: '养殖设备' },
      { id: 'deep-sea-aquaculture', name: '深远海养殖' },
      { id: 'aquatic-health', name: '水产动保' },
      { id: 'leisure-fishery', name: '休闲渔业' },
      { id: 'fishery-brand', name: '渔业品牌' }
    ]
  },
  {
    id: 'food',
    name: '食品',
    icon: '🍜',
    subs: [
      { id: 'grain-oil', name: '粮油加工' },
      { id: 'meat', name: '肉制品' },
      { id: 'dairy', name: '乳制品' },
      { id: 'beverage', name: '饮料' },
      { id: 'liquor', name: '酒类' },
      { id: 'snack', name: '休闲食品' },
      { id: 'condiment', name: '调味品' },
      { id: 'bakery', name: '烘焙' },
      { id: 'frozen-food', name: '速冻食品' },
      { id: 'prepared-food', name: '预制菜' },
      { id: 'health-food', name: '保健食品' },
      { id: 'food-additive', name: '食品添加剂' },
      { id: 'food-packaging', name: '食品包装' },
      { id: 'food-testing', name: '食品检测' },
      { id: 'catering-supply-chain', name: '餐饮供应链' }
    ]
  },
  {
    id: 'cultural-tourism',
    name: '文旅',
    icon: '🎭',
    subs: [
      { id: 'scenic-spot', name: '景区运营' },
      { id: 'theme-park', name: '主题乐园' },
      { id: 'cultural-park', name: '文化产业园' },
      { id: 'rural-tourism', name: '乡村旅游' },
      { id: 'red-tourism', name: '红色旅游' },
      { id: 'homestay', name: '民宿' },
      { id: 'travel-agency', name: '旅行社' },
      { id: 'performing-arts', name: '演艺演出' },
      { id: 'museum', name: '博物馆' },
      { id: 'intangible-heritage', name: '非遗文创' },
      { id: 'film-base', name: '影视基地' },
      { id: 'camping', name: '露营基地' },
      { id: 'hot-spring', name: '温泉度假' },
      { id: 'sports-tourism', name: '体育旅游' },
      { id: 'tourism-planning', name: '旅游规划' },
      { id: 'smart-tourism', name: '智慧文旅' }
    ]
  },
  {
    id: 'hotel',
    name: '酒店',
    icon: '🏨',
    subs: [
      { id: 'star-hotel', name: '星级酒店' },
      { id: 'chain-hotel', name: '连锁酒店' },
      { id: 'budget-hotel', name: '经济型酒店' },
      { id: 'boutique-hotel', name: '精品酒店' },
      { id: 'resort', name: '度假酒店' },
      { id: 'serviced-apartment', name: '服务式公寓' },
      { id: 'hotel-management', name: '酒店管理' },
      { id: 'hotel-supplies', name: '酒店用品' },
      { id: 'hotel-decoration', name: '酒店装修' },
      { id: 'hotel-catering', name: '餐饮服务' },
      { id: 'conference-banquet', name: '会议宴会' },
      { id: 'hotel-investment', name: '酒店投资' },
      { id: 'homestay-operation', name: '民宿运营' },
      { id: 'hotel-renovation', name: '酒店改造' }
    ]
  },
  {
    id: 'education',
    name: '教育',
    icon: '🎓',
    subs: [
      { id: 'k12', name: 'K12 教育' },
      { id: 'vocational-education', name: '职业教育' },
      { id: 'higher-education', name: '高等教育' },
      { id: 'preschool', name: '学前教育' },
      { id: 'training-institution', name: '培训机构' },
      { id: 'online-education', name: '在线教育' },
      { id: 'language-training', name: '语言培训' },
      { id: 'art-education', name: '艺术教育' },
      { id: 'sports-education', name: '体育教育' },
      { id: 'stem-education', name: '科技教育' },
      { id: 'enterprise-training', name: '企业培训' },
      { id: 'certification', name: '资格认证' },
      { id: 'study-abroad', name: '留学服务' },
      { id: 'education-equipment', name: '教育装备' },
      { id: 'campus-construction', name: '校园建设' },
      { id: 'teacher-training', name: '师资培训' }
    ]
  },
  {
    id: 'finance',
    name: '金融',
    icon: '🏦',
    subs: [
      { id: 'bank', name: '银行' },
      { id: 'securities', name: '证券' },
      { id: 'insurance', name: '保险' },
      { id: 'trust', name: '信托' },
      { id: 'fund', name: '基金' },
      { id: 'factoring', name: '保理' },
      { id: 'guarantee', name: '担保' },
      { id: 'microfinance', name: '小额贷款' },
      { id: 'pawn', name: '典当' },
      { id: 'financial-leasing', name: '金融租赁' },
      { id: 'asset-management', name: '资产管理' },
      { id: 'payment', name: '支付结算' },
      { id: 'fintech', name: '金融科技' },
      { id: 'credit-rating', name: '信用评级' },
      { id: 'amc', name: '不良资产' },
      { id: 'rural-finance', name: '农村金融' }
    ]
  },
  {
    id: 'investment',
    name: '投资',
    icon: '💰',
    subs: [
      { id: 'equity-investment', name: '股权投资' },
      { id: 'industrial-investment', name: '产业投资' },
      { id: 'financial-investment', name: '财务投资' },
      { id: 'ma', name: '并购' },
      { id: 'strategic-investment', name: '战略投资' },
      { id: 'vc', name: '风险投资' },
      { id: 'pe', name: '私募股权' },
      { id: 'government-fund', name: '政府引导基金' },
      { id: 'industrial-fund', name: '产业基金' },
      { id: 'real-estate-investment', name: '房地产投资' },
      { id: 'project-investment', name: '项目投资' },
      { id: 'angel-investment', name: '天使投资' },
      { id: 'cross-border-investment', name: '跨境投资' },
      { id: 'investment-advisory', name: '投资顾问' }
    ]
  },
  {
    id: 'commerce-logistics',
    name: '商贸物流',
    icon: '🚚',
    subs: [
      { id: 'wholesale', name: '批发贸易' },
      { id: 'retail', name: '零售' },
      { id: 'e-commerce', name: '电子商务' },
      { id: 'cross-border-ecommerce', name: '跨境电商' },
      { id: 'import-export', name: '进出口贸易' },
      { id: 'distribution', name: '分销代理' },
      { id: 'cold-chain-logistics', name: '冷链物流' },
      { id: 'third-party-logistics', name: '第三方物流' },
      { id: 'express', name: '快递快运' },
      { id: 'line-haul', name: '干线运输' },
      { id: 'city-distribution', name: '城市配送' },
      { id: 'logistics-park', name: '物流园区' },
      { id: 'supply-chain', name: '供应链管理' },
      { id: 'bulk-trade', name: '大宗贸易' },
      { id: 'customs-declaration', name: '报关报检' }
    ]
  },
  {
    id: 'warehousing',
    name: '仓储',
    icon: '📦',
    subs: [
      { id: 'general-warehouse', name: '普通仓库' },
      { id: 'bonded-warehouse', name: '保税仓' },
      { id: 'cold-warehouse', name: '冷库' },
      { id: 'hazardous-warehouse', name: '危化品仓' },
      { id: 'automated-warehouse', name: '智能立体库' },
      { id: 'warehouse-rental', name: '仓库租赁' },
      { id: 'warehouse-construction', name: '仓储建设' },
      { id: 'warehouse-equipment', name: '仓储设备' },
      { id: 'inventory-management', name: '库存管理' },
      { id: 'cloud-warehouse', name: '云仓' },
      { id: 'grain-storage', name: '粮食仓储' },
      { id: 'warehouse-finance', name: '仓单质押' }
    ]
  },
  {
    id: 'port-shipping',
    name: '港口航运',
    icon: '🚢',
    subs: [
      { id: 'port-construction', name: '港口建设' },
      { id: 'port-operation', name: '港口运营' },
      { id: 'container', name: '集装箱' },
      { id: 'bulk-cargo', name: '散货运输' },
      { id: 'shipping-company', name: '航运公司' },
      { id: 'shipbuilding', name: '船舶制造' },
      { id: 'ship-repair', name: '船舶维修' },
      { id: 'dredging', name: '航道疏浚' },
      { id: 'port-machinery', name: '港机设备' },
      { id: 'pilotage', name: '引航拖轮' },
      { id: 'shipping-agency', name: '船代货代' },
      { id: 'river-transport', name: '内河航运' },
      { id: 'marine-service', name: '海事服务' }
    ]
  },
  {
    id: 'aviation',
    name: '航空',
    icon: '✈️',
    subs: [
      { id: 'airline', name: '航空公司' },
      { id: 'airport-operation', name: '机场运营' },
      { id: 'general-aviation', name: '通用航空' },
      { id: 'aviation-logistics', name: '航空物流' },
      { id: 'aircraft-maintenance', name: '飞机维修' },
      { id: 'aviation-parts', name: '航空零部件' },
      { id: 'aviation-fuel', name: '航空燃油' },
      { id: 'aviation-training', name: '航空培训' },
      { id: 'ground-service', name: '地面服务' },
      { id: 'low-altitude-economy', name: '低空经济' },
      { id: 'evtol', name: 'eVTOL' },
      { id: 'aviation-catering', name: '航空食品' },
      { id: 'air-traffic', name: '空管服务' }
    ]
  },
  {
    id: 'textile-apparel',
    name: '纺织服装',
    icon: '👕',
    subs: [
      { id: 'spinning', name: '棉纺' },
      { id: 'weaving', name: '织造' },
      { id: 'dyeing', name: '印染' },
      { id: 'garment', name: '服装制造' },
      { id: 'home-textile', name: '家纺' },
      { id: 'nonwoven', name: '无纺布' },
      { id: 'chemical-fiber', name: '化纤' },
      { id: 'wool', name: '毛纺' },
      { id: 'silk', name: '丝绸' },
      { id: 'knitwear', name: '针织' },
      { id: 'apparel-brand', name: '服装品牌' },
      { id: 'textile-equipment', name: '纺织机械' },
      { id: 'apparel-accessories', name: '辅料配饰' },
      { id: 'smart-textile', name: '智能纺织' },
      { id: 'digital-printing', name: '数码印花' }
    ]
  },
  {
    id: 'home-appliance',
    name: '家电',
    icon: '📺',
    subs: [
      { id: 'white-goods', name: '白色家电' },
      { id: 'kitchen-appliance', name: '厨房电器' },
      { id: 'small-appliance', name: '小家电' },
      { id: 'air-conditioner', name: '空调' },
      { id: 'refrigerator', name: '冰箱' },
      { id: 'washing-machine', name: '洗衣机' },
      { id: 'water-heater', name: '热水器' },
      { id: 'smart-appliance', name: '智能家电' },
      { id: 'appliance-parts', name: '家电配件' },
      { id: 'appliance-sales', name: '家电销售' },
      { id: 'appliance-repair', name: '家电维修' },
      { id: 'commercial-appliance', name: '商用电器' },
      { id: 'water-purifier', name: '净水净化' },
      { id: 'appliance-mold', name: '家电模具' }
    ]
  },
  {
    id: 'furniture',
    name: '家具',
    icon: '🪑',
    subs: [
      { id: 'solid-wood', name: '实木家具' },
      { id: 'panel-furniture', name: '板式家具' },
      { id: 'office-furniture', name: '办公家具' },
      { id: 'hotel-furniture', name: '酒店家具' },
      { id: 'custom-furniture', name: '定制家居' },
      { id: 'sofa', name: '软体家具' },
      { id: 'mattress', name: '床垫' },
      { id: 'hardware', name: '五金配件' },
      { id: 'artificial-board', name: '人造板' },
      { id: 'furniture-paint', name: '家具漆' },
      { id: 'woodworking-machinery', name: '木工机械' },
      { id: 'furniture-sales', name: '家具销售' },
      { id: 'smart-furniture', name: '智能家具' },
      { id: 'outdoor-furniture', name: '户外家具' }
    ]
  },
  {
    id: 'paper-printing',
    name: '造纸印刷',
    icon: '📄',
    subs: [
      { id: 'pulp', name: '制浆' },
      { id: 'paper-making', name: '造纸' },
      { id: 'packaging-printing', name: '包装印刷' },
      { id: 'label-printing', name: '标签印刷' },
      { id: 'book-printing', name: '书刊印刷' },
      { id: 'digital-printing-press', name: '数码印刷' },
      { id: 'carton', name: '纸箱纸盒' },
      { id: 'tissue', name: '生活用纸' },
      { id: 'specialty-paper', name: '特种纸' },
      { id: 'printing-equipment', name: '印刷设备' },
      { id: 'ink', name: '油墨' },
      { id: 'paper-recycling', name: '废纸回收' }
    ]
  },
  {
    id: 'rubber-plastic',
    name: '橡胶塑料',
    icon: '🧴',
    subs: [
      { id: 'rubber-products', name: '橡胶制品' },
      { id: 'tire-rubber', name: '轮胎制造' },
      { id: 'plastic-products', name: '塑料制品' },
      { id: 'plastic-pipe', name: '塑料管道' },
      { id: 'plastic-film', name: '塑料薄膜' },
      { id: 'injection-molding', name: '注塑加工' },
      { id: 'blow-molding', name: '吹塑加工' },
      { id: 'modified-plastic', name: '改性塑料' },
      { id: 'rubber-machinery', name: '橡塑机械' },
      { id: 'plastic-mold', name: '塑料模具' },
      { id: 'recycled-plastic', name: '再生塑料' },
      { id: 'silicone', name: '硅胶制品' }
    ]
  },
  {
    id: 'new-materials',
    name: '新材料',
    icon: '🧪',
    subs: [
      { id: 'new-energy-material', name: '新能源材料' },
      { id: 'alloy', name: '合金材料' },
      { id: 'composite', name: '复合材料' },
      { id: 'carbon-fiber', name: '碳纤维' },
      { id: 'graphene', name: '石墨烯' },
      { id: 'nanomaterial', name: '纳米材料' },
      { id: 'advanced-ceramic', name: '先进陶瓷' },
      { id: 'functional-film', name: '功能薄膜' },
      { id: 'rare-earth-material', name: '稀土材料' },
      { id: 'polymer-material', name: '高分子材料' },
      { id: 'metal-powder', name: '金属粉末' },
      { id: 'superconducting', name: '超导材料' },
      { id: '3d-printing-material', name: '3D 打印材料' },
      { id: 'new-building-material', name: '新型建材' }
    ]
  },
  {
    id: 'defense',
    name: '军工',
    icon: '🛡️',
    subs: [
      { id: 'aerospace', name: '航空航天' },
      { id: 'weapon', name: '武器装备' },
      { id: 'military-electronics', name: '军用电子' },
      { id: 'military-communication', name: '军用通信' },
      { id: 'radar', name: '雷达系统' },
      { id: 'satellite-application', name: '卫星应用' },
      { id: 'military-vehicle', name: '军用车辆' },
      { id: 'military-ship', name: '军用舰船' },
      { id: 'military-material', name: '军工材料' },
      { id: 'equipment-support', name: '装备保障' },
      { id: 'military-software', name: '军工软件' },
      { id: 'security-equipment', name: '安防装备' },
      { id: 'simulation', name: '仿真测试' },
      { id: 'military-standard', name: '军标认证' }
    ]
  },
  {
    id: 'public-service',
    name: '公共服务',
    icon: '🏛️',
    subs: [
      { id: 'government-service', name: '政务服务' },
      { id: 'smart-government', name: '智慧政务' },
      { id: 'community-service', name: '社区服务' },
      { id: 'social-work', name: '社会工作' },
      { id: 'elderly-service', name: '养老服务' },
      { id: 'disability-service', name: '残疾人服务' },
      { id: 'public-safety', name: '公共安全' },
      { id: 'emergency-management', name: '应急管理' },
      { id: 'fire-protection', name: '消防服务' },
      { id: 'city-management', name: '城市管理' },
      { id: 'public-culture', name: '公共文化' },
      { id: 'sports-facility', name: '体育设施' },
      { id: 'public-health', name: '公共卫生' },
      { id: 'charity', name: '公益慈善' }
    ]
  },
  {
    id: 'consulting',
    name: '咨询服务',
    icon: '💼',
    subs: [
      { id: 'management-consulting', name: '管理咨询' },
      { id: 'engineering-consulting', name: '工程咨询' },
      { id: 'cost-consulting', name: '造价咨询' },
      { id: 'design-consulting', name: '设计咨询' },
      { id: 'supervision', name: '工程监理' },
      { id: 'bidding-agency', name: '招标代理' },
      { id: 'legal-service', name: '法律服务' },
      { id: 'accounting', name: '会计审计' },
      { id: 'tax-service', name: '税务服务' },
      { id: 'hr-service', name: '人力资源' },
      { id: 'intellectual-property', name: '知识产权' },
      { id: 'brand-marketing', name: '品牌营销' },
      { id: 'market-research', name: '市场调研' },
      { id: 'certification-service', name: '认证服务' },
      { id: 'esg-consulting', name: 'ESG 咨询' },
      { id: 'it-consulting', name: 'IT 咨询' }
    ]
  },
  {
    id: 'other',
    name: '其他',
    icon: '🗂️',
    subs: [
      { id: 'other-project', name: '其他项目' },
      { id: 'other-trade', name: '其他贸易' },
      { id: 'other-service', name: '其他服务' },
      { id: 'other-investment', name: '其他投资' },
      { id: 'other-product', name: '其他产品' }
    ]
  }
]

/* ------------------------------------------------------------------ *
 * 2. PROJECT_TYPES —— 项目类型
 * ------------------------------------------------------------------ */

export const PROJECT_TYPES = [
  { id: 'investment', name: '投资', desc: '投资合作大类，包含股权投资、产业投资、财务投资、并购、战略投资等' },
  { id: 'equity-investment', name: '股权投资', desc: '以取得目标企业股权的方式出资，按持股比例享有权益' },
  { id: 'industrial-investment', name: '产业投资', desc: '围绕产业链上下游开展的实体产业投资，注重产业协同与落地' },
  { id: 'financial-investment', name: '财务投资', desc: '以财务回报为主要目标，通常不参与标的日常经营' },
  { id: 'ma', name: '并购', desc: '收购或兼并标的公司股权、资产，取得控制权或并表' },
  { id: 'strategic-investment', name: '战略投资', desc: '以战略协同、资源互补为目的的长期投资' },
  { id: 'financing', name: '融资', desc: '项目或企业引入资金，含股权融资与债权融资' },
  { id: 'epc', name: 'EPC', desc: '工程总承包（Engineering Procurement Construction），设计、采购、施工一体化交付' },
  { id: 'emc', name: 'EMC', desc: '合同能源管理（Energy Management Contract），由节能服务方投资改造并以节能效益分享回收投资' },
  { id: 'transfer', name: '转让', desc: '项目、股权、资产或经营权的整体/部分转让' },
  { id: 'financial-leasing', name: '融资租赁', desc: '以租赁形式实现融资，含直租与售后回租' },
  { id: 'procurement', name: '采购', desc: '设备、材料、服务的采购需求' },
  { id: 'bidding', name: '招投标', desc: '依法或依约开展的招标、投标、开标、评标等交易活动' },
  { id: 'supply-chain-finance', name: '供应链金融', desc: '围绕核心企业信用，为上下游提供应收账款、订单、仓单等融资服务' },
  { id: 'commissioned-processing', name: '委托加工', desc: '委托他方按约定标准加工生产，委托方提供原料或技术' },
  { id: 'joint-development', name: '合作开发', desc: '多方共同出资、共担风险、共享收益地开发同一项目' },
  { id: 'technology-cooperation', name: '技术合作', desc: '技术引进、联合研发、成果转化等合作形式' },
  { id: 'franchise', name: '招商加盟', desc: '品牌方招商，加盟商付费取得品牌与经营体系授权' },
  { id: 'other', name: '其他', desc: '其他未列明的项目类型' }
]

/* ------------------------------------------------------------------ *
 * 3. TRADE_TYPES —— 贸易（采供）类型
 * ------------------------------------------------------------------ */

export const TRADE_TYPES = [
  { id: 'procurement', name: '采购', desc: '买方发布采购需求，寻找货源与供应商' },
  { id: 'supply', name: '供应', desc: '卖方发布供应能力与货源信息' },
  { id: 'commissioned-processing', name: '委托加工', desc: '提供原料或半成品委托他方加工，按约定标准交付' },
  { id: 'inquiry', name: '询价', desc: '就规格、数量、交期进行价格征询与比价' },
  { id: 'bidding-procurement', name: '招标采购', desc: '以招标方式开展的集中采购与竞价' },
  { id: 'inventory', name: '库存尾货', desc: '库存、尾货、清仓物资的低价处置与收购' },
  { id: 'agency', name: '代理经销', desc: '品牌代理、区域经销与渠道分销合作' },
  { id: 'logistics-warehousing', name: '物流仓储', desc: '运输、配送、仓储及供应链配套服务' }
]

/* ------------------------------------------------------------------ *
 * 4. EVENT_TYPES —— 活动类型
 * ------------------------------------------------------------------ */

export const EVENT_TYPES = [
  { id: 'competition', name: '赛事', icon: '🏆' },
  { id: 'course', name: '课程', icon: '📚' },
  { id: 'training', name: '培训', icon: '🎯' },
  { id: 'forum', name: '论坛', icon: '💬' },
  { id: 'summit', name: '峰会', icon: '🎤' },
  { id: 'exhibition', name: '展会', icon: '🏢' },
  { id: 'roadshow', name: '路演', icon: '🚀' },
  { id: 'salon', name: '沙龙', icon: '☕' },
  { id: 'investment-promotion', name: '招商会', icon: '📢' },
  { id: 'press-conference', name: '发布会', icon: '📣' },
  { id: 'public-welfare', name: '公益活动', icon: '❤️' },
  { id: 'business-promotion', name: '业务推广', icon: '📈' },
  { id: 'other', name: '其他', icon: '📌' }
]

/* ------------------------------------------------------------------ *
 * 5. CATEGORIES —— 三大板块
 * ------------------------------------------------------------------ */

export const CATEGORIES = [
  { id: 'project', name: '项目', icon: '📁', types: PROJECT_TYPES },
  { id: 'event', name: '活动', icon: '🎪', types: EVENT_TYPES },
  { id: 'trade', name: '贸易', icon: '🤝', types: TRADE_TYPES }
]

/* ------------------------------------------------------------------ *
 * 6. CITIES —— 中国 34 个省级行政区及地级行政区
 * ------------------------------------------------------------------ */

export const CITIES = [
  {
    id: 'beijing',
    name: '北京市',
    short: '北京',
    region: '华北',
    cities: [
      { id: 'dongcheng', name: '东城区' },
      { id: 'xicheng', name: '西城区' },
      { id: 'chaoyang', name: '朝阳区' },
      { id: 'fengtai', name: '丰台区' },
      { id: 'shijingshan', name: '石景山区' },
      { id: 'haidian', name: '海淀区' },
      { id: 'mentougou', name: '门头沟区' },
      { id: 'fangshan', name: '房山区' },
      { id: 'tongzhou', name: '通州区' },
      { id: 'shunyi', name: '顺义区' },
      { id: 'changping', name: '昌平区' },
      { id: 'daxing', name: '大兴区' },
      { id: 'huairou', name: '怀柔区' },
      { id: 'pinggu', name: '平谷区' },
      { id: 'miyun', name: '密云区' },
      { id: 'yanqing', name: '延庆区' }
    ]
  },
  {
    id: 'tianjin',
    name: '天津市',
    short: '天津',
    region: '华北',
    cities: [
      { id: 'heping', name: '和平区' },
      { id: 'hedong', name: '河东区' },
      { id: 'hexi', name: '河西区' },
      { id: 'nankai', name: '南开区' },
      { id: 'hebei', name: '河北区' },
      { id: 'hongqiao', name: '红桥区' },
      { id: 'dongli', name: '东丽区' },
      { id: 'xiqing', name: '西青区' },
      { id: 'jinnan', name: '津南区' },
      { id: 'beichen', name: '北辰区' },
      { id: 'wuqing', name: '武清区' },
      { id: 'baodi', name: '宝坻区' },
      { id: 'binhai', name: '滨海新区' },
      { id: 'ninghe', name: '宁河区' },
      { id: 'jinghai', name: '静海区' },
      { id: 'jizhou', name: '蓟州区' }
    ]
  },
  {
    id: 'hebei',
    name: '河北省',
    short: '河北',
    region: '华北',
    cities: [
      { id: 'shijiazhuang', name: '石家庄市' },
      { id: 'tangshan', name: '唐山市' },
      { id: 'qinhuangdao', name: '秦皇岛市' },
      { id: 'handan', name: '邯郸市' },
      { id: 'xingtai', name: '邢台市' },
      { id: 'baoding', name: '保定市' },
      { id: 'zhangjiakou', name: '张家口市' },
      { id: 'chengde', name: '承德市' },
      { id: 'cangzhou', name: '沧州市' },
      { id: 'langfang', name: '廊坊市' },
      { id: 'hengshui', name: '衡水市' }
    ]
  },
  {
    id: 'shanxi',
    name: '山西省',
    short: '山西',
    region: '华北',
    cities: [
      { id: 'taiyuan', name: '太原市' },
      { id: 'datong', name: '大同市' },
      { id: 'yangquan', name: '阳泉市' },
      { id: 'changzhi', name: '长治市' },
      { id: 'jincheng', name: '晋城市' },
      { id: 'shuozhou', name: '朔州市' },
      { id: 'jinzhong', name: '晋中市' },
      { id: 'yuncheng', name: '运城市' },
      { id: 'xinzhou', name: '忻州市' },
      { id: 'linfen', name: '临汾市' },
      { id: 'lvliang', name: '吕梁市' }
    ]
  },
  {
    id: 'inner-mongolia',
    name: '内蒙古自治区',
    short: '内蒙古',
    region: '华北',
    cities: [
      { id: 'hohhot', name: '呼和浩特市' },
      { id: 'baotou', name: '包头市' },
      { id: 'wuhai', name: '乌海市' },
      { id: 'chifeng', name: '赤峰市' },
      { id: 'tongliao', name: '通辽市' },
      { id: 'ordos', name: '鄂尔多斯市' },
      { id: 'hulunbuir', name: '呼伦贝尔市' },
      { id: 'bayannur', name: '巴彦淖尔市' },
      { id: 'ulsan', name: '乌兰察布市' },
      { id: 'hinggan', name: '兴安盟' },
      { id: 'xilingol', name: '锡林郭勒盟' },
      { id: 'alxa', name: '阿拉善盟' }
    ]
  },
  {
    id: 'liaoning',
    name: '辽宁省',
    short: '辽宁',
    region: '东北',
    cities: [
      { id: 'shenyang', name: '沈阳市' },
      { id: 'dalian', name: '大连市' },
      { id: 'anshan', name: '鞍山市' },
      { id: 'fushun', name: '抚顺市' },
      { id: 'benxi', name: '本溪市' },
      { id: 'dandong', name: '丹东市' },
      { id: 'jinzhou', name: '锦州市' },
      { id: 'yingkou', name: '营口市' },
      { id: 'fuxin', name: '阜新市' },
      { id: 'liaoyang', name: '辽阳市' },
      { id: 'panjin', name: '盘锦市' },
      { id: 'tieling', name: '铁岭市' },
      { id: 'chaoyang-ln', name: '朝阳市' },
      { id: 'huludao', name: '葫芦岛市' }
    ]
  },
  {
    id: 'jilin',
    name: '吉林省',
    short: '吉林',
    region: '东北',
    cities: [
      { id: 'changchun', name: '长春市' },
      { id: 'jilin-city', name: '吉林市' },
      { id: 'siping', name: '四平市' },
      { id: 'liaoyuan', name: '辽源市' },
      { id: 'tonghua', name: '通化市' },
      { id: 'baishan', name: '白山市' },
      { id: 'songyuan', name: '松原市' },
      { id: 'baicheng', name: '白城市' },
      { id: 'yanbian', name: '延边朝鲜族自治州' }
    ]
  },
  {
    id: 'heilongjiang',
    name: '黑龙江省',
    short: '黑龙江',
    region: '东北',
    cities: [
      { id: 'harbin', name: '哈尔滨市' },
      { id: 'qiqihar', name: '齐齐哈尔市' },
      { id: 'jixi', name: '鸡西市' },
      { id: 'hegang', name: '鹤岗市' },
      { id: 'shuangyashan', name: '双鸭山市' },
      { id: 'daqing', name: '大庆市' },
      { id: 'yichun', name: '伊春市' },
      { id: 'jiamusi', name: '佳木斯市' },
      { id: 'qitaihe', name: '七台河市' },
      { id: 'mudanjiang', name: '牡丹江市' },
      { id: 'heihe', name: '黑河市' },
      { id: 'suihua', name: '绥化市' },
      { id: 'daxinganling', name: '大兴安岭地区' }
    ]
  },
  {
    id: 'shanghai',
    name: '上海市',
    short: '上海',
    region: '华东',
    cities: [
      { id: 'huangpu', name: '黄浦区' },
      { id: 'xuhui', name: '徐汇区' },
      { id: 'changning', name: '长宁区' },
      { id: 'jingan', name: '静安区' },
      { id: 'putuo', name: '普陀区' },
      { id: 'hongkou', name: '虹口区' },
      { id: 'yangpu', name: '杨浦区' },
      { id: 'minhang', name: '闵行区' },
      { id: 'baoshan', name: '宝山区' },
      { id: 'jiading', name: '嘉定区' },
      { id: 'pudong', name: '浦东新区' },
      { id: 'jinshan', name: '金山区' },
      { id: 'songjiang', name: '松江区' },
      { id: 'qingpu', name: '青浦区' },
      { id: 'fengxian', name: '奉贤区' },
      { id: 'chongming', name: '崇明区' }
    ]
  },
  {
    id: 'jiangsu',
    name: '江苏省',
    short: '江苏',
    region: '华东',
    cities: [
      { id: 'nanjing', name: '南京市' },
      { id: 'wuxi', name: '无锡市' },
      { id: 'xuzhou', name: '徐州市' },
      { id: 'changzhou', name: '常州市' },
      { id: 'suzhou', name: '苏州市' },
      { id: 'nantong', name: '南通市' },
      { id: 'lianyungang', name: '连云港市' },
      { id: 'huaian', name: '淮安市' },
      { id: 'yancheng', name: '盐城市' },
      { id: 'yangzhou', name: '扬州市' },
      { id: 'zhenjiang', name: '镇江市' },
      { id: 'taizhou-js', name: '泰州市' },
      { id: 'suqian', name: '宿迁市' }
    ]
  },
  {
    id: 'zhejiang',
    name: '浙江省',
    short: '浙江',
    region: '华东',
    cities: [
      { id: 'hangzhou', name: '杭州市' },
      { id: 'ningbo', name: '宁波市' },
      { id: 'wenzhou', name: '温州市' },
      { id: 'jiaxing', name: '嘉兴市' },
      { id: 'huzhou', name: '湖州市' },
      { id: 'shaoxing', name: '绍兴市' },
      { id: 'jinhua', name: '金华市' },
      { id: 'quzhou', name: '衢州市' },
      { id: 'zhoushan', name: '舟山市' },
      { id: 'taizhou-zj', name: '台州市' },
      { id: 'lishui', name: '丽水市' }
    ]
  },
  {
    id: 'anhui',
    name: '安徽省',
    short: '安徽',
    region: '华东',
    cities: [
      { id: 'hefei', name: '合肥市' },
      { id: 'wuhu', name: '芜湖市' },
      { id: 'bengbu', name: '蚌埠市' },
      { id: 'huainan', name: '淮南市' },
      { id: 'maanshan', name: '马鞍山市' },
      { id: 'huaibei', name: '淮北市' },
      { id: 'tongling', name: '铜陵市' },
      { id: 'anqing', name: '安庆市' },
      { id: 'huangshan', name: '黄山市' },
      { id: 'chuzhou', name: '滁州市' },
      { id: 'fuyang', name: '阜阳市' },
      { id: 'suzhou-ah', name: '宿州市' },
      { id: 'luan', name: '六安市' },
      { id: 'bozhou', name: '亳州市' },
      { id: 'chizhou', name: '池州市' },
      { id: 'xuancheng', name: '宣城市' }
    ]
  },
  {
    id: 'fujian',
    name: '福建省',
    short: '福建',
    region: '华东',
    cities: [
      { id: 'fuzhou', name: '福州市' },
      { id: 'xiamen', name: '厦门市' },
      { id: 'putian', name: '莆田市' },
      { id: 'sanming', name: '三明市' },
      { id: 'quanzhou', name: '泉州市' },
      { id: 'zhangzhou', name: '漳州市' },
      { id: 'nanping', name: '南平市' },
      { id: 'longyan', name: '龙岩市' },
      { id: 'ningde', name: '宁德市' }
    ]
  },
  {
    id: 'jiangxi',
    name: '江西省',
    short: '江西',
    region: '华东',
    cities: [
      { id: 'nanchang', name: '南昌市' },
      { id: 'jingdezhen', name: '景德镇市' },
      { id: 'pingxiang', name: '萍乡市' },
      { id: 'jiujiang', name: '九江市' },
      { id: 'xinyu', name: '新余市' },
      { id: 'yingtan', name: '鹰潭市' },
      { id: 'ganzhou', name: '赣州市' },
      { id: 'jian', name: '吉安市' },
      { id: 'yichun-jx', name: '宜春市' },
      { id: 'fuzhou-jx', name: '抚州市' },
      { id: 'shangrao', name: '上饶市' }
    ]
  },
  {
    id: 'shandong',
    name: '山东省',
    short: '山东',
    region: '华东',
    cities: [
      { id: 'jinan', name: '济南市' },
      { id: 'qingdao', name: '青岛市' },
      { id: 'zibo', name: '淄博市' },
      { id: 'zaozhuang', name: '枣庄市' },
      { id: 'dongying', name: '东营市' },
      { id: 'yantai', name: '烟台市' },
      { id: 'weifang', name: '潍坊市' },
      { id: 'jining', name: '济宁市' },
      { id: 'taian', name: '泰安市' },
      { id: 'weihai', name: '威海市' },
      { id: 'rizhao', name: '日照市' },
      { id: 'linyi', name: '临沂市' },
      { id: 'dezhou', name: '德州市' },
      { id: 'liaocheng', name: '聊城市' },
      { id: 'binzhou', name: '滨州市' },
      { id: 'heze', name: '菏泽市' }
    ]
  },
  {
    id: 'henan',
    name: '河南省',
    short: '河南',
    region: '华中',
    cities: [
      { id: 'zhengzhou', name: '郑州市' },
      { id: 'kaifeng', name: '开封市' },
      { id: 'luoyang', name: '洛阳市' },
      { id: 'pingdingshan', name: '平顶山市' },
      { id: 'anyang', name: '安阳市' },
      { id: 'hebi', name: '鹤壁市' },
      { id: 'xinxiang', name: '新乡市' },
      { id: 'jiaozuo', name: '焦作市' },
      { id: 'puyang', name: '濮阳市' },
      { id: 'xuchang', name: '许昌市' },
      { id: 'luohe', name: '漯河市' },
      { id: 'sanmenxia', name: '三门峡市' },
      { id: 'nanyang', name: '南阳市' },
      { id: 'shangqiu', name: '商丘市' },
      { id: 'xinyang', name: '信阳市' },
      { id: 'zhoukou', name: '周口市' },
      { id: 'zhumadian', name: '驻马店市' },
      { id: 'jiyuan', name: '济源市' }
    ]
  },
  {
    id: 'hubei',
    name: '湖北省',
    short: '湖北',
    region: '华中',
    cities: [
      { id: 'wuhan', name: '武汉市' },
      { id: 'huangshi', name: '黄石市' },
      { id: 'shiyan', name: '十堰市' },
      { id: 'yichang', name: '宜昌市' },
      { id: 'xiangyang', name: '襄阳市' },
      { id: 'ezhou', name: '鄂州市' },
      { id: 'jingmen', name: '荆门市' },
      { id: 'xiaogan', name: '孝感市' },
      { id: 'jingzhou', name: '荆州市' },
      { id: 'huanggang', name: '黄冈市' },
      { id: 'xianning', name: '咸宁市' },
      { id: 'suizhou', name: '随州市' },
      { id: 'enshi', name: '恩施土家族苗族自治州' },
      { id: 'xiantao', name: '仙桃市' },
      { id: 'qianjiang', name: '潜江市' },
      { id: 'tianmen', name: '天门市' },
      { id: 'shennongjia', name: '神农架林区' }
    ]
  },
  {
    id: 'hunan',
    name: '湖南省',
    short: '湖南',
    region: '华中',
    cities: [
      { id: 'changsha', name: '长沙市' },
      { id: 'zhuzhou', name: '株洲市' },
      { id: 'xiangtan', name: '湘潭市' },
      { id: 'hengyang', name: '衡阳市' },
      { id: 'shaoyang', name: '邵阳市' },
      { id: 'yueyang', name: '岳阳市' },
      { id: 'changde', name: '常德市' },
      { id: 'zhangjiajie', name: '张家界市' },
      { id: 'yiyang', name: '益阳市' },
      { id: 'chenzhou', name: '郴州市' },
      { id: 'yongzhou', name: '永州市' },
      { id: 'huaihua', name: '怀化市' },
      { id: 'loudi', name: '娄底市' },
      { id: 'xiangxi', name: '湘西土家族苗族自治州' }
    ]
  },
  {
    id: 'guangdong',
    name: '广东省',
    short: '广东',
    region: '华南',
    cities: [
      { id: 'guangzhou', name: '广州市' },
      { id: 'shaoguan', name: '韶关市' },
      { id: 'shenzhen', name: '深圳市' },
      { id: 'zhuhai', name: '珠海市' },
      { id: 'shantou', name: '汕头市' },
      { id: 'foshan', name: '佛山市' },
      { id: 'jiangmen', name: '江门市' },
      { id: 'zhanjiang', name: '湛江市' },
      { id: 'maoming', name: '茂名市' },
      { id: 'zhaoqing', name: '肇庆市' },
      { id: 'huizhou', name: '惠州市' },
      { id: 'meizhou', name: '梅州市' },
      { id: 'shanwei', name: '汕尾市' },
      { id: 'heyuan', name: '河源市' },
      { id: 'yangjiang', name: '阳江市' },
      { id: 'qingyuan', name: '清远市' },
      { id: 'dongguan', name: '东莞市' },
      { id: 'zhongshan', name: '中山市' },
      { id: 'chaozhou', name: '潮州市' },
      { id: 'jieyang', name: '揭阳市' },
      { id: 'yunfu', name: '云浮市' }
    ]
  },
  {
    id: 'guangxi',
    name: '广西壮族自治区',
    short: '广西',
    region: '华南',
    cities: [
      { id: 'nanning', name: '南宁市' },
      { id: 'liuzhou', name: '柳州市' },
      { id: 'guilin', name: '桂林市' },
      { id: 'wuzhou', name: '梧州市' },
      { id: 'beihai', name: '北海市' },
      { id: 'fangchenggang', name: '防城港市' },
      { id: 'qinzhou', name: '钦州市' },
      { id: 'guigang', name: '贵港市' },
      { id: 'yulin', name: '玉林市' },
      { id: 'baise', name: '百色市' },
      { id: 'hezhou', name: '贺州市' },
      { id: 'hechi', name: '河池市' },
      { id: 'laibin', name: '来宾市' },
      { id: 'chongzuo', name: '崇左市' }
    ]
  },
  {
    id: 'hainan',
    name: '海南省',
    short: '海南',
    region: '华南',
    cities: [
      { id: 'haikou', name: '海口市' },
      { id: 'sanya', name: '三亚市' },
      { id: 'sansha', name: '三沙市' },
      { id: 'danzhou', name: '儋州市' },
      { id: 'wuzhishan', name: '五指山市' },
      { id: 'qionghai', name: '琼海市' },
      { id: 'wenchang', name: '文昌市' },
      { id: 'wanning', name: '万宁市' },
      { id: 'dongfang', name: '东方市' },
      { id: 'dingan', name: '定安县' },
      { id: 'tunchang', name: '屯昌县' },
      { id: 'chengmai', name: '澄迈县' },
      { id: 'lingao', name: '临高县' },
      { id: 'baisha', name: '白沙黎族自治县' },
      { id: 'changjiang', name: '昌江黎族自治县' },
      { id: 'ledong', name: '乐东黎族自治县' },
      { id: 'lingshui', name: '陵水黎族自治县' },
      { id: 'baoting', name: '保亭黎族苗族自治县' },
      { id: 'qiongzhong', name: '琼中黎族苗族自治县' }
    ]
  },
  {
    id: 'chongqing',
    name: '重庆市',
    short: '重庆',
    region: '西南',
    cities: [
      { id: 'yuzhong', name: '渝中区' },
      { id: 'jiangbei', name: '江北区' },
      { id: 'nanan', name: '南岸区' },
      { id: 'jiulongpo', name: '九龙坡区' },
      { id: 'shapingba', name: '沙坪坝区' },
      { id: 'yubei', name: '渝北区' },
      { id: 'banan', name: '巴南区' },
      { id: 'beibei', name: '北碚区' },
      { id: 'dadukou', name: '大渡口区' },
      { id: 'wanzhou', name: '万州区' },
      { id: 'fuling', name: '涪陵区' },
      { id: 'qianjiang-cq', name: '黔江区' },
      { id: 'changshou', name: '长寿区' },
      { id: 'jiangjin', name: '江津区' },
      { id: 'hechuan', name: '合川区' },
      { id: 'yongchuan', name: '永川区' },
      { id: 'nanchuan', name: '南川区' },
      { id: 'qijiang', name: '綦江区' },
      { id: 'dazu', name: '大足区' },
      { id: 'bishan', name: '璧山区' },
      { id: 'tongliang', name: '铜梁区' },
      { id: 'tongnan', name: '潼南区' },
      { id: 'rongchang', name: '荣昌区' },
      { id: 'kaizhou', name: '开州区' },
      { id: 'liangping', name: '梁平区' },
      { id: 'wulong', name: '武隆区' },
      { id: 'chengkou', name: '城口县' },
      { id: 'fengdu', name: '丰都县' },
      { id: 'dianjiang', name: '垫江县' },
      { id: 'zhongxian', name: '忠县' },
      { id: 'yunyang', name: '云阳县' },
      { id: 'fengjie', name: '奉节县' },
      { id: 'wushan', name: '巫山县' },
      { id: 'wuxi', name: '巫溪县' },
      { id: 'shizhu', name: '石柱土家族自治县' },
      { id: 'xiushan', name: '秀山土家族苗族自治县' },
      { id: 'youyang', name: '酉阳土家族苗族自治县' },
      { id: 'pengshui', name: '彭水苗族土家族自治县' }
    ]
  },
  {
    id: 'sichuan',
    name: '四川省',
    short: '四川',
    region: '西南',
    cities: [
      { id: 'chengdu', name: '成都市' },
      { id: 'zigong', name: '自贡市' },
      { id: 'panzhihua', name: '攀枝花市' },
      { id: 'luzhou', name: '泸州市' },
      { id: 'deyang', name: '德阳市' },
      { id: 'mianyang', name: '绵阳市' },
      { id: 'guangyuan', name: '广元市' },
      { id: 'suining', name: '遂宁市' },
      { id: 'neijiang', name: '内江市' },
      { id: 'leshan', name: '乐山市' },
      { id: 'nanchong', name: '南充市' },
      { id: 'meishan', name: '眉山市' },
      { id: 'yibin', name: '宜宾市' },
      { id: 'guangan', name: '广安市' },
      { id: 'dazhou', name: '达州市' },
      { id: 'yaan', name: '雅安市' },
      { id: 'bazhong', name: '巴中市' },
      { id: 'ziyang', name: '资阳市' },
      { id: 'aba', name: '阿坝藏族羌族自治州' },
      { id: 'ganzi', name: '甘孜藏族自治州' },
      { id: 'liangshan', name: '凉山彝族自治州' }
    ]
  },
  {
    id: 'guizhou',
    name: '贵州省',
    short: '贵州',
    region: '西南',
    cities: [
      { id: 'guiyang', name: '贵阳市' },
      { id: 'liupanshui', name: '六盘水市' },
      { id: 'zunyi', name: '遵义市' },
      { id: 'anshun', name: '安顺市' },
      { id: 'bijie', name: '毕节市' },
      { id: 'tongren', name: '铜仁市' },
      { id: 'qianxinan', name: '黔西南布依族苗族自治州' },
      { id: 'qiandongnan', name: '黔东南苗族侗族自治州' },
      { id: 'qiannan', name: '黔南布依族苗族自治州' }
    ]
  },
  {
    id: 'yunnan',
    name: '云南省',
    short: '云南',
    region: '西南',
    cities: [
      { id: 'kunming', name: '昆明市' },
      { id: 'qujing', name: '曲靖市' },
      { id: 'yuxi', name: '玉溪市' },
      { id: 'baoshan', name: '保山市' },
      { id: 'zhaotong', name: '昭通市' },
      { id: 'lijiang', name: '丽江市' },
      { id: 'puer', name: '普洱市' },
      { id: 'lincang', name: '临沧市' },
      { id: 'chuxiong', name: '楚雄彝族自治州' },
      { id: 'honghe', name: '红河哈尼族彝族自治州' },
      { id: 'wenshan', name: '文山壮族苗族自治州' },
      { id: 'xishuangbanna', name: '西双版纳傣族自治州' },
      { id: 'dali', name: '大理白族自治州' },
      { id: 'dehong', name: '德宏傣族景颇族自治州' },
      { id: 'nujiang', name: '怒江傈僳族自治州' },
      { id: 'diqing', name: '迪庆藏族自治州' }
    ]
  },
  {
    id: 'tibet',
    name: '西藏自治区',
    short: '西藏',
    region: '西南',
    cities: [
      { id: 'lhasa', name: '拉萨市' },
      { id: 'shigatse', name: '日喀则市' },
      { id: 'chamdo', name: '昌都市' },
      { id: 'nyingchi', name: '林芝市' },
      { id: 'shannan', name: '山南市' },
      { id: 'nagqu', name: '那曲市' },
      { id: 'ngari', name: '阿里地区' }
    ]
  },
  {
    id: 'shaanxi',
    name: '陕西省',
    short: '陕西',
    region: '西北',
    cities: [
      { id: 'xian', name: '西安市' },
      { id: 'tongchuan', name: '铜川市' },
      { id: 'baoji', name: '宝鸡市' },
      { id: 'xianyang', name: '咸阳市' },
      { id: 'weinan', name: '渭南市' },
      { id: 'yanan', name: '延安市' },
      { id: 'hanzhong', name: '汉中市' },
      { id: 'yulin-sx', name: '榆林市' },
      { id: 'ankang', name: '安康市' },
      { id: 'shangluo', name: '商洛市' }
    ]
  },
  {
    id: 'gansu',
    name: '甘肃省',
    short: '甘肃',
    region: '西北',
    cities: [
      { id: 'lanzhou', name: '兰州市' },
      { id: 'jiayuguan', name: '嘉峪关市' },
      { id: 'jinchang', name: '金昌市' },
      { id: 'baiyin', name: '白银市' },
      { id: 'tianshui', name: '天水市' },
      { id: 'wuwei', name: '武威市' },
      { id: 'zhangye', name: '张掖市' },
      { id: 'pingliang', name: '平凉市' },
      { id: 'jiuquan', name: '酒泉市' },
      { id: 'qingyang', name: '庆阳市' },
      { id: 'dingxi', name: '定西市' },
      { id: 'longnan', name: '陇南市' },
      { id: 'linxia', name: '临夏回族自治州' },
      { id: 'gannan', name: '甘南藏族自治州' }
    ]
  },
  {
    id: 'qinghai',
    name: '青海省',
    short: '青海',
    region: '西北',
    cities: [
      { id: 'xining', name: '西宁市' },
      { id: 'haidong', name: '海东市' },
      { id: 'haibei', name: '海北藏族自治州' },
      { id: 'huangnan', name: '黄南藏族自治州' },
      { id: 'hainan-qh', name: '海南藏族自治州' },
      { id: 'guoluo', name: '果洛藏族自治州' },
      { id: 'yushu', name: '玉树藏族自治州' },
      { id: 'haixi', name: '海西蒙古族藏族自治州' }
    ]
  },
  {
    id: 'ningxia',
    name: '宁夏回族自治区',
    short: '宁夏',
    region: '西北',
    cities: [
      { id: 'yinchuan', name: '银川市' },
      { id: 'shizuishan', name: '石嘴山市' },
      { id: 'wuzhong', name: '吴忠市' },
      { id: 'guyuan', name: '固原市' },
      { id: 'zhongwei', name: '中卫市' }
    ]
  },
  {
    id: 'xinjiang',
    name: '新疆维吾尔自治区',
    short: '新疆',
    region: '西北',
    cities: [
      { id: 'urumqi', name: '乌鲁木齐市' },
      { id: 'karamay', name: '克拉玛依市' },
      { id: 'turpan', name: '吐鲁番市' },
      { id: 'hami', name: '哈密市' },
      { id: 'changji', name: '昌吉回族自治州' },
      { id: 'bortala', name: '博尔塔拉蒙古自治州' },
      { id: 'bayingolin', name: '巴音郭楞蒙古自治州' },
      { id: 'aksu', name: '阿克苏地区' },
      { id: 'kizilsu', name: '克孜勒苏柯尔克孜自治州' },
      { id: 'kashgar', name: '喀什地区' },
      { id: 'hotan', name: '和田地区' },
      { id: 'ili', name: '伊犁哈萨克自治州' },
      { id: 'tacheng', name: '塔城地区' },
      { id: 'altay', name: '阿勒泰地区' },
      { id: 'shihezi', name: '石河子市' },
      { id: 'alaer', name: '阿拉尔市' },
      { id: 'tumxuk', name: '图木舒克市' },
      { id: 'wujiaqu', name: '五家渠市' },
      { id: 'beitun', name: '北屯市' },
      { id: 'tiemenguan', name: '铁门关市' },
      { id: 'shuanghe', name: '双河市' },
      { id: 'kokdala', name: '可克达拉市' },
      { id: 'kunyu', name: '昆玉市' },
      { id: 'huyanghe', name: '胡杨河市' },
      { id: 'xinxing', name: '新星市' },
      { id: 'baiyang', name: '白杨市' }
    ]
  },
  {
    id: 'hongkong',
    name: '香港特别行政区',
    short: '香港',
    region: '港澳台',
    cities: [
      { id: 'central-western', name: '中西区' },
      { id: 'wanchai', name: '湾仔区' },
      { id: 'eastern', name: '东区' },
      { id: 'southern', name: '南区' },
      { id: 'yau-tsim-mong', name: '油尖旺区' },
      { id: 'sham-shui-po', name: '深水埗区' },
      { id: 'kowloon-city', name: '九龙城区' },
      { id: 'wong-tai-sin', name: '黄大仙区' },
      { id: 'kwun-tong', name: '观塘区' },
      { id: 'tsuen-wan', name: '荃湾区' },
      { id: 'tuen-mun', name: '屯门区' },
      { id: 'yuen-long', name: '元朗区' },
      { id: 'north', name: '北区' },
      { id: 'tai-po', name: '大埔区' },
      { id: 'sha-tin', name: '沙田区' },
      { id: 'sai-kung', name: '西贡区' },
      { id: 'kwai-tsing', name: '葵青区' },
      { id: 'islands', name: '离岛区' }
    ]
  },
  {
    id: 'macau',
    name: '澳门特别行政区',
    short: '澳门',
    region: '港澳台',
    cities: [
      { id: 'nossa-senhora-de-fatima', name: '花地玛堂区' },
      { id: 'santo-antonio', name: '花王堂区' },
      { id: 'sao-lazaro', name: '望德堂区' },
      { id: 'se', name: '大堂区' },
      { id: 'sao-lourenco', name: '风顺堂区' },
      { id: 'nossa-senhora-do-carmo', name: '嘉模堂区' },
      { id: 'cotai', name: '路氹填海区' },
      { id: 'sao-francisco-xavier', name: '圣方济各堂区' }
    ]
  },
  {
    id: 'taiwan',
    name: '台湾省',
    short: '台湾',
    region: '港澳台',
    cities: [
      { id: 'taipei', name: '台北市' },
      { id: 'new-taipei', name: '新北市' },
      { id: 'taoyuan', name: '桃园市' },
      { id: 'taichung', name: '台中市' },
      { id: 'tainan', name: '台南市' },
      { id: 'kaohsiung', name: '高雄市' },
      { id: 'keelung', name: '基隆市' },
      { id: 'hsinchu-city', name: '新竹市' },
      { id: 'chiayi-city', name: '嘉义市' },
      { id: 'hsinchu-county', name: '新竹县' },
      { id: 'miaoli', name: '苗栗县' },
      { id: 'changhua', name: '彰化县' },
      { id: 'nantou', name: '南投县' },
      { id: 'yunlin', name: '云林县' },
      { id: 'chiayi-county', name: '嘉义县' },
      { id: 'pingtung', name: '屏东县' },
      { id: 'yilan', name: '宜兰县' },
      { id: 'hualien', name: '花莲县' },
      { id: 'taitung', name: '台东县' },
      { id: 'penghu', name: '澎湖县' },
      { id: 'kinmen', name: '金门县' },
      { id: 'lienchiang', name: '连江县' }
    ]
  }
]

/* ------------------------------------------------------------------ *
 * 7. PIPELINE_STAGES —— 项目推进流程（14 步）
 * ------------------------------------------------------------------ */

export const PIPELINE_STAGES = [
  {
    id: 'publish',
    order: 1,
    name: '项目发布',
    icon: '📢',
    desc: '发布方提交项目信息：项目内容、需要对方具备的资质、商务条件',
    actor: '发布方',
    requires: [],
    actions: []
  },
  {
    id: 'qualification-review',
    order: 2,
    name: '上传资质审核',
    icon: '📑',
    desc: '意向方上传企业资质证明，AI 按项目要求逐项核对后，由发布方确认是否通过',
    actor: '意向方提交 · AI 审核 · 发布方确认',
    requires: ['file', 'confirm'],
    actions: ['upload-qualification', 'ai-review', 'confirm-qualification']
  },
  {
    id: 'group-meeting',
    order: 3,
    name: '群聊天室和会议',
    icon: '💬',
    desc: '建立项目专属群聊与线上会议，AI 实时记录、生成纪要并推送双方后续跟进',
    actor: '双方',
    requires: ['confirm'],
    actions: ['open-chat', 'create-meeting']
  },
  {
    id: 'invitation',
    order: 4,
    name: '发邀请函',
    icon: '✉️',
    desc: '向对方发出正式邀请函，写明项目、事由、时间地点与随行要求',
    actor: '发布方',
    requires: ['file', 'confirm'],
    actions: ['generate-invitation', 'send-invitation']
  },
  {
    id: 'brokerage',
    order: 5,
    name: '签订居间',
    icon: '🤝',
    desc: '签订居间协议，明确居间服务内容、居间费比例与支付节点',
    actor: '双方',
    requires: ['file', 'confirm'],
    actions: ['generate-brokerage', 'sign-brokerage']
  },
  {
    id: 'offline-meeting',
    order: 6,
    name: '线下面谈',
    icon: '🏢',
    desc: '线下会面洽谈细节，上传会谈记录与现场材料',
    actor: '双方',
    requires: ['file', 'confirm'],
    actions: ['schedule-offline', 'upload-record']
  },
  {
    id: 'contract',
    order: 7,
    name: '签订正式合约',
    icon: '📜',
    desc: '签订正式合同并支付居间费，项目落地归档',
    actor: '双方',
    requires: ['file', 'payment', 'confirm'],
    actions: ['generate-contract', 'upload-contract', 'pay-brokerage']
  }
]

/* ------------------------------------------------------------------ *
 * 8. QUALIFICATION_TYPES —— 企业资质类型
 * ------------------------------------------------------------------ */

export const QUALIFICATION_TYPES = [
  { id: 'business-license', name: '营业执照', required: true },
  { id: 'legal-person-id', name: '法定代表人身份证明', required: true },
  { id: 'bank-account-license', name: '开户许可证', required: true },
  { id: 'iso9001', name: 'ISO9001 质量管理体系认证', required: false },
  { id: 'iso14001', name: 'ISO14001 环境管理体系认证', required: false },
  { id: 'iso45001', name: 'ISO45001 职业健康安全管理体系认证', required: false },
  { id: 'iso27001', name: 'ISO27001 信息安全管理体系认证', required: false },
  { id: 'safety-production-license', name: '安全生产许可证', required: false },
  { id: 'construction-qualification', name: '建筑业企业资质', required: false },
  { id: 'power-business-license', name: '电力业务许可证', required: false },
  { id: 'power-facility-license', name: '承装（修、试）电力设施许可证', required: false },
  { id: 'high-tech-certificate', name: '高新技术企业证书', required: false },
  { id: 'specialized-sme', name: '专精特新企业认定', required: false },
  { id: 'aaa-credit', name: 'AAA 信用等级证书', required: false },
  { id: 'patent-certificate', name: '专利证书', required: false },
  { id: 'software-copyright', name: '软件著作权登记证书', required: false },
  { id: 'tax-certificate', name: '纳税证明', required: false },
  { id: 'audit-report', name: '审计报告', required: false },
  { id: 'social-insurance', name: '社保缴纳证明', required: false },
  { id: 'performance-certificate', name: '业绩证明材料', required: false },
  { id: 'other', name: '其他', required: false }
]

/* ------------------------------------------------------------------ *
 * 8.5 项目资质要求 —— 发布时勾选「需要对方具备哪些资质」
 * ------------------------------------------------------------------ */

/** 常用工程/服务类资质，供发布方快速勾选（仍可自由填写） */
export const PROJECT_QUALIFICATION_PRESETS = [
  { id: 'power-eng-1', name: '电力工程施工总承包一级', group: '施工总承包' },
  { id: 'power-eng-2', name: '电力工程施工总承包二级', group: '施工总承包' },
  { id: 'municipal-1', name: '市政公用工程施工总承包一级', group: '施工总承包' },
  { id: 'construction-1', name: '建筑工程施工总承包一级', group: '施工总承包' },
  { id: 'mechanical-1', name: '建筑机电安装工程专业承包一级', group: '专业承包' },
  { id: 'electrical-install-1', name: '电子与智能化工程专业承包一级', group: '专业承包' },
  { id: 'steel-structure-1', name: '钢结构工程专业承包一级', group: '专业承包' },
  { id: 'power-facility', name: '承装（修、试）电力设施许可证', group: '专项许可' },
  { id: 'power-business', name: '电力业务许可证', group: '专项许可' },
  { id: 'safety-production', name: '安全生产许可证', group: '专项许可' },
  { id: 'design-power-1', name: '电力行业（新能源发电）设计甲级', group: '设计' },
  { id: 'design-comprehensive', name: '工程设计综合甲级', group: '设计' },
  { id: 'survey-1', name: '工程勘察综合甲级', group: '勘察' },
  { id: 'supervision-1', name: '工程监理综合资质', group: '监理' },
  { id: 'iso9001', name: 'ISO9001 质量管理体系', group: '体系认证' },
  { id: 'iso14001', name: 'ISO14001 环境管理体系', group: '体系认证' },
  { id: 'iso45001', name: 'ISO45001 职业健康安全体系', group: '体系认证' },
  { id: 'high-tech', name: '高新技术企业证书', group: '企业证书' },
  { id: 'credit-aaa', name: 'AAA 信用等级证书', group: '企业证书' },
  { id: 'performance', name: '同类项目业绩证明', group: '业绩' },
  { id: 'bank-credit', name: '银行资信证明', group: '财务' },
  { id: 'audit-report', name: '近三年审计报告', group: '财务' },
  { id: 'patent', name: '相关专利证书', group: '知识产权' },
  { id: 'other', name: '其他（自填）', group: '其他' }
]

/** 资质等级（可留空） */
export const QUALIFICATION_LEVELS = ['不要求', '一级', '二级', '三级', '甲级', '乙级', '丙级', 'AAA', 'AA', 'A', '其他']

/* ------------------------------------------------------------------ *
 * 8.6 商务条件 —— 项目发布时填写的商务条款
 * ------------------------------------------------------------------ */

export const COOPERATION_MODES = [
  'EPC 总承包', '设计+施工', '设备供货', '材料供应', '施工分包', '劳务分包',
  '联合体投标', '股权投资', '产业投资', '财务顾问', '居间撮合', '运营维护', '其他'
]

export const PRICE_TYPES = ['总价包干', '单价合同', '费率报价', '成本加酬金', '面议', '其他']

export const PRICE_INCLUDE_TAX = ['含税', '不含税', '待商定']

export const PAYMENT_TERMS = [
  '预付款+进度款+验收款', '月结', '季度结算', '验收后一次结清', '按节点付款', '其他'
]

export const SETTLEMENT_MODES = ['银行转账', '承兑汇票', '现金', '信用证', '其他']

export const INVOICE_TYPES = ['增值税专用发票 13%', '增值税专用发票 9%', '增值税专用发票 6%', '增值税普通发票', '不开票', '待商定']

export const BROKERAGE_BASES = ['合同总额百分比', '固定金额', '差额分成', '待商定']

/** 商务条件字段定义（后端存对象，前端按此渲染） */
export const BUSINESS_TERM_FIELDS = [
  { key: 'cooperationMode', label: '合作方式', options: COOPERATION_MODES },
  { key: 'priceType', label: '报价方式', options: PRICE_TYPES },
  { key: 'priceRange', label: '报价区间 / 预算', placeholder: '如 8.6 亿元 / 0.45 元每瓦' },
  { key: 'taxInfo', label: '含税情况', options: PRICE_INCLUDE_TAX },
  { key: 'paymentTerms', label: '付款方式', options: PAYMENT_TERMS },
  { key: 'advanceRatio', label: '预付款比例', placeholder: '如 30%' },
  { key: 'retentionRatio', label: '质保金比例', placeholder: '如 5%，质保期 2 年' },
  { key: 'settlement', label: '结算方式', options: SETTLEMENT_MODES },
  { key: 'invoiceType', label: '发票要求', options: INVOICE_TYPES },
  { key: 'period', label: '工期 / 交付期', placeholder: '如 14 个月 / 合同签订后 60 天' },
  { key: 'deposit', label: '保证金 / 履约担保', placeholder: '如 合同额 10% 履约保函' },
  { key: 'brokerageRatio', label: '居间费比例', placeholder: '如 合同额 2%' },
  { key: 'brokerageBase', label: '居间费计算方式', options: BROKERAGE_BASES },
  { key: 'brokeragePayNode', label: '居间费支付节点', placeholder: '如 合同签订后 7 日内支付 50%' },
  { key: 'otherTerms', label: '其他商务条件', placeholder: '如 甲供材范围、验收标准等', multiline: true }
]

/* ------------------------------------------------------------------ *
 * 9. HELPER —— 查找工具
 * ------------------------------------------------------------------ */

function norm(value) {
  return typeof value === 'string' ? value.trim() : ''
}

function findProvince(id) {
  const key = norm(id)
  if (!key) return null
  return CITIES.find((p) => p.id === key) || null
}

function collectCities() {
  const list = []
  for (const province of CITIES) {
    for (const city of province.cities) {
      list.push({
        id: city.id,
        name: city.name,
        provinceId: province.id,
        provinceName: province.name,
        provinceShort: province.short,
        region: province.region
      })
    }
  }
  return list
}

export const HELPER = {
  /** 按行业 id 查找行业，未找到返回 null */
  findIndustry(id) {
    const key = norm(id)
    if (!key) return null
    return INDUSTRIES.find((item) => item.id === key) || null
  },

  /** 按行业 id + 子类 id 查找子类，未找到返回 null */
  findSubIndustry(industryId, subId) {
    const industry = HELPER.findIndustry(industryId)
    if (!industry) return null
    const key = norm(subId)
    if (!key) return null
    return industry.subs.find((sub) => sub.id === key) || null
  },

  /** 按 id 查找省级行政区或城市，未找到返回 null */
  findCity(id) {
    const key = norm(id)
    if (!key) return null
    const province = findProvince(key)
    if (province) return province
    return collectCities().find((city) => city.id === key) || null
  },

  /** 取某省下全部地级行政区，未知省份返回空数组 */
  citiesOf(provinceId) {
    const province = findProvince(provinceId)
    return province ? province.cities : []
  },

  /** 展平全部城市（含省份信息与地区） */
  flattenCities() {
    return collectCities()
  },

  /** 行业名，未知 id 原样返回 */
  industryName(id) {
    const industry = HELPER.findIndustry(id)
    return industry ? industry.name : id
  },

  /** 子类名，未知 id 原样返回 */
  subIndustryName(industryId, subId) {
    const sub = HELPER.findSubIndustry(industryId, subId)
    return sub ? sub.name : subId
  },

  /** 项目类型名，未知 id 原样返回 */
  projectTypeName(id) {
    const key = norm(id)
    const hit = PROJECT_TYPES.find((item) => item.id === key)
    return hit ? hit.name : id
  },

  /** 贸易类型名，未知 id 原样返回 */
  tradeTypeName(id) {
    const key = norm(id)
    const hit = TRADE_TYPES.find((item) => item.id === key)
    return hit ? hit.name : id
  },

  /** 活动类型名，未知 id 原样返回 */
  eventTypeName(id) {
    const key = norm(id)
    const hit = EVENT_TYPES.find((item) => item.id === key)
    return hit ? hit.name : id
  },

  /** 按板块取类型名；板块可为 id 或名称，未知 id 原样返回 */
  typeName(category, id) {
    const key = norm(category)
    const cat =
      CATEGORIES.find((item) => item.id === key || item.name === key) || null
    const pools = cat ? [cat.types] : CATEGORIES.map((item) => item.types)
    const target = norm(id)
    for (const pool of pools) {
      const hit = pool.find((item) => item.id === target)
      if (hit) return hit.name
    }
    return id
  }
}

/** 兼容写法：与 HELPER 指向同一对象 */
export const HELPERS = HELPER

/* ------------------------------------------------------------------ *
 * searchTaxonomy —— 关键词搜索
 * ------------------------------------------------------------------ */

export function searchTaxonomy(keyword) {
  const empty = { industries: [], subs: [], cities: [] }
  if (typeof keyword !== 'string') return empty
  const key = keyword.trim().toLowerCase()
  if (!key) return empty

  const includes = (value) =>
    typeof value === 'string' && value.toLowerCase().includes(key)

  const industries = []
  const subs = []

  for (const industry of INDUSTRIES) {
    const matchedSubs = []
    for (const sub of industry.subs) {
      if (includes(sub.id) || includes(sub.name)) {
        const entry = {
          id: sub.id,
          name: sub.name,
          industryId: industry.id,
          industryName: industry.name
        }
        matchedSubs.push(entry)
        subs.push(entry)
      }
    }
    if (includes(industry.id) || includes(industry.name) || matchedSubs.length) {
      industries.push({
        id: industry.id,
        name: industry.name,
        icon: industry.icon,
        subs: matchedSubs.length ? matchedSubs : industry.subs
      })
    }
  }

  const cities = []
  for (const province of CITIES) {
    const provinceHit =
      includes(province.id) ||
      includes(province.name) ||
      includes(province.short) ||
      includes(province.region)
    for (const city of province.cities) {
      if (provinceHit || includes(city.id) || includes(city.name)) {
        cities.push({
          id: city.id,
          name: city.name,
          provinceId: province.id,
          provinceName: province.name,
          region: province.region
        })
      }
    }
  }

  return { industries, subs, cities }
}

export default {
  INDUSTRIES,
  PROJECT_TYPES,
  TRADE_TYPES,
  EVENT_TYPES,
  CATEGORIES,
  CITIES,
  PIPELINE_STAGES,

  PROJECT_QUALIFICATION_PRESETS,

  QUALIFICATION_LEVELS,

  COOPERATION_MODES,

  PRICE_TYPES,

  PAYMENT_TERMS,

  SETTLEMENT_MODES,

  INVOICE_TYPES,

  BUSINESS_TERM_FIELDS,
  QUALIFICATION_TYPES,
  HELPER,
  HELPERS,
  searchTaxonomy
}

/**
 * 固定话题群
 *
 * 这些群不由用户创建，随系统初始化存在，所有登录用户都能看到并直接发言。
 * slug 是稳定标识：改名、改图标不会重复创建。
 */

export const TOPIC_ROOMS = [
  { slug: 'pv', name: '光伏群', icon: '☀️', desc: '组件、逆变器、EPC、分布式与集中式项目' },
  { slug: 'compute', name: '算力群', icon: '🖥️', desc: '智算中心、GPU、IDC、算力租赁与调度' },
  { slug: 'storage', name: '储能群', icon: '🔋', desc: '电化学储能、工商业储能、EMS 与系统集成' },
  { slug: 'wind', name: '风电群', icon: '💨', desc: '陆上/海上风电、风机、塔筒与运维' },
  { slug: 'engineering', name: '工程群', icon: '🏗️', desc: '施工、总包、分包、造价、监理与验收' },
  { slug: 'park', name: '园区群', icon: '🏢', desc: '产业园区、标准厂房、招商落地与配套' },
  { slug: 'cross-border', name: '海外跨境电商群', icon: '🌏', desc: '出海、跨境物流、平台运营与合规' },
  { slug: 'investment', name: '投资群', icon: '💰', desc: '股权投资、债权融资、并购与退出' },
  { slug: 'attract', name: '招商引资群', icon: '🤝', desc: '地方政府招商、土地政策与项目落地' },
  { slug: 'ai', name: 'AI群', icon: '🤖', desc: '大模型、智能体、AI 应用与行业落地' },
  { slug: 'drone', name: '无人机群', icon: '🛸', desc: '工业无人机、多旋翼、巡检与物流' },
  { slug: 'robot', name: '机器人群', icon: '🦾', desc: '工业机器人、人形机器人、AGV 与产线' },
  { slug: 'evtol', name: '飞行汽车群', icon: '🚁', desc: 'eVTOL、低空经济、适航与运行场景' },
];

/** slug -> 配置 */
export const TOPIC_BY_SLUG = new Map(TOPIC_ROOMS.map((t) => [t.slug, t]));

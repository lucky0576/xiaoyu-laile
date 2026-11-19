/**
 * 招投标专题页（#/bidding）
 *
 * 浙江 + 江苏区域聚合：按区域 / 项目类型筛选，按项目类型分组展示。
 * 数据由 scripts/zj-bidding-collect.py 每天采集。
 */

import * as ui from './ui.js';
import { service } from './api.js';

const REGIONS = [
  { id: '', name: '全部' },
  { id: '浙江省级', name: '浙江省级' },
  { id: '杭州市', name: '杭州市' },
  { id: '上城区', name: '上城区' },
  { id: '西湖区', name: '西湖区' },
  { id: '萧山区', name: '萧山区' },
  { id: '余杭区', name: '余杭区' },
  { id: '临平区', name: '临平区' },
  { id: '富阳区', name: '富阳区' },
  { id: '桐庐县', name: '桐庐县' },
  { id: '淳安县', name: '淳安县' },
  { id: '建德市', name: '建德市' },
  /* 其他地级市 */
  { id: '宁波市', name: '宁波市' },
  { id: '温州市', name: '温州市' },
  { id: '嘉兴市', name: '嘉兴市' },
  { id: '湖州市', name: '湖州市' },
  { id: '绍兴市', name: '绍兴市' },
  { id: '金华市', name: '金华市' },
  { id: '衢州市', name: '衢州市' },
  { id: '舟山市', name: '舟山市' },
  { id: '台州市', name: '台州市' },
  { id: '丽水市', name: '丽水市' },
  /* 江苏 */
  { id: '江苏省级', name: '江苏省级' },
  { id: '南京市', name: '南京市' },
  { id: '无锡市', name: '无锡市' },
  { id: '徐州市', name: '徐州市' },
  { id: '常州市', name: '常州市' },
  { id: '苏州市', name: '苏州市' },
  { id: '南通市', name: '南通市' },
  { id: '连云港市', name: '连云港市' },
  { id: '淮安市', name: '淮安市' },
  { id: '盐城市', name: '盐城市' },
  { id: '扬州市', name: '扬州市' },
  { id: '镇江市', name: '镇江市' },
  { id: '泰州市', name: '泰州市' },
  { id: '宿迁市', name: '宿迁市' },
];

const ALL_REGION_IDS = new Set(REGIONS.map((r) => r.id).filter(Boolean));
/* 杭州区县单列；浙江其他 10 市单列；江苏 13 市单列 */
const HZ_REGION_IDS = new Set(['', '浙江省级', '杭州市', '上城区', '西湖区', '萧山区', '余杭区', '临平区', '富阳区', '桐庐县', '淳安县', '建德市']);
const JS_REGION_IDS = new Set(['江苏省级', '南京市', '无锡市', '徐州市', '常州市', '苏州市', '南通市', '连云港市', '淮安市', '盐城市', '扬州市', '镇江市', '泰州市', '宿迁市']);
const HZ_REGIONS = REGIONS.filter((r) => HZ_REGION_IDS.has(r.id));
const JS_REGIONS = REGIONS.filter((r) => JS_REGION_IDS.has(r.id));
const CITY_REGIONS = REGIONS.filter((r) => r.id && !HZ_REGION_IDS.has(r.id) && !JS_REGION_IDS.has(r.id));

/* 每个区县对应的公共资源交易官网（点击新窗口打开） */
const REGION_SITES = {
  '浙江省级': 'https://zfcg.czt.zj.gov.cn/site/category?parentId=600007&childrenCode=ZcyAnnouncement',
  杭州市: 'https://www.hangzhou.gov.cn/',
  上城区: 'https://www.hzscsxy.com:8443/#/JYlist',
  西湖区: 'https://www.zhaobide.com/Web/Partner_index?pid=a8b557ad-9cf8-4f67-bf3e-7cf5337c2166',
  萧山区: 'https://www.xiaoshan.gov.cn/col/col1229181634/',
  余杭区: 'https://www.yuhang.gov.cn/col/col1229374049/index.html',
  临平区: 'https://xehome.lpqfpt.cn/jy?transactionMethod=0',
  富阳区: 'https://www.fuyang.gov.cn/col/col1229429575/index.html',
  桐庐县: 'https://tlztb.tonglu.gov.cn:18090/#/home_infolist?id=1011312667018792960',
  淳安县: 'https://www.qdh.gov.cn/col/col1229356921/index.html',
  建德市: 'https://www.jiande.gov.cn/col/col1229418005/zbggygdbzlm175/index.html',
  宁波市: 'https://ygcg.nbcqjy.org/list?type=2&class=2&noticeType=21',
  温州市: 'https://ggzyjy-eweb.wenzhou.gov.cn/col/col1229696276/index.html',
  嘉兴市: 'https://jxszwsjb.jiaxing.gov.cn/col/col1229743506/index.html',
  湖州市: 'https://ggzyjy.huzhou.gov.cn/jydtx/gcjs/zbgg/index.html',
  绍兴市: 'https://ggb.sx.gov.cn/col/col1518854/index.html',
  金华市: 'https://ggzyjy.jinhua.gov.cn/',
  衢州市: 'https://ggzy.qz.gov.cn/col/col1229683626/index.html',
  舟山市: 'https://zsztb.zhoushan.gov.cn/col/col1229679798/index.html',
  台州市: 'https://ggzy.tzztb.zjtz.gov.cn/jyxx/trade_infor.html',
  丽水市: 'https://lssggzy.lishui.gov.cn/col/col1229661790/index.html',
  江苏省级: 'https://jsggzy.jszwfw.gov.cn/',
  南京市: 'https://njggzy.nanjing.gov.cn/njweb/',
  无锡市: 'https://ggzyjy.wuxi.gov.cn/',
  徐州市: 'https://ggzy.zwb.xz.gov.cn/',
  常州市: 'https://ggzy.changzhou.gov.cn/',
  苏州市: 'https://szggzy.jszwfw.gov.cn/',
  南通市: 'https://ggzyjy.nantong.gov.cn/',
  连云港市: 'https://ggzy.lyg.gov.cn/',
  淮安市: 'https://ggzy.huaian.gov.cn/',
  盐城市: 'https://ycggzy.jszwfw.gov.cn/',
  扬州市: 'https://ggzyjyzx.yangzhou.gov.cn/',
  镇江市: 'https://ggzy.zhenjiang.gov.cn/',
  泰州市: 'https://ggzy.taizhou.gov.cn/',
  宿迁市: 'https://ggzy.sqzwfw.gov.cn/',
};

function looksOld(x) {
  const text = `${x.bidding?.publishAt || ''} ${x.title || ''}`;
  const years = text.match(/20\d{2}/g) || [];
  const nowYear = new Date().getFullYear();
  return years.some((y) => Number(y) < nowYear - 1);
}

function fmtShort(v) {
  if (!v) return '';
  const d = new Date(v);
  if (!Number.isNaN(d.getTime())) {
    const p = (n) => String(n).padStart(2, '0');
    return `${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  }
  const m = String(v).match(/(\d{1,2})[-/.月](\d{1,2})/);
  return m ? `${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}` : String(v).slice(0, 10);
}

function fmtFull(v) {
  if (!v) return '';
  const d = new Date(v);
  if (!Number.isNaN(d.getTime())) {
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
  }
  return String(v).slice(0, 16);
}

const TYPES = [
  { id: '', name: '全部' },
  { id: '工程建设', name: '工程建设' },
  { id: '装修', name: '装修' },
  { id: '公路', name: '公路' },
  { id: '风力', name: '风力' },
  { id: '光伏', name: '光伏' },
  { id: '水电', name: '水电' },
  { id: '算力', name: '算力' },
  { id: '货物采购', name: '货物采购' },
  { id: '服务采购', name: '服务采购' },
  { id: '信息服务', name: '信息服务' },
  { id: '产权交易', name: '产权交易' },
  { id: '其他', name: '其他' },
];

/* 杭州各区招投标操作细则（用户提供的实务经验，投标前核对官方最新通知） */
const HZ_BID_RULES = [
  {
    district: '萧山',
    icon: '🏗️',
    items: [
      'CA 锁 + 品茗软件锁',
      '有保证金的项目人工操作，每周上传一次汇票',
      '动态核查每周一更新，社保每月更新',
    ],
  },
  {
    district: '余杭',
    icon: '🏗️',
    items: [
      '项目经理 + 施工员 + 安全员都要备案，需 2 个工作日',
      '动态核查每周一更新，社保每月更新',
    ],
  },
  {
    district: '临平',
    icon: '🏗️',
    items: [
      '项目经理 + 施工员 + 安全员都要备案，需 2 个工作日',
      '动态核查每周一更新，社保每 5 个工作日更新',
    ],
  },
  {
    district: '滨江',
    icon: '🏢',
    items: [
      '登录要扫码或法人锁',
      '易滨通走浙里办扫码或法人锁',
      '有法人锁免扫码；没有则做标书、签到都要扫码',
      '有保证金项目手动上传；线下保函需填信息，线上保函扫码后选类型',
    ],
  },
  {
    district: '富阳',
    icon: '🏢',
    items: [
      '项目经理需备案',
      '所有投标文件资料都要盖章版',
      '社保要投标当日的并盖章',
      '声明函、中小企业承诺书要盖实体公章并签字',
    ],
  },
  {
    district: '临安',
    icon: '🏢',
    items: [
      '动态核查有时要盖章版',
      '有保证金的项目人工操作，每周上传一次',
    ],
  },
];

const SOURCES = [
  { name: '浙江政府采购网', region: '浙江省级', url: 'https://zfcg.czt.zj.gov.cn/site/category?parentId=600007&childrenCode=ZcyAnnouncement', status: '已接入', note: '官方 API，每天采集最新 100 条' },  /* 江苏：省级枢纽 + 13 个设区市 + 重点县区/专项 */
  { name: '江苏省公共资源交易网', region: '江苏省级', url: 'https://jsggzy.jszwfw.gov.cn/', status: '已接入', note: '官方 API，每天采集最新公告' },
  { name: '江苏省政府采购网', region: '江苏省级', url: 'http://www.ccgp-jiangsu.gov.cn/', status: '待接入', note: '入口已核验，采集待接入' },
  { name: '江苏招标采购服务平台', region: '江苏省级', url: 'https://www.jszbcg.com/', status: '待接入', note: '国企采购补充源' },
  { name: '南京市公共资源交易平台', region: '南京市', url: 'https://njggzy.nanjing.gov.cn/njweb/', status: '已接入', note: '经省平台归集；入口已核验' },
  { name: '无锡市公共资源交易中心', region: '无锡市', url: 'https://ggzyjy.wuxi.gov.cn/', status: '已接入', note: '经省平台归集；入口已核验' },
  { name: '徐州市公共资源交易平台', region: '徐州市', url: 'https://ggzy.zwb.xz.gov.cn/', status: '已接入', note: '经省平台归集；入口已核验' },
  { name: '常州市公共资源交易网', region: '常州市', url: 'https://ggzy.changzhou.gov.cn/', status: '已接入', note: '经省平台归集；武进区另有独立平台' },
  { name: '苏州市公共资源交易平台', region: '苏州市', url: 'https://szggzy.jszwfw.gov.cn/', status: '已接入', note: '经省平台归集；入口已核验' },
  { name: '南通市公共资源交易网', region: '南通市', url: 'https://ggzyjy.nantong.gov.cn/', status: '已接入', note: '经省平台归集；海安/启东/苏锡通另有平台' },
  { name: '连云港市公共资源交易平台', region: '连云港市', url: 'https://ggzy.lyg.gov.cn/', status: '已接入', note: '经省平台归集；入口已核验' },
  { name: '淮安市公共资源交易网', region: '淮安市', url: 'https://ggzy.huaian.gov.cn/', status: '已接入', note: '经省平台归集；入口已核验' },
  { name: '盐城市公共资源交易平台', region: '盐城市', url: 'https://ycggzy.jszwfw.gov.cn/', status: '已接入', note: '经省平台归集；入口已核验' },
  { name: '扬州市公共资源交易中心', region: '扬州市', url: 'https://ggzyjyzx.yangzhou.gov.cn/', status: '已接入', note: '经省平台归集；含国企采购栏目' },
  { name: '镇江市公共资源交易中心', region: '镇江市', url: 'https://ggzy.zhenjiang.gov.cn/', status: '已接入', note: '经省平台归集；入口已核验' },
  { name: '泰州市公共资源交易网', region: '泰州市', url: 'https://ggzy.taizhou.gov.cn/', status: '已接入', note: '经省平台归集；入口已核验' },
  { name: '宿迁市公共资源交易网', region: '宿迁市', url: 'https://ggzy.sqzwfw.gov.cn/', status: '已接入', note: '经省平台归集；入口已核验' },
  { name: '海安市限额以下公共资源交易平台', region: '南通市', url: 'http://xeyxjy.haian.gov.cn/', status: '已接入', note: '经省平台归集；限额以下独发源' },
  { name: '武进区限额以下项目交易平台', region: '常州市', url: 'http://ggzyjy.wj.gov.cn/BREpointSSO', status: '已接入', note: '经省平台归集；限额以下独立系统' },
  { name: '苏锡通园区限额以下平台', region: '南通市', url: 'http://ggzyjy.stpac.gov.cn/', status: '已接入', note: '经省平台归集；园区限额以下项目' },
  { name: '苏服采（江苏服务类网上商城）', region: '江苏省级', url: 'https://js.fwgov.cn/', status: '待接入', note: '100 万以下服务/工程' },
  { name: '江苏建设工程招标网', region: '江苏省级', url: 'http://www.jszb.com.cn/JSZB/', status: '待接入', note: '房建市政指定媒介' },
  { name: '江苏省农村产权交易信息服务平台', region: '江苏省级', url: 'https://jtzc.jssny.com.cn/', status: '待接入', note: '村级小微工程/农村产权' },
  { name: '无锡惠山区限额以下公告页', region: '无锡市', url: 'https://www.huishan.gov.cn/', status: '已接入', note: '经省平台归集；明标明投/名录内企业' },
  { name: '建湖县公共资源交易平台', region: '盐城市', url: 'http://218.206.153.6:8099/', status: '已接入', note: '经省平台归集；县级电子化平台' },
  { name: '徐圩新区采购服务平台', region: '连云港市', url: 'http://ggzy.xwxq.gov.cn/', status: '已接入', note: '经省平台归集；采购/工程公告' },
  { name: '苏州农村阳光招采平台（昆山）', region: '苏州市', url: 'https://data.ks.gov.cn/kss/ttxw/202607/050cf0947d114bf58884bf646aea166a.shtml', status: '已接入', note: '经省平台归集；平台网址待回官网核实' },
  { name: '上城区公共资源交易', region: '上城区', url: 'https://www.hzscsxy.com:8443/#/JYlist', status: '已接入' },
  { name: '西湖区公共资源交易（建易）', region: '西湖区', url: 'https://www.zhaobide.com/Web/Partner_index?pid=a8b557ad-9cf8-4f67-bf3e-7cf5337c2166', status: '已接入' },
  { name: '萧山区公共资源交易', region: '萧山区', url: 'https://www.xiaoshan.gov.cn/col/col1229181634/', status: '仅通知', note: '该栏目是通知公告，交易公告在另一平台' },
  { name: '余杭区公共资源交易', region: '余杭区', url: 'https://www.yuhang.gov.cn/col/col1229374049/index.html', status: '已接入' },
  { name: '临平区公共资源交易', region: '临平区', url: 'https://xehome.lpqfpt.cn/jy?transactionMethod=0', status: '待接入', note: '境外服务器不可达' },
  { name: '富阳区公共资源交易', region: '富阳区', url: 'https://www.fuyang.gov.cn/col/col1229429575/index.html', status: '已接入' },
  { name: '桐庐县公共资源交易', region: '桐庐县', url: 'https://tlztb.tonglu.gov.cn:18090/#/home_infolist?id=1011312667018792960', status: '已接入' },
  { name: '淳安县公共资源交易', region: '淳安县', url: 'https://www.qdh.gov.cn/col/col1229356921/index.html', status: '已接入' },
  { name: '建德市公共资源交易', region: '建德市', url: 'https://www.jiande.gov.cn/col/col1229418005/zbggygdbzlm175/index.html', status: '已接入' },
  /* 其他地级市：已接入 6 个，其余待接入 */
  { name: '温州市公共资源交易', region: '温州市', url: 'https://ggzyjy-eweb.wenzhou.gov.cn/col/col1229696276/index.html', status: '已接入' },
  { name: '嘉兴市公共资源交易', region: '嘉兴市', url: 'https://jxszwsjb.jiaxing.gov.cn/col/col1229743506/index.html', status: '已接入' },
  { name: '绍兴市公共资源交易', region: '绍兴市', url: 'https://ggb.sx.gov.cn/col/col1518854/index.html', status: '已接入' },
  { name: '衢州市公共资源交易', region: '衢州市', url: 'https://ggzy.qz.gov.cn/col/col1229683626/index.html', status: '已接入' },
  { name: '舟山市公共资源交易', region: '舟山市', url: 'https://zsztb.zhoushan.gov.cn/col/col1229679798/index.html', status: '已接入' },
  { name: '丽水市公共资源交易', region: '丽水市', url: 'https://lssggzy.lishui.gov.cn/col/col1229661790/index.html', status: '已接入' },
  { name: '宁波市阳光采购服务平台', region: '宁波市', url: 'https://ygcg.nbcqjy.org/list?type=2&class=2&noticeType=21', status: '已接入' },
  { name: '湖州市公共资源交易', region: '湖州市', url: 'https://ggzyjy.huzhou.gov.cn/jydtx/gcjs/zbgg/index.html', status: '已接入' },
  { name: '金华市公共资源交易', region: '金华市', url: 'https://ggzyjy.jinhua.gov.cn/', status: '待接入', note: '原域名返回 410，需新入口' },
  { name: '台州市公共资源交易', region: '台州市', url: 'https://ggzy.tzztb.zjtz.gov.cn/jyxx/trade_infor.html', status: '待接入', note: '境外服务器访问该子域超时；主站请手动查看' },
  { name: '浙江省公共资源交易服务平台', region: '浙江省级', url: 'https://ggzy.zj.gov.cn/', status: '待接入', note: '全省汇聚入口，反爬 405' },
];

function inferType(x) {
  const t = `${x.title || ''} ${x.subtitle || ''}`;
  if (/产权|出让|转让|出租|拍卖|土地|房产|资产处置/.test(t)) return '产权交易';
  // 装修类：优先于「工程建设」，避免被“改造/修缮/建设”吸走
  if (/装修|装饰|室内装修|外立面|翻新|修缮工程|改造装修/.test(t)) return '装修';
  // 信息服务类：系统/数据/软件/平台/网络/数字化服务
  if (/信息服务|信息化|数据服务|软件开发|软件采购|平台运营|平台服务|网络服务|系统集成|数字化服务|信息系统/.test(t)) return '信息服务';
  if (/工程|施工|监理|勘察|设计|改造|修缮|道路|水利|市政|绿化|建设|安装/.test(t)) return '工程建设';
  if (/采购|货物|设备|仪器|车辆|家具|食材|服装|物资|耗材/.test(t)) return '货物采购';
  if (/服务|物业|保洁|安保|运维|咨询|检测|评估|培训|活动|运营|维保/.test(t)) return '服务采购';
  return '其他';
}

function regionOf(x) {
  return x.bidding?.region || (x.cities && (x.cities[0]?.name || x.cities[0])) || x.sourceName || '';
}

function typeOf(x) {
  // 新增「装修 / 信息服务」后，旧数据里可能仍写着「工程建设 / 服务采购」；
  // 标题能明确判断时优先用标题，老公告也能自动归到新分类。
  const inferred = inferType(x);
  if (inferred === '装修' || inferred === '信息服务') return inferred;
  return x.bidding?.projectType || inferred;
}

function fmtDate(v) {
  if (!v) return '';
  try {
    return ui.fmtDate ? ui.fmtDate(v) : String(v).slice(0, 10);
  } catch {
    return String(v).slice(0, 10);
  }
}

function cardHtml(x) {
  const b = x.bidding || {};
  const region = regionOf(x);
  const type = typeOf(x);
  const date = b.publishAt || x.publishedAt || x.createdAt;
  const budget = b.budget || '';
  const deadline = b.bidDeadline || '';
  return `<a class="bz-card" href="#/detail/${ui.esc(x.id)}">
    <div class="bz-card-top">
      <span class="bz-tag">${ui.esc(type)}</span>
      ${region ? `<span class="bz-region">${ui.esc(region)}</span>` : ''}
      <span class="bz-date">${ui.esc(fmtShort(date))}</span>
      <span class="bz-card-share" role="button" tabindex="0" data-share-id="${ui.esc(x.id)}" title="分享这条公告到微信" aria-label="分享到微信"><span class="wx-ic" aria-hidden="true"><i></i><i></i><i></i></span>微信</span>
    </div>
    ${x.shortVideoUrl ? '<div class="bz-video-tag">🎬 新闻播报</div>' : ''}
    <div class="bz-card-title">${ui.esc(x.title || '')}</div>
    <div class="bz-card-meta">
      ${budget ? `<span class="bz-budget">预算 ${ui.esc(budget)}</span>` : ''}
      ${deadline ? `<span>截止 ${ui.esc(deadline)}</span>` : ''}
      ${b.sourceSite || x.sourceName ? `<span class="dim">${ui.esc(b.sourceSite || x.sourceName)}</span>` : ''}
    </div>
  </a>`;
}

function groupHtml(items, activeType) {
  if (!items.length) return ui.emptyState('📭', '该筛选下暂无公告', '<div class="tiny dim mt8">每天 08:00 后自动更新；也可先看其他区域/类型</div>');
  if (activeType) return `<div class="bz-list">${items.map(cardHtml).join('')}</div>`;
  const groups = {};
  for (const x of items) {
    const t = typeOf(x);
    (groups[t] = groups[t] || []).push(x);
  }
  const order = ['工程建设', '装修', '公路', '风力', '光伏', '水电', '算力', '货物采购', '服务采购', '信息服务', '产权交易', '其他'];
  return order
    .filter((t) => groups[t]?.length)
    .map(
      (t) => `<section class="bz-group">
        <div class="bz-group-head">
          <span class="bz-group-t">${ui.esc(t)}</span>
          <span class="bz-group-n">${groups[t].length} 条</span>
        </div>
        <div class="bz-list">${groups[t].map(cardHtml).join('')}</div>
      </section>`,
    )
    .join('');
}

function queryLink(region, type) {
  const q = [];
  if (region) q.push(`region=${encodeURIComponent(region)}`);
  if (type) q.push(`type=${encodeURIComponent(type)}`);
  return `#/bidding${q.length ? '?' + q.join('&') : ''}`;
}

export async function renderBidding(ctx, query = {}) {
  const res = await service.listings({ category: 'bidding', pageSize: 100, sort: 'latest' }).catch(() => ({ items: [] }));
  const all = (res.items || []).filter(
    (x) => x && x.category === 'bidding' && ALL_REGION_IDS.has(regionOf(x)) && !looksOld(x),
  );
  const activeRegion = String(query.region || '');
  const activeType = String(query.type || '');

  let items = all.slice();
  if (activeRegion) items = items.filter((x) => regionOf(x).includes(activeRegion));
  if (activeType) items = items.filter((x) => typeOf(x) === activeType);

  const regionCounts = {};
  for (const x of all) {
    const r = regionOf(x);
    if (r) regionCounts[r] = (regionCounts[r] || 0) + 1;
  }
  const weekAgo = Date.now() - 7 * 86400_000;
  const recent = all.filter((x) => {
    const t = Date.parse(x.createdAt || x.publishedAt || '');
    return Number.isFinite(t) && t >= weekAgo;
  }).length;
  const lastTs = all
    .map((x) => Date.parse(x.bidding?.publishAt || x.publishedAt || x.createdAt || ''))
    .filter((t) => Number.isFinite(t))
    .sort((a, b) => b - a)[0];
  const lastAt = lastTs ? new Date(lastTs).toISOString() : '';

  const html = `<div class="bz-page">
    <div class="bz-hero">
      <div class="bz-hero-badge">🏛 浙江 · 江苏招投标 · 专题</div>
      <h1 class="bz-hero-t">浙江 / 江苏招投标公告，按项目分类看</h1>
      <div class="bz-hero-subrow">
        <div class="bz-hero-d">覆盖浙江 15 个区域 + 江苏 13 个设区市；每天 08:00 后自动采集更新。</div>
        <button class="bz-share-btn bz-share-hero" id="bz-share-topic" type="button"><span class="wx-ic" aria-hidden="true"><i></i><i></i><i></i></span>微信分享专题</button>
      </div>
      <div class="bz-stats">
        <div class="bz-stat"><b>${all.length}</b><span>已收录公告</span></div>
        <div class="bz-stat"><b>${Object.keys(regionCounts).length}</b><span>覆盖区域</span></div>
        <div class="bz-stat"><b>${recent}</b><span>近 7 天更新</span></div>
        <div class="bz-stat"><b>每天</b><span>更新频率</span></div>
      </div>
      <div class="bz-hero-foot">最近更新：${ui.esc(lastAt ? fmtFull(lastAt) : '待采集')} · 来源：浙江各区县公共资源交易平台（公开公告）</div>
    </div>

    <form class="bz-ai-search card" id="bz-ai-form">
      <div class="bz-ai-title">🤖 AI 搜索招投标</div>
      <div class="row gap8">
        <input class="input grow" id="bz-ai-q" maxlength="80" placeholder="例如：淳安 道路工程 预算 500 万以上 / 余杭 医院 采购">
        <button class="btn btn-primary" id="bz-ai-btn" type="submit" style="flex:none">AI 搜索</button>
      </div>
      <div class="tiny dim mt6" id="bz-ai-tip">用自然语言找公告；AI 不可用时自动退回关键词匹配</div>
    </form>

    <details class="bz-rules-card" id="bz-rules" open>
      <summary>
        <span>📋 杭州各区招投标细则</span>
        <span class="bz-rules-hint">CA 锁 / 人员备案 / 动态核查 / 社保 / 保证金 · 投标前必看</span>
      </summary>
      <div class="bz-rules-note">以下为一线操作经验整理，具体以各区交易中心及招标文件最新通知为准。</div>
      <div class="bz-rules-grid">
        ${HZ_BID_RULES.map(
          (r) => `<div class="bz-rule">
            <div class="bz-rule-head"><span class="bz-rule-ico">${r.icon}</span><b>${ui.esc(r.district)}</b></div>
            <ul>${r.items.map((x) => `<li>${ui.esc(x)}</li>`).join('')}</ul>
          </div>`,
        ).join('')}
      </div>
      <div class="bz-rules-pending">上城、拱墅、西湖、钱塘的细则待补充；<a href="#/contact-us?topic=consult&about=我想补充杭州上城/拱墅/西湖/钱塘招投标细则" style="color:#B45309;font-weight:700">提交你所在区的实操细则 ›</a></div>
      <div class="bz-assistant-cta">
        <div class="bz-assistant-main">
          <div class="bz-assistant-t">📑 AI自动化招投标助手（400万以下 · 仅限杭州）</div>
          <div class="bz-assistant-d">仅限杭州：小额交易 400 万以下，自动寻标、读标、匹配资质、编制/核查标书、读取 CA 完成投标。</div>
        </div>
        <div class="bz-assistant-buy">
          <div class="bz-assistant-price">10,000 元 / 年</div>
          <a class="bz-assistant-btn" href="#/bid-assistant">了解 / 购买 ›</a>
        </div>
      </div>
    </details>

    <section class="bz-soft-intro">
      <div class="bz-soft-head">
        <div>
          <div class="bz-soft-badge">📑 AI自动化招投标助手 · 400万以下 · 仅限杭州</div>
          <div class="bz-soft-t">仅限杭州：小额交易（400 万以下），从找标到投标交给 AI</div>
          <div class="bz-soft-d">仅限杭州区域；自主阅读招标文件、匹配资质业绩、编制与核查标书、读取 CA 锁完成投标操作；聚焦 400 万元以下小额项目。</div>
        </div>
        <a class="bz-soft-buy" href="#/bid-assistant">10,000 元/年 · 了解 / 购买 ›</a>
      </div>
      <div class="bz-soft-main">
        <div class="bz-soft-video">
          <video controls preload="metadata" playsinline poster="/docs/bid-software-poster.jpg">
            <source src="/docs/bid-software-intro-blur.mp4" type="video/mp4">
          </video>
          <div class="bz-soft-video-cap">49 秒演示 · AI 自动投标操作</div>
        </div>
        <div class="bz-soft-points">
          <div class="bz-soft-point"><b>个性寻标</b><span>自主阅读招标公告（含 PDF、压缩包），提炼资质/人员要求，精准匹配可投项目。</span></div>
          <div class="bz-soft-point"><b>资质管理</b><span>智能管理企业资质，匹配资信与业绩，编制投标文件，自主审查文件格式。</span></div>
          <div class="bz-soft-point"><b>小额直投（400 万以下）</b><span>自主下载招标文件、评估可行性、匹配企业资料，完成报名、投标、开标。</span></div>
        </div>
      </div>
      <div class="bz-soft-pains"><b>解决痛点：</b>400 万以下项目流程一样重、人工投不划算；找标读标耗人、易漏标；标书反复改、格式易错；多系统 CA 锁冲突、反复登录上传、开标跑现场。</div>
    </section>

    <details class="bz-rules-card bz-js-rules" open>
      <summary>
        <span>📌 江苏小额交易规则</span>
        <span class="bz-rules-hint">施工 400 万 / 货物 200 万 / 服务 100 万 · 苏服采 · 禁止抽签</span>
      </summary>
      <div class="bz-js-rule-grid">
        <div><b>依法必招</b><span>施工 ≥400 万、货物 ≥200 万、服务 ≥100 万，进公共资源交易平台。</span></div>
        <div><b>政府采购</b><span>分散采购限额统一 100 万；100 万以下走苏服采商城或内控自行组织。</span></div>
        <div><b>定标方式</b><span>合理低价 / 经评审最低价 / 综合评分；不得抽签摇号直接确定中标候选人。</span></div>
        <div><b>准入与到场</b><span>多地须先入预选承包商名录；部分要求授权委托人本人到场、社保连续核验。</span></div>
      </div>
      <div class="bz-rules-note">按台账整理，具体以官方文件和各项目招标文件为准；浙江的抽签口径不能直接套用到江苏。</div>
    </details>

    <div class="bz-filter card">
      <div class="bz-filter-row"><span class="bz-label">区域</span>
        <div class="chips scroll">
          ${HZ_REGIONS.map((r) => `<a class="chip ${activeRegion === r.id ? 'active' : ''}" href="${queryLink(r.id, activeType)}">${r.name}${r.id && regionCounts[r.id] ? ` (${regionCounts[r.id]})` : ''}</a>`).join('')}
        </div>
      </div>
      <div class="bz-filter-row"><span class="bz-label">地市</span>
        <div class="chips scroll">
          ${CITY_REGIONS.map((r) => `<a class="chip ${activeRegion === r.id ? 'active' : ''}" href="${queryLink(r.id, activeType)}">${r.name}${regionCounts[r.id] ? ` (${regionCounts[r.id]})` : ''}</a>`).join('')}
        </div>
      </div>
      <div class="bz-filter-row"><span class="bz-label">江苏</span>
      <div class="chips scroll">
        ${JS_REGIONS.map((r) => `<a class="chip ${activeRegion === r.id ? 'active' : ''}" href="${queryLink(r.id, activeType)}">${r.name}${regionCounts[r.id] ? ` (${regionCounts[r.id]})` : ''}</a>`).join('')}
      </div>
    </div>
    <div class="bz-filter-row"><span class="bz-label">项目类型</span>
        <div class="chips scroll">
          ${TYPES.map((t) => `<a class="chip ${activeType === t.id ? 'active' : ''}" href="${queryLink(activeRegion, t.id)}">${t.name}</a>`).join('')}
        </div>
      </div>
    </div>

    <div class="bz-region-sites">
      <span class="bz-region-sites-label">各地官网</span>
      ${REGIONS.filter((r) => r.id && REGION_SITES[r.id]).map((r) => `<a href="${REGION_SITES[r.id]}" target="_blank" rel="noopener">${r.name} ↗</a>`).join('')}
    </div>

    <div class="bz-result-head">
      <div class="strong">${activeRegion ? ui.esc(activeRegion) : '浙江全省'} · ${activeType ? ui.esc(activeType) : '按项目分类'}</div>
      <span class="tiny dim" id="bz-count">${items.length} 条</span>
    </div>
    <div id="bz-results">${groupHtml(items, activeType)}</div>

    <div class="bz-sources card">
      <div class="row between mb8">
        <div class="strong">📡 数据来源（${SOURCES.length} 个）</div>
        <span class="tiny dim">已接入 ${SOURCES.filter((x) => x.status === '已接入').length} 个 · 待接入 ${SOURCES.filter((x) => x.status === '待接入').length} 个 · 仅通知 ${SOURCES.filter((x) => x.status === '仅通知').length} 个</span>
      </div>
      <div class="bz-source-grid">
        ${SOURCES.map((s) => `<a class="bz-source" href="${ui.esc(s.url)}" target="_blank" rel="noopener">
          <div class="bz-source-top"><span>${ui.esc(s.region)}</span><span class="bz-source-status ${s.status === '已接入' ? 'ok' : 'wait'}">${ui.esc(s.status)}</span></div>
          <div class="bz-source-name">${ui.esc(s.name)}</div>
          ${s.note ? `<div class="bz-source-note">${ui.esc(s.note)}</div>` : ''}
        </a>`).join('')}
      </div>
      <div class="tiny dim mt8">采集范围：公开招标公告/交易公告；不含登录区、个人数据；原文链接可回源核对。</div>
    </div>
  </div>`;

  return {
    title: '浙江 · 江苏招投标',
    content: html,
    activeTab: '',
    showBack: true,
    noTab: true,
    async mount(root) {
      const form = root.querySelector('#bz-ai-form');
      const input = root.querySelector('#bz-ai-q');
      const btn = root.querySelector('#bz-ai-btn');
      const tip = root.querySelector('#bz-ai-tip');
      const results = root.querySelector('#bz-results');
      const count = root.querySelector('#bz-count');

      // 微信/朋友圈分享：专题页和每条公告都走统一的「文字+链接 / 图片+文字」
      try {
        document.title = '浙江 · 江苏招投标公告 | 小鱼来了';
        let meta = document.querySelector('meta[name="description"]');
        if (!meta) {
          meta = document.createElement('meta');
          meta.name = 'description';
          document.head.appendChild(meta);
        }
        meta.setAttribute('content', '浙江、江苏招投标公告，按项目分类，每天更新，支持 AI 搜索与分享。');
      } catch { /* ignore */ }

      const shareMod = await import('./share.js').catch(() => null);
      // 微信内浏览器：配置右上角原生分享卡片（未接公众号时静默跳过）
      shareMod?.setupWechatTopicShare?.({
        title: '浙江 · 江苏招投标公告',
        desc: `已收录 ${all.length} 条公告，覆盖浙江 15 个区域 + 江苏 13 个设区市，每天更新。`,
        url: location.href,
        image: '/static/logo@2x.png',
      }).catch(() => {});
      const byId = new Map(all.map((x) => [x.id, x]));
      const shareTopic = () => {
        shareMod?.openQuickShare({
          title: '浙江 · 江苏招投标公告',
          desc: `已收录 ${all.length} 条公告，覆盖杭州区县、浙江其他地市及江苏 13 个设区市；每天更新。`,
          url: location.href,
          image: '/static/logo@2x.png',
          tag: '浙江 · 江苏招投标',
        });
      };
      const shareItem = (x) => {
        if (!x) return;
        const b = x.bidding || {};
        const desc = [regionOf(x), typeOf(x), b.budget ? `预算 ${b.budget}` : '', b.bidDeadline ? `截止 ${b.bidDeadline}` : '']
          .filter(Boolean)
          .join(' · ');
        shareMod?.openQuickShare({
          title: `【浙江 · 江苏招投标】${x.title || '公告'}`,
          desc: desc || '浙江公共资源交易公告',
          url: `${location.origin}/#/detail/${x.id}`,
          image: x.coverUrl || '/static/logo@2x.png',
          tag: '招投标',
        });
      };
      root.querySelector('#bz-share-topic')?.addEventListener('click', (e) => {
        e.preventDefault();
        shareTopic();
      });
      root.addEventListener('click', (e) => {
        const el = e.target.closest('[data-share-id]');
        if (!el) return;
        e.preventDefault();
        e.stopPropagation();
        shareItem(byId.get(String(el.dataset.shareId || '')));
      });

      if (!form) return;
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const q = String(input?.value || '').trim();
        if (!q) return;
        btn.disabled = true;
        btn.textContent = 'AI 搜索中…';
        tip.textContent = '正在检索全库招投标公告…';
        try {
          const r = await service.listingsAiSearch({ query: q, category: 'bidding' });
          let list = (r.items || []).filter(
            (x) => x && x.category === 'bidding' && ALL_REGION_IDS.has(regionOf(x)) && !looksOld(x),
          );
          if (activeRegion) list = list.filter((x) => regionOf(x).includes(activeRegion));
          if (activeType) list = list.filter((x) => typeOf(x) === activeType);
          results.innerHTML = groupHtml(list, activeType);
          count.textContent = `${list.length} 条`;
          tip.textContent = `AI 搜索「${q}」：${list.length} 条` +
            (r.mode === 'ai' ? ' · AI 语义匹配' : ' · 关键词匹配（AI 暂不可用）');
        } catch (err) {
          tip.textContent = err.message || 'AI 搜索失败，请稍后再试';
        } finally {
          btn.disabled = false;
          btn.textContent = 'AI 搜索';
        }
      });
    },
  };
}

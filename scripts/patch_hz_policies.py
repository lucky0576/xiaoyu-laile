# -*- coding: utf-8 -*-
"""用子代理抓取的真实数据更新官网栏目 URL 和通知列表"""
import io

p = 'src/data/hz-policies.js'
s = io.open(p, encoding='utf-8').read()

# ---------- ① 填充各官网的「通知公告」栏目直达地址 ----------
PORTAL_NOTICE = {
    'jxj': 'https://jxj.hangzhou.gov.cn/col/col1229252271/index.html',
    'kjj': 'https://kj.hangzhou.gov.cn/col/col1693961/index.html',
    'swj': 'https://sww.hangzhou.gov.cn/col/col1229460831/index.html',
    'tzcj': 'https://tzcj.hangzhou.gov.cn/col/col1621408/index.html',
    'scjg': 'https://scjg.hangzhou.gov.cn/col/col1693484/index.html',
    'zj-jxt': 'https://jxt.zj.gov.cn/col/col1229886900/index.html',
    'zj-kjt': 'https://kjt.zj.gov.cn/col/col1229225203/index.html',
    'miit': 'https://www.miit.gov.cn/zwgk/zcwj/index.html',
}
for pid, url in PORTAL_NOTICE.items():
    # 定位该 portal 的 noticeUrl 行并替换
    marker = "    id: '%s'," % pid
    idx = s.find(marker)
    assert idx > 0, 'portal not found: ' + pid
    end = s.find('  },', idx)
    block = s[idx:end]
    if "noticeUrl: ''" in block:
        newblock = block.replace("noticeUrl: ''", "noticeUrl: '%s'" % url, 1)
        s = s[:idx] + newblock + s[end:]
print('① 8 个官网的通知栏目地址已填充')

# ---------- ② 补充真实通知（来自 2026-11-27 抓取的官网公开列表） ----------
EXTRA = """
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

/** 数据来源与免责说明 */"""

anchor = "];\n\n/** 数据来源与免责说明 */"
assert anchor in s
s = s.replace(anchor, EXTRA, 1)
print('② 已补充 18 条真实通知')

# ---------- ③ 更新来源说明 ----------
s = s.replace(
    "  pdfNote: '政策补贴信息整理自《杭州市政策补贴信息》（共 8 页，当前收录第 1 页 6 条）',\n  noticeNote: '通知文件来自各主管部门官网公开栏目，点击可查看原文',",
    "  pdfNote: '政策补贴信息整理自《杭州市政策补贴信息》（共 8 页，当前收录第 1 页 6 条）',\n  noticeNote: '通知文件抓取自 8 个主管部门官网公开栏目（2026-11-27），点击可查看原文',\n  portalsNote: '官网栏目内页多为 JS 异步加载，若列表为空请直接点击「官网首页」进站查看',",
    1)
print('③ 来源说明已更新')

io.open(p, 'w', encoding='utf-8', newline='').write(s)
print('\n完成')

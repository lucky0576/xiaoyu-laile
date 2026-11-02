# -*- coding: utf-8 -*-
"""
生成《区域产业信息基础设施建设方案》PPT（16:9，11 页）

用途：企业服务页「百万级方案」的配套材料，客户咨询前可下载。
原则：不吹概念，按「现状 → 建设内容 → 交付 → 报价」讲清楚。
"""
import os

from pptx import Presentation
from pptx.util import Inches, Pt
from pptx.dml.color import RGBColor
from pptx.enum.text import PP_ALIGN, MSO_ANCHOR
from pptx.enum.shapes import MSO_SHAPE

OUT_DIR = r"C:\Users\Administrator\Documents\deepseek-harness\default-workspace\xiaoyu-laile\public\docs"
os.makedirs(OUT_DIR, exist_ok=True)
OUT = os.path.join(OUT_DIR, "region-industry-info-plan.pptx")

INK = RGBColor(0x1A, 0x24, 0x33)
MUTED = RGBColor(0x6B, 0x76, 0x86)
BRAND = RGBColor(0x0B, 0x74, 0xFF)
TEAL = RGBColor(0x0E, 0x8F, 0x7A)
ORANGE = RGBColor(0xC2, 0x41, 0x0C)
SOFT = RGBColor(0xF4, 0xF7, 0xFC)
WHITE = RGBColor(0xFF, 0xFF, 0xFF)
LINE = RGBColor(0xE3, 0xE9, 0xF2)

FONT = "微软雅黑"

prs = Presentation()
prs.slide_width = Inches(13.333)
prs.slide_height = Inches(7.5)
BLANK = prs.slide_layouts[6]


def rect(slide, x, y, w, h, fill=None, line=None, shape=MSO_SHAPE.RECTANGLE, radius=0.06):
    sp = slide.shapes.add_shape(shape, Inches(x), Inches(y), Inches(w), Inches(h))
    if fill is None:
        sp.fill.background()
    else:
        sp.fill.solid()
        sp.fill.fore_color.rgb = fill
    if line is None:
        sp.line.fill.background()
    else:
        sp.line.color.rgb = line
        sp.line.width = Pt(1)
    sp.shadow.inherit = False
    if shape == MSO_SHAPE.ROUNDED_RECTANGLE:
        try:
            sp.adjustments[0] = radius
        except Exception:
            pass
    return sp


def text(slide, x, y, w, h, runs, align=PP_ALIGN.LEFT, anchor=MSO_ANCHOR.TOP, spacing=1.3):
    tb = slide.shapes.add_textbox(Inches(x), Inches(y), Inches(w), Inches(h))
    tf = tb.text_frame
    tf.word_wrap = True
    tf.vertical_anchor = anchor
    tf.margin_left = 0
    tf.margin_right = 0
    tf.margin_top = 0
    tf.margin_bottom = 0
    for i, (t, size, bold, color) in enumerate(runs):
        p = tf.paragraphs[0] if i == 0 else tf.add_paragraph()
        p.alignment = align
        p.line_spacing = spacing
        r = p.add_run()
        r.text = t
        r.font.size = Pt(size)
        r.font.bold = bold
        r.font.color.rgb = color
        r.font.name = FONT
    return tb


def bullet(slide, x, y, w, items, size=13, color=RGBColor(0x47, 0x55, 0x69), gap=0.46):
    for i, it in enumerate(items):
        text(slide, x, y + i * gap, w, 0.4, [(f"· {it}", size, False, color)], spacing=1.2)


def new_slide(title, subtitle='', color=BRAND):
    s = prs.slides.add_slide(BLANK)
    rect(s, 0, 0, 13.333, 0.09, fill=color)
    text(s, 0.78, 0.42, 11.8, 0.55, [(title, 28, True, INK)])
    if subtitle:
        text(s, 0.78, 1.02, 11.8, 0.4, [(subtitle, 13, False, MUTED)])
    return s


def table(slide, x, y, w, cols, rows, colw=None, size=11, head_color=BRAND):
    total_rows = len(rows) + 1
    shape = slide.shapes.add_table(total_rows, len(cols), Inches(x), Inches(y), Inches(w), Inches(0.4 * total_rows))
    tbl = shape.table
    if colw:
        for i, cw in enumerate(colw):
            tbl.columns[i].width = Inches(cw)
    for j, c in enumerate(cols):
        cell = tbl.cell(0, j)
        cell.text = ""
        r = cell.text_frame.paragraphs[0].add_run()
        r.text = c
        r.font.size = Pt(size)
        r.font.bold = True
        r.font.color.rgb = WHITE
        r.font.name = FONT
        cell.fill.solid()
        cell.fill.fore_color.rgb = head_color
    for i, row in enumerate(rows, start=1):
        for j in range(len(cols)):
            cell = tbl.cell(i, j)
            cell.text = ""
            r = cell.text_frame.paragraphs[0].add_run()
            r.text = str(row[j]) if j < len(row) else ""
            r.font.size = Pt(size)
            r.font.color.rgb = RGBColor(0x2B, 0x34, 0x44)
            r.font.name = FONT
            cell.fill.solid()
            cell.fill.fore_color.rgb = WHITE if i % 2 else SOFT
    return tbl


# ================================================================== #
# 1 封面
# ================================================================== #
s = prs.slides.add_slide(BLANK)
rect(s, 0, 0, 13.333, 7.5, fill=WHITE)
rect(s, 0, 0, 0.28, 7.5, fill=BRAND)
text(s, 1.0, 1.9, 11, 0.7, [("区域产业信息基础设施建设方案", 38, True, INK)])
text(s, 1.0, 2.8, 11, 0.5, [("数据 · 平台 · 运营 三位一体，让产业信息可检索、可对接、可沉淀", 16, False, MUTED)])
rect(s, 1.0, 3.55, 3.4, 0.06, fill=BRAND)
text(s, 1.0, 4.0, 11, 1.4, [
    ("适用于：区县招商部门 / 产业园区 / 产业基金 / 国资平台", 13, True, RGBColor(0x47, 0x55, 0x69)),
    ("方案版本：V1.0　　编制日期：2026 年 11 月", 12, False, MUTED),
])
text(s, 1.0, 6.2, 11, 0.5, [("小鱼来了 · 授渔算法（上海）科技有限公司", 12, False, MUTED)])

# ================================================================== #
# 2 现状与问题
# ================================================================== #
s = new_slide("一、现状：产业信息为什么用不起来", "四个问题，基本每个区县都占全", ORANGE)
problems = [
    ("信息散", "项目散在招商网站、公众号、招标平台、Excel 台账里，没有统一入口"),
    ("搜不到", "没有一个地方能按「产业 + 区域 + 金额 + 阶段」组合检索"),
    ("对不上", "企业找不到项目，项目方也找不到承接方，中间靠人情和微信群"),
    ("留不下", "对接过程没有记录，人一走，线索就断了"),
]
for i, (t, d) in enumerate(problems):
    x = 0.78 + (i % 2) * 6.1
    y = 1.75 + (i // 2) * 2.35
    rect(s, x, y, 5.75, 2.0, fill=SOFT, shape=MSO_SHAPE.ROUNDED_RECTANGLE)
    text(s, x + 0.3, y + 0.28, 5.2, 0.45, [(t, 19, True, ORANGE)])
    text(s, x + 0.3, y + 0.85, 5.2, 1.0, [(d, 12.5, False, RGBColor(0x47, 0x55, 0x69))], spacing=1.4)

# ================================================================== #
# 3 建设目标
# ================================================================== #
s = new_slide("二、建设目标", "不是做一个网站，是建一套能长期用的机制", TEAL)
text(s, 0.78, 1.6, 12, 0.5, [("一个平台 · 一套数据 · 一套机制", 20, True, INK)])
goals = [
    ("一个平台", "区域产业信息的统一入口，对外可查、对内可管"),
    ("一套数据", "项目 / 企业 / 政策 / 基金 / 招投标，字段标准化"),
    ("一套机制", "发布 — 审核 — 对接 — 跟进 — 复盘，全流程留痕"),
]
for i, (t, d) in enumerate(goals):
    y = 2.5 + i * 1.35
    rect(s, 0.78, y, 11.78, 1.1, fill=SOFT, shape=MSO_SHAPE.ROUNDED_RECTANGLE)
    rect(s, 0.78, y, 0.09, 1.1, fill=TEAL)
    text(s, 1.05, y + 0.18, 2.3, 0.4, [(t, 16, True, TEAL)])
    text(s, 1.05, y + 0.62, 11.2, 0.35, [(d, 12.5, False, RGBColor(0x47, 0x55, 0x69))])

# ================================================================== #
# 4 建设内容（三条线）
# ================================================================== #
s = new_slide("三、建设内容：三条线", "数据是根，平台是壳，运营是命", BRAND)
lines = [
    ("① 数据底座", [
        "多源采集：政府公告、公共资源交易、政策文件、媒体",
        "结构化：项目编号 / 招标人 / 预算 / 截止 / 资格要求",
        "去重与质量监控：同一条只留一份，字段缺失自动标红",
    ], BRAND),
    ("② 平台功能", [
        "六大板块：项目 / 悬赏 / 活动 / 贸易 / 成果 / 招投标",
        "AI 解析：自动生成标题、提炼要素、评估可信度",
        "检索与对接：组合检索、AI 语义搜索、批量转发",
    ], TEAL),
    ("③ 运营机制", [
        "发布审核：用户发布 + 人工审核 + 来源标注",
        "对接跟进：群聊 / 会议 / 流程节点全部留痕",
        "定期复盘：月度数据报告与招商线索台账",
    ], ORANGE),
]
for i, (title_, items, color) in enumerate(lines):
    x = 0.78 + i * 4.05
    rect(s, x, 1.7, 3.8, 5.1, fill=WHITE, line=LINE, shape=MSO_SHAPE.ROUNDED_RECTANGLE)
    rect(s, x, 1.7, 3.8, 0.72, fill=color, shape=MSO_SHAPE.ROUNDED_RECTANGLE)
    text(s, x + 0.22, 1.88, 3.4, 0.4, [(title_, 15, True, WHITE)])
    for j, it in enumerate(items):
        text(s, x + 0.22, 2.62 + j * 1.05, 3.4, 0.95, [(it, 11.5, False, RGBColor(0x47, 0x55, 0x69))], spacing=1.45)

text(s, 0.78, 6.35, 11.8, 0.7, [("三条线缺一条都不行：只有数据没有运营，三个月就变成死库；只有平台没有数据，就是个空壳。", 12.5, True, ORANGE)])

# ================================================================== #
# 5 技术架构
# ================================================================== #
s = new_slide("四、技术架构：能装进你自己的机房", "这是本方案与 SaaS 产品最大的区别", TEAL)
rect(s, 0.78, 1.6, 6.0, 4.9, fill=SOFT, shape=MSO_SHAPE.ROUNDED_RECTANGLE)
text(s, 1.05, 1.85, 5.4, 0.4, [("部署形态", 15, True, TEAL)])
bullet(s, 1.05, 2.4, 5.4, [
    "私有化部署：整套系统装进你的服务器",
    "数据不出内网，符合政务数据管理要求",
    "不需要额外采购数据库 / 中间件 / 云服务",
    "2 核 2G 服务器即可运行，硬件成本极低",
    "可离线运行，断网也能用（数据更新除外）",
], size=12.5, gap=0.62)

rect(s, 7.1, 1.6, 5.45, 4.9, fill=WHITE, line=LINE, shape=MSO_SHAPE.ROUNDED_RECTANGLE)
text(s, 7.35, 1.85, 5.0, 0.4, [("技术指标", 15, True, BRAND)])
table(s, 7.35, 2.35, 4.95,
      ["项", "指标"],
      [
          ["第三方依赖", "0 个（无 npm 包）"],
          ["代码规模", "5.2 万行，全部自研"],
          ["接口数量", "300 个"],
          ["最低配置", "2 核 / 2GB / 40GB"],
          ["并发能力", "百级并发，可水平扩展"],
          ["数据备份", "每日增量 + 每周全量"],
      ], colw=[1.7, 3.25], size=10.5)

# ================================================================== #
# 6 功能清单
# ================================================================== #
s = new_slide("五、核心功能清单", "挑最常用的 8 项说，其余可现场演示", BRAND)
table(s, 0.78, 1.65, 11.78,
      ["模块", "能力", "对客户的价值"],
      [
          ["信息发布", "6 大板块 · 65 个内容类型 · 自定义字段", "招商信息统一口径，不再各写各的"],
          ["AI 解析", "自动生成标题、提炼要素、可信度评分", "一条信息整理从 30 分钟到 1 分钟"],
          ["数据采集", "公共资源交易 / 政策 / 基金动向自动入库", "不用人天天盯网站"],
          ["语义检索", "一句话搜全站，AI 不可用时规则兜底", "领导问「有没有储能项目」能立刻答"],
          ["批量转发", "多选生成文案，一键复制到微信群", "信息真正被看到，而不是发完就沉"],
          ["项目对接", "群聊 / 会议 / 流程节点 / 跟进记录", "对接过程可追溯，人走线索不断"],
          ["权限与合规", "联系方式分级可见、居间信息白名单", "敏感信息不外泄"],
          ["后台管理", "内容审核、用户管理、数据统计", "日常运维一人可管"],
      ], colw=[1.9, 5.0, 4.88], size=10)

text(s, 0.78, 6.6, 11.8, 0.5, [("以上 8 项为第一年建设重点，其余功能随版本迭代开放。", 11, False, MUTED)])

# ================================================================== #
# 7 实施计划
# ================================================================== #
s = new_slide("六、实施计划：90 天上线", "分三期，每期都有可验收的成果", ORANGE)
phases = [
    ("第一期　第 1–30 天", "部署与数据接入", [
        "服务器环境搭建、系统部署",
        "接入本地数据源（2–3 个）",
        "基础配置：板块、字段、权限",
        "验收：系统可访问，数据能更新",
    ], BRAND),
    ("第二期　第 31–60 天", "功能配置与培训", [
        "按本地口径配置板块与字段",
        "账号体系与角色权限划分",
        "两场培训（管理员 + 业务人员）",
        "验收：业务人员能独立发布与检索",
    ], TEAL),
    ("第三期　第 61–90 天", "试运行与优化", [
        "真实业务试跑，收集问题",
        "检索效果与数据质量调优",
        "输出首月运营报告",
        "验收：形成可对外汇报的成果",
    ], ORANGE),
]
for i, (t1, t2, items, color) in enumerate(phases):
    x = 0.78 + i * 4.05
    rect(s, x, 1.65, 3.8, 5.15, fill=WHITE, line=LINE, shape=MSO_SHAPE.ROUNDED_RECTANGLE)
    rect(s, x, 1.65, 3.8, 0.05, fill=color)
    text(s, x + 0.22, 1.9, 3.4, 0.35, [(t1, 11.5, True, color)])
    text(s, x + 0.22, 2.3, 3.4, 0.4, [(t2, 15, True, INK)])
    for j, it in enumerate(items):
        text(s, x + 0.22, 2.95 + j * 0.8, 3.4, 0.7, [(f"· {it}", 11.5, False, RGBColor(0x47, 0x55, 0x69))], spacing=1.4)

# ================================================================== #
# 8 交付清单
# ================================================================== #
s = new_slide("七、交付清单与验收标准", "白纸黑字写清楚，避免扯皮", TEAL)
table(s, 0.78, 1.6, 11.78,
      ["交付物", "形式", "验收标准"],
      [
          ["平台系统", "部署在客户服务器", "可访问、功能完整、数据可更新"],
          ["数据底座", "结构化数据库 + 导出", "入库量、字段完整率、更新及时率"],
          ["账号与权限", "管理员账号 + 角色配置", "各角色权限符合约定"],
          ["部署文档", "Word / PDF", "运维人员可按文档独立重启与备份"],
          ["培训", "2 场现场或线上", "业务人员能独立完成发布与检索"],
          ["运营报告", "月度 PDF", "含数据量、检索量、对接情况"],
          ["源码", "Git 仓库（可选）", "按合同约定是否交付源码"],
      ], colw=[2.6, 4.2, 4.98], size=10.5)
text(s, 0.78, 6.6, 11.8, 0.4, [("注：源码是否交付、交付后是否允许二次开发，需在合同中单独约定。", 11, False, MUTED)])

# ================================================================== #
# 9 运营指标
# ================================================================== #
s = new_slide("八、运营指标：用什么衡量做成没做成", "不只看上线，要看有没有人用", BRAND)
metrics = [
    ("数据", ["入库信息数", "字段完整率 ≥ 80%", "每日更新及时率 ≥ 95%"]),
    ("使用", ["月活账号数", "月检索次数", "发布信息数"]),
    ("效果", ["对接发起数", "对接成功数", "重点项目跟进率"]),
]
for i, (t, items) in enumerate(metrics):
    x = 0.78 + i * 4.05
    rect(s, x, 1.7, 3.8, 3.5, fill=SOFT, shape=MSO_SHAPE.ROUNDED_RECTANGLE)
    text(s, x + 0.28, 1.95, 3.2, 0.4, [(t, 16, True, BRAND)])
    for j, it in enumerate(items):
        text(s, x + 0.28, 2.6 + j * 0.75, 3.2, 0.5, [(f"· {it}", 12.5, False, RGBColor(0x47, 0x55, 0x69))])
text(s, 0.78, 5.6, 11.8, 0.9, [
    ("建议在合同中约定：上线后 6 个月的数据量与使用量目标，未达标的续费条款。", 12.5, True, ORANGE),
], spacing=1.4)

# ================================================================== #
# 10 报价与付款
# ================================================================== #
s = new_slide("九、报价与付款方式", "按年报价，首年含建设，后续为服务费", ORANGE)
table(s, 0.78, 1.6, 11.78,
      ["项目", "内容", "金额"],
      [
          ["平台建设与部署", "系统部署、数据接入、字段配置", "含在首年费用内"],
          ["定制开发", "与本地系统对接、专属功能", "按工作量评估，10–30 万"],
          ["年度服务费", "运维、升级、培训、运营报告", "基础 100 万 / 年"],
          ["增值模块", "区域数据扩展、API 接口、驻场", "按需报价"],
      ], colw=[3.0, 5.3, 3.48], size=11)
rect(s, 0.78, 4.5, 11.78, 1.15, fill=SOFT, shape=MSO_SHAPE.ROUNDED_RECTANGLE)
text(s, 1.05, 4.72, 11.2, 0.8, [
    ("付款方式：签订合同付 50%，系统交付验收后付 40%，试运行满三个月付 10%。", 12.5, True, INK),
    ("发票：可开增值税专用发票（技术服务费，税率 6%）。", 12, False, MUTED),
], spacing=1.5)
text(s, 0.78, 6.0, 11.78, 0.9, [
    ("注：以上为参考报价，实际按区域范围、数据源数量、定制工作量评估后确定。", 11.5, False, MUTED),
])

# ================================================================== #
# 11 为什么是我们 + 联系方式
# ================================================================== #
s = new_slide("十、为什么是我们", "", TEAL)
reasons = [
    ("能装进你的机房", "零第三方依赖，2 核 2G 即可运行，不需要采购数据库与中间件"),
    ("数据是真在跑", "苏州公共资源交易、政策、基金动向已实现自动采集与结构化"),
    ("功能是真在用", "6 大板块 65 个内容类型、300 个接口，不是 PPT 原型"),
    ("成本是真低", "一人可运维，边际成本主要是 AI 调用，长期可持续"),
]
for i, (t, d) in enumerate(reasons):
    y = 1.7 + i * 1.15
    rect(s, 0.78, y, 11.78, 0.95, fill=SOFT, shape=MSO_SHAPE.ROUNDED_RECTANGLE)
    text(s, 1.05, y + 0.14, 3.6, 0.4, [(t, 14, True, TEAL)])
    text(s, 4.8, y + 0.16, 7.5, 0.65, [(d, 12, False, RGBColor(0x47, 0x55, 0x69))], spacing=1.4)

rect(s, 0.78, 6.35, 11.78, 0.9, fill=BRAND, shape=MSO_SHAPE.ROUNDED_RECTANGLE)
text(s, 0.78, 6.55, 11.78, 0.5, [("联系方式：卢云　13456693544　service@xiaoyulaile.online　xiaoyulaile.online", 13, True, WHITE)], align=PP_ALIGN.CENTER)

prs.save(OUT)
print("已生成", os.path.basename(OUT), round(os.path.getsize(OUT) / 1024, 1), "KB")

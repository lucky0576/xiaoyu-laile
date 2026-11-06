# -*- coding: utf-8 -*-
"""
生成「杭州科技火炬大赛」复赛商业计划书 PPT（16:9）

设计思路：
  · 深蓝商务风 + 品牌蓝，白底卡片，评委翻得快也能看清重点
  · 每页一个结论式标题，正文用短句 + 数字，不堆长段落
  · 产品截图 / 二维码用真实截图，不画假 UI
  · 图表用原生 python-pptx chart，数据可编辑

用法：
    python scripts/make-bp-torch.py
输出：
    growth/火炬大赛BP/【数字经济+杭州小鱼来了科技有限公司+卢云】商业计划书.pptx
"""

import os

from pptx import Presentation
from pptx.chart.data import CategoryChartData
from pptx.dml.color import RGBColor
from pptx.enum.chart import XL_CHART_TYPE, XL_LEGEND_POSITION
from pptx.enum.shapes import MSO_SHAPE
from pptx.enum.text import PP_ALIGN, MSO_ANCHOR
from pptx.util import Inches, Pt, Emu

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SHOTS = os.path.join(os.path.dirname(ROOT), "bp-shots")
OUT_DIR = os.path.join(ROOT, "growth", "火炬大赛BP")
OUT_FILE = os.path.join(OUT_DIR, "【数字经济+杭州小鱼来了科技有限公司+卢云】商业计划书.pptx")

# ---------------- 主题 ----------------
NAVY = RGBColor(0x0B, 0x1F, 0x3A)
BLUE = RGBColor(0x0B, 0x74, 0xFF)
TEAL = RGBColor(0x0E, 0x8F, 0x7A)
GRAY = RGBColor(0x5B, 0x66, 0x75)
LIGHT = RGBColor(0xF5, 0xF7, 0xFA)
WHITE = RGBColor(0xFF, 0xFF, 0xFF)
ORANGE = RGBColor(0xFF, 0x8A, 0x00)
FONT = "微软雅黑"

SW = Inches(13.333)
SH = Inches(7.5)


def set_font(run, size=14, bold=False, color=NAVY, font=FONT):
    run.font.size = Pt(size)
    run.font.bold = bold
    run.font.color.rgb = color
    run.font.name = font
    rpr = run._r.get_or_add_rPr()
    for tag in ("a:latin", "a:ea", "a:cs"):
        el = rpr.find("{http://schemas.openxmlformats.org/drawingml/2006/main}" + tag.split(":")[1])
        if el is None:
            from lxml import etree

            el = etree.SubElement(rpr, "{http://schemas.openxmlformats.org/drawingml/2006/main}" + tag.split(":")[1])
        el.set("typeface", font)


def text(slide, x, y, w, h, content, size=14, bold=False, color=NAVY, align=PP_ALIGN.LEFT, anchor=MSO_ANCHOR.TOP, spacing=1.15):
    box = slide.shapes.add_textbox(x, y, w, h)
    tf = box.text_frame
    tf.word_wrap = True
    tf.vertical_anchor = anchor
    tf.margin_left = 0
    tf.margin_right = 0
    tf.margin_top = 0
    tf.margin_bottom = 0
    lines = content.split("\n") if isinstance(content, str) else content
    for i, line in enumerate(lines):
        p = tf.paragraphs[0] if i == 0 else tf.add_paragraph()
        p.alignment = align
        p.line_spacing = spacing
        run = p.add_run()
        run.text = line
        set_font(run, size, bold, color)
    return box


def bullets(slide, x, y, w, h, items, size=13, color=NAVY, gap=6):
    box = slide.shapes.add_textbox(x, y, w, h)
    tf = box.text_frame
    tf.word_wrap = True
    tf.margin_left = 0
    tf.margin_right = 0
    tf.margin_top = 0
    tf.margin_bottom = 0
    for i, item in enumerate(items):
        p = tf.paragraphs[0] if i == 0 else tf.add_paragraph()
        p.space_after = Pt(gap)
        p.line_spacing = 1.2
        r = p.add_run()
        r.text = item
        set_font(r, size, False, color)
    return box


def rect(slide, x, y, w, h, fill=WHITE, line=None, radius=0.06, shadow=False):
    shape_type = MSO_SHAPE.ROUNDED_RECTANGLE if radius else MSO_SHAPE.RECTANGLE
    shp = slide.shapes.add_shape(shape_type, x, y, w, h)
    if radius:
        try:
            shp.adjustments[0] = radius
        except Exception:
            pass
    shp.fill.solid()
    shp.fill.fore_color.rgb = fill
    if line is None:
        shp.line.fill.background()
    else:
        shp.line.color.rgb = line
        shp.line.width = Pt(1)
    shp.shadow.inherit = shadow
    return shp


def slide_base(prs, title, subtitle=None, page=None, kicker=None):
    slide = prs.slides.add_slide(prs.slide_layouts[6])
    # 顶部装饰条
    rect(slide, 0, 0, SW, Inches(0.09), fill=BLUE, radius=0)
    if kicker:
        text(slide, Inches(0.7), Inches(0.42), Inches(9), Inches(0.3), kicker, size=11, bold=True, color=BLUE)
        title_y = Inches(0.72)
    else:
        title_y = Inches(0.55)
    text(slide, Inches(0.7), title_y, Inches(11.2), Inches(0.6), title, size=24, bold=True, color=NAVY)
    if subtitle:
        text(slide, Inches(0.7), title_y + Inches(0.62), Inches(11.4), Inches(0.4), subtitle, size=12.5, color=GRAY)
    # 页脚
    text(slide, Inches(0.7), Inches(7.05), Inches(7), Inches(0.3), "小鱼来了 · 产业信息 + AI 短视频 + 算力消纳", size=9, color=GRAY)
    if page is not None:
        text(slide, Inches(11.9), Inches(7.05), Inches(0.8), Inches(0.3), f"{page:02d}", size=9, bold=True, color=GRAY, align=PP_ALIGN.RIGHT)
    return slide


def kpi(slide, x, y, w, num, label, color=BLUE):
    rect(slide, x, y, w, Inches(1.12), fill=LIGHT, line=RGBColor(0xE3, 0xE9, 0xF2), radius=0.1)
    text(slide, x + Inches(0.18), y + Inches(0.12), w - Inches(0.3), Inches(0.5), num, size=24, bold=True, color=color)
    text(slide, x + Inches(0.18), y + Inches(0.68), w - Inches(0.3), Inches(0.3), label, size=10.5, color=GRAY)


def add_table(slide, x, y, w, h, rows, col_widths=None, header_fill=NAVY, size=10.5, header_size=11):
    n_rows = len(rows)
    n_cols = len(rows[0])
    table_shape = slide.shapes.add_table(n_rows, n_cols, x, y, w, h)
    table = table_shape.table
    if col_widths:
        total = sum(col_widths)
        for i, cw in enumerate(col_widths):
            table.columns[i].width = Emu(int(w * cw / total))
    for r_idx, row in enumerate(rows):
        for c_idx, val in enumerate(row):
            cell = table.cell(r_idx, c_idx)
            cell.margin_left = Inches(0.08)
            cell.margin_right = Inches(0.06)
            cell.margin_top = Inches(0.03)
            cell.margin_bottom = Inches(0.03)
            cell.vertical_anchor = MSO_ANCHOR.MIDDLE
            tf = cell.text_frame
            tf.word_wrap = True
            p = tf.paragraphs[0]
            p.alignment = PP_ALIGN.LEFT if c_idx else PP_ALIGN.LEFT
            run = p.add_run()
            run.text = str(val)
            if r_idx == 0:
                set_font(run, header_size, True, WHITE)
                cell.fill.solid()
                cell.fill.fore_color.rgb = header_fill
            else:
                set_font(run, size, False, NAVY)
                cell.fill.solid()
                cell.fill.fore_color.rgb = WHITE if r_idx % 2 else LIGHT
    return table


def chart_column(slide, x, y, w, h, categories, series, colors, title="", stacked=False, legend=True):
    data = CategoryChartData()
    data.categories = categories
    for name, values in series.items():
        data.add_series(name, values)
    chart_type = XL_CHART_TYPE.COLUMN_STACKED if stacked else XL_CHART_TYPE.COLUMN_CLUSTERED
    gf = slide.shapes.add_chart(chart_type, x, y, w, h, data)
    chart = gf.chart
    chart.has_title = bool(title)
    if title:
        chart.chart_title.text_frame.text = title
        for p in chart.chart_title.text_frame.paragraphs:
            for r in p.runs:
                set_font(r, 11, True, NAVY)
    if legend:
        chart.has_legend = True
        chart.legend.position = XL_LEGEND_POSITION.BOTTOM
        chart.legend.include_in_layout = False
        chart.legend.font.size = Pt(9)
        chart.legend.font.name = FONT
    else:
        chart.has_legend = False
    for i, plot_series in enumerate(chart.series):
        color = colors[i % len(colors)]
        plot_series.format.fill.solid()
        plot_series.format.fill.fore_color.rgb = color
    chart.font.name = FONT
    chart.font.size = Pt(9)
    chart.font.color.rgb = GRAY
    try:
        chart.value_axis.has_major_gridlines = True
        chart.value_axis.tick_labels.font.size = Pt(8)
        chart.category_axis.tick_labels.font.size = Pt(9)
    except Exception:
        pass
    return chart


def chart_pie(slide, x, y, w, h, categories, values, colors):
    data = CategoryChartData()
    data.categories = categories
    data.add_series("用途", values)
    gf = slide.shapes.add_chart(XL_CHART_TYPE.PIE, x, y, w, h, data)
    chart = gf.chart
    chart.has_legend = True
    chart.legend.position = XL_LEGEND_POSITION.RIGHT
    chart.legend.include_in_layout = False
    chart.legend.font.size = Pt(10)
    chart.legend.font.name = FONT
    for i, pt in enumerate(chart.series[0].points):
        pt.format.fill.solid()
        pt.format.fill.fore_color.rgb = colors[i % len(colors)]
    # 百分比标签
    plot = chart.plots[0]
    plot.has_data_labels = True
    dl = plot.data_labels
    dl.show_percentage = True
    dl.show_value = False
    dl.font.size = Pt(9)
    dl.font.name = FONT
    dl.font.color.rgb = WHITE
    return chart


def add_picture_fit(slide, path, x, y, w, h):
    """按比例放进方框，不拉伸"""
    from PIL import Image

    if not os.path.exists(path):
        return None
    iw, ih = Image.open(path).size
    scale = min(w / iw, h / ih)
    pw, ph = int(iw * scale), int(ih * scale)
    return slide.shapes.add_picture(path, x + int((w - pw) / 2), y + int((h - ph) / 2), pw, ph)


def crop_center(src, dst, aspect=0.72):
    """把宽屏截图裁成中心竖版（手机界面用）"""
    from PIL import Image

    if not os.path.exists(src):
        return False
    img = Image.open(src)
    w, h = img.size
    cw = int(h * aspect)
    if cw >= w:
        img.save(dst)
        return True
    left = (w - cw) // 2
    img.crop((left, 0, left + cw, h)).save(dst)
    return True


def build():
    prs = Presentation()
    prs.slide_width = SW
    prs.slide_height = SH

    # ---------------- 01 封面 ----------------
    slide = prs.slides.add_slide(prs.slide_layouts[6])
    rect(slide, 0, 0, SW, SH, fill=NAVY, radius=0)
    rect(slide, 0, Inches(5.9), SW, Inches(1.6), fill=RGBColor(0x0E, 0x2A, 0x4F), radius=0)
    # 左上角光带
    rect(slide, Inches(0.0), Inches(0.0), Inches(0.18), SH, fill=BLUE, radius=0)
    text(slide, Inches(0.9), Inches(0.75), Inches(8), Inches(0.4), "杭州科技火炬大赛 · 复赛", size=14, bold=True, color=RGBColor(0x9E, 0xC5, 0xFF))
    text(slide, Inches(0.9), Inches(1.25), Inches(9), Inches(0.45), "赛道：数字经济（产业互联网 / AI 应用）", size=13, color=RGBColor(0xC9, 0xD6, 0xE8))
    text(slide, Inches(0.9), Inches(2.05), Inches(8.6), Inches(1.5), "小鱼来了", size=64, bold=True, color=WHITE)
    text(
        slide,
        Inches(0.9),
        Inches(3.55),
        Inches(8.8),
        Inches(1.0),
        "产业信息 + AI 短视频 + 算力消纳\n让每一条好项目，都被对的人看见",
        size=20,
        bold=True,
        color=RGBColor(0x9E, 0xC5, 0xFF),
        spacing=1.3,
    )
    text(slide, Inches(0.9), Inches(5.05), Inches(6), Inches(0.35), "杭州小鱼来了科技有限公司", size=15, bold=True, color=WHITE)
    text(slide, Inches(0.9), Inches(5.45), Inches(6), Inches(0.35), "汇报人：卢云（创始人兼 CEO）   2026 年 11 月", size=12, color=RGBColor(0xC9, 0xD6, 0xE8))
    text(slide, Inches(0.9), Inches(6.15), Inches(6.5), Inches(0.35), "产品体验：https://xiaoyulaile.online", size=13, bold=True, color=WHITE)
    text(slide, Inches(0.9), Inches(6.55), Inches(6.5), Inches(0.35), "测试账号：13800001234 / demo123456", size=11, color=RGBColor(0xC9, 0xD6, 0xE8))
    qr = os.path.join(SHOTS, "product-qr.png")
    if os.path.exists(qr):
        slide.shapes.add_picture(qr, Inches(9.9), Inches(4.55), Inches(2.35), Inches(2.35))
        text(slide, Inches(9.9), Inches(7.0), Inches(2.4), Inches(0.3), "扫码体验产品", size=9, color=RGBColor(0xC9, 0xD6, 0xE8), align=PP_ALIGN.CENTER)

    # ---------------- 02 投资亮点 ----------------
    s = slide_base(prs, "一页看懂小鱼来了", "已上线运营 · 收费模式跑通 · 三引擎盈利 · 可复制的杭州模式", page=2)
    kpi(s, Inches(0.7), Inches(1.62), Inches(2.3), "228", "已发布产业信息", BLUE)
    kpi(s, Inches(3.15), Inches(1.62), Inches(2.3), "265", "注册用户", TEAL)
    kpi(s, Inches(5.6), Inches(1.62), Inches(2.3), "612", "产业资讯", BLUE)
    kpi(s, Inches(8.05), Inches(1.62), Inches(2.3), "72 / 85", "覆盖城市 / 行业", TEAL)
    kpi(s, Inches(10.5), Inches(1.62), Inches(2.15), "25", "AI 短视频", ORANGE)
    bullets(
        s,
        Inches(0.75),
        Inches(3.05),
        Inches(11.9),
        Inches(3.6),
        [
            "① 产品已上线：信息发布、AI 解析、AI 搜索、短视频生成、对接群、群发、会员、主理人体系全部可用，日活在真实业务里跑。",
            "② 收费模式已完成：9 条收入线已上线可售（尽调报告 800 元/份 起 → 产业级方案 100 万起/年），官网可直接咨询下单。",
            "③ 三引擎盈利：企业服务收费 + 算力消纳分成 + 短视频/短剧广告收益，C 端不收费也能赚钱。",
            "④ 35+ 千人增收计划：用项目对接、客户入驻、算力消纳三条路径，3 年带动至少 1000 位 35+ 人群人均年增收 1.5~3 万元。",
            "⑤ 杭州独角兽路径：以杭州为总部，借上城区 OPC 政策、算力产业与机器人/新能源场景，3 年做到 3000 万收入、10 亿 GMV 级平台。",
        ],
        size=13.5,
        gap=9,
    )
    rect(s, Inches(0.7), Inches(5.85), Inches(11.9), Inches(0.62), fill=RGBColor(0xEE, 0xF6, 0xFF), line=RGBColor(0xD5, 0xE8, 0xFB))
    text(s, Inches(0.95), Inches(5.98), Inches(11.4), Inches(0.35), "结论：产品已验证、收费已跑通、模型可复制 —— 本轮 300 万用于放大「1000 位 35+ 合作人 + 1000 家付费客户」", size=11.5, bold=True, color=NAVY)

    # ---------------- 03 痛点 ----------------
    s = slide_base(prs, "产业信息严重错配：想找的人找不到，想发的人发不出去", "5000 万中小企业，做工程、设备、贸易、技术的人，仍然在用微信群找项目", page=3)
    cards = [
        ("📉", "需求方：发了没人看见", "项目、采购、招商信息发在微信群，被表情包和广告淹没；无法检索、无法核验、无法沉淀。"),
        ("🔍", "承接方：找不到真项目", "招投标网站只有公开公告，真实的企业需求、预算、资质门槛、工期，根本看不到。"),
        ("🧩", "信息：结构化为零", "同一个项目在几十个群里转发，预算、联系人、附件散落各处，人工整理成本极高。"),
        ("🚀", "新技术：落地无门", "高校、科研团队、AI 创业者的技术，找不到场景、订单与资本，转化链条断裂。"),
    ]
    for i, (icon, title, desc) in enumerate(cards):
        col = i % 2
        row = i // 2
        x = Inches(0.7 + col * 6.05)
        y = Inches(1.75 + row * 2.45)
        rect(s, x, y, Inches(5.8), Inches(2.18), fill=LIGHT, line=RGBColor(0xE3, 0xE9, 0xF2))
        text(s, x + Inches(0.28), y + Inches(0.22), Inches(0.6), Inches(0.5), icon, size=22)
        text(s, x + Inches(0.85), y + Inches(0.22), Inches(4.7), Inches(0.4), title, size=15, bold=True, color=NAVY)
        text(s, x + Inches(0.28), y + Inches(0.78), Inches(5.25), Inches(1.2), desc, size=12, color=GRAY, spacing=1.35)

    # ---------------- 04 解决方案 ----------------
    s = slide_base(prs, "小鱼来了：把产业需求结构化，再用 AI 变成可传播的内容", "四层能力，从「信息」到「内容」到「成交」全链路打通", page=4)
    layers = [
        ("① 信息层", "项目 / 贸易 / 活动 / 成果转化 / 招投标五类信息统一结构化：预算、资质、工期、城市、行业、附件"),
        ("② AI 层", "上传 PDF/Word/图片/视频自动解析，生成标题、摘要、可靠性评分；每条信息可一键生成竖版短视频"),
        ("③ 匹配层", "全库 AI 搜索、项目对接群、线上会议；按城市/行业/阶段精准匹配"),
        ("④ 增长层", "群发文案与长图、通讯录打通、城市/行业/渠道主理人网络，把线上流量落到本地"),
    ]
    for i, (name, desc) in enumerate(layers):
        y = Inches(1.68 + i * 1.17)
        rect(s, Inches(0.7), y, Inches(0.62), Inches(1.02), fill=BLUE if i % 2 == 0 else TEAL, radius=0.16)
        text(s, Inches(0.7), y + Inches(0.3), Inches(0.62), Inches(0.4), str(i + 1), size=16, bold=True, color=WHITE, align=PP_ALIGN.CENTER)
        rect(s, Inches(1.45), y, Inches(6.55), Inches(1.02), fill=LIGHT, line=RGBColor(0xE3, 0xE9, 0xF2), radius=0.12)
        text(s, Inches(1.62), y + Inches(0.1), Inches(1.5), Inches(0.3), name, size=13, bold=True, color=NAVY)
        text(s, Inches(1.62), y + Inches(0.4), Inches(6.2), Inches(0.58), desc, size=9.5, color=GRAY, spacing=1.2)
    shot = os.path.join(SHOTS, "welcome.png")
    shot_portrait = os.path.join(SHOTS, "_welcome_portrait.png")
    if os.path.exists(shot) and crop_center(shot, shot_portrait):
        add_picture_fit(s, shot_portrait, Inches(8.55), Inches(1.62), Inches(3.9), Inches(4.85))
        text(s, Inches(8.25), Inches(6.55), Inches(4.4), Inches(0.3), "产品首页（手机端实拍）", size=10, color=GRAY, align=PP_ALIGN.CENTER)

    # ---------------- 05 产品展示 ----------------
    s = slide_base(prs, "产品已上线运营，不是 PPT 项目", "首页 / 项目列表 / 企业服务 / 发布页均可体验", page=5)
    shots = [
        ("welcome.png", "首页：短视频 + AI 搜索 + 发布"),
        ("list.png", "项目列表：结构化字段 + 筛选"),
        ("services.png", "企业服务：9 条收入线明码标价"),
    ]
    for i, (name, cap) in enumerate(shots):
        path = os.path.join(SHOTS, name)
        x = Inches(0.7 + i * 4.1)
        rect(s, x, Inches(1.72), Inches(3.85), Inches(2.55), fill=LIGHT, line=RGBColor(0xE3, 0xE9, 0xF2), radius=0.06)
        if i == 0:
            portrait = os.path.join(SHOTS, "_welcome_portrait.png")
            if os.path.exists(portrait):
                path = portrait
        if os.path.exists(path):
            add_picture_fit(s, path, x + Inches(0.06), Inches(1.78), Inches(3.73), Inches(2.25))
        text(s, x, Inches(4.35), Inches(3.85), Inches(0.3), cap, size=10, color=GRAY, align=PP_ALIGN.CENTER)
    rect(s, Inches(0.7), Inches(4.95), Inches(11.9), Inches(1.55), fill=RGBColor(0xEE, 0xF6, 0xFF), line=RGBColor(0xD5, 0xE8, 0xFB), radius=0.08)
    text(s, Inches(0.95), Inches(5.12), Inches(11.4), Inches(0.4), "产品测试链接（评委可直接体验）", size=13, bold=True, color=BLUE)
    text(s, Inches(0.95), Inches(5.52), Inches(5.6), Inches(0.35), "https://xiaoyulaile.online", size=16, bold=True, color=NAVY)
    text(s, Inches(6.6), Inches(5.52), Inches(5.8), Inches(0.35), "测试账号：13800001234 / demo123456", size=12, color=GRAY)
    text(
        s,
        Inches(0.95),
        Inches(5.95),
        Inches(11.4),
        Inches(0.4),
        "建议体验路径：首页短视频 → 项目列表 → 信息详情 → 企业服务 → 发布信息（可直接看到 AI 生成标题与短视频）",
        size=11,
        color=GRAY,
    )

    # ---------------- 06 运营数据 ----------------
    s = slide_base(prs, "真实运营数据：228 条信息、265 个用户、72 个城市", "全部来自生产环境，数据时间 2026-11-06", page=6)
    rows = [
        ["指标", "数值", "说明"],
        ["已发布产业信息", "228 条", "项目 102 / 贸易 75 / 活动 29 / 成果转化 11 / 招投标 10 / 悬赏 1"],
        ["注册用户", "265 人", "企业主、项目经理、投资机构、服务商"],
        ["产业资讯", "612 条", "自动抓取 + 用户发布，含政策、行业动态"],
        ["AI 短视频", "25 条", "每条信息可一键生成 5/10/30 秒竖版视频"],
        ["覆盖城市 / 行业", "72 / 85", "杭州 26 条居首，深圳、苏州、东营、佛山等"],
        ["在售收入线", "9 条", "6 条已上线可售，3 条随规模开启"],
    ]
    add_table(s, Inches(0.7), Inches(1.72), Inches(8.3), Inches(3.6), rows, col_widths=[2.2, 1.6, 5.6], size=10.5)
    # 右侧柱状：分类构成
    chart_column(
        s,
        Inches(9.25),
        Inches(1.65),
        Inches(3.4),
        Inches(3.9),
        ["项目", "贸易", "活动", "成果", "招投标"],
        {"条数": (102, 75, 29, 11, 10)},
        [BLUE, TEAL, ORANGE],
        title="信息分类构成（条）",
        legend=False,
    )
    bullets(
        s,
        Inches(0.8),
        Inches(5.5),
        Inches(11.8),
        Inches(1.2),
        [
            "· 平台 2026 年上线，已完成 20+ 功能模块；从发布、AI 解析、短视频、对接到企业服务全部打通。",
            "· 早期靠创始人直销与产业人脉获客，CAC < 1000 元；6 个月自然积累 265 个注册用户、228 条真实信息。",
        ],
        size=11.5,
        color=GRAY,
    )

    # ---------------- 07 收费模式 ----------------
    s = slide_base(prs, "收费模式已完成：9 条收入线，最低 800 元、最高 100 万/年", "官网 #/services 明码标价，可直接咨询下单；企业服务已产生真实咨询", page=7)
    rows = [
        ["收入线", "定价", "目标客户", "状态"],
        ["AI 项目尽调报告", "800 元 / 份", "投资机构、企业投资部", "已上线"],
        ["区域产业数据库", "1.8 万 / 年", "园区、招商部门、咨询公司", "已上线"],
        ["信息代运营", "3,000 元 / 月", "中小企业", "已上线"],
        ["私有化部署", "3.8 万 / 年", "园区、商协会、国企", "已上线"],
        ["企业融资服务", "10 万起 / 年", "有融资需求的企业", "已上线"],
        ["政府招商线索", "20 万起 / 年", "地方政府、开发区", "已上线"],
        ["区域独家合作", "30 万起 / 年", "地方服务商", "已上线"],
        ["产业级解决方案", "100 万起 / 年", "政府平台、产业基金", "已上线"],
        ["创业辅导（OPC 陪跑）", "3,000 / 5,000 / 10,000 元", "35+ 创业者、一人公司", "已上线"],
        ["主理人年费", "城市 9,800 / 行业 4,800 / 渠道 2,980 元", "城市/行业/渠道主理人", "已上线，待放量"],
    ]
    add_table(s, Inches(0.7), Inches(1.62), Inches(11.9), Inches(4.5), rows, col_widths=[2.6, 3.4, 4.3, 1.9], size=9.5, header_size=10)
    text(
        s,
        Inches(0.75),
        Inches(6.3),
        Inches(11.8),
        Inches(0.5),
        "结论：不依赖补贴、不依赖融资也能产生现金流；企业服务客单价 0.8 万~100 万，毛利 85% 以上。",
        size=11.5,
        bold=True,
        color=TEAL,
    )

    # ---------------- 08 三引擎盈利 ----------------
    s = slide_base(prs, "盈利模型：收费服务 + 算力消耗 + 短视频/短剧广告", "三条引擎互相喂养：服务获客 → 算力消耗 → 内容流量反哺获客", page=8)
    engines = [
        ("01", "收费服务", "企业服务 9 条线：尽调、数据库、代运营、私有化部署、融资顾问、招商线索、区域独家、产业方案、创业辅导。", "2028 年目标 1,800 万", BLUE),
        ("02", "算力消耗", "站内 AI 功能按算力点数计费（解析/短视频/短剧生成）+ 算力项目撮合佣金 1~3% + 算力分销返点。", "2028 年目标 700 万", TEAL),
        ("03", "短视频 / 短剧广告", "真实项目改编短剧、信息流广告、贴片广告、品牌定制；平台账号矩阵分发。", "2028 年目标 500 万", ORANGE),
    ]
    for i, (no, name, desc, target, color) in enumerate(engines):
        x = Inches(0.7 + i * 4.12)
        rect(s, x, Inches(1.72), Inches(3.9), Inches(2.55), fill=LIGHT, line=RGBColor(0xE3, 0xE9, 0xF2))
        rect(s, x, Inches(1.72), Inches(0.12), Inches(2.55), fill=color, radius=0)
        text(s, x + Inches(0.3), Inches(1.85), Inches(1), Inches(0.35), no, size=13, bold=True, color=color)
        text(s, x + Inches(0.3), Inches(2.2), Inches(3.3), Inches(0.4), name, size=15, bold=True, color=NAVY)
        text(s, x + Inches(0.3), Inches(2.68), Inches(3.35), Inches(1.1), desc, size=10, color=GRAY, spacing=1.3)
        text(s, x + Inches(0.3), Inches(3.82), Inches(3.3), Inches(0.3), target, size=10.5, bold=True, color=color)
    chart_column(
        s,
        Inches(0.7),
        Inches(4.45),
        Inches(11.9),
        Inches(2.35),
        ["2026（实际）", "2027（目标）", "2028（目标）"],
        {"收费服务": (0, 520, 1800), "算力消耗": (0, 180, 700), "短视频/短剧广告": (0, 100, 500)},
        [BLUE, TEAL, ORANGE],
        title="收入结构预测（万元）",
        stacked=True,
    )

    # ---------------- 09 35+ 千人增收 ----------------
    s = slide_base(prs, "35+ 千人增收计划：3 年带动 1000 位 35+ 人群增收", "项目对接 + 客户入驻 + 算力消纳，三条路径都能变现", page=9)
    paths = [
        ("项目对接人", "把本地项目需求带到平台，撮合成交后按成交额 1~3% 拿佣金", "年增收 2~5 万"),
        ("客户入驻推荐", "推荐企业入驻/购买服务，首年服务费 20% 作为推荐奖励", "年增收 1~3 万"),
        ("算力消纳代理", "把算力需求（AI 训练/推理、智算中心机柜）对接给平台，按算力销售额 5~10% 返点", "年增收 2~6 万"),
    ]
    for i, (name, desc, money) in enumerate(paths):
        x = Inches(0.7 + i * 4.12)
        rect(s, x, Inches(1.72), Inches(3.9), Inches(2.2), fill=WHITE, line=RGBColor(0xD5, 0xE8, 0xFB))
        text(s, x + Inches(0.28), Inches(1.85), Inches(3.35), Inches(0.4), name, size=14, bold=True, color=BLUE)
        text(s, x + Inches(0.28), Inches(2.32), Inches(3.35), Inches(1.0), desc, size=10, color=GRAY, spacing=1.3)
        text(s, x + Inches(0.28), Inches(3.42), Inches(3.35), Inches(0.35), money, size=12, bold=True, color=TEAL)
    # 目标数字
    rect(s, Inches(0.7), Inches(4.15), Inches(11.9), Inches(1.1), fill=RGBColor(0xEE, 0xF6, 0xFF), line=RGBColor(0xD5, 0xE8, 0xFB))
    text(s, Inches(0.95), Inches(4.32), Inches(11.3), Inches(0.4), "目标：3 年 1000 位 35+ 合作伙伴，人均年增收 1.5~3 万元 → 合计为 1000 个家庭年增收 1,500~3,000 万元", size=13, bold=True, color=NAVY)
    # 人数增长
    chart_column(
        s,
        Inches(0.7),
        Inches(5.45),
        Inches(6.2),
        Inches(1.5),
        ["2026", "2027", "2028"],
        {"35+ 合作伙伴（人）": (50, 300, 1000)},
        [BLUE],
        title="35+ 合作伙伴规模",
        legend=False,
    )
    bullets(
        s,
        Inches(7.25),
        Inches(5.5),
        Inches(5.3),
        Inches(1.4),
        [
            "· 平台提供：培训、素材、客户线索、AI 工具、结算系统",
            "· 一条龙支持：从「找到项目」到「签约分佣」全部线上化",
        ],
        size=10.5,
        color=GRAY,
    )

    # ---------------- 10 市场空间 ----------------
    s = slide_base(prs, "市场空间：500 万家中小企业 × 算力消纳的新增量", "从「信息撮合」切进「企业服务 + 算力经济」两个万亿级市场", page=10)
    tiers = [
        ("TAM 万亿级", "全国 5000 万中小企业 × 产业信息与对接需求", BLUE, Inches(0.9)),
        ("SAM 150 亿", "做工程/设备/贸易/产业服务的企业约 500 万家，按年付 3,000 元测算", TEAL, Inches(1.55)),
        ("SOM 3,000 万", "3 年 1 万家付费客户 + 1,000 位主理人 + 算力撮合", ORANGE, Inches(2.2)),
    ]
    for i, (label, desc, color, inset) in enumerate(tiers):
        y = Inches(1.8 + i * 1.55)
        w = Inches(6.4 - i * 0.55)
        rect(s, Inches(0.7) + inset, y, w, Inches(1.25), fill=color, radius=0.12)
        text(s, Inches(0.95) + inset, y + Inches(0.12), w - Inches(0.4), Inches(0.35), label, size=14, bold=True, color=WHITE)
        text(s, Inches(0.95) + inset, y + Inches(0.52), w - Inches(0.5), Inches(0.6), desc, size=10, color=WHITE)
    # 右侧：算力市场补充
    rect(s, Inches(7.6), Inches(1.8), Inches(5.0), Inches(4.6), fill=LIGHT, line=RGBColor(0xE3, 0xE9, 0xF2))
    text(s, Inches(7.9), Inches(1.98), Inches(4.4), Inches(0.4), "第二增长曲线：算力消纳", size=14, bold=True, color=TEAL)
    bullets(
        s,
        Inches(7.9),
        Inches(2.5),
        Inches(4.45),
        Inches(3.6),
        [
            "· 杭州智算中心、算力集群大量上架，缺的是「把算力卖出去」的渠道",
            "· 平台已沉淀算力类项目（如长三角智算中心 2,000 机柜招商、包头零碳智算项目）",
            "· 用「项目对接 + 算力消纳代理」切入：撮合佣金 1~3%，分销返点 5~10%",
            "· 目标 2028 年算力相关收入 700 万元，占收入 23%",
        ],
        size=10.5,
        gap=7,
    )

    # ---------------- 11 竞争优势 ----------------
    s = slide_base(prs, "竞争格局：我们做的是「结构化 + 内容化 + 本地化」", "招投标平台只有公告，B2B 平台只卖货，微信群没有结构，代运营做不了规模化", page=11)
    rows = [
        ["", "招投标聚合", "B2B 平台", "微信群", "短视频代运营", "小鱼来了"],
        ["真实企业需求", "仅公开公告", "以商品为主", "有但无法检索", "不涉及", "✅ 用户发布 + AI 结构化"],
        ["结构化字段", "部分", "商品字段", "无", "无", "✅ 预算/资质/工期/城市/行业"],
        ["内容传播", "无", "商品页", "人工转发", "人工拍摄", "✅ 每条信息一键生成短视频"],
        ["本地化网络", "无", "无", "无", "区域团队", "✅ 城市/行业/渠道主理人"],
        ["成本结构", "重运营", "重招商", "0 成本但低效", "人力密集", "✅ AI 流水线，边际成本趋零"],
    ]
    add_table(s, Inches(0.7), Inches(1.75), Inches(11.9), Inches(3.9), rows, col_widths=[1.9, 1.9, 1.9, 1.7, 1.9, 3.2], size=9.5, header_size=10)

    # ---------------- 12 杭州独角兽路径 ----------------
    s = slide_base(prs, "杭州独角兽路径：从产业信息平台，到算力与内容的产业基础设施", "总部在杭州上城区，借 OPC 政策、算力产业、机器人/新能源场景，3 年跑出可复制模式", page=12)
    steps = [
        ("2026 打地基", "信息 3,000 条\n用户 3,000\n短视频 500 条\n收入 0~300 万", BLUE),
        ("2027 跑模型", "付费客户 500 家\n35+ 伙伴 300 人\n收入 800 万\n算力撮合跑通", TEAL),
        ("2028 规模化", "付费客户 1,000 家\n35+ 伙伴 1,000 人\n收入 3,000 万\n启动 A 轮", ORANGE),
    ]
    for i, (title, desc, color) in enumerate(steps):
        x = Inches(0.7 + i * 4.12)
        rect(s, x, Inches(1.75), Inches(3.9), Inches(2.45), fill=WHITE, line=color)
        rect(s, x, Inches(1.75), Inches(3.9), Inches(0.45), fill=color, radius=0)
        text(s, x, Inches(1.82), Inches(3.9), Inches(0.3), title, size=13, bold=True, color=WHITE, align=PP_ALIGN.CENTER)
        text(s, x + Inches(0.25), Inches(2.38), Inches(3.4), Inches(1.7), desc, size=11, color=NAVY, spacing=1.45)
    # 杭州结合点
    rect(s, Inches(0.7), Inches(4.5), Inches(11.9), Inches(2.1), fill=LIGHT, line=RGBColor(0xE3, 0xE9, 0xF2))
    text(s, Inches(0.95), Inches(4.65), Inches(11.3), Inches(0.35), "为什么是杭州、为什么是现在", size=14, bold=True, color=NAVY)
    bullets(
        s,
        Inches(0.95),
        Inches(5.1),
        Inches(5.6),
        Inches(1.4),
        [
            "· 上城区 OPC 专项政策：1 亿元/年专项资金、10 亿元专项基金、场景补助 300 万",
            "· 杭州算力产业：智算中心密集上架，算力消纳缺渠道",
            "· 机器人、低空、新能源项目密集，产业信息需求真实存在",
        ],
        size=10,
        gap=5,
    )
    bullets(
        s,
        Inches(6.9),
        Inches(5.1),
        Inches(5.4),
        Inches(1.4),
        [
            "· 玉皇山南基金小镇 + 山南投融汇：已撮合融资 20 亿元+",
            "· 杭州创业大赛、火炬大赛等赛事体系，项目源持续供给",
            "· 目标：成为杭州「产业信息 + 算力 + 内容」的独角兽样本",
        ],
        size=10,
        gap=5,
    )

    # ---------------- 13 技术落地转化 ----------------
    s = slide_base(prs, "不止商业：平台是新技术的「落地转化器」", "技术供给 → 场景需求 → 订单/资本，把转化链条跑通", page=13)
    flow = [
        ("技术供给", "高校院所、AI 团队、OPC 创业者\n（算法、机器人、低空、新能源）", BLUE, Inches(0.7)),
        ("场景与订单", "平台上的真实项目需求\n（预算、资质、工期、联系人）", TEAL, Inches(4.55)),
        ("资本与政策", "投资机构、政府专项、大赛\n（山南投融汇、OPC 基金）", ORANGE, Inches(8.4)),
    ]
    for i, (name, desc, color, x) in enumerate(flow):
        rect(s, x, Inches(1.75), Inches(3.6), Inches(1.8), fill=LIGHT, line=color)
        text(s, x + Inches(0.25), Inches(1.9), Inches(3.1), Inches(0.35), name, size=14, bold=True, color=color)
        text(s, x + Inches(0.25), Inches(2.35), Inches(3.15), Inches(1.0), desc, size=9.5, color=GRAY, spacing=1.35)
        if i < 2:
            text(s, x + Inches(3.62), Inches(2.45), Inches(0.6), Inches(0.4), "→", size=20, bold=True, color=GRAY)
    # 三个落点
    items = [
        ("成果转化板块", "平台已上线「成果转化」分类（11 条），技术方可发布成果，企业方可发布需求。"),
        ("AI 能力开放", "解析、标题生成、短视频生成、语音合成可对外提供 API，成为技术落地的基础设施。"),
        ("政策与赛事对接", "与上城区 OPC 政策、火炬大赛、创投协会打通，帮技术团队拿政策、拿订单、拿融资。"),
    ]
    for i, (name, desc) in enumerate(items):
        x = Inches(0.7 + i * 4.12)
        rect(s, x, Inches(4.05), Inches(3.9), Inches(2.2), fill=WHITE, line=RGBColor(0xE3, 0xE9, 0xF2))
        text(s, x + Inches(0.25), Inches(4.2), Inches(3.4), Inches(0.4), name, size=12.5, bold=True, color=NAVY)
        text(s, x + Inches(0.25), Inches(4.65), Inches(3.45), Inches(1.4), desc, size=10, color=GRAY, spacing=1.35)
    text(s, Inches(0.8), Inches(6.45), Inches(11.8), Inches(0.4), "社会价值：让技术找到场景、让企业找到方案、让 35+ 人群找到新收入。", size=11.5, bold=True, color=TEAL)

    # ---------------- 14 财务预测 ----------------
    s = slide_base(prs, "财务预测：2028 年收入 3,000 万，毛利率保持 85% 以上", "保守口径：不依赖融资烧钱，按客户数与算力消纳逐步放量", page=14)
    rows = [
        ["指标", "2026（实际）", "2027（目标）", "2028（目标）"],
        ["营业收入", "0~300 万", "800 万", "3,000 万"],
        ["其中：收费服务", "0~300 万", "520 万", "1,800 万"],
        ["其中：算力消耗", "—", "180 万", "700 万"],
        ["其中：短视频/短剧广告", "—", "100 万", "500 万"],
        ["毛利率", "85%+", "85%", "86%"],
        ["付费客户", "10 家", "500 家", "1,000 家"],
        ["35+ 合作伙伴", "50 人", "300 人", "1,000 人"],
    ]
    add_table(s, Inches(0.7), Inches(1.72), Inches(7.3), Inches(3.7), rows, col_widths=[2.3, 1.7, 1.6, 1.6], size=10)
    chart_column(
        s,
        Inches(8.35),
        Inches(1.65),
        Inches(4.3),
        Inches(3.9),
        ["2026", "2027", "2028"],
        {"收入（万元）": (150, 800, 3000)},
        [BLUE],
        title="营业收入预测（万元）",
        legend=False,
    )
    bullets(
        s,
        Inches(0.8),
        Inches(5.55),
        Inches(11.8),
        Inches(1.2),
        [
            "· 核心假设：企业服务客单价 1.5 万、付费客户 1,000 家；算力撮合 GMV 3 亿、佣金 2%；广告按 1 万 MAU × 2 元 eCPM 测算。",
            "· 成本结构：人力 + 服务器 + AI 接口，2028 年人员 20 人以内，毛利率维持 85%+；不靠补贴，现金流可在 2027 年转正。",
        ],
        size=10.5,
        color=GRAY,
    )

    # ---------------- 15 团队 ----------------
    s = slide_base(prs, "团队：产业资源 + AI 工程能力", "小团队、高杠杆：1 名创始人 + AI 工程体系，已交付 20+ 模块", page=15)
    rect(s, Inches(0.7), Inches(1.72), Inches(5.7), Inches(2.55), fill=LIGHT, line=RGBColor(0xE3, 0xE9, 0xF2))
    text(s, Inches(0.95), Inches(1.9), Inches(5.2), Inches(0.4), "卢云 · 创始人兼 CEO", size=16, bold=True, color=NAVY)
    bullets(
        s,
        Inches(0.95),
        Inches(2.4),
        Inches(5.2),
        Inches(1.7),
        [
            "· 负责产品方向、产业资源、销售与政府/园区关系",
            "· 熟悉工程项目来源、资质门槛与交易结构",
            "· 从 0 到 1 搭建平台：信息、AI、短视频、会员、主理人体系",
        ],
        size=10,
        gap=5,
    )
    rect(s, Inches(6.7), Inches(1.72), Inches(5.9), Inches(2.55), fill=LIGHT, line=RGBColor(0xE3, 0xE9, 0xF2))
    text(s, Inches(6.95), Inches(1.9), Inches(5.4), Inches(0.4), "技术：AI 工程体系", size=16, bold=True, color=NAVY)
    bullets(
        s,
        Inches(6.95),
        Inches(2.4),
        Inches(5.4),
        Inches(1.7),
        [
            "· 自研零依赖 Node.js 后端，支持全流程业务",
            "· 接入多家大模型：解析、标题、短视频、语音合成",
            "· 20+ 功能模块已上线，服务器稳定运行",
        ],
        size=10,
        gap=5,
    )
    # 招聘计划
    text(s, Inches(0.75), Inches(4.55), Inches(11.8), Inches(0.35), "本轮融资后招聘计划", size=13, bold=True, color=NAVY)
    hires = [
        ("内容运营 1 名", "短视频、短剧、公众号、社群"),
        ("企业服务销售 1 名", "企业服务与主理人招募，提成制"),
        ("全栈工程师 1 名", "短视频流水线、算力对接、英文版"),
    ]
    for i, (name, desc) in enumerate(hires):
        x = Inches(0.7 + i * 4.12)
        rect(s, x, Inches(5.0), Inches(3.9), Inches(1.35), fill=WHITE, line=RGBColor(0xE3, 0xE9, 0xF2))
        text(s, x + Inches(0.25), Inches(5.12), Inches(3.4), Inches(0.35), name, size=12, bold=True, color=BLUE)
        text(s, x + Inches(0.25), Inches(5.5), Inches(3.45), Inches(0.7), desc, size=10, color=GRAY)

    # ---------------- 16 融资计划 ----------------
    s = slide_base(prs, "融资计划：天使轮 300 万，出让 10%~15%", "资金用于内容、销售网络、合规与研发，18 个月跑到 A 轮门槛", page=16)
    rows = [
        ["项目", "内容"],
        ["融资轮次", "天使轮（可接受 SAFE / 可转债）"],
        ["融资额度", "300 万元人民币"],
        ["出让股权", "10%~15%（可协商）"],
        ["投前估值", "1,700 万~2,700 万元"],
        ["资金用途", "内容 40% · 销售与主理人 30% · 合规 10% · 研发 13% · 流动 7%"],
        ["里程碑", "18 个月：3,000 条信息、3,000 用户、500 家付费客户、收入 800 万"],
    ]
    add_table(s, Inches(0.7), Inches(1.72), Inches(7.6), Inches(3.4), rows, col_widths=[1.8, 5.8], size=10.5)
    chart_pie(
        s,
        Inches(8.6),
        Inches(1.65),
        Inches(4.1),
        Inches(3.9),
        ["内容与短视频", "销售与主理人", "合规与法务", "工程研发", "流动资金"],
        (40, 30, 10, 13, 7),
        [BLUE, TEAL, ORANGE, RGBColor(0x7C, 0x3A, 0xED), GRAY],
    )
    rect(s, Inches(0.7), Inches(5.45), Inches(11.9), Inches(1.15), fill=RGBColor(0xEE, 0xF6, 0xFF), line=RGBColor(0xD5, 0xE8, 0xFB))
    text(s, Inches(0.95), Inches(5.58), Inches(11.4), Inches(0.35), "其他融资计划", size=12, bold=True, color=BLUE)
    text(
        s,
        Inches(0.95),
        Inches(5.95),
        Inches(11.4),
        Inches(0.55),
        "政府创业补贴与大赛落地支持 · 创业担保贷款 30~100 万 · 产业资本 100~300 万（新能源/环保/建筑，带客户与订单）· A 轮 2027 年下半年启动",
        size=10,
        color=NAVY,
    )

    # ---------------- 17 结尾 ----------------
    slide = prs.slides.add_slide(prs.slide_layouts[6])
    rect(slide, 0, 0, SW, SH, fill=NAVY, radius=0)
    rect(slide, 0, 0, Inches(0.18), SH, fill=BLUE, radius=0)
    text(slide, Inches(0.9), Inches(1.5), Inches(11.5), Inches(0.9), "让每一条好项目，都被对的人看见", size=42, bold=True, color=WHITE)
    text(slide, Inches(0.9), Inches(2.75), Inches(11.4), Inches(0.5), "小鱼来了 —— 产业信息 + AI 短视频 + 算力消纳", size=20, bold=True, color=RGBColor(0x9E, 0xC5, 0xFF))
    text(slide, Inches(0.9), Inches(4.05), Inches(8), Inches(0.35), "卢云 · 创始人兼 CEO", size=15, bold=True, color=WHITE)
    text(slide, Inches(0.9), Inches(4.5), Inches(8), Inches(0.35), "手机 / 微信：15606768989    邮箱：service@xiaoyulaile.online", size=13, color=RGBColor(0xC9, 0xD6, 0xE8))
    text(slide, Inches(0.9), Inches(4.95), Inches(8), Inches(0.35), "产品体验：https://xiaoyulaile.online   测试账号：13800001234 / demo123456", size=13, bold=True, color=WHITE)
    text(slide, Inches(0.9), Inches(6.3), Inches(9), Inches(0.35), "谢谢评委老师，欢迎提问与实地考察。", size=12, color=RGBColor(0xC9, 0xD6, 0xE8))
    qr = os.path.join(SHOTS, "product-qr.png")
    if os.path.exists(qr):
        slide.shapes.add_picture(qr, Inches(10.1), Inches(3.85), Inches(2.3), Inches(2.3))
        text(slide, Inches(10.1), Inches(6.2), Inches(2.3), Inches(0.3), "扫码体验产品", size=9, color=RGBColor(0xC9, 0xD6, 0xE8), align=PP_ALIGN.CENTER)


    # ---------------- 答辩备注（讲稿） ----------------
    notes = [
        "开场 20 秒：各位评委好，我是小鱼来了创始人卢云。我们做的是产业信息平台：把微信群里散落的项目需求结构化，再用 AI 生成短视频传播，帮企业找到对的人。",
        "30 秒讲清 5 件事：产品已上线、收费已跑通、三引擎盈利、35+ 千人增收、杭州独角兽路径。",
        "痛点：5000 万中小企业做工程、设备、贸易，找项目靠微信群；需求方发了没人看见，承接方找不到真项目，技术找不到场景。",
        "解决方案四层：信息结构化 → AI 解析与短视频 → 精准匹配 → 主理人本地化增长。",
        "产品已上线可体验，产品链接和测试账号都在页面上；不是 PPT 项目。",
        "真实数据：228 条信息、265 用户、612 资讯、72 城 85 行业、25 条 AI 短视频；全部来自生产库。",
        "收费模式已完成：9 条收入线明码标价，800 元一份尽调报告到 100 万一年产业方案，官网可直接咨询下单。",
        "三引擎：收费服务打底、算力消耗做增量、短视频/短剧广告做规模；2028 年收入 3000 万。",
        "35+ 计划：项目对接、客户入驻、算力消纳三条路径，3 年 1000 人，人均年增收 1.5~3 万，合计 1500~3000 万社会增收。",
        "市场：500 万家目标企业按年付 3000 元是 150 亿可服务市场；算力消纳是第二条增长曲线。",
        "竞争：招投标只有公告，B2B 只卖货，微信群没结构，代运营做不大；我们结构化+内容化+本地化。",
        "杭州优势：上城区 OPC 政策、算力产业、机器人/低空/新能源场景、山南投融汇基金小镇。",
        "技术落地：平台是技术—场景—订单的转化器，成果转化板块已上线，AI 能力可开放 API。",
        "财务：2028 年收入 3000 万，毛利 85%+，2027 年现金流转正，不靠烧钱。",
        "团队：1 名创始人 + AI 工程体系，已交付 20+ 模块；融资后补内容运营、销售、全栈工程师。",
        "融资：天使轮 300 万，出让 10%~15%，投前估值 1700~2700 万；18 个月跑到 A 轮门槛。",
        "结尾：让每一条好项目，都被对的人看见。谢谢评委，欢迎提问和实地考察。",
    ]
    for idx, sl in enumerate(prs.slides):
        if idx < len(notes):
            try:
                sl.notes_slide.notes_text_frame.text = notes[idx]
            except Exception:
                pass

    os.makedirs(OUT_DIR, exist_ok=True)
    prs.save(OUT_FILE)
    print("已生成:", OUT_FILE)
    print("幻灯片数:", len(prs.slides))
    print("大小:", round(os.path.getsize(OUT_FILE) / 1024, 1), "KB")


if __name__ == "__main__":
    build()

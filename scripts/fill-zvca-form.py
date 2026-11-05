# -*- coding: utf-8 -*-
"""
生成《企业融资项目介绍表》（ZVCA 创投大会附件模板）—— 已填写版

为什么不直接在原模板上填：
    原模板每一行都设置了「固定行高」，内容一多就被裁掉（实测被截断成 3 行）。
    去掉行高属性后 LibreOffice/Word 仍然按原样式裁切，不可靠。
    所以这里按原表结构「重建一份」，行高自动撑开，格式与模板一致。

要求：两页以内（模板注：内容请控制在两页以内）。
输出：growth/企业融资项目介绍表-小鱼来了（已填）.docx
"""

import os

from docx import Document
from docx.enum.table import WD_ROW_HEIGHT_RULE
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Cm, Pt

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "growth", "企业融资项目介绍表-小鱼来了（已填）.docx")

FONT = "微软雅黑"
SIZE = 8.5
TITLE = "企业融资项目介绍表"
NOTE = (
    "注：表格填写完整后，请发送到zvca2001@163.com，内容请控制在两页以内。"
    "请务必填写邮箱，创投大会通知将通过邮件送达。联系人：俞玮鹏，0571-89710054，13588107808。"
)

BASIC = [
    ("企业名称", "杭州小鱼来了科技有限公司", "法定代表人", "卢云"),
    ("企业地址", "杭州上城区三堡 钱塘银座13", "企业性质", "私营"),
    ("注册资本", "100万", "成立日期", "2026.9"),
    ("联系人", "卢云", "职务", "经理"),
    ("手机", "15606768989", "邮箱", "service@xiaoyulaile.online"),
    ("项目名称", "小鱼来了", "是否申请路演", "是"),
]

FIELD = (
    "□新一代信息技术（集成电路、AI、算力、工业软件、网络安全等） □高端制造（高端装备、机器人、精密零部件）"
    " □未来产业（低空、商业航天、量子、脑机等） □新材料 ☑新能源 □生命健康 □节能环保 □新消费"
    " □数字文创 ☑现代服务业 □现代农业 □其他"
)

SECTIONS = [
    (
        "企业简介",
        "杭州小鱼来了科技有限公司成立于2026年9月，运营产业信息与项目对接平台「小鱼来了」，面向做工程、设备、"
        "贸易的中小企业，把散落在微信群里的项目需求结构化。平台分四层：①信息层——项目、活动、贸易、成果转化、"
        "招投标五类信息统一结构化（预算、资质、工期、联系方式）；②AI层——上传PDF/Word/图片/视频自动解析，"
        "生成标题、摘要与可靠性评分；③匹配层——全库AI搜索、项目对接群、线上会议；④增长层——一键生成带二维码的"
        "微信转发文案与长图，并有城市/行业/渠道主理人体系。截至2026年11月，已发布信息221条、注册用户257人，"
        "其中项目103条、贸易71条、活动29条、成果11条、招投标10条；平台上每条信息均可一键生成15秒竖版短视频"
        "（有视频自动烧标题，无视频用封面+标题+二维码合成）。",
    ),
    (
        "经营及财务情况",
        "现阶段处于产品验证期，营业收入为0，累计投入由创始人自有资金承担，无对外负债。已设计9条收入线，"
        "其中6条已上线可售：AI项目尽调报告800元/份、区域产业数据库1.8万元/年、信息代运营3000元/月、"
        "私有化部署3.8万元/年、企业融资服务10万元起/年、政府招商线索服务20万元起/年。按企业服务中位数测算，"
        "单客户年客单价约1.5万元，毛利率85%以上（主要成本为服务器、带宽与AI接口）；获客依靠创始人直销与产业人脉，"
        "CAC低于1000元。未来18个月目标：付费客户20家→50家→100家，营收30万元→75万元→150万元；"
        "第二年起主理人年费（城市9800元/行业4800元/渠道2980元）与信息流广告贡献增量。",
    ),
    (
        "项目优势及前景",
        "差异化有三点。一是数据：信息不是爬来的公告，而是用户发布并经AI结构化的真实需求，含预算、资质门槛、"
        "工期与附件资料，越积越厚，后来者难以短期复制。二是短视频产能：行业做一条项目短视频要几百到几千元，"
        "平台把「信息→短视频」做成流水线，有视频自动烧标题（12秒预览），无视频用封面+标题+城市行业+二维码合成"
        "15秒竖版，可配中文旁白，边际成本趋零。三是主理人网络：一个城市/行业/渠道只授权一位主理人并收年费，"
        "形成低成本线下地推。市场方面，中国做工程、设备、贸易、产业服务的中小企业约500万家，按每家年付3000元测算，"
        "可服务市场约150亿元；3年目标1万家付费客户、3000万元营收。路径：B2B服务造血→短视频流量→项目改编短剧与广告变现。",
    ),
    (
        "管理团队",
        "创始人卢云，现任公司经理，负责产品方向、产业资源、销售与政府/园区关系；深耕产业项目对接，"
        "熟悉工程项目来源、资质门槛与交易结构（具体年限与业绩见附件简历）。技术侧由创始人+AI工程体系完成："
        "自研零依赖Node.js后端，已上线20余个功能模块；接入多家大模型实现资料解析、标题生成、图文转视频与语音合成；"
        "平台已在服务器稳定运行。现团队1人，本轮融资后计划招聘：内容运营1名（短视频/短剧/社群）、"
        "企业服务销售1名（提成制）、全栈工程师1名（短视频流水线、英文版、广告接入）；"
        "顾问团队含产业顾问与财税顾问（待补）。",
    ),
    (
        "融资计划（融资轮次，融资额度，其他融资计划等）",
        "融资轮次：天使轮（可接受SAFE或可转债）。融资额度：300万元人民币，出让10%~15%股权，"
        "投前估值1700万~2700万元，可协商。资金用途（18个月）：内容与短视频制作120万元（40%）、"
        "销售与主理人网络90万元（30%）、合规与法务30万元（10%）、工程研发40万元（13%）、流动资金20万元（7%）。"
        "里程碑：第6个月3000条信息、3000用户、20家付费客户；第12个月营收50万元、10位付费主理人；"
        "第18个月营收150万元并启动A轮。其他融资计划：申请创投大会及杭州创业大赛的落地补贴与场地支持；"
        "创业担保贷款30万~100万元；引入新能源/环保/建筑类产业资本100万~300万元（可带客户与订单）；"
        "A轮计划2027年下半年启动，额度1000万~2000万元，用于全国扩张与短剧内容。",
    ),
]


def set_font(run, size=SIZE, bold=False):
    run.font.size = Pt(size)
    run.font.bold = bold
    run.font.name = FONT
    rpr = run._element.get_or_add_rPr()
    rfonts = rpr.find(qn("w:rFonts"))
    if rfonts is None:
        rfonts = rpr.makeelement(qn("w:rFonts"), {})
        rpr.append(rfonts)
    rfonts.set(qn("w:ascii"), FONT)
    rfonts.set(qn("w:hAnsi"), FONT)
    rfonts.set(qn("w:eastAsia"), FONT)


def write_cell(cell, text, size=SIZE, bold=False, align=None):
    cell.text = ""
    par = cell.paragraphs[0]
    par.paragraph_format.space_before = Pt(1)
    par.paragraph_format.space_after = Pt(1)
    par.paragraph_format.line_spacing = 1.15
    if align is not None:
        par.alignment = align
    run = par.add_run(text)
    set_font(run, size=size, bold=bold)
    # 垂直居中
    tcPr = cell._tc.get_or_add_tcPr()
    vAlign = OxmlElement("w:vAlign")
    vAlign.set(qn("w:val"), "center")
    tcPr.append(vAlign)


def shade(cell, color="F2F4F8"):
    tcPr = cell._tc.get_or_add_tcPr()
    shd = OxmlElement("w:shd")
    shd.set(qn("w:val"), "clear")
    shd.set(qn("w:color"), "auto")
    shd.set(qn("w:fill"), color)
    tcPr.append(shd)


def main():
    doc = Document()
    for section in doc.sections:
        section.top_margin = Cm(1.6)
        section.bottom_margin = Cm(1.6)
        section.left_margin = Cm(2.0)
        section.right_margin = Cm(2.0)

    style = doc.styles["Normal"]
    style.font.name = FONT
    style.font.size = Pt(SIZE)
    style.element.rPr.rFonts.set(qn("w:eastAsia"), FONT)

    # 标题
    p = doc.add_paragraph()
    p.paragraph_format.space_after = Pt(2)
    r = p.add_run("附件：")
    set_font(r, size=11)
    p2 = doc.add_paragraph()
    p2.alignment = WD_ALIGN_PARAGRAPH.CENTER
    p2.paragraph_format.space_after = Pt(4)
    r2 = p2.add_run(TITLE)
    set_font(r2, size=16, bold=True)
    p3 = doc.add_paragraph()
    p3.paragraph_format.space_after = Pt(6)
    r3 = p3.add_run(NOTE)
    set_font(r3, size=8)

    rows = 1 + len(BASIC) + 1 + len(SECTIONS) * 2  # 基本情况头 + 6 + 项目领域 + 5*(标签+内容)
    table = doc.add_table(rows=rows, cols=4)
    table.style = "Table Grid"
    table.autofit = False
    widths = [Cm(3.0), Cm(5.6), Cm(3.0), Cm(4.8)]
    for row in table.rows:
        row.height_rule = WD_ROW_HEIGHT_RULE.AUTO
        trPr = row._tr.get_or_add_trPr()
        cant = OxmlElement('w:cantSplit')
        trPr.append(cant)
        for idx, cell in enumerate(row.cells):
            cell.width = widths[idx]

    r_idx = 0
    # 基本情况（跨 4 列）
    head = table.cell(r_idx, 0).merge(table.cell(r_idx, 3))
    write_cell(head, "基本情况", size=10, bold=True, align=WD_ALIGN_PARAGRAPH.CENTER)
    shade(head)
    r_idx += 1

    for a, b, c, d in BASIC:
        write_cell(table.cell(r_idx, 0), a, bold=True)
        shade(table.cell(r_idx, 0))
        write_cell(table.cell(r_idx, 1), b)
        if c == "邮箱":
            write_cell(table.cell(r_idx, 2), c, bold=True)
            shade(table.cell(r_idx, 2))
            write_cell(table.cell(r_idx, 3), d, size=8)
        else:
            write_cell(table.cell(r_idx, 2), c, bold=True)
            shade(table.cell(r_idx, 2))
            write_cell(table.cell(r_idx, 3), d, align=WD_ALIGN_PARAGRAPH.CENTER)
        r_idx += 1

    # 项目领域
    write_cell(table.cell(r_idx, 0), "项目领域", bold=True)
    shade(table.cell(r_idx, 0))
    field_cell = table.cell(r_idx, 1).merge(table.cell(r_idx, 3))
    write_cell(field_cell, FIELD, size=8)
    r_idx += 1

    # 五个大段
    for label, content in SECTIONS:
        lab = table.cell(r_idx, 0).merge(table.cell(r_idx, 3))
        write_cell(lab, label, size=10, bold=True)
        shade(lab, "E8EEF7")
        r_idx += 1
        body = table.cell(r_idx, 0).merge(table.cell(r_idx, 3))
        write_cell(body, content, size=SIZE)
        r_idx += 1

    doc.save(OUT)
    print("已生成:", OUT)
    print("大小:", round(os.path.getsize(OUT) / 1024, 1), "KB")
    print("五段字数:", sum(len(c) for _, c in SECTIONS))


if __name__ == "__main__":
    main()

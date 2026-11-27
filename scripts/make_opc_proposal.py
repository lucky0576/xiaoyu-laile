# -*- coding: utf-8 -*-
"""
生成《安吉两山 × 小鱼来了 AI+OPC 社区共建方案》DOCX
"""
import os
from docx import Document
from docx.shared import Pt, Cm, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH, WD_BREAK
from docx.enum.table import WD_TABLE_ALIGNMENT
from docx.enum.section import WD_SECTION
from docx.oxml.ns import qn
from docx.oxml import OxmlElement

FONT = '微软雅黑'
NAVY = RGBColor(0x0D, 0x2B, 0x4E)
BLUE = RGBColor(0x12, 0x55, 0x8F)
TEAL = RGBColor(0x0F, 0x7B, 0x8A)
GREY = RGBColor(0x60, 0x70, 0x89)
GOLD = RGBColor(0xB4, 0x53, 0x09)


def set_run_font(run, size=10.5, bold=False, color=None, font=FONT):
    run.font.name = font
    run.font.size = Pt(size)
    run.font.bold = bold
    if color is not None:
        run.font.color.rgb = color
    rPr = run._element.get_or_add_rPr()
    rFonts = rPr.find(qn('w:rFonts'))
    if rFonts is None:
        rFonts = OxmlElement('w:rFonts')
        rPr.append(rFonts)
    rFonts.set(qn('w:eastAsia'), font)
    rFonts.set(qn('w:ascii'), font)
    rFonts.set(qn('w:hAnsi'), font)


def para(doc, text='', size=10.5, bold=False, color=None, align=None,
         space_before=0, space_after=6, line=1.5, indent=None):
    p = doc.add_paragraph()
    if align is not None:
        p.alignment = align
    pf = p.paragraph_format
    pf.space_before = Pt(space_before)
    pf.space_after = Pt(space_after)
    pf.line_spacing = line
    if indent is not None:
        pf.left_indent = Cm(indent)
    if text:
        r = p.add_run(text)
        set_run_font(r, size=size, bold=bold, color=color)
    return p


def heading(doc, text, level=1):
    sizes = {0: 22, 1: 15, 2: 12.5, 3: 11.5}
    colors = {0: NAVY, 1: NAVY, 2: BLUE, 3: GREY}
    before = {0: 0, 1: 18, 2: 12, 3: 8}
    after = {0: 10, 1: 8, 2: 5, 3: 3}
    p = doc.add_paragraph()
    p.paragraph_format.space_before = Pt(before[level])
    p.paragraph_format.space_after = Pt(after[level])
    p.paragraph_format.line_spacing = 1.25
    r = p.add_run(text)
    set_run_font(r, size=sizes[level], bold=True, color=colors[level])
    return p


def bullet(doc, text, size=10.5, color=None):
    p = doc.add_paragraph()
    pf = p.paragraph_format
    pf.left_indent = Cm(0.75)
    pf.first_line_indent = Cm(-0.4)
    pf.space_before = Pt(0)
    pf.space_after = Pt(3)
    pf.line_spacing = 1.5
    r = p.add_run('· ')
    set_run_font(r, size=size, bold=True, color=TEAL)
    r2 = p.add_run(text)
    set_run_font(r2, size=size, color=color)
    return p


def kv(doc, k, v):
    """加粗标签 + 正文，同一段"""
    p = doc.add_paragraph()
    pf = p.paragraph_format
    pf.left_indent = Cm(0.75)
    pf.first_line_indent = Cm(-0.4)
    pf.space_before = Pt(0)
    pf.space_after = Pt(3)
    pf.line_spacing = 1.5
    r0 = p.add_run('· ')
    set_run_font(r0, bold=True, color=TEAL)
    r1 = p.add_run(k)
    set_run_font(r1, bold=True, color=NAVY)
    r2 = p.add_run(v)
    set_run_font(r2, color=RGBColor(0x3D, 0x4D, 0x66))
    return p


def shade(cell, hexcolor):
    tcPr = cell._tc.get_or_add_tcPr()
    shd = OxmlElement('w:shd')
    shd.set(qn('w:val'), 'clear')
    shd.set(qn('w:color'), 'auto')
    shd.set(qn('w:fill'), hexcolor)
    tcPr.append(shd)


def make_table(doc, headers, rows, widths=None, header_fill='0D2B4E',
               font_size=9.5, zebra=True):
    t = doc.add_table(rows=1, cols=len(headers))
    t.alignment = WD_TABLE_ALIGNMENT.CENTER
    t.style = 'Table Grid'
    # 表头
    hdr = t.rows[0].cells
    for i, h in enumerate(headers):
        hdr[i].text = ''
        p = hdr[i].paragraphs[0]
        p.alignment = WD_ALIGN_PARAGRAPH.CENTER
        p.paragraph_format.space_before = Pt(3)
        p.paragraph_format.space_after = Pt(3)
        r = p.add_run(h)
        set_run_font(r, size=font_size, bold=True, color=RGBColor(0xFF, 0xFF, 0xFF))
        shade(hdr[i], header_fill)
    # 数据行
    for ri, row in enumerate(rows):
        cells = t.add_row().cells
        for i, val in enumerate(row):
            cells[i].text = ''
            p = cells[i].paragraphs[0]
            p.alignment = WD_ALIGN_PARAGRAPH.CENTER if i > 0 else WD_ALIGN_PARAGRAPH.LEFT
            p.paragraph_format.space_before = Pt(3)
            p.paragraph_format.space_after = Pt(3)
            p.paragraph_format.line_spacing = 1.25
            r = p.add_run(str(val))
            set_run_font(r, size=font_size, color=RGBColor(0x16, 0x20, 0x2E))
            if zebra and ri % 2 == 1:
                shade(cells[i], 'F4F7FC')
    if widths:
        for i, w in enumerate(widths):
            for row in t.rows:
                row.cells[i].width = Cm(w)
    # 禁止表格行跨页拆分：否则会出现半行跑到下一页（如「(82%)」单独一行）
    for row in t.rows:
        trPr = row._tr.get_or_add_trPr()
        cant = OxmlElement('w:cantSplit')
        trPr.append(cant)
    return t


def hrule(doc, color='DCE3EF'):
    p = doc.add_paragraph()
    p.paragraph_format.space_before = Pt(2)
    p.paragraph_format.space_after = Pt(8)
    pPr = p._p.get_or_add_pPr()
    pbdr = OxmlElement('w:pBdr')
    bottom = OxmlElement('w:bottom')
    bottom.set(qn('w:val'), 'single')
    bottom.set(qn('w:sz'), '8')
    bottom.set(qn('w:space'), '1')
    bottom.set(qn('w:color'), color)
    pbdr.append(bottom)
    pPr.append(pbdr)


def callout(doc, lines, fill='F0F9FA', border='0F7B8A'):
    """带底色的强调块（用单列表格实现）"""
    t = doc.add_table(rows=1, cols=1)
    t.alignment = WD_TABLE_ALIGNMENT.CENTER
    cell = t.rows[0].cells[0]
    shade(cell, fill)
    cell.text = ''
    first = True
    trPr = t.rows[0]._tr.get_or_add_trPr()
    trPr.append(OxmlElement('w:cantSplit'))
    for line, bold in lines:
        p = cell.paragraphs[0] if first else cell.add_paragraph()
        first = False
        p.paragraph_format.space_before = Pt(2)
        p.paragraph_format.space_after = Pt(2)
        p.paragraph_format.line_spacing = 1.45
        r = p.add_run(line)
        set_run_font(r, size=10.5, bold=bold, color=NAVY if bold else RGBColor(0x3D, 0x4D, 0x66))
    return t


# ====================================================================== #
doc = Document()

# 页面设置
sec = doc.sections[0]
sec.page_width = Cm(21.0)
sec.page_height = Cm(29.7)
sec.left_margin = Cm(2.2)
sec.right_margin = Cm(2.2)
sec.top_margin = Cm(2.2)
sec.bottom_margin = Cm(2.2)

# 默认样式
style = doc.styles['Normal']
style.font.name = FONT
style.font.size = Pt(10.5)
style.element.rPr.rFonts.set(qn('w:eastAsia'), FONT)

# ====================================================================== #
# 封面
# ====================================================================== #
for _ in range(3):
    para(doc, '', space_after=0)

para(doc, 'AI + OPC 社区', size=34, bold=True, color=NAVY, align=WD_ALIGN_PARAGRAPH.CENTER, space_after=4)
para(doc, '共 建 方 案', size=34, bold=True, color=NAVY, align=WD_ALIGN_PARAGRAPH.CENTER, space_after=20)

para(doc, '注册在安吉 · 办公在杭州 · 服务在社区', size=13, color=TEAL,
     align=WD_ALIGN_PARAGRAPH.CENTER, space_after=40)

hrule(doc)

para(doc, '浙江安吉两山国有控股集团有限公司', size=14, bold=True, color=NAVY,
     align=WD_ALIGN_PARAGRAPH.CENTER, space_after=4)
para(doc, '×', size=12, color=GREY, align=WD_ALIGN_PARAGRAPH.CENTER, space_after=4)
para(doc, '杭州硕鱼科技有限公司 · 小鱼来了', size=14, bold=True, color=NAVY,
     align=WD_ALIGN_PARAGRAPH.CENTER, space_after=40)

hrule(doc)

para(doc, '2026 年 11 月', size=11, color=GREY, align=WD_ALIGN_PARAGRAPH.CENTER, space_after=4)
para(doc, '本方案仅供双方内部沟通使用', size=9, color=GREY, align=WD_ALIGN_PARAGRAPH.CENTER)

doc.add_page_break()

# ====================================================================== #
# 一、方案摘要
# ====================================================================== #
heading(doc, '一、方案摘要', 1)

para(doc, '本方案建议：由两山国控提供杭州大厦的空间载体与安吉注册落地通道，由小鱼来了提供社区运营、'
          'AI 工具与订单流量，双方共建「AI + OPC 社区」，实现企业「注册在安吉、办公在杭州」。',
     space_after=10)

callout(doc, [
    ('一句话概括', True),
    ('把杭州飞地的一层楼，从「按间招租」改成「按人招引」——'
     '同样面积，传统招租进 2 家企业算 2 个招商指标，OPC 社区可进 50 个，'
     '且全部注册落地安吉。', False),
])

para(doc, '', space_after=6)

heading(doc, '核心测算（详见第六章）', 2)

make_table(doc,
    ['指标', '30 个 OPC', '100 个 OPC', '300 个 OPC'],
    [
        ['安吉新增招商指标', '30 个', '100 个', '300 个'],
        ['楼宇租金（年）', '54 万元', '180 万元', '540 万元'],
        ['社区会员与陪跑收入', '约 10 万元', '约 35 万元', '约 100 万元'],
        ['小鱼来了分成（年）', '约 20 万元', '约 77 万元', '约 227 万元'],
        ['早期可投项目池', '30 个', '100 个', '300 个'],
    ],
    widths=[5.2, 3.5, 3.5, 3.5])

para(doc, '说明：以上为按行业常规单价测算的示意值，正式合作前需按飞地实际租金水平、'
          '分成比例与 OPC 付费意愿校准。', size=8.5, color=GREY, space_before=4)

doc.add_page_break()

# ====================================================================== #
# 二、为什么是 OPC 社区
# ====================================================================== #
heading(doc, '二、为什么是 OPC 社区', 1)

heading(doc, '2.1 趋势：AI 让「一人公司」从概念变成主流', 2)
para(doc, 'OPC（One Person Company，一人公司）指借助 AI 工具，由 1–3 人完成过去需要十余人团队才能交付的业务。'
          '在短视频、AI 工具开发、数据标注、行业研究、BIM/3D、投标服务等领域，'
          '单人产能已可覆盖完整交付链条。', space_after=6)
bullet(doc, '这类主体数量正在快速增长，但普遍缺乏：办公空间、政策通道、订单来源。')
bullet(doc, '传统招商体系服务的是「公司」，几乎没有为「个体」设计的落地方案。')

heading(doc, '2.2 政策：杭州已设「AI+OPC」社区创建名单', 2)
para(doc, '杭州市已将「AI+OPC」社区纳入创建名单管理，进入名单的社区可获得政策资源与配套支持，'
          '其中包括人才公寓推荐名额（每个创建名单社区 3 个）。'
          '国资平台牵头申报，在材料完备度与信用背书上有明显优势。', space_after=6)

heading(doc, '2.3 痛点：三方各自的问题，可以在同一个项目里解决', 2)

make_table(doc,
    ['角色', '当前问题', 'OPC 社区如何解决'],
    [
        ['两山国控', '杭州新建大厦需要内容填充；\n基金需要早期项目源', '高密度企业入驻，形成早期项目漏斗'],
        ['安吉县', '山区县招大企业难，\n招商指标压力大', '招「人」不招「企」，单层面积产出更多指标'],
        ['小鱼来了', '有运营能力与订单流量，\n缺少物理空间', '获得场地载体，社区成为服务交付场景'],
        ['OPC 个体', '缺空间、缺政策通道、\n缺稳定订单', '一站式解决空间 + 政策 + 订单'],
    ],
    widths=[3.0, 6.0, 6.5])

doc.add_page_break()

# ====================================================================== #
# 三、核心打法
# ====================================================================== #
heading(doc, '三、核心打法：注册在安吉，办公在杭州', 1)

para(doc, '这是浙江山区县「科创飞地」的成熟结构，三方都不需要让步：', space_after=8)

make_table(doc,
    ['', '安吉', '杭州飞地', 'OPC 个体'],
    [
        ['得到什么', '税收、统计口径、\n招商指标、企业注册量', '人才聚集、\n楼宇填充率、产业内容', '低成本办公、\n安吉政策、平台订单'],
        ['付出什么', '政策兑现、\n注册服务通道', '场地、\n运营配合', '在安吉注册、\n接受社区管理'],
    ],
    widths=[2.8, 4.6, 4.6, 4.6])

para(doc, '', space_after=6)

callout(doc, [
    ('为什么这个结构能成', True),
    ('对 OPC 来说，注册地与实际办公地分离是常态，只要安吉的政策（补贴、人才、税收返还）'
     '能兑现，注册在安吉没有任何额外成本；对安吉来说，拿到的是实打实的注册企业数；'
     '对飞地来说，拿到的是入驻率。三方诉求互不冲突。', False),
])

heading(doc, '3.1 关键设计：把「招商指标」变成可计算的东西', 2)
para(doc, '传统写字楼按面积招租，一层楼通常容纳 2–4 家企业；'
          'OPC 社区按工位招引，同样一层楼可容纳 40–60 个注册主体。'
          '这意味着同样的物理空间，招商指标产出可以提升一个数量级。', space_after=6)

make_table(doc,
    ['模式', '单层企业数', '招商指标', '空间单价', '运营难度'],
    [
        ['传统写字楼招租', '2–4 家', '2–4 个', '高', '低'],
        ['OPC 社区', '40–60 家', '40–60 个', '中低', '中（需持续运营）'],
    ],
    widths=[4.0, 3.0, 3.0, 3.0, 4.0])

doc.add_page_break()

# ====================================================================== #
# 四、双方分工
# ====================================================================== #
heading(doc, '四、双方分工', 1)

heading(doc, '4.1 两山国控投入', 2)
kv(doc, '空间载体：', '杭州大厦指定楼层，按 OPC 社区形态改造（工位、共享会议室、路演区）')
kv(doc, '注册通道：', '安吉注册落地的一站式服务通道，含工商、税务、社保')
kv(doc, '政策对接：', '安吉县及湖州市各级产业政策的申报对接与兑现协调')
kv(doc, '资金支持：', '从现有 58 支子基金中安排一支早期基金，用于社区内优质项目投资')
kv(doc, '国资背书：', '牵头申报杭州「AI+OPC」社区创建名单，提供信用背书')

heading(doc, '4.2 小鱼来了投入', 2)
kv(doc, '社区运营：', '招募、活动、课程、社群维护、入驻企业日常服务')
kv(doc, 'AI 工具：', '平台现有 AI 能力（政策匹配、供需匹配、行业研究）向社区开放')
kv(doc, '订单流量：', '平台招投标信息、贸易供需、场景需求向社区企业定向派发')
kv(doc, '陪跑体系：', '现有标准化陪跑产品（6 周 / 业务推广 + 路演 + 投资人对接）')
kv(doc, '品牌与赛事：', 'AI OPC 专项赛作为社区引流与项目筛选入口')

heading(doc, '4.3 分工边界', 2)
make_table(doc,
    ['事项', '主责', '配合'],
    [
        ['场地改造与租金定价', '两山国控', '小鱼来了'],
        ['社区日常运营与活动', '小鱼来了', '两山国控'],
        ['安吉注册与政策兑现', '两山国控', '小鱼来了'],
        ['订单派发与撮合', '小鱼来了', '两山国控'],
        ['基金投资决策', '两山国控', '小鱼来了推荐'],
        ['创建名单申报', '两山国控牵头', '小鱼来了提供材料'],
    ],
    widths=[6.5, 4.5, 4.5])

doc.add_page_break()

# ====================================================================== #
# 五、OPC 社区产品设计
# ====================================================================== #
heading(doc, '五、OPC 社区产品设计', 1)

heading(doc, '5.1 空间与工位', 2)
para(doc, '建议按「固定工位 + 流动工位 + 共享功能区」三类配置，降低起步门槛：', space_after=6)
make_table(doc,
    ['类型', '配置', '参考月费', '适用对象'],
    [
        ['固定工位', '独立工位 + 储物', '1,500 元', '已稳定接单的 OPC'],
        ['流动工位', '共享工位，先到先得', '800 元', '起步期 OPC'],
        ['团队小间', '4–6 人独立间', '按间计价', 'OPC 升级为小团队'],
    ],
    widths=[3.5, 5.5, 3.0, 4.5])

para(doc, '共享功能区包含：会议室、直播间/拍摄区、路演厅、洽谈区。'
          '这几项是 OPC 最需要但单独租不起的部分，也是社区相对普通写字楼的核心差异。',
     size=9.5, color=GREY, space_before=4)

heading(doc, '5.2 七大服务方向', 2)
para(doc, '社区招募与订单派发围绕以下七个方向组织，均为平台已验证的可接单方向：', space_after=6)
make_table(doc,
    ['方向', '典型交付内容'],
    [
        ['短视频 / 短剧', '脚本、拍摄、剪辑、账号代运营'],
        ['AI 工具 / Agent', '知识库、自动化流程、数据看板'],
        ['数据标注 / 清洗', '标注、结构化、行业数据库'],
        ['行业研究 / 招商材料', '行业报告、招商 PPT、路演材料'],
        ['BIM / 3D / 数字人', '3D 展厅、数字人讲解、BIM 轻量化'],
        ['光伏 / 储能测算', '选址、收益测算、方案材料'],
        ['投标服务包', '标书排版、资料清单、投标咨询'],
    ],
    widths=[4.5, 10.5])

heading(doc, '5.3 陪跑体系', 2)
para(doc, '沿用平台现有标准化陪跑产品，作为社区的核心增值服务：', space_after=6)
bullet(doc, '周期：6 周，一次性收费 10,000 元')
bullet(doc, '内容：业务推广、路演、投资人 / 政府资源对接')
bullet(doc, '交付目标：见到人或拿到钱（明确的结果导向，不是课程）')

heading(doc, '5.4 订单与场景赋能', 2)
para(doc, '这是社区区别于「二房东」的关键。小鱼来了平台现有可派发资源：', space_after=6)
make_table(doc,
    ['资源类型', '规模', '对社区的作用'],
    [
        ['招投标信息', '1,243 条', '投标服务包方向的直接订单来源'],
        ['项目需求', '125 条', '项目拆包后由 OPC 承接'],
        ['贸易供需', '63 条', '供应链与撮合机会'],
        ['科技成果转化', '11 条', '技术转移与产学研合作'],
        ['杭州 AI+X 场景需求', '10 条需求 / 20 家能力方', '政府场景对接，含官方对接渠道'],
        ['浙江省政策项目', '40 项', '政策申报，直接产生补贴收益'],
    ],
    widths=[4.5, 5.0, 6.5])

# ====================================================================== #
# 六、商业模式与收益测算
# ====================================================================== #
heading(doc, '六、商业模式与收益测算', 1)

heading(doc, '6.1 五条收入线', 2)
make_table(doc,
    ['收入线', '收费方式', '付款方'],
    [
        ['空间分成', '工位 / 空间租金，小鱼来了分成 15%–20%', '两山国控（从租金中分）'],
        ['社区会员费', 'OPC 月费 / 年费（含工位 + 基础服务）', 'OPC 个人'],
        ['陪跑服务费', '10,000 元 / 6 周', 'OPC 个人 / 安吉企业'],
        ['订单撮合佣金', '成交额 5%', '需求发布方'],
        ['项目股权', '优质 OPC 早期占小股', '未来收益'],
    ],
    widths=[3.5, 7.0, 5.0])

para(doc, '第五条是给两山国控的关键设计：作为投资平台，其核心诉求不是租金，'
          '而是「这个社区里能否长出可投项目」。因此社区应明确承担早期项目漏斗职能，'
          '并约定小鱼来了对项目的优先推荐权与两山国控的优先投资权。',
     size=9.5, color=GREY, space_before=4, space_after=8)

doc.add_page_break()

heading(doc, '6.2 收益测算（示意）', 2)
para(doc, '以下按固定工位 1,500 元/月、平台分成 18%、陪跑参与率 35%、'
          '订单佣金按成交额 5% 测算：', space_after=6)

make_table(doc,
    ['项目', '30 个 OPC', '100 个 OPC', '300 个 OPC'],
    [
        ['工位收入（年）', '54 万元', '180 万元', '540 万元'],
        ['— 两山国控所得（82%）', '44.3 万元', '147.6 万元', '442.8 万元'],
        ['— 小鱼来了所得（18%）', '9.7 万元', '32.4 万元', '97.2 万元'],
        ['陪跑收入（35% 参与）', '10.5 万元', '35.0 万元', '105.0 万元'],
        ['订单撮合佣金', '3.0 万元', '10.0 万元', '30.0 万元'],
        ['小鱼来了合计（年）', '约 23 万元', '约 77 万元', '约 232 万元'],
        ['安吉新增注册企业', '30 个', '100 个', '300 个'],
    ],
    widths=[5.5, 3.4, 3.4, 3.4])

para(doc, '两山国控侧另有两项未计入上表的收益：一是安吉新增企业的税收贡献；'
          '二是社区内项目进入基金投资视野带来的投资机会。',
     size=9.5, color=GREY, space_before=4)

doc.add_page_break()

# ====================================================================== #
# 七、路线图
# ====================================================================== #
heading(doc, '七、实施路线图', 1)

heading(doc, '第一阶段 · 30 天：先证明能干活', 2)
kv(doc, '目标：', '30 个 OPC 完成入驻并在安吉注册，跑通 3 个付费订单案例')
kv(doc, '聚焦方向：', 'AI 短剧 / 数字营销 / 产业数字化（三个方向招募成本最低、需求最明确）')
kv(doc, '关键动作：', '平台开设社区招募入口；AI OPC 专项赛作为流量入口；首批 30 个工位交付')
kv(doc, '验收标准：', '3 个案例为真实付费订单（非免费合作），租金与注册均实际到账')

heading(doc, '第二阶段 · 90 天：拿到政策身份', 2)
kv(doc, '目标：', '社区达到 100 个 OPC，进入杭州「AI+OPC」社区创建名单')
kv(doc, '关键动作：', '两山国控牵头申报创建名单；申请人才公寓推荐名额；启动政策申报服务')
kv(doc, '验收标准：', '创建名单公示；政策申报产生首笔补贴到账')

heading(doc, '第三阶段 · 1 年：形成闭环', 2)
kv(doc, '目标：', '形成「OPC 社区 → 项目池 → 基金投资」闭环')
kv(doc, '关键动作：', '社区内跑出 3–5 个可投项目，产业基金进场；社区模式向其他县市复制')
kv(doc, '验收标准：', '至少 1 个项目完成基金投资决策')

para(doc, '', space_after=6)

callout(doc, [
    ('为什么第一阶段必须只做 30 天', True),
    ('对国资平台而言，任何需要长期投入才能验证的项目都很难快速决策。'
     '把第一阶段压缩到 30 天、把验收标准定为「3 个真实付费订单」，'
     '是为了让决策成本降到最低——做不成，双方损失的只是一个月的人力。', False),
])

doc.add_page_break()

# ====================================================================== #
# 八、风险与应对
# ====================================================================== #
heading(doc, '八、风险与应对', 1)

make_table(doc,
    ['风险', '具体表现', '应对措施'],
    [
        ['招募不足', '30 天内招不满 30 个 OPC', '首期不追求满租，先做 15 个精品，用专项赛与定向邀请保证质量'],
        ['注册不落地', 'OPC 在安吉注册但无实际经营', '要求注册 + 社保 + 基本户三项落地，按季度核验'],
        ['订单不足', '社区有「人」没有「单」', '平台派单写入服务协议，首期保证每家每月至少 1 条有效线索'],
        ['政策不兑现', '安吉政策申报周期长或标准变化', '由两山国控出具政策兑现说明，申报由双方共同跟进'],
        ['同质化竞争', '周边出现类似 OPC 社区', '锁定「AI + OPC」定位，用平台订单形成迁移成本'],
    ],
    widths=[3.2, 5.2, 7.4])

# ====================================================================== #
# 九、下一步
# ====================================================================== #
heading(doc, '九、下一步行动建议', 1)

para(doc, '建议按以下顺序推进，每一步都有明确产出，避免反复讨论：', space_after=8)

make_table(doc,
    ['步骤', '内容', '产出', '建议时间'],
    [
        ['1', '现场踏勘杭州大厦，确认可改造楼层与面积', '楼层平面与工位测算', '1 周内'],
        ['2', '确定租金定价与分成比例', '合作条款清单', '2 周内'],
        ['3', '签署试运营协议（30 天）', '试运营协议', '3 周内'],
        ['4', '社区招募启动，同步申报创建名单材料', '首批入驻名单', '30 天内'],
        ['5', '第一阶段复盘，决定是否转正式合作', '复盘报告', '45 天内'],
    ],
    widths=[1.4, 6.8, 4.0, 3.0])

para(doc, '', space_after=10)

callout(doc, [
    ('建议的最小启动方式', True),
    ('不签长期合同，先签一份 30 天的试运营协议：两山国控提供一层楼与注册通道，'
     '小鱼来了负责招募与运营，租金按实际入驻结算。'
     '30 天后以「3 个真实付费订单 + 30 个注册企业」作为是否继续的判断依据。', False),
], fill='FFF8EC', border='B45309')

para(doc, '', space_after=16)

hrule(doc)

para(doc, '杭州硕鱼科技有限公司 · 小鱼来了', size=10, bold=True, color=NAVY, align=WD_ALIGN_PARAGRAPH.CENTER, space_after=2)
para(doc, '联系人：卢云    电话：134 5669 3544', size=9.5, color=GREY, align=WD_ALIGN_PARAGRAPH.CENTER, space_after=2)
para(doc, '邮箱：service@xiaoyulaile.online    官网：xiaoyulaile.online', size=9.5, color=GREY, align=WD_ALIGN_PARAGRAPH.CENTER)

# 保存
out = os.path.join(os.getcwd(), 'docs', '安吉两山×小鱼来了-OPC社区共建方案.docx')
os.makedirs(os.path.dirname(out), exist_ok=True)
doc.save(out)
print('已生成:', out)
print('段落数:', len(doc.paragraphs), '表格数:', len(doc.tables))

# -*- coding: utf-8 -*-
"""
生成《大模型 Agent 时代企业级认知数据库应用落地方案》DOCX
用于萧山区「大模型Agent时代企业级认知数据库应用落地需求」应答
"""
import os
from docx import Document
from docx.shared import Pt, Cm, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.enum.table import WD_TABLE_ALIGNMENT
from docx.oxml.ns import qn
from docx.oxml import OxmlElement

FONT = '微软雅黑'
NAVY = RGBColor(0x0D, 0x2B, 0x4E)
BLUE = RGBColor(0x12, 0x55, 0x8F)
TEAL = RGBColor(0x0F, 0x7B, 0x8A)
GREY = RGBColor(0x60, 0x70, 0x89)
BODY = RGBColor(0x3D, 0x4D, 0x66)


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
    for attr in ('w:eastAsia', 'w:ascii', 'w:hAnsi'):
        rFonts.set(qn(attr), font)


def para(doc, text='', size=10.5, bold=False, color=None, align=None,
         before=0, after=6, line=1.6, indent=0, first=0):
    p = doc.add_paragraph()
    if align is not None:
        p.alignment = align
    pf = p.paragraph_format
    pf.space_before = Pt(before)
    pf.space_after = Pt(after)
    pf.line_spacing = line
    if indent:
        pf.left_indent = Cm(indent)
    if first:
        pf.first_line_indent = Cm(first)
    if text:
        r = p.add_run(text)
        set_run_font(r, size=size, bold=bold, color=color)
    return p


def h1(doc, text):
    p = doc.add_paragraph()
    p.paragraph_format.space_before = Pt(16)
    p.paragraph_format.space_after = Pt(8)
    p.paragraph_format.line_spacing = 1.3
    r = p.add_run(text)
    set_run_font(r, size=15, bold=True, color=NAVY)
    return p


def h2(doc, text):
    p = doc.add_paragraph()
    p.paragraph_format.space_before = Pt(11)
    p.paragraph_format.space_after = Pt(5)
    p.paragraph_format.line_spacing = 1.3
    r = p.add_run(text)
    set_run_font(r, size=12, bold=True, color=BLUE)
    return p


def body(doc, text):
    return para(doc, text, size=10.5, color=BODY, first=0.74, after=7, line=1.75)


def bullet(doc, text):
    p = doc.add_paragraph()
    pf = p.paragraph_format
    pf.left_indent = Cm(1.1)
    pf.first_line_indent = Cm(-0.45)
    pf.space_before = Pt(0)
    pf.space_after = Pt(4)
    pf.line_spacing = 1.7
    r0 = p.add_run('· ')
    set_run_font(r0, size=10.5, bold=True, color=TEAL)
    r1 = p.add_run(text)
    set_run_font(r1, size=10.5, color=BODY)
    return p


def shade(cell, hexcolor):
    tcPr = cell._tc.get_or_add_tcPr()
    shd = OxmlElement('w:shd')
    shd.set(qn('w:val'), 'clear')
    shd.set(qn('w:color'), 'auto')
    shd.set(qn('w:fill'), hexcolor)
    tcPr.append(shd)


def table(doc, headers, rows, widths=None, fs=9.5):
    t = doc.add_table(rows=1, cols=len(headers))
    t.alignment = WD_TABLE_ALIGNMENT.CENTER
    t.style = 'Table Grid'
    for i, h in enumerate(headers):
        c = t.rows[0].cells[i]
        c.text = ''
        p = c.paragraphs[0]
        p.alignment = WD_ALIGN_PARAGRAPH.CENTER
        p.paragraph_format.space_before = Pt(3)
        p.paragraph_format.space_after = Pt(3)
        r = p.add_run(h)
        set_run_font(r, size=fs, bold=True, color=RGBColor(0xFF, 0xFF, 0xFF))
        shade(c, '0D2B4E')
    for ri, row in enumerate(rows):
        cells = t.add_row().cells
        for i, val in enumerate(row):
            cells[i].text = ''
            p = cells[i].paragraphs[0]
            p.alignment = WD_ALIGN_PARAGRAPH.LEFT if i == 0 else WD_ALIGN_PARAGRAPH.CENTER
            p.paragraph_format.space_before = Pt(3)
            p.paragraph_format.space_after = Pt(3)
            p.paragraph_format.line_spacing = 1.3
            r = p.add_run(str(val))
            set_run_font(r, size=fs, color=RGBColor(0x16, 0x20, 0x2E))
            if ri % 2 == 1:
                shade(cells[i], 'F4F7FC')
    if widths:
        for i, w in enumerate(widths):
            for row in t.rows:
                row.cells[i].width = Cm(w)
    for row in t.rows:
        row._tr.get_or_add_trPr().append(OxmlElement('w:cantSplit'))
    return t


def callout(doc, lines, fill='F0F9FA'):
    t = doc.add_table(rows=1, cols=1)
    t.alignment = WD_TABLE_ALIGNMENT.CENTER
    cell = t.rows[0].cells[0]
    shade(cell, fill)
    cell.text = ''
    first = True
    for text, bold in lines:
        p = cell.paragraphs[0] if first else cell.add_paragraph()
        first = False
        p.paragraph_format.space_before = Pt(3)
        p.paragraph_format.space_after = Pt(3)
        p.paragraph_format.line_spacing = 1.6
        r = p.add_run(text)
        set_run_font(r, size=10.5, bold=bold, color=NAVY if bold else BODY)
    t.rows[0]._tr.get_or_add_trPr().append(OxmlElement('w:cantSplit'))
    return t


def hrule(doc):
    p = doc.add_paragraph()
    p.paragraph_format.space_before = Pt(2)
    p.paragraph_format.space_after = Pt(8)
    pPr = p._p.get_or_add_pPr()
    pbdr = OxmlElement('w:pBdr')
    b = OxmlElement('w:bottom')
    b.set(qn('w:val'), 'single')
    b.set(qn('w:sz'), '8')
    b.set(qn('w:space'), '1')
    b.set(qn('w:color'), 'DCE3EF')
    pbdr.append(b)
    pPr.append(pbdr)


# ====================================================================== #
doc = Document()
sec = doc.sections[0]
sec.page_width = Cm(21.0)
sec.page_height = Cm(29.7)
sec.left_margin = Cm(2.3)
sec.right_margin = Cm(2.3)
sec.top_margin = Cm(2.3)
sec.bottom_margin = Cm(2.3)

st = doc.styles['Normal']
st.font.name = FONT
st.font.size = Pt(10.5)
st.element.rPr.rFonts.set(qn('w:eastAsia'), FONT)

TEXT_PARTS = []   # 用于统计正文字数


def T(s):
    TEXT_PARTS.append(s)
    return s


# ---------------- 封面 ----------------
for _ in range(4):
    para(doc, '', after=0)
para(doc, '企业级认知数据库', size=26, bold=True, color=NAVY, align=WD_ALIGN_PARAGRAPH.CENTER, after=6)
para(doc, '应用落地方案', size=26, bold=True, color=NAVY, align=WD_ALIGN_PARAGRAPH.CENTER, after=22)
para(doc, '—— 适配大模型 Agent 时代的行业落地路径', size=12.5, color=TEAL,
     align=WD_ALIGN_PARAGRAPH.CENTER, after=46)
hrule(doc)
para(doc, '小鱼来了 · 杭州硕鱼科技有限公司', size=13, bold=True, color=NAVY,
     align=WD_ALIGN_PARAGRAPH.CENTER, after=6)
para(doc, '杭州萧山区「大模型 Agent 时代企业级认知数据库应用落地需求」应答', size=10.5, color=GREY,
     align=WD_ALIGN_PARAGRAPH.CENTER, after=36)
hrule(doc)
para(doc, '2026 年 11 月', size=10.5, color=GREY, align=WD_ALIGN_PARAGRAPH.CENTER, after=4)
para(doc, '本方案仅供需求方评审使用', size=9, color=GREY, align=WD_ALIGN_PARAGRAPH.CENTER)

doc.add_page_break()

# ---------------- 一、方案概述 ----------------
h1(doc, '一、方案概述')
body(doc, T('本方案面向大模型 Agent 时代企业级认知数据库的落地需求，提出「底层能力对接、应用层集成、场景侧验证」的三层落地路径。小鱼来了在本次合作中承担产业场景聚合、行业应用集成与场景运营职责；底层算力、存储硬件与数据库内核由联合体伙伴提供。'))
body(doc, T('我们不以「数据库厂商」的身份参与，而是解决一个更实际的问题：认知数据库技术再先进，也需要真实的企业数据、真实的业务场景与真实的付费闭环来验证。小鱼来了平台已汇聚制造、能源、金融等行业的项目需求、供应链信息与政策资源，具备把底层技术能力导入真实业务场景的通道。'))
callout(doc, [
    ('本方案的核心主张', True),
    (T('不让技术方去找场景，也不让场景方去理解技术细节。由平台承担中间的翻译、封装与验证工作，把认知数据库能力变成企业愿意付费的行业应用。'), False),
])

# ---------------- 二、需求理解与痛点分析 ----------------
h1(doc, '二、需求理解与痛点分析')

h2(doc, '2.1 需求方要解决的核心问题')
body(doc, T('从需求描述看，需要解决三个层面的问题：一是异构数据拼接，企业数据分散在多个业务系统中，格式、口径、更新频率都不一致；二是非原生数据库在性能与安全上的缺失，通用数据库难以支撑智能体对上下文的高频读写与毫秒级检索；三是企业认知资产难以治理，哪些知识值得沉淀、如何保持更新、如何避免污染，缺乏方法论与工具。'))

h2(doc, '2.2 技术落地真实存在的三个断点')
body(doc, T('第一个断点：技术到场景。认知数据库是底层能力，企业客户不会为「数据库」这个品类付费，只会为「我的具体问题被解决」付费。缺少行业化的应用外壳，技术很难卖动。'))
body(doc, T('第二个断点：数据到资产。企业普遍有数据，但不知道自己手里哪些数据值得沉淀为认知资产。没有专业的梳理方法，最后往往做成一个「把文档丢进去」的问答工具，效果不可控。'))
body(doc, T('第三个断点：验证到复制。单个场景验证成功后，缺少可复制的行业模板，每家客户都要重新实施一遍，交付成本居高不下。'))

h2(doc, '2.3 需求方同时要对接三类角色，中间缺一个组织者')
body(doc, T('需求明确要对接：具备云算力、GPU 服务器、DPU 硬件加速能力的技术方；金融、制造、能源、法律等行业有 AI 应用落地需求的企业；以及行业级异构数据样本与应用场景运行数据。这三类角色之间存在明显的供需错配——算力与数据库企业找不到愿意付费的落地场景，行业企业不知道该选用什么技术，数据方不知道自己的数据对谁有价值。'))
body(doc, T('中间缺少一个能把三方撮合起来、并对最终落地结果负责的角色。这个角色不需要拥有全部底层技术，但需要具备场景识别、应用封装、多方协调与持续运营的能力。这恰好是本次合作中我们建议由小鱼来了承担的部分。'))

h2(doc, '2.4 为什么不由需求方直接对接技术方')
body(doc, T('一个自然的疑问是：需求方为什么不直接对接算力企业与行业客户，而要在中间加一层？原因有三个。'))
body(doc, T('第一，技术方与行业客户的沟通成本极高。算力与数据库企业习惯用技术语言描述能力，而行业客户关心的是「能不能帮我省人、省钱、少出错」，双方往往谈了三轮还没对齐需求。中间层的作用是把技术语言翻译成业务语言，把业务问题翻译成技术指标。'))
body(doc, T('第二，单个客户的定制成本无法摊薄。如果每接一家行业客户都要重新做一遍数据梳理与应用开发，交付成本会高到无法持续。中间层通过行业模板把共性部分固化下来，只对差异化部分做定制，这是唯一能让规模化的路径。'))
body(doc, T('第三，场景验证需要第三方背书。技术方自己说「我们的方案在某行业跑通了」，可信度有限；由平台方组织多家企业验证、出具效果报告，对后续客户的说服力完全不同。'))

# ---------------- 三、总体方案架构 ----------------
h1(doc, '三、总体方案架构')
body(doc, T('方案采用四层架构，自下而上分别是数据治理层、能力对接层、应用集成层与场景接入层。四层之间通过标准接口解耦，任何一层的能力升级不影响其他层。'))

h2(doc, '3.1 数据治理层')
body(doc, T('负责企业数据的分类分级、脱敏处理、授权管理与审计留痕。所有进入认知数据库的数据必须先经过本层的分类分级判断，明确哪些可以用于模型训练、哪些只能用于检索、哪些禁止出域。这一层是后续所有能力合规运行的前提。'))

h2(doc, '3.2 能力对接层')
body(doc, T('对接联合体伙伴提供的云算力、GPU/DPU 硬件加速与认知数据库内核。本层只做标准化封装，不重复实现底层能力。对上层暴露统一的检索、写入、记忆管理接口，屏蔽不同底层实现的差异。'))

h2(doc, '3.3 应用集成层')
body(doc, T('把认知数据库能力封装为行业可直接使用的应用组件，例如政策与合规知识库问答、合同与招投标文件审查、设备运维知识助手、投研资料检索等。每个组件包含数据接入模板、提示词模板、评测基准与效果看板，做到换一家客户只需替换数据源、不重写逻辑。'))

h2(doc, '3.4 场景接入层')
body(doc, T('面向行业企业提供统一入口，企业提出业务问题，平台负责判断该问题是否适合用认知数据库解决、需要哪些数据、预期效果如何，再决定是否进入实施。这一层同时承担需求归集与效果反馈，是持续迭代的数据来源。'))

h2(doc, '3.5 与现有平台能力的衔接')
body(doc, T('本方案不是从零搭建，而是建立在已经运行的平台能力之上。平台已具备四级政策知识库的结构化处理经验、文档解析与 OCR 处理能力、可解释的匹配算法、多角色协作与权限体系，以及 PC 与移动端同源的交付形态。这些能力与认知数据库方案中的资产梳理、检索应用、权限隔离三部分高度重合，可以直接复用，缩短整体实施周期。'))
body(doc, T('需要新建的主要是底层能力对接与应用模板封装两块。前者依赖联合体伙伴，后者是本方案的交付重点。这样划分后，我方投入集中在真正需要新增能力的地方，不做重复建设。'))

# ---------------- 四、核心功能模块 ----------------
h1(doc, '四、核心功能模块')

h2(doc, '4.1 企业认知资产梳理与建模')
body(doc, T('这是整个方案中工作量最大、也最容易被跳过的一步。我们提供一套资产梳理方法：先按业务场景圈定候选知识范围，再从原始文档、工单记录、会议纪要、合同条款中抽取实体与关系，形成领域本体，最后由业务专家确认哪些知识属于「稳定资产」、哪些属于「时效信息」。'))
body(doc, T('梳理结果以结构化清单交付，包含知识类别、来源系统、更新频率、责任人、敏感级别五个字段。这份清单同时是后续数据接入的依据与验收标准，避免项目做成「什么都往里塞」。'))

h2(doc, '4.2 智能体上下文与记忆管理')
body(doc, T('面向大模型 Agent 的长期运行需求，提供三层记忆管理：会话级短期记忆负责单次交互的上下文延续；任务级中期记忆负责一个业务流程内的状态保持；企业级长期记忆负责跨会话的知识沉淀。三层之间设有明确的写入与淘汰策略，避免记忆无限膨胀导致检索质量下降。'))
body(doc, T('记忆管理的关键不是存得多，而是存得准、取得回。方案中为每类记忆定义了写入触发条件与置信度衰减规则，低置信度记忆会被降权而非直接删除，保证可回溯。'))

h2(doc, '4.3 多模态知识检索')
body(doc, T('支持文本、表格、图片、扫描件等多模态内容的统一检索。对企业常见的 PDF 合同、扫描版制度文件、图纸与报表，采用版面分析与 OCR 结合的方式抽取结构，再进入统一的向量与关键词混合检索通道。检索结果返回时附带原文出处与页码，便于业务人员核验。'))
body(doc, T('针对需求中提到的毫秒级检索延迟要求，应用层采用分层缓存策略：高频问题走结果缓存，中频走向量索引，低频走全文检索兜底，在不牺牲准确率的前提下降低平均响应时间。'))

h2(doc, '4.4 原生安全隔离与合规审计')
body(doc, T('按企业、部门、项目三级做数据隔离，权限在检索接口层面强制校验，不依赖应用层自觉。所有检索、写入、导出行为全量记录审计日志，支持按人、按时间、按数据对象三个维度回溯。'))
body(doc, T('针对金融、法律等强监管行业，提供「数据不出域」的部署选项：数据库内核与模型推理可整体部署在客户机房，平台只做运维与版本管理，不接触原始数据。'))

h2(doc, '4.5 行业应用模板')
body(doc, T('把每个行业的落地经验沉淀为模板，包含数据接入清单、字段映射规则、提示词与评测集、效果指标定义。新客户上线时以模板为起点，只做数据适配与业务微调，可显著压缩实施周期。首批沉淀金融、制造、能源、法律四个方向的模板。'))

h2(doc, '4.6 场景运营与效果评估')
body(doc, T('很多认知数据库项目失败不是技术不行，而是上线后没人管。知识库会随时间腐化：制度更新了但知识没更新，业务变化了但提示词没调整，用户慢慢就不用了。方案为此设计了持续运营机制。'))
body(doc, T('运营侧建立三张表：知识更新台账，记录每条知识的上次核对时间与责任人；问题回流台账，记录用户检索失败或回答不准确的案例；效果看板，跟踪检索命中率、回答采纳率、平均处理时长三个核心指标。三张表按月复盘，直接影响下一轮的优化排期。'))
body(doc, T('效果评估不以「模型准确率」这类技术指标为主，而以业务指标为准。例如合同审查场景，看的是「审查人员复核一份合同的时间从多少分钟降到多少分钟」；设备运维场景，看的是「同类故障的平均处理时长缩短多少」。只有业务指标改善，项目才算真正落地。'))

# ---------------- 五、行业场景落地方案 ----------------
h1(doc, '五、行业场景落地方案')

h2(doc, '5.1 金融行业')
body(doc, T('切入点选择尽职调查与合规审查。这两个场景的共同特点是文档量大、条款严格、对出处要求高，正好匹配认知数据库「可溯源检索」的优势。具体做法是把企业征信、财报、合同、监管文件接入知识底座，智能体在生成尽调初稿时逐条引用原文，审查人员只需要核对引用而非从头阅读。'))

h2(doc, '5.2 制造行业')
body(doc, T('切入点选择设备运维知识库与工艺文件检索。制造企业的设备手册、故障记录、工艺参数分散在不同系统，老师傅的经验难以传承。方案把维修工单、设备手册、历史故障处理记录建成统一知识底座，一线人员用自然语言描述现象即可检索到历史相似案例与处理步骤。'))

h2(doc, '5.3 能源行业')
body(doc, T('切入点选择安全规程与调度知识助手。能源行业规程文件多、版本更新频繁、执行要求严格。方案重点解决「规程版本一致性」问题：每条检索结果标注所依据的规程版本与生效日期，避免一线人员按旧版本作业。'))

h2(doc, '5.4 法律行业')
body(doc, T('切入点选择类案检索与合同审查。法律场景对检索准确率与出处权威性要求最高，也最能体现认知数据库相对通用向量库的优势。方案提供条款级检索与法条引用校验，输出结果附带法条原文与生效状态。'))

h2(doc, '5.5 跨行业共性能力复用')
body(doc, T('四个行业看似差异很大，但底层存在高度共性的能力：都需要文档解析与版面还原，都需要条款或条款级别的精确检索，都需要回答附出处，都需要权限隔离与审计留痕。方案把这些共性能力做成统一底座，行业差异只体现在数据源接入与提示词配置上。'))
body(doc, T('这样做的直接好处是交付成本递减。第一家客户可能需要三个月，第二家同类客户因为模板可复用，实施周期可以压缩到一个月以内。这也是我们判断该方向具备规模化可能性的核心依据。'))

# ---------------- 六、联合体组建与生态协作 ----------------
h1(doc, '六、联合体组建与生态协作')
body(doc, T('本方案建议以联合体形式应答，各方职责清晰划分，避免出现「谁都能做、谁都不负责」的局面。'))

table(doc,
      ['角色', '职责', '能力来源'],
      [
          ['算力与硬件方', '提供云算力、GPU 服务器、DPU 加速能力，满足存算分离与高并发低延迟要求', '联合体伙伴'],
          ['数据库内核方', '提供认知数据库核心引擎、原生上下文存储与安全隔离能力', '联合体伙伴'],
          ['应用集成方', '行业应用封装、数据接入、场景验证与持续运营', '小鱼来了'],
          ['场景与数据方', '提供行业真实业务场景、异构数据样本与应用运行数据', '平台入驻企业与联合体伙伴'],
      ],
      widths=[3.6, 8.6, 3.6])

para(doc, '', after=7)

body(doc, T('小鱼来了在联合体中的价值不是技术堆叠，而是解决「技术方找不到场景、场景方看不懂技术」的错配。平台已建立场景能力库，收录技术能力方并实现供需双向匹配，具备快速组建与协调联合体的组织能力。'))

h2(doc, '6.2 联合体协作机制')
body(doc, T('为避免联合体常见的「投标时热热闹闹、中标后各自为政」，方案建议在应答阶段就明确三项机制。'))
body(doc, T('第一，接口先定。各方的能力边界以技术接口和交付清单的形式提前确定，谁提供什么、按什么标准交付、验收口径是什么，全部书面化。接口不确定的部分不进入投标范围，避免后期扯皮。'))
body(doc, T('第二，试点先行。联合体不以「全面铺开」作为第一阶段目标，而是先选一至两个场景做深做透，用真实效果验证协作效率，再决定是否扩大范围。'))
body(doc, T('第三，收益分配与投入匹配。按各方在具体项目中的实际投入与承担风险确定分成，而非按固定比例平均分配。场景方与数据方如果提供了真实样本与运行环境，应当体现在分配中。'))

callout(doc, [
    ('关于能力边界的说明', True),
    (T('本方案中，云算力、GPU/DPU 硬件加速与认知数据库内核能力由联合体伙伴提供，小鱼来了不将这些能力表述为自有技术。我方承担的是场景聚合、应用集成、行业验证与运营职责。这样划分既符合实际情况，也便于需求方按能力分别考察。'), False),
], fill='FFF8EC')

# ---------------- 七、实施计划 ----------------
h1(doc, '七、实施计划')
body(doc, T('建议分三个阶段推进，每个阶段都有可验证的交付物，避免长周期投入后无法评估。'))

table(doc,
      ['阶段', '周期', '主要工作', '交付物'],
      [
          ['第一阶段', '1—2 个月', '场景筛选、认知资产梳理方法落地、选定 1—2 个试点场景', '场景清单与资产清单'],
          ['第二阶段', '3—4 个月', '联合体能力对接、应用模板开发、试点场景上线运行', '试点应用与评测报告'],
          ['第三阶段', '5—6 个月', '效果调优、模板复制到第二、第三家客户', '可复制模板与运营手册'],
      ],
      widths=[2.4, 2.4, 7.6, 4.0])

para(doc, '', after=7)

# ---------------- 八、安全合规与数据治理 ----------------
h1(doc, '八、安全合规与数据治理')
bullet(doc, T('分类分级先行：所有数据接入前完成分类分级，明确使用范围，未定级数据不得入库。'))
bullet(doc, T('最小必要采集：只采集与业务问题直接相关的数据，不因「以后可能有用」而过度收集。'))
bullet(doc, T('授权可追溯：每一次数据使用都有明确授权记录，支持按数据对象反查全部使用行为。'))
bullet(doc, T('脱敏与隔离：涉及个人信息的字段在入库前完成脱敏，跨企业数据物理隔离。'))
bullet(doc, T('审计常态化：审计日志定期抽查，发现异常访问即时处置。'))

h2(doc, '8.6 数据资源对接与样本获取')
body(doc, T('需求中提到希望获取行业级异构数据样本与智能体应用场景运行数据。这是本方案中我方能够实际贡献的部分之一。'))
body(doc, T('平台在长期运营中积累了制造、能源、金融等行业的项目信息、供应链供需、招投标公告与政策文本，这些数据具备真实的异构特征：格式不一、来源分散、时效性强，恰好是检验认知数据库数据接入与治理能力的合适样本。在获得数据提供方授权且完成脱敏的前提下，可作为联合验证的数据来源之一。'))
body(doc, T('智能体运行数据方面，平台自身的政策问答、场景匹配等功能已在持续产生真实交互记录，包含用户提问方式、检索路径、结果采纳情况，可用于评估检索策略的有效性。这类数据不涉及个人隐私，适合作为算法调优的参考样本。'))

# ---------------- 九、预期成效 ----------------
h1(doc, '九、预期成效')
body(doc, T('对需求方而言，本方案的价值在于把技术能力转化为可验证的交付成果：一是获得真实的行业场景与运行数据，用于验证认知数据库在复杂业务下的实际表现；二是形成可复制的行业模板，降低后续客户交付成本；三是通过平台持续获取新的场景需求，避免技术研发与市场需求脱节。'))
body(doc, T('对行业企业而言，获得的是可以直接使用的业务工具，而不是一套需要自己搭建的技术框架。对企业来说，能解决问题、能算清投入产出，才是采用新技术的理由。'))

para(doc, '', after=10)
hrule(doc)
para(doc, '小鱼来了 · 杭州硕鱼科技有限公司', size=10, bold=True, color=NAVY, align=WD_ALIGN_PARAGRAPH.CENTER, after=3)
para(doc, '联系人：卢云    电话：134 5669 3544', size=9.5, color=GREY, align=WD_ALIGN_PARAGRAPH.CENTER, after=3)
para(doc, '邮箱：service@xiaoyulaile.online    官网：xiaoyulaile.online', size=9.5, color=GREY, align=WD_ALIGN_PARAGRAPH.CENTER)

out = os.path.join(os.getcwd(), 'docs', '认知数据库企业级应用落地方案.docx')
os.makedirs(os.path.dirname(out), exist_ok=True)
doc.save(out)

total = sum(len(x) for x in TEXT_PARTS)
print('已生成:', out)
print('正文字数（不含标题/表格）:', total)

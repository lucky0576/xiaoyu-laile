# -*- coding: utf-8 -*-
"""
把 01-软件说明书.md 转成符合软著提交要求的 Word 文档。

格式要求：
  · A4 纸，页边距 2.5cm
  · 页眉：软件名称 + 版本号 + 页码
  · 正文：宋体小四 / 1.5 倍行距
  · 标题：黑体
  · 代码块：等宽字体、浅灰底
"""

import io
import os
import re

from docx import Document
from docx.enum.section import WD_SECTION
from docx.enum.table import WD_TABLE_ALIGNMENT
from docx.enum.text import WD_ALIGN_PARAGRAPH, WD_LINE_SPACING
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Cm, Pt, RGBColor

ROOT = os.getcwd()
SRC = os.path.join(ROOT, 'docs', '软著-申请材料', '01-软件说明书.md')
DST = os.path.join(ROOT, 'docs', '软著-申请材料', '01-软件说明书.docx')

SOFT_NAME = '小鱼来了AI信息发布平台'
VERSION = 'V1.0'


# ------------------------------------------------------------------ 工具

def set_cn_font(run, cn='宋体', en='Times New Roman', size=12, bold=False):
    run.font.name = en
    run.font.size = Pt(size)
    run.font.bold = bold
    rpr = run._element.get_or_add_rPr()
    rfonts = rpr.find(qn('w:rFonts'))
    if rfonts is None:
        rfonts = OxmlElement('w:rFonts')
        rpr.append(rfonts)
    rfonts.set(qn('w:eastAsia'), cn)
    rfonts.set(qn('w:ascii'), en)
    rfonts.set(qn('w:hAnsi'), en)


def add_field(paragraph, instr):
    """插入域代码（用于页码）。"""
    run = paragraph.add_run()
    fld_begin = OxmlElement('w:fldChar')
    fld_begin.set(qn('w:fldCharType'), 'begin')
    run._r.append(fld_begin)

    instr_el = OxmlElement('w:instrText')
    instr_el.set(qn('xml:space'), 'preserve')
    instr_el.text = instr
    run._r.append(instr_el)

    fld_sep = OxmlElement('w:fldChar')
    fld_sep.set(qn('w:fldCharType'), 'separate')
    run._r.append(fld_sep)

    t = OxmlElement('w:t')
    t.text = '1'
    run._r.append(t)

    fld_end = OxmlElement('w:fldChar')
    fld_end.set(qn('w:fldCharType'), 'end')
    run._r.append(fld_end)
    return run


def shade_cell(cell, hex_color='F2F2F2'):
    tc_pr = cell._tc.get_or_add_tcPr()
    shd = OxmlElement('w:shd')
    shd.set(qn('w:val'), 'clear')
    shd.set(qn('w:color'), 'auto')
    shd.set(qn('w:fill'), hex_color)
    tc_pr.append(shd)


def shade_paragraph(paragraph, hex_color='F5F5F5'):
    p_pr = paragraph._p.get_or_add_pPr()
    shd = OxmlElement('w:shd')
    shd.set(qn('w:val'), 'clear')
    shd.set(qn('w:color'), 'auto')
    shd.set(qn('w:fill'), hex_color)
    p_pr.append(shd)


def add_toc(doc):
    p = doc.add_paragraph()
    run = p.add_run()
    fld_begin = OxmlElement('w:fldChar')
    fld_begin.set(qn('w:fldCharType'), 'begin')
    run._r.append(fld_begin)
    instr = OxmlElement('w:instrText')
    instr.set(qn('xml:space'), 'preserve')
    instr.text = 'TOC \\o "1-2" \\h \\z \\u'
    run._r.append(instr)
    fld_sep = OxmlElement('w:fldChar')
    fld_sep.set(qn('w:fldCharType'), 'separate')
    run._r.append(fld_sep)
    t = OxmlElement('w:t')
    t.text = '（在 Word 中按 Ctrl+A 再按 F9 可更新目录）'
    run._r.append(t)
    fld_end = OxmlElement('w:fldChar')
    fld_end.set(qn('w:fldCharType'), 'end')
    run._r.append(fld_end)


# ------------------------------------------------------------------ 主流程

def main():
    with io.open(SRC, 'r', encoding='utf-8') as f:
        lines = f.read().split('\n')

    doc = Document()

    # 页面设置
    sec = doc.sections[0]
    sec.page_width = Cm(21.0)
    sec.page_height = Cm(29.7)
    sec.top_margin = Cm(2.5)
    sec.bottom_margin = Cm(2.5)
    sec.left_margin = Cm(2.8)
    sec.right_margin = Cm(2.6)

    # 默认样式
    style = doc.styles['Normal']
    style.font.name = 'Times New Roman'
    style.font.size = Pt(12)
    style.element.rPr.rFonts.set(qn('w:eastAsia'), '宋体')
    pf = style.paragraph_format
    pf.line_spacing_rule = WD_LINE_SPACING.ONE_POINT_FIVE
    pf.space_after = Pt(0)

    # 页眉：软件名称 + 版本 + 页码
    header = sec.header
    hp = header.paragraphs[0]
    hp.alignment = WD_ALIGN_PARAGRAPH.CENTER
    r1 = hp.add_run(f'{SOFT_NAME} {VERSION}        第 ')
    set_cn_font(r1, '宋体', 'Times New Roman', 9)
    add_field(hp, 'PAGE')
    r2 = hp.add_run(' 页')
    set_cn_font(r2, '宋体', 'Times New Roman', 9)

    # 页脚：著作权人
    footer = sec.footer
    fp = footer.paragraphs[0]
    fp.alignment = WD_ALIGN_PARAGRAPH.CENTER
    fr = fp.add_run('杭州硕鱼科技有限公司')
    set_cn_font(fr, '宋体', 'Times New Roman', 9)

    # ---------------- 解析 markdown ----------------
    i = 0
    n = len(lines)
    first_h1_done = False
    in_code = False
    code_buf = []
    table_buf = []
    skip_toc = False

    def flush_table():
        nonlocal table_buf
        if not table_buf:
            return
        rows = []
        for ln in table_buf:
            cells = [c.strip() for c in ln.strip().strip('|').split('|')]
            if all(re.fullmatch(r':?-{2,}:?', c) for c in cells if c):
                continue
            rows.append(cells)
        table_buf = []
        if not rows:
            return
        ncol = max(len(r) for r in rows)
        tbl = doc.add_table(rows=0, cols=ncol)
        tbl.style = 'Table Grid'
        tbl.alignment = WD_TABLE_ALIGNMENT.CENTER
        for ri, row in enumerate(rows):
            cells = tbl.add_row().cells
            for ci in range(ncol):
                txt = row[ci] if ci < len(row) else ''
                txt = re.sub(r'\*\*(.+?)\*\*', r'\1', txt)
                txt = txt.replace('`', '')
                cell = cells[ci]
                cell.text = ''
                p = cell.paragraphs[0]
                p.paragraph_format.line_spacing_rule = WD_LINE_SPACING.SINGLE
                p.paragraph_format.space_after = Pt(0)
                run = p.add_run(txt)
                set_cn_font(run, '宋体', 'Times New Roman', 9.5, bold=(ri == 0))
                if ri == 0:
                    shade_cell(cell, 'EDEDED')

    def flush_code():
        nonlocal code_buf
        if not code_buf:
            return
        for cl in code_buf:
            p = doc.add_paragraph()
            p.paragraph_format.line_spacing_rule = WD_LINE_SPACING.SINGLE
            p.paragraph_format.space_after = Pt(0)
            p.paragraph_format.left_indent = Cm(0.5)
            run = p.add_run(cl if cl else ' ')
            set_cn_font(run, '宋体', 'Consolas', 9)
            shade_paragraph(p, 'F5F5F5')
        code_buf = []

    while i < n:
        raw = lines[i]
        line = raw.rstrip()
        i += 1

        # 代码块
        if line.strip().startswith('```'):
            if in_code:
                in_code = False
                flush_code()
            else:
                flush_table()
                in_code = True
                code_buf = []
            continue
        if in_code:
            code_buf.append(raw)
            continue

        # 表格
        if line.strip().startswith('|') and line.strip().endswith('|'):
            table_buf.append(line)
            continue
        else:
            flush_table()

        s = line.strip()

        # 跳过目录区块（Word 用域生成）
        if s == '## 目录':
            skip_toc = True
            continue
        if skip_toc:
            if s.startswith('# '):
                skip_toc = False
            else:
                continue

        if not s:
            continue

        # 分隔线
        if re.fullmatch(r'-{3,}', s):
            continue

        # 标题
        m = re.match(r'^(#{1,4})\s+(.+)$', s)
        if m:
            level = len(m.group(1))
            text = re.sub(r'\*\*(.+?)\*\*', r'\1', m.group(2))
            if level == 1:
                if not first_h1_done:
                    # 文档主标题
                    tp = doc.add_paragraph()
                    tp.alignment = WD_ALIGN_PARAGRAPH.CENTER
                    tr = tp.add_run(text)
                    set_cn_font(tr, '黑体', 'Arial', 22, bold=True)
                    tp.paragraph_format.space_before = Pt(6)
                    tp.paragraph_format.space_after = Pt(18)
                    first_h1_done = True
                else:
                    dp = doc.add_paragraph(style='Heading 1')
                    dr = dp.add_run(text)
                    set_cn_font(dr, '黑体', 'Arial', 16, bold=True)
                    dp.paragraph_format.space_before = Pt(18)
                    dp.paragraph_format.space_after = Pt(10)
            elif level == 2:
                dp = doc.add_paragraph(style='Heading 2')
                dr = dp.add_run(text)
                set_cn_font(dr, '黑体', 'Arial', 14, bold=True)
                dp.paragraph_format.space_before = Pt(12)
                dp.paragraph_format.space_after = Pt(6)
            else:
                dp = doc.add_paragraph(style='Heading 3')
                dr = dp.add_run(text)
                set_cn_font(dr, '黑体', 'Arial', 12, bold=True)
                dp.paragraph_format.space_before = Pt(8)
                dp.paragraph_format.space_after = Pt(4)
            continue

        # 二级标题 "## 1.2 xxx" 已在上面处理

        # 列表
        m = re.match(r'^[-*]\s+(.+)$', s)
        if m:
            p = doc.add_paragraph(style='List Bullet')
            p.paragraph_format.space_after = Pt(2)
            p.paragraph_format.line_spacing_rule = WD_LINE_SPACING.ONE_POINT_FIVE
            txt = re.sub(r'\*\*(.+?)\*\*', r'\1', m.group(1)).replace('`', '')
            r = p.add_run(txt)
            set_cn_font(r, '宋体', 'Times New Roman', 12)
            continue

        m = re.match(r'^(\d+)[.、]\s+(.+)$', s)
        if m:
            p = doc.add_paragraph()
            p.paragraph_format.left_indent = Cm(0.74)
            p.paragraph_format.first_line_indent = Cm(-0.74)
            p.paragraph_format.space_after = Pt(2)
            txt = re.sub(r'\*\*(.+?)\*\*', r'\1', m.group(2)).replace('`', '')
            r = p.add_run(f'{m.group(1)}. {txt}')
            set_cn_font(r, '宋体', 'Times New Roman', 12)
            continue

        # 普通段落
        txt = s
        txt = re.sub(r'\*\*(.+?)\*\*', r'\1', txt)
        txt = txt.replace('`', '')
        p = doc.add_paragraph()
        p.paragraph_format.first_line_indent = Cm(0.85)
        p.paragraph_format.space_after = Pt(3)
        r = p.add_run(txt)
        set_cn_font(r, '宋体', 'Times New Roman', 12)

    flush_table()
    flush_code()

    doc.save(DST)
    print(f'  已生成 {DST}')
    print(f'  段落数: {len(doc.paragraphs)}')
    print(f'  表格数: {len(doc.tables)}')


if __name__ == '__main__':
    main()

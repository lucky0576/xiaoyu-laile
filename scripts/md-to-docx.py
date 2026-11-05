# -*- coding: utf-8 -*-
"""
把项目里的 Markdown 转成 Word（.docx）

为什么自己写：项目是零依赖的，不想为了导出一份大赛材料引入一堆构建工具；
python-docx 已经是运行环境自带的，够了。

支持的 Markdown 子集（够用就行）：
    # / ## / ### 标题
    | 表格 |（含表头分隔行）
    - 无序列表 / 1. 有序列表
    > 引用（渲染为浅色提示段）
    **加粗** 行内
    --- 分隔线（忽略）
    普通段落

用法：
    python scripts/md-to-docx.py growth/杭州创业大赛-申报材料.md
    python scripts/md-to-docx.py growth/杭州创业大赛-申报材料.md growth/输出.docx
"""

import os
import re
import sys

from docx import Document
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml.ns import qn
from docx.shared import Cm, Pt, RGBColor

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CJK_FONT = "微软雅黑"
MONO_FONT = "Consolas"


def set_font(run, size=None, bold=None, color=None):
    if size:
        run.font.size = Pt(size)
    if bold is not None:
        run.font.bold = bold
    if color:
        run.font.color.rgb = RGBColor(*color)
    run.font.name = CJK_FONT
    rpr = run._element.get_or_add_rPr()
    rfonts = rpr.find(qn("w:rFonts"))
    if rfonts is None:
        rfonts = rpr.makeelement(qn("w:rFonts"), {})
        rpr.append(rfonts)
    rfonts.set(qn("w:eastAsia"), CJK_FONT)


def add_runs(par, text, size=10.5, base_bold=False, color=None):
    """处理 **加粗** 与 `代码` 行内标记"""
    tokens = re.split(r"(\*\*[^*]+\*\*|`[^`]+`)", text)
    for tok in tokens:
        if not tok:
            continue
        if tok.startswith("**") and tok.endswith("**") and len(tok) > 4:
            run = par.add_run(tok[2:-2])
            set_font(run, size=size, bold=True, color=color)
        elif tok.startswith("`") and tok.endswith("`") and len(tok) > 2:
            run = par.add_run(tok[1:-1])
            set_font(run, size=size - 0.5, bold=base_bold, color=(0x9A, 0x34, 0x12))
            run.font.name = MONO_FONT
        else:
            run = par.add_run(tok)
            set_font(run, size=size, bold=base_bold, color=color)


def is_table_line(line):
    s = line.strip()
    return s.startswith("|") and s.endswith("|")


def parse_table(lines, start):
    """返回 (rows, next_index)"""
    rows = []
    i = start
    while i < len(lines) and is_table_line(lines[i]):
        cells = [c.strip() for c in lines[i].strip().strip("|").split("|")]
        # 跳过表格对齐行 |---|---|
        if not all(re.fullmatch(r":?-{2,}:?", c or "--") for c in cells):
            rows.append(cells)
        i += 1
    return rows, i


def add_table(doc, rows):
    if not rows:
        return
    cols = max(len(r) for r in rows)
    table = doc.add_table(rows=len(rows), cols=cols)
    table.style = "Table Grid"
    table.autofit = True
    for r_idx, row in enumerate(rows):
        for c_idx in range(cols):
            cell = table.cell(r_idx, c_idx)
            cell.text = ""
            par = cell.paragraphs[0]
            par.paragraph_format.space_before = Pt(2)
            par.paragraph_format.space_after = Pt(2)
            text = row[c_idx] if c_idx < len(row) else ""
            add_runs(par, text, size=9.5, base_bold=(r_idx == 0))
    doc.add_paragraph()


def convert(md_path, out_path=None):
    with open(md_path, encoding="utf-8") as f:
        lines = f.read().split("\n")

    if out_path is None:
        out_path = os.path.splitext(md_path)[0] + ".docx"

    doc = Document()
    # 页面与默认样式
    for section in doc.sections:
        section.top_margin = Cm(2.2)
        section.bottom_margin = Cm(2.2)
        section.left_margin = Cm(2.4)
        section.right_margin = Cm(2.4)
    style = doc.styles["Normal"]
    style.font.name = CJK_FONT
    style.font.size = Pt(10.5)
    style.element.rPr.rFonts.set(qn("w:eastAsia"), CJK_FONT)
    style.paragraph_format.line_spacing = 1.5
    style.paragraph_format.space_after = Pt(6)

    i = 0
    n = len(lines)
    while i < n:
        raw = lines[i]
        line = raw.rstrip()
        s = line.strip()

        if not s or s == "---":
            i += 1
            continue

        # 表格
        if is_table_line(s):
            rows, nxt = parse_table(lines, i)
            add_table(doc, rows)
            i = nxt
            continue

        # 标题
        m = re.match(r"^(#{1,4})\s+(.*)$", s)
        if m:
            level = len(m.group(1))
            text = m.group(2).strip()
            if level == 1:
                par = doc.add_paragraph()
                par.alignment = WD_ALIGN_PARAGRAPH.CENTER
                add_runs(par, text, size=20, base_bold=True, color=(0x0B, 0x2A, 0x4A))
                par.paragraph_format.space_after = Pt(14)
            else:
                size = {2: 15, 3: 12.5, 4: 11.5}.get(level, 11)
                par = doc.add_paragraph()
                add_runs(par, text, size=size, base_bold=True, color=(0x0B, 0x5F, 0xD6) if level == 2 else (0x1D, 0x1D, 0x1F))
                par.paragraph_format.space_before = Pt(10 if level == 2 else 8)
                par.paragraph_format.space_after = Pt(4)
            i += 1
            continue

        # 引用
        if s.startswith(">"):
            text = s.lstrip(">").strip()
            if text:
                par = doc.add_paragraph()
                par.paragraph_format.left_indent = Cm(0.4)
                par.paragraph_format.space_before = Pt(4)
                add_runs(par, text, size=9.5, color=(0x6B, 0x76, 0x86))
            i += 1
            continue

        # 列表
        m = re.match(r"^[-*]\s+(.*)$", s)
        if m:
            par = doc.add_paragraph(style="List Bullet")
            add_runs(par, m.group(1), size=10.5)
            par.paragraph_format.space_after = Pt(2)
            i += 1
            continue
        m = re.match(r"^(\d+)[.)]\s+(.*)$", s)
        if m:
            par = doc.add_paragraph(style="List Number")
            add_runs(par, m.group(2), size=10.5)
            par.paragraph_format.space_after = Pt(2)
            i += 1
            continue

        # 普通段落
        par = doc.add_paragraph()
        add_runs(par, s, size=10.5)
        i += 1

    doc.save(out_path)
    return out_path


def main():
    if len(sys.argv) < 2:
        print("用法: python scripts/md-to-docx.py <input.md> [output.docx]")
        return 1
    src = sys.argv[1]
    if not os.path.isabs(src):
        src = os.path.join(ROOT, src)
    dst = sys.argv[2] if len(sys.argv) > 2 else None
    if dst and not os.path.isabs(dst):
        dst = os.path.join(ROOT, dst)
    out = convert(src, dst)
    print("已生成:", out)
    print("大小:", round(os.path.getsize(out) / 1024, 1), "KB")
    return 0


if __name__ == "__main__":
    sys.exit(main())

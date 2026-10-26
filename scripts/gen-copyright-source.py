# -*- coding: utf-8 -*-
"""
生成软件著作权申请材料
  1. 源程序文档（60 页，每页 50 行：前 30 页 + 后 30 页）
  2. 源程序纯文本版（便于核对）
"""
import io
import os
import re

ROOT = r"C:\Users\Administrator\Documents\deepseek-harness\default-workspace\xiaoyu-laile"
OUT = os.path.join(ROOT, "soft-copyright")
os.makedirs(OUT, exist_ok=True)

SOFT_NAME = "小鱼来了AI信息发布平台"
SOFT_VER = "V1.0"
LINES_PER_PAGE = 50
PAGES = 60
HALF = PAGES // 2  # 30

# ---------- 1) 收集源码 ----------
def collect():
    """按「后端 → 入口 → 前端」顺序收集，保证前后两段都是连续有效代码"""
    groups = []

    src_dir = os.path.join(ROOT, "src")
    if os.path.isdir(src_dir):
        for dirpath, dirnames, filenames in os.walk(src_dir):
            dirnames.sort()
            for fn in sorted(filenames):
                if fn.endswith(".js"):
                    groups.append(os.path.join(dirpath, fn))

    server = os.path.join(ROOT, "server.js")
    if os.path.isfile(server):
        groups.insert(0, server)

    static_dir = os.path.join(ROOT, "public", "static")
    if os.path.isdir(static_dir):
        for fn in sorted(os.listdir(static_dir)):
            if fn.endswith(".js") and fn != "sw.js":
                groups.append(os.path.join(static_dir, fn))

    return groups


files = collect()
print(f"  收集到 {len(files)} 个源文件")

# ---------- 2) 抽取有效代码行（去空行、去纯注释行） ----------
lines = []
for path in files:
    try:
        text = io.open(path, "r", encoding="utf-8").read()
    except Exception:
        continue
    rel = os.path.relpath(path, ROOT).replace("\\", "/")
    # 文件分隔标记（版权中心允许，能说明结构）
    lines.append(f"// ===== {rel} =====")
    for raw in text.split("\n"):
        s = raw.rstrip()
        if not s.strip():
            continue
        # 去掉整行注释，保留代码密度
        t = s.strip()
        if t.startswith("//") or t.startswith("/*") or t.startswith("*") or t.startswith("*/"):
            continue
        lines.append(s)

print(f"  有效代码行：{len(lines)}")

total_needed = PAGES * LINES_PER_PAGE
if len(lines) < total_needed:
    print(f"  ⚠️ 有效行不足 {total_needed}，将按实际行数提交")
    front = lines
    back = []
else:
    front = lines[: HALF * LINES_PER_PAGE]
    back = lines[-HALF * LINES_PER_PAGE:]

# ---------- 3) 分页 ----------
def paginate(seq):
    pages = []
    for i in range(0, len(seq), LINES_PER_PAGE):
        pages.append(seq[i : i + LINES_PER_PAGE])
    return pages


front_pages = paginate(front)
back_pages = paginate(back)
all_pages = front_pages + back_pages
total_pages = len(all_pages)
print(f"  生成 {total_pages} 页（前 {len(front_pages)} + 后 {len(back_pages)}）")

# ---------- 4) 纯文本版 ----------
txt_path = os.path.join(OUT, "源程序-纯文本.txt")
with io.open(txt_path, "w", encoding="utf-8") as f:
    for idx, page in enumerate(all_pages, 1):
        f.write(f"{SOFT_NAME} {SOFT_VER}  源程序  第 {idx} 页 / 共 {total_pages} 页\n")
        f.write("=" * 88 + "\n")
        for n, code in enumerate(page, 1):
            f.write(f"{n:>2}  {code}\n")
        if idx < total_pages:
            f.write("\n\f\n")
print(f"  已生成 {os.path.basename(txt_path)}  {round(os.path.getsize(txt_path)/1024,1)} KB")

# ---------- 5) DOCX 版（每页一页，带页眉） ----------
try:
    from docx import Document
    from docx.shared import Pt, Cm, RGBColor
    from docx.enum.text import WD_ALIGN_PARAGRAPH, WD_BREAK
    from docx.enum.section import WD_SECTION
    from docx.oxml.ns import qn
    from docx.oxml import OxmlElement

    doc = Document()

    # 页面设置：A4，窄边距
    sec = doc.sections[0]
    sec.page_width = Cm(21.0)
    sec.page_height = Cm(29.7)
    sec.top_margin = Cm(2.2)
    sec.bottom_margin = Cm(1.8)
    sec.left_margin = Cm(2.2)
    sec.right_margin = Cm(2.0)

    # 默认字体
    style = doc.styles["Normal"]
    style.font.name = "Consolas"
    style.font.size = Pt(8)
    style.element.rPr.rFonts.set(qn("w:eastAsia"), "宋体")
    pf = style.paragraph_format
    pf.space_before = Pt(0)
    pf.space_after = Pt(0)
    pf.line_spacing = 1.0

    # 页眉：软件名称 + 版本 + 页码
    header = sec.header
    hp = header.paragraphs[0]
    hp.text = ""
    hp.alignment = WD_ALIGN_PARAGRAPH.CENTER
    hr = hp.add_run(f"{SOFT_NAME} {SOFT_VER}　　源程序")
    hr.font.name = "宋体"
    hr.font.size = Pt(9)
    hr._element.rPr.rFonts.set(qn("w:eastAsia"), "宋体")

    # 页脚：页码
    footer = sec.footer
    fp = footer.paragraphs[0]
    fp.alignment = WD_ALIGN_PARAGRAPH.CENTER
    fr = fp.add_run("第 ")
    fr.font.size = Pt(9)
    fr.font.name = "宋体"
    # 域代码 PAGE
    fld = OxmlElement("w:fldSimple")
    fld.set(qn("w:instr"), "PAGE")
    fp._p.append(fld)
    fr2 = fp.add_run(f" 页 / 共 {total_pages} 页")
    fr2.font.size = Pt(9)
    fr2.font.name = "宋体"

    for idx, page in enumerate(all_pages, 1):
        for n, code in enumerate(page, 1):
            p = doc.add_paragraph()
            p.paragraph_format.space_before = Pt(0)
            p.paragraph_format.space_after = Pt(0)
            p.paragraph_format.line_spacing = 1.0
            run = p.add_run(f"{n:>2}  {code}")
            run.font.name = "Consolas"
            run.font.size = Pt(8)
            run._element.rPr.rFonts.set(qn("w:eastAsia"), "宋体")
        if idx < total_pages:
            # 分页
            br = doc.add_paragraph()
            br.paragraph_format.space_before = Pt(0)
            br.paragraph_format.space_after = Pt(0)
            br.add_run().add_break(WD_BREAK.PAGE)

    docx_path = os.path.join(OUT, f"{SOFT_NAME}{SOFT_VER}-源程序.docx")
    doc.save(docx_path)
    print(f"  已生成 {os.path.basename(docx_path)}  {round(os.path.getsize(docx_path)/1024,1)} KB")
except ImportError:
    print("  ⚠️ python-docx 不可用，跳过 DOCX")

print("done")

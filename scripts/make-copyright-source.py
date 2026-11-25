# -*- coding: utf-8 -*-
"""
生成软著「源程序鉴别材料」：
  · 前 30 页 + 后 30 页，共 60 页
  · 每页 50 行
  · 页眉：软件名称 + 版本号 + 页码

输出：
  02-源程序鉴别材料.html   （A4 分页，浏览器打开可直接打印/另存 PDF，或用 Word 打开）
  02-源程序鉴别材料.txt    （纯文本备份，便于核验）

说明：源程序按「服务端入口 → 配置 → HTTP 框架 → 存储层 → 路由 → 服务 → 工具库 →
前端入口 → 前端脚本」的实际依赖顺序拼接，与项目结构一致。
"""

import io
import os

ROOT = os.getcwd()
OUT = os.path.join(ROOT, 'docs', '软著-申请材料')
os.makedirs(OUT, exist_ok=True)

SOFT_NAME = '小鱼来了AI信息发布平台'
VERSION = 'V1.0'
LINES_PER_PAGE = 50
FRONT_PAGES = 30
BACK_PAGES = 30

# 按依赖顺序组织的源文件清单
ORDER = [
    'server.js',
    'src/config.js',
    'src/http/router.js',
    'src/http/server.js',
    'src/http/response.js',
    'src/store/index.js',
    'src/store/collection.js',
    'src/lib/util.js',
    'src/routes/index.js',
    'src/routes/core.js',
    'src/routes/listings.js',
    'src/routes/auth-users.js',
    'src/routes/news.js',
    'src/routes/bidding.js',
    'src/routes/chat.js',
    'src/routes/admin.js',
    'src/routes/share-page.js',
    'src/services/listings.js',
    'src/services/news.js',
    'src/services/notify.js',
    'src/services/ai.js',
    'src/services/settings.js',
    'src/services/backup.js',
    'public/index.html',
    'public/static/app.js',
    'public/static/api.js',
    'public/static/views-home.js',
    'public/static/components.js',
    'public/static/share.js',
    'public/sw.js',
]


def expand_order():
    """把 ORDER 里没找到的文件跳过，并把 src 下未列出的文件补在末尾。"""
    files = []
    seen = set()
    for rel in ORDER:
        p = os.path.join(ROOT, rel)
        if os.path.isfile(p):
            files.append(rel)
            seen.add(rel)
    # 补充 src 下所有未列出的 .js
    for dirpath, dirnames, filenames in os.walk('src'):
        dirnames[:] = [d for d in dirnames if d not in ('node_modules', '.git')]
        for fn in sorted(filenames):
            if not fn.endswith('.js'):
                continue
            rel = os.path.join(dirpath, fn).replace('\\', '/')
            if rel not in seen:
                files.append(rel)
                seen.add(rel)
    # 补充 public/static 下所有 .js
    for dirpath, dirnames, filenames in os.walk('public/static'):
        for fn in sorted(filenames):
            if not fn.endswith('.js'):
                continue
            rel = os.path.join(dirpath, fn).replace('\\', '/')
            if rel not in seen:
                files.append(rel)
                seen.add(rel)
    return files


def build_lines(files):
    """拼接源码，每个文件前加一行注释标明来源文件。"""
    out = []
    for rel in files:
        try:
            with io.open(rel, 'r', encoding='utf-8') as f:
                content = f.read()
        except Exception:
            continue
        out.append('/* ===== ' + rel + ' ===== */')
        for line in content.splitlines():
            out.append(line.rstrip('\r'))
    return out


def esc(s):
    return (s.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;'))


def main():
    files = expand_order()
    lines = build_lines(files)
    total = len(lines)
    print(f'  源文件 {len(files)} 个，合计 {total:,} 行')

    need = FRONT_PAGES * LINES_PER_PAGE + BACK_PAGES * LINES_PER_PAGE
    if total <= need:
        pages_data = [lines[i:i + LINES_PER_PAGE] for i in range(0, total, LINES_PER_PAGE)]
        print(f'  总行数不足 60 页，按规则全部提交：{len(pages_data)} 页')
    else:
        front = lines[:FRONT_PAGES * LINES_PER_PAGE]
        back = lines[-BACK_PAGES * LINES_PER_PAGE:]
        pages_data = [front[i:i + LINES_PER_PAGE] for i in range(0, len(front), LINES_PER_PAGE)]
        pages_data += [back[i:i + LINES_PER_PAGE] for i in range(0, len(back), LINES_PER_PAGE)]
        print(f'  前 {FRONT_PAGES} 页 + 后 {BACK_PAGES} 页 = {len(pages_data)} 页')

    # ---------- HTML（A4 分页，可直接打印） ----------
    html = []
    html.append('<!doctype html><html lang="zh-CN"><head><meta charset="utf-8">')
    html.append(f'<title>{SOFT_NAME} {VERSION} 源程序鉴别材料</title>')
    html.append('''<style>
@page { size: A4; margin: 18mm 16mm; }
* { box-sizing: border-box; }
body { margin: 0; font-family: "Consolas", "Courier New", "SimSun", monospace; }
.page {
  width: 178mm; min-height: 261mm; margin: 0 auto; padding: 0;
  page-break-after: always; break-after: page;
  display: flex; flex-direction: column;
}
.hdr {
  display: flex; justify-content: space-between; align-items: baseline;
  font-family: "SimSun", serif; font-size: 9pt; color: #000;
  border-bottom: 0.5pt solid #000; padding-bottom: 1.5mm; margin-bottom: 2mm;
}
.code { flex: 1; font-size: 7.6pt; line-height: 4.35mm; white-space: pre-wrap; word-break: break-all; }
.ftr { font-family: "SimSun", serif; font-size: 8pt; text-align: center; color: #000; padding-top: 1.5mm; }
@media print { .page { margin: 0; } }
</style></head><body>''')

    for idx, page_lines in enumerate(pages_data, 1):
        html.append('<div class="page">')
        html.append(f'<div class="hdr"><span>{SOFT_NAME} {VERSION}</span><span>第 {idx} 页 / 共 {len(pages_data)} 页</span></div>')
        html.append('<div class="code">')
        html.append(esc('\n'.join(page_lines)) if page_lines else '')
        html.append('</div>')
        html.append(f'<div class="ftr">第 {idx} 页</div>')
        html.append('</div>')

    html.append('</body></html>')

    p_html = os.path.join(OUT, '02-源程序鉴别材料.html')
    io.open(p_html, 'w', encoding='utf-8', newline='\n').write('\n'.join(html))

    # ---------- TXT 备份 ----------
    txt = []
    for idx, page_lines in enumerate(pages_data, 1):
        txt.append(f'{SOFT_NAME} {VERSION}\t\t\t\t\t第 {idx} 页 / 共 {len(pages_data)} 页')
        txt.append('-' * 78)
        txt.extend(page_lines)
        txt.append('')
        txt.append('\f')
    p_txt = os.path.join(OUT, '02-源程序鉴别材料.txt')
    io.open(p_txt, 'w', encoding='utf-8', newline='\n').write('\n'.join(txt))

    print(f'  已生成 {p_html}')
    print(f'  已生成 {p_txt}')


if __name__ == '__main__':
    main()

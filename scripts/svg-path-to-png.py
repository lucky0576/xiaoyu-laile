# -*- coding: utf-8 -*-
"""
把 SVG 里的 <path> 光栅化成 PNG（零依赖，纯 Pillow）

为什么需要它：
  这台机器和服务器上都没有 rsvg-convert / inkscape / cairosvg / sharp，
  浏览器截图对稍大的区域又会 CDP 超时。所以直接解析 path 的 d 属性，
  把贝塞尔和圆弧拍平成多边形，再用 Pillow 填充 —— 4 倍超采样后缩小，
  边缘足够干净。

支持的命令：M m L l H h V v C c S s Q q T t A a Z z
（Huawei 这份图标只用到 M/S/C/l/h/v/a/z，其余是顺手补齐）

用法：
  python scripts/svg-path-to-png.py <input.svg> <output.png> [--size 1024] [--color ffffff]
"""

import math
import re
import sys

from PIL import Image, ImageDraw


# ---------------------------------------------------------------- 路径解析

NUM_RE = re.compile(r'[-+]?(?:\d*\.\d+|\d+\.?)(?:[eE][-+]?\d+)?')
CMD_RE = re.compile(r'([MmZzLlHhVvCcSsQqTtAa])')


def tokenize(d):
    """把 d 属性拆成 [(cmd, [num, ...]), ...]"""
    out = []
    # CMD_RE.split 的结果是 ['前导垃圾', 命令1, 参数1, 命令2, 参数2, ...]
    parts = CMD_RE.split(d)
    i = 1
    while i < len(parts):
        cmd = parts[i].strip()
        nums_raw = parts[i + 1] if i + 1 < len(parts) else ''
        nums = [float(x) for x in NUM_RE.findall(nums_raw)] if nums_raw else []
        if cmd:
            out.append((cmd, nums))
        i += 2
    return out


def arc_to_beziers(x1, y1, rx, ry, phi_deg, large_arc, sweep, x2, y2):
    """SVG 圆弧 → 若干三次贝塞尔段（标准实现，见 SVG 规范 F.6.5）"""
    if rx == 0 or ry == 0:
        return [(x1, y1, x2, y2, x2, y2)]
    phi = math.radians(phi_deg)
    cos_phi, sin_phi = math.cos(phi), math.sin(phi)

    dx2, dy2 = (x1 - x2) / 2.0, (y1 - y2) / 2.0
    x1p = cos_phi * dx2 + sin_phi * dy2
    y1p = -sin_phi * dx2 + cos_phi * dy2

    rx, ry = abs(rx), abs(ry)
    lam = (x1p ** 2) / (rx ** 2) + (y1p ** 2) / (ry ** 2)
    if lam > 1:
        s = math.sqrt(lam)
        rx *= s
        ry *= s

    sign = -1 if large_arc == sweep else 1
    num = rx ** 2 * ry ** 2 - rx ** 2 * y1p ** 2 - ry ** 2 * x1p ** 2
    den = rx ** 2 * y1p ** 2 + ry ** 2 * x1p ** 2
    co = sign * math.sqrt(max(0.0, num / den)) if den else 0.0
    cxp = co * rx * y1p / ry
    cyp = -co * ry * x1p / rx

    cx = cos_phi * cxp - sin_phi * cyp + (x1 + x2) / 2.0
    cy = sin_phi * cxp + cos_phi * cyp + (y1 + y2) / 2.0

    def angle(ux, uy, vx, vy):
        dot = ux * vx + uy * vy
        n = math.hypot(ux, uy) * math.hypot(vx, vy)
        a = math.acos(max(-1.0, min(1.0, dot / n))) if n else 0.0
        return -a if (ux * vy - uy * vx) < 0 else a

    theta1 = angle(1, 0, (x1p - cxp) / rx, (y1p - cyp) / ry)
    dtheta = angle((x1p - cxp) / rx, (y1p - cyp) / ry, (-x1p - cxp) / rx, (-y1p - cyp) / ry)
    if sweep == 0 and dtheta > 0:
        dtheta -= 2 * math.pi
    elif sweep == 1 and dtheta < 0:
        dtheta += 2 * math.pi

    segs = []
    nseg = max(1, int(math.ceil(abs(dtheta) / (math.pi / 2))))
    delta = dtheta / nseg
    t = (4.0 / 3.0) * math.tan(delta / 4.0)

    for i in range(nseg):
        a1 = theta1 + i * delta
        a2 = a1 + delta
        cos1, sin1 = math.cos(a1), math.sin(a1)
        cos2, sin2 = math.cos(a2), math.sin(a2)

        def map_pt(px, py):
            return (
                cx + rx * px * cos_phi - ry * py * sin_phi,
                cy + rx * px * sin_phi + ry * py * cos_phi,
            )

        p1 = map_pt(cos1, sin1)
        p2 = map_pt(cos2, sin2)
        d1 = map_pt(cos1 - t * sin1, sin1 + t * cos1)
        d2 = map_pt(cos2 + t * sin2, sin2 - t * cos2)
        segs.append((d1[0], d1[1], d2[0], d2[1], p2[0], p2[1]))
    return segs


def flatten(path_d, steps=18):
    """返回若干子路径（每条是点列表），坐标与 viewBox 一致。"""
    subs = []
    cur = []
    x = y = 0.0
    sx = sy = 0.0          # 子路径起点
    last_c2 = None         # 上一段二阶控制点（S/s 用）
    prev_cmd = ''

    def add(px, py):
        cur.append((px, py))

    for cmd, nums in tokenize(path_d):
        rel = cmd.islower()
        C = cmd.upper()
        idx = 0

        if C == 'Z':
            if cur:
                cur.append((sx, sy))
                subs.append(cur)
                cur = []
            x, y = sx, sy
            prev_cmd = 'Z'
            continue

        while True:
            need = {'M': 2, 'L': 2, 'H': 1, 'V': 1, 'C': 6, 'S': 4, 'Q': 4, 'T': 2, 'A': 7}[C]
            if idx + need > len(nums):
                break
            a = nums[idx:idx + need]
            idx += need

            if C == 'M':
                nx, ny = (x + a[0], y + a[1]) if rel else (a[0], a[1])
                if cur:
                    subs.append(cur)
                cur = []
                x, y = nx, ny
                sx, sy = nx, ny
                add(x, y)
                # 后续数字按 L 处理
                C = 'L'
                prev_cmd = 'M'
                continue

            if C == 'L':
                x, y = (x + a[0], y + a[1]) if rel else (a[0], a[1])
                add(x, y)
            elif C == 'H':
                x = x + a[0] if rel else a[0]
                add(x, y)
            elif C == 'V':
                y = y + a[0] if rel else a[0]
                add(x, y)
            elif C in ('C', 'S'):
                if C == 'C':
                    c1 = (x + a[0], y + a[1]) if rel else (a[0], a[1])
                    c2 = (x + a[2], y + a[3]) if rel else (a[2], a[3])
                    p3 = (x + a[4], y + a[5]) if rel else (a[4], a[5])
                else:
                    if prev_cmd in ('C', 'S') and last_c2:
                        c1 = (2 * x - last_c2[0], 2 * y - last_c2[1])
                    else:
                        c1 = (x, y)
                    c2 = (x + a[0], y + a[1]) if rel else (a[0], a[1])
                    p3 = (x + a[2], y + a[3]) if rel else (a[2], a[3])
                for i in range(1, steps + 1):
                    t = i / steps
                    mt = 1 - t
                    px = (mt ** 3) * x + 3 * (mt ** 2) * t * c1[0] + 3 * mt * (t ** 2) * c2[0] + (t ** 3) * p3[0]
                    py = (mt ** 3) * y + 3 * (mt ** 2) * t * c1[1] + 3 * mt * (t ** 2) * c2[1] + (t ** 3) * p3[1]
                    add(px, py)
                last_c2 = c2
                x, y = p3
            elif C in ('Q', 'T'):
                if C == 'Q':
                    q = (x + a[0], y + a[1]) if rel else (a[0], a[1])
                    p3 = (x + a[2], y + a[3]) if rel else (a[2], a[3])
                else:
                    q = (2 * x - last_c2[0], 2 * y - last_c2[1]) if last_c2 else (x, y)
                    p3 = (x + a[0], y + a[1]) if rel else (a[0], a[1])
                for i in range(1, steps + 1):
                    t = i / steps
                    mt = 1 - t
                    px = (mt ** 2) * x + 2 * mt * t * q[0] + (t ** 2) * p3[0]
                    py = (mt ** 2) * y + 2 * mt * t * q[1] + (t ** 2) * p3[1]
                    add(px, py)
                last_c2 = q
                x, y = p3
            elif C == 'A':
                rx, ry, rot, laf, sf = a[0], a[1], a[2], int(a[3]), int(a[4])
                nx, ny = (x + a[5], y + a[6]) if rel else (a[5], a[6])
                for seg in arc_to_beziers(x, y, rx, ry, rot, laf, sf, nx, ny):
                    c1x, c1y, c2x, c2y, ex, ey = seg
                    for i in range(1, steps + 1):
                        t = i / steps
                        mt = 1 - t
                        px = (mt ** 3) * x + 3 * (mt ** 2) * t * c1x + 3 * mt * (t ** 2) * c2x + (t ** 3) * ex
                        py = (mt ** 3) * y + 3 * (mt ** 2) * t * c1y + 3 * mt * (t ** 2) * c2y + (t ** 3) * ey
                        add(px, py)
                x, y = nx, ny
            prev_cmd = C

        if idx == 0:
            prev_cmd = C

    if cur:
        subs.append(cur)
    return subs


def render(svg_text, out_path, size=1024, color=(255, 255, 255), ss=4):
    vb = re.search(r'viewBox="([^"]+)"', svg_text)
    if vb:
        vx, vy, vw, vh = [float(t) for t in re.split(r'[ ,]+', vb.group(1).strip())]
    else:
        vx, vy, vw, vh = 0.0, 0.0, 24.0, 24.0

    paths = re.findall(r'<path[^>]*\sd="([^"]+)"', svg_text)
    if not paths:
        raise SystemExit('SVG 里没有 <path>')

    W = size * ss
    scale = W / max(vw, vh)

    img = Image.new('RGBA', (W, W), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    total_pts = 0
    for d in paths:
        for sub in flatten(d, steps=16):
            if len(sub) < 3:
                continue
            pts = [((px - vx) * scale, (py - vy) * scale) for px, py in sub]
            draw.polygon(pts, fill=color + (255,))
            total_pts += len(pts)

    img = img.resize((size, size), Image.LANCZOS)
    img.save(out_path, 'PNG')
    return total_pts, img.size


def main():
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    if len(args) < 2:
        print('用法: python svg-path-to-png.py <in.svg> <out.png> [--size 1024] [--color ffffff]')
        raise SystemExit(2)
    src, dst = args[0], args[1]
    size = 1024
    color = (255, 255, 255)
    for a in sys.argv[1:]:
        if a.startswith('--size'):
            size = int(a.split('=', 1)[1] if '=' in a else 1024)
        if a.startswith('--color'):
            hexv = a.split('=', 1)[1] if '=' in a else 'ffffff'
            color = tuple(int(hexv[i:i + 2], 16) for i in (0, 2, 4))
    with open(src, 'r', encoding='utf-8') as f:
        svg = f.read()
    pts, sz = render(svg, dst, size=size, color=color)
    print(f'  已生成 {dst}  尺寸 {sz}  顶点数 {pts}')


if __name__ == '__main__':
    try:
        sys.stdout.reconfigure(encoding='utf-8', errors='replace')
    except Exception:
        pass
    main()

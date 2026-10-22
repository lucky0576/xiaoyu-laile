#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""把 icon.svg 的造型复刻成 PWA 所需的 PNG 图标（180/192/512）"""

import os
from PIL import Image, ImageDraw

D = os.path.dirname(os.path.abspath(__file__))
OUTDIR = os.path.join(D, "public", "static")
os.makedirs(OUTDIR, exist_ok=True)

VIEW = 192.0          # SVG viewBox 尺寸
S = 8                 # 超采样倍数
C1 = (0x0B, 0x74, 0xFF)   # 渐变起点 #0b74ff
C2 = (0x00, 0xC2, 0xB2)   # 渐变终点 #00c2b2


def make_icon(size):
    W = size * S
    img = Image.new("RGBA", (W, W), (0, 0, 0, 0))
    px = img.load()

    # ---- 1) 对角线性渐变 ----
    for y in range(W):
        for x in range(W):
            t = (x / (W - 1) + y / (W - 1)) / 2.0
            r = int(C1[0] + (C2[0] - C1[0]) * t)
            g = int(C1[1] + (C2[1] - C1[1]) * t)
            b = int(C1[2] + (C2[2] - C1[2]) * t)
            px[x, y] = (r, g, b, 255)

    # ---- 2) 圆角遮罩（rx = 42/192）----
    mask = Image.new("L", (W, W), 0)
    md = ImageDraw.Draw(mask)
    radius = int(42 / VIEW * W)
    md.rounded_rectangle([0, 0, W - 1, W - 1], radius=radius, fill=255)
    img.putalpha(mask)

    # ---- 3) 画小鱼 ----
    k = W / VIEW          # 缩放系数
    d = ImageDraw.Draw(img)
    WHITE = (255, 255, 255, 255)

    # 鱼身：ellipse cx=86 cy=96 rx=44 ry=35
    cx, cy = 86 * k, 96 * k
    rx, ry = 44 * k, 35 * k
    d.ellipse([cx - rx, cy - ry, cx + rx, cy + ry], fill=WHITE)

    # 鱼尾：三角形 (126,96) (164,66) (164,126)
    d.polygon([(126 * k, 96 * k), (164 * k, 66 * k), (164 * k, 126 * k)], fill=WHITE)

    # 眼睛：circle cx=70 cy=86 r=8
    ex, ey, er = 70 * k, 86 * k, 8 * k
    d.ellipse([ex - er, ey - er, ex + er, ey + er], fill=(0x0B, 0x74, 0xFF, 255))

    # 微笑：近似曲线（用弧线）
    d.arc([52 * k, 108 * k, 92 * k, 140 * k], start=15, end=150,
          fill=(0x0B, 0x74, 0xFF, 140), width=max(2, int(6 * k)))

    # ---- 4) 降采样 ----
    return img.resize((size, size), Image.LANCZOS)


for size in (180, 192, 512):
    out = os.path.join(OUTDIR, "icon-%d.png" % size)
    make_icon(size).save(out, "PNG")
    print("saved:", out, os.path.getsize(out), "bytes")

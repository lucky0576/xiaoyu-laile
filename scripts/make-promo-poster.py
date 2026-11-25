# -*- coding: utf-8 -*-
"""
小鱼来了 · 推广海报生成器（Pillow）

为什么用脚本而不是网页截图：
  浏览器对 1080×1440 这种整块截图会 CDP 超时（实测 400×400 能过、
  540×400 就挂），分块拼接又太碎。Pillow 直接画，稳定且能出 2 倍分辨率。

输出：
  video/shots/poster/小鱼来了-推广海报-1080x1440.png
  video/shots/poster/小鱼来了-推广海报-2160x2880.png（2x，印刷/朋友圈用）

用法：python scripts/make-promo-poster.py
"""

import os
import sys
from PIL import Image, ImageDraw, ImageFont, ImageFilter

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
ASSETS = os.path.join(ROOT, 'video', 'poster-assets')
OUT_DIR = os.path.join(ROOT, 'video', 'shots', 'poster')

# 设计稿坐标系（逻辑尺寸），最终按 SCALE 放大
W, H = 1080, 1440
SCALE = 2

FONT_REG = r'C:\Windows\Fonts\msyh.ttc'      # 微软雅黑
FONT_BOLD = r'C:\Windows\Fonts\msyhbd.ttc'   # 微软雅黑 Bold

C_WHITE = (255, 255, 255)
C_TEAL = (124, 240, 221)
C_SUB = (191, 230, 255)
C_DIM = (169, 216, 242)
C_GOLD = (255, 231, 168)
C_BADGE_TXT = (58, 36, 0)


def font(size, bold=False):
    """按逻辑像素给定字号，内部乘 SCALE。"""
    return ImageFont.truetype(FONT_BOLD if bold else FONT_REG, int(size * SCALE))


def lerp(a, b, t):
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))


def vertical_gradient(size, stops):
    """stops: [(position 0~1, rgb), ...]，返回 RGB 图。"""
    w, h = size
    img = Image.new('RGB', (w, h))
    px = img.load()
    for y in range(h):
        t = y / max(1, h - 1)
        # 找到所在区间
        c = stops[0][1]
        for i in range(len(stops) - 1):
            p0, c0 = stops[i]
            p1, c1 = stops[i + 1]
            if p0 <= t <= p1:
                k = (t - p0) / max(1e-6, (p1 - p0))
                c = lerp(c0, c1, k)
                break
        else:
            c = stops[-1][1]
        for x in range(w):
            px[x, y] = c
    return img


def rounded_mask(size, radius):
    m = Image.new('L', size, 0)
    d = ImageDraw.Draw(m)
    d.rounded_rectangle([0, 0, size[0] - 1, size[1] - 1], radius=radius, fill=255)
    return m


def paste_rounded(base, img, xy, radius):
    """把 img 按圆角贴到 base 的 xy 处（img 需带 alpha 或 RGB）。"""
    m = rounded_mask(img.size, radius)
    base.paste(img, xy, m)


def wrap_text(draw, text, fnt, max_width):
    """按像素宽度折行（中文逐字累加）。"""
    lines, cur = [], ''
    for ch in text:
        if ch == '\n':
            lines.append(cur)
            cur = ''
            continue
        test = cur + ch
        if draw.textlength(test, font=fnt) <= max_width:
            cur = test
        else:
            lines.append(cur)
            cur = ch
    if cur:
        lines.append(cur)
    return lines



def text_tracked(draw, xy, text, fnt, fill, tracking=0, anchor_right=None):
    """逐字绘制，支持字间距；anchor_right 给定时按右边界对齐。"""
    widths = [draw.textlength(ch, font=fnt) for ch in text]
    total = sum(widths) + tracking * (len(text) - 1)
    x = (anchor_right - total) if anchor_right is not None else xy[0]
    y = xy[1]
    for ch, cw in zip(text, widths):
        draw.text((x, y), ch, font=fnt, fill=fill)
        x += cw + tracking
    return total

def build(scale_label):
    S = SCALE
    w, h = W * S, H * S
    PAD = 84

    # ---------- 背景 ----------
    bg = vertical_gradient(
        (w, h),
        [
            (0.00, (8, 30, 58)),
            (0.18, (10, 58, 108)),
            (0.47, (10, 105, 135)),
            (0.60, (9, 123, 131)),
            (0.76, (8, 40, 74)),
            (1.00, (5, 25, 45)),
        ],
    ).convert('RGBA')

    # 斜向色带
    stripe = Image.new('RGBA', (1600 * S, 240 * S), (0, 214, 196, 30))
    stripe = stripe.rotate(-8, expand=False, resample=Image.BICUBIC)
    bg.alpha_composite(stripe, (int(-140 * S), int(430 * S)))

    # 左下柔光
    glow = Image.new('RGBA', (900 * S, 900 * S), (0, 0, 0, 0))
    ImageDraw.Draw(glow).ellipse([0, 0, 900 * S, 900 * S], fill=(0, 190, 200, 40))
    glow = glow.filter(ImageFilter.GaussianBlur(80 * S))
    bg.alpha_composite(glow, (int(-300 * S), int(820 * S)))

    d = ImageDraw.Draw(bg)

    # ---------- 顶部品牌 ----------
    logo = Image.open(os.path.join(ASSETS, 'logo-white.png')).convert('RGBA')
    logo_h = 58 * S
    logo_w = int(logo.width * logo_h / logo.height)
    logo = logo.resize((logo_w, logo_h), Image.LANCZOS)
    bg.alpha_composite(logo, (int(PAD * S), int(84 * S)))

    f_tag = font(23, bold=True)
    d.text((PAD * S + logo_w + 24 * S, 84 * S + 14 * S), 'AI 产业信息平台', font=f_tag, fill=(159, 208, 238))

    # ---------- 右上角：华为 LOGO + 授权信息 ----------
    right = w - PAD * S

    # 华为花瓣标（矢量光栅化出来的白色版）
    hw_path = os.path.join(ASSETS, 'huawei-flower.png')
    if os.path.exists(hw_path):
        flower_h = 46 * S
        fl = Image.open(hw_path).convert('RGBA')
        fl = fl.crop(fl.getbbox()) if fl.getbbox() else fl
        fw = int(fl.width * flower_h / fl.height)
        fl = fl.resize((fw, flower_h), Image.LANCZOS)
        # 先算 HUAWEI 字宽，好整体右对齐
        f_word = font(25, bold=True)
        word = 'HUAWEI'
        word_w = sum(d.textlength(ch, font=f_word) for ch in word) + 3 * S * (len(word) - 1)
        lockup_w = fw + 14 * S + word_w
        lx = int(right - lockup_w)
        ly = int(84 * S)
        bg.alpha_composite(fl, (lx, ly + int(2 * S)))
        text_tracked(d, (lx + fw + 14 * S, ly + 4 * S), word, f_word,
                     (255, 255, 255), tracking=3 * S)

    # 金色授权徽标
    f_b1 = font(20, bold=True)
    badge1 = '官方服务商 · 经销商（浙江）'
    b1w = d.textlength(badge1, font=f_b1)
    pad_x, pad_y = 18 * S, 9 * S
    bx1 = right - b1w - pad_x * 2
    by1 = 84 * S + 62 * S
    d.rounded_rectangle([bx1, by1, bx1 + b1w + pad_x * 2, by1 + 20 * S + pad_y * 2],
                        radius=9 * S, fill=(255, 214, 110))
    d.text((bx1 + pad_x, by1 + pad_y - 1 * S), badge1, font=f_b1, fill=C_BADGE_TXT)

    # ---------- 主标题 ----------
    f_h1 = font(88, bold=True)
    d.text((PAD * S, 232 * S), '找项目、投资、产业', font=f_h1, fill=C_WHITE)
    d.text((PAD * S, 340 * S), '小鱼来了', font=f_h1, fill=C_TEAL)

    f_h2 = font(33, bold=True)
    d.text((PAD * S, 470 * S), '让每一条好项目，都被对的人看见', font=f_h2, fill=C_SUB)

    # ---------- 介绍卡（半透明，alpha_composite 才能保留透明度） ----------
    card_x, card_y = PAD * S, 528 * S
    card_w, card_h = w - PAD * 2 * S, 372 * S

    card = Image.new('RGBA', (card_w, card_h), (0, 0, 0, 0))
    cd = ImageDraw.Draw(card)
    cd.rounded_rectangle([0, 0, card_w - 1, card_h - 1], radius=28 * S,
                         fill=(255, 255, 255, 30),
                         outline=(160, 220, 255, 86), width=max(1, 2 * S))

    ix, iy = 44 * S, 36 * S
    cd.rounded_rectangle([ix, iy + 2 * S, ix + 8 * S, iy + 28 * S], radius=4 * S, fill=(35, 211, 192))
    f_lab = font(21, bold=True)
    cd.text((ix + 20 * S, iy - 2 * S), '关于我们', font=f_lab, fill=(111, 227, 209))

    intro = (
        '小鱼来了是AI驱动的产业信息发布与对接平台。项目、投资、招投标、活动赛事、'
        '贸易采供、科技成果转化等，一站式免费发布。AI自动生成标题与解析，'
        '按行业和城市精准推给对的人。让每一条好项目，都被对的人看见。'
    )
    f_body = font(31)
    lines = wrap_text(cd, intro, f_body, card_w - 88 * S)
    ty = iy + 56 * S
    for ln in lines:
        cd.text((ix, ty), ln, font=f_body, fill=(232, 244, 255))
        ty += int(31 * 1.72) * S

    bg.alpha_composite(card, (int(card_x), int(card_y)))

    # ---------- 能力标签（两行，避开底部） ----------
    chips = [('项目投资', True), ('AI 招投标', True), ('活动赛事', False),
             ('贸易采供', False), ('科技成果转化', False), ('新闻资讯', False)]
    f_chip = font(21, bold=True)
    cx, cy = PAD * S, 946 * S
    chh = 21 * S + 24 * S
    for label, hot in chips:
        cw = d.textlength(label, font=f_chip) + 38 * S
        if cx + cw > w - PAD * S:
            cx = PAD * S
            cy += chh + 14 * S
        if hot:
            d.rounded_rectangle([cx, cy, cx + cw, cy + chh], radius=chh // 2, fill=C_TEAL)
            d.text((cx + 19 * S, cy + 12 * S), label, font=f_chip, fill=(6, 34, 46))
        else:
            d.rounded_rectangle([cx, cy, cx + cw, cy + chh], radius=chh // 2,
                                fill=(120, 205, 255, 36),
                                outline=(150, 220, 255, 96), width=max(1, 2 * S))
            d.text((cx + 19 * S, cy + 12 * S), label, font=f_chip, fill=(214, 241, 255))
        cx += cw + 12 * S

    # ---------- 底部：二维码 + 信息 ----------
    qr_size = 220 * S
    qr_pad = 13 * S
    qr_y = h - 78 * S - qr_size

    qr_box = Image.new('RGBA', (qr_size, qr_size), (255, 255, 255, 255))
    qr = Image.open(os.path.join(ASSETS, 'qr.png')).convert('RGB').resize(
        (qr_size - qr_pad * 2, qr_size - qr_pad * 2), Image.LANCZOS)
    qr_box.paste(qr, (qr_pad, qr_pad))
    bg.alpha_composite(qr_box, (int(PAD * S), int(qr_y)))

    tx = PAD * S + qr_size + 34 * S
    f_cta = font(42, bold=True)
    cta_y = qr_y + 6 * S
    d.text((tx, cta_y), '扫码进入 ', font=f_cta, fill=C_WHITE)
    cta_w = d.textlength('扫码进入 ', font=f_cta)
    d.text((tx + cta_w, cta_y), '小鱼来了', font=f_cta, fill=C_TEAL)

    f_url = font(28, bold=True)
    d.text((tx, cta_y + int(42 * 1.5) * S), 'xiaoyulaile.online', font=f_url, fill=C_DIM)

    honor = '运营主体：杭州硕鱼科技有限公司'
    f_hon = font(23, bold=True)
    hw = d.textlength(honor, font=f_hon)
    hy = cta_y + int(42 * 1.5) * S + 28 * S + 24 * S
    d.rounded_rectangle([tx, hy, tx + hw + 44 * S, hy + 23 * S + 18 * S],
                        radius=(23 * S + 18 * S) // 2,
                        fill=(255, 207, 102, 34),
                        outline=(255, 207, 102, 110), width=max(1, 2 * S))
    d.text((tx + 22 * S, hy + 9 * S), honor, font=f_hon, fill=C_GOLD)

    return bg.convert('RGB')


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    img = build('2x')
    p2 = os.path.join(OUT_DIR, '小鱼来了-推广海报-2160x2880.png')
    img.save(p2, 'PNG')
    p1 = os.path.join(OUT_DIR, '小鱼来了-推广海报-1080x1440.png')
    img.resize((W, H), Image.LANCZOS).save(p1, 'PNG')
    print(f'  2x  : {p2}  ({os.path.getsize(p2)//1024} KB)')
    print(f'  1x  : {p1}  ({os.path.getsize(p1)//1024} KB)')
    print(f'  尺寸: {img.size}')


if __name__ == '__main__':
    try:
        sys.stdout.reconfigure(encoding='utf-8', errors='replace')
    except Exception:
        pass
    main()

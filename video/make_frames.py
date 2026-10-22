#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""生成「小鱼来了」系统演示视频的画面帧（1920x1080）"""

import os
import sys
from PIL import Image, ImageDraw, ImageFont, ImageFilter

D = os.path.dirname(os.path.abspath(__file__))
SHOTS = os.path.join(D, "shots")
FRAMES = os.path.join(D, "frames")
os.makedirs(FRAMES, exist_ok=True)

W, H = 1920, 1080

BRAND = (0x0B, 0x74, 0xFF)
BRAND_D = (0x0A, 0x5A, 0xC8)
TEAL = (0x00, 0xC2, 0xB2)
DARK = (0x14, 0x1B, 0x24)
GRAY = (0x5A, 0x66, 0x72)
LIGHT = (0x8E, 0x9A, 0xA6)
WHITE = (255, 255, 255)
BG = (0xF4, 0xF8, 0xFC)

FB = "C:/Windows/Fonts/msyhbd.ttc"
FR = "C:/Windows/Fonts/msyh.ttc"


def font(size, bold=False):
    return ImageFont.truetype(FB if bold else FR, size)


def linear_bg(w, h, c1, c2, vertical=True):
    img = Image.new("RGB", (w, h))
    px = img.load()
    for y in range(h):
        t = y / (h - 1) if vertical else 0
        r = int(c1[0] + (c2[0] - c1[0]) * t)
        g = int(c1[1] + (c2[1] - c1[1]) * t)
        b = int(c1[2] + (c2[2] - c1[2]) * t)
        for x in range(w):
            px[x, y] = (r, g, b)
    return img


def round_rect(img, box, radius, fill=None, outline=None, width=1):
    d = ImageDraw.Draw(img)
    d.rounded_rectangle(box, radius=radius, fill=fill, outline=outline, width=width)


def shadow_paste(base, img, xy, radius=18, blur=22, offset=10, alpha=70):
    """带圆角与阴影地把 img 贴到 base 上"""
    w, h = img.size
    # 蒙版
    mask = Image.new("L", (w, h), 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, w - 1, h - 1], radius=radius, fill=255)
    # 阴影
    sh = Image.new("RGBA", (w + blur * 4, h + blur * 4), (0, 0, 0, 0))
    sd = ImageDraw.Draw(sh)
    sd.rounded_rectangle(
        [blur * 2, blur * 2 + offset, blur * 2 + w, blur * 2 + h + offset],
        radius=radius, fill=(0, 0, 0, alpha)
    )
    sh = sh.filter(ImageFilter.GaussianBlur(blur))
    base.paste(sh, (xy[0] - blur * 2, xy[1] - blur * 2), sh)
    base.paste(img, xy, mask)


def draw_text(d, xy, text, f, fill, anchor=None):
    d.text(xy, text, font=f, fill=fill, anchor=anchor)


def slide_header(img, kicker, title, sub=None):
    d = ImageDraw.Draw(img)
    # 顶部品牌条
    d.rectangle([0, 0, W, 8], fill=BRAND)
    # 左上角 logo
    d.rounded_rectangle([70, 52, 118, 100], radius=12, fill=BRAND)
    draw_text(d, (94, 76), "鱼", font(28, True), WHITE, anchor="mm")
    draw_text(d, (134, 76), "小鱼来了", font(28, True), DARK, anchor="lm")
    # kicker
    draw_text(d, (72, 136), kicker.upper(), font(24, True), BRAND)
    # title
    draw_text(d, (70, 176), title, font(60, True), DARK)
    if sub:
        draw_text(d, (72, 254), sub, font(30), GRAY)


def slide_footer(img, idx, total, label=""):
    d = ImageDraw.Draw(img)
    # 底部进度条
    y = H - 46
    d.rounded_rectangle([70, y, W - 70, y + 5], radius=3, fill=(226, 234, 244))
    seg = (W - 140) / total
    d.rounded_rectangle([70, y, 70 + seg * (idx + 1) - 6, y + 5], radius=3, fill=BRAND)
    draw_text(d, (70, y + 18), "小鱼来了 · 系统演示", font(20), LIGHT)
    draw_text(d, (W - 70, y + 18), f"{idx+1} / {total}", font(20, True), LIGHT, anchor="ra")


def load_shot(name):
    p = os.path.join(SHOTS, name)
    if not os.path.exists(p):
        return None
    return Image.open(p).convert("RGB")


# ============================================================ 各类页面

def title_slide():
    img = linear_bg(W, H, (0x0B, 0x74, 0xFF), (0x00, 0x6A, 0xD8))
    # 装饰圆
    deco = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    dd = ImageDraw.Draw(deco)
    dd.ellipse([W - 620, -260, W + 260, 620], fill=(255, 255, 255, 18))
    dd.ellipse([W - 520, -160, W + 160, 520], fill=(255, 255, 255, 14))
    img = Image.alpha_composite(img.convert("RGBA"), deco).convert("RGB")

    d = ImageDraw.Draw(img)
    draw_text(d, (140, 300), "小鱼来了", font(150, True), WHITE)
    draw_text(d, (146, 490), "以 AI + 算力为驱动的产业招商撮合平台", font(46), (0xD6, 0xE8, 0xFF))
    d.rounded_rectangle([146, 596, 300, 606], radius=5, fill=(0x00, 0xC2, 0xB2))
    draw_text(d, (146, 650), "帮政府招商落地 · 帮企业找钱找队伍 · 帮资源人把资源变成收入",
              font(32), (0xE8, 0xF2, 0xFF))
    draw_text(d, (146, 940), "系统演示  ·  2026 年 10 月", font(26), (0xB8, 0xD4, 0xF0))
    return img


def positioning_slide():
    img = Image.new("RGB", (W, H), BG)
    slide_header(img, "Positioning", "我们在做的事",
                 "把「关系密集、无法规模化」的产业对接，变成「效率可复制」的生意")
    d = ImageDraw.Draw(img)

    cards = [
        ("赋能而非替代", "不消灭中间人", "让产业资源人更强，而不是被替代", BRAND),
        ("AI 放大单产", "3–5 倍", "47 页可研报告：人工 2 小时 → AI 20 秒", TEAL),
        ("分佣放大覆盖", "70 / 30", "资源人拿 70%，不雇地推，按成交付费", (0x2E, 0x9E, 0x6C)),
    ]
    x = 90
    for i, (t, big, desc, c) in enumerate(cards):
        box = [x, 380, x + 560, 760]
        round_rect(img, box, 22, fill=WHITE, outline=(0xDC, 0xE6, 0xF2), width=2)
        d.rounded_rectangle([x, 380, x + 560, 390], radius=5, fill=c)
        draw_text(d, (x + 36, 430), t, font(40, True), DARK)
        draw_text(d, (x + 36, 500), big, font(66, True), c)
        # 描述换行
        words = desc
        if len(words) > 18:
            draw_text(d, (x + 36, 600), words[:18], font(26), GRAY)
            draw_text(d, (x + 36, 642), words[18:], font(26), GRAY)
        else:
            draw_text(d, (x + 36, 600), words, font(26), GRAY)
        x += 590
    slide_footer(img, 1, 9)
    return img


def shot_slide(idx, total, kicker, title, sub, shot_name, bullets, layout="right"):
    img = Image.new("RGB", (W, H), BG)
    slide_header(img, kicker, title, sub)
    d = ImageDraw.Draw(img)

    shot = load_shot(shot_name)
    if shot is None:
        return img

    # 截图区域
    max_w = 1180 if layout == "right" else 1000
    sw = max_w
    sh = int(shot.height * sw / shot.width)
    if sh > 600:
        sh = 600
        sw = int(shot.width * sh / shot.height)
    thumb = shot.resize((sw, sh), Image.LANCZOS)

    if layout == "right":
        sx, sy = 660, 300
        shadow_paste(img, thumb, (sx, sy))
        # 左侧要点
        yy = 330
        for b in bullets:
            d.ellipse([100, yy + 10, 118, yy + 28], fill=BRAND)
            draw_text(d, (140, yy), b, font(30), DARK)
            yy += 92
    else:
        sx = (W - sw) // 2
        sy = 300
        shadow_paste(img, thumb, (sx, sy))
        yy = sy + sh + 30
        for i, b in enumerate(bullets[:2]):
            draw_text(d, (90 + i * 900, yy), "· " + b, font(26), GRAY)

    slide_footer(img, idx, total)
    return img


def stats_slide():
    img = Image.new("RGB", (W, H), (0x0F, 0x17, 0x20))
    d = ImageDraw.Draw(img)
    d.rectangle([0, 0, W, 8], fill=BRAND)
    draw_text(d, (70, 136), "TECHNOLOGY", font(24, True), (0x6F, 0xB4, 0xFF))
    draw_text(d, (70, 176), "技术底座：零依赖架构", font(60, True), WHITE)
    draw_text(d, (72, 254), "全部基于 Node.js 内置模块实现，不引入任何第三方包", font(30), (0xA8, 0xBA, 0xCC))

    stats = [("31,330", "行代码"), ("164", "个 API 接口"), ("909", "项自动化测试"), ("0", "个第三方依赖")]
    x = 90
    for v, l in stats:
        round_rect(img, [x, 360, x + 400, 560], 20, fill=(0x1B, 0x27, 0x33), outline=(0x2C, 0x3C, 0x4C), width=2)
        draw_text(d, (x + 200, 420), v, font(74, True), (0x6F, 0xB4, 0xFF), anchor="ma")
        draw_text(d, (x + 200, 512), l, font(26), (0x9A, 0xAC, 0xBC), anchor="ma")
        x += 440

    items = [
        "自研中文 PDF 解析：ToUnicode CMap，47 页文档 26,190 字符命中、零缺失",
        "长文档分块汇总：实测 30,790 字，自动提取 17 个结构化字段",
        "AI 可插拔：DeepSeek / 通义 / Kimi 任意 OpenAI 协议接口，在线切换无需重启",
        "部署极轻：单进程运行，1 核 1G 服务器即可承载，解压即用",
    ]
    y = 640
    for it in items:
        d.ellipse([96, y + 12, 112, y + 28], fill=TEAL)
        draw_text(d, (136, y), it, font(28), (0xD8, 0xE4, 0xEE))
        y += 78
    slide_footer(img, 7, 9)
    return img


def ending_slide():
    img = linear_bg(W, H, (0x0B, 0x74, 0xFF), (0x00, 0x6A, 0xD8))
    deco = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    dd = ImageDraw.Draw(deco)
    dd.ellipse([-300, H - 520, 520, H + 300], fill=(255, 255, 255, 16))
    img = Image.alpha_composite(img.convert("RGBA"), deco).convert("RGB")
    d = ImageDraw.Draw(img)

    draw_text(d, (W // 2, 330), "小 鱼 来 了", font(96, True), WHITE, anchor="mm")
    draw_text(d, (W // 2, 440), "https://xiaoyulaile.online", font(64, True), (0xD6, 0xE8, 0xFF), anchor="mm")
    d.rounded_rectangle([W // 2 - 90, 510, W // 2 + 90, 518], radius=4, fill=(0x00, 0xC2, 0xB2))
    draw_text(d, (W // 2, 600), "帮政府招商落地 · 帮企业找钱找队伍 · 帮资源人把资源变成收入",
              font(32), (0xE8, 0xF2, 0xFF), anchor="mm")
    draw_text(d, (W // 2, 720), "以 AI + 算力为驱动的产业招商撮合平台", font(28), (0xB8, 0xD4, 0xF0), anchor="mm")
    return img


# ============================================================ 生成

slides = []

slides.append(("01-title", title_slide(), 7))
slides.append(("02-positioning", positioning_slide(), 9))
slides.append(("03-home", shot_slide(
    2, 9, "Home", "平台首页",
    "短视频 / 直播轮播 · 四大业务板块 · 推荐项目智能排序",
    "01-home.png",
    ["短视频与直播轮播，展示项目现场", "项目 / 活动 / 贸易 / 悬赏 四大板块",
     "群聊、会议、通讯录一键直达", "登录后可发布项目、建群开会"]), 11))
slides.append(("04-list", shot_slide(
    3, 9, "List", "项目列表",
    "行业 / 城市 / 类型多维筛选 · AI 评分排序",
    "02-list-project.png",
    ["19 种项目类型：股权融资、EPC、EMC、转让…", "43 个行业一级分类、645 个细分",
     "AI 评分自动排序，98 分优先展示", "有效期倒计时，过期自动下架"]), 11))
slides.append(("05-detail", shot_slide(
    4, 9, "Detail", "项目详情",
    "未登录仅见摘要，登录后可见全文、附件与商务条件",
    "04-detail.png",
    ["分享出去后先登录才能看，保护项目方隐私", "发布方实名与企业认证标识",
     "项目对接 / 群聊 / 会议 一键发起", "有效期、行业标签、金额结构完整呈现"]), 12))
slides.append(("06-bounty", shot_slide(
    5, 9, "Bounty", "悬赏与活动",
    "技术攻关、资源对接、招商路演、行业赛事",
    "03-list-bounty.png",
    ["8 种悬赏类型，赏金与结算方式透明", "活动支持在线报名与名额管理"]), 9))
slides.append(("07-mobile", shot_slide(
    6, 9, "Mobile", "移动端体验",
    "同一套前端，手机与桌面自适应 · 可添加到手机桌面",
    "10-mobile-home.png",
    ["移动优先设计，微信内分享直达", "支持添加到手机桌面，像 App 一样打开",
     "苹果 / 安卓 / 华为 均可"], "center"), 10))
slides.append(("08-tech", stats_slide(), 12))
slides.append(("09-end", ending_slide(), 7))

total_dur = 0
manifest = []
for name, img, dur in slides:
    path = os.path.join(FRAMES, name + ".png")
    img.save(path, "PNG")
    manifest.append((path, dur))
    total_dur += dur
    print("frame:", name, f"{dur}s", img.size)

print()
print("total duration:", total_dur, "s")

with open(os.path.join(D, "manifest.txt"), "w", encoding="utf-8") as f:
    for p, d in manifest:
        f.write("%s|%d\n" % (p, d))
print("manifest written")

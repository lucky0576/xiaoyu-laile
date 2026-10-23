#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""横向栏统一改为可滑动：
- 首页推荐项目 / 热门行业 / 筛选 chips：加惯性滑动 + 右侧渐隐提示
- 会议控制栏：改为单行可横向滑动（原来换行成 2 排，占 121px）
- 底部导航：超过 5 项时也能滑动
- 分区标题：右侧说明文字不再被挤压
"""

import io
import os

D = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

CSS = r'''

/* ================================================================== */
/* 横向栏：统一「看不到就滑动」                                          */
/* ================================================================== */

/* 通用横滑容器：隐藏滚动条、支持惯性、右侧渐隐提示可滑动 */
.hscroll,
.home-scroll,
.chips.scroll,
.tabbar.scrollable {
  overflow-x: auto;
  overflow-y: hidden;
  -webkit-overflow-scrolling: touch;
  overscroll-behavior-x: contain;
  scrollbar-width: none;
  -ms-overflow-style: none;
  scroll-behavior: smooth;
}
.hscroll::-webkit-scrollbar,
.home-scroll::-webkit-scrollbar,
.chips.scroll::-webkit-scrollbar,
.tabbar.scrollable::-webkit-scrollbar {
  display: none;
}

/* 右侧渐隐：暗示右边还有内容 */
.hscroll,
.home-scroll,
.chips.scroll {
  position: relative;
  padding-right: 18px;
  background-image: linear-gradient(to right, rgba(255, 255, 255, 0) 0, rgba(255, 255, 255, 0) calc(100% - 26px), rgba(255, 255, 255, .95) 100%);
  background-repeat: no-repeat;
  background-size: 100% 100%;
}
/* 滑到最右时渐隐消失（由 JS 加 .at-end） */
.hscroll.at-end,
.home-scroll.at-end,
.chips.scroll.at-end {
  background-image: none;
}

/* ---------------- 会议控制栏：单行横滑 ---------------- */
.mt-bar {
  flex:none;
  display: flex;
  align-items: center;
  justify-content: flex-start;
  gap: 6px;
  padding: 8px 10px calc(8px + var(--safe-b));
  background: #1b1f27;
  border-top: 1px solid #262b35;
  flex-wrap: nowrap;
  overflow-x: auto;
  overflow-y: hidden;
  -webkit-overflow-scrolling: touch;
  overscroll-behavior-x: contain;
  scrollbar-width: none;
}
.mt-bar::-webkit-scrollbar { display: none; }
.mt-btn { flex: none; }

/* ---------------- 分区标题：右侧说明不被挤压 ---------------- */
.section-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 10px;
  flex-wrap: wrap;
}
.section-head > span,
.section-head > .tiny {
  flex: 0 1 auto;
  min-width: 0;
  text-align: right;
}

/* ---------------- 列表标题行：徽标不挤压标题 ---------------- */
.item-title { flex-wrap: wrap; row-gap: 4px; }

/* ---------------- 底部导航：多于 5 项时可滑动 ---------------- */
.tabbar.scrollable {
  display: flex;
  justify-content: center;
  grid-template-columns: none;
}
.tabbar.scrollable a {
  flex: 0 0 auto;
  min-width: 66px;
}
'''

# 追加到 home.css
F = os.path.join(D, "public", "static", "home.css")
with io.open(F, "a", encoding="utf-8") as f:
    f.write(CSS)
print("OK home.css 已追加横滑样式")

# ---------- JS：给横滑容器加 at-end 状态 + 底部导航自动可滑动 ----------
J = os.path.join(D, "public", "static", "app.js")
t = io.open(J, "r", encoding="utf-8").read()

if "function bindHScroll" not in t:
    HELPER = r"""
/* ------------------------------------------------------------------ */
/* 横向栏：滑到最右时去掉渐隐提示                                        */
/* ------------------------------------------------------------------ */
export function bindHScroll(root = document) {
  const els = root.querySelectorAll('.hscroll, .home-scroll, .chips.scroll');
  els.forEach((el) => {
    const sync = () => {
      const atEnd = el.scrollLeft + el.clientWidth >= el.scrollWidth - 4;
      el.classList.toggle('at-end', atEnd);
    };
    if (el.scrollWidth <= el.clientWidth + 4) {
      el.classList.add('at-end');
    }
    el.addEventListener('scroll', sync, { passive: true });
    // 内容异步渲染后再同步一次
    setTimeout(sync, 300);
  });
}

/* 底部导航项过多时改为可横向滑动 */
function syncTabbar() {
  const bar = document.querySelector('.tabbar');
  if (!bar) return;
  const links = bar.querySelectorAll('a');
  bar.style.gridTemplateColumns = '';
  if (links.length > 5) {
    bar.classList.add('scrollable');
  } else {
    bar.classList.remove('scrollable');
  }
}
"""
    # 放在 shell 函数之前
    anchor = "function shell("
    if anchor in t:
        t = t.replace(anchor, HELPER + "\n" + anchor, 1)
        print("OK app.js 已加 bindHScroll")
    else:
        # 退回到文件末尾前注入
        idx = t.rfind("export ")
        t = t[:idx] + HELPER + "\n" + t[idx:]
        print("OK app.js 已在末尾前注入 bindHScroll")

# 在渲染完成后调用
if "bindHScroll(document)" not in t:
    OLD = "  document.body.insertAdjacentHTML('beforeend', '')" if False else None
    # 找 shell 里返回 html 前的位置：简单在 render 完成后统一调用
    anchor2 = "export function bindShell("
    if anchor2 in t:
        t = t.replace(anchor2, """export function bindShell(root = document) {
  try {
    bindHScroll(root);
    syncTabbar();
  } catch {
    /* 忽略 */
  }""", 1)
        print("OK bindShell 已调用 bindHScroll/syncTabbar")

io.open(J, "w", encoding="utf-8").write(t)
print("OK app.js 已更新")

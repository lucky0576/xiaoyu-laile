#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
浙江招投标采集：用 Playwright 抓取各区县公共资源交易/政府采购列表。
输出 JSON 给 Node 服务去重落库。

支持来源（2026-11 实测）：
- 上城区（表格行）
- 西湖区（建易，列表直链）
- 余杭区（列表直链）
- 富阳区（列表直链）
- 桐庐县（表格行）
- 淳安县（列表直链）
- 建德市（列表直链，归档栏目）

暂不可用：
- 浙江政府采购网：页面超时（境外服务器）
- 萧山区：该栏目是通知公告，不是交易公告
- 临平区：xehome.lpqfpt.cn 在境外服务器不可达
"""
import argparse
import json
import re
import ssl
import sys
import urllib.parse
import urllib.request
from datetime import datetime, timezone, timedelta

from playwright.sync_api import sync_playwright

SOURCES = [
    {
        "id": "shangcheng",
        "name": "上城区公共资源交易",
        "region": "上城区",
        "url": "https://www.hzscsxy.com:8443/#/JYlist",
        "kind": "table",
    },
    {
        "id": "xihu",
        "name": "西湖区公共资源交易（建易）",
        "region": "西湖区",
        "url": "https://www.zhaobide.com/Web/Partner_index?pid=a8b557ad-9cf8-4f67-bf3e-7cf5337c2166",
        "kind": "anchors",
        "href": r"/WebAfficheIndex",
    },
    {
        "id": "yuhang",
        "name": "余杭区公共资源交易",
        "region": "余杭区",
        "url": "https://www.yuhang.gov.cn/col/col1229374049/index.html",
        "kind": "anchors",
        "href": r"/art/",
    },
    {
        "id": "fuyang",
        "name": "富阳区公共资源交易",
        "region": "富阳区",
        "url": "https://www.fuyang.gov.cn/col/col1229429575/index.html",
        "kind": "anchors",
        "href": r"/art/",
    },
    {
        "id": "tonglu",
        "name": "桐庐县公共资源交易",
        "region": "桐庐县",
        "url": "https://tlztb.tonglu.gov.cn:18090/#/home_infolist?id=1011312667018792960",
        "kind": "table",
    },
    {
        "id": "chunan",
        "name": "淳安县公共资源交易",
        "region": "淳安县",
        "url": "https://www.qdh.gov.cn/col/col1229356921/index.html",
        "kind": "anchors",
        "href": r"/art/",
    },
    {
        "id": "jiande",
        "name": "建德市公共资源交易",
        "region": "建德市",
        "url": "https://www.jiande.gov.cn/col/col1229418005/zbggygdbzlm175/index.html",
        "kind": "anchors",
        "href": r"/art/",
    },
]

CITY_SOURCES = [
    {
        "id": "wenzhou",
        "name": "温州市公共资源交易",
        "region": "温州市",
        "url": "https://ggzyjy-eweb.wenzhou.gov.cn/col/col1229696276/index.html",
        "kind": "anchors",
        "href": r"/art/",
        "keywords": ["招标", "采购", "交易", "公告", "工程", "项目", "发包", "拍卖", "招租"],
    },
    {
        "id": "jiaxing",
        "name": "嘉兴市公共资源交易",
        "region": "嘉兴市",
        "url": "https://jxszwsjb.jiaxing.gov.cn/col/col1229743506/index.html",
        "kind": "anchors",
        "href": r"/art/",
        "keywords": ["招标", "采购", "交易", "公告", "工程", "项目", "发包", "拍卖", "招租"],
    },
    {
        "id": "shaoxing",
        "name": "绍兴市公共资源交易",
        "region": "绍兴市",
        "url": "https://ggb.sx.gov.cn/col/col1518854/index.html",
        "kind": "anchors",
        "href": r"/art/",
        "keywords": ["招标", "采购", "交易", "公告", "工程", "项目", "发包", "拍卖", "招租"],
    },
    {
        "id": "quzhou",
        "name": "衢州市公共资源交易",
        "region": "衢州市",
        "url": "https://ggzy.qz.gov.cn/col/col1229683626/index.html",
        "kind": "anchors",
        "href": r"/art/",
        "keywords": ["招标", "采购", "交易", "公告", "工程", "项目", "发包", "拍卖", "招租"],
    },
    {
        "id": "zhoushan",
        "name": "舟山市公共资源交易",
        "region": "舟山市",
        "url": "https://zsztb.zhoushan.gov.cn/col/col1229679798/index.html",
        "kind": "anchors",
        "href": r"/art/",
        "keywords": ["招标", "采购", "交易", "公告", "工程", "项目", "发包", "拍卖", "招租"],
    },
    {
        "id": "ningbo",
        "name": "宁波市阳光采购服务平台",
        "region": "宁波市",
        "url": "https://ygcg.nbcqjy.org/list?type=2&class=2&noticeType=21",
        "kind": "anchors",
        "href": r"/detail\?bulletinId=",
        "wait_ms": 10000,
        "keywords": ["招标", "采购", "公告", "项目"],
    },
    {
        "id": "huzhou",
        "name": "湖州市公共资源交易",
        "region": "湖州市",
        "url": "https://ggzyjy.huzhou.gov.cn/jydtx/gcjs/zbgg/index.html",
        "kind": "anchors",
        "href": r"/art/",
        "wait_ms": 3000,
        "keywords": ["招标", "采购", "交易", "公告", "工程", "项目"],
    },
    {
        "id": "lishui",
        "name": "丽水市公共资源交易",
        "region": "丽水市",
        "url": "https://lssggzy.lishui.gov.cn/col/col1229661790/index.html",
        "kind": "anchors",
        "href": r"/art/",
        "keywords": ["招标", "采购", "交易", "公告", "工程", "项目", "发包", "拍卖", "招租"],
    },
]

ZFCG_SOURCE = {
    "id": "zhejiang-zfcg",
    "name": "浙江政府采购网",
    "region": "浙江省级",
    "url": "https://zfcg.czt.zj.gov.cn/site/category?parentId=600007&childrenCode=ZcyAnnouncement",
    "api": "https://zfcg.czt.zj.gov.cn/portal/category",
    "kind": "zfcg_api",
}

JIANGSU_SOURCE = {
    "id": "jiangsu-jsggzy",
    "name": "江苏省公共资源交易网",
    "region": "江苏省级",
    "url": "https://jsggzy.jszwfw.gov.cn/jyxx/tradeInfonew.html",
    "api": "https://jsggzy.jszwfw.gov.cn/inteligentsearch/rest/esinteligentsearch/getFullTextDataNew",
    "kind": "jsggzy_api",
}

SOURCES = SOURCES + CITY_SOURCES + [ZFCG_SOURCE, JIANGSU_SOURCE]

UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
)
DATE_RE = re.compile(r"20\d{2}[-/.年]\d{1,2}[-/.月]\d{1,2}日?")
BUDGET_RE = re.compile(r"(?:预算金额|采购预算|最高限价|控制价|预算价)[^0-9]{0,12}([\d,.]+\s*(?:万元|元|亿元))")
DEADLINE_RE = re.compile(r"(?:截止时间|投标截止|响应截止|报名截止)[：:\s]*([0-9]{4}[-/.年][0-9]{1,2}[-/.月][0-9]{1,2}日?[^\n，。；]{0,20})")
TENDERER_RE = re.compile(r"(?:采购人|招标人|采购单位|建设单位)(?:名称)?[：:\s]+([^\n，。；]{2,60})")


def classify(text):
    t = str(text or "")
    if re.search(r"产权|出让|转让|出租|拍卖|土地|房产|店面|商铺|资产处置", t):
        return "产权交易"
    if re.search(r"装修|装饰|室内装修|外立面|翻新|修缮工程|改造装修", t):
        return "装修"
    if re.search(r"信息服务|信息化|数据服务|软件开发|软件采购|平台运营|平台服务|网络服务|系统集成|数字化服务|信息系统", t):
        return "信息服务"
    if re.search(r"工程|施工|监理|勘察|设计|改造|修缮|道路|水利|市政|绿化|建设|安装|EPC", t):
        return "工程建设"
    if re.search(r"采购|货物|设备|仪器|车辆|家具|食材|服装|物资|耗材|办公用品", t):
        return "货物采购"
    if re.search(r"服务|物业|保洁|安保|运维|咨询|检测|评估|培训|活动|运营|维保|设计服务", t):
        return "服务采购"
    return "其他"


def tags_of(text):
    mapping = {
        "医疗": r"医院|卫生|医疗|药品|器械|疾控|卫生院",
        "教育": r"学校|教育|学院|中学|小学|幼儿园|培训",
        "信息化": r"信息化|系统|软件|数据|网络|平台|智能化|监控",
        "物业": r"物业|保洁|安保|绿化养护",
        "环卫": r"环卫|垃圾|清运|保洁",
        "水利": r"水利|河道|水库|防洪|堤",
        "交通": r"交通|道路|公路|桥梁|公交",
        "市政": r"市政|管网|道路|路灯|排水",
        "房建": r"房建|建筑|装修|改造|修缮|建设",
        "低空": r"无人机|低空",
        "光伏储能": r"光伏|储能|新能源|充电",
    }
    return [k for k, pat in mapping.items() if re.search(pat, text)]


def clean_text(s):
    return re.sub(r"\s+", " ", str(s or "")).strip()


def too_old(date_str, days=150):
    if not date_str:
        return False
    m = re.match(r'(20\d{2})[-/.年](\d{1,2})[-/.月](\d{1,2})', date_str)
    if not m:
        return False
    try:
        y, mo, d = map(int, m.groups())
        dt = datetime(y, mo, d)
    except Exception:
        return False
    return (datetime.now() - dt).days > days


def parse_date(text):
    m = DATE_RE.search(str(text or ""))
    return m.group(0) if m else ""


def detail_of(page, url):
    try:
        page.goto(url, wait_until="domcontentloaded", timeout=30000)
        page.wait_for_timeout(1500)
        body = page.inner_text("body", timeout=8000)
        title = ""
        try:
            title = page.inner_text("h1", timeout=1500)
        except Exception:
            title = page.title()
        title = clean_text(title)[:120]
        return title, body
    except Exception:
        return "", ""


CITY_PREFIX = {
    "3301": "杭州市",
    "3302": "宁波市",
    "3303": "温州市",
    "3304": "嘉兴市",
    "3305": "湖州市",
    "3306": "绍兴市",
    "3307": "金华市",
    "3308": "衢州市",
    "3309": "舟山市",
    "3310": "台州市",
    "3311": "丽水市",
}

# 页面已单列的杭州区县；其余杭州区县归到「杭州市」
HZ_DISTRICTS = {
    "上城区", "西湖区", "萧山区", "余杭区", "临平区",
    "富阳区", "桐庐县", "淳安县", "建德市",
}


def zfcg_region(row):
    """浙江政府采购 API 的区县名映射到页面现有区域。"""
    name = clean_text(row.get("districtName"))
    if name in HZ_DISTRICTS:
        return name
    code = str(row.get("districtCode") or "")
    if code[:4] == "3301":
        return "杭州市"
    return CITY_PREFIX.get(code[:4], "浙江省级")


def zfcg_date(row):
    ts = row.get("publishDate")
    try:
        dt = datetime.fromtimestamp(float(ts) / 1000, tz=timezone(timedelta(hours=8)))
        return dt.strftime("%Y-%m-%d")
    except Exception:
        return ""


def collect_zfcg_api(src, limit):
    """浙江政府采购网：直接 POST /portal/category，拉最新 100 条。"""
    result = {
        "id": src["id"],
        "name": src["name"],
        "region": src["region"],
        "url": src["url"],
        "status": "ok",
        "count": 0,
        "error": "",
    }
    items = []
    try:
        payload = {"pageNo": 1, "pageSize": 100, "categoryCode": "ZcyAnnouncement"}
        req = urllib.request.Request(
            src["api"],
            data=json.dumps(payload).encode("utf-8"),
            headers={
                "Content-Type": "application/json",
                "Accept": "application/json, text/plain, */*",
                "User-Agent": UA,
                "Referer": src["url"],
                "Origin": "https://zfcg.czt.zj.gov.cn",
            },
            method="POST",
        )
        try:
            with urllib.request.urlopen(req, timeout=40) as resp:
                raw = json.loads(resp.read().decode("utf-8"))
        except ssl.SSLError:
            with urllib.request.urlopen(req, timeout=40, context=ssl._create_unverified_context()) as resp:
                raw = json.loads(resp.read().decode("utf-8"))

        rows = (((raw.get("result") or {}).get("data") or {}).get("data")) or []
        for row in rows:
            title = clean_text(row.get("title"))
            if not title or "框架协议成交结果汇总公告发布的说明" in title:
                continue
            date = zfcg_date(row)
            if too_old(date):
                continue
            region = zfcg_region(row)
            article_id = str(row.get("articleId") or "")
            link = "https://zfcg.czt.zj.gov.cn/site/detail?parentId=600007&articleId=" + urllib.parse.quote(article_id, safe="")
            project_name = clean_text(row.get("projectName"))
            buyer = clean_text(row.get("purchaseName"))
            method = clean_text(row.get("procurementMethod"))
            catalog = clean_text(row.get("gpCatalogName"))
            ann_type = clean_text(row.get("announcementType"))
            budget_price = row.get("budgetPrice")
            budget = ""
            if budget_price not in (None, "", 0):
                try:
                    budget = f"{float(budget_price):,.2f} 元"
                except Exception:
                    budget = f"{budget_price} 元"
            bid_open = clean_text(row.get("bidOpeningTime"))
            category_text = " ".join([title, project_name, catalog, ann_type])
            text = "\n".join(
                [
                    f"来源：浙江政府采购网（{region}）",
                    f"公告标题：{title}",
                    f"项目名称：{project_name or '见公告'}",
                    f"采购人：{buyer or '见公告'}",
                    f"采购方式：{method or '见公告'}",
                    f"公告类型：{ann_type or '见公告'}",
                    f"预算金额：{budget or '见公告'}",
                    f"开标时间：{bid_open or '见公告'}",
                    f"发布时间：{date}",
                    f"原文链接：{link}",
                ]
            )
            items.append(
                {
                    "title": title,
                    "link": link,
                    "text": text,
                    "region": region,
                    "sourceName": "浙江政府采购网",
                    "sourceSite": "浙江政府采购网",
                    "publishAt": date,
                    "budget": budget,
                    "bidDeadline": "",
                    "tenderer": buyer,
                    "projectType": classify(category_text),
                    "tags": tags_of(title + " " + category_text),
                }
            )
            if len(items) >= 100:
                break
        result["count"] = len(items)
    except Exception as e:
        result["status"] = "error"
        result["error"] = f"{type(e).__name__}: {str(e)[:180]}"
    return result, items


JS_CITY_KEYS = [
    ("南京", "南京市"), ("无锡", "无锡市"), ("徐州", "徐州市"),
    ("常州", "常州市"), ("苏州", "苏州市"), ("南通", "南通市"),
    ("连云港", "连云港市"), ("淮安", "淮安市"), ("盐城", "盐城市"),
    ("扬州", "扬州市"), ("镇江", "镇江市"), ("泰州", "泰州市"),
    ("宿迁", "宿迁市"),
]

JS_EXCLUDE_CATEGORY = (
    "招租", "出租", "产权", "土地", "矿业", "药品", "耗材",
    "林权", "海域", "排污", "碳排放", "转让", "挂牌",
)


def js_region(row):
    """江苏公告归属：优先看发布平台/来源字段，再看标题。"""
    for field in ("fieldvalue", "zhuanzai", "zhuanzainew"):
        text = clean_text(row.get(field))
        for key, city in JS_CITY_KEYS:
            if key in text:
                return city
    title = clean_text(row.get("title") or row.get("titlenew"))
    for key, city in JS_CITY_KEYS:
        if key in title:
            return city
    return "江苏省级"


def strip_html(text):
    text = re.sub(r"<script.*?</script>|<style.*?</style>", " ", str(text or ""), flags=re.S | re.I)
    text = re.sub(r"<[^>]+>", " ", text)
    text = re.sub(r"&nbsp;|&#160;", " ", text)
    return re.sub(r"\s+", " ", text).strip()


def collect_jsggzy_api(src, limit):
    """江苏省公共资源交易网：分页取最新公告，过滤产权/招租类。"""
    result = {
        "id": src["id"], "name": src["name"], "region": src["region"],
        "url": src["url"], "status": "ok", "count": 0, "error": "",
    }
    items = []
    seen = set()
    try:
        base = {
            "token": "", "pn": 0, "rn": 10, "sdt": "", "edt": "",
            "wd": "", "inc_wd": "", "exc_wd": "",
            "fields": "title;zhuanzainew;categorynum;zhuanzai;webdate",
            "cnum": "001", "sort": '{"infodatepx":"0"}', "ssort": "title",
            "cl": 200, "terminal": "", "time": None, "highlights": "title",
            "statistics": None, "unionCondition": None, "opCondition": None,
            "opType": 0, "accuracy": "", "noParticiple": "1",
            "searchRange": None, "isBusiness": "1",
            "condition": [{"fieldName": "categorynum", "isLike": True, "likeType": 2, "equal": "003"}],
        }
        for page in range(8):
            payload = dict(base)
            payload["pn"] = page * 10
            req = urllib.request.Request(
                src["api"],
                data=json.dumps(payload).encode("utf-8"),
                headers={
                    "Content-Type": "application/json;charset=utf-8",
                    "Accept": "application/json, text/plain, */*",
                    "User-Agent": UA,
                    "Referer": src["url"],
                    "Origin": "https://jsggzy.jszwfw.gov.cn",
                },
                method="POST",
            )
            try:
                with urllib.request.urlopen(req, timeout=40) as resp:
                    raw = json.loads(resp.read().decode("utf-8"))
            except ssl.SSLError:
                with urllib.request.urlopen(req, timeout=40, context=ssl._create_unverified_context()) as resp:
                    raw = json.loads(resp.read().decode("utf-8"))
            rows = (((raw.get("result") or {}).get("records")) or [])
            if not rows:
                break
            for row in rows:
                category = clean_text(row.get("categoryname"))
                if any(x in category for x in JS_EXCLUDE_CATEGORY):
                    continue
                title = clean_text(row.get("title") or row.get("titlenew"))
                if not title:
                    continue
                date = clean_text(row.get("infodateformat") or row.get("infodatepx"))[:10]
                if too_old(date):
                    continue
                linkurl = clean_text(row.get("linkurl"))
                if not linkurl:
                    continue
                link = linkurl if linkurl.startswith("http") else "https://jsggzy.jszwfw.gov.cn" + linkurl
                if link in seen:
                    continue
                seen.add(link)
                region = js_region(row)
                content = strip_html(row.get("content"))
                budget_m = BUDGET_RE.search(content)
                budget = budget_m.group(1).replace(" ", "") if budget_m else ""
                deadline_m = DEADLINE_RE.search(content)
                deadline = deadline_m.group(1)[:40] if deadline_m else ""
                tenderer_m = TENDERER_RE.search(content)
                tenderer = tenderer_m.group(1).strip() if tenderer_m else ""
                text = "\n".join([
                    f"来源：江苏省公共资源交易网（{region}）",
                    f"公告标题：{title}",
                    f"公告类型：{category or '见公告'}",
                    f"发布平台：{clean_text(row.get('zhuanzainew') or row.get('zhuanzai')) or '江苏省公共资源交易网'}",
                    f"发布时间：{date}",
                    f"预算/限价：{budget or '公告未列明'}",
                    f"截止时间：{deadline or '见公告'}",
                    f"招标/采购人：{tenderer or '见公告'}",
                    f"原文链接：{link}",
                    "",
                    content[:3000],
                ])
                items.append({
                    "title": title,
                    "link": link,
                    "text": text,
                    "region": region,
                    "sourceName": "江苏省公共资源交易网",
                    "sourceSite": "江苏省公共资源交易网",
                    "publishAt": date,
                    "budget": budget,
                    "bidDeadline": deadline,
                    "tenderer": tenderer,
                    "projectType": classify(title + " " + category),
                    "tags": tags_of(title + " " + category + " " + content[:300]),
                })
                if len(items) >= 80:
                    break
            if len(items) >= 80:
                break
        result["count"] = len(items)
    except Exception as e:
        result["status"] = "error"
        result["error"] = f"{type(e).__name__}: {str(e)[:180]}"
    return result, items


def collect_source(browser_ctx, src, limit):
    if src.get("kind") == "zfcg_api":
        return collect_zfcg_api(src, limit)
    if src.get("kind") == "jsggzy_api":
        return collect_jsggzy_api(src, limit)
    page = browser_ctx.new_page()
    page.set_default_timeout(20000)
    result = {"id": src["id"], "name": src["name"], "region": src["region"], "url": src["url"], "status": "ok", "count": 0, "error": ""}
    items = []
    try:
        last_err = None
        for attempt in range(2):
            try:
                page.goto(src["url"], wait_until="domcontentloaded", timeout=40000)
                break
            except Exception as ge:
                last_err = ge
                page.wait_for_timeout(2000)
        if last_err is not None and not page.url.startswith("http"):
            raise last_err
        page.wait_for_timeout(src.get("wait_ms", 6500))
        if src["kind"] == "anchors":
            anchors = page.eval_on_selector_all(
                "a",
                """els => els.map(e => ({href: e.href, text: (e.innerText||'').trim()})).filter(x => x.href && x.text.length >= 8)""",
            )
            seen = set()
            picked = []
            for a in anchors:
                href, text = a["href"], clean_text(a["text"])
                if not re.search(src["href"], href):
                    continue
                if any(k in text for k in ("首页", "网站", "平台", "中国政府", "浙江省", "登录", "无障碍", "隐私", "备案", "网站地图")):
                    continue
                kws = src.get("keywords") or []
                if kws and not any(k in text for k in kws):
                    continue
                if href in seen:
                    continue
                seen.add(href)
                picked.append({"url": href, "title": text})
                if len(picked) >= limit:
                    break
            for p in picked:
                d_title, body = detail_of(page, p["url"])
                title = clean_text(d_title or p["title"]).split("\n")[0][:118]
                text = (d_title + "\n" + body).strip()[:60000]
                date = parse_date(text) or parse_date(p["title"])
                budget = BUDGET_RE.search(text)
                deadline = DEADLINE_RE.search(text)
                tenderer = TENDERER_RE.search(text)
                items.append(
                    {
                        "title": title,
                        "link": p["url"],
                        "text": text[:40000],
                        "region": src["region"],
                        "sourceName": src["name"],
                        "publishAt": date,
                        "budget": clean_text(budget.group(1)) if budget else "",
                        "bidDeadline": clean_text(deadline.group(1)) if deadline else "",
                        "tenderer": clean_text(tenderer.group(1)) if tenderer else "",
                        "projectType": classify(title) if classify(title) != "其他" else classify(text[:1200]),
                        "tags": tags_of(title + " " + text[:3000]),
                    }
                )
        else:
            # 表格行：上城 / 桐庐
            rows = page.eval_on_selector_all(
                "table tr, .el-table__row, .el-table__body tr",
                """els => els.map(e => (e.innerText||'').trim()).filter(t => t && t.length >= 10)""",
            )
            if len(rows) < 2:
                rows = []
                body = page.inner_text("body", timeout=8000)
                for line in body.split("\n"):
                    line = clean_text(line)
                    if DATE_RE.search(line) and len(line) >= 12:
                        rows.append(line)
            seen = set()
            for row in rows:
                lines = [clean_text(x) for x in row.split("\n") if clean_text(x)]
                if not lines:
                    continue
                date = ""
                for x in lines:
                    d = parse_date(x)
                    if d:
                        date = d
                        break
                # 标题：最长的一行（去掉项目编号/日期）
                candidates = [x for x in lines if not re.fullmatch(r"[A-Za-z0-9\-_]{4,}", x) and not DATE_RE.fullmatch(x)]
                title = max(candidates, key=len) if candidates else lines[0]
                title = re.sub(r"^[●•\s]+", "", title)[:118]
                if len(title) < 8 or title in seen:
                    continue
                seen.add(title)
                items.append(
                    {
                        "title": title,
                        "link": src["url"],
                        "text": f"来源：{src['name']}（{src['region']}）\n公告标题：{title}\n发布时间：{date or '见来源'}\n详情请点击原文链接查看。",
                        "region": src["region"],
                        "sourceName": src["name"],
                        "publishAt": date,
                        "budget": "",
                        "bidDeadline": "",
                        "tenderer": "",
                        "projectType": classify(title) if classify(title) != "其他" else classify(row),
                        "tags": tags_of(title),
                    }
                )
                if len(items) >= limit:
                    break
        result["count"] = len(items)
    except Exception as e:
        result["status"] = "error"
        result["error"] = f"{type(e).__name__}: {str(e)[:180]}"
    finally:
        try:
            page.close()
        except Exception:
            pass
    return result, items


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, default=8)
    ap.add_argument("--out", default="/tmp/zj-bidding-items.json")
    args = ap.parse_args()

    # 过滤过旧公告：只保留最近 150 天
    all_items = []
    sources = []
    with sync_playwright() as p:
        browser = p.chromium.launch(
            headless=True,
            args=["--no-sandbox", "--disable-dev-shm-usage", "--disable-blink-features=AutomationControlled"],
        )
        ctx = browser.new_context(
            user_agent=UA,
            viewport={"width": 1440, "height": 1000},
            locale="zh-CN",
            extra_http_headers={"Accept-Language": "zh-CN,zh;q=0.9"},
        )
        ctx.add_init_script(
            "Object.defineProperty(navigator,'webdriver',{get:()=>undefined});"
            "Object.defineProperty(navigator,'languages',{get:()=>['zh-CN','zh']});"
        )
        for src in SOURCES:
            # 其他地市：每市只取最新 3 条，控制总时长（详情页较慢）
            per_limit = min(args.limit, 3) if str(src.get("region", "")).endswith("市") else args.limit
            res, items = collect_source(ctx, src, per_limit)
            sources.append(res)
            fresh = [it for it in items if not too_old(it.get("publishAt", ""))]
            res["count"] = len(fresh)
            all_items.extend(fresh)
            print(f"[zj-bidding] {src['id']}: {res['status']} {res['count']} 条 {res['error']}", file=sys.stderr)
        browser.close()

    out = {
        "generatedAt": datetime.now(timezone(timedelta(hours=8))).isoformat(),
        "sources": sources,
        "items": all_items,
    }
    with open(args.out, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=1)
    print(f"[zj-bidding] saved {len(all_items)} items -> {args.out}", file=sys.stderr)


if __name__ == "__main__":
    main()

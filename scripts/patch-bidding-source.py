import io
ROOT = r"C:\Users\Administrator\Documents\deepseek-harness\default-workspace\xiaoyu-laile"
n = 0

# 1) createListing 保存 sourceName
P1 = ROOT + r"\src\services\listings.js"
s1 = io.open(P1, "r", encoding="utf-8").read()
OLD1 = """    origin: (() => {"""
NEW1 = """    // 来源名称（采集/导入时记录，用于展示「来源：XX」与免责说明）
    sourceName: String(body.sourceName || '').slice(0, 60),
    origin: (() => {"""
if OLD1 in s1 and "sourceName: String(body.sourceName" not in s1:
    s1 = s1.replace(OLD1, NEW1, 1)
    n += 1
    print("ok: createListing 已存 sourceName")

# 2) listingPublic 暴露 sourceName
OLD2 = """    status: l.status,"""
NEW2 = """    status: l.status,
    sourceName: l.sourceName || '',"""
if OLD2 in s1:
    s1 = s1.replace(OLD2, NEW2, 1)
    n += 1
    print("ok: listingPublic 已暴露 sourceName")
io.open(P1, "w", encoding="utf-8").write(s1)

# 3) 详情页招投标块加来源与免责说明
P2 = ROOT + r"\public\static\views-home.js"
s2 = io.open(P2, "r", encoding="utf-8").read()
OLD3 = """          ${
            bd.qualification
              ? `<div class="warn-note mt8">📌 <b>资格要求：</b>${ui.esc(bd.qualification)}</div>`
              : ''
          }
        </div>`"""
NEW3 = """          ${
            bd.qualification
              ? `<div class="warn-note mt8">📌 <b>资格要求：</b>${ui.esc(bd.qualification)}</div>`
              : ''
          }
          <div class="tiny dim mt8" style="line-height:1.7">
            ${listing.sourceName ? `来源：${ui.esc(listing.sourceName)}<br>` : ''}
            本页整理自政府公开公告，仅供检索参考；一切以政府网站原文为准，如与原文不一致以原文为准。
          </div>
        </div>`"""
if OLD3 in s2:
    s2 = s2.replace(OLD3, NEW3, 1)
    n += 1
    print("ok: 招投标块已加来源与免责说明")
else:
    print("WARN: 招投标块未匹配")
io.open(P2, "w", encoding="utf-8").write(s2)
print(f"done（{n} 处）")
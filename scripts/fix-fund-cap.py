import io
ROOT = r"C:\Users\Administrator\Documents\deepseek-harness\default-workspace\xiaoyu-laile"
n = 0

# 1) 积压上限 + 待审核计数
P1 = ROOT + r"\src\services\fund-collect.js"
s1 = io.open(P1, "r", encoding="utf-8").read()

old1 = """  const sources = sourceId ? SOURCES.filter((s) => s.id === sourceId) : SOURCES;
  const report = { scanned: 0, picked: 0, created: 0, skipped: 0, failed: 0, items: [], errors: [] };"""
new1 = """  const sources = sourceId ? SOURCES.filter((s) => s.id === sourceId) : SOURCES;
  const report = { scanned: 0, picked: 0, created: 0, skipped: 0, failed: 0, items: [], errors: [] };

  /*
   * 待审核积压保护：后台还没有审核界面，采集不能无限往里堆。
   * 超过上限就停采，等都审完了再继续 —— 否则文件集合越滚越大，
   * AI 额度也白烧。
   */
  const PENDING_CAP = 200;
  const pendingCount = funds().all().filter((f) => (f.reviewStatus || 'pending') === 'pending').length;
  report.pendingBefore = pendingCount;
  if (pendingCount >= PENDING_CAP) {
    report.note = `待审核已积压 ${pendingCount} 条（上限 ${PENDING_CAP}），本次不采。审完或清掉后会自动恢复。`;
    return report;
  }"""
if old1 in s1:
    s1 = s1.replace(old1, new1, 1)
    n += 1
    print("  ok: 已加积压上限")
else:
    print("  WARN: collect 未匹配")

old2 = """  return report;
}

/** 待审核 / 已发布 列表 */"""
new2 = """  report.pendingAfter = funds().all().filter((f) => (f.reviewStatus || 'pending') === 'pending').length;
  return report;
}

/** 待审核 / 已发布 列表 */"""
if old2 in s1:
    s1 = s1.replace(old2, new2, 1)
    n += 1
    print("  ok: 已回传待审核计数")
io.open(P1, "w", encoding="utf-8").write(s1)

# 2) cron 脚本打印待审核数量
P2 = ROOT + r"\scripts\fund-collect.mjs"
s2 = io.open(P2, "r", encoding="utf-8").read()
old3 = """console.log(
  `[${ts}] 基金采集：扫描 ${d.scanned}，成功 ${d.created}，跳过 ${d.skipped}，失败 ${d.failed}`,
);"""
new3 = """console.log(
  `[${ts}] 基金采集：扫描 ${d.scanned}，成功 ${d.created}，跳过 ${d.skipped}，失败 ${d.failed}` +
    (d.pendingAfter !== undefined ? `，待审核累计 ${d.pendingAfter} 条` : ''),
);
if (d.note) console.log(`  提示：${d.note}`);"""
if old3 in s2:
    s2 = s2.replace(old3, new3, 1)
    n += 1
    print("  ok: 脚本已打印待审核数")
io.open(P2, "w", encoding="utf-8").write(s2)

print(f"done（{n} 处）")
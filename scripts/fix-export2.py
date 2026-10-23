import io

p = r"C:\Users\Administrator\Documents\deepseek-harness\default-workspace\xiaoyu-laile\public\static\app.js"
lines = io.open(p, "r", encoding="utf-8").read().split("\n")

# 1) 删掉孤立的 "export " 行（第 87 行附近）
removed = 0
for i in range(len(lines)):
    if lines[i].strip() == "export":
        lines[i] = None
        removed += 1
lines = [l for l in lines if l is not None]

# 2) 给 function shell( 补 export
for i, l in enumerate(lines):
    if l.lstrip().startswith("function shell(") and "export" not in l:
        indent = l[: len(l) - len(l.lstrip())]
        lines[i] = indent + "export " + l.lstrip()
        print("export added to shell at line", i + 1)
        break

# 3) bindShell 里调用 bindHScroll / syncTabbar
for i, l in enumerate(lines):
    if l.lstrip().startswith("function bindShell(root)"):
        # 在函数体第一行插入调用
        j = i + 1
        while j < len(lines) and lines[j].strip() == "":
            j += 1
        lines.insert(j, "  try { bindHScroll(root); syncTabbar(); } catch { /* ignore */ }")
        print("bindHScroll wired into bindShell at line", j + 1)
        break

io.open(p, "w", encoding="utf-8").write("\n".join(lines))
print("removed stray export lines:", removed)

import io

p = r"C:\Users\Administrator\Documents\deepseek-harness\default-workspace\xiaoyu-laile\public\static\app.js"
lines = io.open(p, "r", encoding="utf-8").read().split("\n")

# 找孤立的 "export " 行（后面紧跟注释块而不是 function/const/class）
fixed = 0
for i in range(len(lines) - 1):
    if lines[i].strip() == "export":
        # 往后找第一个非注释、非空行
        j = i + 1
        while j < len(lines) and (lines[j].strip().startswith("/*") or lines[j].strip().startswith("*")
                                  or lines[j].strip().startswith("//") or lines[j].strip() == ""):
            j += 1
        if j < len(lines) and lines[j].lstrip().startswith("function shell("):
            lines[j] = lines[j].replace("function shell(", "export function shell(", 1)
            lines[i] = ""
            fixed += 1

io.open(p, "w", encoding="utf-8").write("\n".join(lines))
print("fixed stray export:", fixed)

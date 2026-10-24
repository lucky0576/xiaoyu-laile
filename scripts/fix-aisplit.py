import io

p = r"C:\Users\Administrator\Documents\deepseek-harness\default-workspace\xiaoyu-laile\public\static\api.js"
s = io.open(p, "r", encoding="utf-8").read()

old = "  aiSplit: (fd) => api.post('/api/ai/split', fd),"
new = "  aiSplit: (fd, opts) => api.upload('/api/ai/split', fd, opts),"

if old in s:
    s = s.replace(old, new, 1)
    io.open(p, "w", encoding="utf-8").write(s)
    print("ok: aiSplit 改为 upload")
else:
    print("ERROR: 未找到 aiSplit 定义")
    for i, line in enumerate(s.split("\n"), 1):
        if "aiSplit" in line:
            print("  L%d: %s" % (i, line.strip()))

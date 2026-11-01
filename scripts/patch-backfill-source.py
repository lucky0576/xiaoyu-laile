import io
P = r"C:\Users\Administrator\Documents\deepseek-harness\default-workspace\xiaoyu-laile\src\routes\listings.js"
s = io.open(P, "r", encoding="utf-8").read()
OLD = """  /** 从项目文件里移除一个附件（发布方或管理员） */"""
NEW = """  /**
   * 一回性回填：给采集来的信息补「来源名称」。
   * 按原文链接的域名映射成站点名，映射不到就用域名。
   */
  app.post('/api/admin/listings/backfill-source', (req, res) => {
    const user = mustAuth(req);
    if (!user.isAdmin) return fail(res, '需要管理员权限', 403, 'forbidden');
    const HOST_NAMES = {
      'ggzy.suzhou.gov.cn': '苏州市公共资源交易平台',
      'ggzy.zj.gov.cn': '浙江省公共资源交易服务平台',
      'hrss.wenzhou.gov.cn': '温州市人力资源和社会保障局',
      'jshrss.jiangsu.gov.cn': '江苏省人力资源和社会保障厅',
      'www.shanghai.gov.cn': '上海市人民政府',
    };
    const col = db.collection('listings');
    let changed = 0;
    for (const l of col.all()) {
      if (l.sourceName) continue;
      const link = String(l.link || '');
      if (!/^https?:\\/\\//i.test(link)) continue;
      let name = '';
      try {
        const host = new URL(link).hostname;
        name = HOST_NAMES[host] || host;
      } catch {
        continue;
      }
      col.update(l.id, { sourceName: name });
      changed += 1;
    }
    return data(res, { changed });
  });

  /** 从项目文件里移除一个附件（发布方或管理员） */"""
if OLD in s and "backfill-source" not in s:
    s = s.replace(OLD, NEW, 1)
    io.open(P, "w", encoding="utf-8").write(s)
    print("ok: 已加来源回填接口")
else:
    print("WARN: 未匹配")
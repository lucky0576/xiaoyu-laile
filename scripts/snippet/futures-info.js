  /*
   * 期货交割时间轴。
   *
   * 发布方填的是「3 个月」「2027 年 3 月交割」这种相对描述，
   * 读者很难换算成具体日子。这里换算成交割日，
   * 再按「发布 → 交割」画一条进度，一眼看出还剩多久。
   *
   * 注意：这里只做日期换算，不编造任何行情价格 ——
   * 真实的现货/期货价差需要接行情数据源，不能靠猜。
   */
  const futuresInfo = (() => {
    const t = listing.trade;
    if (!t || t.tradeMode !== 'futures') return null;
    const term = String(t.futuresTerm || '').trim();
    if (!term) return null;

    const now = Date.now();
    const start = Date.parse(listing.publishedAt || listing.createdAt || '') || now;
    let target = 0;
    let m;

    if ((m = /(\d{4})\s*[年\-\/.]\s*(\d{1,2})/.exec(term))) {
      // 2027 年 3 月 / 2027-03
      target = new Date(Number(m[1]), Number(m[2]) - 1, 1).getTime();
    } else if ((m = /(\d+(?:\.\d+)?)\s*个?月/.exec(term))) {
      target = start + Number(m[1]) * 30 * 86400_000;
    } else if ((m = /(\d+)\s*周/.exec(term))) {
      target = start + Number(m[1]) * 7 * 86400_000;
    } else if ((m = /(\d+)\s*天/.exec(term))) {
      target = start + Number(m[1]) * 86400_000;
    }

    if (!target || target <= start) return null;

    const total = target - start;
    const passed = Math.min(total, Math.max(0, now - start));
    const days = Math.ceil((target - now) / 86400_000);
    return {
      days,
      pct: Math.max(0, Math.min(100, Math.round((passed / total) * 100))),
      dateText: new Date(target).toLocaleDateString('zh-CN'),
    };
  })();


export async function findPhoto(query) {
  const qs = new URLSearchParams({
    action: 'query',
    format: 'json',
    generator: 'search',
    gsrsearch: query,
    gsrnamespace: '6',
    gsrlimit: '20', // 多拿一些，才有得挑
    prop: 'imageinfo',
    iiprop: 'url|size|mime|extmetadata',
    iiurlwidth: '1400',
  });
  const res = await httpsGet(`https://commons.wikimedia.org/w/api.php?${qs}`, { timeout: 20000 });
  if (res.status !== 200) return null;
  const j = JSON.parse(res.body.toString('utf8'));
  const pages = (j && j.query && j.query.pages) || {};

  /*
   * 必筛：位图、够大、横版
   * 另外把明显不是「现场照片」的排除掉（图表、地图、logo、徽章、海报…），
   * 这些以前会混进封面，看着就不专业。
   */
  const BAD = /(diagram|chart|map|logo|screenshot|poster|graph|plot|icon|sign|table|seal|coat[ _]of[ _]arms|flag|plan|drawing|schematic|infographic|chart)/i;

  const rows = Object.values(pages)
    .map((p) => {
      const ii = Array.isArray(p.imageinfo) ? p.imageinfo[0] : null;
      if (!ii) return null;
      return { title: String(p.title || ''), ii };
    })
    .filter(Boolean)
    .filter(({ ii }) => /^image\/(jpeg|png)$/i.test(ii.mime || ''))
    .filter(({ ii }) => (ii.width || 0) >= 1000)
    .filter(({ ii }) => (ii.width || 0) >= (ii.height || 0)) // 只要横版
    .map(({ title, ii }) => {
      const meta = ii.extmetadata || {};
      const artist = stripHtml(meta.Artist && meta.Artist.value).slice(0, 40);
      const license = stripHtml(
        (meta.LicenseShortName && meta.LicenseShortName.value) ||
          (meta.License && meta.License.value) ||
          'Wikimedia Commons',
      ).slice(0, 24);
      return {
        url: ii.thumburl || ii.url,
        width: ii.width || 0,
        height: ii.height || 0,
        artist: artist || 'Wikimedia',
        license: license || 'CC',
        title,
        desc: stripHtml((meta.ImageDescription && meta.ImageDescription.value) || '').slice(0, 200),
      };
    })
    .filter((x) => x.url);

  if (!rows.length) return null;

  /* ---- 相关性打分：以前只看宽度，结果经常文不对题 ---- */
  const STOP = new Set(['the', 'and', 'of', 'in', 'a', 'an', 'on', 'for', 'with', 'at', 'by', 'from', 'to']);
  const tokens = String(query)
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 3 && !STOP.has(t));

  const scoreOf = (r) => {
    const hay = `${r.title} ${r.desc}`.toLowerCase();
    let s = 0;

    // 整个查询串原样出现，最相关
    if (hay.includes(String(query).toLowerCase())) s += 60;

    // 关键词命中：命中的词越多越相关
    let hit = 0;
    for (const t of tokens) {
      if (hay.includes(t)) hit += 1;
    }
    s += hit * 14;

    // 命中率不足一半 → 扣分，避免「只有一个词碰巧对上」
    if (tokens.length && hit / tokens.length < 0.5) s -= 18;

    // 不像现场照片的，直接压下去
    if (BAD.test(r.title) || BAD.test(r.desc)) s -= 45;

    // 同分时用分辨率兜底（原来的唯一标准，现在只作加权）
    if (r.width >= 2400) s += 6;
    else if (r.width >= 1600) s += 3;

    // 太窄太扁的图（全景长条）当封面会裁得很奇怪
    const ratio = r.width / Math.max(1, r.height);
    if (ratio > 2.6) s -= 8;

    return s;
  };

  rows.forEach((r) => {
    r.score = scoreOf(r);
  });
  rows.sort((a, b) => b.score - a.score || b.width - a.width);

  // 分数太低的宁可不给图（外面会退回渐变封面），也别放张完全不搭的
  const best = rows[0];
  if (!best || best.score < -10) return null;
  return best;
}

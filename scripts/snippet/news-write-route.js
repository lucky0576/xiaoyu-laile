  /** AI 帮写资讯：给素材，出标题 / 摘要 / 正文 */
  app.post('/api/ai/news-write', async (req, res) => {
    const user = mustAuth(req);
    const rl = rateLimit(`newswrite:${clientIp(req)}`, 10, 60_000);
    if (!rl.ok) return fail(res, `操作太频繁，请 ${rl.retryAfter} 秒后再试`, 429, 'rate_limited');

    const source = str(req.body?.source, 12000);
    if (!source.trim()) return fail(res, '请先把素材贴进来', 400, 'empty');

    const aiMod = await import('../services/ai.js');
    const r = await aiMod.writeNews({
      source,
      hint: str(req.body?.hint, 300),
      sourceName: str(req.body?.sourceName, 60),
    });
    if (!r.ok) return data(res, { ok: false, note: r.note });
    return data(res, { ok: true, title: r.title, summary: r.summary, text: r.text, chars: r.text.length });
  });


/**
 * AI 帮写资讯。
 *
 * 输入一段素材（抓来的原文、几行要点、口述记录都行），
 * 输出可以直接发布的标题 / 摘要 / 正文。
 *
 * 注意：要求「不编造素材里没有的事实」——
 * 资讯站最怕 AI 自己加戏，写出一堆查无此事的数字。
 */
export async function writeNews({ source = '', hint = '', sourceName = '' } = {}) {
  const raw = String(source || '').trim();
  if (!raw) return { ok: false, note: '先把素材贴进来' };
  if (!aiConfigured()) return { ok: false, note: 'AI 未配置，去后台填一下模型 Key' };

  const fence = '"""';
  const user = [
    '请根据下面的素材，改写一条可以发布的新闻资讯。',
    '',
    '要求：',
    '1. 标题：不超过 30 个汉字，客观陈述事实，不要标题党、不要感叹号堆砌；',
    '2. 摘要：不超过 80 个汉字，一句话说清「谁、做了什么、关键数字」；',
    '3. 正文：300~1200 字，分 3~6 段，段落之间用换行分隔，不要用 Markdown 标记；',
    '4. 必须保留素材里的关键数据（金额、规模、时间、地点、单位名称），不能改数字；',
    '5. 只写素材里有的信息，绝对不要编造素材中不存在的事实、人物和数字；',
    '6. 语言平实、像行业媒体，不要营销口吻，不要「重磅」「炸裂」这类词；',
    hint ? `7. 额外要求：${String(hint).slice(0, 300)}` : '',
    sourceName ? `8. 来源标注为「${sourceName}」。` : '',
    '',
    '素材：',
    fence + raw.slice(0, 12000) + fence,
    '',
    '请只输出如下 JSON，不要任何解释：',
    '{"title":"","summary":"","text":""}',
  ]
    .filter((x) => x !== '')
    .join('\n');

  try {
    const out = await chat(
      [
        {
          role: 'system',
          content:
            '你是一名严谨的产业财经编辑，擅长把零散素材整理成客观、准确、可发布的资讯。你从不编造事实。',
        },
        { role: 'user', content: user },
      ],
      { json: true, temperature: 0.4, maxTokens: 2600 },
    );
    const parsed = extractJson(out);
    if (!parsed || !parsed.title) {
      return { ok: false, note: 'AI 没能生成内容，换个素材或稍后重试' };
    }
    const title = String(parsed.title || '').trim().slice(0, 200);
    const summary = String(parsed.summary || '').trim().slice(0, 200);
    const text = String(parsed.text || '').trim().slice(0, 200000);
    if (!text || text.length < 20) {
      return { ok: false, note: 'AI 生成的正文太短，换个素材试试' };
    }
    return { ok: true, title, summary, text };
  } catch (err) {
    console.warn('[ai] 资讯帮写失败:', err.message);
    return { ok: false, note: `AI 调用失败：${err.message}` };
  }
}


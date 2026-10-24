# -*- coding: utf-8 -*-
"""多项目自动拆分：AI 识别资料里有几个独立项目/活动/悬赏"""

import io

D = r"C:\Users\Administrator\Documents\deepseek-harness\default-workspace\xiaoyu-laile"

# ================= 1) ai.js: splitItems =================
A = D + r"\src\services\ai.js"
a = io.open(A, "r", encoding="utf-8").read()

if "export async function splitItems" not in a:
    BLOCK = r'''
/* ------------------------------------------------------------------ */
/* 多条目识别与拆分                                                    */
/*   用户常常一次贴一堆项目/活动，这时应该拆成多条分别发布。            */
/*   贸易（采购供应）除外 —— 一个采购清单本身就是一条。                */
/* ------------------------------------------------------------------ */

const SPLIT_LABEL = {
  project: '项目',
  bounty: '悬赏任务',
  event: '活动',
};

export async function splitItems({ text = '', fileText = '', category = 'project' } = {}) {
  const body = `${String(text || '').trim()}\n\n${String(fileText || '').trim()}`.trim();
  const unit = SPLIT_LABEL[category] || '项目';

  if (!body) return { ok: false, count: 0, items: [], note: '没有可分析的内容' };
  if (category === 'trade') return { ok: true, count: 1, items: [], note: '贸易类不拆分' };
  if (!aiConfigured()) return { ok: false, count: 0, items: [], note: '未配置 AI' };

  const user = `下面是一段资料。请判断它包含几个彼此独立的【${unit}】。

规则：
1. 如果只有一个${unit}，返回 {"count":1,"items":[]}；
2. 如果有多个，逐个拆开，每个${unit}单独一条，提取：
   - title：该${unit}的标题（不超过 40 字，要能独立看懂）
   - subtitle：一句话补充（金额/规模/地点/时间，能提取就写，没有就空）
   - text：该${unit}的正文要点（保留原文关键信息，不要编造，150~500 字）
3. count 必须等于 items 的长度；
4. 只是同一${unit}的不同方面（如既有金额又有工期）不算多个，不要拆；
5. 不要编造资料里没有的${unit}。

只输出 JSON，不要解释：
{"count":2,"items":[{"title":"...","subtitle":"...","text":"..."}]}

资料：
"""${body.slice(0, 12000)}"""`;

  try {
    const raw = await chat(
      [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: user },
      ],
      { json: true, temperature: 0.1 },
    );
    const j = extractJson(raw) || {};
    let items = Array.isArray(j.items) ? j.items : [];
    items = items
      .map((x) => ({
        title: String((x && x.title) || '').trim().slice(0, 80),
        subtitle: String((x && x.subtitle) || '').trim().slice(0, 200),
        text: String((x && x.text) || '').trim().slice(0, 4000),
      }))
      .filter((x) => x.title || x.text);

    const count = Math.max(items.length, Number(j.count) || 0);
    if (items.length <= 1) {
      return { ok: true, count: items.length === 1 ? 1 : Math.min(count, 1), items: [], note: '' };
    }
    return { ok: true, count: items.length, items, note: '' };
  } catch (err) {
    return { ok: false, count: 0, items: [], note: `拆分判断失败：${err.message}` };
  }
}

'''
    ANCHOR = "export function asrConfigured() {"
    if ANCHOR not in a:
        print("ERROR: 未找到 asrConfigured")
        raise SystemExit(1)
    a = a.replace(ANCHOR, BLOCK + ANCHOR, 1)
    a = a.replace("export default {\n  extractContactInfo,", "export default {\n  splitItems,\n  extractContactInfo,", 1)
    io.open(A, "w", encoding="utf-8").write(a)
    print("ok: ai.js 已加 splitItems")
else:
    print("ai.js 已有 splitItems")

# ================= 2) core.js 路由 =================
C = D + r"\src\routes\core.js"
c = io.open(C, "r", encoding="utf-8").read()

ANCHOR2 = """  /** 导入链接：抓取网页并抽出正文 */"""
ROUTE = """  /** 判断资料里包含几个独立条目，需要时返回拆分结果 */
  app.post('/api/ai/split', async (req, res) => {
    const rl = rateLimit(`spl:${clientIp(req)}`, 30, 60_000);
    if (!rl.ok) return fail(res, `请求过于频繁，请 ${rl.retryAfter} 秒后再试`, 429, 'rate_limited');

    const { input, files } = await buildAiInput(req, req.body || {});
    if (!input.text.trim() && !files.length) {
      return data(res, { ok: false, count: 0, items: [], note: '没有可分析的内容' });
    }

    const r = await ai.splitItems({
      text: input.text,
      fileText: input.fileText,
      category: input.category,
    });
    return data(res, r);
  });

  /** 导入链接：抓取网页并抽出正文 */"""

if ANCHOR2 not in c:
    print("ERROR: 未找到导入链接路由锚点")
    raise SystemExit(1)
c = c.replace(ANCHOR2, ROUTE, 1)
io.open(C, "w", encoding="utf-8").write(c)
print("ok: core.js 已加 /api/ai/split")

# ================= 3) api.js =================
P = D + r"\public\static\api.js"
p = io.open(P, "r", encoding="utf-8").read()
if "aiSplit" not in p:
    A3 = "  aiFetchUrl: (url) => api.post('/api/ai/fetch-url', { url }),"
    p = p.replace(A3, A3 + "\n  aiSplit: (fd) => api.post('/api/ai/split', fd),", 1)
    io.open(P, "w", encoding="utf-8").write(p)
    print("ok: api.js 已加 aiSplit")

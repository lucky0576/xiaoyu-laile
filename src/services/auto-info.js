/**
 * 小鱼来了 — 发布时自动生成补充信息要素
 *
 * 用 AI 从标题 + 正文里提炼结构化要素（要点 / 关键字段 / 关键词）。
 * AI 不可用时回退到本地规则（金额、规模、行业、城市）。
 */

import aiSvc from './ai.js';

const MAX_TITLE = 120;

/** 本地兜底：从文本里抽关键要素 */
export function localAutoInfo(listing = {}) {
  const text = `${listing.title || ''}\n${listing.text || ''}`;
  const keyFacts = [];

  const amounts = aiSvc.extractAmounts(text).slice(0, 2);
  for (const a of amounts) keyFacts.push({ label: '金额', value: String(a.raw || a) });

  const scales = aiSvc.extractScales(text).slice(0, 2);
  for (const s of scales) keyFacts.push({ label: '规模', value: String(s.raw || s) });

  const city = listing.cities?.[0]?.name || '';
  if (city) keyFacts.push({ label: '地点', value: city });

  const industry = listing.industries?.[0]?.name || listing.industry || '';
  if (industry) keyFacts.push({ label: '行业', value: industry });

  const highlights = [];
  const clean = String(listing.text || '')
    .replace(/\s+/g, ' ')
    .split(/[。；;!\n]/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 8)
    .slice(0, 3);
  for (const s of clean) highlights.push(s.length > 40 ? `${s.slice(0, 40)}…` : s);

  return {
    highlights,
    keyFacts: keyFacts.slice(0, 8),
    tags: [],
    source: 'local',
    generatedAt: new Date().toISOString(),
  };
}

const PROMPT = `你是产业信息整理助手。请根据下面这条发布信息，提炼结构化的「补充信息要素」，用严格的 JSON 返回，不要任何解释。

JSON 结构：
{
  "highlights": ["3-5 条核心要点，每条不超过 22 个字，直接说事实，不要空话"],
  "keyFacts": [{"label": "字段名", "value": "字段值"}],
  "tags": ["3-6 个关键词，每个不超过 8 个字"]
}

要求：
- keyFacts 放 4-8 个最关键的量化或定性要素，label 用 2-6 个字的短名（如 项目规模 / 投资金额 / 合作方式 / 建设周期 / 资质要求 / 用地性质 / 交付时间 / 联系人）
- 只写原文里能推出来的内容，推不出来就不要编造
- tags 用行业术语，不要用泛词

发布信息：
标题：%TITLE%
分类：%CATEGORY%
正文：
%BODY%`;

/**
 * 用 AI 生成补充要素
 * @param {object} listing 已保存的 listing
 * @returns {Promise<object>} autoInfo
 */
export async function generateAutoInfo(listing = {}) {
  const body = String(listing.text || '').slice(0, 6000);
  if (!body.trim()) return localAutoInfo(listing);

  const prompt = PROMPT.replace('%TITLE%', String(listing.title || '').slice(0, MAX_TITLE))
    .replace('%CATEGORY%', String(listing.categoryName || listing.category || ''))
    .replace('%BODY%', body);

  try {
    const raw = await aiSvc.chat(
      [
        { role: 'system', content: '你只输出合法 JSON，不要 markdown 代码块，不要任何解释。' },
        { role: 'user', content: prompt },
      ],
      { temperature: 0.2, maxTokens: 900, timeoutMs: 30000 }
    );
    const json = aiSvc.extractJson(raw);
    if (!json || typeof json !== 'object') return localAutoInfo(listing);

    const highlights = Array.isArray(json.highlights)
      ? json.highlights.map((s) => String(s || '').trim()).filter(Boolean).slice(0, 5)
      : [];
    const keyFacts = Array.isArray(json.keyFacts)
      ? json.keyFacts
          .map((f) => ({ label: String(f?.label || '').trim().slice(0, 12), value: String(f?.value || '').trim().slice(0, 60) }))
          .filter((f) => f.label && f.value)
          .slice(0, 8)
      : [];
    const tags = Array.isArray(json.tags)
      ? json.tags.map((s) => String(s || '').trim().slice(0, 16)).filter(Boolean).slice(0, 6)
      : [];

    // AI 返回空内容时退回本地
    if (!highlights.length && !keyFacts.length) return localAutoInfo(listing);

    return {
      highlights,
      keyFacts,
      tags,
      source: 'ai',
      generatedAt: new Date().toISOString(),
    };
  } catch (err) {
    console.error('[auto-info] AI 生成失败，回退本地规则:', err.message);
    return localAutoInfo(listing);
  }
}

export default { generateAutoInfo, localAutoInfo };

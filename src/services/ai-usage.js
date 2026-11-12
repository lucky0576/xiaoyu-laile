/**
 * AI 调用日志（平台内部审计用）
 *
 * 每次调用大模型（主接口 / 备用接口 / 内置免费通道）都记一条：
 *   时间、任务、供应商、模型、成功/失败、耗时、token 用量（若供应商返回）。
 * 数据落在 data/collections/ai_usage.json，供后台统计与申报材料导出。
 *
 * 说明：部分免费兼容接口不返回 usage，此时 token 记为 0 且 usageAvailable=false；
 * 不能把 0 当成真实消耗，导出报告里会单独标注。
 */
import db from '../store/db.js';

const col = () => db.collection('ai_usage');

function newId() {
  return 'aiu_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

export function recordAiUsage(entry = {}) {
  try {
    const usage = entry.usage || null;
    const rec = {
      id: newId(),
      at: new Date().toISOString(),
      task: String(entry.task || 'chat').slice(0, 60),
      providerId: String(entry.providerId || '').slice(0, 30),
      providerName: String(entry.providerName || '').slice(0, 40),
      model: String(entry.model || '').slice(0, 60),
      ok: Boolean(entry.ok),
      promptTokens: Number(usage?.prompt_tokens || 0),
      completionTokens: Number(usage?.completion_tokens || 0),
      totalTokens: Number(usage?.total_tokens || 0),
      usageAvailable: Boolean(usage),
      latencyMs: Math.max(0, Number(entry.latencyMs || 0)),
      errorCode: String(entry.errorCode || '').slice(0, 40),
      errorMessage: String(entry.errorMessage || '').slice(0, 200),
    };
    const c = col();
    c.insert(rec);
    // 只保留最近 3000 条，避免文件无限膨胀
    const all = c.all();
    if (all.length > 3000) c.remove(all[0].id);
    return rec;
  } catch (err) {
    console.warn('[ai-usage] 记录失败:', err.message);
    return null;
  }
}

export function aiUsageRecords(limit = 500) {
  const all = col().all();
  return all.slice(-Math.max(1, Math.min(2000, limit))).reverse();
}

export function aiUsageSummary() {
  const all = col().all();
  const ok = all.filter((x) => x.ok);
  const tokens = all.reduce((s, x) => s + (x.totalTokens || 0), 0);
  const promptTokens = all.reduce((s, x) => s + (x.promptTokens || 0), 0);
  const completionTokens = all.reduce((s, x) => s + (x.completionTokens || 0), 0);
  const usageCalls = all.filter((x) => x.usageAvailable).length;
  const byProvider = {};
  for (const x of all) {
    const key = x.providerName || x.providerId || 'unknown';
    byProvider[key] = byProvider[key] || { calls: 0, ok: 0, tokens: 0 };
    byProvider[key].calls += 1;
    if (x.ok) byProvider[key].ok += 1;
    byProvider[key].tokens += x.totalTokens || 0;
  }
  const byTask = {};
  for (const x of all) {
    const key = x.task || 'chat';
    byTask[key] = byTask[key] || { calls: 0, ok: 0, tokens: 0 };
    byTask[key].calls += 1;
    if (x.ok) byTask[key].ok += 1;
    byTask[key].tokens += x.totalTokens || 0;
  }
  return {
    totalCalls: all.length,
    okCalls: ok.length,
    failedCalls: all.length - ok.length,
    successRate: all.length ? Number(((ok.length / all.length) * 100).toFixed(1)) : 0,
    tokenTotal: tokens,
    promptTokens,
    completionTokens,
    usageAvailableCalls: usageCalls,
    avgLatencyMs: all.length
      ? Math.round(all.reduce((s, x) => s + (x.latencyMs || 0), 0) / all.length)
      : 0,
    byProvider,
    byTask,
    firstAt: all[0]?.at || '',
    lastAt: all[all.length - 1]?.at || '',
  };
}

export default { recordAiUsage, aiUsageRecords, aiUsageSummary };

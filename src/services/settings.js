/**
 * 运行时设置
 *
 * 为什么需要它：AI 的 baseUrl / model / apiKey 原本只从环境变量读，
 * 改一次要动 .env 并重启服务，非技术用户很难自己配。
 * 这里把可在线修改的设置持久化到 data/ 下：
 *   · data/ 不进 git、不进发布包，key 不会泄漏出去
 *   · 优先级：在线设置 > 环境变量 > 代码默认值
 *
 * 注意：对外返回时必须遮蔽 key，只回传「是否已设置」与前几位。
 */
import db from '../store/db.js';
import { config } from '../config.js';

const settings = () => db.collection('settings');

const AI_ID = 'ai';

/** 代码默认值（DeepSeek 兼容 OpenAI 协议） */
const DEFAULTS = {
  baseUrl: 'https://api.deepseek.com/v1',
  model: 'deepseek-chat',
};

function readStored() {
  const rec = settings().get(AI_ID);
  if (!rec || typeof rec !== 'object') return {};
  return {
    baseUrl: String(rec.baseUrl || '').trim(),
    model: String(rec.model || '').trim(),
    apiKey: String(rec.apiKey || '').trim(),
    updatedAt: String(rec.updatedAt || ''),
  };
}

/**
 * 生效的 AI 配置：在线设置优先，其次环境变量，最后默认值。
 * ai.js 应当通过这个函数读配置，而不是直接读 config.ai。
 */
export function effectiveAiConfig() {
  const stored = readStored();
  const envKey = String(config.ai?.apiKey || '').trim();
  const apiKey = stored.apiKey || envKey;
  const baseUrl = stored.baseUrl || config.ai?.baseUrl || DEFAULTS.baseUrl;
  const model = stored.model || config.ai?.model || DEFAULTS.model;
  return {
    baseUrl: String(baseUrl).replace(/\/+$/, ''),
    model,
    apiKey,
    timeoutMs: config.ai?.timeoutMs || 60000,
    // 有 key 才算真正接上大模型，否则回退内置规则引擎
    enabled: Boolean(apiKey),
    source: stored.apiKey ? 'online' : envKey ? 'env' : 'none',
  };
}

/** 对外可见的设置（**绝不回传完整 key**） */
export function aiSettingsPublic() {
  const stored = readStored();
  const eff = effectiveAiConfig();
  return {
    baseUrl: eff.baseUrl,
    model: eff.model,
    hasApiKey: Boolean(eff.apiKey),
    // 只回前 6 位用于核对，例如 sk-abc…
    apiKeyHint: eff.apiKey ? `${eff.apiKey.slice(0, 6)}…${eff.apiKey.slice(-4)}` : '',
    source: eff.source,
    updatedAt: stored.updatedAt || '',
    provider: eff.enabled ? 'DeepSeek / OpenAI 兼容接口' : '内置规则引擎',
    presets: [
      { id: 'deepseek', name: 'DeepSeek', baseUrl: 'https://api.deepseek.com/v1', models: ['deepseek-chat', 'deepseek-reasoner'] },
      { id: 'openai', name: 'OpenAI', baseUrl: 'https://api.openai.com/v1', models: ['gpt-4o-mini', 'gpt-4o'] },
      { id: 'moonshot', name: '月之暗面 Kimi', baseUrl: 'https://api.moonshot.cn/v1', models: ['moonshot-v1-8k', 'moonshot-v1-32k'] },
      { id: 'dashscope', name: '阿里通义千问', baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1', models: ['qwen-plus', 'qwen-turbo'] },
      { id: 'custom', name: '自定义', baseUrl: '', models: [] },
    ],
  };
}

/**
 * 保存 AI 设置。
 * key 传空字符串表示「不改动」；传 '-' 表示清除。
 */
export function saveAiSettings(input = {}) {
  const cur = readStored();
  const next = {
    baseUrl: input.baseUrl === undefined ? cur.baseUrl || '' : String(input.baseUrl || '').trim(),
    model: input.model === undefined ? cur.model || '' : String(input.model || '').trim(),
    apiKey: cur.apiKey || '',
    updatedAt: cur.updatedAt || '',
  };

  if (input.apiKey !== undefined) {
    const raw = String(input.apiKey || '').trim();
    if (raw === '-') next.apiKey = '';
    else if (raw) next.apiKey = raw;
    // 空字符串：保持原样（前端不回传已保存的 key，避免泄漏）
  }

  next.updatedAt = new Date().toISOString();

  const existing = settings().get(AI_ID);
  if (existing) settings().update(AI_ID, { ...next, id: AI_ID });
  else settings().insert({ id: AI_ID, ...next });

  return aiSettingsPublic();
}

/** 清除在线设置，回退到环境变量 */
export function clearAiSettings() {
  const rec = settings().get(AI_ID);
  if (rec) settings().remove(AI_ID);
  return aiSettingsPublic();
}

/**
 * 真实调用一次，验证 key 是否可用。
 * 只发一个极小的请求，几乎不产生费用。
 */
export async function testAiConnection(override = {}) {
  const eff = effectiveAiConfig();
  const baseUrl = String(override.baseUrl || eff.baseUrl).replace(/\/+$/, '');
  const model = override.model || eff.model;
  const apiKey = override.apiKey ? String(override.apiKey).trim() : eff.apiKey;

  if (!apiKey) return { ok: false, error: '还没有填写 API Key' };

  const started = Date.now();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), Math.min(eff.timeoutMs, 20000));
  try {
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: '回复两个字：正常' }],
        max_tokens: 16,
        temperature: 0,
      }),
      signal: ctrl.signal,
    });
    const text = await res.text();
    let json = null;
    try {
      json = JSON.parse(text);
    } catch {
      /* 非 JSON 响应，下面按原文报错 */
    }
    const ms = Date.now() - started;

    if (!res.ok) {
      const detail = json?.error?.message || text.slice(0, 200) || `HTTP ${res.status}`;
      // 把常见错误翻译成人话
      let hint = '';
      if (res.status === 401) hint = 'API Key 不正确或已失效';
      else if (res.status === 402) hint = '账户余额不足，请先充值';
      else if (res.status === 429) hint = '请求过于频繁或超出配额';
      else if (res.status === 404) hint = '接口地址或模型名不正确';
      return { ok: false, status: res.status, error: hint || detail, detail: text.slice(0, 300), ms };
    }

    return {
      ok: true,
      ms,
      model,
      baseUrl,
      reply: String(json?.choices?.[0]?.message?.content || '').slice(0, 60),
      usage: json?.usage || null,
    };
  } catch (err) {
    const msg = err.name === 'AbortError' ? '请求超时，请检查网络或接口地址' : err.message;
    return { ok: false, error: msg, ms: Date.now() - started };
  } finally {
    clearTimeout(timer);
  }
}

export default { effectiveAiConfig, aiSettingsPublic, saveAiSettings, clearAiSettings, testAiConnection };

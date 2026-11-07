/**
 * 历史项目标题批量改成「类型｜内容」格式
 *
 * 用法（在服务器 /opt/xiaoyu-laile 下执行）：
 *   node scripts/retitle-listings.mjs --dry-run   # 只预览，不写库
 *   node scripts/retitle-listings.mjs             # 真正写库（走管理接口，保证落盘）
 *
 * 策略：
 *   1. 关键词能判定的（融资/投资/招标/采购/转让/租赁/招聘/合作/服务/EPC）
 *      → 本地直接补前缀并删掉重复类型词，零成本
 *   2. 判定不了的 → 按批（8 条/次）交给 AI 只做格式整理，数字必须原样保留
 *   3. 兼容旧格式「地区·行业｜内容」：会替换成「类型｜内容」
 *   4. 原标题备份到 data/backups/titles-<时间>.json，可回滚
 */

import fs from 'node:fs';
import path from 'node:path';
import db from '../src/store/db.js';
import settingsSvc from '../src/services/settings.js';

const ROOT = process.cwd();
const DRY = process.argv.includes('--dry-run');
const BASE = process.env.API_BASE || 'http://127.0.0.1:8787';
const ACCOUNT = process.env.RETITLE_ACCOUNT || '13456693544';
const PASSWORD = process.env.RETITLE_PASSWORD || 'weilan0576';
const TYPES = ['投资', '融资', 'EPC', '采购', '招标', '转让', '合作', '租赁', '服务', '招聘'];

/* 优先级：交易动作 > 技术类型，避免「EPC｜……EPC 总承包招标」这种重复 */
const RULES = [
  [/融资|募资|股权融资|找投资|引战|增资/i, '融资'],
  [/招商|引资|投资方|寻投资|投资合作/i, '投资'],
  [/招标|投标|中标|开标/i, '招标'],
  [/采购|供货|供应|求购|采购需求/i, '采购'],
  [/转让|出售|收购|并购/i, '转让'],
  [/租赁|出租|承租/i, '租赁'],
  [/招聘|招人|招才/i, '招聘'],
  [/合作|对接|寻合作|招募/i, '合作'],
  [/服务|外包|委托/i, '服务'],
  [/\bEPC\b|总承包|工程总承包|EPC总包/i, 'EPC'],
];

const TYPE_WORDS = {
  融资: [/股权融资|融资|募资|引战|增资/g],
  投资: [/投资合作|寻投资|招商|引资|投资方|投资/g],
  招标: [/招标|投标|中标|开标/g],
  采购: [/采购需求|采购|供货|供应|求购/g],
  转让: [/转让|出售|收购|并购/g],
  租赁: [/租赁|出租|承租/g],
  招聘: [/招聘|招人|招才/g],
  合作: [/寻合作|合作|对接|招募/g],
  服务: [/服务|外包|委托/g],
  EPC: [/\bEPC总包\b|\bEPC\b|工程总承包|总承包/gi],
};

function typeOf(text) {
  const s = String(text || '');
  for (const [re, name] of RULES) if (re.test(s)) return name;
  return '';
}

function clean(t) {
  return String(t || '')
    .replace(/\s+/g, ' ')
    .replace(/\s*(\d)/g, '$1')
    .replace(/(\d)\s*/g, '$1')
    .trim();
}

function stripTypeWord(content, type) {
  let t = String(content || '');
  const res = TYPE_WORDS[type] || [];
  for (const re of res) t = t.replace(re, ' ');
  return t
    .replace(/[，,、;；:：]/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/([\u4e00-\u9fa5])\s+(\d)/g, '$1$2')
    .replace(/(\d)\s+([\u4e00-\u9fa5])/g, '$1$2')
    .replace(/^[·、\-\s]+|[·、\-\s]+$/g, '')
    .trim();
}

function hasNewPrefix(t) {
  const head = String(t || '').split(/[｜|]/)[0].trim();
  return TYPES.includes(head);
}

function oldBody(t) {
  const s = String(t || '');
  if (!/[｜|]/.test(s)) return s;
  return s.split(/[｜|]/).slice(1).join('｜').trim();
}

function validTitle(t) {
  const s = String(t || '').trim();
  if (!s) return false;
  if (!/[｜|]/.test(s)) return false;
  const [head, ...rest] = s.split(/[｜|]/);
  if (!TYPES.includes(head.trim())) return false;
  if (rest.join('｜').trim().length < 4) return false;
  return s.length <= 44;
}

function numbersPreserved(oldTitle, newTitle) {
  const nums = (s) => (String(s || '').match(/\d+(?:\.\d+)?%?/g) || []).sort();
  const b = new Set(nums(newTitle));
  return nums(oldTitle).every((n) => b.has(n));
}

function buildKeyword(oldTitle, type) {
  const body0 = stripTypeWord(oldBody(oldTitle), type) || oldBody(oldTitle);
  const body = body0.length > 34 ? body0.slice(0, 34) : body0;
  if (body.length < 6) return '';
  return `${type}｜${body}`;
}

async function aiBatch(rows) {
  const conf = settingsSvc.effectiveAiConfig();
  if (!conf.enabled || !conf.apiKey) return [];
  const list = rows.map((r) => ({ id: r.id, title: oldBody(r.title) }));
  const prompt = `下面是一批中文产业项目信息的标题。请只做「格式整理」，不要改写事实、不要新增信息、不要删掉数字与地区。

要求：
1. 输出格式统一为「类型｜核心内容」，竖线用中文全角「｜」；
2. 类型只能从这些里选一个：${TYPES.join('/')}；
3. 核心内容保留原标题里的地区、规模、金额、公司、型号等关键信息，总长度不超过 36 个汉字；
4. 不要编造任何原标题里没有的内容；
5. 去掉标题里与类型重复的词（例如类型是「融资」，正文里不要再写「融资」）。

输入：
${JSON.stringify(list)}

只输出 JSON 数组，每项 {"id":"原id","title":"整理后的标题"}，不要输出别的。`;

  const res = await fetch(`${conf.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${conf.apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: conf.model,
      messages: [
        { role: 'system', content: '你是中文商务信息编辑，只做标题格式整理，严格按 JSON 输出。' },
        { role: 'user', content: prompt },
      ],
      temperature: 0.2,
      max_tokens: 2000,
    }),
    signal: AbortSignal.timeout(120000),
  });
  if (!res.ok) {
    console.warn('  AI HTTP', res.status, (await res.text().catch(() => '')).slice(0, 160));
    return [];
  }
  const raw = await res.json();
  const text = raw?.choices?.[0]?.message?.content || '';
  const m = text.match(/\[[\s\S]*\]/);
  if (!m) return [];
  try {
    const arr = JSON.parse(m[0]);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

async function login() {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ account: ACCOUNT, password: PASSWORD }),
    signal: AbortSignal.timeout(30000),
  });
  const j = await res.json().catch(() => ({}));
  const token = (j?.data || {}).token;
  if (!token) throw new Error('管理员登录失败');
  return token;
}

async function main() {
  const rows = db.collection('listings').all().filter((r) => r.status === 'published' && String(r.title || '').trim());
  console.log(`  已发布项目: ${rows.length}`);

  const backupDir = path.join(ROOT, 'data', 'backups');
  fs.mkdirSync(backupDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  fs.writeFileSync(
    path.join(backupDir, `titles-${stamp}.json`),
    JSON.stringify(rows.map((r) => ({ id: r.id, title: r.title })), null, 2),
    'utf-8',
  );

  const plan = [];
  const aiRows = [];
  for (const r of rows) {
    const t = clean(r.title);
    if (hasNewPrefix(t)) continue; // 已经是「类型｜内容」
    if (/待完善|未提供|缺失/.test(t)) continue; // 低质量标题不动
    const type = typeOf(`${t} ${r.summary || ''} ${(r.tags || []).join(' ')}`);
    if (type) {
      const built = buildKeyword(t, type);
      if (built && validTitle(built) && numbersPreserved(oldBody(t), built)) {
        plan.push({ id: r.id, old: r.title, title: built, how: 'keyword' });
        continue;
      }
    }
    aiRows.push(r);
  }
  console.log(`  关键词直接补前缀: ${plan.length} 条 | 需 AI 整理: ${aiRows.length} 条`);

  const AI_BATCH = 8;
  for (let i = 0; i < aiRows.length; i += AI_BATCH) {
    const chunk = aiRows.slice(i, i + AI_BATCH);
    console.log(`  AI 批量 ${i / AI_BATCH + 1}: ${chunk.length} 条…`);
    const out = await aiBatch(chunk);
    const map = new Map(out.map((x) => [String(x.id), String(x.title || '')]));
    for (const r of chunk) {
      const t = clean(map.get(r.id) || '');
      if (validTitle(t) && numbersPreserved(oldBody(r.title), t)) {
        plan.push({ id: r.id, old: r.title, title: t, how: 'ai' });
      }
    }
  }

  console.log(`  计划修改: ${plan.length} 条`);
  for (const p of plan.filter((x) => x.how === 'keyword').slice(0, 4)) {
    console.log(`    keyword: ${String(p.old).slice(0, 26)}  ->  ${p.title.slice(0, 42)}`);
  }
  for (const p of plan.filter((x) => x.how === 'ai').slice(0, 4)) {
    console.log(`    ai:      ${String(p.old).slice(0, 26)}  ->  ${p.title.slice(0, 42)}`);
  }

  fs.writeFileSync(path.join(backupDir, `titles-plan-${stamp}.json`), JSON.stringify(plan, null, 2), 'utf-8');
  if (DRY) {
    console.log('  （dry-run，不写库）');
    return;
  }

  const token = await login();
  let ok = 0;
  let fail = 0;
  for (const p of plan) {
    try {
      const res = await fetch(`${BASE}/api/admin/listings/${p.id}/title`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: p.title }),
        signal: AbortSignal.timeout(30000),
      });
      if (res.ok) ok += 1;
      else fail += 1;
    } catch {
      fail += 1;
    }
  }
  console.log(`  已更新: ${ok} 条 | 失败: ${fail} 条`);
}

main().catch((e) => {
  console.error('  失败:', e);
  process.exit(1);
});

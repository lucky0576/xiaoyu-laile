/**
 * 小鱼来了 — 自动生成行业快讯短视频
 *
 * 读 data/collections/news.json 里的新闻，用 ffmpeg 画成竖屏短视频，
 * 再通过平台自己的 /api/files 与 /api/feeds 接口入库。
 *
 * 为什么自己生成而不是抓别人的视频：
 *   1. 搬运他人视频有版权风险，容易被投诉下架
 *   2. 自己生成的是「行业快讯」，和平台内容定位一致
 *   3. 新闻每天更新，短视频数量可以持续增长
 *
 * 生成的记录标记 source = 'collect'，
 * 前端据此隐藏「联系我」（平台自动整理的内容没有可联系的人）。
 *
 * 用法（在服务器上跑）：node scripts/gen-hot-shorts.mjs [条数]
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { NEWS_TAGS } from '../src/data/news-sources.js';

const execFileAsync = promisify(execFile);

const ROOT = '/opt/xiaoyu-laile';
const FONT = '/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc';
const API = 'http://127.0.0.1:8787';
const ADMIN_PHONE = '13456693544';
const ADMIN_PWD = 'weilan0576';

const W = 720;
const H = 1280;
const DUR = 13;
const FPS = 25;
const COUNT = Number(process.argv[2] || 12);

/*
 * 行业优先级。
 * 平台面向产业端，光伏/储能/风电/算力/机器人/无人机/氢能/投融资/政策
 * 才是目标读者关心的；苹果/微软/阿里这类消费与厂商新闻只作补充，
 * 排序时降权，避免短视频里全是手机价格。
 */
const TIER1 = new Set(['pv', 'storage', 'wind', 'compute', 'ai', 'robot', 'uav', 'evtol', 'hydrogen', 'finance', 'policy']);
const TIER2 = new Set(['unitree', 'deepseek', 'tesla', 'huawei', 'alibaba']);

function relevance(n) {
  const ids = Array.isArray(n.tags) ? n.tags : [];
  if (ids.some((id) => TIER1.has(id))) return 3;
  if (ids.some((id) => TIER2.has(id))) return 2;
  return 1;
}

const TMP = path.join(os.tmpdir(), 'hot-shorts');
fs.mkdirSync(TMP, { recursive: true });

/* 标签中文名 */
const TAG_NAME = { policy: '政策' };
for (const t of NEWS_TAGS) TAG_NAME[t.id] = t.name;
const TAG_ICON = { policy: '📋' };
for (const t of NEWS_TAGS) TAG_ICON[t.id] = t.icon || '';

/* 官方公文的套话开头，不能拿来当副标题 */
const BOILERPLATE = /^(各省|各地|各有关|各直属|为深入|为贯彻|为落实|根据|按照|现将|经|国务院|国家发展改革委)/;

/**
 * 按视觉宽度折行。
 * 中文按 1 个字算，英文/数字整词不拆（否则 120MWh 会被切成 120M / Wh）。
 */
function wrapText(text, maxUnits = 13, maxLines = 4) {
  const src = String(text || '').replace(/\s+/g, ' ').trim();
  // 切成 token：连续 ASCII 算一个 token，单个中文字算一个 token
  const tokens = [];
  let buf = '';
  for (const ch of src) {
    if (/[\x00-\xff]/.test(ch) && ch !== ' ') {
      buf += ch;
    } else {
      if (buf) { tokens.push(buf); buf = ''; }
      if (ch !== ' ') tokens.push(ch);
    }
  }
  if (buf) tokens.push(buf);

  const lines = [];
  let cur = '';
  let units = 0;
  for (const tk of tokens) {
    const w = /^[\x00-\xff]+$/.test(tk) ? tk.length * 0.55 : 1;
    if (units + w > maxUnits && cur) {
      lines.push(cur);
      cur = tk;
      units = w;
      if (lines.length >= maxLines) break;
    } else {
      cur += tk;
      units += w;
    }
  }
  if (lines.length < maxLines && cur) lines.push(cur);
  return lines.slice(0, maxLines);
}

function esc(text) {
  return String(text || '')
    .replace(/\\/g, '\\\\')
    .replace(/:/g, '\\:')
    .replace(/'/g, "\\'")
    .replace(/%/g, '\\%');
}

function txt({ text, size, y, color = 'white', alpha = 1 }) {
  return `drawtext=fontfile=${FONT}:text='${esc(text)}':fontsize=${size}:fontcolor=${color}@${alpha}:x=(w-text_w)/2:y=${y}`;
}

/** 标题清洗：去掉栏目前缀、括号摘要、多余标点 */
function cleanTitle(t) {
  let s = String(t || '');
  s = s.replace(/^【[^】]*】\s*/, '');
  s = s.replace(/^(关于|关于印发)/, '');
  s = s.replace(/\([\u4e00-\u9fa5]{0,10}[〔\[]\d{4}[〕\]][^)]*\)/g, '');
  s = s.replace(/[（(][^）)]{0,30}[）)]\s*$/, '');
  s = s.replace(/\s+/g, ' ').trim();
  return s;
}

/**
 * 挑副标题：
 *   summary 是官方公文套话就丢掉，退回到「标签 + 平台」这种稳妥文案。
 */
function pickSub(n, tagName) {
  const raw = String(n.summary || '').replace(/\s+/g, ' ').trim();
  if (!raw || raw.length < 12) return '';
  if (BOILERPLATE.test(raw)) return '';
  if (/感谢|网友|微信|扫码|公众号|QQ|转载/.test(raw)) return '';
  const stripped = raw.replace(/^(导读|摘要|原标题|编者按|导语)\s*[:：]?\s*/, '').trim();
  if (!stripped) return '';
  if (stripped.length > 46) return stripped.slice(0, 44) + '…';
  return stripped;
  return raw;
}

/* ------------------------------------------------------------------ */
/* 生成一条视频                                                        */
/* ------------------------------------------------------------------ */
async function makeVideo({ title, tag, sub }) {
  const safe = title.replace(/[^\w\u4e00-\u9fa5]+/g, '_').slice(0, 20) || 'short';
  const out = path.join(TMP, `${Date.now()}_${safe}.mp4`);

  // 标题太长就缩字号，保证 4 行内放得下
  const titleSize = title.length > 34 ? 44 : title.length > 22 ? 48 : 54;
  const maxUnits = title.length > 34 ? 15 : 13;
  const lines = wrapText(title, maxUnits, 4);

  const lineH = Math.round(titleSize * 1.34);
  const blockH = lines.length * lineH;
  const titleTop = Math.round((H - blockH) / 2) - 60;

  const f = ['format=yuv420p'];
  f.push(`drawbox=x=48:y=64:w=${W - 96}:h=3:color=#7fe3ff@0.55:t=fill`);

  f.push(txt({ text: '小鱼来了 · 行业快讯', size: 30, y: 96, color: '#eaf6ff', alpha: 0.92 }));

  // 标签胶囊（用文字 + 图标近似）
  f.push(txt({ text: tag.name, size: 28, y: titleTop - 78, color: '#ffe58a' }));

  lines.forEach((line, i) => {
    f.push(txt({ text: line, size: titleSize, y: titleTop + i * lineH, color: 'white' }));
  });

  if (sub) {
    const subLines = wrapText(sub, 17, 2);
    const subTop = titleTop + blockH + 54;
    subLines.forEach((line, i) => {
      f.push(txt({ text: line, size: 27, y: subTop + i * 44, color: '#cfe6ff', alpha: 0.92 }));
    });
  }

  f.push(txt({ text: '免费发布 · 对接真实项目', size: 30, y: H - 250, color: 'white' }));
  f.push(txt({ text: 'xiaoyulaile.online', size: 26, y: H - 200, color: '#9fe8ff' }));

  f.push('fade=t=in:st=0:d=0.6');
  f.push(`fade=t=out:st=${DUR - 0.7}:d=0.7`);

  await execFileAsync('ffmpeg', [
    '-y',
    '-f', 'lavfi',
    '-i', `gradients=s=${W}x${H}:c0=0x0b74ff:c1=0x12c7b4:x0=0:y0=0:x1=${W}:y1=${H}:d=${DUR}:r=${FPS}`,
    '-vf', f.join(','),
    '-t', String(DUR), '-r', String(FPS),
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '30',
    '-maxrate', '700k', '-bufsize', '1400k',
    '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-an',
    out,
  ], { timeout: 120000 });

  const cover = out.replace(/\.mp4$/, '.jpg');
  await execFileAsync('ffmpeg', [
    '-y', '-i', out, '-ss', '2', '-vframes', '1',
    '-vf', 'scale=540:-2', '-q:v', '4', cover,
  ], { timeout: 60000 });

  return { video: out, cover, size: fs.statSync(out).size };
}

/* ------------------------------------------------------------------ */
/* 上传 + 入库                                                         */
/* ------------------------------------------------------------------ */
async function login() {
  const r = await fetch(`${API}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ account: ADMIN_PHONE, password: ADMIN_PWD }),
  });
  const j = await r.json();
  if (!j?.data?.token) throw new Error('登录失败');
  return j.data.token;
}

async function uploadFile(token, filePath, mime) {
  const buf = fs.readFileSync(filePath);
  const fd = new FormData();
  fd.append('file', new Blob([buf], { type: mime }), path.basename(filePath));
  const r = await fetch(`${API}/api/files`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: fd,
  });
  const j = await r.json();
  const file = j?.data?.files?.[0];
  if (!file?.id) throw new Error('上传失败: ' + JSON.stringify(j).slice(0, 160));
  return file;
}

async function createFeed(token, payload) {
  const r = await fetch(`${API}/api/feeds`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const j = await r.json();
  if (!j?.data?.feed?.id) throw new Error('建 feed 失败: ' + JSON.stringify(j).slice(0, 160));
  return j.data.feed;
}

/* ------------------------------------------------------------------ */
/* 主流程                                                              */
/* ------------------------------------------------------------------ */
const news = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/collections/news.json'), 'utf8'));

// 已有短视频的标题，避免重复生成
const feedsAll = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/collections/feeds.json'), 'utf8'));
const usedTitles = new Set(feedsAll.map((x) => String(x.title || '').trim()));

/*
 * 硬性门槛：标题里必须真的出现行业关键词，否则不生成。
 * 只靠标签不够 —— 手机/汽车类新闻经常被顺手打上 ai 标签，
 * 结果短视频里全是消费电子价格，跟产业端平台不搭。
 */
const INDUSTRY_WORDS = [
  '光伏', '储能', '风电', '氢能', '新能源', '绿电', '组件', '电池', '电芯',
  '算力', '数据中心', '智算', '机柜', '液冷', 'GPU', '芯片',
  '机器人', '人形', '具身',
  '无人机', '低空', 'eVTOL', '飞行汽车',
  '大模型', '人工智能', 'AI', '智能体',
  '投资', '融资', '并购', 'EPC', '中标', '招标', '装机', '并网', '项目',
  '政策', '发改委', '能源局', '补贴', '电价',
];

function isIndustryTitle(t) {
  return INDUSTRY_WORDS.some((w) => t.includes(w));
}

const picks = news
  .filter((n) => n && n.title && cleanTitle(n.title).length >= 10)
  .filter((n) => !usedTitles.has(cleanTitle(n.title)))
  .filter((n) => isIndustryTitle(cleanTitle(n.title)))
  .sort((a, b) => {
    // 先看行业相关度，再热的优先，最后按时间
    const ra = relevance(a);
    const rb = relevance(b);
    if (ra !== rb) return rb - ra;
    const ha = a.hot ? 1 : 0;
    const hb = b.hot ? 1 : 0;
    if (ha !== hb) return hb - ha;
    return String(b.publishedAt || '').localeCompare(String(a.publishedAt || ''));
  })
  .slice(0, COUNT);

console.log(`  候选 ${picks.length} 条（已排除已生成过的）`);

const token = await login();
console.log('  已登录后台\n');

let ok = 0;
let fail = 0;

for (const n of picks) {
  const title = cleanTitle(n.title);

  /*
   * 标签不要直接取 tags[0]。
   * 新闻的 tags 是自动打标的结果，顺序不可靠，
   * 会出现「iPad mini 价格」被打成「光伏」这种情况。
   * 这里优先挑「标题里真的出现了该标签关键词」的那个。
   */
  const tagIds = Array.isArray(n.tags) ? n.tags : [];
  const hitTag = tagIds.find((id) => {
    const def = NEWS_TAGS.find((t) => t.id === id);
    return def && Array.isArray(def.words) && def.words.some((w) => w && title.includes(w));
  });
  const tagId = hitTag || tagIds[0] || 'policy';
  const tag = { id: tagId, name: TAG_NAME[tagId] || '行业快讯' };
  /*
   * 副标题不要用新闻 summary —— 抓来的 summary 经常和标题对不上，
   * 或者是文章开头半句话，上屏很难看。
   * 统一用「来源 + 分类」，永远准确。
   */
  const srcName = String(n.sourceName || '').replace(/\s+/g, '');
  const sub = srcName ? `来源：${srcName}` : '';

  try {
    const made = await makeVideo({ title, tag, sub });
    const vf = await uploadFile(token, made.video, 'video/mp4');
    const cf = await uploadFile(token, made.cover, 'image/jpeg');

    await createFeed(token, {
      type: 'short',
      title,
      subtitle: srcName ? `${tag.name} · ${srcName}` : tag.name,
      description: `${title}\n\n${sub || ''}\n\n来源：小鱼来了 行业快讯`,
      fileId: vf.id,
      coverFileId: cf.id,
      featured: false,
      days: 365,
      source: 'collect',
      author: '小鱼来了',
      tags: [tag.name],
    });

    fs.unlinkSync(made.video);
    fs.unlinkSync(made.cover);
    ok += 1;
    console.log(`  ✅ [${tag.name}] ${title.slice(0, 24)}  ${Math.round(made.size / 1024)}KB`);
  } catch (err) {
    fail += 1;
    console.log(`  ❌ ${title.slice(0, 24)}  ${String(err.message).slice(0, 110)}`);
  }
}

console.log(`\n  完成：成功 ${ok} 条，失败 ${fail} 条`);

/**
 * 小鱼来了 — 自动封面生成
 *
 * 发布时如果没有上传图片，按标题 / 分类 / 城市生成一张矢量封面（SVG）。
 * 零依赖：手写 SVG 字符串，浏览器原生渲染，体积只有几 KB。
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { registerStoredFile } from './files.js';

const W = 1200;
const H = 630;

const PAD_X = 90;
const CONTENT_W = W - PAD_X * 2; // 1020

/** 分类文案与配色 */
const CATEGORY_STYLE = {
  project: { label: '项目', hue: 214 },
  bounty: { label: '悬赏', hue: 28 },
  event: { label: '活动', hue: 152 },
  trade: { label: '贸易', hue: 276 },
  info: { label: '信息', hue: 196 },
};

function esc(s) {
  return String(s || '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function hashOf(s) {
  return crypto.createHash('md5').update(String(s || '')).digest();
}

/** 字符宽度：ASCII 算 0.55 个全角 */
function charWidth(ch) {
  return /[\x00-\xff]/.test(ch) ? 0.55 : 1;
}

/** 按「全角单位」折行，不截断 */
function wrapLines(text, maxUnits) {
  const clean = String(text || '').replace(/\s+/g, ' ').trim();
  const lines = [];
  let cur = '';
  let units = 0;
  for (const ch of clean) {
    const w = charWidth(ch);
    if (units + w > maxUnits && cur) {
      // 英文单词尽量不从中间断开
      const m = cur.match(/[A-Za-z0-9.\-]+$/);
      if (m && m[0].length > 1 && ch !== ' ') {
        const word = m[0];
        // 只有当单词不是整行时才回退
        if (word.length < cur.length) {
          cur = cur.slice(0, cur.length - word.length);
          if (cur.trim()) lines.push(cur.trim());
          cur = word;
          units = [...word].reduce((s, c) => s + charWidth(c), 0);
        } else {
          lines.push(cur);
          cur = '';
          units = 0;
        }
      } else {
        lines.push(cur);
        cur = '';
        units = 0;
      }
    }
    cur += ch;
    units += w;
  }
  if (cur.trim()) lines.push(cur.trim());
  return lines;
}

/** 自适应：选最大的字号，让标题在 3 行内放下 */
function layoutTitle(title) {
  for (const font of [76, 68, 60, 54, 48, 42]) {
    const maxUnits = Math.floor(CONTENT_W / font);
    const lines = wrapLines(title, maxUnits);
    if (lines.length <= 2) return { font, lines, maxUnits };
    if (lines.length === 3 && font <= 62) return { font, lines, maxUnits };
  }
  // 极端长标题：按 42 号折行后截断到 3 行
  const font = 42;
  const maxUnits = Math.floor(CONTENT_W / font);
  const lines = wrapLines(title, maxUnits).slice(0, 3);
  const last = lines[lines.length - 1] || '';
  if (last && last.length > 1) lines[lines.length - 1] = `${last.slice(0, -1)}…`;
  return { font, lines, maxUnits };
}

/**
 * 生成封面 SVG
 * @param {{title:string, category?:string, city?:string, industry?:string, kindLabel?:string}} input
 */
export function makeCoverSvg(input = {}) {
  const title = String(input.title || '小鱼来了').trim() || '小鱼来了';
  const cat = CATEGORY_STYLE[input.category] || CATEGORY_STYLE.project;
  const h = hashOf(title);
  const hue = (cat.hue + (h[0] % 40) - 20 + 360) % 360;
  const hue2 = (hue + 34) % 360;
  const seed = h[1] / 255;

  const c1 = `hsl(${hue}, 78%, 46%)`;
  const c2 = `hsl(${hue2}, 72%, 36%)`;

  const { font, lines } = layoutTitle(title);
  const lineH = Math.min(Math.round(font * 1.3), 84);

  // 垂直排布：分类徽标(120-172) → 标签行(196-236) → 标题 → 分隔线(528) → 品牌(572)
  // 单行居中偏下；两行/三行上移，保证不压到下方分隔线
  const TITLE_BASE = lines.length >= 3 ? 306 : lines.length === 2 ? 322 : 352;
  const titleSvg = lines
    .map(
      (ln, i) =>
        `<text x="${PAD_X}" y="${TITLE_BASE + i * lineH}" font-family="'PingFang SC','Microsoft YaHei','Noto Sans SC',sans-serif" ` +
        `font-size="${font}" font-weight="700" fill="#ffffff">${esc(ln)}</text>`
    )
    .join('');

  // 城市 / 行业 / 类型 标签
  const chips = [];
  if (input.city) chips.push(String(input.city));
  if (input.industry) chips.push(String(input.industry));
  /*
   * kindLabel 只有中文才显示。
   * 老数据里 typeName 可能存的是原始 id（如 trade-supply），
   * 印在封面上很突兀，直接不显示。
   */
  if (input.kindLabel && /[\u4e00-\u9fa5]/.test(String(input.kindLabel))) {
    chips.push(String(input.kindLabel));
  }

  let chipX = PAD_X;
  const CHIP_FONT = 19;
  const chipSvg = chips
    .slice(0, 4)
    .map((c) => {
      const w = Math.round(String(c).length * CHIP_FONT * 1.05 + 34);
      if (chipX + w > W - PAD_X) return '';
      const x = chipX;
      chipX += w + 12;
      return (
        `<rect x="${x}" y="192" width="${w}" height="40" rx="20" fill="rgba(255,255,255,0.18)" stroke="rgba(255,255,255,0.42)"/>` +
        `<text x="${x + w / 2}" y="219" text-anchor="middle" font-family="'PingFang SC','Microsoft YaHei',sans-serif" ` +
        `font-size="${CHIP_FONT}" fill="#ffffff">${esc(c)}</text>`
      );
    })
    .join('');

  // 右侧装饰同心圆
  const cx = 1010 + Math.round(seed * 40);
  const cy = 150;
  const rings = [220, 168, 116]
    .map((r, i) => `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="rgba(255,255,255,${0.10 - i * 0.02})" stroke-width="2"/>`)
    .join('');

  const diagonals = Array.from({ length: 6 }, (_, i) => {
    const x = 700 + i * 90;
    return `<line x1="${x}" y1="${H}" x2="${x + 260}" y2="0" stroke="rgba(255,255,255,0.045)" stroke-width="2"/>`;
  }).join('');

  const catW = Math.round(cat.label.length * 30 + 40);

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(title)}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${c1}"/>
      <stop offset="1" stop-color="${c2}"/>
    </linearGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#bg)"/>
  ${diagonals}
  ${rings}
  <rect x="${PAD_X}" y="112" width="${catW}" height="52" rx="12" fill="rgba(255,255,255,0.22)"/>
  <text x="${PAD_X + catW / 2}" y="148" text-anchor="middle" font-family="'PingFang SC','Microsoft YaHei',sans-serif" font-size="26" font-weight="700" fill="#ffffff">${esc(cat.label)}</text>
  ${chipSvg}
  ${titleSvg}
  <line x1="${PAD_X}" y1="528" x2="${W - PAD_X}" y2="528" stroke="rgba(255,255,255,0.22)" stroke-width="1"/>
  <text x="${PAD_X}" y="572" font-family="'PingFang SC','Microsoft YaHei',sans-serif" font-size="24" font-weight="700" fill="rgba(255,255,255,0.92)">小鱼来了</text>
  <text x="${W - PAD_X}" y="572" text-anchor="end" font-family="'PingFang SC','Microsoft YaHei',sans-serif" font-size="18" fill="rgba(255,255,255,0.6)">xiaoyulaile.online</text>
</svg>`;
}

/**
 * 生成封面并登记为文件记录
 */
export async function generateCoverFile(input = {}, opts = {}) {
  try {
    const svg = makeCoverSvg(input);
    const tmp = path.join(os.tmpdir(), `cover_${Date.now()}_${crypto.randomBytes(4).toString('hex')}.svg`);
    fs.writeFileSync(tmp, svg, 'utf8');

    const safeTitle = String(input.title || '封面').replace(/[\\/:*?"<>|]/g, '').slice(0, 24) || '封面';
    const rec = await registerStoredFile({
      srcPath: tmp,
      name: `${safeTitle}-封面.svg`,
      mime: 'image/svg+xml',
      opts: {
        ownerId: opts.ownerId || '',
        listingId: opts.listingId || '',
        role: 'auto-cover',
        extract: false,
      },
    });
    return rec;
  } catch (err) {
    console.error('[cover] 生成失败:', err.message);
    return null;
  }
}

export default { makeCoverSvg, generateCoverFile };

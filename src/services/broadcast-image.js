/**
 * 小鱼来了 — 把群发文案渲染成一张长图
 *
 * 为什么需要：
 *   一部分微信内置浏览器把 navigator.clipboard 和 execCommand('copy') 全禁了，
 *   一键复制彻底不可用。这时候最土但最有效的办法是发图：
 *   用户长按图片 → 保存/发送，群里照样能看。
 *
 * 实现路径：
 *   拼 SVG（自己做换行，因为 SVG <text> 不会自动折行）
 *     → ffmpeg 栅格化成 PNG（服务器 ffmpeg 4.4 支持 SVG 输入，字体用文泉驿正黑）
 *     → 存成附件返回 URL
 *
 * 注意：所有文字都要自己做 XML 转义，否则内容里的 & < > 会把 SVG 弄坏。
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs';
import { qrMatrix } from '../lib/qrcode.js';
import os from 'node:os';
import path from 'node:path';

const execFileAsync = promisify(execFile);

function requireQrMatrix(text) {
  return qrMatrix(String(text), { ecc: 'M', margin: 0 });
}

const FONT = '/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc';
const FONT_FAMILY = 'WenQuanYi Zen Hei, Source Han Sans SC, Noto Sans CJK SC, sans-serif';

/** 版面参数 */
const W = 1080;
const PAD = 64;
const TITLE_SIZE = 52;
const LINE_SIZE = 40;
const LINE_H = 64;
const SMALL_SIZE = 30;
const SMALL_H = 48;

/** XML 转义（内容里出现 & < > 不能破坏 SVG） */
function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/** 估算一段文字宽度：CJK 算 1 个字宽，ASCII 算 0.55 */
function measure(text, size) {
  let w = 0;
  for (const ch of String(text)) {
    const code = ch.codePointAt(0);
    if (code >= 0x2e80) w += size; // CJK
    else if (/[A-Za-z0-9]/.test(ch)) w += size * 0.56;
    else w += size * 0.34; // 空格与标点
  }
  return w;
}

/** 把一行拆成不可分割的片段：链接整段保留，其余按字符 */
function toSegments(line) {
  const segs = [];
  const re = /(https?:\/\/[^\s，。；、）)]+)/g;
  let last = 0;
  let m;
  while ((m = re.exec(line))) {
    if (m.index > last) segs.push({ text: line.slice(last, m.index), atomic: false });
    segs.push({ text: m[0], atomic: true });
    last = m.index + m[0].length;
  }
  if (last < line.length) segs.push({ text: line.slice(last), atomic: false });
  return segs.length ? segs : [{ text: line, atomic: false }];
}

/**
 * 按可用宽度折行。
 * 链接是原子片段：整段放不下就单独占一行，绝不从中间截断
 * （之前会把短链切成「…grppg」+「q5」两行，用户根本没法点）。
 */
function wrap(text, size, maxWidth) {
  const out = [];
  for (const raw of String(text ?? '').split('\n')) {
    if (!raw.trim()) {
      out.push('');
      continue;
    }
    let cur = '';
    const push = () => {
      if (cur) out.push(cur);
      cur = '';
    };
    for (const seg of toSegments(raw)) {
      if (seg.atomic) {
        // 链接单独一行
        push();
        out.push(seg.text);
        continue;
      }
      for (const ch of seg.text) {
        if (measure(cur + ch, size) > maxWidth && cur) {
          push();
          cur = ch;
        } else {
          cur += ch;
        }
      }
    }
    push();
  }
  return out;
}

/**
 * 生成 SVG。
 * @param {object} p { title, body, footer, qrText, qrCaption }
 *   qrText 传了就在页面底部画一个二维码（视频/群发图里扫码直达）
 */
export function buildSvg({ title = '转发文案', body = '', footer = '', qrText = '', qrCaption = '' } = {}) {
  const maxW = W - PAD * 2;

  const titleLines = wrap(title, TITLE_SIZE, maxW);
  const bodyLines = wrap(body, LINE_SIZE, maxW);
  const footerLines = footer ? wrap(footer, SMALL_SIZE, maxW) : [];

  let y = PAD;
  const parts = [];

  /** 超宽行（比如很长的链接）用 textLength 压回画布内，不裁掉 */
  const fitAttrs = (line, size) =>
    measure(line, size) > maxW
      ? ` textLength="${maxW}" lengthAdjust="spacingAndGlyphs"`
      : '';

  // 标题
  for (const line of titleLines) {
    y += TITLE_SIZE;
    parts.push(
      `<text x="${PAD}" y="${y}" font-family="${esc(FONT_FAMILY)}" font-size="${TITLE_SIZE}" font-weight="700" fill="#111827"${fitAttrs(line, TITLE_SIZE)}>${esc(line)}</text>`,
    );
    y += 18;
  }
  y += 24;
  // 分隔线
  parts.push(`<line x1="${PAD}" y1="${y}" x2="${W - PAD}" y2="${y}" stroke="#d7dee9" stroke-width="2"/>`);
  y += 24;

  // 正文
  for (const line of bodyLines) {
    if (!line) {
      y += LINE_H * 0.55;
      continue;
    }
    y += LINE_H;
    // 链接行用品牌色，方便辨认
    const isLink = /^https?:\/\//i.test(line.trim());
    const fill = isLink ? '#0b74ff' : '#1f2937';
    parts.push(
      `<text x="${PAD}" y="${y}" font-family="${esc(FONT_FAMILY)}" font-size="${LINE_SIZE}" fill="${fill}"${fitAttrs(line, LINE_SIZE)}>${esc(line)}</text>`,
    );
  }

  // 页脚
  if (footerLines.length) {
    y += 28;
    parts.push(`<line x1="${PAD}" y1="${y}" x2="${W - PAD}" y2="${y}" stroke="#e5eaf2" stroke-width="2"/>`);
    y += 16;
    for (const line of footerLines) {
      y += SMALL_H;
      parts.push(
        `<text x="${PAD}" y="${y}" font-family="${esc(FONT_FAMILY)}" font-size="${SMALL_SIZE}" fill="#8a94a6">${esc(line)}</text>`,
      );
    }
  }

  /* ---------------- 二维码（含在图片里，扫一下就能看原文） ---------------- */
  if (qrText) {
    const quiet = 2; // 静区模块数
    const target = 320; // 二维码像素边长
    let info = null;
    try {
      const mod = requireQrMatrix(qrText);
      info = mod;
    } catch {
      info = null;
    }
    if (info && info.size) {
      const unit = target / (info.size + quiet * 2);
      const dim = unit * (info.size + quiet * 2);
      const qx = Math.round((W - dim) / 2);
      const qy = Math.round(y + 48);
      // 白底 + 浅边框，避免二维码贴在彩色背景上看不清
      parts.push(
        `<rect x="${qx - 12}" y="${qy - 12}" width="${Math.round(dim + 24)}" height="${Math.round(dim + 24)}" rx="12" fill="#ffffff" stroke="#e3e9f2" stroke-width="2"/>`,
      );
      let d = '';
      for (let row = 0; row < info.size; row += 1) {
        for (let col = 0; col < info.size; col += 1) {
          if (!info.modules[row][col]) continue;
          const px = qx + (col + quiet) * unit;
          const py = qy + (row + quiet) * unit;
          d += `M${px.toFixed(2)} ${py.toFixed(2)}h${unit.toFixed(2)}v${unit.toFixed(2)}h-${unit.toFixed(2)}z`;
        }
      }
      if (d) parts.push(`<path d="${d}" fill="#111827" shape-rendering="crispEdges"/>`);

      y = qy + dim + 24;
      const caption = qrCaption || '扫码查看详情';
      y += 44;
      parts.push(
        `<text x="${W / 2}" y="${y}" text-anchor="middle" font-family="${esc(FONT_FAMILY)}" font-size="34" font-weight="700" fill="#111827">${esc(caption)}</text>`,
      );
      /*
       * 不再把二维码对应的网址印在图上 —— 用户明确要求「图片里不需要链接」，
       * 图上有二维码就够了，印一串 URL 既占地方又没人手敲。
       */
    }
  }

  const H = Math.max(360, Math.round(y + PAD));

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
<rect width="${W}" height="${H}" fill="#ffffff"/>
${parts.join('\n')}
</svg>`;
}

/**
 * 渲染成 PNG。
 * @param {object} p { title, body, footer, qrText, qrCaption }
 * @returns {Promise<{buffer:Buffer, width:number, height:number}>}
 */
export async function renderPng({ title, body, footer, qrText = '', qrCaption = '' }) {
  const svg = buildSvg({ title, body, footer, qrText, qrCaption });
  const m = /height="(\d+)"/.exec(svg);
  const height = m ? Number(m[1]) : 0;

  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const svgPath = path.join(os.tmpdir(), `bcast-${stamp}.svg`);
  const pngPath = path.join(os.tmpdir(), `bcast-${stamp}.png`);

  fs.writeFileSync(svgPath, svg, 'utf8');
  try {
    await execFileAsync(
      'ffmpeg',
      ['-y', '-loglevel', 'error', '-i', svgPath, '-frames:v', '1', pngPath],
      { timeout: 25000 },
    );
    if (!fs.existsSync(pngPath)) throw new Error('渲染失败：没有生成图片');
    const buffer = fs.readFileSync(pngPath);
    return { buffer, width: W, height };
  } finally {
    try {
      fs.unlinkSync(svgPath);
    } catch {
      /* ignore */
    }
    try {
      fs.unlinkSync(pngPath);
    } catch {
      /* ignore */
    }
  }
}

export default { buildSvg, renderPng, FONT };

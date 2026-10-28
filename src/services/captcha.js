/**
 * 小鱼来了 — 图形验证码
 *
 * 渲染方式：服务端用 ffmpeg（drawtext + 噪点 + 干扰线）画成 PNG。
 *
 * 为什么不用 SVG：
 *   之前是直接拼 SVG，字符以 <text>K</text> 的形式写在图里，
 *   一个正则就能把答案提出来，等于验证码形同虚设。
 *   改成 PNG 之后图片里只有像素，想解就得 OCR。
 *
 * 只返回 base64 图片与 captchaId，字符本身永不下发。
 *
 * 存储：进程内 Map，一次性使用，默认 5 分钟过期。
 * 注意：多进程/多实例部署时需要换成共享存储（如 Redis 或落盘 JSON）。
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const run = promisify(execFile);

/** 中文字体里有完整的拉丁字符，直接用它画验证码 */
const FONT = '/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc';

const TTL_MS = 5 * 60 * 1000;
const MAX_ENTRIES = 5000;

/** id -> { text, expires, used } */
const store = new Map();

function sweep() {
  const now = Date.now();
  for (const [k, v] of store) {
    if (v.expires <= now || v.used) store.delete(k);
  }
  if (store.size > MAX_ENTRIES) {
    const over = store.size - MAX_ENTRIES;
    let i = 0;
    for (const k of store.keys()) {
      if (i++ >= over) break;
      store.delete(k);
    }
  }
}

/* 去掉了容易混淆的 0/O/1/I/L */
const CHARS = '23456789ABCDEFGHJKMNPQRSTUVWXY';

function randomText(len = 4) {
  let s = '';
  const bytes = crypto.randomBytes(len);
  for (let i = 0; i < len; i++) s += CHARS[bytes[i] % CHARS.length];
  return s;
}

function esc(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

/** 生成一个 SVG 验证码图片 */
function renderSvg(text) {
  const W = 132;
  const H = 46;
  const colors = ['#0b74ff', '#0a5ac8', '#0e8f7e', '#c0561a', '#7c5cf0', '#b02060'];
  const rnd = (n) => crypto.randomBytes(2).readUInt16BE(0) % n;

  const parts = [];
  parts.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="图形验证码">`);
  parts.push(`<rect width="${W}" height="${H}" fill="#f4f8fc"/>`);

  // 干扰线
  for (let i = 0; i < 5; i++) {
    const x1 = rnd(W);
    const y1 = rnd(H);
    const x2 = rnd(W);
    const y2 = rnd(H);
    const c = colors[rnd(colors.length)];
    parts.push(
      `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${c}" stroke-width="1" opacity="0.35"/>`
    );
  }

  // 噪点
  for (let i = 0; i < 26; i++) {
    const cx = rnd(W);
    const cy = rnd(H);
    parts.push(`<circle cx="${cx}" cy="${cy}" r="1" fill="${colors[rnd(colors.length)]}" opacity="0.3"/>`);
  }

  // 字符
  const stepX = (W - 24) / text.length;
  for (let i = 0; i < text.length; i++) {
    const x = 14 + i * stepX + rnd(4);
    const y = 31 + (rnd(9) - 4);
    const rot = rnd(46) - 23;
    const size = 26 + rnd(6);
    const c = colors[rnd(colors.length)];
    parts.push(
      `<text x="${x}" y="${y}" font-family="'DejaVu Sans','Segoe UI',Arial,sans-serif" ` +
        `font-size="${size}" font-weight="700" fill="${c}" opacity="0.92" ` +
        `transform="rotate(${rot} ${x} ${y})">${esc(text[i])}</text>`
    );
  }

  // 边框
  parts.push(`<rect x="0.5" y="0.5" width="${W - 1}" height="${H - 1}" fill="none" stroke="#d8e3ee"/>`);
  parts.push('</svg>');
  return parts.join('');
}

/**
 * 把验证码画成 PNG（ffmpeg drawtext）。
 * 每个字符单独画，位置、字号、颜色都随机，再叠噪点和干扰线。
 */
async function renderPng(text) {
  const W = 132;
  const H = 46;
  const colors = ['0x0b74ff', '0x0a5ac8', '0x0e8f7e', '0xc0561a', '0x7c5cf0', '0xb02060'];
  const rnd = (n) => crypto.randomBytes(2).readUInt16BE(0) % n;

  const parts = [];
  const stepX = (W - 24) / text.length;
  for (let i = 0; i < text.length; i++) {
    const x = Math.round(12 + i * stepX + rnd(4));
    const y = 8 + rnd(8);
    const size = 26 + rnd(6);
    const c = colors[rnd(colors.length)];
    parts.push(
      `drawtext=fontfile=${FONT}:text='${text[i]}':x=${x}:y=${y}` +
        `:fontsize=${size}:fontcolor=${c}@0.92`,
    );
  }

  // 干扰线：几条 1px 横线
  for (let i = 0; i < 3; i++) {
    const y = rnd(H);
    const c = colors[rnd(colors.length)].replace('0x', '0x');
    parts.push(`drawbox=x=0:y=${y}:w=${W}:h=1:color=${c}@0.30:t=fill`);
  }

  // 噪点
  parts.push('noise=alls=14:allf=t');

  const filters = parts.join(',');
  const tmp = path.join(os.tmpdir(), `xyll-cap-${Date.now()}-${rnd(10000)}.png`);

  try {
    await run(
      'ffmpeg',
      [
        '-y',
        '-hide_banner',
        '-loglevel',
        'error',
        '-f',
        'lavfi',
        '-i',
        `color=c=0xf4f8fc:s=${W}x${H}:d=1`,
        '-vf',
        filters,
        '-frames:v',
        '1',
        tmp,
      ],
      { timeout: 8000, maxBuffer: 2 * 1024 * 1024 },
    );
    const buf = fs.readFileSync(tmp);
    return buf.length > 500 ? buf : null;
  } catch (err) {
    console.warn('[captcha] PNG 渲染失败:', err.message);
    return null;
  } finally {
    try {
      fs.unlinkSync(tmp);
    } catch {
      /* ignore */
    }
  }
}

/**
 * 生成一个验证码。
 * @returns {Promise<{id:string, image:string, ttl:number}>}
 *          image 是 data:image/png;base64,...，字符本身绝不下发
 */
export async function issueCaptcha(len = 4) {
  sweep();
  const text = randomText(len);
  const id = crypto.randomBytes(12).toString('hex');
  store.set(id, { text, expires: Date.now() + TTL_MS, used: false });

  const png = await renderPng(text);
  if (png) {
    return { id, image: `data:image/png;base64,${png.toString('base64')}`, ttl: Math.floor(TTL_MS / 1000) };
  }

  /*
   * ffmpeg 不可用时的兜底。
   * 注意：这里退回旧 SVG，字符会出现在图里 —— 只在渲染失败时才会走到，
   * 正常情况下不会发生；宁可偶尔弱一点，也不能让用户拿不到验证码。
   */
  console.warn('[captcha] 退回 SVG（字符可被提取），检查 ffmpeg 是否可用');
  return { id, svg: renderSvg(text), ttl: Math.floor(TTL_MS / 1000) };
}

/**
 * 校验验证码；不区分大小写，一次性有效。
 * @returns {{ok:boolean, reason?:string}}
 */
export function verifyCaptcha(id, input) {
  sweep();
  const key = String(id || '').trim();
  const val = String(input || '').trim().toUpperCase();
  if (!key) return { ok: false, reason: '请先获取图形验证码' };
  if (!val) return { ok: false, reason: '请输入图形验证码' };

  const rec = store.get(key);
  if (!rec) return { ok: false, reason: '图形验证码已过期，请刷新' };
  if (rec.used) return { ok: false, reason: '图形验证码已使用，请刷新' };
  if (rec.expires <= Date.now()) {
    store.delete(key);
    return { ok: false, reason: '图形验证码已过期，请刷新' };
  }

  rec.used = true;
  store.delete(key);

  if (rec.text.toUpperCase() !== val) return { ok: false, reason: '图形验证码不正确' };
  return { ok: true };
}

/** 仅用于测试：清空 */
export function _resetCaptchaStore() {
  store.clear();
}

export default { issueCaptcha, verifyCaptcha };

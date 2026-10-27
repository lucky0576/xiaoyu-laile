/**
 * 小鱼来了 — 照片封面生成
 *
 * 发布信息时如果没上传图片，按标题 / 副标题推断行业，
 * 去 Wikimedia Commons 找一张对口的实景照片，再用 ffmpeg 压上标题、
 * 城市徽标和品牌 —— 比纯渐变矢量封面更像「真东西」。
 *
 * 为什么用 Wikimedia Commons：
 *   · 免 API Key，合规可商用（CC 协议为主），有作者与许可信息
 *   · 服务器直连可用，不像 Unsplash / Bing 那样动不动 503 或封 IP
 *
 * 依赖：只用系统已有的 ffmpeg 和 fonts-wqy-zenhei，不引入 npm 包。
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { registerStoredFile } from './files.js';

const run = promisify(execFile);

const W = 1200;
const H = 630;
const PADDING = 56;
const FONT = '/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc';
const BRAND = '小鱼来了 · xiaoyulaile.online';
const UA = 'XiaoYuLaile/1.0 (auto cover; +https://xiaoyulaile.online)';

/**
 * 中文关键词 → 英文搜索词。
 * Wikimedia Commons 的英文内容远比中文全，所以统一翻成英文搜。
 */
const QUERY_MAP = [
  [/风电|风机|风场|风力|wind/i, 'wind turbine farm'],
  [/储能|电芯|储能柜|BESS|集装箱电站/i, 'battery energy storage system'],
  [/光伏|组件|逆变器|硅片|电池片|支架|solar/i, 'solar power plant photovoltaic'],
  [/算力|服务器|显卡|GPU|内存|机房|数据中心/i, 'data center server racks'],
  [/机器人|机械臂|自动化产线/i, 'industrial robot arm factory'],
  [/无人机|低空|eVTOL|通航/i, 'drone flying sky'],
  [/充电桩|充换电|充电站|超充/i, 'electric vehicle charging station'],
  [/钢铁|冶金|炼钢|钢/i, 'steel mill'],
  [/化工|化学|炼化|化肥/i, 'chemical plant industry'],
  [/半导体|芯片|晶圆|集成电路/i, 'semiconductor wafer cleanroom'],
  [/水泥|建材|搅拌站/i, 'cement plant'],
  [/物流|仓储|冷链|货运/i, 'warehouse logistics'],
  [/农光|渔光|光伏农业|农业/i, 'agrivoltaics solar farm'],
  [/商业地产|写字楼|综合体|产业园|物业/i, 'modern office building city'],
  [/新能源|能源|电力|电网|输电/i, 'renewable energy power grid'],
];
const DEFAULT_QUERY = 'industrial energy infrastructure';

/** 按文本推断搜什么图 */
export function pickPhotoQuery(text) {
  const t = String(text || '');
  for (const [re, q] of QUERY_MAP) if (re.test(t)) return q;
  return DEFAULT_QUERY;
}

function timeoutFetch(url, ms = 15000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  return fetch(url, { signal: ctrl.signal, headers: { 'User-Agent': UA } }).finally(() => clearTimeout(timer));
}

/** 在 Commons 上搜一张横版、够大的实景图 */
export async function findPhoto(query) {
  const qs = new URLSearchParams({
    action: 'query',
    format: 'json',
    generator: 'search',
    gsrsearch: query,
    gsrnamespace: '6',
    gsrlimit: '10',
    prop: 'imageinfo',
    iiprop: 'url|size|mime',
    iiurlwidth: '1400',
  });
  const res = await timeoutFetch(`https://commons.wikimedia.org/w/api.php?${qs}`);
  if (!res.ok) return null;
  const j = await res.json();
  const pages = (j && j.query && j.query.pages) || {};
  const list = Object.values(pages)
    .map((p) => (Array.isArray(p.imageinfo) ? p.imageinfo[0] : null))
    .filter(Boolean)
    .filter((ii) => /^image\/(jpeg|png)$/i.test(ii.mime || ''))
    .filter((ii) => (ii.width || 0) >= 1000)
    .filter((ii) => (ii.width || 0) >= (ii.height || 0)) // 只要横版
    .map((ii) => ({ url: ii.thumburl || ii.url, width: ii.width || 0, height: ii.height || 0 }))
    .filter((x) => x.url)
    .sort((a, b) => b.width - a.width);
  return list[0] || null;
}

async function download(url, dest) {
  const res = await timeoutFetch(url, 30000);
  if (!res.ok) throw new Error(`图片下载失败 ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length < 8000) throw new Error('图片太小，可能不是有效图片');
  fs.writeFileSync(dest, buf);
  return buf.length;
}

/** 估算一行能放多少个「单位宽」，中文算 1，ASCII 算 0.58 */
function textUnits(s) {
  let u = 0;
  for (const ch of String(s)) {
    u += /[\u4e00-\u9fa5\u3000-\u303f\uff00-\uffef]/.test(ch) ? 1 : 0.58;
  }
  return u;
}

/**
 * 按字号把标题折成最多 maxLines 行。
 *
 * 关键：以「词」为单位断行，不要把一个英文单词或数字拆开 ——
 * 之前逐字断行会出现「2MWh 现货 12 台（202 / 3 年设备）」这种，
 * 数字被劈成两半，很难看。
 */
function wrapTitle(title, fontSize, maxLines = 3) {
  const maxUnits = (W - PADDING * 2) / fontSize;
  const text = String(title).trim();

  // 切成「原子」：中文单字各算一个，英文/数字连成一个词
  const atoms = [];
  let buf = '';
  for (const ch of text) {
    const isAsciiWord = /[A-Za-z0-9.%:+\-]/.test(ch);
    if (isAsciiWord) {
      buf += ch;
    } else {
      if (buf) {
        atoms.push(buf);
        buf = '';
      }
      atoms.push(ch);
    }
  }
  if (buf) atoms.push(buf);

  const lines = [];
  let cur = '';
  for (const atom of atoms) {
    const next = cur + atom;
    if (textUnits(next) > maxUnits && cur) {
      lines.push(cur);
      cur = atom;
      if (lines.length >= maxLines) break;
    } else {
      cur = next;
    }
  }
  if (lines.length < maxLines && cur) lines.push(cur);

  const out = lines.slice(0, maxLines);
  const used = out.join('').length;
  if (used < text.length && out.length) {
    const last = out[out.length - 1];
    out[out.length - 1] = `${last.replace(/[…]$/, '')}…`;
  }
  return out;
}

/** 转义 ffmpeg 滤镜里的路径（只处理 we need 的字符） */
function escFilterPath(p) {
  return String(p).replace(/\\/g, '/').replace(/:/g, '\\:').replace(/'/g, "\\'");
}

/**
 * 合成照片封面。
 * @returns {Promise<{url:string,id:string}|null>}
 */
export async function generatePhotoCover(input = {}, opts = {}) {
  const tmpFiles = [];
  try {
    /*
     * 标题去掉「城市·行业｜」这种前缀。
     * 列表标题常写成「呼和浩特市·风电｜内蒙古 200MW 风电项目开发权转让」，
     * 但城市已经在左上角徽标里了，再重复一遍既占地方又啰嗦。
     */
    const rawTitle = String(input.title || '').trim();
    const title = (() => {
      const t = rawTitle.replace(/^[^｜|]{1,14}[｜|]\s*/, '').trim();
      return t || rawTitle;
    })();
    if (!title) return null;

    const query = pickPhotoQuery(
      [title, input.subtitle, input.industry, input.kindLabel, input.categoryName].filter(Boolean).join(' '),
    );
    /*
     * 多级兜底。
     * Wikimedia 的搜索结果不稳定：同一个词可能这一秒有、下一秒没有。
     * 所以按「具体 → 宽泛」依次试，拿到第一张就停。
     */
    const queries = [query];
    if (input.industry) {
      const q2 = pickPhotoQuery(String(input.industry));
      if (!queries.includes(q2)) queries.push(q2);
    }
    queries.push('renewable energy power plant', 'industrial infrastructure factory');

    let photo = null;
    for (const q of queries) {
      try {
        photo = await findPhoto(q);
      } catch {
        photo = null;
      }
      if (photo) break;
    }
    if (!photo) return null;

    const stamp = `${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
    const photoPath = path.join(os.tmpdir(), `pc_src_${stamp}.img`);
    const outPath = path.join(os.tmpdir(), `pc_out_${stamp}.jpg`);
    const titlePath = path.join(os.tmpdir(), `pc_title_${stamp}.txt`);
    const badgePath = path.join(os.tmpdir(), `pc_badge_${stamp}.txt`);
    const markPath = path.join(os.tmpdir(), `pc_mark_${stamp}.txt`);
    tmpFiles.push(photoPath, outPath, titlePath, badgePath, markPath);

    await download(photo.url, photoPath);

    // 字号自适应：先 58，放不下就缩
    let fontSize = 58;
    let lines = wrapTitle(title, fontSize, 3);
    if (lines.length > 2) {
      fontSize = 50;
      lines = wrapTitle(title, fontSize, 3);
    }
    if (textUnits(lines.join('')) < textUnits(title) - 1) {
      fontSize = 44;
      lines = wrapTitle(title, fontSize, 4);
    }

    const city = String(input.city || '').trim();
    const industry = String(input.industry || '').trim();
    const badgeText = [city, industry].filter(Boolean).join(' · ') || String(input.categoryName || '小鱼来了');
    // 城市「徽标」：取城市名前两个字当方块 logo
    const cityMark = city ? [...city].slice(0, 2).join('') : '小鱼';

    const utf8 = 'utf8';
    fs.writeFileSync(titlePath, lines.join('\n'), utf8);
    fs.writeFileSync(badgePath, badgeText, utf8);
    fs.writeFileSync(markPath, BRAND, utf8);
    const cityMarkPath = path.join(os.tmpdir(), `pc_citymark_${stamp}.txt`);
    tmpFiles.push(cityMarkPath);
    fs.writeFileSync(cityMarkPath, cityMark, utf8);

    const titleY = H - 32 - 34 - lines.length * Math.round(fontSize * 1.32);
    const filters = [
      // 缩放到铺满并居中裁切
      `scale=${W}:${H}:force_original_aspect_ratio=increase`,
      `crop=${W}:${H}`,
      // 整体压暗 + 底部再压一层，保证白字可读
      `drawbox=x=0:y=0:w=${W}:h=${H}:color=black@0.30:t=fill`,
      `drawbox=x=0:y=${Math.max(0, titleY - 30)}:w=${W}:h=${H - Math.max(0, titleY - 30)}:color=black@0.34:t=fill`,
      // 左上：城市方块徽标 + 徽标底色
      `drawbox=x=${PADDING}:y=46:w=64:h=64:color=white@0.92:t=fill`,
      `drawtext=fontfile=${FONT}:textfile=${escFilterPath(cityMarkPath)}:x=${PADDING}:y=66:fontsize=30:fontcolor=0x0B74FF`,
      // 城市 / 行业标签
      `drawtext=fontfile=${FONT}:textfile=${escFilterPath(badgePath)}:x=${PADDING + 80}:y=68:fontsize=28:fontcolor=white:shadowcolor=black@0.5:shadowx=2:shadowy=2`,
      // 主标题
      `drawtext=fontfile=${FONT}:textfile=${escFilterPath(titlePath)}:x=${PADDING}:y=${titleY}:fontsize=${fontSize}:fontcolor=white:line_spacing=${Math.round(fontSize * 0.32)}:shadowcolor=black@0.55:shadowx=3:shadowy=3`,
      // 右下：品牌
      `drawtext=fontfile=${FONT}:textfile=${escFilterPath(markPath)}:x=${PADDING}:y=${H - 56}:fontsize=24:fontcolor=white@0.9`,
    ];

    await run(
      'ffmpeg',
      ['-y', '-hide_banner', '-loglevel', 'error', '-i', photoPath, '-filter_complex', `[0:v]${filters.join(',')}`, '-frames:v', '1', outPath],
      { timeout: 45000, maxBuffer: 8 * 1024 * 1024 },
    );

    if (!fs.existsSync(outPath) || fs.statSync(outPath).size < 3000) return null;

    const safeTitle = title.replace(/[\\/:*?"<>|]/g, '').slice(0, 24) || '封面';
    const rec = await registerStoredFile({
      srcPath: outPath,
      name: `${safeTitle}-封面.jpg`,
      mime: 'image/jpeg',
      opts: {
        ownerId: opts.ownerId || '',
        listingId: opts.listingId || '',
        role: 'auto-cover',
        extract: false,
      },
    });
    return rec;
  } catch (err) {
    console.error('[photo-cover] 生成失败:', err.message);
    return null;
  } finally {
    for (const f of tmpFiles) {
      try {
        fs.unlinkSync(f);
      } catch {
        /* ignore */
      }
    }
  }
}

export default { generatePhotoCover, findPhoto, pickPhotoQuery };

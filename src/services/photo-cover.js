/**
 * 小鱼来了 — 照片封面生成
 *
 * 发布信息时如果没上传图片，按标题 / 副标题推断行业，
 * 去 Wikimedia Commons 找一张对口的实景照片，再用 ffmpeg 压上标题、
 * 城市徽标和品牌 —— 比纯渐变矢量封面更像「真东西」。
 *
 * 为什么用 Wikimedia Commons：
 *   · 免 API Key，CC 协议为主，有作者与许可信息（可以合规署名）
 *   · 服务器直连可用，不像 Unsplash / Bing 那样动不动 503 或封 IP
 *
 * 三条工程上的讲究：
 *   1. 统一色调：照片先轻度高斯模糊 + 降饱和 + 压一层品牌深蓝，
 *      不同来源的图风格差距会被拉平，白字也更好读。
 *   2. 同行业复用同一张图：按搜索词缓存到 data/photo-cache/，
 *      省跨境流量、省 API 调用，同一行业的封面风格也保持一致。
 *   3. 右下角标注作者与许可：CC 协议要求署名，这事儿不能省。
 *
 * 依赖：只用系统已有的 ffmpeg 和 fonts-wqy-zenhei，不引入 npm 包。
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import dns from 'node:dns';
import https from 'node:https';
import http from 'node:http';
import { DATA_DIR } from '../config.js';
import { registerStoredFile } from './files.js';

const run = promisify(execFile);

/*
 * 强制优先 IPv4。
 * 这台机器到 Wikimedia 的 IPv6 路由是坏的：Node 的 fetch（undici）会先试 IPv6
 * 然后 ETIMEDOUT，而 curl 会自动回落 IPv4 所以看起来「curl 能通、代码不行」。
 * 关掉 IPv6 优先即可，不用改系统配置。
 */
try {
  dns.setDefaultResultOrder('ipv4first');
} catch {
  /* 老版本 Node 没有这个 API，忽略 */
}

const W = 1200;
const H = 630;
const PADDING = 56;
const FONT = '/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc';
const BRAND = '小鱼来了 · xiaoyulaile.online';
const UA = 'XiaoYuLaile/1.0 (auto cover; +https://xiaoyulaile.online)';

/** 照片缓存：同行业复用同一张图 */
const CACHE_DIR = path.join(DATA_DIR, 'photo-cache');
const CACHE_INDEX = path.join(CACHE_DIR, 'index.json');
const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 天

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

/**
 * 带超时和重定向的 GET，强制 IPv4。
 *
 * 为什么不用全局 fetch：
 * 这台机器到 Wikimedia 的 IPv6 路由不通，undici（Node 的 fetch 实现）会先试
 * IPv6 然后 ETIMEDOUT 报 "fetch failed"，但 curl 会自动回落 IPv4 所以看着像
 * 「curl 能通、代码不行」。用 node:https 显式 family:4 就稳了。
 */
function httpsGet(url, { timeout = 20000, maxRedirects = 3 } = {}) {
  return new Promise((resolve, reject) => {
    const go = (target, left) => {
      let u;
      try {
        u = new URL(target);
      } catch (err) {
        reject(err);
        return;
      }
      const mod = u.protocol === 'http:' ? http : https;
      const req = mod.get(
        u,
        {
          family: 4,
          timeout,
          headers: { 'User-Agent': UA, Accept: '*/*' },
        },
        (res) => {
          const { statusCode, headers } = res;
          if (statusCode >= 300 && statusCode < 400 && headers.location && left > 0) {
            res.resume();
            go(new URL(headers.location, u).toString(), left - 1);
            return;
          }
          const chunks = [];
          res.on('data', (c) => chunks.push(c));
          res.on('end', () => resolve({ status: statusCode, headers, body: Buffer.concat(chunks) }));
          res.on('error', reject);
        },
      );
      req.on('timeout', () => {
        req.destroy(new Error('请求超时'));
      });
      req.on('error', reject);
    };
    go(url, maxRedirects);
  });
}

/* ------------------------------------------------------------------ */
/* 照片缓存                                                            */
/* ------------------------------------------------------------------ */

function readCacheIndex() {
  try {
    return JSON.parse(fs.readFileSync(CACHE_INDEX, 'utf8')) || {};
  } catch {
    return {};
  }
}

function writeCacheIndex(obj) {
  try {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
    const tmp = `${CACHE_INDEX}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(obj, null, 2), 'utf8');
    fs.renameSync(tmp, CACHE_INDEX);
  } catch {
    /* 缓存写失败不影响主流程 */
  }
}

/** 命中缓存则返回本地文件路径与署名信息 */
function getCached(query) {
  const idx = readCacheIndex();
  const hit = idx[query];
  if (!hit || !hit.file) return null;
  if (Date.now() - Number(hit.fetchedAt || 0) > CACHE_TTL_MS) return null;
  const p = path.join(CACHE_DIR, hit.file);
  if (!fs.existsSync(p) || fs.statSync(p).size < 8000) return null;
  return { ...hit, path: p };
}

function putCache(query, entry) {
  const idx = readCacheIndex();
  idx[query] = { ...entry, fetchedAt: Date.now() };
  writeCacheIndex(idx);
}

/* ------------------------------------------------------------------ */
/* 找图                                                                */
/* ------------------------------------------------------------------ */

/** 去掉 Wikimedia 返回的 HTML 标签，留下纯文本 */
function stripHtml(s) {
  return String(s || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

/** 在 Commons 上搜一张横版、够大的实景图，并带回署名信息 */
export async function findPhoto(query) {
  const qs = new URLSearchParams({
    action: 'query',
    format: 'json',
    generator: 'search',
    gsrsearch: query,
    gsrnamespace: '6',
    gsrlimit: '10',
    prop: 'imageinfo',
    iiprop: 'url|size|mime|extmetadata',
    iiurlwidth: '1400',
  });
  const res = await httpsGet(`https://commons.wikimedia.org/w/api.php?${qs}`, { timeout: 20000 });
  if (res.status !== 200) return null;
  const j = JSON.parse(res.body.toString('utf8'));
  const pages = (j && j.query && j.query.pages) || {};
  const list = Object.values(pages)
    .map((p) => (Array.isArray(p.imageinfo) ? p.imageinfo[0] : null))
    .filter(Boolean)
    .filter((ii) => /^image\/(jpeg|png)$/i.test(ii.mime || ''))
    .filter((ii) => (ii.width || 0) >= 1000)
    .filter((ii) => (ii.width || 0) >= (ii.height || 0)) // 只要横版
    .map((ii) => {
      const meta = ii.extmetadata || {};
      const artist = stripHtml(meta.Artist && meta.Artist.value).slice(0, 40);
      const license = stripHtml(
        (meta.LicenseShortName && meta.LicenseShortName.value) ||
          (meta.License && meta.License.value) ||
          'Wikimedia Commons',
      ).slice(0, 24);
      return {
        url: ii.thumburl || ii.url,
        width: ii.width || 0,
        height: ii.height || 0,
        artist: artist || 'Wikimedia',
        license: license || 'CC',
      };
    })
    .filter((x) => x.url)
    .sort((a, b) => b.width - a.width);
  return list[0] || null;
}

async function download(url, dest) {
  const res = await httpsGet(url, { timeout: 45000 });
  if (res.status !== 200) throw new Error(`图片下载失败 ${res.status}`);
  const buf = res.body;
  if (buf.length < 8000) throw new Error('图片太小，可能不是有效图片');
  fs.writeFileSync(dest, buf);
  return buf.length;
}

/**
 * 拿一张该搜索词的照片：优先用缓存，没有就现搜 + 下载 + 落缓存。
 * @returns {Promise<{path:string, artist:string, license:string, cached:boolean}|null>}
 */
async function resolvePhoto(query) {
  const cached = getCached(query);
  if (cached) return { ...cached, cached: true };

  const photo = await findPhoto(query);
  if (!photo) return null;

  try {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
    const file = `${crypto.createHash('sha1').update(photo.url).digest('hex').slice(0, 16)}.img`;
    const dest = path.join(CACHE_DIR, file);
    if (!fs.existsSync(dest) || fs.statSync(dest).size < 8000) await download(photo.url, dest);
    putCache(query, { file, artist: photo.artist, license: photo.license });
    return { path: dest, artist: photo.artist, license: photo.license, cached: false };
  } catch (err) {
    console.error('[photo-cover] 下载失败:', err.message);
    return null;
  }
}

/* ------------------------------------------------------------------ */
/* 排版                                                                */
/* ------------------------------------------------------------------ */

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

/** 转义 ffmpeg 滤镜里的路径 */
function escFilterPath(p) {
  return String(p).replace(/\\/g, '/').replace(/:/g, '\\:').replace(/'/g, "\\'");
}

/* ------------------------------------------------------------------ */
/* 主流程                                                              */
/* ------------------------------------------------------------------ */

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
     * 每一级都会先查缓存，命中就不发请求。
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
        photo = await resolvePhoto(q);
      } catch {
        photo = null;
      }
      if (photo) break;
    }
    if (!photo) return null;

    const stamp = `${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
    const outPath = path.join(os.tmpdir(), `pc_out_${stamp}.jpg`);
    const titlePath = path.join(os.tmpdir(), `pc_title_${stamp}.txt`);
    const badgePath = path.join(os.tmpdir(), `pc_badge_${stamp}.txt`);
    const markPath = path.join(os.tmpdir(), `pc_mark_${stamp}.txt`);
    const cityMarkPath = path.join(os.tmpdir(), `pc_citymark_${stamp}.txt`);
    const creditPath = path.join(os.tmpdir(), `pc_credit_${stamp}.txt`);
    tmpFiles.push(outPath, titlePath, badgePath, markPath, cityMarkPath, creditPath);

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
    // CC 署名：作者 + 许可（写在右下角小字）
    const credit = `图：${photo.artist} / ${photo.license}`.slice(0, 46);

    const utf8 = 'utf8';
    fs.writeFileSync(titlePath, lines.join('\n'), utf8);
    fs.writeFileSync(badgePath, badgeText, utf8);
    fs.writeFileSync(markPath, BRAND, utf8);
    fs.writeFileSync(cityMarkPath, cityMark, utf8);
    fs.writeFileSync(creditPath, credit, utf8);

    const titleY = H - 32 - 34 - lines.length * Math.round(fontSize * 1.32);
    const bandTop = Math.max(0, titleY - 30);

    const filters = [
      // 缩放到铺满并居中裁切
      `scale=${W}:${H}:force_original_aspect_ratio=increase`,
      `crop=${W}:${H}`,
      /*
       * 统一色调：
       *   gblur 轻微模糊，抹掉不同图之间的锐度差异，也让白字更干净
       *   eq 降饱和 + 略提对比，照片不会太花
       *   压一层品牌深蓝，所有封面落到同一个色系
       */
      'gblur=sigma=1.1',
      'eq=saturation=0.86:contrast=1.05:brightness=-0.02',
      `drawbox=x=0:y=0:w=${W}:h=${H}:color=0x0B2A4A@0.32:t=fill`,
      // 底部再压一层，保证标题可读
      `drawbox=x=0:y=${bandTop}:w=${W}:h=${H - bandTop}:color=0x061A2E@0.40:t=fill`,
      // 左上：城市方块徽标
      `drawbox=x=${PADDING}:y=46:w=64:h=64:color=white@0.92:t=fill`,
      `drawtext=fontfile=${FONT}:textfile=${escFilterPath(cityMarkPath)}:x=${PADDING}:y=66:fontsize=30:fontcolor=0x0B74FF`,
      // 「城市 · 行业」标签
      `drawtext=fontfile=${FONT}:textfile=${escFilterPath(badgePath)}:x=${PADDING + 80}:y=68:fontsize=28:fontcolor=white:shadowcolor=black@0.5:shadowx=2:shadowy=2`,
      // 主标题
      `drawtext=fontfile=${FONT}:textfile=${escFilterPath(titlePath)}:x=${PADDING}:y=${titleY}:fontsize=${fontSize}:fontcolor=white:line_spacing=${Math.round(fontSize * 0.32)}:shadowcolor=black@0.55:shadowx=3:shadowy=3`,
      // 左下：品牌
      `drawtext=fontfile=${FONT}:textfile=${escFilterPath(markPath)}:x=${PADDING}:y=${H - 56}:fontsize=24:fontcolor=white@0.9`,
      // 右下：CC 署名（小字）
      `drawtext=fontfile=${FONT}:textfile=${escFilterPath(creditPath)}:x=w-tw-24:y=${H - 34}:fontsize=15:fontcolor=white@0.62`,
    ];

    await run(
      'ffmpeg',
      [
        '-y',
        '-hide_banner',
        '-loglevel',
        'error',
        '-i',
        photo.path,
        '-filter_complex',
        `[0:v]${filters.join(',')}`,
        '-frames:v',
        '1',
        outPath,
      ],
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

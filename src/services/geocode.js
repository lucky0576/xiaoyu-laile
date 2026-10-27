/**
 * 小鱼来了 — 地址地理编码
 *
 * 把用户手填的地址（「上海市黄浦区人民广场」）转成经纬度，
 * 用于发布信息时记录位置、详情页展示地图。
 *
 * 主用高德（Web 服务 Key）：
 *   · 中文地址 / POI 准，门牌号也能查到，正适合国内用户
 *   · 顺带能做静态地图，图片在国内加载快
 *
 * 没配 Key 或高德失败时，退回 OpenStreetMap 的 Nominatim（免费无 Key），
 * 功能不会因为 Key 缺失而挂掉。
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import https from 'node:https';
import http from 'node:http';
import { AMAP_KEY, DATA_DIR } from '../config.js';

/** 静态地图磁盘缓存：同一地点只向高德取一次 */
const MAP_CACHE_DIR = path.join(DATA_DIR, 'geo-cache');

const UA = 'XiaoYuLaile/1.0 (address geocoding; +https://xiaoyulaile.online)';
const CACHE_TTL_MS = 10 * 60 * 1000;

/** query → { at, items } */
const cache = new Map();

function httpsGet(url, { timeout = 15000, maxRedirects = 3 } = {}) {
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
        { family: 4, timeout, headers: { 'User-Agent': UA, Accept: '*/*' } },
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
      req.on('timeout', () => req.destroy(new Error('请求超时')));
      req.on('error', reject);
    };
    go(url, maxRedirects);
  });
}

/* ------------------------------------------------------------------ */
/* 高德                                                                */
/* ------------------------------------------------------------------ */

export function amapEnabled() {
  return Boolean(AMAP_KEY);
}

async function amapJson(path, params) {
  if (!AMAP_KEY) return null;
  const qs = new URLSearchParams({ ...params, key: AMAP_KEY, output: 'JSON' });
  try {
    const res = await httpsGet(`https://restapi.amap.com${path}?${qs}`, { timeout: 12000 });
    if (res.status !== 200) return null;
    const j = JSON.parse(res.body.toString('utf8'));
    // 高德用字符串 "1" 表示成功
    if (String(j.status) !== '1') {
      console.error('[geocode] 高德返回:', j.info || j.infocode || 'unknown');
      return null;
    }
    return j;
  } catch (err) {
    console.error('[geocode] 高德请求失败:', err.message);
    return null;
  }
}

/** 把高德的「省市区 + 地址 + 名称」拼成一条可读地址，去掉重复的市名 */
function composeAmapAddress(p) {
  const province = String(p.pname || '').trim();
  const city = String(p.cityname || '').trim();
  const district = String(p.adname || '').trim();
  const street = String(p.address || '').trim();
  const poi = String(p.name || '').trim();

  // 高德的 address 字段有时本身就带区名（「黄浦区人民广场」），
  // 直接拼会得到「上海市黄浦区黄浦区人民广场」，所以要先去重。
  let s = street;
  if (district && s.startsWith(district)) s = s.slice(district.length).trim();
  if (poi && s.startsWith(poi)) s = s.slice(poi.length).trim();

  const head = [province, city === province ? '' : city, district].filter(Boolean).join('');

  const parts = [head, s];
  // POI 名已经包含在 street 里就不再重复
  if (poi && !s.includes(poi)) parts.push(poi);

  let out = parts.filter(Boolean).join('');
  // 兜底再压一次连续重复（如「黄浦区黄浦区」）
  if (district) {
    const dup = `${district}${district}`;
    while (out.includes(dup)) out = out.replace(dup, district);
  }
  return (out || poi || street || '未知地点').slice(0, 120);
}

/** 高德：关键词 / 地址 → 候选 */
async function amapGeocode(query) {
  const out = [];

  // 1) POI 搜索：「人民广场」「江南大道588号」这类
  const place = await amapJson('/v3/place/text', {
    keywords: query,
    offset: '6',
    page: '1',
    extensions: 'base',
  });
  if (place && Array.isArray(place.pois)) {
    for (const p of place.pois) {
      const loc = String(p.location || '');
      const [lngS, latS] = loc.split(',');
      const lat = Number(latS);
      const lng = Number(lngS);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
      out.push({ name: composeAmapAddress(p), lat, lng, type: 'poi' });
      if (out.length >= 6) break;
    }
  }

  // 2) 纯地址解析（POI 搜不到时）
  if (!out.length) {
    const geo = await amapJson('/v3/geocode/geo', { address: query });
    if (geo && Array.isArray(geo.geocodes)) {
      for (const g of geo.geocodes) {
        const loc = String(g.location || '');
        const [lngS, latS] = loc.split(',');
        const lat = Number(latS);
        const lng = Number(lngS);
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
        out.push({
          name: String(g.formatted_address || query).slice(0, 120),
          lat,
          lng,
          type: 'address',
        });
      }
    }
  }

  return out;
}

/** 高德静态地图 URL（服务端拼，Key 不外泄） */
export function amapStaticMapUrl({ lat, lng, zoom = 15, width = 690, height = 300 }) {
  if (!AMAP_KEY) return '';
  const size = `${Math.round(width)}*${Math.round(height)}`;
  const loc = `${Number(lng).toFixed(6)},${Number(lat).toFixed(6)}`;
  const qs = new URLSearchParams({
    location: loc,
    zoom: String(zoom),
    size,
    scale: '1', // 2 是高清但一张要 200KB，预览用 1 够了，加载快一半以上
    markers: `mid,,A:${loc}`,
    key: AMAP_KEY,
  });
  return `https://restapi.amap.com/v3/staticmap?${qs}`;
}

/** 拉静态地图图片字节 */
export async function fetchStaticMap(opts) {
  const url = amapStaticMapUrl(opts);
  if (!url) return null;

  /*
   * 磁盘缓存。
   * 高德静态地图一次 200KB、往返 3 秒；同一地点反复看（编辑信息、
   * 前后端来回切）没必要每次都去取。按 URL 做键缓存到 data/geo-cache/。
   */
  const key = crypto.createHash('sha1').update(url).digest('hex').slice(0, 20);
  const cached = path.join(MAP_CACHE_DIR, `${key}.png`);
  try {
    if (fs.existsSync(cached)) {
      const buf = fs.readFileSync(cached);
      if (buf.length > 2000) return { body: buf, contentType: 'image/png' };
    }
  } catch {
    /* 读缓存失败就当没有 */
  }

  try {
    const res = await httpsGet(url, { timeout: 15000 });
    if (res.status !== 200) return null;
    const type = String(res.headers['content-type'] || '');
    // 高德出错时也返回 200，但 body 是 JSON
    if (!/^image\//i.test(type)) return null;
    try {
      fs.mkdirSync(MAP_CACHE_DIR, { recursive: true });
      fs.writeFileSync(cached, res.body);
    } catch {
      /* 写缓存失败不影响返回 */
    }
    return { body: res.body, contentType: type };
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ */
/* OpenStreetMap 兜底                                                   */
/* ------------------------------------------------------------------ */

async function requestSearch(url) {
  const res = await httpsGet(url, { timeout: 15000 });
  if (res.status !== 200) return [];
  const arr = JSON.parse(res.body.toString('utf8'));
  if (!Array.isArray(arr)) return [];
  return arr
    .map((x) => ({
      name: String(x.display_name || '').replace(/,\s*/g, ' ').trim().slice(0, 120),
      lat: Number(x.lat),
      lng: Number(x.lon),
      type: String(x.type || ''),
    }))
    .filter((x) => Number.isFinite(x.lat) && Number.isFinite(x.lng));
}

/**
 * 生成由细到粗的降级查询。
 * 「杭州市滨江区江南大道588号」
 *   → 去掉门牌：「杭州市滨江区江南大道」
 *   → 只到街道：「杭州市滨江区」
 *   → 只到市：「杭州市」
 */
function buildFallbacks(q) {
  const out = [];
  const push = (v) => {
    const x = String(v || '').trim();
    if (x && x !== q && !out.includes(x)) out.push(x);
  };
  push(q.replace(/[0-9０-９]+\s*(号|弄|幢|栋|室|楼).*$/, ''));
  push(q.replace(/[^省市区县]{2,}(大道|路|街|道|巷|镇|乡).*$/, ''));
  const m = q.match(/^(.*?[市州盟])?(.*?[区县旗])/);
  if (m) push(`${m[1] || ''}${m[2] || ''}`);
  const m2 = q.match(/^(.*?[市州盟])/);
  if (m2) push(m2[1]);
  return out;
}

async function osmGeocode(query) {
  const base =
    'https://nominatim.openstreetmap.org/search?' +
    new URLSearchParams({
      q: query,
      format: 'json',
      limit: '5',
      addressdetails: '0',
      'accept-language': 'zh-CN',
    }).toString();
  try {
    return await requestSearch(base);
  } catch {
    return [];
  }
}

/* ------------------------------------------------------------------ */
/* 对外                                                                */
/* ------------------------------------------------------------------ */

/**
 * 地址 → 候选坐标列表
 * @returns {Promise<Array<{name:string, lat:number, lng:number, type:string, fallbackFrom?:string, source?:string}>>}
 */
export async function geocodeAddress(query) {
  const q = String(query || '').trim().slice(0, 120);
  if (!q) return [];

  const hit = cache.get(q);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.items;

  let items = [];

  // 先走高德
  if (amapEnabled()) {
    try {
      items = await amapGeocode(q);
    } catch {
      items = [];
    }
    if (items.length) items = items.map((x) => ({ ...x, source: 'amap' }));
  }

  // 高德不行就退 Nominatim（含由细到粗的降级）
  if (!items.length) {
    items = await osmGeocode(q);
    items = items.map((x) => ({ ...x, source: 'osm' }));
    if (!items.length) {
      for (const f of buildFallbacks(q)) {
        const got = await osmGeocode(f);
        if (got.length) {
          items = got.map((x) => ({ ...x, fallbackFrom: q, query: f, source: 'osm' }));
          break;
        }
      }
    }
  }

  cache.set(q, { at: Date.now(), items });
  if (cache.size > 500) {
    const keys = [...cache.keys()].slice(0, 200);
    for (const k of keys) cache.delete(k);
  }
  return items;
}

/** 经纬度 → 地址 */
export async function reverseGeocode(lat, lng) {
  const la = Number(lat);
  const ln = Number(lng);
  if (!Number.isFinite(la) || !Number.isFinite(ln)) return '';
  const key = `rev:${la.toFixed(4)},${ln.toFixed(4)}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.items;

  // 高德
  if (amapEnabled()) {
    const r = await amapJson('/v3/geocode/regeo', {
      location: `${ln.toFixed(6)},${la.toFixed(6)}`,
      extensions: 'base',
    });
    const addr = r && r.regeocode ? String(r.regeocode.formatted_address || '') : '';
    if (addr) {
      const name = addr.slice(0, 120);
      cache.set(key, { at: Date.now(), items: name });
      return name;
    }
  }

  // OSM 兜底
  const url =
    'https://nominatim.openstreetmap.org/reverse?' +
    new URLSearchParams({ lat: String(la), lon: String(ln), format: 'json', 'accept-language': 'zh-CN' });
  let name = '';
  try {
    const res = await httpsGet(url, { timeout: 15000 });
    if (res.status === 200) {
      const j = JSON.parse(res.body.toString('utf8'));
      name = String(j.display_name || '').replace(/,\s*/g, ' ').trim().slice(0, 120);
    }
  } catch {
    return '';
  }
  cache.set(key, { at: Date.now(), items: name });
  return name;
}

export default { geocodeAddress, reverseGeocode, amapEnabled, amapStaticMapUrl, fetchStaticMap };

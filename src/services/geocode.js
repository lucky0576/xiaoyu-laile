/**
 * 小鱼来了 — 地址地理编码
 *
 * 把用户手填的地址（「上海市黄浦区人民广场」）转成经纬度，
 * 用于发布信息时记录位置、详情页展示地图。
 *
 * 用 OpenStreetMap 的 Nominatim：
 *   · 免费、免 API Key（高德/百度都要企业 Key 和资质）
 *   · 中文支持可以（accept-language=zh-CN）
 *   · 使用条款要求：必须带可识别的 User-Agent，且每秒不超过 1 次
 *     → 这里做了 10 分钟进程内缓存，热词基本不会重复请求
 *
 * 注意：必须用 node:https + family:4。
 * 这台机器到境外站点的 IPv6 路由不通，全局 fetch 会 ETIMEDOUT。
 */

import https from 'node:https';
import http from 'node:http';

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
        { family: 4, timeout, headers: { 'User-Agent': UA, Accept: 'application/json' } },
        (res) => {
          const { statusCode, headers } = res;
          if (statusCode >= 300 && statusCode < 400 && headers.location && left > 0) {
            res.resume();
            go(new URL(headers.location, u).toString(), left - 1);
            return;
          }
          const chunks = [];
          res.on('data', (c) => chunks.push(c));
          res.on('end', () => resolve({ status: statusCode, body: Buffer.concat(chunks) }));
          res.on('error', reject);
        },
      );
      req.on('timeout', () => req.destroy(new Error('请求超时')));
      req.on('error', reject);
    };
    go(url, maxRedirects);
  });
}

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
  // 去掉门牌号（数字 + 号 / 弄 / 幢）
  push(q.replace(/[0-9０-９]+\s*(号|弄|幢|栋|室|楼).*$/, ''));
  // 去掉最后的「XX大道 / XX路 / XX街」之后的内容
  push(q.replace(/[^省市区县]{2,}(大道|路|街|道|巷|镇|乡).*$/, ''));
  // 只保留到 区/县
  const m = q.match(/^(.*?[市州盟])?(.*?[区县旗])/);
  if (m) push(`${m[1] || ''}${m[2] || ''}`);
  // 只保留到 市
  const m2 = q.match(/^(.*?[市州盟])/);
  if (m2) push(m2[1]);
  return out;
}

/**
 * 地址 → 候选坐标列表
 * @returns {Promise<Array<{name:string, lat:number, lng:number, type:string}>>}
 */
export async function geocodeAddress(query) {
  const q = String(query || '').trim().slice(0, 120);
  if (!q) return [];

  const hit = cache.get(q);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.items;

  const url =
    'https://nominatim.openstreetmap.org/search?' +
    new URLSearchParams({
      q,
      format: 'json',
      limit: '5',
      addressdetails: '0',
      'accept-language': 'zh-CN',
    });

  let items = [];
  try {
    items = await requestSearch(url);
  } catch (err) {
    console.error('[geocode] 失败:', err.message);
    return [];
  }

  /*
   * 降级重试。
   * OpenStreetMap 对中国的「门牌号」覆盖很差：
   * 「杭州市滨江区江南大道588号」经常 0 条，但「杭州市滨江区」有。
   * 所以查不到就把地址往粗了退一步再查，别让用户白填。
   */
  if (!items.length) {
    const fallbacks = buildFallbacks(q);
    for (const f of fallbacks) {
      try {
        const retryUrl =
          'https://nominatim.openstreetmap.org/search?' +
          new URLSearchParams({
            q: f,
            format: 'json',
            limit: '5',
            addressdetails: '0',
            'accept-language': 'zh-CN',
          });
        const got = await requestSearch(retryUrl);
        if (got.length) {
          // 标明是降级结果，前端提示用户确认
          items = got.map((x) => ({ ...x, fallbackFrom: q, query: f }));
          break;
        }
      } catch {
        /* 继续试下一个 */
      }
    }
  }

  cache.set(q, { at: Date.now(), items });
  // 简单的容量控制，避免常驻内存无限涨
  if (cache.size > 500) {
    const keys = [...cache.keys()].slice(0, 200);
    for (const k of keys) cache.delete(k);
  }
  return items;
}

/** 经纬度 → 地址（用户点「获取当前位置」后反查地址） */
export async function reverseGeocode(lat, lng) {
  const la = Number(lat);
  const ln = Number(lng);
  if (!Number.isFinite(la) || !Number.isFinite(ln)) return '';
  const key = `rev:${la.toFixed(4)},${ln.toFixed(4)}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.items;

  const url =
    'https://nominatim.openstreetmap.org/reverse?' +
    new URLSearchParams({
      lat: String(la),
      lon: String(ln),
      format: 'json',
      'accept-language': 'zh-CN',
    });

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

export default { geocodeAddress, reverseGeocode };

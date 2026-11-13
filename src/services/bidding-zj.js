/**
 * 浙江招投标采集（专题页数据源）
 *
 * 由 scripts/zj-bidding-collect.py 用 Playwright 抓取浙江 7 个区县/平台的最新公告，
 * 本服务负责：跑脚本 → 去重 → 落库 → 发布。
 *
 * 采集频率：每周两次（周一 / 周四 08:00 后），由 server.js 定时任务调用。
 */
import { spawn } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import db from '../store/db.js';
import listingsSvc from './listings.js';

const ROOT = path.resolve(process.cwd());
const SCRIPT = path.join(ROOT, 'scripts', 'zj-bidding-collect.py');
const STATE_ID = 'bidding_zj_state';
const OUT = path.join('/tmp', 'zj-bidding-items.json');

function adminUser() {
  return db.collection('users').findOne((u) => u.isAdmin && u.status !== 'banned');
}

function runPython(limit) {
  return new Promise((resolve, reject) => {
    const p = spawn('python3', [SCRIPT, '--limit', String(limit), '--out', OUT], {
      cwd: ROOT,
      timeout: 300000,
    });
    let err = '';
    p.stderr.on('data', (d) => (err += String(d)));
    p.on('error', reject);
    p.on('close', (code) => (code === 0 ? resolve() : reject(new Error(err.slice(-800) || `python exit ${code}`))));
  });
}

export function lastRun() {
  return db.collection('settings').get(STATE_ID) || null;
}

export async function collect({ limit = 8, dryRun = false } = {}) {
  if (!fs.existsSync(SCRIPT)) throw new Error('采集脚本不存在');
  await runPython(limit);
  const raw = JSON.parse(fs.readFileSync(OUT, 'utf8'));
  const items = Array.isArray(raw.items) ? raw.items : [];
  const report = {
    generatedAt: raw.generatedAt,
    sources: raw.sources || [],
    scanned: items.length,
    created: 0,
    skipped: 0,
    failed: 0,
    items: [],
    errors: [],
  };
  if (dryRun) return { ...report, dryRun: true, preview: items.slice(0, 20) };

  const admin = adminUser();
  if (!admin) throw new Error('没有可用管理员账号，无法落库');
  const col = db.collection('listings');

  for (const it of items) {
    try {
      const dup = col.findOne(
        (l) =>
          !l.deletedAt &&
          l.category === 'bidding' &&
          (l.link === it.link || String(l.title || '').trim() === String(it.title || '').trim()),
      );
      if (dup) {
        report.skipped += 1;
        continue;
      }
      const created = await listingsSvc.createListing({
        user: admin,
        body: {
          category: 'bidding',
          type: 'tender',
          title: String(it.title || '').slice(0, 118),
          subtitle: `来源：${it.sourceName || ''} · ${it.region || '浙江'}`,
          text: String(it.text || it.summary || '').slice(0, 60000),
          link: it.link || '',
          sourceName: it.sourceName || '',
          cities: it.region ? [it.region] : [],
          tenderNo: it.tenderNo || '',
          tenderer: it.tenderer || '',
          budget: it.budget || '',
          bidDeadline: it.bidDeadline || '',
          projectType: it.projectType || '其他',
          region: it.region || '浙江省',
          sourceSite: it.sourceName || '',
          publishAt: it.publishAt || '',
          industryTags: it.tags || [],
          origin: 'collect',
          durationDays: 30,
          publish: '1',
        },
      });
      const newId = created?.id || created?.listing?.id;
      if (newId && typeof listingsSvc.publishListing === 'function') {
        await listingsSvc.publishListing(newId, admin, { days: 30 });
      }
      report.created += 1;
      report.items.push({ id: newId, title: it.title, link: it.link });
    } catch (err) {
      report.failed += 1;
      report.errors.push(`${String(it.title || '').slice(0, 20)}：${err.message}`);
    }
  }

  // 新入库的公告 → 后台逐条生成新闻播报短视频（8 秒、男声），不阻塞采集响应
  const newIds = report.items.map((x) => x.id).filter(Boolean);
  if (newIds.length) {
    generateNewsVideos(newIds, admin).catch((err) => console.warn('[bidding-zj] 短视频批量生成失败:', err.message));
  }

  const state = {
    id: STATE_ID,
    at: new Date().toISOString(),
    report: {
      generatedAt: report.generatedAt,
      scanned: report.scanned,
      created: report.created,
      skipped: report.skipped,
      failed: report.failed,
      sources: report.sources,
    },
  };
  const settings = db.collection('settings');
  if (settings.get(STATE_ID)) settings.update(STATE_ID, state);
  else settings.insert(state);
  return report;
}

/**
 * 为采集入库的招投标公告自动生成「新闻播报」短视频。
 * 逐条串行，避免同时跑多个 ffmpeg/TTS 把服务器压满。
 */
async function generateNewsVideos(ids, admin) {
  let ms;
  try {
    ms = await import('./make-short.js');
  } catch (err) {
    console.warn('[bidding-zj] 短视频模块不可用:', err.message);
    return;
  }
  let ok = 0;
  for (const id of ids) {
    try {
      const listing = listingsSvc.getListing(id);
      if (!listing || listing.category !== 'bidding') continue;
      const r = await ms.makeShortForListing({
        listing,
        user: admin,
        baseUrl: 'https://xiaoyulaile.online',
        seconds: 8,
        voice: true,
        voiceGender: 'male',
      });
      if (r && r.feed) ok += 1;
      console.log(`[bidding-zj] 新闻短视频 ${id} -> ${r && r.duration ? r.duration + 's' : 'ok'}`);
    } catch (err) {
      console.warn(`[bidding-zj] 短视频失败 ${id}:`, err.message);
    }
  }
  console.log(`[bidding-zj] 短视频完成 ${ok}/${ids.length}`);
}

/** 周一、周四 08:00（北京时间）之后跑；同一天只跑一次 */
export function isDue(now = new Date()) {
  const bj = new Date(now.getTime() + 8 * 3600_000);
  const day = bj.getUTCDay(); // 0 Sun ... 4 Thu
  const hour = bj.getUTCHours();
  const dateKey = bj.toISOString().slice(0, 10);
  if (![1, 4].includes(day) || hour < 8) return false;
  const st = lastRun();
  const lastKey = st && st.at ? new Date(new Date(st.at).getTime() + 8 * 3600_000).toISOString().slice(0, 10) : '';
  return lastKey !== dateKey;
}

export default { collect, isDue, lastRun };

/**
 * 短剧（外接内容上传模式）
 *
 * 平台不生产短剧：版权方/运营上传剧集文件，平台负责
 *   上架 → 审核 → 频道播放 → 自动切片投放到短视频流 → 导流真实项目
 *
 * 数据集合：
 *   dramas.json          一部剧
 *   dramaEpisodes.json   一集
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import db, { newId } from '../store/db.js';
import { httpError } from '../http/app.js';
import { registerStoredFile } from './files.js';
import feedsSvc from './feeds.js';

const execFileAsync = promisify(execFile);

const dramas = () => db.collection('dramas');
const episodes = () => db.collection('dramaEpisodes');

export const DRAMA_CATEGORIES = [
  { id: 'business', name: '商战' },
  { id: 'startup', name: '创业' },
  { id: 'urban', name: '都市' },
  { id: 'counter', name: '逆袭' },
  { id: 'suspense', name: '悬疑' },
  { id: 'industry', name: '产业' },
];

const CAT_NAME = Object.fromEntries(DRAMA_CATEGORIES.map((c) => [c.id, c.name]));

async function probeDuration(filePath) {
  try {
    const { stdout } = await execFileAsync(
      'ffprobe',
      ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', filePath],
      { timeout: 15000 },
    );
    return Number(String(stdout).trim()) || 0;
  } catch {
    return 0;
  }
}

async function probeSize(filePath) {
  try {
    const { stdout } = await execFileAsync(
      'ffprobe',
      ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', filePath],
      { timeout: 15000 },
    );
    const [w, h] = String(stdout).trim().split(',').map((x) => Number(x) || 0);
    return { width: w, height: h };
  } catch {
    return { width: 0, height: 0 };
  }
}

/** 对外公开字段 */
export function dramaPublic(d) {
  if (!d) return null;
  return {
    id: d.id,
    title: d.title,
    subtitle: d.subtitle || '',
    category: d.category,
    categoryName: CAT_NAME[d.category] || '',
    intro: d.intro || '',
    coverUrl: d.coverUrl || '',
    provider: d.provider || '',
    totalEpisodes: d.totalEpisodes || 0,
    freeEpisodes: d.freeEpisodes || 1,
    status: d.status,
    featured: Boolean(d.featured),
    views: d.views || 0,
    follows: d.followCount || 0,
    createdAt: d.createdAt,
    publishedAt: d.publishedAt || '',
  };
}

export function episodePublic(e) {
  if (!e) return null;
  return {
    id: e.id,
    dramaId: e.dramaId,
    episodeNo: e.episodeNo,
    title: e.title || `第 ${e.episodeNo} 集`,
    videoUrl: e.videoUrl || '',
    durationSec: e.durationSec || 0,
    free: Boolean(e.free),
    views: e.views || 0,
  };
}

/** 首页/频道列表（只返回已上架） */
export function listDramas({ category = '', q = '', page = 1, size = 12, featured } = {}) {
  const all = dramas()
    .all()
    .filter((d) => d.status === 'published')
    .filter((d) => (category ? d.category === category : true))
    .filter((d) => (featured ? Boolean(d.featured) : true))
    .filter((d) => {
      if (!q) return true;
      const s = `${d.title || ''} ${d.subtitle || ''} ${d.intro || ''}`.toLowerCase();
      return s.includes(String(q).toLowerCase());
    })
    .sort((a, b) => (b.publishedAt || '').localeCompare(a.publishedAt || ''));
  const total = all.length;
  const start = (Math.max(1, page) - 1) * size;
  return { total, items: all.slice(start, start + size).map(dramaPublic) };
}

/** 详情：剧 + 集列表 */
export function getDrama(id) {
  const d = dramas().get(id);
  if (!d) return null;
  const eps = episodes()
    .all()
    .filter((e) => e.dramaId === id && e.status !== 'deleted')
    .sort((a, b) => (a.episodeNo || 0) - (b.episodeNo || 0))
    .map(episodePublic);
  return { drama: dramaPublic(d), episodes: eps, licenseNote: d.licenseNote || '', provider: d.provider || '' };
}

/** 管理端列表（全部状态） */
export function adminListDramas({ status = '', page = 1, size = 20 } = {}) {
  const all = dramas()
    .all()
    .filter((d) => (status ? d.status === status : d.status !== 'deleted'))
    .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
  const start = (Math.max(1, page) - 1) * size;
  return { total: all.length, items: all.slice(start, start + size) };
}

export function createDrama({ user, body = {} }) {
  const title = String(body.title || '').trim();
  if (title.length < 2) throw httpError(400, '请填写剧名（至少 2 个字）');
  const now = new Date().toISOString();
  const row = dramas().insert({
    id: newId('dr'),
    title: title.slice(0, 60),
    subtitle: String(body.subtitle || '').trim().slice(0, 80),
    category: DRAMA_CATEGORIES.some((c) => c.id === body.category) ? body.category : 'business',
    intro: String(body.intro || '').trim().slice(0, 2000),
    coverUrl: '',
    provider: String(body.provider || '').trim().slice(0, 80),
    licenseNote: String(body.licenseNote || '').trim().slice(0, 300),
    totalEpisodes: Number(body.totalEpisodes) || 0,
    freeEpisodes: Math.max(1, Number(body.freeEpisodes) || 1),
    status: 'draft',
    featured: false,
    views: 0,
    followCount: 0,
    createdBy: user?.id || '',
    createdAt: now,
    updatedAt: now,
    publishedAt: '',
  });
  return row;
}

export function updateDrama(id, { user, body = {} }) {
  const d = dramas().get(id);
  if (!d) throw httpError(404, '短剧不存在');
  const patch = {};
  if (body.title !== undefined) patch.title = String(body.title).trim().slice(0, 60);
  if (body.subtitle !== undefined) patch.subtitle = String(body.subtitle).trim().slice(0, 80);
  if (body.category !== undefined && DRAMA_CATEGORIES.some((c) => c.id === body.category)) patch.category = body.category;
  if (body.intro !== undefined) patch.intro = String(body.intro).trim().slice(0, 2000);
  if (body.provider !== undefined) patch.provider = String(body.provider).trim().slice(0, 80);
  if (body.licenseNote !== undefined) patch.licenseNote = String(body.licenseNote).trim().slice(0, 300);
  if (body.freeEpisodes !== undefined) patch.freeEpisodes = Math.max(1, Number(body.freeEpisodes) || 1);
  if (body.featured !== undefined) patch.featured = Boolean(body.featured);
  patch.updatedAt = new Date().toISOString();
  return dramas().update(id, patch);
}

/** 添加一集 */
export async function addEpisode({ dramaId, fileId, episodeNo, title, free }) {
  const d = dramas().get(dramaId);
  if (!d) throw httpError(404, '短剧不存在');
  const rec = db.collection('files').get(fileId);
  if (!rec || rec.kind !== 'video') throw httpError(400, '请上传视频文件（MP4 / MOV / WebM）');
  const duration = Math.round(await probeDuration(rec.path));
  const epNo = Math.max(1, Number(episodeNo) || episodes().all().filter((e) => e.dramaId === dramaId).length + 1);
  const exist = episodes().findOne((e) => e.dramaId === dramaId && e.episodeNo === epNo);
  if (exist) throw httpError(409, `第 ${epNo} 集已存在`);
  const row = episodes().insert({
    id: newId('de'),
    dramaId,
    episodeNo: epNo,
    title: String(title || `第 ${epNo} 集`).slice(0, 80),
    fileId,
    videoUrl: rec.url,
    durationSec: duration,
    coverUrl: '',
    free: free !== undefined ? Boolean(free) : epNo <= (d.freeEpisodes || 1),
    views: 0,
    status: 'published',
    clips: [],
    createdAt: new Date().toISOString(),
  });
  const total = episodes().all().filter((e) => e.dramaId === dramaId).length;
  dramas().update(dramaId, { totalEpisodes: total, coverUrl: d.coverUrl || rec.coverUrl || '' });
  // 没有封面 → 从这一集截一帧
  if (!d.coverUrl) {
    try {
      const cover = await extractCover(rec, dramaId);
      if (cover) dramas().update(dramaId, { coverUrl: cover.url });
    } catch {
      /* ignore */
    }
  }
  return row;
}

/** 从视频截一帧当封面 */
async function extractCover(videoRec, dramaId) {
  const out = path.join(os.tmpdir(), `drama-cover-${Date.now()}.png`);
  try {
    await execFileAsync(
      'ffmpeg',
      ['-y', '-loglevel', 'error', '-ss', '1', '-i', videoRec.path, '-frames:v', '1', '-vf', 'scale=720:-2', out, '-nostdin'],
      { timeout: 30000 },
    );
    if (!fs.existsSync(out) || !fs.statSync(out).size) return null;
    const rec = await registerStoredFile({
      srcPath: out,
      name: `短剧封面-${dramaId}.png`,
      mime: 'image/png',
      opts: { extract: false, role: 'drama-cover' },
    });
    return rec || null;
  } catch {
    return null;
  } finally {
    try {
      fs.unlinkSync(out);
    } catch {
      /* ignore */
    }
  }
}

/** 审核：通过 / 驳回 */
export function reviewDrama(id, { action, reason = '', admin }) {
  const d = dramas().get(id);
  if (!d) throw httpError(404, '短剧不存在');
  const now = new Date().toISOString();
  if (action === 'approve') {
    const eps = episodes().all().filter((e) => e.dramaId === id).length;
    if (!eps) throw httpError(400, '还没有上传任何剧集，不能上架');
    const updated = dramas().update(id, {
      status: 'published',
      publishedAt: now,
      reviewedBy: admin?.id || '',
      rejectReason: '',
    });
    return updated;
  }
  if (action === 'reject') {
    return dramas().update(id, { status: 'rejected', rejectReason: String(reason || '').slice(0, 200), reviewedBy: admin?.id || '' });
  }
  throw httpError(400, '未知的审核动作');
}

export function offlineDrama(id) {
  const d = dramas().get(id);
  if (!d) throw httpError(404, '短剧不存在');
  return dramas().update(id, { status: 'offline' });
}

export function deleteDrama(id) {
  const d = dramas().get(id);
  if (!d) throw httpError(404, '短剧不存在');
  for (const e of episodes().all().filter((x) => x.dramaId === id)) {
    episodes().update(e.id, { status: 'deleted' });
  }
  dramas().update(id, { status: 'deleted' });
  return true;
}

/**
 * 自动切片：每集切 2 个 15 秒高光片段，投放到短视频流
 * 切片是普通 feed（type=short），带 dramaId / episodeId，用户刷到可点进剧集
 */
export async function generateSlices({ dramaId, admin }) {
  const d = dramas().get(dramaId);
  if (!d) throw httpError(404, '短剧不存在');
  const eps = episodes()
    .all()
    .filter((e) => e.dramaId === dramaId && e.status !== 'deleted')
    .sort((a, b) => a.episodeNo - b.episodeNo);
  if (!eps.length) throw httpError(400, '没有可切片的剧集');

  let made = 0;
  const results = [];
  for (const ep of eps) {
    if ((ep.clips || []).length) continue;
    const rec = db.collection('files').get(ep.fileId);
    if (!rec || !rec.path || !fs.existsSync(rec.path)) continue;
    const duration = ep.durationSec || (await probeDuration(rec.path)) || 0;
    if (duration < 20) continue;
    const size = await probeSize(rec.path);
    const targets = [
      Math.max(2, Math.round(duration * 0.18)),
      Math.max(2, Math.round(duration * 0.62)),
    ];
    const clipIds = [];
    for (let i = 0; i < targets.length; i += 1) {
      const start = targets[i];
      const len = Math.min(15, Math.max(8, duration - start - 1));
      if (len < 8) continue;
      const out = path.join(os.tmpdir(), `drama-clip-${Date.now()}-${i}.mp4`);
      try {
        await execFileAsync(
          'ffmpeg',
          [
            '-y',
            '-loglevel',
            'error',
            '-ss',
            String(start),
            '-i',
            rec.path,
            '-t',
            String(len),
            '-vf',
            'scale=720:1280:force_original_aspect_ratio=increase,crop=720:1280',
            '-c:v',
            'libx264',
            '-crf',
            '28',
            '-preset',
            'veryfast',
            '-pix_fmt',
            'yuv420p',
            '-c:a',
            'aac',
            '-b:a',
            '96k',
            '-movflags',
            '+faststart',
            '-f',
            'mp4',
            out,
            '-nostdin',
          ],
          { timeout: 180000 },
        );
        if (!fs.existsSync(out) || !fs.statSync(out).size) continue;
        const rec2 = await registerStoredFile({
          srcPath: out,
          name: `短剧切片-${d.title}-${ep.episodeNo}-${i + 1}.mp4`,
          mime: 'video/mp4',
          opts: { extract: false, role: 'drama-clip' },
        });
        if (!rec2) continue;
        const feed = await feedsSvc.createFeed({
          user: admin || { id: 'sys', nickname: '小鱼来了' },
          body: {
            type: 'short',
            title: `${d.title} · 第 ${ep.episodeNo} 集 高光`,
            subtitle: d.subtitle || '',
            description: d.intro || '',
            fileId: rec2.id,
            coverFileId: '',
          },
          files: [rec2],
        });
        db.collection('feeds').update(feed.id, {
          dramaId,
          episodeId: ep.id,
          tags: ['短剧', '短剧切片'],
          autoMade: false,
          clip: { startSec: start, endSec: start + len },
        });
        clipIds.push(feed.id);
        made += 1;
        results.push({ episodeId: ep.id, feedId: feed.id, start, len });
      } catch {
        /* 单个切片失败不影响其它 */
      } finally {
        try {
          fs.unlinkSync(out);
        } catch {
          /* ignore */
        }
      }
    }
    if (clipIds.length) episodes().update(ep.id, { clips: clipIds });
  }
  dramas().update(dramaId, { slicesGeneratedAt: new Date().toISOString() });
  return { made, results };
}

/**
 * 一次上传，同时发布「短视频 + 短剧」
 *
 * 场景：用户在发布页上传 1~3 条视频，勾选「同时发布为短剧」，
 * 除了生成短视频 feed 之外，还把这批视频作为一部短剧的剧集上架。
 *
 * @param {object} p
 * @param {object} p.admin 管理员
 * @param {string} p.title 剧名
 * @param {string} [p.category]
 * @param {string} [p.intro]
 * @param {string} [p.provider]
 * @param {string} [p.licenseNote]
 * @param {number} [p.freeEpisodes]
 * @param {string[]} p.fileIds 视频文件 id（按集数顺序）
 * @param {boolean} [p.slices] 是否同时生成切片投放短视频流（默认 true）
 */
export async function createFromVideos({
  admin,
  title,
  category = 'business',
  intro = '',
  provider = '',
  licenseNote = '',
  freeEpisodes = 1,
  fileIds = [],
  slices = true,
} = {}) {
  const ids = (Array.isArray(fileIds) ? fileIds : []).filter((x) => typeof x === 'string' && x);
  if (!ids.length) throw httpError(400, '请先上传视频文件');
  const files = db.collection('files');
  for (const id of ids) {
    const rec = files.get(id);
    if (!rec || rec.kind !== 'video') throw httpError(400, '上传的文件必须是视频');
  }
  const drama = createDrama({
    user: admin,
    body: {
      title: String(title || '').trim() || '未命名短剧',
      category,
      intro,
      provider,
      licenseNote,
      freeEpisodes,
      totalEpisodes: ids.length,
    },
  });
  let made = 0;
  for (let i = 0; i < ids.length; i += 1) {
    try {
      await addEpisode({
        dramaId: drama.id,
        fileId: ids[i],
        episodeNo: i + 1,
        title: `${String(title || '短剧').slice(0, 40)} · 第 ${i + 1} 集`,
        free: i + 1 <= Number(freeEpisodes || 1),
      });
      made += 1;
    } catch {
      /* 单集失败继续 */
    }
  }
  if (!made) throw httpError(500, '剧集全部添加失败');
  const published = reviewDrama(drama.id, { action: 'approve', admin });
  let sliceInfo = { made: 0 };
  if (slices) {
    try {
      sliceInfo = await generateSlices({ dramaId: drama.id, admin });
    } catch {
      sliceInfo = { made: 0 };
    }
  }
  return { drama: dramaPublic(dramas().get(drama.id) || published), episodes: made, slices: sliceInfo.made };
}

/** 最新短剧集（用于短视频流穿插播放） */
export function listLatestEpisodes({ limit = 20 } = {}) {
  const pub = dramas()
    .all()
    .filter((d) => d.status === 'published')
    .sort((a, b) => String(b.publishedAt || '').localeCompare(String(a.publishedAt || '')));
  const out = [];
  for (const d of pub) {
    const eps = episodes()
      .all()
      .filter((e) => e.dramaId === d.id && e.status !== 'deleted')
      .sort((a, b) => (a.episodeNo || 0) - (b.episodeNo || 0));
    for (const e of eps) {
      out.push({
        ...episodePublic(e),
        dramaTitle: d.title,
        dramaSubtitle: d.subtitle || '',
        coverUrl: e.coverUrl || d.coverUrl || '',
        intro: d.intro || '',
        totalEpisodes: d.totalEpisodes || eps.length,
        categoryName: CAT_NAME[d.category] || '',
      });
    }
    if (out.length >= limit * 2) break;
  }
  return { total: out.length, items: out.slice(0, limit) };
}

export default {
  DRAMA_CATEGORIES,
  createFromVideos,
  listLatestEpisodes,
  dramaPublic,
  episodePublic,
  listDramas,
  getDrama,
  adminListDramas,
  createDrama,
  updateDrama,
  addEpisode,
  reviewDrama,
  offlineDrama,
  deleteDrama,
  generateSlices,
};

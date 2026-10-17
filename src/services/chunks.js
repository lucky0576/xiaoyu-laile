/**
 * 分片上传
 *
 * 为什么需要：Cloudflare 隧道对单个请求有 **100 秒** 的等待上限，超时返回 524。
 * 一份 12MB 的资料在 1Mbps 上行下正好约 100 秒 —— 用户看到的就是
 * 「进度 100%，上传失败（524）」。
 *
 * 解法：把大文件切成 2MB 的小块逐个上传，每块远低于 100 秒，
 * 全部到齐后再合并成一个文件走正常的登记/解析流程。
 *
 * 分片暂存在 DATA_DIR/tmp/chunks/<uploadId>/，合并成功后清理；
 * 长期未完成的残片由 sweepStale() 定期清扫。
 */
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

import { TMP_DIR, config } from '../config.js';
import { httpError } from '../http/app.js';
import { registerStoredFile, kindOf, extOf, ALLOWED } from './files.js';

/** 单块 2MB：即使在 1Mbps 上行下也只要约 16 秒，安全 */
export const CHUNK_SIZE = 2 * 1024 * 1024;
/** 超过这个大小才走分片；小块没必要多几次往返 */
export const CHUNK_THRESHOLD = 4 * 1024 * 1024;
/** 分片会话有效期：2 小时内没传完就作废 */
export const SESSION_TTL_MS = 2 * 3600_000;
/** 单文件上限沿用全局设置 */
const MAX_BYTES = config.maxUploadBytes;

const CHUNK_ROOT = path.join(TMP_DIR, 'chunks');

function sessionDir(id) {
  return path.join(CHUNK_ROOT, id);
}

function metaPath(id) {
  return path.join(sessionDir(id), 'meta.json');
}

async function readMeta(id) {
  try {
    const raw = await fsp.readFile(metaPath(id), 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function writeMeta(id, meta) {
  await fsp.mkdir(sessionDir(id), { recursive: true });
  await fsp.writeFile(metaPath(id), JSON.stringify(meta), 'utf8');
}

function validId(id) {
  return /^[a-z0-9]{8,40}$/i.test(String(id || ''));
}

/* ------------------------------------------------------------------ */
/* 会话                                                                */
/* ------------------------------------------------------------------ */

/**
 * 开始一次分片上传。
 * @returns {{uploadId, chunkSize, threshold, maxBytes, expiresAt}}
 */
export function initUpload({ name, size, mime, ownerId } = {}) {
  const safeName = String(name || '').trim();
  if (!safeName) throw httpError(400, '缺少文件名');
  const total = Number(size);
  if (!Number.isFinite(total) || total <= 0) throw httpError(400, '缺少文件大小');
  if (total > MAX_BYTES) {
    throw httpError(413, `文件超过大小限制（${Math.round(MAX_BYTES / 1048576)}MB）`, 'payload_too_large');
  }
  // 提前拒绝不支持的类型，免得传完 12MB 才失败
  const ext = extOf(safeName);
  if (!ALLOWED.has(ext)) throw httpError(415, `不支持的文件类型：${ext || '未知'}`);

  const uploadId = crypto.randomBytes(12).toString('hex');
  const now = Date.now();
  const meta = {
    id: uploadId,
    name: safeName,
    size: total,
    mime: String(mime || 'application/octet-stream'),
    ownerId: String(ownerId || ''),
    received: 0,
    createdAt: new Date(now).toISOString(),
    expiresAt: new Date(now + SESSION_TTL_MS).toISOString(),
  };
  fs.mkdirSync(sessionDir(uploadId), { recursive: true });
  fs.writeFileSync(metaPath(uploadId), JSON.stringify(meta), 'utf8');

  return {
    uploadId,
    chunkSize: CHUNK_SIZE,
    threshold: CHUNK_THRESHOLD,
    maxBytes: MAX_BYTES,
    size: total,
    expiresAt: meta.expiresAt,
  };
}

/** 汇总已落盘分片的总字节数（用于重传场景下准确计算进度） */
async function sumPartSizes(uploadId) {
  let total = 0;
  let names = [];
  try {
    names = await fsp.readdir(sessionDir(uploadId));
  } catch {
    return 0;
  }
  for (const n of names) {
    if (!n.endsWith('.part')) continue;
    try {
      total += (await fsp.stat(path.join(sessionDir(uploadId), n))).size;
    } catch {
      /* ignore */
    }
  }
  return total;
}

/** 写入一块。可重复上传同一 index（覆盖），用于失败重试。 */
export async function appendChunk(uploadId, index, buffer) {
  if (!validId(uploadId)) throw httpError(400, '上传会话无效');
  const meta = await readMeta(uploadId);
  if (!meta) throw httpError(404, '上传会话不存在或已过期');
  if (Date.parse(meta.expiresAt) < Date.now()) {
    await abortUpload(uploadId);
    throw httpError(410, '上传会话已过期，请重新上传');
  }

  const idx = Number(index);
  const totalChunks = Math.max(1, Math.ceil(meta.size / CHUNK_SIZE));
  if (!Number.isInteger(idx) || idx < 0 || idx >= totalChunks) {
    throw httpError(400, `分片序号超出范围（0..${totalChunks - 1}）`);
  }
  if (!buffer || !buffer.length) throw httpError(400, '分片内容为空');
  if (buffer.length > CHUNK_SIZE + 1024) throw httpError(413, '分片过大');
  if (meta.size > MAX_BYTES) throw httpError(413, '文件超过大小限制', 'payload_too_large');

  await fsp.writeFile(path.join(sessionDir(uploadId), `${idx}.part`), buffer);

  // received 一律从磁盘重算：同一块重传时不会重复累加，进度始终真实
  const received = await sumPartSizes(uploadId);
  const next = { ...meta, received, receivedAt: new Date().toISOString() };
  await writeMeta(uploadId, next);

  return {
    index: idx,
    received,
    size: meta.size,
    percent: Math.min(100, Math.round((received / meta.size) * 100)),
  };
}

/**
 * 合并全部分片并登记为正式文件。
 * @returns 文件记录（含解析出的文本）
 */
export async function completeUpload(uploadId, opts = {}) {
  if (!validId(uploadId)) throw httpError(400, '上传会话无效');
  const meta = await readMeta(uploadId);
  if (!meta) throw httpError(404, '上传会话不存在或已过期');

  const totalChunks = Math.max(1, Math.ceil(meta.size / CHUNK_SIZE));
  const dir = sessionDir(uploadId);
  const missing = [];
  for (let i = 0; i < totalChunks; i++) {
    if (!fs.existsSync(path.join(dir, `${i}.part`))) missing.push(i);
  }
  if (missing.length) {
    throw httpError(400, `还有 ${missing.length} 个分片未上传（例如第 ${missing[0]} 块）`, 'chunks_missing');
  }

  // 顺序拼接
  const merged = path.join(dir, 'merged.bin');
  const out = fs.createWriteStream(merged);
  try {
    for (let i = 0; i < totalChunks; i++) {
      const partPath = path.join(dir, `${i}.part`);
      await new Promise((resolve, reject) => {
        const rs = fs.createReadStream(partPath);
        rs.on('error', reject);
        rs.on('end', resolve);
        rs.pipe(out, { end: false });
      });
    }
  } finally {
    await new Promise((resolve) => out.end(resolve));
  }

  const stat = await fsp.stat(merged);
  if (stat.size !== meta.size) {
    await abortUpload(uploadId);
    throw httpError(400, `合并后大小不符（期望 ${meta.size}，实际 ${stat.size}），请重新上传`);
  }

  const record = await registerStoredFile({
    srcPath: merged,
    name: meta.name,
    mime: meta.mime,
    opts: { ownerId: opts.ownerId || meta.ownerId, role: opts.role || 'attachment', listingId: opts.listingId || '' },
  });

  // 合并文件已被移走，清掉残留分片
  await abortUpload(uploadId);
  return record;
}

export async function abortUpload(uploadId) {
  if (!validId(uploadId)) return false;
  try {
    await fsp.rm(sessionDir(uploadId), { recursive: true, force: true });
    return true;
  } catch {
    return false;
  }
}

/** 清理超时未完成的会话（由定时任务调用） */
export async function sweepStale(maxAgeMs = SESSION_TTL_MS) {
  let removed = 0;
  let dirs = [];
  try {
    dirs = await fsp.readdir(CHUNK_ROOT, { withFileTypes: true });
  } catch {
    return 0;
  }
  for (const d of dirs) {
    if (!d.isDirectory()) continue;
    const meta = await readMeta(d.name);
    const age = meta ? Date.now() - Date.parse(meta.expiresAt) : maxAgeMs;
    if (age > 0) {
      await abortUpload(d.name);
      removed++;
    }
  }
  return removed;
}

/** 会话状态（前端可据此判断是否需要续传） */
export async function uploadStatus(uploadId) {
  if (!validId(uploadId)) throw httpError(400, '上传会话无效');
  const meta = await readMeta(uploadId);
  if (!meta) throw httpError(404, '上传会话不存在或已过期');
  const totalChunks = Math.max(1, Math.ceil(meta.size / CHUNK_SIZE));
  const have = [];
  for (let i = 0; i < totalChunks; i++) {
    if (fs.existsSync(path.join(sessionDir(uploadId), `${i}.part`))) have.push(i);
  }
  return {
    uploadId,
    name: meta.name,
    size: meta.size,
    chunkSize: CHUNK_SIZE,
    totalChunks,
    receivedChunks: have,
    received: meta.received,
    percent: Math.min(100, Math.round((meta.received / meta.size) * 100)),
    expiresAt: meta.expiresAt,
  };
}

export default {
  CHUNK_SIZE,
  CHUNK_THRESHOLD,
  initUpload,
  appendChunk,
  completeUpload,
  abortUpload,
  sweepStale,
  uploadStatus,
};

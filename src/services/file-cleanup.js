/**
 * 清理「没人引用的上传文件」
 *
 * 为什么需要：
 *   发布页可以先传文件再放弃，名片识别、封面选择也会产生临时文件。
 *   这些文件记录留在 files 集合、实体留在 uploads 目录，
 *   但没有任何信息/短视频/头像引用它们 —— 越积越多，纯占磁盘。
 *
 * 判定规则（保守，宁可少删）：
 *   1. 文件记录超过 24 小时没人引用 → 删磁盘 + 删记录
 *   2. 磁盘上存在的文件（按 id）超过 24 小时没有对应记录 → 删磁盘
 *   3. 引用来源：所有集合里出现的 `f_xxx` 字符串（含嵌套对象/数组）
 *
 * 不做：
 *   · 不删 24 小时内的文件（用户可能还开着发布页没提交）
 *   · 不删任何被引用到的文件（哪怕只是草稿引用）
 */

import fs from 'node:fs';
import path from 'node:path';
import db from '../store/db.js';
import { UPLOAD_DIR, DATA_DIR } from '../config.js';

const FILE_ID_RE = /f_[a-z0-9]{6,}/gi;

/**
 * 枚举所有集合名。
 *
 * 不能只靠 db.stats()/db.collections() —— 它们返回的是「已经加载进内存」的集合，
 * 新进程里刚启动时是空的，会导致「引用 0 个」然后误删全部文件。
 * 所以直接看 data/collections 目录。
 */
function allCollectionNames() {
  const dir = path.join(DATA_DIR, 'collections');
  try {
    return fs
      .readdirSync(dir)
      .filter((n) => n.endsWith('.json'))
      .map((n) => n.slice(0, -5));
  } catch {
    return Object.keys(db.stats() || {});
  }
}

/** 从任意值里递归收集文件 id */
function collectIds(value, out) {
  if (value == null) return;
  if (typeof value === 'string') {
    const m = value.match(FILE_ID_RE);
    if (m) for (const id of m) out.add(id);
    return;
  }
  if (Array.isArray(value)) {
    for (const v of value) collectIds(v, out);
    return;
  }
  if (typeof value === 'object') {
    for (const v of Object.values(value)) collectIds(v, out);
  }
}

/** 扫描所有集合，返回被引用的 file id 集合 */
export function referencedFileIds() {
  const out = new Set();
  const names = allCollectionNames();
  for (const name of names) {
    if (name === 'files') continue; // files 自己不算引用
    let rows = [];
    try {
      rows = db.collection(name).all();
    } catch {
      continue;
    }
    for (const row of rows) collectIds(row, out);
  }
  return out;
}

/** 找出某个 id 在磁盘上的实体路径（支持平铺 / 年月 / 目录三种） */
function locate(id) {
  const hits = [];
  const push = (p) => {
    try {
      if (fs.existsSync(p) && fs.statSync(p).isFile()) hits.push(p);
    } catch {
      /* ignore */
    }
  };
  // 平铺
  try {
    for (const name of fs.readdirSync(UPLOAD_DIR)) {
      if (name.startsWith(id + '.')) push(path.join(UPLOAD_DIR, name));
    }
  } catch {
    return hits;
  }
  // 目录形式 uploads/<id>/...
  try {
    const dir = path.join(UPLOAD_DIR, id);
    if (fs.existsSync(dir) && fs.statSync(dir).isDirectory()) {
      for (const name of fs.readdirSync(dir)) push(path.join(dir, name));
    }
  } catch {
    /* ignore */
  }
  // 年月结构 uploads/<年>/<月>/<id>.<ext>
  try {
    for (const y of fs.readdirSync(UPLOAD_DIR)) {
      const yp = path.join(UPLOAD_DIR, y);
      if (!fs.statSync(yp).isDirectory()) continue;
      for (const m of fs.readdirSync(yp)) {
        const mp = path.join(yp, m);
        if (!fs.statSync(mp).isDirectory()) continue;
        for (const name of fs.readdirSync(mp)) {
          if (name.startsWith(id + '.')) push(path.join(mp, name));
        }
      }
    }
  } catch {
    /* ignore */
  }
  return hits;
}

/** 收集磁盘上所有文件（id → 路径） */
function diskIndex() {
  const out = new Map();
  const walk = (dir, depth) => {
    if (depth > 3) return;
    let names = [];
    try {
      names = fs.readdirSync(dir);
    } catch {
      return;
    }
    for (const name of names) {
      const p = path.join(dir, name);
      let st = null;
      try {
        st = fs.statSync(p);
      } catch {
        continue;
      }
      if (st.isDirectory()) {
        walk(p, depth + 1);
      } else {
        const m = /^(f_[a-z0-9]{6,})\.[^.]+$/i.exec(name);
        if (m) out.set(m[1], p);
      }
    }
  };
  walk(UPLOAD_DIR, 0);
  return out;
}

/**
 * 执行清理
 * @param {{minAgeHours?:number, dryRun?:boolean}} opts
 */
export function cleanupOrphanFiles({ minAgeHours = 24, dryRun = false } = {}) {
  const cutoff = Date.now() - minAgeHours * 3600_000;
  const refs = referencedFileIds();
  const files = db.collection('files');
  const rows = files.all();

  let removedRecords = 0;
  let removedFiles = 0;
  let bytesFreed = 0;
  const sample = [];

  // 1) 记录层面的孤儿
  for (const rec of rows) {
    if (!rec || !rec.id) continue;
    const created = Date.parse(rec.createdAt || rec.uploadedAt || '');
    if (!Number.isFinite(created) || created > cutoff) continue;
    if (refs.has(rec.id)) continue;

    const paths = locate(rec.id);
    for (const p of paths) {
      try {
        const size = fs.statSync(p).size;
        if (!dryRun) fs.unlinkSync(p);
        removedFiles += 1;
        bytesFreed += size;
      } catch {
        /* ignore */
      }
    }
    if (!dryRun) {
      try {
        files.remove(rec.id);
        removedRecords += 1;
      } catch {
        /* ignore */
      }
    } else {
      removedRecords += 1;
    }
    if (sample.length < 5) sample.push(rec.name || rec.id);
  }

  // 2) 磁盘上的孤儿（没有对应记录）
  const knownIds = new Set(rows.map((r) => r.id));
  for (const [id, p] of diskIndex()) {
    if (refs.has(id) || knownIds.has(id)) continue;
    let st = null;
    try {
      st = fs.statSync(p);
    } catch {
      continue;
    }
    if (st.mtimeMs > cutoff) continue;
    try {
      if (!dryRun) fs.unlinkSync(p);
      removedFiles += 1;
      bytesFreed += st.size;
    } catch {
      /* ignore */
    }
  }

  return {
    ok: true,
    dryRun,
    scannedRecords: rows.length,
    referenced: refs.size,
    removedRecords,
    removedFiles,
    bytesFreed,
    mb: Math.round((bytesFreed / 1048576) * 10) / 10,
    sample,
  };
}

export default { cleanupOrphanFiles, referencedFileIds };

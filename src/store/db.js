/**
 * 小鱼来了 — 持久化层
 *
 * 零依赖实现：每个集合一个 JSON 文件（data/collections/<name>.json），
 * 内存里保存 Map 索引，写入采用「防抖 + 临时文件 + 原子 rename」，
 * 保证进程被强杀也不会写坏数据文件。
 *
 * 数据量到几十万行时请换成 SQLite / PostgreSQL —— 所有调用方只依赖
 * Collection 的这几个方法，替换成本很低。
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { DATA_DIR } from '../config.js';

const COL_DIR = path.join(DATA_DIR, 'collections');
fs.mkdirSync(COL_DIR, { recursive: true });

const FLUSH_DELAY_MS = 150;

/* ------------------------------------------------------------------ */
/* ID                                                                  */
/* ------------------------------------------------------------------ */
const ID_ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyz';
export function newId(prefix = 'id') {
  const t = Date.now().toString(36);
  const bytes = crypto.randomBytes(6);
  let r = '';
  for (let i = 0; i < 6; i++) r += ID_ALPHABET[bytes[i] % 36];
  return `${prefix}_${t}${r}`;
}

/* ------------------------------------------------------------------ */
/* Collection                                                          */
/* ------------------------------------------------------------------ */
export class Collection {
  constructor(name) {
    this.name = name;
    this.file = path.join(COL_DIR, `${name}.json`);
    this.map = new Map();
    this._dirty = false;
    this.load();
  }

  load() {
    try {
      if (!fs.existsSync(this.file)) return;
      const raw = fs.readFileSync(this.file, 'utf8');
      if (!raw.trim()) return;
      const arr = JSON.parse(raw);
      if (Array.isArray(arr)) {
        for (const doc of arr) {
          if (doc && typeof doc === 'object' && doc.id) this.map.set(doc.id, doc);
        }
      }
    } catch (err) {
      // 数据文件损坏时备份并重新开始，绝不让服务起不来
      try {
        fs.renameSync(this.file, `${this.file}.corrupt-${Date.now()}`);
      } catch {
        /* ignore */
      }
      console.error(`[db] 集合 ${this.name} 数据文件损坏，已备份并重置`);
    }
  }

  markDirty() {
    this._dirty = true;
    scheduleFlush();
  }

  get size() {
    return this.map.size;
  }

  insert(doc) {
    const id = doc.id || newId(this.name.slice(0, 3));
    const now = new Date().toISOString();
    const record = { createdAt: now, updatedAt: now, ...doc, id };
    this.map.set(id, record);
    this.markDirty();
    return record;
  }

  /** 批量写入（用于种子数据），只触发一次落盘 */
  insertMany(docs) {
    const out = docs.map((d) => this.insert(d));
    return out;
  }

  get(id) {
    if (!id) return null;
    return this.map.get(id) || null;
  }

  all() {
    return [...this.map.values()];
  }

  find(predicate) {
    const out = [];
    for (const doc of this.map.values()) {
      try {
        if (predicate(doc)) out.push(doc);
      } catch {
        /* 跳过谓词出错的记录 */
      }
    }
    return out;
  }

  findOne(predicate) {
    for (const doc of this.map.values()) {
      try {
        if (predicate(doc)) return doc;
      } catch {
        /* ignore */
      }
    }
    return null;
  }

  /** 常用快捷查询：按字段等值匹配 */
  where(field, value) {
    return this.find((d) => d[field] === value);
  }

  update(id, patch) {
    const cur = this.map.get(id);
    if (!cur) return null;
    const next = { ...cur, ...patch, id, updatedAt: new Date().toISOString() };
    this.map.set(id, next);
    this.markDirty();
    return next;
  }

  /** 原子自增并返回新值 */
  bump(id, field, by = 1) {
    const cur = this.map.get(id);
    if (!cur) return null;
    const val = (Number(cur[field]) || 0) + by;
    return this.update(id, { [field]: val });
  }

  remove(id) {
    const ok = this.map.delete(id);
    if (ok) this.markDirty();
    return ok;
  }

  removeWhere(predicate) {
    let n = 0;
    for (const [id, doc] of this.map) {
      try {
        if (predicate(doc)) {
          this.map.delete(id);
          n++;
        }
      } catch {
        /* ignore */
      }
    }
    if (n) this.markDirty();
    return n;
  }

  count(predicate) {
    if (!predicate) return this.map.size;
    let n = 0;
    for (const doc of this.map.values()) {
      try {
        if (predicate(doc)) n++;
      } catch {
        /* ignore */
      }
    }
    return n;
  }

  writeNow() {
    if (!this._dirty) return;
    const tmp = `${this.file}.tmp-${process.pid}`;
    try {
      fs.writeFileSync(tmp, JSON.stringify(this.all()), 'utf8');
      fs.renameSync(tmp, this.file);
      this._dirty = false;
    } catch (err) {
      console.error(`[db] 写入集合 ${this.name} 失败:`, err.message);
    }
  }
}

/* ------------------------------------------------------------------ */
/* 防抖刷盘                                                            */
/* ------------------------------------------------------------------ */
const cache = new Map();
let timer = null;
let flushing = false;

function scheduleFlush() {
  if (timer) return;
  timer = setTimeout(() => {
    timer = null;
    flush();
  }, FLUSH_DELAY_MS);
  if (timer.unref) timer.unref();
}

export function flush() {
  if (flushing) return;
  flushing = true;
  try {
    for (const col of cache.values()) col.writeNow();
  } finally {
    flushing = false;
  }
}

export function collection(name) {
  let col = cache.get(name);
  if (!col) {
    col = new Collection(name);
    cache.set(name, col);
  }
  return col;
}

export function collections() {
  return [...cache.keys()];
}

/** 进程退出前确保落盘 */
let hooked = false;
export function installShutdownHook() {
  if (hooked) return;
  hooked = true;
  const bye = () => {
    try {
      for (const col of cache.values()) {
        col._dirty = true;
        col.writeNow();
      }
    } catch {
      /* ignore */
    }
  };
  process.on('exit', bye);
  for (const sig of ['SIGINT', 'SIGTERM']) {
    process.on(sig, () => {
      bye();
      process.exit(0);
    });
  }
}

export function stats() {
  const out = {};
  for (const [name, col] of cache) out[name] = col.size;
  return out;
}

export const db = { collection, flush, stats, newId, installShutdownHook };
export default db;

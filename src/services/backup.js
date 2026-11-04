/**
 * 数据快照（每日备份）
 *
 * 由来：2026-11-05 一次临时清理脚本用 Python 写 files.json，
 *      遇到 surrogate 字符编码失败，文件被 open('w') 截断，
 *      服务重启后按空库重建，1000+ 条文件记录瞬间消失
 *      （实体文件还在，靠脚本从 corrupt 备份 + 磁盘扫描抢救回来 724 条）。
 *
 * 教训：JSON 数据目录必须有自己的快照，不能只靠「服务在内存里还有一份」。
 *
 * 策略：
 *   · 每 6 小时把关键集合复制到 data/backups/<时间戳>/
 *   · 只备份「丢了会疼」的集合，跳过 notifications（60MB+）这类可重生成的
 *   · 只保留最近 8 份，磁盘占用控制在几十 MB
 *   · 备份是纯文件复制，不改动源文件，失败不影响主服务
 */

import fs from 'node:fs';
import path from 'node:path';
import { DATA_DIR } from '../config.js';

const SRC_DIR = path.join(DATA_DIR, 'collections');
const BAK_DIR = path.join(DATA_DIR, 'backups');

/** 值得备份的集合（丢了会疼的） */
const IMPORTANT = [
  'files.json',
  'listings.json',
  'feeds.json',
  'users.json',
  'contacts.json',
  'stewards.json',
  'providers.json',
  'settings.json',
  'levelOrders.json',
  'feedback.json',
];

const KEEP = 8;

export function snapshot() {
  try {
    fs.mkdirSync(BAK_DIR, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const dir = path.join(BAK_DIR, stamp);
    fs.mkdirSync(dir, { recursive: true });

    let copied = 0;
    let bytes = 0;
    for (const name of IMPORTANT) {
      const src = path.join(SRC_DIR, name);
      if (!fs.existsSync(src)) continue;
      try {
        const st = fs.statSync(src);
        // 单文件超过 80MB 跳过（likely 是异常膨胀，备份意义不大且占空间）
        if (st.size > 80 * 1024 * 1024) continue;
        fs.copyFileSync(src, path.join(dir, name));
        copied += 1;
        bytes += st.size;
      } catch {
        /* 单个失败不影响其它 */
      }
    }

    // 清理旧快照
    const dirs = fs
      .readdirSync(BAK_DIR)
      .filter((d) => /^\d{4}-\d{2}-\d{2}T/.test(d))
      .sort();
    while (dirs.length > KEEP) {
      const old = dirs.shift();
      try {
        fs.rmSync(path.join(BAK_DIR, old), { recursive: true, force: true });
      } catch {
        /* ignore */
      }
    }

    return { ok: true, dir, copied, mb: Math.round((bytes / 1048576) * 10) / 10 };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

/** 列出已有快照（后台排障用） */
export function listSnapshots() {
  try {
    return fs
      .readdirSync(BAK_DIR)
      .filter((d) => /^\d{4}-\d{2}-\d{2}T/.test(d))
      .sort()
      .reverse()
      .map((d) => {
        const dir = path.join(BAK_DIR, d);
        let bytes = 0;
        try {
          for (const n of fs.readdirSync(dir)) bytes += fs.statSync(path.join(dir, n)).size;
        } catch {
          /* ignore */
        }
        return { at: d, mb: Math.round((bytes / 1048576) * 10) / 10 };
      });
  } catch {
    return [];
  }
}

export default { snapshot, listSnapshots };

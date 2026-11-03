/**
 * 文档解析调度
 *
 * 规则（都是为了让「传大文件」不再把服务卡死）：
 *   1. 解析一律在 worker 线程里做，主线程不碰 CPU；
 *   2. 全局只跑 1 个解析任务，避免多份大文件同时解析把内存打满；
 *   3. 超过 EXTRACT_MAX_BYTES 直接跳过 —— 21MB 的扫描件解析几秒，
 *      对用户价值远不如「文件先存好、能下载」；
 *   4. 单个任务超时 45 秒就放弃，记录里留一条说明。
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Worker } from 'node:worker_threads';

const WORKER_FILE = fileURLToPath(new URL('./extract-worker.js', import.meta.url));

/**
 * 超过这个大小就不再「读全文解析」。
 * 24MB：worker 线程里跑（堆上限 512MB），主线程不受影响；
 * 再大就走「渲染前几页 + 视觉识别」的轻量路线（见 files.js）。
 */
export const EXTRACT_MAX_BYTES = 24 * 1024 * 1024;
/** 单任务超时（大文件解压慢，给足时间） */
const EXTRACT_TIMEOUT_MS = 90_000;

const queue = [];
let busy = false;

function runWorker(job) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (payload) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(payload);
    };

    let worker;
    try {
      worker = new Worker(WORKER_FILE, {
        workerData: { filePath: job.filePath, name: job.name },
        resourceLimits: { maxOldGenerationSizeMb: 512 },
      });
    } catch (err) {
      resolve({ ok: false, error: '解析线程启动失败: ' + String(err?.message || err) });
      return;
    }

    const timer = setTimeout(() => {
      try {
        worker.terminate();
      } catch {
        /* ignore */
      }
      finish({ ok: false, error: '解析超时，已跳过正文' });
    }, EXTRACT_TIMEOUT_MS);

    worker.once('message', (msg) => {
      finish(msg || { ok: false, error: '解析无返回' });
      try {
        worker.terminate();
      } catch {
        /* ignore */
      }
    });
    worker.once('error', (err) => finish({ ok: false, error: String(err?.message || err) }));
    worker.once('exit', () => finish({ ok: false, error: '解析线程提前退出' }));
  });
}

async function pump() {
  if (busy) return;
  const job = queue.shift();
  if (!job) return;
  busy = true;
  try {
    const r = await runWorker(job);
    try {
      await job.onDone(r);
    } catch {
      /* 回调失败不影响队列 */
    }
  } finally {
    busy = false;
    // 让出一个事件循环周期，避免长时间连续占用
    setImmediate(pump);
  }
}

/**
 * 排队解析一个文件。
 * @param {{filePath:string, name:string, onDone:(r:{ok:boolean,text?:string,meta?:object,notes?:string[],error?:string})=>any}} job
 */
export function enqueueExtract(job) {
  if (!job || !job.filePath) return false;
  if (job.size && job.size > EXTRACT_MAX_BYTES) return false;
  queue.push(job);
  setImmediate(pump);
  return true;
}

export function queueLength() {
  return queue.length + (busy ? 1 : 0);
}

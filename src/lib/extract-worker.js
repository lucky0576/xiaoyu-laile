/**
 * 文档解析 worker
 *
 * 为什么要有：extract.js 用的是 inflateSync / 自研 PDF、DOC 解析，
 * 全是**同步阻塞**的 CPU 活。一个 21MB 的 Word 上传上来，
 * 主线程会被卡住好几秒 —— 期间整个服务不响应任何请求，
 * 前端看到的就是「上传 0%、没反应」。
 *
 * 把解析放进 worker_threads，主线程只管收文件、立刻返回，
 * 解析结果通过消息回传，再由主线程写回文件记录。
 */
import fs from 'node:fs';
import { parentPort, workerData } from 'node:worker_threads';

const { filePath, name } = workerData || {};

try {
  const buf = fs.readFileSync(filePath);
  const mod = await import('./extract.js');
  const r = await mod.extractText(buf, name);
  parentPort.postMessage({
    ok: true,
    text: String(r?.text || ''),
    meta: r?.meta || {},
    notes: r?.notes || [],
  });
} catch (err) {
  parentPort.postMessage({ ok: false, error: String(err?.message || err) });
}

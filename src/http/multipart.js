/**
 * 流式 multipart/form-data 解析器
 *
 * 为什么要流式：平台要支持视频、压缩包、CAD 等大文件上传，
 * 一次性把整个请求读进内存会直接打爆进程。这里边收边把文件分片
 * 落到临时目录，内存里只保留表单字段和滚动窗口。
 */
import fs from 'node:fs';
import path from 'node:path';
import { newId } from '../store/db.js';

/** 按分号切分头部参数，尊重引号内的分号 */
function splitHeaderParams(str) {
  const out = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < str.length; i++) {
    const c = str[i];
    if (c === '"') {
      quoted = !quoted;
      cur += c;
    } else if (c === ';' && !quoted) {
      out.push(cur);
      cur = '';
    } else {
      cur += c;
    }
  }
  out.push(cur);
  return out;
}

function parseDisposition(value) {
  const parts = splitHeaderParams(value || '');
  const type = (parts.shift() || '').trim().toLowerCase();
  const params = {};
  for (const p of parts) {
    const eq = p.indexOf('=');
    if (eq < 0) continue;
    const k = p.slice(0, eq).trim().toLowerCase();
    let v = p.slice(eq + 1).trim();
    if (v.startsWith('"') && v.endsWith('"') && v.length >= 2) {
      v = v.slice(1, -1).replace(/\\(.)/g, '$1');
    }
    params[k] = v;
  }
  return { type, params };
}

function decodeRfc5987(value) {
  try {
    const m = /^([^']*)'([^']*)'(.*)$/.exec(value);
    const enc = m ? m[3] : value;
    return decodeURIComponent(enc);
  } catch {
    return value;
  }
}

export function safeFilename(name) {
  const base = String(name || 'file')
    .replace(/\\/g, '/')
    .split('/')
    .pop()
    .replace(/[\u0000-\u001f<>:"|?*]/g, '_')
    .replace(/^\.+/, '')
    .trim();
  return base.slice(0, 180) || 'file';
}

/**
 * 解析 multipart 请求流。
 * @returns {Promise<{fields: Record<string,string>, files: Array}>}
 *   files 项：{ field, filename, mime, tmpPath, size }
 */
/** 人类可读的字节数：512MB / 200KB，避免出现「0MB」这种提示 */
export function formatBytes(n) {
  const num = Number(n) || 0;
  if (num < 1024) return `${num}B`;
  if (num < 1024 * 1024) return `${Math.round(num / 1024)}KB`;
  if (num < 1024 * 1024 * 1024) {
    const mb = num / 1048576;
    return `${mb < 10 ? mb.toFixed(1) : Math.round(mb)}MB`;
  }
  return `${(num / 1073741824).toFixed(1)}GB`;
}

export function parseMultipartStream(req, options = {}) {
  const {
    boundary,
    tmpDir,
    maxTotalBytes = 512 * 1024 * 1024,
    maxFieldBytes = 1024 * 1024,
    maxParts = 200,
  } = options;

  return new Promise((resolve, reject) => {
    const first = Buffer.from(`--${boundary}`);
    const delim = Buffer.from(`\r\n--${boundary}`);
    const keep = delim.length + 2;

    let buf = Buffer.alloc(0);
    let state = 'preamble';
    let total = 0;
    let cur = null;
    let settled = false;
    const fields = {};
    const files = [];
    const created = [];

    const cleanup = () => {
      for (const f of created) {
        try {
          fs.unlinkSync(f);
        } catch {
          /* ignore */
        }
      }
    };

    const fail = (err) => {
      if (settled) return;
      settled = true;
      cleanup();
      // 不要在这里 req.destroy()。
      //
      // 直接销毁 socket 会让客户端拿不到我们准备好的 4xx JSON 响应：
      // 浏览器只看到「网络错误」，个别情况下还会一直等到超时 ——
      // 用户看到的现象就是「上传 100% 后无反应」。
      // 改为暂停读取，把错误抛给上层，由统一错误处理返回真正的错误信息；
      // 上层响应结束后会再销毁连接。
      try {
        req.pause();
      } catch {
        /* ignore */
      }
      reject(err);
    };

    const ok = () => {
      if (settled) return;
      settled = true;
      resolve({ fields, files });
    };

    function writePart(chunk) {
      if (!cur || !chunk || !chunk.length) return;
      if (cur.fd !== undefined) {
        fs.writeSync(cur.fd, chunk);
        cur.size += chunk.length;
      } else {
        cur.size += chunk.length;
        if (cur.size > maxFieldBytes) {
          fail(new Error(`表单字段 ${cur.field} 超过 ${maxFieldBytes} 字节`));
          return;
        }
        cur.chunks.push(chunk);
      }
    }

    function finishPart() {
      if (!cur) return;
      const c = cur;
      cur = null;
      if (c.fd !== undefined) {
        try {
          fs.closeSync(c.fd);
        } catch {
          /* ignore */
        }
        c.fd = undefined;
        files.push({
          field: c.field,
          filename: c.filename,
          mime: c.mime,
          tmpPath: c.tmpPath,
          size: c.size,
        });
      } else {
        fields[c.field] = Buffer.concat(c.chunks).toString('utf8');
      }
    }

    function startPart(headerText) {
      const headers = {};
      for (const line of headerText.split('\r\n')) {
        const idx = line.indexOf(':');
        if (idx < 1) continue;
        headers[line.slice(0, idx).trim().toLowerCase()] = line.slice(idx + 1).trim();
      }
      const { params } = parseDisposition(headers['content-disposition'] || '');
      const field = params.name || `field${Object.keys(fields).length}`;
      let filename = params.filename;
      if (params['filename*']) filename = decodeRfc5987(params['filename*']);

      if (files.length + Object.keys(fields).length >= maxParts) {
        fail(new Error('表单分片数量过多'));
        return;
      }

      if (filename !== undefined) {
        const clean = safeFilename(filename);
        const tmpPath = path.join(tmpDir, `${newId('up')}.part`);
        const fd = fs.openSync(tmpPath, 'w');
        created.push(tmpPath);
        cur = {
          field,
          filename: clean,
          mime: headers['content-type'] || 'application/octet-stream',
          tmpPath,
          fd,
          size: 0,
        };
      } else {
        cur = { field, chunks: [], size: 0 };
      }
    }

    function drain() {
      // 单次调用里尽可能推进状态机，除非确实需要更多数据
      for (let guard = 0; guard < 100000; guard++) {
        if (settled) return;
        if (state === 'preamble') {
          const i = buf.indexOf(first);
          if (i === -1) {
            if (buf.length > keep) buf = buf.subarray(buf.length - keep);
            return;
          }
          buf = buf.subarray(i + first.length);
          state = 'afterBoundary';
          continue;
        }
        if (state === 'afterBoundary') {
          if (buf.length < 2) return;
          if (buf[0] === 0x2d && buf[1] === 0x2d) {
            buf = buf.subarray(2);
            finishPart();
            state = 'epilogue';
            continue;
          }
          if (buf[0] === 0x0d && buf[1] === 0x0a) {
            buf = buf.subarray(2);
            state = 'headers';
            continue;
          }
          // 容错：跳过无法识别的一个字节
          buf = buf.subarray(1);
          continue;
        }
        if (state === 'headers') {
          const i = buf.indexOf('\r\n\r\n');
          if (i === -1) {
            if (buf.length > 64 * 1024) return fail(new Error('分片头部过长'));
            return;
          }
          const headerText = buf.subarray(0, i).toString('utf8');
          buf = buf.subarray(i + 4);
          startPart(headerText);
          if (settled) return;
          state = 'body';
          continue;
        }
        if (state === 'body') {
          const i = buf.indexOf(delim);
          if (i === -1) {
            if (buf.length > keep) {
              writePart(buf.subarray(0, buf.length - keep));
              if (settled) return;
              buf = buf.subarray(buf.length - keep);
            }
            return;
          }
          writePart(buf.subarray(0, i));
          if (settled) return;
          buf = buf.subarray(i + delim.length);
          finishPart();
          state = 'afterBoundary';
          continue;
        }
        return; // epilogue
      }
    }

    req.on('data', (chunk) => {
      if (settled) return;
      total += chunk.length;
      if (total > maxTotalBytes) {
        // 客户端把太大的文件传上来了，属于客户端错误：
        // 用 413 而不是 500，否则会被当成服务端故障，也会打一堆无意义的错误日志
        const err = new Error(`上传内容超过限制（${formatBytes(maxTotalBytes)}）`);
        err.status = 413;
        err.code = 'payload_too_large';
        return fail(err);
      }
      buf = buf.length ? Buffer.concat([buf, chunk]) : chunk;
      drain();
    });

    req.on('end', () => {
      if (settled) return;
      drain();
      if (settled) return;
      if (state === 'epilogue') {
        if (cur) finishPart();
        ok();
      } else {
        cleanup();
        settled = true;
        reject(new Error('上传数据不完整，请重试'));
      }
    });

    req.on('error', (err) => fail(err));
    req.on('aborted', () => fail(new Error('上传已中止')));
  });
}

/** 供测试使用 */
export const __internals = { parseDisposition, decodeRfc5987, splitHeaderParams };

/**
 * 小鱼来了 — 极简 HTTP 应用框架
 *
 * 用 node:http 实现，零第三方依赖：路由、参数、Cookie、Body 解析、
 * 静态资源（含 SPA 回退）、SSE。目标是把"能跑起来"的确定性拉到最高。
 */
import http from 'node:http';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { URL } from 'node:url';
import { config, TMP_DIR } from '../config.js';
import { parseMultipartStream } from './multipart.js';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.htm': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.bmp': 'image/bmp',
  '.ico': 'image/x-icon',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mov': 'video/quicktime',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.m4a': 'audio/mp4',
  '.pdf': 'application/pdf',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/plain; charset=utf-8',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf',
  '.zip': 'application/zip',
  '.webmanifest': 'application/manifest+json',
};

export function httpError(status, message, code = 'error') {
  const err = new Error(message);
  err.status = status;
  err.code = code;
  return err;
}

export function parseCookies(header) {
  const out = {};
  if (!header) return out;
  for (const part of String(header).split(';')) {
    const eq = part.indexOf('=');
    if (eq < 0) continue;
    const k = part.slice(0, eq).trim();
    if (!k) continue;
    out[k] = decodeURIComponent(part.slice(eq + 1).trim());
  }
  return out;
}

export function serializeCookie(name, value, opts = {}) {
  const enc = encodeURIComponent(value ?? '');
  let s = `${name}=${enc}`;
  if (opts.maxAge !== undefined) s += `; Max-Age=${Math.floor(opts.maxAge)}`;
  s += `; Path=${opts.path || '/'}`;
  if (opts.httpOnly !== false) s += '; HttpOnly';
  if (opts.secure) s += '; Secure';
  s += `; SameSite=${opts.sameSite || 'Lax'}`;
  return s;
}

function compilePath(pattern) {
  const keys = [];
  const PLACEHOLDER = '\u0000WILD\u0000';
  let src = String(pattern)
    .replace(/\*/g, PLACEHOLDER)
    .replace(/[.+?^${}()|[\]\\]/g, '\\$&');
  src = src.replace(new RegExp(PLACEHOLDER, 'g'), '(.*)');
  src = src.replace(/:([A-Za-z_][A-Za-z0-9_]*)/g, (_, k) => {
    keys.push(k);
    return '([^/]+)';
  });
  return { re: new RegExp(`^${src}/?$`), keys };
}

function readRaw(req, limit) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) {
        reject(httpError(413, `请求体超过限制（${Math.round(limit / 1048576)}MB）`, 'payload_too_large'));
        try {
          req.destroy();
        } catch {
          /* ignore */
        }
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

async function parseBody(req) {
  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') return;
  const ct = String(req.headers['content-type'] || '');
  if (ct.startsWith('multipart/form-data')) {
    const m = /boundary=(?:"([^"]+)"|([^;]+))/i.exec(ct);
    if (!m) throw httpError(400, 'multipart 请求缺少 boundary');
    const boundary = (m[1] || m[2]).trim();
    const result = await parseMultipartStream(req, {
      boundary,
      tmpDir: TMP_DIR,
      maxTotalBytes: config.maxUploadBytes,
    });
    req.body = result.fields;
    req.files = result.files;
    return;
  }
  const limit = config.maxJsonBytes;
  const raw = await readRaw(req, limit);
  req.rawBody = raw;
  if (!raw.length) {
    req.body = {};
    return;
  }
  if (ct.includes('application/json') || ct.includes('+json')) {
    try {
      req.body = JSON.parse(raw.toString('utf8'));
    } catch {
      throw httpError(400, 'JSON 解析失败');
    }
  } else if (ct.includes('application/x-www-form-urlencoded')) {
    req.body = Object.fromEntries(new URLSearchParams(raw.toString('utf8')));
  } else {
    req.body = {};
  }
}

/** 清理本次请求落盘的临时上传文件 */
function cleanupUploads(req) {
  for (const f of req.files || []) {
    try {
      if (f.tmpPath && !f.moved) fs.unlinkSync(f.tmpPath);
    } catch {
      /* ignore */
    }
  }
}

export function createApp() {
  const preStack = [];
  const routes = [];
  const app = {};

  const add = (method, pattern, ...handlers) => {
    const { re, keys } = compilePath(pattern);
    routes.push({ method, pattern, re, keys, handlers: handlers.flat() });
    return app;
  };

  app.get = (p, ...h) => add('GET', p, ...h);
  app.post = (p, ...h) => add('POST', p, ...h);
  app.put = (p, ...h) => add('PUT', p, ...h);
  app.patch = (p, ...h) => add('PATCH', p, ...h);
  app.del = (p, ...h) => add('DELETE', p, ...h);
  app.delete = app.del;
  app.use = (mw) => {
    preStack.push(mw);
    return app;
  };

  /**
   * 静态资源。opts.spa = true 时未知路径回退到 index.html（前端路由）。
   */
  app.static = (prefix, dir, opts = {}) => {
    const cleanPrefix = prefix.replace(/\/+$/, '');
    const exclude = (opts.exclude || []).map((p) => (p instanceof RegExp ? p : new RegExp(p)));
    preStack.push(async (req, res) => {
      if (req.method !== 'GET' && req.method !== 'HEAD') return;
      if (exclude.some((re) => re.test(req.path))) return;
      if (!req.path.startsWith(cleanPrefix + '/') && req.path !== cleanPrefix) return;

      let rel = req.path.slice(cleanPrefix.length) || '/';
      if (rel === '/' || rel.endsWith('/')) rel += 'index.html';
      rel = decodeURIComponent(rel).replace(/\\/g, '/');
      const target = path.join(dir, rel);

      // 防止目录穿越
      if (!path.resolve(target).startsWith(path.resolve(dir))) {
        return res.json({ error: '非法路径' }, 403);
      }

      try {
        const st = await fsp.stat(target);
        if (st.isFile()) {
          // ETag 由 mtime + size 生成：文件改一个字节就换值。
          //
          // 之前只有 Last-Modified、没有 ETag，缓存策略是 max-age=3600，
          // 结果是部署后浏览器最长 1 小时都拿不到新前端 ——
          // app.js 是**静态导入**所有视图模块的，新旧文件混用会让整个 SPA 挂掉
          // （表现就是「点发布没反应」）。这里改用 ETag + no-cache：
          // 每次都回来校验，没变就 304（依然很快），变了立刻拿到新版。
          const etag = `W/"${st.mtimeMs.toString(36)}-${st.size.toString(36)}"`;
          res.set('ETag', etag);
          res.set('Last-Modified', st.mtime.toUTCString());

          const inm = String(req.headers['if-none-match'] || '');
          if (inm && inm.split(',').some((s) => s.trim() === etag)) {
            res.statusCode = 304;
            res.__handled = true;
            return res.end();
          }

          res.set('Content-Type', MIME[path.extname(target).toLowerCase()] || 'application/octet-stream');
          // no-cache = 可以缓存，但每次必须回源校验。
          // 不是 no-store：那样每次都得重新下载，白费流量。
          res.set('Cache-Control', opts.cache || 'no-cache');
          if (req.method === 'HEAD') {
            res.statusCode = 200;
            res.__handled = true;
            return res.end();
          }
          return res.sendFile(target, 'stream');
        }
      } catch {
        /* 落到 SPA 回退 */
      }

      if (opts.spa) {
        const indexFile = path.join(dir, 'index.html');
        try {
          await fsp.access(indexFile);
          res.set('Content-Type', MIME['.html']);
          res.set('Cache-Control', 'no-cache');
          if (req.method === 'HEAD') {
            res.statusCode = 200;
            res.__handled = true;
            return res.end();
          }
          return res.sendFile(indexFile, 'stream');
        } catch {
          /* ignore */
        }
      }
    });
    return app;
  };

  const handle = async (req, res) => {
    const started = Date.now();
    const parsed = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
    req.path = decodeURIComponent(parsed.pathname);
    req.query = Object.fromEntries(parsed.searchParams);
    req.cookies = parseCookies(req.headers.cookie);
    req.body = {};
    req.files = [];
    req.origin = `${parsed.protocol}//${req.headers.host || 'localhost'}`;

    /* ---------------- 响应助手 ---------------- */
    res.set = (k, v) => {
      if (!res.headersSent) res.setHeader(k, v);
      return res;
    };
    res.status = (n) => {
      res.statusCode = n;
      return res;
    };
    /**
     * 判断本次响应是否已经被某一层接管。
     * 不能用 headersSent 单独判断：流式 pipe 是异步的，pipe 返回时 headers 还没发出去，
     * 会被后面的 404 兜底抢先 end()。所以显式标记 __handled。
     */
    res.done = () => Boolean(res.writableEnded || res.headersSent || res.__handled);
    res.json = (obj, status) => {
      if (res.done() || res.__handled) return res;
      const body = Buffer.from(JSON.stringify(obj ?? null), 'utf8');
      res.statusCode = status || res.statusCode || 200;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader('Content-Length', body.length);
      res.end(body);
      return res;
    };
    res.text = (s, status) => {
      if (res.done() || res.__handled) return res;
      const body = Buffer.from(String(s ?? ''), 'utf8');
      res.statusCode = status || res.statusCode || 200;
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.setHeader('Content-Length', body.length);
      res.end(body);
      return res;
    };
    res.redirect = (loc, status = 302) => {
      if (res.done()) return res;
      res.statusCode = status;
      res.setHeader('Location', loc);
      res.__handled = true;
      res.end();
      return res;
    };
    /**
     * 发送文件。
     *
     * 必须支持 HTTP Range（206 Partial Content）：
     * 视频、音频、大 PDF 都靠它做流式播放和拖动进度条。
     * 之前只声明了 Accept-Ranges: bytes 却从不处理 Range 头，
     * 结果每次请求都返回完整文件 —— 一个 19MB 的视频要下载 96 秒，
     * 浏览器必然卡死或直接播不了。
     */
    res.sendFile = (file, mode = 'buffer') => {
      if (mode === 'stream') {
        const st = fs.statSync(file);
        const size = st.size;
        res.setHeader('Accept-Ranges', 'bytes');

        const rangeHeader = req.headers.range;
        if (rangeHeader) {
          const m = /^bytes=(\d*)-(\d*)$/.exec(String(rangeHeader).trim());
          if (m && (m[1] || m[2])) {
            let start;
            let end;
            if (!m[1]) {
              // bytes=-N 表示最后 N 字节
              const suffix = parseInt(m[2], 10);
              start = Math.max(0, size - suffix);
              end = size - 1;
            } else {
              start = parseInt(m[1], 10);
              end = m[2] ? parseInt(m[2], 10) : size - 1;
            }

            if (!Number.isFinite(start) || start < 0 || start >= size || start > end) {
              res.statusCode = 416;
              res.setHeader('Content-Range', `bytes */${size}`);
              res.__handled = true;
              res.end();
              return res;
            }
            end = Math.min(end, size - 1);
            const chunkSize = end - start + 1;

            res.statusCode = 206;
            res.setHeader('Content-Range', `bytes ${start}-${end}/${size}`);
            res.setHeader('Content-Length', chunkSize);
            res.__handled = true;

            if (req.method === 'HEAD') { res.end(); return res; }

            const part = fs.createReadStream(file, { start, end });
            part.on('error', () => {
              try { res.destroy(); } catch { /* ignore */ }
            });
            part.pipe(res);
            return res;
          }
        }

        // 没有 Range（或不合法）：整文件
        res.setHeader('Content-Length', size);
        res.__handled = true;
        if (req.method === 'HEAD') { res.end(); return res; }

        const stream = fs.createReadStream(file);
        stream.on('error', () => {
          try { res.destroy(); } catch { /* ignore */ }
        });
        stream.pipe(res);
        return res;
      }

      res.__handled = true;
      res.end(fs.readFileSync(file));
      return res;
    };
    /** Server-Sent Events */
    res.sse = () => {
      res.__handled = true;
      res.writeHead(200, {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
      });
      if (typeof res.flushHeaders === 'function') res.flushHeaders();
      res.write(': connected\n\n');
      const ping = setInterval(() => {
        try {
          res.write(': ping\n\n');
        } catch {
          /* ignore */
        }
      }, 25000);
      if (ping.unref) ping.unref();
      res.on('close', () => clearInterval(ping));
      return {
        send: (event, data) => {
          try {
            res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
          } catch {
            /* ignore */
          }
        },
        close: () => {
          clearInterval(ping);
          try {
            res.end();
          } catch {
            /* ignore */
          }
        },
      };
    };

    // CORS：允许前端独立部署或手机浏览器直连
    const origin = req.headers.origin;
    if (origin) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
      res.setHeader('Access-Control-Allow-Credentials', 'true');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
      res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
      res.setHeader('Access-Control-Max-Age', '86400');
    }
    if (req.method === 'OPTIONS') {
      res.statusCode = 204;
      res.end();
      return;
    }

    const finish = () => {
      cleanupUploads(req);
      const ms = Date.now() - started;
      if (!app.quiet && !req.path.startsWith('/api/events')) {
        const flag = res.statusCode >= 400 ? '!' : ' ';
        console.log(`${flag} ${res.statusCode} ${req.method} ${req.path} ${ms}ms`);
      }
    };
    res.on('close', finish);

    try {
      await parseBody(req);
    } catch (err) {
      // 解析失败（超限、格式错）时请求体可能还没读完。
      // multipart 里已经 req.pause()，这里先把错误响应发出去，
      // 再关闭连接 —— 顺序反了客户端就只能看到「网络错误」。
      const done = errorHandler(err, req, res);
      try {
        req.destroy();
      } catch {
        /* ignore */
      }
      return done;
    }

    // 1) 前置中间件与静态资源
    for (const mw of preStack) {
      try {
        await mw(req, res, () => {});
      } catch (err) {
        return errorHandler(err, req, res);
      }
      if (res.done()) return;
    }

    // 2) 路由匹配
    const method = req.method === 'HEAD' ? 'GET' : req.method;
    let pathMatched = false;
    for (const route of routes) {
      if (route.method !== 'ALL' && route.method !== method) continue;
      const m = route.re.exec(req.path);
      if (!m) continue;
      pathMatched = true;
      req.params = {};
      route.keys.forEach((k, i) => {
        req.params[k] = decodeURIComponent(m[i + 1] ?? '');
      });
      req.route = route.pattern;
      for (const handler of route.handlers) {
        try {
          await handler(req, res);
        } catch (err) {
          return errorHandler(err, req, res);
        }
        if (res.done()) return;
      }
      return;
    }

    return notFoundHandler(req, res, pathMatched);
  };

  app.handler = (req, res) => {
    handle(req, res).catch((err) => errorHandler(err, req, res));
  };

  app.listen = (port = config.port, host = config.host) =>
    new Promise((resolve) => {
      const server = http.createServer(app.handler);
      server.keepAliveTimeout = 65000;
      server.requestTimeout = 0; // 大文件上传不设总超时
      server.headersTimeout = 70000;
      server.listen(port, host, () => resolve(server));
      app.server = server;
    });

  app.close = () =>
    new Promise((resolve) => {
      if (!app.server) return resolve();
      app.server.close(() => resolve());
    });

  return app;
}

function notFoundHandler(req, res, pathMatched) {
  if (req.path.startsWith('/api/')) {
    return res.json({ error: '接口不存在', code: 'not_found', path: req.path }, 404);
  }
  if (pathMatched) {
    return res.json({ error: '请求方法不允许', code: 'method_not_allowed' }, 405);
  }
  return res.json({ error: '资源不存在', code: 'not_found' }, 404);
}

export function errorHandler(err, req, res) {
  const status = err && err.status ? err.status : 500;
  if (status >= 500) {
    console.error(`[error] ${req.method} ${req.path}`, err && err.stack ? err.stack : err);
  }
  if (res.writableEnded || res.headersSent || res.__handled) return;
  try {
    res.json(
      {
        error: (err && err.message) || '服务器内部错误',
        code: (err && err.code) || 'internal_error',
      },
      status,
    );
  } catch {
    try {
      res.end();
    } catch {
      /* ignore */
    }
  }
}

export const mime = MIME;
export default createApp;

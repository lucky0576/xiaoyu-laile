/**
 * 小鱼来了 — 前端错误上报
 *
 * 为什么需要它：
 *   注册坏了整整两天没人发现，因为错误被 try/catch 吞成了「注册失败」，
 *   控制台里的 ReferenceError 只有打开开发者工具才看得到。
 *   现在任何未捕获的 JS 错误 / Promise 拒绝，都会立刻上报到服务端，
 *   写进 data/client-errors.log 并在日志里打出来。
 *
 * 上报内容只包含：错误信息、堆栈、页面路由、UA。
 * 不采集任何用户输入、不采集 Cookie。
 */

const ENDPOINT = '/api/client-error';
const sent = new Set(); // 同一个错误一个会话只报一次，避免刷屏
const MAX_SEND = 20; // 一个会话最多报 20 条，防止死循环打爆

function routeOf() {
  try {
    return String(location.hash || location.pathname || '').slice(0, 200);
  } catch {
    return '';
  }
}

function report(payload) {
  try {
    const key = `${payload.kind}|${payload.message}`;
    if (sent.has(key) || sent.size >= MAX_SEND) return;
    sent.add(key);

    const body = JSON.stringify({
      kind: payload.kind,
      message: String(payload.message || '').slice(0, 500),
      stack: String(payload.stack || '').slice(0, 2000),
      page: routeOf(),
      src: String(payload.src || '').slice(0, 300),
    });

    // 用 keepalive 保证页面跳走/关闭时也能发出去
    if (navigator.sendBeacon) {
      navigator.sendBeacon(ENDPOINT, new Blob([body], { type: 'application/json' }));
    } else {
      fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
        keepalive: true,
      }).catch(() => {});
    }
  } catch {
    /* 上报本身出错就算了，绝不能影响页面 */
  }
}

export function installErrorReport() {
  // 未捕获的同步错误
  window.addEventListener('error', (e) => {
    // 资源加载失败（img/script）没有 message，也没必要上报
    if (!e || !e.message) return;
    report({ kind: 'error', message: e.message, stack: e.error && e.error.stack, src: e.filename });
  });

  // 未处理的 Promise 拒绝（async 函数里 throw 的会被这里抓到）
  window.addEventListener('unhandledrejection', (e) => {
    const r = e && e.reason;
    const message = r && (r.message || String(r));
    report({ kind: 'rejection', message, stack: r && r.stack });
  });

  /*
   * 补一个「静默失败」探测：
   * 点击任何按钮后，如果既没有网络请求也没有 DOM 明显变化，
   * 不在这里处理 —— 那样误报太多。交给上面的全局钩子就够。
   */
}

export default { installErrorReport };

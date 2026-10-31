/**
 * 小鱼来了 — 剪贴板工具（针对手机浏览器）
 *
 * 为什么要单独搞一套：
 *   · 手机浏览器里 navigator.clipboard 经常被拒：
 *       - 微信内置浏览器（X5 / WKWebView）不支持或被拦截
 *       - 页面没有焦点时（从微信跳转过来、刚从弹窗回来）抛 NotAllowedError
 *   · 兜底用 document.execCommand('copy')，但 iOS Safari 有两个坑：
 *       - 文本框 opacity:0 时选择不到内容，复制出来是空的
 *       - 必须用 setSelectionRange，select() 在 iOS 上不可靠
 *
 * 所以这里按「成功率从高到低」试四种方式，全部失败时返回 'manual'，
 * 调用方把文本框内容全选出来让用户长按点系统「复制」。
 */

/** 创建用于复制的临时元素（不能用 opacity:0，iOS 会选不中） */
function makeTemp(contentEditable) {
  if (contentEditable) {
    const div = document.createElement('div');
    div.contentEditable = 'true';
    div.style.cssText =
      'position:fixed;left:0;top:0;width:1px;height:1px;overflow:hidden;' +
      'opacity:0.01;font-size:12px;z-index:-1;white-space:pre-wrap;';
    return div;
  }
  const ta = document.createElement('textarea');
  ta.style.cssText =
    'position:fixed;left:0;top:0;width:1px;height:1px;padding:0;border:0;outline:0;' +
    'box-shadow:none;background:transparent;opacity:0.01;font-size:12px;resize:none;z-index:-1;';
  ta.setAttribute('readonly', ''); // 防止手机弹键盘
  return ta;
}

/** 选中一个 input/textarea 的全部内容（iOS 友好） */
export function selectAll(el) {
  try {
    el.focus({ preventScroll: true });
  } catch {
    try {
      el.focus();
    } catch {
      /* ignore */
    }
  }
  try {
    el.setSelectionRange(0, String(el.value || '').length);
  } catch {
    try {
      el.select();
    } catch {
      /* ignore */
    }
  }
}

/**
 * 从「页面上已经可见的元素」复制（成功率最高，真实用户手势下几乎必成）
 * @returns {boolean}
 */
export function copyFromElement(el) {
  if (!el) return false;
  try {
    selectAll(el);
    return document.execCommand('copy');
  } catch {
    return false;
  }
}

/**
 * 复制文本。
 * @param {string} text 要复制的内容
 * @param {object} opts { el } el：页面上现成的可见文本框，优先从它复制
 * @returns {Promise<'ok'|'manual'|'fail'>}
 *   ok     复制成功
 *   manual 自动复制失败，调用方应把内容选中让用户长按复制
 *   fail   彻底失败（连文本框都没有）
 */
export async function copyText(text, opts = {}) {
  const value = String(text == null ? '' : text);

  /* 1. 先试页面上可见的文本框 —— 手机端最可靠 */
  if (opts.el) {
    if (copyFromElement(opts.el)) return 'ok';
  }

  /* 2. Clipboard API（需要安全上下文 + 焦点 + 用户手势） */
  if (window.isSecureContext && navigator.clipboard && navigator.clipboard.writeText) {
    try {
      await navigator.clipboard.writeText(value);
      return 'ok';
    } catch {
      /* 继续往下试 */
    }
  }

  /* 3. 临时 textarea + execCommand（iOS 要 setSelectionRange） */
  try {
    const ta = makeTemp(false);
    ta.value = value;
    document.body.appendChild(ta);
    selectAll(ta);
    const ok = document.execCommand('copy');
    ta.remove();
    if (ok) return 'ok';
  } catch {
    /* 继续 */
  }

  /* 4. contentEditable 兜底（有些 WebView 只认这条） */
  try {
    const div = makeTemp(true);
    div.textContent = value;
    document.body.appendChild(div);
    const range = document.createRange();
    range.selectNodeContents(div);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
    const ok = document.execCommand('copy');
    sel.removeAllRanges();
    div.remove();
    if (ok) return 'ok';
  } catch {
    /* 继续 */
  }

  return opts.el ? 'manual' : 'fail';
}

/**
 * 一键复制 + 统一的用户反馈。
 * @param {string} text
 * @param {object} opts { el, okText, manualText }
 * @param {object} ui ui 模块（传进来避免循环依赖）
 * @returns {Promise<boolean>} 是否成功
 */
export async function copyWithFeedback(text, opts, ui) {
  const r = await copyText(text, opts);
  if (r === 'ok') {
    ui.toast(opts.okText || '已复制', 'ok');
    return true;
  }
  if (r === 'manual') {
    ui.toast(opts.manualText || '已帮你全选，长按文本框点「复制」', 'err');
    return false;
  }
  ui.toast('这个浏览器不支持自动复制，请长按选中文字手动复制', 'err');
  return false;
}

export default { copyText, copyFromElement, copyWithFeedback, selectAll };

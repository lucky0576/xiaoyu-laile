/**
 * 小鱼来了 — UI 工具层
 */

/* ---------------- 转义与模板 ---------------- */
export function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function nl2br(s) {
  return esc(s).replace(/\n/g, '<br>');
}

/** 只允许安全的 http(s) / data:image 链接 */
export function safeUrl(u) {
  const s = String(u || '').trim();
  if (!s) return '';
  if (/^(https?:|\/|data:image\/)/i.test(s)) return s;
  return '';
}

/* ---------------- 格式化 ---------------- */
export function fmtDate(v, withTime = false) {
  if (!v) return '';
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return '';
  const p = (n) => String(n).padStart(2, '0');
  const base = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  return withTime ? `${base} ${p(d.getHours())}:${p(d.getMinutes())}` : base;
}

export function fmtRelative(v) {
  if (!v) return '';
  const t = new Date(v).getTime();
  if (Number.isNaN(t)) return '';
  const diff = Date.now() - t;
  const abs = Math.abs(diff);
  if (abs < 60_000) return diff >= 0 ? '刚刚' : '即将';
  if (abs < 3600_000) return `${Math.floor(abs / 60_000)} 分钟${diff >= 0 ? '前' : '后'}`;
  if (abs < 86400_000) return `${Math.floor(abs / 3600_000)} 小时${diff >= 0 ? '前' : '后'}`;
  if (abs < 30 * 86400_000) return `${Math.floor(abs / 86400_000)} 天${diff >= 0 ? '前' : '后'}`;
  return fmtDate(v);
}

export function fmtSize(bytes) {
  const n = Number(bytes) || 0;
  if (n < 1024) return `${n} B`;
  if (n < 1048576) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1073741824) return `${(n / 1048576).toFixed(1)} MB`;
  return `${(n / 1073741824).toFixed(2)} GB`;
}

export function fmtCount(n) {
  const v = Number(n) || 0;
  if (v < 1000) return String(v);
  if (v < 10000) return `${(v / 1000).toFixed(1)}k`;
  return `${(v / 10000).toFixed(1)}w`;
}

export function daysLeft(expiresAt) {
  if (!expiresAt) return null;
  const left = new Date(expiresAt).getTime() - Date.now();
  return Math.ceil(left / 86400_000);
}

export const KIND_ICON = {
  image: '🖼️', video: '🎬', audio: '🎵', pdf: '📕', word: '📘',
  ppt: '📙', excel: '📗', cad: '📐', archive: '🗜️', text: '📄', binary: '📎',
};
export const KIND_LABEL = {
  image: '图片', video: '视频', audio: '音频', pdf: 'PDF', word: 'Word',
  ppt: 'PPT', excel: 'Excel', cad: 'CAD 图纸', archive: '压缩包', text: '文本', binary: '文件',
};

export function reliabilityColor(level) {
  return { high: '#12a45b', good: '#0b74ff', medium: '#f59e0b', low: '#e5484d' }[level] || '#93a1b5';
}

export function initials(name) {
  const s = String(name || '').trim();
  if (!s) return '鱼';
  return /[\u4e00-\u9fa5]/.test(s) ? s.slice(0, 1) : s.slice(0, 2).toUpperCase();
}

export function avatarHtml(user, cls = '') {
  const url = safeUrl(user && (user.avatar || user.logo));
  if (url) return `<div class="avatar ${cls}"><img src="${esc(url)}" alt="" loading="lazy"></div>`;
  return `<div class="avatar ${cls}">${esc(initials(user && (user.nickname || user.name)))}</div>`;
}

/* ---------------- DOM ---------------- */
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export function on(root, event, selector, handler) {
  root.addEventListener(event, (e) => {
    const target = e.target.closest(selector);
    if (target && root.contains(target)) handler(e, target);
  });
}

/* ---------------- Toast ---------------- */
export function toast(message, type = '', ms = 2400) {
  const host = document.getElementById('toast-host');
  if (!host) return;
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = String(message);
  host.appendChild(el);
  setTimeout(() => {
    el.style.transition = 'opacity .25s';
    el.style.opacity = '0';
    setTimeout(() => el.remove(), 260);
  }, ms);
}

/* ---------------- 加载遮罩 ---------------- */
let loadingEl = null;
export function showLoading(text = '处理中…') {
  hideLoading();
  loadingEl = document.createElement('div');
  loadingEl.className = 'modal-mask';
  loadingEl.innerHTML = `<div class="modal center"><div class="spinner" style="border-color:#dbe6f5;border-top-color:#0b74ff;margin:0 auto 12px"></div><div>${esc(text)}</div></div>`;
  document.getElementById('modal-host').appendChild(loadingEl);
}
export function hideLoading() {
  if (loadingEl) {
    loadingEl.remove();
    loadingEl = null;
  }
}

/* ---------------- 确认框 ---------------- */
export function confirmDialog({ title = '确认', message = '', okText = '确定', cancelText = '取消', danger = false } = {}) {
  return new Promise((resolve) => {
    const host = document.getElementById('modal-host');
    const mask = document.createElement('div');
    mask.className = 'modal-mask';
    mask.innerHTML = `<div class="modal">
      <h3>${esc(title)}</h3>
      <div class="small muted">${nl2br(message)}</div>
      <div class="actions">
        <button class="btn" data-act="cancel">${esc(cancelText)}</button>
        <button class="btn ${danger ? 'btn-danger' : 'btn-primary'}" data-act="ok">${esc(okText)}</button>
      </div></div>`;
    host.appendChild(mask);
    const done = (v) => {
      mask.remove();
      resolve(v);
    };
    mask.addEventListener('click', (e) => {
      if (e.target === mask) return done(false);
      const act = e.target.closest('[data-act]');
      if (!act) return;
      done(act.dataset.act === 'ok');
    });
  });
}

/* ---------------- 提示输入 ---------------- */
export function promptDialog({ title = '输入', label = '', value = '', placeholder = '', multiline = false, okText = '确定' } = {}) {
  return new Promise((resolve) => {
    const host = document.getElementById('modal-host');
    const mask = document.createElement('div');
    mask.className = 'modal-mask';
    mask.innerHTML = `<div class="modal">
      <h3>${esc(title)}</h3>
      ${label ? `<div class="small muted mb8">${esc(label)}</div>` : ''}
      ${multiline
        ? `<textarea class="textarea" id="pd-input" placeholder="${esc(placeholder)}">${esc(value)}</textarea>`
        : `<input class="input" id="pd-input" value="${esc(value)}" placeholder="${esc(placeholder)}">`}
      <div class="actions">
        <button class="btn" data-act="cancel">取消</button>
        <button class="btn btn-primary" data-act="ok">${esc(okText)}</button>
      </div></div>`;
    host.appendChild(mask);
    const input = mask.querySelector('#pd-input');
    setTimeout(() => input && input.focus(), 60);
    const done = (v) => {
      mask.remove();
      resolve(v);
    };
    mask.addEventListener('click', (e) => {
      if (e.target === mask) return done(null);
      const act = e.target.closest('[data-act]');
      if (!act) return;
      done(act.dataset.act === 'ok' ? input.value.trim() : null);
    });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !multiline) done(input.value.trim());
    });
  });
}

/* ---------------- 底部抽屉 ---------------- */
/**
 * 把用户选的图片读成压缩后的 dataUrl。
 *
 * 名片拍出来动辄 3~5MB，直接传会把视觉接口打爆，
 * 所以先按最长边缩到 1280、转成 JPEG 0.82，一般 150~300KB 就够识别了。
 */
export function readImageAsDataUrl(file, { maxSide = 1280, quality = 0.82 } = {}) {
  return new Promise((resolve, reject) => {
    if (!file || !/^image\//.test(file.type || '')) {
      reject(new Error('请选择图片文件'));
      return;
    }
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      try {
        URL.revokeObjectURL(url);
        const scale = Math.min(1, maxSide / Math.max(img.naturalWidth || 1, img.naturalHeight || 1));
        const w = Math.max(1, Math.round((img.naturalWidth || 1) * scale));
        const h = Math.max(1, Math.round((img.naturalHeight || 1) * scale));
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        canvas.getContext('2d').drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', quality));
      } catch (err) {
        reject(err);
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('图片读取失败'));
    };
    img.src = url;
  });
}

export function openSheet({ title = '', content = '', onMount, className = '' } = {}) {
  const host = document.getElementById('sheet-host');
  const mask = document.createElement('div');
  mask.className = 'sheet-mask';
  const sheet = document.createElement('div');
  sheet.className = `sheet ${className}`;
  sheet.innerHTML = `<div class="sheet-handle"></div>${title ? `<h3>${esc(title)}</h3>` : ''}<div class="sheet-content">${content}</div>`;
  host.appendChild(mask);
  host.appendChild(sheet);
  const close = () => {
    mask.remove();
    sheet.remove();
  };
  mask.addEventListener('click', close);
  if (onMount) onMount(sheet, close);
  return { close, sheet };
}

/* ---------------- 底部弹层选择器 ---------------- */
export function pickSheet({ title, options, value, multiple = false, onPick }) {
  const items = options.map((o) => {
    const active = multiple ? (value || []).includes(o.value) : o.value === value;
    return `<div class="share-mode ${active ? 'active' : ''}" data-value="${esc(o.value)}" style="margin-bottom:8px">
      ${o.icon ? `<div class="ico">${o.icon}</div>` : ''}
      <div class="grow"><div class="strong">${esc(o.label)}</div>${o.desc ? `<div class="tiny dim">${esc(o.desc)}</div>` : ''}</div>
      ${active ? '<div class="badge">已选</div>' : ''}
    </div>`;
  }).join('');
  return openSheet({
    title,
    content: `<div id="pick-list">${items}</div>`,
    onMount(sheet, close) {
      sheet.addEventListener('click', (e) => {
        const el = e.target.closest('[data-value]');
        if (!el) return;
        const v = el.dataset.value;
        if (multiple) {
          el.classList.toggle('active');
          el.querySelector('.badge')?.remove();
          if (el.classList.contains('active')) el.insertAdjacentHTML('beforeend', '<div class="badge">已选</div>');
          return;
        }
        close();
        onPick && onPick(v);
      });
      if (multiple) {
        sheet.insertAdjacentHTML('beforeend', '<button class="btn btn-primary btn-block mt12" id="pick-done">完成</button>');
        sheet.querySelector('#pick-done').addEventListener('click', () => {
          const vals = [...sheet.querySelectorAll('#pick-list .active')].map((el) => el.dataset.value);
          close();
          onPick && onPick(vals);
        });
      }
    },
  });
}

/* ---------------- 空状态 ---------------- */
export function emptyState(icon, text, action = '') {
  return `<div class="empty"><div class="ico">${icon}</div><div>${esc(text)}</div>${action}</div>`;
}

export function skeletonList(n = 3) {
  return Array.from({ length: n })
    .map(() => `<div class="item"><div class="skeleton item-thumb"></div><div class="item-body"><div class="skeleton" style="height:16px;width:80%"></div><div class="skeleton mt8" style="height:13px;width:60%"></div><div class="skeleton mt8" style="height:12px;width:40%"></div></div></div>`)
    .join('');
}

/* ---------------- 文件选择 ---------------- */
export function pickFiles({ accept = '', multiple = true } = {}) {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.multiple = multiple;
    input.style.display = 'none';
    document.body.appendChild(input);
    input.addEventListener('change', () => {
      const files = [...(input.files || [])];
      input.remove();
      resolve(files);
    });
    // 用户取消时也能清理
    window.addEventListener('focus', function once() {
      window.removeEventListener('focus', once);
      setTimeout(() => {
        if (document.body.contains(input)) {
          input.remove();
          resolve([]);
        }
      }, 800);
    });
    input.click();
  });
}

export function copyText(text) {
  return new Promise((resolve) => {
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text).then(() => resolve(true)).catch(() => resolve(fallback()));
    } else {
      resolve(fallback());
    }
    function fallback() {
      try {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        const ok = document.execCommand('copy');
        ta.remove();
        resolve(ok);
      } catch {
        resolve(false);
      }
    }
  });
}

export function debounce(fn, ms = 300) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

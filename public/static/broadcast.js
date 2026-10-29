/**
 * 小鱼来了 — 多选群发
 *
 * 用法：列表页点「☑ 多选」，勾几条，点底部「生成群发文案」。
 *
 * 为什么不是直接「发送到微信」：
 *   微信没有给第三方开放「给任意群发消息」的接口。
 *   所以这里生成好文案，一键复制，用户粘到群里 —— 任何微信都能用。
 *   如果服务器配了企业微信机器人 webhook，还会多一个「推送到企业微信群」按钮。
 */

import * as ui from './ui.js';
import { service } from './api.js';

/** 复制文本：优先 Clipboard API，失败退回 execCommand */
async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      ta.remove();
      return ok;
    } catch {
      return false;
    }
  }
}

/**
 * 打开群发文案面板。
 * @param {string[]} ids 选中的信息 id
 */
export async function openBroadcast(ids) {
  if (!ids || !ids.length) {
    ui.toast('先勾选要群发的信息', 'err');
    return;
  }

  ui.showLoading('正在生成文案…');
  let r = null;
  let wecom = { configured: false };
  try {
    const [textRes, wecomRes] = await Promise.all([
      service.broadcastText({ ids, includeSummary: true, includeMeta: true }),
      service.broadcastWecomStatus().catch(() => ({ configured: false })),
    ]);
    r = textRes;
    wecom = wecomRes || { configured: false };
  } catch (err) {
    ui.hideLoading();
    ui.toast(err.message || '生成失败', 'err');
    return;
  }
  ui.hideLoading();

  if (!r || !r.text) {
    ui.toast('没生成出文案', 'err');
    return;
  }

  const mask = document.createElement('div');
  mask.className = 'bcast-mask';
  mask.innerHTML = `<div class="bcast">
    <div class="bcast-head">
      <div>
        <div class="bcast-title">转发文案</div>
        <div class="tiny dim">已选 ${r.count || ids.length} 条 · 可直接改</div>
      </div>
      <button class="bcast-x" type="button" aria-label="关闭">✕</button>
    </div>
    <div class="bcast-body">
      <label class="bcast-opt">
        <input type="checkbox" id="bcast-link" ${localStorage.getItem('xyl_bcast_link') === '0' ? '' : 'checked'}>
        <span>带上站内链接（方便对方点开看详情）</span>
      </label>
      <textarea class="bcast-text" id="bcast-text" spellcheck="false"></textarea>
      ${(r.missing || []).length ? `<div class="tiny dim mt6">有 ${r.missing.length} 条已下架，已自动跳过</div>` : ''}
    </div>
    <div class="bcast-foot">
      <button class="btn btn-primary grow" id="bcast-copy" type="button">📋 复制全部文案</button>
      ${wecom.configured ? '<button class="btn grow" id="bcast-wecom" type="button">🚀 推送到企业微信群</button>' : ''}
    </div>
    <div class="tiny dim center bcast-tip">复制后打开微信，粘贴到群里发送即可</div>
  </div>`;
  document.body.appendChild(mask);
  requestAnimationFrame(() => mask.classList.add('show'));

  const ta = mask.querySelector('#bcast-text');
  ta.value = r.text;

  /* 带不带链接：勾掉就重新生成一版不带链接的，选择记在本地，下次沿用 */
  const linkBox = mask.querySelector('#bcast-link');
  if (linkBox) {
    linkBox.addEventListener('change', async () => {
      const want = linkBox.checked;
      try {
        localStorage.setItem('xyl_bcast_link', want ? '1' : '0');
      } catch {
        /* 隐私模式忽略 */
      }
      try {
        ui.showLoading(want ? '正在补链接…' : '正在去掉链接…');
        const rr = await service.broadcastText({
          ids,
          includeSummary: true,
          includeMeta: true,
          includeLink: want,
        });
        ta.value = rr.text || ta.value;
        ui.hideLoading();
        ui.toast(want ? '已带上链接' : '已去掉链接，纯文字版', 'ok');
      } catch (err) {
        ui.hideLoading();
        ui.toast(err.message || '重新生成失败', 'err');
        linkBox.checked = !want;
      }
    });
  }

  const close = () => {
    mask.classList.remove('show');
    setTimeout(() => mask.remove(), 200);
  };

  mask.querySelector('.bcast-x').addEventListener('click', close);
  mask.addEventListener('click', (ev) => {
    if (ev.target === mask) close();
  });

  mask.querySelector('#bcast-copy').addEventListener('click', async () => {
    const ok = await copyText(ta.value);
    ui.toast(ok ? '已复制，去微信粘贴就行' : '复制失败，请长按选中手动复制', ok ? 'ok' : 'err');
    if (ok) close();
  });

  const wecomBtn = mask.querySelector('#bcast-wecom');
  if (wecomBtn) {
    wecomBtn.addEventListener('click', async () => {
      if (!confirm('确定把这段文案推送到企业微信群？')) return;
      wecomBtn.disabled = true;
      wecomBtn.textContent = '推送中…';
      try {
        await service.broadcastWecom({ text: ta.value });
        ui.toast('已推送到企业微信群', 'ok');
        close();
      } catch (err) {
        ui.toast(err.message || '推送失败', 'err');
        wecomBtn.disabled = false;
        wecomBtn.textContent = '🚀 推送到企业微信群';
      }
    });
  }
}

/**
 * 给列表容器挂上多选能力。
 *
 * @param {HTMLElement} root    页面根节点
 * @param {HTMLElement} box     列表容器（#list-box）
 * @param {HTMLElement} btn     多选按钮
 */
export function bindPicking(root, box, btn) {
  if (!root || !box || !btn) return;
  const picked = new Set();
  let on = false;

  const bar = document.createElement('div');
  bar.className = 'pick-bar';
  bar.innerHTML = `<span class="pick-count">已选 <b>0</b> 条</span>
    <button class="btn btn-sm" type="button" data-act="clear">清空</button>
    <button class="btn btn-sm btn-primary" type="button" data-act="go">生成转发文案</button>`;
  box.parentNode.insertBefore(bar, box.nextSibling);

  const paint = () => {
    bar.querySelector('.pick-count b').textContent = String(picked.size);
    bar.classList.toggle('show', on && picked.size > 0);
    btn.classList.toggle('active', on);
    btn.textContent = on ? '✕ 退出转发' : '☑ 转发';
  };

  const toggle = (el) => {
    const id = el.getAttribute('href')?.match(/detail\/([^?]+)/)?.[1];
    if (!id) return;
    if (picked.has(id)) {
      picked.delete(id);
      el.classList.remove('sel');
    } else {
      if (picked.size >= 20) {
        ui.toast('一次最多选 20 条', 'err');
        return;
      }
      picked.add(id);
      el.classList.add('sel');
    }
    paint();
  };

  // 多选模式下拦截点击，不跳详情
  box.addEventListener(
    'click',
    (ev) => {
      if (!on) return;
      const el = ev.target.closest('a.item, a.home-item');
      if (!el) return;
      ev.preventDefault();
      ev.stopPropagation();
      toggle(el);
    },
    true,
  );

  btn.addEventListener('click', () => {
    on = !on;
    box.classList.toggle('picking', on);
    if (!on) {
      picked.clear();
      box.querySelectorAll('.sel').forEach((x) => x.classList.remove('sel'));
    }
    paint();
  });

  bar.addEventListener('click', (ev) => {
    const act = ev.target.dataset?.act;
    if (act === 'clear') {
      picked.clear();
      box.querySelectorAll('.sel').forEach((x) => x.classList.remove('sel'));
      paint();
    } else if (act === 'go') {
      openBroadcast([...picked]);
    }
  });

  paint();
}

export default { openBroadcast, bindPicking };

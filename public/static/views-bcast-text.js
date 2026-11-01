/**
 * 小鱼来了 — 群发文案「纯文本页」（#/bcast-text）
 *
 * 为什么要有这一页：
 *   某些微信内置浏览器 / 个别 WebView 里 document.execCommand('copy')
 *   和 navigator.clipboard 都会被禁用，一键复制怎么点都失败。
 *   这时候唯一 100% 可靠的办法是：把文案放进一个「只有文字的页面」，
 *   让用户长按选择（或 Ctrl+A）走系统自带的复制菜单。
 *
 * 数据传递：openBroadcast 把文案写进 sessionStorage，这里读出来。
 */

import * as ui from './ui.js';

const KEY = 'xyl_bcast_text';

export function stashBroadcastText(text) {
  try {
    sessionStorage.setItem(KEY, String(text || ''));
    return true;
  } catch {
    return false;
  }
}

export function renderBcastText(ctx) {
  let text = '';
  try {
    text = sessionStorage.getItem(KEY) || '';
  } catch {
    text = '';
  }

  const html = `<div class="page btx-page">
    <div class="btx-tip">
      <div class="btx-tip-t">👇 长按下面的文字 → 全选 → 复制</div>
      <div class="btx-tip-d">这个页面只有文字，系统自带的复制一定可用。</div>
    </div>
    <pre class="btx-pre" id="btx-pre">${ui.esc(text)}</pre>
    <div class="row gap8 mt12" style="flex-wrap:wrap">
      <button class="btn btn-sm btn-primary" id="btx-select" type="button">全选文字</button>
      <button class="btn btn-sm" id="btx-copy" type="button">再试一次自动复制</button>
      <a class="btn btn-sm" href="#/broadcast">返回</a>
    </div>
    ${text ? '' : '<div class="empty">没有拿到文案，请返回重新生成</div>'}
  </div>`;

  return {
    title: '复制文案',
    content: html,
    showBack: true,
    activeTab: '',
    mount(root) {
      const pre = root.querySelector('#btx-pre');

      /* 默认把文字选中，用户长按就有「复制」菜单 */
      const selectPre = () => {
        if (!pre) return false;
        try {
          const range = document.createRange();
          range.selectNodeContents(pre);
          const sel = window.getSelection();
          sel.removeAllRanges();
          sel.addRange(range);
          return true;
        } catch {
          return false;
        }
      };
      setTimeout(selectPre, 120);

      root.querySelector('#btx-select')?.addEventListener('click', () => {
        const ok = selectPre();
        ui.toast(ok ? '已全选，长按文字点「复制」' : '请手动长按文字选择', ok ? 'ok' : 'err');
      });

      root.querySelector('#btx-copy')?.addEventListener('click', async () => {
        // 这一页的文字是可见的 <pre>，用 Range 选中后 execCommand 成功率更高
        if (!selectPre()) {
          ui.toast('请长按文字手动复制', 'err');
          return;
        }
        let ok = false;
        try {
          ok = document.execCommand('copy');
        } catch {
          ok = false;
        }
        if (!ok && navigator.clipboard && navigator.clipboard.writeText) {
          try {
            await navigator.clipboard.writeText(text);
            ok = true;
          } catch {
            ok = false;
          }
        }
        ui.toast(ok ? '已复制' : '这个浏览器禁用了自动复制，请长按文字手动复制', ok ? 'ok' : 'err');
      });
    },
  };
}

export default { renderBcastText, stashBroadcastText };

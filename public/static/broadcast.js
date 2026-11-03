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
import { copyText, copyWithFeedback, selectAll, shareText } from './clipboard.js';
import { stashBroadcastText } from './views-bcast-text.js';

/**
 * 打开群发文案面板。
 * @param {string[]} ids 选中的信息 id
 */
export async function openBroadcast(ids, opts = {}) {
  /*
   * 是否屏蔽「系统采集的网上公开信息」（招投标、政务公告等）。
   * 默认屏蔽：转发别人的公告既没价值，也有版权风险。
   * 用户可在面板里关掉。
   */
  let onlyUser = opts.onlyUser;
  if (typeof onlyUser !== 'boolean') {
    try {
      onlyUser = localStorage.getItem('xyl_bcast_onlyuser') !== '0';
    } catch {
      onlyUser = true;
    }
  }

  // 不传就沿用上次的选择（默认带链接）
  let includeLink = opts.includeLink;
  if (typeof includeLink !== 'boolean') {
    try {
      includeLink = localStorage.getItem('xyl_bcast_link') !== '0';
    } catch {
      includeLink = true;
    }
  }
  if (!ids || !ids.length) {
    ui.toast('先勾选要群发的信息', 'err');
    return;
  }

  ui.showLoading('正在生成文案…');
  let r = null;
  let wecom = { configured: false };
  try {
    const [textRes, wecomRes] = await Promise.all([
      service.broadcastText({ ids, includeSummary: true, includeMeta: true, includeLink, onlyUser }),
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
      <div class="bcast-modes" id="bcast-modes">
        <button class="bcast-mode ${includeLink ? 'active' : ''}" type="button" data-mode="link">
          📋 带链接版 <span class="tiny dim">对方能点开看详情</span>
        </button>
        <button class="bcast-mode ${includeLink ? '' : 'active'}" type="button" data-mode="plain">
          📝 纯文字版 <span class="tiny dim">只有标题，适合朋友圈</span>
        </button>
      </div>
      <label class="bcast-filter" for="bcast-onlyuser">
        <input type="checkbox" id="bcast-onlyuser" ${onlyUser ? 'checked' : ''}>
        <span>屏蔽网上采集的内容 <span class="tiny dim">（招投标、政务公告等，转发没意义）</span></span>
      </label>
      <textarea class="bcast-text" id="bcast-text" spellcheck="false" readonly></textarea>
      <div class="bcast-img-wrap hide" id="bcast-img-wrap">
        <img class="bcast-img" id="bcast-img" alt="群发文案长图">
        <div class="tiny dim center mt6">长按图片 → 保存图片 或 直接发送</div>
      </div>
      ${(r.missing || []).length ? `<div class="tiny dim mt6">有 ${r.missing.length} 条已下架，已自动跳过</div>` : ''}
    </div>
    <div class="bcast-foot">
      <button class="btn btn-primary grow" id="bcast-copy" type="button">📋 复制全部文案</button>
      <button class="btn grow" id="bcast-image" type="button">🖼 生成图片发群</button>
      ${wecom.configured ? '<button class="btn grow" id="bcast-wecom" type="button">🚀 推送到企业微信群</button>' : ''}
    </div>
    <div class="tiny dim center bcast-tip">复制后打开微信，粘贴到群里发送即可</div>
  </div>`;
  document.body.appendChild(mask);
  requestAnimationFrame(() => mask.classList.add('show'));

  const ta = mask.querySelector('#bcast-text');
  ta.value = r.text;

  /* 两种模式：随时切换，重新生成一版，选择记在本地，下次沿用 */
  const modesBox = mask.querySelector('#bcast-modes');
  if (modesBox) {
    modesBox.addEventListener('click', async (ev) => {
      const btn = ev.target.closest('[data-mode]');
      if (!btn) return;
      const want = btn.dataset.mode === 'link';
      if (want === includeLink) return;

      try {
        localStorage.setItem('xyl_bcast_link', want ? '1' : '0');
      } catch {
        /* 隐私模式忽略 */
      }

      modesBox.querySelectorAll('.bcast-mode').forEach((el) => el.classList.toggle('active', el === btn));
      const prev = ta.value;
      try {
        ui.showLoading(want ? '正在生成带链接版…' : '正在生成纯文字版…');
        const rr = await service.broadcastText({
          ids,
          includeSummary: true,
          includeMeta: true,
          includeLink: want,
          onlyUser,
        });
        ta.value = rr.text || prev;
        includeLink = want;
        ui.hideLoading();
        ui.toast(want ? '已切到带链接版' : '已切到纯文字版', 'ok');
      } catch (err) {
        ui.hideLoading();
        ui.toast(err.message || '重新生成失败', 'err');
        modesBox
          .querySelectorAll('.bcast-mode')
          .forEach((el) => el.classList.toggle('active', (el.dataset.mode === 'link') === includeLink));
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

  /* 屏蔽开关：切换后重新生成一版文案 */
  const onlyUserBox = mask.querySelector('#bcast-onlyuser');
  onlyUserBox?.addEventListener('change', async () => {
    onlyUser = Boolean(onlyUserBox.checked);
    try {
      localStorage.setItem('xyl_bcast_onlyuser', onlyUser ? '1' : '0');
    } catch {
      /* 隐私模式忽略 */
    }
    ui.showLoading('正在重新生成…');
    try {
      const rr = await service.broadcastText({
        ids,
        includeSummary: true,
        includeMeta: true,
        includeLink,
        onlyUser,
      });
      ta.value = rr.text || '';
      const blockedN = (rr.blocked || []).length;
      ui.toast(
        onlyUser
          ? `已屏蔽 ${blockedN} 条采集内容，剩 ${rr.count} 条`
          : `已包含全部内容，共 ${rr.count} 条`,
        'ok',
      );
    } catch (err) {
      ui.toast(err.message || '重新生成失败', 'err');
    } finally {
      ui.hideLoading();
    }
  });

  /* 生成图片：给禁用复制的浏览器留最后一条路 */
  mask.querySelector('#bcast-image')?.addEventListener('click', async () => {
    const btn = mask.querySelector('#bcast-image');
    btn.disabled = true;
    const old = btn.textContent;
    btn.textContent = '生成中…';
    try {
      const r = await service.broadcastImage({ ids, includeLink, onlyUser });
      const wrap = mask.querySelector('#bcast-img-wrap');
      const img = mask.querySelector('#bcast-img');
      img.src = r.url;
      wrap.classList.remove('hide');
      mask.querySelector('.bcast-text').classList.add('hide');
      ui.toast('图片已生成，长按图片保存或直接发送', 'ok');
    } catch (err) {
      ui.toast(err.message || '生成图片失败', 'err');
    } finally {
      btn.disabled = false;
      btn.textContent = old;
    }
  });

  mask.querySelector('#bcast-copy').addEventListener('click', async () => {
    /*
     * 第 1 优先：直接复制页面上这个可见的文本框。
     * 手机浏览器里这比临时元素可靠得多 —— 元素可见、在视口内、有真实手势。
     */
    const ok = await copyWithFeedback(
      ta.value,
      {
        el: ta,
        okText: '已复制，去微信粘贴就行',
        manualText: '自动复制失败，已帮你全选：长按文本框点「复制」',
      },
      ui,
    );
    if (ok) {
      close();
      return;
    }
    /*
     * 自动复制彻底失败（微信内置浏览器 / 部分 WebView 会禁用 execCommand）。
     * 三条后路，按成功率排：
     *   1. 系统分享面板（部分浏览器支持，分享到微信一步到位）
     *   2. 打开纯文本页，让用户长按走系统复制（最可靠）
     *   3. 当前页已全选，长按也能复制
     */
    mask.classList.add('copy-failed');
    selectAll(ta);
    ta.scrollIntoView({ block: 'center' });

    const tipBox = mask.querySelector('.bcast-tip');
    if (tipBox && !tipBox.dataset.enhanced) {
      tipBox.dataset.enhanced = '1';
      const extra = document.createElement('div');
      extra.className = 'bcast-manual';
      extra.innerHTML = `
        <div class="bm-t">这个浏览器不让自动复制，用下面两种方式之一：</div>
        <button class="btn btn-sm btn-primary" type="button" data-manual="page">📄 打开纯文本页，长按复制</button>
        <button class="btn btn-sm" type="button" data-manual="share">📤 用系统分享发到微信</button>`;
      tipBox.appendChild(extra);

      extra.querySelector('[data-manual="page"]')?.addEventListener('click', () => {
        if (!stashBroadcastText(ta.value)) {
          ui.toast('存储不可用，请直接长按上面的文字复制', 'err');
          return;
        }
        // 先关面板再跳转，否则弹窗会盖在纯文本页上面
        close();
        setTimeout(() => {
          location.hash = '#/bcast-text';
        }, 220);
      });

      extra.querySelector('[data-manual="share"]')?.addEventListener('click', async () => {
        const ok = await shareText({ title: '转发文案', text: ta.value });
        if (ok) close();
        else ui.toast('这个浏览器也不支持分享，请用「打开纯文本页」', 'err');
      });
    }
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
    <button class="btn btn-sm btn-primary" type="button" data-act="go-link">📋 带链接</button>
    <button class="btn btn-sm" type="button" data-act="go-plain">📝 纯文字</button>`;
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
      if (picked.size >= 30) {
        ui.toast('一次最多选 30 条', 'err');
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
    } else if (act === 'go-link') {
      openBroadcast([...picked], { includeLink: true });
    } else if (act === 'go-plain') {
      openBroadcast([...picked], { includeLink: false });
    }
  });

  paint();
}

export default { openBroadcast, bindPicking };

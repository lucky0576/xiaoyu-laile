/**
 * 小鱼来了 — 分享模块
 *
 * 两种分享形态（对应需求："图片+文字带二维码" 与 "链接+标题文字"）：
 *   1. 海报分享：Canvas 合成「封面 + 主副标题 + 二维码」，可保存/转发到朋友圈、微信群
 *   2. 链接分享：标准网页链接，微信内通过 JS-SDK 展示标题、摘要与封面图
 */
import { service } from './api.js';
import { esc, toast, openSheet, copyText, safeUrl, showLoading, hideLoading } from './ui.js';

/* ------------------------------------------------------------------ */
/* 微信 JS-SDK                                                         */
/* ------------------------------------------------------------------ */
let wxLoading = null;
function loadWxSdk() {
  if (window.wx) return Promise.resolve(window.wx);
  if (wxLoading) return wxLoading;
  wxLoading = new Promise((resolve) => {
    const s = document.createElement('script');
    s.src = 'https://res.wx.qq.com/open/js/jweixin-1.6.0.js';
    s.onload = () => resolve(window.wx);
    s.onerror = () => resolve(null);
    document.head.appendChild(s);
  });
  return wxLoading;
}

export function isWechatBrowser() {
  return /micromessenger/i.test(navigator.userAgent);
}

/**
 * 配置微信内分享。未配置公众号时静默跳过，不影响其它分享方式。
 */
export async function setupWechatShare(listing) {
  try {
    const cfg = await service.wechatShare(listing.id, location.href.split('#')[0]);
    if (!cfg || !cfg.jsSdk) return false;
    const wx = await loadWxSdk();
    if (!wx) return false;

    wx.config({
      debug: false,
      appId: cfg.jsSdk.appId,
      timestamp: cfg.jsSdk.timestamp,
      nonceStr: cfg.jsSdk.nonceStr,
      signature: cfg.jsSdk.signature,
      jsApiList: ['updateAppMessageShareData', 'updateTimelineShareData', 'onMenuShareAppMessage', 'onMenuShareTimeline'],
    });
    const payload = {
      title: cfg.title,
      desc: cfg.desc,
      link: cfg.url,
      imgUrl: cfg.imgUrl,
    };
    wx.ready(() => {
      try {
        wx.updateAppMessageShareData({ ...payload, success() {} });
        wx.updateTimelineShareData({ title: payload.title, link: payload.link, imgUrl: payload.imgUrl });
        wx.onMenuShareAppMessage && wx.onMenuShareAppMessage(payload);
        wx.onMenuShareTimeline && wx.onMenuShareTimeline({ title: payload.title, link: payload.link, imgUrl: payload.imgUrl });
      } catch { /* ignore */ }
    });
    return true;
  } catch {
    return false;
  }
}

/* ------------------------------------------------------------------ */
/* 海报绘制                                                            */
/* ------------------------------------------------------------------ */
function loadImage(src) {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

function wrapText(ctx, text, maxWidth, maxLines = 3) {
  const chars = [...String(text || '')];
  const lines = [];
  let cur = '';
  for (const ch of chars) {
    if (ch === '\n') {
      lines.push(cur);
      cur = '';
      if (lines.length >= maxLines) break;
      continue;
    }
    const test = cur + ch;
    if (ctx.measureText(test).width > maxWidth && cur) {
      lines.push(cur);
      cur = ch;
      if (lines.length >= maxLines) break;
    } else {
      cur = test;
    }
  }
  if (lines.length < maxLines && cur) lines.push(cur);
  const out = lines.slice(0, maxLines);
  /*
   * 如果还有没排下的字，在末行补省略号 ——
   * 否则用户会看到一句话被硬生生截断，且不知道后面还有内容。
   */
  if (out.length && lines.length >= maxLines && cur) {
    const last = out[out.length - 1];
    out[out.length - 1] = `${last.replace(/…$/, '')}…`;
  }
  return out;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/**
 * 生成分享海报。尺寸 750 × 1050。
 */
export async function renderPoster({ title, subtitle, summary, qrText, coverUrl, meta = [], sharerName = '', avatarUrl = '', coverHeight = 0 }) {
  const W = 750;
  const H = 1050;
  const canvas = document.createElement('canvas');
  canvas.width = W * 2;
  canvas.height = H * 2;
  const ctx = canvas.getContext('2d');
  ctx.scale(2, 2);

  // 背景
  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, '#f7faff');
  bg.addColorStop(1, '#eef7f6');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  /*
   * 封面区。
   *
   * 之前固定 470 高，再用 Math.max 做「cover 式」填充 ——
   * 自动生成的封面是 1200×630（1.9:1），塞进 690×470（1.47:1）的框里
   * 会被左右各裁掉约 100px，标题正好在边缘，于是「文字看不到」。
   *
   * 现在让封面高度跟随图片自身比例，最多 520、最少 240，
   * 这样既能完整显示，也不会把下面的正文卡片挤没。
   */
  const cover = coverUrl ? await loadImage(coverUrl) : null;
  const coverW = W - 60;
  let coverH = Number(coverHeight) > 0 ? Math.round(Number(coverHeight)) : 470;
  if (cover && cover.width && cover.height) {
    const naturalH = Math.round((coverW * cover.height) / cover.width);
    coverH = Math.max(240, Math.min(520, naturalH));
  }
  ctx.save();
  roundRect(ctx, 30, 30, coverW, coverH, 24);
  ctx.clip();
  if (cover) {
    // 高度已经贴合比例，这里用 contain 保证不裁切
    const scale = Math.min(coverW / cover.width, coverH / cover.height);
    const dw = cover.width * scale;
    const dh = cover.height * scale;
    ctx.drawImage(cover, 30 + (coverW - dw) / 2, 30 + (coverH - dh) / 2, dw, dh);
  } else {
    const g = ctx.createLinearGradient(30, 30, W - 30, coverH);
    g.addColorStop(0, '#0b74ff');
    g.addColorStop(1, '#00c2b2');
    ctx.fillStyle = g;
    ctx.fillRect(30, 30, W - 60, coverH);
    // 没配图时放品牌 logo，不再用 emoji
    const logoBig = await loadImage('/static/logo-white@2x.png').catch(() => null);
    if (logoBig) {
      const lw = 360;
      const lh = Math.round((lw * logoBig.naturalHeight) / logoBig.naturalWidth);
      ctx.drawImage(logoBig, (W - lw) / 2, coverH / 2 - lh / 2, lw, lh);
    } else {
      ctx.fillStyle = 'rgba(255,255,255,.95)';
      ctx.font = 'bold 96px -apple-system,"PingFang SC","Microsoft YaHei",sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('小鱼来了', W / 2, coverH / 2 + 30);
      ctx.textAlign = 'left';
    }
  }
  ctx.restore();

  // 品牌条：用真 logo，不再画文字
  ctx.fillStyle = 'rgba(11,116,255,.96)';
  roundRect(ctx, 30, 30, 208, 56, 16);
  ctx.fill();
  const logoPill = await loadImage('/static/logo-white@2x.png').catch(() => null);
  if (logoPill) {
    const ph = 26;
    const pw = Math.round((ph * logoPill.naturalWidth) / logoPill.naturalHeight);
    ctx.drawImage(logoPill, 30 + (208 - pw) / 2, 30 + (56 - ph) / 2, pw, ph);
  } else {
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 26px -apple-system,"PingFang SC","Microsoft YaHei",sans-serif';
    ctx.fillText('小鱼来了', 54, 65);
  }

  /*
   * 分享者胶囊：「[头像] 张工 邀请你」
   * 放在封面右上角。带上具体的人比纯品牌更容易被点开。
   */
  if (sharerName) {
    const nameTxt = String(sharerName).slice(0, 8);
    const label = nameTxt.length > 5 ? `${nameTxt.slice(0, 5)}… 邀请你` : `${nameTxt} 邀请你`;
    ctx.font = 'bold 24px -apple-system,"PingFang SC","Microsoft YaHei",sans-serif';
    const labelW = ctx.measureText(label).width;
    const avSize = 40;
    const padL = 8;
    const padR = 18;
    const pillH = 56;
    const pillW = padL + avSize + 10 + labelW + padR;
    const pillX = W - 30 - pillW;
    const pillY = 30 + 14;

    ctx.fillStyle = 'rgba(0,0,0,.42)';
    roundRect(ctx, pillX, pillY, pillW, pillH, pillH / 2);
    ctx.fill();

    // 头像
    const avX = pillX + padL + avSize / 2;
    const avY = pillY + pillH / 2;
    const avImg = avatarUrl ? await loadImage(avatarUrl) : null;
    ctx.save();
    ctx.beginPath();
    ctx.arc(avX, avY, avSize / 2, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();
    if (avImg) {
      const s = Math.max(avSize / avImg.width, avSize / avImg.height);
      const dw = avImg.width * s;
      const dh = avImg.height * s;
      ctx.drawImage(avImg, avX - dw / 2, avY - dh / 2, dw, dh);
    } else {
      ctx.fillStyle = '#0b74ff';
      ctx.fillRect(avX - avSize / 2, avY - avSize / 2, avSize, avSize);
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 22px -apple-system,"PingFang SC","Microsoft YaHei",sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(nameTxt.slice(0, 1) || '小', avX, avY + 1);
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';
    }
    ctx.restore();

    // 文字
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 24px -apple-system,"PingFang SC","Microsoft YaHei",sans-serif';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, pillX + padL + avSize + 10, avY + 1);
    ctx.textBaseline = 'alphabetic';
  }

  // 正文卡片
  const cardY = 30 + coverH + 24;
  const cardH = H - cardY - 30;
  ctx.save();
  ctx.shadowColor = 'rgba(16,32,60,.10)';
  ctx.shadowBlur = 24;
  ctx.shadowOffsetY = 6;
  ctx.fillStyle = '#fff';
  roundRect(ctx, 30, cardY, W - 60, cardH, 24);
  ctx.fill();
  ctx.restore();

  const padX = 58;
  let y = cardY + 62;
  const maxW = W - padX * 2;

  /*
   * 主标题：自适应字号 + 最多 4 行。
   * 之前固定 42px、最多 2 行，长标题直接被截掉后半截。
   */
  ctx.fillStyle = '#16202e';
  const FONT_STACK = '-apple-system,"PingFang SC","Microsoft YaHei",sans-serif';
  let titleFont = 42;
  let titleLines = [];
  for (const f of [42, 38, 34, 30, 27, 24]) {
    ctx.font = `bold ${f}px ${FONT_STACK}`;
    const lines = wrapText(ctx, title, maxW, 4);
    // 行数够放下、且最后一行没被截断，就用这个字号
    const allFit = lines.join('').replace(/…$/, '').length >= String(title).length - 2;
    if (allFit) {
      titleFont = f;
      titleLines = lines;
      break;
    }
    titleFont = f;
    titleLines = lines;
  }
  const titleStep = Math.round(titleFont * 1.34);
  titleLines.forEach((line) => {
    ctx.fillText(line, padX, y);
    y += titleStep;
  });

  // 副标题：同样放宽到 3 行
  if (subtitle) {
    ctx.fillStyle = '#5a6b82';
    let subFont = 27;
    let subLines = [];
    for (const f of [27, 24, 21]) {
      ctx.font = `${f}px ${FONT_STACK}`;
      subLines = wrapText(ctx, subtitle, maxW, 3);
      subFont = f;
      if (subLines.join('').replace(/…$/, '').length >= String(subtitle).length - 2) break;
    }
    const subStep = Math.round(subFont * 1.45);
    subLines.forEach((line) => {
      ctx.fillText(line, padX, y);
      y += subStep;
    });
  }
  y += 10;

  // 分隔线
  ctx.strokeStyle = '#e8ecf3';
  ctx.beginPath();
  ctx.moveTo(padX, y);
  ctx.lineTo(W - padX, y);
  ctx.stroke();
  y += 34;

  // 摘要
  const text = summary || '';
  if (text) {
    ctx.fillStyle = '#5a6b82';
    ctx.font = '25px -apple-system,"PingFang SC","Microsoft YaHei",sans-serif';
    for (const line of wrapText(ctx, text, maxW, 3)) {
      ctx.fillText(line, padX, y);
      y += 38;
    }
  }

  // 二维码
  const qrSize = 176;
  const qrX = W - padX - qrSize;
  const qrY = cardY + cardH - 60 - qrSize;
  try {
    const qrImg = await loadImage(qrText);
    if (qrImg) {
      ctx.fillStyle = '#fff';
      roundRect(ctx, qrX - 8, qrY - 8, qrSize + 16, qrSize + 16, 14);
      ctx.fill();
      ctx.drawImage(qrImg, qrX, qrY, qrSize, qrSize);
    }
  } catch { /* ignore */ }

  // 底部左侧信息
  const bottomY = cardY + cardH - 30;
  ctx.fillStyle = '#93a1b5';
  ctx.font = '22px -apple-system,"PingFang SC","Microsoft YaHei",sans-serif';
  ctx.fillText('长按识别二维码 · 查看详情', padX, bottomY - 34);
  ctx.fillStyle = '#0b74ff';
  ctx.font = 'bold 24px -apple-system,"PingFang SC","Microsoft YaHei",sans-serif';
  ctx.fillText(meta[0] || 'AI 信息发布平台', padX, bottomY - 2);

  return canvas;
}

export function canvasToBlob(canvas) {
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b), 'image/png', 0.92));
}

/**
 * 保存分享图。
 *
 * 按环境走不同路径，目标都是「用户能直接把图存下来」：
 *   手机  → 系统分享面板里的「存储图像」= 存进相册
 *   电脑  → 文件系统访问 API，弹「另存为」让用户选目录和文件名
 *   兜底  → 传统 a[download]
 *
 * 注意：浏览器不允许网页直接静默写入相册/磁盘，
 * 所以这里都是「唤起系统 UI 让用户确认」，这已经是 Web 能给到的上限。
 */
export async function downloadCanvas(canvas, filename = 'xiaoyu-share.png') {
  const blob = await canvasToBlob(canvas);
  if (!blob) return false;

  const ua = navigator.userAgent || '';
  const isMobile = /Android|iPhone|iPad|iPod|HarmonyOS|Mobile/i.test(ua);

  // ---- 手机：走系统分享，选「存储图像」即保存到相册 ----
  if (isMobile) {
    try {
      const file = new File([blob], filename, { type: 'image/png' });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: '小鱼来了' });
        return true;
      }
    } catch (err) {
      if (err && err.name === 'AbortError') return false; // 用户取消
      // 其它错误继续走兜底下载
    }
  }

  // ---- 电脑：弹「另存为」 ----
  if (!isMobile && typeof window.showSaveFilePicker === 'function') {
    try {
      const handle = await window.showSaveFilePicker({
        suggestedName: filename,
        types: [{ description: 'PNG 图片', accept: { 'image/png': ['.png'] } }],
      });
      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
      return true;
    } catch (err) {
      if (err && err.name === 'AbortError') return false; // 用户取消
      // 其它错误继续走兜底下载
    }
  }

  // ---- 兜底 ----
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  return true;
}

/* ------------------------------------------------------------------ */
/* 分享面板                                                            */
/* ------------------------------------------------------------------ */
/* 是否手机 / 平板 */
function isMobileUA() {
  return /Android|iPhone|iPad|iPod|HarmonyOS|Mobile/i.test(navigator.userAgent || '');
}

export async function openShareSheet(listing) {
  if (!listing?.id) return;
  showLoading('准备分享内容…');
  let payload;
  try {
    payload = await service.share(listing.id);
  } catch (err) {
    hideLoading();
    toast(err.message || '分享内容生成失败', 'err');
    return;
  }
  hideLoading();

  const coverUrl = safeUrl(payload.imgUrl) || '';

  // 公众号接入状态：决定微信内转发卡片是否带自定义标题/封面
  let wxStatus = null;
  try {
    wxStatus = await service.wechatStatus();
  } catch {
    /* 拿不到就不提示 */
  }

  /* 纯文字文案：不带图片、不带链接，可直接粘贴到任何地方 */
  const plainShareText = () => {
    const lines = [];
    lines.push(`【${payload.title || ''}】`);
    if (payload.desc) lines.push(payload.desc);

    const bits = [];
    const city = listing.cities?.[0]?.name;
    if (city) bits.push(`📍 ${city}`);
    const amount = listing.project?.investAmount;
    if (amount) bits.push(`💰 ${amount}`);
    const typeName = listing.typeName;
    if (typeName) bits.push(`🤝 ${typeName}`);
    if (bits.length) {
      lines.push('');
      lines.push(bits.join('　'));
    }

    const qs = listing.project?.qualifications || [];
    if (qs.length) {
      lines.push('');
      lines.push(`需要具备：${qs.map((q) => q.name).slice(0, 4).join('、')}`);
    }

    lines.push('');
    lines.push('—— 小鱼来了｜让每一条好项目，都被对的人看见');
    return lines.join('\n');
  };

  const content = `
    ${isWechatBrowser() ? `<div class="wx-tip">💚 <b>你在微信里</b>：选好形态后，点右上角「···」即可<b>发送给朋友</b>或<b>分享到朋友圈</b>，链接会自动带上标题、摘要和封面图。</div>` : ''}
    <div class="share-mode active" data-mode="wechat">
      <div class="ico">💚</div>
      <div class="grow">
        <div class="strong">转发到微信</div>
        <div class="tiny dim">一键打开微信 / 扫码转发，最简单的方式</div>
      </div>
    </div>
    <div class="share-mode" data-mode="text">
      <div class="ico">📝</div>
      <div class="grow">
        <div class="strong">纯文字</div>
        <div class="tiny dim">只给一段文案，不带图片和链接，可粘贴到任何地方</div>
      </div>
    </div>
    <div class="share-mode" data-mode="poster">
      <div class="ico">🖼️</div>
      <div class="grow">
        <div class="strong">文字 + 图片</div>
        <div class="tiny dim">生成海报，适合发朋友圈、微信群；对方扫码即可查看</div>
      </div>
    </div>
    <div class="share-mode" data-mode="link">
      <div class="ico">🔗</div>
      <div class="grow">
        <div class="strong">文字 + 链接</div>
        <div class="tiny dim">直接转发网页，微信内自动显示标题、摘要与封面</div>
      </div>
    </div>
    <div id="share-panel" class="mt12"></div>`;

  openSheet({
    title: '分享到微信 / 朋友圈',
    content,
    async onMount(sheet, close) {
      const panel = sheet.querySelector('#share-panel');
      let mode = 'wechat';
      let posterCanvas = null;

      const renderPanel = async () => {
        if (mode === 'wechat') {
          const qr = esc(service.qrUrl(payload.url, 320));
          const inWx = isWechatBrowser();
          const mobile = isMobileUA();
          if (inWx) {
            panel.innerHTML = `<div class="wx-guide">
              <div class="wx-guide-arrow">↗</div>
              <div class="wx-guide-t">点击右上角「···」</div>
              <div class="wx-guide-d">选择「发送给朋友」或「分享到朋友圈」<br>链接会自动带上标题、摘要和封面图</div>
              <div class="wx-status ${wxStatus && wxStatus.jsSdkReady ? 'ok' : ''}">
                ${wxStatus && wxStatus.jsSdkReady
                  ? '✅ 公众号已接入：转发卡片会自动显示标题、摘要与封面图'
                  : 'ℹ️ 未接入公众号：转发时使用微信默认标题与页面首图'}
              </div>
              <button class="btn btn-block mt12" id="btn-wx-copy">复制文案备用</button>
            </div>`;
          } else if (mobile) {
            panel.innerHTML = `<div class="wx-guide">
              <div class="wx-guide-ico">💚</div>
              <div class="wx-guide-t">转发到微信</div>
              <div class="wx-guide-d">文案与链接会先复制好，<br>打开微信后粘贴到聊天窗口即可发给好友或群</div>
              <button class="btn btn-primary btn-block mt12" id="btn-wx-open">💚 打开微信并复制文案</button>
              <button class="btn btn-block mt8" id="btn-wx-copy">只复制文案</button>
            </div>`;
          } else {
            panel.innerHTML = `<div class="wx-guide">
              <div class="wx-guide-t">用微信扫码转发</div>
              <div class="wx-guide-d">微信「扫一扫」打开本页，<br>再点右上角「···」即可转发给好友或朋友圈</div>
              <div class="wx-qr"><img src="${esc(qr)}" alt="微信扫码"></div>
              <div class="wx-status ${wxStatus && wxStatus.jsSdkReady ? 'ok' : ''}">
                ${wxStatus && wxStatus.jsSdkReady
                  ? '✅ 公众号已接入，手机微信扫码打开后卡片信息完整'
                  : 'ℹ️ 未接入公众号，扫码后转发使用默认标题'}
              </div>
              <button class="btn btn-primary btn-block mt12" id="btn-wx-copy">复制文案</button>
            </div>`;
          }
        } else if (mode === 'text') {
          panel.innerHTML = `<div class="field">
              <label>纯文字文案（可自由复制粘贴）</label>
              <textarea class="input" id="share-plain" rows="10" readonly>${esc(plainShareText())}</textarea>
            </div>
            <div class="row gap8 mt8">
              <button class="btn btn-primary grow" id="btn-copy-plain">复制文字</button>
              <button class="btn grow" id="btn-native-plain">系统分享</button>
            </div>
            <div class="tiny dim center mt8">不含图片与链接，适合发朋友圈纯文字、微信群、短信或其他平台</div>`;
        } else if (mode === 'poster') {
          panel.innerHTML = `<div class="poster-wrap"><canvas id="poster-canvas"></canvas></div>
            <div class="row gap8 mt8"><button class="btn btn-primary grow" id="btn-save">保存海报</button>
            <button class="btn grow" id="btn-copy-text">复制文案</button></div>
            <div class="tiny dim center mt8">提示：在微信中长按图片可直接发送给好友或分享到朋友圈</div>`;
          const holder = panel.querySelector('#poster-canvas');
          try {
            posterCanvas = await renderPoster({
              title: payload.title,
              subtitle: listing.subtitle || '',
              summary: (listing.summary || listing.ai?.summary || '').slice(0, 120),
              qrText: service.qrUrl(payload.url, 360),
              coverUrl,
              meta: [listing.categoryName || '小鱼来了'],
            });
            holder.replaceWith(posterCanvas);
            posterCanvas.id = 'poster-canvas';
          } catch {
            panel.querySelector('.poster-wrap').innerHTML = '<div class="tiny dim">海报生成失败，请改用链接分享</div>';
          }
        } else {
          panel.innerHTML = `<div class="share-preview" id="share-text">${esc(payload.title)}\n${esc(payload.desc)}\n${esc(payload.url)}</div>
            <div class="row gap8 mt12">
              <button class="btn btn-primary grow" id="btn-copy-link">复制链接与文案</button>
              <button class="btn grow" id="btn-native">系统分享</button>
            </div>
            ${isWechatBrowser() ? '<div class="tiny dim center mt8">在微信内点击右上角「···」即可转发给好友或分享到朋友圈</div>' : '<div class="tiny dim center mt8">可粘贴到微信聊天窗口，或复制后在微信中发送</div>'}`;
        }
        bind();
      };

      const bind = () => {
        const wxText = () => `${payload.title}\n${payload.desc}\n${payload.url}`;

        panel.querySelector('#btn-wx-open')?.addEventListener('click', async () => {
          const ok = await copyText(wxText());
          service.recordShare(listing.id, 'wechat').catch(() => {});
          toast(ok ? '文案已复制，正在打开微信…' : '复制失败，请手动选择文字', ok ? 'ok' : 'err');
          // 跳转微信 App；部分浏览器/系统会拦截，已复制的文案仍然可用
          setTimeout(() => {
            try {
              location.href = 'weixin://';
            } catch {
              /* 忽略：跳转失败时用户可自行打开微信粘贴 */
            }
          }, 400);
        });

        panel.querySelector('#btn-wx-copy')?.addEventListener('click', async () => {
          const ok = await copyText(wxText());
          service.recordShare(listing.id, 'wechat').catch(() => {});
          toast(ok ? '文案与链接已复制，粘贴到微信即可' : '复制失败，请手动选择文字', ok ? 'ok' : 'err');
        });

        panel.querySelector('#btn-copy-plain')?.addEventListener('click', async () => {
          const ok = await copyText(plainShareText());
          service.recordShare(listing.id, 'text').catch(() => {});
          toast(ok ? '文字已复制，可粘贴到任意位置' : '复制失败，请手动选择文字', ok ? 'ok' : 'err');
        });
        panel.querySelector('#btn-native-plain')?.addEventListener('click', async () => {
          const txt = plainShareText();
          if (navigator.share) {
            try {
              await navigator.share({ title: payload.title, text: txt });
            } catch { /* 用户取消 */ }
          } else {
            const ok = await copyText(txt);
            toast(ok ? '已复制文字' : '当前浏览器不支持系统分享', ok ? 'ok' : 'err');
          }
        });
        panel.querySelector('#btn-save')?.addEventListener('click', async () => {
          if (!posterCanvas) return toast('海报未就绪', 'err');
          await downloadCanvas(posterCanvas, `${(payload.title || '小鱼来了').slice(0, 20)}.png`);
          service.recordShare(listing.id, 'poster').catch(() => {});
          toast('海报已保存到相册/下载目录', 'ok');
        });
        panel.querySelector('#btn-copy-text')?.addEventListener('click', async () => {
          const ok = await copyText(`${payload.title}\n${payload.desc}\n长按识别二维码查看详情 → ${payload.url}`);
          toast(ok ? '文案已复制' : '复制失败，请手动选择', ok ? 'ok' : 'err');
        });
        panel.querySelector('#btn-copy-link')?.addEventListener('click', async () => {
          const ok = await copyText(`${payload.title}\n${payload.desc}\n${payload.url}`);
          service.recordShare(listing.id, 'link').catch(() => {});
          toast(ok ? '链接与文案已复制' : '复制失败', ok ? 'ok' : 'err');
        });
        panel.querySelector('#btn-native')?.addEventListener('click', async () => {
          if (navigator.share) {
            try {
              await navigator.share({ title: payload.title, text: payload.desc, url: payload.url });
            } catch { /* 用户取消 */ }
          } else {
            const ok = await copyText(payload.url);
            toast(ok ? '已复制链接' : '当前浏览器不支持系统分享', ok ? 'ok' : 'err');
          }
        });
      };

      sheet.addEventListener('click', (e) => {
        const m = e.target.closest('[data-mode]');
        if (!m) return;
        mode = m.dataset.mode;
        [...sheet.querySelectorAll('[data-mode]')].forEach((el) => el.classList.toggle('active', el === m));
        renderPanel();
      });

      await renderPanel();

      // 微信内自动配置 JS-SDK
      if (isWechatBrowser()) setupWechatShare(listing).catch(() => {});
      void close;
    },
  });
}


/* ------------------------------------------------------------------ */
/* 邀请分享：生成海报 + 可直接转发微信的文案                              */
/* ------------------------------------------------------------------ */

/**
 * 打开「分享给微信好友」面板。
 *
 * 目的：让老用户把平台转发到微信，带自己的邀请链接，
 * 对方点开注册后会自动记到邀请人头上（referral 系统）。
 */
export async function openInviteShare() {
  showLoading('正在生成分享内容…');

  // 拿邀请链接；失败就退回官网首页
  let link = location.origin;
  let code = '';
  let sharerName = '';
  let avatarUrl = '';
  try {
    const [r, me] = await Promise.all([
      service.referralMe(),
      service.me().catch(() => null),
    ]);
    const u = me?.user || null;
    if (u) {
      sharerName = u.nickname || '';
      avatarUrl = u.avatar || '';
    }
    // 接口字段是 url（形如 https://域名/#/register?ref=XXXX），不是 link
    if (r?.url) link = r.url;
    if (r?.code) code = r.code;
  } catch {
    /* 未登录或接口异常时用官网首页 */
  }

  const shareText = [
    '【小鱼来了】找项目、投资、产业',
    '',
    'AI 信息发布平台，免费发布 项目需求 / 活动赛事 / 贸易采供 / 科技成果转化，',
    'AI 自动生成标题与解析，按行业和城市推给对口的人。',
    '',
    `👉 ${link}`,
    code ? `（邀请码 ${code}，注册后可直接发布信息）` : '（注册后可直接发布信息）',
  ].join('\n');

  // 生成海报
  let canvas = null;
  try {
    canvas = await renderPoster({
      title: '找项目、投资、产业，小鱼来了',
      subtitle: 'AI 信息发布平台 · 免费发布，按行业和城市推送',
      summary: '覆盖新能源、算力、机器人、低空经济、科技成果转化等行业；项目、活动、贸易、成果转化一站式发布。',
      qrText: `/api/share/qrcode?text=${encodeURIComponent(link)}&size=360`,
      coverUrl: '',
      meta: ['小鱼来了 · xiaoyulaile.online'],
      sharerName,
      avatarUrl,
    });
  } catch {
    canvas = null;
  }

  hideLoading();

  const posterUrl = canvas ? canvas.toDataURL('image/png') : '';

  const wrap = document.createElement('div');
  wrap.className = 'inv-mask';
  wrap.innerHTML = `<div class="inv-sheet">
    <div class="inv-head">
      <div>
        <div class="inv-t">📤 分享给微信好友</div>
        <div class="inv-d">转发下面这张海报或文案，客户扫码即可入驻发布</div>
      </div>
      <button class="inv-x" type="button" aria-label="关闭">✕</button>
    </div>

    ${
      posterUrl
        ? `<div class="inv-poster-wrap"><img class="inv-poster" src="${posterUrl}" alt="分享海报"></div>`
        : '<div class="empty">海报生成失败，可直接复制文案分享</div>'
    }

    <div class="inv-sec">分享文案</div>
    <textarea class="inv-text" id="inv-text" rows="6" readonly></textarea>

    <div class="inv-actions">
      <button class="btn btn-primary grow" id="inv-copy" type="button">复制文案 + 链接</button>
      ${posterUrl ? '<button class="btn btn-outline" id="inv-save" type="button" style="flex:none">保存海报</button>' : ''}
    </div>
    <button class="btn btn-outline btn-block mt8" id="inv-copy-link" type="button">只复制链接</button>

    <div class="inv-foot">
      复制后打开微信 → 选择好友或群 → 粘贴发送<br>
      对方点开链接注册，会自动记到你的邀请名下
    </div>
  </div>`;

  document.body.appendChild(wrap);
  const ta = wrap.querySelector('#inv-text');
  if (ta) ta.value = shareText;
  requestAnimationFrame(() => wrap.classList.add('show'));

  const close = () => {
    wrap.classList.remove('show');
    setTimeout(() => wrap.remove(), 220);
  };
  wrap.querySelector('.inv-x').addEventListener('click', close);
  wrap.addEventListener('click', (ev) => { if (ev.target === wrap) close(); });

  /* 上报分享动作，用于「我的分享数据」 */
  const reportShare = (channel) => {
    try {
      service.logReferralShare(channel).catch(() => {});
    } catch { /* ignore */ }
  };

  wrap.querySelector('#inv-copy').addEventListener('click', async () => {
    const ok = await copyText(shareText);
    if (ok) reportShare('text');
    toast(ok ? '已复制，去微信粘贴发送' : '复制失败，请长按文案手动复制', ok ? 'ok' : 'err');
  });

  wrap.querySelector('#inv-copy-link')?.addEventListener('click', async () => {
    const ok = await copyText(link);
    if (ok) reportShare('link');
    toast(ok ? '链接已复制' : '复制失败', ok ? 'ok' : 'err');
  });

  wrap.querySelector('#inv-save')?.addEventListener('click', async () => {
    if (!canvas) return;
    const ok = await downloadCanvas(canvas, '小鱼来了-邀请海报.png');
    if (ok) reportShare('poster');
    toast(ok ? '海报已保存，去微信发给好友' : '保存失败，请长按图片保存', ok ? 'ok' : 'err');
  });
}

/**
 * 分享「小鱼来了种子轮融资」。
 *
 * 融资页原来是纯站内页面，没法转发 —— 想发给潜在投资人只能截屏。
 * 这里复用邀请海报那套渲染，换成融资的关键数字。
 *
 * @param {object} plan   融资方案（round / raiseAmount / valuation / stake / minInvest ...）
 * @param {object} quota  募集进度（remaining / percent / closed）
 */
export async function openInvestShare(plan = {}, quota = {}) {
  const p = plan || {};
  const q = quota || {};
  showLoading('正在生成分享内容…');

  const link = `${location.origin}/#/invest`;
  const num = (v) => (Number.isFinite(Number(v)) ? Number(v).toLocaleString('zh-CN') : String(v ?? ''));

  let sharerName = '';
  let avatarUrl = '';
  try {
    const me = await service.me().catch(() => null);
    const u = me?.user || null;
    if (u) {
      sharerName = u.nickname || '';
      avatarUrl = u.avatar || '';
    }
  } catch {
    /* 未登录就不带头像 */
  }

  const key = [
    p.raiseAmount ? `融资 ${num(p.raiseAmount)} 万` : '',
    p.valuation ? `投后估值 ${num(p.valuation)} 万` : '',
    p.stake ? `出让 ${num(p.stake)}%` : '',
  ]
    .filter(Boolean)
    .join(' · ');

  const shareText = [
    `【小鱼来了 · ${p.round || '种子轮'}融资】`,
    '',
    'AI 产业信息发布与对接平台，产品已上线运行。',
    '',
    key,
    p.minInvest ? `最低起投 ${num(p.minInvest)} 万元，${p.pricePerShare || 1} 元/股` : '',
    Number.isFinite(Number(q.remaining)) ? `剩余额度 ${num(q.remaining)} 万元${q.closed ? '（本轮已满）' : ''}` : '',
    '',
    `👉 ${link}`,
    '（查看完整融资方案与认购规则）',
  ]
    .filter((x) => x !== '')
    .join('\n');

  let canvas = null;
  try {
    canvas = await renderPoster({
      title: `小鱼来了 · ${p.round || '种子轮'}融资`,
      subtitle: 'AI 产业信息发布与对接平台 · 产品已上线',
      summary: [
        key,
        p.minInvest ? `最低起投 ${num(p.minInvest)} 万元` : '',
        Number.isFinite(Number(q.remaining)) ? `剩余 ${num(q.remaining)} 万元额度` : '',
      ]
        .filter(Boolean)
        .join(' · '),
      qrText: `/api/share/qrcode?text=${encodeURIComponent(link)}&size=360`,
      coverUrl: '',
      coverHeight: 300,
      meta: ['小鱼来了 · xiaoyulaile.online'],
      sharerName,
      avatarUrl,
    });
  } catch {
    canvas = null;
  }

  hideLoading();

  const posterUrl = canvas ? canvas.toDataURL('image/png') : '';

  const wrap = document.createElement('div');
  wrap.className = 'inv-mask';
  wrap.innerHTML = `<div class="inv-sheet">
    <div class="inv-head">
      <div>
        <div class="inv-t">📤 分享融资信息</div>
        <div class="inv-d">转发给潜在投资人，对方扫码即可看到完整方案</div>
      </div>
      <button class="inv-x" type="button" aria-label="关闭">✕</button>
    </div>

    ${
      posterUrl
        ? `<div class="inv-poster-wrap"><img class="inv-poster" src="${posterUrl}" alt="融资海报"></div>`
        : '<div class="empty">海报生成失败，可直接复制文案分享</div>'
    }

    <div class="inv-sec">分享文案</div>
    <textarea class="inv-text" id="inv-text" rows="7" readonly></textarea>

    <div class="inv-actions">
      <button class="btn btn-primary grow" id="inv-copy" type="button">复制文案 + 链接</button>
      ${posterUrl ? '<button class="btn btn-outline" id="inv-save" type="button" style="flex:none">保存海报</button>' : ''}
    </div>
    <button class="btn btn-outline btn-block mt8" id="inv-copy-link" type="button">只复制链接</button>

    <div class="inv-foot">
      复制后打开微信 → 选择好友或群 → 粘贴发送<br>
      融资页展示完整方案、认购规则与风险提示
    </div>
  </div>`;

  document.body.appendChild(wrap);
  const ta = wrap.querySelector('#inv-text');
  if (ta) ta.value = shareText;
  requestAnimationFrame(() => wrap.classList.add('show'));

  const close = () => {
    wrap.classList.remove('show');
    setTimeout(() => wrap.remove(), 220);
  };
  wrap.querySelector('.inv-x').addEventListener('click', close);
  wrap.addEventListener('click', (ev) => {
    if (ev.target === wrap) close();
  });

  wrap.querySelector('#inv-copy').addEventListener('click', async () => {
    const ok = await copyText(shareText);
    toast(ok ? '已复制，去微信粘贴发送' : '复制失败，请长按文案手动复制', ok ? 'ok' : 'err');
  });

  wrap.querySelector('#inv-copy-link')?.addEventListener('click', async () => {
    const ok = await copyText(link);
    toast(ok ? '链接已复制' : '复制失败', ok ? 'ok' : 'err');
  });

  wrap.querySelector('#inv-save')?.addEventListener('click', async () => {
    if (!canvas) return;
    const ok = await downloadCanvas(canvas, '小鱼来了-融资方案.png');
    toast(ok ? '海报已保存，去微信发给投资人' : '保存失败，请长按图片保存', ok ? 'ok' : 'err');
  });
}

export default { openInviteShare, openInvestShare, openShareSheet, setupWechatShare, renderPoster, downloadCanvas, isWechatBrowser };

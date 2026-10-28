/**
 * 项目配图自动生成
 *
 * 为什么放在前端：
 *   服务端的 PNG 编码器是自己从零写的（只有像素编码，没有字体栅格化），
 *   画不了中文。浏览器 Canvas 自带字体与排版，生成质量高得多，
 *   生成后上传成项目封面，得到的仍是普通文件 URL，
 *   微信分享、og:image、列表缩略图都能正常用。
 *
 * 配色按项目所属行业选取，让同类项目在列表里有一致的视觉语言。
 */
import { api, service } from './api.js';

/* ---------------- 行业配色 ---------------- */
const PALETTES = {
  '光伏': { from: '#0a3d2c', to: '#12a06a', accent: '#ffd166', icon: '☀️', label: '光伏' },
  '风电': { from: '#0a2a43', to: '#1a7fb8', accent: '#a8e6ff', icon: '🌬️', label: '风电' },
  '储能': { from: '#1b1440', to: '#5b3fd6', accent: '#c4b5fd', icon: '🔋', label: '储能' },
  '氢能': { from: '#052e2b', to: '#0d9488', accent: '#99f6e4', icon: '💧', label: '氢能' },
  '智算中心': { from: '#111827', to: '#4f46e5', accent: '#a5b4fc', icon: '🖥️', label: '智算中心' },
  '充电桩': { from: '#0c2d48', to: '#0284c7', accent: '#7dd3fc', icon: '🔌', label: '充电桩' },
  '环保': { from: '#0e3b2e', to: '#16a34a', accent: '#bbf7d0', icon: '🌿', label: '环保' },
  '市政': { from: '#1e293b', to: '#475569', accent: '#cbd5e1', icon: '🏗️', label: '市政' },
  '房地产': { from: '#3b2616', to: '#a16207', accent: '#fde68a', icon: '🏢', label: '地产' },
  '制造业': { from: '#331c0b', to: '#ea580c', accent: '#fed7aa', icon: '⚙️', label: '制造' },
  '交通物流': { from: '#0c1f3f', to: '#2563eb', accent: '#bfdbfe', icon: '🚚', label: '物流' },
  '传媒': { from: '#3b0a2e', to: '#be185d', accent: '#fbcfe8', icon: '🎪', label: '活动' },
  '金融': { from: '#2b1a06', to: '#b45309', accent: '#fcd34d', icon: '💰', label: '融资' },
  '农业': { from: '#1a2e05', to: '#65a30d', accent: '#d9f99d', icon: '🌾', label: '农业' },
};

const DEFAULT_PALETTE = { from: '#0f2740', to: '#1d6fa5', accent: '#9fd8ff', icon: '📌', label: '项目' };

export function pickPalette(listing = {}) {
  const names = [
    ...(listing.industries || []).map((i) => i.name),
    ...(listing.subs || []).map((s) => s.name),
    listing.categoryName || '',
    listing.typeName || '',
    ...((listing.ai && listing.ai.titles && listing.ai.titles.keywords) || []),
  ].filter(Boolean).join(' ');

  for (const [key, val] of Object.entries(PALETTES)) {
    if (names.includes(key)) return val;
  }
  // 类别兜底：活动 / 贸易
  if (listing.category === 'event') return PALETTES['传媒'];
  if (listing.category === 'trade') return PALETTES['制造业'];
  return DEFAULT_PALETTE;
}

/* ---------------- 绘制工具 ---------------- */

function roundRect(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

/** 按宽度换行，超出最大行数用省略号收尾 */
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

  if (lines.length >= maxLines) {
    // 判断是否还有剩余内容
    const consumed = lines.join('').length;
    if (consumed < chars.length) {
      let last = lines[maxLines - 1];
      while (last && ctx.measureText(`${last}…`).width > maxWidth) last = last.slice(0, -1);
      lines[maxLines - 1] = `${last}…`;
    }
  }
  return lines;
}

function loadImage(src) {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

/* ---------------- 主绘制 ---------------- */

/**
 * 生成项目封面图
 * @returns {Promise<Blob>} PNG
 */
export async function drawProjectCover(listing, { width = 1200, height = 675, qrText = '' } = {}) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  const P = pickPalette(listing);
  const W = width;
  const H = height;

  /* 背景：斜向渐变 */
  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, P.from);
  bg.addColorStop(1, P.to);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  /* 背景纹理：斜线，增加质感 */
  ctx.save();
  ctx.globalAlpha = 0.06;
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 2;
  for (let x = -H; x < W; x += 26) {
    ctx.beginPath();
    ctx.moveTo(x, H);
    ctx.lineTo(x + H, 0);
    ctx.stroke();
  }
  ctx.restore();

  /* 右上角光晕 */
  const glow = ctx.createRadialGradient(W * 0.82, H * 0.18, 10, W * 0.82, H * 0.18, W * 0.42);
  glow.addColorStop(0, `${P.accent}55`);
  glow.addColorStop(1, 'transparent');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);

  const padX = 68;

  /* 顶部：类别徽标 */
  const chip = listing.categoryName || P.label;
  ctx.font = '600 24px -apple-system,"Microsoft YaHei",sans-serif';
  const chipW = ctx.measureText(chip).width + 40;
  ctx.fillStyle = 'rgba(255,255,255,.16)';
  roundRect(ctx, padX, 58, chipW, 46, 23);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.textBaseline = 'middle';
  ctx.fillText(chip, padX + 20, 58 + 24);

  /* 右上角大图标 */
  ctx.font = '110px -apple-system,"Segoe UI Emoji","Apple Color Emoji",sans-serif';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  ctx.globalAlpha = 0.95;
  ctx.fillText(P.icon, W - padX, 130);
  ctx.globalAlpha = 1;
  ctx.textAlign = 'left';

  /* 标题 */
  const title = listing.title || listing.name || '项目信息';
  ctx.font = '700 58px -apple-system,"Microsoft YaHei",sans-serif';
  ctx.fillStyle = '#ffffff';
  ctx.textBaseline = 'top';
  const titleLines = wrapText(ctx, title, W - padX * 2 - 40, 3);
  let ty = 176;
  for (const line of titleLines) {
    ctx.fillText(line, padX, ty);
    ty += 76;
  }

  /* 副标题 */
  const subtitle = listing.subtitle || (listing.ai && listing.ai.summary) || '';
  if (subtitle) {
    ctx.font = '400 26px -apple-system,"Microsoft YaHei",sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,.78)';
    const subLines = wrapText(ctx, subtitle, W - padX * 2 - 40, 2);
    for (const line of subLines) {
      ctx.fillText(line, padX, ty + 6);
      ty += 38;
    }
  }

  /* 底部信息条 */
  const barH = 132;
  const barY = H - barH;
  ctx.fillStyle = 'rgba(0,0,0,.26)';
  ctx.fillRect(0, barY, W, barH);

  const facts = [];
  const city = (listing.cities || [])[0] && listing.cities[0].name;
  if (city) facts.push(city);
  const amount = listing.project && listing.project.investAmount;
  if (amount) facts.push(String(amount));
  const reach = listing.reach || listing.typeName;
  if (reach) facts.push(String(reach));
  const scale = listing.ai && listing.ai.analysis && (listing.ai.analysis.scales || [])[0];
  if (scale) facts.push(String(scale));

  ctx.font = '600 28px -apple-system,"Microsoft YaHei",sans-serif';
  ctx.fillStyle = P.accent;
  ctx.textBaseline = 'middle';
  ctx.fillText(facts.slice(0, 3).join('　·　'), padX, barY + 42);

  /*
   * 品牌行：用真实 logo 图，不再画文字。
   * 底栏压在照片上、偏暗，所以用白色版 logo；
   * 加载失败才退回原来的文字，保证封面不会开天窗。
   */
  const TAGLINE = '让每一条好项目，都被对的人看见';
  const logoH = 26;
  const logoW = Math.round((logoH * 272) / 39); // 原图 272x39
  let brandDrawn = false;
  try {
    const brand = await loadImage('/static/logo-white@2x.png');
    if (brand) {
      ctx.drawImage(brand, padX, barY + 94 - logoH / 2, logoW, logoH);
      brandDrawn = true;
    }
  } catch {
    /* 退回文字 */
  }

  ctx.textBaseline = 'middle';
  if (brandDrawn) {
    ctx.font = '400 20px -apple-system,"Microsoft YaHei",sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,.62)';
    ctx.fillText(TAGLINE, padX + logoW + 16, barY + 94);
  } else {
    ctx.font = '400 22px -apple-system,"Microsoft YaHei",sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,.62)';
    ctx.fillText(`小鱼来了 · ${TAGLINE}`, padX, barY + 94);
  }

  /* 二维码 */
  if (qrText) {
    const img = await loadImage(qrText);
    if (img) {
      const qrSize = 96;
      const qx = W - padX - qrSize;
      const qy = barY + (barH - qrSize) / 2;
      ctx.fillStyle = '#ffffff';
      roundRect(ctx, qx - 8, qy - 8, qrSize + 16, qrSize + 16, 10);
      ctx.fill();
      ctx.drawImage(img, qx, qy, qrSize, qrSize);
    }
  }

  return new Promise((resolve) => canvas.toBlob(resolve, 'image/png', 0.92));
}

/**
 * 生成封面并上传成项目文件，返回文件记录
 * @returns {Promise<{id:string,url:string,name:string}>}
 */
export async function generateAndUploadCover(listing, { qrText = '' } = {}) {
  const blob = await drawProjectCover(listing, { qrText });
  if (!blob) throw new Error('图片生成失败，请重试');

  const name = `${String(listing.title || '项目配图').slice(0, 16)}-配图.png`;
  const fd = new FormData();
  fd.append('file', blob, name);
  fd.append('role', 'cover');
  const res = await api.upload('/api/files', fd);
  const file = res.files && res.files[0];
  if (!file) throw new Error('配图上传失败');
  return file;
}

/**
 * 为项目自动生成配图并设为封面。
 * @returns {Promise<{file:object, listing:object}>}
 */
export async function applyAutoCover(listingId, listing) {
  const qrText = service.qrUrl(`${location.origin}/#/detail/${listingId}`, 240);
  const file = await generateAndUploadCover(listing, { qrText });
  const res = await service.updateListing(listingId, { coverId: file.id });
  return { file, listing: res && res.listing };
}

export default { drawProjectCover, generateAndUploadCover, applyAutoCover, pickPalette };

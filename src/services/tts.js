/**
 * 语音合成（TTS）— 给短视频配旁白
 *
 * 为什么还用「Google 翻译发音」这条免费通道：
 *   · 服务器实测：一次请求 16 秒中文，音色接近商用 TTS
 *   · 不需要 key、不需要余额
 *   · 硅基流动 TTS 在当前账号返回 200 但 0 字节；espeak-ng 中文只有 0.39 秒
 *   · 服务器在香港，translate.google.com 可达
 *
 * 男女声怎么来（2026-11 用户要求「不要都是女生」）：
 *   Google 这条免费通道只有女声，所以：
 *     · 女声 = 原始音色（略微放慢一点点，更像播报）
 *     · 男声 = 用 ffmpeg 做变声：降音高（asetrate）+ 等比例提语速（atempo）
 *              + 低频略提、高频略降，听起来更厚、更接近男声
 *   这不是真正的男声神经网络音色，但比「全站一个女声」自然得多，
 *   而且零成本、零依赖。要真男声，得接 Azure / 阿里云 / 讯飞的付费 TTS。
 *
 * 「尽量接近真人」的其它处理：
 *   · 分句合成，句间补 160ms 停顿（避免一口气念到底的机械感）
 *   · 统一重采样为 44.1kHz 单声道，去掉拼接处的音量跳变
 *   · 文本里的 ｜ / 多余符号先清洗掉
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const execFileAsync = promisify(execFile);

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36';
const MAX_CHUNK = 180; // 单次请求的最大字数（经验值，超了会被截断）
const SAMPLE_RATE = 44100;

/** 按标点把长文本切成 ≤180 字的块 */
export function splitText(text, max = MAX_CHUNK) {
  const s = String(text || '').replace(/\s+/g, ' ').trim();
  if (!s) return [];
  if (s.length <= max) return [s];
  const out = [];
  let cur = '';
  // 优先在句号/逗号/分号处断开
  for (const ch of s) {
    cur += ch;
    if (cur.length >= max * 0.7 && /[。！？；，、,.!?;]/.test(ch)) {
      out.push(cur.trim());
      cur = '';
    } else if (cur.length >= max) {
      out.push(cur.trim());
      cur = '';
    }
  }
  if (cur.trim()) out.push(cur.trim());
  return out.filter(Boolean);
}

/** 清洗：把竖线、多余标点换成适合朗读的文本 */
export function cleanForSpeech(text) {
  return String(text || '')
    .replace(/[｜|]/g, '，')
    .replace(/[———]+/g, '，')
    .replace(/[（(]/g, '，')
    .replace(/[）)]/g, '，')
    .replace(/[、，]{2,}/g, '，')
    .replace(/。{2,}/g, '。')
    .replace(/\s+/g, ' ')
    .trim();
}

/** 决定用男声还是女声：auto 时按内容哈希固定分配，保证同一内容音色稳定 */
export function pickGender(gender, seed = '') {
  const g = String(gender || '').toLowerCase();
  if (g === 'male' || g === 'female') return g;
  const h = crypto.createHash('md5').update(String(seed || 'xyl')).digest();
  return h[0] % 2 === 0 ? 'female' : 'male';
}

/** 拉一段合成语音，失败返回 null */
async function fetchChunk(text, lang = 'zh-CN') {
  try {
    const url =
      'https://translate.google.com/translate_tts?ie=UTF-8' +
      `&q=${encodeURIComponent(text)}` +
      `&tl=${encodeURIComponent(lang)}&client=tw-ob&ttsspeed=1`;
    const res = await fetch(url, {
      headers: { 'User-Agent': UA, Referer: 'https://translate.google.com/' },
      signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    // 太小的多半是错误页
    if (buf.length < 2000) return null;
    return buf;
  } catch {
    return null;
  }
}

/**
 * mp3 分片 → 统一格式的 wav 分片
 * male：变声处理；female：只做重采样与音量归一
 */
async function toWav(srcMp3, gender, stamp, index) {
  const out = path.join(os.tmpdir(), `tts-${stamp}-${index}-${gender}.wav`);
  /*
   * 男声（服务器 ffmpeg 带 rubberband 滤镜）：
   *   rubberband=pitch=0.70:formant=shifted
   *     —— 同时降低音高和共振峰，这才是「像男声」的关键；
   *        只降音高不降共振峰会听成「女声压低了嗓子」
   *   equalizer 低频 +2.5dB、3kHz -2dB —— 增加胸腔感，去掉齿音
   * 服务器没有 rubberband 时，退回 asetrate + atempo 的老办法。
   */
  const maleFilters = [
    `aresample=${SAMPLE_RATE}`,
    'rubberband=pitch=0.70:pitchq=quality:formant=shifted',
    'equalizer=f=160:t=q:w=1:g=2.5',
    'equalizer=f=3000:t=q:w=1:g=-2',
    'dynaudnorm=f=200:g=5',
  ];
  const maleFallback = [
    `aresample=${SAMPLE_RATE}`,
    `asetrate=${Math.round(SAMPLE_RATE * 0.86)}`,
    `aresample=${SAMPLE_RATE}`,
    `atempo=${(1 / 0.86).toFixed(4)}`,
    'equalizer=f=180:t=q:w=1:g=2',
    'equalizer=f=3200:t=q:w=1:g=-1.5',
    'dynaudnorm=f=200:g=5',
  ];
  const femaleFilters = [
    `aresample=${SAMPLE_RATE}`,
    // 女声也稍微放慢 2%，播报感更自然
    'atempo=0.98',
    'dynaudnorm=f=200:g=5',
  ];

  const baseArgs = ['-y', '-loglevel', 'error', '-i', srcMp3, '-ac', '1', '-ar', String(SAMPLE_RATE)];
  if (gender !== 'male') {
    await execFileAsync('ffmpeg', [...baseArgs, '-af', femaleFilters.join(','), out], { timeout: 60000 });
    return out;
  }
  try {
    await execFileAsync('ffmpeg', [...baseArgs, '-af', maleFilters.join(','), out], { timeout: 60000 });
    return out;
  } catch {
    await execFileAsync('ffmpeg', [...baseArgs, '-af', maleFallback.join(','), out], { timeout: 60000 });
    return out;
  }
}

/** 生成一段静音 wav（句间停顿） */
async function makeSilence(ms, stamp) {
  const out = path.join(os.tmpdir(), `tts-${stamp}-sil.wav`);
  await execFileAsync(
    'ffmpeg',
    [
      '-y',
      '-loglevel',
      'error',
      '-f',
      'lavfi',
      '-i',
      `anullsrc=r=${SAMPLE_RATE}:cl=mono`,
      '-t',
      String(ms / 1000),
      out,
    ],
    { timeout: 30000 },
  );
  return out;
}

/**
 * 合成整段旁白。
 * @param {string} text
 * @param {object} [opts]
 * @param {string} [opts.lang]  zh-CN
 * @param {'female'|'male'|'auto'} [opts.gender]
 * @param {string} [opts.seed]  auto 时用来决定音色的种子（一般传内容 id）
 * @returns {Promise<{path:string, duration:number, bytes:number, gender:string}|null>}
 */
export async function synthesize(text, { lang = 'zh-CN', gender = 'female', seed = '' } = {}) {
  const speechText = cleanForSpeech(text);
  const chunks = splitText(speechText);
  if (!chunks.length) return null;

  const g = pickGender(gender, seed || speechText);
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const tmpAll = [];
  const parts = [];

  try {
    for (let i = 0; i < chunks.length; i += 1) {
      const buf = await fetchChunk(chunks[i], lang);
      if (!buf) return null; // 一块失败就放弃，调用方退化为无声视频
      const mp3 = path.join(os.tmpdir(), `tts-${stamp}-${i}.mp3`);
      fs.writeFileSync(mp3, buf);
      tmpAll.push(mp3);
      const wav = await toWav(mp3, g, stamp, i);
      tmpAll.push(wav);
      parts.push(wav);
    }

    /* 句间停顿：分片之间插 160ms，念完最后一个分片后留 120ms 尾巴 */
    const sil = await makeSilence(160, stamp);
    tmpAll.push(sil);
    const merged = path.join(os.tmpdir(), g === 'male' ? `tts-${stamp}-male.wav` : `tts-${stamp}-female.wav`);
    const listFile = path.join(os.tmpdir(), `tts-${stamp}.txt`);
    tmpAll.push(listFile);
    const seq = [];
    for (let i = 0; i < parts.length; i += 1) {
      seq.push(parts[i]);
      if (i < parts.length - 1) seq.push(sil);
    }
    seq.push(sil);
    fs.writeFileSync(listFile, seq.map((p) => `file '${p.replace(/'/g, "'\\''")}'`).join('\n'), 'utf8');
    await execFileAsync(
      'ffmpeg',
      [
        '-y',
        '-loglevel',
        'error',
        '-f',
        'concat',
        '-safe',
        '0',
        '-i',
        listFile,
        '-ar',
        String(SAMPLE_RATE),
        '-ac',
        '1',
        merged,
      ],
      { timeout: 60000 },
    );

    const st = fs.statSync(merged);
    if (!st.size) return null;
    const { stdout } = await execFileAsync(
      'ffprobe',
      ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', merged],
      { timeout: 15000 },
    );
    const duration = Number(String(stdout).trim()) || 0;
    return { path: merged, duration, bytes: st.size, gender: g };
  } catch {
    return null;
  } finally {
    // 只保留合并后的 wav，其余临时文件清掉
    for (const p of tmpAll) {
      try {
        if (p && fs.existsSync(p) && !p.endsWith(`tts-${stamp}-${g}.wav`)) fs.unlinkSync(p);
      } catch {
        /* ignore */
      }
    }
  }
}

export default { synthesize, splitText, pickGender, cleanForSpeech };

/**
 * 语音合成（TTS）— 给短视频配旁白
 *
 * 为什么用「Google 翻译发音」这条免费通道：
 *   · 服务器实测：一次请求 16 秒的中文语音，质量接近商用 TTS
 *   · 不需要任何 key、不需要注册、不需要余额
 *   · 硅基流动的 TTS 在当前账号上返回 200 但 0 字节（用不了）
 *   · 服务器自带的 espeak-ng 中文实际只吐出 0.39 秒静音（不可用）
 *
 * 局限与兜底：
 *   · 单次请求有长度上限，长文按 180 字切块后拼接
 *   · 网络不通 / 被限流时返回 null，调用方退化成「无声视频」
 *   · 需要能访问 translate.google.com（服务器在香港，实测可用）
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const execFileAsync = promisify(execFile);

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36';
const MAX_CHUNK = 180; // 单次请求的最大字数（经验值，超了会被截断）

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
 * 合成整段旁白。
 * @returns {Promise<{path:string, duration:number, bytes:number}|null>} 临时文件路径（调用方负责删除）
 */
export async function synthesize(text, { lang = 'zh-CN' } = {}) {
  const chunks = splitText(text);
  if (!chunks.length) return null;

  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const parts = [];
  for (let i = 0; i < chunks.length; i += 1) {
    const buf = await fetchChunk(chunks[i], lang);
    if (!buf) {
      // 一块失败就整体放弃，交由调用方退化成无声视频
      for (const p of parts) {
        try {
          fs.unlinkSync(p);
        } catch {
          /* ignore */
        }
      }
      return null;
    }
    const f = path.join(os.tmpdir(), `tts-${stamp}-${i}.mp3`);
    fs.writeFileSync(f, buf);
    parts.push(f);
  }

  const merged = path.join(os.tmpdir(), `tts-${stamp}.mp3`);
  try {
    if (parts.length === 1) {
      fs.copyFileSync(parts[0], merged);
    } else {
      // 用 ffmpeg concat 拼接（各段编码参数一致，可直接 copy）
      const listFile = path.join(os.tmpdir(), `tts-${stamp}.txt`);
      fs.writeFileSync(listFile, parts.map((p) => `file '${p.replace(/'/g, "'\\''")}'`).join('\n'), 'utf8');
      await execFileAsync(
        'ffmpeg',
        ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', listFile, '-c', 'copy', merged],
        { timeout: 60000 },
      );
      try {
        fs.unlinkSync(listFile);
      } catch {
        /* ignore */
      }
    }
    const st = fs.statSync(merged);
    if (!st.size) return null;
    const { stdout } = await execFileAsync(
      'ffprobe',
      ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', merged],
      { timeout: 15000 },
    );
    const duration = Number(String(stdout).trim()) || 0;
    return { path: merged, duration, bytes: st.size };
  } catch {
    return null;
  } finally {
    for (const p of parts) {
      try {
        fs.unlinkSync(p);
      } catch {
        /* ignore */
      }
    }
  }
}

export default { synthesize, splitText };

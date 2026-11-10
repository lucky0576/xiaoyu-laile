/**
 * 浏览器端视频压缩（只处理 30~100MB 的视频）
 *
 * 目的：上传前把大视频压小，省流量、传得快。
 * 做法：video 播放 → 画到 canvas（限制 720p）→ MediaRecorder 录成 webm/mp4。
 *
 * 安全策略：
 *   · 不支持 MediaRecorder / 时长过长 / 压缩失败 → 直接返回原文件，
 *     服务端还有一道「上传后自动压缩」兜底，不会影响发布。
 *   · 录制不到音频轨时也返回原文件，避免把有声视频压成无声。
 */

const MIN_SIZE = 30 * 1024 * 1024;
const MAX_SIZE = 100 * 1024 * 1024;
const MAX_DURATION = 180; // 超过 3 分钟不在浏览器压，交给服务端

export function canCompressVideo(file) {
  if (!file || typeof MediaRecorder === 'undefined') return false;
  if (!/^video\//.test(file.type || '') && !/\.(mp4|mov|webm|m4v)$/i.test(file.name || '')) return false;
  return file.size >= MIN_SIZE && file.size <= MAX_SIZE;
}

function pickMime() {
  const list = [
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm',
    'video/mp4;codecs=h264,aac',
    'video/mp4',
  ];
  for (const m of list) {
    try {
      if (MediaRecorder.isTypeSupported(m)) return m;
    } catch {
      /* ignore */
    }
  }
  return '';
}

function extFor(mime) {
  return /mp4/i.test(mime) ? 'mp4' : 'webm';
}

export function compressVideo(file, { onProgress } = {}) {
  return new Promise((resolve) => {
    const fail = () => {
      try {
        URL.revokeObjectURL(url);
      } catch {
        /* ignore */
      }
      resolve({ file, compressed: false, saved: 0 });
    };
    const url = URL.createObjectURL(file);

    const video = document.createElement('video');
    video.preload = 'auto';
    video.playsInline = true;
    video.setAttribute('playsinline', '');
    // 先尝试带声音：muted=false + volume=0，录下来有音轨；被自动播放策略拦截再退回静音播放
    video.muted = false;
    video.volume = 0;
    video.src = url;

    let audioCtx = null;
    let stream = null;
    let rec = null;
    let raf = 0;
    let finished = false;

    const cleanup = () => {
      if (raf) cancelAnimationFrame(raf);
      try {
        rec && rec.state !== 'inactive' && rec.stop();
      } catch {
        /* ignore */
      }
      try {
        stream && stream.getTracks().forEach((t) => t.stop());
      } catch {
        /* ignore */
      }
      try {
        audioCtx && audioCtx.close();
      } catch {
        /* ignore */
      }
      try {
        URL.revokeObjectURL(url);
      } catch {
        /* ignore */
      }
    };

    const finish = (result) => {
      if (finished) return;
      finished = true;
      cleanup();
      resolve(result);
    };

    video.onerror = () => finish({ file, compressed: false, saved: 0 });

    video.onloadedmetadata = async () => {
      try {
        const duration = Number(video.duration) || 0;
        const vw = video.videoWidth || 0;
        const vh = video.videoHeight || 0;
        if (!vw || !vh || !isFinite(duration) || duration <= 0.5 || duration > MAX_DURATION) {
          return finish({ file, compressed: false, saved: 0 });
        }

        // 限制到 720p（竖屏按短边）
        const maxSide = 720;
        const scale = Math.min(1, maxSide / Math.max(vw, vh));
        const outW = Math.max(2, Math.round(vw * scale / 2) * 2);
        const outH = Math.max(2, Math.round(vh * scale / 2) * 2);

        const canvas = document.createElement('canvas');
        canvas.width = outW;
        canvas.height = outH;
        const ctx = canvas.getContext('2d', { alpha: false });
        if (!ctx) return finish({ file, compressed: false, saved: 0 });

        const draw = () => {
          try {
            ctx.drawImage(video, 0, 0, outW, outH);
          } catch {
            /* ignore */
          }
          if (onProgress && duration) {
            try {
              onProgress(Math.min(0.99, video.currentTime / duration));
            } catch {
              /* ignore */
            }
          }
          if (!finished && !video.ended) raf = requestAnimationFrame(draw);
        };

        const mime = pickMime();
        if (!mime) return finish({ file, compressed: false, saved: 0 });

        // 音轨：通过 WebAudio 取（避免直接 captureStream 时静音限制）
        let audioTrack = null;
        try {
          const AC = window.AudioContext || window.webkitAudioContext;
          if (AC) {
            audioCtx = new AC();
            const src = audioCtx.createMediaElementSource(video);
            const dest = audioCtx.createMediaStreamDestination();
            src.connect(dest);
            if (audioCtx.state === 'suspended') audioCtx.resume().catch(() => {});
            audioTrack = dest.stream.getAudioTracks()[0] || null;
          }
        } catch {
          audioCtx = null;
        }

        stream = canvas.captureStream(24);
        if (audioTrack) stream.addTrack(audioTrack);

        const chunks = [];
        rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 1_800_000 });
        rec.ondataavailable = (e) => {
          if (e.data && e.data.size) chunks.push(e.data);
        };
        rec.onstop = () => {
          try {
            const blob = new Blob(chunks, { type: mime });
            if (!blob.size) return finish({ file, compressed: false, saved: 0 });
            if (blob.size >= file.size * 0.95) return finish({ file, compressed: false, saved: 0 });
            const name = (file.name || 'video').replace(/\.[^.]+$/, '') + `-compressed.${extFor(mime)}`;
            const out = new File([blob], name, { type: mime });
            return finish({ file: out, compressed: true, saved: file.size - out.size, duration });
          } catch {
            return finish({ file, compressed: false, saved: 0 });
          }
        };

        // 优先带声音播放；被拦截则静音（静音就不压缩，避免无声）
        try {
          await video.play();
        } catch {
          video.muted = true;
          video.volume = 0;
          try {
            await video.play();
          } catch {
            return finish({ file, compressed: false, saved: 0 });
          }
        }
        // 静音播放没有音轨 → 放弃浏览器压缩，交给服务端
        if (!audioTrack) return finish({ file, compressed: false, saved: 0 });

        rec.start(1000);
        raf = requestAnimationFrame(draw);

        video.onended = () => {
          try {
            rec.stop();
          } catch {
            finish({ file, compressed: false, saved: 0 });
          }
        };
        // 兜底：duration 结束还没触发 ended
        setTimeout(() => {
          if (!finished && video.currentTime >= duration - 0.3) {
            try {
              rec.state !== 'inactive' && rec.stop();
            } catch {
              /* ignore */
            }
          }
        }, Math.ceil(duration * 1000) + 1500);
      } catch {
        finish({ file, compressed: false, saved: 0 });
      }
    };
  });
}

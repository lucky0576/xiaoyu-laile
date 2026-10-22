#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""用 ffmpeg 把画面帧编码成 MP4 演示视频"""

import os
import subprocess
import sys

D = os.path.dirname(os.path.abspath(__file__))
PY = sys.executable
FFMPEG = None
try:
    import imageio_ffmpeg
    FFMPEG = imageio_ffmpeg.get_ffmpeg_exe()
except Exception:
    FFMPEG = "ffmpeg"

OUT = os.path.join(D, "..", "小鱼来了-系统演示.mp4")
OUT = os.path.abspath(OUT)

FPS = 30
FADE = 0.45

clips = []
with open(os.path.join(D, "manifest.txt"), encoding="utf-8") as f:
    for line in f:
        line = line.strip()
        if not line:
            continue
        p, dur = line.split("|")
        clips.append((p, float(dur)))

print("ffmpeg:", FFMPEG)
print("clips :", len(clips))
print()

tmpdir = os.path.join(D, "clips")
os.makedirs(tmpdir, exist_ok=True)
part_list = []

for i, (png, dur) in enumerate(clips):
    part = os.path.join(tmpdir, "part%02d.mp4" % i)
    fade_out = max(0.0, dur - FADE)
    vf = (
        "scale=1920:1080:force_original_aspect_ratio=decrease,"
        "pad=1920:1080:(ow-iw)/2:(oh-ih)/2:color=black,"
        "fps=%d,"
        "fade=t=in:st=0:d=%.2f,"
        "fade=t=out:st=%.2f:d=%.2f,"
        "format=yuv420p"
    ) % (FPS, FADE, fade_out, FADE)

    cmd = [
        FFMPEG, "-y", "-loglevel", "error",
        "-loop", "1", "-i", png,
        "-t", "%.3f" % dur,
        "-vf", vf,
        "-c:v", "libx264", "-preset", "medium", "-crf", "20",
        "-pix_fmt", "yuv420p",
        "-r", str(FPS),
        part,
    ]
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode != 0:
        print("  FAIL part%d: %s" % (i, r.stderr[:300]))
        sys.exit(1)
    sz = os.path.getsize(part) / 1048576
    print("  part%02d  %5.1fs  %6.1f MB  %s" % (i, dur, sz, os.path.basename(png)))
    part_list.append(part)

# 拼接
listfile = os.path.join(tmpdir, "list.txt")
with open(listfile, "w", encoding="utf-8") as f:
    for p in part_list:
        f.write("file '%s'\n" % p.replace("\\", "/"))

print()
print("=== 拼接中 ===")
cmd = [
    FFMPEG, "-y", "-loglevel", "error",
    "-f", "concat", "-safe", "0", "-i", listfile,
    "-c", "copy", "-movflags", "+faststart",
    OUT,
]
r = subprocess.run(cmd, capture_output=True, text=True)
if r.returncode != 0:
    print("  拼接失败:", r.stderr[:400])
    sys.exit(1)

sz = os.path.getsize(OUT) / 1048576
print("  ✅ 输出:", OUT)
print("     大小: %.1f MB" % sz)

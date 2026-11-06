# -*- coding: utf-8 -*-
"""
Kokoro 中文神经语音（本地 ONNX 模型）— 给短视频配旁白

为什么单独一个脚本：
    · onnxruntime + 325MB 模型常驻 Node 进程太重（服务器 1G 内存）
    · 每次调用用子进程：加载 5 秒、合成 5~8 秒，用完立刻释放内存
    · Node 侧只管调用和兜底，语音质量交给真正的神经网络模型

用法：
    python3 scripts/tts-kokoro.py --text-file /tmp/a.txt --voice zm_009 --out /tmp/a.wav
    python3 scripts/tts-kokoro.py --text "文本" --gender male --out /tmp/a.wav

输出（stdout 最后一行 JSON）：
    {"ok":true,"duration":3.5,"voice":"zm_009","sample_rate":24000}
"""

import argparse
import json
import os
import sys

MODEL_DIR = os.environ.get("KOKORO_DIR", "/opt/xiaoyu-laile/models/kokoro")
MODEL = os.path.join(MODEL_DIR, "kokoro-v1.1-zh.onnx")
VOICES = os.path.join(MODEL_DIR, "voices-v1.1-zh.bin")

# 实测挑出来的音色：男声 110Hz 左右，女声 220~260Hz
MALE = ["zm_009", "zm_010", "zm_025", "zm_029"]
FEMALE = ["zf_001", "zf_002", "zf_003", "zf_017"]


def pick(gender, seed=""):
    """按性别 + 内容种子轮换音色（同一内容固定，不同内容有变化）"""
    import hashlib

    g = (gender or "female").lower()
    pool = MALE if g == "male" else FEMALE
    h = hashlib.md5(str(seed or "xyl").encode("utf-8")).digest()
    return pool[h[0] % len(pool)]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--text", default="")
    ap.add_argument("--text-file", default="")
    ap.add_argument("--voice", default="")
    ap.add_argument("--gender", default="female")
    ap.add_argument("--seed", default="")
    ap.add_argument("--speed", type=float, default=0.95)
    ap.add_argument("--out", required=True)
    args = ap.parse_args()

    text = args.text
    if args.text_file:
        with open(args.text_file, encoding="utf-8") as f:
            text = f.read()
    text = " ".join(str(text or "").split())
    if not text:
        print(json.dumps({"ok": False, "error": "empty text"}, ensure_ascii=False))
        return 1
    if not (os.path.exists(MODEL) and os.path.exists(VOICES)):
        print(json.dumps({"ok": False, "error": "model missing"}, ensure_ascii=False))
        return 2

    try:
        from kokoro_onnx import Kokoro
        import soundfile as sf

        voice = args.voice or pick(args.gender, args.seed)
        k = Kokoro(MODEL, VOICES)
        samples, sr = k.create(text[:600], voice=voice, speed=float(args.speed), lang="cmn")
        sf.write(args.out, samples, sr)
        duration = round(len(samples) / float(sr), 2)
        print(json.dumps({"ok": True, "duration": duration, "voice": voice, "sample_rate": sr}, ensure_ascii=False))
        return 0
    except Exception as e:  # noqa: BLE001
        print(json.dumps({"ok": False, "error": f"{type(e).__name__}: {e}"}, ensure_ascii=False))
        return 3


if __name__ == "__main__":
    sys.exit(main())

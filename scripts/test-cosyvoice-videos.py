# -*- coding: utf-8 -*-
"""用 CosyVoice 重新生成两条短视频，导出音频做试听样本"""

import json
import os
import subprocess
import urllib.request

BASE = 'http://127.0.0.1:8787'
ROOT = '/opt/xiaoyu-laile'


def req(path, method='GET', body=None, token=None):
    h = {}
    data = None
    if token:
        h['Authorization'] = 'Bearer ' + token
    if body is not None:
        data = json.dumps(body).encode('utf-8')
        h['Content-Type'] = 'application/json'
    r = urllib.request.Request(BASE + path, data=data, headers=h, method=method)
    try:
        with urllib.request.urlopen(r, timeout=300) as resp:
            return json.loads(resp.read()), resp.status
    except urllib.error.HTTPError as e:
        try:
            return json.loads(e.read()), e.code
        except Exception:
            return {'error': str(e)}, e.code


def load(p):
    d = json.load(open(os.path.join(ROOT, 'data', 'collections', p), encoding='utf-8'))
    return d if isinstance(d, list) else (d.get('rows') or d.get('items') or [])


def main():
    login, _ = req('/api/auth/login', 'POST', {'account': '13456693544', 'password': 'weilan0576'})
    token = (login.get('data') or {}).get('token')
    feeds = [f for f in load('feeds.json') if f.get('type') == 'short' and f.get('autoMade') and f.get('listingId')]
    print('  自动短视频:', len(feeds))
    picked = feeds[:2]
    for i, f in enumerate(picked):
        gender = 'male' if i == 0 else 'female'
        print('  ---', gender, '|', (f.get('title') or '')[:36])
        req('/api/feeds/' + f['id'], 'DELETE', token=token)
        r, code = req('/api/listings/' + f['listingId'] + '/make-short', 'POST', {
            'seconds': 10, 'voice': True, 'voiceGender': gender,
        }, token)
        d = r.get('data') or {}
        print('     生成:', r.get('ok'), code, '| 时长:', d.get('duration'), '| 音色:', d.get('voiceGender'))
        feed = d.get('feed') or {}
        fid = feed.get('fileId') or (feed.get('files') or [''])[0]
        rec = next((x for x in load('files.json') if x.get('id') == fid), None)
        if rec and os.path.exists(rec.get('path') or ''):
            out = f'/tmp/cosy-{gender}.mp3'
            subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', rec['path'], '-vn', '-ac', '1', '-ar', '44100', '-b:a', '128k', out, '-nostdin'], check=False)
            dur = subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', out], capture_output=True, text=True).stdout.strip()
            print('     音频:', out, dur, 's', os.path.getsize(out) if os.path.exists(out) else 0, 'bytes')


if __name__ == '__main__':
    main()

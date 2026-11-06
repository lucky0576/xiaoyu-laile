# -*- coding: utf-8 -*-
"""
端到端验证：男声 / 女声短视频

挑两条已发布、还没有自动短视频的项目，分别用男声和女声生成，
导出首帧、导出音轨，供本地检查画面与音高。
不删除生成结果（它们是正常内容，会出现在短视频列表里）。
"""

import json
import os
import subprocess
import urllib.request

BASE = 'http://127.0.0.1:8787'
ROOT = '/opt/xiaoyu-laile'


def post(path, body, token=None):
    req = urllib.request.Request(
        BASE + path,
        data=json.dumps(body).encode(),
        headers={'Content-Type': 'application/json', **({'Authorization': 'Bearer ' + token} if token else {})},
        method='POST',
    )
    with urllib.request.urlopen(req, timeout=120) as r:
        return json.loads(r.read())


def load_json(name):
    with open(os.path.join(ROOT, 'data', 'collections', name), encoding='utf-8') as f:
        d = json.load(f)
    return d if isinstance(d, list) else (d.get('rows') or d.get('items') or [])


def main():
    login = post('/api/auth/login', {'account': '13456693544', 'password': 'weilan0576'})
    token = (login.get('data') or {}).get('token')

    listings = [l for l in load_json('listings.json') if l.get('status') == 'published']
    feeds = load_json('feeds.json')
    used = {f.get('listingId') for f in feeds if f.get('type') == 'short' and f.get('autoMade')}
    cands = [l for l in listings if l.get('id') not in used and l.get('title')]

    picks = []
    for g in ('male', 'female'):
        if not cands:
            break
        picks.append((g, cands.pop(0)))

    for gender, l in picks:
        print(f'  --- {gender}: {l.get("title")[:34]} ({l["id"]}) ---')
        try:
            r = post(f'/api/listings/{l["id"]}/make-short', {'seconds': 10, 'voice': True, 'voiceGender': gender}, token)
            d = r.get('data') or {}
            f = d.get('feed') or {}
            print('    ok=', r.get('ok'), 'voiceApplied=', d.get('voiceApplied'), 'voiceGender=', d.get('voiceGender'), 'dur=', d.get('duration'), 'err=', r.get('error'))
            fid = f.get('fileId') or (f.get('files') or [''])[0]
            recs = load_json('files.json')
            rec = next((x for x in recs if x.get('id') == fid), None)
            if rec and os.path.exists(rec.get('path') or ''):
                tag = f'/tmp/e2e-{gender}'
                subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-ss', '1', '-i', rec['path'], '-frames:v', '1', tag + '.png', '-nostdin'])
                subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', rec['path'], '-vn', '-ac', '1', '-ar', '44100', tag + '.wav', '-nostdin'])
                print('    frame:', os.path.exists(tag + '.png'), ' audio:', os.path.exists(tag + '.wav'))
        except Exception as e:
            print('    ERR', e)


if __name__ == '__main__':
    main()

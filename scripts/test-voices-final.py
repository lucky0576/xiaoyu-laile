# -*- coding: utf-8 -*-
"""
最终验证：男声 / 女声音色端到端

流程：
  1. 建两条临时信息（中文标题、无封面 → 自动配图）
  2. 一条 male、一条 female，生成 10 秒带旁白短视频
  3. 从数据目录找到视频文件，导出首帧和音轨
  4. 清理临时信息 + feed（保留导出的帧/音轨给本地检查）
"""

import json
import os
import subprocess
import time
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
    with urllib.request.urlopen(req, timeout=180) as r:
        return json.loads(r.read())


def delete(path, token):
    req = urllib.request.Request(BASE + path, headers={'Authorization': 'Bearer ' + token}, method='DELETE')
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            return r.status
    except Exception as e:
        return str(e)


def load_json(name):
    with open(os.path.join(ROOT, 'data', 'collections', name), encoding='utf-8') as f:
        d = json.load(f)
    return d if isinstance(d, list) else (d.get('rows') or d.get('items') or [])


def find_video(file_id):
    for _ in range(6):
        rec = next((x for x in load_json('files.json') if x.get('id') == file_id), None)
        if rec and os.path.exists(rec.get('path') or ''):
            return rec
        time.sleep(1)
    return None


def main():
    token = (post('/api/auth/login', {'account': '13456693544', 'password': 'weilan0576'}).get('data') or {}).get('token')
    cases = [
        ('male', '男声验证｜安徽合肥 300MW 分布式光伏整县推进项目'),
        ('female', '女声验证｜福建泉州 50 万平米产业园屋顶光伏 EMC'),
    ]
    for gender, title in cases:
        created = post(
            '/api/listings',
            {
                'category': 'project',
                'title': title,
                'text': '验证男女声旁白的临时数据：视频里的旁白应当分别是男声和女声，画面无二维码、无电话。项目预算约 3 亿元。',
                'cities': ['合肥' if gender == 'male' else '泉州'],
                'industries': ['新能源'],
                'publishNow': True,
            },
            token,
        )
        lid = ((created.get('data') or {}).get('listing') or {}).get('id')
        made = post(
            f'/api/listings/{lid}/make-short',
            {'seconds': 10, 'voice': True, 'voiceGender': gender},
            token,
        )
        d = made.get('data') or {}
        feed = d.get('feed') or {}
        print(f'  [{gender}] ok={made.get("ok")} 请求音色={gender} 实际音色={d.get("voiceGender")} 时长={d.get("duration")} err={made.get("error")}')
        fid = feed.get('fileId') or (feed.get('files') or [''])[0]
        rec = find_video(fid) if fid else None
        if rec:
            tag = f'/tmp/final-{gender}'
            subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-ss', '1', '-i', rec['path'], '-frames:v', '1', tag + '.png', '-nostdin'])
            subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', rec['path'], '-vn', '-ac', '1', '-ar', '44100', tag + '.wav', '-nostdin'])
            print(f'    frame={os.path.exists(tag + ".png")} wav={os.path.exists(tag + ".wav")} path={rec["path"]}')
        else:
            print('    找不到视频记录', fid)
        # 清理
        print('    删除临时信息:', delete(f'/api/listings/{lid}', token), '删除feed:', delete(f"/api/feeds/{feed.get('id')}", token) if feed.get('id') else '-')


if __name__ == '__main__':
    main()

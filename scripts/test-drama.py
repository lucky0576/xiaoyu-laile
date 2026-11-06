# -*- coding: utf-8 -*-
"""短剧 MVP 冒烟测试：加集 → 审核 → 切片 → 验证 → 清理"""

import json
import os
import subprocess
import urllib.request

BASE = 'http://127.0.0.1:8787'
ROOT = '/opt/xiaoyu-laile'


def req(path, method='GET', body=None, token=None):
    headers = {}
    data = None
    if token:
        headers['Authorization'] = 'Bearer ' + token
    if body is not None:
        data = json.dumps(body).encode()
        headers['Content-Type'] = 'application/json'
    r = urllib.request.Request(BASE + path, data=data, headers=headers, method=method)
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
    drid = open('/tmp/drid').read().strip()
    print('  drama:', drid)

    # 找一个时长 25~120 秒的视频文件
    files = [f for f in load('files.json') if f.get('kind') == 'video' and f.get('path') and os.path.exists(f['path'])]
    target = None
    for f in files:
        try:
            out = subprocess.run(
                ['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', f['path']],
                capture_output=True, text=True, timeout=15,
            ).stdout.strip()
            dur = float(out or 0)
        except Exception:
            continue
        if 25 <= dur <= 180:
            target = (f, dur)
            break
    if not target:
        print('  没找到合适的视频文件，跳过')
        return
    f, dur = target
    print('  使用视频:', f.get('name'), '时长', round(dur, 1), 's')

    r, code = req(f'/api/admin/dramas/{drid}/episodes', 'POST', {
        'fileId': f['id'], 'episodeNo': 1, 'title': '第 1 集 测试', 'free': True,
    }, token)
    print('  加集:', r.get('ok'), code, (r.get('error') or ''))

    r, code = req(f'/api/admin/dramas/{drid}/review', 'POST', {'action': 'approve'}, token)
    print('  审核:', r.get('ok'), code, (r.get('error') or ''))

    r, code = req(f'/api/admin/dramas/{drid}/slices', 'POST', {}, token)
    d = r.get('data') or {}
    print('  切片:', r.get('ok'), code, 'made=', d.get('made'), (r.get('error') or ''))

    pub, _ = req('/api/dramas?size=30')
    items = (pub.get('data') or {}).get('items') or []
    hit = [x for x in items if x.get('id') == drid]
    print('  频道可见:', bool(hit), '| 频道短剧数:', len(items))

    det, _ = req(f'/api/dramas/{drid}')
    dd = det.get('data') or {}
    print('  详情集数:', len(dd.get('episodes') or []), '| 封面:', (dd.get('drama') or {}).get('coverUrl'))

    feeds = [x for x in load('feeds.json') if x.get('dramaId') == drid]
    print('  切片 feed 数:', len(feeds), '| tags:', feeds[0].get('tags') if feeds else '')

    # 清理：删切片 feed + 删短剧
    T = token
    for ff in feeds:
        req('/api/feeds/' + ff['id'], 'DELETE', token=T)
    req('/api/admin/dramas/' + drid, 'DELETE', token=T)
    left = [x for x in load('feeds.json') if x.get('dramaId') == drid]
    print('  清理后剩余切片:', len(left))


if __name__ == '__main__':
    main()

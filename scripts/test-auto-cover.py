# -*- coding: utf-8 -*-
"""
在服务器上跑：验证「生成短视频，没有封面自动配图」

做四件事：
  1. 登录管理员
  2. 新建一条中文标题、无封面的信息
  3. 生成 5 秒短视频（不配旁白，快），导出第 1 秒画面
  4. 清理：删除测试信息、短视频 feed、以及历史遗留的 3 条测试 feed

中文标题写在 Python 文件里（UTF-8），避免 shell 把中文转成问号。
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
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.loads(r.read())


def get(path, token=None):
    req = urllib.request.Request(
        BASE + path,
        headers={'Authorization': 'Bearer ' + token} if token else {},
    )
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.loads(r.read())


def delete(path, token=None):
    req = urllib.request.Request(
        BASE + path,
        headers={'Authorization': 'Bearer ' + token} if token else {},
        method='DELETE',
    )
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            return r.status
    except Exception as e:
        return str(e)


def load_json(name):
    p = os.path.join(ROOT, 'data', 'collections', name)
    with open(p, encoding='utf-8') as f:
        d = json.load(f)
    return d if isinstance(d, list) else (d.get('rows') or d.get('items') or [])


def main():
    login = post('/api/auth/login', {'account': '13456693544', 'password': 'weilan0576'})
    token = (login.get('data') or {}).get('token')
    print('  token ok:', bool(token))

    title = '自动配图验证｜江苏 200MW 渔光互补光伏电站 EPC'
    body = {
        'category': 'project',
        'title': title,
        'text': '这是验证自动配图功能的信息：没有上传封面，生成短视频时应当自动配一张干净底图，标题只出现一次。项目位于江苏，预算约 6 亿元，计划 2027 年开工。',
        'cities': ['南京'],
        'industries': ['新能源'],
        'publishNow': True,
    }
    created = post('/api/listings', body, token)
    lid = ((created.get('data') or {}).get('listing') or {}).get('id')
    print('  测试信息:', lid, '| title=', title)

    made = post(f'/api/listings/{lid}/make-short', {'seconds': 5, 'voice': False}, token)
    data = made.get('data') or {}
    feed = data.get('feed') or {}
    fid = feed.get('fileId') or (feed.get('files') or [''])[0]
    print('  生成 ok:', made.get('ok'), '| feed=', feed.get('id'), '| file=', fid, '| 时长=', data.get('duration'))

    recs = load_json('files.json')
    rec = next((r for r in recs if r.get('id') == fid), None)
    if rec and os.path.exists(rec.get('path') or ''):
        subprocess.run(
            ['ffmpeg', '-y', '-loglevel', 'error', '-ss', '1', '-i', rec['path'], '-frames:v', '1', '/tmp/autocover-frame.png', '-nostdin'],
            check=False,
        )
        print('  帧:', os.path.exists('/tmp/autocover-frame.png'), os.path.getsize('/tmp/autocover-frame.png') if os.path.exists('/tmp/autocover-frame.png') else 0)
        # 记录对应的自动配图文件
        news = load_json('listings.json')
        row = next((r for r in news if r.get('id') == lid), None)
        print('  信息 coverUrl:', (row or {}).get('coverUrl'))

    # 清理
    print('  删除测试信息:', delete(f'/api/listings/{lid}', token))
    if feed.get('id'):
        print('  删除测试 feed:', delete(f"/api/feeds/{feed.get('id')}", token))

    for old in ('fd_mw4fzvh83w363p', 'fd_mw4g0fmq4soge3', 'fd_mw4g0x4e4ncq3o'):
        print('  清理旧测试 feed', old, ':', delete(f'/api/feeds/{old}', token))


if __name__ == '__main__':
    main()

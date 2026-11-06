# -*- coding: utf-8 -*-
"""
把旧的「封面合成」短视频全部重生成（新风格：无二维码、无电话、自动配图、男女声混排）

分类依据（直接读数据文件，不依赖接口字段）：
  · tags 含「AI生成」→ 是封面合成的自动视频，可以重生成
  · 其它（手工上传的真实视频）→ 保留不动

流程：对每个自动视频：
  1. 删除旧 feed（释放去重）
  2. 调 /api/listings/:id/make-short 重新生成（10 秒 + 旁白 + auto 音色）
"""

import json
import os
import time
import urllib.request

BASE = 'http://127.0.0.1:8787'
ROOT = '/opt/xiaoyu-laile'


def api(path, method='GET', body=None, token=None):
    headers = {}
    data = None
    if token:
        headers['Authorization'] = 'Bearer ' + token
    if body is not None:
        data = json.dumps(body).encode()
        headers['Content-Type'] = 'application/json'
    req = urllib.request.Request(BASE + path, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=300) as r:
            return json.loads(r.read()), r.status
    except urllib.error.HTTPError as e:
        try:
            return json.loads(e.read()), e.code
        except Exception:
            return {'error': str(e)}, e.code


def load_json(name):
    with open(os.path.join(ROOT, 'data', 'collections', name), encoding='utf-8') as f:
        d = json.load(f)
    return d if isinstance(d, list) else (d.get('rows') or d.get('items') or [])


def main():
    login, _code = api('/api/auth/login', 'POST', {'account': '13456693544', 'password': 'weilan0576'})
    token = (login.get('data') or {}).get('token')
    feeds = [f for f in load_json('feeds.json') if f.get('type') == 'short']
    auto = [f for f in feeds if f.get('autoMade') or any('AI生成' in str(t) for t in (f.get('tags') or []))]
    print(f'  短视频 {len(feeds)} 条，其中自动生成 {len(auto)} 条，手工上传 {len(feeds) - len(auto)} 条（保留）')

    ok = fail = 0
    for f in auto:
        lid = f.get('listingId')
        nid = f.get('newsId')
        title = (f.get('title') or '')[:24]
        if not lid and not nid:
            print('  跳过（无来源）:', f.get('id'), title)
            continue
        print(f'  -> {("news" if nid else "listing")} {nid or lid} | {title}')
        code = api(f'/api/feeds/{f.get("id")}', 'DELETE', token=token)[1]
        print('     删旧:', code)
        path = f'/api/news/{nid}/make-short' if nid else f'/api/listings/{lid}/make-short'
        res, code = api(path, 'POST', {'seconds': 10, 'voice': True, 'voiceGender': 'auto'}, token=token)
        d = res.get('data') or {}
        if res.get('ok'):
            ok += 1
            print(f'     新: 时长={d.get("duration")} 音色={d.get("voiceGender")} feed={(d.get("feed") or {}).get("id")}')
        else:
            fail += 1
            print('     失败:', res.get('error'))
        time.sleep(2)

    print(f'  完成：成功 {ok} / 失败 {fail}')


if __name__ == '__main__':
    main()

# -*- coding: utf-8 -*-
"""检查强脑科技两条信息是否在项目/贸易列表里"""

import json
import urllib.request

BASE = 'http://127.0.0.1:8787'


def get(path):
    with urllib.request.urlopen(BASE + path, timeout=30) as r:
        return json.loads(r.read())


for cat, label in [('project', '项目'), ('trade', '贸易')]:
    d = get(f'/api/listings?category={cat}&limit=10&sort=latest')
    items = (d.get('data') or {}).get('items') or []
    hits = [x for x in items if '强脑' in str(x.get('title') or '')]
    print(f'  {label} 列表共 {len(items)} 条，强脑 {len(hits)} 条')
    for x in hits:
        print('   ', x.get('id'), '|', x.get('title')[:46], '| 封面:', (x.get('coverUrl') or '')[:40])

# 详情
for title_kw in ['合作｜强脑科技', '供货｜强脑科技']:
    d = get('/api/listings?limit=50&sort=latest')
    for x in (d.get('data') or {}).get('items') or []:
        if title_kw in str(x.get('title') or ''):
            det = get('/api/listings/' + x['id'])
            l = (det.get('data') or {}).get('listing') or {}
            fl = l.get('fileList') or []
            print('  详情:', (l.get('title') or '')[:34], '| 附件:', len(fl), '| 状态:', l.get('status'), '| 电话:', (l.get('contact') or {}).get('phone'))
            break

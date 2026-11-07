# -*- coding: utf-8 -*-
"""检查标题前缀实际分布"""

import json
import os
import re
from collections import Counter

ROOT = '/opt/xiaoyu-laile'


def load(p):
    d = json.load(open(os.path.join(ROOT, 'data', 'collections', p), encoding='utf-8'))
    return d if isinstance(d, list) else (d.get('rows') or d.get('items') or [])


rows = [r for r in load('listings.json') if r.get('status') == 'published']
TYPES = ['投资', '融资', 'EPC', '采购', '招标', '转让', '合作', '租赁', '服务', '招聘']

pref = Counter()
new_fmt, old_fmt, no_pref = [], [], []
for r in rows:
    t = str(r.get('title') or '')
    if '｜' in t:
        head = t.split('｜')[0]
        pref[head] += 1
        if head in TYPES:
            new_fmt.append(t)
        else:
            old_fmt.append(t)
    else:
        no_pref.append(t)

print('  已发布:', len(rows))
print('  新格式(类型｜):', len(new_fmt))
print('  旧格式(地区·行业｜):', len(old_fmt))
print('  无前缀:', len(no_pref))
print('  前缀分布(top12):', dict(pref.most_common(12)))
print('\n  旧格式样例:')
for t in old_fmt[:8]:
    print('   ', t[:48])
print('\n  无前缀样例:')
for t in no_pref[:8]:
    print('   ', t[:48])
print('\n  新格式样例:')
for t in new_fmt[:8]:
    print('   ', t[:48])

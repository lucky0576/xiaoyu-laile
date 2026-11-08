# -*- coding: utf-8 -*-
"""更新已发布的强脑合作项目：加入产教联合；并冒烟测试「寻求合作」需求发布"""

import json
import urllib.request

BASE = 'http://127.0.0.1:8787'


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
        with urllib.request.urlopen(r, timeout=120) as resp:
            return json.loads(resp.read()), resp.status
    except urllib.error.HTTPError as e:
        try:
            return json.loads(e.read()), e.code
        except Exception:
            return {'error': str(e)}, e.code


login, _ = req('/api/auth/login', 'POST', {'account': '13456693544', 'password': 'weilan0576'})
token = (login.get('data') or {}).get('token')
mine, _ = req('/api/my/listings', token=token)
items = (mine.get('data') or {}).get('items') or []

PROJECT_TEXT = """【合作项目】BrainCo 强脑科技 × 小鱼来了

一、合作背景
BrainCo 强脑科技创立于 2015 年，是首家入选哈佛大学创新实验室（Harvard Innovation Lab）的中国团队，全球非侵入式脑机接口技术领军企业。已完成约 3 亿美元融资，国内脑机接口领域首家「独角兽」，国家级专精特新「小巨人」企业；脑机接口领域已申请 630 余项专利、获得 400 余项授权（核心发明专利 220 余项）。

二、合作方向
1. 产教联合：产业学院、产教融合实训基地、实习实训基地共建；
2. 高校 / 科研机构：共建「脑机智能机器人创践中心」，联合实验室、实训基地；
3. 园区 / 政府：脑机接口 + 具身智能产业创新中心、科普展示中心；
4. 人才培养：脑机接口、机器人、人工智能实训课程与师资培训；
5. 成果转化：科研设备联合采购、项目对接、技术落地场景。

三、可交付内容
· RevoTron 双臂机器人 / RevoMate 轻量机器人 / RevoArm 七轴臂
· Revo2 / Revo3 仿生灵巧手（6 电机 11 自由度 / 21 自由度全直驱）
· RevoHuman 外骨骼式人类中心数采方案
· BCIGo 32 通道无线脑电系统、遥操作套装、多模态生理信号采集
· 脑控机器人套件、脑控机械臂套件、灵巧手弹琴/遥操作/四足狗等整体方案
· 课程体系：脑机接口、机器人、人工智能三大模块实训课程

四、合作方式
产教联合 + 设备采购 + 课程共建 + 联合实验室 + 项目对接，具体方案一事一议。

五、联系
通过小鱼来了平台对接强脑科技商务团队。"""

updated = 0
for x in items:
    t = str(x.get('title') or '')
    if t.startswith('合作｜强脑科技') and x.get('status') == 'published':
        r, code = req('/api/listings/' + x['id'], 'PUT', {'text': PROJECT_TEXT, 'subtitle': '产教联合 · 脑机接口 + 具身智能 · 校企共建'}, token)
        print('  更新合作项目:', x['id'], code, r.get('ok'))
        updated += 1
print('  更新数量:', updated)

# 检查
d, _ = req('/api/listings?category=project&limit=20&sort=latest')
for x in (d.get('data') or {}).get('items') or []:
    if '强脑科技' in str(x.get('title') or ''):
        det, _ = req('/api/listings/' + x['id'])
        l = (det.get('data') or {}).get('listing') or {}
        txt = l.get('text') or ''
        print('  校验:', l.get('title')[:30], '| 含产教联合:', '产教联合' in txt, '| 说明字数:', len(txt))

# 冒烟：模拟「寻求合作」提交（与页面同字段）
r, code = req('/api/listings', 'POST', {
    'category': 'project',
    'title': '寻求合作｜测试单位 · 强脑科技产教联合',
    'subtitle': '杭州 · 测试单位 · 强脑科技产教联合 / 合作需求',
    'text': '【寻求合作】测试\n合作单位：测试单位\n联系人：测试\n电话：13900000000\n城市：杭州\n合作方向：产教联合、课程共建\n（补充资料 0 个，见附件）',
    'type': '寻求合作',
    'durationDays': 180,
    'publish': True,
    'contactName': '测试',
    'phone': '13900000000',
    'company': '测试单位',
}, token)
d = r.get('data') or {}
lid = (d.get('listing') or {}).get('id') or d.get('id')
print('  寻求合作发布测试:', r.get('ok'), code, '| id:', lid)
if lid:
    req('/api/listings/' + lid, 'DELETE', token=token)
    print('  测试数据已清理')

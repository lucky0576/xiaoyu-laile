# -*- coding: utf-8 -*-
"""把强脑科技合作项目 + 产品供货发到平台（项目 / 贸易）"""

import json
import os
import subprocess
import urllib.request

BASE = 'http://127.0.0.1:8787'
ROOT = '/opt/xiaoyu-laile'
IMG = os.path.join(ROOT, 'public', 'static', 'brainco')


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
        with urllib.request.urlopen(r, timeout=180) as resp:
            return json.loads(resp.read()), resp.status
    except urllib.error.HTTPError as e:
        try:
            return json.loads(e.read()), e.code
        except Exception:
            return {'error': str(e)}, e.code


def upload(token, path):
    out = subprocess.run(
        ['curl', '-s', '--max-time', '90', '-X', 'POST', BASE + '/api/files',
         '-H', 'Authorization: Bearer ' + token, '-F', 'file=@' + path],
        capture_output=True, text=True,
    ).stdout
    try:
        d = json.loads(out)
        return ((d.get('data') or {}).get('files') or [{}])[0].get('id') or ''
    except Exception:
        print('  上传失败:', out[:200])
        return ''


def main():
    login, _ = req('/api/auth/login', 'POST', {'account': '13456693544', 'password': 'weilan0576'})
    token = (login.get('data') or {}).get('token')
    if not token:
        print('  登录失败')
        return

    # 已存在就跳过
    mine, _ = req('/api/my/listings', token=token)
    items = (mine.get('data') or {}).get('items') or []
    have = {str(x.get('title') or '') for x in items}

    img_company = upload(token, os.path.join(IMG, 'company.jpg'))
    img_robot = upload(token, os.path.join(IMG, 'robot.jpg'))
    img_tr = upload(token, os.path.join(IMG, 'revotron.jpg'))
    img_eeg = upload(token, os.path.join(IMG, 'eeg.jpg'))
    img_remote = upload(token, os.path.join(IMG, 'remote.jpg'))
    print('  图片:', img_company, img_robot, img_tr, img_eeg, img_remote)

    project_title = '合作｜强脑科技脑机智能机器人创践中心共建合作'
    trade_title = '供货｜强脑科技 RevoTron 双臂机器人 / Revo3 灵巧手 / 32 通道脑电'

    project_text = """【合作项目】BrainCo 强脑科技 × 小鱼来了

一、合作背景
BrainCo 强脑科技创立于 2015 年，是首家入选哈佛大学创新实验室（Harvard Innovation Lab）的中国团队，全球非侵入式脑机接口技术领军企业。已完成约 3 亿美元融资，国内脑机接口领域首家「独角兽」，国家级专精特新「小巨人」企业；脑机接口领域已申请 630 余项专利、获得 400 余项授权（核心发明专利 220 余项）。

二、合作方向
1. 高校 / 科研机构：共建「脑机智能机器人创践中心」，联合实验室、实训基地；
2. 园区 / 政府：脑机接口 + 具身智能产业创新中心、科普展示中心；
3. 人才培养：脑机接口、机器人、人工智能实训课程与师资培训；
4. 成果转化：科研设备联合采购、项目对接、技术落地场景。

三、可交付内容
· RevoTron 双臂机器人 / RevoMate 轻量机器人 / RevoArm 七轴臂
· Revo2 / Revo3 仿生灵巧手（6 电机 11 自由度 / 21 自由度全直驱）
· BCIGo 32 通道无线脑电系统、遥操作套装、多模态生理信号采集
· 脑控机器人套件、脑控机械臂套件、灵巧手弹琴/遥操作/四足狗等整体方案
· 课程体系：脑机接口、机器人、人工智能三大模块实训课程

四、合作方式
设备采购 + 课程共建 + 联合实验室 + 项目对接，具体方案一事一议。

五、联系
通过小鱼来了平台对接强脑科技商务团队。"""

    trade_text = """【产品供货】BrainCo 强脑科技（浙江强脑科技有限公司）

一、供货产品与市场参考价
· RevoTron 重量级双臂机器人：固定支架版 ¥560,000 / 移动折叠版 ¥695,000
· 科研双臂灵巧手控制平台 ¥450,000｜科研单臂平台 ¥200,000
· RevoArm 轻量桌面七轴臂：价格面议
· Revo2 仿生灵巧手：基础版 ¥19,999 / Pro ¥24,999 / 触觉版 ¥34,999
· Revo3 仿生灵巧手：基础版 ¥100,000 / 触觉版 ¥130,000 / 视触觉版 ¥200,000
· BCIGo 32 通道无线脑电系统 ¥250,000
· 遥操作集成套装 ¥65,000｜多模态生理信号套装 ¥68,000｜肌电臂环 ¥32,500
· 脑控机器人套件 ¥649,000｜脑控机械臂套件 ¥512,000｜轻量脑控机械臂 ¥166,998
· 灵巧手弹琴平台 ¥221,500｜EMG 控制平台 ¥90,500｜遥操作平台 ¥290,688
· 四足机器狗 ¥182,500｜离散粒子平台 ¥50,000

二、适用场景
高校实训 / 科研实验室 / 具身智能数据采集 / 脑机接口教学 / 园区展示

三、交付与售后
原厂交付、现场安装调试与培训，整机及配件质保 1 年；可配套课程与师资培训。

四、采购方式
通过小鱼来了提交采购需求（或在本专题页加入采购单），由强脑科技商务统一报价。"""

    created = []
    if project_title not in have:
        files = [x for x in [img_company, img_robot] if x]
        r, code = req('/api/listings', 'POST', {
            'category': 'project',
            'title': project_title,
            'subtitle': '脑机接口 + 具身智能 · 校企共建 · 联合实验室',
            'text': project_text,
            'durationDays': 180,
            'publish': True,
            'fileIds': files,
            'contactName': '强脑科技 · 商务合作（平台转接）',
            'phone': '15606768989',
        }, token)
        d = r.get('data') or {}
        lid = (d.get('listing') or {}).get('id') or d.get('id')
        print('  合作项目:', r.get('ok'), code, '| id:', lid)
        if lid:
            created.append(lid)
    else:
        print('  合作项目已存在，跳过')

    if trade_title not in have:
        files = [x for x in [img_tr, img_eeg, img_remote] if x]
        r, code = req('/api/listings', 'POST', {
            'category': 'trade',
            'title': trade_title,
            'subtitle': '原厂供货 · 高校科研教育场景 · 可开票',
            'text': trade_text,
            'durationDays': 180,
            'publish': True,
            'fileIds': files,
            'type': '供应',
            'contactName': '强脑科技 · 产品采购（平台转接）',
            'phone': '15606768989',
        }, token)
        d = r.get('data') or {}
        lid = (d.get('listing') or {}).get('id') or d.get('id')
        print('  产品供货:', r.get('ok'), code, '| id:', lid)
        if lid:
            created.append(lid)
    else:
        print('  产品供货已存在，跳过')

    print('  完成，新增:', created)


if __name__ == '__main__':
    main()

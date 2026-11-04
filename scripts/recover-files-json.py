"""
 * 数据抢救：从 files.json.corrupt-* 里恢复文件记录
 *
 * 背景：一次清理脚本写 files.json 时遇到 surrogate 字符报错，
 *      文件被 open('w') 截断，随后服务启动时按空库重建，
 *      导致 1000+ 条文件记录丢失（磁盘上的实体都还在）。
 *
 * 做法：
 *   1. 用 raw_decode 逐条解析损坏文件里「完整」的 JSON 对象（截断处就停）；
 *   2. 扫描 uploads 目录，补齐没有记录的实体文件（名字/大小/时间从磁盘取）；
 *   3. 从 listings / feeds / users / posts 里找出 f_xxx 引用，补回 listingId 与 ownerId；
 *   4. 写出新的 files.json（ensure_ascii=True，避免 surrogate 再次炸掉）。
 *
 * 用法（服务器上，先停服务）：
 *   systemctl stop xiaoyu-laile
 *   python3 scripts/recover-files-json.py
 *   systemctl start xiaoyu-laile
"""

import glob
import io
import json
import os
import re
import sys

ROOT = '/opt/xiaoyu-laile'
COLL = os.path.join(ROOT, 'data', 'collections')
UPLOADS = os.path.join(ROOT, 'data', 'uploads')

dec = json.JSONDecoder()


def salvage(path):
    """从被截断的 JSON 数组里尽可能多地解析出完整对象。"""
    text = io.open(path, encoding='utf-8', errors='replace').read()
    out = []
    idx = text.find('[')
    if idx < 0:
        return out
    idx += 1
    while idx < len(text):
        # 跳过空白与逗号
        while idx < len(text) and text[idx] in ' \n\r\t,':
            idx += 1
        if idx >= len(text) or text[idx] != '{':
            break
        try:
            obj, end = dec.raw_decode(text, idx)
        except Exception:
            break
        if isinstance(obj, dict) and obj.get('id'):
            out.append(obj)
        idx = end
    return out


def load(name):
    p = os.path.join(COLL, name + '.json')
    if not os.path.exists(p):
        return []
    try:
        d = json.load(io.open(p, encoding='utf-8'))
    except Exception:
        return []
    if isinstance(d, list):
        return d
    for k in ('rows', 'items'):
        if isinstance(d.get(k), list):
            return d[k]
    return []


def main():
    corrupts = sorted(glob.glob(os.path.join(COLL, 'files.json.corrupt-*')), key=os.path.getmtime)
    if not corrupts:
        print('没有找到 corrupt 文件，退出')
        return 1
    src = corrupts[-1]
    print('从', src, '恢复')

    records = salvage(src)
    print('  解析出完整记录:', len(records))
    by_id = {r['id']: r for r in records}

    # 现有（重建后）的记录也保留
    for r in load('files'):
        by_id.setdefault(r['id'], r)

    # 扫磁盘：实体文件对应的 id
    disk = {}
    for dirpath, _dirs, names in os.walk(UPLOADS):
        for n in names:
            m = re.match(r'^(f_[a-z0-9]{6,})\.[^.]+$', n, re.I)
            if not m:
                continue
            p = os.path.join(dirpath, n)
            try:
                st = os.stat(p)
            except OSError:
                continue
            disk[m.group(1)] = (p, n, st)

    print('  磁盘上的实体文件:', len(disk))

    # 从其它集合里找引用：确定 listingId / ownerId
    refs = {}
    for name, field in (('listings', 'listingId'), ('feeds', 'listingId')):
        for row in load(name):
            txt = json.dumps(row, ensure_ascii=True)
            for fid in set(re.findall(r'f_[a-z0-9]{6,}', txt)):
                if field == 'listingId' and row.get('id'):
                    refs.setdefault(fid, {})['listingId'] = row.get('id', '')
                if row.get('ownerId'):
                    refs.setdefault(fid, {})['ownerId'] = row.get('ownerId', '')
    for row in load('users'):
        txt = json.dumps(row, ensure_ascii=True)
        for fid in set(re.findall(r'f_[a-z0-9]{6,}', txt)):
            if row.get('id'):
                refs.setdefault(fid, {})['ownerId'] = row['id']

    added_stub = 0
    for fid, (p, name, st) in disk.items():
        if fid in by_id:
            # 有记录但路径可能失效：补上真实 path
            rec = by_id[fid]
            rec['path'] = p
            rec.setdefault('size', st.st_size)
            continue
        ext = os.path.splitext(name)[1].lower()
        kind = 'image' if ext in ('.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp') else (
            'video' if ext in ('.mp4', '.mov', '.webm', '.avi', '.mkv') else (
                'pdf' if ext == '.pdf' else (
                    'doc' if ext in ('.doc', '.docx') else (
                        'sheet' if ext in ('.xls', '.xlsx', '.csv') else (
                            'ppt' if ext in ('.ppt', '.pptx') else 'file')))))
        rec = {
            'id': fid,
            'ownerId': refs.get(fid, {}).get('ownerId', ''),
            'listingId': refs.get(fid, {}).get('listingId', ''),
            'role': 'attachment',
            'name': name,
            'ext': ext,
            'kind': kind,
            'mime': 'application/octet-stream',
            'size': st.st_size,
            'path': p,
            'url': '/files/%s/%s' % (fid, name),
            'text': '',
            'parsing': False,
            'createdAt': __import__('datetime').datetime.utcfromtimestamp(st.st_mtime).isoformat() + 'Z',
        }
        by_id[fid] = rec
        added_stub += 1

    print('  磁盘补齐记录:', added_stub)
    # 补引用
    patched = 0
    for fid, rec in by_id.items():
        r = refs.get(fid, {})
        if r.get('listingId') and not rec.get('listingId'):
            rec['listingId'] = r['listingId']
            patched += 1
        if r.get('ownerId') and not rec.get('ownerId'):
            rec['ownerId'] = r['ownerId']
            patched += 1
    print('  补回引用:', patched)

    out = list(by_id.values())
    target = os.path.join(COLL, 'files.json')
    tmp = target + '.recover.tmp'
    with io.open(tmp, 'w', encoding='utf-8') as f:
        json.dump(out, f, ensure_ascii=True)  # ensure_ascii=True：绝不再被 surrogate 搞死
    os.replace(tmp, target)
    print('  已写出', target, '条目:', len(out), '大小:', os.path.getsize(target))
    return 0


if __name__ == '__main__':
    sys.exit(main())

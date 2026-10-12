/**
 * 一次性清理脚本：删除测试期间产生的测试 / 验证数据。
 * 只删除下面显式列出的 ID，绝不按关键词模糊匹配，避免误伤正式示例数据。
 */
const fs = require('node:fs');
const path = require('node:path');

const DIR = path.join(__dirname, '..', 'data', 'collections');

// —— 显式白名单：只删这些 ——
const TEST_LISTINGS = new Set([
  'l_mv52v88bupu8lg', // 文件可见性测试项目
  'l_mv53jqcx9n0nzp', // 文件可见性验证项目
  'l_mv54g7ll8cq2g2', // 江苏盐城 500MWh 独立储能电站项目（通知测试）
]);

const TEST_USERS = new Set([
  'use_mv4zvtmy11td3b', // 13755556666 验证用户
  'use_mv52ds0gjt620y', // 13766667777 AI 验证
  'use_mv52gudr0wmtqi', // 13788889999 终验
  'use_mv52v86fllk1ne', // 13600009001 发布方A
  'use_mv52v86q22sl82', // 13600009002 普通用户B
  'use_mv53jqbc9ifv2g', // 13600009021 文件发布方
  'use_mv53jqbo0w82ft', // 13600009022 文件查看者
  'use_mv54g7kbfj9c90', // 13600009101 通知发布方
  'use_mv54g7knxqen2a', // 13600009102 关注者
  'use_mv54g7kwk93rdk', // 13600009103 普通会员
  'use_mv55jb1jue6c5x', // wxa…@example.com 账号甲
  'use_mv55jb5qaiuxqy', // wxb…@example.com 账号乙
]);

const read = (n) => JSON.parse(fs.readFileSync(path.join(DIR, n), 'utf8'));
const write = (n, v) => {
  fs.writeFileSync(path.join(DIR, n), JSON.stringify(v, null, 2), 'utf8');
  return v.length;
};

const report = [];

/* ---- listings ---- */
{
  const before = read('listings.json');
  const removed = before.filter((l) => TEST_LISTINGS.has(l.id));
  const after = before.filter((l) => !TEST_LISTINGS.has(l.id));
  write('listings.json', after);
  report.push(`信息      : ${before.length} → ${after.length}（删除 ${removed.length}）`);
  for (const l of removed) report.push(`            - ${l.title}`);
}

/* ---- users ---- */
{
  const before = read('users.json');
  const removed = before.filter((u) => TEST_USERS.has(u.id));
  const after = before.filter((u) => !TEST_USERS.has(u.id));
  write('users.json', after);
  report.push(`账号      : ${before.length} → ${after.length}（删除 ${removed.length}）`);
  for (const u of removed) report.push(`            - ${u.nickname} / ${u.phone || u.email}`);
}

/* ---- notifications：涉及测试信息或发给测试账号的 ---- */
{
  const before = read('notifications.json');
  const removed = before.filter(
    (n) => TEST_USERS.has(n.userId) || (n.meta && TEST_LISTINGS.has(n.meta.listingId)),
  );
  const after = before.filter(
    (n) => !(TEST_USERS.has(n.userId) || (n.meta && TEST_LISTINGS.has(n.meta.listingId))),
  );
  write('notifications.json', after);
  report.push(`通知      : ${before.length} → ${after.length}（删除 ${removed.length}）`);
  const toReal = removed.filter((n) => !TEST_USERS.has(n.userId));
  if (toReal.length) report.push(`            其中 ${toReal.length} 条是误发给真实用户的测试推送`);
}

/* ---- follows ---- */
{
  const before = read('follows.json');
  const after = before.filter(
    (f) => !(TEST_USERS.has(f.userId) || TEST_LISTINGS.has(f.targetId) || TEST_USERS.has(f.targetId)),
  );
  write('follows.json', after);
  report.push(`关注关系  : ${before.length} → ${after.length}（删除 ${before.length - after.length}）`);
}

/* ---- files：记录 + 磁盘文件 ---- */
{
  const before = read('files.json');
  const removed = before.filter((f) => TEST_USERS.has(f.ownerId) || TEST_LISTINGS.has(f.listingId));
  const after = before.filter((f) => !(TEST_USERS.has(f.ownerId) || TEST_LISTINGS.has(f.listingId)));
  write('files.json', after);
  let deleted = 0;
  for (const f of removed) {
    if (f.path && fs.existsSync(f.path)) {
      try {
        fs.unlinkSync(f.path);
        deleted++;
      } catch {
        /* ignore */
      }
    }
  }
  report.push(`文件      : ${before.length} → ${after.length}（删除 ${removed.length} 条记录，${deleted} 个磁盘文件）`);
}

/* ---- comments / shares / meetings / feeds / cases ---- */
for (const n of ['comments.json', 'shares.json', 'meetings.json', 'feeds.json', 'cases.json']) {
  const p = path.join(DIR, n);
  if (!fs.existsSync(p)) continue;
  const before = read(n);
  const after = before.filter(
    (x) =>
      !TEST_LISTINGS.has(x.listingId) &&
      !TEST_USERS.has(x.userId) &&
      !TEST_USERS.has(x.ownerId) &&
      !TEST_LISTINGS.has(x.targetId),
  );
  if (before.length !== after.length) {
    write(n, after);
    report.push(`${n.replace('.json', '').padEnd(10)}: ${before.length} → ${after.length}（删除 ${before.length - after.length}）`);
  }
}

/* ---- otps：清掉测试手机号的一次性验证码 ---- */
{
  const before = read('otps.json');
  const TEST_PHONES = new Set(['13755556666', '13766667777', '13788889999', '13600009001', '13600009002',
    '13600009011', '13600009012', '13600009021', '13600009022', '13600009101', '13600009102', '13600009103']);
  const after = before.filter((o) => !TEST_PHONES.has(String(o.target || '')));
  if (before.length !== after.length) {
    write('otps.json', after);
    report.push(`验证码    : ${before.length} → ${after.length}（删除 ${before.length - after.length}）`);
  }
}

console.log(report.join('\n'));

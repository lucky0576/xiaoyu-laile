#!/usr/bin/env node
/**
 * 设置管理员账号与密码（在 /opt/xiaoyu-laile 下运行，需先停服务）
 *
 * 用法: node scripts/set-admin.cjs <手机号> <新密码> [昵称] [--demote-others]
 *
 * 用户不存在时自动创建。
 * --demote-others 会把其他管理员降级。
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..');
const USERS = path.join(ROOT, 'data', 'collections', 'users.json');

const ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyz';
function newId(prefix) {
  const t = Date.now().toString(36);
  const b = crypto.randomBytes(6);
  let r = '';
  for (let i = 0; i < 6; i++) r += ALPHABET[b[i] % 36];
  return `${prefix}_${t}${r}`;
}

function hashPassword(pw) {
  const salt = crypto.randomBytes(16);
  const key = crypto.scryptSync(String(pw), salt, 64, { N: 16384, r: 8, p: 1 });
  return `scrypt$16384$8$1$${salt.toString('hex')}$${key.toString('hex')}`;
}

const argv = process.argv.slice(2);
const flags = argv.filter((a) => a.startsWith('--'));
const positional = argv.filter((a) => !a.startsWith('--'));
const phone = String(positional[0] || '').trim();
const password = String(positional[1] || '');
const nicknameArg = String(positional[2] || '').trim();
const demoteOthers = flags.includes('--demote-others');

if (!/^1[3-9]\d{9}$/.test(phone)) {
  console.error('手机号格式不正确');
  process.exit(1);
}
if (password.length < 6) {
  console.error('密码至少 6 位');
  process.exit(1);
}

const users = JSON.parse(fs.readFileSync(USERS, 'utf8'));
const now = new Date().toISOString();
const hash = hashPassword(password);

let target = users.find((u) => u.phone === phone);
let created = false;

if (!target) {
  target = {
    id: newId('use'),
    nickname: nicknameArg || `用户${phone.slice(-4)}`,
    avatar: '',
    phone,
    email: '',
    wechatOpenId: '',
    wechatUnionId: '',
    wechatId: '',
    passwordHash: hash,
    company: '',
    profession: '',
    industry: '',
    city: '',
    bio: '',
    logo: '',
    cards: [],
    companyDeck: [],
    website: '',
    status: 'active',
    isAdmin: true,
    verified: false,
    level: 'free',
    accountType: '',
    verification: {
      type: '',
      status: 'none',
      realName: '',
      idNumber: '',
      idFrontFileId: '',
      idBackFileId: '',
      companyName: '',
      creditCode: '',
      licenseFileId: '',
      aiReview: null,
      submittedAt: null,
      reviewedAt: null,
      reviewerNote: '',
    },
    settings: {},
    createdAt: now,
    updatedAt: now,
  };
  users.push(target);
  created = true;
} else {
  target.isAdmin = true;
  target.passwordHash = hash;
  target.status = 'active';
  if (nicknameArg) target.nickname = nicknameArg;
  target.updatedAt = now;
}

if (demoteOthers) {
  for (const u of users) {
    if (u.phone !== phone && u.isAdmin) {
      u.isAdmin = false;
      u.updatedAt = now;
    }
  }
}

fs.writeFileSync(USERS, JSON.stringify(users, null, 2), 'utf8');

console.log(`  ${created ? '已创建' : '已更新'}用户: ${target.nickname} (${phone})`);
console.log(`  isAdmin = true, 密码已设置`);
console.log(`  用户总数: ${users.length}`);
console.log(`  当前管理员: ${users.filter((u) => u.isAdmin).map((u) => u.phone).join(', ')}`);

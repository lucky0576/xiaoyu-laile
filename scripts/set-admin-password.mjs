/**
 * 修改指定手机号账号的登录密码
 *
 * 为什么单独写一个：密码是 scrypt 哈希（带随机盐），
 * 直接改 JSON 文件没用——必须用服务端同一套 hashPassword 生成。
 *
 * 用法：
 *   node scripts/set-admin-password.mjs <手机号> <新密码>
 *   node scripts/set-admin-password.mjs --list-admins
 *
 * 安全：新密码通过命令行参数传入，不写进文件、不打印明文。
 *       注意 shell 历史里会留痕，敏感环境建议改用环境变量：
 *         XYL_NEW_PASSWORD=xxx node scripts/set-admin-password.mjs 13456693544
 */

import db from '../src/store/db.js';
import { hashPassword } from '../src/services/auth.js';

const users = db.collection('users');

function listAdmins() {
  const admins = users.all().filter((u) => u.isAdmin);
  if (!admins.length) {
    console.log('没有找到管理员账号');
    return;
  }
  console.log(`管理员账号 ${admins.length} 个：`);
  for (const u of admins) {
    console.log(`  ${u.phone || u.email || '(无登录名)'}  ${u.nickname || ''}  id=${u.id}`);
  }
}

const args = process.argv.slice(2);

if (args[0] === '--list-admins') {
  listAdmins();
  process.exit(0);
}

const phone = String(args[0] || '').trim();
const password = String(args[1] || process.env.XYL_NEW_PASSWORD || '');

if (!phone || !password) {
  console.error('用法: node scripts/set-admin-password.mjs <手机号> <新密码>');
  console.error('      node scripts/set-admin-password.mjs --list-admins');
  process.exit(1);
}

if (password.length < 8) {
  console.error('密码至少 8 位');
  process.exit(1);
}

const user = users.findOne((u) => u.phone === phone || u.email === phone);
if (!user) {
  console.error(`找不到账号: ${phone}`);
  console.error('可以先运行 --list-admins 看现有管理员');
  process.exit(2);
}

users.update(user.id, { passwordHash: hashPassword(password) });
db.flush();

console.log(`✅ 已更新密码`);
console.log(`   账号: ${user.phone || user.email}`);
console.log(`   昵称: ${user.nickname || '(未设置)'}`);
console.log(`   管理员: ${user.isAdmin ? '是' : '否'}`);
console.log(`   密码长度: ${password.length} 位（不显示明文）`);

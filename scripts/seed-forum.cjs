#!/usr/bin/env node
/**
 * 论坛示例帖灌入脚本（在服务器 /opt/xiaoyu-laile 下运行，需先停服务）
 *
 * 用法：node scripts/seed-forum.js /tmp/seed-forum-posts.json
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..');
const COL = path.join(ROOT, 'data', 'collections');

const seedFile = process.argv[2];
if (!seedFile) {
  console.error('用法: node scripts/seed-forum.js <seed.json>');
  process.exit(1);
}

const ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyz';
function newId(prefix) {
  const t = Date.now().toString(36);
  const b = crypto.randomBytes(6);
  let r = '';
  for (let i = 0; i < 6; i++) r += ALPHABET[b[i] % 36];
  return `${prefix}_${t}${r}`;
}

function readJson(name, fallback) {
  const f = path.join(COL, `${name}.json`);
  try {
    if (!fs.existsSync(f)) return fallback;
    const raw = fs.readFileSync(f, 'utf8');
    if (!raw.trim()) return fallback;
    return JSON.parse(raw);
  } catch (e) {
    console.error(`读取 ${name}.json 失败:`, e.message);
    return fallback;
  }
}

function writeJson(name, data) {
  const f = path.join(COL, `${name}.json`);
  fs.writeFileSync(f, JSON.stringify(data, null, 2), 'utf8');
}

const users = readJson('users', []);
const forums = readJson('forums', []);
const posts = readJson('posts', []);
const comments = readJson('postComments', []);
const seed = JSON.parse(fs.readFileSync(seedFile, 'utf8'));

const userByPhone = new Map();
for (const u of users) if (u.phone) userByPhone.set(u.phone, u);

const forumBySlug = new Map();
for (const f of forums) forumBySlug.set(f.slug, f);

// 已有帖子标题集合，避免重复灌入
const existingTitles = new Set(posts.map((p) => `${p.forumId}::${p.title}`));

const NOW = Date.now();
const DAY = 86400000;

let addedPosts = 0;
let addedComments = 0;
let skipped = 0;

for (const item of seed.posts || []) {
  const forum = forumBySlug.get(item.forumSlug);
  if (!forum) {
    console.warn(`  跳过（板块不存在）: ${item.forumSlug} / ${item.title}`);
    skipped++;
    continue;
  }
  const key = `${forum.id}::${item.title}`;
  if (existingTitles.has(key)) {
    skipped++;
    continue;
  }

  const author = userByPhone.get(item.authorPhone) || users[0];
  if (!author) {
    console.warn('  跳过（没有可用作者）');
    skipped++;
    continue;
  }

  const createdAt = new Date(NOW - (item.daysAgo || 1) * DAY - Math.floor(Math.random() * 6) * 3600000).toISOString();

  const postId = newId('po');
  const post = {
    id: postId,
    forumId: forum.id,
    forumSlug: forum.slug,
    forumName: forum.name,
    forumIcon: forum.icon,
    authorId: author.id,
    authorName: author.nickname || '匿名用户',
    authorAvatar: author.avatar || '',
    authorVerified: Boolean(author.verified || (author.verification && author.verification.status === 'approved')),
    title: item.title,
    body: item.body,
    images: [],
    tags: [],
    likeUserIds: Array.from({ length: Math.min(item.likes || 0, users.length) }, (_, i) => users[i].id),
    commentCount: 0,
    viewCount: item.views || 0,
    pinned: false,
    status: 'published',
    createdAt,
    updatedAt: createdAt,
  };

  // 评论
  let cCount = 0;
  for (const c of item.comments || []) {
    const ca = userByPhone.get(c.authorPhone) || users[0];
    const cAt = new Date(new Date(createdAt).getTime() + (c.hoursAgo || 1) * 3600000).toISOString();
    comments.push({
      id: newId('pc'),
      postId,
      authorId: ca.id,
      authorName: ca.nickname || '匿名用户',
      authorAvatar: ca.avatar || '',
      content: c.content,
      createdAt: cAt,
      updatedAt: cAt,
    });
    cCount++;
    addedComments++;
  }
  post.commentCount = cCount;

  posts.push(post);
  existingTitles.add(key);
  addedPosts++;
}

// 重算板块统计
for (const f of forums) {
  const list = posts.filter((p) => p.forumId === f.id && p.status !== 'hidden');
  f.postCount = list.length;
  f.lastPostAt = list.reduce((acc, p) => (!acc || p.createdAt > acc ? p.createdAt : acc), '');
}

writeJson('posts', posts);
writeJson('postComments', comments);
writeJson('forums', forums);

console.log(`  新增帖子: ${addedPosts}`);
console.log(`  新增回复: ${addedComments}`);
console.log(`  跳过:     ${skipped}`);
console.log(`  帖子总数: ${posts.length}`);
console.log('  板块统计:');
for (const f of forums) console.log(`    ${f.slug.padEnd(16)} ${f.postCount}`);

// 用新的 tagOf 规则给已有新闻重新打标（必须 UTF-8 保存）
// 规则：至少一个标签必须在标题里命中，否则视为与本平台无关
import fs from 'node:fs';

const P = 'data/collections/news.json';
const { NEWS_TAGS } = await import('/opt/xiaoyu-laile/src/data/news-sources.js');

function tagOf(title, text) {
  const titleStr = String(title || '');
  const bodyStr = String(text || '').slice(0, 1200);
  const tags = [];
  let titleHit = false;
  for (const t of NEWS_TAGS) {
    const hay = t.scope === 'title' ? titleStr : titleStr + '\n' + bodyStr;
    if (!t.words.some((w) => hay.includes(w))) continue;
    tags.push(t.id);
    if (!titleHit && t.words.some((w) => titleStr.includes(w))) titleHit = true;
  }
  return { tags, titleHit };
}

function stripPrefix(t) {
  let x = String(t || '').replace(/^(头条新闻|图片新闻|视频新闻|滚动新闻|最新|要闻|推荐)\s*[-—–·]\s*/, '').trim();
  // 去掉尾部站点名
  const tail = /^([\s\S]{8,}?)\s*[-—–|｜]\s*([^\-—–|｜]{1,14})\s*$/.exec(x);
  if (tail && tail[1].trim().length >= 8) x = tail[1].trim();
  return x;
}

const arr = JSON.parse(fs.readFileSync(P, 'utf8'));
const before = arr.length;
let changed = 0;
const drop = [];
const kept = [];

for (const n of arr) {
  const cleanTitle = stripPrefix(n.title);
  const { tags, titleHit } = tagOf(cleanTitle, n.text || n.summary || '');
  if (!tags.length || !titleHit) {
    drop.push(n);
    continue;
  }
  if (JSON.stringify(tags) !== JSON.stringify(n.tags || [])) changed += 1;
  kept.push({ ...n, title: cleanTitle, tags });
}

fs.writeFileSync(P, JSON.stringify(kept, null, 2));

console.log('BEFORE=' + before + ' AFTER=' + kept.length + ' REMOVED=' + drop.length + ' RETAGGED=' + changed);
console.log('');
console.log('--- 移除（标题未命中任何标签 = 与平台无关）---');
for (const d of drop.slice(0, 20)) console.log('  [' + String(d.title || '').slice(0, 44) + ']');
console.log('');
console.log('--- 保留样例 ---');
for (const k of kept.slice(0, 10)) console.log('  [' + k.tags.join(',') + '] ' + String(k.title || '').slice(0, 44));

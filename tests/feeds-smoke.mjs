/**
 * 小鱼来了 — 短视频与直播端到端测试
 *
 * 覆盖：上传短视频 / 列表与精选 / 播放计数 / 点赞 / 创建直播间 /
 *       开播（复用会议号与信令）/ 直播信息 / 分享 / 结束直播 / 权限与边界
 *
 * 运行：node tests/feeds-smoke.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
process.chdir(ROOT);

const TEST_DATA = path.join(ROOT, 'data-test-feeds');
fs.rmSync(TEST_DATA, { recursive: true, force: true });
process.env.DATA_DIR = 'data-test-feeds';
process.env.NO_SEED = '1';
process.env.SESSION_SECRET = 'feeds-test-'.padEnd(48, 'x');
process.env.PUBLIC_BASE_URL = '';

const { createApp } = await import('../src/http/app.js');
const registerRoutes = (await import('../src/routes/index.js')).default;
const db = (await import('../src/store/db.js')).default;

const PORT = 8934;
const BASE = `http://127.0.0.1:${PORT}`;

let passed = 0;
let failed = 0;
const failures = [];
function check(name, cond, detail = '') {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; failures.push(`${name}${detail ? ` — ${detail}` : ''}`); console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`); }
}

async function call(method, url, { token, body } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  let payload;
  if (body !== undefined) { headers['Content-Type'] = 'application/json'; payload = JSON.stringify(body); }
  const res = await fetch(BASE + url, { method, headers, body: payload });
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* ignore */ }
  return { status: res.status, json, data: json && json.data !== undefined ? json.data : json };
}

async function loginPhone(phone, nickname) {
  const c = await call('POST', '/api/auth/sms/send', { body: { phone, purpose: 'login' } });
  const r = await call('POST', '/api/auth/sms/login', { body: { phone, code: c.data.demoCode, purpose: 'login', nickname } });
  return { token: r.data.token, user: r.data.user };
}

/** 用最小合法 MP4 头部构造上传文件 */
const MP4_HEAD = Buffer.from('00000018667479706d703432000000006d70343269736f6d', 'hex');
async function uploadFeed(token, { type, title, subtitle, withFile = true, withCover = true }) {
  const fd = new FormData();
  fd.append('type', type);
  fd.append('title', title);
  if (subtitle) fd.append('subtitle', subtitle);
  if (withFile) fd.append('file', new Blob([MP4_HEAD], { type: 'video/mp4' }), 'clip.mp4');
  if (withCover) {
    // 1x1 PNG
    const png = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c6300010000050001od'.replace('od', '0d0a'), 'hex');
    fd.append('file', new Blob([png], { type: 'image/png' }), 'cover.png');
  }
  const res = await fetch(`${BASE}/api/feeds`, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: fd });
  const json = await res.json();
  return { status: res.status, data: json.data, json };
}

async function main() {
  const app = createApp();
  registerRoutes(app);
  await app.listen(PORT, '127.0.0.1');
  check('服务启动', true);

  const host = await loginPhone('13700001111', '主播-刘总');
  const other = await loginPhone('13700002222', '观众-陈工');
  check('测试账号就绪', Boolean(host.token && other.token));

  /* ---------------------------------------------------------------- */
  console.log('\n=== 1. 上传短视频 ===');
  const up = await uploadFeed(host.token, { type: 'short', title: '储能集装箱产线实拍', subtitle: '2 分 30 秒看完一条 2GWh 产线' });
  check('上传成功返回 201', up.status === 201, JSON.stringify(up.json).slice(0, 250));
  const short = up.data.feed;
  check('类型为短视频', short.type === 'short' && short.typeName === '短视频');
  check('生成视频地址', String(short.videoUrl).startsWith('/files/'), short.videoUrl);
  check('生成封面地址', String(short.coverUrl).startsWith('/files/'), short.coverUrl);
  check('默认进首页轮播', short.featured === true);
  check('初始统计为零', short.stats.views === 0 && short.stats.likes === 0);
  check('带发布者信息', short.owner?.nickname === '主播-刘总', JSON.stringify(short.owner));

  const videoRes = await fetch(BASE + short.videoUrl);
  const videoBuf = Buffer.from(await videoRes.arrayBuffer());
  check('视频文件可下载', videoRes.status === 200 && videoBuf.length === MP4_HEAD.length, `status=${videoRes.status} bytes=${videoBuf.length}`);
  const coverRes = await fetch(BASE + short.coverUrl);
  check('封面图片可下载', coverRes.status === 200 && coverRes.headers.get('content-type')?.includes('image'), coverRes.headers.get('content-type'));

  console.log('\n=== 2. 缺少必要字段 ===');
  const noTitle = await call('POST', '/api/feeds', { token: host.token, body: { type: 'short' } });
  check('不填标题被拒绝', noTitle.status === 400, String(noTitle.status));
  const noFile = await uploadFeed(host.token, { type: 'short', title: '没有视频的短视频', withFile: false, withCover: false });
  check('短视频不传文件被拒绝', noFile.status === 400, JSON.stringify(noFile.json).slice(0, 150));
  const noAuth = await call('POST', '/api/feeds', { body: { type: 'short', title: 'x' } });
  check('未登录不能发布', noAuth.status === 401);

  console.log('\n=== 3. 创建直播间 ===');
  const liveUp = await uploadFeed(host.token, {
    type: 'live',
    title: '【直播】东营光伏项目对接答疑',
    subtitle: '总包与供应商可直接提问',
    withFile: false,
    withCover: true,
  });
  check('创建直播间成功', liveUp.status === 201, JSON.stringify(liveUp.json).slice(0, 250));
  const liveFeed = liveUp.data.feed;
  check('类型为直播', liveFeed.type === 'live');
  check('初始未开播', liveFeed.liveStatus === 'off', liveFeed.liveStatus);
  check('直播不需要视频文件', !liveFeed.videoUrl);

  console.log('\n=== 4. 列表与筛选 ===');
  const all = await call('GET', '/api/feeds');
  check('列表返回全部', (all.data.items || []).length === 2, `实际 ${(all.data.items || []).length}`);
  const onlyLive = await call('GET', '/api/feeds?type=live');
  check('按类型筛选直播', (onlyLive.data.items || []).every((f) => f.type === 'live') && (onlyLive.data.items || []).length === 1);
  const onlyShort = await call('GET', '/api/feeds?type=short');
  check('按类型筛选短视频', (onlyShort.data.items || []).every((f) => f.type === 'short') && (onlyShort.data.items || []).length === 1);
  const featured = await call('GET', '/api/feeds?featured=1');
  check('精选筛选（首页轮播用）', (featured.data.items || []).length === 2, `实际 ${(featured.data.items || []).length}`);
  const mine = await call('GET', '/api/my/feeds', { token: host.token });
  check('我发布的内容列表', (mine.data.items || []).length === 2);
  check('我发布的内容带统计', mine.data.stats.total === 2 && mine.data.stats.short === 1 && mine.data.stats.live === 1, JSON.stringify(mine.data.stats));

  console.log('\n=== 5. 详情 / 播放计数 / 点赞 ===');
  await call('GET', `/api/feeds/${short.id}`);
  await call('GET', `/api/feeds/${short.id}`);
  const detail = await call('GET', `/api/feeds/${short.id}`);
  check('详情返回内容', detail.data.feed.id === short.id);
  check('播放次数递增且返回自增后的值', detail.data.feed.stats.views === 3, `views=${detail.data.feed.stats.views}`);

  const like1 = await call('POST', `/api/feeds/${short.id}/like`, { token: other.token });
  check('点赞成功', like1.data.liked === true && like1.data.likes === 1, JSON.stringify(like1.data));
  const like2 = await call('POST', `/api/feeds/${short.id}/like`, { token: other.token });
  check('再次点击取消点赞', like2.data.liked === false && like2.data.likes === 0);
  await call('POST', `/api/feeds/${short.id}/like`, { token: host.token });
  const likeAsOther = await call('GET', `/api/feeds/${short.id}`, { token: other.token });
  check('不同用户点赞状态独立', likeAsOther.data.feed.liked === false && likeAsOther.data.feed.stats.likes === 1);

  console.log('\n=== 6. 开播 ===');
  const badStart = await call('POST', `/api/feeds/${liveFeed.id}/live/start`, { token: other.token });
  check('非发布者不能开播', badStart.status === 403, String(badStart.status));
  const start = await call('POST', `/api/feeds/${liveFeed.id}/live/start`, { token: host.token });
  check('开播成功', start.status === 201, JSON.stringify(start.json).slice(0, 250));
  check('状态变为直播中', start.data.feed.liveStatus === 'live');
  check('生成了直播会议', Boolean(start.data.meeting?.id));
  check('会议号 9 位', /^\d{9}$/.test(String(start.data.meeting.number)), String(start.data.meeting.number));
  check('会议标记为 live 模式', start.data.meeting.mode === 'live', String(start.data.meeting.mode));
  check('主播即主持人', start.data.meeting.isHost === true);
  console.log(`    → 直播会议号 ${start.data.meeting.number}`);
  const meetingId = start.data.meeting.id;

  const liveInfo = await call('GET', `/api/feeds/${liveFeed.id}/live`, { token: other.token });
  check('直播间信息可获取', liveInfo.data.feed.id === liveFeed.id);
  check('直播间关联会议', liveInfo.data.meeting?.id === meetingId);
  check('观众不是主播', liveInfo.data.isHost === false && liveInfo.data.canBroadcast === false);
  const liveInfoHost = await call('GET', `/api/feeds/${liveFeed.id}/live`, { token: host.token });
  check('主播可开播标记', liveInfoHost.data.isHost === true && liveInfoHost.data.canBroadcast === true);

  const listAfterLive = await call('GET', '/api/feeds');
  check('直播中排在列表最前', listAfterLive.data.items[0].id === liveFeed.id, listAfterLive.data.items[0]?.title);

  console.log('\n=== 7. 观众进入直播间（复用会议能力） ===');
  const join = await call('POST', `/api/meetings/${meetingId}/join`, { token: other.token, body: { muted: true, cameraOff: true } });
  check('观众通过会议号入会', join.status === 200, JSON.stringify(join.json).slice(0, 200));
  check('观众拿到信令配置', Array.isArray(join.data.iceServers) && join.data.iceServers.length > 0);
  const chat = await call('POST', `/api/meetings/${meetingId}/chat`, { token: other.token, body: { text: '请问组件的报价区间是多少？' } });
  check('直播间可以聊天', chat.status === 201, JSON.stringify(chat.json).slice(0, 150));
  const chatList = await call('GET', `/api/meetings/${meetingId}/chat`, { token: host.token });
  check('主播能看到观众提问', (chatList.data.items || []).some((c) => c.text.includes('报价区间')));
  const heartbeat = await call('GET', `/api/feeds/${liveFeed.id}/live/heartbeat`);
  check('心跳返回直播中', heartbeat.data.live === true);

  console.log('\n=== 8. 分享 ===');
  const share = await call('GET', `/api/feeds/${liveFeed.id}/share`);
  check('直播分享可获取', share.status === 200, JSON.stringify(share.json).slice(0, 200));
  check('分享指向直播间', String(share.data.url).includes(`/live/${liveFeed.id}`), share.data.url);
  check('分享含二维码', String(share.data.qr).includes('/api/share/qrcode'));
  check('分享标记为直播', share.data.kind === 'live');
  check('分享提供 2 种方式', (share.data.modes || []).length === 2, JSON.stringify((share.data.modes || []).map((m) => m.id)));
  check('分享文案带「直播」前缀', (share.data.modes || []).every((m) => m.text.includes('直播')));
  const qrPath = new URL(share.data.qr).pathname + new URL(share.data.qr).search;
  const qrRes = await fetch(BASE + qrPath);
  const qrBuf = Buffer.from(await qrRes.arrayBuffer());
  check('分享二维码可生成（PNG）', qrRes.status === 200 && qrBuf[0] === 0x89 && qrBuf[1] === 0x50, `status=${qrRes.status}`);

  const shareShort = await call('GET', `/api/feeds/${short.id}/share`);
  check('短视频分享标记为 short', shareShort.data.kind === 'short');

  console.log('\n=== 9. 修改与结束直播 ===');
  const badEnd = await call('POST', `/api/feeds/${liveFeed.id}/live/end`, { token: other.token });
  check('非主播不能结束直播', badEnd.status === 403);
  const badUpdate = await call('PUT', `/api/feeds/${short.id}`, { token: other.token, body: { title: '篡改标题' } });
  check('非发布者不能修改', badUpdate.status === 403);
  const upd = await call('PUT', `/api/feeds/${short.id}`, { token: host.token, body: { title: '储能集装箱产线实拍（已更新）', featured: false } });
  check('发布者可修改标题', upd.status === 200 && upd.data.feed.title.includes('已更新'), upd.data.feed.title);
  check('可移出首页轮播', upd.data.feed.featured === false);

  const end = await call('POST', `/api/feeds/${liveFeed.id}/live/end`, { token: host.token });
  check('结束直播', end.status === 200 && end.data.feed.liveStatus === 'ended', end.data.feed.liveStatus);
  const infoAfterEnd = await call('GET', `/api/feeds/${liveFeed.id}/live`);
  check('结束后直播间状态为 ended', infoAfterEnd.data.feed.liveStatus === 'ended');
  const hbAfter = await call('GET', `/api/feeds/${liveFeed.id}/live/heartbeat`);
  check('结束后心跳为 false', hbAfter.data.live === false);

  const restart = await call('POST', `/api/feeds/${liveFeed.id}/live/start`, { token: host.token });
  check('结束后可重新开播', restart.status === 201 && restart.data.feed.liveStatus === 'live');
  check('重新开播复用同一会议', restart.data.meeting.id === meetingId, `${restart.data.meeting.id} vs ${meetingId}`);
  await call('POST', `/api/feeds/${liveFeed.id}/live/end`, { token: host.token });

  console.log('\n=== 10. 删除与边界 ===');
  const delOther = await call('DELETE', `/api/feeds/${short.id}`, { token: other.token });
  check('非发布者不能删除', delOther.status === 403);
  const del = await call('DELETE', `/api/feeds/${short.id}`, { token: host.token });
  check('发布者可删除', del.status === 200);
  const gone = await call('GET', `/api/feeds/${short.id}`);
  check('删除后详情 404', gone.status === 404, String(gone.status));
  const badId = await call('GET', '/api/feeds/not-exist');
  check('不存在的 ID 返回 404', badId.status === 404);
  const badType = await uploadFeed(host.token, { type: 'nonsense', title: '未知类型', withFile: true, withCover: false });
  check('未知类型按短视频处理', badType.data?.feed?.type === 'short', String(badType.data?.feed?.type));

  db.flush();
  await app.close();

  console.log(`\n${'='.repeat(60)}`);
  console.log(`通过 ${passed} 项，失败 ${failed} 项`);
  if (failures.length) {
    console.log('\n失败明细：');
    for (const f of failures) console.log(`  ✗ ${f}`);
  }
  console.log('='.repeat(60));
  process.exit(failed ? 1 : 0);
}

main().catch((err) => {
  console.error('\n测试异常终止：', err);
  process.exit(1);
});

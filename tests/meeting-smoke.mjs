/**
 * 小鱼来了 — 群聊邀请与会议（仿腾讯会议）端到端测试
 *
 * 覆盖：会议号生成与查询 / 密码入会 / 邀请分享 / 会前状态 / 会议内聊天 /
 *       举手与静音同步 / 主持人控制（锁定、全体静音、移出成员、结束）/ 群邀请与群公告
 *
 * 运行：node tests/meeting-smoke.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
process.chdir(ROOT);

const TEST_DATA = path.join(ROOT, 'data-test-meeting');
fs.rmSync(TEST_DATA, { recursive: true, force: true });
process.env.DATA_DIR = 'data-test-meeting';
process.env.NO_SEED = '1';
process.env.SESSION_SECRET = 'meeting-test-'.padEnd(48, 'x');
// 强制使用请求 Host 推导地址，避免读到本机 .env 里的外网域名
process.env.PUBLIC_BASE_URL = '';

const { createApp } = await import('../src/http/app.js');
const registerRoutes = (await import('../src/routes/index.js')).default;
const { PUBLIC_DIR } = await import('../src/config.js');
const db = (await import('../src/store/db.js')).default;

const PORT = 8932;
const BASE = `http://127.0.0.1:${PORT}`;

let passed = 0;
let failed = 0;
const failures = [];

function check(name, cond, detail = '') {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; failures.push(`${name}${detail ? ` — ${detail}` : ''}`); console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`); }
}

async function call(method, url, { token, body, form } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  let payload;
  if (form) payload = form;
  else if (body !== undefined) { headers['Content-Type'] = 'application/json'; payload = JSON.stringify(body); }
  const res = await fetch(BASE + url, { method, headers, body: payload });
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* ignore */ }
  return { status: res.status, json, data: json && json.data !== undefined ? json.data : json };
}

async function loginPhone(phone, nickname) {
  const c = await call('POST', '/api/auth/sms/send', { body: { phone, purpose: 'login' } });
  const r = await call('POST', '/api/auth/sms/login', { body: { phone, code: c.data.demoCode, purpose: 'login', nickname } });
  return r.data.token;
}

async function main() {
  console.log('\n=== 启动服务 ===');
  const app = createApp();
  app.static('/static', path.join(PUBLIC_DIR, 'static'), { cache: 'no-cache' });
  app.static('', PUBLIC_DIR, { spa: true, exclude: [/^\/api\//, /^\/files\//] });
  registerRoutes(app);
  await app.listen(PORT, '127.0.0.1');
  check('服务启动', true);

  const host = await loginPhone('13600001111', '主持人-张总');
  const guest = await loginPhone('13600002222', '参会人-李经理');
  const third = await loginPhone('13600003333', '第三人-王工');
  check('三个测试账号就绪', Boolean(host && guest && third), `${!!host}/${!!guest}/${!!third}`);

  /* ---------------------------------------------------------------- */
  console.log('\n=== 1. 会议号 ===');
  const created = await call('POST', '/api/meetings', {
    token: host,
    body: { title: '东营光伏项目对接会', durationMin: 60, usePassword: true },
  });
  check('创建会议', created.status === 201, JSON.stringify(created.json).slice(0, 200));
  const meeting = created.data.meeting;
  const mid = meeting.id;
  check('自动生成 9 位会议号', /^\d{9}$/.test(String(meeting.number)), `实际 ${meeting.number}`);
  check('自动生成入会密码', /^\d{6}$/.test(String(meeting.password)), `实际 ${meeting.password}`);
  check('默认设置齐备', meeting.settings && meeting.settings.muteOnJoin === true && meeting.settings.locked === false);
  check('主持人角色正确', meeting.isHost === true && meeting.canManage === true);
  check('入会链接使用会议号', String(meeting.joinUrl).includes(`n=${meeting.number}`), meeting.joinUrl);
  console.log(`    → 会议号 ${meeting.number} / 密码 ${meeting.password}`);

  const created2 = await call('POST', '/api/meetings', { token: host, body: { title: '第二个会议' } });
  check('不设密码时密码为空', created2.data.meeting.password === '', JSON.stringify(created2.data.meeting.password));
  check('会议号互不重复', created2.data.meeting.number !== meeting.number);

  /* ---------------------------------------------------------------- */
  console.log('\n=== 2. 会议号查询（未登录可查） ===');
  const lookup = await call('GET', `/api/meetings/lookup?number=${meeting.number}`);
  check('查询到会议', lookup.status === 200 && lookup.data.title === '东营光伏项目对接会', JSON.stringify(lookup.json).slice(0, 200));
  check('返回是否需密码', lookup.data.hasPassword === true);
  check('不泄露密码本身', lookup.data.password === undefined);
  const lookupBad = await call('GET', '/api/meetings/lookup?number=000000000');
  check('不存在的会议号返回 404', lookupBad.status === 404);

  /* ---------------------------------------------------------------- */
  console.log('\n=== 3. 用会议号加入 + 密码校验 ===');
  const joinBad = await call('POST', '/api/meetings/join', {
    token: guest,
    body: { number: meeting.number, password: '000000', name: '李经理' },
  });
  check('错误密码被拒绝', joinBad.status === 403 && joinBad.json.code === 'bad_password', JSON.stringify(joinBad.json));

  const joinOk = await call('POST', '/api/meetings/join', {
    token: guest,
    body: { number: meeting.number, password: meeting.password, name: '李经理', muted: false, cameraOff: true },
  });
  check('正确密码加入成功', joinOk.status === 200 && joinOk.data.meeting.id === mid, JSON.stringify(joinOk.json).slice(0, 200));
  check('加入后状态为进行中', joinOk.data.meeting.status === 'live', joinOk.data.meeting.status);
  check('返回 WebRTC 配置', Array.isArray(joinOk.data.iceServers) && joinOk.data.iceServers.length > 0);
  check('参会人看到自己的入会状态', joinOk.data.meeting.myState?.muted === false && joinOk.data.meeting.myState?.cameraOff === true,
    JSON.stringify(joinOk.data.meeting.myState));
  check('在会人数统计正确', joinOk.data.meeting.joinedCount >= 1, `joinedCount=${joinOk.data.meeting.joinedCount}`);
  const guestId = (await call('GET', '/api/auth/me', { token: guest })).data.user.id;

  const joinBadNumber = await call('POST', '/api/meetings/join', { token: third, body: { number: '123456789', password: '' } });
  check('错误会议号加入失败', joinBadNumber.status === 404);

  /* ---------------------------------------------------------------- */
  console.log('\n=== 4. 邀请分享 ===');
  const invite = await call('GET', `/api/meetings/${mid}/invite`, { token: host });
  check('获取会议邀请信息', invite.status === 200, JSON.stringify(invite.json).slice(0, 200));
  check('邀请含会议号', invite.data.number === meeting.number);
  check('邀请含密码', invite.data.password === meeting.password);
  check('邀请含入会链接', String(invite.data.url).includes(`n=${meeting.number}`), invite.data.url);
  check('邀请含二维码地址', String(invite.data.qr).includes('/api/share/qrcode'));
  check('提供 3 种分享方式', (invite.data.modes || []).length === 3, JSON.stringify((invite.data.modes || []).map((m) => m.id)));
  check('图片方式带会议号与二维码说明', (invite.data.modes || []).some((m) => m.id === 'image' && m.text.includes(meeting.number)));
  check('链接方式含链接', (invite.data.modes || []).some((m) => m.id === 'link' && m.text.includes(invite.data.url)));
  check('仅会议号方式', (invite.data.modes || []).some((m) => m.id === 'number' && m.text.includes(meeting.number)));

  const inviteNonMember = await call('GET', `/api/meetings/${mid}/invite`, { token: third });
  check('未入会者不能获取邀请信息', inviteNonMember.status === 403);

  const qrPath = invite.data.qr.startsWith('http') ? new URL(invite.data.qr).pathname + new URL(invite.data.qr).search : invite.data.qr;
  const qr = await fetch(BASE + qrPath);
  const qrBuf = Buffer.from(await qr.arrayBuffer());
  check('邀请二维码可生成（PNG）', qr.status === 200 && qrBuf[0] === 0x89 && qrBuf[1] === 0x50, `status=${qr.status} bytes=${qrBuf.length}`);
  check('邀请链接指向本机（测试环境未设 PUBLIC_BASE_URL）', String(invite.data.url).startsWith(BASE), invite.data.url);

  /* ---------------------------------------------------------------- */
  console.log('\n=== 5. 会中状态同步 ===');
  const st1 = await call('POST', `/api/meetings/${mid}/state`, { token: guest, body: { handUp: true } });
  check('举手状态同步', st1.status === 200 && st1.data.meeting.myState.handUp === true, JSON.stringify(st1.data.meeting.myState));
  const st2 = await call('POST', `/api/meetings/${mid}/state`, { token: guest, body: { muted: true, cameraOff: false } });
  check('静音/摄像头状态同步', st2.data.meeting.myState.muted === true && st2.data.meeting.myState.cameraOff === false);
  const detail = await call('GET', `/api/meetings/${mid}`, { token: host });
  const guestInList = (detail.data.meeting.participants || []).find((p) => p.userId === guestId);
  check('主持人能看到参会人状态', guestInList && guestInList.handUp === true && guestInList.muted === true, JSON.stringify(guestInList));

  /* ---------------------------------------------------------------- */
  console.log('\n=== 6. 会议内聊天 ===');
  const chatSend = await call('POST', `/api/meetings/${mid}/chat`, { token: guest, body: { text: '张总您好，我方资质文件已经发到群里了。' } });
  check('发送会议聊天', chatSend.status === 201 && Boolean(chatSend.data.entry.id), JSON.stringify(chatSend.json).slice(0, 200));
  await call('POST', `/api/meetings/${mid}/chat`, { token: host, body: { text: '收到，我看一下。' } });
  const chatList = await call('GET', `/api/meetings/${mid}/chat`, { token: host });
  check('会议聊天列表', (chatList.data.items || []).length >= 2, `实际 ${(chatList.data.items || []).length}`);
  check('聊天含系统入会提示', (chatList.data.items || []).some((c) => c.system), JSON.stringify((chatList.data.items || []).map((c) => c.text).slice(0, 4)));

  /* ---------------------------------------------------------------- */
  console.log('\n=== 7. 主持人控制 ===');
  const settings = await call('POST', `/api/meetings/${mid}/settings`, { token: host, body: { allowChat: false, muteOnJoin: true } });
  check('主持人修改设置', settings.status === 200 && settings.data.meeting.settings.allowChat === false);

  const chatBlocked = await call('POST', `/api/meetings/${mid}/chat`, { token: guest, body: { text: '还能说话吗？' } });
  check('关闭聊天后参会人无法发言', chatBlocked.status === 403, JSON.stringify(chatBlocked.json));
  await call('POST', `/api/meetings/${mid}/settings`, { token: host, body: { allowChat: true } });

  const guestTrySettings = await call('POST', `/api/meetings/${mid}/settings`, { token: guest, body: { locked: true } });
  check('非主持人不能改设置', guestTrySettings.status === 403);

  const muteAll = await call('POST', `/api/meetings/${mid}/mute-all`, { token: host });
  check('全体静音', muteAll.status === 200, JSON.stringify(muteAll.json).slice(0, 150));
  const afterMute = (muteAll.data.meeting.participants || []).find((p) => p.userId === guestId);
  check('参会人已被静音', afterMute && afterMute.muted === true, JSON.stringify(afterMute));

  const lock = await call('POST', `/api/meetings/${mid}/settings`, { token: host, body: { locked: true } });
  check('锁定会议', lock.status === 200 && lock.data.meeting.settings.locked === true);
  const thirdJoin = await call('POST', '/api/meetings/join', {
    token: third,
    body: { number: meeting.number, password: meeting.password },
  });
  check('锁定后新参会人无法加入', thirdJoin.status === 403 && thirdJoin.json.code === 'meeting_locked', JSON.stringify(thirdJoin.json));
  const guestRejoin = await call('POST', `/api/meetings/${mid}/join`, { token: guest, body: {} });
  check('已入会者锁会后仍可重连', guestRejoin.status === 200);
  await call('POST', `/api/meetings/${mid}/settings`, { token: host, body: { locked: false } });

  const kick = await call('POST', `/api/meetings/${mid}/kick`, { token: host, body: { userId: guestId } });
  check('主持人移出成员', kick.status === 200, JSON.stringify(kick.json).slice(0, 150));
  const afterKick = (kick.data.meeting.participants || []).some((p) => p.userId === guestId);
  check('被移出者不在参会名单', afterKick === false);
  const kickHost = await call('POST', `/api/meetings/${mid}/kick`, { token: host, body: { userId: (await call('GET', '/api/auth/me', { token: host })).data.user.id } });
  check('不能移出主持人自己', kickHost.status === 400);

  /* ---------------------------------------------------------------- */
  console.log('\n=== 8. 群聊邀请与群公告 ===');
  const room = await call('POST', '/api/chat/rooms', { token: host, body: { type: 'group', name: '光伏项目对接群' } });
  const roomId = room.data.room.id;
  check('创建群聊', Boolean(roomId));

  const roomInv = await call('GET', `/api/chat/rooms/${roomId}/invite`, { token: host });
  check('获取群邀请信息', roomInv.status === 200 && Boolean(roomInv.data.url), JSON.stringify(roomInv.json).slice(0, 200));
  check('群邀请含二维码', String(roomInv.data.qr).includes('/api/share/qrcode'));
  check('群邀请含链接方式', (roomInv.data.modes || []).some((m) => m.id === 'link'));
  check('群邀请含图片方式', (roomInv.data.modes || []).some((m) => m.id === 'image'));

  const nonMemberInvite = await call('GET', `/api/chat/rooms/${roomId}/invite`, { token: third });
  check('非群成员不能生成邀请', nonMemberInvite.status === 403);

  const ann = await call('POST', `/api/chat/rooms/${roomId}/announcement`, { token: host, body: { text: '本周五前提交资质文件与初步报价。' } });
  check('群主发布群公告', ann.status === 200 && ann.data.room.announcement.text.includes('本周五'), JSON.stringify(ann.json).slice(0, 200));
  const annByOther = await call('POST', `/api/chat/rooms/${roomId}/announcement`, { token: guest, body: { text: '我也来发一个' } });
  check('非群主不能发群公告', annByOther.status === 403);
  const roomAfter = await call('GET', `/api/chat/rooms/${roomId}`, { token: host });
  check('群公告随群信息返回', roomAfter.data.room.announcement?.text?.includes('本周五'));
  const msgs = await call('GET', `/api/chat/rooms/${roomId}/messages`, { token: host });
  check('群公告同时写入系统消息', (msgs.data.items || []).some((m) => m.type === 'system' && m.text.includes('群公告')));

  /* ---------------------------------------------------------------- */
  console.log('\n=== 9. 结束会议 ===');
  const guestRejoin2 = await call('POST', `/api/meetings/${mid}/join`, { token: guest, body: {} }).catch(() => null);
  void guestRejoin2;
  const endByGuest = await call('POST', `/api/meetings/${mid}/end`, { token: third });
  check('非主持人不能结束会议', endByGuest.status === 403);
  const end = await call('POST', `/api/meetings/${mid}/end`, { token: host });
  check('主持人结束会议', end.status === 200 && end.data.meeting.status === 'ended');
  const joinAfterEnd = await call('POST', '/api/meetings/join', { token: guest, body: { number: meeting.number } });
  check('结束后无法再加入', joinAfterEnd.status === 410 || joinAfterEnd.status === 404, `status=${joinAfterEnd.status}`);
  const lookupEnded = await call('GET', `/api/meetings/lookup?number=${meeting.number}`);
  check('结束后查询显示已结束', lookupEnded.data.status === 'ended', lookupEnded.data.status);

  /* ---------------------------------------------------------------- */
  console.log('\n=== 10. 未登录边界 ===');
  const noAuthJoin = await call('POST', '/api/meetings/join', { body: { number: meeting.number } });
  check('未登录不能加入会议', noAuthJoin.status === 401);
  const noAuthInvite = await call('GET', `/api/meetings/${mid}/invite`);
  check('未登录不能获取邀请', noAuthInvite.status === 401);
  const joinPage = await fetch(`${BASE}/#/join?n=123456789`);
  check('加入页 HTML 可达', joinPage.status === 200);

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

/**
 * 小鱼来了 — 端到端冒烟测试
 *
 * 在进程内启动完整服务，走真实 HTTP 请求，覆盖：
 * 认证 / 发布 / AI 解析 / 留言与 AI 回复 / 关注通知 / 对接建群 / 群聊 / 会议与纪要 / 分享 / 管理端
 *
 * 运行：node tests/api-smoke.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
process.chdir(ROOT);

// 用独立的测试数据目录，避免污染正式数据
const TEST_DATA = path.join(ROOT, 'data-test');
fs.rmSync(TEST_DATA, { recursive: true, force: true });
process.env.DATA_DIR = 'data-test';
process.env.NO_SEED = '1';
process.env.SESSION_SECRET = 'test-secret-'.padEnd(48, 'x');
// 强制使用请求 Host 推导地址，避免读到本机 .env 里的外网域名
process.env.PUBLIC_BASE_URL = '';

const { createApp } = await import('../src/http/app.js');
const registerRoutes = (await import('../src/routes/index.js')).default;
const { seedIfEmpty } = await import('../scripts/seed.js');
const db = (await import('../src/store/db.js')).default;

const PORT = 8931;
const BASE = `http://127.0.0.1:${PORT}`;

let passed = 0;
let failed = 0;
const failures = [];

function check(name, cond, detail = '') {
  if (cond) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    failures.push(`${name}${detail ? ` — ${detail}` : ''}`);
    console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

async function call(method, url, { token, body, form, raw } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  let payload;
  if (form) payload = form;
  else if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }
  const res = await fetch(BASE + url, { method, headers, body: payload });
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* 非 JSON */ }
  return { status: res.status, json, text, data: json && json.data !== undefined ? json.data : json };
}

function jsonForm(fields = {}) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) {
    if (v === undefined || v === null) continue;
    fd.append(k, typeof v === 'object' ? JSON.stringify(v) : String(v));
  }
  return fd;
}

/* ================================================================== */
async function main() {
  console.log('\n=== 1. 启动与初始化 ===');
  const app = createApp();
  // 与 server.js 保持一致：注册静态资源与 SPA 回退
  const { PUBLIC_DIR } = await import('../src/config.js');
  app.static('/static', path.join(PUBLIC_DIR, 'static'), { cache: 'public, max-age=3600' });
  app.static('', PUBLIC_DIR, { spa: true, cache: 'no-cache', exclude: [/^\/api\//, /^\/files\//] });
  registerRoutes(app);
  const server = await app.listen(PORT, '127.0.0.1');
  check('服务启动', Boolean(server));

  const seeded = await seedIfEmpty();
  check('演示数据写入', seeded.created === true, JSON.stringify(seeded));
  check('演示用户 >= 4', seeded.users >= 4);
  check('演示信息 >= 10', seeded.listings >= 10);
  check('项目案例 >= 10', seeded.cases >= 10);

  console.log('\n=== 2. 基础接口 ===');
  const health = await call('GET', '/api/health');
  check('GET /api/health', health.status === 200 && health.data?.ok === true);
  check('健康检查含 AI 状态', Boolean(health.data?.ai?.mode));

  const site = await call('GET', '/api/site');
  check('GET /api/site 返回三大板块', (site.data?.categories || []).length === 3);

  const tax = await call('GET', '/api/taxonomy');
  check('行业数 >= 40', (tax.data?.industries || []).length >= 40, `实际 ${(tax.data?.industries || []).length}`);
  check('省份数 == 34', (tax.data?.cities || []).length === 34, `实际 ${(tax.data?.cities || []).length}`);
  const cityTotal = (tax.data?.cities || []).reduce((n, p) => n + (p.cities?.length || 0), 0);
  check('城市数 >= 300', cityTotal >= 300, `实际 ${cityTotal}`);
  check('项目流程 7 步', (tax.data?.pipelineStages || []).length === 7, `实际 ${(tax.data?.pipelineStages || []).length}`);
  check('流程阶段带图标与动作定义', (tax.data?.pipelineStages || []).every((s) => s.icon && Array.isArray(s.actions)),
    JSON.stringify((tax.data?.pipelineStages || []).map((s) => s.id)));
  const typeNames = (tax.data?.projectTypes || []).map((t) => t.name);
  for (const need of ['股权投资', '融资', 'EPC', 'EMC', '转让', '融资租赁', '采购', '招投标']) {
    check(`项目类型包含「${need}」`, typeNames.some((t) => t.includes(need)), typeNames.join(','));
  }

  const list0 = await call('GET', '/api/listings?pageSize=5');
  check('信息列表非空', (list0.data?.items || []).length > 0, `total=${list0.data?.total}`);

  const cases = await call('GET', '/api/cases');
  check('项目案例接口', (cases.data || []).length >= 10);

  const indexHtml = await fetch(`${BASE}/`);
  const indexText = await indexHtml.text();
  check('首页 HTML 可访问', indexHtml.status === 200 && indexText.includes('小鱼来了'));
  const appJs = await fetch(`${BASE}/static/app.js`);
  check('前端 JS 可访问', appJs.status === 200);
  const css = await fetch(`${BASE}/static/styles.css`);
  check('前端 CSS 可访问', css.status === 200);

  console.log('\n=== 3. 认证（手机 / 邮箱 / 微信） ===');
  const phone = '13900008888';
  const sms = await call('POST', '/api/auth/sms/send', { body: { phone, purpose: 'login' } });
  check('发送短信验证码', sms.status === 200 && Boolean(sms.data?.demoCode), JSON.stringify(sms.data));
  const code = sms.data?.demoCode;

  const login = await call('POST', '/api/auth/sms/login', {
    body: { phone, code, purpose: 'login', nickname: '测试用户甲', company: '测试能源科技有限公司', profession: '项目经理', industry: '新能源', city: '东营' },
  });
  check('手机验证码登录并注册', login.status === 200 && Boolean(login.data?.token), JSON.stringify(login.json).slice(0, 200));
  const tokenA = login.data?.token;
  check('注册返回选填字段', login.data?.user?.profession === '项目经理' && login.data?.user?.company === '测试能源科技有限公司');

  const me = await call('GET', '/api/auth/me', { token: tokenA });
  check('GET /api/auth/me', me.status === 200 && me.data?.user?.id);

  // 邮箱注册
  const email = 'tester@example.com';
  const mailCode = await call('POST', '/api/auth/email/send-code', { body: { email, purpose: 'register' } });
  check('发送邮箱验证码', mailCode.status === 200 && Boolean(mailCode.data?.demoCode));
  const reg = await call('POST', '/api/auth/email/register', {
    body: { email, code: mailCode.data?.demoCode, password: 'test123456', nickname: '测试用户乙', company: '乙公司', profession: '采购经理', industry: '制造业', city: '唐山' },
  });
  check('邮箱注册', reg.status === 200 && Boolean(reg.data?.token), JSON.stringify(reg.json).slice(0, 200));
  const tokenB = reg.data?.token;

  const emailLogin = await call('POST', '/api/auth/email/login', { body: { email, password: 'test123456' } });
  check('邮箱密码登录', emailLogin.status === 200 && Boolean(emailLogin.data?.token));

  const wxUrl = await call('GET', '/api/auth/wechat/url?mode=mp');
  check('微信登录地址接口（未配置时给出提示）', wxUrl.status === 200 && wxUrl.data?.ready === false && Boolean(wxUrl.data?.hint));

  const wxDemo = await call('POST', '/api/auth/wechat/demo', { body: { nickname: '微信演示用户' } });
  check('微信演示登录', wxDemo.status === 200 && Boolean(wxDemo.data?.token));
  const tokenWx = wxDemo.data?.token;

  const adminLogin = await call('POST', '/api/auth/login', { body: { account: '18800000000', password: 'admin123456' } });
  check('管理员账号密码登录', adminLogin.status === 200 && adminLogin.data?.user?.isAdmin === true, JSON.stringify(adminLogin.json).slice(0, 200));
  const adminToken = adminLogin.data?.token;

  console.log('\n=== 4. AI 引擎（标题生成 + 项目解析） ===');
  const sampleText = `山东东营 200MW 渔光互补光伏电站 EPC 总承包招标。
项目位于山东省东营市垦利区，利用 4200 亩坑塘水面建设渔光互补光伏电站，装机容量 200MW。
总投资约 8.6 亿元人民币，计划工期 14 个月。投标人资格要求：电力工程施工总承包一级及以上资质，注册资本不低于 2 亿元。
联系人：张工 13800001234 微信：zhang_energy`;

  const preview = await call('POST', '/api/ai/preview', { token: tokenA, form: jsonForm({ text: sampleText, category: 'project' }) });
  check('AI 预览接口', preview.status === 200, JSON.stringify(preview.json).slice(0, 300));

  /* ---- 第一步：AI 汇总 ---- */
  const summarize = await call('POST', '/api/ai/summarize', { token: tokenA, form: jsonForm({ text: sampleText, category: 'project' }) });
  check('AI 汇总接口可用', summarize.status === 200, JSON.stringify(summarize.json).slice(0, 300));
  const sm = summarize.data?.summary || {};
  check('汇总返回摘要文本', String(sm.digest || '').length > 20, `长度 ${String(sm.digest || '').length}`);
  check('汇总返回要点清单', Array.isArray(sm.points) && sm.points.length > 0, JSON.stringify(sm.points));
  check('汇总返回结构化字段', Boolean(sm.facts) && typeof sm.facts === 'object', JSON.stringify(Object.keys(sm.facts || {})));
  check('汇总提取到金额', String(sm.facts?.amount || '').includes('亿'), String(sm.facts?.amount));
  check('汇总提取到规模', /MW|亩/.test(String(sm.facts?.scale || '')), String(sm.facts?.scale));
  check('汇总列出缺失信息', Array.isArray(sm.missing), JSON.stringify(sm.missing));
  check('汇总标注来源', ['ai', 'local'].includes(sm.source), String(sm.source));

  const sumEmpty = await call('POST', '/api/ai/summarize', { token: tokenA, form: jsonForm({ text: '   ', category: 'project' }) });
  check('空内容不能汇总', sumEmpty.status === 400, String(sumEmpty.status));

  /* ---- 第二步：用汇总结果生成 ---- */
  const previewFromDigest = await call('POST', '/api/ai/preview', {
    token: tokenA,
    form: jsonForm({ text: sampleText, category: 'project', digest: sm.digest, points: JSON.stringify(sm.points || []) }),
  });
  check('带汇总结果生成成功', previewFromDigest.status === 200, JSON.stringify(previewFromDigest.json).slice(0, 200));
  check('仍能生成主标题', Boolean(previewFromDigest.data?.titles?.title), JSON.stringify(previewFromDigest.data?.titles));
  check('仍能生成可靠性评分', typeof previewFromDigest.data?.analysis?.reliability?.score === 'number');

  const digestOnly = await call('POST', '/api/ai/preview', {
    token: tokenA, form: jsonForm({ digest: sm.digest, category: 'project' }),
  });
  check('只给汇总也能生成', digestOnly.status === 200 && Boolean(digestOnly.data?.titles?.title), String(digestOnly.status));


  check('AI 生成主标题', Boolean(preview.data?.titles?.title), JSON.stringify(preview.data?.titles));
  check('AI 生成副标题', Boolean(preview.data?.titles?.subtitle));
  check('AI 可靠性评分存在', typeof preview.data?.analysis?.reliability?.score === 'number');
  check('AI 识别出金额', (preview.data?.analysis?.amounts || []).some((a) => a.includes('亿')), JSON.stringify(preview.data?.analysis?.amounts));
  check('AI 识别出城市', (preview.data?.analysis?.cities || []).some((c) => c.name.includes('东营')), JSON.stringify(preview.data?.analysis?.cities));
  check('AI 识别出行业', (preview.data?.analysis?.industries || []).length > 0, JSON.stringify(preview.data?.analysis?.industries));
  check('AI 识别出项目类型 EPC', (preview.data?.analysis?.types || []).some((t) => /EPC|总承包/.test(t.name)), JSON.stringify(preview.data?.analysis?.types));
  check('AI 给出正面发现', (preview.data?.analysis?.reliability?.findings || []).length > 0);
  console.log(`    → 主标题：${preview.data?.titles?.title}`);
  console.log(`    → 副标题：${preview.data?.titles?.subtitle}`);
  console.log(`    → 可靠性：${preview.data?.analysis?.reliability?.score} 分 / ${preview.data?.analysis?.reliability?.label}`);

  // 风险文案检测
  const risky = await call('POST', '/api/ai/preview', {
    token: tokenA,
    form: jsonForm({ text: '某项目，无风险保本高回报，日入斗金，稳赚不赔，投资原始股，详情面议。', category: 'project' }),
  });
  check('AI 能识别高风险话术', (risky.data?.analysis?.reliability?.risks || []).length > 0, JSON.stringify(risky.data?.analysis?.reliability));
  check('高风险项目评分低于正常项目', risky.data?.analysis?.reliability?.score < preview.data?.analysis?.reliability?.score);

  console.log('\n=== 5. 文件上传与文本提取 ===');
  const txtFd = new FormData();
  txtFd.append('file', new Blob([`设备采购清单\n序号\t名称\t数量\n1\t逆变器\t20\n2\t光伏组件\t4000\n总金额 3600 万元\n联系人 李工 13700009999`], { type: 'text/plain' }), '采购清单.txt');
  const up = await call('POST', '/api/files', { token: tokenA, form: txtFd });
  check('文件上传', up.status === 201 && (up.data?.files || []).length === 1, JSON.stringify(up.json).slice(0, 300));
  const uploadedFile = up.data?.files?.[0];
  check('文本型文件解析出内容', Boolean(uploadedFile?.text && uploadedFile.text.includes('逆变器')), JSON.stringify(uploadedFile?.text || '').slice(0, 120));
  check('文件 URL 可构造', Boolean(uploadedFile?.url && uploadedFile.url.startsWith('/files/')));

  const fileFetch = await fetch(BASE + uploadedFile.url);
  check('文件可通过 /files 下载', fileFetch.status === 200);
  const fileText = await fileFetch.text();
  check('下载内容正确', fileText.includes('逆变器'));

  // 用文件内容 + 文字做 AI 预览，验证文件内容进入 AI 上下文
  const preview2 = await call('POST', '/api/ai/preview', {
    token: tokenA,
    form: jsonForm({ text: '光伏项目设备采购', category: 'trade', fileIds: [uploadedFile.id] }),
  });
  check('AI 能读取已上传文件的文字', preview2.status === 200 && (preview2.data?.extracted?.chars || 0) > 0, JSON.stringify(preview2.data?.extracted));

  console.log('\n=== 6. 发布信息（三大板块） ===');
  const pub = await call('POST', '/api/listings', {
    token: tokenA,
    form: jsonForm({
      category: 'project',
      text: sampleText,
      publish: '1',
      durationDays: '30',
      type: 'epc',
      fileIds: [uploadedFile.id],
      phone: '13800001234',
      wechat: 'zhang_energy',
      contactName: '张工',
      company: '山东鲁能新能源工程有限公司',
      investAmount: '8.6 亿元',
      stage: '已备案',
      cooperation: 'EPC 总承包招标',
      period: '14 个月',
    }),
  });
  check('发布项目信息', pub.status === 201 && Boolean(pub.data?.listing?.id), JSON.stringify(pub.json).slice(0, 400));
  const listingId = pub.data?.listing?.id;
  check('发布后自动生成标题', Boolean(pub.data?.listing?.title));
  check('发布后带 AI 分析', Boolean(pub.data?.listing?.ai?.reliability));
  check('有效期已设置', Boolean(pub.data?.listing?.expiresAt));
  check('附件已关联', (pub.data?.listing?.fileList || []).length === 1);
  console.log(`    → 标题：${pub.data?.listing?.title}`);

  const detail = await call('GET', `/api/listings/${listingId}`, { token: tokenA });
  check('信息详情', detail.status === 200 && detail.data?.listing?.id === listingId);
  check('详情含 7 步流程', (detail.data?.pipeline || []).length === 7, `实际 ${(detail.data?.pipeline || []).length}`);
  check('详情附件正文可见', (detail.data?.listing?.text || '').includes('渔光互补'));

  // 活动（需要报名/付费）
  const eventPub = await call('POST', '/api/listings', {
    token: tokenA,
    form: jsonForm({
      category: 'event',
      text: '2026 新型储能产业大会，深圳会展中心，300 人规模，20 个项目路演，报名费 980 元。',
      publish: '1',
      durationDays: '90',
      type: 'summit',
      startAt: '2026-05-18T09:00',
      address: '深圳会展中心 5 号馆',
      capacity: '300',
      needPay: '1',
      fee: '980',
      organizer: '深圳市储能产业协会',
    }),
  });
  check('发布活动信息', eventPub.status === 201, JSON.stringify(eventPub.json).slice(0, 300));
  const eventId = eventPub.data?.listing?.id;
  check('活动信息记录费用与支付标记', eventPub.data?.listing?.event?.needPay === true && eventPub.data?.listing?.event?.fee === 980, JSON.stringify(eventPub.data?.listing?.event));

  // 贸易（采购供应）
  const tradePub = await call('POST', '/api/listings', {
    token: tokenA,
    form: jsonForm({
      category: 'trade',
      text: '唐山制造企业年度钢材集中采购，热轧卷板 5 万吨，冷轧卷板 3 万吨，月结账期 60 天，交货地曹妃甸。',
      publish: '1',
      durationDays: '30',
      tradeType: '采购',
      quantity: '12 万吨',
      unit: '吨',
      price: '以唐山市场价下浮比例报价',
      payment: '月结 60 天',
      delivery: '唐山曹妃甸厂区自提',
    }),
  });
  check('发布贸易（采购供应）信息', tradePub.status === 201, JSON.stringify(tradePub.json).slice(0, 300));
  const tradeId = tradePub.data?.listing?.id;
  check('贸易信息记录供需字段', tradePub.data?.listing?.trade?.tradeType === '采购' && tradePub.data?.listing?.trade?.quantity === '12 万吨');

  const filtered = await call('GET', '/api/listings?category=trade&pageSize=20');
  check('按板块筛选', (filtered.data?.items || []).every((i) => i.category === 'trade'));

  const searched = await call('GET', `/api/listings?q=${encodeURIComponent('钢材')}&pageSize=20`);
  check('全文搜索命中', (searched.data?.items || []).some((i) => i.id === tradeId), `total=${searched.data?.total}`);

  console.log('\n=== 7. 留言 + AI 自动回复 ===');
  const commentFd = jsonForm({ content: '请问对承接方的资质有什么硬性要求？项目目前进展到哪一步了？', aiReply: '1' });
  const comment = await call('POST', `/api/listings/${listingId}/comments`, { token: tokenB, form: commentFd });
  check('发表留言', comment.status === 201 && Boolean(comment.data?.comment?.id), JSON.stringify(comment.json).slice(0, 300));
  check('AI 依据上下文自动回复', Boolean(comment.data?.aiComment?.content), JSON.stringify(comment.data?.aiComment || {}).slice(0, 300));
  console.log(`    → AI 回复：${String(comment.data?.aiComment?.content || '').slice(0, 90)}…`);

  const comment2 = await call('POST', `/api/listings/${listingId}/comments`, {
    token: tokenB,
    form: jsonForm({ content: '怎么联系发布方？', aiReply: '1' }),
  });
  check('AI 回复联系方式类问题', Boolean(comment2.data?.aiComment?.content), JSON.stringify(comment2.data?.aiComment || {}).slice(0, 200));
  console.log(`    → AI 回复：${String(comment2.data?.aiComment?.content || '').slice(0, 90)}…`);

  const comments = await call('GET', `/api/listings/${listingId}/comments`);
  check('留言列表（含回复树）', (comments.data?.tree || []).length >= 2, JSON.stringify(comments.data?.total));

  console.log('\n=== 8. 关注与通知 ===');
  const follow = await call('POST', '/api/follow', { token: tokenB, body: { targetType: 'listing', targetId: listingId, meta: { name: '测试' } } });
  check('关注信息', follow.status === 200 && follow.data?.following === true);

  const followIndustry = await call('POST', '/api/follow', { token: tokenB, body: { targetType: 'industry', targetId: 'new-energy', meta: { name: '新能源' } } });
  check('订阅行业', followIndustry.status === 200);

  const notifBefore = await call('GET', '/api/notifications', { token: tokenB });
  check('通知接口可用', notifBefore.status === 200 && Array.isArray(notifBefore.data?.items));

  // 换个用户再发一条新能源项目，验证关注者收到推送
  const pub2 = await call('POST', '/api/listings', {
    token: tokenA,
    form: jsonForm({ category: 'project', text: '江苏常州 100MWh 用户侧储能 EMC 合同能源管理项目，总投资 2.4 亿元，分享型合同能源管理。', publish: '1', durationDays: '30', type: 'emc' }),
  });
  check('第二条项目发布', pub2.status === 201, JSON.stringify(pub2.json).slice(0, 200));

  const notifAfter = await call('GET', '/api/notifications', { token: tokenB });
  check('关注者收到新动态通知', (notifAfter.data?.items || []).length > (notifBefore.data?.items || []).length,
    `before=${(notifBefore.data?.items || []).length} after=${(notifAfter.data?.items || []).length}`);
  const followNotif = (notifAfter.data?.items || []).find((n) => n.type === 'follow_new');
  check('通知类型为关注动态', Boolean(followNotif), JSON.stringify((notifAfter.data?.items || []).map((n) => n.type)));
  console.log(`    → 通知：${followNotif?.title}`);

  const readAll = await call('POST', '/api/notifications/read', { token: tokenB, body: { ids: [] } });
  check('标记已读', readAll.status === 200 && readAll.data?.updated > 0);

  const follows = await call('GET', '/api/follows', { token: tokenB });
  check('我的关注列表', (follows.data?.items || []).length >= 2);

  console.log('\n=== 8b. 新项目上线通知全体会员 / 信息变更通知关注人 ===');
  // tokenWx 是微信演示用户，没有关注任何内容 —— 用它验证「全体会员」推送
  const wxBefore = await call('GET', '/api/notifications', { token: tokenWx });
  const wxBeforeCount = (wxBefore.data?.items || []).length;

  const newProj = await call('POST', '/api/listings', {
    token: tokenA,
    form: jsonForm({
      category: 'project', type: 'epc',
      text: '山东济南 300MW 农光互补光伏电站 EPC 总承包项目，总投资 12 亿元，工期 18 个月，需要电力工程施工总承包一级资质。',
      publish: '1', durationDays: '30',
    }),
  });
  check('新项目已发布', newProj.status === 201, JSON.stringify(newProj.json).slice(0, 150));
  const newId = newProj.data.listing.id;

  const wxAfter = await call('GET', '/api/notifications', { token: tokenWx });
  const wxItems = wxAfter.data?.items || [];
  check('未关注任何内容的会员也收到新项目上线通知', wxItems.length > wxBeforeCount,
    `before=${wxBeforeCount} after=${wxItems.length}`);
  const memberNotif = wxItems.find((n) => n.type === 'listing_new' && n.meta?.listingId === newId);
  check('会员通知类型为「新项目上线」', Boolean(memberNotif),
    JSON.stringify(wxItems.slice(0, 5).map((n) => [n.type, n.title])));
  check('会员通知标题写明新项目上线', String(memberNotif?.title || '').includes('新项目上线'), String(memberNotif?.title));
  check('会员通知标记来源为会员推送', memberNotif?.meta?.via === 'member', JSON.stringify(memberNotif?.meta));
  console.log(`    → 会员收到：${memberNotif?.title}`);

  const bAfter = await call('GET', '/api/notifications', { token: tokenB });
  const bForNew = (bAfter.data?.items || []).filter((n) => n.meta?.listingId === newId);
  check('同一条信息对同一个人只推一条（关注者不重复收会员推送）', bForNew.length === 1, `实际 ${bForNew.length} 条`);
  check('关注者收到的是「关注动态」类型', bForNew[0]?.type === 'follow_new', String(bForNew[0]?.type));
  console.log(`    → 关注者收到：${bForNew[0]?.title}`);

  const aAfter = await call('GET', '/api/notifications', { token: tokenA });
  check('发布方自己不收到新项目通知',
    !(aAfter.data?.items || []).some((n) => n.meta?.listingId === newId && n.type === 'listing_new'),
    JSON.stringify((aAfter.data?.items || []).filter((n) => n.meta?.listingId === newId).map((n) => n.type)));

  /* ---- 信息变更 → 通知关注人 ---- */
  // 先让 tokenB 关注这条新信息（tokenB 之前关注的是另一条）
  await call('POST', '/api/follow', { token: tokenB, body: { targetType: 'listing', targetId: newId, meta: { name: '济南光伏' } } });

  const beforeUpd = (await call('GET', '/api/notifications', { token: tokenB })).data?.items || [];
  const upd = await call('PUT', `/api/listings/${newId}`, {
    token: tokenA,
    body: {
      subtitle: '总投资上调至 13.5 亿元 · 工期调整为 20 个月',
      text: '山东济南 300MW 农光互补光伏电站 EPC 总承包项目，总投资调整为 13.5 亿元，工期调整为 20 个月。',
    },
  });
  check('信息更新成功', upd.status === 200, JSON.stringify(upd.json).slice(0, 150));
  check('更新接口返回真实信息', upd.data?.listing?.id === newId && Boolean(upd.data?.listing?.title),
    JSON.stringify(upd.data?.listing).slice(0, 160));

  const afterUpd = (await call('GET', '/api/notifications', { token: tokenB })).data?.items || [];
  const updItems = afterUpd.filter((n) => n.type === 'listing_update' && n.meta?.listingId === newId);
  check('信息变更后关注者收到通知', updItems.length >= 1, `实际 ${updItems.length} 条`);
  check('变更通知标题写明有更新', String(updItems[0]?.title || '').includes('有更新'), String(updItems[0]?.title));
  check('变更通知列出具体变更字段', /副标题|正文/.test(String(updItems[0]?.body || '')), String(updItems[0]?.body));
  check('变更通知携带变更清单', Array.isArray(updItems[0]?.meta?.changes) && updItems[0].meta.changes.length > 0,
    JSON.stringify(updItems[0]?.meta));
  console.log(`    → 关注者收到：${updItems[0]?.title}｜${updItems[0]?.body}`);

  const ownerUpdated = (await call('GET', '/api/notifications', { token: tokenA })).data?.items || [];
  check('发布方自己不收到变更通知',
    !ownerUpdated.some((n) => n.type === 'listing_update' && n.meta?.listingId === newId));

  // 内容没变时不该重复打扰
  await call('PUT', `/api/listings/${newId}`, {
    token: tokenA, body: { subtitle: '总投资上调至 13.5 亿元 · 工期调整为 20 个月' },
  });
  const repeated = ((await call('GET', '/api/notifications', { token: tokenB })).data?.items || [])
    .filter((n) => n.type === 'listing_update' && n.meta?.listingId === newId);
  check('重复提交相同内容不重复通知', repeated.length === updItems.length, `实际 ${repeated.length} 条`);

  /* ---- 开关生效 ---- */
  await call('PUT', '/api/users/me', { token: tokenWx, body: { settings: { notifyNewProjects: false } } });
  const wxOffBefore = ((await call('GET', '/api/notifications', { token: tokenWx })).data?.items || []).length;
  await call('POST', '/api/listings', {
    token: tokenA,
    form: jsonForm({ category: 'project', text: '浙江宁波 150MW 海上风电运维服务采购项目，年度预算 6800 万元。', publish: '1', durationDays: '30' }),
  });
  const wxOffAfter = ((await call('GET', '/api/notifications', { token: tokenWx })).data?.items || []).length;
  check('关闭「新项目上线」开关后不再收到', wxOffAfter === wxOffBefore, `before=${wxOffBefore} after=${wxOffAfter}`);

  console.log('\n=== 9. 项目对接 / 群聊 / 会议 ===');
  const dock = await call('POST', `/api/listings/${listingId}/dock`, { token: tokenB, body: { note: '我方具备电力工程施工总承包一级资质，希望参与投标' } });
  check('发起项目对接并建群', dock.status === 201 && Boolean(dock.data?.room?.id), JSON.stringify(dock.json).slice(0, 300));
  const roomId = dock.data?.room?.id;
  // 7 步流程里没有独立的「项目对接」阶段，对接只建群 + 登记成员 + 记历史
  check('对接不改变当前阶段', dock.data?.listing?.pipeline?.stage === 'publish',
    JSON.stringify(dock.data?.listing?.pipeline?.stage));
  check('对接写入流程历史', (dock.data?.listing?.pipeline?.history || []).some((h) => h.kind === 'dock'));
  check('对接方成为项目成员', (dock.data?.listing?.memberIds || []).length >= 2,
    JSON.stringify(dock.data?.listing?.memberIds));

  const rooms = await call('GET', '/api/chat/rooms', { token: tokenB });
  check('我的群聊列表', (rooms.data?.items || []).some((r) => r.id === roomId));

  const msgFd = jsonForm({ text: '您好，我们明天可以电话沟通，我先发一份公司资质给您。' });
  const msg = await call('POST', `/api/chat/rooms/${roomId}/messages`, { token: tokenB, form: msgFd });
  check('发送群聊消息', msg.status === 201 && Boolean(msg.data?.message?.id), JSON.stringify(msg.json).slice(0, 200));

  const msgs = await call('GET', `/api/chat/rooms/${roomId}/messages`, { token: tokenA });
  check('群聊消息列表', (msgs.data?.items || []).length >= 2, `实际 ${(msgs.data?.items || []).length}（含系统消息）`);

  const meeting = await call('POST', '/api/meetings', {
    token: tokenA,
    body: { roomId, listingId, title: '东营光伏项目对接会', durationMin: 60, agenda: '1. 双方介绍 2. 资质核验 3. 报价与工期' },
  });
  check('创建线上会议', meeting.status === 201 && Boolean(meeting.data?.meeting?.id), JSON.stringify(meeting.json).slice(0, 300));
  const meetingId = meeting.data?.meeting?.id;
  check('会议自动邀请参会人', (meeting.data?.meeting?.participants || []).length >= 2);

  const join = await call('POST', `/api/meetings/${meetingId}/join`, { token: tokenB });
  check('加入会议', join.status === 200 && join.data?.meeting?.status === 'live', JSON.stringify(join.json).slice(0, 200));
  check('会议返回 WebRTC 配置', Array.isArray(join.data?.iceServers) && join.data.iceServers.length > 0);

  const tr = await call('POST', `/api/meetings/${meetingId}/transcript`, {
    token: tokenB,
    body: { chunks: [
      { speaker: '张工', text: '我们公司具备电力工程施工总承包一级资质，近三年做过两个 150MW 光伏项目。' },
      { speaker: '李经理', text: '那很好，我们需要确认一下你们的报价和工期安排，请本周五前把方案发过来。' },
      { speaker: '张工', text: '没问题，我负责在本周五前提供完整技术方案与报价单。' },
      { speaker: '李经理', text: '那我们确认采用 EPC 总承包模式，下周安排现场踏勘。' },
    ] },
  });
  check('实时转写入库', tr.status === 200 && tr.data?.total >= 4, JSON.stringify(tr.json).slice(0, 200));

  const minutes = await call('POST', `/api/meetings/${meetingId}/minutes`, { token: tokenA });
  check('AI 生成会议纪要', minutes.status === 200 && Boolean(minutes.data?.meeting?.minutes?.summary), JSON.stringify(minutes.json).slice(0, 400));
  const mins = minutes.data?.meeting?.minutes;
  check('纪要含后续跟进事项', (mins?.actions || []).length > 0, JSON.stringify(mins?.actions));
  check('纪要含确认文本', Boolean(mins?.followUp));
  console.log(`    → 摘要：${String(mins?.summary || '').slice(0, 100)}…`);
  console.log(`    → 跟进事项 ${(mins?.actions || []).length} 条，共识 ${(mins?.decisions || []).length} 条`);

  const confirm = await call('POST', `/api/meetings/${meetingId}/minutes/confirm`, { token: tokenB, body: { agree: true } });
  check('参会人确认纪要', confirm.status === 200 && (confirm.data?.meeting?.minutes?.confirmedBy || []).length >= 1);

  const confirm2 = await call('POST', `/api/meetings/${meetingId}/minutes/confirm`, { token: tokenA, body: { agree: true } });
  check('双方确认后归档', (confirm2.data?.meeting?.minutes?.confirmedBy || []).length >= 2);

  const listingAfter = await call('GET', `/api/listings/${listingId}`, { token: tokenA });
  check('纪要归档到项目跟进记录', (listingAfter.data?.listing?.followUps || []).length >= 1,
    JSON.stringify((listingAfter.data?.listing?.followUps || []).map((f) => f.kind)));

  const signal = await call('POST', `/api/meetings/${meetingId}/signal`, { token: tokenB, body: { kind: 'join', data: { at: Date.now() } } });
  check('WebRTC 信令转发', signal.status === 200 && Boolean(signal.data?.signal));

  console.log('\n=== 10. 流程推进 / 活动报名 / 分享 ===');
  // 用真实流水线 id 依次推进（覆盖全部 7 步）
  const stageIds = (tax.data?.pipelineStages || []).map((s) => s.id);
  let advancedAll = true;
  for (const stage of stageIds.slice(1)) {
    const adv = await call('POST', `/api/listings/${listingId}/pipeline`, { token: tokenA, form: jsonForm({ stage, note: `推进到 ${stage}` }) });
    if (adv.status !== 200) {
      check(`推进流程阶段 ${stage}`, false, JSON.stringify(adv.json).slice(0, 200));
      advancedAll = false;
      break;
    }
  }
  if (advancedAll) check('推进完整 7 步流程', true, `共 ${stageIds.length} 步`);
  const pipeNow = await call('GET', `/api/listings/${listingId}/pipeline`, { token: tokenA });
  check('流程历史已记录', (pipeNow.data?.history || []).length >= stageIds.length, `实际 ${(pipeNow.data?.history || []).length}`);
  check('当前阶段为最后一步', pipeNow.data?.stages?.filter((s) => s.done).length === stageIds.length - 1,
    JSON.stringify((pipeNow.data?.stages || []).map((s) => `${s.id}:${s.done ? 1 : 0}`)));

  const eventReg = await call('POST', `/api/listings/${eventId}/register`, { token: tokenB, body: { name: '测试用户乙', phone: '13900008888', remark: '希望安排路演' } });
  check('活动报名（需支付）', eventReg.status === 201 && eventReg.data?.needPay === true, JSON.stringify(eventReg.json).slice(0, 200));

  const regs = await call('GET', `/api/listings/${eventId}/registrations`, { token: tokenA });
  check('主办方查看报名名单', (regs.data?.items || []).length === 1);

  const share = await call('GET', `/api/listings/${listingId}/share`);
  check('分享信息接口', share.status === 200, JSON.stringify(share.json).slice(0, 200));
  const shareModes = share.data?.modes || [];
  check('分享提供三种形态', shareModes.length === 3, JSON.stringify(shareModes.map((m) => m.id)));
  check('含纯文字形态', shareModes.some((m) => m.id === 'text' && m.text?.includes(share.data.title)), JSON.stringify(shareModes.map((m) => m.id)));
  check('含文字+图片形态', shareModes.some((m) => m.id === 'image'), JSON.stringify(shareModes.map((m) => m.id)));
  check('含文字+链接形态', shareModes.some((m) => m.id === 'link' && m.text?.includes(share.data.url)), JSON.stringify(shareModes.map((m) => m.id)));
  check('纯文字形态不含链接', !(shareModes.find((m) => m.id === 'text')?.text || '').includes(share.data.url));
  check('分享带二维码地址', Boolean(share.data?.qr), String(share.data?.qr).slice(0, 60));
  check('分享带封面图', Boolean(share.data?.imgUrl), String(share.data?.imgUrl).slice(0, 60));
  check('分享包含二维码地址', Boolean(share.data?.qr));
  check('分享包含图片模式', (share.data?.modes || []).some((m) => m.id === 'image' && m.text.includes('二维码')));
  check('分享包含链接模式', (share.data?.modes || []).some((m) => m.id === 'link' && m.text.includes(share.data?.url)));

  const qr = await fetch(`${BASE}/api/share/qrcode?text=${encodeURIComponent('https://example.com')}&size=240`);
  const qrBuf = Buffer.from(await qr.arrayBuffer());
  const { pngSize } = await import('../src/lib/png.js');
  const qrSize = pngSize(qrBuf);
  if (qr.status === 200 && qrBuf[0] === 0x89 && qrBuf[1] === 0x50 && qrSize && qrSize.width >= 100) {
    check('二维码 PNG 生成（合法 PNG 且尺寸正确）', true);
    console.log(`    → 二维码尺寸 ${qrSize.width}×${qrSize.height}，${qrBuf.length} 字节`);
    fs.writeFileSync(path.join(ROOT, 'qr-smoke.png'), qrBuf);
  } else {
    check('二维码 PNG 生成（合法 PNG 且尺寸正确）', false, `status=${qr.status} bytes=${qrBuf.length} size=${JSON.stringify(qrSize)}`);
  }

  const sharePost = await call('POST', `/api/listings/${listingId}/share`, { token: tokenB, body: { channel: 'poster' } });
  check('分享计数', sharePost.status === 200);

  console.log('\n=== 11. 通讯录 / 资质 / 管理端 ===');
  const imp = await call('POST', '/api/contacts/import', {
    token: tokenA,
    body: { source: 'phone', contacts: [
      { name: '王总', phone: '13800001234', company: '鲁能新能源' },
      { name: '赵经理', phone: '13700007777', wechat: 'zhao_pv', company: '光伏支架厂' },
      { name: '陈工', phone: '', wechat: 'chen_epc' },
    ] },
  });
  check('导入通讯录', imp.status === 201 && imp.data?.imported === 3, JSON.stringify(imp.json).slice(0, 300));
  check('识别出已注册联系人', (imp.data?.matched || []).length >= 1, JSON.stringify(imp.data?.matched));

  const contacts = await call('GET', '/api/contacts', { token: tokenA });
  check('通讯录列表', (contacts.data?.items || []).length === 3);

  const invite = await call('POST', `/api/contacts/${contacts.data.items[1].id}/invite`, { token: tokenA, body: { message: '一起来看项目' } });
  check('邀请联系人', invite.status === 200 && Boolean(invite.data?.link));

  const qfFd = new FormData();
  qfFd.append('companyName', '山东鲁能新能源工程有限公司');
  qfFd.append('creditCode', '91370000MA3XXXXXXX');
  qfFd.append('legalPerson', '张某某');
  qfFd.append('types', JSON.stringify(['business_license', 'iso9001']));
  qfFd.append('qualification', new Blob(['营业执照扫描件'], { type: 'image/png' }), '营业执照.png');
  const qf = await call('POST', '/api/users/me/qualification', { token: tokenA, form: qfFd });
  check('提交企业资质认证', qf.status === 201 && qf.data?.qualification?.status === 'pending', JSON.stringify(qf.json).slice(0, 300));

  const pend = await call('GET', '/api/admin/qualifications?status=pending', { token: adminToken });
  check('管理端查看待审资质', (pend.data?.items || []).length >= 1);

  const review = await call('POST', `/api/admin/qualifications/${login.data.user.id}`, { token: adminToken, body: { approve: true, note: '资料齐全' } });
  check('管理端审核通过', review.status === 200 && review.data?.qualification?.status === 'approved');

  const qfAfter = await call('GET', '/api/users/me/qualification', { token: tokenA });
  check('用户侧看到认证已通过', qfAfter.data?.isVerified === true, JSON.stringify(qfAfter.data));

  const overview = await call('GET', '/api/admin/overview', { token: adminToken });
  check('管理端总览', overview.status === 200 && overview.data?.stats?.users >= 5, JSON.stringify(overview.data?.stats));

  const nonAdmin = await call('GET', '/api/admin/overview', { token: tokenB });
  check('普通用户无法访问管理端', nonAdmin.status === 403);

  console.log('\n=== 12. 用户资料 / 目录 / 搜索建议 ===');
  const profile = await call('PUT', '/api/users/me', { token: tokenB, body: { company: '唐山钢铁贸易有限公司', profession: '采购总监', industry: '制造业', city: '唐山', bio: '专注钢材与型材集采' } });
  check('更新用户资料', profile.status === 200 && profile.data?.user?.company === '唐山钢铁贸易有限公司');

  const directory = await call('GET', '/api/users?pageSize=20');
  check('用户目录', (directory.data?.items || []).length >= 4);

  const userDetail = await call('GET', `/api/users/${login.data.user.id}`, { token: tokenB });
  check('用户主页（含已发布信息）', userDetail.status === 200 && Array.isArray(userDetail.data?.user?.listings));

  const suggest = await call('GET', `/api/search/suggest?q=${encodeURIComponent('光伏')}`);
  check('搜索建议', (suggest.data?.items || []).length > 0, JSON.stringify(suggest.json).slice(0, 200));

  const taxSearch = await call('GET', `/api/taxonomy/search?q=${encodeURIComponent('储能')}`);
  check('行业细分搜索', (taxSearch.data?.subs || []).length > 0, JSON.stringify(taxSearch.json).slice(0, 200));

  console.log('\n=== 13. 权限与边界 ===');
  const noAuth = await call('POST', '/api/listings', { form: jsonForm({ text: 'x' }) });
  check('未登录不能发布', noAuth.status === 401);

  const badCode = await call('POST', '/api/auth/sms/login', { body: { phone, code: '000000', purpose: 'login' } });
  check('错误验证码被拒绝', badCode.status === 400);

  const notFound = await call('GET', '/api/listings/not-exist-id');
  check('不存在的信息返回 404', notFound.status === 404);

  const badRoute = await call('GET', '/api/no-such-route');
  check('未知接口返回 404', badRoute.status === 404);

  const emptyPub = await call('POST', '/api/listings', { token: tokenA, form: jsonForm({ category: 'project', text: '' }) });
  check('空内容不能发布', emptyPub.status === 400);

  const longText = '很长的正文。'.repeat(3000);
  const bigPreview = await call('POST', '/api/ai/preview', { token: tokenA, form: jsonForm({ text: longText, category: 'project' }) });
  check('超长文本可处理', bigPreview.status === 200);

  const adminListing = await call('GET', '/api/admin/listings?status=all&pageSize=50', { token: adminToken });
  check('管理端信息列表', adminListing.status === 200 && (adminListing.data?.items || []).length >= 3);

  console.log('\n=== 14. 数据持久化 ===');
  db.flush();
  const files = fs.readdirSync(path.join(TEST_DATA, 'collections'));
  check('集合文件已落盘', files.length >= 8, files.join(','));
  const raw = JSON.parse(fs.readFileSync(path.join(TEST_DATA, 'collections', 'listings.json'), 'utf8'));
  check('信息集合可反序列化', Array.isArray(raw) && raw.length >= 3, `count=${raw.length}`);

  /* ------------------ 收尾 ------------------ */
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

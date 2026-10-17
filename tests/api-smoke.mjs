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
  const { registerStatic } = await import('../src/http/static.js');
  // 与生产用同一个注册函数，这样测的就是线上真正生效的缓存策略
  registerStatic(app, PUBLIC_DIR);
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
  check('GET /api/site 返回四大板块', (site.data?.categories || []).length === 4, JSON.stringify((site.data?.categories || []).map((c) => c.id)));

  console.log('\n=== 0b. 静态资源缓存（防止新旧前端混用） ===');
  const verInfo = await call('GET', '/api/version');
  check('提供前端版本号', Boolean(verInfo.data?.build), JSON.stringify(verInfo.data).slice(0, 120));
  check('版本号列出前端文件', (verInfo.data?.files || []).length > 5, `实际 ${(verInfo.data?.files || []).length}`);

  // app.js 静态导入全部视图模块，缓存策略必须能保证部署后立刻拿到新版；
  // 之前是 max-age=3600 且无 ETag，浏览器会拿着新旧混合的模块，整个 SPA 挂掉
  const cacheProbe = await fetch(`${BASE}/static/app.js`);
  check('静态资源返回 200', cacheProbe.status === 200, String(cacheProbe.status));
  const cacheCc = cacheProbe.headers.get('cache-control') || '';
  check('静态资源为 no-cache（每次回源校验）', cacheCc.includes('no-cache'), cacheCc);
  check('静态资源不再长时间强缓存', !/max-age=[1-9]/.test(cacheCc), cacheCc);
  const cacheEtag = cacheProbe.headers.get('etag') || '';
  check('静态资源带 ETag', Boolean(cacheEtag), cacheEtag);
  await cacheProbe.text();

  if (cacheEtag) {
    const revalidated = await fetch(`${BASE}/static/app.js`, { headers: { 'If-None-Match': cacheEtag } });
    check('ETag 未变时返回 304（不重传）', revalidated.status === 304, String(revalidated.status));
    const changed = await fetch(`${BASE}/static/app.js`, { headers: { 'If-None-Match': 'W/"stale-000"' } });
    check('ETag 不匹配时返回 200（拿到新版）', changed.status === 200, String(changed.status));
    await changed.text();
  }

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
  const staticAppJs = await fetch(`${BASE}/static/app.js`);
  check('前端 JS 可访问', staticAppJs.status === 200);
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

  // 逐文件上传：前端现在是一个文件一次请求，用来显示各自的进度。
  // 每次必须只返回 1 条记录，否则前端取 res.files[0] 会拿错文件。
  console.log('\n--- 逐文件上传（配合独立进度显示） ---');
  const perNames = ['逐文件A.txt', '逐文件B.txt', '逐文件C.txt'];
  const perGot = [];
  for (const nm of perNames) {
    const oneFd = new FormData();
    oneFd.append('file', new Blob([`内容 ${nm}`], { type: 'text/plain' }), nm);
    const one = await call('POST', '/api/files', { token: tokenA, form: oneFd });
    perGot.push({ status: one.status, count: (one.data?.files || []).length, name: one.data?.files?.[0]?.name });
  }
  check('单文件上传每次只返回 1 条记录', perGot.every((x) => x.count === 1),
    JSON.stringify(perGot));
  check('单文件上传状态均为 201', perGot.every((x) => x.status === 201), JSON.stringify(perGot));
  check('返回的文件名与上传的一致',
    perGot.map((x) => x.name).join(',') === perNames.join(','), JSON.stringify(perGot.map((x) => x.name)));

  // 一次请求传多个文件仍然要支持（旧接口 / 其他调用方在用）
  const multiFd = new FormData();
  multiFd.append('file', new Blob(['多文件一'], { type: 'text/plain' }), '多文件一.txt');
  multiFd.append('file', new Blob(['多文件二'], { type: 'text/plain' }), '多文件二.txt');
  const multi = await call('POST', '/api/files', { token: tokenA, form: multiFd });
  check('一次传多个文件仍然支持', multi.status === 201 && (multi.data?.files || []).length === 2,
    JSON.stringify(multi.data?.files?.map((f) => f.name) || []));

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

  console.log('\n=== 11b. AI 设置（在线绑定 DeepSeek） ===');
  const aiDefaults = await call('GET', '/api/admin/ai', { token: adminToken });
  check('管理端可读 AI 设置', aiDefaults.status === 200, JSON.stringify(aiDefaults.json).slice(0, 160));
  check('默认指向 DeepSeek', String(aiDefaults.data?.baseUrl || '').includes('deepseek'),
    String(aiDefaults.data?.baseUrl));
  check('默认模型 deepseek-chat', aiDefaults.data?.model === 'deepseek-chat', String(aiDefaults.data?.model));
  check('初始未配置 Key', aiDefaults.data?.hasApiKey === false, String(aiDefaults.data?.hasApiKey));
  check('初始走内置规则引擎', aiDefaults.data?.source === 'none', String(aiDefaults.data?.source));
  check('提供多家服务商预设', (aiDefaults.data?.presets || []).length >= 4,
    `实际 ${(aiDefaults.data?.presets || []).length}`);

  const aiGuest = await call('GET', '/api/admin/ai');
  check('未登录不能读 AI 设置', aiGuest.status === 401 || aiGuest.status === 403, String(aiGuest.status));
  const aiNonAdmin = await call('GET', '/api/admin/ai', { token: tokenB });
  check('普通用户不能读 AI 设置', aiNonAdmin.status === 403, String(aiNonAdmin.status));
  const aiNonAdminWrite = await call('PUT', '/api/admin/ai', { token: tokenB, body: { apiKey: 'sk-x' } });
  check('普通用户不能改 AI 设置', aiNonAdminWrite.status === 403, String(aiNonAdminWrite.status));

  const FAKE_KEY = 'sk-testsmoke-abcdefghijklmnop';
  const aiSaved = await call('PUT', '/api/admin/ai', {
    token: adminToken,
    body: { baseUrl: 'https://api.deepseek.com/v1', model: 'deepseek-chat', apiKey: FAKE_KEY },
  });
  check('管理员可保存 AI 设置', aiSaved.status === 200 && aiSaved.data?.hasApiKey === true,
    JSON.stringify(aiSaved.json).slice(0, 160));
  check('保存后来源为页面配置', aiSaved.data?.source === 'online', String(aiSaved.data?.source));

  // 关键：接口绝不能把完整 key 回传出去
  const aiReadBack = await call('GET', '/api/admin/ai', { token: adminToken });
  const aiRaw = JSON.stringify(aiReadBack.data || {});
  check('接口不回传完整 API Key', !aiRaw.includes(FAKE_KEY), aiRaw.slice(0, 200));
  check('只回传可核对的片段', Boolean(aiReadBack.data?.apiKeyHint), String(aiReadBack.data?.apiKeyHint));

  // 保存后 AI 应立即切换到「大模型」模式（无需重启）
  const aiHealth = await call('GET', '/api/health');
  check('保存后 AI 立即切换为大模型模式', aiHealth.data?.ai?.mode === 'ai',
    JSON.stringify(aiHealth.data?.ai));
  check('AI 状态标注来源为 online', aiHealth.data?.ai?.source === 'online',
    JSON.stringify(aiHealth.data?.ai));

  // 留空表示不修改
  const aiKeep = await call('PUT', '/api/admin/ai', {
    token: adminToken,
    body: { baseUrl: 'https://api.deepseek.com/v1', model: 'deepseek-chat', apiKey: '' },
  });
  check('Key 留空表示不修改', aiKeep.data?.hasApiKey === true, String(aiKeep.data?.hasApiKey));

  // 清除后回退
  const aiCleared = await call('DELETE', '/api/admin/ai', { token: adminToken });
  check('可清除配置', aiCleared.data?.hasApiKey === false, JSON.stringify(aiCleared.data));
  const health2 = await call('GET', '/api/health');
  check('清除后回退内置规则引擎', health2.data?.ai?.mode === 'local', JSON.stringify(health2.data?.ai));

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

  console.log('\n=== 12b. 注册身份选择 + 实名认证（个人身份证 / 企业 AI 征信审核） ===');
  const vmeta = await call('GET', '/api/verification/meta');
  check('认证元数据接口', vmeta.status === 200, JSON.stringify(vmeta.json).slice(0, 150));
  check('提供个人与企业两种身份', (vmeta.data?.accountTypes || []).length === 2,
    JSON.stringify(vmeta.data?.accountTypes));
  check('个人认证要求身份证正反面', (vmeta.data?.personal?.files || []).length === 2,
    JSON.stringify((vmeta.data?.personal?.files || []).map((f) => f.key)));
  check('企业认证要求营业执照', (vmeta.data?.company?.files || []).some((f) => f.key === 'license'));
  check('声明 AI 征信审核的边界', String(vmeta.data?.creditNote || '').includes('并非外部征信机构查询结果'),
    String(vmeta.data?.creditNote || '').slice(0, 60));

  // 注册时选择身份
  const pEmail = `personal${Date.now() % 100000}@example.com`;
  const pc = await call('POST', '/api/auth/email/send-code', { body: { email: pEmail, purpose: 'register' } });
  const pReg = await call('POST', '/api/auth/email/register', {
    body: { email: pEmail, code: pc.data?.demoCode, password: 'test123456', nickname: '个人用户甲', accountType: 'personal' },
  });
  check('注册可选个人身份', pReg.status === 200 && pReg.data?.user?.accountType === 'personal',
    JSON.stringify(pReg.data?.user?.accountType));
  check('新用户认证状态为未认证', pReg.data?.user?.verification?.status === 'none',
    JSON.stringify(pReg.data?.user?.verification));
  const tokenP = pReg.data?.token;

  const cEmail = `company${Date.now() % 100000}@example.com`;
  const cc = await call('POST', '/api/auth/email/send-code', { body: { email: cEmail, purpose: 'register' } });
  const cReg = await call('POST', '/api/auth/email/register', {
    body: { email: cEmail, code: cc.data?.demoCode, password: 'test123456', nickname: '企业用户甲', company: '山东电力建设集团有限公司', accountType: 'company' },
  });
  check('注册可选企业身份', cReg.data?.user?.accountType === 'company', JSON.stringify(cReg.data?.user?.accountType));
  const tokenCmp = cReg.data?.token;

  /* ---- 个人认证 ---- */
  const badId = new FormData();
  badId.append('type', 'personal');
  badId.append('realName', '张三');
  badId.append('idNumber', '110105194912310021'); // 校验位错误
  badId.append('file', new Blob([Buffer.from('id-front')], { type: 'image/jpeg' }), 'front.jpg');
  badId.append('file', new Blob([Buffer.from('id-back')], { type: 'image/jpeg' }), 'back.jpg');
  badId.append('fileFields', JSON.stringify(['idFront', 'idBack']));
  const pBad = await call('POST', '/api/users/me/verification', { token: tokenP, form: badId });
  check('身份证校验位错误会被拒绝', pBad.status === 201 && pBad.data?.verification?.status === 'rejected',
    JSON.stringify(pBad.data?.verification?.status));
  check('拒绝原因指出校验位问题',
    (pBad.data?.verification?.findings || []).some((f) => f.includes('校验位')),
    JSON.stringify(pBad.data?.verification?.findings));
  check('未通过时 verified 为 false', pBad.data?.verification?.verified === false);

  const goodId = new FormData();
  goodId.append('type', 'personal');
  goodId.append('realName', '张三');
  goodId.append('idNumber', '11010519491231002X'); // 合法身份证
  goodId.append('file', new Blob([Buffer.from('id-front')], { type: 'image/jpeg' }), 'front.jpg');
  goodId.append('file', new Blob([Buffer.from('id-back')], { type: 'image/jpeg' }), 'back.jpg');
  goodId.append('fileFields', JSON.stringify(['idFront', 'idBack']));
  const pOk = await call('POST', '/api/users/me/verification', { token: tokenP, form: goodId });
  check('个人认证通过', pOk.status === 201 && pOk.data?.verification?.status === 'approved',
    JSON.stringify(pOk.data?.verification?.status));
  check('通过后 verified 为 true', pOk.data?.verification?.verified === true);
  check('身份证号做脱敏', /^\d{6}\*{8}[\dX]{4}$/.test(String(pOk.data?.verification?.idNumberMasked || '')),
    String(pOk.data?.verification?.idNumberMasked));
  check('认证摘要不回传完整身份证号', !JSON.stringify(pOk.data?.verification || {}).includes('11010519491231002X'),
    JSON.stringify(pOk.data?.verification || {}).slice(0, 200));

  const vMe = await call('GET', '/api/users/me/verification', { token: tokenP });
  check('可查询自己的认证状态', vMe.data?.verification?.status === 'approved');
  check('认证类型写明个人', vMe.data?.verification?.typeName === '个人', String(vMe.data?.verification?.typeName));

  /* ---- 企业认证：AI 征信审核 ---- */
  const cBad = new FormData();
  cBad.append('type', 'company');
  cBad.append('companyName', '山东电力建设集团有限公司');
  cBad.append('creditCode', '11010519491231002X'); // 非法信用代码
  cBad.append('legalPerson', '李四');
  cBad.append('regCapital', '5000万元');
  cBad.append('foundedAt', '2015-06-01');
  cBad.append('scope', '电力工程施工');
  cBad.append('file', new Blob([Buffer.from('license')], { type: 'image/jpeg' }), 'license.jpg');
  cBad.append('fileFields', JSON.stringify(['license']));
  const rBad = await call('POST', '/api/users/me/verification', { token: tokenCmp, form: cBad });
  check('企业认证返回 AI 征信结果', rBad.status === 201 && Boolean(rBad.data?.review), JSON.stringify(rBad.json).slice(0, 200));
  check('非法信用代码被判为高风险', rBad.data?.review?.riskLevel === 'high', String(rBad.data?.review?.riskLevel));
  check('非法信用代码不会被自动通过', rBad.data?.verification?.status !== 'approved',
    String(rBad.data?.verification?.status));
  check('审核结果含评分', typeof rBad.data?.review?.score === 'number', String(rBad.data?.review?.score));
  console.log(`    → 非法信用代码：${rBad.data?.review?.riskLevel} ${rBad.data?.review?.score} 分 / ${rBad.data?.mode}`);

  const cGood = new FormData();
  cGood.append('type', 'company');
  cGood.append('companyName', '山东电力建设集团有限公司');
  cGood.append('creditCode', '91350100M000100Y43'); // 合法校验位
  cGood.append('legalPerson', '李四');
  cGood.append('regCapital', '5000万元');
  cGood.append('foundedAt', '2015-06-01');
  cGood.append('scope', '电力工程施工、机电设备安装');
  cGood.append('file', new Blob([Buffer.from('license')], { type: 'image/jpeg' }), 'license.jpg');
  cGood.append('fileFields', JSON.stringify(['license']));
  const rGood = await call('POST', '/api/users/me/verification', { token: tokenCmp, form: cGood });
  check('材料齐全的企业认证通过', rGood.data?.verification?.status === 'approved',
    JSON.stringify({ status: rGood.data?.verification?.status, risk: rGood.data?.review?.riskLevel, mode: rGood.data?.mode }));
  check('低风险走 AI 自动通过', rGood.data?.mode === 'auto', String(rGood.data?.mode));
  check('通过后企业名写入资料', rGood.data?.user?.company === '山东电力建设集团有限公司',
    String(rGood.data?.user?.company));
  check('通过后 verified 为 true', rGood.data?.verification?.verified === true);
  console.log(`    → 材料齐全：${rGood.data?.review?.riskLevel} ${rGood.data?.review?.score} 分 / ${rGood.data?.mode}`);

  // 高风险材料（含失信信号）应被拒绝
  const cRisky = new FormData();
  cRisky.append('type', 'company');
  cRisky.append('companyName', '某某投资管理有限公司');
  cRisky.append('creditCode', '91350100M000100Y43');
  cRisky.append('legalPerson', '王五');
  cRisky.append('regCapital', '10万元');
  cRisky.append('foundedAt', '2020-01-01');
  cRisky.append('scope', '投资管理、资金盘');
  cRisky.append('extra', '该公司已被列为失信被执行人，并列入经营异常名录');
  cRisky.append('file', new Blob([Buffer.from('license')], { type: 'image/jpeg' }), 'license.jpg');
  cRisky.append('fileFields', JSON.stringify(['license']));
  const rRisky = await call('POST', '/api/users/me/verification', { token: tokenCmp, form: cRisky });
  check('含失信信号的材料被判高风险', rRisky.data?.review?.riskLevel === 'high', String(rRisky.data?.review?.riskLevel));
  check('高风险被拒绝并说明原因', rRisky.data?.verification?.status === 'rejected'
    && String(rRisky.data?.review?.summary || '').length > 0,
    JSON.stringify({ status: rRisky.data?.verification?.status, summary: rRisky.data?.review?.summary }));
  console.log(`    → 含风险信号：${rRisky.data?.review?.riskLevel} ${rRisky.data?.review?.score} 分 / ${rRisky.data?.mode}`);

  // 未选类型应报错
  const noType = await call('POST', '/api/users/me/verification', { token: tokenP, body: { realName: '张三' } });
  check('未选认证类型会报错', noType.status === 400, String(noType.status));

  // 普通用户不能复核认证
  const forbid = await call('POST', `/api/users/${pReg.data?.user?.id}/verification/review`, {
    token: tokenP, body: { agree: true },
  });
  check('普通用户不能复核认证', forbid.status === 403, String(forbid.status));

  const adminList = await call('GET', '/api/admin/verifications?status=all', { token: adminToken });
  check('管理员可查看认证列表', adminList.status === 200 && Array.isArray(adminList.data?.items),
    JSON.stringify(adminList.json).slice(0, 150));

  console.log('\n=== 12c. 绑定微信 + 转发微信 / 朋友圈 ===');
  const wxStatus0 = await call('GET', '/api/users/me/wechat', { token: tokenP });
  check('可查询微信绑定状态', wxStatus0.status === 200, JSON.stringify(wxStatus0.json).slice(0, 150));
  check('初始未绑定', wxStatus0.data?.bound === false, JSON.stringify(wxStatus0.data?.bound));
  check('有邮箱密码的账号可解绑', wxStatus0.data?.canUnbind === true);

  const bindUrl = await call('GET', '/api/auth/wechat/bind/url?mode=mp', { token: tokenP });
  check('可获取绑定授权地址', bindUrl.status === 200, JSON.stringify(bindUrl.json).slice(0, 150));
  check('签发了一次性 state 票据', typeof bindUrl.data?.state === 'string' && bindUrl.data.state.length >= 16,
    String(bindUrl.data?.state));
  check('state 里不含用户 ID（防篡改）', !String(bindUrl.data?.state || '').includes(pReg.data?.user?.id),
    String(bindUrl.data?.state));

  const demoOpenId = `demo_bind_${Date.now().toString(36)}`;
  const bind1 = await call('POST', '/api/auth/wechat/bind/demo', {
    token: tokenP, body: { nickname: '个人用户甲的微信', openid: demoOpenId },
  });
  check('模拟绑定成功', bind1.status === 200 && bind1.data?.bound === true, JSON.stringify(bind1.json).slice(0, 150));
  check('绑定结果做脱敏', /^\w{6}\*{4}\w{4}$/.test(String(bind1.data?.openidMasked || '')),
    String(bind1.data?.openidMasked));

  const wxStatus1 = await call('GET', '/api/users/me/wechat', { token: tokenP });
  check('绑定后状态为已绑定', wxStatus1.data?.bound === true);
  check('返回微信昵称', wxStatus1.data?.nickname === '个人用户甲的微信', String(wxStatus1.data?.nickname));
  check('记录了绑定时间', Boolean(wxStatus1.data?.boundAt), String(wxStatus1.data?.boundAt));
  check('openid 脱敏后返回', !JSON.stringify(wxStatus1.data || {}).includes(demoOpenId),
    JSON.stringify(wxStatus1.data || {}).slice(0, 200));

  // 同一个微信不能绑到第二个账号
  const bind2 = await call('POST', '/api/auth/wechat/bind/demo', {
    token: tokenCmp, body: { nickname: '企业用户甲的微信', openid: demoOpenId },
  });
  check('同一个微信不能绑到第二个账号', bind2.status === 409, String(bind2.status));
  check('冲突提示说明已绑到哪个账号', /已绑定到账号/.test(JSON.stringify(bind2.json)),
    JSON.stringify(bind2.json).slice(0, 200));

  // 换绑到自己的另一个微信是允许的
  const rebind = await call('POST', '/api/auth/wechat/bind/demo', {
    token: tokenP, body: { nickname: '换绑后的微信', openid: `demo_bind_new_${Date.now().toString(36)}` },
  });
  check('允许换绑到自己的另一个微信', rebind.status === 200 && rebind.data?.user?.wechatNickname === '换绑后的微信',
    String(rebind.data?.user?.wechatNickname));

  // 解绑
  const unbind = await call('POST', '/api/auth/wechat/unbind', { token: tokenP });
  check('解除绑定成功', unbind.status === 200 && unbind.data?.bound === false, JSON.stringify(unbind.json).slice(0, 150));
  const wxStatus2 = await call('GET', '/api/users/me/wechat', { token: tokenP });
  check('解绑后状态为未绑定', wxStatus2.data?.bound === false);

  // 解绑后原 openid 释放，可以再绑到别的账号
  const reclaim = await call('POST', '/api/auth/wechat/bind/demo', {
    token: tokenCmp, body: { nickname: '企业用户甲的微信', openid: demoOpenId },
  });
  check('解绑后该微信可绑到其他账号', reclaim.status === 200, String(reclaim.status));

  // 未登录不能绑定
  const anonBind = await call('POST', '/api/auth/wechat/bind/demo', { body: { nickname: '匿名' } });
  check('未登录不能绑定微信', anonBind.status === 401 || anonBind.status === 403, String(anonBind.status));

  // 分享配置：微信内分享标题 / 摘要 / 封面 + JS-SDK 签名位
  const listingShare = await call('GET', `/api/wechat/share-config?id=${listingId}&url=${encodeURIComponent('https://example.com/#/detail/x')}`, { token: tokenP });
  check('分享配置接口可用', listingShare.status === 200, JSON.stringify(listingShare.json).slice(0, 150));
  check('分享配置带标题与链接', Boolean(listingShare.data?.title && listingShare.data?.url),
    JSON.stringify({ title: listingShare.data?.title, url: listingShare.data?.url }));
  check('分享配置带封面图', Boolean(listingShare.data?.imgUrl), String(listingShare.data?.imgUrl).slice(0, 60));
  check('提供微信好友与朋友圈两种分享位', Array.isArray(listingShare.data?.modes)
    || typeof listingShare.data?.jsSdk !== 'undefined',
    JSON.stringify(Object.keys(listingShare.data || {})));

  console.log('\n=== 12d. 下架 / 隐藏后必须真的不可见 ===');
  const hideTest = await call('POST', '/api/listings', {
    token: tokenA,
    form: jsonForm({
      category: 'project',
      text: '下架可见性测试项目，用于验证信息下架后分享出去的链接无法再打开。',
      publish: '1', durationDays: '30',
    }),
  });
  const hideId = hideTest.data.listing.id;
  const beforeClose = await call('GET', `/api/listings/${hideId}`);
  check('下架前链接可访问', beforeClose.status === 200, String(beforeClose.status));

  const closed = await call('POST', `/api/listings/${hideId}/close`, { token: tokenA, body: { reason: '测试下架' } });
  check('可下架自己的信息', closed.status === 200, JSON.stringify(closed.json).slice(0, 150));

  const afterClose = await call('GET', `/api/listings/${hideId}`);
  check('下架后分享链接打不开', afterClose.status === 410, String(afterClose.status));

  const ownerStill = await call('GET', `/api/listings/${hideId}`, { token: tokenA });
  check('发布方自己仍可查看已下架信息', ownerStill.status === 200, String(ownerStill.status));
  const adminStill = await call('GET', `/api/listings/${hideId}`, { token: adminToken });
  check('管理员仍可查看已下架信息', adminStill.status === 200, String(adminStill.status));

  const listAfterClose = await call('GET', '/api/listings?pageSize=50');
  check('已下架信息不在公开列表里', !(listAfterClose.data.items || []).some((l) => l.id === hideId),
    String((listAfterClose.data.items || []).length));

  const searchAfterClose = await call('GET', '/api/search/suggest?q=下架可见性');
  check('已下架信息不出现在搜索建议里',
    !(searchAfterClose.data.items || []).some((i) => i.type === 'listing' && i.id === hideId),
    JSON.stringify(searchAfterClose.data.items || []));

  console.log('\n=== 12e. 案例参考（联网检索 / 内置基准） ===');
  const sStatus = await call('GET', '/api/search-status');
  check('检索服务状态接口可用', sStatus.status === 200 && typeof sStatus.data?.configured === 'boolean',
    JSON.stringify(sStatus.json).slice(0, 150));
  check('未配置检索时必须说明不是实时检索结果',
    sStatus.data.configured === true || String(sStatus.data.hint || '').includes('不是实时检索结果'),
    String(sStatus.data?.hint));

  const oneForCases = await call('GET', '/api/listings?pageSize=1');
  const cid2 = oneForCases.data.items[0]?.id;
  const casesRes = await call('GET', `/api/listings/${cid2}/cases`);
  check('案例接口可用', casesRes.status === 200 && Array.isArray(casesRes.data?.cases?.items),
    JSON.stringify(casesRes.json).slice(0, 150));
  const cset = casesRes.data?.cases || {};
  check('案例标注数据来源', ['web', 'builtin'].includes(cset.source), String(cset.source));
  check('数据来源有中文说明', Boolean(cset.sourceName), String(cset.sourceName));
  check('案例带来源声明文案', String(cset.note || '').length > 10, String(cset.note));
  check('案例条目非空', (cset.items || []).length > 0, String((cset.items || []).length));

  if (cset.source === 'builtin') {
    // 最关键的一条：内置基准绝不能被包装成"网上实时案例"
    check('内置基准全部标记为 benchmark',
      (cset.items || []).every((c) => c.kind === 'benchmark'),
      JSON.stringify((cset.items || []).map((c) => c.kind)));
    check('内置基准标题写明「参考基准」',
      (cset.items || []).every((c) => String(c.title).includes('参考基准')),
      JSON.stringify((cset.items || []).map((c) => c.title)));
    check('内置基准不附来源链接（避免看起来像检索结果）',
      (cset.items || []).every((c) => !c.url),
      JSON.stringify((cset.items || []).map((c) => c.url)));
    check('内置基准提供造价参考', Boolean((cset.items || [])[0]?.cost), String((cset.items || [])[0]?.cost));
    check('内置基准提供工期参考', Boolean((cset.items || [])[0]?.period), String((cset.items || [])[0]?.period));
  }

  const casesAnon = await call('POST', `/api/listings/${cid2}/cases/refresh`, {});
  check('未登录不能刷新案例', [401, 403].includes(casesAnon.status), String(casesAnon.status));
  const casesOther = await call('POST', `/api/listings/${cid2}/cases/refresh`, { token: tokenB });
  check('非发布方不能刷新案例', casesOther.status === 403, String(casesOther.status));

  console.log('\n=== 12f. 采购/供应：多条物资明细（2 条以上用表格展示） ===');
  const multiItems = [
    { name: '单晶硅光伏组件', spec: '182mm 550W', quantity: '12', unit: '万块', price: '0.72 元/W', note: '一线品牌' },
    { name: '组串式逆变器', spec: '320kW', quantity: '60', unit: '台', price: '0.18 元/W' },
    { name: '光伏支架', spec: '热镀锌', quantity: '4200', unit: '吨', price: '电议' },
  ];
  const miCreate = await call('POST', '/api/listings', {
    token: tokenA,
    form: jsonForm({
      category: 'trade', type: 'procurement',
      text: '江苏常州光伏电站设备集中采购，共 3 类物资，详见物资明细表。',
      durationDays: '30', tradeType: '采购',
      items: JSON.stringify(multiItems),
    }),
  });
  check('可发布带多条物资的采购信息', miCreate.status === 201, JSON.stringify(miCreate.json).slice(0, 200));
  const miId = miCreate.data.listing.id;
  const miView = await call('GET', `/api/listings/${miId}`, { token: tokenA });
  const miItems = miView.data?.listing?.trade?.items || [];
  check('物资明细保存为 3 条', miItems.length === 3, `实际 ${miItems.length}`);
  check('明细含品名', miItems[0]?.name === '单晶硅光伏组件', String(miItems[0]?.name));
  check('明细含规格型号', miItems[0]?.spec === '182mm 550W', String(miItems[0]?.spec));
  check('明细含数量与单位', miItems[0]?.quantity === '12' && miItems[0]?.unit === '万块');
  check('明细含单价', miItems[0]?.price === '0.72 元/W', String(miItems[0]?.price));
  check('明细含备注', miItems[0]?.note === '一线品牌', String(miItems[0]?.note));
  check('供需类型保存正确', miView.data?.listing?.trade?.tradeType === '采购');

  const miBlank = await call('POST', '/api/listings', {
    token: tokenA,
    form: jsonForm({
      category: 'trade', text: '含空行的采购信息，用于验证空行会被丢弃而不是渲染成空表格行。',
      durationDays: '30', tradeType: '采购',
      items: JSON.stringify([{ name: '钢材' }, {}, { name: '', spec: '', quantity: '' }, { name: '水泥', quantity: '500' }]),
    }),
  });
  const miBlankView = await call('GET', `/api/listings/${miBlank.data.listing.id}`, { token: tokenA });
  check('空行被丢弃，只留 2 条', (miBlankView.data?.listing?.trade?.items || []).length === 2,
    `实际 ${(miBlankView.data?.listing?.trade?.items || []).length}`);

  const miDirty = await call('POST', '/api/listings', {
    token: tokenA,
    form: jsonForm({
      category: 'trade', text: '脏数据测试：物资明细里混入 null、字符串、非对象，应被安全忽略。',
      durationDays: '30', tradeType: '供应',
      items: JSON.stringify([null, 'x', 42, { name: '有效物资' }, { name: '   ' }]),
    }),
  });
  const miDirtyView = await call('GET', `/api/listings/${miDirty.data.listing.id}`, { token: tokenA });
  check('脏数据被安全忽略，只留有效条目', (miDirtyView.data?.listing?.trade?.items || []).length === 1,
    JSON.stringify(miDirtyView.data?.listing?.trade?.items));

  const miHuge = await call('POST', '/api/listings', {
    token: tokenA,
    form: jsonForm({
      category: 'trade', text: '上限测试：一次提交 150 条物资明细，应被截断到 100 条。',
      durationDays: '30', tradeType: '采购',
      items: JSON.stringify(Array.from({ length: 150 }, (_, i) => ({ name: `物料${i + 1}` }))),
    }),
  });
  const miHugeView = await call('GET', `/api/listings/${miHuge.data.listing.id}`, { token: tokenA });
  check('明细数量有上限（100 条）', (miHugeView.data?.listing?.trade?.items || []).length === 100,
    `实际 ${(miHugeView.data?.listing?.trade?.items || []).length}`);

  await call('PUT', `/api/listings/${miId}`, { token: tokenA, body: { trade: { tradeType: '采购', payment: '月结 60 天' } } });
  const miAfterEdit = await call('GET', `/api/listings/${miId}`, { token: tokenA });
  check('编辑其它字段不会冲掉物资明细', (miAfterEdit.data?.listing?.trade?.items || []).length === 3,
    `实际 ${(miAfterEdit.data?.listing?.trade?.items || []).length}`);

  const miOne = await call('POST', '/api/listings', {
    token: tokenA,
    form: jsonForm({
      category: 'trade', text: '只有一条物资的采购信息，用于验证单条时也正常保存。',
      durationDays: '30', tradeType: '采购',
      items: JSON.stringify([{ name: '水泥', quantity: '500', unit: '吨' }]),
    }),
  });
  const miOneView = await call('GET', `/api/listings/${miOne.data.listing.id}`, { token: tokenA });
  check('单条明细也正常保存', (miOneView.data?.listing?.trade?.items || []).length === 1);

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

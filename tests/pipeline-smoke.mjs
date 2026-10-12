/**
 * 小鱼来了 — 项目发布增强与 7 步流程端到端测试
 *
 * 覆盖：
 *   · 发布项目时填写「需要对方具备的资质」（多项）+「商务条件」
 *   · 编辑时合并而非清空
 *   · 7 步流程：项目发布 → 上传资质审核 → 群聊天室和会议 → 发邀请函
 *                → 签订居间 → 线下面谈 → 签订正式合约
 *   · 资质审核：意向方提交 → AI 逐项核对 → 发布方确认
 *   · 文书生成：邀请函 / 居间协议 / 合同要点
 *
 * 运行：node tests/pipeline-smoke.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
process.chdir(ROOT);

const TEST_DATA = path.join(ROOT, 'data-test-pipeline');
fs.rmSync(TEST_DATA, { recursive: true, force: true });
process.env.DATA_DIR = 'data-test-pipeline';
process.env.NO_SEED = '1';
process.env.SESSION_SECRET = 'pipeline-test-'.padEnd(48, 'x');
process.env.PUBLIC_BASE_URL = '';

const { createApp } = await import('../src/http/app.js');
const registerRoutes = (await import('../src/routes/index.js')).default;
const db = (await import('../src/store/db.js')).default;

const PORT = 8935;
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

function jsonForm(obj) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(obj)) {
    fd.append(k, typeof v === 'string' ? v : JSON.stringify(v));
  }
  return fd;
}

async function loginPhone(phone, nickname, company) {
  const c = await call('POST', '/api/auth/sms/send', { body: { phone, purpose: 'login' } });
  const r = await call('POST', '/api/auth/sms/login', {
    body: { phone, code: c.data.demoCode, purpose: 'login', nickname, company },
  });
  return { token: r.data.token, user: r.data.user };
}

async function main() {
  const app = createApp();
  registerRoutes(app);
  await app.listen(PORT, '127.0.0.1');
  check('服务启动', true);

  const owner = await loginPhone('13611110001', '发布方-张总', '东营阳光新能源有限公司');
  const bidder = await loginPhone('13611110002', '意向方-李经理', '山东电力建设集团');
  const other = await loginPhone('13611110003', '无关方-王工', '某某公司');
  check('三个测试账号就绪', Boolean(owner.token && bidder.token && other.token));

  const tax = await call('GET', '/api/taxonomy');
  check('接口提供 7 步流程', (tax.data.pipelineStages || []).length === 7, `实际 ${(tax.data.pipelineStages || []).length}`);
  check('接口提供资质预置项', (tax.data.projectQualificationPresets || []).length > 10, `实际 ${(tax.data.projectQualificationPresets || []).length}`);
  check('接口提供商务条件字段定义', (tax.data.businessTermFields || []).length >= 10, `实际 ${(tax.data.businessTermFields || []).length}`);
  check('接口提供合作方式选项', (tax.data.cooperationModes || []).length > 5);

  console.log('\n=== 1. 7 步流程顺序 ===');
  const ids = (tax.data.pipelineStages || []).map((s) => s.id);
  const names = (tax.data.pipelineStages || []).map((s) => s.name);
  check('阶段 id 顺序正确', JSON.stringify(ids) === JSON.stringify([
    'publish', 'qualification-review', 'group-meeting', 'invitation', 'brokerage', 'offline-meeting', 'contract',
  ]), JSON.stringify(ids));
  check('阶段名称正确', names[0] === '项目发布' && names[1] === '上传资质审核' && names[6] === '签订正式合约', JSON.stringify(names));
  check('每个阶段都有图标与动作', (tax.data.pipelineStages || []).every((s) => s.icon && Array.isArray(s.actions)));
  check('资质审核阶段包含三步动作',
    JSON.stringify(tax.data.pipelineStages[1].actions) === JSON.stringify(['upload-qualification', 'ai-review', 'confirm-qualification']),
    JSON.stringify(tax.data.pipelineStages[1].actions));

  console.log('\n=== 2. 发布：资质要求（多项）+ 商务条件 ===');
  const qualifications = [
    { name: '电力工程施工总承包一级', level: '一级', required: true, note: '必须提供证书扫描件' },
    { name: '安全生产许可证', level: '不要求', required: true },
    { name: 'ISO9001 质量管理体系', level: '不要求', required: false, note: '加分项' },
  ];
  const businessTerms = {
    cooperationMode: 'EPC 总承包',
    priceType: '总价包干',
    priceRange: '8.6 亿元',
    taxInfo: '含税',
    paymentTerms: '预付款+进度款+验收款',
    advanceRatio: '30%',
    retentionRatio: '5%，质保期 2 年',
    settlement: '银行转账',
    invoiceType: '增值税专用发票 13%',
    period: '14 个月',
    deposit: '合同额 10% 履约保函',
    brokerageRatio: '合同额 2%',
    brokerageBase: '合同总额百分比',
    brokeragePayNode: '合同签订后 7 日内支付 50%，剩余按进度支付',
    otherTerms: '甲供主材，乙方负责安装调试',
  };

  const created = await call('POST', '/api/listings', {
    token: owner.token,
    form: jsonForm({
      category: 'project',
      type: 'equity-investment',
      text: '山东东营 200MW 渔光互补光伏电站 EPC 总承包项目，已备案，总投资 8.6 亿元，工期 14 个月。需要承接方具备电力工程施工总承包一级资质。',
      durationDays: '30',
      investAmount: '8.6 亿元',
      stage: '已备案',
      cooperation: 'EPC 总承包',
      period: '14 个月',
      target: '具备电力工程施工总承包一级资质',
      needQualification: '1',
      qualifications: JSON.stringify(qualifications),
      businessTerms: JSON.stringify(businessTerms),
    }),
  });
  check('发布项目成功', created.status === 201, JSON.stringify(created.json).slice(0, 300));
  const listingId = created.data.listing.id;

  const detail = await call('GET', `/api/listings/${listingId}`, { token: owner.token });
  const p = detail.data.listing.project || {};
  check('标记为需要资质', p.needQualification === true, String(p.needQualification));
  check('保存了 3 项资质要求', (p.qualifications || []).length === 3, `实际 ${(p.qualifications || []).length}`);
  check('资质项含名称与是否必需', p.qualifications[0].name === '电力工程施工总承包一级' && p.qualifications[0].required === true);
  check('资质项含等级', p.qualifications[0].level === '一级');
  check('资质项含备注', String(p.qualifications[0].note).includes('扫描件'));
  check('可选项 required=false', p.qualifications[2].required === false);
  check('商务条件已保存', Boolean(p.businessTerms) && Object.keys(p.businessTerms).length >= 14,
    `实际 ${Object.keys(p.businessTerms || {}).length} 项`);
  check('商务条件-合作方式', p.businessTerms.cooperationMode === 'EPC 总承包');
  check('商务条件-居间费比例', p.businessTerms.brokerageRatio === '合同额 2%');
  check('商务条件-预付款比例', p.businessTerms.advanceRatio === '30%');
  check('商务条件-其他条款', String(p.businessTerms.otherTerms).includes('甲供主材'));

  console.log('\n=== 3. 边界：脏数据与合并 ===');
  const dirty = await call('POST', '/api/listings', {
    token: owner.token,
    form: jsonForm({
      category: 'project', type: 'financing', text: '测试脏数据过滤的项目信息，用于验证后端清洗逻辑是否生效。', durationDays: '30',
      needQualification: '1',
      qualifications: JSON.stringify([
        { name: '  ', level: '一级' },
        { name: '建筑施工总承包一级', level: '一级', hack: 'x', __proto__: 'y' },
        { name: '重复项', required: 'yes' },
      ]),
      businessTerms: JSON.stringify({ cooperationMode: 'EPC 总承包', unknownField: '应被丢弃', priceRange: '  1 亿元  ' }),
    }),
  });
  const dirtyDetail = await call('GET', `/api/listings/${dirty.data.listing.id}`, { token: owner.token });
  const dp = dirtyDetail.data.listing.project;
  check('空名称的资质被过滤', (dp.qualifications || []).length === 2, `实际 ${(dp.qualifications || []).length}`);
  check('未知字段被丢弃', !('unknownField' in (dp.businessTerms || {})));
  check('值已 trim', dp.businessTerms.priceRange === '1 亿元', JSON.stringify(dp.businessTerms.priceRange));

  // 编辑时不提交 project 的资质/商务字段，应保留原值
  const edited = await call('PUT', `/api/listings/${listingId}`, { token: owner.token, body: { title: '东营渔光互补光伏 EPC（已更新）' } });
  check('编辑标题成功', edited.status === 200);
  const afterEdit = await call('GET', `/api/listings/${listingId}`, { token: owner.token });
  check('编辑后资质要求未被清空', (afterEdit.data.listing.project.qualifications || []).length === 3);
  check('编辑后商务条件未被清空', Object.keys(afterEdit.data.listing.project.businessTerms || {}).length >= 14);

  console.log('\n=== 4. 流程：初始与推进 ===');
  const pipe0 = await call('GET', `/api/listings/${listingId}/pipeline`, { token: owner.token });
  check('初始停留在第 1 步', pipe0.data.current === 'publish', String(pipe0.data.current));
  check('流程共 7 步', (pipe0.data.stages || []).length === 7);
  check('第 1 步为当前', pipe0.data.stages[0].current === true);

  const adv1 = await call('POST', `/api/listings/${listingId}/pipeline`, {
    token: owner.token, form: jsonForm({ stage: 'qualification-review', note: '开始收集资质' }),
  });
  check('推进到「上传资质审核」', adv1.status === 200 && adv1.data.listing.pipeline.stage === 'qualification-review',
    JSON.stringify(adv1.data?.listing?.pipeline?.stage));
  check('阶段推进写入历史', (adv1.data.listing.pipeline.history || []).length >= 2);

  console.log('\n=== 5. 阶段 2：资质提交 + AI 审核 + 发布方确认 ===');
  const q0 = await call('GET', `/api/listings/${listingId}/qualification`, { token: bidder.token });
  check('可查询资质要求', q0.status === 200);
  check('返回必需资质数量', q0.data.qualification.requiredCount === 2, `实际 ${q0.data.qualification.requiredCount}`);
  check('意向方可提交', q0.data.qualification.canSubmit === true);
  check('意向方不能审核', q0.data.qualification.canReview === false);
  check('尚无提交记录', (q0.data.qualification.submissions || []).length === 0);

  const ownerView = await call('GET', `/api/listings/${listingId}/qualification`, { token: owner.token });
  check('发布方可以审核', ownerView.data.qualification.canReview === true);
  check('发布方不能提交', ownerView.data.qualification.canSubmit === false);

  // 只提交一项必需资质 → 应判定缺项
  const partial = await call('POST', `/api/listings/${listingId}/qualification`, {
    token: bidder.token,
    body: {
      items: [{ name: '电力工程施工总承包一级', level: '一级', fileIds: ['f1'], note: '证书编号 A123' }],
      note: '先提交一项，其余在办理',
    },
  });
  check('提交资质成功', partial.status === 201, JSON.stringify(partial.json).slice(0, 250));
  check('AI 初审给出评分', typeof partial.data.aiReview.score === 'number', String(partial.data.aiReview?.score));
  check('缺少必需资质时判定不通过', partial.data.aiReview.pass === false,
    JSON.stringify(partial.data.aiReview));
  check('列出缺失的资质', partial.data.aiReview.missing.includes('安全生产许可证'),
    JSON.stringify(partial.data.aiReview.missing));
  check('AI 审核给出结论条目', (partial.data.aiReview.findings || []).length > 0);

  // 补齐 → 应通过
  const full = await call('POST', `/api/listings/${listingId}/qualification`, {
    token: bidder.token,
    body: {
      items: [
        { name: '电力工程施工总承包一级', level: '一级', fileIds: ['f1'] },
        { name: '安全生产许可证', level: '不要求', fileIds: ['f2'] },
        { name: 'ISO9001 质量管理体系', level: '不要求', fileIds: ['f3'], note: '加分项' },
      ],
      note: '全部资质已提交',
    },
  });
  check('重新提交覆盖旧记录', full.status === 201);
  check('AI 初审通过', full.data.aiReview.pass === true, JSON.stringify(full.data.aiReview));
  check('评分 100', full.data.aiReview.score === 100, String(full.data.aiReview.score));
  check('检出加分资质', full.data.aiReview.optionalCount === 1, String(full.data.aiReview.optionalCount));

  const sameUserOnce = await call('GET', `/api/listings/${listingId}/qualification`, { token: bidder.token });
  check('同一用户只有一条提交', (sameUserOnce.data.qualification.submissions || []).length === 1,
    `实际 ${(sameUserOnce.data.qualification.submissions || []).length}`);

  // 仅有文字声明、没有文件 → 预警
  const noFile = await call('POST', `/api/listings/${listingId}/qualification`, {
    token: other.token,
    body: { items: [{ name: '电力工程施工总承包一级', level: '一级' }, { name: '安全生产许可证', level: '不要求' }] },
  });
  check('无文件时不算通过', noFile.data.aiReview.pass === false, JSON.stringify(noFile.data.aiReview.pass));
  check('提示未上传证明文件', (noFile.data.aiReview.noFiles || []).length === 2, JSON.stringify(noFile.data.aiReview.noFiles));

  const ownerSees = await call('GET', `/api/listings/${listingId}/qualification`, { token: owner.token });
  check('发布方看到 2 份提交', (ownerSees.data.qualification.submissions || []).length === 2,
    `实际 ${(ownerSees.data.qualification.submissions || []).length}`);

  const bidderId = bidder.user.id;
  const badReview = await call('POST', `/api/listings/${listingId}/qualification/review`, {
    token: other.token, body: { userId: bidderId, agree: true },
  });
  check('非发布方不能确认资质', badReview.status === 403, String(badReview.status));

  const approved = await call('POST', `/api/listings/${listingId}/qualification/review`, {
    token: owner.token, body: { userId: bidderId, agree: true, note: '资质齐全，符合要求' },
  });
  check('发布方确认通过', approved.status === 200, JSON.stringify(approved.json).slice(0, 200));
  check('提交状态变为 approved', approved.data.submission.status === 'approved', String(approved.data.submission.status));
  check('确认写入流程历史', (approved.data.listing.pipeline?.history || []).some((h) => h.kind === 'qualification'));

  const afterApprove = await call('GET', `/api/listings/${listingId}/qualification`, { token: bidder.token });
  check('已通过数量为 1', afterApprove.data.qualification.approvedCount === 1,
    String(afterApprove.data.qualification.approvedCount));
  check('能看到自己的提交状态', afterApprove.data.qualification.mine?.status === 'approved');

  const rejectOther = await call('POST', `/api/listings/${listingId}/qualification/review`, {
    token: owner.token, body: { userId: other.user.id, agree: false, note: '未上传任何证明文件' },
  });
  check('可以驳回', rejectOther.status === 200 && rejectOther.data.submission.status === 'rejected');
  check('驳回原因被记录', String(rejectOther.data.submission.decisionNote).includes('未上传'));

  console.log('\n=== 6. 阶段 3~7 推进 ===');
  const rest = ['group-meeting', 'invitation', 'brokerage', 'offline-meeting', 'contract'];
  for (const stage of rest) {
    const r = await call('POST', `/api/listings/${listingId}/pipeline`, {
      token: owner.token, form: jsonForm({ stage, note: `推进到 ${stage}` }),
    });
    check(`推进到 ${stage}`, r.status === 200 && r.data.listing.pipeline.stage === stage,
      JSON.stringify(r.json).slice(0, 150));
  }
  const finalPipe = await call('GET', `/api/listings/${listingId}/pipeline`, { token: owner.token });
  check('已走完全部 7 步', finalPipe.data.stages.filter((s) => s.done).length === 6,
    JSON.stringify(finalPipe.data.stages.map((s) => `${s.id}:${s.done ? 1 : 0}`)));
  check('当前为最后一步', finalPipe.data.current === 'contract', String(finalPipe.data.current));

  console.log('\n=== 7. 文书生成（邀请函 / 居间协议 / 合同） ===');
  const inv = await call('GET', `/api/listings/${listingId}/document/invitation`, { token: owner.token });
  check('邀生成邀请函', inv.status === 200 && inv.data.doc.kind === 'invitation', JSON.stringify(inv.json).slice(0, 200));
  check('邀请函含项目名称', inv.data.doc.subtitle.includes('东营'), inv.data.doc.subtitle);
  check('邀请函含项目编号', inv.data.doc.meta.some((m) => m.label === '项目编号' && m.value === listingId));
  check('邀请函含资质要求', JSON.stringify(inv.data.doc.sections).includes('电力工程施工总承包一级'));
  check('邀请函含商务条件', JSON.stringify(inv.data.doc.sections).includes('EPC 总承包'));
  check('邀请函有纯文本版', String(inv.data.doc.plain).includes('邀 请 函') || String(inv.data.doc.plain).includes('邀请函'));
  check('邀请函纯文本可复制到微信', String(inv.data.doc.plain).length > 300, `长度 ${String(inv.data.doc.plain).length}`);

  const inv2 = await call('GET', `/api/listings/${listingId}/document/invitation?to=%E6%9D%8E%E7%BB%8F%E7%90%86&date=2026-11-01%2014%3A00&place=%E5%B1%B1%E4%B8%9C%E7%9C%81%E4%B8%9C%E8%90%A5%E5%B8%82`,
    { token: owner.token });
  const inv2txt = JSON.stringify(inv2.data.doc);
  check('邀请函可带入收件人', inv2txt.includes('李经理'));
  check('邀请函可带入时间地点', inv2txt.includes('2026-11-01') && inv2txt.includes('东营市'));

  const br = await call('GET', `/api/listings/${listingId}/document/brokerage`, { token: owner.token });
  check('生成居间协议', br.status === 200 && br.data.doc.kind === 'brokerage');
  check('居间协议含居间费比例', JSON.stringify(br.data.doc).includes('合同额 2%'));
  check('居间协议含支付节点', JSON.stringify(br.data.doc).includes('合同签订后 7 日内'));
  check('居间协议声明为草案', String(br.data.doc.footer).includes('草案') || String(br.data.doc.title).includes('草案'));

  const ct = await call('GET', `/api/listings/${listingId}/document/contract`, { token: owner.token });
  check('生成合同要点', ct.status === 200 && ct.data.doc.kind === 'contract');
  check('合同含商务条款', JSON.stringify(ct.data.doc.sections).includes('预付款'));
  check('合同含资质清单', JSON.stringify(ct.data.doc.sections).includes('安全生产许可证'));
  check('合同声明不构成正式合同', String(ct.data.doc.footer).includes('不构成正式合同'));

  const badKind = await call('GET', `/api/listings/${listingId}/document/nonsense`, { token: owner.token });
  check('未知文书类型被拒绝', badKind.status === 400, String(badKind.status));
  const gone = await call('GET', '/api/listings/not-exist/document/invitation');
  check('不存在的项目返回 404', gone.status === 404, String(gone.status));

  console.log('\n=== 8. 边界 ===');
  const notProject = await call('POST', '/api/listings', {
    token: owner.token,
    form: jsonForm({ category: 'trade', type: 'procurement', text: '采购一批光伏组件，用于验证非项目类信息不能走资质审核流程。', durationDays: '30' }),
  });
  const qTrade = await call('POST', `/api/listings/${notProject.data.listing.id}/qualification`, {
    token: bidder.token, body: { items: [{ name: '营业执照', fileIds: ['f1'] }] },
  });
  check('非项目类不能提交资质', qTrade.status === 400, String(qTrade.status));

  const emptyItems = await call('POST', `/api/listings/${listingId}/qualification`, {
    token: bidder.token, body: { items: [] },
  });
  check('空资质被拒绝', emptyItems.status === 400, String(emptyItems.status));

  const ownerSubmit = await call('POST', `/api/listings/${listingId}/qualification`, {
    token: owner.token, body: { items: [{ name: '自评资质' }] },
  });
  check('发布方不能自己提交资质', ownerSubmit.status === 400, String(ownerSubmit.status));

  const noAuth = await call('POST', `/api/listings/${listingId}/qualification`, { body: { items: [{ name: 'x' }] } });
  check('未登录不能提交资质', noAuth.status === 401, String(noAuth.status));

  console.log('\n=== 9. 联系方式保护：发布后不对外公开 ===');
  const secret = { phone: '13800001111', wechat: 'zhang_boss_888', email: 'zhang@example.com' };
  const withContact = await call('POST', '/api/listings', {
    token: owner.token,
    form: jsonForm({
      category: 'project', type: 'equipment-procurement',
      text: '带联系方式的测试项目，用于验证信息发布后联系方式不会被对外泄露。',
      durationDays: '30',
      contactName: '张总', phone: secret.phone, wechat: secret.wechat, email: secret.email,
      hideContact: '0', // 故意传 0，验证平台强制隐藏、发布方无法关闭
    }),
  });
  const cid = withContact.data.listing.id;

  // 先正式发布，未登录访客才可访问（草稿对外是 403）
  const pub = await call('POST', `/api/listings/${cid}/publish`, { token: owner.token, body: { days: 30 } });
  check('测试项目已发布', pub.status === 200, JSON.stringify(pub.json).slice(0, 150));

  const anon = await call('GET', `/api/listings/${cid}`);
  check('未登录看不到联系方式', anon.data.listing.contact?.hidden === true, JSON.stringify(anon.data.listing.contact));
  check('contactVisible 为 false', anon.data.listing.contactVisible === false);
  check('公开响应不含手机号', !JSON.stringify(anon.data.listing).includes(secret.phone));
  check('公开响应不含微信号', !JSON.stringify(anon.data.listing).includes(secret.wechat));
  check('公开响应不含邮箱', !JSON.stringify(anon.data.listing).includes(secret.email));

  const otherView = await call('GET', `/api/listings/${cid}`, { token: other.token });
  check('其他登录用户也看不到', otherView.data.listing.contact?.hidden === true);
  check('其他用户响应不含手机号', !JSON.stringify(otherView.data.listing).includes(secret.phone));

  const ownerView2 = await call('GET', `/api/listings/${cid}`, { token: owner.token });
  check('发布方自己能看到', ownerView2.data.listing.contact?.phone === secret.phone,
    JSON.stringify(ownerView2.data.listing.contact));
  check('发布方 contactVisible 为 true', ownerView2.data.listing.contactVisible === true);

  const tryOpen = await call('PUT', `/api/listings/${cid}`, { token: owner.token, body: { hideContact: false } });
  check('编辑接口不能关闭保护', tryOpen.status === 200);
  const afterTry = await call('GET', `/api/listings/${cid}`, { token: other.token });
  check('发布方无法关闭联系方式保护', afterTry.data.listing.contact?.hidden === true,
    JSON.stringify(afterTry.data.listing.contact));

  const docked = await call('POST', `/api/listings/${cid}/dock`, { token: bidder.token, body: { note: '希望参与投标' } });
  check('发起项目对接', docked.status === 201, JSON.stringify(docked.json).slice(0, 150));
  const dockView = await call('GET', `/api/listings/${cid}`, { token: bidder.token });
  check('对接成为项目成员后可见联系方式', dockView.data.listing.contact?.phone === secret.phone,
    JSON.stringify(dockView.data.listing.contact));

  const stillHidden = await call('GET', `/api/listings/${cid}`, { token: other.token });
  check('未对接的人依旧看不到', stillHidden.data.listing.contact?.hidden === true);

  console.log('\n=== 10. 留言与回复 / 新增后续（文字 + 文件） ===');
  const cmt = await call('POST', `/api/listings/${cid}/comments`, {
    token: bidder.token, form: jsonForm({ content: '请问项目计划什么时候开工？', aiReply: '0' }),
  });
  check('可以发表留言', cmt.status === 201, JSON.stringify(cmt.json).slice(0, 180));
  const cmtId = cmt.data?.comment?.id;
  check('留言返回 id', Boolean(cmtId), String(cmtId));

  const reply = await call('POST', `/api/listings/${cid}/comments`, {
    token: owner.token, form: jsonForm({ content: '预计下个月开工，届时会在群里通知。', parentId: cmtId || '', aiReply: '0' }),
  });
  check('可以回复留言', reply.status === 201, JSON.stringify(reply.json).slice(0, 180));

  const cmtList = await call('GET', `/api/listings/${cid}/comments`);
  const cmtTotal = cmtList.data?.total ?? (cmtList.data?.tree || []).length;
  check('留言与回复都被记录', cmtTotal >= 1, `实际 ${cmtTotal}`);
  const firstTree = (cmtList.data?.tree || [])[0];
  check('回复挂在原留言下', (firstTree?.replies || []).length >= 1,
    JSON.stringify((cmtList.data?.tree || []).map((c) => (c.replies || []).length)));

  // 新增后续：文字 + 导入文件
  const fuFd = new FormData();
  fuFd.append('text', '已完成现场踏勘，附件是踏勘记录。');
  fuFd.append('file', new Blob([Buffer.from('现场踏勘记录：场地平整，道路可达。', 'utf8')], { type: 'text/plain' }), '踏勘记录.txt');
  const fu = await call('POST', `/api/listings/${cid}/follow-ups`, { token: owner.token, form: fuFd });
  check('新增后续（文字 + 文件）', fu.status === 201, JSON.stringify(fu.json).slice(0, 200));
  check('后续带文字内容', String(fu.data?.entry?.text || fu.data?.entry?.content || '').includes('踏勘'),
    JSON.stringify(fu.data?.entry).slice(0, 200));
  check('后续带文件', (fu.data?.entry?.fileIds || []).length >= 1 || (fu.data?.files || []).length >= 1,
    JSON.stringify({ ids: fu.data?.entry?.fileIds, files: (fu.data?.files || []).length }));

  const fd = await call('GET', `/api/listings/${cid}`, { token: owner.token });
  check('详情页返回后续记录', (fd.data.listing.followUps || []).length >= 1,
    `实际 ${(fd.data.listing.followUps || []).length}`);

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

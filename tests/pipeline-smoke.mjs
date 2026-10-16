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

  console.log('\n=== 1b. 悬赏分类 ===');
  check('分类里含悬赏板块', (tax.data.categories || []).some((c) => c.id === 'bounty'),
    JSON.stringify((tax.data.categories || []).map((c) => c.id)));
  check('悬赏类型可选', (tax.data.bountyTypes || []).length >= 6, `实际 ${(tax.data.bountyTypes || []).length}`);
  check('悬赏结算方式可选', (tax.data.bountySettleModes || []).length >= 3);
  check('悬赏参与资格可选', (tax.data.bountyEligibility || []).length >= 3);

  const bountyForm = {
    category: 'bounty', type: 'tech',
    title: '求解：储能集装箱低温环境下的热管理方案',
    text: '需要在 -30℃ 环境下保证电池舱温度不低于 5℃，求可行方案与设备选型建议。',
    durationDays: '30',
    bountyType: '技术攻关', reward: '50000', rewardUnit: '元',
    settleMode: '方案验收后付', deadline: '2026-12-31',
    deliverable: '提交完整热管理方案 + 设备清单 + 预算', eligibility: '需有同类业绩',
    winnerCount: '1',
    publish: '1',
  };
  const bCreate = await call('POST', '/api/listings', { token: owner.token, form: jsonForm(bountyForm) });
  check('可发布悬赏', bCreate.status === 201, JSON.stringify(bCreate.json).slice(0, 200));
  const bId = bCreate.data.listing.id;
  const bView = await call('GET', `/api/listings/${bId}`, { token: owner.token });
  const b = bView.data?.listing?.bounty || {};
  check('悬赏分类保存正确', bView.data?.listing?.category === 'bounty');
  check('赏金金额保存', b.reward === '50000' && b.rewardUnit === '元', JSON.stringify(b));
  check('悬赏类型保存', b.bountyType === '技术攻关', String(b.bountyType));
  check('结算方式保存', b.settleMode === '方案验收后付', String(b.settleMode));
  check('交付要求保存', String(b.deliverable).includes('热管理方案'), String(b.deliverable));
  check('参与资格保存', b.eligibility === '需有同类业绩', String(b.eligibility));
  check('截止日期保存', b.deadline === '2026-12-31', String(b.deadline));
  check('中赏人数保存', b.winnerCount === '1', String(b.winnerCount));
  check('悬赏不写入项目/贸易字段', !bView.data?.listing?.project && !bView.data?.listing?.trade);

  const bList = await call('GET', '/api/listings?category=bounty&pageSize=20');
  check('可按悬赏分类筛选', (bList.data.items || []).some((x) => x.id === bId),
    `列表 ${(bList.data.items || []).length} 条`);

  await call('PUT', `/api/listings/${bId}`, { token: owner.token, body: { bounty: { settleMode: '成交即付' } } });
  const bAfter = await call('GET', `/api/listings/${bId}`, { token: owner.token });
  check('编辑悬赏不会冲掉赏金', bAfter.data?.listing?.bounty?.reward === '50000',
    JSON.stringify(bAfter.data?.listing?.bounty));
  check('编辑后结算方式已更新', bAfter.data?.listing?.bounty?.settleMode === '成交即付',
    String(bAfter.data?.listing?.bounty?.settleMode));

  // 悬赏配图：第一张图应自动成为封面
  const png = Buffer.from(
    '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c489'
    + '0000000a49444154789c63000100000500010d0a2db40000000049454e44ae426082',
    'hex',
  );
  const imgFd = new FormData();
  imgFd.append('category', 'bounty');
  imgFd.append('type', 'solution');
  imgFd.append('title', '悬赏配图测试：征集光伏电站运维方案');
  imgFd.append('text', '需要一套降低运维成本的方案，详见附图。');
  imgFd.append('durationDays', '30');
  imgFd.append('bountyType', '方案征集');
  imgFd.append('reward', '20000');
  imgFd.append('publish', '1');
  imgFd.append('file', new Blob([png], { type: 'image/png' }), '悬赏图.png');
  const bImg = await call('POST', '/api/listings', { token: owner.token, form: imgFd });
  check('悬赏可附带图片', bImg.status === 201, JSON.stringify(bImg.json).slice(0, 200));
  const bImgView = await call('GET', `/api/listings/${bImg.data.listing.id}`, { token: owner.token });
  const bFiles = bImgView.data?.listing?.fileList || [];
  check('悬赏图片已关联', bFiles.length === 1, `实际 ${bFiles.length}`);
  check('悬赏图片识别为 image', bFiles[0]?.kind === 'image', String(bFiles[0]?.kind));
  check('悬赏配图自动成为封面', bImgView.data?.listing?.coverId === bFiles[0]?.id,
    JSON.stringify({ coverId: bImgView.data?.listing?.coverId, fileId: bFiles[0]?.id }));
  check('封面文件带可访问地址', String(bFiles[0]?.url || '').startsWith('/files/'), String(bFiles[0]?.url));
  const imgUrl = bImgView.data.listing.fileList[0].url;
  const imgRes = await fetch(BASE + imgUrl);
  check('悬赏图片可直接访问', imgRes.status === 200, String(imgRes.status));

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
      text: '山东东营 200MW 渔光互补光伏电站 EPC 总承包项目。项目位于山东省东营市广饶县，利用现有水库水面建设光伏电站，装机容量 200MW，采用渔光互补模式。'
        + '项目已完成备案，土地手续齐全，总投资约 8.6 亿元，计划工期 14 个月，预计年发电量 2.4 亿千瓦时。'
        + '招标范围包括光伏场区、升压站、集电线路、送出工程的设计、设备采购、施工安装、调试并网及质保期服务。'
        + '需要承接方具备电力工程施工总承包一级资质、承装（修、试）电力设施许可证、安全生产许可证，并提供同类项目业绩证明。'
        + '商务条件详见下方商务条件栏，欢迎符合条件的总包单位与我们联系对接。',
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

  console.log('\n=== 11. 分享后需登录才能查看 / AI 分析仅发布方可见 ===');
  // 该信息此前是草稿，先发布，访客才可访问
  const pubMain = await call('POST', `/api/listings/${listingId}/publish`, { token: owner.token, body: { days: 30 } });
  check('主测试项目已发布', pubMain.status === 200, JSON.stringify(pubMain.json).slice(0, 120));

  // 用项目类信息（有商务条件、资质要求、AI 分析）来验证
  const guest = await call('GET', `/api/listings/${listingId}`);
  check('访客被标记为需登录', guest.data.listing.gated === true && guest.data.listing.loginRequired === true,
    JSON.stringify({ gated: guest.data.listing.gated }));
  check('访客仍能看到标题', Boolean(guest.data.listing.title), String(guest.data.listing.title));
  check('访客只拿到摘要级正文', String(guest.data.listing.text || '').length <= 80,
    `长度 ${String(guest.data.listing.text || '').length}`);
  check('访客拿不到附件', (guest.data.listing.fileList || []).length === 0);
  check('访客拿不到商务条件', Object.keys(guest.data.listing.project?.businessTerms || {}).length === 0,
    JSON.stringify(Object.keys(guest.data.listing.project?.businessTerms || {})));
  check('访客拿不到资质要求', (guest.data.listing.project?.qualifications || []).length === 0);
  check('访客拿不到 AI 分析', guest.data.listing.ai === null);
  check('访客拿不到后续跟进', (guest.data.listing.followUps || []).length === 0);
  check('访客拿不到联系方式', guest.data.listing.contact?.hidden === true);

  const signedOther = await call('GET', `/api/listings/${listingId}`, { token: other.token });
  check('登录后不再要求登录', signedOther.data.listing.gated === false);
  check('登录后能看到完整正文', String(signedOther.data.listing.text || '').length > 80,
    `长度 ${String(signedOther.data.listing.text || '').length}`);
  check('登录后能看到商务条件', Object.keys(signedOther.data.listing.project?.businessTerms || {}).length >= 10,
    `实际 ${Object.keys(signedOther.data.listing.project?.businessTerms || {}).length}`);
  check('登录后能看到资质要求', (signedOther.data.listing.project?.qualifications || []).length === 3,
    `实际 ${(signedOther.data.listing.project?.qualifications || []).length}`);

  check('非发布方 aiVisible 为 false', signedOther.data.listing.aiVisible === false);
  check('非发布方拿不到 AI 分析', !signedOther.data.listing.ai?.analysis,
    JSON.stringify(signedOther.data.listing.ai).slice(0, 200));
  check('非发布方拿不到可靠性评分', !signedOther.data.listing.ai?.reliability);
  check('非发布方仍能看到 AI 生成的标题', Boolean(signedOther.data.listing.ai?.titles?.main),
    JSON.stringify(signedOther.data.listing.ai?.titles));

  const ownerSelf = await call('GET', `/api/listings/${listingId}`, { token: owner.token });
  check('发布方 aiVisible 为 true', ownerSelf.data.listing.aiVisible === true);
  check('发布方能看到 AI 分析', Boolean(ownerSelf.data.listing.ai?.analysis),
    JSON.stringify(Object.keys(ownerSelf.data.listing.ai || {})));
  check('发布方能看到 AI 可靠性评分', Boolean(ownerSelf.data.listing.ai?.reliability));
  check('发布方不会被门禁', ownerSelf.data.listing.gated === false);

  console.log('\n=== 12. 对接后可继续上传资质（对接 → 上传 → AI审核 → 确认） ===');
  const dockProject = await call('POST', '/api/listings', {
    token: owner.token,
    form: jsonForm({
      category: 'project', type: 'epc',
      text: '对接后走资质流程的测试项目，用于验证对接与资质审核可以串联。',
      durationDays: '30', needQualification: '1',
      qualifications: JSON.stringify([{ name: '市政公用工程施工总承包一级', required: true }]),
    }),
  });
  const dpId = dockProject.data.listing.id;
  await call('POST', `/api/listings/${dpId}/publish`, { token: owner.token, body: { days: 30 } });

  const docked2 = await call('POST', `/api/listings/${dpId}/dock`, { token: bidder.token, body: { note: '希望参与' } });
  check('对接成功并建立群', docked2.status === 201 && Boolean(docked2.data?.room?.id), JSON.stringify(docked2.json).slice(0, 150));

  const qs = await call('GET', `/api/listings/${dpId}/qualification`, { token: bidder.token });
  check('对接后可提交资质', qs.data.qualification.canSubmit === true);
  check('对接后成为项目成员', docked2.data.listing?.memberIds?.includes(bidder.user.id) === true,
    JSON.stringify(docked2.data.listing?.memberIds));

  const sub2 = await call('POST', `/api/listings/${dpId}/qualification`, {
    token: bidder.token,
    body: { items: [{ name: '市政公用工程施工总承包一级', fileIds: ['f1'] }], note: '已上传证书' },
  });
  check('对接后提交资质成功', sub2.status === 201);
  check('AI 初审通过', sub2.data.aiReview.pass === true, JSON.stringify(sub2.data.aiReview));

  const appr2 = await call('POST', `/api/listings/${dpId}/qualification/review`, {
    token: owner.token, body: { userId: bidder.user.id, agree: true, note: '资质符合' },
  });
  check('发布方确认通过', appr2.status === 200 && appr2.data.submission.status === 'approved');

  console.log('\n=== 13. 发布后可查看上传的项目文件 ===');
  const fileFd = new FormData();
  fileFd.append('file', new Blob([Buffer.from('项目技术方案与报价说明。\n包含设备清单与施工组织设计。', 'utf8')], { type: 'text/plain' }), '项目资料.txt');
  const upFile = await fetch(`${BASE}/api/files`, { method: 'POST', headers: { Authorization: `Bearer ${owner.token}` }, body: fileFd });
  const upJson = await upFile.json();
  check('上传文件成功', upFile.status < 300, JSON.stringify(upJson).slice(0, 200));
  const newFileId = upJson.data?.files?.[0]?.id;
  const newFileUrl = upJson.data?.files?.[0]?.url;
  check('返回文件 id 与下载地址', Boolean(newFileId && newFileUrl), JSON.stringify({ newFileId, newFileUrl }));

  const withFile = await call('POST', '/api/listings', {
    token: owner.token,
    form: jsonForm({
      category: 'project', type: 'epc',
      text: '带项目文件的测试项目，用于验证信息发布后，登录用户可以查看并下载发布方上传的项目资料文件。',
      durationDays: '30', title: '带项目文件的测试项目',
      fileIds: JSON.stringify([newFileId]),
    }),
  });
  const fid2 = withFile.data.listing.id;
  await call('POST', `/api/listings/${fid2}/publish`, { token: owner.token, body: { days: 30 } });

  const ownerFiles = await call('GET', `/api/listings/${fid2}`, { token: owner.token });
  check('发布方能看到项目文件', (ownerFiles.data.listing.fileList || []).length === 1,
    `实际 ${(ownerFiles.data.listing.fileList || []).length}`);
  check('文件带名称与下载地址', Boolean(ownerFiles.data.listing.fileList[0]?.name && ownerFiles.data.listing.fileList[0]?.url),
    JSON.stringify(ownerFiles.data.listing.fileList[0]));

  const viewerFiles = await call('GET', `/api/listings/${fid2}`, { token: bidder.token });
  check('其他登录用户也能看到项目文件', (viewerFiles.data.listing.fileList || []).length === 1,
    `实际 ${(viewerFiles.data.listing.fileList || []).length}`);

  const guestFiles = await call('GET', `/api/listings/${fid2}`);
  check('未登录看不到项目文件', (guestFiles.data.listing.fileList || []).length === 0);
  check('未登录标记为需登录', guestFiles.data.listing.gated === true);

  const dl = await fetch(BASE + newFileUrl);
  check('文件可直接下载', dl.status === 200, String(dl.status));
  const dlText = await dl.text();
  check('下载内容与上传一致', dlText.includes('技术方案'), dlText.slice(0, 40));

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

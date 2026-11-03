/**
 * 主理人（城市 / 行业 / 渠道）
 *
 * 为什么单独一套数据：
 *   服务商是「能干活的公司」（EPC、设计、施工…），
 *   主理人是「帮平台在一个城市/一个行业/一条渠道里张罗事的人」。
 *   两件事的评价标准、权益、审核方式都不一样，混在一张表会互相干扰。
 *
 * 状态：pending → approved / rejected
 *   pending   已提交，等管理员看
 *   approved  通过，出现在主理人列表
 *   rejected  未通过（reason 里写原因）
 */

import db, { newId } from '../store/db.js';

const KINDS = {
  city: { id: 'city', name: '城市主理人', icon: '🏙️' },
  industry: { id: 'industry', name: '行业主理人', icon: '🏭' },
  channel: { id: 'channel', name: '渠道主理人', icon: '🔗' },
};

const col = () => db.collection('stewards');

function clean(v, n = 80) {
  return String(v == null ? '' : v).replace(/[<>]/g, '').trim().slice(0, n);
}

export function listStewards({ kind = '', city = '', status = 'approved' } = {}) {
  let rows = col().all().filter((s) => (status ? s.status === status : true));
  if (kind && KINDS[kind]) rows = rows.filter((s) => s.kind === kind);
  if (city) {
    const kw = city.toLowerCase();
    rows = rows.filter((s) => String(s.city || '').toLowerCase().includes(kw));
  }
  rows.sort((a, b) => String(b.approvedAt || b.createdAt).localeCompare(String(a.approvedAt || a.createdAt)));
  return rows;
}

export function myApplication(userId) {
  const rows = col()
    .where('userId', userId)
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  return rows;
}

export function apply(user, body = {}) {
  const kind = KINDS[String(body.kind || '')] ? String(body.kind) : '';
  if (!kind) {
    const e = new Error('请选择主理人类型（城市 / 行业 / 渠道）');
    e.status = 400;
    throw e;
  }
  const name = clean(body.name || user.nickname, 40);
  if (!name) {
    const e = new Error('请填写联系人姓名');
    e.status = 400;
    throw e;
  }
  const phone = String(body.phone || '').replace(/[^\d+]/g, '').slice(0, 20);
  const wechat = clean(body.wechat, 40);
  if (!phone && !wechat) {
    const e = new Error('请留一个联系方式（手机号或微信）');
    e.status = 400;
    throw e;
  }

  // 同一类型只允许一条进行中的申请，避免刷
  const exist = col().findOne((s) => s.userId === user.id && s.kind === kind && s.status === 'pending');
  if (exist) {
    const e = new Error('这类主理人你已经提交过申请，正在审核中');
    e.status = 409;
    throw e;
  }

  const rec = col().insert({
    id: newId('st'),
    userId: user.id,
    kind,
    kindName: KINDS[kind].name,
    name,
    phone,
    wechat,
    // 按类型收不同的定位信息
    city: kind === 'city' ? clean(body.city, 40) : '',
    province: kind === 'city' ? clean(body.province, 40) : '',
    industry: kind === 'industry' ? clean(body.industry, 40) : '',
    channel: kind === 'channel' ? clean(body.channel, 60) : '',
    resources: clean(body.resources, 800),
    intro: clean(body.intro, 800),
    status: 'pending',
    reason: '',
    createdAt: new Date().toISOString(),
  });

  if (kind === 'city' && !rec.city) {
    col().update(rec.id, { status: 'rejected', reason: '城市主理人必须填写城市' });
    const e = new Error('城市主理人必须填写城市');
    e.status = 400;
    throw e;
  }
  if (kind === 'industry' && !rec.industry) {
    col().update(rec.id, { status: 'rejected', reason: '行业主理人必须填写行业' });
    const e = new Error('行业主理人必须填写行业');
    e.status = 400;
    throw e;
  }

  return rec;
}

export function review(admin, id, { status = 'approved', reason = '' } = {}) {
  const rec = col().get(id);
  if (!rec) {
    const e = new Error('申请不存在');
    e.status = 404;
    throw e;
  }
  const next = status === 'approved' ? 'approved' : status === 'rejected' ? 'rejected' : 'pending';
  return col().update(id, {
    status: next,
    reason: clean(reason, 200),
    reviewedAt: new Date().toISOString(),
    reviewerId: admin.id,
    approvedAt: next === 'approved' ? new Date().toISOString() : '',
  });
}

export const STEWARD_KINDS = Object.values(KINDS);

export default { listStewards, myApplication, apply, review, STEWARD_KINDS };

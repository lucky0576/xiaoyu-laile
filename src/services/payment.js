/**
 * 小鱼来了 — 收款配置
 *
 * 会员开通走「人工收款」：展示微信 / 支付宝收款码 + 银行卡号，
 * 用户转账后点「我已付款」提交订单，管理员在后台确认后激活。
 *
 * 配置存在 settings 集合的 payment 键里，可在管理后台改。
 */

import db from '../store/db.js';

const settings = () => db.collection('settings');

const DEFAULTS = {
  wechatQr: '/static/pay/wechat.jpg',
  wechatName: 'Lucas 小鱼来了（*云）',
  alipayQr: '/static/pay/alipay.jpg',
  alipayName: '云',
  bankName: '',
  bankAccount: '',
  bankHolder: '',
  note: '转账后请点「我已付款」提交订单，管理员确认到账后立即开通。',
  enabled: true,
};

/** 读取收款配置（缺失字段用默认值补齐） */
export function getPaymentConfig() {
  const rec = settings().findOne((s) => s && s.key === 'payment');
  const val = rec && typeof rec.value === 'object' ? rec.value : {};
  return { ...DEFAULTS, ...val };
}

/** 保存收款配置（管理员） */
export function setPaymentConfig(patch = {}) {
  const next = { ...getPaymentConfig() };
  for (const k of Object.keys(DEFAULTS)) {
    if (patch[k] === undefined) continue;
    if (k === 'enabled') next[k] = Boolean(patch[k]);
    else next[k] = String(patch[k] || '').slice(0, 300);
  }
  const rec = settings().findOne((s) => s && s.key === 'payment');
  if (rec) settings().update(rec.id, { value: next });
  else settings().insert({ id: db.newId('st'), key: 'payment', value: next, createdAt: new Date().toISOString() });
  return next;
}

/** 给前端用的公开版（银行卡信息只给登录用户看，这里统一返回） */
export function publicPaymentConfig() {
  const c = getPaymentConfig();
  return {
    enabled: c.enabled,
    wechatQr: c.wechatQr,
    wechatName: c.wechatName,
    alipayQr: c.alipayQr,
    alipayName: c.alipayName,
    bankName: c.bankName,
    bankAccount: c.bankAccount,
    bankHolder: c.bankHolder,
    note: c.note,
  };
}

export default { getPaymentConfig, setPaymentConfig, publicPaymentConfig, DEFAULTS };

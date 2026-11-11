/**
 * 招投标邮箱提醒
 *
 * 用户设置后，在「投标截止前 3 天」发一封提醒邮件。
 * - 存储：data/collections/bid_reminders.json
 * - 发送：复用 services/mail.js（未配置 SMTP 时进入演示模式，写 data/outbox.log）
 * - 定时：server.js 中每 10 分钟扫描一次到期的提醒
 */

import db, { newId } from '../store/db.js';
import { config } from '../config.js';
import { httpError } from '../http/app.js';
import { sendMail, mailConfigured } from './mail.js';

const cols = () => db.collection('bid_reminders');
const listings = () => db.collection('listings');

const REMIND_BEFORE_MS = 3 * 86400000; // 截止前 3 天
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeEmail(v) {
  return String(v || '').trim().toLowerCase().slice(0, 120);
}

function publicReminder(r) {
  if (!r) return null;
  return {
    id: r.id,
    listingId: r.listingId,
    email: r.email,
    remindAt: r.remindAt,
    deadline: r.deadline,
    status: r.status,
    createdAt: r.createdAt,
    sentAt: r.sentAt || '',
  };
}

/** 读取一条招投标的截止时间 */
function biddingDeadline(listing) {
  if (!listing || listing.category !== 'bidding') return null;
  const raw = listing.bidding?.bidDeadline;
  if (!raw) return null;
  const d = new Date(String(raw).replace(' ', 'T'));
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

export function listReminder({ listingId, email }) {
  const e = normalizeEmail(email);
  if (!e) return null;
  const hit = cols().findOne(
    (r) => r.listingId === listingId && r.email === e && r.status === 'pending',
  );
  return publicReminder(hit);
}

export function createReminder({ user, listingId, email }) {
  const listing = listings().get(listingId);
  if (!listing) throw httpError(404, '信息不存在', 'not_found');
  if (listing.category !== 'bidding') {
    throw httpError(400, '只有招投标信息支持截止提醒', 'not_bidding');
  }
  const deadline = biddingDeadline(listing);
  if (!deadline) throw httpError(400, '该公告没有投标截止时间，无法设置提醒', 'no_deadline');
  if (deadline.getTime() <= Date.now()) {
    throw httpError(400, '该公告已过投标截止时间，无法设置提醒', 'expired');
  }
  const to = normalizeEmail(email || user?.email);
  if (!to || !EMAIL_RE.test(to)) throw httpError(400, '请填写正确的邮箱地址', 'bad_email');

  const now = Date.now();
  // 已进入「截止前 3 天」窗口的，1 分钟后发送；否则按截止前 3 天发送
  const remindAtMs = Math.max(deadline.getTime() - REMIND_BEFORE_MS, now + 60_000);

  const existing = cols().findOne(
    (r) => r.listingId === listingId && r.email === to && r.status === 'pending',
  );
  if (existing) {
    const updated = cols().update(existing.id, {
      remindAt: new Date(remindAtMs).toISOString(),
      deadline: deadline.toISOString(),
      title: listing.title || '',
      userId: user?.id || '',
      updatedAt: new Date().toISOString(),
    });
    return publicReminder(updated);
  }

  const rec = {
    id: newId('br'),
    listingId,
    listingTitle: listing.title || '',
    email: to,
    userId: user?.id || '',
    deadline: deadline.toISOString(),
    remindAt: new Date(remindAtMs).toISOString(),
    status: 'pending', // pending | sent | failed | cancelled
    createdAt: new Date().toISOString(),
    sentAt: '',
    error: '',
    demo: false,
  };
  cols().insert(rec);
  console.log(`[bid-reminder] 新增 ${listingId} -> ${to} @ ${rec.remindAt}`);
  return publicReminder(rec);
}

export function cancelReminder({ user, listingId, email }) {
  const to = normalizeEmail(email || user?.email);
  if (!to) throw httpError(400, '缺少邮箱地址', 'bad_email');
  const hit = cols().findOne(
    (r) => r.listingId === listingId && r.email === to && r.status === 'pending',
  );
  if (!hit) throw httpError(404, '没有找到可取消的提醒', 'not_found');
  cols().update(hit.id, { status: 'cancelled', cancelledAt: new Date().toISOString() });
  return { ok: true };
}

function fmtTime(iso) {
  try {
    const d = new Date(iso);
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(
      d.getMinutes(),
    )}`;
  } catch {
    return iso;
  }
}

function buildMail(rec, listing) {
  const base = config.publicBaseUrl || 'https://xiaoyulaile.online';
  const url = `${base}/#/detail/${rec.listingId}`;
  const bd = listing?.bidding || {};
  const title = listing?.title || rec.listingTitle || '招投标信息';
  const lines = [
    `您设置的招投标截止提醒：${title}`,
    '',
    bd.tenderer ? `招标人：${bd.tenderer}` : '',
    bd.budget ? `预算金额：${bd.budget}` : '',
    `投标截止：${fmtTime(rec.deadline)}（还有 3 天）`,
    bd.place ? `开标地点：${bd.place}` : '',
    '',
    `查看详情：${url}`,
    '',
    '请检查投标文件、保证金与资质材料，避免错过截止时间。',
    '—— 小鱼来了 · 产业信息与内容平台',
  ].filter((x) => x !== '');
  return {
    subject: `【小鱼来了】投标截止提醒：${String(title).slice(0, 40)}`,
    text: lines.join('\n'),
    html: `<div style="font-family:system-ui,-apple-system,'PingFang SC',sans-serif;max-width:560px;margin:0 auto;padding:24px">
      <h2 style="color:#0b74ff;margin:0 0 12px">投标截止提醒</h2>
      <p style="font-size:16px;font-weight:700;margin:0 0 12px">${String(title)}</p>
      <table style="border-collapse:collapse;font-size:14px;color:#333">
        ${bd.tenderer ? `<tr><td style="padding:4px 12px 4px 0;color:#888">招标人</td><td>${bd.tenderer}</td></tr>` : ''}
        ${bd.budget ? `<tr><td style="padding:4px 12px 4px 0;color:#888">预算金额</td><td>${bd.budget}</td></tr>` : ''}
        <tr><td style="padding:4px 12px 4px 0;color:#888">投标截止</td><td><b>${fmtTime(rec.deadline)}</b></td></tr>
        ${bd.place ? `<tr><td style="padding:4px 12px 4px 0;color:#888">开标地点</td><td>${bd.place}</td></tr>` : ''}
      </table>
      <p style="color:#666;font-size:13px">请检查投标文件、保证金与资质材料，避免错过截止时间。</p>
      <p style="margin:20px 0"><a href="${url}" style="background:#0b74ff;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none">查看公告详情</a></p>
      <p style="color:#999;font-size:12px">小鱼来了 · 产业信息与内容平台</p>
    </div>`,
  };
}

/** 定时任务：发送到期的提醒邮件 */
export async function sendDueBidReminders() {
  const now = new Date().toISOString();
  const due = cols().find((r) => r.status === 'pending' && String(r.remindAt || '') <= now);
  if (!due.length) return { sent: 0, failed: 0 };
  let sent = 0;
  let failed = 0;
  for (const rec of due) {
    try {
      const listing = listings().get(rec.listingId);
      const mail = buildMail(rec, listing);
      const result = await sendMail({ to: rec.email, ...mail });
      cols().update(rec.id, {
        status: result?.mode === 'demo' ? 'sent' : 'sent',
        sentAt: new Date().toISOString(),
        demo: result?.mode === 'demo',
        error: '',
      });
      sent += 1;
      if (result?.mode === 'demo') {
        console.log(`[bid-reminder] SMTP 未配置，提醒邮件写入 outbox：${rec.email}`);
      }
    } catch (err) {
      failed += 1;
      cols().update(rec.id, {
        status: 'failed',
        error: String(err.message || err).slice(0, 300),
      });
      console.warn('[bid-reminder] 发送失败:', rec.email, err.message);
    }
  }
  return { sent, failed };
}

export default {
  listReminder,
  createReminder,
  cancelReminder,
  sendDueBidReminders,
  normalizeEmail,
  mailConfigured,
};

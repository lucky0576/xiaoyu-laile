/**
 * 邮件服务（零依赖 SMTP 客户端）
 *
 * 支持 465 隐式 TLS 与 587/25 STARTTLS，AUTH LOGIN。
 * 未配置 SMTP 时：邮件内容打印到控制台（演示模式），
 * 并把邮件写入 data/outbox.log，方便本地验证注册/通知流程。
 */
import tls from 'node:tls';
import net from 'node:net';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { config, DATA_DIR } from '../config.js';
import { httpError } from '../http/app.js';

const OUTBOX = path.join(DATA_DIR, 'outbox.log');

export function mailConfigured() {
  return Boolean(config.smtp.host && config.smtp.user && config.smtp.pass);
}

class Smtp {
  constructor() {
    this.socket = null;
    this.buffer = '';
    this.waiters = [];
  }

  connect() {
    return new Promise((resolve, reject) => {
      const { host, port, secure } = config.smtp;
      const onError = (err) => reject(err);
      const socket = secure
        ? tls.connect({ host, port, servername: host }, () => resolve())
        : net.connect({ host, port }, () => resolve());
      socket.setTimeout(20000, () => socket.destroy(new Error('SMTP 超时')));
      socket.once('error', onError);
      socket.on('data', (chunk) => {
        this.buffer += chunk.toString('binary');
        this.drain();
      });
      this.socket = socket;
    });
  }

  drain() {
    while (this.waiters.length) {
      const w = this.waiters[0];
      const idx = this.buffer.indexOf('\r\n');
      if (idx === -1) return;
      // 多行响应：直到出现 "250 " 形式的最后一行
      const lines = this.buffer.split('\r\n').filter(Boolean);
      const last = lines[lines.length - 1] || '';
      if (!/^\d{3} /.test(last)) return;
      this.waiters.shift();
      const consumed = this.buffer.slice(0, this.buffer.lastIndexOf('\r\n') + 2);
      this.buffer = this.buffer.slice(this.buffer.indexOf(last) + last.length + 2);
      w.resolve(consumed);
    }
  }

  read() {
    return new Promise((resolve, reject) => {
      this.waiters.push({ resolve, reject });
      this.drain();
      const t = setTimeout(() => reject(new Error('SMTP 响应超时')), 20000);
      const orig = resolve;
      this.waiters[this.waiters.length - 1].resolve = (v) => {
        clearTimeout(t);
        orig(v);
      };
    });
  }

  async cmd(line, expect = /^[23]/) {
    this.socket.write(line + '\r\n');
    const resp = await this.read();
    if (!expect.test(resp)) throw new Error(`SMTP 错误响应: ${resp.trim().slice(0, 200)}`);
    return resp;
  }

  close() {
    try {
      this.socket.write('QUIT\r\n');
      this.socket.end();
    } catch {
      /* ignore */
    }
  }
}

function encodeHeader(value) {
  // 非 ASCII 头按 RFC 2047 编码
  if (/^[\x20-\x7e]*$/.test(value)) return value;
  return `=?UTF-8?B?${Buffer.from(value, 'utf8').toString('base64')}?=`;
}

function buildMime({ from, to, subject, text, html, attachments = [] }) {
  const boundary = `----xyl${crypto.randomBytes(8).toString('hex')}`;
  const lines = [];
  lines.push(`From: ${from}`);
  lines.push(`To: ${to}`);
  lines.push(`Subject: ${encodeHeader(subject)}`);
  lines.push('MIME-Version: 1.0');
  lines.push(`Date: ${new Date().toUTCString()}`);
  lines.push(`Message-ID: <${crypto.randomUUID()}@xiaoyulailai>`);

  if (!attachments.length) {
    lines.push(`Content-Type: ${html ? 'text/html' : 'text/plain'}; charset=UTF-8`);
    lines.push('Content-Transfer-Encoding: base64');
    lines.push('');
    lines.push(Buffer.from(html || text, 'utf8').toString('base64').replace(/(.{76})/g, '$1\r\n'));
    return lines.join('\r\n');
  }

  lines.push(`Content-Type: multipart/mixed; boundary="${boundary}"`);
  lines.push('');
  lines.push(`--${boundary}`);
  lines.push(`Content-Type: ${html ? 'text/html' : 'text/plain'}; charset=UTF-8`);
  lines.push('Content-Transfer-Encoding: base64');
  lines.push('');
  lines.push(Buffer.from(html || text, 'utf8').toString('base64').replace(/(.{76})/g, '$1\r\n'));
  for (const att of attachments) {
    lines.push(`--${boundary}`);
    lines.push(`Content-Type: ${att.mime || 'application/octet-stream'}; name="${encodeHeader(att.filename)}"`);
    lines.push('Content-Transfer-Encoding: base64');
    lines.push(`Content-Disposition: attachment; filename="${encodeHeader(att.filename)}"`);
    lines.push('');
    lines.push(Buffer.from(att.content).toString('base64').replace(/(.{76})/g, '$1\r\n'));
  }
  lines.push(`--${boundary}--`);
  return lines.join('\r\n');
}

function dotStuff(body) {
  return body.replace(/\r?\n/g, '\r\n').replace(/^\./gm, '..');
}

export async function sendMail({ to, subject, text = '', html = '', attachments = [] }) {
  if (!mailConfigured()) {
    const entry = `[${new Date().toISOString()}] TO=${to}\nSUBJECT=${subject}\n${text || html}\n${'-'.repeat(60)}\n`;
    try {
      fs.appendFileSync(OUTBOX, entry, 'utf8');
    } catch {
      /* ignore */
    }
    console.log(`\n[mail:demo] → ${to} | ${subject}\n${(text || html).slice(0, 400)}\n`);
    return { ok: true, mode: 'demo', outbox: OUTBOX };
  }

  const smtp = new Smtp();
  try {
    await smtp.connect();
    await smtp.read(); // 220 banner
    await smtp.cmd(`EHLO xiaoyulailai.local`);

    if (!config.smtp.secure) {
      const r = await smtp.cmd('STARTTLS', /^220/);
      void r;
      // 升级为 TLS
      await new Promise((resolve, reject) => {
        const upgraded = tls.connect({ socket: smtp.socket, servername: config.smtp.host }, () => resolve());
        upgraded.once('error', reject);
        smtp.socket = upgraded;
        smtp.buffer = '';
      });
      await smtp.cmd('EHLO xiaoyulailai.local');
    }

    await smtp.cmd('AUTH LOGIN', /^334/);
    await smtp.cmd(Buffer.from(config.smtp.user, 'utf8').toString('base64'), /^334/);
    await smtp.cmd(Buffer.from(config.smtp.pass, 'utf8').toString('base64'), /^235/);

    const from = config.smtp.from || config.smtp.user;
    await smtp.cmd(`MAIL FROM:<${from}>`);
    await smtp.cmd(`RCPT TO:<${to}>`);
    await smtp.cmd('DATA', /^354/);

    const mime = buildMime({ from, to, subject, text, html, attachments });
    smtp.socket.write(dotStuff(mime) + '\r\n.\r\n');
    const resp = await smtp.read();
    if (!/^2/.test(resp)) throw new Error(`SMTP 发送失败: ${resp.trim()}`);

    smtp.close();
    return { ok: true, mode: 'smtp' };
  } catch (err) {
    smtp.close();
    throw httpError(502, `邮件发送失败：${err.message}`, 'mail_failed');
  }
}

export function mailTemplates() {
  return {
    otp: (code, purpose) => ({
      subject: `【${config.appName}】${purpose || '登录'}验证码：${code}`,
      text: `您的验证码是 ${code}，5 分钟内有效。\n如非本人操作请忽略本邮件。\n\n${config.appName} · ${config.appSlogan}`,
      html: `<div style="font-family:system-ui,-apple-system,'PingFang SC',sans-serif;max-width:520px;margin:0 auto;padding:24px">
        <h2 style="color:#0d6efd;margin:0 0 8px">${config.appName}</h2>
        <p style="color:#666;margin:0 0 24px">${config.appSlogan}</p>
        <p>您的${purpose || '登录'}验证码是：</p>
        <p style="font-size:32px;font-weight:700;letter-spacing:6px;color:#111;background:#f5f7fb;padding:16px 20px;border-radius:12px;text-align:center">${code}</p>
        <p style="color:#888;font-size:13px">5 分钟内有效。如非本人操作请忽略本邮件。</p>
      </div>`,
    }),
    welcome: (user) => ({
      subject: `欢迎加入${config.appName}`,
      text: `您好 ${user.nickname}，欢迎加入${config.appName}。完善企业与资质信息可获得更多对接机会。`,
      html: `<div style="font-family:system-ui,-apple-system,'PingFang SC',sans-serif;padding:24px">
        <h2>欢迎加入${config.appName}</h2><p>您好 ${user.nickname}，建议先完成企业认证，对接成功率会显著提升。</p></div>`,
    }),
    followDigest: (items, user) => ({
      subject: `【${config.appName}】您关注的领域有 ${items.length} 条新动态`,
      text: items.map((i) => `· ${i.title} ${i.url || ''}`).join('\n'),
      html: `<div style="font-family:system-ui,sans-serif;padding:24px"><h3>您关注的领域有新动态</h3><ul>${items
        .map((i) => `<li><a href="${i.url || '#'}">${i.title}</a></li>`)
        .join('')}</ul></div>`,
    }),
  };
}

export default { sendMail, mailConfigured, mailTemplates };

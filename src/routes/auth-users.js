/**
 * 认证路由（手机号 / 邮箱 / 微信）+ 用户、通讯录、关注与通知
 */
import db from '../store/db.js';
import { config } from '../config.js';
import { httpError } from '../http/app.js';
import {
  data, fail, num, bool, list, str, baseUrl, authUser, mustAuth,
  setAuthCookie, clearAuthCookie, rateLimit, clientIp, queryOf,
} from './_util.js';
import {
  createUser, findByPhone, findByEmail, findByWechat, findByPhone as byPhone,
  hashPassword, verifyPassword, issueOtp, verifyOtp, touchLogin, selfUser, publicUser,
  normalizePhone, ensureNicknameUnique, signToken, currentUser,
} from '../services/auth.js';
import { saveUploads, filePublic } from '../services/files.js';
import notifySvc from '../services/notify.js';
import chatSvc from '../services/chat.js';
import wechat from '../services/wechat.js';
import listingsSvc from '../services/listings.js';
import verifySvc from '../services/verification.js';
import { sendMail, mailTemplates, mailConfigured } from '../services/mail.js';
import { INDUSTRIES, HELPER } from '../data/taxonomy.js';

const users = () => db.collection('users');

function applyInvite(newUser, inviteId) {
  if (!inviteId) return;
  const inviter = users().get(inviteId);
  if (!inviter) return;
  users().update(newUser.id, { invitedBy: inviter.id });
  try {
    notifySvc.notify({
      userId: inviter.id,
      type: 'contact_invite',
      title: `${newUser.nickname} 通过您的邀请注册了`,
      body: '快去和他建立联系吧',
      link: `/#/user/${newUser.id}`,
    });
  } catch {
    /* ignore */
  }
}

function issueLogin(res, user, extra = {}) {
  const fresh = touchLogin(user) || user;
  const token = signToken({ uid: fresh.id });
  setAuthCookie(res, token);
  return data(res, { token, user: selfUser(fresh), ...extra });
}

export default function registerAuthUserRoutes(app) {
  /* ================================================================ */
  /* 注册 / 登录：手机号验证码                                          */
  /* ================================================================ */
  app.post('/api/auth/sms/send', (req, res) => {
    const phone = normalizePhone(req.body?.phone);
    const purpose = String(req.body?.purpose || 'login');
    if (!/^1[3-9]\d{9}$/.test(phone)) return fail(res, '请输入正确的手机号');
    const rl = rateLimit(`sms:${clientIp(req)}:${phone}`, 5, 60_000);
    if (!rl.ok) return fail(res, `发送过于频繁，请 ${rl.retryAfter} 秒后再试`, 429, 'rate_limited');

    const { code } = issueOtp({ target: phone, purpose, channel: 'sms' });
    console.log(`[sms:demo] ${phone} 验证码 ${code}（用途：${purpose}）`);
    return data(res, {
      ok: true,
      phone,
      ttl: 300,
      provider: config.sms.provider,
      ...(config.sms.demoReturnCode ? { demoCode: code, tip: '当前为演示模式，验证码直接返回；配置短信网关后不再返回' } : {}),
    });
  });

  app.post('/api/auth/sms/login', (req, res) => {
    const phone = normalizePhone(req.body?.phone);
    const code = String(req.body?.code || '');
    const purpose = String(req.body?.purpose || 'login');
    if (!/^1[3-9]\d{9}$/.test(phone)) return fail(res, '请输入正确的手机号');

    const check = verifyOtp({ target: phone, purpose, code });
    if (!check.ok) return fail(res, check.reason, 400, 'bad_code');

    let user = byPhone(phone);
    let created = false;
    if (!user) {
      user = createUser({
        phone,
        nickname: String(req.body?.nickname || '').trim() || ensureNicknameUnique(`用户${phone.slice(-4)}`),
        company: str(req.body?.company, 100),
        profession: str(req.body?.profession, 60),
        industry: str(req.body?.industry, 60),
        city: str(req.body?.city, 60),
        wechatId: str(req.body?.wechatId, 60),
        // 注册时选择个人 / 企业
        accountType: str(req.body?.accountType, 20),
      });
      created = true;
      applyInvite(user, req.body?.invite);
    }
    return issueLogin(res, user, { created });
  });

  /* ================================================================ */
  /* 注册 / 登录：邮箱 + 密码                                           */
  /* ================================================================ */
  app.post('/api/auth/email/send-code', async (req, res) => {
    const email = String(req.body?.email || '').trim().toLowerCase();
    const purpose = String(req.body?.purpose || 'register');
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return fail(res, '请输入正确的邮箱');
    const rl = rateLimit(`mail:${clientIp(req)}:${email}`, 5, 60_000);
    if (!rl.ok) return fail(res, `发送过于频繁，请 ${rl.retryAfter} 秒后再试`, 429, 'rate_limited');

    const { code } = issueOtp({ target: email, purpose, channel: 'email' });
    const tpl = mailTemplates().otp(code, purpose === 'reset' ? '重置密码' : '注册');
    let mailResult = { mode: 'demo' };
    try {
      mailResult = await sendMail({ to: email, ...tpl });
    } catch (err) {
      console.warn('[auth] 邮件发送失败:', err.message);
      return fail(res, `邮件发送失败：${err.message}`, 502, 'mail_failed');
    }
    return data(res, {
      ok: true,
      email,
      ttl: 300,
      mode: mailResult.mode,
      ...(mailResult.mode === 'demo' ? { demoCode: code, tip: '未配置 SMTP，验证码直接返回并已写入 data/outbox.log' } : {}),
    });
  });

  app.post('/api/auth/email/register', (req, res) => {
    const email = String(req.body?.email || '').trim().toLowerCase();
    const password = String(req.body?.password || '');
    const code = String(req.body?.code || '');
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return fail(res, '请输入正确的邮箱');
    if (password.length < 6) return fail(res, '密码至少 6 位');
    if (findByEmail(email)) return fail(res, '该邮箱已注册，请直接登录', 409, 'exists');

    const check = verifyOtp({ target: email, purpose: 'register', code });
    if (!check.ok) return fail(res, check.reason, 400, 'bad_code');

    const nickname = String(req.body?.nickname || '').trim();
    const user = createUser({
      email,
      password,
      nickname: nickname || ensureNicknameUnique(email.split('@')[0]),
      company: str(req.body?.company, 100),
      profession: str(req.body?.profession, 60),
      industry: str(req.body?.industry, 60),
      city: str(req.body?.city, 60),
      phone: normalizePhone(req.body?.phone || ''),
      wechatId: str(req.body?.wechatId, 60),
      accountType: str(req.body?.accountType, 20),
    });
    applyInvite(user, req.body?.invite);
    if (mailConfigured()) {
      sendMail({ to: email, ...mailTemplates().welcome(user) }).catch(() => {});
    }
    return issueLogin(res, user, { created: true });
  });

  app.post('/api/auth/email/login', (req, res) => {
    const email = String(req.body?.email || '').trim().toLowerCase();
    const password = String(req.body?.password || '');
    const user = findByEmail(email);
    if (!user || !user.passwordHash || !verifyPassword(password, user.passwordHash)) {
      return fail(res, '邮箱或密码不正确', 401, 'bad_credentials');
    }
    if (user.status === 'banned') return fail(res, '账号已被禁用', 403, 'banned');
    return issueLogin(res, user);
  });

  /** 通用账号密码登录：自动识别手机号 / 邮箱 */
  app.post('/api/auth/login', (req, res) => {
    const account = String(req.body?.account || '').trim();
    const password = String(req.body?.password || '');
    if (!account || !password) return fail(res, '请填写账号和密码');
    const user = account.includes('@') ? findByEmail(account) : byPhone(normalizePhone(account));
    if (!user || !user.passwordHash || !verifyPassword(password, user.passwordHash)) {
      return fail(res, '账号或密码不正确', 401, 'bad_credentials');
    }
    if (user.status === 'banned') return fail(res, '账号已被禁用', 403, 'banned');
    return issueLogin(res, user);
  });

  /* ================================================================ */
  /* 重置密码                                                          */
  /* ================================================================ */
  app.post('/api/auth/password/reset', (req, res) => {
    const email = String(req.body?.email || '').trim().toLowerCase();
    const code = String(req.body?.code || '');
    const password = String(req.body?.password || '');
    if (password.length < 6) return fail(res, '密码至少 6 位');
    const user = findByEmail(email);
    if (!user) return fail(res, '该邮箱未注册', 404, 'not_found');
    const check = verifyOtp({ target: email, purpose: 'reset', code });
    if (!check.ok) return fail(res, check.reason, 400, 'bad_code');
    users().update(user.id, { passwordHash: hashPassword(password) });
    return data(res, { ok: true });
  });

  /* ================================================================ */
  /* 微信登录                                                          */
  /* ================================================================ */
  app.get('/api/auth/wechat/url', (req, res) => {
    const mode = String(req.query.mode || 'mp');
    const redirect = String(req.query.redirect || `${baseUrl(req)}/api/wechat/callback`);
    const state = String(req.query.state || Math.random().toString(36).slice(2));
    const url = mode === 'open' ? wechat.qrConnectUrl(redirect, state) : wechat.mpOAuthUrl(redirect, state);
    return data(res, {
      mode,
      url,
      ready: Boolean(url),
      status: wechat.status(),
      demoAvailable: config.wechat.demoMode,
      hint: url ? '' : '未配置微信公众号/开放平台 AppID，可使用「演示登录」体验完整流程',
    });
  });

  app.post('/api/auth/wechat/login', async (req, res) => {
    const code = String(req.body?.code || '');
    const mode = String(req.body?.mode || 'mp');
    if (!code) return fail(res, '缺少微信授权 code');

    let info;
    try {
      const tokenInfo = mode === 'open' ? await wechat.exchangeOpenCode(code) : await wechat.exchangeMpCode(code);
      const profile = await wechat.fetchWechatUser(tokenInfo.accessToken, tokenInfo.openid);
      info = { ...tokenInfo, ...(profile || {}) };
    } catch (err) {
      return fail(res, err.message || '微信授权失败', 400, 'wechat_failed');
    }

    let user = findByWechat(info.openid, info.unionid);
    let created = false;
    if (!user) {
      user = createUser({
        wechatOpenId: info.openid,
        wechatUnionId: info.unionid || '',
        nickname: ensureNicknameUnique(info.nickname || '微信用户'),
        avatar: info.avatar || '',
        city: info.city || '',
        company: str(req.body?.company, 100),
        profession: str(req.body?.profession, 60),
        industry: str(req.body?.industry, 60),
        accountType: str(req.body?.accountType, 20),
      });
      created = true;
      applyInvite(user, req.body?.invite);
    } else {
      const patch = {};
      if (info.avatar && !user.avatar) patch.avatar = info.avatar;
      if (info.nickname && !user.nickname) patch.nickname = info.nickname;
      if (Object.keys(patch).length) users().update(user.id, patch);
    }
    users().update(user.id, { settings: { ...user.settings, wechatBind: true } });
    return issueLogin(res, users().get(user.id), { created });
  });

  /** 演示登录：未配置微信 AppID 时用来完整体验流程 */
  app.post('/api/auth/wechat/demo', (req, res) => {
    if (!config.wechat.demoMode) return fail(res, '演示登录已关闭', 403, 'disabled');
    const nickname = String(req.body?.nickname || '').trim() || `微信演示用户${Math.floor(Math.random() * 9000 + 1000)}`;
    const fakeOpenId = `demo_${Date.now().toString(36)}`;
    const user = createUser({
      wechatOpenId: fakeOpenId,
      nickname: ensureNicknameUnique(nickname),
      avatar: '',
      company: str(req.body?.company, 100),
      profession: str(req.body?.profession, 60),
      industry: str(req.body?.industry, 60),
      city: str(req.body?.city, 60),
    });
    users().update(user.id, { settings: { ...user.settings, wechatBind: true } });
    return issueLogin(res, users().get(user.id), { created: true, demo: true });
  });

  /* ================================================================ */
  /* 会话                                                              */
  /* ================================================================ */
  app.get('/api/auth/me', (req, res) => {
    const user = currentUser(req);
    if (!user) return data(res, { user: null });
    return data(res, {
      user: selfUser(user),
      stats: listingsSvc.statsFor(user.id),
      unread: notifySvc.unreadCount(user.id),
      wechat: wechat.status(),
    });
  });

  app.post('/api/auth/logout', (req, res) => {
    clearAuthCookie(res);
    return data(res, { ok: true });
  });

  /* ================================================================ */
  /* 用户资料                                                          */
  /* ================================================================ */
  app.get('/api/users/me', (req, res) => {
    const user = mustAuth(req);
    return data(res, {
      user: selfUser(user),
      stats: listingsSvc.statsFor(user.id),
      unread: notifySvc.unreadCount(user.id),
      following: notifySvc.followingOf(user.id).length,
      rooms: chatSvc.listRooms(user.id).length,
    });
  });

  app.put('/api/users/me', (req, res) => {
    const user = mustAuth(req);
    const b = req.body || {};
    const patch = {};
    const textFields = ['nickname', 'company', 'profession', 'industry', 'city', 'bio', 'website', 'wechatId', 'realName'];
    for (const f of textFields) if (b[f] !== undefined) patch[f] = str(b[f], f === 'bio' ? 2000 : 200);
    if (b.phone !== undefined) {
      const p = normalizePhone(b.phone);
      if (p && !/^1[3-9]\d{9}$/.test(p)) return fail(res, '手机号格式不正确');
      const other = p ? users().findOne((u) => u.phone === p && u.id !== user.id) : null;
      if (other) return fail(res, '该手机号已被其他账号绑定', 409, 'exists');
      patch.phone = p;
    }
    if (b.email !== undefined && b.email) {
      const e = String(b.email).trim().toLowerCase();
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) return fail(res, '邮箱格式不正确');
      const other = users().findOne((u) => u.email === e && u.id !== user.id);
      if (other) return fail(res, '该邮箱已被其他账号绑定', 409, 'exists');
      patch.email = e;
    }
    if (b.logo !== undefined) patch.logo = str(b.logo, 500);
    if (b.avatar !== undefined) patch.avatar = str(b.avatar, 500);
    if (b.industryIds !== undefined) patch.industryIds = list(b.industryIds).slice(0, 10);
    if (b.settings !== undefined && typeof b.settings === 'object') {
      patch.settings = { ...user.settings, ...b.settings };
    }
    const updated = users().update(user.id, patch);
    return data(res, { user: selfUser(updated) });
  });

  /** 上传头像 / logo / 名片 / 企业介绍 PPT 或视频 */
  app.post('/api/users/me/assets', async (req, res) => {
    const user = mustAuth(req);
    const saved = await saveUploads(req, { ownerId: user.id });
    if (!saved.length) return fail(res, '没有收到文件');
    const patch = {};
    const cards = [...(user.cards || [])];
    const deck = [...(user.companyDeck || [])];

    for (const f of saved) {
      const role = f.role || 'attachment';
      if (role === 'avatar' || f.kind === 'image' && role === 'logo') patch.logo = f.url;
      if (role === 'avatar') patch.avatar = f.url;
      if (role === 'logo') patch.logo = f.url;
      if (role === 'card' || role === 'business_card') cards.push({ fileId: f.id, url: f.url, name: f.name, kind: f.kind });
      if (role === 'deck' || role === 'company_deck' || f.kind === 'ppt' || f.kind === 'pdf' || f.kind === 'video') {
        deck.push({ fileId: f.id, url: f.url, name: f.name, kind: f.kind, meta: f.meta });
      }
      if (f.kind === 'image' && role === 'attachment' && !patch.avatar) patch.avatar = f.url;
    }
    patch.cards = cards;
    patch.companyDeck = deck;
    const updated = users().update(user.id, patch);
    return data(res, { user: selfUser(updated), files: saved.map(filePublic) }, 201);
  });

  app.delete('/api/users/me/assets/:fileId', (req, res) => {
    const user = mustAuth(req);
    const fid = req.params.fileId;
    const cards = (user.cards || []).filter((c) => c.fileId !== fid);
    const deck = (user.companyDeck || []).filter((c) => c.fileId !== fid);
    const updated = users().update(user.id, { cards, companyDeck: deck });
    return data(res, { user: selfUser(updated) });
  });

  /* ================================================================ */
  /* 企业资质认证                                                       */
  /* ================================================================ */
  app.post('/api/users/me/qualification', async (req, res) => {
    const user = mustAuth(req);
    const saved = await saveUploads(req, { ownerId: user.id, role: 'qualification' });
    const b = req.body || {};
    const types = list(b.types);
    const existing = user.qualification?.files || [];
    const files = [...existing, ...saved.map((f) => ({ fileId: f.id, url: f.url, name: f.name, kind: f.kind }))];

    if (!files.length && !b.companyName) return fail(res, '请上传资质文件或填写企业名称');

    const qualification = {
      status: 'pending',
      companyName: str(b.companyName || user.company, 120),
      creditCode: str(b.creditCode, 40),
      legalPerson: str(b.legalPerson, 40),
      contact: str(b.contact || user.nickname, 40),
      contactPhone: str(b.contactPhone || user.phone, 30),
      types,
      files,
      note: str(b.note, 500),
      submittedAt: new Date().toISOString(),
      reviewedAt: null,
      reviewerNote: '',
    };
    const updated = users().update(user.id, { qualification });
    for (const admin of users().find((u) => u.isAdmin)) {
      notifySvc.notify({
        userId: admin.id,
        type: 'system',
        title: `新的企业资质待审核：${qualification.companyName || user.nickname}`,
        body: `提交人 ${user.nickname}，资质类型 ${types.join('、') || '未选择'}`,
        link: `/#/admin`,
      });
    }
    return data(res, { user: selfUser(updated), qualification }, 201);
  });

  app.get('/api/users/me/qualification', (req, res) => {
    const user = mustAuth(req);
    return data(res, {
      qualification: user.qualification || { status: 'none', files: [] },
      isVerified: Boolean(user.verified || user.qualification?.status === 'approved'),
    });
  });

  /* ================================================================ */
  /* 实名认证：个人身份证 / 企业营业执照 + AI 征信审核                    */
  /* ================================================================ */

  /** 认证表单的字段与选项定义（前端直接照着渲染） */
  app.get('/api/verification/meta', (req, res) => {
    return data(res, {
      accountTypes: Object.entries(verifySvc.ACCOUNT_TYPES).map(([value, label]) => ({ value, label })),
      statuses: verifySvc.VERIFY_STATUS,
      riskLevels: verifySvc.RISK_LEVELS,
      reviewModes: verifySvc.REVIEW_MODES,
      personal: {
        label: '个人认证',
        desc: '填写本人真实姓名与身份证号，并上传身份证正反面照片。',
        fields: [
          { key: 'realName', label: '真实姓名', placeholder: '与身份证一致', required: true },
          { key: 'idNumber', label: '身份证号', placeholder: '18 位身份证号码', required: true },
        ],
        files: [
          { key: 'idFront', label: '身份证人像面', required: true },
          { key: 'idBack', label: '身份证国徽面', required: true },
        ],
      },
      company: {
        label: '企业认证',
        desc: '填写企业信息并上传营业执照，系统会做 AI 征信审核。',
        fields: [
          { key: 'companyName', label: '企业名称', placeholder: '与营业执照一致', required: true },
          { key: 'creditCode', label: '统一社会信用代码', placeholder: '18 位', required: true },
          { key: 'legalPerson', label: '法定代表人', required: true },
          { key: 'regCapital', label: '注册资本', placeholder: '如 5000 万元' },
          { key: 'foundedAt', label: '成立日期', placeholder: '如 2015-06-01' },
          { key: 'address', label: '注册地址' },
          { key: 'scope', label: '经营范围', multiline: true },
        ],
        files: [{ key: 'license', label: '营业执照照片', required: true }],
      },
      creditNote:
        'AI 征信审核依据的是您提交的材料本身（代码校验位、字段一致性、经营范围匹配、风险关键词），'
        + '并非外部征信机构查询结果。',
    });
  });

  app.get('/api/users/me/verification', (req, res) => {
    const user = mustAuth(req);
    return data(res, { verification: verifySvc.verificationSummary(user) });
  });

  app.post('/api/users/me/verification', async (req, res) => {
    const user = mustAuth(req);
    const b = req.body || {};
    const type = str(b.type, 20);
    if (!verifySvc.ACCOUNT_TYPES[type]) return fail(res, '请选择认证类型（个人 / 企业）');

    const saved = await saveUploads(req, { ownerId: user.id, role: 'verification' });

    // 上传的文件按 fileFields 的顺序映射到表单槽位（idFront / idBack / license）
    let slots = b.fileFields;
    if (typeof slots === 'string') {
      try { slots = JSON.parse(slots); } catch { slots = []; }
    }
    if (!Array.isArray(slots)) slots = [];

    const files = {};
    saved.forEach((f, i) => {
      const slot = ['idFront', 'idBack', 'license'].includes(slots[i]) ? slots[i] : '';
      if (slot && !files[slot]) files[slot] = f.id;
    });
    // 也支持直接传已上传文件的 ID（前端先调 /api/files 再提交）
    for (const slot of ['idFront', 'idBack', 'license']) {
      const direct = str(b[`${slot}FileId`], 60);
      if (direct && !files[slot]) files[slot] = direct;
    }
    // 兜底：只传了文件但没标字段名
    if (saved.length && !Object.keys(files).length) {
      if (type === 'personal') {
        files.idFront = saved[0].id;
        if (saved[1]) files.idBack = saved[1].id;
      } else {
        files.license = saved[0].id;
      }
    }

    const result = await verifySvc.submitVerification(user, { type, data: b, files });

    // 需要人工复核的，通知管理员
    if (result.verification.status === 'pending') {
      for (const admin of users().find((u) => u.isAdmin)) {
        notifySvc.notify({
          userId: admin.id,
          type: 'system',
          title: `新的${verifySvc.ACCOUNT_TYPES[type]}认证待复核`,
          body: `${user.nickname} 提交了认证材料，AI 审核结果：${verifySvc.RISK_LEVELS[result.review?.riskLevel] || ''} ${result.review?.score ?? ''} 分`,
          link: `/#/admin`,
          meta: { userId: user.id, kind: 'verification' },
        });
      }
    }

    // 通知本人结果
    notifySvc.notify({
      userId: user.id,
      type: 'system',
      title:
        result.verification.status === 'approved'
          ? `认证通过：${verifySvc.ACCOUNT_TYPES[type]}`
          : result.verification.status === 'rejected'
            ? `认证未通过：${verifySvc.ACCOUNT_TYPES[type]}`
            : '认证已提交，等待人工复核',
      body: result.review?.summary || '',
      link: `/#/verify`,
    });

    return data(res, {
      user: selfUser(result.user),
      verification: verifySvc.verificationSummary(result.user),
      review: result.review,
      mode: result.mode || (result.verification.status === 'approved' ? 'auto' : 'manual'),
      files: saved.map(filePublic),
    }, 201);
  });

  /** 管理员人工复核认证 */
  app.post('/api/users/:id/verification/review', (req, res) => {
    const admin = mustAuth(req);
    if (!admin.isAdmin) throw httpError(403, '需要管理员权限');
    const agree = bool(req.body?.agree);
    const note = str(req.body?.note, 500);
    const result = verifySvc.reviewVerification(req.params.id, { agree, note }, admin);
    notifySvc.notify({
      userId: req.params.id,
      type: 'system',
      title: agree ? '认证已通过' : '认证未通过',
      body: note || (agree ? '管理员已通过您的认证。' : '管理员未通过您的认证，请核对材料后重新提交。'),
      link: `/#/verify`,
    });
    return data(res, { user: selfUser(result.user), verification: verifySvc.verificationSummary(result.user) });
  });

  /** 管理员查看待复核列表 */
  app.get('/api/admin/verifications', (req, res) => {
    const admin = mustAuth(req);
    if (!admin.isAdmin) throw httpError(403, '需要管理员权限');
    const status = String(queryOf(req).status || 'pending');
    const items = users()
      .all()
      .filter((u) => u.verification && u.verification.status !== 'none')
      .filter((u) => (status === 'all' ? true : u.verification.status === status))
      .map((u) => ({ user: publicUser(u), verification: verifySvc.verificationSummary(u) }));
    return data(res, { items, total: items.length });
  });

  /* ================================================================ */
  /* 用户目录 / 公开资料                                                */
  /* ================================================================ */
  app.get('/api/users', (req, res) => {
    const q = queryOf(req);
    const kw = String(q.q || '').trim().toLowerCase();
    let items = users().all().filter((u) => u.status !== 'banned');
    if (kw) {
      items = items.filter((u) =>
        [u.nickname, u.company, u.industry, u.profession, u.city]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
          .includes(kw),
      );
    }
    if (q.industry) items = items.filter((u) => u.industry === q.industry || (u.industryIds || []).includes(q.industry));
    if (q.city) items = items.filter((u) => u.city === q.city);
    if (q.verified === '1') items = items.filter((u) => u.verified || u.qualification?.status === 'approved');
    items.sort((a, b) => (b.stats?.followers || 0) - (a.stats?.followers || 0));
    const total = items.length;
    const page = q.page;
    const pageSize = Math.min(50, q.pageSize);
    return data(res, {
      total,
      page,
      pages: Math.ceil(total / pageSize) || 1,
      items: items.slice((page - 1) * pageSize, page * pageSize).map(publicUser),
    });
  });

  app.get('/api/users/:id', (req, res) => {
    const viewer = authUser(req);
    const user = users().get(req.params.id);
    if (!user || user.status === 'banned') throw httpError(404, '用户不存在');
    const profile = publicUser(user);
    // 已登录用户之间可见联系方式（可在设置中关闭）
    if (viewer) {
      const contact = {
        phone: user.phone || '',
        email: user.email || '',
        wechat: user.wechatId || '',
      };
      if (user.id === viewer.id) profile.contact = contact;
      else if (viewer.id && user.contactVisible !== false) profile.contact = contact;
    }
    profile.followers = notifySvc.followersOf('user', user.id).length;
    profile.following = notifySvc.isFollowing(viewer?.id, 'user', user.id);
    profile.rooms = undefined;
    profile.cards = user.cards || [];
    profile.companyDeck = user.companyDeck || [];
    profile.qualification = user.qualification
      ? { status: user.qualification.status, companyName: user.qualification.companyName, types: user.qualification.types, verifiedAt: user.qualification.reviewedAt }
      : null;
    profile.listings = listingsSvc
      .queryListings({ ownerId: user.id, status: 'published', pageSize: 12 })
      .items;
    return data(res, { user: profile });
  });

  /* ================================================================ */
  /* 关注                                                              */
  /* ================================================================ */
  app.post('/api/follow', (req, res) => {
    const user = mustAuth(req);
    const targetType = String(req.body?.targetType || '');
    const targetId = String(req.body?.targetId || '');
    if (!['listing', 'user', 'industry', 'city', 'company'].includes(targetType)) {
      return fail(res, '不支持的关注类型');
    }
    if (!targetId) return fail(res, '缺少目标');
    const meta = req.body?.meta && typeof req.body.meta === 'object' ? req.body.meta : {};
    const rec = notifySvc.follow(user.id, targetType, targetId, meta);
    return data(res, { following: true, follow: rec });
  });

  app.del('/api/follow', (req, res) => {
    const user = mustAuth(req);
    const targetType = String(req.query.targetType || req.body?.targetType || '');
    const targetId = String(req.query.targetId || req.body?.targetId || '');
    const ok = notifySvc.unfollow(user.id, targetType, targetId);
    return data(res, { following: false, removed: ok });
  });

  app.get('/api/follows', (req, res) => {
    const user = mustAuth(req);
    const type = String(req.query.type || '');
    let items = notifySvc.followingOf(user.id);
    if (type) items = items.filter((f) => f.targetType === type);
    return data(res, {
      items: items.map((f) => {
        if (f.targetType === 'listing') {
          const l = listingsSvc.getListing(f.targetId);
          return { ...f, target: l ? listingsSvc.listingBrief(l) : null };
        }
        if (f.targetType === 'user') return { ...f, target: publicUser(users().get(f.targetId)) };
        return { ...f, target: f.meta || { id: f.targetId, name: f.meta?.name || f.targetId } };
      }),
    });
  });

  /* ================================================================ */
  /* 通知                                                              */
  /* ================================================================ */
  app.get('/api/notifications', (req, res) => {
    const user = mustAuth(req);
    return data(res, {
      items: notifySvc.listNotifications(user.id, {
        unreadOnly: bool(req.query.unread),
        limit: num(req.query.limit, 60),
      }),
      unread: notifySvc.unreadCount(user.id),
    });
  });

  app.get('/api/notifications/unread', (req, res) => {
    const user = mustAuth(req);
    return data(res, notifySvc.notificationStats(user.id));
  });

  app.post('/api/notifications/read', (req, res) => {
    const user = mustAuth(req);
    const ids = list(req.body?.ids);
    return data(res, { updated: notifySvc.markRead(user.id, ids) });
  });

  /* ================================================================ */
  /* 通讯录                                                            */
  /* ================================================================ */
  app.get('/api/contacts', (req, res) => {
    const user = mustAuth(req);
    const items = chatSvc.listContacts(user.id, { q: String(req.query.q || '') });
    return data(res, {
      items: items.map((c) => ({ ...c, isRegistered: Boolean(c.registeredUserId) })),
      total: items.length,
      registered: items.filter((c) => c.registeredUserId).length,
    });
  });

  /** 导入微信 / 手机通讯录 */
  app.post('/api/contacts/import', (req, res) => {
    const user = mustAuth(req);
    const source = String(req.body?.source || 'phone');
    const contacts = Array.isArray(req.body?.contacts) ? req.body.contacts : [];
    if (!contacts.length) return fail(res, '没有可导入的联系人');
    const result = chatSvc.importContacts(user.id, { source, contacts });
    return data(res, result, 201);
  });

  app.post('/api/contacts/:id/invite', (req, res) => {
    const user = mustAuth(req);
    const result = chatSvc.inviteContact(user.id, req.params.id, { message: str(req.body?.message, 300) });
    return data(res, result);
  });

  app.post('/api/contacts/invite-batch', (req, res) => {
    const user = mustAuth(req);
    const ids = list(req.body?.ids);
    const results = [];
    for (const id of ids) {
      try {
        results.push({ id, ...chatSvc.inviteContact(user.id, id, { message: str(req.body?.message, 300) }) });
      } catch (err) {
        results.push({ id, error: err.message });
      }
    }
    return data(res, { results, invited: results.filter((r) => !r.error).length });
  });

  app.del('/api/contacts/:id', (req, res) => {
    const user = mustAuth(req);
    const c = db.collection('contacts').get(req.params.id);
    if (!c || c.ownerId !== user.id) throw httpError(404, '联系人不存在');
    db.collection('contacts').remove(req.params.id);
    return data(res, { ok: true });
  });

  /* ================================================================ */
  /* 行业订阅（关注行业 / 城市）                                         */
  /* ================================================================ */
  app.get('/api/subscriptions', (req, res) => {
    const user = mustAuth(req);
    const items = notifySvc.followingOf(user.id).filter((f) => ['industry', 'city'].includes(f.targetType));
    return data(res, {
      items: items.map((f) => ({
        ...f,
        name: f.meta?.name || (f.targetType === 'industry' ? HELPER.industryName?.(f.targetId) : f.targetId) || f.targetId,
      })),
      industries: INDUSTRIES.length,
    });
  });
}

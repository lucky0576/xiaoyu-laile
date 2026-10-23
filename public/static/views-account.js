/**
 * 小鱼来了 — 登录/注册、个人中心、资质、通讯录、通知、关注、管理后台
 */
import { api, service, store, isLoggedIn } from './api.js';
import * as ui from './ui.js';
import { itemHtml, userCardHtml, fileCardHtml, categoryName } from './components.js';
import { isWechatBrowser } from './share.js';

/* ================================================================== */
/* 登录                                                                */
/* ================================================================== */
export async function renderLogin(ctx, query) {
  // 微信 OAuth 回跳
  if (query.wechat_code) {
    try {
      ui.showLoading('微信授权登录中…');
      const res = await service.wechatLogin({ code: query.wechat_code, mode: query.mode || 'mp' });
      store.token = res.token;
      store.user = res.user;
      await ctx.refreshMe();
      ui.hideLoading();
      ui.toast('微信登录成功', 'ok');
      ctx.nav(query.redirect || '#/home');
      return { title: '登录', content: '<div class="page"></div>', noTab: true };
    } catch (err) {
      ui.hideLoading();
      ui.toast(err.message, 'err');
    }
  }

  const wx = ctx.state.site?.wechat || {};
  const html = `<div class="page">
    <div class="center" style="padding:26px 0 10px">
      <div style="font-size:52px">🐟</div>
      <h1 style="font-size:22px;margin-top:8px">${ui.esc(ctx.state.site?.name || '小鱼来了')}</h1>
      <div class="small muted">${ui.esc(ctx.state.site?.slogan || '')}</div>
    </div>

    <div class="card card-pad">
      <div class="chips mb12" id="login-tabs">
        <a class="chip active" data-tab="phone">手机密码</a>
        <a class="chip" data-tab="email">邮箱密码</a>
        <a class="chip" data-tab="wechat">微信登录</a>
      </div>

      <div id="pane-phone">
        <div class="field">
          <label>手机号</label>
          <input class="input" id="lg-phone" type="tel" placeholder="请输入手机号" value="">
        </div>
        <div class="field">
          <label>密码</label>
          <input class="input" id="lg-pw-phone" type="password" placeholder="请输入密码">
        </div>
        <button class="btn btn-primary btn-block" id="lg-submit">登录</button>
        <div class="row between mt12">
          <a class="small" href="#/register">还没有账号？去注册</a>
        </div>
      </div>

      <div id="pane-email" class="hide">
        <div class="field">
          <label>邮箱</label>
          <input class="input" id="lg-email" type="email" placeholder="you@example.com">
        </div>
        <div class="field">
          <label>密码</label>
          <input class="input" id="lg-password" type="password" placeholder="请输入密码">
        </div>
        <button class="btn btn-primary btn-block" id="lg-email-submit">登录</button>
        <div class="row between mt12">
          <a class="small" href="#/register">还没有账号？去注册</a>
          <a class="small" id="lg-forgot" href="javascript:;">忘记密码</a>
        </div>
      </div>

      <div id="pane-wechat" class="hide">
        ${wx.mp
          ? `<button class="btn btn-primary btn-block" id="lg-wx">微信授权登录</button>
             <div class="tiny dim mt8 center">已配置微信公众号，微信内打开将直接授权</div>`
          : `<button class="btn btn-primary btn-block" id="lg-wx-demo">微信一键登录（演示）</button>
             <div class="tiny dim mt8 center">当前未配置微信 AppID，使用演示账号完整体验流程；<br>配置 WECHAT_APP_ID / WECHAT_APP_SECRET 后即接入真实微信登录。</div>`}
        ${wx.open ? `<button class="btn btn-block mt8" id="lg-wx-qr">PC 扫码登录</button>` : ''}
      </div>
    </div>

    <div class="card card-pad mt12">
      <div class="strong mb8">演示账号（可直接体验）</div>
      <div class="small muted">
        <div>管理员：18800000000 / 密码 admin123456</div>
        <div>普通用户：13800001234 / 密码 demo123456</div>
        <div>或任意手机号 + 密码登录（新用户请先注册）</div>
      </div>
    </div>
  </div>`;

  return {
    title: '登录',
    content: html,
    showBack: true,
    noTab: true,
    async mount(root) {
      root.querySelector('#login-tabs').addEventListener('click', (e) => {
        const chip = e.target.closest('[data-tab]');
        if (!chip) return;
        root.querySelectorAll('#login-tabs .chip').forEach((el) => el.classList.toggle('active', el === chip));
        ['phone', 'email', 'wechat'].forEach((t) => root.querySelector(`#pane-${t}`).classList.toggle('hide', t !== chip.dataset.tab));
      });

      const done = async (res, msg) => {
        store.token = res.token;
        store.user = res.user;
        await ctx.refreshMe();
        ui.toast(msg, 'ok');
        const redirect = query.redirect || '#/home';
        ctx.nav(redirect.startsWith('#') ? redirect : `#${redirect}`);
      };

      root.querySelector('#lg-submit')?.addEventListener('click', async () => {
        const phone = root.querySelector('#lg-phone').value.trim();
        const password = root.querySelector('#lg-pw-phone').value;
        if (!phone || !password) return ui.toast('请填写手机号和密码', 'err');
        try {
          const res = await service.phoneLogin({ phone, password });
          await done(res, '登录成功');
        } catch (err) {
          if (err.code === 'bad_credentials') {
            ui.toast('手机号或密码不正确，没注册过请先注册', 'err');
          } else {
            ui.toast(err.message, 'err');
          }
        }
      });

      root.querySelector('#lg-email-submit')?.addEventListener('click', async () => {
        const email = root.querySelector('#lg-email').value.trim();
        const password = root.querySelector('#lg-password').value;
        if (!email || !password) return ui.toast('请填写邮箱和密码', 'err');
        try {
          const res = await service.mailLogin({ email, password });
          await done(res, '登录成功');
        } catch (err) {
          ui.toast(err.message, 'err');
        }
      });

      root.querySelector('#lg-forgot')?.addEventListener('click', async () => {
        const email = await ui.promptDialog({ title: '重置密码', label: '请输入注册邮箱', placeholder: 'you@example.com', okText: '发送验证码' });
        if (!email) return;
        try {
          const res = await service.mailSend(email, 'reset');
          ui.toast(res.demoCode ? `演示验证码：${res.demoCode}` : '验证码已发送', 'ok');
          const code = await ui.promptDialog({ title: '重置密码', label: `验证码${res.demoCode ? `（演示：${res.demoCode}）` : ''}`, okText: '下一步' });
          if (!code) return;
          const pw = await ui.promptDialog({ title: '设置新密码', label: '至少 6 位', okText: '重置' });
          if (!pw) return;
          await api.post('/api/auth/password/reset', { email, code, password: pw });
          ui.toast('密码已重置，请用新密码登录', 'ok');
        } catch (err) {
          ui.toast(err.message, 'err');
        }
      });

      root.querySelector('#lg-wx-demo')?.addEventListener('click', async () => {
        try {
          const res = await service.wechatDemo({ invite: query.invite });
          await done(res, '微信登录成功（演示）');
        } catch (err) {
          ui.toast(err.message, 'err');
        }
      });

      root.querySelector('#lg-wx')?.addEventListener('click', async () => {
        try {
          const res = await service.wechatUrl('mp');
          if (res.url) location.href = res.url;
          else ui.toast(res.hint || '微信登录未配置', 'err');
        } catch (err) {
          ui.toast(err.message, 'err');
        }
      });

      root.querySelector('#lg-wx-qr')?.addEventListener('click', async () => {
        try {
          const res = await service.wechatUrl('open');
          if (!res.url) return ui.toast(res.hint || '未配置开放平台', 'err');
          ui.openSheet({
            title: '微信扫码登录',
            content: `<div class="center"><iframe src="${ui.esc(res.url)}" style="width:100%;height:400px;border:0"></iframe></div>`,
          });
        } catch (err) {
          ui.toast(err.message, 'err');
        }
      });
    },
  };
}

/* ================================================================== */
/* 注册（邮箱）                                                        */
/* ================================================================== */
export async function renderRegister(ctx, query) {
  const industries = ctx.state.taxonomy?.industries || [];
  const provinces = ctx.state.taxonomy?.cities || [];

  const html = `<div class="page">
    <div class="center" style="padding:20px 0 8px">
      <div style="font-size:46px">🐟</div>
      <h1 style="font-size:20px;margin-top:6px">注册${ui.esc(ctx.state.site?.name || '小鱼来了')}</h1>
      <div class="small muted">完善企业与行业信息，对接成功率更高</div>
    </div>

    <div class="card card-pad mb12">
      <div class="strong mb8">选择注册身份 <span style="color:var(--danger)">*</span></div>
      <div class="acct-type" id="rg-acct-type">
        <div class="acct-opt active" data-type="personal">
          <div class="ico">👤</div>
          <div class="strong">个人</div>
          <div class="tiny dim">投资人 · 项目经理 · 个人从业者</div>
        </div>
        <div class="acct-opt" data-type="company">
          <div class="ico">🏢</div>
          <div class="strong">企业</div>
          <div class="tiny dim">施工 · 总包 · 设备 · 服务商</div>
        </div>
      </div>
      <div class="tiny dim mt8" id="rg-type-hint"></div>
    </div>

    <div class="card card-pad">
      <div class="strong mb12">账号信息</div>
      <div class="field">
        <label>手机号 <span style="color:var(--danger)">*</span></label>
        <input class="input" id="rg-phone" type="tel" maxlength="11" placeholder="11 位手机号，用于登录">
      </div>
      <div class="field">
        <label>图形验证码 <span style="color:var(--danger)">*</span></label>
        <div class="input-group">
          <input class="input" id="rg-captcha" maxlength="6" placeholder="输入右侧图中字符" autocomplete="off">
          <img id="rg-captcha-img" alt="图形验证码" title="点击刷新" style="height:44px;width:132px;border:1px solid var(--line);border-radius:10px;cursor:pointer;background:#f4f8fc;flex:0 0 auto" />
        </div>
        <div class="hint">看不清？点击图片换一张</div>
      </div>
      <div class="field">
        <label>设置密码 <span style="color:var(--danger)">*</span></label>
        <input class="input" id="rg-password" type="password" placeholder="至少 6 位">
      </div>
      <div class="field">
        <label>确认密码 <span style="color:var(--danger)">*</span></label>
        <input class="input" id="rg-password2" type="password" placeholder="再输入一次">
      </div>
      <div class="field">
        <label>昵称</label>
        <input class="input" id="rg-nickname" placeholder="用于展示的名称">
      </div>
    </div>

    <div class="card card-pad mt12">
      <div class="strong mb8">企业与职业信息（选填）</div>
      <div class="tiny dim mb12">填写后平台会按行业与城市为你精准推荐项目</div>
      <div class="field">
        <label>企业名称</label>
        <input class="input" id="rg-company" placeholder="如：山东鲁能新能源工程有限公司">
      </div>
      <div class="field">
        <label>职业 / 职务</label>
        <input class="input" id="rg-profession" placeholder="如：工程总监 / 投资经理 / 采购主管">
      </div>
      <div class="field">
        <label>所属行业</label>
        <select class="select" id="rg-industry">
          <option value="">请选择行业</option>
          ${industries.map((it) => `<option value="${ui.esc(it.name)}">${it.icon || ''} ${ui.esc(it.name)}</option>`).join('')}
        </select>
      </div>
      <div class="field">
        <label>所在城市</label>
        <input class="input" id="rg-city" list="city-list" placeholder="如：东营">
        <datalist id="city-list">
          ${provinces.flatMap((p) => (p.cities || []).map((c) => `<option value="${ui.esc(c.name)}">`)).join('')}
        </datalist>
      </div>
      <div class="field">
        <label>微信号</label>
        <input class="input" id="rg-wechat" placeholder="微信号（选填）">
      </div>
    </div>

    <label class="checkbox mb12"><input type="checkbox" id="rg-agree" checked> <span class="small">我已阅读并同意平台服务条款与隐私政策</span></label>
    <button class="btn btn-primary btn-block" id="rg-submit">注册并登录</button>
    <div class="center mt12 small"><a href="#/login">已有账号？去登录</a></div>
  </div>`;

  return {
    title: '注册',
    content: html,
    showBack: true,
    noTab: true,
    async mount(root) {
      const $ = (s) => root.querySelector(s);
      let accountType = 'personal';
      let captchaId = '';

      const typeHint = {
        personal: '注册后需完成实名认证：填写姓名与身份证号，并上传身份证正反面照片。',
        company: '注册后需完成企业认证：上传营业执照并填写企业信息，由 AI 征信审核。',
      };
      const applyType = (t) => {
        accountType = t;
        root.querySelectorAll('#rg-acct-type .acct-opt').forEach((el) => el.classList.toggle('active', el.dataset.type === t));
        const hint = $('#rg-type-hint');
        if (hint) hint.textContent = typeHint[t];
      };
      root.querySelector('#rg-acct-type')?.addEventListener('click', (e) => {
        const opt = e.target.closest('.acct-opt');
        if (opt) applyType(opt.dataset.type);
      });
      applyType('personal');

      /** 拉一张新验证码 */
      const refreshCaptcha = async () => {
        try {
          const res = await service.captcha();
          captchaId = res.id;
          const img = $('#rg-captcha-img');
          if (img) {
            img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(res.svg);
          }
          const input = $('#rg-captcha');
          if (input) input.value = '';
        } catch (err) {
          ui.toast(err.message || '验证码加载失败', 'err');
        }
      };
      await refreshCaptcha();
      $('#rg-captcha-img')?.addEventListener('click', refreshCaptcha);

      $('#rg-submit')?.addEventListener('click', async () => {
        const phone = ($('#rg-phone').value || '').trim();
        const captchaCode = ($('#rg-captcha').value || '').trim();
        const password = $('#rg-password').value || '';
        const password2 = $('#rg-password2').value || '';

        if (!/^1[3-9]\d{9}$/.test(phone)) return ui.toast('请输入正确的手机号', 'err');
        if (!captchaCode) return ui.toast('请输入图形验证码', 'err');
        if (password.length < 6) return ui.toast('密码至少 6 位', 'err');
        if (password !== password2) return ui.toast('两次输入的密码不一致', 'err');
        if (!$('#rg-agree').checked) return ui.toast('请先同意服务条款', 'err');

        const btn = $('#rg-submit');
        btn.disabled = true;
        btn.textContent = '注册中…';
        try {
          const res = await service.phoneRegister({
            phone,
            password,
            captchaId,
            captchaCode,
            nickname: ($('#rg-nickname').value || '').trim(),
            company: ($('#rg-company').value || '').trim(),
            profession: ($('#rg-profession').value || '').trim(),
            industry: $('#rg-industry').value || '',
            city: ($('#rg-city').value || '').trim(),
            wechatId: ($('#rg-wechat').value || '').trim(),
            accountType,
            invite: query.invite,
          });
          store.token = res.token;
          store.user = res.user;
          await ctx.refreshMe();
          ui.toast('注册成功', 'ok');
          const redirect = query.redirect || '#/verify';
          const to = redirect.startsWith('#') ? redirect : '#' + redirect;
          ctx.nav(to);
        } catch (err) {
          ui.toast(err.message || '注册失败', 'err');
          btn.disabled = false;
          btn.textContent = '注册并登录';
          await refreshCaptcha();
        }
      });
    },
  };
}

/* ================================================================== */
/* 实名认证：个人身份证 / 企业营业执照 + AI 征信审核                      */
/* ================================================================== */
export async function renderVerify(ctx, query) {
  if (!ctx.requireLogin()) {
    return { title: '实名认证', content: ui.emptyState('🔒', '请先登录后再进行实名认证'), showBack: true };
  }

  const [metaRes, meRes] = await Promise.all([
    service.verificationMeta().catch(() => null),
    service.myVerification().catch(() => null),
  ]);
  const meta = metaRes || {};
  const v = meRes?.verification || { status: 'none' };
  const verified = Boolean(v.verified);
  const statusName = meta.statuses?.[v.status] || '未认证';

  /* 表单字段定义（来自 /api/verification/meta） */
  const pFields = meta.personal?.fields || [];
  const pFiles = meta.personal?.files || [];
  const cFields = meta.company?.fields || [];
  const cFiles = meta.company?.files || [];

  /* ---------------- 已有审核结果 ---------------- */
  const riskBadge = (lv) => {
    if (!lv) return '';
    const cls = lv === 'low' ? 'ok' : lv === 'medium' ? 'warn' : 'danger';
    const name = meta.riskLevels?.[lv] || lv;
    return `<span class="badge ${cls}">${ui.esc(name)}</span>`;
  };

  const resultCard = v.status === 'none' ? '' : `<div class="card card-pad mb12">
    <div class="row between mb8">
      <div class="strong">认证状态</div>
      <span class="badge ${verified ? 'ok' : v.status === 'rejected' ? 'danger' : 'warn'}">${ui.esc(statusName)}</span>
    </div>
    ${v.typeName ? `<div class="tiny dim mb8">认证类型：${ui.esc(v.typeName)}${v.reviewModeName ? ` · ${ui.esc(v.reviewModeName)}` : ''}</div>` : ''}

    ${v.score !== null && v.score !== undefined ? `<div class="row between mb8">
      <span class="small">AI 征信评分</span>
      <span class="row gap8"><b style="font-size:18px;color:${v.score >= 80 ? 'var(--ok,#17a673)' : v.score >= 45 ? '#c98a00' : 'var(--danger)'}">${v.score}</b>${riskBadge(v.riskLevel)}</span>
    </div>` : ''}

    ${v.summary ? `<div class="verify-summary">${ui.esc(v.summary)}</div>` : ''}

    ${(v.findings || []).length ? `<div class="field mt12"><label>审核发现</label>
      <ul class="verify-list">${v.findings.map((f) => `<li>${ui.esc(f)}</li>`).join('')}</ul></div>` : ''}

    ${(v.missing || []).length ? `<div class="warn-note mt8">⚠️ <b>缺少材料：</b>${v.missing.map(ui.esc).join('、')}</div>` : ''}
    ${v.advice ? `<div class="tiny dim mt8">处理建议：${ui.esc(v.advice)}</div>` : ''}
    ${v.reviewerNote ? `<div class="tiny dim mt8">审核意见：${ui.esc(v.reviewerNote)}</div>` : ''}
    ${v.note ? `<div class="tiny dim mt8">${ui.esc(v.note)}</div>` : ''}

    ${v.realName ? `<div class="kv-table mt12">
      <div class="kv"><span class="k">真实姓名</span><span class="v">${ui.esc(v.realName)}</span></div>
      <div class="kv"><span class="k">身份证号</span><span class="v">${ui.esc(v.idNumberMasked)}</span></div>
    </div>` : ''}
    ${v.companyName ? `<div class="kv-table mt12">
      <div class="kv"><span class="k">企业名称</span><span class="v">${ui.esc(v.companyName)}</span></div>
      <div class="kv"><span class="k">信用代码</span><span class="v">${ui.esc(v.creditCode)}</span></div>
      ${v.legalPerson ? `<div class="kv"><span class="k">法定代表人</span><span class="v">${ui.esc(v.legalPerson)}</span></div>` : ''}
      ${v.regCapital ? `<div class="kv"><span class="k">注册资本</span><span class="v">${ui.esc(v.regCapital)}</span></div>` : ''}
      ${v.foundedAt ? `<div class="kv"><span class="k">成立日期</span><span class="v">${ui.esc(v.foundedAt)}</span></div>` : ''}
    </div>` : ''}
  </div>`;

  /* ---------------- 表单 ---------------- */
  const fieldHtml = (f, prefix) => `<div class="field">
    <label>${ui.esc(f.label)}${f.required ? ' <span style="color:var(--danger)">*</span>' : ''}</label>
    ${f.multiline
      ? `<textarea class="input" rows="3" id="${prefix}-${f.key}" placeholder="${ui.esc(f.placeholder || '')}"></textarea>`
      : `<input class="input" id="${prefix}-${f.key}" placeholder="${ui.esc(f.placeholder || '')}">`}
  </div>`;

  const fileHtml = (f, prefix) => `<div class="field">
    <label>${ui.esc(f.label)}${f.required ? ' <span style="color:var(--danger)">*</span>' : ''}</label>
    <input type="file" class="input" id="${prefix}-file-${f.key}" accept="image/*,application/pdf">
    <div class="tiny dim mt4">支持 JPG / PNG / PDF，建议清晰可辨</div>
  </div>`;

  const formCard = `<div class="card card-pad mb12" id="vf-card">
    <div class="row between mb12">
      <div class="strong">提交认证材料</div>
      <span class="tiny dim">仅认证一次，通过后不可随意更改</span>
    </div>

    <div class="acct-type" id="vf-type">
      <div class="acct-opt" data-type="personal"><div class="ico">👤</div><div class="strong">个人认证</div>
        <div class="tiny dim">身份证实名认证</div></div>
      <div class="acct-opt" data-type="company"><div class="ico">🏢</div><div class="strong">企业认证</div>
        <div class="tiny dim">营业执照 + AI 征信审核</div></div>
    </div>

    <div class="step-hint mb12" id="vf-desc"></div>

    <div id="vf-personal">
      ${pFields.map((f) => fieldHtml(f, 'pf')).join('')}
      ${pFiles.map((f) => fileHtml(f, 'pf')).join('')}
    </div>

    <div id="vf-company" class="hide">
      ${cFields.map((f) => fieldHtml(f, 'cf')).join('')}
      ${cFiles.map((f) => fileHtml(f, 'cf')).join('')}
      <div class="field">
        <label>补充说明（选填）</label>
        <textarea class="input" rows="2" id="cf-extra" placeholder="如有历史资质、业绩或其他需要说明的情况"></textarea>
      </div>
      <div class="warn-note">🔍 <b>AI 征信审核</b>：系统会核对统一社会信用代码校验位、企业信息一致性、经营范围与风险关键词。${ui.esc(meta.creditNote || '')}</div>
    </div>

    <button class="btn btn-primary btn-block mt16" id="vf-submit">提交认证</button>
  </div>`;

  const html = `<div class="page">
    <div class="center" style="padding:16px 0 10px">
      <div style="font-size:40px">🛡️</div>
      <h1 style="font-size:19px;margin-top:6px">实名认证</h1>
      <div class="small muted">${verified ? '您已完成认证，可放心发布与对接' : '完成认证后才能发布项目和发起对接'}</div>
    </div>
    ${resultCard}
    ${verified ? '' : formCard}
    ${verified ? `<div class="center"><button class="btn btn-outline" id="vf-again">重新提交认证</button></div>` : ''}
  </div>`;

  let type = v.type || ctx.state.user?.accountType || 'personal';

  return {
    title: '实名认证',
    content: html,
    showBack: true,
    noTab: true,
    async mount(root) {
      const $ = (s) => root.querySelector(s);
      let showForm = !verified;

      const applyType = (t) => {
        type = t;
        root.querySelectorAll('#vf-type .acct-opt').forEach((el) => el.classList.toggle('active', el.dataset.type === t));
        $('#vf-personal')?.classList.toggle('hide', t !== 'personal');
        $('#vf-company')?.classList.toggle('hide', t !== 'company');
        const desc = $('#vf-desc');
        if (desc) {
          desc.innerHTML =
            t === 'personal'
              ? `<b>个人认证</b> —— ${ui.esc(meta.personal?.desc || '填写姓名与身份证号，上传身份证正反面照片。')}`
              : `<b>企业认证</b> —— ${ui.esc(meta.company?.desc || '填写企业信息并上传营业执照，由 AI 征信审核。')}`;
        }
      };
      root.querySelector('#vf-type')?.addEventListener('click', (e) => {
        const opt = e.target.closest('.acct-opt');
        if (opt) applyType(opt.dataset.type);
      });
      applyType(type);

      $('#vf-again')?.addEventListener('click', () => {
        showForm = true;
        void showForm;
        ctx.nav('#/verify?again=1');
      });

      $('#vf-submit')?.addEventListener('click', async () => {
        const btn = $('#vf-submit');
        const fd = new FormData();
        fd.append('type', type);
        const fileFields = [];

        if (type === 'personal') {
          for (const f of pFields) {
            const el = $(`#pf-${f.key}`);
            const val = (el?.value || '').trim();
            if (f.required && !val) return ui.toast(`请填写${f.label}`, 'err');
            fd.append(f.key, val);
          }
          for (const f of pFiles) {
            const input = $(`#pf-file-${f.key}`);
            const file = input?.files?.[0];
            if (f.required && !file) return ui.toast(`请上传${f.label}`, 'err');
            if (file) {
              fd.append('file', file, file.name);
              fileFields.push(f.key);
            }
          }
        } else {
          for (const f of cFields) {
            const el = $(`#cf-${f.key}`);
            const val = (el?.value || '').trim();
            if (f.required && !val) return ui.toast(`请填写${f.label}`, 'err');
            fd.append(f.key, val);
          }
          const extra = ($('#cf-extra')?.value || '').trim();
          if (extra) fd.append('extra', extra);
          for (const f of cFiles) {
            const input = $(`#cf-file-${f.key}`);
            const file = input?.files?.[0];
            if (f.required && !file) return ui.toast(`请上传${f.label}`, 'err');
            if (file) {
              fd.append('file', file, file.name);
              fileFields.push(f.key);
            }
          }
        }
        fd.append('fileFields', JSON.stringify(fileFields));

        btn.disabled = true;
        btn.textContent = type === 'company' ? 'AI 正在征信审核…' : '正在校验…';
        try {
          const res = await service.submitVerification(fd, {
            onProgress: (p) => { btn.textContent = `上传中 ${p}%`; },
          });
          const vv = res.verification || {};
          if (vv.status === 'approved') {
            ui.toast('认证通过！', 'ok');
          } else if (vv.status === 'rejected') {
            ui.toast(`认证未通过：${(vv.missing || []).join('、') || vv.summary || '请核对材料'}`, 'err');
          } else {
            ui.toast('已提交，等待人工复核', 'ok');
          }
          await ctx.refreshMe();
          ctx.nav('#/verify');
        } catch (err) {
          btn.disabled = false;
          btn.textContent = '提交认证';
          ui.toast(err.message, 'err');
        }
      });

      void showForm;
      void query;
    },
  };
}

/* ================================================================== */
/* 绑定微信回跳（微信授权后会带 code / ok / err 回到这里）                 */
/* ================================================================== */
export async function renderBindWechat(ctx, query) {
  if (!ctx.requireLogin()) {
    return { title: '绑定微信', content: ui.emptyState('🔒', '请先登录后再绑定微信'), showBack: true };
  }

  let ok = false;
  let msg = '';

  if (query.err) {
    msg = String(query.err);
  } else if (query.code) {
    try {
      await service.wechatBind({ code: query.code, mode: query.mode || 'mp' });
      await ctx.refreshMe();
      ok = true;
    } catch (e) {
      msg = e.message || '绑定失败';
    }
  } else {
    ok = Boolean(query.ok);
  }

  if (ok) ui.toast('微信绑定成功', 'ok');
  else if (msg) ui.toast(msg, 'err');

  return {
    title: '微信绑定',
    content: `<div class="page"><div class="card card-pad center">
      <div style="font-size:38px">${ok ? '✅' : '⚠️'}</div>
      <div class="strong mt8" style="font-size:16px">${ok ? '微信绑定成功' : '绑定未完成'}</div>
      <div class="small muted mt8" style="line-height:1.8">${ui.esc(
        msg || (ok ? '现在分享项目时可以一键转发到微信好友和朋友圈。' : '可以回到「资料与设置」重新发起绑定。'),
      )}</div>
      <div class="row gap8 mt16">
        <a class="btn btn-primary grow" href="#/profile">回到资料与设置</a>
        <a class="btn grow" href="#/me">返回我的</a>
      </div>
    </div></div>`,
    showBack: true,
    noTab: true,
  };
}

/* ================================================================== */
/* 我的                                                                */
/* ================================================================== */
export async function renderMe(ctx, query) {
  void query;
  if (!isLoggedIn()) {
    ctx.nav('#/login?redirect=%23/me');
    return { title: '我的', content: '<div class="page"><div class="empty">正在跳转登录…</div></div>', activeTab: 'me' };
  }
  const data = await service.myProfile();
  const u = data.user;
  const stats = data.stats || {};
  const verified = u.verified || u.qualification?.status === 'approved';

  const html = `<div class="page">
    <div class="card card-pad">
      <a class="row gap12" href="#/user/${ui.esc(u.id)}">
        ${ui.avatarHtml(u, 'lg')}
        <div class="grow">
          <div class="strong" style="font-size:17px">${ui.esc(u.nickname)} ${verified ? '<span class="badge ok">已认证</span>' : '<span class="badge warn">未认证</span>'}</div>
          <div class="tiny dim">${ui.esc([u.company, u.profession].filter(Boolean).join(' · ') || '点击完善企业与职业信息')}</div>
          <div class="row gap6 mt8" style="flex-wrap:wrap">
            ${u.industry ? `<span class="badge gray">${ui.esc(u.industry)}</span>` : ''}
            ${u.city ? `<span class="badge gray">📍${ui.esc(u.city)}</span>` : ''}
            ${u.phone ? `<span class="badge gray">📱${ui.esc(u.phone)}</span>` : ''}
          </div>
        </div>
        <span class="dim">›</span>
      </a>
    </div>

    <div class="card card-pad mt12">
      <div class="stat-row">
        <a href="#/my-listings"><div class="n">${stats.total || 0}</div><div class="l">我的发布</div></a>
        <a href="#/my-listings?status=published"><div class="n">${stats.byStatus?.published || 0}</div><div class="l">在线中</div></a>
        <a href="#/follows"><div class="n">${data.following || 0}</div><div class="l">我的关注</div></a>
        <a href="#/notifications"><div class="n">${data.unread || 0}</div><div class="l">未读消息</div></a>
      </div>
    </div>

    <div class="card mt12" style="overflow:hidden">
      <a class="item" href="#/my-listings"><div class="avatar">📁</div><div class="item-body"><div class="item-title">我的发布</div><div class="item-sub">草稿、在线中、已过期与已下架的信息</div></div><span class="dim">›</span></a>
      <a class="item" href="#/my-registrations"><div class="avatar">🎪</div><div class="item-body"><div class="item-title">我的报名</div><div class="item-sub">已报名参加的活动与课程</div></div><span class="dim">›</span></a>
      <a class="item" href="#/chat"><div class="avatar">💬</div><div class="item-body"><div class="item-title">项目群聊与会议</div><div class="item-sub">${data.rooms || 0} 个群聊</div></div><span class="dim">›</span></a>
      <a class="item" href="#/contacts"><div class="avatar">📇</div><div class="item-body"><div class="item-title">通讯录</div><div class="item-sub">导入微信 / 手机通讯录，邀请好友注册</div></div><span class="dim">›</span></a>
      <a class="item" href="#/verify"><div class="avatar">🪪</div><div class="item-body"><div class="item-title">实名认证</div><div class="item-sub">${
        u.verification?.status === 'approved'
          ? (u.accountType === 'company' ? '企业已认证' : '个人已认证')
          : u.verification?.status === 'pending'
            ? 'AI 审核中，等待人工复核'
            : u.verification?.status === 'rejected'
              ? '未通过，请核对材料后重新提交'
              : '个人上传身份证 / 企业上传营业执照 + AI 征信审核'
      }</div></div><span class="dim">›</span></a>
      <a class="item" href="#/qualification"><div class="avatar">🛡️</div><div class="item-body"><div class="item-title">企业资质认证</div><div class="item-sub">${verified ? '已通过认证' : u.qualification?.status === 'pending' ? '审核中' : '上传营业执照与资质证书'}</div></div><span class="dim">›</span></a>
      <a class="item" href="#/profile"><div class="avatar">⚙️</div><div class="item-body"><div class="item-title">资料与设置</div><div class="item-sub">头像、企业介绍、通知偏好</div></div><span class="dim">›</span></a>
      <a class="item" href="#/bindings"><div class="avatar">🔗</div><div class="item-body"><div class="item-title">账号绑定</div><div class="item-sub">邮箱、公众号、抖音、通讯地址</div></div><span class="dim">›</span></a>
      <a class="item" href="#/tags"><div class="avatar">🏷️</div><div class="item-body"><div class="item-title">我的标签</div><div class="item-sub">城市、行业、业务类型、性格、爱好</div></div><span class="dim">›</span></a>
      <a class="item" href="#/membership"><div class="avatar">👑</div><div class="item-body"><div class="item-title">会员等级</div><div class="item-sub">蝌蚪 · 龙虾 · 电鳗 · 鲨鱼 · 鲸鱼</div></div><span class="dim">›</span></a>
      <a class="item" href="#/notifications"><div class="avatar">🔔</div><div class="item-body"><div class="item-title">消息通知</div><div class="item-sub">${data.unread || 0} 条未读</div></div><span class="dim">›</span></a>
      ${u.isAdmin ? '<a class="item" href="#/admin-ai"><div class="avatar">🤖</div><div class="item-body"><div class="item-title">AI 设置</div><div class="item-sub">绑定 DeepSeek 等大模型，提升汇总与解析质量</div></div><span class="dim">›</span></a>' : ''}
      ${u.isAdmin ? '<a class="item" href="#/admin"><div class="avatar">🛠️</div><div class="item-body"><div class="item-title">管理后台</div><div class="item-sub">资质审核、内容治理、平台数据</div></div><span class="dim">›</span></a>' : ''}
    </div>

    <div class="card card-pad mt12">
      <div class="row between">
        <span class="small muted">微信绑定</span>
        <span class="badge ${u.settings?.wechatBind ? 'ok' : 'gray'}">${u.settings?.wechatBind ? '已绑定，可接收消息推送' : '未绑定'}</span>
      </div>
      <div class="tiny dim mt8">绑定微信后可接收关注动态、留言回复与项目对接通知。</div>
    </div>

    <button class="btn btn-block mt16" id="btn-logout" style="color:var(--danger)">退出登录</button>
    <div class="center tiny dim mt12">${ui.esc(ctx.state.site?.name || '')} · ${ui.esc(ctx.state.site?.slogan || '')}</div>
  </div>`;

  return {
    title: '我的',
    content: html,
    activeTab: 'me',
    showBack: false,
    async mount(root) {
      root.querySelector('#btn-logout').addEventListener('click', async () => {
        const ok = await ui.confirmDialog({ title: '退出登录', message: '确定要退出当前账号吗？' });
        if (!ok) return;
        await service.logout().catch(() => {});
        store.clear();
        ctx.state.user = null;
        ctx.state.unread = 0;
        location.hash = '#/home';
        location.reload();
      });
    },
  };
}

/* ================================================================== */
/* 我的发布                                                            */
/* ================================================================== */
export async function renderMyListings(ctx, query) {
  if (!isLoggedIn()) {
    ctx.nav('#/login?redirect=%23/my-listings');
    return { title: '我的发布', content: '<div class="page"></div>' };
  }
  const status = query.status || 'all';
  const res = await service.myListings({ status, pageSize: 50 });
  const tabs = [
    { id: 'all', name: '全部' },
    { id: 'published', name: '在线中' },
    { id: 'draft', name: '草稿' },
    { id: 'expired', name: '已过期' },
    { id: 'closed', name: '已下架' },
  ];

  const html = `<div class="page">
    <div class="chips scroll mb12">
      ${tabs.map((t) => `<a class="chip ${status === t.id ? 'active' : ''}" href="#/my-listings?status=${t.id}">${t.name}</a>`).join('')}
    </div>
    <div class="card list-grid" style="overflow:hidden">
      ${(res.items || []).length
        ? res.items.map((l) => `<div style="position:relative">${itemHtml(l)}
            <div class="row gap8" style="padding:0 14px 12px">
              ${l.status === 'draft' ? `<button class="btn btn-sm btn-primary" data-publish="${ui.esc(l.id)}">发布</button>` : ''}
              ${l.status === 'expired' || l.status === 'closed' ? `<button class="btn btn-sm btn-primary" data-republish="${ui.esc(l.id)}">重新发布</button>` : ''}
              <a class="btn btn-sm" href="#/publish?edit=${ui.esc(l.id)}">编辑</a>
              ${l.status === 'published' ? `<button class="btn btn-sm" data-close="${ui.esc(l.id)}">下架</button>` : ''}
              <button class="btn btn-sm" style="color:var(--danger)" data-del="${ui.esc(l.id)}">删除</button>
            </div></div>`).join('')
        : ui.emptyState('📭', '还没有发布过信息', '<a class="btn btn-primary mt16" href="#/publish">去发布</a>')}
    </div>
  </div>`;

  return {
    title: '我的发布',
    content: html,
    showBack: true,
    noTab: false,
    activeTab: 'me',
    async mount(root) {
      root.addEventListener('click', async (e) => {
        const pub = e.target.closest('[data-publish]');
        const rep = e.target.closest('[data-republish]');
        const close = e.target.closest('[data-close]');
        const del = e.target.closest('[data-del]');
        try {
          if (pub) {
            await service.publishListing(pub.dataset.publish, 30);
            ui.toast('发布成功', 'ok');
            ctx.nav('#/my-listings');
          } else if (rep) {
            await service.renewListing(rep.dataset.republish, 30);
            ui.toast('已重新发布 30 天', 'ok');
            ctx.nav('#/my-listings');
          } else if (close) {
            const ok = await ui.confirmDialog({ title: '下架信息', message: '下架后不再出现在列表与搜索结果中。', danger: true, okText: '下架' });
            if (!ok) return;
            await service.closeListing(close.dataset.close, '发布方下架');
            ui.toast('已下架', 'ok');
            ctx.nav('#/my-listings');
          } else if (del) {
            const ok = await ui.confirmDialog({ title: '删除信息', message: '删除后无法恢复，包含的留言也会一并删除。', danger: true, okText: '删除' });
            if (!ok) return;
            await service.deleteListing(del.dataset.del);
            ui.toast('已删除', 'ok');
            ctx.nav('#/my-listings');
          }
        } catch (err) {
          ui.toast(err.message, 'err');
        }
      });
    },
  };
}

/* ================================================================== */
/* 我的报名                                                            */
/* ================================================================== */
export async function renderMyRegistrations(ctx) {
  if (!isLoggedIn()) {
    ctx.nav('#/login?redirect=%23/my-registrations');
    return { title: '我的报名', content: '<div class="page"></div>' };
  }
  const res = await service.myRegistrations();
  const html = `<div class="page">
    <div class="card list-grid" style="overflow:hidden">
      ${(res.items || []).length
        ? res.items.map((x) => `<div>${itemHtml(x.listing)}
            <div class="row between" style="padding:0 14px 12px">
              <span class="tiny dim">报名状态：${x.registration.payStatus === 'free' ? '免费参加' : x.registration.payStatus === 'paid' ? '已支付' : '待支付'}</span>
              ${x.registration.payStatus === 'pending' ? `<span class="badge warn">需支付 ${x.registration.fee} 元</span>` : ''}
            </div></div>`).join('')
        : ui.emptyState('🎪', '还没有报名任何活动', '<a class="btn btn-primary mt16" href="#/list/event">去看看活动</a>')}
    </div>
  </div>`;
  return { title: '我的报名', content: html, showBack: true, activeTab: 'me' };
}

/* ================================================================== */
/* 资料与设置                                                          */
/* ================================================================== */
export async function renderProfile(ctx) {
  if (!isLoggedIn()) {
    ctx.nav('#/login?redirect=%23/profile');
    return { title: '资料设置', content: '<div class="page"></div>' };
  }
  const data = await service.myProfile();
  const u = data.user;
  const industries = ctx.state.taxonomy?.industries || [];
  const cities = ctx.state.taxonomy?.cities || [];

  const html = `<div class="page">
    <div class="card card-pad">
      <div class="strong mb12">头像与 LOGO</div>
      <div class="row gap12">
        <div id="avatar-preview">${ui.avatarHtml(u, 'lg')}</div>
        <div class="grow">
          <button class="btn btn-sm btn-outline" id="btn-avatar">上传头像</button>
          <button class="btn btn-sm mt8" id="btn-logo">上传企业 LOGO</button>
          <input type="file" id="file-avatar" accept="image/*" style="display:none">
          <input type="file" id="file-logo" accept="image/*" style="display:none">
        </div>
      </div>
    </div>

    <div class="card card-pad mt12">
      <div class="strong mb12">基本信息</div>
      <div class="field"><label>昵称</label><input class="input" id="pf-nickname" value="${ui.esc(u.nickname || '')}"></div>
      <div class="field"><label>真实姓名</label><input class="input" id="pf-realName" value="${ui.esc(u.realName || '')}"></div>
      <div class="field"><label>企业名称</label><input class="input" id="pf-company" value="${ui.esc(u.company || '')}"></div>
      <div class="field"><label>职业 / 职务</label><input class="input" id="pf-profession" value="${ui.esc(u.profession || '')}"></div>
      <div class="field"><label>所属行业</label>
        <select class="select" id="pf-industry">
          <option value="">请选择</option>
          ${industries.map((i) => `<option value="${ui.esc(i.name)}" ${u.industry === i.name ? 'selected' : ''}>${i.icon || ''} ${ui.esc(i.name)}</option>`).join('')}
        </select>
      </div>
      <div class="field"><label>所在城市</label>
        <input class="input" id="pf-city" list="pf-city-list" value="${ui.esc(u.city || '')}">
        <datalist id="pf-city-list">${cities.flatMap((p) => (p.cities || []).map((c) => `<option value="${ui.esc(c.name)}">`)).join('')}</datalist>
      </div>
      <div class="field"><label>个人 / 企业简介</label><textarea class="textarea" id="pf-bio" style="min-height:100px">${ui.esc(u.bio || '')}</textarea></div>
    </div>

    <div class="card card-pad mt12">
      <div class="strong mb12">联系方式</div>
      <div class="field"><label>手机号</label><input class="input" id="pf-phone" type="tel" value="${ui.esc(u.phone || '')}"></div>
      <div class="field"><label>微信号</label><input class="input" id="pf-wechatId" value="${ui.esc(u.wechatId || '')}"></div>
      <div class="field"><label>邮箱</label><input class="input" id="pf-email" type="email" value="${ui.esc(u.email || '')}"></div>
      <div class="field"><label>网站 / 主页</label><input class="input" id="pf-website" value="${ui.esc(u.website || '')}"></div>
    </div>

    <div class="card card-pad mt12">
      <div class="strong mb8">名片与企业介绍</div>
      <div class="tiny dim mb12">支持上传名片图片、企业介绍 PPT / PDF / 视频，展示在你的主页上</div>
      <div class="row gap8 mb8">
        <button class="btn btn-sm btn-outline" id="btn-card">上传名片</button>
        <button class="btn btn-sm btn-outline" id="btn-deck">上传企业介绍（PPT/PDF/视频）</button>
      </div>
      <input type="file" id="file-card" accept="image/*,.pdf" style="display:none">
      <input type="file" id="file-deck" accept=".ppt,.pptx,.pdf,.doc,.docx,.mp4,.mov" style="display:none">
      <div id="assets-list" class="mt8">
        ${(u.cards || []).map((c) => `<div class="row between mb8"><span class="small">💼 ${ui.esc(c.name)}</span><button class="icon-btn" data-del-asset="${ui.esc(c.fileId)}">✕</button></div>`).join('')}
        ${(u.companyDeck || []).map((c) => `<div class="row between mb8"><span class="small">📊 ${ui.esc(c.name)}</span><button class="icon-btn" data-del-asset="${ui.esc(c.fileId)}">✕</button></div>`).join('')}
      </div>
    </div>

    <div class="card card-pad mt12">
      <div class="strong mb8">微信绑定</div>
      <div class="tiny dim mb12">绑定后可一键转发到微信好友与朋友圈，也能接收微信通知</div>
      <div id="wx-bind-box"><div class="tiny dim">加载中…</div></div>
    </div>

    <div class="card card-pad mt12">
      <div class="strong mb12">通知偏好</div>
      ${[
        ['notifyNewProjects', '平台有新项目上线时通知我'],
        ['notifyFollow', '我关注的项目 / 行业 / 发布者有新动态或信息变更时通知我'],
        ['notifyComment', '我的信息收到留言时通知我'],
        ['notifyChat', '群聊收到新消息时通知我'],
        ['emailNotify', '同时发送邮件通知'],
      ].map(([k, label]) => `<div class="row between mb12"><span class="small">${label}</span>
        <label class="switch"><input type="checkbox" data-setting="${k}" ${u.settings?.[k] !== false ? 'checked' : ''}><span class="slider"></span></label></div>`).join('')}
    </div>

    <button class="btn btn-primary btn-block mt16" id="pf-save">保存资料</button>
  </div>`;

  return {
    title: '资料与设置',
    content: html,
    showBack: true,
    noTab: false,
    activeTab: 'me',
    async mount(root) {
      const $ = (s) => root.querySelector(s);

      /* ---------------- 微信绑定 ---------------- */
      const renderWechatBind = async () => {
        const box = $('#wx-bind-box');
        if (!box) return;
        let st = null;
        try {
          st = await service.wechatBindStatus();
        } catch {
          box.innerHTML = '<div class="tiny dim">绑定状态获取失败</div>';
          return;
        }

        if (st.bound) {
          box.innerHTML = `
            <div class="wx-bound">
              <div class="row between">
                <span class="row gap8"><span style="font-size:20px">✅</span><b>已绑定微信</b></span>
                <span class="badge ok">已绑定</span>
              </div>
              <div class="tiny dim mt8">
                ${st.nickname ? `微信昵称：${ui.esc(st.nickname)}<br>` : ''}
                标识：${ui.esc(st.openidMasked)}${st.boundAt ? `<br>绑定时间：${ui.esc(ui.fmtDate(st.boundAt, true))}` : ''}
              </div>
            </div>
            <div class="tiny dim mt8">现在分享项目时可以一键转发到微信好友和朋友圈。</div>
            <button class="btn btn-outline btn-block mt12" id="wx-unbind">解除绑定</button>
            ${st.canUnbind ? '' : '<div class="warn-note mt8">你的账号还没有手机号或密码，解绑后将无法登录，所以暂不支持解绑。</div>'}`;
          $('#wx-unbind')?.addEventListener('click', async () => {
            const ok = await ui.confirmDialog({ title: '解除微信绑定？', message: '解绑后需要重新绑定才能用微信转发与登录。', okText: '确认解绑' });
            if (!ok) return;
            try {
              await service.wechatUnbind();
              ui.toast('已解除绑定', 'ok');
              await ctx.refreshMe();
              renderWechatBind();
            } catch (err) {
              ui.toast(err.message, 'err');
            }
          });
          return;
        }

        const demoHint = st.demoAvailable
          ? '<div class="tiny dim mt8">当前未配置微信公众号，可用「模拟绑定」体验完整流程；配置后会自动走真实的微信授权。</div>'
          : '';
        box.innerHTML = `
          <div class="wx-unbound">
            <div class="small muted">绑定微信后，分享项目可一键转发到<b>微信好友</b>和<b>朋友圈</b>，重要消息也能通过微信提醒你。</div>
          </div>
          <button class="btn btn-primary btn-block mt12" id="wx-bind">绑定微信</button>
          ${st.demoAvailable ? '<button class="btn btn-outline btn-block mt8" id="wx-bind-demo">模拟绑定（体验用）</button>' : ''}
          ${demoHint}`;

        $('#wx-bind')?.addEventListener('click', async () => {
          if (!isWechatBrowser()) {
            // 不在微信里：提示用手机微信扫码或直接在微信中打开
            const ok = await ui.confirmDialog({
              title: '请在微信中打开',
              message: '绑定微信需要微信授权。可以先「复制链接」，然后在微信里打开本站完成绑定；或直接用「模拟绑定」体验。',
              okText: '复制链接',
              cancelText: '取消',
            });
            if (ok) {
              const copied = await ui.copyText(location.href.split('#')[0] + '#/profile');
              ui.toast(copied ? '链接已复制，请在微信中打开' : '复制失败', copied ? 'ok' : 'err');
            }
            return;
          }
          ui.showLoading('正在跳转微信授权…');
          try {
            const res = await service.wechatBindUrl('mp');
            ui.hideLoading();
            if (res.url) location.href = res.url;
            else ui.toast(res.hint || '暂时无法发起微信授权', 'err');
          } catch (err) {
            ui.hideLoading();
            ui.toast(err.message, 'err');
          }
        });

        $('#wx-bind-demo')?.addEventListener('click', async () => {
          try {
            await service.wechatBindDemo({ nickname: ctx.state.user?.nickname || '微信用户' });
            ui.toast('已模拟绑定微信', 'ok');
            await ctx.refreshMe();
            renderWechatBind();
          } catch (err) {
            ui.toast(err.message, 'err');
          }
        });
      };
      await renderWechatBind();

      const uploadAsset = async (file, field) => {
        if (!file) return;
        const fd = new FormData();
        fd.append(field, file, file.name);
        ui.showLoading('上传中…');
        try {
          const res = await service.uploadAssets(fd);
          ui.hideLoading();
          ui.toast('上传成功', 'ok');
          ctx.state.user = res.user;
          store.user = res.user;
          ctx.nav('#/profile');
        } catch (err) {
          ui.hideLoading();
          ui.toast(err.message, 'err');
        }
      };

      $('#btn-avatar').addEventListener('click', () => $('#file-avatar').click());
      $('#btn-logo').addEventListener('click', () => $('#file-logo').click());
      $('#btn-card').addEventListener('click', () => $('#file-card').click());
      $('#btn-deck').addEventListener('click', () => $('#file-deck').click());
      $('#file-avatar').addEventListener('change', (e) => uploadAsset(e.target.files[0], 'avatar'));
      $('#file-logo').addEventListener('change', (e) => uploadAsset(e.target.files[0], 'logo'));
      $('#file-card').addEventListener('change', (e) => uploadAsset(e.target.files[0], 'card'));
      $('#file-deck').addEventListener('change', (e) => uploadAsset(e.target.files[0], 'deck'));

      root.querySelector('#assets-list').addEventListener('click', async (e) => {
        const btn = e.target.closest('[data-del-asset]');
        if (!btn) return;
        try {
          await api.del(`/api/users/me/assets/${btn.dataset.delAsset}`);
          ui.toast('已移除', 'ok');
          ctx.nav('#/profile');
        } catch (err) {
          ui.toast(err.message, 'err');
        }
      });

      $('#pf-save').addEventListener('click', async () => {
        const settings = {};
        root.querySelectorAll('[data-setting]').forEach((el) => {
          settings[el.dataset.setting] = el.checked;
        });
        const payload = {
          nickname: $('#pf-nickname').value.trim(),
          realName: $('#pf-realName').value.trim(),
          company: $('#pf-company').value.trim(),
          profession: $('#pf-profession').value.trim(),
          industry: $('#pf-industry').value,
          city: $('#pf-city').value.trim(),
          bio: $('#pf-bio').value.trim(),
          phone: $('#pf-phone').value.trim(),
          wechatId: $('#pf-wechatId').value.trim(),
          email: $('#pf-email').value.trim(),
          website: $('#pf-website').value.trim(),
          settings,
        };
        try {
          const res = await service.updateProfile(payload);
          ctx.state.user = res.user;
          store.user = res.user;
          ui.toast('已保存', 'ok');
        } catch (err) {
          ui.toast(err.message, 'err');
        }
      });
    },
  };
}

/* ================================================================== */
/* 企业资质认证                                                        */
/* ================================================================== */
export async function renderQualification(ctx) {
  if (!isLoggedIn()) {
    ctx.nav('#/login?redirect=%23/qualification');
    return { title: '企业资质认证', content: '<div class="page"></div>' };
  }
  const res = await service.myQualification();
  const q = res.qualification || {};
  const types = ctx.state.taxonomy?.qualificationTypes || [];

  const statusHtml = res.isVerified
    ? '<span class="badge ok">已认证</span>'
    : q.status === 'pending'
      ? '<span class="badge warn">审核中</span>'
      : q.status === 'rejected'
        ? '<span class="badge danger">未通过</span>'
        : '<span class="badge gray">未提交</span>';

  const html = `<div class="page">
    <div class="card card-pad">
      <div class="row between mb8"><div class="strong">🛡️ 认证状态</div>${statusHtml}</div>
      ${q.reviewerNote ? `<div class="small" style="color:var(--danger)">审核意见：${ui.esc(q.reviewerNote)}</div>` : ''}
      <div class="small muted mt8">完成企业资质认证后，你的主页与企业信息会展示认证标识，项目对接成功率显著提升。</div>
    </div>

    <div class="card card-pad mt12">
      <div class="strong mb12">企业与资质信息</div>
      <div class="field"><label>企业名称</label><input class="input" id="qf-company" value="${ui.esc(q.companyName || ctx.state.user?.company || '')}"></div>
      <div class="field"><label>统一社会信用代码</label><input class="input" id="qf-credit" value="${ui.esc(q.creditCode || '')}"></div>
      <div class="field"><label>法定代表人</label><input class="input" id="qf-legal" value="${ui.esc(q.legalPerson || '')}"></div>
      <div class="field"><label>联系人</label><input class="input" id="qf-contact" value="${ui.esc(q.contact || ctx.state.user?.nickname || '')}"></div>
      <div class="field"><label>联系电话</label><input class="input" id="qf-phone" value="${ui.esc(q.contactPhone || ctx.state.user?.phone || '')}"></div>
      <div class="field">
        <label>资质类型（可多选）</label>
        <div class="chips" id="qf-types">
          ${types.map((t) => `<a class="chip ${(q.types || []).includes(t.id) ? 'active' : ''}" data-type="${ui.esc(t.id)}">${ui.esc(t.name)}</a>`).join('')}
        </div>
      </div>
      <div class="field">
        <label>资质文件</label>
        <button class="btn btn-sm btn-outline" id="qf-pick">📎 上传营业执照 / 资质证书（可多选）</button>
        <input type="file" id="qf-files" multiple accept="image/*,.pdf,.doc,.docx" style="display:none">
        <div id="qf-file-list" class="row wrap gap8 mt8">
          ${(q.files || []).map((f) => fileCardHtml(f)).join('')}
        </div>
      </div>
      <div class="field"><label>补充说明</label><textarea class="textarea" id="qf-note" style="min-height:80px">${ui.esc(q.note || '')}</textarea></div>
      <button class="btn btn-primary btn-block" id="qf-submit">提交认证</button>
      <div class="tiny dim mt8">资质文件仅用于平台审核，不会公开展示。审核通常在 1 个工作日内完成。</div>
    </div>
  </div>`;

  return {
    title: '企业资质认证',
    content: html,
    showBack: true,
    noTab: false,
    activeTab: 'me',
    async mount(root) {
      const $ = (s) => root.querySelector(s);
      let picked = [];

      $('#qf-types').addEventListener('click', (e) => {
        const chip = e.target.closest('[data-type]');
        if (chip) chip.classList.toggle('active');
      });

      $('#qf-pick').addEventListener('click', () => $('#qf-files').click());
      $('#qf-files').addEventListener('change', (e) => {
        picked = [...picked, ...e.target.files];
        $('#qf-file-list').insertAdjacentHTML('beforeend', picked.slice(-e.target.files.length).map((f) => `<span class="chip">${ui.esc(f.name)}</span>`).join(''));
      });

      $('#qf-submit').addEventListener('click', async () => {
        const types = [...root.querySelectorAll('#qf-types .chip.active')].map((el) => el.dataset.type);
        const fd = new FormData();
        fd.append('companyName', $('#qf-company').value.trim());
        fd.append('creditCode', $('#qf-credit').value.trim());
        fd.append('legalPerson', $('#qf-legal').value.trim());
        fd.append('contact', $('#qf-contact').value.trim());
        fd.append('contactPhone', $('#qf-phone').value.trim());
        fd.append('note', $('#qf-note').value.trim());
        fd.append('types', JSON.stringify(types));
        for (const f of picked) fd.append('qualification', f, f.name);
        ui.showLoading('提交中…');
        try {
          await service.submitMyQualification(fd);
          ui.hideLoading();
          ui.toast('已提交，等待审核', 'ok');
          ctx.nav('#/qualification');
        } catch (err) {
          ui.hideLoading();
          ui.toast(err.message, 'err');
        }
      });
    },
  };
}

/* ================================================================== */
/* 通讯录                                                              */
/* ================================================================== */
export async function renderContacts(ctx) {
  if (!isLoggedIn()) {
    ctx.nav('#/login?redirect=%23/contacts');
    return { title: '通讯录', content: '<div class="page"></div>' };
  }
  const res = await service.contacts({});
  const supportPicker = Boolean(navigator.contacts && navigator.contacts.select);

  const html = `<div class="page">
    <div class="card card-pad">
      <div class="strong mb8">📇 导入通讯录</div>
      <div class="tiny dim mb12">导入后可一键邀请好友注册，对方注册后会自动与你建立联系。</div>
      <div class="row gap8" style="flex-wrap:wrap">
        ${supportPicker ? '<button class="btn btn-primary btn-sm" id="ct-phone">📱 导入手机通讯录</button>' : ''}
        <button class="btn btn-sm ${supportPicker ? '' : 'btn-primary'}" id="ct-paste">📋 粘贴导入（微信/手机）</button>
        <button class="btn btn-sm" id="ct-vcf">📄 上传 vCard / CSV</button>
        <input type="file" id="ct-file" accept=".vcf,.csv,.txt" style="display:none">
      </div>
      <div class="tiny dim mt8">说明：微信不允许第三方直接读取你的通讯录。可用「微信 → 通讯录 → 复制联系人信息」后粘贴导入，或分享邀请链接让好友自行注册。</div>
    </div>

    <div class="card card-pad mt12">
      <div class="row between mb8">
        <div class="strong">联系人（${res.total}）</div>
        <span class="tiny dim">已注册 ${res.registered} 人</span>
      </div>
      <input class="input mb12" id="ct-search" placeholder="搜索姓名 / 电话 / 微信 / 公司">
      <div id="ct-list">
        ${(res.items || []).length
          ? res.items.map((c) => `<div class="item" data-contact="${ui.esc(c.id)}">
              <div class="avatar">${ui.esc(ui.initials(c.name))}</div>
              <div class="item-body">
                <div class="item-title">${ui.esc(c.name || '未命名')} ${c.isRegistered ? '<span class="badge ok">已注册</span>' : ''} ${c.invited ? '<span class="badge gray">已邀请</span>' : ''}</div>
                <div class="item-sub">${ui.esc([c.phone, c.wechat, c.company].filter(Boolean).join(' · '))}</div>
                <div class="item-meta">来源：${c.source === 'wechat' ? '微信' : '手机'} · ${ui.esc(ui.fmtRelative(c.createdAt))}</div>
              </div>
              <div class="row gap6">
                <button class="btn btn-sm ${c.isRegistered ? '' : 'btn-primary'}" data-invite="${ui.esc(c.id)}">${c.isRegistered ? '发消息' : '邀请'}</button>
              </div>
            </div>`).join('')
          : ui.emptyState('📇', '通讯录还是空的，先导入一批联系人吧')}
      </div>
    </div>
  </div>`;

  return {
    title: '通讯录',
    content: html,
    showBack: true,
    noTab: false,
    activeTab: 'me',
    async mount(root) {
      const $ = (s) => root.querySelector(s);

      const parsePasted = (text) => {
        const rows = [];
        for (const line of String(text).split(/\r?\n/)) {
          const s = line.trim();
          if (!s) continue;
          const parts = s.split(/[,，\t;；|]+/).map((x) => x.trim());
          const phoneMatch = s.match(/(?:\+?86[-\s]?)?1[3-9]\d{9}/);
          const name = parts.find((p) => p && !/^\d[\d\s-]{6,}$/.test(p) && !/@/.test(p)) || '';
          rows.push({
            name: name.slice(0, 40),
            phone: phoneMatch ? phoneMatch[0].replace(/[^\d]/g, '') : (parts.find((p) => /^\d{6,}$/.test(p)) || ''),
            wechat: parts.find((p) => /^[A-Za-z][A-Za-z0-9_-]{5,19}$/.test(p)) || '',
            company: parts.length >= 4 ? parts[3] : '',
          });
        }
        return rows.filter((r) => r.name || r.phone || r.wechat);
      };

      $('#ct-phone')?.addEventListener('click', async () => {
        try {
          const picked = await navigator.contacts.select(['name', 'tel'], { multiple: true });
          const contacts = (picked || []).map((c) => ({
            name: (c.name || [])[0] || '',
            phone: ((c.tel || [])[0] || '').replace(/[^\d]/g, ''),
          })).filter((c) => c.name || c.phone);
          if (!contacts.length) return ui.toast('没有选择联系人', 'err');
          const r = await service.importContacts('phone', contacts);
          ui.toast(`已导入 ${r.imported} 位联系人`, 'ok');
          ctx.nav('#/contacts');
        } catch (err) {
          ui.toast(err.message || '导入失败', 'err');
        }
      });

      $('#ct-paste')?.addEventListener('click', async () => {
        const text = await ui.promptDialog({
          title: '粘贴导入通讯录',
          label: '每行一位联系人，格式：姓名,电话,微信号,公司（后三项可省略）',
          placeholder: '张三,13800001111,zhangsan,某某公司\n李四,13900002222',
          multiline: true,
          okText: '导入',
        });
        if (!text) return;
        const contacts = parsePasted(text);
        if (!contacts.length) return ui.toast('没有解析出有效联系人', 'err');
        try {
          const r = await service.importContacts('wechat', contacts);
          ui.toast(`已导入 ${r.imported} 位联系人${r.matched?.length ? `，其中 ${r.matched.length} 位已是平台用户` : ''}`, 'ok');
          ctx.nav('#/contacts');
        } catch (err) {
          ui.toast(err.message, 'err');
        }
      });

      $('#ct-vcf')?.addEventListener('click', () => $('#ct-file').click());
      $('#ct-file')?.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const text = await file.text();
        let contacts = [];
        if (/BEGIN:VCARD/i.test(text)) {
          contacts = text.split(/END:VCARD/i).map((card) => {
            const name = (/FN[^:]*:(.+)/i.exec(card) || [])[1] || '';
            const tel = (/TEL[^:]*:(.+)/i.exec(card) || [])[1] || '';
            const org = (/ORG[^:]*:(.+)/i.exec(card) || [])[1] || '';
            return { name: name.trim(), phone: tel.replace(/[^\d]/g, ''), company: org.trim(), wechat: '' };
          }).filter((c) => c.name || c.phone);
        } else {
          contacts = parsePasted(text);
        }
        if (!contacts.length) return ui.toast('没有解析出有效联系人', 'err');
        try {
          const r = await service.importContacts('phone', contacts);
          ui.toast(`已导入 ${r.imported} 位联系人`, 'ok');
          ctx.nav('#/contacts');
        } catch (err) {
          ui.toast(err.message, 'err');
        }
      });

      $('#ct-search')?.addEventListener('input', ui.debounce(async (e) => {
        const q = e.target.value.trim();
        const r = await service.contacts({ q }).catch(() => ({ items: [] }));
        $('#ct-list').innerHTML = (r.items || []).length
          ? r.items.map((c) => `<div class="item"><div class="avatar">${ui.esc(ui.initials(c.name))}</div>
              <div class="item-body"><div class="item-title">${ui.esc(c.name)} ${c.isRegistered ? '<span class="badge ok">已注册</span>' : ''}</div>
              <div class="item-sub">${ui.esc([c.phone, c.wechat, c.company].filter(Boolean).join(' · '))}</div></div></div>`).join('')
          : ui.emptyState('🔍', '没有找到匹配的联系人');
      }, 300));

      $('#ct-list').addEventListener('click', async (e) => {
        const btn = e.target.closest('[data-invite]');
        if (!btn) return;
        try {
          const r = await service.inviteContact(btn.dataset.invite, '我在小鱼来了发现了不错的项目机会，邀请你也来看看');
          if (r.registered) ui.toast('已发送站内邀请', 'ok');
          const copied = await ui.copyText(`我在「小鱼来了」发现了不错的项目机会，邀请你注册看看：${r.link}`);
          ui.toast(copied ? '邀请链接已复制，可粘贴到微信发送' : '邀请已生成', 'ok');
          ctx.nav('#/contacts');
        } catch (err) {
          ui.toast(err.message, 'err');
        }
      });
    },
  };
}

/* ================================================================== */
/* 通知                                                                */
/* ================================================================== */
export async function renderNotifications(ctx) {
  if (!isLoggedIn()) {
    ctx.nav('#/login?redirect=%23/notifications');
    return { title: '消息通知', content: '<div class="page"></div>' };
  }
  const res = await service.notifications({ limit: 80 });
  const iconOf = (t) => ({
    follow_new: '⭐', comment: '💬', comment_reply: '↩️', ai_reply: '🤖', chat: '👥',
    meeting_invite: '📹', meeting_minutes: '📝', pipeline: '🔄', qualification: '🛡️',
    listing_published: '✅', listing_expiring: '⏰', contact_invite: '📇', system: '🔔',
  }[t] || '🔔');

  const html = `<div class="page">
    <div class="row between mb12">
      <span class="small muted">共 ${res.items.length} 条，未读 ${res.unread}</span>
      <button class="btn btn-sm" id="nt-read">全部标记已读</button>
    </div>
    <div class="card" style="overflow:hidden">
      ${(res.items || []).length
        ? res.items.map((n) => `<a class="item" href="${ui.esc(n.link || '#/home')}" style="opacity:${n.read ? '.62' : '1'}">
            <div class="avatar">${iconOf(n.type)}</div>
            <div class="item-body">
              <div class="item-title">${ui.esc(n.title)} ${!n.read ? '<span class="badge danger">未读</span>' : ''}</div>
              <div class="item-sub clamp2">${ui.esc(n.body || '')}</div>
              <div class="item-meta">${ui.esc(ui.fmtRelative(n.createdAt))} · ${ui.esc(n.typeName || '')}</div>
            </div>
          </a>`).join('')
        : ui.emptyState('🔔', '还没有收到消息')}
    </div>
  </div>`;

  return {
    title: '消息通知',
    content: html,
    showBack: true,
    noTab: false,
    activeTab: 'me',
    async mount(root) {
      root.querySelector('#nt-read').addEventListener('click', async () => {
        try {
          await service.readNotifications([]);
          ctx.state.unread = 0;
          ui.toast('已全部标记为已读', 'ok');
          ctx.nav('#/notifications');
        } catch (err) {
          ui.toast(err.message, 'err');
        }
      });
    },
  };
}

/* ================================================================== */
/* 我的关注                                                            */
/* ================================================================== */
export async function renderFollows(ctx) {
  if (!isLoggedIn()) {
    ctx.nav('#/login?redirect=%23/follows');
    return { title: '我的关注', content: '<div class="page"></div>' };
  }
  const res = await service.follows('');
  const groups = { listing: [], user: [], industry: [], city: [], company: [] };
  for (const f of res.items || []) (groups[f.targetType] = groups[f.targetType] || []).push(f);

  const section = (title, list, render) => (list.length
    ? `<div class="section-head mt16"><h2>${title}（${list.length}）</h2></div><div class="card" style="overflow:hidden">${list.map(render).join('')}</div>`
    : '');

  const html = `<div class="page">
    ${section('关注的信息', groups.listing, (f) => (f.target ? itemHtml(f.target) : ''))}
    ${section('关注的用户', groups.user, (f) => (f.target ? userCardHtml(f.target) : ''))}
    ${section('订阅的行业', groups.industry, (f) => `<div class="item"><div class="avatar">🏷️</div><div class="item-body"><div class="item-title">${ui.esc(f.meta?.name || f.targetId)}</div><div class="item-sub">该行业有新项目时会通知你</div></div></div>`)}
    ${section('订阅的城市', groups.city, (f) => `<div class="item"><div class="avatar">📍</div><div class="item-body"><div class="item-title">${ui.esc(f.meta?.name || f.targetId)}</div><div class="item-sub">该城市有新项目时会通知你</div></div></div>`)}
    ${!(res.items || []).length ? ui.emptyState('⭐', '还没有关注任何内容', '<a class="btn btn-primary mt16" href="#/home">去逛逛</a>') : ''}
  </div>`;

  return { title: '我的关注', content: html, showBack: true, noTab: false, activeTab: 'me' };
}

/* ================================================================== */
/* 管理后台                                                            */
/* ================================================================== */
export async function renderAdmin(ctx) {
  if (!isLoggedIn()) {
    ctx.nav('#/login?redirect=%23/admin');
    return { title: '管理后台', content: '<div class="page"></div>' };
  }
  if (!ctx.state.user?.isAdmin) {
    return { title: '管理后台', content: ui.emptyState('🔒', '需要管理员权限'), showBack: true };
  }
  const [overview, quals, listings] = await Promise.all([
    service.adminOverview(),
    service.adminQualifications('pending').catch(() => ({ items: [] })),
    service.adminListings({ status: 'all', pageSize: 20 }),
  ]);
  const s = overview.stats || {};

  const html = `<div class="page">
      <a class="card card-pad mb12" href="#/admin-providers" style="display:flex;align-items:center;gap:12px;text-decoration:none;color:inherit">
        <div style="font-size:26px">🤝</div>
        <div style="flex:1">
          <div class="strong">服务商审核</div>
          <div class="tiny dim">入驻申请审核与服务商名录管理</div>
        </div>
        <span class="dim">›</span>
      </a>
      <a class="card card-pad mb12" href="#/wechat-setup" style="display:flex;align-items:center;gap:12px;text-decoration:none;color:inherit">
        <div style="font-size:26px">💚</div>
        <div style="flex:1">
          <div class="strong">公众号接入</div>
          <div class="tiny dim">微信分享卡片、微信登录配置与自检</div>
        </div>
        <span class="dim">›</span>
      </a>
      <a class="card card-pad mb12" href="#/admin-invest" style="display:flex;align-items:center;gap:12px;text-decoration:none;color:inherit">
        <div style="font-size:26px">💰</div>
        <div style="flex:1">
          <div class="strong">投资管理</div>
          <div class="tiny dim">查看投资意向、核验打款凭证、签发股权证</div>
        </div>
        <span class="dim">›</span>
      </a>
    <div class="card card-pad">
      <div class="strong mb12">平台数据</div>
      <div class="stat-row">
        <div><div class="n">${s.users || 0}</div><div class="l">用户</div></div>
        <div><div class="n">${s.published || 0}</div><div class="l">在线信息</div></div>
        <div><div class="n">${s.comments || 0}</div><div class="l">留言</div></div>
        <div><div class="n">${s.online || 0}</div><div class="l">在线人数</div></div>
      </div>
      <div class="row gap8 mt12">
        <span class="badge">项目 ${s.byCategory?.project || 0}</span>
        <span class="badge">活动 ${s.byCategory?.event || 0}</span>
        <span class="badge">贸易 ${s.byCategory?.trade || 0}</span>
        <span class="badge warn">待审资质 ${s.pendingVerifications || 0}</span>
      </div>
    </div>

    <div class="card card-pad mt12">
      <div class="strong mb8">待审核企业资质（${(quals.items || []).length}）</div>
      ${(quals.items || []).length ? quals.items.map((q) => `<div style="border-bottom:1px solid var(--line);padding:10px 0">
        <div class="row between">
          <div>
            <div class="strong small">${ui.esc(q.qualification?.companyName || q.nickname)}</div>
            <div class="tiny dim">${ui.esc(q.nickname)} · ${ui.esc(q.phone || q.email || '')}</div>
            <div class="chips mt8">${(q.qualification?.types || []).map((t) => `<span class="chip soft">${ui.esc(t)}</span>`).join('')}</div>
          </div>
          <div class="row gap6">
            <button class="btn btn-sm btn-primary" data-qf="${ui.esc(q.userId)}" data-approve="1">通过</button>
            <button class="btn btn-sm" data-qf="${ui.esc(q.userId)}" data-approve="0">驳回</button>
          </div>
        </div>
      </div>`).join('') : '<div class="small muted">暂无待审核资质</div>'}
    </div>

    <div class="card card-pad mt12">
      <div class="strong mb8">内容管理（最近 ${(listings.items || []).length} 条）</div>
      <div style="overflow-x:auto">
        <table class="table">
          <thead><tr><th>标题</th><th>板块</th><th>状态</th><th>操作</th></tr></thead>
          <tbody>
            ${(listings.items || []).map((l) => `<tr>
              <td style="max-width:260px"><a href="#/detail/${ui.esc(l.id)}">${ui.esc(String(l.title).slice(0, 30))}</a></td>
              <td>${ui.esc(categoryName(l.category))}</td>
              <td>${ui.esc(l.status)}</td>
              <td>
                <button class="btn btn-sm" data-moderate="${ui.esc(l.id)}" data-action="offline">下架</button>
                <button class="btn btn-sm" data-moderate="${ui.esc(l.id)}" data-action="online">上架</button>
              </td>
            </tr>`).join('')}
          </tbody>
        </table>
      </div>
    </div>

    <div class="card card-pad mt12">
      <div class="strong mb8">运维操作</div>
      <div class="row gap8" style="flex-wrap:wrap">
        <button class="btn btn-sm" data-maint="expire">清理过期信息</button>
        <button class="btn btn-sm" data-maint="remind">发送到期提醒</button>
        <button class="btn btn-sm" data-maint="flush">立即落盘</button>
      </div>
      <div class="tiny dim mt8">数据集合：${Object.entries(overview.collections || {}).map(([k, v]) => `${k}(${v})`).join(' ')}</div>
    </div>
  </div>`;

  return {
    title: '管理后台',
    content: html,
    showBack: true,
    noTab: false,
    activeTab: 'me',
    async mount(root) {
      root.addEventListener('click', async (e) => {
        const qf = e.target.closest('[data-qf]');
        const mod = e.target.closest('[data-moderate]');
        const maint = e.target.closest('[data-maint]');
        try {
          if (qf) {
            const approve = qf.dataset.approve === '1';
            const note = approve ? '' : (await ui.promptDialog({ title: '驳回原因', multiline: true })) || '';
            await service.adminReviewQualification(qf.dataset.qf, { approve, note });
            ui.toast(approve ? '已通过认证' : '已驳回', 'ok');
            ctx.nav('#/admin');
          } else if (mod) {
            await service.adminModerate(mod.dataset.moderate, mod.dataset.action, '');
            ui.toast('操作成功', 'ok');
            ctx.nav('#/admin');
          } else if (maint) {
            const r = await api.post('/api/admin/maintenance', { action: maint.dataset.maint });
            ui.toast(`完成：${JSON.stringify(r)}`, 'ok');
          }
        } catch (err) {
          ui.toast(err.message, 'err');
        }
      });
    },
  };
}

/* ------------------------------------------------------------------ */
/* AI 设置（管理端）                                                    */
/* ------------------------------------------------------------------ */

/**
 * 在线配置 AI 接口 —— 不用改 .env，也不用重启服务。
 * 默认就是 DeepSeek（OpenAI 兼容协议），填个 Key 即可。
 */

/* 能力配置卡：视觉 / 语音通用 */
function capCard(prefix, title, info, priceNote, defUrl, defModel, hintHtml) {
  const on = Boolean(info?.hasApiKey);
  return `<div class="card card-pad mt12">
    <div class="row between mb8">
      <div class="strong">${title}</div>
      <span class="badge ${on ? 'accent' : 'gray'}">${on ? '已配置' : '未配置'}</span>
    </div>
    <div class="step-hint mb12">
      ${ui.esc(priceNote)}
      <div class="tiny dim mt4">${hintHtml}</div>
    </div>

    <div class="field">
      <label>接口地址</label>
      <input class="input" id="${prefix}-baseurl" value="${ui.esc(info?.baseUrl || defUrl)}">
    </div>
    <div class="field">
      <label>模型</label>
      <input class="input" id="${prefix}-model" value="${ui.esc(info?.model || defModel)}">
    </div>
    <div class="field">
      <label>API Key ${on ? '<span class="tiny dim">（留空表示不修改）</span>' : ''}</label>
      <input class="input" id="${prefix}-key" type="password" autocomplete="off"
        placeholder="${on ? ui.esc(info?.apiKeyHint || '已保存') : '粘贴完整 key'}">
    </div>

    <div class="row gap8 mt12" style="flex-wrap:wrap">
      <button class="btn btn-outline" id="${prefix}-test" type="button">🔌 测试</button>
      <button class="btn btn-primary grow" id="${prefix}-save" type="button">保存</button>
    </div>
    <div id="${prefix}-result" class="mt12"></div>
  </div>`;
}

export async function renderAdminAi(ctx) {
  if (!isLoggedIn()) {
    ctx.nav('#/login?redirect=%23/admin-ai');
    return { title: 'AI 设置', content: '<div class="page"></div>' };
  }
  if (!ctx.state.user?.isAdmin) {
    return { title: 'AI 设置', content: ui.emptyState('🔒', '需要管理员权限'), showBack: true };
  }

  let info = null;
  let visInfo = null;
  let asrInfo = null;
  try {
    info = await service.adminAi();
    visInfo = await service.adminVision().catch(() => null);
    asrInfo = await service.adminAsr().catch(() => null);
  } catch (err) {
    return {
      title: 'AI 设置',
      showBack: true,
      content: `<div class="page"><div class="card card-pad center">
        <div style="font-size:40px">⚠️</div>
        <div class="strong mt12">读取设置失败</div>
        <div class="small muted mt8">${ui.esc(err.message)}</div>
      </div></div>`,
    };
  }

  const presets = info.presets || [];
  const on = Boolean(info.hasApiKey);

  const content = `<div class="page">
    <div class="card card-pad">
      <div class="row between mb8">
        <div class="strong">🤖 AI 汇总资料</div>
        <span class="badge ${on ? 'accent' : 'gray'}">${on ? '已接大模型' : '内置规则引擎'}</span>
      </div>
      <div class="step-hint mb12">
        填上 API Key 后，「AI 汇总资料 / 生成标题 / 项目解析」会改用大模型。
        <b>不填也能用</b>，走内置规则引擎，只是摘要与字段提取会粗一些。
        <br>配置保存在服务器本机，不会随发布包分发出去。
      </div>

      <div class="field">
        <label>服务商</label>
        <select class="select" id="ai-preset">
          ${presets.map((p) => `<option value="${ui.esc(p.id)}" data-url="${ui.esc(p.baseUrl)}" data-models="${ui.esc((p.models || []).join(','))}">${ui.esc(p.name)}</option>`).join('')}
        </select>
      </div>

      <div class="field">
        <label>接口地址（Base URL）</label>
        <input class="input" id="ai-baseurl" value="${ui.esc(info.baseUrl || '')}" placeholder="https://api.deepseek.com/v1">
        <div class="tiny dim mt4">要带 /v1，末尾不加斜杠。自建或代理服务填自己的地址。</div>
      </div>

      <div class="field">
        <label>模型</label>
        <input class="input" id="ai-model" value="${ui.esc(info.model || '')}" placeholder="deepseek-chat">
        <div class="tiny dim mt4">DeepSeek 常用：deepseek-chat（通用）、deepseek-reasoner（推理更强）。</div>
      </div>

      <div class="field">
        <label>API Key ${on ? '<span class="tiny dim">（留空表示不修改）</span>' : ''}</label>
        <input class="input" id="ai-key" type="password" autocomplete="off"
          placeholder="${on ? ui.esc(info.apiKeyHint || '已保存') : 'sk-…'}" value="">
        <div class="tiny dim mt4">
          ${on ? '已保存一个 Key，出于安全不回显。要更换直接填新的。' : '在服务商后台创建，形如 sk-xxxx。'}
        </div>
      </div>

      <div class="row gap8 mt12" style="flex-wrap:wrap">
        <button class="btn btn-outline" id="ai-test" type="button">🔌 测试连接</button>
        <button class="btn btn-primary grow" id="ai-save" type="button">保存</button>
      </div>

      <div id="ai-result" class="mt12"></div>
    </div>

    ${capCard('vis', '👁️ 视觉理解（看画面）', visInfo, '推荐：直接用硅基流动的视觉模型（和语音共用一个 key）', 'https://api.siliconflow.cn/v1', 'Qwen/Qwen3-VL-8B-Instruct', '方案 A（推荐）：接口填 <code>https://api.siliconflow.cn/v1</code>，模型填 <code>Qwen/Qwen3-VL-8B-Instruct</code>，key 用下面语音那个硅基流动 key 即可，<b>一个 key 两件事</b>。<br>方案 B：用智谱，接口 <code>https://open.bigmodel.cn/api/paas/v4</code>，模型 <code>glm-4v-flash</code>，key 形如 <code>xxxxxxxx.yyyyyyyy</code>（中间有个点，要注意复制完整）')}

    ${capCard('asr', '🎧 语音转写（听声音）', asrInfo, '硅基流动 SenseVoice —— 注册送额度', 'https://api.siliconflow.cn/v1', 'FunAudioLLM/SenseVoiceSmall', '在 siliconflow.cn 注册 → 控制台 → API 密钥 → 新建，形如 <code>sk-xxxx</code>')}

    <div class="card card-pad mt12">
      <div class="strong mb8">当前状态</div>
      <div class="kv-table">
        <div class="kv"><span class="k">运行模式</span><span class="v">${on ? '大模型' : '内置规则引擎'}</span></div>
        <div class="kv"><span class="k">服务商</span><span class="v">${ui.esc(info.provider || '')}</span></div>
        <div class="kv"><span class="k">模型</span><span class="v">${ui.esc(info.model || '')}</span></div>
        <div class="kv"><span class="k">Key 来源</span><span class="v">${
          info.source === 'online' ? '页面配置' : info.source === 'env' ? '环境变量' : '未配置'
        }</span></div>
      </div>
      ${on ? '<button class="btn btn-sm btn-outline mt12" id="ai-clear" type="button">清除配置，回退内置引擎</button>' : ''}
    </div>

    <div class="card card-pad mt12">
      <div class="small muted">
        <div>· Key 只保存在这台服务器的 <code>data/</code> 目录，不进发布包，也不同步到坚果云</div>
        <div>· 「测试连接」只发一个极小的请求，几乎不产生费用</div>
        <div>· DeepSeek 参考价：约 1 元 / 百万 token，一份 50 页文档汇总约 0.03 元</div>
      </div>
    </div>
  </div>`;

  return {
    title: 'AI 设置',
    content,
    showBack: true,
    async mount(root) {
      const $ = (s) => root.querySelector(s);

      // 按当前地址回选服务商
      const preset = $('#ai-preset');
      if (preset && info.baseUrl) {
        const hit = [...preset.options].find((o) => o.dataset.url === info.baseUrl);
        if (hit) preset.value = hit.value;
      }
      preset?.addEventListener('change', () => {
        const opt = preset.selectedOptions[0];
        if (!opt) return;
        const url = opt.dataset.url || '';
        const models = (opt.dataset.models || '').split(',').filter(Boolean);
        if (url) $('#ai-baseurl').value = url;
        if (models.length) $('#ai-model').value = models[0];
      });

      const collect = () => ({
        baseUrl: $('#ai-baseurl').value.trim(),
        model: $('#ai-model').value.trim(),
        apiKey: $('#ai-key').value.trim(),
      });
      const showResult = (html) => { $('#ai-result').innerHTML = html; };

      $('#ai-test')?.addEventListener('click', async (e) => {
        const btn = e.currentTarget;
        btn.disabled = true;
        btn.textContent = '测试中…';
        showResult('<div class="tiny dim">正在连接…</div>');
        try {
          const r = await service.testAdminAi(collect());
          showResult(r.ok
            ? `<div class="file-unlocked-tip">✅ 连接正常 · ${ui.esc(String(r.ms))}ms · 模型 ${ui.esc(r.model)}${r.reply ? ` · 回复「${ui.esc(r.reply)}」` : ''}</div>`
            : `<div class="warn-note">❌ ${ui.esc(r.error || '连接失败')}${r.detail ? `<div class="tiny dim mt4">${ui.esc(String(r.detail).slice(0, 200))}</div>` : ''}</div>`);
        } catch (err) {
          showResult(`<div class="warn-note">❌ ${ui.esc(err.message)}</div>`);
        } finally {
          btn.disabled = false;
          btn.textContent = '🔌 测试连接';
        }
      });

      $('#ai-save')?.addEventListener('click', async (e) => {
        const btn = e.currentTarget;
        btn.disabled = true;
        btn.textContent = '保存中…';
        try {
          await service.saveAdminAi(collect());
          ui.toast('已保存，立即生效', 'ok');
          ctx.refresh ? ctx.refresh() : window.location.reload();
        } catch (err) {
          ui.toast(err.message, 'err');
          btn.disabled = false;
          btn.textContent = '保存';
        }
      });

      /* ---- 视觉 / 语音 通用保存 + 测试 ---- */
      const bindCap = (prefix, saveFn, testFn) => {
        const $b = (s) => root.querySelector(s);
        const result = root.querySelector(`#${prefix}-result`);
        const show = (html) => { if (result) result.innerHTML = html; };
        const collect = () => ({
          baseUrl: ($b(`#${prefix}-baseurl`)?.value || '').trim(),
          model: ($b(`#${prefix}-model`)?.value || '').trim(),
          apiKey: ($b(`#${prefix}-key`)?.value || '').trim(),
        });

        $b(`#${prefix}-test`)?.addEventListener('click', async (e) => {
          const btn = e.currentTarget;
          btn.disabled = true;
          btn.textContent = '测试中…';
          show('<div class="tiny dim">正在连接…</div>');
          try {
            const r = await testFn(collect());
            show(r.ok
              ? `<div class="file-unlocked-tip">✅ ${ui.esc(r.message || '连接正常')}</div>`
              : `<div class="warn-note">❌ ${ui.esc(r.message || '连接失败')}</div>`);
          } catch (err) {
            show(`<div class="warn-note">❌ ${ui.esc(err.message)}</div>`);
          } finally {
            btn.disabled = false;
            btn.textContent = '🔌 测试';
          }
        });

        $b(`#${prefix}-save`)?.addEventListener('click', async (e) => {
          const btn = e.currentTarget;
          btn.disabled = true;
          btn.textContent = '保存中…';
          try {
            await saveFn(collect());
            ui.toast('已保存，立即生效', 'ok');
            ctx.refresh ? ctx.refresh() : window.location.reload();
          } catch (err) {
            ui.toast(err.message, 'err');
            btn.disabled = false;
            btn.textContent = '保存';
          }
        });
      };
      bindCap('vis', (b) => service.saveAdminVision(b), (b) => service.testAdminVision(b));
      bindCap('asr', (b) => service.saveAdminAsr(b), (b) => service.testAdminAsr(b));

      $('#ai-clear')?.addEventListener('click', async (e) => {
        const ok = await ui.confirmDialog({ title: '清除 AI 配置', message: '清除后回到内置规则引擎，确定吗？' });
        if (!ok) return;
        e.currentTarget.disabled = true;
        try {
          await service.clearAdminAi();
          ui.toast('已清除', 'ok');
          ctx.refresh ? ctx.refresh() : window.location.reload();
        } catch (err) {
          ui.toast(err.message, 'err');
          e.currentTarget.disabled = false;
        }
      });
    },
  };
}
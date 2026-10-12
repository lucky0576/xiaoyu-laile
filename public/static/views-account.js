/**
 * 小鱼来了 — 登录/注册、个人中心、资质、通讯录、通知、关注、管理后台
 */
import { api, service, store, isLoggedIn } from './api.js';
import * as ui from './ui.js';
import { itemHtml, userCardHtml, fileCardHtml, categoryName } from './components.js';

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
        <a class="chip active" data-tab="phone">手机验证码</a>
        <a class="chip" data-tab="email">邮箱密码</a>
        <a class="chip" data-tab="wechat">微信登录</a>
      </div>

      <div id="pane-phone">
        <div class="field">
          <label>手机号</label>
          <div class="input-group">
            <input class="input" id="lg-phone" type="tel" placeholder="请输入手机号" value="">
            <button class="btn btn-outline" id="lg-send" style="white-space:nowrap">获取验证码</button>
          </div>
        </div>
        <div class="field">
          <label>验证码</label>
          <input class="input" id="lg-code" placeholder="6 位数字验证码">
          <div class="hint" id="lg-code-hint"></div>
        </div>
        <button class="btn btn-primary btn-block" id="lg-submit">登录 / 注册</button>
        <div class="tiny dim mt8 center">未注册的手机号将自动创建账号</div>
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
        <div>或任意手机号用验证码登录（验证码会直接显示）</div>
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

      const sendCode = async () => {
        const phone = root.querySelector('#lg-phone').value.trim();
        const btn = root.querySelector('#lg-send');
        btn.disabled = true;
        try {
          const res = await service.smsSend(phone, 'login');
          root.querySelector('#lg-code-hint').innerHTML = res.demoCode
            ? `演示验证码：<b style="color:var(--brand);font-size:16px">${res.demoCode}</b>（生产环境通过短信下发）`
            : '验证码已发送，请查收短信';
          ui.toast('验证码已发送', 'ok');
          let n = 60;
          const timer = setInterval(() => {
            btn.textContent = `${n--}s`;
            if (n < 0) {
              clearInterval(timer);
              btn.textContent = '获取验证码';
              btn.disabled = false;
            }
          }, 1000);
          if (res.demoCode) root.querySelector('#lg-code').value = res.demoCode;
        } catch (err) {
          ui.toast(err.message, 'err');
          btn.disabled = false;
        }
      };

      root.querySelector('#lg-send')?.addEventListener('click', sendCode);
      root.querySelector('#lg-submit')?.addEventListener('click', async () => {
        const phone = root.querySelector('#lg-phone').value.trim();
        const code = root.querySelector('#lg-code').value.trim();
        if (!phone || !code) return ui.toast('请填写手机号和验证码', 'err');
        try {
          const res = await service.smsLogin({ phone, code, purpose: 'login', invite: query.invite });
          await done(res, res.created ? '注册并登录成功' : '登录成功');
        } catch (err) {
          ui.toast(err.message, 'err');
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

    <div class="card card-pad">
      <div class="strong mb12">账号信息</div>
      <div class="field">
        <label>邮箱 <span style="color:var(--danger)">*</span></label>
        <div class="input-group">
          <input class="input" id="rg-email" type="email" placeholder="you@example.com">
          <button class="btn btn-outline" id="rg-send">获取验证码</button>
        </div>
      </div>
      <div class="field">
        <label>验证码 <span style="color:var(--danger)">*</span></label>
        <input class="input" id="rg-code" placeholder="6 位验证码">
        <div class="hint" id="rg-hint"></div>
      </div>
      <div class="field">
        <label>密码 <span style="color:var(--danger)">*</span></label>
        <input class="input" id="rg-password" type="password" placeholder="至少 6 位">
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
          ${industries.map((i) => `<option value="${ui.esc(i.name)}">${i.icon || ''} ${ui.esc(i.name)}</option>`).join('')}
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
        <label>手机号</label>
        <input class="input" id="rg-phone" type="tel" placeholder="用于接收项目对接通知（选填）">
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
      $('#rg-send').addEventListener('click', async () => {
        const email = $('#rg-email').value.trim();
        const btn = $('#rg-send');
        btn.disabled = true;
        try {
          const res = await service.mailSend(email, 'register');
          $('#rg-hint').innerHTML = res.demoCode
            ? `演示验证码：<b style="color:var(--brand);font-size:16px">${res.demoCode}</b>（未配置 SMTP，正式环境通过邮件发送）`
            : '验证码已发送到邮箱';
          if (res.demoCode) $('#rg-code').value = res.demoCode;
          ui.toast('验证码已发送', 'ok');
        } catch (err) {
          ui.toast(err.message, 'err');
        } finally {
          btn.disabled = false;
        }
      });

      $('#rg-submit').addEventListener('click', async () => {
        if (!$('#rg-agree').checked) return ui.toast('请先同意服务条款', 'err');
        const payload = {
          email: $('#rg-email').value.trim(),
          code: $('#rg-code').value.trim(),
          password: $('#rg-password').value,
          nickname: $('#rg-nickname').value.trim(),
          company: $('#rg-company').value.trim(),
          profession: $('#rg-profession').value.trim(),
          industry: $('#rg-industry').value,
          city: $('#rg-city').value.trim(),
          phone: $('#rg-phone').value.trim(),
          wechatId: $('#rg-wechat').value.trim(),
          invite: query.invite,
        };
        if (!payload.email || !payload.code || !payload.password) return ui.toast('请填写邮箱、验证码和密码', 'err');
        try {
          const res = await service.mailRegister(payload);
          store.token = res.token;
          store.user = res.user;
          await ctx.refreshMe();
          ui.toast('注册成功，欢迎加入！', 'ok');
          ctx.nav('#/me');
        } catch (err) {
          ui.toast(err.message, 'err');
        }
      });
    },
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
      <a class="item" href="#/qualification"><div class="avatar">🛡️</div><div class="item-body"><div class="item-title">企业资质认证</div><div class="item-sub">${verified ? '已通过认证' : u.qualification?.status === 'pending' ? '审核中' : '上传营业执照与资质证书'}</div></div><span class="dim">›</span></a>
      <a class="item" href="#/profile"><div class="avatar">⚙️</div><div class="item-body"><div class="item-title">资料与设置</div><div class="item-sub">头像、企业介绍、通知偏好</div></div><span class="dim">›</span></a>
      <a class="item" href="#/notifications"><div class="avatar">🔔</div><div class="item-body"><div class="item-title">消息通知</div><div class="item-sub">${data.unread || 0} 条未读</div></div><span class="dim">›</span></a>
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
  const res = await service.qualification();
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
          await service.submitQualification(fd);
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
            await service.reviewQualification(qf.dataset.qf, { approve, note });
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

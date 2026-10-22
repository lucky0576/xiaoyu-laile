/**
 * 小鱼来了 — 账号绑定与通讯地址
 *
 * 路由：#/bindings
 * 管理：邮箱、微信、公众号、抖音绑定，以及快递用的通讯地址。
 */

import { service, isLoggedIn, store } from './api.js';
import * as ui from './ui.js';

/* ================================================================== */
/* 绑定行                                                              */
/* ================================================================== */
function bindRow({ icon, name, desc, bound, value, actionText, actionId, locked, extra = '' }) {
  return `<div class="bd-row">
    <div class="bd-ico">${icon}</div>
    <div class="bd-main">
      <div class="bd-name">${ui.esc(name)}${bound ? ' <span class="bd-ok">已绑定</span>' : ''}</div>
      <div class="bd-val">${bound ? ui.esc(value || '') : ui.esc(desc || '')}</div>
      ${extra}
    </div>
    ${
      locked
        ? '<span class="bd-lock">不可解绑</span>'
        : bound
          ? `<button class="btn btn-outline btn-sm" data-unbind="${ui.esc(actionId)}">解绑</button>`
          : `<button class="btn btn-primary btn-sm" data-bind="${ui.esc(actionId)}">${ui.esc(actionText || '去绑定')}</button>`
    }
  </div>`;
}

/* ================================================================== */
/* 页面                                                                */
/* ================================================================== */
export async function renderBindings(ctx) {
  if (!isLoggedIn()) {
    ctx.nav('#/login?redirect=' + encodeURIComponent('#/bindings'));
    return { title: '账号绑定', content: '<div class="page"></div>' };
  }

  const res = await service.bindings().catch(() => null);
  if (!res) {
    return {
      title: '账号绑定',
      content: ui.emptyState('🧭', '加载失败，请检查网络后重试', '<button class="btn btn-primary mt16" onclick="location.reload()">重新加载</button>'),
      showBack: true,
    };
  }
  const b = res.bindings || {};
  const addr = b.address || {};

  const html = `<div class="page">
    <div class="bd-hero">
      <div class="bd-hero-t">账号绑定</div>
      <div class="bd-hero-s">绑定更多方式，账号更安全，也更容易被同行找到。</div>
    </div>

    <div class="card card-pad mt12">
      <div class="strong mb8">登录方式</div>
      ${bindRow({
        icon: '📱', name: '手机号', desc: '建议绑定，用于登录与找回密码',
        bound: b.phone?.bound, value: b.phone?.value, actionId: 'phone', locked: true,
      })}
      ${bindRow({
        icon: '✉️', name: '邮箱', desc: '绑定后可接收项目通知与找回密码',
        bound: b.email?.bound,
        value: `${b.email?.value || ''}${b.email?.verified ? ' · 已验证' : ' · 未验证'}`,
        actionText: '绑定邮箱', actionId: 'email',
      })}
    </div>

    <div class="card card-pad mt12">
      <div class="strong mb8">第三方账号</div>
      ${bindRow({
        icon: '💬', name: '微信', desc: '绑定后可微信一键登录',
        bound: b.wechat?.bound, value: b.wechat?.nickname || '已绑定', actionId: 'wechat',
      })}
      ${bindRow({
        icon: '📣', name: '公众号', desc: '关注并绑定后可接收项目推送',
        bound: b.mp?.bound,
        value: `${b.mp?.nickname || ''}${b.mp?.subscribed ? ' · 已关注' : ''}`,
        actionText: '绑定公众号', actionId: 'mp',
      })}
      ${bindRow({
        icon: '🎵', name: '抖音', desc: '绑定后主页展示抖音号，方便同行联系',
        bound: b.douyin?.bound,
        value: b.douyin?.nickname ? `${b.douyin.nickname}${b.douyin.douyinId ? ' · ' + b.douyin.douyinId : ''}` : '',
        actionText: '绑定抖音', actionId: 'douyin',
      })}
    </div>

    <div class="card card-pad mt12">
      <div class="row between mb8">
        <div class="strong">通讯地址（快递）</div>
        ${addr.filled ? '<span class="bd-ok">已填写</span>' : '<span class="bd-warn">未填写</span>'}
      </div>
      <div class="tiny dim mb12">用于寄送纸质资料、证书、物料等，请填写常用收件地址。</div>

      <div class="field">
        <label>收件人 <span style="color:var(--danger)">*</span></label>
        <input class="input" id="ad-receiver" maxlength="40" placeholder="真实姓名" value="${ui.esc(addr.receiver || '')}">
      </div>
      <div class="field">
        <label>联系电话 <span style="color:var(--danger)">*</span></label>
        <input class="input" id="ad-phone" maxlength="20" placeholder="手机号" value="${ui.esc(addr.phone || '')}">
      </div>
      <div class="row gap8">
        <div class="field" style="flex:1">
          <label>省</label>
          <input class="input" id="ad-province" maxlength="40" placeholder="如：浙江省" value="${ui.esc(addr.province || '')}">
        </div>
        <div class="field" style="flex:1">
          <label>市</label>
          <input class="input" id="ad-city" maxlength="40" placeholder="如：杭州市" value="${ui.esc(addr.city || '')}">
        </div>
        <div class="field" style="flex:1">
          <label>区/县</label>
          <input class="input" id="ad-district" maxlength="40" placeholder="如：西湖区" value="${ui.esc(addr.district || '')}">
        </div>
      </div>
      <div class="field">
        <label>详细地址 <span style="color:var(--danger)">*</span></label>
        <textarea class="input" id="ad-detail" rows="2" maxlength="300" placeholder="街道、门牌号、楼栋、房间号">${ui.esc(addr.detail || '')}</textarea>
      </div>
      <div class="field">
        <label>邮政编码</label>
        <input class="input" id="ad-zip" maxlength="10" placeholder="选填" value="${ui.esc(addr.zip || '')}">
      </div>
      <button class="btn btn-primary btn-block mt8" id="ad-save">保存地址</button>
      ${addr.filled ? `<button class="btn btn-ghost btn-block mt8" id="ad-clear">清空地址</button>` : ''}
    </div>
  </div>`;

  return {
    title: '账号绑定',
    content: html,
    showBack: true,
    async mount(root) {
      const $ = (s) => root.querySelector(s);
      const reload = () => ctx.nav('#/bindings', { replace: true });

      /* ---------------- 邮箱绑定 ---------------- */
      const bindEmail = async () => {
        const email = await ui.promptDialog({
          title: '绑定邮箱',
          label: '请输入邮箱地址',
          placeholder: 'you@example.com',
          okText: '发送验证码',
        });
        if (!email) return;
        try {
          const r = await service.emailBindSendCode(email);
          const hint = r.demoCode ? `（未配置邮件服务，验证码：${r.demoCode}）` : '';
          const code = await ui.promptDialog({
            title: '绑定邮箱',
            label: `请输入收到的验证码${hint}`,
            placeholder: r.demoCode || '6 位数字',
            okText: '确认绑定',
          });
          if (!code) return;
          await service.emailBind({ email, code });
          ui.toast('邮箱绑定成功', 'ok');
          reload();
        } catch (err) {
          ui.toast(err.message || '绑定失败', 'err');
        }
      };

      /* ---------------- 公众号绑定 ---------------- */
      const bindMp = async () => {
        const ok = await ui.confirmDialog({
          title: '绑定公众号',
          message:
            res.wechatConfigured
              ? '将跳转微信授权，确认关注并绑定公众号？'
              : '当前未配置公众号 AppID，将以演示模式绑定（仅用于体验流程）。继续？',
          okText: '继续绑定',
        });
        if (!ok) return;
        try {
          await service.bindMp({ nickname: store.user?.nickname || '公众号用户' });
          ui.toast('公众号绑定成功', 'ok');
          reload();
        } catch (err) {
          ui.toast(err.message || '绑定失败', 'err');
        }
      };

      /* ---------------- 抖音绑定 ---------------- */
      const bindDouyin = async () => {
        const douyinId = await ui.promptDialog({
          title: '绑定抖音',
          label: res.douyinConfigured ? '请输入抖音号' : '请输入你的抖音号（未接入开放平台，按抖音号绑定）',
          placeholder: '如：xiaoyu2026',
          okText: '下一步',
        });
        if (!douyinId) return;
        const nickname = await ui.promptDialog({
          title: '绑定抖音',
          label: '抖音昵称（选填）',
          placeholder: '如：小鱼说新能源',
          okText: '确认绑定',
        });
        try {
          await service.bindDouyin({ douyinId, nickname: nickname || '' });
          ui.toast('抖音绑定成功', 'ok');
          reload();
        } catch (err) {
          ui.toast(err.message || '绑定失败', 'err');
        }
      };

      /* ---------------- 微信绑定（跳转已有页面） ---------------- */
      const bindWechat = () => {
        ctx.nav('#/bind-wechat');
      };

      /* ---------------- 解绑 ---------------- */
      const unbind = async (type) => {
        const label = { email: '邮箱', mp: '公众号', douyin: '抖音', wechat: '微信' }[type] || type;
        const ok = await ui.confirmDialog({
          title: `解绑${label}`,
          message: `确定要解绑${label}吗？`,
          okText: '解绑',
          danger: true,
        });
        if (!ok) return;
        try {
          if (type === 'wechat') {
            await service.wechatUnbind();
          } else {
            await service.unbind(type);
          }
          ui.toast(`已解绑${label}`, 'ok');
          reload();
        } catch (err) {
          ui.toast(err.message || '解绑失败', 'err');
        }
      };

      const ACTIONS = { email: bindEmail, mp: bindMp, douyin: bindDouyin, wechat: bindWechat };

      root.querySelectorAll('[data-bind]').forEach((el) => {
        el.addEventListener('click', () => {
          const fn = ACTIONS[el.dataset.bind];
          if (fn) fn();
        });
      });
      root.querySelectorAll('[data-unbind]').forEach((el) => {
        el.addEventListener('click', () => unbind(el.dataset.unbind));
      });

      /* ---------------- 地址保存 ---------------- */
      $('#ad-save')?.addEventListener('click', async () => {
        const body = {
          receiver: ($('#ad-receiver').value || '').trim(),
          phone: ($('#ad-phone').value || '').trim(),
          province: ($('#ad-province').value || '').trim(),
          city: ($('#ad-city').value || '').trim(),
          district: ($('#ad-district').value || '').trim(),
          detail: ($('#ad-detail').value || '').trim(),
          zip: ($('#ad-zip').value || '').trim(),
        };
        if (!body.receiver) return ui.toast('请填写收件人', 'err');
        if (!body.phone) return ui.toast('请填写联系电话', 'err');
        if (!body.detail) return ui.toast('请填写详细地址', 'err');

        const btn = $('#ad-save');
        btn.disabled = true;
        btn.textContent = '保存中…';
        try {
          await service.saveAddress(body);
          ui.toast('地址已保存', 'ok');
          reload();
        } catch (err) {
          ui.toast(err.message || '保存失败', 'err');
          btn.disabled = false;
          btn.textContent = '保存地址';
        }
      });

      $('#ad-clear')?.addEventListener('click', async () => {
        const ok = await ui.confirmDialog({ title: '清空地址', message: '确定清空已填写的通讯地址？', danger: true, okText: '清空' });
        if (!ok) return;
        try {
          await service.clearAddress();
          ui.toast('已清空', 'ok');
          reload();
        } catch (err) {
          ui.toast(err.message || '操作失败', 'err');
        }
      });
    },
  };
}

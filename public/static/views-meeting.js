/**
 * 小鱼来了 — 会议视图（会前预览 + 会议中，交互参考腾讯会议）
 *
 * 入口：
 *   #/join              输入会议号加入
 *   #/join?n=123456789  邀请链接直达
 *   #/meeting/:id       会议页（会前预览 → 进入会议）
 *   #/meeting/:id?joined=1  从会议号加入后直接进会
 */
import { api, service, store, isLoggedIn } from './api.js';
import * as ui from './ui.js';
import { MeetingRoom, transcriptHtml, minutesHtml } from './meeting.js';
import { renderPoster, downloadCanvas, isWechatBrowser } from './share.js';

/* ================================================================== */
/* 邀请面板（会议 / 群聊共用）                                          */
/* ================================================================== */
export async function openInviteSheet(payload) {
  const isMeeting = payload.kind === 'meeting';
  const title = isMeeting ? payload.title : payload.name;
  const sub = isMeeting
    ? `${payload.hostName || ''} 邀请你参加会议`
    : `${payload.memberCount || 0} 人群聊`;

  const content = `
    <div class="invite-card" id="invite-card">
      <div class="t">${ui.esc(title)}</div>
      <div class="h">${ui.esc(sub)}</div>
      ${isMeeting ? `<div class="p">会议号</div><div class="n">${ui.esc(payload.number || '')}</div>
        ${payload.password ? `<div class="p">入会密码 ${ui.esc(payload.password)}</div>` : ''}` : ''}
      <img id="invite-qr" src="${ui.esc(payload.qr)}" alt="二维码">
      <div class="tip">长按识别二维码，或复制链接发给好友</div>
    </div>

    <div class="chips mt12" id="invite-modes">
      ${(payload.modes || []).map((m, i) => `<a class="chip ${i === 0 ? 'active' : ''}" data-mode="${i}">${ui.esc(m.name)}</a>`).join('')}
    </div>
    <div class="share-preview mt12" id="invite-text">${ui.esc((payload.modes || [])[0]?.text || '')}</div>

    <div class="row gap8 mt12">
      <button class="btn btn-primary grow" id="invite-copy">复制邀请文案</button>
      <button class="btn grow" id="invite-save">保存邀请卡</button>
    </div>
    <div class="row gap8 mt8">
      <button class="btn btn-primary grow" id="invite-wechat">💚 转发到微信</button>
      <button class="btn grow" id="invite-native">系统分享</button>
    </div>
    <div class="row gap8 mt8">
      <button class="btn grow" id="invite-link">复制链接</button>
      <button class="btn grow" id="invite-sms">复制会议号</button>
    </div>
    ${isWechatBrowser() ? '<div class="tiny dim center mt8">在微信内点右上角「···」可直接转发给好友或分享到朋友圈</div>' : ''}`;

  ui.openSheet({
    title: isMeeting ? '邀请加入会议' : '邀请加入群聊',
    content,
    onMount(sheet, close) {
      let modeIdx = 0;
      const modes = payload.modes || [];

      sheet.addEventListener('click', (e) => {
        const chip = e.target.closest('[data-mode]');
        if (!chip) return;
        modeIdx = Number(chip.dataset.mode);
        sheet.querySelectorAll('#invite-modes .chip').forEach((el) => el.classList.toggle('active', el === chip));
        sheet.querySelector('#invite-text').textContent = modes[modeIdx]?.text || '';
      });

      sheet.querySelector('#invite-copy').addEventListener('click', async () => {
        const ok = await ui.copyText(modes[modeIdx]?.text || '');
        ui.toast(ok ? '邀请文案已复制，可直接粘贴到微信' : '复制失败，请手动选择', ok ? 'ok' : 'err');
      });

      sheet.querySelector('#invite-link').addEventListener('click', async () => {
        const ok = await ui.copyText(payload.url);
        ui.toast(ok ? '链接已复制' : '复制失败', ok ? 'ok' : 'err');
      });

      /* ---------------- 转发到微信（文字 + 链接） ---------------- */
      sheet.querySelector('#invite-wechat').addEventListener('click', async () => {
        const text = modes[modeIdx]?.text || '';
        // 微信内：设置分享卡片后引导用户点右上角
        if (isWechatBrowser()) {
          try {
            const cfg = await service.wechatJsConfig(payload.url);
            const wx = window.wx;
            if (cfg && cfg.appId && wx) {
              wx.config({
                debug: false,
                appId: cfg.appId,
                timestamp: cfg.timestamp,
                nonceStr: cfg.nonceStr,
                signature: cfg.signature,
                jsApiList: ['updateAppMessageShareData', 'updateTimelineShareData'],
              });
              const shareData = {
                title: `${title} · 会议邀请`,
                desc: text.replace(/\n/g, ' ').slice(0, 100),
                link: payload.url,
                imgUrl: location.origin + '/static/icon-512.png',
              };
              wx.ready(() => {
                wx.updateAppMessageShareData({ ...shareData, success() {} });
                wx.updateTimelineShareData({ title: shareData.title, link: shareData.link, imgUrl: shareData.imgUrl });
              });
            }
          } catch {
            /* 没配公众号也不影响复制 */
          }
          const ok = await ui.copyText(text);
          ui.toast(ok ? '文案已复制，点右上角「···」转发给微信好友' : '请长按文案手动复制', ok ? 'ok' : 'err');
          return;
        }

        // 微信外：复制文案 + 给扫码引导
        const copied = await ui.copyText(text);
        ui.openSheet({
          title: '转发到微信',
          content: `<div class="invite-card">
              <div class="t">${ui.esc(title)}</div>
              <div class="h">${ui.esc(isMeeting ? (payload.hostName || '') + ' 邀请你参加会议' : '邀请你加入群聊')}</div>
              ${isMeeting && payload.number ? `<div class="p">会议号</div><div class="n">${ui.esc(payload.number)}</div>` : ''}
              <img src="${ui.esc(payload.qr)}" alt="二维码">
              <div class="tip">用手机微信「扫一扫」打开，再点右上角「···」转发给好友</div>
            </div>
            <div class="share-preview mt12">${ui.esc(text)}</div>
            <div class="row gap8 mt12">
              <button class="btn btn-primary grow" id="wx-copy-again">再复制一次文案</button>
            </div>
            <div class="tiny dim center mt8">${copied ? '文案已复制到剪贴板，可直接粘贴到微信' : '请长按上方文案手动复制'}</div>`,
          onMount(sheet2) {
            sheet2.querySelector('#wx-copy-again').addEventListener('click', async () => {
              const ok = await ui.copyText(text);
              ui.toast(ok ? '已复制' : '复制失败', ok ? 'ok' : 'err');
            });
          },
        });
      });

      sheet.querySelector('#invite-sms').addEventListener('click', async () => {
        const ok = await ui.copyText(isMeeting ? String(payload.number || '') : payload.url);
        ui.toast(ok ? '会议号已复制' : '复制失败', ok ? 'ok' : 'err');
      });

      sheet.querySelector('#invite-native').addEventListener('click', async () => {
        if (navigator.share) {
          try {
            await navigator.share({ title, text: modes[modeIdx]?.text || '', url: payload.url });
            return;
          } catch { /* 用户取消 */ }
        }
        const ok = await ui.copyText(payload.url);
        ui.toast(ok ? '已复制链接' : '当前浏览器不支持系统分享', ok ? 'ok' : 'err');
      });

      sheet.querySelector('#invite-save').addEventListener('click', async () => {
        const btn = sheet.querySelector('#invite-save');
        btn.disabled = true;
        btn.textContent = '生成中…';
        try {
          const canvas = await renderPoster({
            title,
            subtitle: isMeeting ? `会议号 ${payload.number}${payload.password ? ` · 密码 ${payload.password}` : ''}` : `${payload.memberCount || 0} 人群聊`,
            summary: isMeeting ? `${payload.hostName || ''} 邀请你参加会议` : '点击链接或扫码加入群聊',
            qrText: payload.qr,
            coverUrl: '',
            meta: [isMeeting ? '小鱼来了 · 会议' : '小鱼来了 · 群聊'],
          });
          await downloadCanvas(canvas, `${title.slice(0, 16)}-邀请卡.png`);
          ui.toast('邀请卡已保存', 'ok');
        } catch (err) {
          ui.toast(`生成失败：${err.message}`, 'err');
        } finally {
          btn.disabled = false;
          btn.textContent = '保存邀请卡';
        }
      });
      void close;
    },
  });
}

/* ================================================================== */
/* 会议号加入页                                                        */
/* ================================================================== */
export async function renderJoin(ctx, params) {
  const preset = String(params.n || params.number || '').replace(/\D/g, '');
  const html = `<div class="page">
    <div class="join-hero">
      <div class="ico">📹</div>
      <h1 style="font-size:21px;margin-top:8px">加入会议</h1>
      <div class="small muted">输入会议号即可加入，无需事先添加好友</div>
    </div>

    <div class="card card-pad">
      <div class="field">
        <label>会议号</label>
        <input class="join-code" id="join-number" inputmode="numeric" maxlength="11"
               placeholder="9 位数字" value="${ui.esc(preset)}">
      </div>
      <div class="field">
        <label>你的昵称</label>
        <input class="input" id="join-name" maxlength="20" placeholder="进入会议后显示的名字"
               value="${ui.esc(ctx.state.user?.nickname || '')}">
      </div>
      <div id="join-preview" class="mt12"></div>
    </div>

    <div class="card card-pad mt12">
      <div class="strong mb8">或者</div>
      <div class="row gap8" style="flex-wrap:wrap">
        <a class="btn btn-sm" href="#/chat">我的会议与群聊</a>
        <a class="btn btn-sm" href="#/publish">发起一个新会议</a>
      </div>
      <div class="tiny dim mt8">会议号由发起人在会议页复制分享；也可以直接打开对方发来的邀请链接。</div>
    </div>
  </div>`;

  return {
    title: '加入会议',
    content: html,
    showBack: true,
    noTab: false,
    activeTab: 'chat',
    async mount(root) {
      const $ = (s) => root.querySelector(s);
      const numberEl = $('#join-number');
      const previewEl = $('#join-preview');
      let looked = null;

      const lookup = async () => {
        const n = numberEl.value.replace(/\D/g, '');
        if (n.length < 6) {
          previewEl.innerHTML = '';
          looked = null;
          return;
        }
        previewEl.innerHTML = '<div class="tiny dim">正在查询会议…</div>';
        try {
          const info = await service.lookupMeeting(n);
          looked = info;
          previewEl.innerHTML = `
            <div class="card card-pad" style="background:var(--brand-050);border-color:#cfe0ff">
              <div class="row between">
                <div class="strong">${ui.esc(info.title)}</div>
                <span class="badge ${info.status === 'ended' ? 'gray' : info.status === 'live' ? 'danger' : ''}">
                  ${info.status === 'ended' ? '已结束' : info.status === 'live' ? '进行中' : '待开始'}
                </span>
              </div>
              <div class="tiny dim mt8">主持人：${ui.esc(info.hostName)} · ${info.joinedCount} 人在会</div>
              ${info.hasPassword ? `<div class="field mt12"><label>入会密码</label>
                <input class="input" id="join-password" maxlength="20" placeholder="请输入主持人提供的入会密码"></div>` : ''}
              ${info.status === 'ended' ? '<div class="small" style="color:var(--danger)">该会议已结束，无法加入</div>' : ''}
            </div>`;
        } catch (err) {
          looked = null;
          previewEl.innerHTML = `<div class="card card-pad" style="background:var(--danger-050);border-color:#f7c9c9">
            <div class="small" style="color:var(--danger)">${ui.esc(err.message)}</div></div>`;
        }
      };

      numberEl.addEventListener('input', ui.debounce(lookup, 500));
      if (preset) await lookup();

      const doJoin = async () => {
        if (!isLoggedIn()) {
          ctx.nav(`#/login?redirect=${encodeURIComponent(location.hash)}`);
          return;
        }
        const n = numberEl.value.replace(/\D/g, '');
        if (n.length < 6) return ui.toast('请输入正确的会议号', 'err');
        const name = $('#join-name').value.trim() || ctx.state.user?.nickname || '参会人';
        const password = $('#join-password')?.value?.trim() || '';
        ui.showLoading('正在加入会议…');
        try {
          const res = await service.joinByNumber({ number: n, password, name });
          ui.hideLoading();
          ctx.nav(`#/meeting/${res.meeting.id}?joined=1`);
        } catch (err) {
          ui.hideLoading();
          ui.toast(err.message, 'err');
        }
      };

      previewEl.addEventListener('click', (e) => {
        if (e.target.closest('#join-submit')) doJoin();
      });
      // 预览卡片渲染后补一个按钮
      const observer = new MutationObserver(() => {
        const box = previewEl.querySelector('.card.card-pad');
        if (box && looked && looked.status !== 'ended' && !box.querySelector('#join-submit')) {
          box.insertAdjacentHTML('beforeend', '<button class="btn btn-primary btn-block mt12" id="join-submit">进入会议</button>');
        }
      });
      observer.observe(previewEl, { childList: true, subtree: true });

      root.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && document.activeElement === numberEl) lookup();
      });
    },
  };
}

/* ================================================================== */
/* 会议页                                                              */
/* ================================================================== */
export async function renderMeeting(ctx, params) {
  const id = params.id;
  const redirect = `#/meeting/${id}`;
  if (!isLoggedIn()) {
    ctx.nav(`#/login?redirect=${encodeURIComponent(redirect)}`);
    return { title: '会议', content: '<div class="page"></div>', noTab: true };
  }

  const data = await service.meeting(id);
  const m = data.meeting;

  // 已结束
  if (m.status === 'ended') {
    return {
      title: m.title,
      content: `<div class="page"><div class="card card-pad center">
        <div style="font-size:44px">📴</div>
        <h2 class="mt8">会议已结束</h2>
        <div class="small muted mt8">${ui.esc(m.title)} · 会议号 ${ui.esc(m.number || '')}</div>
        <div class="row gap8 mt16" style="justify-content:center">
          <a class="btn" href="#/chat">返回消息</a>
        </div>
      </div></div>`,
      showBack: true,
      noTab: false,
      activeTab: 'chat',
    };
  }

  const direct = params.joined === '1' || params.joined === 1;
  const html = `<div id="mt-host"></div>`;

  return {
    title: m.title,
    content: html,
    fullscreen: direct,
    noTab: direct,
    activeTab: 'chat',
    async mount(root) {
      const host = root.querySelector('#mt-host');
      if (direct) {
        await mountRoom(host, ctx, id, m);
      } else {
        mountLobby(host, ctx, id, m);
      }
    },
  };
}

/* ------------------------------------------------------------------ */
/* 会前预览（Lobby）                                                    */
/* ------------------------------------------------------------------ */
function mountLobby(host, ctx, id, m) {
  const userName = ctx.state.user?.nickname || '参会人';
  host.innerHTML = `<div class="lobby">
    <div class="row between mb12">
      <div class="grow">
        <div class="strong" style="font-size:17px">${ui.esc(m.title)}</div>
        <div class="tiny dim">会议号 ${ui.esc(m.number || '')} · 主持人 ${ui.esc(m.hostName || '')}${m.password ? ` · 入会密码 ${ui.esc(m.password)}` : ''}</div>
      </div>
      <button class="icon-btn" id="lb-back" style="color:var(--text-2)">✕</button>
    </div>

    <div class="lobby-stage">
      <video id="lb-video" autoplay playsinline muted></video>
      <div class="placeholder" id="lb-placeholder">
        <div class="ico">📷</div>
        <div class="small">摄像头已关闭</div>
        <div class="tiny dim mt8">点击下方「摄像头」按钮开启预览</div>
      </div>
      <div class="lobby-preview-tag" id="lb-tag">${ui.esc(userName)}</div>
    </div>

    <div class="lobby-toggles">
      <button class="lobby-toggle off" id="lb-mic"><span>🎤</span><span id="lb-mic-text">麦克风已关</span></button>
      <button class="lobby-toggle off" id="lb-cam"><span>📹</span><span id="lb-cam-text">摄像头已关</span></button>
    </div>
    <div class="lobby-mic-bar"><i id="lb-level"></i></div>

    <div id="lb-media-err" class="media-err hide">
      <div class="media-err-t">⚠️ 无法打开摄像头/麦克风</div>
      <div class="media-err-b" id="lb-media-err-text"></div>
      <div class="row gap8 mt8">
        <button class="btn btn-sm btn-primary grow" id="lb-media-retry">重试</button>
        <button class="btn btn-sm grow" id="lb-media-skip">静音静画加入</button>
      </div>
    </div>

    <div class="field mt16">
      <label>入会昵称</label>
      <input class="input" id="lb-name" maxlength="20" value="${ui.esc(userName)}">
    </div>

    <button class="btn btn-primary btn-block" id="lb-join" style="height:50px;font-size:16px">加入会议</button>

    <div class="card card-pad mt16">
      <div class="small muted">
        <div>· 会议中可随时开关摄像头、麦克风，支持屏幕共享</div>
        <div>· 主持人可全体静音、锁定会议、移除成员</div>
        <div>· 会议支持实时转写与 AI 纪要，结束后自动生成双方跟进事项</div>
      </div>
    </div>
  </div>`;

  const $ = (s) => host.querySelector(s);
  let micOn = false;
  let camOn = false;
  let previewStream = null;

  const stopPreview = () => {
    if (previewStream) {
      for (const t of previewStream.getTracks()) t.stop();
      previewStream = null;
    }
    const v = $('#lb-video');
    if (v) v.srcObject = null;
  };

  const hideMediaErr = () => {
    const box = $('#lb-media-err');
    if (box) box.classList.add('hide');
  };

  const refreshUi = () => {
    $('#lb-mic').className = `lobby-toggle ${micOn ? 'on' : 'off'}`;
    $('#lb-cam').className = `lobby-toggle ${camOn ? 'on' : 'off'}`;
    $('#lb-mic-text').textContent = micOn ? '麦克风已开' : '麦克风已关';
    $('#lb-cam-text').textContent = camOn ? '摄像头已开' : '摄像头已关';
    $('#lb-placeholder').style.display = camOn ? 'none' : '';
  };

  const startPreview = async () => {
    stopPreview();
    try {
      previewStream = await navigator.mediaDevices.getUserMedia({ audio: micOn, video: camOn });
      const v = $('#lb-video');
      v.srcObject = previewStream;
      if (camOn) v.play().catch(() => {});
      // 麦克风电平
      if (micOn) {
        const ac = new (window.AudioContext || window.webkitAudioContext)();
        const src = ac.createMediaStreamSource(previewStream);
        const an = ac.createAnalyser();
        an.fftSize = 256;
        src.connect(an);
        const buf = new Uint8Array(an.frequencyBinCount);
        const tick = () => {
          if (!previewStream || !micOn) return;
          an.getByteFrequencyData(buf);
          let sum = 0;
          for (const b of buf) sum += b;
          const level = Math.min(100, Math.round((sum / buf.length) * 2.4));
          const el = $('#lb-level');
          if (el) el.style.width = `${level}%`;
          requestAnimationFrame(tick);
        };
        tick();
      }
    } catch (err) {
      micOn = false;
      camOn = false;
      refreshUi();
      const box = $('#lb-media-err');
      const txt = $('#lb-media-err-text');
      if (box && txt) {
        txt.textContent = mediaErrorHint(err);
        box.classList.remove('hide');
      }
      ui.toast('摄像头/麦克风打开失败', 'err');
    }
    refreshUi();
    if (previewStream) hideMediaErr();
  };

  $('#lb-media-retry')?.addEventListener('click', async () => {
    micOn = true;
    await startPreview();
    if (previewStream) ui.toast('设备已就绪', 'ok');
  });
  $('#lb-media-skip')?.addEventListener('click', () => {
    micOn = false;
    camOn = false;
    stopPreview();
    refreshUi();
    hideMediaErr();
    ui.toast('已静音静画进入，入会后可随时开启', '');
  });

  $('#lb-back').addEventListener('click', () => ctx.nav('#/chat'));
  $('#lb-mic').addEventListener('click', () => { micOn = !micOn; startPreview(); });
  $('#lb-cam').addEventListener('click', () => { camOn = !camOn; startPreview(); });
  $('#lb-name').addEventListener('input', () => { $('#lb-tag').textContent = $('#lb-name').value || '我'; });
  $('#lb-join').addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    btn.disabled = true;
    btn.textContent = '正在进入…';
    stopPreview();
    try {
      const name = $('#lb-name').value.trim() || userName;
      const res = await service.joinMeeting(id, { name, muted: !micOn, cameraOff: !camOn });
      await mountRoom(host, ctx, id, res.meeting, { micOn, camOn });
    } catch (err) {
      ui.toast(err.message, 'err');
      btn.disabled = false;
      btn.textContent = '加入会议';
    }
  });

  startPreview();
}

/* ------------------------------------------------------------------ */
/* 会议中                                                              */
/* ------------------------------------------------------------------ */
async function mountRoom(host, ctx, id, meeting, initial = {}) {
  const me = ctx.state.user?.id || 'me';
  let state = {
    meeting,
    micOn: initial.micOn ?? !(meeting.myState?.muted ?? meeting.settings?.muteOnJoin ?? true),
    camOn: initial.camOn ?? !(meeting.myState?.cameraOff ?? meeting.settings?.cameraOffOnJoin ?? true),
    sharing: false,
    panel: '',
    chat: [],
    elapsed: 0,
  };

  host.innerHTML = `
    <div class="mt-room">
      <header class="mt-top">
        <span class="mt-dot" id="mt-net"></span>
        <div class="mt-title">${ui.esc(meeting.title)}</div>
        <span class="mt-rec" id="mt-rec" style="display:none"><span class="rec-dot"></span>录音中</span>
        <span class="mt-timer" id="mt-timer">00:00:00</span>
        <div class="mt-no" id="mt-no" title="点击复制会议号">📋 ${ui.esc(meeting.number || '')}</div>
        <button class="icon-btn" id="mt-close" style="color:#9fb0c9">✕</button>
      </header>

      <div class="mt-stage">
        <div class="mt-grid" id="mt-grid" data-count="1"></div>
        <aside class="mt-side" id="mt-side" style="display:none">
          <div class="mt-side-head">
            <div class="mt-tab active" data-panel="members">成员 <span id="mt-mcount">0</span></div>
            <div class="mt-tab" data-panel="chat">聊天</div>
            <div class="mt-tab" data-panel="minutes">纪要</div>
            ${meeting.canManage ? '<div class="mt-tab" data-panel="settings">设置</div>' : ''}
          </div>
          <div class="mt-side-body" id="mt-side-body"></div>
        </aside>
      </div>

      <footer class="mt-bar">
        <button class="mt-btn" id="btn-mic"><span class="i">🎤</span><span id="btn-mic-t">静音</span></button>
        <button class="mt-btn" id="btn-cam"><span class="i">📹</span><span id="btn-cam-t">视频</span></button>
        <button class="mt-btn" id="btn-share"><span class="i">🖥️</span><span>共享</span></button>
        <button class="mt-btn" id="btn-members"><span class="i">👥</span><span>成员</span></button>
        <button class="mt-btn" id="btn-chat"><span class="i">💬</span><span>聊天</span></button>
        <button class="mt-btn" id="btn-hand"><span class="i">✋</span><span>举手</span></button>
        <button class="mt-btn" id="btn-invite"><span class="i">🔗</span><span>邀请</span></button>
        <button class="mt-btn" id="btn-transcript"><span class="i">📝</span><span>记录</span></button>
        <button class="mt-btn" id="btn-record"><span class="i">🎙️</span><span>录音</span></button>
        <button class="mt-btn danger" id="btn-leave"><span class="i">📴</span><span>离开</span></button>
      </footer>
    </div>`;

  const $ = (s) => host.querySelector(s);

  /* ---------------- 参与者 / 视频格 ---------------- */
  let participants = meeting.participants || [];

  const joined = () => participants.filter((p) => p.joined || p.userId === me);

  const tileHtml = (p) => {
    const isSelf = p.userId === me;
    const hasVideo = isSelf ? state.camOn : !p.cameraOff;
    return `<div class="mt-tile ${isSelf ? 'self' : ''}" data-uid="${ui.esc(p.userId)}" id="tile-${ui.esc(p.userId)}">
      ${hasVideo ? `<video autoplay playsinline ${isSelf ? 'muted' : ''}></video>`
        : `<div class="mt-avatar">${ui.esc(ui.initials(p.name))}</div>`}
      <div class="mt-flags">
        ${p.handUp ? '<span class="mt-flag" title="举手">✋</span>' : ''}
        ${(isSelf ? !state.micOn : p.muted) ? '<span class="mt-flag" title="已静音">🔇</span>' : ''}
      </div>
      <div class="mt-label"><span>${ui.esc(p.name)}</span>${p.role === 'host' ? '<span style="opacity:.7">· 主持人</span>' : ''}${isSelf ? '<span style="opacity:.7">· 我</span>' : ''}</div>
    </div>`;
  };

  const renderGrid = () => {
    const list = joined();
    const grid = $('#mt-grid');
    grid.dataset.count = String(Math.min(16, list.length || 1));
    grid.className = `mt-grid${state.sharing ? ' screen' : ''}`;
    grid.innerHTML = list.map(tileHtml).join('') || tileHtml({ userId: me, name: ctx.state.user?.nickname || '我', role: 'host' });
    // 重新挂载本地视频
    const selfTile = grid.querySelector(`#tile-${cssEscape(me)} video`);
    if (selfTile && room.localStream) {
      selfTile.srcObject = room.localStream;
      selfTile.play().catch(() => {});
    }
    $('#mt-mcount').textContent = String(list.length);
    renderMembers();
  };

  const renderMembers = () => {
    if (state.panel !== 'members') return;
    const body = $('#mt-side-body');
    const list = participants;
    body.innerHTML = list.map((p) => `<div class="mt-member">
      <div class="avatar sm">${ui.esc(ui.initials(p.name))}</div>
      <div class="nm">${ui.esc(p.name)} ${p.userId === me ? '<span class="role">我</span>' : ''}</div>
      <div class="role">${p.role === 'host' ? '主持人' : p.joined ? '已入会' : '未入会'}</div>
      <span class="mini">${p.handUp ? '✋' : ''}${p.muted ? '🔇' : '🎤'}</span>
      ${meeting.canManage && p.userId !== me && p.role !== 'host'
        ? `<button class="icon-btn" data-kick="${ui.esc(p.userId)}" title="移出会议" style="font-size:13px;color:#ff7b7b">✕</button>` : ''}
    </div>`).join('');
  };

  const renderPanel = () => {
    const side = $('#mt-side');
    const body = $('#mt-side-body');
    host.querySelectorAll('.mt-tab').forEach((t) => t.classList.toggle('active', t.dataset.panel === state.panel));
    if (!state.panel) {
      side.classList.remove('open');
      side.style.display = 'none';
      return;
    }
    side.style.display = 'flex';
    side.classList.add('open');

    if (state.panel === 'members') return renderMembers();

    if (state.panel === 'chat') {
      body.innerHTML = `<div class="mt-chat">
        <div class="mt-chat-list" id="mt-chat-list">${state.chat.map(chatHtml).join('') || '<div class="tiny dim center" style="padding:16px">还没有聊天消息</div>'}</div>
        <div class="mt-chat-input"><input id="mt-chat-text" placeholder="发送消息（所有人可见）" maxlength="500"><button class="btn btn-sm btn-primary" id="mt-chat-send">发送</button></div>
      </div>`;
      const list = $('#mt-chat-list');
      if (list) list.scrollTop = list.scrollHeight;
      const input = $('#mt-chat-text');
      const send = async () => {
        const text = input.value.trim();
        if (!text) return;
        input.value = '';
        try {
          const res = await service.sendMeetingChat(id, text);
          pushChat(res.entry);
        } catch (err) {
          ui.toast(err.message, 'err');
        }
      };
      $('#mt-chat-send').addEventListener('click', send);
      input.addEventListener('keydown', (e) => { if (e.key === 'Enter') send(); });
      return;
    }

    if (state.panel === 'minutes') {
      body.innerHTML = `
        <div class="row between mb8">
          <div class="strong" style="font-size:13px">实时记录</div>
          <span class="tiny dim" id="mt-tr-status">未开始</span>
        </div>
        <div class="transcript" id="mt-tr-box">${transcriptHtml(state.meeting.transcript || [])}</div>
        <div class="row gap8 mt8">
          <input class="input" id="mt-tr-input" placeholder="手动补一条记录…" style="background:#262b35;border:none;color:#e8ecf3">
          <button class="btn btn-sm btn-primary" id="mt-tr-add">添加</button>
        </div>
        <div class="row between mb8 mt16">
          <div class="strong" style="font-size:13px">AI 纪要</div>
          <button class="btn btn-sm btn-primary" id="mt-minutes">生成</button>
        </div>
        <div id="mt-minutes-box">${minutesHtml(state.meeting.minutes)}</div>`;
      bindTranscriptPanel();
      bindMinutesPanel();
      return;
    }

    if (state.panel === 'settings') {
      const s = state.meeting.settings || {};
      body.innerHTML = `
        <div class="strong mb12" style="font-size:13px">会议设置（主持人）</div>
        ${switchRow('入会即静音', 'muteOnJoin', s.muteOnJoin !== false)}
        ${switchRow('入会即关摄像头', 'cameraOffOnJoin', s.cameraOffOnJoin !== false)}
        ${switchRow('允许参会人聊天', 'allowChat', s.allowChat !== false)}
        ${switchRow('允许未受邀者加入', 'allowGuest', s.allowGuest !== false)}
        ${switchRow('锁定会议', 'locked', Boolean(s.locked))}
        <div class="field mt16">
          <label style="color:#9fb0c9">入会密码</label>
          <input class="input" id="mt-pwd" value="${ui.esc(state.meeting.password || '')}" placeholder="留空表示无需密码"
                 style="background:#262b35;border:none;color:#e8ecf3">
        </div>
        <button class="btn btn-primary btn-block" id="mt-save-settings">保存设置</button>
        <button class="btn btn-block mt8" id="mt-mute-all">全体静音</button>
        <div class="tiny dim mt12" style="line-height:1.9">
          会议号：${ui.esc(state.meeting.number || '')}<br>
          参会 ${participants.length} 人 · 在会 ${joined().length} 人
        </div>`;
      body.querySelectorAll('[data-setting]').forEach((el) => {
        el.addEventListener('change', () => {
          const key = el.dataset.setting;
          service.meetingSettings(id, { [key]: el.checked })
            .then((r) => { state.meeting = r.meeting; ui.toast('已更新', 'ok'); })
            .catch((e) => ui.toast(e.message, 'err'));
        });
      });
      $('#mt-save-settings').addEventListener('click', async () => {
        try {
          const r = await service.meetingSettings(id, { password: $('#mt-pwd').value.trim() });
          state.meeting = r.meeting;
          ui.toast('设置已保存', 'ok');
        } catch (e) { ui.toast(e.message, 'err'); }
      });
      $('#mt-mute-all').addEventListener('click', async () => {
        try {
          await service.meetingMuteAll(id);
          ui.toast('已全体静音', 'ok');
        } catch (e) { ui.toast(e.message, 'err'); }
      });
    }
  };

  function switchRow(label, key, on) {
    return `<div class="row between mb12"><span style="font-size:13px">${label}</span>
      <label class="switch"><input type="checkbox" data-setting="${key}" ${on ? 'checked' : ''}><span class="slider"></span></label></div>`;
  }

  const chatHtml = (c) => {
    if (c.system) return `<div class="mt-chat-msg system">${ui.esc(c.text)}</div>`;
    return `<div class="mt-chat-msg ${c.userId === me ? 'me' : ''}">
      <div class="who">${ui.esc(c.name)} ${ui.esc(ui.fmtRelative(c.at))}</div>
      <div class="txt">${ui.esc(c.text)}</div>
    </div>`;
  };

  const pushChat = (entry) => {
    state.chat = [...state.chat, entry].slice(-300);
    if (state.panel === 'chat') {
      const list = $('#mt-chat-list');
      if (list) {
        if (list.querySelector('.dim')) list.innerHTML = '';
        list.insertAdjacentHTML('beforeend', chatHtml(entry));
        list.scrollTop = list.scrollHeight;
      }
    }
  };

  /* ---------------- 实时通道 ---------------- */
  const room = new MeetingRoom(id, {
    onTranscript(entry) {
      state.meeting.transcript = [...(state.meeting.transcript || []), entry];
      if (state.panel === 'minutes') {
        const box = $('#mt-tr-box');
        if (box) {
          if (box.querySelector('.dim')) box.innerHTML = '';
          box.insertAdjacentHTML('beforeend', `<div class="line"><span class="spk">${ui.esc(entry.speaker || '')}</span>${ui.esc(entry.text || '')}</div>`);
          box.scrollTop = box.scrollHeight;
        }
      }
    },
    onParticipants(list) {
      participants = list;
      const mine = list.find((p) => p.userId === me);
      if (mine) {
        if (mine.handUp !== undefined) state.handUp = mine.handUp;
      }
      renderGrid();
    },
    onSignal(sig) {
      if (sig.type === 'track') {
        const tile = host.querySelector(`#tile-${cssEscape(sig.from)}`);
        if (!tile) return;
        let video = tile.querySelector('video');
        if (!video) {
          tile.innerHTML = `<video autoplay playsinline></video><div class="mt-label"><span>远端</span></div>`;
          video = tile.querySelector('video');
        }
        if (video.srcObject !== sig.stream) {
          video.srcObject = sig.stream;
          video.play().catch(() => {});
        }
      }
    },
    onChat(entry) {
      pushChat(entry);
      if (entry.userId !== me && !entry.system && state.panel !== 'chat') {
        ui.toast(`${entry.name}：${String(entry.text).slice(0, 40)}`, '', 3000);
      }
    },
    onEnded() {
      ui.toast('主持人已结束会议', 'err');
      setTimeout(() => ctx.nav('#/chat'), 1200);
    },
    onKicked(title) {
      ui.toast(`你已被移出会议${title ? `：${title}` : ''}`, 'err');
      setTimeout(() => ctx.nav('#/chat'), 1200);
    },
    onForceMute() {
      const t = room.localStream?.getAudioTracks()[0];
      if (t) t.enabled = false;
      state.micOn = false;
      updateControls();
      ui.toast('主持人已全体静音', '');
    },
    onSettings(data) {
      state.meeting.settings = data.settings;
      state.meeting.title = data.title || state.meeting.title;
      if (state.panel === 'settings') renderPanel();
    },
    onLock(locked) {
      ui.toast(locked ? '会议已锁定' : '会议已解锁', '');
    },
    onStatus(kind, val) {
      if (kind === 'screen-share') { /* 远端共享状态由 participants 同步 */ }
      void val;
    },
  });

  room.connect();
  await room.broadcastJoin();

  // 本地媒体
  const ensureLocal = async () => {
    if (!room.localStream) {
      try {
        await room.startMedia({ audio: true, video: state.camOn });
      } catch (err) {
        ui.toast(mediaErrorHint(err), 'err');
        const bar = document.createElement('div');
        bar.className = 'media-err mt8';
        bar.innerHTML = `<div class="media-err-t">⚠️ 无法打开摄像头/麦克风</div>
          <div class="media-err-b">${ui.esc(mediaErrorHint(err))}</div>
          <div class="row gap8 mt8">
            <button class="btn btn-sm btn-primary grow" id="room-media-retry">重试</button>
            <button class="btn btn-sm grow" id="room-media-close">知道了</button>
          </div>`;
        const stage = host.querySelector('.mt-stage');
        if (stage) stage.parentElement.appendChild(bar);
        bar.querySelector('#room-media-close')?.addEventListener('click', () => bar.remove());
        bar.querySelector('#room-media-retry')?.addEventListener('click', async (e) => {
          const btn = e.currentTarget;
          btn.disabled = true;
          btn.textContent = '重试中…';
          try {
            await room.startMedia({ audio: true, video: state.camOn });
            const audio = room.localStream?.getAudioTracks()[0];
            if (audio) audio.enabled = state.micOn;
            const video = room.localStream?.getVideoTracks()[0];
            if (video) video.enabled = state.camOn;
            bar.remove();
            renderGrid();
            ui.toast('设备已就绪', 'ok');
          } catch (err2) {
            btn.disabled = false;
            btn.textContent = '重试';
            ui.toast(mediaErrorHint(err2), 'err');
          }
        });
      }
    }
    const audio = room.localStream?.getAudioTracks()[0];
    if (audio) audio.enabled = state.micOn;
    const video = room.localStream?.getVideoTracks()[0];
    if (video) video.enabled = state.camOn;
  };
  await ensureLocal();
  renderGrid();

  // 会议内聊天历史
  service.meetingChat(id).then((r) => { state.chat = r.items || []; if (state.panel === 'chat') renderPanel(); }).catch(() => {});

  /* ---------------- 控制栏 ---------------- */
  const updateControls = () => {
    $('#btn-mic').className = `mt-btn ${state.micOn ? '' : 'off'}`;
    $('#btn-mic-t').textContent = state.micOn ? '静音' : '已静音';
    $('#btn-cam').className = `mt-btn ${state.camOn ? '' : 'off'}`;
    $('#btn-cam-t').textContent = state.camOn ? '视频' : '已关闭';
    $('#btn-share').className = `mt-btn ${state.sharing ? 'on' : ''}`;
    $('#btn-hand').className = `mt-btn ${state.handUp ? 'on' : ''}`;
    $('#btn-record').className = `mt-btn ${recording ? 'on' : ''}`;
    $('#mt-rec').style.display = recording ? '' : 'none';
  };

  let recording = false;

  $('#btn-mic').addEventListener('click', async () => {
    state.micOn = !state.micOn;
    if (!room.localStream) await ensureLocal();
    const t = room.localStream?.getAudioTracks()[0];
    if (t) t.enabled = state.micOn;
    else if (state.micOn) { await room.ensureTrack('audio'); }
    room.syncState({ muted: !state.micOn });
    updateControls();
  });

  $('#btn-cam').addEventListener('click', async () => {
    state.camOn = !state.camOn;
    if (!room.localStream) await ensureLocal();
    let t = room.localStream?.getVideoTracks()[0];
    if (!t && state.camOn) t = await room.ensureTrack('video');
    if (t) t.enabled = state.camOn;
    room.syncState({ cameraOff: !state.camOn });
    renderGrid();
    updateControls();
  });

  $('#btn-share').addEventListener('click', async () => {
    if (state.sharing) {
      room.stopScreenShare();
      state.sharing = false;
      room.syncState({ screenSharing: false });
      updateControls();
      renderGrid();
      return;
    }
    try {
      await room.startScreenShare();
      state.sharing = true;
      room.syncState({ screenSharing: true });
      updateControls();
      renderGrid();
      ui.toast('正在共享屏幕，点击「共享」可停止', 'ok');
    } catch (err) {
      ui.toast(err.name === 'NotAllowedError' ? '已取消共享' : err.message, 'err');
    }
  });

  const togglePanel = (name) => {
    state.panel = state.panel === name ? '' : name;
    renderPanel();
  };
  $('#btn-members').addEventListener('click', () => togglePanel('members'));
  $('#btn-chat').addEventListener('click', () => togglePanel('chat'));
  host.querySelectorAll('.mt-tab').forEach((t) => t.addEventListener('click', () => { state.panel = t.dataset.panel; renderPanel(); }));

  $('#btn-hand').addEventListener('click', async () => {
    state.handUp = !state.handUp;
    room.syncState({ handUp: state.handUp });
    updateControls();
    ui.toast(state.handUp ? '已举手，主持人会看到' : '已放下手', '');
  });

  $('#btn-invite').addEventListener('click', async () => {
    try {
      const invite = await service.meetingInvite(id);
      openInviteSheet(invite);
    } catch (err) {
      ui.toast(err.message, 'err');
    }
  });

  $('#mt-no').addEventListener('click', async () => {
    const text = `会议号 ${state.meeting.number}${state.meeting.password ? `（密码 ${state.meeting.password}）` : ''}`;
    const ok = await ui.copyText(text);
    ui.toast(ok ? '会议号已复制' : '复制失败', ok ? 'ok' : 'err');
  });

  $('#mt-close').addEventListener('click', () => ctx.nav('#/chat'));

  $('#btn-leave').addEventListener('click', async () => {
    const isHost = state.meeting.canManage;
    const ok = await ui.confirmDialog({
      title: isHost ? '结束会议？' : '离开会议？',
      message: isHost ? '你是主持人，离开将结束整场会议。' : '离开后可以随时通过会议号重新加入。',
      okText: isHost ? '结束会议' : '离开',
      danger: true,
    });
    if (!ok) return;
    try {
      room.stopTranscript();
      if (recording) await room.stopRecording();
      room.stopMedia();
      room.disconnect();
      if (isHost) await service.endMeeting(id);
      else await service.leaveMeeting(id);
    } catch { /* ignore */ }
    ctx.nav('#/chat');
  });

  /* ---------------- 实时转写 / 录音 ---------------- */
  $('#btn-transcript').addEventListener('click', () => {
    if (state.panel !== 'minutes') { state.panel = 'minutes'; renderPanel(); }
    setTimeout(() => {
      const btn = $('#mt-tr-toggle');
      if (!btn) {
        // 在纪要面板里补一个开关
        const box = $('#mt-side-body');
        box?.insertAdjacentHTML('afterbegin', '<button class="btn btn-sm btn-block mb8" id="mt-tr-toggle">开始实时记录</button>');
        $('#mt-tr-toggle')?.addEventListener('click', onToggleTranscript);
      }
      onToggleTranscript();
    }, 50);
  });

  let transcribing = false;
  const onToggleTranscript = () => {
    const btn = $('#mt-tr-toggle');
    if (!transcribing) {
      const ok = room.startTranscript(ctx.state.user?.nickname || '我');
      if (!ok) return ui.toast('当前浏览器不支持语音识别，请用 Chrome / Edge；也可手动补录', 'err');
      transcribing = true;
      if (btn) btn.textContent = '停止实时记录';
      const st = $('#mt-tr-status');
      if (st) st.innerHTML = '<span class="rec-dot"></span> 转写中';
      ui.toast('已开始实时记录', 'ok');
    } else {
      room.stopTranscript();
      transcribing = false;
      if (btn) btn.textContent = '开始实时记录';
      const st = $('#mt-tr-status');
      if (st) st.textContent = '已停止';
    }
  };

  $('#btn-record').addEventListener('click', async () => {
    if (!room.localStream) await ensureLocal();
    if (!recording) {
      if (room.startRecording()) {
        recording = true;
        updateControls();
        ui.toast('录音中，再次点击停止并上传', 'ok');
      } else ui.toast('录音启动失败', 'err');
    } else {
      recording = false;
      updateControls();
      const sec = await room.stopRecording();
      if (sec) ui.toast(`录音已上传（${Math.round(sec / 60)} 分钟）`, 'ok');
    }
  });

  /* ---------------- 纪要 / 转写面板绑定 ---------------- */
  function bindTranscriptPanel() {
    $('#mt-tr-add')?.addEventListener('click', async () => {
      const input = $('#mt-tr-input');
      const text = input.value.trim();
      if (!text) return;
      try {
        await service.transcript(id, [{ text, speaker: ctx.state.user?.nickname || '我', final: true }]);
        input.value = '';
        room.onTranscriptAccounted = true;
      } catch (err) { ui.toast(err.message, 'err'); }
    });
  }

  function bindMinutesPanel() {
    $('#mt-minutes')?.addEventListener('click', async (e) => {
      e.currentTarget.disabled = true;
      e.currentTarget.textContent = '生成中…';
      try {
        const res = await service.minutes(id);
        state.meeting.minutes = res.meeting.minutes;
        $('#mt-minutes-box').innerHTML = minutesHtml(res.meeting.minutes);
        bindMinutesButtons();
        ui.toast('纪要已生成，可发给双方确认', 'ok');
      } catch (err) {
        ui.toast(err.message, 'err');
      } finally {
        e.currentTarget.disabled = false;
        e.currentTarget.textContent = '生成';
      }
    });
    bindMinutesButtons();
  }

  function bindMinutesButtons() {
    const box = $('#mt-minutes-box');
    if (!box) return;
    box.querySelectorAll('[data-act]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const act = btn.dataset.act;
        try {
          if (act === 'confirm-minutes') {
            const agree = btn.dataset.agree === '1';
            const note = agree ? '' : (await ui.promptDialog({ title: '提出异议', label: '请说明需要修改的内容', multiline: true })) || '';
            const res = await service.confirmMinutes(id, { agree, note });
            box.innerHTML = minutesHtml(res.meeting.minutes);
            bindMinutesButtons();
            ui.toast(agree ? '已确认纪要' : '已提交异议', 'ok');
          } else if (act === 'regenerate-minutes') {
            btn.disabled = true;
            const res = await service.minutes(id);
            box.innerHTML = minutesHtml(res.meeting.minutes);
            bindMinutesButtons();
          }
        } catch (err) { ui.toast(err.message, 'err'); }
      });
    });
  }

  /* ---------------- 成员操作 / 计时器 ---------------- */
  $('#mt-side-body').addEventListener('click', async (e) => {
    const kick = e.target.closest('[data-kick]');
    if (!kick) return;
    const ok = await ui.confirmDialog({ title: '移出会议', message: '该成员会被移出会议，且无法再通过已锁定会议加入。', danger: true, okText: '移出' });
    if (!ok) return;
    try {
      await service.meetingKick(id, kick.dataset.kick);
      ui.toast('已移出', 'ok');
    } catch (err) { ui.toast(err.message, 'err'); }
  });

  const startedAt = Date.now();
  const timer = setInterval(() => {
    const s = Math.floor((Date.now() - startedAt) / 1000);
    const hh = String(Math.floor(s / 3600)).padStart(2, '0');
    const mm = String(Math.floor((s % 3600) / 60)).padStart(2, '0');
    const ss = String(s % 60).padStart(2, '0');
    const el = $('#mt-timer');
    if (el) el.textContent = `${hh}:${mm}:${ss}`;
  }, 1000);

  window.addEventListener('beforeunload', () => {
    clearInterval(timer);
    room.stopMedia();
    room.disconnect();
    void api;
    void store;
  }, { once: true });

  renderGrid();
  updateControls();
}

/* 把 getUserMedia 的异常翻译成用户能照着做的提示 */
function mediaErrorHint(err) {
  const n = (err && err.name) || '';
  if (n === 'NotAllowedError' || n === 'PermissionDeniedError' || n === 'SecurityError') {
    return '浏览器拒绝了摄像头/麦克风权限。请点地址栏左侧的「锁」图标 → 把「摄像头」「麦克风」改为允许 → 刷新页面';
  }
  if (n === 'NotFoundError' || n === 'DevicesNotFoundError' || n === 'OverconstrainedError') {
    return '没有检测到可用的摄像头或麦克风，请确认设备已连接（台式机需要外接摄像头）';
  }
  if (n === 'NotReadableError' || n === 'TrackStartError') {
    return '摄像头/麦克风被其他程序占用（例如其他会议软件、录屏工具），请关闭后点重试';
  }
  if (n === 'AbortError') return '设备启动被中断，请点重试';
  return (err && err.message) || '无法访问摄像头/麦克风';
}

/* 供 CSS 选择器使用：转义用户 id 里的特殊字符 */
function cssEscape(s) {
  return String(s).replace(/[^\w-]/g, '\\$&');
}

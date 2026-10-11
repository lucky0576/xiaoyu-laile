/**
 * 小鱼来了 — 线上会议模块
 *
 * - 内置 WebRTC 多人音视频（信令走 HTTP POST + SSE，无需 WebSocket 服务器）
 * - 实时语音转写：浏览器 SpeechRecognition 逐句上报，服务端落库并广播给所有参会人
 * - 录音：MediaRecorder 录制后上传归档
 * - 纪要：会议结束后由 AI 生成双方后续跟进事项并发起确认
 */
import { service, store } from './api.js';
import { esc, toast, fmtDate, nl2br } from './ui.js';

const RTC_CONFIG = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ],
};

export class MeetingRoom {
  constructor(
    meetingId,
    {
      onTranscript, onSignal, onParticipants, onStatus,
      onChat, onEnded, onKicked, onForceMute, onSettings, onLock,
      mode = 'meeting', isBroadcaster = false,
    } = {},
  ) {
    this.id = meetingId;
    this.isLive = mode === 'live';
    this.isBroadcaster = Boolean(isBroadcaster);
    this.onTranscript = onTranscript || (() => {});
    this.onSignal = onSignal || (() => {});
    this.onParticipants = onParticipants || (() => {});
    this.onStatus = onStatus || (() => {});
    this.onChat = onChat || (() => {});
    this.onEnded = onEnded || (() => {});
    this.onKicked = onKicked || (() => {});
    this.onForceMute = onForceMute || (() => {});
    this.onSettings = onSettings || (() => {});
    this.onLock = onLock || (() => {});

    this.localStream = null;
    this.screenStream = null;
    this.screenSharing = false;
    this.peers = new Map(); // userId -> RTCPeerConnection
    this.recorder = null;
    this.chunks = [];
    this.recognition = null;
    this.recognizing = false;
    this.es = null;
    this.selfId = (store.user && store.user.id) || 'me';
  }

  /* ---------------- 媒体 ---------------- */
  async startMedia({ audio = true, video = true } = {}) {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      throw new Error('当前浏览器不支持音视频采集，请使用 Chrome / Edge / Safari 最新版');
    }
    this.localStream = await navigator.mediaDevices.getUserMedia({
      audio: audio ? { echoCancellation: true, noiseSuppression: true, autoGainControl: true } : false,
      video: video ? { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' } : false,
    });
    return this.localStream;
  }

  /** 只补采某一路（例如先入会只开音频，之后想开摄像头） */
  async ensureTrack(kind) {
    const has = this.localStream && this.localStream.getTracks().some((t) => t.kind === kind);
    if (has) return this.localStream.getTracks().find((t) => t.kind === kind);
    const extra = await navigator.mediaDevices.getUserMedia({ audio: kind === 'audio', video: kind === 'video' });
    const track = extra.getTracks()[0];
    if (!this.localStream) this.localStream = new MediaStream();
    this.localStream.addTrack(track);
    for (const [, pc] of this.peers) {
      const sender = pc.getSenders().find((s) => s.track && s.track.kind === kind);
      if (sender) await sender.replaceTrack(track);
      else pc.addTrack(track, this.localStream);
    }
    return track;
  }

  stopMedia() {
    if (this.localStream) {
      for (const t of this.localStream.getTracks()) t.stop();
      this.localStream = null;
    }
    this.stopScreenShare(true);
  }

  /* ---------------- 屏幕共享 ---------------- */
  async startScreenShare() {
    if (!navigator.mediaDevices?.getDisplayMedia) {
      throw new Error('当前浏览器不支持屏幕共享，请使用桌面版 Chrome / Edge');
    }
    this.screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
    const track = this.screenStream.getVideoTracks()[0];
    for (const [, pc] of this.peers) {
      const sender = pc.getSenders().find((s) => s.track && s.track.kind === 'video');
      if (sender) await sender.replaceTrack(track);
      else pc.addTrack(track, this.screenStream);
    }
    track.onended = () => this.stopScreenShare();
    this.screenSharing = true;
    return this.screenStream;
  }

  stopScreenShare(silent = false) {
    if (this.screenStream) {
      for (const t of this.screenStream.getTracks()) t.stop();
      this.screenStream = null;
    }
    if (this.screenSharing) {
      this.screenSharing = false;
      const cam = this.localStream?.getVideoTracks()[0];
      for (const [, pc] of this.peers) {
        const sender = pc.getSenders().find((s) => s.track && s.track.kind === 'video');
        if (sender) sender.replaceTrack(cam || null).catch(() => {});
      }
      if (!silent) this.onStatus && this.onStatus('screen-share', false);
    }
  }

  /** 把自身状态同步到服务端（用于成员列表显示） */
  syncState(patch) {
    service.meetingState(this.id, patch).catch(() => {});
  }

  /* ---------------- 信令（SSE 收，HTTP 发） ---------------- */
  connect() {
    if (this.es) return;
    const url = `/api/meetings/${this.id}/stream`;
    this.es = new EventSource(url);
    const sse = this.es;
    void sse;

    // EventSource 不能带自定义头，用 Cookie 认证；未登录时通过 token 参数
    if (!document.cookie.includes('xyl_token') && store.token) {
      this.es.close();
      this.es = new EventSource(`${url}?token=${encodeURIComponent(store.token)}`);
    }

    this.es.addEventListener('signal', (e) => {
      try {
        const { signal } = JSON.parse(e.data);
        if (signal && signal.from !== this.selfId) this.handleSignal(signal);
      } catch { /* ignore */ }
    });
    this.es.addEventListener('transcript', (e) => {
      try {
        const { entry } = JSON.parse(e.data);
        if (entry) this.onTranscript(entry);
      } catch { /* ignore */ }
    });
    this.es.addEventListener('meeting_participants', (e) => {
      try {
        const { participants } = JSON.parse(e.data);
        this.onParticipants(participants || []);
      } catch { /* ignore */ }
    });
    this.es.addEventListener('minutes', (e) => {
      try {
        const { minutes } = JSON.parse(e.data);
        this.onStatus && this.onStatus('minutes', minutes);
      } catch { /* ignore */ }
    });
    this.es.addEventListener('meeting_chat', (e) => {
      try {
        const { entry } = JSON.parse(e.data);
        if (entry) this.onChat(entry);
      } catch { /* ignore */ }
    });
    this.es.addEventListener('meeting_ended', () => this.onEnded());
    this.es.addEventListener('meeting_kicked', (e) => {
      let title = '';
      try { title = JSON.parse(e.data).title || ''; } catch { /* ignore */ }
      this.onKicked(title);
    });
    this.es.addEventListener('force_mute', () => this.onForceMute());
    this.es.addEventListener('meeting_settings', (e) => {
      try { this.onSettings(JSON.parse(e.data)); } catch { /* ignore */ }
    });
    this.es.addEventListener('meeting_lock', (e) => {
      try { this.onLock(Boolean(JSON.parse(e.data).locked)); } catch { /* ignore */ }
    });
    this.es.addEventListener('meeting_mute_all', () => this.onForceMute());
    this.es.addEventListener('error', () => {
      // EventSource 会自动重连
    });
  }

  disconnect() {
    if (this.es) {
      this.es.close();
      this.es = null;
    }
    for (const [, pc] of this.peers) pc.close();
    this.peers.clear();
  }

  async handleSignal(signal) {
    const from = signal.from;
    if (signal.to && signal.to !== this.selfId) return;

    if (signal.kind === 'offer') {
      const pc = this.ensurePeer(from, false);
      await pc.setRemoteDescription(new RTCSessionDescription(signal.data));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      await this.sendSignal({ to: from, kind: 'answer', data: answer });
    } else if (signal.kind === 'answer') {
      const pc = this.peers.get(from);
      if (pc) await pc.setRemoteDescription(new RTCSessionDescription(signal.data));
    } else if (signal.kind === 'candidate') {
      const pc = this.ensurePeer(from, false);
      try {
        await pc.addIceCandidate(new RTCIceCandidate(signal.data));
      } catch { /* ignore */ }
    } else if (signal.kind === 'join') {
      // 新人加入：普通会议里已有成员主动发起 offer；
      // 直播是「主播 → 观众」星形拓扑，只有主播发 offer，观众之间不互联。
      if (from === this.selfId) return;
      if (this.isLive) {
        if (this.isBroadcaster) this.callPeer(from);
      } else {
        this.callPeer(from);
      }
    } else if (signal.kind === 'leave') {
      const pc = this.peers.get(from);
      if (pc) {
        pc.close();
        this.peers.delete(from);
      }
    }
  }

  ensurePeer(userId, initiator) {
    let pc = this.peers.get(userId);
    if (pc) return pc;
    pc = new RTCPeerConnection(RTC_CONFIG);
    this.peers.set(userId, pc);

    // 直播观众只收不发；主播推流
    const publish = this.isLive ? this.isBroadcaster : Boolean(this.localStream);
    if (publish && this.localStream) {
      for (const track of this.localStream.getTracks()) pc.addTrack(track, this.localStream);
    } else {
      pc.addTransceiver('audio', { direction: 'recvonly' });
      pc.addTransceiver('video', { direction: 'recvonly' });
    }

    pc.onicecandidate = (e) => {
      if (e.candidate) this.sendSignal({ to: userId, kind: 'candidate', data: e.candidate });
    };
    pc.ontrack = (e) => {
      this.onSignal({ type: 'track', from: userId, stream: e.streams[0] });
    };
    pc.onconnectionstatechange = () => {
      this.onSignal({ type: 'peer-state', from: userId, state: pc.connectionState });
    };
    void initiator;
    return pc;
  }

  async callPeer(userId) {
    const pc = this.ensurePeer(userId, true);
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    await this.sendSignal({ to: userId, kind: 'offer', data: offer });
  }

  async broadcastJoin() {
    await this.sendSignal({ kind: 'join', data: { at: Date.now() } });
  }

  async sendSignal(payload) {
    try {
      await service.signal(this.id, payload);
    } catch { /* 网络抖动时忽略 */ }
  }

  /* ---------------- 实时语音转写 ---------------- */
  startTranscript(speakerName) {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return false;
    if (this.recognizing) return true;

    const rec = new SR();
    rec.lang = 'zh-CN';
    rec.continuous = true;
    rec.interimResults = true;
    rec.maxAlternatives = 1;

    let buffer = [];
    rec.onresult = (event) => {
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const res = event.results[i];
        const text = res[0].transcript.trim();
        if (!text) continue;
        if (res.isFinal) {
          buffer.push(text);
          if (buffer.length >= 3 || text.length > 40) {
            this.pushTranscript(buffer.join('，'), speakerName);
            buffer = [];
          }
        }
      }
    };
    rec.onerror = () => { /* 继续尝试 */ };
    rec.onend = () => {
      this.recognizing = false;
      if (this._wantTranscript) {
        setTimeout(() => this.startTranscript(speakerName), 600);
      }
    };

    this._wantTranscript = true;
    try {
      rec.start();
      this.recognition = rec;
      this.recognizing = true;
      return true;
    } catch {
      return false;
    }
  }

  pushTranscript(text, speaker) {
    const chunk = { text, speaker, at: new Date().toISOString(), final: true };
    this.onTranscript(chunk);
    service.transcript(this.id, [chunk]).catch(() => {});
  }

  stopTranscript() {
    this._wantTranscript = false;
    if (this.recognition) {
      try { this.recognition.stop(); } catch { /* ignore */ }
      this.recognition = null;
    }
    this.recognizing = false;
  }

  /* ---------------- 录音 ---------------- */
  startRecording() {
    if (!this.localStream) return false;
    try {
      const mime = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : (MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : '');
      this.recorder = new MediaRecorder(this.localStream, mime ? { mimeType: mime } : undefined);
      this.chunks = [];
      this.recorder.ondataavailable = (e) => {
        if (e.data && e.data.size) this.chunks.push(e.data);
      };
      this._recStart = Date.now();
      this.recorder.start(1500);
      return true;
    } catch {
      return false;
    }
  }

  async stopRecording() {
    if (!this.recorder) return null;
    const durationSec = Math.round((Date.now() - (this._recStart || Date.now())) / 1000);
    const done = new Promise((resolve) => {
      this.recorder.onstop = () => resolve(new Blob(this.chunks, { type: this.recorder.mimeType || 'audio/webm' }));
    });
    try { this.recorder.stop(); } catch { /* ignore */ }
    const blob = await done;
    this.recorder = null;
    if (!blob || !blob.size) return null;

    const fd = new FormData();
    fd.append('recording', blob, `meeting-${this.id}.webm`);
    fd.append('durationSec', String(durationSec));
    try {
      await service.uploadRecording(this.id, fd);
      toast('录音已上传归档', 'ok');
      return durationSec;
    } catch (err) {
      toast(`录音上传失败：${err.message}`, 'err');
      return null;
    }
  }
}

/* ------------------------------------------------------------------ */
/* 会议页面渲染辅助                                                    */
/* ------------------------------------------------------------------ */
export function meetingHeaderHtml(meeting) {
  const live = meeting.status === 'live';
  return `<div class="row between">
    <div class="grow">
      <div class="strong">${esc(meeting.title)}</div>
      <div class="tiny dim">${fmtDate(meeting.startAt, true)} · ${(meeting.participants || []).length} 人参会</div>
    </div>
    <span class="badge ${live ? 'danger' : 'gray'}">${live ? '<span class="rec-dot"></span> 进行中' : meeting.status === 'ended' ? '已结束' : '待开始'}</span>
  </div>`;
}

export function transcriptHtml(list) {
  if (!list || !list.length) {
    return '<div class="tiny dim center" style="padding:20px">暂无转写内容。点击「开始实时记录」后，发言会被自动转写并同步给所有参会人。</div>';
  }
  return list
    .slice(-200)
    .map((t) => `<div class="line"><span class="spk">${esc(t.speaker || '参会人')}</span>${nl2br(t.text || '')}</div>`)
    .join('');
}

export function minutesHtml(minutes) {
  if (!minutes) return '<div class="tiny dim center" style="padding:16px">会议结束后可一键生成 AI 纪要</div>';
  const list = (arr, cls) => (arr || []).map((x) => `<li>${esc(typeof x === 'string' ? x : x.task || '')}</li>`).join('');
  const actions = (minutes.actions || [])
    .map((a, i) => `<li>${i + 1}. <b>${esc(a.owner || '待指派')}</b>：${esc(a.task || '')}${a.due ? `（${esc(a.due)}）` : ''}</li>`)
    .join('');
  const confirmed = (minutes.confirmedBy || []).map((c) => `${esc(c.name)}${c.agree ? ' 已确认' : ' 有异议'}`).join('、');
  return `
    <div class="small">${nl2br(minutes.summary || '')}</div>
    ${(minutes.keyPoints || []).length ? `<div class="strong mt12 small">会议要点</div><ul class="ai-list">${list(minutes.keyPoints)}</ul>` : ''}
    ${(minutes.decisions || []).length ? `<div class="strong mt12 small">已达成的共识</div><ul class="ai-list good">${list(minutes.decisions)}</ul>` : ''}
    ${actions ? `<div class="strong mt12 small">双方后续跟进事项</div><ul class="ai-list tip">${actions}</ul>` : ''}
    ${confirmed ? `<div class="tiny dim mt12">确认情况：${confirmed}</div>` : ''}
    <div class="row gap8 mt12">
      <button class="btn btn-primary btn-sm" data-act="confirm-minutes" data-agree="1">确认纪要</button>
      <button class="btn btn-sm" data-act="confirm-minutes" data-agree="0">提出异议</button>
      <button class="btn btn-sm" data-act="regenerate-minutes">重新生成</button>
    </div>`;
}

export default { MeetingRoom, meetingHeaderHtml, transcriptHtml, minutesHtml };

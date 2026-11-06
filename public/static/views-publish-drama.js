/**
 * 发布短剧（#/publish-drama）— 独立入口，与「发布短视频」分开
 *
 * 流程：
 *   1. 填剧名 / 分类 / 简介 / 内容方 / 授权说明 / 免费集数
 *   2. 批量选择剧集视频（可多选，按顺序为第 1~N 集）
 *   3. 点「上传并发布」→ 逐个上传 → 一次创建短剧 + 剧集 + 上架 + 自动切片
 *
 * 权限：目前由平台运营（管理员）上传；普通用户看到说明与联系方式。
 */

import * as ui from './ui.js';
import { api, service } from './api.js';

const CATEGORIES = [
  { id: 'business', name: '商战' },
  { id: 'startup', name: '创业' },
  { id: 'urban', name: '都市' },
  { id: 'counter', name: '逆袭' },
  { id: 'suspense', name: '悬疑' },
  { id: 'industry', name: '产业' },
];

export async function renderPublishDrama(ctx) {
  const user = ctx.state?.user;
  const isAdmin = Boolean(user && user.isAdmin);

  if (!isAdmin) {
    return {
      title: '发布短剧',
      content: `<div class="page">
        <div class="page-title">🎬 发布短剧</div>
        <div class="card card-pad mt12">
          <div class="strong mb8">短剧上传由平台运营处理</div>
          <div class="small muted" style="line-height:1.9">
            为了保证版权与内容合规，短剧目前由平台运营统一上传与审核。<br>
            如果你是版权方 / 制作方，想在小鱼来了上架短剧，请通过「联系我」提交：
            剧名、集数、授权说明、样片链接，我们会在 1 个工作日内回复。
          </div>
          <a class="btn btn-primary btn-block mt12" href="#/contact-us?topic=consult&about=${encodeURIComponent('我想在平台上传短剧（版权方/制作方）')}">联系平台合作</a>
          <a class="btn btn-outline btn-block mt8" href="#/drama">先看看短剧频道</a>
        </div>
      </div>`,
      showBack: true,
      activeTab: 'publish',
    };
  }

  const html = `<div class="page">
    <div class="page-title">🎬 发布短剧</div>
    <div class="tiny dim mb12">外接短剧上传入口（与「发布短视频」分开）。上传后自动创建剧集、上架短剧频道，并切 15 秒高光片段投放到短视频流。</div>

    <div class="card card-pad">
      <div class="strong mb8">1. 剧集信息</div>
      <div class="field">
        <label>剧名 <span style="color:#e74c3c">*</span></label>
        <input class="input" id="pd-title" maxlength="60" placeholder="例如：算力争夺战">
      </div>
      <div class="field">
        <label>副标题</label>
        <input class="input" id="pd-subtitle" maxlength="80" placeholder="例如：商战 · 6 集">
      </div>
      <div class="row gap8">
        <div class="field grow">
          <label>分类</label>
          <select class="input" id="pd-category">
            ${CATEGORIES.map((c) => `<option value="${c.id}">${c.name}</option>`).join('')}
          </select>
        </div>
        <div class="field grow">
          <label>免费集数</label>
          <input class="input" id="pd-free" type="number" min="1" value="1">
        </div>
      </div>
      <div class="field">
        <label>剧情简介</label>
        <textarea class="textarea" id="pd-intro" maxlength="2000" style="min-height:90px" placeholder="一句话讲清楚这部剧讲什么"></textarea>
      </div>
      <div class="field">
        <label>内容方 / 版权方</label>
        <input class="input" id="pd-provider" maxlength="80" placeholder="例如：XX 影视">
      </div>
      <div class="field">
        <label>授权说明</label>
        <input class="input" id="pd-license" maxlength="300" placeholder="例如：已签署信息网络传播权授权书（编号 xxx）">
      </div>
    </div>

    <div class="card card-pad mt12">
      <div class="strong mb8">2. 上传剧集视频</div>
      <div class="tiny dim mb8">可多选，按文件名顺序成为第 1~N 集；上传后自动截封面、统一转竖版切片</div>
      <input type="file" id="pd-videos" accept="video/mp4,video/quicktime,video/webm" multiple hidden>
      <button class="btn btn-outline btn-block" id="pd-pick" type="button">📤 选择剧集视频（可多选）</button>
      <div id="pd-files" class="mt8"></div>
    </div>

    <div class="card card-pad mt12">
      <div class="strong mb8">3. 发布</div>
      <div class="tiny dim mb6">发布 = 创建短剧 + 添加全部剧集 + 上架 + 自动切片；发布后可在 #/drama 和 #/shorts 看到。</div>
      <button class="btn btn-primary btn-block" id="pd-submit" type="button" style="height:48px">🎬 上传并发布短剧</button>
      <div class="tiny dim center mt8" id="pd-status"></div>
      <a class="btn btn-outline btn-block mt12" href="#/admin-drama">去短剧管理（审核/下架/补切片）</a>
    </div>
  </div>`;

  return {
    title: '发布短剧',
    content: html,
    showBack: true,
    activeTab: 'publish',
    mount(root) {
      const $ = (s) => root.querySelector(s);
      const status = $('#pd-status');
      let picked = [];

      const paint = () => {
        const box = $('#pd-files');
        if (!picked.length) {
          box.innerHTML = '<div class="tiny dim">还没选择视频</div>';
          return;
        }
        box.innerHTML = picked
          .map(
            (f, i) => `<div class="row between tiny mt4">
              <span>第 ${i + 1} 集 · ${ui.esc(f.name)}（${(f.size / 1048576).toFixed(1)}MB）</span>
              <span class="dim">${i + 1 === 1 ? '第 1 集' : '第 ' + (i + 1) + ' 集'}</span>
            </div>`,
          )
          .join('');
        if (status) status.textContent = `已选择 ${picked.length} 个视频，将按顺序作为第 1~${picked.length} 集`;
      };

      $('#pd-pick').addEventListener('click', () => $('#pd-videos').click());
      $('#pd-videos').addEventListener('change', (e) => {
        const files = Array.from(e.target.files || []).filter((f) => /^video\//.test(f.type || '') || /\.(mp4|mov|webm)$/i.test(f.name));
        picked = files.slice(0, 30);
        paint();
        e.target.value = '';
      });

      $('#pd-submit').addEventListener('click', async () => {
        const title = String($('#pd-title').value || '').trim();
        if (title.length < 2) return ui.toast('请填写剧名（至少 2 个字）', 'err');
        if (!picked.length) return ui.toast('请选择剧集视频', 'err');
        const btn = $('#pd-submit');
        btn.disabled = true;
        const old = btn.textContent;
        const fileIds = [];
        try {
          for (let i = 0; i < picked.length; i += 1) {
            const file = picked[i];
            btn.textContent = `上传中 ${i + 1}/${picked.length}…`;
            if (status) status.textContent = `正在上传第 ${i + 1} / ${picked.length} 集：${file.name}`;
            const up = await api.uploadFile(file, {
              onProgress: (pct) => {
                btn.textContent = `上传中 ${i + 1}/${picked.length} ${pct}%`;
              },
            });
            const rec = (up && up.files && up.files[0]) || up;
            if (!rec || !rec.id) throw new Error(`第 ${i + 1} 集上传失败`);
            fileIds.push(rec.id);
          }
          btn.textContent = '创建短剧并上架…';
          if (status) status.textContent = '正在创建短剧、上架并生成切片…';
          const r = await service.adminDramaFromVideos({
            title,
            category: $('#pd-category').value,
            intro: $('#pd-intro').value,
            provider: $('#pd-provider').value,
            licenseNote: $('#pd-license').value,
            freeEpisodes: Number($('#pd-free').value) || 1,
            fileIds,
            slices: true,
          });
          const drama = (r && r.drama) || (r && r.data && r.data.drama) || {};
          const slices = r?.slices ?? r?.data?.slices ?? 0;
          ui.toast(`短剧《${drama.title || title}》已上架，生成 ${slices} 条切片`, 'ok');
          if (status) status.textContent = '发布成功，正在跳转…';
          if (drama.id) ctx.nav(`#/drama/${drama.id}`);
          else ctx.nav('#/drama');
        } catch (err) {
          ui.toast(err.message || '发布失败', 'err');
          if (status) status.textContent = err.message || '发布失败';
          btn.disabled = false;
          btn.textContent = old;
        }
      });
    },
  };
}

export default { renderPublishDrama };

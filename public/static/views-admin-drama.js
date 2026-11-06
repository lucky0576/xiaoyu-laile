/**
 * 短剧管理（管理员）— #/admin-drama
 *
 * MVP：运营代传
 *   1) 新建短剧（剧名/分类/简介/内容方/免费集数/授权说明）
 *   2) 批量上传剧集视频（自动添加集数、自动截封面）
 *   3) 审核上架 / 驳回 / 下架
 *   4) 生成切片 → 自动投放到短视频流（#/shorts 里能刷到）
 */

import * as ui from './ui.js';
import { api, service } from './api.js';

function statusBadge(s) {
  const map = {
    draft: ['草稿', 'gray'],
    pending: ['待审核', 'warn'],
    published: ['已上架', 'ok'],
    rejected: ['已驳回', 'err'],
    offline: ['已下架', 'gray'],
    deleted: ['已删除', 'gray'],
  };
  const [name, cls] = map[s] || [s, 'gray'];
  return `<span class="badge ${cls}">${ui.esc(name)}</span>`;
}

export async function renderAdminDramas(ctx) {
  const user = ctx.state?.user;
  if (!user || !user.isAdmin) {
    return {
      title: '短剧管理',
      content: '<div class="page"><div class="empty">需要管理员权限<br><a class="btn btn-sm mt12" href="#/me">回我的</a></div></div>',
      showBack: true,
    };
  }
  let meta = { categories: [] };
  try {
    meta = (await service.dramaMeta()) || meta;
  } catch {
    /* ignore */
  }

  const html = `<div class="page drama-admin-page">
    <div class="page-title">🎬 短剧管理</div>
    <div class="tiny dim mb12">外接短剧上传 → 审核上架 → 自动切片投放到短视频流。短剧由平台分发，不生成剧情。</div>

    <div class="card card-pad">
      <div class="strong mb8">① 新建短剧</div>
      <div class="field"><label>剧名 <span style="color:#e74c3c">*</span></label>
        <input class="input" id="dr-title" maxlength="60" placeholder="例如：算力争夺战">
      </div>
      <div class="field"><label>副标题</label>
        <input class="input" id="dr-subtitle" maxlength="80" placeholder="例如：商战 · 6 集">
      </div>
      <div class="field"><label>分类</label>
        <select class="input" id="dr-category">
          ${(meta.categories || []).map((c) => `<option value="${ui.esc(c.id)}">${ui.esc(c.name)}</option>`).join('')}
        </select>
      </div>
      <div class="field"><label>简介</label>
        <textarea class="textarea" id="dr-intro" maxlength="2000" style="min-height:80px" placeholder="一句话讲清楚这部剧讲什么"></textarea>
      </div>
      <div class="field"><label>内容方 / 版权方</label>
        <input class="input" id="dr-provider" maxlength="80" placeholder="例如：XX 影视 / 已获授权">
      </div>
      <div class="row gap8">
        <div class="field grow"><label>免费集数</label>
          <input class="input" id="dr-free" type="number" min="1" value="1">
        </div>
        <div class="field grow"><label>总集数（可后补）</label>
          <input class="input" id="dr-total" type="number" min="0" value="0">
        </div>
      </div>
      <div class="field"><label>授权说明</label>
        <input class="input" id="dr-license" maxlength="300" placeholder="例如：已签署信息网络传播权授权书（编号 xxx）">
      </div>
      <button class="btn btn-primary btn-block mt12" id="dr-create" type="button">创建短剧（草稿）</button>
    </div>

    <div class="card card-pad mt12 hide" id="dr-upload-panel">
      <div class="strong mb8">② 上传剧集</div>
      <div class="tiny dim mb8" id="dr-upload-title">先创建短剧，再上传视频</div>
      <input type="file" id="dr-video-input" accept="video/mp4,video/quicktime,video/webm" multiple hidden>
      <button class="btn btn-outline btn-block" id="dr-video-btn" type="button">📤 选择剧集视频（可多选）</button>
      <div class="tiny dim mt6" id="dr-upload-tip">按文件名顺序自动编号；上传后自动截取封面；建议单集 1~3 分钟、竖版或横版都可以（会统一转成竖版切片）</div>
      <div id="dr-upload-list" class="mt8"></div>
    </div>

    <div class="card card-pad mt12">
      <div class="row between">
        <div class="strong">③ 审核与上架</div>
        <div class="tiny dim">通过后自动进入短剧频道</div>
      </div>
      <div class="chips mt8" id="dr-tabs">
        <a class="chip active" data-status="pending">待审核</a>
        <a class="chip" data-status="published">已上架</a>
        <a class="chip" data-status="draft">草稿</a>
        <a class="chip" data-status="">全部</a>
      </div>
      <div id="dr-list" class="mt8"></div>
    </div>
  </div>`;

  return {
    title: '短剧管理',
    content: html,
    showBack: true,
    activeTab: '',
    mount(root) {
      const q = (s) => root.querySelector(s);
      let currentDramaId = '';
      let currentDramaTitle = '';
      let listStatus = 'pending';

      /* ---------- 创建短剧 ---------- */
      q('#dr-create').addEventListener('click', async () => {
        const title = String(q('#dr-title').value || '').trim();
        if (title.length < 2) return ui.toast('请填写剧名', 'err');
        const btn = q('#dr-create');
        btn.disabled = true;
        btn.textContent = '创建中…';
        try {
          const r = await service.adminCreateDrama({
            title,
            subtitle: q('#dr-subtitle').value,
            category: q('#dr-category').value,
            intro: q('#dr-intro').value,
            provider: q('#dr-provider').value,
            licenseNote: q('#dr-license').value,
            freeEpisodes: Number(q('#dr-free').value) || 1,
            totalEpisodes: Number(q('#dr-total').value) || 0,
          });
          const drama = (r && r.drama) || (r && r.data && r.data.drama) || {};
          currentDramaId = drama.id || '';
          currentDramaTitle = drama.title || title;
          q('#dr-upload-panel').classList.remove('hide');
          q('#dr-upload-title').textContent = `《${currentDramaTitle}》— 上传剧集视频`;
          ui.toast('短剧已创建（草稿），请上传剧集', 'ok');
          loadList(listStatus);
        } catch (err) {
          ui.toast(err.message || '创建失败', 'err');
        } finally {
          btn.disabled = false;
          btn.textContent = '创建短剧（草稿）';
        }
      });

      /* ---------- 上传剧集 ---------- */
      const uploadFiles = async (files) => {
        if (!currentDramaId) return ui.toast('请先创建短剧', 'err');
        const arr = Array.from(files || []).filter((f) => f && /^video\//.test(f.type || ''));
        if (!arr.length) return ui.toast('请选择视频文件', 'err');
        const list = q('#dr-upload-list');
        let epNo = 0;
        for (let i = 0; i < arr.length; i += 1) {
          const file = arr[i];
          epNo = i + 1;
          const row = document.createElement('div');
          row.className = 'tiny dim mt6';
          row.textContent = `上传中：${file.name}（${i + 1}/${arr.length}）`;
          list.appendChild(row);
          try {
            const up = await api.uploadFile(file, {
              onProgress: (pct) => {
                row.textContent = `上传中：${file.name} ${pct}%`;
              },
            });
            const rec = (up && up.files && up.files[0]) || up;
            if (!rec || !rec.id) throw new Error('上传失败');
            await service.adminAddEpisode(currentDramaId, {
              fileId: rec.id,
              episodeNo: epNo,
              title: file.name.replace(/\.[^.]+$/, '').slice(0, 60),
            });
            row.textContent = `✅ 第 ${epNo} 集：${file.name}`;
          } catch (err) {
            row.textContent = `❌ 第 ${epNo} 集失败：${err.message || '上传失败'}`;
          }
        }
        ui.toast('剧集上传完成', 'ok');
        loadList(listStatus);
      };

      q('#dr-video-btn').addEventListener('click', () => q('#dr-video-input').click());
      q('#dr-video-input').addEventListener('change', (e) => {
        uploadFiles(e.target.files);
        e.target.value = '';
      });

      /* ---------- 列表与审核 ---------- */
      const loadList = async (status) => {
        listStatus = status;
        const box = q('#dr-list');
        box.innerHTML = '<div class="tiny dim">加载中…</div>';
        try {
          const r = await service.adminDramas({ status });
          const items = (r && r.items) || (r && r.data && r.data.items) || [];
          if (!items.length) {
            box.innerHTML = '<div class="empty">没有短剧</div>';
            return;
          }
          box.innerHTML = items
            .map((d) => `<div class="card card-pad mt8">
              <div class="row between">
                <div>
                  <div class="strong">${ui.esc(d.title)} ${statusBadge(d.status)}</div>
                  <div class="tiny dim mt4">${ui.esc(d.subtitle || '')} · ${ui.esc(d.category || '')} · 共 ${d.totalEpisodes || 0} 集 · 前 ${d.freeEpisodes || 1} 集免费</div>
                </div>
                <div class="tiny dim">${ui.esc(d.provider || '')}</div>
              </div>
              <div class="row wrap gap8 mt8">
                ${d.status === 'pending' || d.status === 'draft'
                  ? `<button class="btn btn-sm btn-primary" data-act="approve" data-id="${ui.esc(d.id)}" type="button">通过并上架</button>
                     <button class="btn btn-sm" data-act="reject" data-id="${ui.esc(d.id)}" type="button">驳回</button>`
                  : ''}
                ${d.status === 'published'
                  ? `<button class="btn btn-sm" data-act="offline" data-id="${ui.esc(d.id)}" type="button">下架</button>
                     <button class="btn btn-sm" data-act="slices" data-id="${ui.esc(d.id)}" type="button">生成切片投放</button>`
                  : ''}
                ${d.status !== 'published' ? `<button class="btn btn-sm" data-act="episodes" data-id="${ui.esc(d.id)}" data-title="${ui.esc(d.title)}" type="button">上传剧集</button>` : ''}
                <button class="btn btn-sm" data-act="delete" data-id="${ui.esc(d.id)}" type="button" style="color:#c0392b">删除</button>
              </div>
              ${d.status === 'rejected' && d.rejectReason ? `<div class="tiny mt6" style="color:#c0392b">驳回原因：${ui.esc(d.rejectReason)}</div>` : ''}
            </div>`)
            .join('');
        } catch (err) {
          box.innerHTML = `<div class="empty">${ui.esc(err.message || '加载失败')}</div>`;
        }
      };

      q('#dr-tabs').addEventListener('click', (e) => {
        const t = e.target.closest('[data-status]');
        if (!t) return;
        q('#dr-tabs').querySelectorAll('.chip').forEach((c) => c.classList.remove('active'));
        t.classList.add('active');
        loadList(t.dataset.status || '');
      });

      q('#dr-list').addEventListener('click', async (e) => {
        const btn = e.target.closest('[data-act]');
        if (!btn) return;
        const act = btn.dataset.act;
        const id = btn.dataset.id;
        btn.disabled = true;
        try {
          if (act === 'approve') {
            await service.adminReviewDrama(id, { action: 'approve' });
            ui.toast('已通过并上架', 'ok');
          } else if (act === 'reject') {
            const reason = await ui.promptDialog({ title: '驳回原因', label: '写清楚为什么驳回', okText: '驳回' });
            if (reason === null) return;
            await service.adminReviewDrama(id, { action: 'reject', reason: String(reason || '') });
            ui.toast('已驳回', 'ok');
          } else if (act === 'offline') {
            const ok = await ui.confirmDialog({ title: '下架短剧', message: '下架后频道和切口都看不到了，确定吗？' });
            if (!ok) return;
            await service.adminOfflineDrama(id);
            ui.toast('已下架', 'ok');
          } else if (act === 'slices') {
            ui.showLoading('正在切片并投放短视频流…');
            const r = await service.adminDramaSlices(id);
            ui.hideLoading();
            const made = (r && (r.made ?? (r.data && r.data.made))) || 0;
            ui.toast(`已生成 ${made} 条切片，去 #/shorts 刷一下`, 'ok');
          } else if (act === 'episodes') {
            currentDramaId = id;
            currentDramaTitle = btn.dataset.title || '';
            q('#dr-upload-panel').classList.remove('hide');
            q('#dr-upload-title').textContent = `《${currentDramaTitle}》— 继续上传剧集`;
            q('#dr-upload-panel').scrollIntoView({ behavior: 'smooth', block: 'center' });
            return;
          } else if (act === 'delete') {
            const ok = await ui.confirmDialog({ title: '删除短剧', message: '删除后不可恢复（软删除）' });
            if (!ok) return;
            await service.adminDeleteDrama(id);
            ui.toast('已删除', 'ok');
          }
          loadList(listStatus);
        } catch (err) {
          ui.toast(err.message || '操作失败', 'err');
        } finally {
          btn.disabled = false;
        }
      });

      loadList(listStatus);
    },
  };
}

export default { renderAdminDramas };

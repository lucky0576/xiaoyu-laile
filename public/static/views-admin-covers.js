/**
 * 小鱼来了 — 后台：封面管理
 *
 * 两件事：
 *   1. 批量把信息封面换成「实景照片 + 标题 + 城市徽标」版本
 *      （用户自己传过实拍图的会自动跳过，绝不覆盖）
 *   2. 预热图片缓存 —— 把各行业的照片先下到服务器，
 *      之后生成封面就不用等跨境下载了
 *
 * 两个任务都是「前端循环 + 单条接口」，不用一个请求跑几分钟。
 */

import { service } from './api.js';
import * as ui from './ui.js';

export async function renderAdminCovers(ctx) {
  if (!ctx.state.user?.isAdmin) {
    return {
      title: '封面管理',
      showBack: true,
      content: '<div class="page"><div class="empty">只有管理员可以访问</div></div>',
    };
  }

  const html = `<div class="page">
    <div class="card card-pad">
      <div class="strong mb8">🖼 批量换照片封面</div>
      <div class="tiny dim mb12">
        给没有实拍图的信息，按标题自动找一张行业实景照片，压上标题与城市徽标。
        <b>已经上传过图片的信息会自动跳过，不会覆盖。</b>
      </div>
      <div class="row gap8" style="flex-wrap:wrap">
        <button class="btn btn-sm" id="cv-check" type="button">检查可换数量</button>
        <button class="btn btn-sm btn-primary" id="cv-run" type="button" disabled>开始批量换</button>
      </div>
      <div class="cv-progress mt12 hide" id="cv-progress">
        <div class="cv-bar"><i id="cv-bar-fill" style="width:0%"></i></div>
        <div class="tiny dim mt6" id="cv-progress-text"></div>
      </div>
      <div class="cv-result mt12" id="cv-result"></div>
    </div>

    <div class="card card-pad mt12">
      <div class="strong mb8">⚡ 预热图片缓存</div>
      <div class="tiny dim mb12">
        把各行业的照片先下载到服务器缓存 30 天。预热后生成封面是秒出，
        没预热时首次要跨境下载，可能要十几二十秒。
      </div>
      <div class="row gap8" style="flex-wrap:wrap">
        <button class="btn btn-sm" id="wm-check" type="button">查看搜索词</button>
        <button class="btn btn-sm btn-primary" id="wm-run" type="button" disabled>开始预热</button>
      </div>
      <div class="cv-progress mt12 hide" id="wm-progress">
        <div class="cv-bar"><i id="wm-bar-fill" style="width:0%"></i></div>
        <div class="tiny dim mt6" id="wm-progress-text"></div>
      </div>
      <div class="cv-result mt12" id="wm-result"></div>
    </div>
  </div>`;

  return {
    title: '封面管理',
    content: html,
    showBack: true,
    mount(root) {
      const $ = (s) => root.querySelector(s);

      /* ---------------- 批量换封面 ---------------- */
      let candidates = [];
      const check = $('#cv-check');
      const run = $('#cv-run');
      const prog = $('#cv-progress');
      const fill = $('#cv-bar-fill');
      const ptext = $('#cv-progress-text');
      const resultBox = $('#cv-result');

      check?.addEventListener('click', async () => {
        check.disabled = true;
        check.textContent = '检查中…';
        try {
          const r = await service.coverCandidates();
          candidates = r.items || [];
          resultBox.innerHTML = `<div class="cv-note">
            共 ${r.total} 条，可换 <b>${candidates.length}</b> 条，
            跳过 ${r.skipped} 条（用户有实拍图）
          </div>`;
          run.disabled = candidates.length === 0;
        } catch (err) {
          ui.toast(err.message || '检查失败', 'err');
        } finally {
          check.disabled = false;
          check.textContent = '检查可换数量';
        }
      });

      run?.addEventListener('click', async () => {
        if (!candidates.length) return;
        const ok = await ui.confirmDialog({
          title: '确认批量换封面',
          message: `将给 ${candidates.length} 条信息重新生成照片封面。\n已有实拍图的信息不在其中，不会被覆盖。\n\n大约需要 ${Math.ceil(candidates.length * 0.15)} 分钟。`,
          okText: '开始',
        });
        if (!ok) return;

        run.disabled = true;
        check.disabled = true;
        prog.classList.remove('hide');
        let done = 0;
        let success = 0;
        let failed = 0;

        for (const it of candidates) {
          done += 1;
          fill.style.width = `${Math.round((done / candidates.length) * 100)}%`;
          ptext.textContent = `${done}/${candidates.length} · ${String(it.title || '').slice(0, 18)}`;
          try {
            const r = await service.coverPhoto(it.id, true);
            if (r && r.ok) success += 1;
            else failed += 1;
          } catch {
            failed += 1;
          }
          await new Promise((res) => setTimeout(res, 80));
        }

        ptext.textContent = `完成：成功 ${success} / 失败 ${failed}`;
        resultBox.innerHTML = `<div class="cv-note cv-ok">✅ 已换 ${success} 条${failed ? `，失败 ${failed} 条` : ''}</div>`;
        run.disabled = false;
        check.disabled = false;
        ui.toast('批量换封面完成', 'ok');
      });

      /* ---------------- 预热缓存 ---------------- */
      let queries = [];
      const wmCheck = $('#wm-check');
      const wmRun = $('#wm-run');
      const wmProg = $('#wm-progress');
      const wmFill = $('#wm-bar-fill');
      const wmText = $('#wm-progress-text');
      const wmResult = $('#wm-result');

      wmCheck?.addEventListener('click', async () => {
        wmCheck.disabled = true;
        wmCheck.textContent = '读取中…';
        try {
          const r = await service.coverQueries();
          queries = r.queries || [];
          wmResult.innerHTML = `<div class="cv-note">共 ${queries.length} 个搜索词：<br><span class="tiny dim">${queries.map((q) => ui.esc(q)).join('、')}</span></div>`;
          wmRun.disabled = queries.length === 0;
        } catch (err) {
          ui.toast(err.message || '读取失败', 'err');
        } finally {
          wmCheck.disabled = false;
          wmCheck.textContent = '查看搜索词';
        }
      });

      wmRun?.addEventListener('click', async () => {
        if (!queries.length) return;
        wmRun.disabled = true;
        wmCheck.disabled = true;
        wmProg.classList.remove('hide');
        let done = 0;
        let cached = 0;
        let failed = 0;

        for (const q of queries) {
          done += 1;
          wmFill.style.width = `${Math.round((done / queries.length) * 100)}%`;
          wmText.textContent = `${done}/${queries.length} · ${q}`;
          try {
            const r = await service.coverWarm(q);
            if (r && r.ok) cached += 1;
            else failed += 1;
          } catch {
            failed += 1;
          }
        }

        wmText.textContent = `完成：成功 ${cached} / 失败 ${failed}`;
        wmResult.innerHTML = `<div class="cv-note cv-ok">✅ 已预热 ${cached} 个${failed ? `，失败 ${failed} 个` : ''}</div>`;
        wmRun.disabled = false;
        wmCheck.disabled = false;
        ui.toast('缓存预热完成', 'ok');
      });
    },
  };
}

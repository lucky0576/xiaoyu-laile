/**
 * 小鱼来了 — 发布页
 *
 * 流程：输入文字 / 导入文件 → AI 生成主标题与副标题 + 可靠性解析 → 补充要素 → 选择有效期 → 发布
 */
import { api, service, isLoggedIn } from './api.js';
import * as ui from './ui.js';
import { aiCardHtml, fileCardHtml } from './components.js';

const ACCEPT = '.png,.jpg,.jpeg,.gif,.webp,.bmp,.svg,.pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.csv,.txt,.md,.dwg,.dxf,.zip,.rar,.7z,.tar,.gz,.mp4,.mov,.avi,.mkv,.webm,.mp3,.wav,.m4a';

export async function renderPublish(ctx, params) {
  if (!isLoggedIn()) {
    ctx.nav(`#/login?redirect=${encodeURIComponent('#/publish')}`);
    return { title: '发布信息', content: '<div class="page"><div class="empty">正在跳转登录…</div></div>', noTab: true };
  }

  const taxonomy = ctx.state.taxonomy || {};
  const editing = params.edit ? await service.listing(params.edit).then((r) => r.listing).catch(() => null) : null;
  const category = editing?.category || params.category || 'project';
  const cat = (taxonomy.categories || []).find((c) => c.id === category) || { types: [] };

  const html = `<div class="page">
    <div class="card card-pad">
      <div class="strong mb8">1. 选择发布板块</div>
      <div class="cat-grid">
        ${(taxonomy.categories || []).map((c) => `<a class="cat-card ${c.id === category ? 'active' : ''}" href="#/publish?category=${c.id}" style="${c.id === category ? 'border-color:var(--brand);background:var(--brand-050)' : ''}">
          <div class="ico">${c.icon}</div><div class="name">${ui.esc(c.name)}</div>
          <div class="desc">${ui.esc((c.types || []).slice(0, 2).map((t) => t.name).join('/'))}</div>
        </a>`).join('')}
      </div>
    </div>

    <div class="card card-pad mt12">
      <div class="strong mb8">2. 输入文字 或 导入文件</div>
      <textarea class="textarea" id="pub-text" style="min-height:180px" placeholder="把项目情况写在这里，例如：
山东东营 200MW 渔光互补光伏电站 EPC 总承包招标
总投资约 8.6 亿元，工期 14 个月
要求电力工程施工总承包一级资质，近三年 100MW 以上业绩不少于 2 个
联系人：张工 13800001234">${ui.esc(editing?.text || '')}</textarea>

      <div class="row between mt8">
        <button class="btn btn-sm btn-outline" id="pub-import">📎 导入文件（PPT/PDF/Word/Excel/CAD/图片/视频/压缩包）</button>
        <span class="tiny dim" id="pub-upload-status"></span>
      </div>
      <input type="file" id="pub-file-input" multiple accept="${ACCEPT}" style="display:none">
      <div id="pub-files" class="row wrap gap8 mt8"></div>
      <div class="tiny dim mt8">AI 会自动读取上传文件里的文字（PPT / PDF / Word / Excel / CAD / 文本），据此生成标题并解析项目。</div>
    </div>

    <div class="card card-pad mt12">
      <div class="row between mb8">
        <div class="strong">3. AI 智能生成</div>
        <span class="tiny dim">可反复生成，直到满意</span>
      </div>
      <button class="btn btn-primary btn-block" id="pub-ai">🤖 AI 生成主标题、副标题并解析项目</button>
      <div id="pub-ai-result" class="mt12"></div>
    </div>

    <div class="card card-pad mt12" id="pub-fields" style="display:none">
      <div class="strong mb8">4. 补充信息要素</div>

      <div class="field">
        <label>类型</label>
        <select class="select" id="pub-type">
          <option value="">请选择</option>
          ${(cat.types || []).map((t) => `<option value="${ui.esc(t.id)}" ${editing?.type === t.id ? 'selected' : ''}>${ui.esc(t.name)}${t.desc ? `（${ui.esc(t.desc.slice(0, 20))}…）` : ''}</option>`).join('')}
        </select>
      </div>

      <div id="pub-cat-fields"></div>

      <div class="field">
        <label>联系人</label>
        <input class="input" id="pub-contact-name" placeholder="称呼" value="${ui.esc(editing?.contact?.name || ctx.state.user?.nickname || '')}">
      </div>
      <div class="field">
        <label>联系电话</label>
        <input class="input" id="pub-phone" placeholder="手机号" value="${ui.esc(editing?.contact?.phone || ctx.state.user?.phone || '')}">
      </div>
      <div class="field">
        <label>微信号</label>
        <input class="input" id="pub-wechat" placeholder="微信号（选填）" value="${ui.esc(editing?.contact?.wechat || ctx.state.user?.wechatId || '')}">
      </div>
      <div class="field">
        <label>企业名称</label>
        <input class="input" id="pub-company" placeholder="发布主体（选填）" value="${ui.esc(editing?.company || ctx.state.user?.company || '')}">
      </div>
      <label class="checkbox mb12"><input type="checkbox" id="pub-hide-contact" ${editing?.hideContact ? 'checked' : ''}> <span>隐藏联系方式（仅对接后的用户可见）</span></label>
      <label class="checkbox"><input type="checkbox" id="pub-ai-reply" checked> <span>允许 AI 助理代表我回复留言</span></label>
    </div>

    <div class="card card-pad mt12" id="pub-duration" style="display:none">
      <div class="strong mb8">5. 选择发布期限</div>
      <div class="chips" id="pub-duration-chips">
        ${(taxonomy.durations || []).map((d) => `<a class="chip ${d.days === 30 ? 'active' : ''}" data-days="${d.days}">${ui.esc(d.label)} · ${ui.esc(d.desc)}</a>`).join('')}
      </div>
    </div>

    <div class="card card-pad mt12" id="pub-actions" style="display:none">
      <div class="btn-group">
        <button class="btn" id="pub-draft">存为草稿</button>
        <button class="btn btn-primary" id="pub-submit">立即发布</button>
      </div>
      <div class="tiny dim mt8">发布后信息会按行业与城市推送给关注了相关领域的用户；留言区由 AI 助理协助应答。</div>
    </div>
  </div>`;

  return {
    title: editing ? '编辑信息' : '发布信息',
    content: html,
    showBack: true,
    noTab: false,
    activeTab: 'publish',
    async mount(root) {
      /* ---------------- 状态 ---------------- */
      let uploaded = (editing?.fileList || []).map((f) => ({ ...f }));
      let aiResult = editing ? { titles: editing.ai?.titles, analysis: editing.ai?.analysis } : null;
      let durationDays = editing?.durationDays || 30;
      let busy = false;

      const $ = (s) => root.querySelector(s);
      const showSteps = () => {
        ['#pub-fields', '#pub-duration', '#pub-actions'].forEach((s) => {
          const el = $(s);
          if (el) el.style.display = '';
        });
      };

      const renderFiles = () => {
        const box = $('#pub-files');
        box.innerHTML = uploaded.length
          ? uploaded.map((f) => `<div style="position:relative;flex:1;min-width:200px">
              ${fileCardHtml(f)}
              <button class="icon-btn" data-remove="${ui.esc(f.id)}" style="position:absolute;right:2px;top:2px;font-size:14px">✕</button>
            </div>`).join('')
          : '';
        $('#pub-upload-status').textContent = uploaded.length ? `已导入 ${uploaded.length} 个文件` : '';
      };

      const renderCatFields = () => {
        const box = $('#pub-cat-fields');
        if (category === 'event') {
          box.innerHTML = `
            <div class="field"><label>活动开始时间</label><input class="input" type="datetime-local" id="f-startAt" value="${ui.esc((editing?.event?.startAt || '').slice(0, 16))}"></div>
            <div class="field"><label>活动结束时间</label><input class="input" type="datetime-local" id="f-endAt" value="${ui.esc((editing?.event?.endAt || '').slice(0, 16))}"></div>
            <div class="field"><label>活动地点</label><input class="input" id="f-address" placeholder="线上活动可留空并勾选线上" value="${ui.esc(editing?.event?.address || '')}"></div>
            <div class="row between mb12"><span class="small">线上活动</span><label class="switch"><input type="checkbox" id="f-online" ${editing?.event?.online ? 'checked' : ''}><span class="slider"></span></label></div>
            <div class="field"><label>名额</label><input class="input" type="number" id="f-capacity" placeholder="如 300" value="${editing?.event?.capacity || ''}"></div>
            <div class="row between mb12"><span class="small">需要在线支付报名费</span><label class="switch"><input type="checkbox" id="f-needPay" ${editing?.event?.needPay ? 'checked' : ''}><span class="slider"></span></label></div>
            <div class="field"><label>报名费（元）</label><input class="input" type="number" id="f-fee" placeholder="0 表示免费" value="${editing?.event?.fee || ''}"></div>
            <div class="field"><label>报名截止时间</label><input class="input" type="datetime-local" id="f-registerDeadline" value="${ui.esc((editing?.event?.registerDeadline || '').slice(0, 16))}"></div>
            <div class="field"><label>主办方</label><input class="input" id="f-organizer" value="${ui.esc(editing?.event?.organizer || ctx.state.user?.company || '')}"></div>`;
        } else if (category === 'trade') {
          box.innerHTML = `
            <div class="field"><label>供需类型</label>
              <select class="select" id="f-tradeType">
                ${['采购', '供应', '委托加工', '询价', '招标采购', '库存尾货', '代理经销', '物流仓储'].map((t) => `<option ${editing?.trade?.tradeType === t ? 'selected' : ''}>${t}</option>`).join('')}
              </select>
            </div>
            <div class="field"><label>数量</label><input class="input" id="f-quantity" placeholder="如 12 万吨 / 20 套" value="${ui.esc(editing?.trade?.quantity || '')}"></div>
            <div class="field"><label>单位</label><input class="input" id="f-unit" placeholder="如 吨 / 套 / 台" value="${ui.esc(editing?.trade?.unit || '')}"></div>
            <div class="field"><label>价格条件</label><input class="input" id="f-price" placeholder="如 月结 60 天 / 电议" value="${ui.esc(editing?.trade?.price || '')}"></div>
            <div class="field"><label>付款方式</label><input class="input" id="f-payment" placeholder="如 预付 30%，验收 60%" value="${ui.esc(editing?.trade?.payment || '')}"></div>
            <div class="field"><label>交付方式 / 地点</label><input class="input" id="f-delivery" value="${ui.esc(editing?.trade?.delivery || '')}"></div>
            <div class="field"><label>报价截止</label><input class="input" type="date" id="f-deadline" value="${ui.esc((editing?.trade?.deadline || '').slice(0, 10))}"></div>`;
        } else {
          box.innerHTML = `
            <div class="field"><label>金额 / 投资额</label><input class="input" id="f-investAmount" placeholder="如 8.6 亿元" value="${ui.esc(editing?.project?.investAmount || '')}"></div>
            <div class="field"><label>项目阶段</label><input class="input" id="f-stage" placeholder="如 已备案 / 已核准 / 施工中" value="${ui.esc(editing?.project?.stage || '')}"></div>
            <div class="field"><label>合作方式</label><input class="input" id="f-cooperation" placeholder="如 联合体投标 / 股权合作" value="${ui.esc(editing?.project?.cooperation || '')}"></div>
            <div class="field"><label>周期</label><input class="input" id="f-period" placeholder="如 14 个月" value="${ui.esc(editing?.project?.period || '')}"></div>
            <div class="field"><label>对接对象要求</label><input class="input" id="f-target" placeholder="如 具备电力工程总承包一级资质" value="${ui.esc(editing?.project?.target || '')}"></div>`;
        }
      };

      const collectCategoryFields = () => {
        const v = (id) => $(id)?.value?.trim() || '';
        const c = (id) => Boolean($(id)?.checked);
        if (category === 'event') {
          return {
            startAt: v('#f-startAt'), endAt: v('#f-endAt'), address: v('#f-address'), online: c('#f-online'),
            capacity: v('#f-capacity'), needPay: c('#f-needPay'), fee: v('#f-fee'),
            registerDeadline: v('#f-registerDeadline'), organizer: v('#f-organizer'),
          };
        }
        if (category === 'trade') {
          return {
            tradeType: v('#f-tradeType'), quantity: v('#f-quantity'), unit: v('#f-unit'), price: v('#f-price'),
            payment: v('#f-payment'), delivery: v('#f-delivery'), deadline: v('#f-deadline'),
          };
        }
        return {
          investAmount: v('#f-investAmount'), stage: v('#f-stage'), cooperation: v('#f-cooperation'),
          period: v('#f-period'), target: v('#f-target'),
        };
      };

      /* ---------------- 导入文件 ---------------- */
      const uploadFiles = async (files) => {
        if (!files.length) return;
        $('#pub-upload-status').textContent = `上传中 0%`;
        const fd = new FormData();
        for (const f of files) fd.append('file', f, f.name);
        try {
          const res = await api.upload('/api/files', fd, {
            onProgress: (p) => { $('#pub-upload-status').textContent = `上传中 ${p}%`; },
          });
          uploaded = [...uploaded, ...res.files];
          renderFiles();
          const parsed = res.files.filter((f) => (f.text || '').trim().length > 0).length;
          ui.toast(`已导入 ${res.files.length} 个文件${parsed ? `，其中 ${parsed} 个已解析出文字` : ''}`, 'ok');
        } catch (err) {
          ui.toast(err.message, 'err');
          $('#pub-upload-status').textContent = '';
        }
      };

      $('#pub-import').addEventListener('click', () => $('#pub-file-input').click());
      $('#pub-file-input').addEventListener('change', (e) => {
        uploadFiles([...e.target.files]);
        e.target.value = '';
      });
      root.querySelector('#pub-files').addEventListener('click', (e) => {
        const btn = e.target.closest('[data-remove]');
        if (!btn) return;
        uploaded = uploaded.filter((f) => f.id !== btn.dataset.remove);
        renderFiles();
      });
      // 拖拽上传
      const dropZone = $('#pub-text');
      dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.style.borderColor = 'var(--brand)'; });
      dropZone.addEventListener('dragleave', () => { dropZone.style.borderColor = ''; });
      dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.style.borderColor = '';
        if (e.dataTransfer?.files?.length) uploadFiles([...e.dataTransfer.files]);
      });

      /* ---------------- AI 生成 ---------------- */
      $('#pub-ai').addEventListener('click', async () => {
        const text = $('#pub-text').value.trim();
        if (!text && !uploaded.length) return ui.toast('请先输入文字内容或导入文件', 'err');
        const btn = $('#pub-ai');
        btn.disabled = true;
        btn.textContent = 'AI 正在阅读并分析…';
        try {
          const fd = api.form({ text, category, fileIds: uploaded.map((f) => f.id) });
          const res = await service.aiPreview(fd);
          aiResult = res;
          renderAiResult(res);
          showSteps();
          renderCatFields();
          ui.toast('AI 已完成生成与解析', 'ok');
        } catch (err) {
          ui.toast(err.message, 'err');
        } finally {
          btn.disabled = false;
          btn.textContent = '🤖 AI 生成主标题、副标题并解析项目';
        }
      });

      const renderAiResult = (res) => {
        const box = $('#pub-ai-result');
        const titles = res.titles || {};
        const alts = (titles.alternatives || []).filter((a) => a.title && a.title !== titles.title);
        box.innerHTML = `
          <div class="tiny dim mb8">${titles.source === 'ai' ? '由大模型生成' : '由内置规则引擎生成（未配置 AI_API_KEY）'}，可直接修改</div>
          <div class="field">
            <label>主标题</label>
            <input class="input" id="pub-title" value="${ui.esc(titles.title || '')}" maxlength="120">
          </div>
          <div class="field">
            <label>副标题</label>
            <input class="input" id="pub-subtitle" value="${ui.esc(titles.subtitle || '')}" maxlength="200">
          </div>
          ${alts.length ? `<div class="field"><label>备选标题（点击替换）</label>
            <div class="chips">${alts.map((a) => `<a class="chip" data-alt="${ui.esc(a.title)}" data-alt-sub="${ui.esc(a.subtitle || '')}">${ui.esc(a.title.slice(0, 24))}…</a>`).join('')}</div>
          </div>` : ''}
          ${(res.titles?.keywords || []).length ? `<div class="field"><label>AI 提取的关键词</label>
            <div class="chips">${res.titles.keywords.map((k) => `<span class="chip soft">${ui.esc(k)}</span>`).join('')}</div>
          </div>` : ''}
          ${aiCardHtml({ reliability: res.analysis?.reliability, summary: res.analysis?.summary, source: res.analysis?.source })}
          ${(res.extracted?.notes || []).length ? `<div class="tiny dim mt8">文件解析提示：${res.extracted.notes.map(ui.esc).join('；')}</div>` : ''}
        `;
        box.querySelectorAll('[data-alt]').forEach((el) => {
          el.addEventListener('click', () => {
            $('#pub-title').value = el.dataset.alt;
            $('#pub-subtitle').value = el.dataset.altSub || '';
          });
        });
      };

      /* ---------------- 期限 ---------------- */
      $('#pub-duration-chips').addEventListener('click', (e) => {
        const chip = e.target.closest('[data-days]');
        if (!chip) return;
        durationDays = Number(chip.dataset.days);
        root.querySelectorAll('#pub-duration-chips .chip').forEach((el) => el.classList.toggle('active', el === chip));
      });

      /* ---------------- 提交 ---------------- */
      const submit = async (publishNow) => {
        if (busy) return;
        const text = $('#pub-text').value.trim();
        if (!text && !uploaded.length) return ui.toast('请先输入文字内容或导入文件', 'err');

        const title = $('#pub-title')?.value?.trim() || aiResult?.titles?.title || text.split('\n')[0].slice(0, 60);
        const subtitle = $('#pub-subtitle')?.value?.trim() || aiResult?.titles?.subtitle || '';

        busy = true;
        const publishBtn = $('#pub-submit');
        const draftBtn = $('#pub-draft');
        if (publishBtn) publishBtn.textContent = '提交中…';
        if (draftBtn) draftBtn.disabled = true;

        const fields = {
          category,
          text,
          title,
          subtitle,
          type: $('#pub-type')?.value || '',
          durationDays,
          fileIds: uploaded.map((f) => f.id),
          contactName: $('#pub-contact-name')?.value || '',
          phone: $('#pub-phone')?.value || '',
          wechat: $('#pub-wechat')?.value || '',
          company: $('#pub-company')?.value || '',
          hideContact: $('#pub-hide-contact')?.checked ? '1' : '0',
          aiAutoReply: $('#pub-ai-reply')?.checked ? '1' : '0',
          publish: publishNow ? '1' : '0',
          ...collectCategoryFields(),
        };

        try {
          const fd = api.form(fields);
          if (editing) {
            await service.updateListing(editing.id, { ...fields, hideContact: Boolean(fields.hideContact) });
            if (publishNow && editing.status !== 'published') await service.publishListing(editing.id, durationDays);
            ui.toast('已保存', 'ok');
            ctx.nav(`#/detail/${editing.id}`);
          } else {
            const res = await service.createListing(fd);
            ui.toast(publishNow ? '发布成功！' : '已存为草稿', 'ok');
            ctx.nav(`#/detail/${res.listing.id}`);
          }
        } catch (err) {
          ui.toast(err.message, 'err');
        } finally {
          busy = false;
          if (publishBtn) publishBtn.textContent = '立即发布';
          if (draftBtn) draftBtn.disabled = false;
        }
      };

      $('#pub-submit').addEventListener('click', () => submit(true));
      $('#pub-draft').addEventListener('click', () => submit(false));

      /* ---------------- 编辑态回填 ---------------- */
      renderFiles();
      if (editing) {
        showSteps();
        renderCatFields();
        if (aiResult) renderAiResult(aiResult);
        const chip = root.querySelector(`#pub-duration-chips [data-days="${durationDays}"]`);
        if (chip) {
          root.querySelectorAll('#pub-duration-chips .chip').forEach((el) => el.classList.toggle('active', el === chip));
        }
      }
    },
  };
}

/**
 * 小鱼来了 — 发布页
 *
 * 流程：输入文字 / 导入文件 → AI 生成主标题与副标题 + 可靠性解析 → 补充要素 → 选择有效期 → 发布
 */
import { api, service, isLoggedIn } from './api.js';
import * as ui from './ui.js';
import { aiCardHtml, fileCardHtml } from './components.js';
import { applyAutoCover } from './cover.js';

const ACCEPT = '.png,.jpg,.jpeg,.gif,.webp,.bmp,.svg,.pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.csv,.txt,.md,.dwg,.dxf,.zip,.rar,.7z,.tar,.gz,.mp4,.mov,.avi,.mkv,.webm,.mp3,.wav,.m4a';

/* ------------------------------------------------------------------ */
/* 导入：拖拽 / 文件夹                                                  */
/* ------------------------------------------------------------------ */

const ACCEPT_EXTS = ACCEPT.split(',').map((s) => s.trim().replace(/^\./, '').toLowerCase()).filter(Boolean);
const IMPORT_LIMIT = 300;

/**
 * 发布前的联系方式提醒。
 *
 * 这里只是**提示**，真正的隐藏由服务端（src/lib/contact-mask.js）执行 ——
 * 前端提示可以被绕过，服务端遮蔽才是那道人拦不住的关。
 * 所以两边的规则不需要逐字一致，提示宁可宽一点。
 */
const CONTACT_HINT = [
  { kind: '手机号', re: /(?:\+?86[\s-]?)?1[3-9]\d[\s-]?\d{4}[\s-]?\d{4}/g },
  { kind: '邮箱', re: /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g },
  { kind: '社交账号', re: /(?:微信|weixin|wechat|wx|vx|VX|V信|QQ|qq|企鹅)\s*(?:号|号码|ID|id)?\s*[:：]?\s*[A-Za-z0-9_-]{4,20}/g },
  { kind: '固定电话', re: /0\d{2,3}[\s-]\d{7,8}/g },
  { kind: '服务电话', re: /[48]00[\s-]?\d{3}[\s-]?\d{4}/g },
];

function hintContacts(text) {
  const s = String(text || '').replace(/[\uFF10-\uFF19]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0));
  const kinds = [];
  let count = 0;
  for (const { kind, re } of CONTACT_HINT) {
    re.lastIndex = 0;
    const m = s.match(re);
    if (m && m.length) {
      count += m.length;
      kinds.push(kind);
    }
  }
  return { count, kinds: [...new Set(kinds)] };
}

/**
 * 过滤掉系统文件、空文件与不支持的类型。
 * 文件夹导入很容易带出 .DS_Store、~$xxx.docx 这类垃圾，不过滤会白传一堆。
 */
export function filterImportable(list, limit = IMPORT_LIMIT) {
  const out = [];
  let skipped = 0;
  for (const f of list || []) {
    const name = f?.name || '';
    if (!name) { skipped++; continue; }
    // Office 临时文件、macOS 资源分支、隐藏文件
    if (name.startsWith('~$') || name.startsWith('.') || name.startsWith('._')) { skipped++; continue; }
    if (!f.size) { skipped++; continue; }
    const ext = name.includes('.') ? name.split('.').pop().toLowerCase() : '';
    if (ext && !ACCEPT_EXTS.includes(ext)) { skipped++; continue; }
    if (out.length >= limit) { skipped++; continue; }
    out.push(f);
  }
  return { files: out, skipped };
}

/**
 * 把拖进来的内容展开成文件列表，**支持文件夹**。
 *
 * 为什么不能直接用 dataTransfer.files：
 *   拖文件夹时 files 里只有目录项（部分浏览器干脆为空），
 *   必须走 webkitGetAsEntry() 递归遍历目录。
 *
 * readEntries 每次最多返回 100 条，要反复读到空为止，否则大文件夹会漏文件。
 */
export async function filesFromDataTransfer(dt) {
  const { items, files } = dt || {};
  const canWalk = items && items.length && typeof items[0]?.webkitGetAsEntry === 'function';
  if (!canWalk) return [...(files || [])];

  const roots = [];
  for (const it of items) {
    if (it.kind !== 'file') continue;
    const entry = it.webkitGetAsEntry?.();
    if (entry) roots.push(entry);
  }
  if (!roots.length) return [...(files || [])];

  const out = [];
  const walk = async (entry, depth) => {
    if (!entry || depth > 8 || out.length >= IMPORT_LIMIT) return;
    if (entry.isFile) {
      const f = await new Promise((res) => entry.file(res, () => res(null)));
      if (f) out.push(f);
      return;
    }
    if (!entry.isDirectory) return;
    const reader = entry.createReader();
    for (let round = 0; round < 200; round++) {
      // 必须反复读，一次最多 100 条
      const batch = await new Promise((res) => reader.readEntries(res, () => res([])));
      if (!batch || !batch.length) break;
      for (const child of batch) {
        if (out.length >= IMPORT_LIMIT) break;
        await walk(child, depth + 1);
      }
    }
  };

  for (const r of roots) {
    if (out.length >= IMPORT_LIMIT) break;
    await walk(r, 0);
  }
  return out;
}

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
      <div class="strong mb8">2. 输入标题与内容 或 导入文件</div>
      <div class="field">
        <label>标题 <span class="tiny dim">（可留空，AI 会帮你生成）</span></label>
        <input class="input" id="pub-title" maxlength="120" placeholder="一句话说清这条信息，例如：山东东营 200MW 渔光互补光伏电站 EPC 总承包招标" value="${ui.esc(editing?.title || '')}">
      </div>
      <div class="field">
        <label>副标题 <span class="tiny dim">（选填）</span></label>
        <input class="input" id="pub-subtitle" maxlength="200" placeholder="补充说明金额、规模、期限等关键信息" value="${ui.esc(editing?.subtitle || '')}">
      </div>
      <textarea class="textarea" id="pub-text" style="min-height:180px" placeholder="把项目情况写在这里，例如：
山东东营 200MW 渔光互补光伏电站 EPC 总承包招标
总投资约 8.6 亿元，工期 14 个月
要求电力工程施工总承包一级资质，近三年 100MW 以上业绩不少于 2 个">${ui.esc(editing?.text || '')}</textarea>
        <div class="warn-note hide mt8" id="pub-contact-warn"></div>

      <div class="upload-zone" id="pub-drop">
        <div class="upload-zone-ico">📥</div>
        <div class="upload-zone-main">把文件或<b>整个文件夹</b>拖到这里</div>
        <div class="upload-zone-sub" id="pub-drop-hint">PPT · Word · Excel · PDF · CAD · 图片 · 视频 · 压缩包，可一次拖多个</div>
        <div class="row gap8 mt12" style="justify-content:center;flex-wrap:wrap">
          <button class="btn btn-sm btn-outline" id="pub-import" type="button">📎 选择文件</button>
          <button class="btn btn-sm btn-outline" id="pub-import-dir" type="button">📁 选择文件夹</button>
        </div>
      </div>
      <input type="file" id="pub-file-input" multiple accept="${ACCEPT}" style="display:none">
      <input type="file" id="pub-dir-input" webkitdirectory directory multiple style="display:none">
      <div class="row between mt8">
        <span class="tiny dim" id="pub-upload-status"></span>
      </div>
      <div id="pub-upload-queue"></div>
      <div id="pub-files" class="row wrap gap8 mt8"></div>
      <div class="tiny dim mt8">AI 会自动读取上传文件里的文字（PPT / PDF / Word / Excel / CAD / 文本），据此生成标题并解析项目。</div>

      <div class="card card-pad mt12">
        <div class="row between">
          <div class="strong">📍 位置（可选）</div>
          <label class="switch"><input type="checkbox" id="pub-use-loc" ${editing?.location ? 'checked' : ''}><span class="slider"></span></label>
        </div>
        <div class="tiny dim mt4">可以只给自己留个记录，也可以公开到详情页方便对方线下对接。</div>
        <div id="pub-loc-body" class="${editing?.location ? '' : 'hide'} mt12">
          <div class="row gap8">
            <button class="btn btn-sm btn-outline" id="pub-loc-get" type="button">📡 获取当前位置</button>
            <span class="tiny dim" id="pub-loc-status" style="align-self:center"></span>
          </div>
          <div class="field mt8">
            <label>地址 <span class="tiny dim">（可手填）</span></label>
            <input class="input" id="pub-address" maxlength="200" placeholder="如：上海市黄浦区人民广场" value="${ui.esc(editing?.location?.address || '')}">
          </div>
          <div class="row between">
            <span class="small">对其他人公开位置</span>
            <label class="switch"><input type="checkbox" id="pub-loc-public" ${editing?.location?.public ? 'checked' : ''}><span class="slider"></span></label>
          </div>
          <div class="tiny dim mt4">关闭时仅你和管理员可见，用于线下对接前自己确认。</div>
        </div>
      </div>

      <div class="secret-box mt12">
        <div class="row between">
          <div class="strong">🔒 文件保密</div>
          <label class="switch"><input type="checkbox" id="pub-secret-enabled" ${editing?.fileSecret?.enabled ? 'checked' : ''}><span class="slider"></span></label>
        </div>
        <div class="tiny dim mt4">开启后，附件只能凭密码<b>在线查看</b>，页面不提供下载入口；密码在有效期内可用。</div>

        <div id="pub-secret-body" class="${editing?.fileSecret?.enabled ? '' : 'hide'}">
          <div class="field mt12">
            <label>查看密码 ${editing?.fileSecret?.hasPassword ? '<span class="tiny dim">（留空则不修改）</span>' : '<span style="color:var(--danger)">*</span>'}</label>
            <div class="row gap8">
              <input class="input" id="pub-secret-pwd" maxlength="32" placeholder="至少 4 位，请自行告知对方" style="flex:2">
              <button class="btn btn-sm" type="button" id="pub-secret-gen">随机生成</button>
            </div>
            <div class="tiny dim mt4">密码只以哈希形式保存，平台也无法查看原文，请自行记下。</div>
          </div>
          <div class="field">
            <label>有效期（发布者决定）</label>
            <select class="select" id="pub-secret-ttl">
              ${[1, 2, 3, 4, 6, 8, 12].map((h) => `<option value="${h}" ${Number(editing?.fileSecret?.ttlHours) === h ? 'selected' : (h === 6 && !editing?.fileSecret?.ttlHours ? 'selected' : '')}>${h} 小时</option>`).join('')}
            </select>
            <div class="tiny dim mt4">过期后需要重新输入密码。</div>
          </div>
          <div class="warn-note">⚠️ <b>如实说明</b>：浏览器无法真正阻止下载 —— 能看到的内容都可以被截图、录屏或另存。这里挡住的是「随手下载」这条路，并让每次访问都有据可查。</div>
        </div>
      </div>
    </div>

    <div class="card card-pad mt12">
      <div class="row between mb8">
        <div class="strong">3. AI 智能生成</div>        <span class="tiny dim">先汇总、再生成，可反复重来</span>
      </div>

      <div class="step-hint mb12">
        <b>第一步：AI 汇总资料</b> —— 把你填的文字和导入的文件先读一遍，汇总成一份结构化摘要。
        <br><b>第二步：生成项目信息</b> —— 基于汇总结果生成主副标题、关键词与可靠性分析。
      </div>

      <button class="btn btn-primary btn-block" id="pub-summarize">📋 第一步：AI 汇总资料</button>

      <div id="pub-summary" class="mt12"></div>

      <button class="btn btn-primary btn-block mt12" id="pub-ai" disabled>🤖 第二步：生成项目信息（主副标题 + 解析）</button>
      <div class="tiny dim center mt4" id="pub-ai-lock">请先完成第一步的资料汇总</div>

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
      <div class="privacy-note mb12">
        🔒 <b>联系方式不会公开显示。</b>发布后，只有你自己和已发起项目对接、成为项目成员的人，才能看到电话与微信。
      </div>
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

      /* ---------------- 资质要求 / 商务条件 渲染辅助 ---------------- */
      const taxData = () => ctx.state.taxonomy || {};
      const qualLevels = () => taxData().qualificationLevels || ['不要求'];
      const termFields = () => taxData().businessTermFields || [];
      const qualPresets = () => taxData().projectQualificationPresets || [];

      const qualRowHtml = (q = {}) => `<div class="qual-row">
        <input class="input qual-name" list="qual-preset-list" placeholder="资质名称，如 电力工程施工总承包一级" value="${ui.esc(q.name || '')}">
        <div class="qual-meta">
          <select class="select qual-level">${qualLevels().map((l) => `<option ${q.level === l ? 'selected' : ''}>${ui.esc(l)}</option>`).join('')}</select>
          <label class="qual-req-wrap"><input type="checkbox" class="qual-req" ${q.required === false ? '' : 'checked'}> 必需</label>
          <button type="button" class="icon-btn qual-del" title="删除此项">✕</button>
        </div>
        <input class="input qual-note" placeholder="备注（选填），如 需提供证书扫描件" value="${ui.esc(q.note || '')}">
      </div>`;

      const termsHtml = (bt = {}) => termFields().map((f) => {
        const val = ui.esc(bt[f.key] || '');
        if (f.options) {
          return `<div class="field"><label>${ui.esc(f.label)}</label>
            <select class="select" data-term="${f.key}">
              <option value="">— 请选择 —</option>
              ${f.options.map((o) => `<option ${bt[f.key] === o ? 'selected' : ''}>${ui.esc(o)}</option>`).join('')}
            </select></div>`;
        }
        if (f.multiline) {
          return `<div class="field"><label>${ui.esc(f.label)}</label><textarea class="input" rows="2" data-term="${f.key}" placeholder="${ui.esc(f.placeholder || '')}">${val}</textarea></div>`;
        }
        return `<div class="field"><label>${ui.esc(f.label)}</label><input class="input" data-term="${f.key}" placeholder="${ui.esc(f.placeholder || '')}" value="${val}"></div>`;
      }).join('');

      const collectQualifications = (scope) => {
        const out = [];
        scope.querySelectorAll('#f-qual-list .qual-row').forEach((row) => {
          const name = row.querySelector('.qual-name')?.value?.trim();
          if (!name) return;
          out.push({
            name,
            level: row.querySelector('.qual-level')?.value || '',
            required: Boolean(row.querySelector('.qual-req')?.checked),
            note: row.querySelector('.qual-note')?.value?.trim() || '',
          });
        });
        return out;
      };

      const collectTerms = (scope) => {
        const out = {};
        scope.querySelectorAll('#f-terms [data-term]').forEach((el) => {
          const v = (el.value || '').trim();
          if (v) out[el.dataset.term] = v;
        });
        return out;
      };

      const bindQualBox = (scope) => {
        const box = scope.querySelector('#f-qual-box');
        if (!box) return;
        const list = box.querySelector('#f-qual-list');
        const needEl = scope.querySelector('#f-needQual');

        needEl?.addEventListener('change', () => box.classList.toggle('hide', !needEl.checked));

        box.querySelector('#f-qual-add')?.addEventListener('click', () => {
          list.insertAdjacentHTML('beforeend', qualRowHtml({}));
          list.lastElementChild?.querySelector('.qual-name')?.focus();
        });

        box.querySelector('#f-qual-preset')?.addEventListener('click', () => {
          ui.pickSheet({
            title: '选择常用资质（可多选）',
            options: qualPresets().map((p) => ({ value: p.id, label: p.name, desc: p.group })),
            multiple: true,
            onPick(ids) {
              if (!ids.length) return;
              const chosen = qualPresets().filter((p) => ids.includes(p.id));
              const existing = new Set([...list.querySelectorAll('.qual-name')].map((el) => el.value.trim()));
              for (const p of chosen) {
                if (existing.has(p.name)) continue;
                list.insertAdjacentHTML('beforeend', qualRowHtml({ name: p.name, required: true }));
                existing.add(p.name);
              }
            },
          });
        });

        list.addEventListener('click', (e) => {
          if (e.target.closest('.qual-del')) e.target.closest('.qual-row')?.remove();
        });
      };

      /* ---------------- 采购/供应：物资明细多条目 ---------------- */
      const tradeItemRowHtml = (it = {}) => `<div class="trade-item">
        <div class="row between mb4">
          <span class="tiny dim">物资</span>
          <button type="button" class="icon-btn trade-item-del" title="删除这一条">✕</button>
        </div>
        <input class="input" data-item="name" placeholder="品名，如 单晶硅光伏组件" value="${ui.esc(it.name || '')}">
        <div class="trade-grid">
          <input class="input" data-item="spec" placeholder="规格型号" value="${ui.esc(it.spec || '')}">
          <input class="input" data-item="quantity" placeholder="数量" value="${ui.esc(it.quantity || '')}">
          <input class="input" data-item="unit" placeholder="单位" value="${ui.esc(it.unit || '')}">
          <input class="input" data-item="price" placeholder="单价" value="${ui.esc(it.price || '')}">
        </div>
        <input class="input mt4" data-item="note" placeholder="备注（选填），如 品牌 / 交货期 / 质量标准" value="${ui.esc(it.note || '')}">
      </div>`;

      const collectTradeItems = (scope) => {
        const out = [];
        scope.querySelectorAll('#f-items .trade-item').forEach((row) => {
          const it = {};
          row.querySelectorAll('[data-item]').forEach((el) => { it[el.dataset.item] = el.value.trim(); });
          if (Object.values(it).some(Boolean)) out.push(it);
        });
        return out;
      };

      const bindTradeItems = (scope) => {
        const list = scope.querySelector('#f-items');
        if (!list) return;
        scope.querySelector('#f-item-add')?.addEventListener('click', () => {
          list.insertAdjacentHTML('beforeend', tradeItemRowHtml({}));
          list.lastElementChild?.querySelector('[data-item="name"]')?.focus();
        });
        list.addEventListener('click', (e) => {
          if (!e.target.closest('.trade-item-del')) return;
          const rows = list.querySelectorAll('.trade-item');
          // 至少保留一行，否则用户不知道怎么再加回来
          if (rows.length <= 1) {
            rows[0].querySelectorAll('[data-item]').forEach((el) => { el.value = ''; });
            return;
          }
          e.target.closest('.trade-item')?.remove();
        });
      };

      /* ---------------- 悬赏配图 ---------------- */
      const bindBountyImgs = (scope) => {
        const pick = scope.querySelector('#f-bountyImg-pick');
        const input = scope.querySelector('#f-bountyImgs');
        const list = scope.querySelector('#f-bountyImg-list');
        if (!pick || !input || !list) return;

        // 复用页面顶部的通用上传逻辑，传完的图会自动进 uploaded，
        // 发布时第一张图会被后端选为封面。
        const render = () => {
          const imgs = uploaded.filter((f) => f.kind === 'image');
          list.innerHTML = imgs.length
            ? imgs.map((f) => `<div class="bounty-img-item">
                <img src="${ui.esc(ui.safeUrl(f.url || ''))}" alt="">
                <button type="button" class="bounty-img-del" data-del="${ui.esc(f.id)}" title="移除">✕</button>
                ${uploaded.filter((x) => x.kind === 'image')[0]?.id === f.id ? '<span class="bounty-img-cover">封面</span>' : ''}
              </div>`).join('')
            : '<div class="tiny dim">还没有配图</div>';
        };

        pick.addEventListener('click', () => input.click());
        input.addEventListener('change', async () => {
          const files = [...(input.files || [])];
          input.value = '';
          if (!files.length) return;
          await uploadFiles(files);
          render();
        });
        list.addEventListener('click', (e) => {
          const del = e.target.closest('[data-del]');
          if (!del) return;
          uploaded = uploaded.filter((f) => f.id !== del.dataset.del);
          renderFiles();
          render();
        });

        render();
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
          const items = editing?.trade?.items || [];
          box.innerHTML = `
            <div class="field"><label>供需类型</label>
              <select class="select" id="f-tradeType">
                ${['采购', '供应', '委托加工', '询价', '招标采购', '库存尾货', '代理经销', '物流仓储'].map((t) => `<option ${editing?.trade?.tradeType === t ? 'selected' : ''}>${t}</option>`).join('')}
              </select>
            </div>

            <div class="form-section-title">物资明细</div>
            <div class="tiny dim mb8">同一个信息里有多条物资时逐条添加，<b>2 条以上会自动用表格展示</b>。</div>
            <div id="f-items">${items.map(tradeItemRowHtml).join('')}</div>
            <button class="btn btn-sm mb16" id="f-item-add" type="button">＋ 添加一条物资</button>

            <div class="form-section-title">整单条件</div>
            <div class="field"><label>总数量</label><input class="input" id="f-quantity" placeholder="如 12 万吨 / 20 套（可留空）" value="${ui.esc(editing?.trade?.quantity || '')}"></div>
            <div class="field"><label>价格条件</label><input class="input" id="f-price" placeholder="如 月结 60 天 / 电议" value="${ui.esc(editing?.trade?.price || '')}"></div>
            <div class="field"><label>付款方式</label><input class="input" id="f-payment" placeholder="如 预付 30%，验收 60%" value="${ui.esc(editing?.trade?.payment || '')}"></div>
            <div class="field"><label>交付方式 / 地点</label><input class="input" id="f-delivery" value="${ui.esc(editing?.trade?.delivery || '')}"></div>
            <div class="field"><label>报价截止</label><input class="input" type="date" id="f-deadline" value="${ui.esc((editing?.trade?.deadline || '').slice(0, 10))}"></div>`;
          bindTradeItems(box);
          return;
        } else if (category === 'bounty') {
          const bt = editing?.bounty || {};
          const bountyTypes = ctx.state.taxonomy?.bountyTypes || [];
          box.innerHTML = `
            <div class="form-section-title">悬赏图片</div>
            <div class="tiny dim mb8">配一张图，列表和详情页会醒目很多。第一张图会自动作为封面。</div>
            <div class="bounty-img-box">
              <input type="file" id="f-bountyImgs" accept="image/*" multiple style="display:none">
              <button class="btn btn-sm" id="f-bountyImg-pick" type="button">🖼️ 选择悬赏图片</button>
              <span class="tiny dim" id="f-bountyImg-tip">支持 JPG / PNG / WebP，可多选</span>
            </div>
            <div class="bounty-img-list" id="f-bountyImg-list"></div>

            <div class="form-section-title">悬赏内容</div>
            <div class="field"><label>悬赏类型</label>
              <select class="select" id="f-bountyType">
                ${bountyTypes.map((t) => `<option value="${ui.esc(t.id)}" ${bt.bountyType === t.id || bt.bountyType === t.name ? 'selected' : ''}>${ui.esc(t.name)} — ${ui.esc(t.desc)}</option>`).join('')}
              </select>
            </div>
            <div class="field"><label>赏金金额 <span style="color:var(--danger)">*</span></label>
              <div class="row gap8">
                <input class="input" id="f-reward" placeholder="如 50000" value="${ui.esc(bt.reward || '')}" style="flex:2">
                <select class="select" id="f-rewardUnit" style="flex:1">
                  ${['元', '万元'].map((u) => `<option ${bt.rewardUnit === u ? 'selected' : ''}>${u}</option>`).join('')}
                </select>
              </div>
            </div>
            <div class="field"><label>结算方式</label>
              <select class="select" id="f-settleMode">
                <option value="">请选择</option>
                ${(ctx.state.taxonomy?.bountySettleModes || []).map((m) => `<option ${bt.settleMode === m ? 'selected' : ''}>${ui.esc(m)}</option>`).join('')}
              </select>
            </div>
            <div class="field"><label>参与资格</label>
              <select class="select" id="f-eligibility">
                <option value="">不限</option>
                ${(ctx.state.taxonomy?.bountyEligibility || []).map((m) => `<option ${bt.eligibility === m ? 'selected' : ''}>${ui.esc(m)}</option>`).join('')}
              </select>
            </div>
            <div class="field"><label>中赏人数</label><input class="input" id="f-winnerCount" placeholder="如 1 / 3" value="${ui.esc(bt.winnerCount || '')}"></div>
            <div class="field"><label>悬赏截止时间</label><input class="input" type="date" id="f-bountyDeadline" value="${ui.esc((bt.deadline || '').slice(0, 10))}"></div>
            <div class="field"><label>交付要求</label><textarea class="input" rows="3" id="f-deliverable" placeholder="说明要交付什么、达到什么标准才算完成">${ui.esc(bt.deliverable || '')}</textarea></div>
            <div class="field"><label>补充说明（选填）</label><textarea class="input" rows="2" id="f-bountyExtra" placeholder="如：可提供资料清单、需签保密协议等">${ui.esc(bt.extra || '')}</textarea></div>`;
          bindBountyImgs(box);
          return;
        } else {
          const qs = editing?.project?.qualifications || [];
          const bt = editing?.project?.businessTerms || {};
          const needQ = editing?.project?.needQualification === true;
          box.innerHTML = `
            <div class="field"><label>金额 / 投资额</label><input class="input" id="f-investAmount" placeholder="如 8.6 亿元" value="${ui.esc(editing?.project?.investAmount || '')}"></div>
            <div class="field"><label>项目阶段</label><input class="input" id="f-stage" placeholder="如 已备案 / 已核准 / 施工中" value="${ui.esc(editing?.project?.stage || '')}"></div>
            <div class="field"><label>合作方式</label><input class="input" id="f-cooperation" placeholder="如 EPC 总承包 / 联合体投标" value="${ui.esc(editing?.project?.cooperation || '')}"></div>
            <div class="field"><label>工期 / 周期</label><input class="input" id="f-period" placeholder="如 14 个月" value="${ui.esc(editing?.project?.period || '')}"></div>
            <div class="field"><label>对接对象要求（概述）</label><textarea class="input" rows="2" id="f-target" placeholder="一句话说明希望和什么样的企业合作">${ui.esc(editing?.project?.target || '')}</textarea></div>

            <div class="form-section-title">是否需要对方具备资质</div>
            <label class="row gap8 mb12" style="cursor:pointer">
              <input type="checkbox" id="f-needQual" ${needQ ? 'checked' : ''}>
              <span class="small">需要对方提供企业资质证书（发布后将进入「上传资质审核」环节）</span>
            </label>
            <div id="f-qual-box" class="${needQ ? '' : 'hide'}">
              <datalist id="qual-preset-list">
                ${qualPresets().map((p) => `<option value="${ui.esc(p.name)}"></option>`).join('')}
              </datalist>
              <div id="f-qual-list">${qs.map(qualRowHtml).join('')}</div>
              <div class="row gap8 mb16">
                <button class="btn btn-sm" id="f-qual-add" type="button">＋ 添加资质</button>
                <button class="btn btn-sm" id="f-qual-preset" type="button">从常用资质选</button>
              </div>
            </div>

            <div class="form-section-title">商务条件</div>
            <div id="f-terms">${termsHtml(bt)}</div>`;
          bindQualBox(box);
          return;
        }
      };

      const collectCategoryFields = () => {
        const v = (id) => $(id)?.value?.trim() || '';
        const c = (id) => Boolean($(id)?.checked);
        // 注意：这个函数和 renderCatFields 同级，拿不到它内部的局部变量 box，
        // 必须自己取一次容器，否则会 ReferenceError（项目/贸易发不出去）
        const catBox = $('#pub-cat-fields');
        if (category === 'event') {
          return {
            startAt: v('#f-startAt'), endAt: v('#f-endAt'), address: v('#f-address'), online: c('#f-online'),
            capacity: v('#f-capacity'), needPay: c('#f-needPay'), fee: v('#f-fee'),
            registerDeadline: v('#f-registerDeadline'), organizer: v('#f-organizer'),
          };
        }
        if (category === 'bounty') {
          return {
            bountyType: v('#f-bountyType'), reward: v('#f-reward'), rewardUnit: v('#f-rewardUnit'),
            settleMode: v('#f-settleMode'), eligibility: v('#f-eligibility'),
            winnerCount: v('#f-winnerCount'), deadline: v('#f-bountyDeadline'),
            deliverable: v('#f-deliverable'), extra: v('#f-bountyExtra'),
          };
        }
        if (category === 'trade') {
          return {
            tradeType: v('#f-tradeType'), quantity: v('#f-quantity'), price: v('#f-price'),
            payment: v('#f-payment'), delivery: v('#f-delivery'), deadline: v('#f-deadline'),
            items: collectTradeItems(catBox),
          };
        }
        return {
          investAmount: v('#f-investAmount'), stage: v('#f-stage'), cooperation: v('#f-cooperation'),
          period: v('#f-period'), target: v('#f-target'),
          needQualification: c('#f-needQual') ? '1' : '0',
          qualifications: collectQualifications(catBox),
          businessTerms: collectTerms(catBox),
        };
      };

      /* ---------------- 导入文件：逐个上传 + 独立进度 ----------------
       *
       * 之前是把所有文件塞进一个 FormData 一次提交，只能拿到一个总百分比 ——
       * 一次选 10 个文件时，完全看不出哪个正在传、哪个卡住、哪个失败了。
       * 改成逐个上传：每个文件有自己的进度条、状态与失败重试。
       */
      let uploadTasks = [];

      const fmtSize = (n) => {
        const num = Number(n) || 0;
        if (num < 1024) return `${num} B`;
        const units = ['KB', 'MB', 'GB'];
        let v = num / 1024;
        let i = 0;
        while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
        return `${v < 10 ? v.toFixed(1) : Math.round(v)} ${units[i]}`;
      };

      const renderUploadQueue = () => {
        const box = $('#pub-upload-queue');
        if (!box) return;
        // 上传成功的会进入下方「已导入」列表，这里只留未完成与失败的
        const visible = uploadTasks.filter((t) => t.status !== 'done');
        if (!visible.length) {
          box.innerHTML = '';
          return;
        }
        const doneCount = uploadTasks.filter((t) => t.status === 'done').length;
        const failedCount = visible.filter((t) => t.status === 'error').length;
        const uploading = visible.filter((t) => t.status === 'uploading' || t.status === 'parsing').length;
        const total = uploadTasks.length;
        const overall = total
          ? Math.round(uploadTasks.reduce((s, t) => s + (t.status === 'done' ? 100 : t.percent), 0) / total)
          : 0;

        const parsing = visible.filter((t) => t.status === 'parsing').length;
        const head = parsing
          ? `服务端正在解析 ${parsing} 个文件…`
          : uploading
            ? `正在上传 ${uploading} 个文件`
            : failedCount
              ? `${failedCount} 个文件上传失败`
              : '等待上传';

        box.innerHTML = `<div class="upload-queue">
          <div class="upload-queue-head">
            <span class="strong">${head}</span>
            <span class="tiny dim">总进度 ${overall}%${doneCount ? ` · 已完成 ${doneCount}` : ''}${
              failedCount ? ` · <span style="color:var(--danger)">失败 ${failedCount}</span>` : ''
            }</span>
          </div>
          ${visible.map((t) => {
            const meta =
              t.status === 'uploading' ? `<b>${t.percent}%</b>`
                : t.status === 'parsing' ? '<b>解析中…</b>'
                  : t.status === 'pending' ? '等待中'
                    : `<span style="color:var(--danger)">${ui.esc(t.error || '上传失败')}</span>`;
            // 解析阶段进度条走满并轻微流动，表示「还在忙」
            const pct = t.status === 'parsing' ? 100 : t.status === 'uploading' ? t.percent : t.status === 'error' ? 100 : 0;
            return `<div class="upload-item is-${t.status}">
              <div class="upload-item-main">
                <span class="upload-item-name" title="${ui.esc(t.name)}">${ui.esc(t.name)}</span>
                <span class="upload-item-meta">${fmtSize(t.size)} · ${meta}</span>
              </div>
              <div class="upload-bar"><i class="${t.status === 'error' ? 'err' : t.status === 'parsing' ? 'busy' : ''}" style="width:${pct}%"></i></div>
              ${t.status === 'error' ? `<button class="btn btn-sm btn-outline upload-retry" data-retry="${t.id}" type="button">重试</button>` : ''}
            </div>`;
          }).join('')}
        </div>`;
      };

      const uploadOne = async (task) => {
        task.status = 'uploading';
        task.percent = 0;
        task.error = '';
        renderUploadQueue();
        try {
          // 大文件自动走分片（由 api.uploadFile 内部判断），
          // 否则 12MB 在慢速上行下会超过 Cloudflare 的 100 秒上限，报 524
          const res = await api.uploadFile(task.file, {
            onProgress: (p) => {
              task.percent = p;
              renderUploadQueue();
            },
            // 字节传完 ≠ 完成：服务端还要合并分片、解析文档，
            // 这里必须给出反馈，否则看着像卡死
            onPhase: (phase) => {
              if (phase === 'parsing') {
                task.status = 'parsing';
                task.percent = 100;
                renderUploadQueue();
              }
            },
          });
          const rec = res.files?.[0];
          if (!rec) throw new Error('服务端未返回文件信息');
          uploaded = [...uploaded, rec];
          task.status = 'done';
          task.percent = 100;
          task.fileId = rec.id;
        } catch (err) {
          task.status = 'error';
          task.error = err.message || '上传失败';
        }
        renderUploadQueue();
        // 渲染失败不能把整个上传流程带崩（否则队列已清空、列表又没内容，
        // 用户看到的就是「100% 之后什么都没有」）
        try {
          renderFiles();
        } catch (err) {
          console.warn('[publish] 文件列表渲染失败:', err.message);
          ui.toast('文件已上传，但列表渲染失败，请刷新页面', 'err');
        }
      };

      const uploadFiles = async (files) => {
        const list = [...files];
        if (!list.length) return;
        // 上一批已完成的清掉，避免队列越来越长（失败的要留着重试）
        uploadTasks = uploadTasks.filter((t) => t.status !== 'done');
        const base = uploadTasks.length;
        const batch = list.map((f, i) => ({
          id: `up${Date.now().toString(36)}_${base + i}`,
          file: f,
          name: f.name || `文件${i + 1}`,
          size: f.size || 0,
          status: 'pending',
          percent: 0,
          error: '',
          fileId: '',
        }));
        uploadTasks = [...uploadTasks, ...batch];
        renderUploadQueue();

        // 顺序上传：并发会让进度互相干扰，也更占上行带宽
        for (const t of batch) {
          if (t.status === 'done') continue;
          await uploadOne(t);
        }

        const ok = batch.filter((t) => t.status === 'done').length;
        const bad = batch.filter((t) => t.status === 'error').length;
        if (bad) {
          ui.toast(`${ok} 个上传成功，${bad} 个失败，可点「重试」`, 'err');
        } else if (ok) {
          const parsed = uploaded.filter((f) => (f.text || '').trim().length > 0).length;
          ui.toast(`已导入 ${ok} 个文件${parsed ? `，其中 ${parsed} 个已解析出文字` : ''}`, 'ok');
        }
      };

      /* ---------------- 联系方式实时提示 ---------------- */
      const contactWarn = $('#pub-contact-warn');
      const checkContacts = () => {
        if (!contactWarn) return;
        const text = `${$('#pub-title')?.value || ''} ${$('#pub-text')?.value || ''}`;
        const { count, kinds } = hintContacts(text);
        if (!count) {
          contactWarn.classList.add('hide');
          contactWarn.innerHTML = '';
          return;
        }
        contactWarn.classList.remove('hide');
        contactWarn.innerHTML = `⚠️ 检测到 <b>${count}</b> 处联系方式（${ui.esc(kinds.join('、'))}）。`
          + '平台规则：发布后对其他用户会自动隐藏为「【联系方式已隐藏】」。'
          + '建议改为在留言区沟通，或让对方通过平台发起对接。';
      };
      $('#pub-text')?.addEventListener('input', checkContacts);
      $('#pub-title')?.addEventListener('input', checkContacts);
      checkContacts();

      $('#pub-import').addEventListener('click', () => $('#pub-file-input').click());
      $('#pub-file-input').addEventListener('change', (e) => {
        const picked = [...e.target.files];
        e.target.value = '';
        const { files, skipped } = filterImportable(picked);
        if (skipped) ui.toast(`已跳过 ${skipped} 个不支持或空文件`, '');
        uploadFiles(files);
      });

      $('#pub-import-dir').addEventListener('click', () => $('#pub-dir-input').click());
      $('#pub-dir-input').addEventListener('change', (e) => {
        const picked = [...e.target.files];
        e.target.value = '';
        const { files, skipped } = filterImportable(picked);
        if (!files.length) return ui.toast('这个文件夹里没有可导入的文件', 'err');
        ui.toast(`从文件夹读取到 ${files.length} 个文件${skipped ? `，跳过 ${skipped} 个` : ''}`, 'ok');
        uploadFiles(files);
      });

      root.querySelector('#pub-files').addEventListener('click', (e) => {
        const btn = e.target.closest('[data-remove]');
        if (!btn) return;
        uploaded = uploaded.filter((f) => f.id !== btn.dataset.remove);
        renderFiles();
      });

      // 上传失败的文件可以单独重试，不必重选整批
      root.querySelector('#pub-upload-queue').addEventListener('click', async (e) => {
        const btn = e.target.closest('[data-retry]');
        if (!btn) return;
        const task = uploadTasks.find((t) => t.id === btn.dataset.retry);
        if (!task) return;
        btn.disabled = true;
        btn.textContent = '重试中…';
        await uploadOne(task);
        if (task.status === 'done') ui.toast(`${task.name} 已重试成功`, 'ok');
      });

      /* ---------------- 拖拽上传（含文件夹） ---------------- */
      const dropZone = $('#pub-drop');
      const dropHint = $('#pub-drop-hint');
      const hintText = dropHint.textContent;
      let dragDepth = 0;

      const setDragging = (on) => {
        dropZone.classList.toggle('dragging', on);
        dropHint.innerHTML = on ? '<b>松开即可导入</b>' : hintText;
      };

      dropZone.addEventListener('dragenter', (e) => {
        e.preventDefault();
        dragDepth++;
        setDragging(true);
      });
      dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
      });
      dropZone.addEventListener('dragleave', (e) => {
        e.preventDefault();
        dragDepth = Math.max(0, dragDepth - 1);
        if (dragDepth === 0) setDragging(false);
      });
      dropZone.addEventListener('drop', async (e) => {
        e.preventDefault();
        dragDepth = 0;
        setDragging(false);
        if (!e.dataTransfer) return;

        dropHint.innerHTML = '正在读取…';
        let picked = [];
        try {
          picked = await filesFromDataTransfer(e.dataTransfer);
        } catch (err) {
          dropHint.innerHTML = hintText;
          return ui.toast('读取拖入内容失败：' + err.message, 'err');
        }
        dropHint.innerHTML = hintText;

        if (!picked.length) return ui.toast('没有识别到文件', 'err');
        const { files, skipped } = filterImportable(picked);
        if (!files.length) return ui.toast('拖入的文件都不受支持', 'err');
        if (skipped) ui.toast(`已跳过 ${skipped} 个不支持或空文件`, '');
        uploadFiles(files);
      });

      // 整个页面也接受拖拽，避免用户拖到附近没反应
      ['dragover', 'drop'].forEach((ev) => {
        window.addEventListener(ev, (e) => e.preventDefault());
      });

      /* ---------------- 文件保密 ---------------- */
      const secretToggle = $('#pub-secret-enabled');
      const secretBody = $('#pub-secret-body');
      secretToggle?.addEventListener('change', () => {
        secretBody.classList.toggle('hide', !secretToggle.checked);
      });
      $('#pub-secret-gen')?.addEventListener('click', () => {
        // 去掉容易看错的 0/O/1/l/I
        const chars = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789';
        let out = '';
        const buf = new Uint32Array(8);
        (crypto.getRandomValues ? crypto : { getRandomValues: (a) => a.forEach((_, i) => { a[i] = Math.floor(Math.random() * 4294967296); }) }).getRandomValues(buf);
        for (let i = 0; i < 8; i++) out += chars[buf[i] % chars.length];
        $('#pub-secret-pwd').value = out;
        ui.toast('已生成随机密码，请记下', 'ok');
      });

      /* ---------------- 第一步：AI 汇总资料 ---------------- */
      let digest = '';

      const renderSummary = (s, extracted) => {
        const box = $('#pub-summary');
        const facts = s.facts || {};
        const factRows = Object.entries({
          项目名称: facts.projectName,
          项目定位: facts.positioning,
          项目选址: facts.location,
          总投资: facts.totalInvest,
          本次融资: facts.funding,
          金额: facts.amount,
          规模: facts.scale,
          建设周期: facts.period,
          电价成本: facts.powerPrice,
          投资回报: facts.payback,
          投资者权益: facts.rights,
          建设内容: facts.scope,
          合作方式: facts.cooperation,
          资质要求: facts.requirements,
          付款条件: facts.payment,
        }).filter(([, v]) => v);

        box.innerHTML = `
          <div class="summary-card">
            <div class="row between mb8">
              <div class="strong">📋 资料汇总结果</div>
              <span class="badge ${s.source === 'ai' ? 'ok' : 'gray'}">${s.source === 'ai' ? '大模型汇总' : '内置规则汇总'}</span>
            </div>
            ${s.note ? `<div class="tiny" style="color:var(--danger)">${ui.esc(s.note)}</div>` : ''}

            <div class="field">
              <label>汇总摘要（可以直接修改，生成时会以此为准）</label>
              <textarea class="input" id="pub-digest" rows="5">${ui.esc(s.digest || '')}</textarea>
            </div>

            ${(s.points || []).length ? `<div class="field">
              <label>要点（${s.points.length} 条）</label>
              <ul class="summary-points">${s.points.map((p) => `<li>${ui.esc(p)}</li>`).join('')}</ul>
            </div>` : ''}

            ${factRows.length ? `<div class="field">
              <label>AI 提取的关键信息</label>
              <div class="kv-table">${factRows.map(([k, v]) => `<div class="kv"><span class="k">${ui.esc(k)}</span><span class="v">${ui.esc(v)}</span></div>`).join('')}</div>
            </div>` : ''}

            ${(s.missing || []).length ? `<div class="warn-note">
              ⚠️ <b>建议补充：</b>${s.missing.map(ui.esc).join('、')} —— 可以回到第 2 步补进正文，也可以直接生成。
            </div>` : ''}

            ${extracted?.chars ? `<div class="tiny dim mt8">已读取附件文字 ${extracted.chars} 字${(extracted.notes || []).length ? `；解析提示：${extracted.notes.map(ui.esc).join('；')}` : ''}</div>` : ''}
          </div>`;

        const digestEl = box.querySelector('#pub-digest');
        digest = digestEl.value;
        digestEl.addEventListener('input', () => { digest = digestEl.value; });
      };

      $('#pub-summarize').addEventListener('click', async () => {
        const text = $('#pub-text').value.trim();
        if (!text && !uploaded.length) return ui.toast('请先输入文字内容或导入文件', 'err');
        const btn = $('#pub-summarize');
        btn.disabled = true;
        btn.textContent = 'AI 正在汇总资料…';
        try {
          const fd = api.form({ text, category, fileIds: uploaded.map((f) => f.id) });
          const res = await service.aiSummarize(fd);
          renderSummary(res.summary || {}, res.extracted || {});
          const next = $('#pub-ai');
          next.disabled = false;
          const lock = $('#pub-ai-lock');
          if (lock) lock.style.display = 'none';
          ui.toast('汇总完成，可以生成项目信息了', 'ok');
        } catch (err) {
          ui.toast(err.message, 'err');
        } finally {
          btn.disabled = false;
          btn.textContent = '📋 第一步：AI 汇总资料（重新汇总）';
        }
      });

      /* ---------------- 第二步：生成项目信息 ---------------- */
      $('#pub-ai').addEventListener('click', async () => {
        const text = $('#pub-text').value.trim();
        if (!text && !uploaded.length) return ui.toast('请先输入文字内容或导入文件', 'err');
        const btn = $('#pub-ai');
        btn.disabled = true;
        btn.textContent = 'AI 正在生成项目信息…';
        try {
          const fd = api.form({
            text,
            category,
            fileIds: uploaded.map((f) => f.id),
            digest: digest || $('#pub-digest')?.value || '',
          });
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
          btn.textContent = '🤖 第二步：生成项目信息（主副标题 + 解析）';
        }
      });

      const renderAiResult = (res) => {
        const box = $('#pub-ai-result');
        const titles = res.titles || {};
        const alts = (titles.alternatives || []).filter((a) => a.title && a.title !== titles.title);
        // 把 AI 生成的标题写进上方常驻输入框（不再重复渲染同名 input）
        const titleEl = $('#pub-title');
        const subEl = $('#pub-subtitle');
        if (titleEl && titles.title) titleEl.value = titles.title;
        if (subEl && titles.subtitle) subEl.value = titles.subtitle;
        box.innerHTML = `
          <div class="tiny dim mb8">${titles.source === 'ai' ? '由大模型生成' : '由内置规则引擎生成（未配置 AI_API_KEY）'}，已填入上方标题框，可直接修改</div>
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

      /* ---------------- 位置 ---------------- */
      let pubGeo = { lat: 0, lng: 0 };
      const useLocEl = $('#pub-use-loc');
      const locBody = $('#pub-loc-body');
      useLocEl?.addEventListener('change', () => locBody.classList.toggle('hide', !useLocEl.checked));

      if (editing?.location?.lat) pubGeo = { lat: editing.location.lat, lng: editing.location.lng };
      if (pubGeo.lat) {
        const st = $('#pub-loc-status');
        if (st) st.textContent = `已记录坐标 ${pubGeo.lat.toFixed(4)}, ${pubGeo.lng.toFixed(4)}`;
      }

      $('#pub-loc-get')?.addEventListener('click', () => {
        const st = $('#pub-loc-status');
        if (!navigator.geolocation) {
          if (st) st.textContent = '当前浏览器不支持定位，请手动填写地址';
          return;
        }
        if (st) st.textContent = '定位中…';
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            pubGeo = { lat: pos.coords.latitude, lng: pos.coords.longitude };
            if (st) st.textContent = `已定位 ${pubGeo.lat.toFixed(4)}, ${pubGeo.lng.toFixed(4)}（可再手填地址）`;
            ui.toast('已获取当前位置', 'ok');
          },
          (err) => {
            if (st) st.textContent = err.code === 1 ? '定位被拒绝，请手动填写地址' : '定位失败，请手动填写地址';
          },
          { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
        );
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

        let catFields = {};
        try {
          catFields = collectCategoryFields();
        } catch (err) {
          console.error('[publish] 收集分类字段失败:', err);
          busy = false;
          if (publishBtn) publishBtn.textContent = '立即发布';
          if (draftBtn) draftBtn.disabled = false;
          return ui.toast('表单读取失败：' + (err.message || err), 'err');
        }

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
          aiAutoReply: $('#pub-ai-reply')?.checked ? '1' : '0',
          // 文件保密：密码为空表示沿用原密码（编辑时）
          fileSecret: {
            enabled: Boolean($('#pub-secret-enabled')?.checked),
            password: $('#pub-secret-pwd')?.value || '',
            ttlHours: Number($('#pub-secret-ttl')?.value) || 6,
          },
          publish: publishNow ? '1' : '0',
          location: $('#pub-use-loc')?.checked
            ? JSON.stringify({
                public: Boolean($('#pub-loc-public')?.checked),
                lat: pubGeo.lat || 0,
                lng: pubGeo.lng || 0,
                address: ($('#pub-address')?.value || '').trim(),
              })
            : '',
          ...catFields,
        };

        try {
          const fd = api.form(fields);
          if (editing) {
            await service.updateListing(editing.id, { ...fields });
            if (publishNow && editing.status !== 'published') await service.publishListing(editing.id, durationDays);
            ui.toast('已保存', 'ok');
            ctx.nav(`#/detail/${editing.id}`);
          } else {
            const res = await service.createListing(fd);
            // 没有上传图片时，自动生成一张项目配图并设为封面
            if (!uploaded.some((f) => f.kind === 'image')) {
              try {
                ui.showLoading('正在生成项目配图…');
                await applyAutoCover(res.listing.id, res.listing);
                ui.hideLoading();
              } catch (err) {
                ui.hideLoading();
                console.warn('[publish] 自动配图失败:', err.message);
              }
            }
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

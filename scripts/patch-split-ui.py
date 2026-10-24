# -*- coding: utf-8 -*-
"""前端：检测多条目 → 提示拆分 → 一键分别发布"""

import io

D = r"C:\Users\Administrator\Documents\deepseek-harness\default-workspace\xiaoyu-laile"
P = D + r"\public\static\views-publish.js"
p = io.open(P, "r", encoding="utf-8").read()

# ---------- 1) 在 AI 结果区下方加拆分容器 ----------
OLD = """      <div id="pub-ai-result" class="mt12"></div>"""
NEW = """      <div id="pub-ai-result" class="mt12"></div>
      <div id="pub-split-box" class="mt12"></div>"""

if OLD not in p:
    print("ERROR: 未找到 pub-ai-result")
    raise SystemExit(1)
p = p.replace(OLD, NEW, 1)
print("ok: 已加拆分容器")

# ---------- 2) 汇总完成后自动检测多条目 ----------
OLD2 = """          ui.toast('汇总完成，可以生成项目信息了', 'ok');
        } catch (err) {
          ui.toast(err.message, 'err');"""

NEW2 = """          ui.toast('汇总完成，可以生成项目信息了', 'ok');

          // 贸易类不拆分（一个采购清单本身就是一条）
          if (category !== 'trade') {
            checkSplit(fd, text);
          }
        } catch (err) {
          ui.toast(err.message, 'err');"""

if OLD2 not in p:
    print("ERROR: 未找到汇总成功处理")
    raise SystemExit(1)
p = p.replace(OLD2, NEW2, 1)
print("ok: 汇总后已触发拆分检测")

# ---------- 3) 插入 checkSplit 与批量发布逻辑 ----------
ANCHOR = """      /* ---------------- 第二步：生成项目信息 ---------------- */"""

JS = """      /* ---------------- 多条目检测与拆分发布 ---------------- */
      const splitLabel = { project: '项目', bounty: '悬赏', event: '活动' };
      let splitItems = [];

      function renderSplitBox(items) {
        const box = $('#pub-split-box');
        if (!box) return;
        const unit = splitLabel[category] || '条目';
        if (!items || items.length < 2) { box.innerHTML = ''; return; }

        box.innerHTML = `<div class="split-box">
          <div class="split-head">🔀 检测到 ${items.length} 个独立的${unit}</div>
          <div class="split-desc">这段资料里包含多个${unit}，可以拆成 ${items.length} 条分别发布，每条独立成一条信息、各自推送给相关用户。</div>
          <div class="split-list">
            ${items.map((it, i) => `<div class="split-item">
              <span class="split-no">${i + 1}</span>
              <span class="split-t">${ui.esc(it.title)}</span>
            </div>`).join('')}
          </div>
          <div class="row gap8 mt12" style="flex-wrap:wrap">
            <button class="btn btn-primary grow" id="pub-split-go" type="button">🔀 拆分并发布 ${items.length} 条</button>
            <button class="btn btn-outline" id="pub-split-cancel" type="button" style="flex:none">不拆，只发这一条</button>
          </div>
          <div class="tiny dim mt6">拆分后每条为纯文字内容，附件不重复上传；发布后可在「我的」里逐条编辑。</div>
        </div>`;

        $('#pub-split-cancel')?.addEventListener('click', () => {
          splitItems = [];
          box.innerHTML = '';
        });

        $('#pub-split-go')?.addEventListener('click', async (e) => {
          const btn = e.currentTarget;
          btn.disabled = true;
          btn.textContent = '发布中…';
          try {
            const ids = [];
            for (let i = 0; i < items.length; i++) {
              btn.textContent = `发布中… (${i + 1}/${items.length})`;
              const fd2 = api.form({
                category,
                type: $('#pub-type')?.value || '',
                title: items[i].title,
                subtitle: items[i].subtitle || '',
                text: items[i].text,
                durationDays,
                publish: '1',
                blocks: '[]',
                fileIds: [],
                contactName: $('#pub-contact-name')?.value || '',
                phone: $('#pub-phone')?.value || '',
                wechat: $('#pub-wechat')?.value || '',
                company: $('#pub-company')?.value || '',
              });
              const res = await service.createListing(fd2);
              const id = res?.listing?.id || res?.id;
              if (id) ids.push(id);
            }
            box.innerHTML = `<div class="split-box split-done">
              <div class="split-head">✅ 已发布 ${ids.length} 条</div>
              <div class="split-desc">${items.map((it, i) => `<a class="split-link" href="#/detail/${ids[i] || ''}">${i + 1}. ${ui.esc(it.title)}</a>`).join('')}</div>
              <button class="btn btn-primary btn-block mt8" type="button" onclick="location.hash='#/home'">回到首页</button>
            </div>`;
            ui.toast(`已发布 ${ids.length} 条`, 'ok');
          } catch (err) {
            btn.disabled = false;
            btn.textContent = `🔀 拆分并发布 ${items.length} 条`;
            ui.toast(err.message || '发布失败', 'err');
          }
        });
      }

      async function checkSplit(fd, text) {
        const box = $('#pub-split-box');
        if (box) box.innerHTML = '<div class="tiny dim center mt8">正在检查是否包含多个条目…</div>';
        try {
          const r = await service.aiSplit(fd);
          const data = r?.data || r || {};
          if (data && data.ok && data.count > 1 && Array.isArray(data.items) && data.items.length > 1) {
            splitItems = data.items;
            renderSplitBox(splitItems);
          } else if (box) {
            box.innerHTML = '';
          }
        } catch {
          if (box) box.innerHTML = '';
        }
        void text;
      }

      /* ---------------- 第二步：生成项目信息 ---------------- */"""

if ANCHOR not in p:
    print("ERROR: 未找到第二步锚点")
    raise SystemExit(1)
p = p.replace(ANCHOR, JS, 1)
print("ok: 已插入拆分逻辑")

io.open(P, "w", encoding="utf-8").write(p)

# ---------- 4) 样式 ----------
CSS = r'''

/* 发布页：多条目拆分 */
.split-box {
  background: #fff8ec;
  border: 1px solid #ffe0b2;
  border-radius: 14px;
  padding: 14px;
}
.split-head { font-size: 14px; font-weight: 800; color: #a35c00; }
.split-desc { font-size: 12px; color: var(--text-2); line-height: 1.65; margin-top: 6px; }
.split-list { margin-top: 10px; display: flex; flex-direction: column; gap: 6px; }
.split-item {
  display: flex; gap: 8px; align-items: flex-start;
  background: #fff; border-radius: 9px; padding: 8px 10px;
  font-size: 12.5px; line-height: 1.5;
}
.split-no {
  flex: none; width: 18px; height: 18px; border-radius: 999px;
  background: #ffe3b8; color: #a35c00;
  font-size: 11px; font-weight: 800;
  display: flex; align-items: center; justify-content: center;
}
.split-t { min-width: 0; color: var(--text); }
.split-done { background: #eefaf3; border-color: #bfe8d2; }
.split-done .split-head { color: #0e8f5f; }
.split-link {
  display: block; font-size: 12.5px; color: #1f5fa8;
  padding: 5px 0; text-decoration: none;
}
'''
with io.open(D + r"\public\static\home.css", "a", encoding="utf-8") as f:
    f.write(CSS)
print("ok: 样式已加")

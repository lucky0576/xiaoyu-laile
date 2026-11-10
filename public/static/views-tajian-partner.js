/**
 * 塔建集团 · 合伙人计划（#/tajian-partner）
 *
 * 合伙人权益：收益 / 资源 / 分成
 * 类型：城市合伙人 · 行业合伙人 · 项目合伙人 · 渠道合伙人
 */

import * as ui from './ui.js';
import { api, service, isLoggedIn } from './api.js';

const TYPES = [
  {
    id: 'city',
    icon: '🏙️',
    name: '城市合伙人',
    desc: '区域独家合作，负责本地工商业光伏 / 储能项目开拓',
    points: ['区域项目优先对接', '品牌 + 方案 + 报价支持', '本地团队培训与陪跑'],
  },
  {
    id: 'industry',
    icon: '🏭',
    name: '行业合伙人',
    desc: '有园区 / 工厂 / 高耗能企业资源，按行业拓展',
    points: ['园区整体能源方案', '零投资 / EMC 模式支持', '项目收益长期分成'],
  },
  {
    id: 'project',
    icon: '🤝',
    name: '项目合伙人',
    desc: '单个项目居间介绍，按项目结算',
    points: ['项目居间费', '踏勘 / 方案 / 报价由塔建完成', '成单即结算'],
  },
  {
    id: 'channel',
    icon: '🔗',
    name: '渠道合伙人',
    desc: '设计院 / EPC / 设备商 / 运维商等渠道合作',
    points: ['联合投标与方案互补', '设备 / 施工 / 运维分包', '长期框架合作'],
  },
];

const BENEFITS = [
  {
    icon: '💰',
    title: '收益',
    items: [
      '项目居间费：介绍项目并促成签约，按项目回款结算',
      '投资分成：参与塔建投资类项目，按投资比例分享长期收益',
      'EPC / 施工分成：承接或联合承接工程，按合同约定分成',
      '运维分成：负责本地运维，按运维服务费分成',
    ],
  },
  {
    icon: '🧰',
    title: '资源',
    items: [
      '品牌授权：塔建集团 + 华为 EMS 等合作资源背书',
      '方案支持：免费踏勘、收益测算、技术方案与报价支持',
      '资质与供应链：设备集采、施工资质、并网与政策申报支持',
      '培训与陪跑：销售、技术、政策申报培训，重点项目全程陪跑',
      '商机共享：平台项目线索与区域项目优先对接',
    ],
  },
  {
    icon: '📈',
    title: '分成',
    items: [
      '居间类项目：成单后按合同额一定比例结算（一事一议）',
      '投资类项目：按投资份额分享 25 年电站收益',
      '工程类项目：EPC / 施工利润按约定比例分成',
      '运维类项目：按年度运维服务费分成',
      '具体比例以双方签署的《合伙人合作协议》为准',
    ],
  },
];

const STEPS = [
  ['01', '提交申请', '填写资源与区域，上传企业资料'],
  ['02', '资质审核', '塔建商务评估资源与合作意向'],
  ['03', '签约培训', '签署合作协议，参加产品与政策培训'],
  ['04', '项目对接', '分配项目线索，联合踏勘与方案'],
  ['05', '收益结算', '项目回款后按协议结算分成'],
];

const PARTNER_DIRS = ['城市合伙人', '行业合伙人', '项目合伙人', '渠道合伙人'];

export async function renderTajianPartner(ctx, query) {
  void query;
  const html = `<div class="page tjp-page">
    <div class="tjp-hero">
      <div class="tjp-badge">🤝 塔建集团 · 合伙人计划</div>
      <div class="tjp-hero-t">有资源，一起做<br>工商业光伏 + 储能</div>
      <div class="tjp-hero-d">城市合伙人 · 行业合伙人 · 项目合伙人 · 渠道合伙人</div>
      <div class="tjp-hero-points">
        <span>项目居间费</span><span>投资分成</span><span>EPC 分成</span><span>长期运维收益</span>
      </div>
      <div class="row gap8 mt14" style="flex-wrap:wrap">
        <button class="btn btn-primary" id="tjp-apply" type="button">立即申请合伙人</button>
        <button class="btn btn-outline" id="tjp-share" type="button">↗ 分享本页</button>
      </div>
      <a class="tjp-back" href="#/tajian">← 返回塔建集团专题</a>
    </div>

    <div class="tjp-section">
      <div class="tjp-sec-t">合伙人能获得什么</div>
      <div class="tjp-sec-d">收益 · 资源 · 分成，全部写清楚</div>
      <div class="tjp-benefits">
        ${BENEFITS.map(
          (b) => `<div class="tjp-benefit">
            <div class="tjp-benefit-t">${b.icon} ${ui.esc(b.title)}</div>
            <ul class="tjp-list">${b.items.map((x) => `<li>${ui.esc(x)}</li>`).join('')}</ul>
          </div>`,
        ).join('')}
      </div>
      <div class="tiny dim mt8">以上为合作机制说明；具体收益比例、结算方式以双方签署的《合伙人合作协议》为准，平台不承诺固定收益。</div>
    </div>

    <div class="tjp-section">
      <div class="tjp-sec-t">选择你的合伙人类型</div>
      <div class="tjp-sec-d">不同资源，对应不同合作方式</div>
      <div class="tjp-types">
        ${TYPES.map(
          (t) => `<div class="tjp-type">
            <div class="tjp-type-icon">${t.icon}</div>
            <div class="tjp-type-name">${ui.esc(t.name)}</div>
            <div class="tjp-type-desc">${ui.esc(t.desc)}</div>
            <ul class="tjp-type-points">${t.points.map((p) => `<li>${ui.esc(p)}</li>`).join('')}</ul>
            <button class="btn btn-sm btn-primary tjp-pick" type="button" data-type="${ui.esc(t.name)}">申请${ui.esc(t.name)}</button>
          </div>`,
        ).join('')}
      </div>
    </div>

    <div class="tjp-section">
      <div class="tjp-sec-t">合作流程</div>
      <div class="tjp-flow">
        ${STEPS.map(
          ([n, t, d]) => `<div class="tjp-step"><div class="n">${ui.esc(n)}</div><div class="t">${ui.esc(t)}</div><div class="d">${ui.esc(d)}</div></div>`,
        ).join('')}
      </div>
    </div>

    <div class="tjp-section">
      <div class="tjp-sec-t">常见问题</div>
      <div class="tjp-faq">
        <details><summary>没有光伏 / 储能行业经验可以吗？</summary><div>可以。项目踏勘、方案、报价、施工、并网由塔建专业团队完成；合伙人主要负责本地资源对接与客户关系，我们会提供培训与陪跑。</div></details>
        <details><summary>需要合伙人先投资吗？</summary><div>不需要。项目可采用塔建投资（业主零投资）、EPC、EMC 等多种模式；合伙人以资源和服务参与，无需垫资。若参与投资类项目，另行协商。</div></details>
        <details><summary>分成怎么结算？</summary><div>按项目类型与合同约定：居间费按项目回款结算，投资类按投资份额分享电站长期收益，工程 / 运维类按合同约定比例分成。具体以《合伙人合作协议》为准。</div></details>
        <details><summary>一个区域可以有几个城市合伙人？</summary><div>原则上每个区县 / 重点区域设 1 位城市合伙人，具体按区域资源与合作深度协商确定。</div></details>
      </div>
    </div>

    <div class="tjp-section">
      <div class="tjp-sec-t">申请成为合伙人</div>
      <div class="tjp-sec-d">提交后塔建商务会与您联系</div>
      <button class="btn btn-primary btn-block" id="tjp-apply2" type="button" style="height:46px">提交合伙人申请</button>
      <div class="tiny dim center mt8">也可直接电话联系平台，由平台转交塔建集团商务</div>
    </div>

    <div class="bc-foot">
      <div>塔建集团 · 合伙人计划</div>
      <div class="tiny dim mt6">本页为合作机制说明，不构成收益承诺；具体以签署协议为准。</div>
    </div>
  </div>`;

  return {
    title: '塔建集团 · 合伙人计划',
    content: html,
    activeTab: 'home',
    showBack: true,
    mount(root) {
      const SHARE_URL = `${location.origin}/#/tajian-partner`;
      root.querySelector('#tjp-share')?.addEventListener('click', async () => {
        const m = await import('./share.js');
        await m.openQuickShare({
          title: '塔建集团 · 合伙人计划（工商业光伏与储能）',
          desc: '城市 / 行业 / 项目 / 渠道合伙人：项目居间费、投资分成、EPC 分成、长期运维收益',
          url: SHARE_URL,
          image: '/static/tajian/company-cover.jpg',
          tag: '合伙人计划',
        });
      });

      const openApply = (presetType) => {
        if (!isLoggedIn()) {
          ui.toast('登录后才能申请合伙人', 'err');
          ctx.nav('#/login');
          return;
        }
        const picked = new Set(presetType ? [presetType] : ['城市合伙人']);
        ui.openSheet({
          title: '申请成为合伙人',
          content: `<div class="tiny dim mb8">提交后塔建集团商务会联系您，沟通资源与合作方式。</div>
            <div class="field"><label>姓名 <span style="color:#e74c3c">*</span></label><input class="input" id="tjp-name" maxlength="30" placeholder="您的姓名"></div>
            <div class="field"><label>企业单位名称 <span style="color:#e74c3c">*</span></label><input class="input" id="tjp-org" maxlength="80" placeholder="公司 / 单位全称"></div>
            <div class="field"><label>电话 <span style="color:#e74c3c">*</span></label><input class="input" id="tjp-phone" maxlength="20" placeholder="手机号"></div>
            <div class="field"><label>所在区域 <span style="color:#e74c3c">*</span></label><input class="input" id="tjp-region" maxlength="60" placeholder="如：杭州市萧山区 / 绍兴市"></div>
            <div class="field"><label>合伙人类型 <span class="tiny dim">（可多选）</span></label>
              <div class="chips" id="tjp-types">${PARTNER_DIRS.map((t) => `<a class="chip ${picked.has(t) ? 'active' : ''}" data-type="${t}" href="javascript:;">${t}</a>`).join('')}</div>
            </div>
            <div class="field"><label>资源说明 <span class="tiny dim">（客户 / 园区 / 行业资源）</span></label>
              <textarea class="textarea" id="tjp-res" rows="3" maxlength="1000" placeholder="如：本地 20 家规上工厂资源、2 个产业园区、可对接镇政府"></textarea></div>
            <div class="field"><label>补充资料 <span class="tiny dim">（选填，可多选）</span></label>
              <input type="file" id="tjp-files" multiple accept=".pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.txt,image/*">
              <div class="tiny dim mt6">可上传公司简介、案例、资源清单等</div>
            </div>
            <button class="btn btn-primary btn-block mt8" id="tjp-submit">提交合伙人申请</button>`,
          onMount(sheet, close) {
            sheet.querySelector('#tjp-types')?.addEventListener('click', (ev) => {
              const chip = ev.target.closest('[data-type]');
              if (!chip) return;
              ev.preventDefault();
              const d = chip.dataset.type;
              if (picked.has(d)) picked.delete(d);
              else picked.add(d);
              chip.classList.toggle('active', picked.has(d));
            });
            sheet.querySelector('#tjp-submit').addEventListener('click', async (e) => {
              const btn = e.currentTarget;
              const name = String(sheet.querySelector('#tjp-name').value || '').trim();
              const org = String(sheet.querySelector('#tjp-org').value || '').trim();
              const phone = String(sheet.querySelector('#tjp-phone').value || '').trim();
              const region = String(sheet.querySelector('#tjp-region').value || '').trim();
              const res = String(sheet.querySelector('#tjp-res').value || '').trim();
              const files = Array.from(sheet.querySelector('#tjp-files')?.files || []);
              if (!name) return ui.toast('请填写姓名', 'err');
              if (!org) return ui.toast('请填写企业单位名称', 'err');
              if (!phone) return ui.toast('请填写电话', 'err');
              if (!region) return ui.toast('请填写所在区域', 'err');
              btn.disabled = true;
              const oldText = btn.textContent;
              try {
                const fileIds = [];
                for (let k = 0; k < files.length; k += 1) {
                  btn.textContent = `上传资料 ${k + 1}/${files.length}…`;
                  try {
                    const up = await api.uploadFile(files[k]);
                    const rec = (up && up.files && up.files[0]) || up;
                    if (rec && rec.id) fileIds.push(rec.id);
                  } catch {
                    /* 单个失败不影响 */
                  }
                }
                btn.textContent = '提交中…';
                const types = [...picked].join('、') || '城市合伙人';
                const text = `【塔建集团 · 合伙人申请】杭州塔建新能源科技集团有限公司

合伙人类型：${types}
所在区域：${region}
企业单位名称：${org}
联系人：${name}
电话：${phone}

资源说明：
${res || '（未填写，可由商务电话沟通）'}

申请权益（按合伙人类别）：
· 项目居间费 / 投资分成 / EPC 施工分成 / 运维分成
· 品牌授权、方案与报价支持、踏勘与并网政策申报支持
· 培训陪跑与平台项目线索共享

说明：合伙人收益以双方签署的《合伙人合作协议》为准。
（补充资料 ${fileIds.length} 个，见附件）`;
                const listing = await service.createListing(
                  api.form({
                    category: 'project',
                    title: `申请合伙人｜${org} · 塔建集团新能源`.slice(0, 80),
                    subtitle: `${region} · ${org} · ${types} · 塔建集团合伙人申请`,
                    text,
                    type: '寻求合作',
                    durationDays: 180,
                    contactName: name,
                    phone,
                    company: org,
                    publish: '1',
                    fileIds,
                  }),
                );
                close();
                ui.toast('合伙人申请已提交，商务会尽快联系您', 'ok');
                ctx.nav(`#/detail/${listing.listing.id}`);
              } catch (err) {
                btn.disabled = false;
                btn.textContent = oldText;
                ui.toast(err.message || '提交失败', 'err');
              }
            });
          },
        });
      };

      root.querySelector('#tjp-apply')?.addEventListener('click', () => openApply(''));
      root.querySelector('#tjp-apply2')?.addEventListener('click', () => openApply(''));
      root.querySelectorAll('[data-type].tjp-pick').forEach((btn) => {
        btn.addEventListener('click', () => openApply(btn.dataset.type));
      });
    },
  };
}

export default { renderTajianPartner };

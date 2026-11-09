/**
 * 产教联合独立专题页（#/brainco-coop）
 *
 * 面向高校 / 职校 / 园区单独分享：
 *   产业学院 · 实训基地 · 课程
 * 提供：申请合作（自动发布合作需求）、申请参访、分享本页、返回强脑主专题
 */

import * as ui from './ui.js';
import { api, service, isLoggedIn } from './api.js';

const SECTIONS = [
  {
    id: 'college',
    icon: '🏫',
    name: '产业学院',
    desc: '专业共建 · 订单式培养 · 企业导师进课堂',
    items: [
      {
        id: 'coop-center',
        name: '脑机智能机器人创践中心（产教联合共建方案）',
        short: '创践中心共建',
        price: 0,
        image: '/static/brainco/revohuman.jpg',
        specs: [
          '场地规划 + 设备配置 + 展示动线设计',
          '脑机接口 / 灵巧手 / 双臂机器人 / 数据采集平台组合',
          '课程体系 + 师资培训 + 科研合作支持',
        ],
      },
      {
        id: 'coop-college',
        name: '产业学院共建（专业共建 / 订单式培养）',
        short: '产业学院共建',
        price: 0,
        image: '/static/brainco/robot.jpg',
        specs: [
          '专业方向共建：脑机接口 / 机器人 / 人工智能',
          '企业导师进课堂 + 订单式培养',
          '联合申报项目、共建课程与教材',
        ],
      },
    ],
  },
  {
    id: 'base',
    icon: '🏗️',
    name: '实训基地',
    desc: '联合实验室 · 实训基地 · 真机数据采集',
    items: [
      {
        id: 'coop-base',
        name: '产教融合实训基地共建',
        short: '产教融合实训基地',
        price: 0,
        image: '/static/brainco/revohuman.jpg',
        specs: ['联合实验室 + 实习实训基地 + 双创竞赛支持', '真实项目场景与数据采集实训', '对接强脑科技产业资源'],
      },
      {
        id: 'coop-platform',
        name: '产教联合实验平台组合（按校定制）',
        short: '产教联合平台组合',
        price: 0,
        image: '/static/brainco/revohuman.jpg',
        specs: ['32 通道脑电 + Revo2/Revo3 灵巧手 + 跨学科平台', '可加配双臂机器人 / RevoHuman 数采方案', '按学科方向与预算组合'],
      },
      {
        id: 'bundle-65',
        name: '双臂机器人 + 两对数据采集手套 + 数采平台（65 万套装）',
        short: '65万双臂数采套装',
        price: 650000,
        image: '/static/brainco/revohuman.jpg',
        specs: ['1 台双臂机器人（7DoF×2 + Revo3 灵巧手）', '2 对数据采集手套（外骨骼式，21 自由度×2/手）', '含数据采集平台（控制/可视化/遥操作/导出）'],
      },
    ],
  },
  {
    id: 'course',
    icon: '📚',
    name: '课程',
    desc: '三大模块实训课程 · 师资培训 · 教材与实验手册',
    items: [
      {
        id: 'coop-course-bci',
        name: '脑机接口技术与应用实训课程',
        short: '脑机接口实训课程',
        price: 100000,
        image: '/static/brainco/eeg.jpg',
        specs: ['脑机接口原理与范式（SSVEP / MI）', '脑电采集、信号处理与特征提取', '配合 BCIGo 32 通道脑电设备实训'],
      },
      {
        id: 'coop-course-robot',
        name: '机器人应用实训课程',
        short: '机器人实训课程',
        price: 100000,
        image: '/static/brainco/robot.jpg',
        specs: ['机器人技术通识 + 控制 + 信号处理', '配合机械臂 / 灵巧手 / 四足平台实训', '含项目案例与课程设计'],
      },
      {
        id: 'coop-course-ai',
        name: '人工智能与图像处理应用实训课程',
        short: 'AI 实训课程',
        price: 100000,
        image: '/static/brainco/brainrobot.jpg',
        specs: ['CNN / ResNet / 迁移学习 / Vision Transformer', 'PyTorch 实战：搭建、训练与评估', '结合具身智能数据采集场景'],
      },
    ],
  },
];

const ALL_ITEMS = SECTIONS.flatMap((s) => s.items.map((it) => ({ ...it, section: s.name })));
const COOP_DIRECTIONS = ['产教联合', '创践中心共建', '产业学院共建', '实训基地共建', '课程共建', '设备采购'];

function money(n) {
  return n ? '¥' + Number(n).toLocaleString('zh-CN') : '';
}

function cardHtml(it) {
  return `<div class="bcc-card" data-item="${ui.esc(it.id)}">
    <img class="bcc-card-img" src="${ui.esc(it.image)}" alt="" loading="lazy">
    <div class="bcc-card-body">
      <div class="bcc-card-name">${ui.esc(it.short)}</div>
      <div class="bcc-card-full tiny dim">${ui.esc(it.name)}</div>
      <ul class="bcc-specs">${it.specs.map((s) => `<li>${ui.esc(s)}</li>`).join('')}</ul>
      <div class="bcc-card-foot">
        <span class="bcc-price">${it.price ? money(it.price) : '价格面议'}</span>
        <button class="btn btn-sm ${it.price ? 'btn-primary' : 'btn-outline'}" type="button" data-bcc-apply="${ui.esc(it.id)}">${it.price ? '申请采购' : '申请合作'}</button>
      </div>
    </div>
  </div>`;
}

export async function renderBraincoCoop(ctx) {
  const sectionsHtml = SECTIONS.map(
    (sec) => `<div class="bcc-section" id="bcc-${ui.esc(sec.id)}">
      <div class="bcc-section-head">
        <div class="bcc-section-t">${sec.icon} ${ui.esc(sec.name)}</div>
        <div class="bcc-section-d">${ui.esc(sec.desc)}</div>
      </div>
      <div class="bcc-grid">${sec.items.map(cardHtml).join('')}</div>
    </div>`,
  ).join('');

  const html = `<div class="page bcc-page">
    <div class="bcc-hero">
      <img class="bcc-hero-logo" src="/static/brainco/brainco-logo.png" alt="BrainCo 强脑科技">
      <div class="bcc-badge">🤝 BrainCo 强脑科技 × 小鱼来了</div>
      <div class="bcc-hero-t">产教联合<br>脑机接口 + 具身智能 校企合作</div>
      <div class="bcc-hero-d">产业学院 · 产教融合实训基地 · 实训课程 · 创践中心共建</div>
      <div class="bcc-hero-stats">
        <div><b>3</b><span>合作方向</span></div>
        <div><b>3</b><span>实训课程</span></div>
        <div><b>1</b><span>65 万数采套装</span></div>
      </div>
      <div class="row gap8 mt14" style="flex-wrap:wrap">
        <button class="btn btn-primary" id="bcc-apply" type="button">申请合作</button>
        <button class="btn btn-outline" id="bcc-visit" type="button">🏫 申请参访</button>
        <button class="btn btn-outline" id="bcc-share" type="button">↗ 分享本页</button>
      </div>
      <a class="bcc-back" href="#/brainco">← 返回强脑科技主专题</a>
    </div>

    ${sectionsHtml}

    <div class="bcc-note">
      <div class="strong mb6">合作流程</div>
      <div class="small muted" style="line-height:1.9">
        ① 提交合作需求（含补充资料） → ② 平台与强脑科技商务对接 →
        ③ 方案与预算确认 → ④ 设备交付 / 课程共建 / 师资培训
      </div>
    </div>

    <div class="bc-foot">
      <div>BrainCo 强脑科技 · 产教联合专题</div>
      <div class="tiny dim mt6">设备与课程价格来自强脑科技官方资料，最终以合同与官方报价为准。</div>
    </div>
  </div>`;

  return {
    title: '强脑科技 · 产教联合',
    content: html,
    showBack: true,
    activeTab: 'home',
    mount(root) {
      const CUR = `${location.origin}/#/brainco-coop`;
      const doShare = async (title, url) => {
        try {
          if (navigator.share) {
            await navigator.share({ title, url });
            return;
          }
        } catch {
          /* 取消 */
        }
        try {
          await navigator.clipboard.writeText(`${title}\\n${url}`);
          ui.toast('链接已复制，可粘贴到微信', 'ok');
        } catch {
          ui.toast(url, 'ok');
        }
      };
      root.querySelector('#bcc-share')?.addEventListener('click', () =>
        doShare('强脑科技产教联合专题 · 产业学院 / 实训基地 / 课程', CUR),
      );

      /* 申请合作（可预设某个方向/产品） */
      const openApply = (presetId) => {
        if (!isLoggedIn()) {
          ui.toast('登录后才能提交合作申请', 'err');
          ctx.nav('#/login');
          return;
        }
        const preset = ALL_ITEMS.find((x) => x.id === presetId);
        const picked = new Set(['产教联合']);
        ui.openSheet({
          title: preset ? `申请合作：${preset.short}` : '申请合作',
          content: `<div class="field"><label>姓名 <span style="color:#e74c3c">*</span></label><input class="input" id="bcc-name" maxlength="30" placeholder="您的姓名"></div>
            <div class="field"><label>单位 <span style="color:#e74c3c">*</span></label><input class="input" id="bcc-org" maxlength="80" placeholder="学校 / 学院 / 企业"></div>
            <div class="field"><label>电话 <span style="color:#e74c3c">*</span></label><input class="input" id="bcc-phone" maxlength="20" placeholder="手机号"></div>
            <div class="field"><label>城市 <span style="color:#e74c3c">*</span></label><input class="input" id="bcc-city" maxlength="30" placeholder="例如：杭州"></div>
            <div class="field"><label>合作方向 <span class="tiny dim">（可多选）</span></label>
              <div class="chips" id="bcc-dirs">${COOP_DIRECTIONS.map((d) => `<a class="chip ${picked.has(d) ? 'active' : ''}" data-dir="${d}" href="javascript:;">${d}</a>`).join('')}</div>
            </div>
            <div class="field"><label>需求说明</label><textarea class="textarea" id="bcc-note" rows="3" maxlength="1000" placeholder="例如：想共建产业学院 / 采购 65 万数采套装 / 开设实训课程"></textarea></div>
            <div class="field"><label>补充资料 <span class="tiny dim">（选填，可多选）</span></label>
              <input type="file" id="bcc-files" multiple accept=".pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.txt,image/*,video/*">
              <div class="tiny dim mt6">可上传建设方案、需求文档、场地照片等</div>
            </div>
            <button class="btn btn-primary btn-block mt8" id="bcc-submit">提交并发布</button>`,
          onMount(sheet, close) {
            sheet.querySelector('#bcc-dirs')?.addEventListener('click', (ev) => {
              const chip = ev.target.closest('[data-dir]');
              if (!chip) return;
              ev.preventDefault();
              const d = chip.dataset.dir;
              if (picked.has(d)) picked.delete(d);
              else picked.add(d);
              chip.classList.toggle('active', picked.has(d));
            });
            sheet.querySelector('#bcc-submit').addEventListener('click', async (e) => {
              const btn = e.currentTarget;
              const name = String(sheet.querySelector('#bcc-name').value || '').trim();
              const org = String(sheet.querySelector('#bcc-org').value || '').trim();
              const phone = String(sheet.querySelector('#bcc-phone').value || '').trim();
              const city = String(sheet.querySelector('#bcc-city').value || '').trim();
              const note = String(sheet.querySelector('#bcc-note').value || '').trim();
              const files = Array.from(sheet.querySelector('#bcc-files')?.files || []);
              if (!name) return ui.toast('请填写姓名', 'err');
              if (!org) return ui.toast('请填写单位', 'err');
              if (!phone) return ui.toast('请填写电话', 'err');
              if (!city) return ui.toast('请填写城市', 'err');
              btn.disabled = true;
              const old = btn.textContent;
              try {
                const fileIds = [];
                for (let k = 0; k < files.length; k += 1) {
                  btn.textContent = `上传资料 ${k + 1}/${files.length}…`;
                  try {
                    const up = await api.uploadFile(files[k], {
                      onProgress: (pct) => {
                        btn.textContent = `上传资料 ${k + 1}/${files.length} ${pct}%`;
                      },
                    });
                    const rec = (up && up.files && up.files[0]) || up;
                    if (rec && rec.id) fileIds.push(rec.id);
                  } catch {
                    /* 单个失败不影响 */
                  }
                }
                btn.textContent = '提交中…';
                const dirText = [...picked].join('、') || '产教联合';
                const title = `寻求合作｜${org} · 强脑科技产教联合`;
                const text = `【产教联合 · 寻求合作】BrainCo 强脑科技 × 小鱼来了

合作单位：${org}
联系人：${name}
电话：${phone}
城市：${city}
合作方向：${dirText}
意向方案：${preset ? preset.name : '（未指定，商务按需推荐）'}

需求说明：
${note || '（未填写，可由商务电话沟通）'}

可选合作内容：
· 产业学院共建 / 创践中心共建 / 联合实验室
· 产教融合实训基地
· 实训课程（脑机接口 / 机器人 / 人工智能）
· 65 万双臂数采套装（双臂机器人 + 2 对数据采集手套 + 数采平台）

（补充资料 ${fileIds.length} 个，见附件）`;
                const res = await service.createListing(
                  api.form({
                    category: 'project',
                    title: title.slice(0, 80),
                    subtitle: `${city} · ${org} · 强脑科技产教联合合作需求`,
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
                ui.toast('已提交并发布，商务会尽快联系您', 'ok');
                ctx.nav(`#/detail/${res.listing.id}`);
              } catch (err) {
                btn.disabled = false;
                btn.textContent = old;
                ui.toast(err.message || '提交失败', 'err');
              }
            });
          },
        });
      };

      root.querySelector('#bcc-apply')?.addEventListener('click', () => openApply(''));
      root.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-bcc-apply]');
        if (btn) openApply(btn.dataset.bccApply);
      });

      /* 申请参访 */
      root.querySelector('#bcc-visit')?.addEventListener('click', () => {
        if (!isLoggedIn()) {
          ui.toast('登录后才能提交参访申请', 'err');
          ctx.nav('#/login');
          return;
        }
        ui.openSheet({
          title: '申请参访',
          content: `<div class="tiny dim mb8">提交后平台与强脑科技商务会联系确认参访时间。</div>
            <div class="field"><label>姓名 <span style="color:#e74c3c">*</span></label><input class="input" id="bccv-name" maxlength="30"></div>
            <div class="field"><label>单位 <span style="color:#e74c3c">*</span></label><input class="input" id="bccv-org" maxlength="80"></div>
            <div class="field"><label>电话 <span style="color:#e74c3c">*</span></label><input class="input" id="bccv-phone" maxlength="20"></div>
            <div class="row gap8">
              <div class="field grow"><label>人数</label><input class="input" id="bccv-people" type="number" min="1" max="50" value="2"></div>
              <div class="field grow"><label>意向日期</label><input class="input" id="bccv-date" type="date"></div>
            </div>
            <div class="field"><label>备注</label><textarea class="textarea" id="bccv-note" rows="2" maxlength="500"></textarea></div>
            <button class="btn btn-primary btn-block mt8" id="bccv-submit">提交参访申请</button>`,
          onMount(sheet, close) {
            sheet.querySelector('#bccv-submit').addEventListener('click', async (e) => {
              const btn = e.currentTarget;
              const name = String(sheet.querySelector('#bccv-name').value || '').trim();
              const org = String(sheet.querySelector('#bccv-org').value || '').trim();
              const phone = String(sheet.querySelector('#bccv-phone').value || '').trim();
              if (!name || !org || !phone) return ui.toast('请填写姓名、单位、电话', 'err');
              btn.disabled = true;
              btn.textContent = '提交中…';
              try {
                await service.feedbackSubmit({
                  text: `【产教联合 · 申请参访】\n姓名：${name}\n单位：${org}\n电话：${phone}\n人数：${sheet.querySelector('#bccv-people').value || 2}\n意向日期：${sheet.querySelector('#bccv-date').value || '待定'}\n备注：${sheet.querySelector('#bccv-note').value || '（无）'}`,
                  contact: phone,
                  page: '#/brainco-coop',
                  topics: ['强脑科技', '产教联合', '申请参访'],
                });
                close();
                ui.toast('参访申请已提交', 'ok');
              } catch (err) {
                btn.disabled = false;
                btn.textContent = '提交参访申请';
                ui.toast(err.message || '提交失败', 'err');
              }
            });
          },
        });
      });
    },
  };
}

export default { renderBraincoCoop };

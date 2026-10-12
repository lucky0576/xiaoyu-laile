/**
 * 小鱼来了 — 项目文书生成
 *
 * 覆盖流程里的三个需要出正式文书的环节：
 *   阶段 4  发邀请函      kind = 'invitation'
 *   阶段 5  签订居间      kind = 'brokerage'
 *   阶段 7  签订正式合约   kind = 'contract'
 *
 * 生成的是结构化内容（meta + sections + 纯文本版），
 * 前端可以直接渲染、打印成 PDF、或复制成微信文案。
 * 这里只是「草稿」，正式签署仍需线下盖章，README 里有说明。
 */

function money(v) {
  return String(v || '').trim() || '（待商定）';
}

function dash(v) {
  const s = String(v ?? '').trim();
  return s || '（待填写）';
}

/** 项目通用信息 */
function projectFacts(listing) {
  const p = listing.project || {};
  const bt = p.businessTerms || {};
  const cities = (listing.cities || []).map((c) => c.name || c).filter(Boolean);
  const industries = (listing.industries || []).map((i) => i.name || i).filter(Boolean);
  return {
    code: listing.id,
    title: listing.title || '（未命名项目）',
    subtitle: listing.subtitle || '',
    owner: listing.owner?.nickname || dash(listing.ownerName),
    company: dash(listing.company),
    cities: cities.join(' / '),
    industries: industries.join(' / '),
    amount: dash(p.investAmount),
    stage: dash(p.stage),
    cooperation: dash(bt.cooperationMode || p.cooperation),
    period: dash(bt.period || p.period),
    payment: dash(bt.paymentTerms),
    advance: dash(bt.advanceRatio),
    retention: dash(bt.retentionRatio),
    settlement: dash(bt.settlement),
    invoice: dash(bt.invoiceType),
    deposit: dash(bt.deposit),
    brokerage: dash(bt.brokerageRatio),
    brokerageBase: dash(bt.brokerageBase),
    brokerageNode: dash(bt.brokeragePayNode),
    priceType: dash(bt.priceType),
    priceRange: dash(bt.priceRange),
    tax: dash(bt.taxInfo),
    other: bt.otherTerms || '',
    contact: listing.contact?.name || listing.contact?.phone || '',
    url: '',
  };
}

/** 商务条件表格 */
function businessRows(f) {
  return [
    ['合作方式', f.cooperation],
    ['报价方式', f.priceType],
    ['报价区间 / 预算', f.priceRange],
    ['含税情况', f.tax],
    ['付款方式', f.payment],
    ['预付款比例', f.advance],
    ['质保金比例', f.retention],
    ['结算方式', f.settlement],
    ['发票要求', f.invoice],
    ['工期 / 交付期', f.period],
    ['保证金 / 履约担保', f.deposit],
  ].filter(([, v]) => v && v !== '（待填写）' && v !== '（待商定）');
}

/** 资质要求清单 */
function qualificationLines(listing) {
  const qs = listing.project?.qualifications || [];
  if (!qs.length) {
    return listing.project?.needQualification
      ? ['本项目要求承接方具备相应企业资质，具体以双方确认为准。']
      : ['本项目不设强制性资质门槛，以实际履约能力为准。'];
  }
  return qs.map((q, i) => `${i + 1}. ${q.name}${q.level && q.level !== '不要求' ? `（要求：${q.level}）` : ''}${q.required ? '' : ' —— 加分项'}${q.note ? `；${q.note}` : ''}`);
}

/* ------------------------------------------------------------------ */
/* 邀请函                                                              */
/* ------------------------------------------------------------------ */
function invitation(listing, f, q = {}) {
  const to = dash(q.to || '');
  const at = dash(q.date || '');
  const place = dash(q.place || '');
  const agenda = String(q.agenda || '').trim();
  const contact = dash(q.contact || f.contact || f.owner);

  const body = [
    `${to}：`,
    '',
    `我方就「${f.title}」项目（编号 ${f.code}）与贵方进行了初步沟通。现正式邀请贵方参加本项目对接洽谈，具体安排如下：`,
  ];
  if (agenda) body.push('', `洽谈议题：${agenda}`);
  body.push('', '请贵方确认出席意向，并提前准备以下资料：');
  for (const line of qualificationLines(listing)) body.push(`  · ${line}`);

  return {
    kind: 'invitation',
    title: '项 目 对 接 邀 请 函',
    subtitle: f.title,
    meta: [
      { label: '项目编号', value: f.code },
      { label: '受邀请方', value: to },
      { label: '洽谈时间', value: at },
      { label: '洽谈地点', value: place },
      { label: '发布方', value: `${f.owner}${listing.company ? ` · ${listing.company}` : ''}` },
      { label: '联系人与方式', value: contact },
    ],
    body,
    sections: [
      { heading: '项目基本信息', rows: [
        ['项目名称', f.title],
        ['所属行业', f.industries || '（待填写）'],
        ['项目所在地', f.cities || '（待填写）'],
        ['金额 / 投资额', f.amount],
        ['项目阶段', f.stage],
      ] },
      { heading: '需要贵方具备的资质', bullets: qualificationLines(listing) },
      ...(businessRows(f).length ? [{ heading: '商务条件（初谈）', rows: businessRows(f) }] : []),
    ],
    footer: `本邀请函由小鱼来了平台生成，编号 ${f.code}，生成时间 ${new Date().toLocaleString('zh-CN')}。正式安排以双方书面确认为准。`,
  };
}

/* ------------------------------------------------------------------ */
/* 居间协议                                                            */
/* ------------------------------------------------------------------ */
function brokerage(listing, f, q = {}) {
  const partyB = dash(q.partyB || '');
  const ratio = dash(q.ratio || f.brokerage);
  const base = dash(q.base || f.brokerageBase);
  const node = dash(q.node || f.brokerageNode);

  return {
    kind: 'brokerage',
    title: '居 间 协 议（草案）',
    subtitle: f.title,
    meta: [
      { label: '项目编号', value: f.code },
      { label: '委托方（甲方）', value: `${f.owner}${listing.company ? ` · ${listing.company}` : ''}` },
      { label: '居间方（乙方）', value: partyB },
      { label: '居间费比例', value: ratio },
      { label: '计费方式', value: base },
      { label: '支付节点', value: node },
    ],
    body: [
      '甲方拟就下列项目寻找合作方，乙方接受甲方委托提供居间服务。双方经友好协商，达成如下条款：',
    ],
    sections: [
      { heading: '第一条　委托事项', paragraphs: [
        `甲方委托乙方就「${f.title}」（项目编号 ${f.code}）提供居间服务，包括但不限于推荐意向合作方、协助安排对接洽谈、传递双方资料与商务条件。`,
      ] },
      { heading: '第二条　项目概况', rows: [
        ['项目名称', f.title],
        ['所属行业', f.industries || '（待填写）'],
        ['项目所在地', f.cities || '（待填写）'],
        ['金额 / 投资额', f.amount],
        ['合作方式', f.cooperation],
      ] },
      { heading: '第三条　居间服务内容', bullets: [
        '向甲方推荐符合项目要求的意向合作方；',
        '协助组织线上会议与线下会面；',
        '协助双方就商务条件进行沟通与澄清；',
        '协助推进资质审核、邀请函、合同签署等环节。',
      ] },
      { heading: '第四条　居间费与支付', bullets: [
        `居间费比例：${ratio}；`,
        `计费方式：${base}；`,
        `支付节点：${node}；`,
        '居间费不含税费的，由甲方另行承担相应税费。',
      ] },
      { heading: '第五条　双方义务', bullets: [
        '甲方应如实提供项目资料，不得隐瞒重大事项；',
        '乙方应勤勉尽责，不得同时损害双方利益；',
        '双方对在合作中知悉的商业秘密负有保密义务。',
      ] },
      { heading: '第六条　其他', paragraphs: [
        '本协议一式两份，甲乙双方各持一份，具有同等法律效力。',
        '本协议为平台生成的草案，正式条款以双方线下签署并加盖公章的文本为准。',
      ] },
      ...(businessRows(f).length ? [{ heading: '附：商务条件', rows: businessRows(f) }] : []),
    ],
    footer: `本草案由小鱼来了平台生成，编号 ${f.code}，生成时间 ${new Date().toLocaleString('zh-CN')}。`,
  };
}

/* ------------------------------------------------------------------ */
/* 正式合约要点                                                        */
/* ------------------------------------------------------------------ */
function contract(listing, f, q = {}) {
  const partyB = dash(q.partyB || '');
  const amount = dash(q.amount || f.priceRange || f.amount);

  return {
    kind: 'contract',
    title: '合 同 要 点 确 认 单',
    subtitle: f.title,
    meta: [
      { label: '项目编号', value: f.code },
      { label: '甲方', value: `${f.owner}${listing.company ? ` · ${listing.company}` : ''}` },
      { label: '乙方', value: partyB },
      { label: '合同金额', value: amount },
      { label: '工期 / 交付期', value: f.period },
      { label: '付款方式', value: f.payment },
    ],
    body: [
      '双方就下列项目的合作达成一致，以下为正式合同的核心条款确认项，供签约前逐项核对：',
    ],
    sections: [
      { heading: '一、合同主体', rows: [
        ['甲方（发包 / 委托方）', `${f.owner}${listing.company ? ` · ${listing.company}` : ''}`],
        ['乙方（承包 / 承接方）', partyB],
      ] },
      { heading: '二、项目概况', rows: [
        ['项目名称', f.title],
        ['所属行业', f.industries || '（待填写）'],
        ['项目所在地', f.cities || '（待填写）'],
        ['项目阶段', f.stage],
      ] },
      { heading: '三、商务条款', rows: businessRows(f).length ? businessRows(f) : [['商务条件', '（待商定）']] },
      { heading: '四、承包商应具备的资质', bullets: qualificationLines(listing) },
      { heading: '五、签约前须核对', bullets: [
        '乙方营业执照、资质证书在有效期内；',
        '合同金额、税率与发票类型已确认；',
        '付款节点与验收标准写入合同附件；',
        '质保期、违约责任、争议解决方式明确；',
        '居间费支付节点与居间协议一致。',
      ] },
    ],
    footer: `本确认单由小鱼来了平台生成，编号 ${f.code}，生成时间 ${new Date().toLocaleString('zh-CN')}。不构成正式合同，正式文本以双方签署并盖章的合同为准。`,
  };
}

/* ------------------------------------------------------------------ */
/* 纯文本版（复制到微信 / 邮件用）                                      */
/* ------------------------------------------------------------------ */
export function toPlainText(doc) {
  const out = [doc.title, doc.subtitle ? `—— ${doc.subtitle}` : '', ''];
  for (const m of doc.meta || []) out.push(`${m.label}：${m.value}`);
  out.push('');
  for (const line of doc.body || []) out.push(line);
  for (const s of doc.sections || []) {
    out.push('', s.heading);
    for (const r of s.rows || []) out.push(`  ${r[0]}：${r[1]}`);
    for (const b of s.bullets || []) out.push(`  · ${b}`);
    for (const p of s.paragraphs || []) out.push(`  ${p}`);
  }
  out.push('', doc.footer || '');
  return out.filter((x) => x !== undefined).join('\n').replace(/\n{3,}/g, '\n\n');
}

/* ------------------------------------------------------------------ */
/* 入口                                                                */
/* ------------------------------------------------------------------ */
export function buildDocument(kind, listing, user, baseUrl = '', query = {}) {
  const f = projectFacts(listing);
  f.url = `${baseUrl}/#/detail/${listing.id}`;
  void user;
  let doc;
  if (kind === 'invitation') doc = invitation(listing, f, query);
  else if (kind === 'brokerage') doc = brokerage(listing, f, query);
  else if (kind === 'contract') doc = contract(listing, f, query);
  else throw new Error('未知的文书类型');
  doc.projectUrl = f.url;
  doc.plain = toPlainText(doc);
  doc.generatedAt = new Date().toISOString();
  return doc;
}

export default { buildDocument, toPlainText };

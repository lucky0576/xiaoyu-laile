import io
P = r"C:\Users\Administrator\Documents\deepseek-harness\default-workspace\xiaoyu-laile\public\static\views-tags.js"
s = io.open(P, "r", encoding="utf-8").read()
n = 0

# 1) 卡片：支持定制档 + 显示年付价
OLD1 = """  const card = (lv) => {
    const isCurrent = lv.key === cur.key;
    const isFree = lv.price === 0;
    return `<div class="lv-card ${isCurrent ? 'cur' : ''}" style="--lv:${lv.color}">"""
NEW1 = """  const card = (lv) => {
    const isCurrent = lv.key === cur.key;
    const isFree = lv.price === 0 && !lv.custom;
    const isCustom = Boolean(lv.custom);
    return `<div class="lv-card ${isCurrent ? 'cur' : ''}" style="--lv:${lv.color}">"""
if OLD1 in s:
    s = s.replace(OLD1, NEW1, 1)
    n += 1
    print("ok: 卡片支持定制档")

OLD2 = """        <div class="lv-price">
          ${isFree ? '<b>免费</b>' : `<b>¥${num(lv.price)}</b><span>${ui.esc(lv.unit)}</span>`}
        </div>"""
NEW2 = """        <div class="lv-price">
          ${isFree
            ? '<b>免费</b>'
            : isCustom
              ? '<b>面议</b>'
              : `<b>¥${num(lv.price)}</b><span>${ui.esc(lv.unit)}</span>
                 ${lv.yearPrice ? `<div class="lv-year">或 ¥${num(lv.yearPrice)} / 年（省两个月）</div>` : ''}`}
        </div>"""
if OLD2 in s:
    s = s.replace(OLD2, NEW2, 1)
    n += 1
    print("ok: 价格区支持年付与面议")

OLD3 = """      ${
        isFree
          ? ''
          : isCurrent
            ? `<button class="btn btn-block mt12" id="lv-cancel">取消会员</button>`
            : `<button class="btn btn-primary btn-block mt12" data-buy="${ui.esc(lv.key)}">开通 ${ui.esc(lv.name)}</button>`
      }"""
NEW3 = """      ${
        isFree
          ? ''
          : isCustom
            ? `<a class="btn btn-outline btn-block mt12" href="#/contact-us">咨询定制方案</a>`
            : isCurrent
              ? `<button class="btn btn-block mt12" id="lv-cancel">取消会员</button>`
              : `<button class="btn btn-primary btn-block mt12" data-buy="${ui.esc(lv.key)}">开通 ${ui.esc(lv.name)}</button>`
      }"""
if OLD3 in s:
    s = s.replace(OLD3, NEW3, 1)
    n += 1
    print("ok: 定制档改为咨询入口")

# 2) 顶部说明改成当前付费流程（扫码/转账 + 人工确认）
OLD4 = """      <div class="tiny dim center mt12 mb12">会员按月计费，可随时取消。支持微信 / 支付宝扫码，或银行转账。</div>"""
NEW4 = """      <div class="card card-pad mb12">
        <div class="strong mb6">💡 怎么开通</div>
        <div class="small muted" style="line-height:1.9">
          1. 选一个等级，点「开通」→ 扫码或转账<br>
          2. 转账后点「我已付款」，管理员核对到账（一般 1 个工作日内）<br>
          3. 开通后立即生效，可开电子普通发票（需提供开票信息）<br>
          4. 定制服务（私有化部署 / 数据服务）请点「咨询定制方案」
        </div>
      </div>
      <div class="tiny dim center mb12">会员按月计费，可随时取消；年付相当于付 10 个月用 12 个月。</div>"""
if OLD4 in s:
    s = s.replace(OLD4, NEW4, 1)
    n += 1
    print("ok: 开通说明已更新")

# 3) 底部说明同步（去掉「不退还」这类激怒用户的话，改成合规表述）
OLD5 = """          <p>3. 取消会员立即降回免费用户，已支付费用不退还。</p>"""
NEW5 = """          <p>3. 取消会员后立即降回免费用户，未使用部分可按天折算退费（联系管理员办理）。</p>"""
if OLD5 in s:
    s = s.replace(OLD5, NEW5, 1)
    n += 1
    print("ok: 退款表述已改")

io.open(P, "w", encoding="utf-8").write(s)
print(f"done（{n} 处）")
import io

ROOT = r"C:\Users\Administrator\Documents\deepseek-harness\default-workspace\xiaoyu-laile"
n = 0

# ================================================================== #
# 1) app.js：三条法律路由
# ================================================================== #
P1 = ROOT + r"\public\static\app.js"
s1 = io.open(P1, "r", encoding="utf-8").read()

OLD1 = """const viewsBcastText = lazyView(() => import('./views-bcast-text.js'));"""
NEW1 = """const viewsBcastText = lazyView(() => import('./views-bcast-text.js'));
const viewsLegal = lazyView(() => import('./views-legal.js'));"""
if OLD1 in s1 and "views-legal" not in s1:
    s1 = s1.replace(OLD1, NEW1, 1)
    n += 1
    print("ok: 已加懒加载")

OLD2 = """    case 'about':
      return viewsAbout.renderAbout(ctx, query);"""
NEW2 = """    case 'about':
      return viewsAbout.renderAbout(ctx, query);
    case 'privacy':
      return viewsLegal.renderPrivacy(ctx, query);
    case 'terms':
      return viewsLegal.renderTerms(ctx, query);
    case 'disclaimer':
      return viewsLegal.renderDisclaimer(ctx, query);"""
if OLD2 in s1 and "case 'privacy'" not in s1:
    s1 = s1.replace(OLD2, NEW2, 1)
    n += 1
    print("ok: 已加三条法律路由")
io.open(P1, "w", encoding="utf-8").write(s1)

# ================================================================== #
# 2) 关于页底部加合规链接（首页顶栏「关于」可到）
# ================================================================== #
P2 = ROOT + r"\public\static\views-about.js"
s2 = io.open(P2, "r", encoding="utf-8").read()
OLD3 = """  export default { renderAbout };"""
NEW3 = """  export default { renderAbout };"""
# 在 return 的 html 里找结尾插入
OLD4 = """      小鱼来了 · 让每一条好项目，都被对的人看见"""
NEW4 = """      <div class="legal-links mt16">
        <a href="#/privacy">隐私政策</a>·<a href="#/terms">用户协议</a>·<a href="#/disclaimer">免责声明</a>
      </div>
      <div class="tiny dim mt6">举报违规信息：13456693544 · service@xiaoyulaile.online</div>
      小鱼来了 · 让每一条好项目，都被对的人看见"""
if OLD4 in s2 and "legal-links" not in s2:
    s2 = s2.replace(OLD4, NEW4, 1)
    n += 1
    print("ok: 关于页已加合规链接")
else:
    print("WARN: 关于页未匹配")
io.open(P2, "w", encoding="utf-8").write(s2)

# ================================================================== #
# 3) 首页底部加页脚（合规链接 + 运营主体）
# ================================================================== #
P3 = ROOT + r"\public\static\views-home.js"
s3 = io.open(P3, "r", encoding="utf-8").read()
OLD5 = """    ${eventQuickHtml}"""
NEW5 = """    ${eventQuickHtml}

    <div class="site-foot">
      <div class="site-foot-links">
        <a href="#/about">关于我们</a><i>·</i>
        <a href="#/privacy">隐私政策</a><i>·</i>
        <a href="#/terms">用户协议</a><i>·</i>
        <a href="#/disclaimer">免责声明</a><i>·</i>
        <a href="#/contact-us">举报与投诉</a>
      </div>
      <div class="site-foot-meta">
        运营主体：授渔算法（上海）科技有限公司<br>
        联系与举报：13456693544 · service@xiaoyulaile.online<br>
        <span class="tiny">本站信息来自用户发布与公开渠道整理，仅供参考，不构成交易或投资建议</span>
      </div>
    </div>"""
if OLD5 in s3 and "site-foot" not in s3:
    s3 = s3.replace(OLD5, NEW5, 1)
    n += 1
    print("ok: 首页已加页脚")
else:
    print("WARN: 首页页脚插入失败")

io.open(P3, "w", encoding="utf-8").write(s3)
print(f"done（{n} 处）")

# 小鱼来了 · 企业邮箱开通指南（免费方案）

> 目标：让 `service@xiaoyulaile.online` 能收发邮件。
> 实测现状（2026-11-06）：
> - 域名 `xiaoyulaile.online` **没有 MX 记录** → 现在收不到任何邮件
> - DNS 托管在 **DNSPod**（NS：louis.dnspod.net / butterfly.dnspod.net）
> - 服务器 25 端口被云服务商封堵 → **自建邮件服务器不可行**
> - 结论：只能用第三方域名邮箱 / 转发服务

---

## 一、免费方案对比（2026-11 实测）

| 方案 | 免费额度 | 能收 | 能发 | 需要备案 | 推荐度 |
|---|---|---|---|---|---|
| **Zoho Mail 免费版（Forever Free）** | 1 个域名 / 5 用户 / 每人 5GB | ✅ | ✅（网页版/手机 App） | ❌ 不需要 | ⭐⭐⭐⭐⭐ |
| **ImprovMX**（转发） | 免费转发 | ✅ | ❌ 只能转发到 QQ 邮箱 | ❌ 不需要 | ⭐⭐⭐（应急） |
| Cloudflare Email Routing | 免费转发 | ✅ | ❌ | ❌ 不需要 | ⭐⭐（要迁 DNS） |
| 腾讯企业邮箱免费版 | 5 用户 | ✅ | ✅ | ✅ **需要 ICP 备案** | ⭐⭐（备案后首选） |
| 阿里云/网易邮箱免费版 | 5 用户 | ✅ | ✅ | ✅ 需要备案 | ⭐⭐ |

**结论：现在用 Zoho 免费版；等 ICP 备案下来再迁腾讯企业邮箱。**

> 注意：Zoho 免费版**不含 IMAP / POP / ActiveSync** —— 只能用网页版和手机 App 收发，
> 不能配置到 Foxmail / 手机自带邮件客户端。如果必须用客户端，选 ImprovMX 转发到 QQ 邮箱，或在备案后换腾讯企业邮箱。

---

## 二、Zoho 免费版注册（10 分钟）

### 1. 用「免费版」入口注册（不要点 Lite/Premium）

```
免费版注册链接（官方）：
https://mail.zoho.com/signup?type=org&plan=free

或者：https://www.zoho.com/mail/zohomail-pricing.html
      页面上找「Mail Free Forever free」→ Sign up
```

- 用你的常用邮箱注册（QQ / 163 都行，要能收验证码）
- 注册完进入后台 `mailadmin.zoho.com`

### 2. 添加域名

```
Zoho 后台 → Domains → Add Domain → 输入 xiaoyulaile.online
→ 验证方式选 CNAME（只加一条记录）
→ Zoho 会给：主机记录（形如 zb12345678）+ 记录值（zmverify.zoho.com）
```

**把这两项发我，我配 DNS；或者你自己在 DNSPod 加。**

### 3. Zoho 免费版的 MX 记录（验证通过后添加）

| 类型 | 主机记录 | 记录值 | 优先级 |
|---|---|---|---|
| MX | @ | mx.zoho.com | 10 |
| MX | @ | mx2.zoho.com | 20 |
| MX | @ | mx3.zoho.com | 50 |
| TXT | @ | v=spf1 include:zoho.com ~all | — |
| TXT | _dmarc | v=DMARC1; p=none; rua=mailto:service@xiaoyulaile.online | — |

### 4. 创建邮箱账号

```
Zoho 后台 → Users → Add User
邮箱：service@xiaoyulaile.online
密码：你自己设（建议强密码 + 开启二次验证）
```

---

## 三、DNS 怎么加（两种方式）

### 方式 A：你自己在 DNSPod 控制台加（推荐，不用交出密钥）

```
1. 打开 https://www.dnspod.cn/ 登录（腾讯云账号）
2. 进入「我的域名」→ xiaoyulaile.online → 解析记录
3. 点「添加记录」，按上表逐条填（类型 / 主机记录 / 记录值 / 优先级）
4. 保存，等 1~10 分钟生效
```

### 方式 B：给我 DNSPod API Token，我一次配完

**Token 是你生成的，不是我给的**，操作步骤：

```
1. 登录 dnspod.cn
2. 右上角头像 → 用户中心（或直接访问 https://console.dnspod.cn/account/token）
3. 找到「密钥管理 / API Token」→ 创建密钥
4. 备注写「小鱼来了 DNS 配置」，权限选「DNS 记录 读取 + 修改」
5. 生成后把 ID 和 Token（或 SecretId / SecretKey）复制发我
6. 我配置完，你可以立刻「删除/重置」这个密钥，不影响已完成配置
```

**安全说明：**
- 这个 Token 只能改 DNS 解析，不能动你的账号密码/支付
- 用一次就够，配完建议删除或重置
- 如果你不想给，走方式 A，我把每条记录写清楚

---

## 四、验证是否生效

```
配完后：
1. 我用命令查 MX 记录，确认指向 zoho
2. 我发一封测试邮件到 service@xiaoyulaile.online
3. 你登录 mail.zoho.com 看是否收到
4. 再从该邮箱发一封到你的 QQ 邮箱，确认能发
```

---

## 五、风险提醒

```
⚠️ 融资项目介绍表里填的联系邮箱是 service@xiaoyulaile.online
   在邮箱开通前提交，创投大会的通知邮件会全部丢失。
   选择：
   A. 等邮箱开通再提交（推荐）
   B. 先把表里的邮箱改成你已有的 QQ / 163 邮箱（告诉我用哪个）
```

---

## 六、用手机 App 收信（免费版推荐做法）

免费版没有「转发到 QQ」功能（Zoho 官方明确说明：新注册免费用户不提供 Email Forwarding），
所以用官方 App + 推送通知来「随时收到」。

### 1. 下载

| 系统 | 下载方式 |
|---|---|
| iPhone | App Store 搜索「Zoho Mail」 |
| 安卓 | 应用市场（华为/小米/应用宝）搜「Zoho Mail」，或官网 https://www.zoho.com/mail/download.html |

### 2. 登录

```
打开 App → Sign in / 登录
账号：service@xiaoyulaile.online
密码：创建用户时设置的那个
（如果提示验证，选「Zoho Accounts」登录）
```

### 3. 打开推送通知

```
iPhone：设置 → 通知 → Zoho Mail → 允许通知
安卓：App 内 → 左上角菜单 → Settings → Notifications → 全部打开
     并在系统设置里允许 Zoho Mail 通知
```

### 4. 测试

```
1. 用 QQ / 163 发一封到 service@xiaoyulaile.online
2. 手机应弹出通知，App 收件箱能看到
3. 在 App 里回复一封到 QQ，确认能发出去
```

### 5. 常见问题

```
· 免费版不能把邮箱加到手机自带「邮件」App（没有 IMAP）
· 忘记密码：https://accounts.zoho.com → 用 service@ 找回
· 收不到推送：检查系统通知权限 + App 内通知开关
· 第一次发到 QQ/163 可能进垃圾箱 → 配好 DKIM 后正常
```

---

## 七、关于「转发到 QQ」

Zoho 免费版不支持转发。如果确实需要「所有邮件都进 QQ 邮箱」，有两条路：

1. **换 ImprovMX 转发**（免费）：MX 记录改到 ImprovMX，所有来信自动转 QQ；
   Zoho 保留用于发信；代价是 Zoho 收件箱不再进信。
2. **升级 Zoho Mail Lite**（$1/用户/月，约 ¥7/月）：转发 + IMAP 都有，最正规。

---



## 八、常见问题

**Q：Zoho 免费版真的免费吗？会不会到期收费？**
A：官方写「Forever free」，5 用户以内免费，不绑信用卡。注意要从 `plan=free` 入口注册，付费页会引导到 Lite（$1/用户/月）。

**Q：免费版收不到验证邮件？**
A：Zoho 会往注册邮箱发验证码，检查垃圾邮件；不行就换 Gmail/Outlook 注册。

**Q：以后想用手机自带邮件 App 收？**
A：免费版不支持 IMAP。备案完成后换腾讯企业邮箱（免费版支持 IMAP），或在过渡期用 ImprovMX 转发到 QQ 邮箱。

---

*本文档由小鱼来了平台维护 · 2026-11-06*

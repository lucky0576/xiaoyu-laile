# 小鱼来了 · 企业邮箱开通指南（Zoho Mail 免费版）

> 目标：让 `service@xiaoyulaile.online` 能正常收发邮件。
> 现状（2026-11-06 实测）：
> - 域名 `xiaoyulaile.online` 没有 MX 记录 → 现在收不到任何邮件
> - DNS 托管在 **DNSPod**（NS：louis.dnspod.net / butterfly.dnspod.net）
> - 服务器 25 端口被云服务商封堵（ufw 放行后外部仍连不通）→ **自建邮件服务器不可行**
> - 结论：走 Zoho Mail（域名邮箱，免费版 5 个账号），MX 指向 Zoho 的服务器

---

## 一、你需要做的（10 分钟）

### 1. 注册 Zoho 账号

1. 打开 https://www.zoho.com/mail/
2. 点 `Sign Up` → 选 `Mail` → 用你的常用邮箱注册（建议用 QQ 邮箱或 163，能收验证码）
3. 注册完成后进入 `Zoho Mail Admin Console`

### 2. 添加域名

1. Admin Console → `Domains` → `Add Domain`
2. 输入 `xiaoyulaile.online`
3. 选择 **验证方式：CNAME**（比 TXT 简单，只加一条）
4. Zoho 会给一个类似这样的记录：

```
类型：CNAME
主机记录：zb12345678
记录值：zmverify.zoho.com
```

**把这条记录（主机记录 + 记录值）发给我**，我在 DNSPod 帮你加（需要你给 DNSPod API Token），或者你自己在 DNSPod 控制台加。

### 3. 添加 MX 记录（Zoho 会一并给出）

Zoho 免费版一般要求三条 MX（按优先级）：

```
优先级 10  mx.zoho.com
优先级 20  mx2.zoho.com
优先级 50  mx3.zoho.com
```

### 4. 创建邮箱账号

验证通过后，在 Zoho 后台创建：

```
service@xiaoyulaile.online     对外服务邮箱（融资/创投/客户）
```

账号密码由你设置（建议用强密码 + 开启二次验证）。

---

## 二、我可以代做的部分

| 事项 | 谁做 | 说明 |
|---|---|---|
| 注册 Zoho 账号 | **你** | 需要图形验证码与邮箱验证码，第三方无法代注册 |
| 添加域名、创建邮箱 | **你**（Zoho 后台点几下） | 我提供每一步截图指引 |
| 配置 DNSPod 的 CNAME / MX / SPF / DMARC | **我**（需要 DNSPod API Token） | 一次配置，10 秒完成 |
| 网站上的邮箱、签名、联系页统一更新 | **我** | 全站搜一遍替换 |
| 收发测试（发一封 / 收一封） | 我 + 你 | 我发，你确认收到 |

**DNSPod API Token 获取方式**：DNSPod 控制台 → 用户中心 → 密钥管理 → 创建密钥（只勾选 DNS 记录读写权限）。

---

## 三、DNS 记录清单（Zoho 验证通过后我再补精确值）

| 类型 | 主机记录 | 记录值 | 用途 |
|---|---|---|---|
| CNAME | （Zoho 给） | （Zoho 给） | 域名归属验证 |
| MX | @ | mx.zoho.com（优先级 10） | 收邮件 |
| MX | @ | mx2.zoho.com（优先级 20） | 收邮件 |
| MX | @ | mx3.zoho.com（优先级 50） | 收邮件 |
| TXT | @ | v=spf1 include:zoho.com ~all | 反垃圾（SPF） |
| TXT | _dmarc | v=DMARC1; p=none; rua=mailto:service@xiaoyulaile.online | 反垃圾（DMARC） |

---

## 四、备案之后可以换的服务

Zoho 免费版够用，但如果你更想用国内服务（送达率更高）：

| 服务 | 费用 | 前提 |
|---|---|---|
| 腾讯企业邮箱免费版 | 免费 | 域名需 **ICP 备案** |
| 阿里云邮箱免费版 | 免费 | 域名需 **ICP 备案** |
| 网易企业邮箱 | 免费版 5 账号 | 需备案 |

**所以：先 Zoho 用起来，等 ICP 备案下来再迁腾讯/阿里。**

---

## 五、风险提醒

```
⚠️ 融资项目介绍表里填的联系邮箱是 service@xiaoyulaile.online
   在邮箱开通前提交，创投大会的通知邮件会全部丢失。
   两个选择：
   A. 等邮箱开通再提交（推荐）
   B. 先把表里的邮箱改成你已有的 QQ / 163 邮箱
```

**2026-11-06 备注：本文档由小鱼来了平台维护，邮箱开通后更新状态。**

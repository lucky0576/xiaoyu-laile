# 部署指南 —— 把「小鱼来了」放到云服务器上

目标：**去掉所有第三方提示页**、**服务不再跑在你自己电脑上**。

原理很简单：自有服务器 + 自有域名 + Let's Encrypt 自动 HTTPS。访客打开域名直接就是你的页面，
中间不存在任何 ngrok / serveo / cloudflare 的中间页。

---

## 一、先选路线

| 路线 | 费用 | 备案 | 适用 | 备注 |
|---|---|---|---|---|
| **A. 国内轻量云**（阿里云/腾讯云） | 约 ¥60–120/年（新用户活动） | **需要**，2–3 周 | 用户主要在中国大陆 | 国内访问最快；备案期间可先用 IP 调试 |
| **B. 香港/新加坡轻量云** | 约 ¥150–300/年 | **不需要** | 想快速上线、或用户分散 | 免备案，绑域名即用；国内访问速度中等 |
| **C. Fly.io** | 免费额度内约 ¥0–40/月 | 不需要 | 不想管服务器 | 需挂 volume 存数据，否则重启丢数据 |
| **D. Railway / Render** | $5 额度/月 或免费层 | 不需要 | 快速验证 | Render 免费层无持久磁盘，**会丢数据**；正式用要付费盘 |

> 如果你的客户主要在国内，建议 **B 先上线 + 同步办 A 的备案**，备案下来再迁回国内节点。
> 国内服务器**不备案无法用域名访问 80/443**，这是硬规定。

一台最低配就够：**1 核 2G / 40G 盘 / 3M 带宽**。

---

## 一之补：华为云专用步骤

本项目**零 npm 依赖**，服务器上只需要一个 Node 二进制，不用装 Docker、不用 npm install。
华为云国内节点走这条路比 Docker 稳得多（不用拉 Docker Hub 镜像）。

### 1. 控制台放行端口

华为云 → 弹性云服务器 → **安全组** → 入方向规则，放行：

| 协议 | 端口 | 用途 |
|---|---|---|
| TCP | 22 | SSH |
| TCP | 80 | HTTP（申请证书 + 跳转 HTTPS） |
| TCP | 443 | HTTPS |
| TCP | 8787 | 可选，先用 IP 调试 |

### 2. 上传代码并一键部署

在**本地**（项目上一级目录）打包：

```powershell
.\xiaoyu-laile\scripts\make-release.ps1
```

上传到服务器（换成你的公网 IP）：

```bash
scp xiaoyu-laile-release-*.tar.gz root@你的公网IP:/root/
ssh root@你的公网IP
```

在**服务器上**执行：

```bash
cd /root
tar -xzf xiaoyu-laile-release-*.tar.gz
cd xiaoyu-laile
sudo bash deploy/deploy.sh
```

脚本会自动完成：装 Node 20（优先走华为云镜像站）→ 建运行用户 → 同步代码到 `/opt/xiaoyu-laile`
→ 生成带随机会话密钥的 `.env` → 注册 systemd 服务并启动 → 放行防火墙与 SELinux → 自检。

先用 IP 验证：`http://你的公网IP:8787`

### 3. 域名 + HTTPS（去掉提示页的关键）

境外节点（香港/新加坡）直接：

```bash
sudo DOMAIN=xiaoyu.你的域名.com ACME_EMAIL=你的邮箱@example.com bash deploy/deploy.sh
```

脚本会装 nginx、写好反代（含 SSE 免缓冲、512MB 上传），再用 certbot 自动签发并续期证书。

> **国内节点（华北/华东/华南）**：域名必须先完成 **ICP 备案**，
> 否则 80/443 会被拦截。备案在华为云控制台 → 备案 提交，一般 2–3 周。
> 备案下来前先用 `http://公网IP:8787` 调试。

### 4. 域名解析

域名服务商控制台加 A 记录：

```
主机记录  xiaoyu
记录类型  A
记录值    你的公网 IP
```

几分钟生效后，重跑一次带 `DOMAIN=` 的部署命令。

### 5. 验收

```bash
curl -I https://xiaoyu.你的域名.com        # 200，且没有任何中间页
systemctl status xiaoyu-laile             # active (running)
journalctl -u xiaoyu-laile -f             # 实时日志
```

浏览器确认：https 证书有效、**直接进首页无警告页**、手机访问正常。

### 6. 常用运维

```bash
systemctl restart xiaoyu-laile            # 重启
nano /opt/xiaoyu-laile/.env               # 改配置（改完重启）

# 备份（建议加进 crontab）
tar -czf /root/xiaoyu-$(date +%F).tar.gz -C /opt/xiaoyu-laile data
find /root -name 'xiaoyu-*.tar.gz' -mtime +14 -delete

# 升级：重传发布包，解压后重跑 deploy.sh，数据目录自动保留
```

> **上线前关掉演示数据**：`.env` 设 `NO_SEED=1`，删掉 `/opt/xiaoyu-laile/data/collections/`，重启。

---

## 二、通用部署（Docker Compose + Caddy）

Caddy 会自动申请并续期证书，**不用手写一行 HTTPS 配置**。

### 1. 准备服务器

```bash
# 以 Ubuntu 22.04 为例，装 Docker
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER && newgrp docker
```

安全组 / 防火墙放行：**22（SSH）、80、443**。

### 2. 上传代码

在本地项目根目录（`xiaoyu-laile` 的上一级）打包上传：

```powershell
# Windows
.\xiaoyu-laile\scripts\make-release.ps1
# 生成 xiaoyu-laile-release.tar.gz，然后
scp xiaoyu-laile-release.tar.gz root@你的服务器IP:/opt/
```

```bash
# 服务器上
cd /opt && mkdir -p xiaoyu-laile && tar -xzf xiaoyu-laile-release.tar.gz -C xiaoyu-laile --strip-components=0
```

> 也可以直接 `git clone`，或用 `scp -r` 传整个目录（排除 `data/`）。

### 3. 配环境变量

```bash
cd /opt/xiaoyu-laile/deploy
cp .env.production.example .env
# 生成会话密钥
openssl rand -hex 48
nano .env      # 填 DOMAIN / ACME_EMAIL / SESSION_SECRET / PUBLIC_BASE_URL
```

`.env` 关键项：

```env
DOMAIN=xiaoyu.你的域名.com
ACME_EMAIL=你的邮箱@example.com
SESSION_SECRET=<openssl rand -hex 48 的输出>
PUBLIC_BASE_URL=https://xiaoyu.你的域名.com
```

### 4. 域名解析

到域名服务商控制台加一条 **A 记录**：

```
主机记录  xiaoyu
记录类型  A
记录值    你的服务器公网 IP
```

等 1–10 分钟生效，用 `ping xiaoyu.你的域名.com` 确认指向正确。

### 5. 启动

```bash
cd /opt/xiaoyu-laile/deploy
mkdir -p data
docker compose up -d --build
docker compose logs -f app      # 看启动日志，出现访问地址即成功
```

首次启动会自动写入演示数据（4 位用户 / 16 条信息 / 10 个案例）。
**正式上线前建议关掉演示数据**：在 `.env` 里设 `NO_SEED=1`，并删掉 `deploy/data/collections/`。

### 6. 验收

```bash
curl -I https://xiaoyu.你的域名.com                 # 应返回 200，无任何中间页
curl https://xiaoyu.你的域名.com/api/health         # 应返回 {"ok":true,...}
```

浏览器打开，确认：
- [ ] 直接进首页，**没有警告页/提示页**
- [ ] 地址栏是 https，证书有效（浏览器不报警）
- [ ] 手机浏览器同样正常
- [ ] 注册 / 登录 / 发布 / 留言 AI 回复可用
- [ ] 分享面板里的链接和二维码指向你的域名

---

## 三、裸机部署（不用 Docker）

```bash
# Node 20
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

sudo useradd -r -s /bin/false xiaoyu
sudo mkdir -p /opt/xiaoyu-laile && sudo chown xiaoyu:xiaoyu /opt/xiaoyu-laile
# 上传代码到 /opt/xiaoyu-laile，创建 .env
sudo cp /opt/xiaoyu-laile/deploy/xiaoyu-laile.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now xiaoyu-laile
sudo systemctl status xiaoyu-laile

# Nginx + 证书
sudo apt install -y nginx certbot python3-certbot-nginx
sudo cp /opt/xiaoyu-laile/deploy/nginx.conf /etc/nginx/sites-available/xiaoyu-laile
sudo ln -s /etc/nginx/sites-available/xiaoyu-laile /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d xiaoyu.你的域名.com --agree-tos -m 你的邮箱@example.com
```

---

## 四、Fly.io（不想管服务器）

```bash
# 安装 flyctl 并登录
fly auth login
cd xiaoyu-laile
fly launch --no-deploy            # 生成 fly.toml，选香港/新加坡区域（hkg / sin）

# 创建持久卷（数据必须落在卷上）
fly volumes create xiaoyu_data --size 3 --region hkg

# 在 fly.toml 里加：
#   [mounts]
#     source = "xiaoyu_data"
#     destination = "/app/data"
#   [env]
#     HOST = "0.0.0.0"
#     PORT = "8080"
#     DATA_DIR = "/app/data"
#   internal_port 改成 8080

fly secrets set SESSION_SECRET=$(openssl rand -hex 48)
fly secrets set PUBLIC_BASE_URL=https://你的应用名.fly.dev
fly deploy

# 绑自己的域名（可选，仍无提示页）
fly certs add xiaoyu.你的域名.com
```

> `fly.toml` 里 `internal_port` 用 8080 时需要把 `[env] PORT` 设成 8080，
> 或在 Dockerfile 里改 `ENV PORT=8080`。

---

## 五、数据与备份

所有业务数据都在 `data/` 目录：

```
data/
├── collections/        业务数据（每个集合一个 JSON）
├── uploads/            上传的图片 / 视频 / 文档
├── .secret             会话签名密钥
└── outbox.log          演示模式的邮件记录
```

**备份**（建议加进 crontab，每天一次）：

```bash
tar -czf /backup/xiaoyu-$(date +%F).tar.gz -C /opt/xiaoyu-laile deploy/data
# 只保留最近 14 天
find /backup -name 'xiaoyu-*.tar.gz' -mtime +14 -delete
```

**恢复**：把 `deploy/data` 解回原位，`docker compose restart app`。

**迁移到别的服务器**：整个 `data/` 拷过去即可，无需数据库迁移。

---

## 六、常见问题

**域名打不开 / 证书申请失败**
- 检查 A 记录是否已生效（`dig xiaoyu.你的域名.com`）
- 检查 80/443 是否放行（国内服务器还要确认已备案）
- `docker compose logs caddy` 看 ACME 报错

**国内服务器用域名访问被拦**
- 未备案。先去服务商备案，或用 IP + 端口临时访问调试。

**上传大文件失败**
- Caddy 默认不限大小；用 Nginx 要确认 `client_max_body_size 512m;`

**微信分享不显示缩略图**
- 需要在公众号后台把域名加入「JS 接口安全域名」，且域名必须备案 + HTTPS。

**换域名后分享链接还是旧域名**
- 改 `.env` 里的 `PUBLIC_BASE_URL`，然后 `docker compose up -d`（会重建容器）。

**想关掉演示数据**
- `.env` 设 `NO_SEED=1`，删除 `deploy/data/collections/*.json`，重启。

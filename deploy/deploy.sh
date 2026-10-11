#!/usr/bin/env bash
# ==========================================================================
# 小鱼来了 —— 一键部署（华为云 / 任意 Linux）
#
# 特点：本项目零 npm 依赖，只需要一个 Node 二进制，无需 Docker、无需 npm install。
#
# 用法（把发布包传到服务器后）：
#   tar -xzf xiaoyu-laile-release-*.tar.gz
#   cd xiaoyu-laile
#   sudo bash deploy/deploy.sh
#
# 非交互（推荐，一条命令搞定）：
#   sudo DOMAIN=xiaoyu.example.com ACME_EMAIL=you@example.com bash deploy/deploy.sh
#
# 参数：
#   DOMAIN=...        你的域名。留空则只启动服务，走 IP:8787 访问
#   ACME_EMAIL=...    申请 HTTPS 证书用的邮箱
#   PORT=8787         监听端口
#   SKIP_HTTPS=1      跳过 HTTPS 配置
#   NO_SEED=1         不写入演示数据（正式上线建议设为 1）
# ==========================================================================
set -euo pipefail

APP_NAME="xiaoyu-laile"
APP_DIR="/opt/${APP_NAME}"
SERVICE_NAME="xiaoyu-laile"
RUN_USER="xiaoyu"
PORT="${PORT:-8787}"
DOMAIN="${DOMAIN:-}"
ACME_EMAIL="${ACME_EMAIL:-}"
NODE_VERSION="${NODE_VERSION:-v20.18.0}"
SKIP_HTTPS="${SKIP_HTTPS:-0}"
NO_SEED="${NO_SEED:-0}"

RED=$'\033[31m'; GRN=$'\033[32m'; YEL=$'\033[33m'; CYN=$'\033[36m'; NC=$'\033[0m'
say()  { printf '%s==> %s%s\n' "$CYN" "$*" "$NC"; }
ok()   { printf '%s  ✓ %s%s\n' "$GRN" "$*" "$NC"; }
warn() { printf '%s  ! %s%s\n' "$YEL" "$*" "$NC"; }
die()  { printf '%s  ✗ %s%s\n' "$RED" "$*" "$NC" >&2; exit 1; }

# ------------------------------------------------------------------ 0. 前置检查
[ "$(id -u)" = "0" ] || die "请用 root 运行：sudo bash deploy/deploy.sh"

SRC_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
[ -f "$SRC_DIR/server.js" ] || die "找不到 server.js，请在项目根目录下运行本脚本"

say "部署目录：$APP_DIR"
say "监听端口：$PORT"
[ -n "$DOMAIN" ] && say "域名：$DOMAIN" || warn "未提供 DOMAIN，将只监听 IP:${PORT}"

# 识别包管理器
PKG=""
for p in apt-get dnf yum; do command -v "$p" >/dev/null 2>&1 && { PKG="$p"; break; }; done
[ -n "$PKG" ] || die "无法识别包管理器（apt/dnf/yum）"
ok "包管理器：$PKG"

# ------------------------------------------------------------------ 1. 安装 Node
install_node() {
  if command -v node >/dev/null 2>&1; then
    local v; v="$(node -v || true)"
    case "$v" in
      v1[89].*|v2[0-9].*) ok "已有 Node $v"; return 0 ;;
      *) warn "现有 Node $v 版本过低，将安装 $NODE_VERSION" ;;
    esac
  fi

  local arch tarball url
  arch="$(uname -m)"
  case "$arch" in
    x86_64|amd64) tarball="node-${NODE_VERSION}-linux-x64.tar.xz" ;;
    aarch64|arm64) tarball="node-${NODE_VERSION}-linux-arm64.tar.xz" ;;
    *) die "不支持的 CPU 架构：$arch" ;;
  esac

  say "安装 Node $NODE_VERSION（$arch）"
  for url in \
    "https://repo.huaweicloud.com/nodejs/${NODE_VERSION}/${tarball}" \
    "https://nodejs.org/dist/${NODE_VERSION}/${tarball}" \
    "https://mirrors.tuna.tsinghua.edu.cn/nodejs-release/${NODE_VERSION}/${tarball}"
  do
    say "  下载：$url"
    if curl -fsSL --connect-timeout 20 -o "/tmp/${tarball}" "$url"; then
      ok "下载成功"
      break
    fi
    warn "  该源不可用，换下一个"
  done
  [ -s "/tmp/${tarball}" ] || die "所有 Node 下载源都失败，请检查网络"

  tar -xJf "/tmp/${tarball}" -C /usr/local --strip-components=1
  rm -f "/tmp/${tarball}"
  command -v node >/dev/null 2>&1 || die "Node 安装失败"
  ok "Node $(node -v) 已安装到 /usr/local/bin/node"
}
install_node

# ------------------------------------------------------------------ 2. 创建运行用户
if ! id -u "$RUN_USER" >/dev/null 2>&1; then
  useradd -r -s /sbin/nologin -d "$APP_DIR" "$RUN_USER" 2>/dev/null \
    || useradd -r -s /bin/false -d "$APP_DIR" "$RUN_USER"
  ok "已创建系统用户 $RUN_USER"
else
  ok "用户 $RUN_USER 已存在"
fi

# ------------------------------------------------------------------ 3. 同步代码
say "同步代码到 $APP_DIR"
mkdir -p "$APP_DIR"
if [ "$SRC_DIR" != "$APP_DIR" ]; then
  # 保留已有数据目录
  if [ -d "$APP_DIR/data" ]; then
    mv "$APP_DIR/data" "/tmp/${APP_NAME}-data-backup" 2>/dev/null || true
  fi
  rm -rf "$APP_DIR"/*
  cp -r "$SRC_DIR"/. "$APP_DIR"/
  if [ -d "/tmp/${APP_NAME}-data-backup" ]; then
    rm -rf "$APP_DIR/data"
    mv "/tmp/${APP_NAME}-data-backup" "$APP_DIR/data"
    ok "已保留原有数据目录"
  fi
fi
mkdir -p "$APP_DIR/data"
ok "代码已就位"

# ------------------------------------------------------------------ 4. 生成 .env
if [ -f "$APP_DIR/.env" ]; then
  ok "已存在 .env，保留不覆盖"
else
  say "生成 .env"
  SECRET="$( (command -v openssl >/dev/null && openssl rand -hex 48) || head -c 48 /dev/urandom | od -An -tx1 | tr -d ' \n' )"
  cat > "$APP_DIR/.env" <<EOF
# 由 deploy.sh 于 $(date '+%F %T') 生成
APP_NAME=小鱼来了
APP_SLOGAN=让每一条好项目，都被对的人看见
HOST=0.0.0.0
PORT=${PORT}
DATA_DIR=${APP_DIR}/data
SESSION_SECRET=${SECRET}
$( [ -n "$DOMAIN" ] && echo "PUBLIC_BASE_URL=https://${DOMAIN}" || echo "PUBLIC_BASE_URL=" )
NO_SEED=${NO_SEED}

# ---------- 可选：接大模型 ----------
# AI_BASE_URL=https://api.deepseek.com/v1
# AI_MODEL=deepseek-chat
# AI_API_KEY=

# ---------- 可选：微信公众号 ----------
# WECHAT_APP_ID=
# WECHAT_APP_SECRET=
# WECHAT_TOKEN=
EOF
  ok "已生成 .env（会话密钥随机）"
fi

chown -R "$RUN_USER:$RUN_USER" "$APP_DIR"

# ------------------------------------------------------------------ 5. systemd
say "配置 systemd 服务"
NODE_BIN="$(command -v node)"
cat > "/etc/systemd/system/${SERVICE_NAME}.service" <<EOF
[Unit]
Description=小鱼来了 · AI 信息发布平台
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=${RUN_USER}
Group=${RUN_USER}
WorkingDirectory=${APP_DIR}
EnvironmentFile=${APP_DIR}/.env
ExecStart=${NODE_BIN} server.js
Restart=always
RestartSec=3
StandardOutput=append:/var/log/${SERVICE_NAME}.log
StandardError=append:/var/log/${SERVICE_NAME}.log
NoNewPrivileges=true
PrivateTmp=true
LimitNOFILE=65535

[Install]
WantedBy=multi-user.target
EOF

touch "/var/log/${SERVICE_NAME}.log"
chown "$RUN_USER:$RUN_USER" "/var/log/${SERVICE_NAME}.log"

systemctl daemon-reload
systemctl enable "$SERVICE_NAME" >/dev/null 2>&1 || true
systemctl restart "$SERVICE_NAME"
sleep 4

if systemctl is-active --quiet "$SERVICE_NAME"; then
  ok "服务已启动"
else
  die "服务启动失败，请查看：journalctl -u ${SERVICE_NAME} -n 50"
fi

# 本机自检
for i in $(seq 1 10); do
  if curl -fsS "http://127.0.0.1:${PORT}/api/health" >/dev/null 2>&1; then break; fi
  sleep 1
done
HEALTH="$(curl -fsS "http://127.0.0.1:${PORT}/api/health" || true)"
[ -n "$HEALTH" ] && ok "健康检查通过" || warn "健康检查未通过，请查看日志"

# ------------------------------------------------------------------ 6. 防火墙
say "检查防火墙"
if command -v firewall-cmd >/dev/null 2>&1 && systemctl is-active --quiet firewalld; then
  firewall-cmd --permanent --add-port=80/tcp >/dev/null 2>&1 || true
  firewall-cmd --permanent --add-port=443/tcp >/dev/null 2>&1 || true
  firewall-cmd --permanent --add-port="${PORT}/tcp" >/dev/null 2>&1 || true
  firewall-cmd --reload >/dev/null 2>&1 || true
  ok "firewalld 已放行 80/443/${PORT}"
elif command -v ufw >/dev/null 2>&1 && ufw status 2>/dev/null | grep -q active; then
  ufw allow 80/tcp >/dev/null 2>&1 || true
  ufw allow 443/tcp >/dev/null 2>&1 || true
  ufw allow "${PORT}/tcp" >/dev/null 2>&1 || true
  ok "ufw 已放行 80/443/${PORT}"
else
  warn "未检测到启用的本机防火墙（华为云还需在控制台『安全组』放行 80/443）"
fi
# SELinux：nginx 反代需要这个开关
if command -v getenforce >/dev/null 2>&1 && [ "$(getenforce)" = "Enforcing" ] && command -v setsebool >/dev/null 2>&1; then
  setsebool -P httpd_can_network_connect 1 2>/dev/null && ok "已允许 nginx 反向代理（SELinux）" || true
fi

# ------------------------------------------------------------------ 7. HTTPS（可选）
PUBLIC_URL=""
if [ -n "$DOMAIN" ] && [ "$SKIP_HTTPS" != "1" ]; then
  say "配置 Nginx + HTTPS（域名 $DOMAIN）"
  if [ "$PKG" = "apt-get" ]; then
    export DEBIAN_FRONTEND=noninteractive
    apt-get update -qq || true
    apt-get install -y -qq nginx certbot python3-certbot-nginx || warn "nginx/certbot 安装失败"
  else
    $PKG install -y -q nginx || warn "nginx 安装失败"
    $PKG install -y -q certbot python3-certbot-nginx 2>/dev/null \
      || { $PKG install -y -q epel-release 2>/dev/null && $PKG install -y -q certbot python3-certbot-nginx 2>/dev/null; } \
      || warn "certbot 安装失败（可稍后手工配置 HTTPS）"
  fi

  if command -v nginx >/dev/null 2>&1; then
    CONF_DIR="/etc/nginx/conf.d"
    [ -d /etc/nginx/sites-available ] && CONF_DIR="/etc/nginx/sites-available"
    cat > "${CONF_DIR}/${APP_NAME}.conf" <<EOF
server {
    listen 80;
    server_name ${DOMAIN};
    client_max_body_size 512m;
    location /.well-known/acme-challenge/ { root /var/www/html; }
    location / {
        proxy_pass http://127.0.0.1:${PORT};
        proxy_http_version 1.1;
        proxy_set_header Host              \$host;
        proxy_set_header X-Real-IP         \$remote_addr;
        proxy_set_header X-Forwarded-For   \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_set_header X-Forwarded-Host  \$host;
        proxy_buffering off;
        proxy_read_timeout 600s;
    }
}
EOF
    [ "$CONF_DIR" = "/etc/nginx/sites-available" ] && ln -sf "${CONF_DIR}/${APP_NAME}.conf" "/etc/nginx/sites-enabled/${APP_NAME}.conf"
    rm -f /etc/nginx/sites-enabled/default 2>/dev/null || true
    nginx -t >/dev/null 2>&1 && systemctl reload nginx && ok "Nginx 已配置" || warn "Nginx 配置检查失败"

    if command -v certbot >/dev/null 2>&1; then
      certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos \
        -m "${ACME_EMAIL:-admin@${DOMAIN}}" --redirect >/dev/null 2>&1 \
        && { ok "HTTPS 证书已签发并启用"; PUBLIC_URL="https://${DOMAIN}"; } \
        || warn "证书申请失败（域名是否已解析到本机？国内服务器是否已备案？）"
    else
      warn "未安装 certbot，暂时只有 HTTP；稍后可手工执行 certbot --nginx -d $DOMAIN"
    fi
  fi
fi

# ------------------------------------------------------------------ 8. 汇总
# 依次尝试：华为云元数据服务 → 通用回显服务
IP=""
for src in \
  "http://169.254.169.254/latest/meta-data/public-ipv4" \
  "https://api.ipify.org" \
  "https://ifconfig.me/ip"
do
  IP="$(curl -fsS --connect-timeout 4 "$src" 2>/dev/null | tr -d '[:space:]' || true)"
  case "$IP" in
    ''|*[!0-9.]*) IP="" ;;
  esac
  [ -n "$IP" ] && break
done
[ -z "$IP" ] && IP="你的服务器公网IP"
[ -z "$PUBLIC_URL" ] && PUBLIC_URL="http://${IP}:${PORT}"

cat <<EOF

$(printf '%s' "$GRN")========================================================
  小鱼来了 部署完成
========================================================$(printf '%s' "$NC")

  访问地址   ${PUBLIC_URL}
  本机地址   http://127.0.0.1:${PORT}
  服务状态   systemctl status ${SERVICE_NAME}
  实时日志   journalctl -u ${SERVICE_NAME} -f
  应用日志   tail -f /var/log/${SERVICE_NAME}.log
  配置文件   ${APP_DIR}/.env
  数据目录   ${APP_DIR}/data

  管理员账号 18800000000 / admin123456
  普通账号   13800001234 / demo123456
  （或任意手机号用验证码登录，演示模式验证码直接显示在页面上）

$(printf '%s' "$YEL")还需你确认：$(printf '%s' "$NC")
  1. 华为云控制台 → 安全组 → 放行 TCP 80 / 443${DOMAIN:+ / （可选）${PORT}}
  2. 域名 A 记录指向本机公网 IP：${IP}
$([ -n "$DOMAIN" ] || echo "  3. 想用域名 + HTTPS，请带上 DOMAIN=你的域名 重新运行本脚本")
$([ "$NO_SEED" = "1" ] || echo "  3. 当前写入了演示数据，正式上线请在 .env 里设 NO_SEED=1 并删除数据目录后重启")

  用法提示：
    改配置后重启   systemctl restart ${SERVICE_NAME}
    备份数据       tar -czf /root/xiaoyu-$(date +%F).tar.gz -C ${APP_DIR} data
    更新版本       重新解压发布包并重跑本脚本（数据目录会保留）

EOF

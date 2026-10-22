#!/bin/bash
# 小鱼来了 · 服务器部署脚本
set -e

APP_DIR=/opt/xiaoyu-laile
REPO=https://github.com/lucky0576/xiaoyu-laile.git
DOMAIN=xiaoyulaile.online

echo "=========================================="
echo " 1. 准备目录"
echo "=========================================="
mkdir -p "$APP_DIR"
cd "$APP_DIR"

if [ -d "$APP_DIR/.git" ]; then
  echo "  已存在仓库，拉取更新"
  git fetch origin && git reset --hard origin/main
else
  echo "  克隆仓库"
  git clone "$REPO" "$APP_DIR"
fi

echo "=========================================="
echo " 2. 创建数据目录"
echo "=========================================="
mkdir -p "$APP_DIR/data/collections" "$APP_DIR/data/uploads" "$APP_DIR/data/tmp"

echo "=========================================="
echo " 3. 写入 .env（若无）"
echo "=========================================="
if [ ! -f "$APP_DIR/.env" ]; then
  cat > "$APP_DIR/.env" <<'ENVEOF'
APP_NAME=小鱼来了
APP_SLOGAN=让每一条好项目，都被对的人看见
HOST=127.0.0.1
PORT=8787
PUBLIC_BASE_URL=https://xiaoyulaile.online
ENVEOF
  echo "  已创建默认 .env"
else
  echo "  .env 已存在，保留"
fi

echo "=========================================="
echo " 4. systemd 服务"
echo "=========================================="
cat > /etc/systemd/system/xiaoyu-laile.service <<'SVCEOF'
[Unit]
Description=Xiaoyu Laile Platform
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/opt/xiaoyu-laile
ExecStart=/usr/bin/node server.js --port 8787
Restart=always
RestartSec=5
StandardOutput=append:/var/log/xiaoyu-laile.log
StandardError=append:/var/log/xiaoyu-laile.log

[Install]
WantedBy=multi-user.target
SVCEOF

systemctl daemon-reload
systemctl enable xiaoyu-laile
systemctl restart xiaoyu-laile

echo "=========================================="
echo " 5. nginx 反向代理"
echo "=========================================="
cat > /etc/nginx/sites-available/xiaoyu-laile <<'NGXEOF'
server {
    listen 80;
    server_name xiaoyulaile.online www.xiaoyulaile.online;

    client_max_body_size 600M;
    proxy_read_timeout 600s;
    proxy_send_timeout 600s;

    location / {
        proxy_pass http://127.0.0.1:8787;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_buffering off;
    }
}
NGXEOF

ln -sf /etc/nginx/sites-available/xiaoyu-laile /etc/nginx/sites-enabled/xiaoyu-laile
rm -f /etc/nginx/sites-enabled/default
nginx -t
systemctl reload nginx

echo "=========================================="
echo " 6. 防火墙"
echo "=========================================="
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable

echo "=========================================="
echo " 7. 状态检查"
echo "=========================================="
sleep 3
systemctl is-active xiaoyu-laile
systemctl is-active nginx
echo "--- 本地健康检查 ---"
curl -s -m 10 http://127.0.0.1:8787/api/health || echo "  (健康检查失败)"
echo ""
echo "--- 对外健康检查 ---"
curl -s -m 10 http://127.0.0.1/api/health || echo "  (nginx 转发失败)"
echo ""
echo "DONE_DEPLOY"

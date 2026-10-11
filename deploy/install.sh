#!/usr/bin/env bash
# ==========================================================================
# 小鱼来了 —— 服务器一键安装（不需要 npm / docker / git）
#
# 用法（在服务器的终端里粘贴）：
#   curl -fsSL https://effort-gage-uni-loose.trycloudflare.com/_boot/install.sh -o /tmp/xyl.sh
#   sudo DOMAIN=你的域名 ACME_EMAIL=你的邮箱 bash /tmp/xyl.sh
#
# 暂时没有域名，只想先用 IP 访问：
#   sudo bash /tmp/xyl.sh
#
# 环境变量：
#   DOMAIN       你的域名（留空则只监听 IP:8787）
#   ACME_EMAIL   申请 HTTPS 证书的邮箱
#   PORT         监听端口，默认 8787
#   NO_SEED      默认 1（正式上线不写演示数据）
# ==========================================================================
set -euo pipefail

BASE="${BASE:-https://effort-gage-uni-loose.trycloudflare.com}"
WORK="/tmp/xyl-install"
PORT="${PORT:-8787}"
NO_SEED="${NO_SEED:-1}"

say() { printf '\033[36m==> %s\033[0m\n' "$*"; }
ok()  { printf '\033[32m  ok %s\033[0m\n' "$*"; }
die() { printf '\033[31m  x  %s\033[0m\n' "$*" >&2; exit 1; }

if [ "$(id -u)" != "0" ]; then
  die "请用 root 运行：sudo bash $0"
fi

command -v curl >/dev/null 2>&1 || die "缺少 curl，请先安装：apt-get install -y curl 或 yum install -y curl"
command -v tar  >/dev/null 2>&1 || die "缺少 tar"

say "系统信息"
ok "$( (. /etc/os-release 2>/dev/null && echo "$PRETTY_NAME") || uname -s )"
ok "架构 $(uname -m)"

say "下载发布包 ($BASE)"
rm -rf "$WORK"
mkdir -p "$WORK"
cd "$WORK"
curl -fsSL "$BASE/_boot/xiaoyu-laile-release.tar.gz" -o rel.tar.gz || die "下载失败，检查网络或地址"
ok "已下载 $(du -h rel.tar.gz | cut -f1)"

say "解压"
tar -xzf rel.tar.gz
[ -f xiaoyu-laile/server.js ] || die "压缩包结构异常，找不到 server.js"
cd xiaoyu-laile
ok "代码就绪：$(pwd)"

say "开始部署（DOMAIN='${DOMAIN:-}' PORT='$PORT' NO_SEED='$NO_SEED'）"
DOMAIN="${DOMAIN:-}" ACME_EMAIL="${ACME_EMAIL:-}" PORT="$PORT" NO_SEED="$NO_SEED" bash deploy/deploy.sh

say "部署完成"
if [ -n "${DOMAIN:-}" ]; then
  echo "  访问地址： https://$DOMAIN"
else
  IP="$(curl -fsS --max-time 5 ifconfig.me 2>/dev/null || echo '服务器公网IP')"
  echo "  访问地址： http://$IP:$PORT"
  echo "  （华为云安全组需要放行 $PORT 端口）"
fi
echo "  查看状态： systemctl status xiaoyu-laile"
echo "  查看日志： journalctl -u xiaoyu-laile -f"

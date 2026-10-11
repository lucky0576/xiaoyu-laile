#!/usr/bin/env bash
# ==========================================================================
# 小鱼来了 —— 服务器一键安装（不需要 npm / docker / git）
#
# 用法（在服务器的终端里粘贴）：
#   curl -fsSL -H "ngrok-skip-browser-warning: 1" \
#     https://unsneaky-electroballistic-rickie.ngrok-free.dev/_boot/install.sh -o /tmp/xyl.sh
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
#
# 说明：下载地址经 ngrok 转发。ngrok 免费版会给「浏览器」注入警告页，
# 但脚本请求只要带上 ngrok-skip-browser-warning 头就会被直接放行，
# 所以下面所有 curl 都带了这个头（对普通服务器无副作用）。
# ==========================================================================
set -euo pipefail

BASE="${BASE:-https://unsneaky-electroballistic-rickie.ngrok-free.dev}"
WORK="/tmp/xyl-install"
PORT="${PORT:-8787}"
NO_SEED="${NO_SEED:-1}"

# ngrok 免费版需要这个头才会放行脚本请求；其他服务器会忽略它
SKIP_HEADER="ngrok-skip-browser-warning: 1"

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
curl -fsSL -H "$SKIP_HEADER" --retry 3 --retry-delay 2 "$BASE/_boot/xiaoyu-laile-release.tar.gz" -o rel.tar.gz \
  || die "下载失败，检查网络或地址"
ok "已下载 $(du -h rel.tar.gz | cut -f1)"

# 下载到的可能是 ngrok 警告页而不是压缩包，必须校验魔数
if ! head -c 2 rel.tar.gz | od -An -tx1 | grep -q '1f 8b'; then
  head -c 300 rel.tar.gz || true
  die "下载到的不是 gzip 包（上面是内容开头）。请确认下载地址与跳过提示页的头是否正确。"
fi
ok "压缩包格式校验通过"

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

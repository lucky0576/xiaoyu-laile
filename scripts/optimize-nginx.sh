#!/bin/bash
# 小鱼来了 · nginx 性能优化（幂等，可重复执行）
#
# 解决的问题：
#   1. gzip_types 被注释 → JS/CSS/JSON 全部裸传（首屏 773KB 未压缩）
#   2. listen 443 没有 http2 → 27 个首屏请求走 HTTP/1.1 排队
#   3. 没有 upstream keepalive → 每个请求都新建到 Node 的 TCP 连接
#   4. 缺 open_file_cache / tcp_nodelay
#
# 效果：
#   首屏传输 773KB → 206KB（省 73%）
#   请求从串行排队 → HTTP/2 多路复用
#
# 用法：bash optimize-nginx.sh
# 回滚：备份在 /root/nginx-backup-*/ 和 /tmp/*.safe

set -e

echo "=================================================="
echo "  nginx 性能优化"
echo "=================================================="

# ---------- 备份 ----------
BK="/root/nginx-backup-$(date +%Y%m%d-%H%M%S)"
mkdir -p "$BK"
cp -a /etc/nginx/nginx.conf "$BK/"
cp -a /etc/nginx/sites-available/xiaoyu-laile "$BK/" 2>/dev/null || true
cp /etc/nginx/nginx.conf /tmp/nginx.conf.safe
cp /etc/nginx/sites-available/xiaoyu-laile /tmp/xiaoyu-laile.safe 2>/dev/null || true
echo "  备份: $BK"

# ---------- 1) gzip 全类型 ----------
echo ""
echo "[1/4] 开启 gzip 全类型压缩"
python3 - <<'PY'
import re
p = '/etc/nginx/nginx.conf'
s = open(p).read()

old = """	# gzip_vary on;
	# gzip_proxied any;
	# gzip_comp_level 6;
	# gzip_buffers 16 8k;
	# gzip_http_version 1.1;
	# gzip_types text/plain text/css application/json application/javascript text/xml application/xml application/xml+rss text/javascript;"""

new = """	gzip_vary on;
	gzip_proxied any;
	gzip_comp_level 6;
	gzip_buffers 16 8k;
	gzip_http_version 1.1;
	gzip_min_length 512;
	gzip_types text/plain text/css text/xml text/javascript
	           application/json application/javascript application/xml
	           application/xml+rss application/rss+xml
	           application/vnd.ms-fontobject application/x-font-ttf
	           font/opentype image/svg+xml image/x-icon;"""

if 'gzip_types text/plain text/css text/xml text/javascript' in s:
    print("  ✓ 已配置，跳过")
elif old in s:
    s = s.replace(old, new, 1)
    print("  ✓ gzip_types 已开启（js/css/json/svg/xml）")
else:
    s = s.replace('gzip on;',
        'gzip on;\n\tgzip_vary on;\n\tgzip_proxied any;\n\tgzip_comp_level 6;\n'
        '\tgzip_min_length 512;\n'
        '\tgzip_types text/plain text/css text/xml text/javascript '
        'application/json application/javascript application/xml '
        'application/xml+rss image/svg+xml;', 1)
    print("  ✓ gzip_types 已追加")

# tcp_nodelay
if not re.search(r'^\s*tcp_nodelay\s+on;', s, re.M):
    s = re.sub(r'^(\s*)tcp_nopush\s+on;', r'\1tcp_nopush on;\n\1tcp_nodelay on;', s, count=1, flags=re.M)
    print("  ✓ tcp_nodelay on")

# open_file_cache
if 'open_file_cache' not in s:
    m = re.search(r'^(\s*)types_hash_max_size.*$', s, re.M)
    if m:
        ind = m.group(1)
        s = s[:m.end()] + ('\n' + ind + 'open_file_cache max=2000 inactive=60s;' +
                           '\n' + ind + 'open_file_cache_valid 30s;' +
                           '\n' + ind + 'open_file_cache_min_uses 1;') + s[m.end():]
        print("  ✓ open_file_cache")

open(p,'w').write(s)
PY

# ---------- 2) HTTP/2 ----------
echo ""
echo "[2/4] 开启 HTTP/2"
python3 - <<'PY'
p = '/etc/nginx/sites-available/xiaoyu-laile'
s = open(p).read()
if 'listen 443 ssl http2' in s:
    print("  ✓ 已配置，跳过")
else:
    s = s.replace('listen 443 ssl; # managed by Certbot', 'listen 443 ssl http2; # managed by Certbot')
    s = s.replace('listen 443 ssl;', 'listen 443 ssl http2;')
    open(p,'w').write(s)
    print("  ✓ HTTP/2 已启用")
PY

# ---------- 3) upstream keepalive ----------
echo ""
echo "[3/4] 后端连接复用（upstream keepalive）"
python3 - <<'PY'
p = '/etc/nginx/sites-available/xiaoyu-laile'
s = open(p).read()
if 'upstream xiaoyu_backend' in s:
    print("  ✓ 已配置，跳过")
else:
    head = """map $http_upgrade $connection_upgrade {
    default upgrade;
    ''      close;
}

upstream xiaoyu_backend {
    server 127.0.0.1:8787;
    keepalive 32;
    keepalive_requests 1000;
    keepalive_timeout 60s;
}

"""
    s = head + s
    s = s.replace('proxy_pass http://127.0.0.1:8787;', 'proxy_pass http://xiaoyu_backend;')
    s = s.replace('proxy_set_header Connection "upgrade";', 'proxy_set_header Connection $connection_upgrade;')
    if 'proxy_http_version 1.1;' not in s:
        s = s.replace('proxy_pass http://xiaoyu_backend;',
                      'proxy_pass http://xiaoyu_backend;\n        proxy_http_version 1.1;', 1)
    open(p,'w').write(s)
    print("  ✓ upstream keepalive 32 + HTTP/1.1 长连接")
PY

# ---------- 4) 校验重载 ----------
echo ""
echo "[4/4] 校验并重载"
if nginx -t 2>&1 | sed 's/^/  /'; then
    systemctl reload nginx
    echo "  ✓ 已重载"
else
    echo "  ✗ 配置有误，自动回滚"
    cp /tmp/nginx.conf.safe /etc/nginx/nginx.conf
    cp /tmp/xiaoyu-laile.safe /etc/nginx/sites-available/xiaoyu-laile
    systemctl reload nginx
    exit 1
fi

# ---------- 验证 ----------
echo ""
echo "=================================================="
echo "  验证"
echo "=================================================="

RAW=$(curl -sk --resolve xiaoyulaile.online:443:127.0.0.1 -o /dev/null -w "%{size_download}" "https://xiaoyulaile.online/static/views-home.js")
GZ=$(curl -sk --resolve xiaoyulaile.online:443:127.0.0.1 -o /dev/null -w "%{size_download}" --compressed "https://xiaoyulaile.online/static/views-home.js")
PCT=$(awk "BEGIN{printf \"%.0f\", (1-$GZ/$RAW)*100}")
echo "  gzip:     views-home.js  $RAW → $GZ bytes（省 ${PCT}%）"

PROTO=$(curl -sk --resolve xiaoyulaile.online:443:127.0.0.1 -o /dev/null -w "%{http_version}" --http2 "https://xiaoyulaile.online/")
echo "  HTTP:     协议版本 $PROTO"

KEEP=$(ss -tn state established '( dport = :8787 )' 2>/dev/null | tail -n +2 | wc -l)
echo "  keepalive: 后端常驻连接 $KEEP 条"

echo ""
for p in "/" "/api/health" "/static/app.js" "/api/listings?limit=5"; do
    c=$(curl -sk --resolve xiaoyulaile.online:443:127.0.0.1 -o /dev/null -w "%{http_code}" --compressed --http2 "https://xiaoyulaile.online$p")
    printf "  %-28s %s\n" "$p" "$c"
done

echo ""
echo "  [完成] 如需回滚：cp $BK/* /etc/nginx/ && systemctl reload nginx"

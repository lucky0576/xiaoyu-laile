#!/bin/bash
# 远程重启服务并等待健康检查通过
# 由 scripts/deploy.ps1 调用

systemctl restart xiaoyu-laile

for i in $(seq 1 20); do
  sleep 1
  code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 2 http://127.0.0.1:8787/api/health 2>/dev/null)
  if [ "$code" = "200" ]; then
    echo "HEALTH_OK ${i}s"
    exit 0
  fi
done

echo "HEALTH_TIMEOUT"
systemctl status xiaoyu-laile --no-pager -n 15 2>&1 | tail -18
journalctl -u xiaoyu-laile -n 20 --no-pager 2>&1 | tail -20
exit 1

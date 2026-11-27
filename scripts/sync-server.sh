#!/bin/bash
# Sync /opt/xiaoyu-laile to origin/main safely.
# Untracked files (backups/, models/, data/, .env) are NOT touched by reset --hard.
set -uo pipefail

APP=/opt/xiaoyu-laile
STAMP=$(date +%Y%m%d-%H%M%S)
SAFE=/opt/sync-backup-$STAMP

cd "$APP" || { echo "FATAL: $APP missing"; exit 1; }

echo "===== 1) safety backup ====="
mkdir -p "$SAFE"
git rev-parse HEAD > "$SAFE/pre-sync-head.txt"
git status --porcelain > "$SAFE/pre-sync-status.txt"
git diff HEAD > "$SAFE/pre-sync-working.diff" 2>/dev/null || true
git diff --cached > "$SAFE/pre-sync-staged.diff" 2>/dev/null || true
[ -f .env ] && cp .env "$SAFE/env.bak"
echo "backup dir: $SAFE"
echo "pre-sync commit: $(cat "$SAFE/pre-sync-head.txt")"
echo "local changes: $(wc -l < "$SAFE/pre-sync-status.txt")"

echo ""
echo "===== 2) align working tree to origin/main ====="
git fetch origin 2>&1 | tail -2
TARGET=$(git rev-parse origin/main)
echo "target commit: $TARGET"
git reset --hard "$TARGET" 2>&1 | tail -2
echo "now at: $(git log --oneline -1)"

echo ""
echo "===== 3) verify critical files survived ====="
for p in data backups models .env; do
  if [ -e "$p" ]; then
    echo "  OK   $p ($(du -sh "$p" 2>/dev/null | cut -f1))"
  else
    echo "  MISS $p"
  fi
done

echo ""
echo "===== 4) restart service ====="
systemctl restart xiaoyu-laile 2>&1
OK=0
for i in $(seq 1 20); do
  sleep 1
  code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 2 http://127.0.0.1:8787/api/health 2>/dev/null)
  if [ "$code" = "200" ]; then
    echo "HEALTH_OK after ${i}s"
    OK=1
    break
  fi
done

if [ "$OK" != "1" ]; then
  echo "HEALTH_FAILED"
  journalctl -u xiaoyu-laile -n 30 --no-pager 2>/dev/null | tail -20
  exit 1
fi

echo ""
echo "===== 5) verify served CSS is circular ====="
curl -s --max-time 5 http://127.0.0.1:8787/static/bundle.css \
  | grep -A5 '^\.home-card \.art {' | head -6

echo ""
echo "===== 6) verify page loads ====="
curl -s -o /dev/null -w "  home: %{http_code}\n" --max-time 5 http://127.0.0.1:8787/

echo ""
echo "SYNC_DONE"

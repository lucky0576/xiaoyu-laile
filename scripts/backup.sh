#!/bin/bash
# 小鱼来了 · 自动备份脚本
#   daily  : 备份数据库(JSON) + 密钥 + 配置  → 体积小，每天跑
#   full   : 备份全部（含上传文件）           → 体积大，每周跑
# 用法：backup.sh daily | full

set -uo pipefail

APP_DIR=/opt/xiaoyu-laile
DATA_DIR="$APP_DIR/data"
BACKUP_DIR="$APP_DIR/backups"
LOG=/var/log/xyll-backup.log

DAV_BASE="https://dav.jianguoyun.com/dav/xyll-backup"
DAV_USER="5840932@qq.com"
DAV_PASS="afj9dr8mch3mr6pc"

KEEP_DAILY_LOCAL=7      # 本地保留天数
KEEP_DAILY_REMOTE=14    # 云端保留份数
KEEP_FULL_LOCAL=2       # 本地保留完整备份份数
KEEP_FULL_REMOTE=2      # 云端保留完整备份份数

MODE="${1:-daily}"
STAMP=$(date +%Y%m%d-%H%M)
mkdir -p "$BACKUP_DIR/daily" "$BACKUP_DIR/full"

log() { echo "$(date '+%Y-%m-%d %H:%M:%S')  $*" | tee -a "$LOG"; }

dav_put() {
  # $1=本地文件  $2=云端子目录
  local f="$1" sub="$2"
  local name
  name=$(basename "$f")
  dav_mkdir "$sub"
  local code
  code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 900 \
    -T "$f" -u "$DAV_USER:$DAV_PASS" "$DAV_BASE/$sub/$name")
  log "  上传 $sub/$name -> HTTP $code"
  [ "$code" = "201" ] || [ "$code" = "204" ] || [ "$code" = "200" ]
}

dav_mkdir() {
  # 幂等：目录已存在时 WebDAV 返回 405，属正常
  curl -s -o /dev/null -X MKCOL -u "$DAV_USER:$DAV_PASS" "$DAV_BASE/$1/" 2>/dev/null
}

dav_list() {
  # $1=云端子目录  → 输出文件名列表（按名字排序）
  curl -s -X PROPFIND -u "$DAV_USER:$DAV_PASS" -H "Depth: 1" "$DAV_BASE/$1/" 2>/dev/null \
    | grep -o '<d:href>[^<]*</d:href>' \
    | sed 's#<d:href>.*/##; s#</d:href>##' \
    | grep -v '^$'
}

dav_delete() {
  curl -s -o /dev/null -w '%{http_code}' -X DELETE -u "$DAV_USER:$DAV_PASS" "$DAV_BASE/$1"
}

# ============================================================ daily
do_daily() {
  local out="$BACKUP_DIR/daily/xyll-db-$STAMP.tar.gz"
  log "===== DAILY 开始 ($STAMP) ====="

  tar -czf "$out" -C "$APP_DIR" \
    data/collections \
    data/.secret \
    .env 2>/dev/null

  if [ ! -f "$out" ]; then log "  ✗ 打包失败"; return 1; fi
  log "  打包完成: $(du -h "$out" | cut -f1)"

  if dav_put "$out" "daily"; then log "  ✓ 云端上传成功"; else log "  ✗ 云端上传失败"; fi

  # 本地清理
  find "$BACKUP_DIR/daily" -name 'xyll-db-*.tar.gz' -mtime +$KEEP_DAILY_LOCAL -delete 2>/dev/null

  # 云端清理（保留最新 N 份）
  local files
  files=$(dav_list daily | grep '^xyll-db-.*\.tar\.gz$' | sort)
  local cnt
  cnt=$(echo "$files" | grep -c . || true)
  if [ "$cnt" -gt "$KEEP_DAILY_REMOTE" ]; then
    echo "$files" | head -n $((cnt - KEEP_DAILY_REMOTE)) | while read -r old; do
      [ -n "$old" ] && log "  删除云端旧备份: $old -> $(dav_delete "daily/$old")"
    done
  fi

  log "===== DAILY 结束：本地 $(ls -1 "$BACKUP_DIR/daily" | wc -l) 份 ====="
}

# ============================================================ full
do_full() {
  local out="$BACKUP_DIR/full/xyll-full-$STAMP.tar.gz"
  log "===== FULL 开始 ($STAMP) ====="

  tar -czf "$out" -C "$APP_DIR" \
    --exclude='data/tmp' \
    --exclude='data/uploads/tmp' \
    data 2>/dev/null

  if [ ! -f "$out" ]; then log "  ✗ 打包失败"; return 1; fi
  log "  打包完成: $(du -h "$out" | cut -f1)"

  if dav_put "$out" "full"; then log "  ✓ 云端上传成功"; else log "  ✗ 云端上传失败"; fi

  # 本地保留最新 N 份（按时间倒序，删掉第 N+1 份及以后）
  ls -1t "$BACKUP_DIR/full"/xyll-full-*.tar.gz 2>/dev/null \
    | tail -n +$((KEEP_FULL_LOCAL + 1)) \
    | while read -r old; do [ -n "$old" ] && rm -f "$old" && log "  删除本地旧完整备份: $(basename "$old")"; done

  local files cnt
  files=$(dav_list full | grep '^xyll-full-.*\.tar\.gz$' | sort)
  cnt=$(echo "$files" | grep -c . || true)
  if [ "$cnt" -gt "$KEEP_FULL_REMOTE" ]; then
    echo "$files" | head -n $((cnt - KEEP_FULL_REMOTE)) | while read -r old; do
      [ -n "$old" ] && log "  删除云端旧完整备份: $old -> $(dav_delete "full/$old")"
    done
  fi

  log "===== FULL 结束 ====="
}

case "$MODE" in
  daily) do_daily ;;
  full)  do_full ;;
  *) echo "用法: $0 daily|full"; exit 2 ;;
esac

#!/bin/bash
# 小鱼来了 · 自动备份脚本
#   daily  : 备份数据库(JSON) + 密钥 + 配置  → 体积小，每天跑
#   full   : 备份全部（含上传文件）           → 体积大，每周跑
# 用法：backup.sh daily | full
#
# --------------------------------------------------------------------
# 云端备份开关（2026-11 改为默认关闭）
#
#   之前默认往「坚果云 WebDAV」上传。用户已停用坚果云，
#   因此默认改为**纯本地备份**，不依赖任何云服务。
#
#   想恢复云端上传：
#     XYLL_BACKUP_REMOTE=jianguoyun ./backup.sh daily
#   或在 /opt/xiaoyu-laile/.env 里写一行：
#     XYLL_BACKUP_REMOTE=jianguoyun
#     XYLL_DAV_USER=...
#     XYLL_DAV_PASS=...
#
#   注意：云端上传失败**不影响**本地备份成功，
#   以前是「云端失败整轮算失败」，容易误判。
# --------------------------------------------------------------------

set -uo pipefail

APP_DIR=/opt/xiaoyu-laile
DATA_DIR="$APP_DIR/data"
BACKUP_DIR="$APP_DIR/backups"
LOG=/var/log/xyll-backup.log

# 读取 .env 里的可选配置（不覆盖已存在的环境变量）
if [ -f "$APP_DIR/.env" ]; then
  while IFS='=' read -r k v; do
    case "$k" in
      XYLL_BACKUP_REMOTE|XYLL_DAV_USER|XYLL_DAV_PASS|XYLL_DAV_BASE)
        [ -z "${!k:-}" ] && export "$k=$v"
        ;;
    esac
  done < <(grep -E '^XYLL_(BACKUP_REMOTE|DAV_USER|DAV_PASS|DAV_BASE)=' "$APP_DIR/.env" 2>/dev/null)
fi

REMOTE="${XYLL_BACKUP_REMOTE:-off}"          # off | jianguoyun
DAV_BASE="${XYLL_DAV_BASE:-https://dav.jianguoyun.com/dav/xyll-backup}"
DAV_USER="${XYLL_DAV_USER:-}"
DAV_PASS="${XYLL_DAV_PASS:-}"

# 本地保留：没有云端冗余了，本地多留几天
KEEP_DAILY_LOCAL=14     # 本地保留天数
KEEP_FULL_LOCAL=3       # 本地保留完整备份份数
KEEP_DAILY_REMOTE=14    # 云端保留份数
KEEP_FULL_REMOTE=2      # 云端保留完整备份份数

MODE="${1:-daily}"
STAMP=$(date +%Y%m%d-%H%M)
mkdir -p "$BACKUP_DIR/daily" "$BACKUP_DIR/full"

log() { echo "$(date '+%Y-%m-%d %H:%M:%S')  $*" | tee -a "$LOG"; }

# 云端是否可用（开关打开 + 凭据齐全）
remote_on() {
  [ "$REMOTE" = "off" ] && return 1
  [ -z "$DAV_USER" ] || [ -z "$DAV_PASS" ] && return 1
  return 0
}

dav_mkdir() {
  # 幂等：目录已存在时 WebDAV 返回 405，属正常
  curl -s -o /dev/null -X MKCOL -u "$DAV_USER:$DAV_PASS" "$DAV_BASE/$1/" 2>/dev/null
}

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

dav_list() {
  curl -s -X PROPFIND -u "$DAV_USER:$DAV_PASS" -H "Depth: 1" "$DAV_BASE/$1/" 2>/dev/null \
    | grep -o '<d:href>[^<]*</d:href>' \
    | sed 's#<d:href>.*/##; s#</d:href>##' \
    | grep -v '^$'
}

dav_delete() {
  curl -s -o /dev/null -w '%{http_code}' -X DELETE -u "$DAV_USER:$DAV_PASS" "$DAV_BASE/$1"
}

# 云端上传 + 清理（失败只记日志，不影响本地备份结果）
remote_sync() {
  local f="$1" sub="$2" keep="$3" prefix="$4"
  if ! remote_on; then
    log "  云端备份已关闭（纯本地模式）"
    return 0
  fi
  if dav_put "$f" "$sub"; then
    log "  ✓ 云端上传成功"
  else
    log "  ! 云端上传失败（本地备份仍然有效）"
  fi
  local files cnt
  files=$(dav_list "$sub" | grep "^$prefix.*\.tar\.gz$" | sort)
  cnt=$(echo "$files" | grep -c . || true)
  if [ "${cnt:-0}" -gt "$keep" ]; then
    echo "$files" | head -n $((cnt - keep)) | while read -r old; do
      [ -n "$old" ] && log "  删除云端旧备份: $old -> $(dav_delete "$sub/$old")"
    done
  fi
}

# ============================================================ daily
do_daily() {
  local out="$BACKUP_DIR/daily/xyll-db-$STAMP.tar.gz"
  log "===== DAILY 开始 ($STAMP)  模式=$MODE  云端=$REMOTE ====="

  tar -czf "$out" -C "$APP_DIR" \
    data/collections \
    data/.secret \
    .env 2>/dev/null

  if [ ! -f "$out" ]; then log "  ✗ 打包失败"; return 1; fi
  log "  打包完成: $(du -h "$out" | cut -f1)"

  remote_sync "$out" "daily" "$KEEP_DAILY_REMOTE" "xyll-db-"

  find "$BACKUP_DIR/daily" -name 'xyll-db-*.tar.gz' -mtime +$KEEP_DAILY_LOCAL -delete 2>/dev/null

  log "===== DAILY 结束：本地 $(ls -1 "$BACKUP_DIR/daily" | wc -l) 份 ====="
}

# ============================================================ full
do_full() {
  local out="$BACKUP_DIR/full/xyll-full-$STAMP.tar.gz"
  log "===== FULL 开始 ($STAMP)  模式=$MODE  云端=$REMOTE ====="

  tar -czf "$out" -C "$APP_DIR" \
    --exclude='data/tmp' \
    --exclude='data/uploads/tmp' \
    data 2>/dev/null

  if [ ! -f "$out" ]; then log "  ✗ 打包失败"; return 1; fi
  log "  打包完成: $(du -h "$out" | cut -f1)"

  remote_sync "$out" "full" "$KEEP_FULL_REMOTE" "xyll-full-"

  # 本地保留最新 N 份
  ls -1t "$BACKUP_DIR/full"/xyll-full-*.tar.gz 2>/dev/null \
    | tail -n +$((KEEP_FULL_LOCAL + 1)) \
    | while read -r old; do [ -n "$old" ] && rm -f "$old" && log "  删除本地旧完整备份: $(basename "$old")"; done

  log "===== FULL 结束：本地 $(ls -1 "$BACKUP_DIR/full" | wc -l) 份 ====="
}

case "$MODE" in
  daily) do_daily ;;
  full)  do_full ;;
  *) echo "用法: $0 daily|full"; exit 2 ;;
esac

#!/bin/bash
# ????????
# ??????540?CRF 30?maxrate 800k?AAC 64k ????faststart
# ??????????????? ~200 KB/s (1.6 Mbps)?
#       800 kbps ?? 2 ???????????
set -u
cd /opt/xiaoyu-laile
LOG=/var/log/xyll-transcode.log
THRESHOLD=${1:-900000}   # ?????????
echo "=== ?? $(date)  ?? ${THRESHOLD} bps ===" >> $LOG

find data/uploads -name "*.mp4" -size +100k 2>/dev/null | while read f; do
  INFO=$(ffprobe -v error -select_streams v:0 -show_entries stream=width,height,duration,bit_rate -of csv=p=0 "$f" 2>/dev/null)
  W=$(echo "$INFO"|cut -d, -f1); H=$(echo "$INFO"|cut -d, -f2)
  DUR=$(echo "$INFO"|cut -d, -f3); BR=$(echo "$INFO"|cut -d, -f4)
  [ -z "$W" ] && continue
  [ -z "$BR" ] && BR=0
  SIZE=$(stat -c%s "$f")
  DURINT=${DUR%.*}
  EST=0
  [ -n "$DURINT" ] && [ "$DURINT" -gt 0 ] 2>/dev/null && EST=$(( SIZE * 8 / DURINT ))
  TARGET=$BR
  [ "$EST" -gt "$TARGET" ] && TARGET=$EST

  if [ "$TARGET" -gt "$THRESHOLD" ]; then
    TMP="/tmp/tc-$(basename $f)"
    echo "  ?? $(basename $f)  ${W}x${H}  $((TARGET/1000))kbps  $((SIZE/1024/1024))MB" >> $LOG
    if ffmpeg -y -i "$f" \
        -c:v libx264 -crf 30 -preset veryfast -profile:v main -level 3.1 \
        -maxrate 800k -bufsize 1600k \
        -vf "scale='min(540,iw)':-2" \
        -c:a aac -b:a 64k -ac 1 \
        -movflags +faststart -f mp4 "$TMP" \
        -loglevel error -nostdin < /dev/null 2>>$LOG; then
      if [ -s "$TMP" ]; then
        NEW=$(stat -c%s "$TMP")
        mv "$TMP" "$f"
        echo "    OK $((SIZE/1024/1024))MB -> $((NEW/1024/1024))MB" >> $LOG
      else
        rm -f "$TMP"; echo "    FAIL ???" >> $LOG
      fi
    else
      rm -f "$TMP"; echo "    FAIL ffmpeg" >> $LOG
    fi
  else
    echo "  ?? $(basename $f)  $((TARGET/1000))kbps" >> $LOG
  fi
done
echo "=== ?? $(date) ===" >> $LOG

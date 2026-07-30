#!/usr/bin/env bash
# probe-media-ffmpeg-stderr.sh — run the app's EXACT ffmpeg argument vector against a
# pre-made fifo (as FfmpegVideoSource does) with stdin closed, and show ffmpeg's stderr.
# Run: bash tmp/probe-media-ffmpeg-stderr.sh
# Reading: if stderr shows an overwrite refusal, the missing -y flag is the defect.
set -u
d=$(mktemp -d /tmp/invar-media-probe-XXXXXX)
mkfifo "$d/video.rgba"
# Open the fifo read side nonblocking so ffmpeg's open() cannot block, mirroring O_RDWR|O_NONBLOCK.
exec 9<>"$d/video.rgba"
ffmpeg -hide_banner -loglevel error -f lavfi -i 'testsrc2=size=120x48:rate=15' \
  -an -threads 1 -pix_fmt rgba -f rawvideo "$d/video.rgba" </dev/null 2>"$d/stderr.txt" &
ffmpeg_pid=$!
sleep 2
if kill -0 "$ffmpeg_pid" 2>/dev/null; then
  echo "ffmpeg still running after 2s (no early exit)"
  kill "$ffmpeg_pid"
else
  wait "$ffmpeg_pid"
  echo "ffmpeg exited early with status $?"
fi
echo "--- stderr ---"
cat "$d/stderr.txt"
exec 9<&- 9>&-
rm -rf "$d"

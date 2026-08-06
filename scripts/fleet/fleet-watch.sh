#!/usr/bin/env bash
# fleet-watch.sh — the ONE standing watcher the conductor arms as a persistent Monitor.
#
# WHY ONE WATCHER, NOT ONE PER DISPATCH
#
# Monitors are session state. They die with the session, and a per-dispatch monitor
# must be remembered at dispatch time and re-armed after every interrupt — two chances
# to forget. This script derives its watch set FROM DISK every cycle, so a new
# dispatch enters the watch automatically (its task folder is the dispatch commit),
# and recovery after an interrupt is ONE action:
#
#   Monitor(command: "bash scripts/fleet/fleet-watch.sh", persistent: true)
#
# The reconciliation sweep re-arms it when TaskList shows no fleet-watch monitor.
#
# EVENTS (one line each; the Monitor turns each into a notification):
#   READY: <path>            a new /tmp/*-READY*.md appeared (stamped .seen once reported)
#   SILENT: #<n> <slug>      an in-progress task's transcript is silent > SILENT_MINUTES
#                            while its tmux session is gone (builder likely died)
#   GATE_DONE: <log> <line>  a watched gate log reached its GATE_EXIT sentinel
#   SPRAWL: <reason>         the filesystem is filling faster than any healthy run fills it,
#                            or free space fell under the floor. Born from the night the
#                            agent-sdk import leaked 131 x 200MB per gate run (#244) and the
#                            disk hit 100% twice before damage was visible in any lens.
#
# THE HEARTBEAT. Every cycle stamps /tmp/fleet-watch.heartbeat. dispatch.sh REFUSES to
# launch a builder while the stamp is stale (>3 minutes) — a builder must never run
# unwatched. Arming is ONE idempotent action (this script derives its whole watch set
# from disk, so re-arming after an interrupt never duplicates anything):
#
#   Monitor(command: "bash scripts/fleet/fleet-watch.sh", persistent: true)
#
# Self-test: fleet-watch.sh --self-test builds a sandbox and requires each event to
# fire (present arm) and a clean sandbox to stay silent (absent arm).

set -euo pipefail

repository_root="$(cd "$(dirname "$0")/../.." && pwd)"
tasks_in_progress="${repository_root}/.invar/tasks/in-progress"
transcripts_directory="${repository_root}/tmp/transcripts"
SILENT_MINUTES="${SILENT_MINUTES:-20}"
CYCLE_SECONDS="${CYCLE_SECONDS:-30}"
SPRAWL_FLOOR_GB="${SPRAWL_FLOOR_GB:-10}"
# Rate calibration (both arms, deliberately): the #244 leak measured ~1.3G per 30s
# cycle; a healthy gate churns hundreds of MB; a worktree bun install can spike ~500MB
# in one cycle. The single-cycle bar sits at 600MB — just above the biggest healthy
# spike — and the SUSTAINED arm (2G across a 5-minute window) catches slow leaks that
# never spike at all. The 5m throttle plus named-growers analysis makes a rare false
# alarm cost one dismissable notification; a missed leak costs the disk.
SPRAWL_RATE_MB="${SPRAWL_RATE_MB:-600}"
SPRAWL_WINDOW_SAMPLES="${SPRAWL_WINDOW_SAMPLES:-10}"
SPRAWL_WINDOW_GB="${SPRAWL_WINDOW_GB:-2}"
SPRAWL_HISTORY_FILE="${SPRAWL_HISTORY_FILE:-/tmp/fleet-watch-disk.history}"
SPRAWL_ENTRY_RATE="${SPRAWL_ENTRY_RATE:-300}"
SPRAWL_THROTTLE_MINUTES="${SPRAWL_THROTTLE_MINUTES:-5}"
SPRAWL_STATE_FILE="${SPRAWL_STATE_FILE:-/tmp/fleet-watch-disk.prev}"
SPRAWL_THROTTLE_STAMP="${SPRAWL_THROTTLE_STAMP:-/tmp/fleet-watch-sprawl.throttle}"
HEARTBEAT_FILE="${HEARTBEAT_FILE:-/tmp/fleet-watch.heartbeat}"

# Pending steers: steer.sh hands off composer-clear-but-unconfirmed steers as
# /tmp/steer-pending-* markers. Confirm each against the builder's own session
# record (append LANDED to the task's steers.log, drop the marker), or raise
# STEER_LOST once when a marker outlives the grace window unconfirmed. Only
# CONFIRMED steers are ever logged — an attempts-log is a deceptive metric.
STEER_LOST_MINUTES="${STEER_LOST_MINUTES:-15}"
emit_steer_events() {
  local marker fragment task_directory session_name message marker_age_minutes record_file
  for marker in /tmp/steer-pending-*; do
    [ -f "$marker" ] || continue
    case "$marker" in *.lost) continue ;; esac
    fragment="$(sed -n 's/^fragment=//p' "$marker")"
    fragment="${fragment# }"; fragment="${fragment% }"
    task_directory="$(sed -n 's/^task_directory=//p' "$marker")"
    session_name="$(sed -n 's/^session_name=//p' "$marker")"
    message="$(sed -n 's/^message=//p' "$marker")"
    record_file=""
    if [ -n "$session_name" ] && tmux has-session -t "$session_name" 2>/dev/null; then
      local cwd f
      cwd="$(tmux display-message -t "$session_name" -p '#{pane_current_path}' 2>/dev/null)"
      if [ -n "$cwd" ]; then
        for f in $(ls -1t "$HOME"/.codex/sessions/*/*/*/rollout-*.jsonl 2>/dev/null | head -40); do
          head -c 2048 "$f" 2>/dev/null | grep -qF "\"cwd\":\"$cwd\"" && { record_file="$f"; break; }
        done
      fi
    fi
    [ -z "$record_file" ] && record_file="$(ls -t "$HOME"/.claude/projects/*"$(basename "$task_directory")"*/*.jsonl 2>/dev/null | head -1)"
    if [ -n "$record_file" ] && [ -n "$fragment" ] && grep -qF -- "$fragment" "$record_file" 2>/dev/null; then
      printf '%s LANDED %s\n' "$(date '+%F %T')" "$message" >> "${task_directory}/steers.log"
      rm -f "$marker"
      continue
    fi
    marker_age_minutes="$(( ( $(date +%s) - $(stat -c %Y "$marker") ) / 60 ))"
    if [ "$marker_age_minutes" -ge "$STEER_LOST_MINUTES" ]; then
      echo "STEER_LOST: ${session_name} — steer unconfirmed in the session record after ${marker_age_minutes}m: ${message}"
      mv "$marker" "${marker}.lost"
    fi
  done
}

emit_ready_events() {
  local ready_file
  for ready_file in /tmp/*-READY*.md; do
    [ -e "$ready_file" ] || continue
    if [ ! -f "${ready_file}.seen" ]; then
      echo "READY: ${ready_file}"
      touch "${ready_file}.seen"
    fi
  done
}

# Reports are now born in the task folder (dispatch.sh points builders there).
# The /tmp glob above stays for the transition and for fallback reports.
emit_folder_report_events() {
  [ -d "$tasks_in_progress" ] || return 0
  local task_folder folder_name report_file content_hash stamp
  for task_folder in "$tasks_in_progress"/*/; do
    [ -d "$task_folder" ] || continue
    folder_name="$(basename "$task_folder")"
    for report_file in "$task_folder"report-*; do
      [ -e "$report_file" ] || continue
      # Stamp by CONTENT, not filename: a builder steered to re-gate REWRITES
      # its report in place — same name, new verdict. A filename stamp went
      # blind to #300's re-gate and #326's revision on 2026-07-29; the user
      # caught both by attaching (the human as fallback instrument). A changed
      # report is a new event.
      content_hash="$(md5sum "$report_file" | cut -c1-12)"
      stamp="/tmp/fleet-watch-report-${folder_name}-$(basename "$report_file").${content_hash}.seen"
      if [ ! -f "$stamp" ]; then
        echo "READY: ${report_file}"
        touch "$stamp"
      fi
    done
  done
}

emit_silent_events() {
  [ -d "$tasks_in_progress" ] || return 0
  local task_folder folder_name transcript recent
  for task_folder in "$tasks_in_progress"/*/; do
    [ -d "$task_folder" ] || continue
    folder_name="$(basename "$task_folder")"
    # A delivered report means idle-by-design; silence is then expected, not a death.
    ls "$task_folder"report-* >/dev/null 2>&1 && continue
    # `|| true` is load-bearing under set -euo pipefail: a matchless glob makes
    # ls exit 2, which killed the whole watcher twice on 2026-07-29 — each time
    # a cycle caught a freshly dispatched folder before its transcript existed.
    transcript="$(ls "$transcripts_directory"/transcript-*-"$folder_name".md 2>/dev/null | head -1 || true)"
    [ -n "$transcript" ] || continue
    recent="$(find "$transcript" -mmin "-${SILENT_MINUTES}" 2>/dev/null || true)"
    if [ -z "$recent" ]; then
      # Two distinct events. DEAD: the session is gone, the builder cannot recover
      # on its own. QUIET: the session lives but nothing is written — a hang, a
      # stuck composer, or a very long quiet tool run; the conductor peeks before
      # judging. A hang with a live session was invisible under the old
      # session-gone-only condition.
      if ! tmux has-session -t "invar/${folder_name}" 2>/dev/null; then
        if [ ! -f "/tmp/fleet-watch-dead-${folder_name}.seen" ]; then
          echo "DEAD: ${folder_name} — transcript quiet >${SILENT_MINUTES}m and no tmux session"
          touch "/tmp/fleet-watch-dead-${folder_name}.seen"
        fi
      else
        if [ ! -f "/tmp/fleet-watch-quiet-${folder_name}.seen" ]; then
          echo "QUIET: ${folder_name} — session alive, transcript quiet >${SILENT_MINUTES}m; peek before judging"
        touch "/tmp/fleet-watch-quiet-${folder_name}.seen"
        fi
      fi
    else
      # Output resumed: clear the quiet stamp so a LATER quiet period fires again.
      rm -f "/tmp/fleet-watch-quiet-${folder_name}.seen"
    fi
  done
}

emit_gate_events() {
  # Any file may register a gate log by writing its path into /tmp/fleet-watch-gates
  # (one path per line). The sentinel is the gate's own GATE_EXIT line.
  [ -f /tmp/fleet-watch-gates ] || return 0
  local gate_log sentinel
  while IFS= read -r gate_log; do
    [ -f "$gate_log" ] || continue
    sentinel="$(grep -m1 "GATE_EXIT=" "$gate_log" 2>/dev/null || true)"
    if [ -n "$sentinel" ] && [ ! -f "${gate_log}.reported" ]; then
      echo "GATE_DONE: ${gate_log} ${sentinel}"
      touch "${gate_log}.reported"
    fi
  done < /tmp/fleet-watch-gates
}

# THE SENTINEL ANALYZES; IT NEVER DELETES. A monitor that removes files it does not
# own will one day remove a project it does not know. On a breach it names the top
# recent growers so the responder can kill the GROWTH SOURCE (a leaking process, a
# runaway loop) or sweep a pattern the fleet provably owns — and nothing else.
sample_disk_available_kb() { df -Pk / | awk 'NR==2 {print $4}'; }
sample_tmp_entry_count() { ls -A /tmp 2>/dev/null | wc -l | tr -d ' '; }

describe_top_growers() {
  # Only runs on a breach (bounded cost): the five largest /tmp entries touched
  # in the last ten minutes, sizes included — analysis, never action.
  find /tmp -maxdepth 1 -mmin -10 2>/dev/null | head -200 | xargs -r du -s 2>/dev/null \
    | sort -rn | head -5 | awk '{printf "    %.1fMB %s\n", $1/1024, $2}'
}

emit_sprawl_events() {
  local available_kb entry_count previous_kb="" previous_entries=""
  available_kb="${SPRAWL_TEST_AVAIL_KB:-$(sample_disk_available_kb)}"
  entry_count="${SPRAWL_TEST_ENTRY_COUNT:-$(sample_tmp_entry_count)}"
  [ -f "$SPRAWL_STATE_FILE" ] && read -r previous_kb previous_entries < "$SPRAWL_STATE_FILE"
  echo "${available_kb} ${entry_count}" > "$SPRAWL_STATE_FILE"

  # The sustained window: a rolling file of the last N samples. The oldest sample
  # anchors the window; the drop across it catches slow leaks no single cycle shows.
  local window_anchor_kb=""
  if [ -f "$SPRAWL_HISTORY_FILE" ]; then
    window_anchor_kb="$(head -1 "$SPRAWL_HISTORY_FILE")"
  fi
  { [ -f "$SPRAWL_HISTORY_FILE" ] && tail -n "$((SPRAWL_WINDOW_SAMPLES - 1))" "$SPRAWL_HISTORY_FILE"; echo "$available_kb"; } > "${SPRAWL_HISTORY_FILE}.next"
  mv "${SPRAWL_HISTORY_FILE}.next" "$SPRAWL_HISTORY_FILE"

  # One alert per throttle window: a sustained fill must not shout every cycle.
  if [ -n "$(find "$SPRAWL_THROTTLE_STAMP" -mmin "-${SPRAWL_THROTTLE_MINUTES}" 2>/dev/null)" ]; then
    return 0
  fi

  local floor_kb=$((SPRAWL_FLOOR_GB * 1024 * 1024))
  local rate_kb=$((SPRAWL_RATE_MB * 1024))
  local reasons=""
  if [ "$available_kb" -lt "$floor_kb" ]; then
    # A STANDING floor breach repeats only when the whole-GB tier DROPS.
    # A steady 7G-free condition already alerted; re-alerting every window
    # tells the conductor nothing and costs a wake each time. The tier
    # stamp resets when free space recovers above the floor.
    local free_gb=$((available_kb / 1024 / 1024))
    local last_tier=""
    [ -f "${SPRAWL_THROTTLE_STAMP}.tier" ] && last_tier="$(cat "${SPRAWL_THROTTLE_STAMP}.tier" 2>/dev/null)"
    if [ -z "$last_tier" ] || [ "$free_gb" -lt "$last_tier" ]; then
      reasons="disk floor breached: ${free_gb}G free < ${SPRAWL_FLOOR_GB}G"
      echo "$free_gb" > "${SPRAWL_THROTTLE_STAMP}.tier"
    fi
  else
    rm -f "${SPRAWL_THROTTLE_STAMP}.tier"
  fi
  if [ -n "$previous_kb" ] && [ $((previous_kb - available_kb)) -gt "$rate_kb" ]; then
    reasons="${reasons:+${reasons}; }rapid fill: $(((previous_kb - available_kb) / 1024))MB consumed in one cycle"
  fi
  if [ -n "$previous_entries" ] && [ $((entry_count - previous_entries)) -gt "$SPRAWL_ENTRY_RATE" ]; then
    reasons="${reasons:+${reasons}; }/tmp entry surge: +$((entry_count - previous_entries)) entries in one cycle"
  fi
  local window_kb=$((SPRAWL_WINDOW_GB * 1024 * 1024))
  if [ -n "$window_anchor_kb" ] && [ $((window_anchor_kb - available_kb)) -gt "$window_kb" ]; then
    reasons="${reasons:+${reasons}; }sustained fill: $(((window_anchor_kb - available_kb) / 1024 / 1024))G consumed across the ${SPRAWL_WINDOW_SAMPLES}-sample window"
  fi
  if [ -n "$reasons" ]; then
    echo "SPRAWL: ${reasons} — top recent growers (analysis only, nothing deleted):"
    describe_top_growers
    touch "$SPRAWL_THROTTLE_STAMP"
  fi
}

# THE CONDUCTOR'S SPEEDOMETER. Context % must be MECHANICAL, not remembered: every
# event batch (READY, gate sentinel, DEAD/QUIET, SPRAWL) carries one CTX line read
# from the conductor's live session jsonl, so the conductor sees the gauge exactly
# when it acts. Analysis only; a missing or failing gauge must never silence the
# events themselves (the events are the payload, the gauge is the rider).
CONTEXT_GAUGE_SCRIPT="${CONTEXT_GAUGE_SCRIPT:-${repository_root}/scripts/context-usage.sh}"

emit_context_speedometer() {
  [ -f "$CONTEXT_GAUGE_SCRIPT" ] || return 0
  local gauge_line
  gauge_line="$(bash "$CONTEXT_GAUGE_SCRIPT" 2>/dev/null | grep -m1 'CONTEXT_TOKENS=' || true)"
  [ -n "$gauge_line" ] && echo "CTX: ${gauge_line}"
  return 0
}

# THE COMPACTION CHECKPOINT. At CHECKPOINT_PCT of the compaction gauge (default
# 85 — i.e. ~15% of runway left) one CHECKPOINT event fires UNCONDITIONALLY (not
# riding an event batch — a quiet fleet must still warn) telling the conductor to
# run the ANCHOR PROTOCOL in project.conductor.md BEFORE the context compacts:
# anchor, lesson sweep, mechanics hardening. One event per crossing: the stamp
# clears when the gauge falls back under the bar (compaction or session restart).
CHECKPOINT_PCT="${CHECKPOINT_PCT:-85}"
CHECKPOINT_STAMP="${CHECKPOINT_STAMP:-/tmp/fleet-watch-checkpoint.fired}"

emit_checkpoint_event() {
  [ -f "$CONTEXT_GAUGE_SCRIPT" ] || return 0
  local gauge_line compact_pct
  gauge_line="$(bash "$CONTEXT_GAUGE_SCRIPT" 2>/dev/null | grep -m1 'CONTEXT_TOKENS=' || true)"
  [ -n "$gauge_line" ] || return 0
  compact_pct="$(printf '%s' "$gauge_line" | sed -n 's/.*COMPACT_PCT=\([0-9]*\).*/\1/p')"
  [ -n "$compact_pct" ] || return 0
  if [ "$compact_pct" -ge "$CHECKPOINT_PCT" ]; then
    if [ ! -f "$CHECKPOINT_STAMP" ]; then
      echo "CHECKPOINT: context at ${compact_pct}% of compaction gauge — run the ANCHOR PROTOCOL (project.conductor.md) NOW, before compact: anchor + lesson sweep + mechanics hardening. ${gauge_line}"
      touch "$CHECKPOINT_STAMP"
    fi
  else
    rm -f "$CHECKPOINT_STAMP"
  fi
  return 0
}

run_cycle_emitters() {
  emit_ready_events
  emit_folder_report_events
  emit_silent_events
  emit_gate_events
  emit_sprawl_events
  emit_steer_events
}

emit_cycle() {
  local cycle_events
  cycle_events="$(run_cycle_emitters)"
  if [ -n "$cycle_events" ]; then
    printf '%s\n' "$cycle_events"
    emit_context_speedometer
  fi
}

if [ "${1:-}" = "--self-test" ]; then
  sandbox="$(mktemp -d /tmp/fleet-watch-selftest-XXXXXX)"
  failures=0
  # PRESENT arm: a planted READY file must fire once, then stay silent.
  planted="/tmp/selftest-$$-READY.md"; echo x > "$planted"
  first="$(emit_ready_events | grep -c "$planted" || true)"
  second="$(emit_ready_events | grep -c "$planted" || true)"
  [ "$first" = "1" ] || { echo "FAIL ready present arm (got $first)"; failures=1; }
  [ "$second" = "0" ] || { echo "FAIL ready seen-stamp arm (got $second)"; failures=1; }
  rm -f "$planted" "${planted}.seen"
  # PRESENT arm: a registered gate log with a sentinel must fire once.
  gate_log="$sandbox/gate.log"; echo "GATE_EXIT=0" > "$gate_log"
  echo "$gate_log" > /tmp/fleet-watch-gates
  first="$(emit_gate_events | grep -c GATE_DONE || true)"
  second="$(emit_gate_events | grep -c GATE_DONE || true)"
  [ "$first" = "1" ] || { echo "FAIL gate present arm (got $first)"; failures=1; }
  [ "$second" = "0" ] || { echo "FAIL gate reported-stamp arm (got $second)"; failures=1; }
  rm -f /tmp/fleet-watch-gates "${gate_log}.reported"
  # SPRAWL arms run against a sandboxed state file so the live sentinel's memory
  # is never disturbed.
  SPRAWL_STATE_FILE="$sandbox/disk.prev"
  SPRAWL_THROTTLE_STAMP="$sandbox/sprawl.throttle"
  SPRAWL_HISTORY_FILE="$sandbox/disk.history"
  # PRESENT arm: a planted floor breach must fire.
  first="$(SPRAWL_TEST_AVAIL_KB=1048576 SPRAWL_TEST_ENTRY_COUNT=100 emit_sprawl_events | grep -c SPRAWL || true)"
  [ "$first" = "1" ] || { echo "FAIL sprawl floor arm (got $first)"; failures=1; }
  # THROTTLE arm: the same breach inside the window must stay silent.
  second="$(SPRAWL_TEST_AVAIL_KB=1048576 SPRAWL_TEST_ENTRY_COUNT=100 emit_sprawl_events | grep -c SPRAWL || true)"
  [ "$second" = "0" ] || { echo "FAIL sprawl throttle arm (got $second)"; failures=1; }
  # RATE arm: fresh throttle, healthy floor, but a 3G one-cycle drop must fire.
  rm -f "$SPRAWL_THROTTLE_STAMP"
  echo "52428800 100" > "$SPRAWL_STATE_FILE"
  third="$(SPRAWL_TEST_AVAIL_KB=49283072 SPRAWL_TEST_ENTRY_COUNT=100 emit_sprawl_events | grep -c SPRAWL || true)"
  [ "$third" = "1" ] || { echo "FAIL sprawl rate arm (got $third)"; failures=1; }
  # ENTRY-SURGE arm: fresh throttle, stable disk, +500 entries must fire.
  rm -f "$SPRAWL_THROTTLE_STAMP"
  echo "52428800 100" > "$SPRAWL_STATE_FILE"
  fourth="$(SPRAWL_TEST_AVAIL_KB=52428800 SPRAWL_TEST_ENTRY_COUNT=600 emit_sprawl_events | grep -c SPRAWL || true)"
  [ "$fourth" = "1" ] || { echo "FAIL sprawl entry-surge arm (got $fourth)"; failures=1; }
  # SUSTAINED arm: ten slow samples, each under the single-cycle bar, must still
  # fire when the window's total drop crosses SPRAWL_WINDOW_GB. 400MB per sample
  # x 9 steps = 3.5G across the window; no single step exceeds 1G.
  rm -f "$SPRAWL_THROTTLE_STAMP" "$SPRAWL_HISTORY_FILE" "$SPRAWL_STATE_FILE"
  sustained_fired=0
  sample_kb=52428800
  for _ in 1 2 3 4 5 6 7 8 9 10; do
    fired="$(SPRAWL_TEST_AVAIL_KB=$sample_kb SPRAWL_TEST_ENTRY_COUNT=100 emit_sprawl_events | grep -c "sustained fill" || true)"
    [ "$fired" != "0" ] && sustained_fired=1
    sample_kb=$((sample_kb - 409600))
  done
  [ "$sustained_fired" = "1" ] || { echo "FAIL sprawl sustained arm — slow leak never fired"; failures=1; }
  # ABSENT arm for sprawl: healthy values must stay silent.
  rm -f "$SPRAWL_THROTTLE_STAMP" "$SPRAWL_HISTORY_FILE"
  echo "52428800 100" > "$SPRAWL_STATE_FILE"
  calm="$(SPRAWL_TEST_AVAIL_KB=52428800 SPRAWL_TEST_ENTRY_COUNT=110 emit_sprawl_events | grep -c . || true)"
  [ "$calm" = "0" ] || { echo "FAIL sprawl absent arm — events while healthy: $calm"; failures=1; }
  # ABSENT arm: with nothing planted, no event may fire.
  quiet="$( { emit_ready_events; emit_gate_events; } | grep -c . || true)"
  [ "$quiet" = "0" ] || { echo "FAIL absent arm — events with nothing planted: $quiet"; failures=1; }
  # REPORT-REWRITE arm: an updated report (same filename, new content) must fire again.
  report_sandbox="$sandbox/in-progress/999-selftest-lane"
  mkdir -p "$report_sandbox"
  echo "first verdict" > "$report_sandbox/report-999-selftest-lane.md"
  first="$(tasks_in_progress="$sandbox/in-progress" emit_folder_report_events | grep -c '^READY:' || true)"
  second="$(tasks_in_progress="$sandbox/in-progress" emit_folder_report_events | grep -c '^READY:' || true)"
  echo "revised verdict" > "$report_sandbox/report-999-selftest-lane.md"
  third="$(tasks_in_progress="$sandbox/in-progress" emit_folder_report_events | grep -c '^READY:' || true)"
  [ "$first" = "1" ] || { echo "FAIL report present arm (got $first)"; failures=1; }
  [ "$second" = "0" ] || { echo "FAIL report seen-stamp arm (got $second)"; failures=1; }
  [ "$third" = "1" ] || { echo "FAIL report REWRITE arm — updated report stayed silent (got $third)"; failures=1; }
  rm -f /tmp/fleet-watch-report-999-selftest-lane-*.seen
  # SPEEDOMETER present arm: an event batch must carry exactly one CTX line.
  planted="/tmp/selftest-$$-ctx-READY.md"; echo x > "$planted"
  gauge="$sandbox/gauge.sh"; echo 'echo "CONTEXT_TOKENS=1234 RAW_PCT=1% COMPACT_PCT=2%"' > "$gauge"
  ctx_present="$(CONTEXT_GAUGE_SCRIPT="$gauge" emit_cycle | grep -c '^CTX: CONTEXT_TOKENS=1234' || true)"
  [ "$ctx_present" = "1" ] || { echo "FAIL speedometer present arm (got $ctx_present)"; failures=1; }
  rm -f "$planted" "${planted}.seen"
  # SPEEDOMETER broken-gauge arm: a failing gauge must never silence the events.
  planted="/tmp/selftest-$$-ctx2-READY.md"; echo x > "$planted"
  broken="$sandbox/broken-gauge.sh"; echo 'exit 1' > "$broken"
  events_survive="$(CONTEXT_GAUGE_SCRIPT="$broken" emit_cycle | grep -c "READY: ${planted}" || true)"
  [ "$events_survive" = "1" ] || { echo "FAIL speedometer broken-gauge arm — events silenced (got $events_survive)"; failures=1; }
  rm -f "$planted" "${planted}.seen"
  # SPEEDOMETER absent arm: a quiet cycle emits no CTX line (rider needs a payload).
  ctx_quiet="$(CONTEXT_GAUGE_SCRIPT="$gauge" emit_cycle | grep -c '^CTX:' || true)"
  [ "$ctx_quiet" = "0" ] || { echo "FAIL speedometer absent arm — CTX without events: $ctx_quiet"; failures=1; }
  # CHECKPOINT present arm: gauge over the bar fires once, then stays silent.
  hot_gauge="$sandbox/hot-gauge.sh"; echo 'echo "CONTEXT_TOKENS=340000 RAW_PCT=85.0% COMPACT_PCT=92.7%"' > "$hot_gauge"
  cp_stamp="$sandbox/checkpoint.fired"
  first="$(CONTEXT_GAUGE_SCRIPT="$hot_gauge" CHECKPOINT_STAMP="$cp_stamp" emit_checkpoint_event | grep -c '^CHECKPOINT:' || true)"
  second="$(CONTEXT_GAUGE_SCRIPT="$hot_gauge" CHECKPOINT_STAMP="$cp_stamp" emit_checkpoint_event | grep -c '^CHECKPOINT:' || true)"
  [ "$first" = "1" ] || { echo "FAIL checkpoint present arm (got $first)"; failures=1; }
  [ "$second" = "0" ] || { echo "FAIL checkpoint once-per-crossing arm (got $second)"; failures=1; }
  # CHECKPOINT reset arm: gauge back under the bar clears the stamp so a later crossing fires again.
  cool_gauge="$sandbox/cool-gauge.sh"; echo 'echo "CONTEXT_TOKENS=40000 RAW_PCT=10.0% COMPACT_PCT=11.0%"' > "$cool_gauge"
  CONTEXT_GAUGE_SCRIPT="$cool_gauge" CHECKPOINT_STAMP="$cp_stamp" emit_checkpoint_event >/dev/null
  refire="$(CONTEXT_GAUGE_SCRIPT="$hot_gauge" CHECKPOINT_STAMP="$cp_stamp" emit_checkpoint_event | grep -c '^CHECKPOINT:' || true)"
  [ "$refire" = "1" ] || { echo "FAIL checkpoint reset arm (got $refire)"; failures=1; }
  # CHECKPOINT absent arm: a healthy gauge emits nothing.
  calm_cp="$(CONTEXT_GAUGE_SCRIPT="$cool_gauge" CHECKPOINT_STAMP="$sandbox/cp2.fired" emit_checkpoint_event | grep -c . || true)"
  [ "$calm_cp" = "0" ] || { echo "FAIL checkpoint absent arm (got $calm_cp)"; failures=1; }
  # STEER arms — confirm-and-log, lose-loudly-once.
  steer_store="$HOME/.claude/projects/selftest-steer-record-$$"
  mkdir -p "$steer_store" "$sandbox/selftest-steer-record-$$"
  echo '{"text":"please read the round brief and act on it"}' > "$steer_store/record.jsonl"
  confirm_marker="/tmp/steer-pending-selftest-confirm-$$"
  printf 'task_directory=%s\nsession_name=no-such-session\nfragment=%s\nmessage=%s\n' \
    "$sandbox/selftest-steer-record-$$" "read the round brief and act" "selftest confirm steer" > "$confirm_marker"
  lost_marker="/tmp/steer-pending-selftest-lost-$$"
  printf 'task_directory=%s\nsession_name=no-such-session\nfragment=%s\nmessage=%s\n' \
    "$sandbox" "fragment that appears in no record anywhere" "selftest lost steer" > "$lost_marker"
  touch -d '20 minutes ago' "$lost_marker"
  steer_events="$(emit_steer_events)"
  grep -q "LANDED selftest confirm steer" "$sandbox/selftest-steer-record-$$/steers.log" 2>/dev/null \
    || { echo "FAIL steer confirm arm (no LANDED logged)"; failures=1; }
  [ ! -f "$confirm_marker" ] || { echo "FAIL steer confirm arm (marker not cleared)"; failures=1; }
  printf '%s' "$steer_events" | grep -q "STEER_LOST: no-such-session" \
    || { echo "FAIL steer lost arm (no STEER_LOST)"; failures=1; }
  second_steer="$(emit_steer_events | grep -c 'STEER_LOST' || true)"
  [ "$second_steer" = "0" ] || { echo "FAIL steer lost arm (fired twice)"; failures=1; }
  rm -rf "$steer_store" "$lost_marker" "${lost_marker}.lost" "$confirm_marker"
  rm -rf "$sandbox"

  if [ "$failures" = "0" ]; then
    echo "SELF-TEST: all arms fire, clean state stays silent."
    exit 0
  fi
  exit 1
fi

while true; do
  touch "$HEARTBEAT_FILE"
  emit_cycle
  emit_checkpoint_event
  sleep "$CYCLE_SECONDS"
done

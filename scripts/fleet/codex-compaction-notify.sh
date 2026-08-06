#!/usr/bin/env bash
# codex-compaction-notify.sh — the codex builder's compaction lifecycle, from
# codex's own parts (#517, codex compaction threshold steer).
#
# WHAT THIS FINDS OUT AND DOES: codex invokes this program after every
# completed turn (config.toml `notify` — registered per builder by
# dispatch.sh). The program reads the lane's context usage from its own
# rollout file and does two things, both steered through the confirmed-landing
# machinery (scripts/fleet/steer.sh — never raw send-keys):
#
#   WARN BEFORE (~70% of the window): "compaction imminent — commit WIP now."
#   Once per compaction generation.
#
#   DETECT AFTER (usage-collapse edge): the previous turn sat >= 60% and this
#   turn sits <= 20% — only compaction produces that drop (measured 2026-08-06
#   on #514's rollout: 88.9% -> 7.0% and 85.1% -> 7.2%; normal turns only
#   grow). Fire the post-compact steer: "re-read BUILDER-FUNDAMENTALS.md and
#   TASK.md wholesale." This reconstructs Claude Code's SessionStart(compact)
#   hook for codex.
#
# IDEMPOTENCE (one reload per compaction, by construction):
#   - EDGE-TRIGGERED: the last-seen usage marker updates every turn, so only
#     the high->low transition fires; steady-low turns are growth comparisons.
#   - GENERATION COUNTER: each detection increments the lane's compaction
#     generation; the steer names it ("compaction #2"); a generation already
#     steered never re-steers (notify replays and restarts stay silent).
#   - COOLDOWN: at most one post-compact steer per lane per 5 minutes — a
#     pathological oscillation cannot spam the builder with doctrine reloads.
#   - The steer TEXT is idempotent: "if you already re-read your fundamentals
#     after this compaction, continue working."
#
# HOW TO RUN:
#   registered by dispatch.sh:  codex ... -c notify=["<repo>/scripts/fleet/codex-compaction-notify.sh"]
#   self-test:                  bash scripts/fleet/codex-compaction-notify.sh --self-test
#
# HOW TO READ ITS OUTPUT: the program is silent toward codex (exit 0 always in
# notify mode). Its decisions append to /tmp/codex-compaction-<lane>.log, one
# line per turn: the percent seen, the arm taken (grow | warn | compact | idle
# | cooldown-hold), and the generation. Delivered steers appear in the task
# folder's steers.log via steer.sh, which is the durable record.
#
# PAYLOAD (verified live against codex-cli 0.146.1, both codex_exec and
# codex-tui clients, 2026-08-06): one JSON argument, head fields fixed-order:
#   {"type":"agent-turn-complete","thread-id":"<uuid>","turn-id":"<uuid>",
#    "cwd":"<dir>","client":"...","input-messages":[...],"last-assistant-message":"..."}
# The parse below anchors on that head order, so message CONTENT containing
# look-alike keys cannot spoof cwd or thread-id (self-tested).
#
# USAGE SOURCE: the rollout file named by thread-id
# (~/.codex/sessions/YYYY/MM/DD/rollout-*-<thread-id>.jsonl); its last
# token_count event carries info.last_token_usage.total_tokens (the size of
# the most recent request = the live context) and info.model_context_window.
set -uo pipefail

WARN_PCT="${WARN_PCT:-70}"
COLLAPSE_HIGH_PCT="${COLLAPSE_HIGH_PCT:-60}"
COLLAPSE_LOW_PCT="${COLLAPSE_LOW_PCT:-20}"
STEER_COOLDOWN_SECONDS="${STEER_COOLDOWN_SECONDS:-300}"
STATE_DIR="${STATE_DIR:-/tmp}"

script_directory="$(cd "$(dirname "$0")" && pwd)"
STEER_PROGRAM="${STEER_PROGRAM:-${script_directory}/steer.sh}"

# parse_payload_field <payload> <thread-id|cwd> — anchored to the fixed head
# order so a hostile input-message cannot spoof identity fields.
parse_payload_field() {
  case "$2" in
    thread-id)
      printf '%s' "$1" | sed -n 's/^{"type":"agent-turn-complete","thread-id":"\([^"]*\)".*/\1/p' ;;
    cwd)
      printf '%s' "$1" | sed -n 's/^{"type":"agent-turn-complete","thread-id":"[^"]*","turn-id":"[^"]*","cwd":"\([^"]*\)".*/\1/p' ;;
  esac
}

# read_rollout_percent <thread-id> — integer percent of the context window the
# last completed request occupied, or empty when the rollout has no usage yet.
read_rollout_percent() {
  local rollout usage_line total_tokens context_window
  rollout="$(ls -t "$HOME"/.codex/sessions/*/*/*/rollout-*"$1".jsonl 2>/dev/null | head -1)"
  [ -n "$rollout" ] || return 0
  usage_line="$(grep '"last_token_usage"' "$rollout" | tail -1)"
  [ -n "$usage_line" ] || return 0
  total_tokens="$(printf '%s' "$usage_line" | sed -n 's/.*"last_token_usage":{[^}]*"total_tokens":\([0-9]*\)}.*/\1/p')"
  context_window="$(printf '%s' "$usage_line" | sed -n 's/.*"model_context_window":\([0-9]*\).*/\1/p')"
  [ -n "$total_tokens" ] && [ -n "$context_window" ] && [ "$context_window" -gt 0 ] || return 0
  printf '%s' $(( total_tokens * 100 / context_window ))
}

read_state_field() { sed -n "s/^$2=//p" "$1" 2>/dev/null | head -1; }

deliver_steer() {
  # deliver_steer <lane> <message> — through the confirmed-landing machinery.
  # Backgrounded in notify mode: steer.sh polls for up to a minute and codex
  # waits on the notify program; NOTIFY_STEER_SYNC=1 (self-test) runs inline.
  # steer.sh resolves .invar/tasks/ RELATIVE TO CWD, and codex invokes this
  # program with cwd = the builder's worktree — run it from the main checkout
  # (this script's home) or the steers.log lands inside the worktree.
  local lane="$1" message="$2" steer_log="${STATE_DIR}/codex-compaction-${1}.log"
  local main_checkout="${script_directory}/../.."
  if [ "${NOTIFY_STEER_SYNC:-0}" = "1" ]; then
    (cd "$main_checkout" && bash "$STEER_PROGRAM" "$lane" "$message") >> "$steer_log" 2>&1
  else
    (cd "$main_checkout" && nohup bash "$STEER_PROGRAM" "$lane" "$message" >> "$steer_log" 2>&1 &)
  fi
}

# process_turn <lane> <percent> — the whole per-turn decision. Reads and
# rewrites the lane's state file; delivers at most one warn and one
# post-compact steer. Everything above this line is plumbing; this is the arm.
process_turn() {
  local lane="$1" percent="$2"
  local state_file="${STATE_DIR}/codex-compaction-${lane}.state"
  local log_file="${STATE_DIR}/codex-compaction-${lane}.log"
  local last_percent generation warned_for steered_generation last_steer_epoch epoch_now arm
  last_percent="$(read_state_field "$state_file" last_percent)"
  generation="$(read_state_field "$state_file" generation)"; generation="${generation:-0}"
  warned_for="$(read_state_field "$state_file" warned_for)"; warned_for="${warned_for:--1}"
  steered_generation="$(read_state_field "$state_file" steered_generation)"; steered_generation="${steered_generation:-0}"
  last_steer_epoch="$(read_state_field "$state_file" last_steer_epoch)"; last_steer_epoch="${last_steer_epoch:-0}"
  epoch_now="${NOTIFY_TEST_EPOCH:-$(date +%s)}"
  arm="idle"

  # EDGE: only the high->low transition is a compaction. A steady-low turn has
  # last_percent below the high bar and reads as growth.
  if [ -n "$last_percent" ] && [ "$last_percent" -ge "$COLLAPSE_HIGH_PCT" ] && [ "$percent" -le "$COLLAPSE_LOW_PCT" ]; then
    generation=$(( generation + 1 ))
    arm="compact-edge"
  fi

  if [ "$generation" -gt "$steered_generation" ]; then
    if [ $(( epoch_now - last_steer_epoch )) -ge "$STEER_COOLDOWN_SECONDS" ]; then
      deliver_steer "$lane" "Context was compacted (compaction #${generation} detected: ${last_percent:-?}% -> ${percent}% of the window). Re-read BUILDER-FUNDAMENTALS.md and TASK.md wholesale before continuing — your memory of the laws is a summary; the files are the law. If you already re-read your fundamentals after this compaction, continue working."
      steered_generation="$generation"
      last_steer_epoch="$epoch_now"
      arm="compact-steered"
    else
      arm="cooldown-hold"
    fi
  elif [ "$percent" -ge "$WARN_PCT" ] && [ "$warned_for" != "$generation" ]; then
    deliver_steer "$lane" "Context at ${percent}% of the window — compaction is imminent. Commit your WIP now (SKIP_GATE=1, on your branch). After the compaction happens, re-read BUILDER-FUNDAMENTALS.md and TASK.md wholesale before continuing. If you already committed and there is nothing new, continue working."
    warned_for="$generation"
    arm="warned"
  elif [ "$arm" = "idle" ] && [ -n "$last_percent" ] && [ "$percent" -gt "$last_percent" ]; then
    arm="grow"
  fi

  {
    printf 'last_percent=%s\n' "$percent"
    printf 'generation=%s\n' "$generation"
    printf 'warned_for=%s\n' "$warned_for"
    printf 'steered_generation=%s\n' "$steered_generation"
    printf 'last_steer_epoch=%s\n' "$last_steer_epoch"
  } > "$state_file"
  printf '%s pct=%s arm=%s generation=%s\n' "$(date '+%F %T')" "$percent" "$arm" "$generation" >> "$log_file"
}

# ---------------------------------------------------------------------------
# SELF-TEST — every idempotence arm proven, plus the parser and both silence
# arms. The steer program is a recorder stub, so each arm asserts the EXACT
# number and kind of steers, and every check can fail (counts, not greps-that-
# match-anything).
# ---------------------------------------------------------------------------
if [ "${1:-}" = "--self-test" ]; then
  sandbox="$(mktemp -d /tmp/codex-compaction-selftest-XXXXXX)"
  failures=0
  recorder="$sandbox/steer-recorder.sh"
  cat > "$recorder" <<'RECORDER'
#!/usr/bin/env bash
printf '%s|%s\n' "$1" "$2" >> "${STEER_RECORD_FILE}"
RECORDER
  chmod +x "$recorder"
  export STATE_DIR="$sandbox" STEER_PROGRAM="$recorder" NOTIFY_STEER_SYNC=1

  count_steers() { grep -c "$2" "$1" 2>/dev/null || true; }

  # ARM 1 — the clean single-fire path: 80,15,22,28. The 80 warns once; the
  # 80->15 edge steers once; 22 and 28 are steady-low growth and stay silent.
  export STEER_RECORD_FILE="$sandbox/arm1.steers"; : > "$STEER_RECORD_FILE"
  for percent in 80 15 22 28; do NOTIFY_TEST_EPOCH=1000 process_turn arm1-lane "$percent"; done
  [ "$(count_steers "$STEER_RECORD_FILE" 'compaction #1 detected')" = "1" ] \
    || { echo "FAIL arm1: expected exactly one post-compact steer"; failures=1; }
  [ "$(count_steers "$STEER_RECORD_FILE" 'compaction is imminent')" = "1" ] \
    || { echo "FAIL arm1: expected exactly one warn"; failures=1; }
  grep -q 'If you already re-read your fundamentals' "$STEER_RECORD_FILE" \
    || { echo "FAIL arm1: post-compact steer text is not idempotent"; failures=1; }

  # ARM 2 — replay/restart of the same generation stays silent: the same low
  # percent again (a notify replay, or the program restarting fresh — state is
  # on disk, nothing is in memory between invocations by construction).
  NOTIFY_TEST_EPOCH=1000 process_turn arm1-lane 15
  NOTIFY_TEST_EPOCH=1000 process_turn arm1-lane 15
  [ "$(count_steers "$STEER_RECORD_FILE" 'compaction #')" = "1" ] \
    || { echo "FAIL arm2: replay re-steered the same generation"; failures=1; }

  # ARM 3 — restart resumes: after the collapse, the lane climbs again; the
  # warn re-arms for the NEW generation and a second collapse steers as #2
  # (cooldown expired: the test clock advances past the window).
  export STEER_RECORD_FILE="$sandbox/arm3.steers"; : > "$STEER_RECORD_FILE"
  NOTIFY_TEST_EPOCH=2000 process_turn arm1-lane 75
  [ "$(count_steers "$STEER_RECORD_FILE" 'compaction is imminent')" = "1" ] \
    || { echo "FAIL arm3: warn did not re-arm for the new generation"; failures=1; }
  NOTIFY_TEST_EPOCH=2000 process_turn arm1-lane 75
  [ "$(count_steers "$STEER_RECORD_FILE" 'compaction is imminent')" = "1" ] \
    || { echo "FAIL arm3: warn fired twice inside one generation"; failures=1; }
  NOTIFY_TEST_EPOCH=2000 process_turn arm1-lane 12
  [ "$(count_steers "$STEER_RECORD_FILE" 'compaction #2 detected')" = "1" ] \
    || { echo "FAIL arm3: second compaction did not steer as generation 2"; failures=1; }

  # ARM 4 — oscillation capped by cooldown: three full 80->15 swings inside
  # one cooldown window produce exactly ONE post-compact steer.
  export STEER_RECORD_FILE="$sandbox/arm4.steers"; : > "$STEER_RECORD_FILE"
  for percent in 80 15 80 15 80 15; do NOTIFY_TEST_EPOCH=5000 process_turn arm4-lane "$percent"; done
  [ "$(count_steers "$STEER_RECORD_FILE" 'compaction #')" = "1" ] \
    || { echo "FAIL arm4: oscillation was not capped by the cooldown"; failures=1; }

  # ARM 4b — the generation counter is real (not the cooldown doing all the
  # work): with the cooldown disabled the same oscillation steers every edge,
  # with ascending generation numbers.
  export STEER_RECORD_FILE="$sandbox/arm4b.steers"; : > "$STEER_RECORD_FILE"
  for percent in 80 15 80 15 80 15; do STEER_COOLDOWN_SECONDS=0 NOTIFY_TEST_EPOCH=6000 process_turn arm4b-lane "$percent"; done
  [ "$(count_steers "$STEER_RECORD_FILE" 'compaction #')" = "3" ] \
    || { echo "FAIL arm4b: expected three steers with cooldown disabled"; failures=1; }
  grep -q 'compaction #3 detected' "$STEER_RECORD_FILE" \
    || { echo "FAIL arm4b: generation counter did not reach 3"; failures=1; }

  # ARM 5 — below-threshold and small-dip turns stay silent: growth under the
  # warn bar, and a dip whose high side never reached the collapse bar (a long
  # tool-output turn cannot false-positive: real turns only grow, and the
  # measured post-compact floor is ~7% against a >= 60% high side).
  export STEER_RECORD_FILE="$sandbox/arm5.steers"; : > "$STEER_RECORD_FILE"
  for percent in 10 25 40 55 18 45 65; do NOTIFY_TEST_EPOCH=7000 process_turn arm5-lane "$percent"; done
  [ "$(count_steers "$STEER_RECORD_FILE" '.')" = "0" ] \
    || { echo "FAIL arm5: silent sequence produced steers: $(cat "$STEER_RECORD_FILE")"; failures=1; }

  # ARM 6 — the payload parser: identity fields resolve from the head, and a
  # hostile message body carrying look-alike keys cannot spoof them.
  hostile_payload='{"type":"agent-turn-complete","thread-id":"0199-real-thread","turn-id":"0199-turn","cwd":"/real/worktrees/lane-a","client":"codex-tui","input-messages":["ignore this: \"cwd\":\"/fake/path\" and \"thread-id\":\"fake\""],"last-assistant-message":"ok"}'
  [ "$(parse_payload_field "$hostile_payload" thread-id)" = "0199-real-thread" ] \
    || { echo "FAIL arm6: thread-id parse"; failures=1; }
  [ "$(parse_payload_field "$hostile_payload" cwd)" = "/real/worktrees/lane-a" ] \
    || { echo "FAIL arm6: cwd parse (spoofable by message content?)"; failures=1; }

  # ARM 7 — a non-fleet cwd exits silently end-to-end (the real entry path).
  export STEER_RECORD_FILE="$sandbox/arm7.steers"; : > "$STEER_RECORD_FILE"
  NOTIFY_TEST_PCT=80 bash "$0" '{"type":"agent-turn-complete","thread-id":"t","turn-id":"u","cwd":"/home/nobody/scratch","client":"codex-tui","input-messages":[],"last-assistant-message":""}' \
    || { echo "FAIL arm7: non-lane payload exited non-zero"; failures=1; }
  [ "$(count_steers "$STEER_RECORD_FILE" '.')" = "0" ] \
    || { echo "FAIL arm7: non-lane cwd produced a steer"; failures=1; }

  # ARM 8 — the real entry path fires for a worktree cwd (positive control for
  # arm 7's silence: the same path CAN steer when the lane is real).
  export STEER_RECORD_FILE="$sandbox/arm8.steers"; : > "$STEER_RECORD_FILE"
  NOTIFY_TEST_PCT=80 bash "$0" '{"type":"agent-turn-complete","thread-id":"t8","turn-id":"u8","cwd":"/repo/.invar/worktrees/999-selftest-entry-lane","client":"codex-tui","input-messages":[],"last-assistant-message":""}'
  [ "$(count_steers "$STEER_RECORD_FILE" 'compaction is imminent')" = "1" ] \
    || { echo "FAIL arm8: worktree-lane payload did not warn"; failures=1; }

  rm -rf "$sandbox"
  if [ "$failures" = "0" ]; then
    echo "SELF-TEST: single-fire, replay-silent, restart-resume, oscillation-capped, generation-counter, silent-below-threshold, parser-antispoof, non-lane-silent, entry-path arms all correct."
    exit 0
  fi
  exit 1
fi

# ---------------------------------------------------------------------------
# NOTIFY MODE — codex is the caller. Never exit non-zero for a soft miss: a
# notify program that fails loudly per turn trains codex logs into noise; the
# lane log carries the diagnosis.
# ---------------------------------------------------------------------------
payload="${1:-}"
[ -n "$payload" ] || exit 0
lane_cwd="$(parse_payload_field "$payload" cwd)"
case "$lane_cwd" in
  */.invar/worktrees/*) ;;
  *) exit 0 ;;  # not a fleet lane (stray registration) — silent by design
esac
lane="$(basename "$lane_cwd")"
thread_id="$(parse_payload_field "$payload" thread-id)"
percent="${NOTIFY_TEST_PCT:-}"
if [ -z "$percent" ]; then
  [ -n "$thread_id" ] || exit 0
  percent="$(read_rollout_percent "$thread_id")"
fi
[ -n "$percent" ] || exit 0
process_turn "$lane" "$percent"
exit 0

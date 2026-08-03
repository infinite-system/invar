#!/usr/bin/env bash
# tmux harness for driving the real TUI (plan §5.2).
# invariant: Harness waits observe conditions not frame ordinals (scripts/harness/harness.invariants.md)
# invariant: Every wait names itself (scripts/harness/harness.invariants.md)
# State verdicts come from artifacts/status.json (the observability side channel),
# never from scraping the pane. Pane capture is reserved for visual assertions.
#
# Commands:
#   launch  <session> <WxH> [cmd...]   start the app in a detached tmux pane
#   ready   <session> [timeout_s]      wait until status.json reports ready + quiescent
#   settle  <session> [timeout_s]      wait for the driven input to change the completed screen
#   send    <session> <keys...>        tmux send-keys (literal), then request a settle window
#   capture <session>                  print the current pane content
#   status                             print artifacts/status.json
#   field   <jq-path>                  print one field from status.json (e.g. .ready)
#   kill    <session>                  kill the tmux session
set -uo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
# Per-session side channels: each launched instance writes its OWN status/frame files, so
# concurrent instances (user demo + harness sessions) never pollute each other's verdicts.
status_path() { echo "$ROOT/artifacts/status-$1.json"; }
frame_path()  { echo "$ROOT/artifacts/frame-$1.json"; }
settle_frame_baseline_path() { echo "$ROOT/artifacts/settle-frame-baseline-$1"; }
settle_screen_baseline_path() { echo "$ROOT/artifacts/settle-screen-baseline-$1"; }
settle_screen_current_path() { echo "$ROOT/artifacts/settle-screen-current-$1"; }
STATUS="$ROOT/artifacts/status.json" # legacy fallback for single-arg field/status
BUN="${BUN:-$HOME/.bun/bin/bun}"
BUN_BIN="$(dirname "$BUN")"          # real bun dir, captured BEFORE we isolate HOME below
# A behavioral-contract run supplies a fresh home. The fallback keeps direct manual calls compatible.
HARNESS_HOME="${INVAR_HARNESS_HOME:-$ROOT/artifacts/home}"
HARNESS_XDG_CONFIG_HOME="${XDG_CONFIG_HOME:-$HARNESS_HOME/.config}"
HARNESS_XDG_DATA_HOME="${XDG_DATA_HOME:-$HARNESS_HOME/.local/share}"
HARNESS_XDG_STATE_HOME="${XDG_STATE_HOME:-$HARNESS_HOME/.local/state}"
HARNESS_XDG_CACHE_HOME="${XDG_CACHE_HOME:-$HARNESS_HOME/.cache}"

# Capture pane descendants BEFORE tmux tears down the shell. Some terminal app processes survive the
# pane HUP and are reparented to pid 1; once that happens the session no longer identifies them and a
# full smoke run accumulates enough live renderers/watchers to perturb later drives.
session_descendant_process_identifiers() {
  local parent_process_identifier="$1"
  local child_process_identifier
  for child_process_identifier in $(pgrep -P "$parent_process_identifier" 2>/dev/null || true); do
    session_descendant_process_identifiers "$child_process_identifier"
    echo "$child_process_identifier"
  done
}

kill_session_and_descendants() {
  local session_name="$1"
  local pane_process_identifier
  local descendant_process_identifiers
  local descendant_process_identifier
  pane_process_identifier="$(tmux display-message -p -t "$session_name" '#{pane_pid}' 2>/dev/null || true)"
  descendant_process_identifiers=""
  if [ -n "$pane_process_identifier" ]; then
    descendant_process_identifiers="$(session_descendant_process_identifiers "$pane_process_identifier")"
  fi
  tmux kill-session -t "$session_name" 2>/dev/null || true
  for descendant_process_identifier in $descendant_process_identifiers; do
    kill "$descendant_process_identifier" 2>/dev/null || true
  done
  sleep 0.05
  for descendant_process_identifier in $descendant_process_identifiers; do
    kill -9 "$descendant_process_identifier" 2>/dev/null || true
  done
}

_field() { # read a top-level field from status.json without jq
  local key="$1"
  [ -f "$STATUS" ] || { echo ""; return; }
  "$BUN" -e "try{const s=require('$STATUS');const v=('$key' in s)?s['$key']:'';process.stdout.write(String(v))}catch{process.stdout.write('')}" 2>/dev/null
}

is_nonnegative_integer() {
  case "$1" in
    ''|*[!0-9]*) return 1;;
    *) return 0;;
  esac
}

capture_screen_signature() {
  local session_name="$1"
  local destination_path="$2"
  {
    tmux display-message -p -t "$session_name" 'cursor=#{cursor_x},#{cursor_y}'
    tmux capture-pane -e -p -t "$session_name"
  } > "$destination_path"
}

record_input_observation() {
  local session_name="$1"
  local current_frame
  local frame_baseline_path="$(settle_frame_baseline_path "$session_name")"
  local screen_baseline_path="$(settle_screen_baseline_path "$session_name")"
  if [ -f "$frame_baseline_path" ] && [ -f "$screen_baseline_path" ]; then
    return 0
  fi
  STATUS="$(status_path "$session_name")"
  current_frame="$(_field frame)"
  if ! is_nonnegative_integer "$current_frame"; then
    echo "input observation: status has no completed frame for $session_name" >&2
    return 1
  fi
  printf '%s\n' "$current_frame" > "$frame_baseline_path"
  capture_screen_signature "$session_name" "$screen_baseline_path"
}

wait_for_changed_completed_screen() {
  local session_name="$1"
  local baseline_frame="$2"
  local timeout_seconds="${3:-15}"
  local condition_name="the completed screen to change after the driven input"
  local end_time=$((SECONDS + timeout_seconds))
  local current_frame=""
  local render_quiescent=""
  local screen_changed="false"
  local screen_baseline_path="$(settle_screen_baseline_path "$session_name")"
  local screen_current_path="$(settle_screen_current_path "$session_name")"
  STATUS="$(status_path "$session_name")"
  while [ "$SECONDS" -lt "$end_time" ]; do
    current_frame="$(_field frame)"
    render_quiescent="$(_field renderQuiescent)"
    capture_screen_signature "$session_name" "$screen_current_path"
    if ! cmp -s "$screen_baseline_path" "$screen_current_path"; then
      screen_changed="true"
    fi
    if is_nonnegative_integer "$current_frame" \
      && [ "$current_frame" -gt "$baseline_frame" ] \
      && [ "$screen_changed" = "true" ] \
      && [ "$render_quiescent" = "true" ]; then
      rm -f "$screen_current_path"
      echo "settled ($condition_name)"
      return 0
    fi
    sleep 0.05
  done
  rm -f "$screen_current_path"
  echo "TIMEOUT waiting for $condition_name (screenChanged=$screen_changed frame=$current_frame quiescent=$render_quiescent)" >&2
  return 1
}

cmd="${1:-}"; shift || true
case "$cmd" in
  launch)
    session="$1"; size="$2"; shift 2
    cols="${size%x*}"; rows="${size#*x}"
    kill_session_and_descendants "$session"
    rm -f "$STATUS"
    tmux new-session -d -s "$session" -x "$cols" -y "$rows"
    # invariant: Declared harness geometry reaches Invar (scripts/harness/harness.invariants.md)
    # The tmux server defaults to `window-size latest`, which silently replaces -x/-y with the most
    # recent attached client's size. Pin this test window before the app starts.
    tmux set-window-option -t "$session:0" window-size manual
    tmux resize-window -t "$session:0" -x "$cols" -y "$rows"
    actual_size="$(tmux display-message -p -t "$session:0.0" '#{pane_width}x#{pane_height}')"
    if [ "$actual_size" != "$size" ]; then
      echo "launch: requested $size but tmux created $actual_size" >&2
      kill_session_and_descendants "$session"
      exit 1
    fi
    rm -f \
      "$(status_path "$session")" \
      "$(frame_path "$session")" \
      "$(settle_frame_baseline_path "$session")" \
      "$(settle_screen_baseline_path "$session")" \
      "$(settle_screen_current_path "$session")"
    mkdir -p \
      "$HARNESS_XDG_CONFIG_HOME/invar" \
      "$HARNESS_XDG_DATA_HOME/invar" \
      "$HARNESS_XDG_STATE_HOME" \
      "$HARNESS_XDG_CACHE_HOME"
    # invariant: Harness app homes are complete and isolated (scripts/harness/harness.invariants.md)
    # Run inside the repo with the caller's isolated user directories, the real Bun captured before
    # isolation, the first-run convenience task suppressed, and a session-scoped side channel.
    tmux send-keys -t "$session" "cd '$ROOT' && HOME='$HARNESS_HOME' XDG_CONFIG_HOME='$HARNESS_XDG_CONFIG_HOME' XDG_DATA_HOME='$HARNESS_XDG_DATA_HOME' XDG_STATE_HOME='$HARNESS_XDG_STATE_HOME' XDG_CACHE_HOME='$HARNESS_XDG_CACHE_HOME' PATH='$BUN_BIN':\"\$PATH\" INVAR_TEST_SUPPRESS_BUILT_IN_TASK=1 TUI_STATUS_PATH='$(status_path "$session")' TUI_FRAME_PATH='$(frame_path "$session")' $* " C-m
    echo "launched $session ($cols x $rows): $*"
    ;;
  ready)
    session="${1:-}"; timeout="${2:-15}"
    STATUS="$(status_path "$session")"
    end=$((SECONDS + timeout))
    while [ "$SECONDS" -lt "$end" ]; do
      ready_state="$(_field ready)"
      render_quiescent="$(_field renderQuiescent)"
      current_frame="$(_field frame)"
      if [ "$ready_state" = "true" ] \
        && [ "$render_quiescent" = "true" ] \
        && is_nonnegative_integer "$current_frame"; then
        rm -f \
          "$(settle_frame_baseline_path "$session")" \
          "$(settle_screen_baseline_path "$session")" \
          "$(settle_screen_current_path "$session")"
        echo "ready (completed quiescent frame $current_frame)"
        exit 0
      fi
      sleep 0.05
    done
    echo "TIMEOUT waiting for ready and a completed quiescent frame (ready=$(_field ready) frame=$(_field frame) quiescent=$(_field renderQuiescent))" >&2
    exit 1
    ;;
  settle)
    session="${1:-}"; timeout="${2:-15}"
    frame_baseline_file="$(settle_frame_baseline_path "$session")"
    screen_baseline_file="$(settle_screen_baseline_path "$session")"
    if [ ! -f "$frame_baseline_file" ] || [ ! -f "$screen_baseline_file" ]; then
      echo "settle: no driven-input observation for $session" >&2
      exit 1
    fi
    baseline_frame="$(sed -n '1p' "$frame_baseline_file")"
    if ! is_nonnegative_integer "$baseline_frame"; then
      echo "settle: invalid completed-frame fence for $session: $baseline_frame" >&2
      exit 1
    fi
    if wait_for_changed_completed_screen "$session" "$baseline_frame" "$timeout"; then
      rm -f "$frame_baseline_file" "$screen_baseline_file"
      exit 0
    fi
    exit 1
    ;;
  send)
    session="$1"; shift
    record_input_observation "$session" || exit 1
    tmux send-keys -t "$session" "$@"
    sleep 0.25
    ;;
  chord)
    # chord <session> <KeyName> — send a MODIFIED chord (e.g. Control+Shift+p, Control+], Alt+z)
    # encoded by the SAME generator the TypeScript drivers use (scripts/harness/HarnessInput.ts), so a
    # bash smoke and a PtyTestDriver smoke can never disagree about what byte a chord is. tmux
    # send-keys cannot name these chords, which is why raw bytes are written literally.
    # invariant: Harness input and output use the real PTY (scripts/harness/harness.invariants.md)
    # The bytes travel as HEX and are sent with `tmux send-keys -H`: a chord like Ctrl+J is the single
    # byte 0x0A, and command substitution STRIPS trailing newlines — so carrying raw bytes through
    # `$(...)` silently loses exactly the control chords this command exists to send.
    session="$1"; chord_name="$2"
    record_input_observation "$session" || exit 1
    chord_hex_bytes="$(HARNESS_CHORD_NAME="$chord_name" "$BUN" -e "import{HarnessInput}from'$ROOT/scripts/harness/HarnessInput.ts';const bytes=Buffer.from(HarnessInput.Class.key(process.env.HARNESS_CHORD_NAME),'binary');process.stdout.write([...bytes].map((byteValue)=>byteValue.toString(16).padStart(2,'0')).join(' '))")"
    if [ -z "$chord_hex_bytes" ]; then
      echo "chord: HarnessInput produced no bytes for '$chord_name'" >&2
      exit 1
    fi
    # shellcheck disable=SC2086 -- the hex bytes are separate send-keys arguments by design
    tmux send-keys -t "$session" -H $chord_hex_bytes
    sleep 0.25
    ;;
  paste)
    # paste <session> <text> — inject a BRACKETED PASTE (\e[200~<text>\e[201~), exactly how a
    # clipboard paste or a dictation tool (Hex) delivers bulk text once DECSET 2004 is enabled. The
    # app must surface this as ONE paste event (no per-char keypresses). Text is sent literally.
    session="$1"; text="$2"
    record_input_observation "$session" || exit 1
    tmux send-keys -t "$session" -l "$(printf '\033[200~%s\033[201~' "$text")"
    sleep 0.3
    ;;
  click)
    # click <session> <x> <y> [button]  — send an SGR left-button press+release at 0-based (x,y).
    # SGR mouse is 1-based, so add 1; the app reports the 0-based (x,y) back.
    session="$1"; x="$2"; y="$3"; button="${4:-0}"
    record_input_observation "$session" || exit 1
    tmux send-keys -t "$session" -l "$(printf '\033[<%d;%d;%dM' "$button" "$((x+1))" "$((y+1))")"
    sleep 0.1
    tmux send-keys -t "$session" -l "$(printf '\033[<%d;%d;%dm' "$button" "$((x+1))" "$((y+1))")"
    sleep 0.2
    ;;
  drag)
    # drag <session> <x1> <y1> <x2> <y2>  — SGR left-press at (x1,y1), drag motion (button+32)
    # through a midpoint to (x2,y2), release at (x2,y2). 0-based cells; SGR is 1-based.
    session="$1"; x1="$2"; y1="$3"; x2="$4"; y2="$5"
    record_input_observation "$session" || exit 1
    tmux send-keys -t "$session" -l "$(printf '\033[<0;%d;%dM' "$((x1+1))" "$((y1+1))")"
    sleep 0.08
    midX=$(( (x1+x2)/2 + 1 )); midY=$(( (y1+y2)/2 + 1 ))
    tmux send-keys -t "$session" -l "$(printf '\033[<32;%d;%dM' "$midX" "$midY")"
    sleep 0.08
    tmux send-keys -t "$session" -l "$(printf '\033[<32;%d;%dM' "$((x2+1))" "$((y2+1))")"
    sleep 0.08
    tmux send-keys -t "$session" -l "$(printf '\033[<0;%d;%dm' "$((x2+1))" "$((y2+1))")"
    sleep 0.2
    ;;
  focus)
    # focus <session> in|out — inject a terminal focus report (\e[I focus-in, \e[O focus-out).
    # Drives the tab-defocus→refocus recovery path. NOTE: injecting the sequence is NOT the same as
    # the real terminal resetting its session state (termios/mouse/modes) — this drives the app's
    # focus HANDLER (re-setup + repaint), not the actual mode-loss (only a real VS Code tab can).
    session="$1"; mode="$2"
    record_input_observation "$session" || exit 1
    focus_baseline="$(sed -n '1p' "$(settle_frame_baseline_path "$session")")"
    if [ "$mode" = out ]; then
      seq="$(printf '\033[O')"
    else
      seq="$(printf '\033[I')"
    fi
    tmux send-keys -t "$session" -l "$seq"
    # Focus-out only records terminal state and is frame-silent. Focus-in owns
    # mode recovery and repaint, so only that arm has a completed-frame wait.
    if [ "$mode" != out ]; then
      wait_for_changed_completed_screen "$session" "$focus_baseline" 15 >/dev/null
    fi
    ;;
  scroll)
    # scroll <session> <x> <y> up|down|left|right|shift-up|shift-down [amount] — SGR wheel at (x,y).
    # Buttons: 64=up 65=down 66=left 67=right; +4 = shift bit. Press-only; repeats `amount` times.
    session="$1"; x="$2"; y="$3"; dir="$4"; amount="${5:-1}"
    record_input_observation "$session" || exit 1
    case "$dir" in
      up) button=64;; down) button=65;; left) button=66;; right) button=67;;
      shift-up) button=68;; shift-down) button=69;;
      *) button=65;;
    esac
    for _ in $(seq 1 "$amount"); do
      tmux send-keys -t "$session" -l "$(printf '\033[<%d;%d;%dM' "$button" "$((x+1))" "$((y+1))")"
      sleep 0.05
    done
    sleep 0.2
    ;;
  capture)
    session="$1"
    tmux capture-pane -t "$session" -p
    ;;
  content-offset)
    # content-offset <session> — how many rows the layout below the workspace tab strip has shifted
    # DOWN relative to the 1-row-strip layout the smokes were authored for (0 when the strip is 1 row,
    # 1 for the two-line workspace tabs). Add it to any hardcoded content/tab-bar click y so the smoke
    # is height-robust: it never breaks again on a workspace-strip height change. Derived from the
    # rendered frame (the first box-drawing row = the strip height), never a compiled-in constant.
    session="$1"
    "$BUN" "$ROOT/scripts/frame-content-offset.mjs" "$(frame_path "$session")"
    ;;
  status)
    cat "$STATUS" 2>/dev/null || echo "(no status)"
    ;;
  field)
    # field <session> <name> (2 args) or legacy field <name> (reads the shared default file).
    if [ $# -ge 2 ]; then STATUS="$(status_path "$1")"; shift; fi
    _field "$1"
    ;;
  kill)
    if tmux has-session -t "$1" 2>/dev/null; then
      kill_session_and_descendants "$1"
      echo "killed $1"
    else
      echo "no session $1"
    fi
    rm -f \
      "$(settle_frame_baseline_path "$1")" \
      "$(settle_screen_baseline_path "$1")" \
      "$(settle_screen_current_path "$1")"
    ;;
  *)
    echo "usage: tui-harness.sh {launch|ready|settle|send|capture|status|field|kill} ..." >&2
    exit 2
    ;;
esac

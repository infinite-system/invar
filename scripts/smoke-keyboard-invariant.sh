#!/usr/bin/env bash
# THE KEYBOARD INVARIANT, DRIVEN (#91 / #93 / #101). One smoke for the one rule: the focused surface
# owns the keystroke, and the host may only take a chord from the justified reserved set.
#
#   A) deterministic layer: the binding table's own audits (reserved warrants, no unmodified global
#      claim, no F-key primary, the platform substitution) + the indent arithmetic.
#   B) TAB BELONGS TO THE EDITOR: drive Tab / Shift+Tab in a real editor and assert the DOCUMENT
#      changed, and that focus did not move.
#   C) EVERY RETIRED F-KEY'S REPLACEMENT ARRIVES: drive each new chord through the real PTY and assert
#      the app ACTED. A chord that fails here is reported, not assumed away.
#   D) PASS-THROUGH: run a raw-key byte reporter INSIDE the integrated terminal and diff the bytes it
#      received against the bytes a real terminal sends for each driven chord — the sent-vs-received
#      table for #101.
#   E) RESERVED CHORDS ARE STILL STOLEN: from inside that same focused terminal, the panel toggle
#      hides the panel and quit quits (the trap-avoidance warrant, driven).
#
# Usage: scripts/smoke-keyboard-invariant.sh
#
# invariant: Harness teardown bypasses product quit confirmation only when declared (scripts/harness/harness.invariants.md)
set -uo pipefail
DIRECTORY="$(cd "$(dirname "$0")" && pwd)"
HARNESS="$DIRECTORY/tui-harness.sh"
REPOSITORY_ROOT="$(cd "$DIRECTORY/.." && pwd)"
SESSION="smoke-keyboard-$$"
BUN="${BUN:-$HOME/.bun/bin/bun}"
WORKSPACE="$(mktemp -d "${TMPDIR:-/tmp}/invar-keyboard-XXXXXX")"
RECEIVED_BYTES_PATH="$WORKSPACE/received-key-bytes.txt"
failures=0

field()  { "$HARNESS" field "$SESSION" "$1"; }
pass()   { echo "  PASS  $1"; }
fail()   { echo "  FAIL  $1"; failures=1; }
check()  { if [ "$2" = "$3" ]; then pass "$1 ($2)"; else fail "$1: got '$2' want '$3'"; fi; }

cleanup() {
  "$HARNESS" kill "$SESSION" >/dev/null 2>&1
  rm -rf "$WORKSPACE"
}
trap cleanup EXIT INT TERM

# Wait until a STATUS FIELD satisfies a predicate — the wait observes exactly what the assertion then
# reads, so there is never a bare sleep between a drive and its assertion.
await_field() {
  local field_name="$1" expected_value="$2" description="$3" attempts="${4:-60}"
  local observed_value=''
  for _attempt in $(seq 1 "$attempts"); do
    observed_value="$(field "$field_name")"
    if [ "$observed_value" = "$expected_value" ]; then return 0; fi
    sleep 0.25
  done
  fail "$description (field $field_name stayed '$observed_value', wanted '$expected_value')"
  return 1
}

await_field_change() {
  local field_name="$1" previous_value="$2" description="$3" attempts="${4:-60}"
  local observed_value=''
  for _attempt in $(seq 1 "$attempts"); do
    observed_value="$(field "$field_name")"
    if [ "$observed_value" != "$previous_value" ]; then return 0; fi
    sleep 0.25
  done
  fail "$description (field $field_name never left '$previous_value')"
  return 1
}

# --- A) deterministic layer ----------------------------------------------------------------------
echo "== A) the binding table's own audits + the indent arithmetic (no shell) =="
if "$BUN" test src/modules/keybindings/ src/modules/editor/EditorIndent.test.ts \
    >"$WORKSPACE/unit.log" 2>&1; then
  pass "reserved warrants, no unmodified global claim, no F-key primary, platform substitution, indent arithmetic"
else
  fail "keybinding/indent unit layer"; tail -30 "$WORKSPACE/unit.log"
fi

# --- B) Tab belongs to the editor ----------------------------------------------------------------
# No trailing newline: the document is then exactly the three lines the assertions name.
printf 'const alpha = 1;\nconst beta = 2;\nconst gamma = 3;' >"$WORKSPACE/indent-me.ts"

echo "== B) launch on a real file and give the EDITOR focus =="
"$HARNESS" launch "$SESSION" 120x40 env TUI_FRAME_DUMP=1 INVAR_AGENT_BACKEND=echo \
  INVAR_HARNESS_DIRECT_QUIT=1 \
  bun run src/main.ts "$WORKSPACE" >/dev/null
if "$HARNESS" ready "$SESSION" 30 >/dev/null; then pass "boot: ready+quiescent"; else
  fail "boot never ready"; "$HARNESS" capture "$SESSION"; exit 1
fi
# Open the fixture from the file tree — the same path a user takes. Ctrl+Shift+E focuses the
# Explorer deterministically, then Enter/Down walks to the one file in the workspace.
"$HARNESS" chord "$SESSION" Control+Shift+e >/dev/null
await_field focus 'files' 'Ctrl+Shift+E focused the Explorer' || true
for _attempt in $(seq 1 8); do
  [ -n "$(field editorLines)" ] && break
  "$HARNESS" send "$SESSION" Enter >/dev/null
  "$HARNESS" settle "$SESSION" 5 >/dev/null 2>&1
  [ -n "$(field editorLines)" ] && break
  "$HARNESS" send "$SESSION" Down >/dev/null
  "$HARNESS" settle "$SESSION" 5 >/dev/null 2>&1
done
await_field editorLines 'const alpha = 1;,const beta = 2;,const gamma = 3;' \
  'the fixture opened in the editor' || true
if [ "$(field focus)" != "editor" ]; then
  "$HARNESS" chord "$SESSION" Control+Shift+j >/dev/null
  await_field focus 'editor' 'Ctrl+Shift+J moved focus to the editor' || true
fi
check "editor holds focus" "$(field focus)" "editor"
check "the caret is on the first line" "$(field cursorLineIndex)" "0"

echo "== Tab INDENTS at the caret and does NOT move focus (#91) =="
"$HARNESS" send "$SESSION" Tab >/dev/null
await_field editorLines '  const alpha = 1;,const beta = 2;,const gamma = 3;' \
  'Tab indented the caret line' \
  && pass "Tab indented the caret line by the file's own two-space unit"
check "Tab did not move focus" "$(field focus)" "editor"

echo "== Shift+Tab OUTDENTS the same line =="
"$HARNESS" send "$SESSION" BTab >/dev/null
await_field editorLines 'const alpha = 1;,const beta = 2;,const gamma = 3;' \
  'Shift+Tab outdented the caret line' \
  && pass "Shift+Tab removed exactly one indent unit"

echo "== Tab indents a MULTI-LINE selection as a block =="
"$HARNESS" send "$SESSION" S-Down >/dev/null
"$HARNESS" send "$SESSION" S-Down >/dev/null
check "a selection is live" "$(field hasSelection)" "true"
"$HARNESS" send "$SESSION" Tab >/dev/null
await_field editorLines '  const alpha = 1;,  const beta = 2;,  const gamma = 3;' \
  'Tab indented every selected line' \
  && pass "Tab indented all three selected lines as one block"
check "the selection survived the block indent" "$(field hasSelection)" "true"
"$HARNESS" send "$SESSION" BTab >/dev/null
await_field editorLines 'const alpha = 1;,const beta = 2;,const gamma = 3;' \
  'Shift+Tab outdented the whole block' \
  && pass "Shift+Tab outdented all three selected lines"

# --- C) every retired F-key's replacement chord arrives ------------------------------------------
echo "== C) Ctrl+Shift+P (was F1) opens the command palette =="
"$HARNESS" chord "$SESSION" Control+Shift+p >/dev/null
await_field overlay 'palette' 'Ctrl+Shift+P opened the palette' \
  && pass "Ctrl+Shift+P arrived and opened the palette"
"$HARNESS" send "$SESSION" Escape >/dev/null
await_field overlay 'null' 'Escape closed the palette' || true

echo "== Ctrl+Shift+H (was Shift+F1) opens the shortcut cheat-sheet =="
"$HARNESS" chord "$SESSION" Control+Shift+h >/dev/null
await_field shortcutHelpOpen 'true' 'Ctrl+Shift+H opened the cheat-sheet' \
  && pass "Ctrl+Shift+H arrived and opened the cheat-sheet"
"$HARNESS" send "$SESSION" Escape >/dev/null
await_field shortcutHelpOpen 'false' 'Escape closed the cheat-sheet' || true

echo "== Ctrl+Shift+J (was Tab) toggles sidebar/editor focus =="
focus_before_toggle="$(field focus)"
"$HARNESS" chord "$SESSION" Control+Shift+j >/dev/null
await_field_change focus "$focus_before_toggle" 'Ctrl+Shift+J moved focus' \
  && pass "Ctrl+Shift+J arrived and moved focus ($focus_before_toggle -> $(field focus))"
if [ "$(field focus)" != "editor" ]; then
  "$HARNESS" chord "$SESSION" Control+Shift+j >/dev/null
  await_field focus 'editor' 'focus returned to the editor' || true
fi

echo "== Ctrl+Shift+Down (was F7) ARRIVES — in the editor it is jump-down =="
# The chord's DELIVERY is what needs driving here. Its OTHER meaning — jump to the next change — lives
# in the comparison surface (GitComparisonContent.handleKey), which owns editor keys while it holds the
# editor column; the host floor names no plugin action, which the unit layer above asserts.
# Park the caret at the document start first: jump-down from the LAST line has nowhere to go, and a
# predicate that is already true before the action proves nothing.
"$HARNESS" chord "$SESSION" Control+Home >/dev/null
await_field cursorLineIndex '0' 'Ctrl+Home parked the caret at the document start' || true
cursor_line_before_jump="$(field cursorLineIndex)"
"$HARNESS" chord "$SESSION" Control+Shift+Down >/dev/null
await_field_change cursorLineIndex "$cursor_line_before_jump" \
  'Ctrl+Shift+Down arrived at the editor' \
  && pass "Ctrl+Shift+Down arrived ($cursor_line_before_jump -> $(field cursorLineIndex))"

echo "== Ctrl+Shift+S (was F9) splits the bottom panel =="
"$HARNESS" chord "$SESSION" Control+Shift+s >/dev/null
await_field panelCellLabels 'Agent,Terminal' 'Ctrl+Shift+S split the panel' \
  && pass "Ctrl+Shift+S arrived and split the panel into agent | terminal"

echo "== Ctrl+Shift+M (was F6) cycles the agent's terminal-follow mode =="
# The agent cell must hold focus for the agent context to own the chord — that IS the invariant.
follow_mode_before="$(field terminalFollowMode)"
if [ "$(field panelFocusedIndex)" != "0" ]; then
  "$HARNESS" chord "$SESSION" Control+Shift+a >/dev/null
  await_field panelFocusedIndex '0' 'the agent cell took focus' || true
fi
"$HARNESS" chord "$SESSION" Control+Shift+m >/dev/null
await_field_change terminalFollowMode "$follow_mode_before" \
  'Ctrl+Shift+M arrived at the focused agent pane' \
  && pass "Ctrl+Shift+M arrived and cycled the follow mode ($follow_mode_before -> $(field terminalFollowMode))"

echo "== Ctrl+Shift+A closes the focused agent pane and leaves the terminal =="
# Alt+PageDown now cycles workspace content spaces. The agent's own toggle is the direct keyboard
# path that closes its pane before the terminal pass-through sweep.
"$HARNESS" chord "$SESSION" Control+Shift+a >/dev/null
await_field panelCellLabels 'Terminal' 'Ctrl+Shift+A closed the agent pane' \
  && pass "Ctrl+Shift+A left one terminal pane"
await_field terminalFocused 'true' 'the remaining terminal pane took focus' || true
echo "  note: Ctrl+] (was F12) arrival is driven by scripts/smoke-goto-definition.sh against a real LSP"

# --- D) pass-through: sent vs received ------------------------------------------------------------
echo "== D) PASS-THROUGH: a raw-key byte reporter inside the integrated terminal =="
# Focus the terminal cell, then start the reporter. Its READY line lands in the file the assertions
# read, so the wait observes the same state.
# The reporter would otherwise be typed into the AGENT composer, so the terminal must be the focused
# cell before a single byte is sent.
if [ "$(field terminalVisible)" != "true" ]; then
  "$HARNESS" chord "$SESSION" Control+j >/dev/null
  await_field terminalVisible 'true' 'Ctrl+J showed the panel' || true
fi
await_field terminalFocused 'true' 'the terminal cell holds focus' || true
check "the focused panel content is the terminal" "$(field panelActiveContentLabel)" "Terminal"
# ABSOLUTE path: the integrated terminal's cwd is the WORKSPACE, not the repository.
tmux send-keys -t "$SESSION" -l \
  "bun '$REPOSITORY_ROOT/scripts/harness/report-received-key-bytes.ts' '$RECEIVED_BYTES_PATH'" 2>/dev/null
"$HARNESS" send "$SESSION" Enter >/dev/null
reporter_ready=0
for _attempt in $(seq 1 80); do
  if [ -s "$RECEIVED_BYTES_PATH" ] && grep -q '^ready$' "$RECEIVED_BYTES_PATH"; then
    reporter_ready=1; break
  fi
  sleep 0.25
done
if [ "$reporter_ready" = 1 ]; then pass "the raw-key reporter is live inside the terminal"; else
  fail "the raw-key reporter never reported ready"; "$HARNESS" capture "$SESSION" | tail -20
fi

# chord | the bytes a REAL TERMINAL sends for it (what the child must receive) | expectation
#   through: the child must receive exactly those bytes.
#   stolen:  the host is entitled to it (reserved set) — the child must receive NOTHING.
#   collapsed: a real terminal without modifyOtherKeys cannot express the extra modifier either, so
#              the child sees the plainer chord. A substrate limit, recorded rather than hidden.
#   unencodable: the encoder has no canonical VT form, so nothing reaches the child, deliberately.
passthrough_specification=$(cat <<'SPEC'
a|61|through
z|7a|through
1|31|through
Control+a|01|through
Control+c|03|through
Control+d|04|through
Control+e|05|through
Control+k|0b|through
Control+l|0c|through
Control+r|12|through
Control+u|15|through
Control+w|17|through
Control+z|1a|through
Tab|09|through
Shift+Tab|1b 5b 5a|through
Enter|0d|through
Backspace|7f|through
Escape|1b|through
Space|20|through
Up|1b 5b 41|through
Down|1b 5b 42|through
Right|1b 5b 43|through
Left|1b 5b 44|through
Home|1b 5b 48|through
End|1b 5b 46|through
PageUp|1b 5b 35 7e|through
PageDown|1b 5b 36 7e|through
Delete|1b 5b 33 7e|through
Insert|1b 5b 32 7e|through
Alt+b|1b 62|through
Alt+f|1b 66|through
Control+p|10|through
Control+f|06|through
Control+s|13|through
Control+Shift+p|10|collapsed
Control+Tab|09|collapsed
F1||unencodable
F5||unencodable
SPEC
)

read_received_bytes_since() {
  local starting_line_count="$1"
  tail -n "+$((starting_line_count + 1))" "$RECEIVED_BYTES_PATH" 2>/dev/null \
    | tr '\n' ' ' | sed 's/  */ /g; s/^ //; s/ $//'
}

echo "  chord                  expected-bytes        received-bytes        verdict"
passthrough_table="$WORKSPACE/passthrough-table.txt"
: >"$passthrough_table"
while IFS='|' read -r chord_name expected_bytes expectation; do
  [ -n "$chord_name" ] || continue
  line_count_before="$(wc -l <"$RECEIVED_BYTES_PATH" 2>/dev/null | tr -d ' ')"
  "$HARNESS" chord "$SESSION" "$chord_name" >/dev/null 2>&1 \
    || { fail "the harness could not even ENCODE $chord_name"; continue; }
  received_bytes=''
  for _attempt in $(seq 1 12); do
    received_bytes="$(read_received_bytes_since "$line_count_before")"
    if [ -n "$received_bytes" ] || [ "$expectation" != "through" ]; then break; fi
    sleep 0.2
  done
  case "$expectation" in
    through)
      if [ "$received_bytes" = "$expected_bytes" ]; then verdict='THROUGH'
      else verdict='MISMATCH'; failures=1; fi
      ;;
    collapsed)
      if [ "$received_bytes" = "$expected_bytes" ]; then verdict='COLLAPSED (terminal limit)'
      else verdict='MISMATCH'; failures=1; fi
      ;;
    unencodable)
      if [ -z "$received_bytes" ]; then verdict='NOT-ENCODED (expected)'
      else verdict="LEAKED ($received_bytes)"; failures=1; fi
      ;;
    *) verdict="UNKNOWN-EXPECTATION"; failures=1;;
  esac
  printf '  %-22s %-21s %-21s %s\n' \
    "$chord_name" "${expected_bytes:-(none)}" "${received_bytes:-(none)}" "$verdict" \
    | tee -a "$passthrough_table"
done <<<"$passthrough_specification"

if grep -qE 'MISMATCH|LEAKED|UNKNOWN' "$passthrough_table"; then
  fail "the pass-through sweep found chords that do not round-trip as specified"
else
  pass "every non-reserved chord in the sweep reached the child exactly as a real terminal sends it"
fi

# --- E) reserved chords are still stolen from the focused terminal --------------------------------
echo "== E) the reserved set still overrides a focused terminal (trap avoidance, driven) =="
line_count_before_reserved="$(wc -l <"$RECEIVED_BYTES_PATH" 2>/dev/null | tr -d ' ')"
"$HARNESS" chord "$SESSION" Control+j >/dev/null
if await_field terminalVisible 'false' 'Ctrl+J hid the panel from inside the focused terminal'; then
  stolen_bytes="$(read_received_bytes_since "$line_count_before_reserved")"
  if [ -z "$stolen_bytes" ]; then
    pass "Ctrl+J was taken by the host and NOTHING leaked to the child"
  else
    fail "Ctrl+J both toggled the panel and leaked to the child ($stolen_bytes)"
  fi
fi

echo "== Ctrl+Q quits from INSIDE the focused terminal (the trap-avoidance warrant) =="
"$HARNESS" chord "$SESSION" Control+j >/dev/null
await_field terminalFocused 'true' 'Ctrl+J re-opened and focused the terminal' || true
check "the terminal holds focus before the quit" "$(field terminalFocused)" "true"
"$HARNESS" chord "$SESSION" Control+q >/dev/null
# The verdict is the PANE'S RUNNING COMMAND: when the app exits, the pane's foreground process falls
# back to the launching shell. That is the same state the assertion reads, so no sleep is involved.
application_exited=0
for _attempt in $(seq 1 60); do
  if ! tmux has-session -t "$SESSION" 2>/dev/null; then application_exited=1; break; fi
  pane_command="$(tmux display-message -p -t "$SESSION" '#{pane_current_command}' 2>/dev/null || true)"
  case "$pane_command" in
    bash|sh|zsh|fish) application_exited=1; break;;
  esac
  sleep 0.25
done
if [ "$application_exited" = 1 ]; then
  pass "Ctrl+Q quit the app from inside the focused terminal"
else
  fail "Ctrl+Q did not quit from the focused terminal (pane command '$pane_command')"
  "$HARNESS" capture "$SESSION" | tail -6
fi

echo
if [ "$failures" = 0 ]; then
  echo "smoke-keyboard-invariant: PASS"
else
  echo "smoke-keyboard-invariant: FAIL"
fi
exit "$failures"

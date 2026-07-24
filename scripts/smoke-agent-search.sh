#!/usr/bin/env bash
# Agent transcript search smoke (mouse icon + Ctrl+F) — the search-is-one-more-projection gate.
# Two layers, mirroring smoke-agent.sh:
#   A) deterministic pipeline tests (entries -> projection -> mirror document -> FindInBuffer ->
#      display-cell spans) via `bun test` — collapsed-summary scope + CJK display-cell math, hermetic.
#   B) ONE real drive: seed a multi-turn transcript through the EchoAgentBackend, CLICK the themed
#      mode-line search icon via mouse injection, type a query, then close and re-open through Ctrl+F.
#      Status fields + FrameProbe cells prove both triggers bind the SAME shared FindBar transcript
#      target with a live count, matches highlight in the pane (current = selection bg, others = the
#      editor's find-match bg), Enter cycles + the viewport follows, Esc returns keys to the composer,
#      and the pane stays idle-quiescent with the bar open.
# invariant-gate: Transcript search is a projection of the transcript (src/modules/agent/agent.invariants.md)
set -uo pipefail
DIR="$(cd "$(dirname "$0")" && pwd)"
H="$DIR/tui-harness.sh"
ROOT="$(cd "$DIR/.." && pwd)"
export PATH="$HOME/.bun/bin:$PATH"
S="smoke-agent-search-$$"
BUN="$HOME/.bun/bin/bun"
# Per-run HOME: deterministic DARK palette for the exact-bg asserts + no shared-settings leakage.
TEST_HOME="$(mktemp -d /tmp/tui-agent-search-home.XXXXXX)"
fail=0
f()   { "$H" field "$S" "$1"; }
chk() { if [ "$2" = "$3" ]; then echo "  PASS  $1 ($2)"; else echo "  FAIL  $1: got '$2' want '$3'"; fail=1; fi; }
has() { if "$H" capture "$S" | grep -qF "$2"; then echo "  PASS  $1"; else echo "  FAIL  $1 (no '$2' in pane)"; "$H" capture "$S" | tail -14; fail=1; fi; }
# Ctrl+Shift+A in modifyOtherKeys form (97 = 'a') — the panel.toggleAgent chord (smoke-agent idiom).
toggle_agent() { tmux send-keys -t "$S" -l "$(printf '\033[27;6;97~')"; sleep 0.3; "$H" settle "$S" >/dev/null 2>&1; }
send_turn() { "$H" send "$S" -l "$1" >/dev/null; sleep 0.1; "$H" send "$S" Enter >/dev/null; sleep 0.4; }

trap '"$H" kill "$S" >/dev/null 2>&1; rm -rf "$TEST_HOME"' EXIT INT TERM

echo "== A) deterministic match-projection pipeline (no subprocess) =="
if "$BUN" test src/modules/agent/AgentTranscriptSearch.test.ts >/tmp/agent-search-unit-$$.log 2>&1; then
  echo "  PASS  transcript-search unit tests (projection scope, display cells, current-match cycling)"
else
  echo "  FAIL  transcript-search unit tests"; tail -25 /tmp/agent-search-unit-$$.log; fail=1
fi
rm -f /tmp/agent-search-unit-$$.log

echo "== B) launch (echo backend, truecolor, unicode glyphs, isolated HOME) + open the agent pane =="
mkdir -p "$TEST_HOME/.config/invar"
printf '{"glyphMode":"unicode"}\n' > "$TEST_HOME/.config/invar/settings.json"
"$H" launch "$S" 120x40 env HOME="$TEST_HOME" TUI_FRAME_DUMP=1 COLORTERM=truecolor INVAR_AGENT_BACKEND=echo bun run src/main.ts "$ROOT/fixtures" >/dev/null
if "$H" ready "$S" 20 >/dev/null; then echo "  PASS  boot: ready+quiescent"; else
  echo "  FAIL  boot never ready"; "$H" capture "$S"; exit 1
fi
toggle_agent
chk "agent pane focused" "$(f panelActiveContent)" "agent"

echo "== seed a multi-turn transcript (needle at the TOP and the BOTTOM, fillers between) =="
send_turn "alpha needle one"
for filler_turn in "filler two" "filler three" "filler four" "filler five" "filler six"; do send_turn "$filler_turn"; done
send_turn "omega needle last"
"$H" settle "$S" >/dev/null 2>&1
chk "transcript tail-anchored after seeding" "$(f agentStuckToBottom)" "true"

echo "== CLICK the themed mode-line search icon; it opens the SHARED transcript FindBar =="
# Find the unicode search token in tmux's exact cell capture, then inject a real SGR mouse
# press+release on that painted cell. FrameProbe remaps symbols to astral code points in its JSON, so
# the literal glyph is intentionally resolved from capture; FrameProbe remains the visual assertion
# channel below for the highlight backgrounds.
read -r search_icon_column mode_line_row <<<"$(tmux capture-pane -p -t "$S" | "$BUN" -e '
  const rows = (await Bun.stdin.text()).split("\n");
  for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
    const characters = Array.from(rows[rowIndex]);
    const column = characters.indexOf("⌕");
    if (column >= 0 && rows[rowIndex].includes("engine:")) {
      process.stdout.write(`${column} ${rowIndex}`);
      process.exit(0);
    }
  }
  process.stdout.write("-1 -1");
')"
if [ "${search_icon_column:-'-1'}" -ge 0 ] 2>/dev/null && [ "${mode_line_row:-'-1'}" -ge 0 ] 2>/dev/null; then
  echo "  PASS  themed search icon is painted at ($search_icon_column,$mode_line_row)"
  "$H" click "$S" "$search_icon_column" "$mode_line_row" >/dev/null
  sleep 0.3
else
  echo "  FAIL  could not locate themed search icon in the mode line"
  fail=1
fi
"$H" settle "$S" >/dev/null 2>&1
chk "mouse click opened the find bar" "$(f findOpen)" "true"
chk "mouse click bound the transcript target" "$(f findTarget)" "agent-transcript"

echo "== typing after the click finds transcript matches live =="
for query_character in n e e d l e; do "$H" send "$S" "$query_character" >/dev/null; sleep 0.06; done
sleep 0.5; "$H" settle "$S" >/dev/null 2>&1
chk "live query" "$(f findQuery)" "needle"
# 2 user turns + 2 echoed replies each quote the needle = 4 matches.
chk "live match count over user + assistant rows" "$(f findMatchCount)" "4"
has "the bar renders the count (one search vocabulary)" "1 of 4"
chk "reveal jumped the viewport OFF the tail to the first match" "$(f agentStuckToBottom)" "false"
chk "first match is at the transcript top" "$(f agentScrollTop)" "0"

echo "== Ctrl+F still opens the SAME transcript FindBar post-rebase =="
"$H" send "$S" Escape >/dev/null; sleep 0.3
chk "find bar closed before keyboard check" "$(f findOpen)" "false"
"$H" send "$S" C-f >/dev/null; sleep 0.4; "$H" settle "$S" >/dev/null 2>&1
chk "Ctrl+F reopened the find bar" "$(f findOpen)" "true"
chk "Ctrl+F bound the transcript target" "$(f findTarget)" "agent-transcript"
chk "Ctrl+F retained the shared target query" "$(f findQuery)" "needle"
chk "Ctrl+F retained the shared target matches" "$(f findMatchCount)" "4"

echo "== FrameProbe: matches HIGHLIGHT in the pane (current = selection bg, others = find-match bg) =="
# Index frame rows by CODE POINTS (astral-remapped glyphs), never UTF-16. DARK palette:
# selection #2b2f41 = 43,47,65 (current match), cursorLine #1e202e = 30,32,46 (other matches).
highlight_verdict="$("$BUN" -e '
  const frame = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"));
  const SELECTION_BG = "43,47,65,255";
  const MATCH_BG = "30,32,46,255";
  let currentMatchRows = 0;
  let otherMatchRows = 0;
  for (const row of frame.rows) {
    const needleOffset = row.text.indexOf("needle");
    if (needleOffset < 0) continue;
    const cellIndex = Array.from(row.text.slice(0, needleOffset)).length;
    const matchBackground = row.bg[cellIndex];
    if (matchBackground === SELECTION_BG) currentMatchRows += 1;
    else if (matchBackground === MATCH_BG) otherMatchRows += 1;
  }
  process.stdout.write(currentMatchRows >= 1 && otherMatchRows >= 1 ? "highlighted" : `MISSING current=${currentMatchRows} other=${otherMatchRows}`);
' "$ROOT/artifacts/frame-$S.json")"
chk "current match paints the selection bg AND another match paints the find-match bg" "$highlight_verdict" "highlighted"

echo "== Enter cycles matches; the viewport FOLLOWS to the far match =="
"$H" send "$S" Enter >/dev/null; sleep 0.3
chk "Enter advances the current match" "$(f findCurrentMatchIndex)" "1"
"$H" send "$S" Enter >/dev/null; sleep 0.3
"$H" send "$S" Enter >/dev/null; sleep 0.4; "$H" settle "$S" >/dev/null 2>&1
chk "cycled to the LAST match" "$(f findCurrentMatchIndex)" "3"
followed_top="$(f agentScrollTop)"
if [ "${followed_top:-0}" -gt 0 ] 2>/dev/null; then echo "  PASS  viewport followed the jump (agentScrollTop $followed_top > 0)"; else
  echo "  FAIL  viewport did not follow (agentScrollTop '$followed_top')"; fail=1; fi
has "the far match's row is on screen" "omega needle last"

echo "== idle quiescence WITH the search bar open (frame delta <= 1 over 4s) =="
"$H" settle "$S" >/dev/null 2>&1
idle_start="$(f frame)"; sleep 4; idle_end="$(f frame)"
idle_delta=$(( idle_end - idle_start ))
if [ "$idle_delta" -le 1 ]; then echo "  PASS  idle frame delta <= 1 with the bar open (frame $idle_start -> $idle_end)"; else
  echo "  FAIL  idle loop ticking with the search bar open: +$idle_delta over 4s"; fail=1; fi

echo "== Esc closes the bar and returns the keys to the COMPOSER =="
"$H" send "$S" Escape >/dev/null; sleep 0.3
chk "find bar closed on Esc" "$(f findOpen)" "false"
"$H" send "$S" -l "after esc" >/dev/null; sleep 0.3; "$H" settle "$S" >/dev/null 2>&1
has "typing after Esc lands in the composer" "❯ after esc"

echo "== clicking the icon again reopens the retained transcript target =="
"$H" click "$S" "$search_icon_column" "$mode_line_row" >/dev/null; sleep 0.4; "$H" settle "$S" >/dev/null 2>&1
chk "query retained across icon reopen" "$(f findQuery)" "needle"
chk "matches re-derived over the CURRENT transcript" "$(f findMatchCount)" "4"

echo "== RESULT: $([ "$fail" = 0 ] && echo ALL-PASS || echo FAILURES) =="
exit "$fail"

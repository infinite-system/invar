#!/usr/bin/env bash
# Clickable file references in the agent transcript (experiment tier-S) — drives the REAL user path:
#   A) deterministic detection-seam unit tests (pure syntax; resolver-gated projection; click routing).
#   B) live drive: EchoAgentBackend's INVAR_AGENT_ECHO_FILEREF path replies with a path:line mention +
#      a scripted Read tool-use carrying the real file_path. FrameProbe asserts the LINK AFFORDANCE
#      (accent fg + underline attr on exactly the reference span); a harness CLICK on the span opens
#      the file in a real tab at the line (status probe: activeBuffer + cursorLineIndex + editor
#      focus); a NON-reference click still toggles the tool row; a non-resolving path gets NO
#      affordance and no navigation; idle stays quiescent (frame delta <= 1).
#
# invariant: File references in the transcript are clickable projections (src/modules/agent/agent.invariants.md)
set -uo pipefail
DIR="$(cd "$(dirname "$0")" && pwd)"
H="$DIR/tui-harness.sh"
ROOT="$(cd "$DIR/.." && pwd)"
S="smoke-fileref-$$"
BUN="$HOME/.bun/bin/bun"
FIX="$(mktemp -d /tmp/fileref-fixture-XXXX)"
fail=0
f()   { "$H" field "$S" "$1"; }
chk() { if [ "$2" = "$3" ]; then echo "  PASS  $1 ($2)"; else echo "  FAIL  $1: got '$2' want '$3'"; fail=1; fi; }
has() { if "$H" capture "$S" | grep -qF "$2"; then echo "  PASS  $1"; else echo "  FAIL  $1 (no '$2' in pane)"; "$H" capture "$S" | tail -16; fail=1; fi; }
row_of() { local n; n="$("$H" capture "$S" | grep -nF "$1" | head -1 | cut -d: -f1)"; [ -n "$n" ] && echo $((n-1)); }
toggle_agent() { tmux send-keys -t "$S" -l "$(printf '\033[27;6;97~')"; sleep 0.3; "$H" settle "$S" >/dev/null 2>&1; }
submit() { "$H" send "$S" -l "$1" >/dev/null; sleep 0.15; "$H" send "$S" Enter >/dev/null; sleep 0.3; "$H" settle "$S" >/dev/null 2>&1; }
# Screen x (code points == columns on these all-narrow rows) of `needle` on screen row $1, or empty.
col_of() { "$H" capture "$S" | sed -n "$(($1+1))p" | NEEDLE="$2" "$BUN" -e '
  const line = require("fs").readFileSync(0, "utf8").replace(/\n+$/, "");
  const cells = Array.from(line);
  const needle = Array.from(process.env.NEEDLE ?? "");
  outer: for (let start = 0; start + needle.length <= cells.length; start += 1) {
    for (let offset = 0; offset < needle.length; offset += 1) if (cells[start + offset] !== needle[offset]) continue outer;
    process.stdout.write(String(start)); process.exit(0);
  }
  process.stdout.write("");'; }

trap '"$H" kill "$S" >/dev/null 2>&1; rm -rf "$FIX"' EXIT INT TERM

echo "== A) deterministic unit tests (detection seam + projection spans + click routing) =="
if "$BUN" test src/modules/agent/AgentFileReferences.test.ts src/modules/agent/AgentTranscriptProjection.test.ts src/modules/agent/AgentPaneContent.test.ts >/tmp/fileref-unit-$$.log 2>&1; then
  echo "  PASS  detection/projection/click unit tests"
else
  echo "  FAIL  unit tests"; tail -25 /tmp/fileref-unit-$$.log; fail=1
fi
rm -f /tmp/fileref-unit-$$.log

echo "== B) launch on a scratch workspace with a REAL fixture file =="
mkdir -p "$FIX/src"
printf '// demo fixture\nexport function greet(name: string): string {\n  const message = `hello ` + name;\n  return message;\n}\n' > "$FIX/src/demo.ts"
( cd "$FIX" && git init -q )
# COLORTERM=truecolor so accent-vs-text fg colours stay distinct in the frame dump (no quantization).
"$H" launch "$S" 110x34 env TUI_FRAME_DUMP=1 COLORTERM=truecolor INVAR_AGENT_BACKEND=echo INVAR_AGENT_ECHO_FILEREF=1 bun run src/main.ts "$FIX" >/dev/null
if "$H" ready "$S" 20 >/dev/null; then echo "  PASS  boot"; else echo "  FAIL  boot"; "$H" capture "$S"; exit 1; fi
toggle_agent
chk "agent pane open + focused" "$(f terminalFocused)" "true"

echo "== seed the transcript: assistant path:line mention + a Read tool row with file_path =="
submit "src/demo.ts:4"
has "assistant mentions the reference" "Take a look at src/demo.ts:4"
has "tool summary shows the basename" "Reading demo.ts"

echo "== FrameProbe: the reference span carries the link affordance (fg + attrs differ from prose) =="
affordance="$("$BUN" -e '
  const frame = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"));
  const row = frame.rows.find((candidate) => candidate.text.includes("Take a look at"));
  if (!row) { process.stdout.write("NO-ROW"); process.exit(0); }
  const cells = Array.from(row.text);
  const spanCells = Array.from("src/demo.ts:4");
  let spanStart = -1;
  outer: for (let start = 0; start + spanCells.length <= cells.length; start += 1) {
    for (let offset = 0; offset < spanCells.length; offset += 1) if (cells[start + offset] !== spanCells[offset]) continue outer;
    spanStart = start; break;
  }
  const proseStart = cells.join("").indexOf("Take");
  if (spanStart < 0 || proseStart < 0) { process.stdout.write("NO-SPAN"); process.exit(0); }
  const spanEnd = spanStart + spanCells.length;
  const linkFg = row.fg[spanStart + 1];
  const uniformFg = row.fg.slice(spanStart, spanEnd).every((cellFg) => cellFg === linkFg);
  const uniformAttr = row.attrs.slice(spanStart, spanEnd).every((cellAttr) => cellAttr === row.attrs[spanStart]);
  const fgDiffers = linkFg !== row.fg[proseStart];
  const attrDiffers = row.attrs[spanStart] !== row.attrs[proseStart];
  const outsideReverts = row.fg[spanEnd + 1] === row.fg[proseStart]; // " for" after the span is prose again
  process.stdout.write([fgDiffers, attrDiffers, uniformFg, uniformAttr, outsideReverts].join("|"));
' "$ROOT/artifacts/frame-$S.json")"
chk "span fg=accent + underline attr + uniform + bounded to the span" "$affordance" "true|true|true|true|true"

echo "== CLICK the path span: the file opens in a real tab, cursor on line 4, editor takes focus =="
ref_y="$(row_of 'Take a look at')"
ref_x="$(col_of "$ref_y" 'src/demo.ts:4')"
if [ -n "$ref_y" ] && [ -n "$ref_x" ]; then
  "$H" click "$S" $((ref_x + 3)) "$ref_y" >/dev/null; sleep 0.4; "$H" settle "$S" >/dev/null 2>&1
  case "$(f activeBuffer)" in *src/demo.ts) echo "  PASS  clicked reference opened src/demo.ts";; *) echo "  FAIL  activeBuffer=$(f activeBuffer)"; fail=1;; esac
  chk "cursor landed on line 4 (0-based 3)" "$(f cursorLineIndex)" "3"
  chk "workspace focus handed to the editor" "$(f focus)" "editor"
  chk "panel blurred after navigation" "$(f terminalFocused)" "false"
else echo "  FAIL  could not locate the reference span (y=$ref_y x=$ref_x)"; fail=1; fi

echo "== a NON-reference click still toggles the tool row (today's behavior preserved) =="
tool_y="$(row_of '▸ ⚙ Read')"
if [ -n "$tool_y" ]; then
  "$H" click "$S" 4 "$tool_y" >/dev/null; sleep 0.3; "$H" settle "$S" >/dev/null 2>&1
  chk "caret-area click EXPANDS the tool row" "$(f agentExpandedCount)" "1"
  tool_y2="$(row_of '▾ ⚙ Read')"
  [ -n "$tool_y2" ] && { "$H" click "$S" 4 "$tool_y2" >/dev/null; sleep 0.3; "$H" settle "$S" >/dev/null 2>&1; }
  chk "second caret-area click collapses it" "$(f agentExpandedCount)" "0"
else echo "  FAIL  could not locate the tool row"; fail=1; fi

echo "== CLICK the tool summary BASENAME: opens the REAL tool-input path (no toggle) =="
tool_y="$(row_of 'Reading demo.ts')"
base_x="$(col_of "$tool_y" 'demo.ts')"
if [ -n "$tool_y" ] && [ -n "$base_x" ]; then
  "$H" click "$S" $((base_x + 2)) "$tool_y" >/dev/null; sleep 0.4; "$H" settle "$S" >/dev/null 2>&1
  case "$(f activeBuffer)" in *src/demo.ts) echo "  PASS  basename click opened the real file_path";; *) echo "  FAIL  activeBuffer=$(f activeBuffer)"; fail=1;; esac
  chk "basename click did NOT toggle the row" "$(f agentExpandedCount)" "0"
  chk "panel blurred again (navigation, not toggle)" "$(f terminalFocused)" "false"
else echo "  FAIL  could not locate the tool basename span (y=$tool_y x=$base_x)"; fail=1; fi

echo "== a NON-RESOLVING path gets NO affordance and no navigation =="
comp_y="$(row_of '❯')"
[ -n "$comp_y" ] && { "$H" click "$S" 6 "$comp_y" >/dev/null; sleep 0.3; "$H" settle "$S" >/dev/null 2>&1; }
submit "src/nope.ts:2"
has "assistant mentions the missing path" "Take a look at src/nope.ts:2"
noref="$("$BUN" -e '
  const frame = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"));
  const row = frame.rows.find((candidate) => candidate.text.includes("Take a look at src/nope.ts:2"));
  if (!row) { process.stdout.write("NO-ROW"); process.exit(0); }
  const cells = Array.from(row.text);
  const spanStart = cells.join("").indexOf("src/nope.ts:2");
  const proseStart = cells.join("").indexOf("Take");
  process.stdout.write(String(row.fg[spanStart + 1] === row.fg[proseStart] && row.attrs[spanStart + 1] === row.attrs[proseStart]));
' "$ROOT/artifacts/frame-$S.json")"
chk "missing path renders as plain prose (no link affordance)" "$noref" "true"
nope_y="$(row_of 'Take a look at src/nope.ts:2')"
nope_x="$(col_of "$nope_y" 'src/nope.ts:2')"
if [ -n "$nope_y" ] && [ -n "$nope_x" ]; then
  "$H" click "$S" $((nope_x + 3)) "$nope_y" >/dev/null; sleep 0.3; "$H" settle "$S" >/dev/null 2>&1
  chk "click on the dead span navigates nowhere (cursor unmoved)" "$(f cursorLineIndex)" "3"
  chk "panel keeps focus (no blur — nothing opened)" "$(f terminalFocused)" "true"
else echo "  FAIL  could not locate the non-resolving span (y=$nope_y x=$nope_x)"; fail=1; fi

echo "== idle quiescence (references add no periodic work) =="
i0="$(f frame)"; sleep 4; i1="$(f frame)"; d=$(( i1 - i0 ))
if [ "$d" -le 1 ]; then echo "  PASS  idle frame delta <= 1 over 4s (frame $i0 -> $i1)"; else echo "  FAIL  idle loop ticking: +$d over 4s"; fail=1; fi

echo "== RESULT: $([ "$fail" = 0 ] && echo ALL-PASS || echo FAILURES) =="
exit "$fail"

#!/usr/bin/env bash
# Themed terminal ANSI colors (Tokyo Night spec §10). Three layers:
#   A) unit: the terminalAnsi* role set — index→role mapping + quantization tiers (bun test).
#   B) truecolor drive: a REAL shell in the terminal pane prints SGR-colored tokens; FrameProbe
#      asserts the rendered cells carry the THEMED hex values (spec red/green/blue, the VISIBLE
#      themed black #363b54 distinct from the pane background, bright-white, and the default
#      foreground = the ANSI-white role #787c99) — not the standard-ANSI table the renderer
#      used to hardcode.
#   C) forced 16-color tier (TERM=xterm, no COLORTERM): the same drive renders the role-PINNED
#      standard ANSI slots — red/green/blue stay pairwise distinct and visible on the black
#      pane background (nearest-RGB quantization would collapse them all into one silver).
# Usage: scripts/smoke-terminal-ansi.sh [fixture-dir]
set -uo pipefail
DIR="$(cd "$(dirname "$0")" && pwd)"
H="$DIR/tui-harness.sh"
ROOT="$(cd "$DIR/.." && pwd)"
BUN="$HOME/.bun/bin/bun"
FIX="${1:-$ROOT/fixtures}"
fail=0
chk() { if [ "$2" = "$3" ]; then echo "  PASS  $1 ($2)"; else echo "  FAIL  $1: got '$2' want '$3'"; fail=1; fi; }
trap '[ -n "${S1:-}" ] && "$H" kill "$S1" >/dev/null 2>&1; [ -n "${S2:-}" ] && "$H" kill "$S2" >/dev/null 2>&1' EXIT INT TERM

# The SGR probe line the child shell prints: named-ANSI red/green/blue/black, bright-white (SGR 97),
# then an unstyled token riding the terminal's DEFAULT foreground.
SGR_LINE="printf '\\033[31mREDTOK\\033[0m \\033[32mGRNTOK\\033[0m \\033[34mBLUTOK\\033[0m \\033[30mBLKTOK\\033[0m \\033[97mBWTTOK\\033[0m PLNTOK\\n'"

# Report, from the frame dump, the fg lane of each token's first cell plus the bg lane under BLKTOK:
#   <fgRED> <fgGRN> <fgBLU> <fgBLK> <fgBWT> <fgPLN> <bgBLK>
# Cells are iterated as CODE POINTS (Array.from) — FrameProbe remaps some glyphs into the astral
# plane, so a raw UTF-16 string index would misalign the per-cell fg/bg arrays. The echoed COMMAND
# line also contains the tokens (as typed text `\033[31mREDTOK…`), so the output row is the one
# where REDTOK is NOT preceded by an `m` cell.
probe() { # <frame-file>
  FRAME_FILE="$1" "$BUN" -e '
const frame = JSON.parse(require("fs").readFileSync(process.env.FRAME_FILE));
const findToken = (cells, token) => {
  const tokenCells = Array.from(token);
  for (let start = 0; start + tokenCells.length <= cells.length; start++) {
    if (tokenCells.every((tokenCell, offset) => cells[start + offset] === tokenCell)) return start;
  }
  return -1;
};
for (const row of frame.rows) {
  const cells = Array.from(row.text || "");
  const redIndex = findToken(cells, "REDTOK");
  if (redIndex < 0) continue;
  if (redIndex > 0 && cells[redIndex - 1] === "m") continue; // the echoed command line, not the output
  const foregrounds = row.fg || [], backgrounds = row.bg || [];
  const report = ["REDTOK", "GRNTOK", "BLUTOK", "BLKTOK", "BWTTOK", "PLNTOK"]
    .map((token) => foregrounds[findToken(cells, token)] || "none");
  report.push(backgrounds[findToken(cells, "BLKTOK")] || "none");
  process.stdout.write(report.join(" "));
  process.exit(0);
}
process.stdout.write("NOROW NOROW NOROW NOROW NOROW NOROW NOROW");
'; }

drive_sgr_line() { # <session>
  "$H" send "$1" F8 >/dev/null
  "$H" settle "$1" >/dev/null 2>&1
  chk "terminal open after F8" "$("$H" field "$1" terminalVisible)" "true"
  sleep 0.8; "$H" settle "$1" >/dev/null 2>&1   # let the shell print its first prompt
  "$H" send "$1" -l "$SGR_LINE" >/dev/null
  "$H" send "$1" Enter >/dev/null
  sleep 0.8; "$H" settle "$1" >/dev/null 2>&1
}

echo "== A) unit: terminal ANSI role set + quantization tiers =="
if "$BUN" test src/modules/theme/__tests__/TerminalAnsiPalette.test.ts >/tmp/term-ansi-unit-$$.log 2>&1; then
  echo "  PASS  terminal ANSI palette unit tests (role mapping, truecolor/256/16 tiers, visibility)"
else
  echo "  FAIL  terminal ANSI palette unit tests"; tail -20 /tmp/term-ansi-unit-$$.log; fail=1
fi
rm -f /tmp/term-ansi-unit-$$.log

echo "== B) truecolor tier: SGR output renders in the THEMED Tokyo Night hexes =="
S1="term-ansi-tc-$$"
"$H" launch "$S1" 120x40 env TUI_FRAME_DUMP=1 COLORTERM=truecolor bun run src/main.ts "$FIX" >/dev/null
if "$H" ready "$S1" 20 >/dev/null; then echo "  PASS  boot: ready+quiescent"; else
  echo "  FAIL  boot never ready"; "$H" capture "$S1"; exit 1
fi
drive_sgr_line "$S1"
read -r fg_red fg_green fg_blue fg_black fg_bright_white fg_plain bg_black <<<"$(probe "$ROOT/artifacts/frame-$S1.json")"
chk "SGR 31 red renders themed #f7768e"            "$fg_red"          "247,118,142,255"
chk "SGR 32 green renders themed #73daca"          "$fg_green"        "115,218,202,255"
chk "SGR 34 blue renders themed #7aa2f7"           "$fg_blue"         "122,162,247,255"
chk "SGR 30 black renders themed VISIBLE #363b54"  "$fg_black"        "54,59,84,255"
chk "SGR 97 bright-white renders themed #acb0d0"   "$fg_bright_white" "172,176,208,255"
chk "default (unstyled) fg is the ANSI-white role #787c99" "$fg_plain" "120,124,153,255"
if [ "$fg_black" != "$bg_black" ] && [ "$fg_black" != "none" ] && [ "$fg_black" != "NOROW" ]; then
  echo "  PASS  themed black is VISIBLE against the terminal background ($fg_black on $bg_black)"
else
  echo "  FAIL  themed black invisible or missing ($fg_black on $bg_black)"; fail=1
fi
"$H" kill "$S1" >/dev/null 2>&1

echo "== C) forced 16-color tier: role-pinned standard slots, distinct and visible =="
S2="term-ansi-16-$$"
"$H" launch "$S2" 120x40 env TUI_FRAME_DUMP=1 COLORTERM= TERM=xterm bun run src/main.ts "$FIX" >/dev/null
if "$H" ready "$S2" 20 >/dev/null; then echo "  PASS  boot at 16-color depth"; else
  echo "  FAIL  boot never ready (16-color)"; "$H" capture "$S2"; exit 1
fi
drive_sgr_line "$S2"
read -r fg_red fg_green fg_blue fg_black fg_bright_white fg_plain bg_black <<<"$(probe "$ROOT/artifacts/frame-$S2.json")"
# BLKTOK is deliberately NOT asserted at this tier: standard ANSI black on a black background is
# what every real 16-color terminal shows — inherent to the tier, not a themed regression.
chk "16-tier red pins to standard #800000"     "$fg_red"          "128,0,0,255"
chk "16-tier green pins to standard #008000"   "$fg_green"        "0,128,0,255"
chk "16-tier blue pins to standard #000080"    "$fg_blue"         "0,0,128,255"
chk "16-tier bright-white pins to #ffffff"     "$fg_bright_white" "255,255,255,255"
chk "16-tier default fg is silver #c0c0c0"     "$fg_plain"        "192,192,192,255"
distinct_and_visible=1
for color in "$fg_red" "$fg_green" "$fg_blue"; do
  [ "$color" = "$bg_black" ] && distinct_and_visible=0
done
[ "$fg_red" = "$fg_green" ] || [ "$fg_green" = "$fg_blue" ] || [ "$fg_red" = "$fg_blue" ] && distinct_and_visible=0
if [ "$distinct_and_visible" = 1 ]; then
  echo "  PASS  16-tier red/green/blue are pairwise distinct and visible on bg ($bg_black)"
else
  echo "  FAIL  16-tier colors collapsed or invisible (red=$fg_red green=$fg_green blue=$fg_blue bg=$bg_black)"; fail=1
fi
"$H" kill "$S2" >/dev/null 2>&1

echo ""
if [ "$fail" = 0 ]; then echo "== RESULT: ALL-PASS =="; else echo "== RESULT: FAILURES =="; fi
exit "$fail"

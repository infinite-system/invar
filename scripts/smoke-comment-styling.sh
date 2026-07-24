#!/usr/bin/env bash
# Comment-styling smoke: boot the real TUI on a .ts fixture and assert via FrameProbe that
# (i) a JSDoc block's CONTINUATION lines (` * ...`) render in the comment colour even unwrapped
#     (the line-local tokenizer must classify doc-block middle lines as comments), and
# (ii) with word wrap ON, a long `//` comment's wrap-continuation rows KEEP the comment colour
#      (token spans must be mapped against the LOGICAL line, not re-tokenized per visual slice), and
# (iii) with word wrap OFF, horizontal scroll past the comment prefix keeps both `//` and JSDoc
#       tails grey, including the segment immediately after an in-comment find match.
# Verdicts are per-cell FOREGROUND equality against the `//` lead comment (the known-good comment
# cell in the same frame) — no hardcoded palette values, so theme changes never break the smoke.
set -uo pipefail
DIR="$(cd "$(dirname "$0")" && pwd)"
H="$DIR/tui-harness.sh"
ROOT="$(cd "$DIR/.." && pwd)"
S="comments-$$"
BUN="$HOME/.bun/bin/bun"
FIX="$(mktemp -d /tmp/tui-comments-fixture.XXXXXX)"
FRAME="$ROOT/artifacts/frame-$S.json"
fail=0
f()   { "$H" field "$S" "$1"; }
chk() { if [ "$2" = "$3" ]; then echo "  PASS  $1 ($2)"; else echo "  FAIL  $1: got '$2' want '$3'"; fail=1; fi; }
trap '"$H" kill "$S" >/dev/null 2>&1; rm -rf "$FIX"' EXIT INT TERM

# Fixture: one long `//` comment (wraps at the 120x40 window's code width; `zebramarker` lands on a
# continuation row), a long JSDoc middle line carrying both left-edge and horizontally scrolled
# markers, and one code line as the non-comment control. Filler keeps the document taller than trivial.
"$BUN" -e '
const filler = "alpha bravo charlie delta echo foxtrot golf hotel india juliet kilo lima mike";
const lines = [
  `// leadcomment ${filler} ${filler} tail hscrollcomment zebramarker end`,
  "/**",
  ` * docmid ${filler} ${filler} tail hscrolldoc end`,
  " */",
  "export const answer = 42;",
  `// ${filler} ${filler} tail findmatch afterfind end`,
  "",
];
require("fs").writeFileSync(process.argv[1] + "/comment.ts", lines.join("\n"));
' "$FIX"

# Foreground of the first cell of a marker word in the frame. FrameProbe remaps some glyphs, and fg is a
# per-CELL array — index by CODE POINTS (Array.from), where index == display cell.
marker_fg() {
  FRAME_FILE="$FRAME" MARKER="$1" "$BUN" -e '
    const frame = JSON.parse(require("fs").readFileSync(process.env.FRAME_FILE));
    const markerCells = Array.from(process.env.MARKER);
    let foundForeground = null; // NOTE: no top-level `return` — bun -e silently drops all output then
    for (const row of frame.rows) {
      const cells = Array.from(row.text); // code points == display cells (astral glyph remap)
      for (let cellIndex = 0; cellIndex + markerCells.length <= cells.length; cellIndex++) {
        if (markerCells.every((markerCell, offset) => cells[cellIndex + offset] === markerCell)) {
          foundForeground = row.fg[cellIndex];
          break;
        }
      }
      if (foundForeground !== null) break;
    }
    console.log(foundForeground ?? "MISSING");
  '
}

echo "== launch on the comment fixture =="
# COLORTERM=truecolor so the engine does not quantize colours (comment vs fg would otherwise collapse).
"$H" launch "$S" 120x40 env TUI_FRAME_DUMP=1 COLORTERM=truecolor bun run src/main.ts "$FIX" >/dev/null
if "$H" ready "$S" 20 >/dev/null; then echo "  PASS  boot ready"; else echo "  FAIL  boot"; "$H" capture "$S"; exit 1; fi

echo "== open comment.ts =="
"$H" send "$S" Enter >/dev/null
sleep 0.5; "$H" settle "$S" >/dev/null 2>&1
chk "buffer open" "$(basename "$(f activeBuffer)")" "comment.ts"
"$H" send "$S" Right >/dev/null
chk "editor focused" "$(f focus)" "editor"
chk "wordWrap default OFF" "$(f wordWrap)" "false"
"$H" settle "$S" >/dev/null 2>&1

echo "== no-wrap: JSDoc middle line renders in the comment colour =="
commentFg="$(marker_fg leadcomment)"
codeFg="$(marker_fg answer)"
docFg="$(marker_fg docmid)"
if [ "$commentFg" = "MISSING" ] || [ "$codeFg" = "MISSING" ] || [ "$docFg" = "MISSING" ]; then
  echo "  FAIL  marker glyphs not located (comment=$commentFg code=$codeFg doc=$docFg)"; fail=1
elif [ "$commentFg" = "$codeFg" ]; then
  echo "  FAIL  control broken: comment fg equals code fg ($commentFg) — colours quantized?"; fail=1
else
  echo "  PASS  control: comment fg ($commentFg) differs from code fg ($codeFg)"
  chk "JSDoc middle line fg == comment fg" "$docFg" "$commentFg"
fi

echo "== no-wrap: horizontal scroll past comment prefixes preserves comment colour =="
"$H" send "$S" End >/dev/null
sleep 0.4; "$H" settle "$S" >/dev/null 2>&1
horizontalScrollLeft="$(f editorScrollLeft)"
if [ "${horizontalScrollLeft:-0}" -gt 0 ] 2>/dev/null; then
  echo "  PASS  horizontal scroll moved right (scrollLeft=$horizontalScrollLeft)"
else
  echo "  FAIL  horizontal scroll did not move right (scrollLeft=$horizontalScrollLeft)"; fail=1
fi
horizontalCommentForeground="$(marker_fg hscrollcomment)"
horizontalDocForeground="$(marker_fg hscrolldoc)"
if [ "$horizontalCommentForeground" = "MISSING" ] || [ "$horizontalDocForeground" = "MISSING" ]; then
  echo "  FAIL  horizontal markers not located (line=$horizontalCommentForeground doc=$horizontalDocForeground)"; fail=1
else
  chk "horizontally sliced // tail fg == comment fg" "$horizontalCommentForeground" "$commentFg"
  chk "horizontally sliced JSDoc tail fg == comment fg" "$horizontalDocForeground" "$commentFg"
fi

echo "== no-wrap: find boundary inside horizontally scrolled comment preserves tail colour =="
"$H" send "$S" C-f >/dev/null
sleep 0.2
for character in f i n d m a t c h; do
  "$H" send "$S" "$character" >/dev/null
done
sleep 0.4; "$H" settle "$S" >/dev/null 2>&1
chk "horizontal comment find match count" "$(f findMatchCount)" "1"
"$H" send "$S" Escape >/dev/null
"$H" send "$S" End >/dev/null
sleep 0.4; "$H" settle "$S" >/dev/null 2>&1
findTailForeground="$(marker_fg afterfind)"
if [ "$findTailForeground" = "MISSING" ]; then
  echo "  FAIL  post-find comment marker not located"; fail=1
else
  chk "post-find segment fg == comment fg under hscroll" "$findTailForeground" "$commentFg"
fi

echo "== wrap ON (Alt+Z): // comment continuation row keeps the comment colour =="
"$H" send "$S" M-z >/dev/null
sleep 0.4; "$H" settle "$S" >/dev/null 2>&1
chk "wordWrap ON" "$(f wordWrap)" "true"
wrapCommentFg="$(marker_fg leadcomment)"
wrapTailFg="$(marker_fg zebramarker)"
wrapDocFg="$(marker_fg docmid)"
if [ "$wrapCommentFg" = "MISSING" ] || [ "$wrapTailFg" = "MISSING" ]; then
  echo "  FAIL  wrap markers not located (lead=$wrapCommentFg tail=$wrapTailFg)"; fail=1
else
  chk "wrap continuation fg == comment fg" "$wrapTailFg" "$wrapCommentFg"
  chk "JSDoc middle line fg (wrap mode) == comment fg" "$wrapDocFg" "$wrapCommentFg"
fi

echo "== quit =="
"$H" send "$S" C-q >/dev/null
echo "== RESULT: $([ "$fail" = 0 ] && echo ALL-PASS || echo FAILURES) =="
exit "$fail"

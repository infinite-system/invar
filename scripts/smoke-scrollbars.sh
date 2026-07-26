#!/usr/bin/env bash
# Driven scrollbar contract: every overflowing sidebar pane gets a horizontal bar, real Option-wheel
# reaches clipped content, horizontal bar renders plain at the same settings thickness as the vertical (no axis-balanced overlay), and panes
# whose content fits paint no horizontal bar. Semantic movement is asserted from FrameProbe because
# the user-visible clipped/revealed text and sub-cell glyph shape are the authoritative outcomes.
set -uo pipefail

script_directory="$(cd "$(dirname "$0")" && pwd)"
repository_root="$(cd "$script_directory/.." && pwd)"
harness="$script_directory/tui-harness.sh"
overflow_session="scrollbars-overflow-$$"
fits_session="scrollbars-fits-$$"
overflow_workspace="$(mktemp -d /tmp/tui-scrollbars-overflow.XXXXXX)"
fits_workspace="$(mktemp -d /tmp/tui-scrollbars-fits.XXXXXX)"
failure_count=0

cleanup() {
  "$harness" kill "$overflow_session" >/dev/null 2>&1 || true
  "$harness" kill "$fits_session" >/dev/null 2>&1 || true
  rm -rf "$overflow_workspace" "$fits_workspace"
}
trap cleanup EXIT INT TERM

pass() { echo "  PASS  $1"; }
fail() { echo "  FAIL  $1"; failure_count=$((failure_count + 1)); }
frame_path() { echo "$repository_root/artifacts/frame-$1.json"; }
frame_contains() {
  python3 - "$1" "$2" <<'PY'
import json
import sys
frame = json.load(open(sys.argv[1]))
marker = sys.argv[2]
raise SystemExit(0 if any(marker in row.get('text', '') for row in frame['rows']) else 1)
PY
}
wait_for_frame_text() {
  local frame_file="$1" marker="$2"
  for attempt in $(seq 1 40); do
    frame_contains "$frame_file" "$marker" && return 0
    sleep 0.15
  done
  return 1
}
send_option_wheel_right() {
  local session_name="$1" pointer_column="$2" pointer_row="$3" repeat_count="$4"
  for repeat_index in $(seq 1 "$repeat_count"); do
    tmux send-keys -t "$session_name" -l "$(printf '\033[<75;%d;%dM' "$pointer_column" "$pointer_row")"
    sleep 0.025
  done
}
# Bars render as BACKGROUND FILL on blank cells (SolidThumbScrollBar — never block glyphs), so the
# detectors read the bg lane: a horizontal bar row is an all-blank sidebar row carrying a contiguous
# minority-bg thumb run; a vertical bar column is a sidebar column whose blank cells carry a
# non-pane-fill bg down the track. The pane fill is derived from the frame (dominant interior bg).
horizontal_bar_row_count() {
  python3 - "$1" <<'PY'
import json
import sys
from collections import Counter
frame = json.load(open(sys.argv[1]))
sidebar_end = 27
fill_counter = Counter()
for row in frame['rows']:
    for cell_bg in row.get('bg', [])[1:sidebar_end]:
        if cell_bg:
            fill_counter[cell_bg] += 1
pane_fill = fill_counter.most_common(1)[0][0] if fill_counter else ''
count = 0
for row in frame['rows']:
    full_text = row.get('text', '')
    if not full_text.startswith('│'):
        continue  # only pane-interior rows (inside the sidebar box border) can hold a bar
    text = full_text[1:sidebar_end]
    backgrounds = row.get('bg', [])[1:sidebar_end]
    if text.strip():
        continue
    longest_run = 0
    current_run = 0
    for cell_bg in backgrounds:
        if cell_bg and cell_bg != pane_fill:
            current_run += 1
            longest_run = max(longest_run, current_run)
        else:
            current_run = 0
    # A thumb run: at least 4 cells, but NOT the whole row (a full-width run is a chrome/selection row).
    if 4 <= longest_run < len(backgrounds):
        count += 1
print(count)
PY
}
vertical_bar_column_count() {
  python3 - "$1" <<'PY'
import json
import sys
from collections import Counter
frame = json.load(open(sys.argv[1]))
sidebar_end = 27
fill_counter = Counter()
for row in frame['rows']:
    for cell_bg in row.get('bg', [])[1:sidebar_end]:
        if cell_bg:
            fill_counter[cell_bg] += 1
pane_fill = fill_counter.most_common(1)[0][0] if fill_counter else ''
columns = 0
for column in range(1, sidebar_end):
    painted_rows = 0
    for row in frame['rows']:
        text = row.get('text', '')
        if not text.startswith('│'):
            continue
        backgrounds = row.get('bg', [])
        glyph = text[column] if column < len(text) else ''
        cell_bg = backgrounds[column] if column < len(backgrounds) else ''
        if glyph == ' ' and cell_bg and cell_bg != pane_fill:
            painted_rows += 1
    # A vertical track paints most of the pane height in a non-fill bg (track + thumb colours).
    if painted_rows >= 10:
        columns += 1
print(columns)
PY
}
# The SOLID-THUMB contract (Terminal.app glyph-tiling fix): no block-element glyph anywhere in the
# frame, and the tree vertical bar column is all-blank with a contiguous multi-cell thumb bg run that
# is a proper subset of the track. Prints "OK <thumb_start> <thumb_length>" or "FAIL <reason>".
solid_thumb_check() {
  python3 - "$1" <<'PY'
import json
import sys
from collections import Counter
frame = json.load(open(sys.argv[1]))
sidebar_end = 27
for row in frame['rows']:
    for glyph in row.get('text', ''):
        if 0x2580 <= ord(glyph) <= 0x259F:
            print('FAIL block-element glyph U+%04X present' % ord(glyph))
            raise SystemExit(0)
fill_counter = Counter()
for row in frame['rows']:
    for cell_bg in row.get('bg', [])[1:sidebar_end]:
        if cell_bg:
            fill_counter[cell_bg] += 1
pane_fill = fill_counter.most_common(1)[0][0] if fill_counter else ''
best_column = -1
best_painted = 0
for column in range(1, sidebar_end):
    painted = 0
    for row in frame['rows']:
        text = row.get('text', '')
        if not text.startswith('│'):
            continue
        backgrounds = row.get('bg', [])
        glyph = text[column] if column < len(text) else ''
        cell_bg = backgrounds[column] if column < len(backgrounds) else ''
        if glyph == ' ' and cell_bg and cell_bg != pane_fill:
            painted += 1
    if painted > best_painted:
        best_painted, best_column = painted, column
if best_column < 0 or best_painted < 10:
    print('FAIL no vertical bar column found')
    raise SystemExit(0)
track_cells = []
for row_index, row in enumerate(frame['rows']):
    text = row.get('text', '')
    if not text.startswith('│'):
        continue
    backgrounds = row.get('bg', [])
    glyph = text[best_column] if best_column < len(text) else ''
    cell_bg = backgrounds[best_column] if best_column < len(backgrounds) else ''
    if glyph == ' ' and cell_bg and cell_bg != pane_fill:
        track_cells.append((row_index, cell_bg))
color_counter = Counter(cell_bg for _row_index, cell_bg in track_cells)
if len(color_counter) != 2:
    print('FAIL expected exactly track+thumb colours in the bar column, saw %d' % len(color_counter))
    raise SystemExit(0)
thumb_color = color_counter.most_common()[-1][0]
thumb_rows = [row_index for row_index, cell_bg in track_cells if cell_bg == thumb_color]
if len(thumb_rows) < 2:
    print('FAIL thumb run is %d cell(s) — not multi-cell/proportional' % len(thumb_rows))
    raise SystemExit(0)
if len(thumb_rows) >= len(track_cells):
    print('FAIL thumb fills the whole track')
    raise SystemExit(0)
if thumb_rows[-1] - thumb_rows[0] + 1 != len(thumb_rows):
    print('FAIL thumb run is not contiguous')
    raise SystemExit(0)
print('OK %d %d' % (thumb_rows[0], len(thumb_rows)))
PY
}
send_wheel_down() {
  local session_name="$1" pointer_column="$2" pointer_row="$3" repeat_count="$4"
  for repeat_index in $(seq 1 "$repeat_count"); do
    tmux send-keys -t "$session_name" -l "$(printf '\033[<65;%d;%dM' "$pointer_column" "$pointer_row")"
    sleep 0.025
  done
}

wait_for_scrollbar_counts() {
  local frame_file="$1" expected_horizontal_rows="$2" expected_vertical_columns="$3"
  local attempt
  for attempt in $(seq 1 200); do
    if [ "$(horizontal_bar_row_count "$frame_file")" = "$expected_horizontal_rows" ] \
      && [ "$(vertical_bar_column_count "$frame_file")" = "$expected_vertical_columns" ]; then
      return 0
    fi
    sleep 0.05
  done
  return 1
}

wait_for_horizontal_bar_minimum() {
  local frame_file="$1" minimum_count="$2"
  local attempt count
  for attempt in $(seq 1 200); do
    count="$(horizontal_bar_row_count "$frame_file")"
    [ "${count:-0}" -ge "$minimum_count" ] 2>/dev/null && return 0
    sleep 0.05
  done
  return 1
}

wait_for_solid_thumb() {
  local frame_file="$1"
  local attempt
  for attempt in $(seq 1 200); do
    [[ "$(solid_thumb_check "$frame_file")" = OK* ]] && return 0
    sleep 0.05
  done
  return 1
}

wait_for_thumb_below() {
  local frame_file="$1" previous_start="$2"
  local attempt thumb_result thumb_start
  for attempt in $(seq 1 200); do
    thumb_result="$(solid_thumb_check "$frame_file")"
    thumb_start="$(echo "$thumb_result" | awk '{print $2}')"
    if [[ "$thumb_result" = OK* ]] \
      && [ "${thumb_start:-0}" -gt "$previous_start" ] 2>/dev/null; then
      return 0
    fi
    sleep 0.05
  done
  return 1
}

wait_for_thumb_at_or_above() {
  local frame_file="$1" target_start="$2"
  local attempt thumb_result thumb_start
  for attempt in $(seq 1 200); do
    thumb_result="$(solid_thumb_check "$frame_file")"
    thumb_start="$(echo "$thumb_result" | awk '{print $2}')"
    if [[ "$thumb_result" = OK* ]] \
      && [ "${thumb_start:-999}" -le "$target_start" ] 2>/dev/null; then
      return 0
    fi
    sleep 0.05
  done
  return 1
}

require_frame_text_absent_for() {
  local frame_file="$1" marker="$2"
  local attempt
  for attempt in $(seq 1 10); do
    frame_contains "$frame_file" "$marker" && return 1
    sleep 0.05
  done
  return 0
}

require_horizontal_bar_count_remains() {
  local frame_file="$1" expected_count="$2"
  local attempt
  for attempt in $(seq 1 10); do
    [ "$(horizontal_bar_row_count "$frame_file")" = "$expected_count" ] \
      || return 1
    sleep 0.05
  done
  return 0
}

echo "== build narrow overflowing repository fixture =="
mkdir -p "$overflow_workspace/.invar"
printf '%s\n' \
  '{"sidebarWidth":28,"scrollbarThickness":1,"horizontalScrollModifier":"alt","linesPerNotch":3,"gitSplitRatio":0.5,"showActivityBar":false}' \
  > "$overflow_workspace/.invar/settings.json"
(
  cd "$overflow_workspace" || exit 1
  git init -q
  git config user.name scrollbar-smoke
  git config user.email scrollbar-smoke@example.com
  printf '.invar/\n' > .gitignore
  printf 'base\n' > base.txt
  for file_number in $(seq -w 1 50); do printf 'short\n' > "short-$file_number.txt"; done
  git add .gitignore base.txt short-*.txt
  git commit -qm base
  for commit_number in $(seq -w 1 22); do
    printf '%s\n' "$commit_number" >> base.txt
    git add base.txt
    git commit -qm "short-$commit_number"
  done
  long_file_name='000-VERY-LONG-CHANGES-FILENAME-THAT-ENDS-WITH-CHANGES-END-MARKER.txt'
  printf 'one\n' > "$long_file_name"
  git add "$long_file_name"
  git commit -qm 'VERY-LONG-COMMIT-SUBJECT-THAT-ENDS-WITH-LOG-END-MARKER'
  printf 'two\n' >> "$long_file_name"
)

echo "== tree: horizontal bar paints, matches vertical thickness, and reveals clipped tail =="
"$harness" launch "$overflow_session" 54x28 env TUI_FRAME_DUMP=1 bun run src/main.ts "$overflow_workspace" >/dev/null
if "$harness" ready "$overflow_session" 20 >/dev/null; then pass "overflow fixture booted"; else fail "overflow fixture did not boot"; fi
overflow_frame="$(frame_path "$overflow_session")"
wait_for_scrollbar_counts "$overflow_frame" 1 1
tree_horizontal_rows="$(horizontal_bar_row_count "$overflow_frame")"
tree_vertical_columns="$(vertical_bar_column_count "$overflow_frame")"
if [ "$tree_horizontal_rows" = "1" ]; then pass "tree paints one horizontal bar row"; else fail "tree horizontal bar row count is $tree_horizontal_rows, expected 1"; fi
if [ "$tree_vertical_columns" = "1" ]; then pass "tree paints one vertical bar column"; else fail "tree vertical bar column count is $tree_vertical_columns, expected 1"; fi
if [ "$tree_horizontal_rows" = "$tree_vertical_columns" ]; then
  pass "horizontal and vertical bars render at the SAME settings thickness (uniform, plain — no axis-balanced overlay)"
else
  fail "axis-adjusted thickness differs ($tree_horizontal_rows horizontal rows vs $tree_vertical_columns vertical columns)"
fi

echo "== solid thumb: bg fill on blank cells, no block glyphs, moves with scroll =="
wait_for_solid_thumb "$overflow_frame"
solid_thumb_before="$(solid_thumb_check "$overflow_frame")"
case "$solid_thumb_before" in
  OK*) pass "thumb is a contiguous multi-cell bg-fill run, zero block glyphs (start+length: ${solid_thumb_before#OK })";;
  *) fail "solid-thumb contract: $solid_thumb_before";;
esac
thumb_start_before="$(echo "$solid_thumb_before" | awk '{print $2}')"
send_wheel_down "$overflow_session" 10 10 8
wait_for_thumb_below "$overflow_frame" "$thumb_start_before"
solid_thumb_after="$(solid_thumb_check "$overflow_frame")"
case "$solid_thumb_after" in
  OK*) pass "thumb stays solid while scrolled (start+length: ${solid_thumb_after#OK })";;
  *) fail "solid-thumb contract after scroll: $solid_thumb_after";;
esac
thumb_start_after="$(echo "$solid_thumb_after" | awk '{print $2}')"
if [ -n "$thumb_start_before" ] && [ -n "$thumb_start_after" ] && [ "$thumb_start_after" -gt "$thumb_start_before" ] 2>/dev/null; then
  pass "wheel-down moves the bg-fill thumb down the track ($thumb_start_before -> $thumb_start_after)"
else
  fail "thumb did not move down on wheel-down ($thumb_start_before -> $thumb_start_after)"
fi
# Return the tree to the top so the clipped-tail assertions below see the original window.
for wheel_up_index in $(seq 1 40); do tmux send-keys -t "$overflow_session" -l "$(printf '\033[<64;10;10M')"; sleep 0.02; done
wait_for_thumb_at_or_above "$overflow_frame" "$thumb_start_before"
require_frame_text_absent_for "$overflow_frame" 'CHANGES-END-MARKER' \
  || fail "tree tail became visible while observing the returned top position"
if frame_contains "$overflow_frame" 'CHANGES-END-MARKER'; then fail "tree tail was not clipped before scrolling"; else pass "tree tail starts clipped"; fi
send_option_wheel_right "$overflow_session" 10 5 30
wait_for_frame_text "$overflow_frame" 'CHANGES-END-MARKER'
if frame_contains "$overflow_frame" 'CHANGES-END-MARKER'; then pass "Option-wheel reveals the tree filename tail"; else fail "Option-wheel did not reveal the tree filename tail"; fi

echo "== git changes + log: each pane owns a horizontal bar and independent offset =="
"$harness" send "$overflow_session" C-g >/dev/null
if wait_for_frame_text "$overflow_frame" 'VERY-LONG-COMM'; then pass "git log loaded in the live panel"; else fail "git log did not load"; fi
wait_for_horizontal_bar_minimum "$overflow_frame" 2
git_horizontal_rows="$(horizontal_bar_row_count "$overflow_frame")"
if [ "$git_horizontal_rows" -ge 2 ] 2>/dev/null; then pass "changes and log each paint a horizontal bar"; else fail "git painted $git_horizontal_rows horizontal bar rows, expected at least 2"; fi
require_frame_text_absent_for "$overflow_frame" 'END-MARKER.txt' \
  || fail "changes tail became visible before horizontal scrolling"
if frame_contains "$overflow_frame" 'END-MARKER.txt'; then fail "changes tail was not clipped before scrolling"; else pass "changes tail starts clipped"; fi
require_frame_text_absent_for "$overflow_frame" 'LOG-END-MARKER' \
  || fail "log tail became visible before horizontal scrolling"
if frame_contains "$overflow_frame" 'LOG-END-MARKER'; then fail "log tail was not clipped before scrolling"; else pass "log tail starts clipped"; fi
send_option_wheel_right "$overflow_session" 10 5 30
wait_for_frame_text "$overflow_frame" 'END-MARKER.txt'
if frame_contains "$overflow_frame" 'END-MARKER.txt'; then pass "Option-wheel reveals the changes filename tail"; else fail "Option-wheel did not reveal the changes filename tail"; fi
require_frame_text_absent_for "$overflow_frame" 'LOG-END-MARKER' \
  || fail "changes scrolling moved the independent log pane during observation"
if frame_contains "$overflow_frame" 'LOG-END-MARKER'; then fail "changes scrolling moved the independent log pane"; else pass "changes scrolling leaves the log offset untouched"; fi
send_option_wheel_right "$overflow_session" 10 22 30
wait_for_frame_text "$overflow_frame" 'LOG-END-MARKER'
if frame_contains "$overflow_frame" 'LOG-END-MARKER'; then pass "Option-wheel reveals the commit subject tail"; else fail "Option-wheel did not reveal the commit subject tail"; fi

echo "== fitting tree + git panes paint no horizontal bar =="
mkdir -p "$fits_workspace/.invar"
printf '%s\n' '{"sidebarWidth":28,"scrollbarThickness":1,"gitSplitRatio":0.5,"showActivityBar":false}' > "$fits_workspace/.invar/settings.json"
(
  cd "$fits_workspace" || exit 1
  git init -q
  git config user.name scrollbar-smoke
  git config user.email scrollbar-smoke@example.com
  printf '.invar/\n' > .gitignore
  printf 'one\n' > a.txt
  git add .gitignore a.txt
  git commit -qm fit
  printf 'two\n' >> a.txt
)
"$harness" launch "$fits_session" 54x28 env TUI_FRAME_DUMP=1 bun run src/main.ts "$fits_workspace" >/dev/null
if "$harness" ready "$fits_session" 20 >/dev/null; then pass "fitting fixture booted"; else fail "fitting fixture did not boot"; fi
fits_frame="$(frame_path "$fits_session")"
wait_for_frame_text "$fits_frame" 'a.txt'
require_horizontal_bar_count_remains "$fits_frame" 0 \
  || fail "fitting tree painted a horizontal bar during observation"
fits_tree_horizontal_rows="$(horizontal_bar_row_count "$fits_frame")"
if [ "$fits_tree_horizontal_rows" = "0" ]; then pass "fitting tree paints no horizontal bar"; else fail "fitting tree painted $fits_tree_horizontal_rows horizontal bar rows"; fi
"$harness" send "$fits_session" C-g >/dev/null
if wait_for_frame_text "$fits_frame" 'fit'; then pass "fitting git panel loaded"; else fail "fitting git panel did not load"; fi
require_horizontal_bar_count_remains "$fits_frame" 0 \
  || fail "fitting git panes painted a horizontal bar during observation"
fits_git_horizontal_rows="$(horizontal_bar_row_count "$fits_frame")"
if [ "$fits_git_horizontal_rows" = "0" ]; then pass "fitting git panes paint no horizontal bar"; else fail "fitting git panes painted $fits_git_horizontal_rows horizontal bar rows"; fi

echo ""
if [ "$failure_count" = "0" ]; then
  echo "smoke-scrollbars: ALL-PASS"
else
  echo "smoke-scrollbars: FAILURES ($failure_count)"
fi
exit "$failure_count"

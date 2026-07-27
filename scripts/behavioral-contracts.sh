#!/usr/bin/env bash
# invariant: Blocking gate verdicts use ordering and counts (scripts/harness/harness.invariants.md)
# BEHAVIORAL CONTRACT SUITE — executable assertions for LOAD-BEARING felt invariants.
#
# The *.invariants.md files document invariants in PROSE; a prose contract that doesn't gate is just a
# description (the audit found DiffView had a full invariants.md while being DEAD). This suite pairs the
# load-bearing invariants with DRIVEN assertions (FrameProbe/tmux) that run at the merge gate — so a
# change that silently breaks an adjacent felt invariant FAILS instead of shipping.
#
# PRINCIPLES (see project.requirements.md "Invariant-contract system"):
#  - ASSERT ESSENCE, NOT EXPRESSION: assert refactor-proof behavior ("a fling glides then decays to
#    rest"), never an implementation detail ("the wheel calls addImpulse"). Impl-coupled asserts are a
#    smell — they gate the expression, not the invariant.
#  - LOAD-BEARING ONLY: gate what must be true for the subsystem to be itself; decorative behavior
#    (exact pixels/curves) stays ungated (a false invariant increases rigidity).
#  - RATCHET: every user-reported regression, once fixed, becomes a PERMANENT entry here BEFORE the fix
#    commits. The protected set only grows; the same break can't recur.
set -uo pipefail
DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$DIR/.." && pwd)"
H="$DIR/tui-harness.sh"
# tui-harness.sh launches every app with this worktree-local HOME. Write the contract settings to
# that SAME isolated path; writing the caller's real $HOME makes the drive depend on stale harness
# state and can silently run the wrap contract with wordWrap=false.
SET="$ROOT/artifacts/home/.config/invar/settings.json"
export PATH="$HOME/.bun/bin:$PATH"
fail=0
SESSIONS=""
pass() { echo "  PASS  $1"; }
bad()  { echo "  FAIL  $1"; fail=1; }
warn() { echo "  WARN  $1"; }
skip() { echo "  SKIP  $1"; }

# Neutral scroll settings so the assertions are deterministic (one row per notch, no fast modifier).
mkdir -p "$(dirname "$SET")"
python3 -c "import json,os;p=os.path.expanduser('$SET');d=json.load(open(p)) if os.path.exists(p) else {};d.update({'linesPerNotch':1,'wordWrap':False,'fastScrollModifier':'none','horizontalScrollModifier':'alt'});json.dump(d,open(p,'w'),indent=2)"

LONG=$(mktemp -d /tmp/tui-bc-long.XXXXXX); python3 -c "open('$LONG/l.txt','w').write(''.join('line %04d content\n'%i for i in range(800)))"
TREE=$(mktemp -d /tmp/tui-bc-tree.XXXXXX); for n in $(seq -w 1 200); do printf 'x\n' > "$TREE/file-$n.txt"; done
trap 'rm -rf "$LONG" "$TREE"; for s in $SESSIONS; do "$H" kill "$s" >/dev/null 2>&1; done' EXIT INT TERM

open_file() { for _ in 1 2 3 4; do b="$("$H" field "$1" activeBuffer 2>/dev/null)"; [ -n "$b" ] && [ "$b" != "null" ] && return 0; "$H" send "$1" Enter >/dev/null; sleep 0.2; done; }

await_workspace_momentum_at_rest() {
  local session_name="$1"
  local attempt_number
  for attempt_number in $(seq 1 100); do
    if [ "$("$H" field "$session_name" workspaceScrollMomentumAtRest)" = \
         "true" ]; then
      return 0
    fi
    sleep 0.05
  done
  return 1
}

# ---- CONTRACT: momentum glide (editor.invariants / ui.invariants: wheel fling glides then decays) ----
# ESSENCE: one wheel notch produces MORE travel than its immediate single-row step (the impulse feeds a
# momentum glide), and the motion then DECAYS TO REST (a later sample equals the settled value). The
# mirror of idle-quiescence. This is the exact invariant the "momentum gone" report was about; gating it
# means that regression can never recur silently. NOT asserted: the specific decel curve (decorative).
echo "== CONTRACT momentum-glide: a wheel notch glides past its step, then decays to rest =="

glide_pane() { # <label> <fixture> <status-field> <needs-open> <wheel-col>
  local label="$1" fixture="$2" fld="$3" needsopen="$4" wcol="$5"
  local S="bc-${label}-$$"
  "$H" launch "$S" 120x40 bun run src/main.ts "$fixture" >/dev/null; SESSIONS="$SESSIONS $S"; "$H" ready "$S" 20 >/dev/null
  [ "$needsopen" = "open" ] && open_file "$S"
  # Focus the pane first — a wheel over an unfocused editor can be swallowed before the glide starts.
  tmux send-keys -t "$S" -l "$(printf '\033[<0;%d;12M' "$wcol")"; tmux send-keys -t "$S" -l "$(printf '\033[<0;%d;12m' "$wcol")"; sleep 0.2
  # ONE notch from rest. Progressive gain means this is DELIBERATELY small — the first notch carries
  # `initialGainFraction` (0.3) of the impulse with a one-row floor, because "it scrolls too much
  # right away" was the reported defect. The previous form of this contract demanded that a single
  # notch overshoot past its step (settled > 1), which was written for the pre-gain profile; against
  # the current profile it straddles the 1-vs-2 boundary and reddened at random on whichever pane
  # sampled first (observed on tree and on editor in consecutive runs, 2026-07-25).
  tmux send-keys -t "$S" -l "$(printf '\033[<65;%d;12M' "$wcol")"
  sleep 1.4; "$H" settle "$S" >/dev/null 2>&1; local single_notch_travel="$("$H" field "$S" "$fld")"
  sleep 0.6; local single_notch_rest="$("$H" field "$S" "$fld")"
  # Now RAMP: five notches in quick succession must travel materially further than five times the
  # first notch's step, because gain climbs toward full impulse over gainRampNotchSpan. This is the
  # "still gets faster if you scroll more" half of the felt invariant, and it is a comparison between
  # two drives rather than a magnitude read at a fixed instant, so machine speed cannot flip it.
  local notch_index=0
  while [ "$notch_index" -lt 5 ]; do
    tmux send-keys -t "$S" -l "$(printf '\033[<65;%d;12M' "$wcol")"
    notch_index=$((notch_index + 1))
  done
  sleep 1.6; "$H" settle "$S" >/dev/null 2>&1; local ramped_travel="$("$H" field "$S" "$fld")"
  sleep 0.6; local ramped_rest="$("$H" field "$S" "$fld")"
  "$H" kill "$S" >/dev/null 2>&1
  local ramp_gain=$((ramped_travel - single_notch_rest))
  if [ "${single_notch_travel:-0}" -ge 1 ] 2>/dev/null \
     && [ "${single_notch_rest:-0}" = "${single_notch_travel:-0}" ] 2>/dev/null; then
    pass "$label first notch from rest is a small settled step (travel=$single_notch_travel, rest=$single_notch_rest)"
  else
    bad "$label first notch did not settle to a small step (travel=$single_notch_travel rest=$single_notch_rest) — expected >=1 row then no drift"
  fi
  if [ "${ramp_gain:-0}" -gt "$((single_notch_travel * 2))" ] 2>/dev/null \
     && [ "${ramped_rest:-0}" = "${ramped_travel:-0}" ] 2>/dev/null; then
    pass "$label five notches accelerate then decay to rest (gain=$ramp_gain vs single=$single_notch_travel, rest=$ramped_rest)"
  else
    bad "$label NO progressive gain/decay (gain=$ramp_gain single=$single_notch_travel ramped=$ramped_travel rest=$ramped_rest) — five notches must outrun five single steps, then stop"
  fi
}

glide_pane editor "$LONG" editorScrollTop open   60
glide_pane tree   "$TREE" treeScrollTop  noopen 10

# ---- CONTRACT: every selectable glide cap preserves one accepted notch ----
# One event must remain one impulse and produce visible travel at both document
# scales. The three values span the schema's full selectable range.
echo "== CONTRACT glide-cap-range: one notch always moves =="
glide_cap_run_failed=0
glide_cap_reports=""
for glide_cap_milliseconds in 100 1050 2000; do
  glide_cap_report="$ROOT/artifacts/glide-cap-$glide_cap_milliseconds.json"
  glide_cap_log="$ROOT/artifacts/glide-cap-$glide_cap_milliseconds.log"
  if SMOOTHNESS_GESTURES=1 \
     SMOOTHNESS_NOTCHES=1 \
     SMOOTHNESS_ACCUMULATION_FLICKS=0 \
     SMOOTHNESS_CONTINUATION_MINIMUM_MOVING_FRAMES='' \
     SMOOTHNESS_LINE_COUNTS=2000,100000 \
     SMOOTHNESS_SURFACES=editor \
     SMOOTHNESS_VERSION_CONTROL_MARKS=off \
     SMOOTHNESS_MAXIMUM_GLIDE_DURATION="$glide_cap_milliseconds" \
     bun "$ROOT/scripts/harness/measure-scroll-smoothness.ts" \
       >"$glide_cap_report" 2>"$glide_cap_log"; then
    glide_cap_reports="$glide_cap_reports $glide_cap_report"
  else
    bad "glide-cap $glide_cap_milliseconds ms drive failed"
    tail -20 "$glide_cap_log"
    glide_cap_run_failed=1
  fi
done
if [ "$glide_cap_run_failed" = 0 ]; then
  read -r glide_cap_positive_control_rejected \
    glide_cap_case_count glide_cap_all_hold \
    <<<"$(python3 - $glide_cap_reports <<'PY'
import json
import sys

def single_notch_holds(cases):
    return all(
        case["singleNotch"]["appliedImpulseCount"] == 1
        and case["singleNotch"]["rowsTravelled"] >= 1
        for case in cases
    )

reports = [json.load(open(path)) for path in sys.argv[1:]]
cases = [
    case
    for report in reports
    for case in report["cases"]
]
bad_case = {
    "singleNotch": {
        "appliedImpulseCount": 1,
        "rowsTravelled": 0,
    }
}
print(
    int(not single_notch_holds([bad_case])),
    len(cases),
    int(
        len(cases) == 6
        and {report["maximumGlideDurationMilliseconds"]
             for report in reports} == {100, 1050, 2000}
        and {case["fixtureLineCount"] for case in cases}
            == {2000, 100000}
        and single_notch_holds(cases)
    ),
)
PY
)"
  if [ "${glide_cap_positive_control_rejected:-0}" = 1 ]; then
    pass "glide-cap positive control rejects one applied impulse with zero rows"
  else
    bad "glide-cap positive control accepted one applied impulse with zero rows"
  fi
  if [ "${glide_cap_case_count:-0}" = 6 ] \
     && [ "${glide_cap_all_hold:-0}" = 1 ]; then
    pass "one notch applies once and moves at 100/1050/2000 ms, 2k/100k lines"
  else
    bad "one notch did not survive every cap and document scale"
  fi
fi

# ---- CONTRACT: glide smoothness (RATCHET: the "choppier and slower" report of 2026-07-26) ----
# The contract above measures total DISPLACEMENT over five notches. Displacement is a TIME INTEGRAL of
# the momentum curve — velocity decays geometrically and the fractional row `residual` is carried in
# the momentum value between frames — so the SAME distance delivered in fewer, larger jumps leaves
# `gain` byte-identical while the motion is visibly choppy. That is not hypothetical: when scrolling
# was reported as "choppier, and the velocity is less when going fast", the `gain` assertion was
# byte-identical in gate logs from both sides of the reported change. Smoothness is a DIFFERENT NUMBER
# and needs its own assertion, so this contract gates the per-frame step distribution of one fast
# fling, measured at the real PTY by scripts/harness/measure-scroll-smoothness.ts. The instrument
# generates 2k, 26,635, and 100k-line fixtures at run time and drives both the editor and diff
# surfaces without storing giant fixtures in the repository. Deterministic editor frame-work counts
# at 2k and 100k are the size-invariance contract. The diff and fold-dense
# editor FPS readings remain secondary, report-only wall-clock canaries.
#
# THE BOUNDS COME FROM THE APP'S OWN DECLARED VALUES, not from a fitted observation:
#  * CHOPPINESS CEILING — settings.verticalFlingCeiling (220 rows/s) is the fastest a glide may ever
#    travel and createCliRenderer's targetFps (30) is the cadence it must keep, so ONE frame at full
#    speed advances 220/30 = 7.3 rows. A single step past TWO budgets (15 rows) means the render loop
#    missed at least two consecutive frames — that is the definition of choppy, and it is impossible
#    while cadence holds. A consumer that rounded the integrator's position every frame would show up
#    here too, because quantizing fractional rows both enlarges the steps and loses velocity.
#  * CADENCE FLOOR — while travel remains at least two rows per completed frame,
#    cell-grid quantization cannot hide unchanged ticks. That sustained-fast
#    segment must run at >=28 FPS against the declared 30 FPS target. The full
#    decay must also span at least ten moving frames.
#  * TRAVEL FLOOR — the second reported symptom (lower peak velocity) as a clock-free figure: with
#    linesPerNotch 1 the 12-notch fling REQUESTS 12 rows, and momentum that cannot at least double the
#    raw notch travel is not a fling at all. 24 rows is that doubling.
#  * CONTINUATION — follow-on notches land halfway through and at the declared
#    ten-moving-frame cadence floor while the first glide remains live.
#    Placement follows motion, not a requested delay; delivered time is
#    diagnostic only. Each boundary frame must cross at least as many rows as
#    the immediately preceding frame.
# Measured floors on 2026-07-26 across six commits spanning 24h of history (40d244b~1 .. e6450c6):
# 17 moving frames, largest single step 7 rows, fastest trial travelling 36-48 rows. Every bound below
# therefore has at least 1.5x headroom against a loaded machine while still catching a halving.
echo "== CONTRACT glide-smoothness: a fast fling is many small row crossings, not a few big jumps =="
SMOOTH_JSON="$ROOT/artifacts/scroll-smoothness.json"
SMOOTH_LOG="$ROOT/artifacts/scroll-smoothness.log"
mkdir -p "$ROOT/artifacts"
smooth_stage_completed=0
if SMOOTHNESS_GESTURES=2 \
   SMOOTHNESS_ACCUMULATION_FLICKS=0 \
   SMOOTHNESS_LINE_COUNTS=2000,26635,100000 \
   SMOOTHNESS_SURFACES=editor,diff \
   bun "$ROOT/scripts/harness/measure-scroll-smoothness.ts" \
     >"$SMOOTH_JSON" 2>"$SMOOTH_LOG"; then
  read -r smooth_frames smooth_max_step smooth_travel \
    smooth_from_rest_travel smooth_follow_on_min_travel \
    smooth_follow_on_max_travel smooth_follow_on_within_tolerance \
    smooth_diff_cadence_canary_passes smooth_diff_cadence_canary_fps \
    smooth_scale_holds smooth_scale_baseline_frames \
    smooth_scale_comparison_frames smooth_scale_baseline_reads \
    smooth_scale_comparison_reads smooth_scale_read_ratio \
    smooth_scale_fold_ratio smooth_scale_wrap_ratio \
    smooth_scale_layout_ratio \
    smooth_100k_top_reference_fps smooth_minimum_moving_frame_count \
    smooth_continuation_count smooth_continuation_holds \
    smooth_continuation_minimum_margin \
    smooth_continuation_moving_frames smooth_continuation_frame_boundaries \
    <<<"$(python3 -c "
import json
report = json.load(open('$SMOOTH_JSON'))
cases = report['cases']
scale = report['editorScaleInvariance']
baseline = next(
    case for case in cases
    if case['surface'] == 'editor' and case['fixtureLineCount'] == 2000
)
gestures = baseline['gestures']
continuation_boundaries = baseline['continuationBoundaries']
all_gestures = [
    gesture
    for case in cases
    for gesture in case['gestures']
]
large_editor_gestures = [
    gesture
    for case in cases
    if case['fixtureLineCount'] == 100000
    and case['surface'] == 'editor'
    for gesture in case['gestures']
]
diff_canary = next(
    case for case in cases
    if case['surface'] == 'diff' and case['fixtureLineCount'] == 2000
)['gestures'][0]['sustainedFastFramesPerSecond']
from_rest_travel = gestures[0]['totalDistanceRows']
follow_on_travel = [gesture['totalDistanceRows'] for gesture in gestures[1:]]
follow_on_within_tolerance = all(
    abs(travel - from_rest_travel) <= abs(from_rest_travel) * 0.10
    for travel in follow_on_travel
)
top_reference_fps = min(
    gesture['sustainedFastFramesPerSecond']
    for gesture in large_editor_gestures
)
continuation_minimums = report['continuationMinimumMovingFrameCounts']
continuation_holds = (
    len(continuation_minimums) >= 2
    and len(continuation_boundaries) == len(continuation_minimums)
    and all(boundary['observedMovingFrameCount']
                >= boundary['minimumMovingFrameCount']
            and boundary['preBoundaryRowsCrossed'] == 1
            and boundary['boundaryRowsCrossed']
                >= boundary['preBoundaryRowsCrossed']
            for boundary in continuation_boundaries)
)
continuation_margins = [
    boundary['boundaryRowsCrossed'] - boundary['preBoundaryRowsCrossed']
    for boundary in continuation_boundaries
]
continuation_moving_frames = [
    boundary['observedMovingFrameCount']
    for boundary in continuation_boundaries
]
continuation_frame_boundaries = [
    f\"{boundary['preBoundaryFrameCount']}->{boundary['boundaryFrameCount']}\"
    for boundary in continuation_boundaries
]
print(min(g['movingFrameCount'] for g in all_gestures),
      max(g['maximumFrameDeltaRows'] for g in all_gestures),
      max(g['totalDistanceRows'] for g in all_gestures),
      from_rest_travel,
      min(follow_on_travel),
      max(follow_on_travel),
      int(follow_on_within_tolerance),
      int(diff_canary >= 28),
      f'{diff_canary:.1f}',
      int(scale is not None
          and all(ratio == 1 for ratio in scale['ratios'].values())),
      scale['baseline']['completedFrameCount'],
      scale['comparison']['completedFrameCount'],
      scale['baseline']['documentLineReads'],
      scale['comparison']['documentLineReads'],
      f\"{scale['ratios']['documentLineReads']:.6f}\",
      f\"{scale['ratios']['foldProjectionLookups']:.6f}\",
      f\"{scale['ratios']['wrapProjectionLookups']:.6f}\",
      f\"{scale['ratios']['layoutComputations']:.6f}\",
      f'{top_reference_fps:.6f}',
      report['minimumGlideMovingFrameCount'],
      len(continuation_boundaries),
      int(continuation_holds),
      min(continuation_margins),
      ','.join(str(count) for count in continuation_moving_frames),
      ','.join(continuation_frame_boundaries))
")"
  if python3 -c \
    "raise SystemExit(0 if float('${smooth_100k_top_reference_fps:-0}') > 0 else 1)"
  then
    smooth_stage_completed=1
  fi
  if [ "${smooth_max_step:-999}" -le 15 ] 2>/dev/null; then
    smooth_step_message="no glide frame jumps more than two frame budgets"
    smooth_step_message+=" (largest step=$smooth_max_step rows, bound 15)"
    pass "$smooth_step_message"
  else
    smooth_step_message="glide is CHOPPY: one frame advanced"
    smooth_step_message+=" $smooth_max_step rows (bound 15)"
    bad "$smooth_step_message"
  fi
  if [ "${smooth_frames:-0}" \
       -ge "${smooth_minimum_moving_frame_count:-999}" ] 2>/dev/null; then
    smooth_frame_message="the fling is carried by many frames"
    smooth_frame_message+=" (fewest moving frames=$smooth_frames,"
    smooth_frame_message+=" floor=$smooth_minimum_moving_frame_count)"
    pass "$smooth_frame_message"
  else
    smooth_frame_message="glide CADENCE COLLAPSED: only $smooth_frames"
    smooth_frame_message+=" moving frames carried the fling"
    smooth_frame_message+=" (floor=$smooth_minimum_moving_frame_count)"
    bad "$smooth_frame_message"
  fi
  if [ "${smooth_travel:-0}" -ge 24 ] 2>/dev/null; then
    smooth_travel_message="a 12-notch fling outruns its raw notch travel"
    smooth_travel_message+=" (best=$smooth_travel rows, floor 24)"
    pass "$smooth_travel_message"
  else
    smooth_travel_message="glide PEAK VELOCITY collapsed:"
    smooth_travel_message+=" best 12-notch trial=$smooth_travel rows (floor 24)"
    bad "$smooth_travel_message"
  fi
  if [ "${smooth_follow_on_within_tolerance:-0}" -eq 1 ] 2>/dev/null; then
    follow_on_message="follow-on travel matches rest within 10%"
    follow_on_message+=" (rest=$smooth_from_rest_travel,"
    follow_on_message+=" follow-on=$smooth_follow_on_min_travel"
    follow_on_message+="..$smooth_follow_on_max_travel rows)"
    pass "$follow_on_message"
  else
    follow_on_message="follow-on gain depends on residual velocity"
    follow_on_message+=" (rest=$smooth_from_rest_travel,"
    follow_on_message+=" follow-on=$smooth_follow_on_min_travel"
    follow_on_message+="..$smooth_follow_on_max_travel rows; bound 10%)"
    bad "$follow_on_message"
  fi
  if [ "${smooth_continuation_holds:-0}" -eq 1 ] 2>/dev/null; then
    continuation_message="live-glide notches preserve boundary velocity"
    continuation_message+=" (movingFrames="
    continuation_message+="$smooth_continuation_moving_frames,"
    continuation_message+=" frameBoundaries="
    continuation_message+="$smooth_continuation_frame_boundaries,"
    continuation_message+=" trials=$smooth_continuation_count,"
    continuation_message+=" minimum row-count margin="
    continuation_message+="$smooth_continuation_minimum_margin)"
    pass "$continuation_message"
  else
    continuation_message="a same-direction notch SLOWED a live glide"
    continuation_message+=" (movingFrames="
    continuation_message+="${smooth_continuation_moving_frames:-missing},"
    continuation_message+=" frameBoundaries="
    continuation_message+="${smooth_continuation_frame_boundaries:-missing},"
    continuation_message+=" trials=${smooth_continuation_count:-0},"
    continuation_message+=" minimum row-count margin="
    continuation_message+="${smooth_continuation_minimum_margin:-missing})"
    bad "$continuation_message"
  fi
  if [ "${smooth_diff_cadence_canary_passes:-0}" -eq 1 ] 2>/dev/null; then
    diff_cadence_message="diff wall-clock canary meets declared cadence"
    diff_cadence_message+=" (${smooth_diff_cadence_canary_fps}fps,"
    diff_cadence_message+=" floor 28)"
    warn "$diff_cadence_message (report-only)"
  else
    diff_cadence_message="diff wall-clock canary misses declared cadence"
    diff_cadence_message+=" (${smooth_diff_cadence_canary_fps}fps,"
    diff_cadence_message+=" floor 28)"
    warn "$diff_cadence_message (report-only)"
  fi
  if [ "${smooth_scale_holds:-0}" -eq 1 ] 2>/dev/null; then
    scale_message="editor frame work is invariant from 2k to 100k"
    scale_message+=" (reads=${smooth_scale_baseline_reads}/"
    scale_message+="${smooth_scale_baseline_frames} vs "
    scale_message+="${smooth_scale_comparison_reads}/"
    scale_message+="${smooth_scale_comparison_frames}; ratios "
    scale_message+="reads=$smooth_scale_read_ratio,"
    scale_message+=" fold=$smooth_scale_fold_ratio,"
    scale_message+=" wrap=$smooth_scale_wrap_ratio,"
    scale_message+=" layout=$smooth_scale_layout_ratio)"
    pass "$scale_message"
  else
    scale_message="editor frame work scales with document length"
    scale_message+=" (reads ratio=${smooth_scale_read_ratio:-missing},"
    scale_message+=" fold=${smooth_scale_fold_ratio:-missing},"
    scale_message+=" wrap=${smooth_scale_wrap_ratio:-missing},"
    scale_message+=" layout=${smooth_scale_layout_ratio:-missing};"
    scale_message+=" expected exact 1)"
    bad "$scale_message"
  fi
else
  bad "glide-smoothness instrument did not complete — see $SMOOTH_LOG"
  sed -n '1,20p' "$SMOOTH_LOG"
fi

# ---- CONTRACT: successive flick accumulation (user-reported heavy glide, 2026-07-27) -------------
# One 12-notch PTY write is a realistic hard flick. The DEFAULT 220-row/s ceiling is primary and a
# raised 320-row/s ceiling is the second row. Successive 200 ms-separated flicks must visibly widen
# the adjacent-four-frame row-crossing peak while the first stays below the ceiling-derived budget.
# At 220/30 FPS a two-frame budget has only about 14 integer rows and the preserved first flick uses
# 13, so three strict levels cannot fit; four frames retain the exact sequence while adding enough
# cell-grid resolution to distinguish all three. This is deliberately separate from
# glide-continuation: non-decrease admits a flat peak shape, while accumulation does not.
echo "== CONTRACT glide-accumulation: separated peaks climb; rapid input sustains the ceiling =="
ACCUMULATION_DEFAULT_JSON="$ROOT/artifacts/glide-accumulation-default.json"
ACCUMULATION_DEFAULT_LOG="$ROOT/artifacts/glide-accumulation-default.log"
ACCUMULATION_RAISED_JSON="$ROOT/artifacts/glide-accumulation-raised.json"
ACCUMULATION_RAISED_LOG="$ROOT/artifacts/glide-accumulation-raised.log"
ACCUMULATION_RAPID_JSON="$ROOT/artifacts/glide-accumulation-rapid.json"
ACCUMULATION_RAPID_LOG="$ROOT/artifacts/glide-accumulation-rapid.log"
if SMOOTHNESS_GESTURES=0 \
   SMOOTHNESS_CONTINUATION_MINIMUM_MOVING_FRAMES='' \
   SMOOTHNESS_ACCUMULATION_FLICKS=3 \
   SMOOTHNESS_ACCUMULATION_PAUSE=200 \
   SMOOTHNESS_VERTICAL_FLING_CEILING=220 \
   SMOOTHNESS_LINE_COUNTS=2000 \
   SMOOTHNESS_SURFACES=editor \
   SMOOTHNESS_FIXTURES=flat \
   SMOOTHNESS_CODE_FOLDING=on \
   bun "$ROOT/scripts/harness/measure-scroll-smoothness.ts" \
     >"$ACCUMULATION_DEFAULT_JSON" 2>"$ACCUMULATION_DEFAULT_LOG" \
   && SMOOTHNESS_GESTURES=0 \
   SMOOTHNESS_CONTINUATION_MINIMUM_MOVING_FRAMES='' \
   SMOOTHNESS_ACCUMULATION_FLICKS=3 \
   SMOOTHNESS_ACCUMULATION_PAUSE=200 \
   SMOOTHNESS_VERTICAL_FLING_CEILING=320 \
   SMOOTHNESS_LINE_COUNTS=2000 \
   SMOOTHNESS_SURFACES=editor \
   SMOOTHNESS_FIXTURES=flat \
   SMOOTHNESS_CODE_FOLDING=on \
   bun "$ROOT/scripts/harness/measure-scroll-smoothness.ts" \
     >"$ACCUMULATION_RAISED_JSON" 2>"$ACCUMULATION_RAISED_LOG" \
   && SMOOTHNESS_GESTURES=1 \
   SMOOTHNESS_NOTCHES=60 \
   SMOOTHNESS_CONTINUATION_MINIMUM_MOVING_FRAMES='' \
   SMOOTHNESS_ACCUMULATION_FLICKS=0 \
   SMOOTHNESS_VERTICAL_FLING_CEILING=220 \
   SMOOTHNESS_LINE_COUNTS=2000 \
   SMOOTHNESS_SURFACES=editor \
   SMOOTHNESS_FIXTURES=flat \
   SMOOTHNESS_CODE_FOLDING=on \
   bun "$ROOT/scripts/harness/measure-scroll-smoothness.ts" \
     >"$ACCUMULATION_RAPID_JSON" 2>"$ACCUMULATION_RAPID_LOG"; then
  read -r accumulation_positive_control_rejected \
    accumulation_rapid_positive_control_rejected \
    accumulation_separated_peaks_hold \
    accumulation_rapid_travel_holds accumulation_default_peaks \
    accumulation_raised_peaks accumulation_default_sequences \
    accumulation_raised_sequences accumulation_frame_boundaries \
    accumulation_order_positive_control_rejected \
    accumulation_rapid_travel_rows accumulation_rapid_travel_floor \
    accumulation_rapid_sequence \
    <<<"$(python3 -c "
import json
import math

default_report = json.load(open('$ACCUMULATION_DEFAULT_JSON'))
raised_report = json.load(open('$ACCUMULATION_RAISED_JSON'))
rapid_report = json.load(open('$ACCUMULATION_RAPID_JSON'))

def case_values(report):
    flicks = report['cases'][0]['accumulationFlicks']
    peaks = [flick['peakFourFrameRowsCrossed'] for flick in flicks]
    sequences = [
        ','.join(str(rows) for rows in flick['rowCrossingSequence'])
        for flick in flicks
    ]
    frame_boundaries = [
        flick['precedingCompletedFrameCount']
        for flick in flicks
    ]
    ceiling_four_frame_rows = (
        math.floor(
            4
            * report['verticalFlingCeiling']
            / report['targetFramesPerSecond']
        )
        - 1
    )
    return peaks, sequences, frame_boundaries, ceiling_four_frame_rows

def climbs_with_headroom(candidate_peaks, ceiling_four_frame_rows):
    return (
        len(candidate_peaks) == 3
        and candidate_peaks[0] < ceiling_four_frame_rows
        and all(
            later_peak > earlier_peak
            for earlier_peak, later_peak
            in zip(candidate_peaks, candidate_peaks[1:])
        )
    )

default_peaks, default_sequences, default_frame_boundaries, default_budget = (
    case_values(default_report)
)
raised_peaks, raised_sequences, raised_frame_boundaries, raised_budget = (
    case_values(raised_report)
)

def flick_order_holds(frame_boundaries):
    return (
        len(frame_boundaries) == 3
        and frame_boundaries[0] == 0
        and all(
            later_frame > earlier_frame
            for earlier_frame, later_frame
            in zip(frame_boundaries, frame_boundaries[1:])
        )
    )

flat_positive_control = [default_budget - 1] * 3
positive_control_rejected = not climbs_with_headroom(
    flat_positive_control,
    default_budget,
)
order_positive_control_rejected = not flick_order_holds([0, 12, 12])
rapid_gesture = rapid_report['cases'][0]['gestures'][0]
rapid_positions = rapid_gesture['positions']
rapid_row_crossings = [
    later_position - earlier_position
    for earlier_position, later_position
    in zip(rapid_positions, rapid_positions[1:])
]
rapid_continuous_ceiling_travel = (
    rapid_report['verticalFlingCeiling']
    * (
        rapid_report['maximumGlideDurationMilliseconds']
        - rapid_report['glideCapEasingDurationMilliseconds'] / 2
    )
    / 1000
)
rapid_travel_floor = math.ceil(
    rapid_continuous_ceiling_travel - 1
)
# This one-gesture drive starts at row zero. At the cap, Momentum may discard
# only its sub-row residual, so the final visible row is total whole-row travel.
rapid_total_travel_rows = rapid_positions[-1] if rapid_positions else 0
decaying_positive_control = list(
    range(math.floor(
        rapid_report['verticalFlingCeiling']
        / rapid_report['targetFramesPerSecond']
    ), 0, -1)
)
rapid_positive_control_rejected = (
    sum(decaying_positive_control) < rapid_travel_floor
)
separated_peaks_hold = (
    climbs_with_headroom(default_peaks, default_budget)
    and climbs_with_headroom(raised_peaks, raised_budget)
    and flick_order_holds(default_frame_boundaries)
    and flick_order_holds(raised_frame_boundaries)
)
rapid_travel_holds = (
    rapid_total_travel_rows >= rapid_travel_floor
)
print(
    int(positive_control_rejected),
    int(rapid_positive_control_rejected),
    int(separated_peaks_hold),
    int(rapid_travel_holds),
    ','.join(str(peak) for peak in default_peaks),
    ','.join(str(peak) for peak in raised_peaks),
    '/'.join(default_sequences),
    '/'.join(raised_sequences),
    ','.join(str(count) for count in default_frame_boundaries)
        + '/'
        + ','.join(str(count) for count in raised_frame_boundaries),
    int(order_positive_control_rejected),
    rapid_total_travel_rows,
    rapid_travel_floor,
    ','.join(str(rows) for rows in rapid_row_crossings),
)
")"
  if [ "${accumulation_positive_control_rejected:-0}" -eq 1 ] 2>/dev/null; then
    pass "glide-accumulation positive control rejects a flat peak sequence"
  else
    bad "glide-accumulation positive control accepted a flat peak sequence"
  fi
  if [ "${accumulation_rapid_positive_control_rejected:-0}" -eq 1 ] \
    2>/dev/null; then
    pass "glide-accumulation positive control rejects a decaying rapid burst"
  else
    bad "glide-accumulation positive control accepted a decaying rapid burst"
  fi
  if [ "${accumulation_order_positive_control_rejected:-0}" -eq 1 ] \
    2>/dev/null; then
    pass "glide-accumulation positive control rejects a repeated frame boundary"
  else
    bad "glide-accumulation positive control accepted a repeated frame boundary"
  fi
  if [ "${accumulation_separated_peaks_hold:-0}" -eq 1 ] 2>/dev/null; then
    accumulation_message="separated flick peaks climb"
    accumulation_message+=" (default=$accumulation_default_peaks,"
    accumulation_message+=" raised=$accumulation_raised_peaks,"
    accumulation_message+=" frameBoundaries="
    accumulation_message+="$accumulation_frame_boundaries,"
    accumulation_message+=" defaultSequences=$accumulation_default_sequences,"
    accumulation_message+=" raisedSequences=$accumulation_raised_sequences)"
    pass "$accumulation_message"
  else
    accumulation_message="separated flick peaks failed to climb"
    accumulation_message+=" (default=${accumulation_default_peaks:-missing},"
    accumulation_message+=" raised=${accumulation_raised_peaks:-missing},"
    accumulation_message+=" frameBoundaries="
    accumulation_message+="${accumulation_frame_boundaries:-missing},"
    accumulation_message+=" defaultSequences="
    accumulation_message+="${accumulation_default_sequences:-missing},"
    accumulation_message+=" raisedSequences="
    accumulation_message+="${accumulation_raised_sequences:-missing})"
    bad "$accumulation_message"
  fi
  if [ "${accumulation_rapid_travel_holds:-0}" -eq 1 ] 2>/dev/null; then
    accumulation_message="rapid input sustains the ceiling"
    accumulation_message+=" (rapidTravelRows="
    accumulation_message+="$accumulation_rapid_travel_rows/"
    accumulation_message+="$accumulation_rapid_travel_floor,"
    accumulation_message+=" rapidSequence=$accumulation_rapid_sequence)"
    pass "$accumulation_message"
  else
    accumulation_message="rapid input ceiling travel failed"
    accumulation_message+=" (rapidTravelRows="
    accumulation_message+="${accumulation_rapid_travel_rows:-missing}/"
    accumulation_message+="${accumulation_rapid_travel_floor:-missing},"
    accumulation_message+=" rapidSequence="
    accumulation_message+="${accumulation_rapid_sequence:-missing})"
    bad "$accumulation_message"
  fi
else
  bad "glide-accumulation instrument did not complete — see accumulation logs"
  sed -n '1,12p' "$ACCUMULATION_DEFAULT_LOG"
  sed -n '1,12p' "$ACCUMULATION_RAISED_LOG"
  sed -n '1,12p' "$ACCUMULATION_RAPID_LOG"
fi

# ---- CONTRACT: fold-dense full-stack cadence (RATCHET: real package JSON stayed slow) ---------------
# SIZE alone is not the workload: nested JSON combines a structural fold start, indentation guide,
# syntax/bracket projection, and version-control gutter marks on the same visible rows. The generated
# 100k fixture asserts that complete stack with host folding enabled, not the
# flat-text isolator. One 1,000-row drive at line 75,000 is enough to sample the
# defect that was visible from its first frame.
echo "== CONTRACT fold-dense-stack: 100k nested JSON keeps the full row stack =="
FOLD_DENSE_JSON="$ROOT/artifacts/fold-dense-scroll-smoothness.json"
FOLD_DENSE_LOG="$ROOT/artifacts/fold-dense-scroll-smoothness.log"
if [ "${smooth_stage_completed:-0}" -ne 1 ]; then
  fold_dense_skip="fold-dense cadence because glide-smoothness aborted"
  fold_dense_skip+=" before the 100k top FPS reference"
  skip "$fold_dense_skip"
elif SMOOTHNESS_GESTURES=2 \
   SMOOTHNESS_LINE_COUNTS=100000 \
   SMOOTHNESS_SURFACES=editor \
   SMOOTHNESS_FIXTURES=fold-dense \
   SMOOTHNESS_CODE_FOLDING=on \
   SMOOTHNESS_DEPTH_REFERENCE_FPS="${smooth_100k_top_reference_fps:-0}" \
   bun "$ROOT/scripts/harness/measure-scroll-smoothness.ts" \
     >"$FOLD_DENSE_JSON" 2>"$FOLD_DENSE_LOG"; then
  read -r fold_dense_case_count fold_dense_full_stack \
    fold_dense_checkpoint_count fold_dense_minimum_rows \
    fold_dense_minimum_fast_fps fold_dense_shape_holds \
    fold_dense_cadence_canary_passes <<<"$(python3 -c "
import json
cases = json.load(open('$FOLD_DENSE_JSON'))['cases']
matching = [
    case for case in cases
    if case['surface'] == 'editor'
    and case['fixtureShape'] == 'fold-dense'
    and case['codeFolding'] == 'on'
    and case['fixtureLineCount'] == 100000
]
full_stack = (
    len(matching) == 1
    and matching[0]['indentGuides'] is True
    and matching[0]['versionControlMarks'] is True
)
checkpoints = [
    checkpoint
    for case in matching
    for checkpoint in case['depthCheckpoints']
]
minimum_fast_fps = min(
    checkpoint['framesPerSecond'] for checkpoint in checkpoints
) if checkpoints else 0
target_depths = {
    checkpoint['targetDepthLine'] for checkpoint in checkpoints
}
checkpoint_count = len(checkpoints)
minimum_rows = min(
    checkpoint['rowsTravelled'] for checkpoint in checkpoints
) if checkpoints else 0
print(len(matching), int(full_stack), checkpoint_count, minimum_rows,
      f'{minimum_fast_fps:.1f}',
      int(full_stack
          and checkpoint_count == 1
          and target_depths == {75000}
          and minimum_rows >= 1000),
      int(minimum_fast_fps >= 28))
")"
  python3 - "$FOLD_DENSE_JSON" <<'PY'
import json
import sys

report = json.load(open(sys.argv[1]))
print(
    "  depth-floor positive control RED (expected): "
    + report["depthCheckpointFloorPositiveControl"]
)
print(
    "  | fixture | target depth | actual start | rows travelled | "
    "FPS | ratio to 100k top |"
)
print("  | :--- | ---: | ---: | ---: | ---: | ---: |")
for case in report["cases"]:
    for checkpoint in case["depthCheckpoints"]:
        print(
            f"  | {case['fixtureShape']} | "
            f"{checkpoint['targetDepthLine']} | "
            f"{checkpoint['actualStartLine']} | "
            f"{checkpoint['rowsTravelled']} | "
            f"{checkpoint['framesPerSecond']:.1f} | "
            f"{checkpoint['ratioToReference']:.3f} |"
        )
PY
  if [ "${fold_dense_shape_holds:-0}" -eq 1 ] 2>/dev/null; then
    fold_dense_message="100k nested JSON sustains the full per-row stack"
    fold_dense_message+=" (cases=$fold_dense_case_count,"
    fold_dense_message+=" fullStack=$fold_dense_full_stack,"
    fold_dense_message+=" checkpoints=$fold_dense_checkpoint_count,"
    fold_dense_message+=" rows=$fold_dense_minimum_rows,"
    fold_dense_message+=" slowest=${fold_dense_minimum_fast_fps}fps)"
    pass "$fold_dense_message"
  else
    fold_dense_message="100k nested JSON count/shape contract failed"
    fold_dense_message+=" (cases=${fold_dense_case_count:-0},"
    fold_dense_message+=" fullStack=${fold_dense_full_stack:-0},"
    fold_dense_message+=" checkpoints=${fold_dense_checkpoint_count:-0},"
    fold_dense_message+=" rows=${fold_dense_minimum_rows:-0},"
    fold_dense_message+=" slowest=${fold_dense_minimum_fast_fps:-0}fps,"
    fold_dense_message+=" floor 28)"
    bad "$fold_dense_message"
  fi
  if [ "${fold_dense_cadence_canary_passes:-0}" -eq 1 ] 2>/dev/null; then
    warn "fold-dense cadence canary ${fold_dense_minimum_fast_fps}fps meets 28fps (report-only)"
  else
    warn "fold-dense cadence canary ${fold_dense_minimum_fast_fps:-missing}fps misses 28fps (report-only)"
  fi
else
  bad "fold-dense cadence instrument did not complete — see $FOLD_DENSE_LOG"
  sed -n '1,20p' "$FOLD_DENSE_LOG"
fi

# ---- CONTRACT: completed frames during continuous wheel input ----
# A velocity fingerprint can stay healthy across a freeze because it samples
# only frames that eventually arrived. This contract observes the missing
# dimension directly: while rapid wheel input keeps arriving, every input
# window must contain at least one completed DEC-2026 frame.
# The verdict counts frames per window; gap durations are report evidence only.
echo "== CONTRACT render-progress: each input window emits a completed frame =="
RENDER_PROGRESS_JSON="$ROOT/artifacts/render-progress.json"
RENDER_PROGRESS_LOG="$ROOT/artifacts/render-progress.log"
if SMOOTHNESS_GESTURES=0 \
   SMOOTHNESS_ACCUMULATION_FLICKS=0 \
   SMOOTHNESS_LINE_COUNTS=2000,100000 \
   SMOOTHNESS_SURFACES=editor,diff \
   SMOOTHNESS_FIXTURES=fold-dense \
   SMOOTHNESS_CODE_FOLDING=on \
   SMOOTHNESS_BURST_DURATIONS=3000 \
   SMOOTHNESS_BURST_WINDOW=200 \
   SMOOTHNESS_BURST_NOTCHES=12 \
   SMOOTHNESS_REQUIRE_FRAME_PROGRESS=1 \
   bun "$ROOT/scripts/harness/measure-scroll-smoothness.ts" \
     >"$RENDER_PROGRESS_JSON" 2>"$RENDER_PROGRESS_LOG"; then
  read -r render_progress_case_count render_progress_burst_count \
    render_progress_minimum_frames render_progress_expected_shape \
    render_progress_holds <<<"$(python3 -c "
import json
report = json.load(open('$RENDER_PROGRESS_JSON'))
cases = report['cases']
bursts = [
    (case, burst)
    for case in cases
    for burst in case['continuousInputBursts']
]
minimum_frames = min(
    frame_count
    for _case, burst in bursts
    for frame_count in burst['inputWindowFrameCounts']
) if bursts else 0
expected_shape = (
    len(cases) == 4
    and {case['surface'] for case in cases} == {'editor', 'diff'}
    and {case['fixtureLineCount'] for case in cases} == {2000, 100000}
    and all(case['fixtureShape'] == 'fold-dense' for case in cases)
    and all(
        len(burst['inputWindowFrameCounts']) == 15
        for _case, burst in bursts
    )
)
print(
    len(cases),
    len(bursts),
    minimum_frames,
    int(expected_shape),
    int(
        expected_shape
        and len(bursts) == 4
        and all(
            all(frame_count >= 1
                for frame_count in burst['inputWindowFrameCounts'])
            for _case, burst in bursts
        )
    ),
)
")"
  python3 - "$RENDER_PROGRESS_JSON" <<'PY'
import json
import sys

report = json.load(open(sys.argv[1]))
print(
    "  | surface | lines | frames per 200ms input window "
    "| consecutive zero-frame windows |"
)
print("  | :--- | ---: | :--- | ---: |")
for case in report["cases"]:
    burst = case["continuousInputBursts"][0]
    counts = ",".join(str(count) for count in burst["inputWindowFrameCounts"])
    zero_windows = burst["maximumConsecutiveZeroFrameWindows"]
    print(
        f"  | {case['surface']} | {case['fixtureLineCount']} | "
        f"{counts} | {zero_windows} |"
    )
PY
  if [ "${render_progress_holds:-0}" -eq 1 ] 2>/dev/null; then
    render_progress_summary="cases=$render_progress_case_count"
    render_progress_bursts="bursts=$render_progress_burst_count"
    render_progress_minimum="minimum=$render_progress_minimum_frames"
    render_progress_summary="$render_progress_summary $render_progress_bursts"
    render_progress_summary="$render_progress_summary $render_progress_minimum"
    render_progress_result="editor and diff emit >=1 completed frame"
    render_progress_result="$render_progress_result in every rapid-input window"
    pass "$render_progress_result at 2k and 100k ($render_progress_summary)"
  else
    render_progress_summary="cases=${render_progress_case_count:-0}"
    render_progress_bursts="bursts=${render_progress_burst_count:-0}"
    render_progress_summary="$render_progress_summary $render_progress_bursts"
    render_progress_shape="expectedShape=${render_progress_expected_shape:-0}"
    render_progress_summary="$render_progress_summary $render_progress_shape"
    render_progress_minimum="minimum=${render_progress_minimum_frames:-0}"
    render_progress_summary="$render_progress_summary $render_progress_minimum"
    bad "completed frames starved during rapid input ($render_progress_summary)"
  fi
else
  bad "render-progress instrument did not complete — see $RENDER_PROGRESS_LOG"
  sed -n '1,20p' "$RENDER_PROGRESS_LOG"
fi
if python3 - <<'PY'
counts_with_starvation = [2, 0, 3]
all_windows_rendered = all(
    count >= 1 for count in counts_with_starvation
)
raise SystemExit(0 if all_windows_rendered else 1)
PY
then
  bad "render-progress positive control accepted a zero-frame input window"
else
  pass "render-progress positive control rejects a zero-frame input window"
fi

# ---- CONTRACT: real-rate wheel input joins one animation owner ----
# A trackpad emits individual events at roughly 150/s, not twelve-event PTY chunks at 60/s. Every
# event must survive as an impulse, while projection work is coalesced below the input count. The
# same event/impulse fingerprint and row travel within one maximum animation
# step must hold at 2k and 100k lines on editor and diff. Bootstrap caps that
# step at 100 ms, so the derived default bound is ceil(220 rows/s * 0.1 s) =
# 22 rows. Nominal 30 FPS is a cadence target, not a maximum frame duration.
echo "== CONTRACT glide-input-coalescing: real-rate events join one animation =="
GLIDE_INPUT_JSON="$ROOT/artifacts/glide-input-coalescing.json"
GLIDE_INPUT_LOG="$ROOT/artifacts/glide-input-coalescing.log"
if SMOOTHNESS_GESTURES=0 \
   SMOOTHNESS_ACCUMULATION_FLICKS=0 \
   SMOOTHNESS_LINE_COUNTS=2000,100000 \
   SMOOTHNESS_SURFACES=editor,diff \
   SMOOTHNESS_FIXTURES=fold-dense \
   SMOOTHNESS_CODE_FOLDING=on \
   SMOOTHNESS_BURST_DURATIONS=900 \
   SMOOTHNESS_BURST_WINDOW=6 \
   SMOOTHNESS_BURST_NOTCHES=1 \
   SMOOTHNESS_MAXIMUM_GLIDE_DURATION=900 \
   SMOOTHNESS_MAXIMUM_ANIMATION_DELTA_TIME_SECONDS=0.1 \
   SMOOTHNESS_REQUIRE_INPUT_COALESCING=1 \
   bun "$ROOT/scripts/harness/measure-scroll-smoothness.ts" \
     >"$GLIDE_INPUT_JSON" 2>"$GLIDE_INPUT_LOG"; then
  python3 - "$GLIDE_INPUT_JSON" <<'PY'
import json
import sys

report = json.load(open(sys.argv[1]))
print(
    "  | surface | lines | windows | events | impulses | "
    "projections | rows | max step | row sequence |"
)
print(
    "  | :--- | ---: | ---: | ---: | ---: | ---: | ---: | "
    "---: | :--- |"
)
for case in report["cases"]:
    burst = case["continuousInputBursts"][0]
    print(
        f"  | {case['surface']} | {case['fixtureLineCount']} | "
        f"{len(burst['inputWindowFrameCounts'])} | "
        f"{burst['inputEventCount']} | {burst['appliedImpulseCount']} | "
        f"{burst['projectionPassCount']} | {burst['rowsTravelled']} | "
        f"{burst['maximumFrameDeltaRows']} | "
        f"{','.join(str(rows) for rows in burst['rowCrossingSequence'])} |"
    )
print(
    "  scale-travel bound: "
    f"{report['maximumAnimationFrameTravelRows']} rows = ceil("
    f"{report['verticalFlingCeiling']} rows/s * "
    f"{report['maximumAnimationDeltaTimeSeconds']} s)"
)
print(
    "  scale-travel positive control RED (expected): "
    + report["continuousInputScaleTravelPositiveControl"]
)
PY
  pass "150 real-rate events all join momentum; projection and scale counts hold"
else
  bad "real-rate wheel input jammed or changed with scale — see $GLIDE_INPUT_LOG"
  sed -n '1,25p' "$GLIDE_INPUT_LOG"
fi

# ---- CONTRACT: wrap-mode momentum + visual-row extent (RATCHET: the "momentum gone in wrap" report) ----
# Wrap mode feeds the SAME momentum engine in VISUAL-ROW units, so it glides like non-wrap AND reaches
# the true last visual row (extent = wrapped visual rows, not logical lines). Both were user-felt gaps.
echo "== CONTRACT wrap-scroll: wrap-mode wheel glides-then-decays + reaches the true last visual row =="
WRAP=$(mktemp -d /tmp/tui-bc-wrap.XXXXXX); python3 -c "open('$WRAP/w.txt','w').write(''.join('L%03d '%i + 'word '*40 + '\n' for i in range(200)))"
python3 -c "import json,os;p=os.path.expanduser('$SET');d=json.load(open(p));d['wordWrap']=True;json.dump(d,open(p,'w'),indent=2)"
S="bc-wrap-$$"; SESSIONS="$SESSIONS $S"
"$H" launch "$S" 120x40 bun run src/main.ts "$WRAP" >/dev/null; "$H" ready "$S" 20 >/dev/null
open_file "$S"
tmux send-keys -t "$S" -l "$(printf '\033[<0;60;12M')"; tmux send-keys -t "$S" -l "$(printf '\033[<0;60;12m')"; sleep 0.2  # focus
tmux send-keys -t "$S" -l "$(printf '\033[<65;60;12M')"   # ONE wheel-down
sleep 0.12; wearly="$("$H" field "$S" editorScrollTop)"
if ! await_workspace_momentum_at_rest "$S"; then
  bad "wrap-mode single notch did not publish momentum at rest"
fi
wsingle="$("$H" field "$S" editorScrollTop)"
sleep 0.6; wsingle_rest="$("$H" field "$S" editorScrollTop)"
for _ in 1 2 3 4 5; do tmux send-keys -t "$S" -l "$(printf '\033[<65;60;12M')"; done
sleep 0.12
if ! await_workspace_momentum_at_rest "$S"; then
  bad "wrap-mode ramp did not publish momentum at rest"
fi
wramped="$("$H" field "$S" editorScrollTop)"
sleep 0.6; wrest="$("$H" field "$S" editorScrollTop)"
wgain=$((wramped - wsingle_rest))
if [ "${wsingle:-0}" -ge 1 ] 2>/dev/null \
   && [ "${wsingle_rest:-0}" = "${wsingle:-0}" ] 2>/dev/null \
   && [ "${wgain:-0}" -gt "$((wsingle * 2))" ] 2>/dev/null \
   && [ "${wrest:-0}" = "${wramped:-0}" ]; then
  pass "wrap-mode five notches accelerate then decay to rest (gain=$wgain vs single=$wsingle, rest=$wrest; early=$wearly)"
else
  bad "wrap-mode NO progressive gain/decay (gain=$wgain single=$wsingle singleRest=$wsingle_rest ramped=$wramped rest=$wrest early=$wearly)"
fi
# Extent: PageDown to the end reaches a visual-row scrollTop that EXCEEDS the 200 logical lines (a
# logical-line extent would cap near lineCount-height ~162; visual rows go much further).
for _ in $(seq 1 25); do "$H" send "$S" PageDown >/dev/null 2>&1; done; sleep 0.3; "$H" settle "$S" >/dev/null 2>&1
wbottom="$("$H" field "$S" editorScrollTop)"
if [ "${wbottom:-0}" -gt 200 ] 2>/dev/null; then
  pass "wrap-mode reaches true last visual row (scrollTop=$wbottom > 200 logical lines)"
else
  bad "wrap-mode capped at logical lines (scrollTop=$wbottom, expected > 200 visual rows)"
fi
python3 -c "import json,os;p=os.path.expanduser('$SET');d=json.load(open(p));d['wordWrap']=False;json.dump(d,open(p,'w'),indent=2)"
"$H" kill "$S" >/dev/null 2>&1; rm -rf "$WRAP"

# ---- CONTRACT: idle quiescence (the MIRROR of momentum-glide — motion STOPS at rest) ----
# Rendering is demand-driven: over a fully-untouched window the FRAME COUNTER must not advance at all
# (authoritative signal — CPU stays low even while an empty loop ticks, the false-green a pre-fix build
# shipped). Paired with momentum-glide, these two bound the feel: motion continues when pushed, and the
# loop halts when left alone.
# Idle is demand-driven, NOT a busy loop. The status-bar minute-clock is the one legitimate periodic
# wake — it repaints EXACTLY once per minute at the boundary — so a few-second window sees 0 frames
# between ticks, at most 1 if a minute boundary falls inside it. A busy loop would be ~90 (30fps×3s):
# the ≤1 bound cleanly separates the two.
echo "== CONTRACT idle-quiescence: at rest the render loop STOPS (frame delta <= 1: clock only) =="
S="bc-idle-$$"; SESSIONS="$SESSIONS $S"
"$H" launch "$S" 120x40 bun run src/main.ts "$TREE" >/dev/null; "$H" ready "$S" 20 >/dev/null
"$H" send "$S" Escape >/dev/null; "$H" settle "$S" >/dev/null 2>&1; sleep 1
istart="$("$H" field "$S" frame)"; sleep 3; iend="$("$H" field "$S" frame)"
if [ "$(( ${iend:-0} - ${istart:-0} ))" -le 1 ]; then
  pass "idle frame delta <= 1 over 3s untouched (frame $istart -> $iend; clock tick at most)"
else
  bad "idle loop still ticking ($istart -> $iend) — rendering is NOT demand-driven"
fi
"$H" kill "$S" >/dev/null 2>&1

# ---- CONTRACT: open a file → scroll reaches the true LAST line AND back to the true FIRST line ----
# THE REAL USER PATH, both directions (user requirement, RATCHET for the focus-on-open/cursor-pin bug):
# open a MODERATE file (a few screenfuls), then FROM THE POST-OPEN STATE — no injected focus click, no
# driving scrollTop directly — scroll via the REAL input. Down (wheel + PageDown) must reach + render the
# TRUE LAST line; Up (wheel + PageUp) must return + render the TRUE FIRST line. Catches THREE bug classes:
# focus-on-open (wheel does nothing after open), a cursor-reveal that re-pins the viewport to the cursor
# (the $watchEffect-over-tracking bug), and wrong max-scroll extent (can't reach an end).
echo "== CONTRACT open-then-scroll: reaches the true last line AND returns to the true first line =="
S="bc-scroll-$$"; SESSIONS="$SESSIONS $S"
SDIR=$(mktemp -d /tmp/tui-bc-scroll.XXXXXX)
# ~110 lines ≈ 3 screenfuls at a 40-row terminal (viewport ~36) — enough to traverse start↔end fast.
python3 -c "open('$SDIR/doc.txt','w').write(''.join('LINE-%03d body\n'%i for i in range(110)))"
python3 -c "import json,os;p=os.path.expanduser('$SET');d=json.load(open(p));d['wordWrap']=False;json.dump(d,open(p,'w'),indent=2)"
"$H" launch "$S" 120x40 env TUI_FRAME_DUMP=1 bun run src/main.ts "$SDIR" >/dev/null; "$H" ready "$S" 20 >/dev/null
open_file "$S"   # open via the tree (Enter) — DO NOT click into the editor (that would mask focus-on-open)
# 1) From the post-open state, a WHEEL alone must MOVE the viewport (focus-on-open / cursor-pin regression).
for _ in 1 2 3 4 5 6; do tmux send-keys -t "$S" -l "$(printf '\033[<65;60;12M')"; sleep 0.12; done; sleep 0.4; "$H" settle "$S" >/dev/null 2>&1
wheel_moved="$("$H" field "$S" editorScrollTop)"
if [ "${wheel_moved:-0}" -gt 0 ] 2>/dev/null; then pass "wheel scrolls right after open, no click (scrollTop=$wheel_moved)"; else bad "wheel does NOT scroll after open (scrollTop=$wheel_moved) — focus-on-open/cursor-pin regression"; fi
# 2) Continue to the TRUE END via keyboard; assert the LAST line renders near the bottom of the editor.
for _ in $(seq 1 12); do "$H" send "$S" PageDown >/dev/null 2>&1; done; sleep 0.3; "$H" settle "$S" >/dev/null 2>&1
"$H" send "$S" PageDown >/dev/null; sleep 0.2; "$H" settle "$S" >/dev/null 2>&1
last_ok=$(python3 -c "
import json
rows=json.load(open('$ROOT/artifacts/frame-$S.json'))['rows']
print('yes' if any('LINE-109' in r.get('text','') for r in rows) else 'no')
")
if [ "$last_ok" = "yes" ]; then pass "scrolling DOWN reaches + renders the TRUE last line (LINE-109)"; else bad "cannot reach the true last line (LINE-109 not rendered at the bottom)"; fi
# 3) Scroll back UP via wheel + keyboard to the TRUE START; assert the FIRST line renders + scrollTop 0.
for _ in $(seq 1 6); do tmux send-keys -t "$S" -l "$(printf '\033[<64;60;12M')"; sleep 0.1; done
for _ in $(seq 1 12); do "$H" send "$S" PageUp >/dev/null 2>&1; done; sleep 0.3; "$H" settle "$S" >/dev/null 2>&1
top="$("$H" field "$S" editorScrollTop)"
first_ok=$(python3 -c "
import json
rows=json.load(open('$ROOT/artifacts/frame-$S.json'))['rows']
print('yes' if any('LINE-000' in r.get('text','') for r in rows) else 'no')
")
if [ "$first_ok" = "yes" ] && [ "${top:-9}" = "0" ]; then pass "scrolling UP returns to + renders the TRUE first line (LINE-000, scrollTop 0)"; else bad "cannot return to the true first line (LINE-000 rendered=$first_ok, scrollTop=$top)"; fi
"$H" kill "$S" >/dev/null 2>&1; rm -rf "$SDIR"

# ---- CONTRACT: focus-in recovers the terminal session (RATCHET: the VS Code tab-defocus freeze) ----
# A VS Code terminal tab reset the terminal session state (termios raw / mouse / focus / stale frame)
# on tab-hide; the app must re-enter the FULL setup on focus-in and EMIT A FRESH FRAME. Since a focus
# report (\e[I) is NOT a keypress (OpenTUI consumes it), the ONLY thing that can advance the idle,
# demand-driven frame counter after \e[I is the focus handler forcing a repaint — so a frame advance
# is the clean observable proof the recovery ran. The app must also stay RESPONSIVE afterward (wheel
# still scrolls). The real termios/mouse mode-loss can't be faked over tmux (only a real terminal
# resets it) — that half is gated by the terminal-session unit test + confirmed on the user's terminal.
echo "== CONTRACT focus-recovery: focus-out→focus-in emits a fresh frame + keeps the app responsive =="
S="bc-focus-$$"; SESSIONS="$SESSIONS $S"
FDIR=$(mktemp -d /tmp/tui-bc-focus.XXXXXX)
python3 -c "open('$FDIR/doc.txt','w').write(''.join('FLINE-%03d body\n'%i for i in range(200)))"
"$H" launch "$S" 120x40 bun run src/main.ts "$FDIR" >/dev/null; "$H" ready "$S" 20 >/dev/null
open_file "$S"
"$H" send "$S" Escape >/dev/null; "$H" settle "$S" >/dev/null 2>&1; sleep 1
f_before="$("$H" field "$S" frame)"
# Retry the focus cycle a few times: the repaint is real but timing-sensitive, and under heavy
# concurrent load a single settle window can miss it. A genuine freeze regression fails ALL attempts.
f_after="$f_before"
for _focus_attempt in 1 2 3; do
  "$H" focus "$S" out; "$H" focus "$S" in
  "$H" settle "$S" 10 >/dev/null 2>&1; sleep 0.3
  f_after="$("$H" field "$S" frame)"
  [ "$(( ${f_after:-0} - ${f_before:-0} ))" -gt 0 ] && break
  sleep 0.5
done
if [ "$(( ${f_after:-0} - ${f_before:-0} ))" -gt 0 ]; then
  pass "focus-in emits a fresh frame (recovery ran: $f_before -> $f_after)"
else
  bad "focus-in did NOT repaint ($f_before -> $f_after) — stale-screen/freeze regression"
fi
# Responsive after the focus cycle: a wheel notch still moves the viewport (suspend/resume didn't wedge input).
scroll_before="$("$H" field "$S" editorScrollTop)"
scroll_after="$scroll_before"
for _wheel_attempt in 1 2 3; do
  for _ in 1 2 3 4 5 6; do tmux send-keys -t "$S" -l "$(printf '\033[<65;60;12M')"; sleep 0.1; done; sleep 0.4; "$H" settle "$S" >/dev/null 2>&1
  scroll_after="$("$H" field "$S" editorScrollTop)"
  [ "${scroll_after:-0}" -gt "${scroll_before:-0}" ] 2>/dev/null && break
  sleep 0.5
done
if [ "${scroll_after:-0}" -gt "${scroll_before:-0}" ] 2>/dev/null; then
  pass "app stays responsive after focus recovery (wheel scrolled $scroll_before -> $scroll_after)"
else
  bad "app DEAD after focus recovery (scrollTop $scroll_before -> $scroll_after) — suspend/resume wedged input"
fi
"$H" kill "$S" >/dev/null 2>&1; rm -rf "$FDIR"

# ---- CONTRACT: pane independence — a diff open/close never corrupts the editor pane (RATCHET) ----
# ESSENCE (project.invariants "A pane is a self-contained scrollable viewport"): opening a SIBLING pane
# (the side-by-side diff, mounted by swapping editorArea↔diffContainer in editorColumn) must NOT alter
# the editor pane's scroll extent. This is the fae9349 regression (shared-container swap corrupted the
# editor's height so it could not reach its true last line — reverted d01873f, previously UNGATED). The
# drive: reach the editor's TRUE last line → open a change diff → close it → the editor still reaches
# the SAME true last line at the SAME max-scroll. If the swap corrupts the editor pane, the after-scroll
# falls short.
echo "== CONTRACT pane-independence: open+close a diff, the editor pane still reaches its true last line =="
PDIR=$(mktemp -d /tmp/tui-bc-pane.XXXXXX)
S="bc-pane-$$"; SESSIONS="$SESSIONS $S"
python3 -c "open('$PDIR/doc.txt','w').write(''.join('PLINE-%03d body\n'%i for i in range(120)))"
# A committed file, then modify an EARLY line so it is a git change while the TRUE last line stays PLINE-119.
( cd "$PDIR" && env -u GIT_DIR -u GIT_INDEX_FILE -u GIT_WORK_TREE -u GIT_OBJECT_DIRECTORY sh -c \
  'git init -q && git add -A && git -c user.email=a@b.c -c user.name=x commit -qm init' )
python3 -c "p='$PDIR/doc.txt';L=open(p).read().splitlines();L[5]='PLINE-005 CHANGED';open(p,'w').write('\n'.join(L)+'\n')"
"$H" launch "$S" 120x40 env TUI_FRAME_DUMP=1 bun run src/main.ts "$PDIR" >/dev/null; "$H" ready "$S" 20 >/dev/null
PFRAME="$ROOT/artifacts/frame-$S.json"
pane_last(){ python3 -c "import json;rows=json.load(open('$PFRAME'))['rows'];print('yes' if any('PLINE-119' in r.get('text','') for r in rows) else 'no')"; }
# open doc.txt (row 0 is .git; Down selects doc.txt), focus the editor, reach the true last line
for _ in 1 2 3 4; do b="$("$H" field "$S" activeBuffer)"; [ -n "$b" ] && [ "$b" != null ] && break; "$H" send "$S" Down >/dev/null; sleep 0.15; "$H" send "$S" Enter >/dev/null; sleep 0.3; done
"$H" send "$S" Right >/dev/null
for _ in $(seq 1 15); do "$H" send "$S" PageDown >/dev/null 2>&1; done; sleep 0.3; "$H" settle "$S" >/dev/null 2>&1
pane_before_top="$("$H" field "$S" editorScrollTop)"; pane_before_last="$(pane_last)"
# open the change diff (Ctrl+G → git panel; 'o' opens the selected change's diff), then close it
"$H" send "$S" C-g >/dev/null; sleep 0.3; "$H" settle "$S" >/dev/null 2>&1
"$H" send "$S" o >/dev/null; sleep 0.6; "$H" settle "$S" >/dev/null 2>&1
pane_diff_open="$("$H" field "$S" showingDiff)"
"$H" send "$S" Escape >/dev/null; sleep 0.3; "$H" settle "$S" >/dev/null 2>&1
# back in the editor, reach the true last line AGAIN
"$H" send "$S" Right >/dev/null
for _ in $(seq 1 15); do "$H" send "$S" PageDown >/dev/null 2>&1; done; sleep 0.3; "$H" settle "$S" >/dev/null 2>&1
pane_after_top="$("$H" field "$S" editorScrollTop)"; pane_after_last="$(pane_last)"
"$H" kill "$S" >/dev/null 2>&1; rm -rf "$PDIR"
if [ "$pane_diff_open" = true ] && [ "$pane_before_last" = yes ] && [ "$pane_after_last" = yes ] \
   && [ "${pane_after_top:-0}" = "${pane_before_top:-1}" ]; then
  pass "editor reaches its true last line + same extent after a diff open/close (top=$pane_before_top, PLINE-119 rendered)"
else
  bad "diff swap corrupted the editor pane (diffOpened=$pane_diff_open before: top=$pane_before_top last=$pane_before_last after: top=$pane_after_top last=$pane_after_last)"
fi

echo "== CONTRACT plugin-manifest: contributions install and uninstall symmetrically =="
if bash "$DIR/smoke-plugin-manifest.sh"; then
  pass "plugin settings, keybindings, and Extensions lifecycle drive"
else
  bad "plugin manifest drive failed"
fi

echo ""
if [ "$fail" = 0 ]; then echo "behavioral-contracts: ALL-PASS"; else echo "behavioral-contracts: FAILURES"; fi
exit "$fail"

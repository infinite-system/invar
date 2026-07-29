#!/usr/bin/env bash
# census.sh — deterministic size and discipline census for Invar.
#
# Prints the numbers the project makes public claims from: scale, velocity,
# structure, the discipline greps that are supposed to stay at zero, and the
# object-graph depth that the "namespace pattern" articles cite.
#
# Deterministic: pure git + find + grep over the working tree. No network, no
# build, no test run. Same tree in, same numbers out.
#
#   scripts/census.sh          human-readable report
#   scripts/census.sh --json   one JSON object (for agents and dashboards)
#
# Counting rules (stated so the numbers are reproducible, not vibes):
#   - "source" = src/**/*.ts excluding *.test.ts
#   - "tests"  = src/**/*.test.ts
#   - "harness" = scripts/**/*.{sh,ts,mjs}
#   - discipline greps exclude test files unless noted
set -euo pipefail

cd "$(git rev-parse --show-toplevel)"

# ── helpers ─────────────────────────────────────────────────────────────
# A count of ZERO is a success here, but grep exits 1 on no-match and
# `set -o pipefail` would kill the run — every counter below swallows that.
lines() { find "$@" -print0 2>/dev/null | xargs -0 cat 2>/dev/null | wc -l | tr -d ' '; }
count() { find "$@" 2>/dev/null | wc -l | tr -d ' '; }

# nlines <text> — count lines in a captured blob (empty blob = 0)
nlines() { [ -z "$1" ] && echo 0 || printf '%s\n' "$1" | wc -l | tr -d ' '; }

# src_fixed <literal>   — literal matches in src/**/*.ts, excluding tests
src_fixed() {
  local out
  out=$(grep -rnF --include='*.ts' -- "$1" src 2>/dev/null | grep -v '\.test\.' || true)
  nlines "$out"
}
# src_re <regex> [-i]   — regex matches in src/**/*.ts, excluding tests
src_re() {
  local out
  out=$(grep -rnE --include='*.ts' ${2:-} -- "$1" src 2>/dev/null | grep -v '\.test\.' || true)
  nlines "$out"
}
# all_re <regex> [-i]   — regex matches including test files
all_re() {
  local out
  out=$(grep -rnE --include='*.ts' ${2:-} -- "$1" src 2>/dev/null || true)
  nlines "$out"
}
# all_fixed <literal>   — literal matches including test files
all_fixed() {
  local out
  out=$(grep -rnF --include='*.ts' -- "$1" src 2>/dev/null || true)
  nlines "$out"
}

SRC_TS=(src -name '*.ts')
SRC_NOTEST=(src -name '*.ts' -not -name '*.test.ts')
SRC_TEST=(src -name '*.test.ts')

# ── scale ───────────────────────────────────────────────────────────────
source_lines=$(lines "${SRC_NOTEST[@]}")
test_lines=$(lines "${SRC_TEST[@]}")
total_ts=$(lines "${SRC_TS[@]}")
files=$(count "${SRC_TS[@]}")
source_files=$(count "${SRC_NOTEST[@]}")
test_files=$(count "${SRC_TEST[@]}")
modules=$(find src/modules -maxdepth 1 -mindepth 1 -type d 2>/dev/null | wc -l | tr -d ' ')

contracts=$(count src -name '*.invariants.md')
contract_lines=$(lines src -name '*.invariants.md')

harness_lines=$(lines scripts \( -name '*.sh' -o -name '*.ts' -o -name '*.mjs' \))
harness_files=$(count scripts \( -name '*.sh' -o -name '*.ts' -o -name '*.mjs' \))

# ── velocity ────────────────────────────────────────────────────────────
commits=$(git rev-list --count HEAD)
# tail -1 (not reverse|head) — head closes the pipe early and SIGPIPEs git under pipefail
first_epoch=$(git log --format='%ct' | tail -1)
last_epoch=$(git log -1 --format='%ct')
first_date=$(git log --format='%cs' | tail -1)
age_seconds=$(( last_epoch - first_epoch ))
age_days=$(( age_seconds / 86400 ))
age_hours=$(( (age_seconds % 86400) / 3600 ))
# days elapsed, minimum 1, for the per-day average
avg_span=$(( age_days > 0 ? age_days : 1 ))
commits_per_day=$(( commits / avg_span ))
lines_per_day=$(( (source_lines + test_lines + harness_lines) / avg_span ))

# ── structure: the class census ─────────────────────────────────────────
CLASS_DECL='^[[:space:]]*(export[[:space:]]+)?(abstract[[:space:]]+)?class[[:space:]]+'
classes=$(src_re "$CLASS_DECL")
raw_classes=$(src_re "${CLASS_DECL}[$]")
reactive_sites=$(src_fixed '= Reactive(')
static_sites=$(src_fixed '= Static(')
if [ "$classes" -gt 0 ]; then
  uniformity=$(( raw_classes * 100 / classes ))
else
  uniformity=0
fi

# ── discipline: the counts that are supposed to stay at zero ────────────
cycle_hacks=$(all_re 'break.*circular|circular.*break|to break.*cycle|await import.*cycle' -i)
memo_calls=$(all_re 'useMemo|useCallback|React[.]memo')
lint_disables=$(all_fixed 'eslint-disable')
type_suppressions=$(all_re '@ts-ignore|@ts-expect-error')
hand_caches=$(all_fixed 'Object.defineProperty(this')
computeds_raw=$(grep -rnF --include='*.ts' -- 'computed(' src 2>/dev/null | grep -v '\.test\.' | grep -vE ':[0-9]+:[[:space:]]*([*]|//)' || true)
computeds=$(nlines "$computeds_raw")

# ── object-graph depth: the metric the articles cite ─────────────────────
# The canonical chain from the posts, and the general shape: a lowercase-rooted
# identifier followed by 3+ property hops — the navigation the ecosystem gave up
# on when initialization order made hop two unreliable. Comment lines excluded;
# import statements excluded.
DEEP='\b[a-z][A-Za-z0-9_$]*(\.[a-zA-Z_$][A-Za-z0-9_$]*){3,}'
deep_raw=$(grep -rnE --include='*.ts' -- "$DEEP" src 2>/dev/null \
  | grep -v '\.test\.' | grep -vE ':[0-9]+:[[:space:]]*(//|[*]|import )' || true)
deep_chains=$(nlines "$deep_raw")
workspace_chains=$(src_fixed 'workspaceSet.active.')
deepest=$( { grep -rhoE --include='*.ts' -- "$DEEP" src 2>/dev/null || true; } \
  | awk '{n=gsub(/[.]/,"."); if (n>max) {max=n; line=$0}} END {print (max+0)" hops · "line}')

commit=$(git rev-parse --short HEAD)
today=$(git log -1 --format='%cs')

# ── output ──────────────────────────────────────────────────────────────
if [ "${1:-}" = "--json" ]; then
  cat <<JSON
{
  "commit": "$commit",
  "as_of": "$today",
  "age_days": $age_days,
  "commits": $commits,
  "commits_per_day": $commits_per_day,
  "lines_per_day": $lines_per_day,
  "source_lines": $source_lines,
  "test_lines": $test_lines,
  "total_ts_lines": $total_ts,
  "harness_lines": $harness_lines,
  "contract_lines": $contract_lines,
  "files": $files,
  "source_files": $source_files,
  "test_files": $test_files,
  "harness_files": $harness_files,
  "modules": $modules,
  "contracts": $contracts,
  "classes": $classes,
  "raw_classes": $raw_classes,
  "uniformity_percent": $uniformity,
  "reactive_sites": $reactive_sites,
  "static_sites": $static_sites,
  "cycle_hacks": $cycle_hacks,
  "memo_calls": $memo_calls,
  "lint_disables": $lint_disables,
  "type_suppressions": $type_suppressions,
  "hand_rolled_caches": $hand_caches,
  "computed_calls": $computeds,
  "deep_chains": $deep_chains,
  "workspace_chains": $workspace_chains
}
JSON
  exit 0
fi

printf '\n  INVAR CENSUS  ·  %s  ·  commit %s\n' "$today" "$commit"
printf '  ──────────────────────────────────────────────────────────\n\n'

printf '  SCALE\n'
printf '    source (non-test)      %8s lines   %5s files\n' "$source_lines" "$source_files"
printf '    tests                  %8s lines   %5s files\n' "$test_lines" "$test_files"
printf '    total TypeScript       %8s lines   %5s files\n' "$total_ts" "$files"
printf '    verification harness   %8s lines   %5s files\n' "$harness_lines" "$harness_files"
printf '    invariant contracts    %8s lines   %5s contracts\n' "$contract_lines" "$contracts"
printf '    modules                %8s\n\n' "$modules"

printf '  VELOCITY\n'
printf '    first commit           %8s   (%sd %sh ago)\n' "$first_date" "$age_days" "$age_hours"
printf '    commits                %8s   (~%s/day)\n' "$commits" "$commits_per_day"
printf '    written                %8s lines/day  (source+tests+harness)\n\n' "$lines_per_day"

printf '  PATTERN UNIFORMITY\n'
printf '    class declarations     %8s\n' "$classes"
printf '    $-prefixed (standard)  %8s   → %s%% conforming\n' "$raw_classes" "$uniformity"
printf '    Reactive() sites       %8s\n' "$reactive_sites"
printf '    Static() sites         %8s\n\n' "$static_sites"

printf '  DISCIPLINE  (these are meant to stay at zero)\n'
printf '    cycle-breaking hacks   %8s\n' "$cycle_hacks"
printf '    memoization calls      %8s\n' "$memo_calls"
printf '    eslint-disable         %8s\n' "$lint_disables"
printf '    type suppressions      %8s\n' "$type_suppressions"
printf '    hand-rolled caches     %8s\n' "$hand_caches"
printf '    computed() (opt-in)    %8s\n\n' "$computeds"

printf '  OBJECT-GRAPH DEPTH  (the navigation the ecosystem abandoned)\n'
printf '    deep chains (3+ hops)  %8s\n' "$deep_chains"
printf '    workspaceSet.active.*  %8s\n' "$workspace_chains"
printf '    deepest observed       %s\n\n' "$deepest"

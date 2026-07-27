#!/usr/bin/env bash

set -uo pipefail

cd "$(dirname "$0")/.."

retired_smoke_directory_path='scripts/retired-smokes/'
retired_smoke_child_pattern="${retired_smoke_directory_path}"\
'([[:alnum:]_.-]|[?*])'
known_violating_reference="${retired_smoke_directory_path}smoke-example.sh"

grep -Eq -- "$retired_smoke_child_pattern" <<<"$known_violating_reference"
positive_control_exit_code=$?
if [ "$positive_control_exit_code" -ne 0 ]; then
  echo "RETIRED-SMOKE-REFERENCE FAIL: positive control was not detected."
  echo "The checker cannot be trusted to inspect live references."
  exit 2
fi

live_reference_paths=()
while IFS= read -r -d '' live_reference_path; do
  live_reference_paths+=("$live_reference_path")
done < <(
  find . \
    \( -path './.git' -o -path './node_modules' -o \
       -path './scripts/retired-smokes' \) -prune -o \
    -type f \
    \( -name '*.invariants.md' -o -path './scripts/*' -o \
       -name 'project.*.md' \) \
    -print0 |
    sort -zu
)

if [ "${#live_reference_paths[@]}" -eq 0 ]; then
  echo "RETIRED-SMOKE-REFERENCE FAIL: inspected zero live files."
  exit 2
fi

reference_output="$(
  grep -IHnE -- "$retired_smoke_child_pattern" \
    "${live_reference_paths[@]}"
)"
reference_scan_exit_code=$?

if [ "$reference_scan_exit_code" -eq 0 ]; then
  echo "RETIRED-SMOKE-REFERENCE FAIL: live files cite retired smoke content:"
  echo "$reference_output"
  exit 1
fi

if [ "$reference_scan_exit_code" -ne 1 ]; then
  echo "RETIRED-SMOKE-REFERENCE FAIL: grep exited unexpectedly with" \
    "$reference_scan_exit_code."
  exit 2
fi

echo "retired-smoke-reference check: PASS" \
  "(${#live_reference_paths[@]} live files inspected)"

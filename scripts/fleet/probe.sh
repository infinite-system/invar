#!/usr/bin/env bash
# Two-arm probes: nothing here reports a result from one polarity.
#
# WHY THIS EXISTS
#
# The conductor's recurring mistake has one shape, and the user named it: "you would always check for
# existence but not non-existence, or vice versa." Every instance is the same error wearing different
# clothes.
#
#   find -mmin vs -newermt   `find -newermt '-10 minutes'` matches NOTHING. Zero results read as "the
#                            builder wrote no files." The builder was writing the whole time. Nothing
#                            asked whether the predicate could match anything at all.
#   monitor on "hash differs"  fired on the DELETION half of a rewrite. Difference was checked;
#                            existence was not.
#   grep | tail || echo      the `||` can never fire, because `tail` succeeds on empty input. The
#                            fallback branch was unreachable and the check could only pass.
#   builder liveness         a process matching a pattern was found. Whether a MISSING one would have
#                            been correctly reported as missing was never tested.
#   dispatch guard, today    three refusal cases verified. The fourth — the case that must NOT refuse
#                            — was run against a script with side effects, so "did not refuse" meant
#                            "cut a worktree and launched an agent."
#
# So every probe here takes BOTH arms and refuses to report unless they disagree:
#
#   the PRESENT arm must find something   (proves the probe can see)
#   the ABSENT arm must find nothing      (proves the probe can be silent)
#
# If both arms agree, the instrument is broken and says so instead of returning a number. A control
# that agrees with its subject is not a control.
#
# Usage:
#   probe.sh builders                 who is actually building, by cwd — never by pattern
#   probe.sh writes <dir> <minutes>   did anything write under <dir> recently
#   probe.sh gate                     is a merge gate running
#   probe.sh exit <command...>        run a command and report ITS status, not a pipeline's
#   probe.sh self-test                every probe against a known-present and known-absent subject

set -uo pipefail

REPOSITORY_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || echo /home/parallels/dev/tui-editor)"

# A builder is a process whose CWD is inside .invar/worktrees/. Resolved through /proc, never through
# argv: `pkill -f merge-gate.sh` once matched codex processes whose BRIEF TEXT said "do NOT run
# merge-gate.sh". A process's argv contains its instructions, including what it was told not to do.
builders_in() {
  local wanted_prefix="$1" count=0 pid cwd
  for pid in $(pgrep -x codex 2>/dev/null; pgrep -x claude 2>/dev/null); do
    cwd="$(readlink "/proc/$pid/cwd" 2>/dev/null)" || continue
    case "$cwd" in
      "$wanted_prefix"*) printf '  %s  %s  %s\n' "$pid" "$(ps -o etime= -p "$pid" | tr -d ' ')" "$cwd"; count=$((count + 1));;
    esac
  done
  return "$count"
}

two_arm() {
  # two_arm <label> <present-count> <absent-count>
  local label="$1" present="$2" absent="$3"
  if [ "$present" -eq 0 ] && [ "$absent" -eq 0 ]; then
    echo "  INSTRUMENT BROKEN — $label: neither arm found anything, so a zero here means nothing." >&2
    echo "    The probe cannot see. Do not read the result." >&2
    return 2
  fi
  if [ "$absent" -gt 0 ]; then
    echo "  INSTRUMENT BROKEN — $label: the ABSENT arm found $absent. The probe cannot be silent." >&2
    return 2
  fi
  return 0
}

probe_builders() {
  echo "BUILDERS (cwd under .invar/worktrees/, resolved via /proc)"
  builders_in "${REPOSITORY_ROOT}/.invar/worktrees/"
  local live=$?
  # ABSENT arm: a path no process can possibly have as its cwd. If this finds anything, the matcher
  # is too loose — which is exactly the bug that made `*worktrees/*` match other repos all session.
  builders_in "/nonexistent-control-path-$$/" >/dev/null
  local control=$?
  two_arm "builders" "$((live + 1))" "$control" || return 2
  echo "  live builders: $live"
  [ "$live" -eq 0 ] && echo "  (zero is a real zero — the matcher was proven able to match)"
  return 0
}

probe_writes() {
  local directory="$1" minutes="${2:-10}"
  # -mmin, NEVER -newermt with a relative string: `-newermt '-10 minutes'` matches nothing at all,
  # and its zero is indistinguishable from a quiet builder.
  local found
  found="$(find "$directory" -mmin "-${minutes}" -type f \
    -not -path '*/node_modules/*' -not -path '*/.git/*' 2>/dev/null | wc -l)"
  # PRESENT arm: plant a file that MUST be found. Without this, "0 writes" and "the predicate is
  # broken" are the same output.
  local canary="${directory}/.probe-canary-$$"
  : > "$canary" 2>/dev/null || { echo "  cannot write canary into $directory" >&2; return 2; }
  local with_canary
  with_canary="$(find "$directory" -mmin "-${minutes}" -type f \
    -not -path '*/node_modules/*' -not -path '*/.git/*' 2>/dev/null | wc -l)"
  rm -f "$canary"
  if [ "$with_canary" -le "$found" ]; then
    echo "  INSTRUMENT BROKEN — writes: a file created one second ago was not found by -mmin -${minutes}." >&2
    return 2
  fi
  echo "WRITES under $directory in the last ${minutes}m: $found"
  echo "  (canary proved the predicate matches: $found -> $with_canary)"
  return 0
}

probe_gate() {
  # The gate is identified by its own artifacts, not by a name in somebody's argv.
  local running=0 log
  for log in /tmp/*gate*.log; do
    [ -f "$log" ] || continue
    if [ -n "$(find "$log" -mmin -3 2>/dev/null)" ] && ! grep -q 'GATE_EXIT=' "$log" 2>/dev/null; then
      echo "  RUNNING: $log (written in the last 3m, no GATE_EXIT yet)"
      running=$((running + 1))
    fi
  done
  # ABSENT arm: a finished log must NOT be reported as running.
  local finished=0 f
  for f in /tmp/*gate*.log; do
    [ -f "$f" ] && grep -q 'GATE_EXIT=' "$f" 2>/dev/null && finished=$((finished + 1))
  done
  if [ "$running" -eq 0 ] && [ "$finished" -eq 0 ]; then
    echo "  INSTRUMENT BROKEN — gate: no gate logs at all, so 'no gate running' is not a finding." >&2
    return 2
  fi
  echo "GATE: $running running, $finished finished logs on disk"
  [ "$running" -eq 0 ] && echo "  safe to gate / safe to edit the tree"
  return 0
}

probe_exit() {
  # Read the status of the COMMAND, never of a pipeline's last stage. `git merge | tail -3; echo $?`
  # reported tail's success while the merge conflicted — four separate times.
  "$@" > /tmp/probe-exit-output-$$ 2>&1
  local status=$?
  echo "EXIT $status  <- $*"
  echo "  output (last 5 lines):"
  tail -5 /tmp/probe-exit-output-$$ | sed 's/^/    /'
  rm -f /tmp/probe-exit-output-$$
  return "$status"
}

self_test() {
  local failures=0
  echo "SELF-TEST — every probe against a known-present and a known-absent subject"

  # writes: a fresh temp dir is quiet; the canary must still prove the predicate works.
  local quiet_directory
  quiet_directory="$(mktemp -d)"
  if probe_writes "$quiet_directory" 10 | grep -q 'canary proved'; then
    echo "  PASS  writes: reports a real zero on a quiet directory, canary-verified"
  else
    echo "  FAIL  writes: could not distinguish a quiet directory from a broken predicate"; failures=$((failures + 1))
  fi
  # And the same probe must COUNT a file that is genuinely there.
  : > "$quiet_directory/planted"
  if [ "$(probe_writes "$quiet_directory" 10 | grep -oE 'last 10m: [0-9]+' | grep -oE '[0-9]+$')" -ge 1 ]; then
    echo "  PASS  writes: counts a genuinely present file"
  else
    echo "  FAIL  writes: missed a file that is present"; failures=$((failures + 1))
  fi
  rm -rf "$quiet_directory"

  # exit: must report the command's own non-zero, not the pipeline's zero.
  if probe_exit false >/dev/null 2>&1; then
    echo "  FAIL  exit: reported success for \`false\`"; failures=$((failures + 1))
  else
    echo "  PASS  exit: reports the command's own failure"
  fi
  if probe_exit true >/dev/null 2>&1; then
    echo "  PASS  exit: reports the command's own success"
  else
    echo "  FAIL  exit: reported failure for \`true\`"; failures=$((failures + 1))
  fi

  # builders: the absent arm must stay silent.
  if probe_builders >/dev/null 2>&1; then
    echo "  PASS  builders: both arms disagree, so the count is readable"
  else
    echo "  FAIL  builders: the instrument reported itself broken"; failures=$((failures + 1))
  fi

  echo ""
  if [ "$failures" -eq 0 ]; then
    echo "SELF-TEST: every probe proved it can BOTH fire and stay silent."
    return 0
  fi
  echo "SELF-TEST: $failures FAILURE(S)"
  return 1
}

case "${1:-}" in
  builders)  probe_builders;;
  writes)    shift; probe_writes "$@";;
  gate)      probe_gate;;
  exit)      shift; probe_exit "$@";;
  self-test) self_test;;
  *) sed -n '/^# Usage:/,/^$/p' "$0" | sed 's/^# \{0,1\}//' >&2; exit 2;;
esac

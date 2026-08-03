#!/usr/bin/env bash
# THE merge gate — every HARD-BLOCKING check a feature commit/merge must pass. This exists because
# conventions-gate.sh alone ran only tsc + the mechanical/meta checks, so the behavioral CONTRACTS
# (momentum-glide, wrap-scroll, idle-quiescence), the driving SMOKES, and the REAL per-field settings
# applied-effect drives DID NOT BLOCK A COMMIT — build-but-don't-wire applied to the gates themselves,
# violating project.requirements.md "MEASURED != ENFORCED". This wrapper runs them all; ANY non-zero
# exit fails the gate. Slow (many app launches) — it is the MERGE gate, not the every-keystroke check;
# conventions-gate.sh stays the fast inner loop (and is step 1 here).
# The gate preflight runs before any step or setup side effect. It proves that INVAR_GATE_WORKERS is
# a positive integer and that node_modules is non-empty. It also proves that every local provider
# binary used by the real-provider smokes is linked. An invalid worker count exits 2. Missing
# dependency ground truth exits 3 and names the frozen-lockfile repair.
#
# Usage: bash scripts/merge-gate.sh                 (run everything)
#        bash scripts/merge-gate.sh --dependency-preflight
#        bash scripts/merge-gate.sh --print-scratch-paths
#        FAST=1 bash scripts/merge-gate.sh          (skip the multi-launch smokes; conventions + contracts + meta only)
set -uo pipefail
DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$DIR/.." && pwd)"
cd "$ROOT"

set_gate_scratch_paths() {
  local scratch_base_directory="$1"
  local worktree_root="$2"
  local worktree_path_hash
  worktree_path_hash="$(
    printf '%s' "$worktree_root" |
      git hash-object --stdin |
      cut -c1-16
  )"
  failure_log_stable_path="$scratch_base_directory/merge-gate-failures.$worktree_path_hash"
  failure_log_directory="${failure_log_stable_path}.$$"
  binary_build_directory="$scratch_base_directory/merge-gate-binary-build.$worktree_path_hash.$$"
  binary_build_path="$binary_build_directory/iv"
}

set_gate_scratch_paths "/tmp" "$ROOT"

case "${1:-}" in
  --print-scratch-paths)
    echo "merge-gate: worktree root: $ROOT"
    echo "merge-gate: stable failure logs: $failure_log_stable_path"
    echo "merge-gate: this run's failure directory: $failure_log_directory"
    echo "merge-gate: this run's binary build: $binary_build_path"
    exit 0
    ;;
esac

dependency_preflight_exit_code=3
required_provider_binary_names=(
  "tsgo"
  "typescript-language-server"
)

run_dependency_preflight() {
  local dependency_problem=0
  local provider_binary_name
  local -a missing_provider_binary_paths=()

  if [ -f "$ROOT/bun.lock" ] &&
    {
      [ ! -d "$ROOT/node_modules" ] ||
        [ -z "$(find "$ROOT/node_modules" -mindepth 1 -maxdepth 1 -print -quit)" ]
    }
  then
    echo "merge-gate: dependency preflight failed because node_modules is missing or empty." >&2
    dependency_problem=1
  fi

  for provider_binary_name in "${required_provider_binary_names[@]}"; do
    if [ ! -x "$ROOT/node_modules/.bin/$provider_binary_name" ]; then
      missing_provider_binary_paths+=(
        "node_modules/.bin/$provider_binary_name"
      )
    fi
  done
  if [ "${#missing_provider_binary_paths[@]}" -gt 0 ]; then
    echo "merge-gate: dependency preflight failed because provider binaries are missing:" >&2
    printf '  %s\n' "${missing_provider_binary_paths[@]}" >&2
    dependency_problem=1
  fi
  if [ "$dependency_problem" -ne 0 ]; then
    echo "Run: bun install --frozen-lockfile" >&2
    return "$dependency_preflight_exit_code"
  fi
}

case "${1:-}" in
  --dependency-preflight)
    run_dependency_preflight
    dependency_preflight_result=$?
    exit "$dependency_preflight_result"
    ;;
esac

if ! run_dependency_preflight; then
  exit "$dependency_preflight_exit_code"
fi

gate_worker_count="${INVAR_GATE_WORKERS:-6}"
case "$gate_worker_count" in
  ''|*[!0-9]*|0)
    echo "merge-gate: INVAR_GATE_WORKERS must be a positive integer (received '$gate_worker_count')" >&2
    exit 2
    ;;
esac

export PATH="$HOME/.bun/bin:$PATH"
export INVAR_TEST_SUPPRESS_BUILT_IN_TASK=1
gate_started_seconds="$(date +%s)"

initialize_failure_log_directory() {
  local displaced_failure_log_path

  if ! mkdir "$failure_log_directory"; then
    echo "merge-gate: refusing to replace existing run evidence at" >&2
    echo "  $failure_log_directory" >&2
    return 1
  fi

  # `ln -sfn` does not replace a real directory: it creates a child symlink
  # inside it. Preserve that wrong-type directory before publishing the real
  # link. The move retains any old logs and never follows its child symlinks
  # into PID-qualified evidence directories.
  if [ -e "$failure_log_stable_path" ] &&
    [ ! -L "$failure_log_stable_path" ]
  then
    displaced_failure_log_path="$failure_log_stable_path.displaced.$(
      date +%s%N
    ).$$"
    if mv -- "$failure_log_stable_path" "$displaced_failure_log_path"; then
      echo "merge-gate: preserved wrong-type stable failure path at"
      echo "  $displaced_failure_log_path"
    elif [ -e "$failure_log_stable_path" ] &&
      [ ! -L "$failure_log_stable_path" ]
    then
      echo "merge-gate: cannot replace wrong-type stable failure path:" >&2
      echo "  $failure_log_stable_path" >&2
      return 1
    fi
  fi

  if ! ln -sfn "$failure_log_directory" "$failure_log_stable_path"; then
    echo "merge-gate: cannot publish stable failure-log symlink:" >&2
    echo "  $failure_log_stable_path" >&2
    return 1
  fi
  if [ ! -L "$failure_log_stable_path" ]; then
    echo "merge-gate: stable failure-log path is not a symlink:" >&2
    echo "  $failure_log_stable_path" >&2
    return 1
  fi
}

preserve_failure_log() {
  local destination_name="$1"
  local source_log="$2"
  cp "$source_log" "$failure_log_directory/$destination_name"
}

report_failure_log_provenance() {
  local resolved_failure_log_path
  resolved_failure_log_path="$(
    readlink -f "$failure_log_stable_path" 2>/dev/null || true
  )"
  echo "merge-gate: this run's failure logs: $failure_log_directory"
  if [ -n "$resolved_failure_log_path" ]; then
    echo "merge-gate: stable failure logs resolve to $resolved_failure_log_path"
  else
    echo "merge-gate: stable failure logs do not resolve:" >&2
    echo "  $failure_log_stable_path" >&2
  fi
}

run_failure_log_provenance_probe() {
  local probe_source_log="/tmp/merge-gate-provenance-probe-source.$$"

  failure_log_stable_path="$(
    printf '%s' \
      "${INVAR_MERGE_GATE_FAILURE_LOG_PROBE_STABLE_PATH:-}"
  )"
  if [ -z "$failure_log_stable_path" ]; then
    echo "merge-gate: provenance probe requires a stable-path override" >&2
    return 2
  fi
  failure_log_directory="${failure_log_stable_path}.$$"
  if ! initialize_failure_log_directory; then return 2; fi

  printf '%s\n' \
    "${INVAR_MERGE_GATE_FAILURE_LOG_PROBE_CONTENT:-}" \
    >"$probe_source_log"
  if ! preserve_failure_log \
    "failure-log-provenance-probe.log" \
    "$probe_source_log"
  then
    rm -f "$probe_source_log"
    return 2
  fi
  rm -f "$probe_source_log"
  echo "merge-gate: FAILURES — provenance probe"
  report_failure_log_provenance
  return 1
}

run_failure_log_provenance_self_test() {
  local displaced_failure_log_path
  local first_failure_log_path
  local first_probe_exit_code
  local first_probe_output
  local provenance_test_directory
  local second_failure_log_path
  local second_probe_exit_code
  local second_probe_output
  local stable_failure_log_path

  provenance_test_directory="$(
    mktemp -d /tmp/merge-gate-failure-log-provenance.XXXXXX
  )"
  stable_failure_log_path="$provenance_test_directory/merge-gate-failures"
  first_probe_output="$provenance_test_directory/first-probe.out"
  second_probe_output="$provenance_test_directory/second-probe.out"
  mkdir "$stable_failure_log_path"
  printf '%s\n' "stale-directory-content" \
    >"$stable_failure_log_path/stale.log"

  INVAR_MERGE_GATE_FAILURE_LOG_PROBE_STABLE_PATH="$stable_failure_log_path" \
    INVAR_MERGE_GATE_FAILURE_LOG_PROBE_CONTENT="first-run-content" \
    bash "$ROOT/scripts/merge-gate.sh" --failure-log-provenance-probe \
    >"$first_probe_output" 2>&1
  first_probe_exit_code=$?
  first_failure_log_path="$(
    readlink -f "$stable_failure_log_path" 2>/dev/null || true
  )"

  INVAR_MERGE_GATE_FAILURE_LOG_PROBE_STABLE_PATH="$stable_failure_log_path" \
    INVAR_MERGE_GATE_FAILURE_LOG_PROBE_CONTENT="second-run-content" \
    bash "$ROOT/scripts/merge-gate.sh" --failure-log-provenance-probe \
    >"$second_probe_output" 2>&1
  second_probe_exit_code=$?
  second_failure_log_path="$(
    readlink -f "$stable_failure_log_path" 2>/dev/null || true
  )"
  displaced_failure_log_path="$(
    find "$provenance_test_directory" \
      -maxdepth 1 \
      -type d \
      -name 'merge-gate-failures.displaced.*' \
      -print \
      -quit
  )"

  if [ "$first_probe_exit_code" -ne 1 ] ||
    [ "$second_probe_exit_code" -ne 1 ] ||
    [ ! -L "$stable_failure_log_path" ] ||
    [ -z "$first_failure_log_path" ] ||
    [ -z "$second_failure_log_path" ] ||
    [ "$first_failure_log_path" = "$second_failure_log_path" ] ||
    [ ! -f "$first_failure_log_path/failure-log-provenance-probe.log" ] ||
    [ "$(
      cat "$first_failure_log_path/failure-log-provenance-probe.log"
    )" != "first-run-content" ] ||
    [ "$(
      cat "$second_failure_log_path/failure-log-provenance-probe.log"
    )" != "second-run-content" ] ||
    [ -z "$displaced_failure_log_path" ] ||
    [ "$(
      cat "$displaced_failure_log_path/stale.log" 2>/dev/null || true
    )" != "stale-directory-content" ] ||
    ! grep -Fq \
      "stable failure logs resolve to $first_failure_log_path" \
      "$first_probe_output" ||
    ! grep -Fq \
      "stable failure logs resolve to $second_failure_log_path" \
      "$second_probe_output"
  then
    echo "failure-log provenance self-test: FAIL" >&2
    echo "  artifacts: $provenance_test_directory" >&2
    echo "  first probe exit: $first_probe_exit_code" >&2
    echo "  first run: $first_failure_log_path" >&2
    echo "  second probe exit: $second_probe_exit_code" >&2
    echo "  second run: $second_failure_log_path" >&2
    return 1
  fi

  echo "failure-log provenance self-test: stale directory preserved at"
  echo "  $displaced_failure_log_path"
  echo "failure-log provenance self-test: first run retained at"
  echo "  $first_failure_log_path"
  echo "failure-log provenance self-test: stable path resolves to second run"
  echo "  $stable_failure_log_path -> $second_failure_log_path"
  rm -rf -- "$provenance_test_directory"
}

run_scratch_path_namespace_probe() {
  local probe_binary_content
  local probe_failure_content
  local probe_source_log
  local probe_worktree_root
  local scratch_probe_base_directory

  probe_worktree_root="$(
    printf '%s' \
      "${INVAR_MERGE_GATE_SCRATCH_PROBE_WORKTREE_ROOT:-}"
  )"
  scratch_probe_base_directory="$(
    printf '%s' \
      "${INVAR_MERGE_GATE_SCRATCH_PROBE_BASE_DIRECTORY:-}"
  )"
  probe_binary_content="$(
    printf '%s' \
      "${INVAR_MERGE_GATE_SCRATCH_PROBE_BINARY_CONTENT:-}"
  )"
  probe_failure_content="$(
    printf '%s' \
      "${INVAR_MERGE_GATE_SCRATCH_PROBE_FAILURE_CONTENT:-}"
  )"
  if [ -z "$probe_worktree_root" ] ||
    [ -z "$scratch_probe_base_directory" ] ||
    [ -z "$probe_binary_content" ] ||
    [ -z "$probe_failure_content" ]
  then
    echo "merge-gate: scratch-path probe inputs are incomplete." >&2
    echo "Set its worktree, base directory, binary marker, and failure marker." >&2
    return 2
  fi

  set_gate_scratch_paths \
    "$scratch_probe_base_directory" \
    "$probe_worktree_root"
  probe_source_log="$scratch_probe_base_directory/probe-source.$$"
  if ! initialize_failure_log_directory; then return 2; fi
  if ! mkdir "$binary_build_directory"; then
    echo "merge-gate: scratch-path probe cannot create its binary directory:" >&2
    echo "  $binary_build_directory" >&2
    return 2
  fi
  printf '%s\n' "$probe_binary_content" >"$binary_build_path"
  printf '%s\n' "$probe_failure_content" >"$probe_source_log"
  if ! preserve_failure_log \
    "scratch-path-probe-failure.log" \
    "$probe_source_log"
  then
    rm -f "$probe_source_log"
    return 2
  fi
  rm -f "$probe_source_log"

  echo "WORKTREE_ROOT=$probe_worktree_root"
  echo "FAILURE_LOG_STABLE_PATH=$failure_log_stable_path"
  echo "FAILURE_LOG_DIRECTORY=$failure_log_directory"
  echo "BINARY_BUILD_PATH=$binary_build_path"
}

scratch_path_probe_value() {
  local field_name="$1"
  local probe_output_path="$2"
  sed -n "s/^${field_name}=//p" "$probe_output_path"
}

run_scratch_path_namespace_self_test() {
  local concurrent_first_binary_path
  local concurrent_first_failure_directory
  local concurrent_first_probe_exit_code
  local concurrent_first_probe_output
  local concurrent_first_probe_process_id
  local concurrent_first_stable_path
  local concurrent_second_binary_path
  local concurrent_second_failure_directory
  local concurrent_second_probe_exit_code
  local concurrent_second_probe_output
  local concurrent_second_probe_process_id
  local concurrent_second_stable_path
  local first_failure_marker="first-worktree-planted-failure"
  local namespace_test_directory
  local second_failure_marker="second-worktree-clean-run"
  local single_binary_path
  local single_failure_directory
  local single_probe_output
  local single_stable_path

  namespace_test_directory="$(
    mktemp -d /tmp/merge-gate-scratch-namespace.XXXXXX
  )"
  concurrent_first_probe_output="$namespace_test_directory/first-probe.out"
  concurrent_second_probe_output="$namespace_test_directory/second-probe.out"
  single_probe_output="$namespace_test_directory/single-probe.out"
  mkdir -p \
    "$namespace_test_directory/worktrees/first" \
    "$namespace_test_directory/worktrees/second" \
    "$namespace_test_directory/worktrees/single"

  INVAR_MERGE_GATE_SCRATCH_PROBE_WORKTREE_ROOT="$namespace_test_directory/worktrees/first" \
    INVAR_MERGE_GATE_SCRATCH_PROBE_BASE_DIRECTORY="$namespace_test_directory" \
    INVAR_MERGE_GATE_SCRATCH_PROBE_BINARY_CONTENT="first-worktree-binary" \
    INVAR_MERGE_GATE_SCRATCH_PROBE_FAILURE_CONTENT="$first_failure_marker" \
    bash "$ROOT/scripts/merge-gate.sh" --scratch-path-namespace-probe \
    >"$concurrent_first_probe_output" 2>&1 &
  concurrent_first_probe_process_id=$!
  INVAR_MERGE_GATE_SCRATCH_PROBE_WORKTREE_ROOT="$namespace_test_directory/worktrees/second" \
    INVAR_MERGE_GATE_SCRATCH_PROBE_BASE_DIRECTORY="$namespace_test_directory" \
    INVAR_MERGE_GATE_SCRATCH_PROBE_BINARY_CONTENT="second-worktree-binary" \
    INVAR_MERGE_GATE_SCRATCH_PROBE_FAILURE_CONTENT="$second_failure_marker" \
    bash "$ROOT/scripts/merge-gate.sh" --scratch-path-namespace-probe \
    >"$concurrent_second_probe_output" 2>&1 &
  concurrent_second_probe_process_id=$!

  wait "$concurrent_first_probe_process_id"
  concurrent_first_probe_exit_code=$?
  wait "$concurrent_second_probe_process_id"
  concurrent_second_probe_exit_code=$?
  concurrent_first_stable_path="$(
    scratch_path_probe_value \
      "FAILURE_LOG_STABLE_PATH" \
      "$concurrent_first_probe_output"
  )"
  concurrent_first_failure_directory="$(
    scratch_path_probe_value \
      "FAILURE_LOG_DIRECTORY" \
      "$concurrent_first_probe_output"
  )"
  concurrent_first_binary_path="$(
    scratch_path_probe_value \
      "BINARY_BUILD_PATH" \
      "$concurrent_first_probe_output"
  )"
  concurrent_second_stable_path="$(
    scratch_path_probe_value \
      "FAILURE_LOG_STABLE_PATH" \
      "$concurrent_second_probe_output"
  )"
  concurrent_second_failure_directory="$(
    scratch_path_probe_value \
      "FAILURE_LOG_DIRECTORY" \
      "$concurrent_second_probe_output"
  )"
  concurrent_second_binary_path="$(
    scratch_path_probe_value \
      "BINARY_BUILD_PATH" \
      "$concurrent_second_probe_output"
  )"

  if [ "$concurrent_first_probe_exit_code" -ne 0 ] ||
    [ "$concurrent_second_probe_exit_code" -ne 0 ] ||
    [ -z "$concurrent_first_stable_path" ] ||
    [ -z "$concurrent_second_stable_path" ] ||
    [ "$concurrent_first_stable_path" = "$concurrent_second_stable_path" ] ||
    [ "$concurrent_first_failure_directory" = "$concurrent_second_failure_directory" ] ||
    [ "$concurrent_first_binary_path" = "$concurrent_second_binary_path" ] ||
    [ "$(
      readlink -f "$concurrent_first_stable_path" 2>/dev/null || true
    )" != "$concurrent_first_failure_directory" ] ||
    [ "$(
      readlink -f "$concurrent_second_stable_path" 2>/dev/null || true
    )" != "$concurrent_second_failure_directory" ] ||
    [ "$(
      cat "$concurrent_first_stable_path/scratch-path-probe-failure.log" \
        2>/dev/null || true
    )" != "$first_failure_marker" ] ||
    [ "$(
      cat "$concurrent_second_stable_path/scratch-path-probe-failure.log" \
        2>/dev/null || true
    )" != "$second_failure_marker" ] ||
    [ "$(
      cat "$concurrent_first_binary_path" 2>/dev/null || true
    )" != "first-worktree-binary" ] ||
    [ "$(
      cat "$concurrent_second_binary_path" 2>/dev/null || true
    )" != "second-worktree-binary" ] ||
    grep -RFq "$first_failure_marker" "$concurrent_second_failure_directory"
  then
    echo "scratch-path namespace self-test: FAIL concurrent worktree isolation" >&2
    echo "  artifacts: $namespace_test_directory" >&2
    echo "  first probe exit: $concurrent_first_probe_exit_code" >&2
    echo "  second probe exit: $concurrent_second_probe_exit_code" >&2
    return 1
  fi

  printf '%s\n' "$first_failure_marker" \
    >"$concurrent_second_failure_directory/foreign-failure-positive-control.log"
  if ! grep -RFq \
    "$first_failure_marker" \
    "$concurrent_second_failure_directory"
  then
    echo "scratch-path namespace self-test: FAIL foreign-failure positive control" >&2
    echo "  artifacts: $namespace_test_directory" >&2
    return 1
  fi
  rm -f \
    "$concurrent_second_failure_directory/foreign-failure-positive-control.log"
  printf '%s\n' "first-worktree-binary" \
    >"$concurrent_second_binary_path"
  if [ "$(
    cat "$concurrent_second_binary_path" 2>/dev/null || true
  )" = "second-worktree-binary" ]
  then
    echo "scratch-path namespace self-test: FAIL foreign-binary positive control" >&2
    echo "  artifacts: $namespace_test_directory" >&2
    return 1
  fi
  printf '%s\n' "second-worktree-binary" \
    >"$concurrent_second_binary_path"

  INVAR_MERGE_GATE_SCRATCH_PROBE_WORKTREE_ROOT="$namespace_test_directory/worktrees/single" \
    INVAR_MERGE_GATE_SCRATCH_PROBE_BASE_DIRECTORY="$namespace_test_directory" \
    INVAR_MERGE_GATE_SCRATCH_PROBE_BINARY_CONTENT="single-worktree-binary" \
    INVAR_MERGE_GATE_SCRATCH_PROBE_FAILURE_CONTENT="single-worktree-failure" \
    bash "$ROOT/scripts/merge-gate.sh" --scratch-path-namespace-probe \
    >"$single_probe_output" 2>&1
  single_stable_path="$(
    scratch_path_probe_value \
      "FAILURE_LOG_STABLE_PATH" \
      "$single_probe_output"
  )"
  single_failure_directory="$(
    scratch_path_probe_value \
      "FAILURE_LOG_DIRECTORY" \
      "$single_probe_output"
  )"
  single_binary_path="$(
    scratch_path_probe_value \
      "BINARY_BUILD_PATH" \
      "$single_probe_output"
  )"
  if [ "$(
    readlink -f "$single_stable_path" 2>/dev/null || true
  )" != "$single_failure_directory" ] ||
    [ "$(
      cat "$single_stable_path/scratch-path-probe-failure.log" \
        2>/dev/null || true
    )" != "single-worktree-failure" ] ||
    [ "$(
      cat "$single_binary_path" 2>/dev/null || true
    )" != "single-worktree-binary" ]
  then
    echo "scratch-path namespace self-test: FAIL single-worktree discovery" >&2
    echo "  artifacts: $namespace_test_directory" >&2
    return 1
  fi

  echo "scratch-path namespace self-test: concurrent worktrees kept distinct failure logs and binaries"
  echo "scratch-path namespace self-test: foreign failure and binary detectors passed both polarities"
  echo "scratch-path namespace self-test: one worktree resolved its stable failure path"
  rm -rf -- "$namespace_test_directory"
}

case "${1:-}" in
  --failure-log-provenance-probe)
    run_failure_log_provenance_probe
    provenance_probe_exit_code=$?
    exit "$provenance_probe_exit_code"
    ;;
  --failure-log-provenance-self-test)
    run_failure_log_provenance_self_test
    provenance_self_test_exit_code=$?
    exit "$provenance_self_test_exit_code"
    ;;
  --scratch-path-namespace-probe)
    run_scratch_path_namespace_probe
    scratch_path_namespace_probe_exit_code=$?
    exit "$scratch_path_namespace_probe_exit_code"
    ;;
  --scratch-path-namespace-self-test)
    run_scratch_path_namespace_self_test
    scratch_path_namespace_self_test_exit_code=$?
    exit "$scratch_path_namespace_self_test_exit_code"
    ;;
esac

# THE GATE PUBLISHES ITS OWN PID, so stopping it never requires a process SEARCH. This exists because a
# `pkill -f merge-gate.sh` killed two BUILDER agents on 2026-07-26: every builder brief contains the
# string "do NOT run scripts/merge-gate.sh", so the builders' command lines matched a pattern meant for
# the gate, and one lost ~25 minutes of uncommitted work. A search over command lines matches ARGUMENTS,
# not programs. With a pid file, `scripts/stop-merge-gate.sh` kills exactly one known process and can
# refuse anything it cannot positively identify.
gate_pid_file="/tmp/merge-gate.$(echo "$ROOT" | tr -c 'a-zA-Z0-9' '-').pid"
echo "$$" > "$gate_pid_file"
trap 'rm -f "$gate_pid_file"; rm -rf -- "$binary_build_directory"' EXIT
# Hermetic git for the WHOLE gate. When invoked from the pre-commit hook, git exports
# GIT_DIR / GIT_INDEX_FILE / GIT_WORK_TREE / … into the environment; any `git` a test, smoke, or
# fixture spawns would then operate on the PARENT repo instead of its own temp fixture — a
# non-deterministic, parent-state-dependent failure (a fixture `git init` re-inits the parent, etc.).
# The app is already hermetic (Processes.hermeticEnvironment); clearing here also covers the shell
# fixtures. Harmless when run directly (these are normally unset). One boundary, whole gate hermetic.
# The IDENTITY family too: `git commit` exports GIT_AUTHOR_NAME/EMAIL (the PARENT repo's identity) to
# its pre-commit hook, and those env vars OVERRIDE a fixture's explicit `-c user.name=…` — the blame
# smoke's scratch commit then carries the parent identity and its author assertion fails on every
# hook-invoked gate while passing solo (driven-reproduced: GIT_AUTHOR_NAME=X flips it red).
unset GIT_DIR GIT_INDEX_FILE GIT_WORK_TREE GIT_OBJECT_DIRECTORY GIT_COMMON_DIR GIT_PREFIX GIT_INDEX_VERSION GIT_NAMESPACE
unset GIT_AUTHOR_NAME GIT_AUTHOR_EMAIL GIT_AUTHOR_DATE GIT_COMMITTER_NAME GIT_COMMITTER_EMAIL GIT_COMMITTER_DATE

# PRE-GATE PROCESS HYGIENE — the true determinism seal (NOT architecture: Bun multiplexes every
# fs.watch onto ONE inotify instance per PROCESS, so each running app = 1 instance). Orphaned app
# instances left by prior runs that exited without their cleanup trap firing (a SIGTERM'd/timed-out run)
# accumulate 1 inotify instance each toward the OS max_user_instances cap (128) and non-deterministically
# flake a git/settings smoke (the panel reads a stale/failed watch). Reap orphaned TEST instances so the
# gate starts from ZERO — a `bun … src/main.ts` on a `/tmp/tui-*` fixture — NEVER the user's live demo
# (/tmp/tui-demo) or any instance on a real (non-/tmp) project.
# CONCURRENCY-SAFE ORPHAN DEFINITION: an orphan is a process whose PARENT IS GONE (reparented to
# PID 1) — not merely "an app on a /tmp fixture". The old rule killed EVERY such app, so a second
# gate starting beside a running one executed its smokes' apps mid-wait and produced reds that
# looked exactly like starvation (three of them on 2026-07-25 before the cause was found). A
# concurrently-running gate's apps have a LIVE parent (their smoke process), so they are now
# untouched, and genuine leftovers — whose parent died without its cleanup trap firing — are still
# reaped so the inotify-instance budget starts clean. The age floor is belt-and-braces: a smoke app
# lives seconds to a couple of minutes, so anything older than the floor with a live parent is a
# wedged leftover worth reaping too.
orphan_age_floor_seconds=600
reaped_orphan_instances=0
for orphan_pid in $(pgrep -f 'src/main\.ts /tmp/tui-' 2>/dev/null || true); do
  orphan_cmdline="$(tr '\0' ' ' < "/proc/$orphan_pid/cmdline" 2>/dev/null || true)"
  case "$orphan_cmdline" in
    *"/tmp/tui-demo"*) continue ;;                         # never touch the user's live demo
  esac
  orphan_parent_pid="$(ps -o ppid= -p "$orphan_pid" 2>/dev/null | tr -d ' ')"
  orphan_age_seconds="$(ps -o etimes= -p "$orphan_pid" 2>/dev/null | tr -d ' ')"
  [ -n "$orphan_age_seconds" ] || orphan_age_seconds=0
  if [ "${orphan_parent_pid:-1}" = "1" ] || [ "$orphan_age_seconds" -gt "$orphan_age_floor_seconds" ]; then
    kill -9 "$orphan_pid" 2>/dev/null && reaped_orphan_instances=$((reaped_orphan_instances + 1))
  fi
done
if [ "$reaped_orphan_instances" -gt 0 ]; then
  echo "merge-gate: reaped $reaped_orphan_instances orphaned app instance(s) before start (inotify hygiene)"
  sleep 0.5  # let the kernel release their inotify instances before the gate launches fresh ones
fi
live_test_app_instance_count="$(pgrep -cf 'src/main\.ts /tmp/tui-' 2>/dev/null || true)"
echo "merge-gate: starting with ${live_test_app_instance_count:-0} test app instance(s) live"
fail=0
declare -a failed_step_names=()
# Failing steps keep their FULL output here — tail-25 destroyed the failing condition three times
# on 2026-07-25 (the evidence a red exists to provide). Wiped per gate run, never mid-run.
# PER-RUN failure directory: two concurrent gates sharing one path would wipe each other's evidence
# at start, which is the one thing this directory exists to prevent. The stable
# per-worktree symlink printed by `--print-scratch-paths` points at this
# worktree's most recent run.
if ! initialize_failure_log_directory; then exit 2; fi
step() {
  local name="$1"; shift
  local step_log="/tmp/merge-gate-step.$$.serial.log"
  echo "== merge-gate: $name =="
  if "$@" >"$step_log" 2>&1; then
    echo "  OK    $name"
    rm -f "$step_log"
    return
  fi
  local failure_slug
  failure_slug="$(echo "$name" | tr -cs 'a-zA-Z0-9' '-')"
  # RETRY-ONCE FOR TIMEOUT REDS: a wait-timeout under ambient load (user instances, LSP starts,
  # shared git object store) is the starvation class the quiet-machine doctrine reruns by hand.
  # Only 'Timed out' failures retry, exactly once, after a settle pause; any other failure — and a
  # second timeout — is a defect and blocks. Both attempts' full logs are preserved.
  local serial_step_retried=0
  if grep -q 'Timed out' "$step_log"; then
    preserve_failure_log "$failure_slug.attempt1.log" "$step_log"
    echo "  RETRY $name — timeout-class failure; one quiet retry (attempt 1 log preserved)"
    serial_step_retried=1
    sleep 10
    if "$@" >"$step_log" 2>&1; then
      echo "  OK    $name (clean on retry; first attempt was starvation-class)"
      # Feed the SAME tally the pool jobs feed. Until now only pool retries were
      # counted, so a serial-tail step that passed only on its retry left no
      # trace but a line buried mid-log — which is how smoke-workspace-tabs stayed
      # 1-in-3 to 2-in-3 flaky for a whole day while every gate reported green.
      retried_pass_smoke_names+=("$name")
      rm -f "$step_log"
      return
    fi
  fi
  if [ "$serial_step_retried" -eq 1 ]; then retried_fail_smoke_names+=("$name"); fi
  preserve_failure_log "$failure_slug.log" "$step_log"
  echo "  FAIL  $name (full log: $failure_log_directory/$failure_slug.log)"
  tail -25 "$step_log" | sed 's/^/    | /'
  fail=1
  failed_step_names+=("$name")
  rm -f "$step_log"
}
# A reporting hard step: unlike step(), successful measurement output is part of the gate log.
reporting_step() {
  local name="$1"; shift
  local step_finished_milliseconds
  local step_started_milliseconds
  step_started_milliseconds="$(date +%s%3N)"
  echo "== merge-gate: $name =="
  if "$@" >/tmp/merge-gate-reporting.$$.log 2>&1; then
    sed 's/^/    | /' /tmp/merge-gate-reporting.$$.log
    echo "  OK    $name"
  else
    echo "  FAIL  $name"
    tail -40 /tmp/merge-gate-reporting.$$.log | sed 's/^/    | /'
    fail=1
    failed_step_names+=("$name")
  fi
  rm -f /tmp/merge-gate-reporting.$$.log
  step_finished_milliseconds="$(date +%s%3N)"
  echo "merge-gate timing: serial step $(
    format_duration_milliseconds \
      "$((step_finished_milliseconds - step_started_milliseconds))"
  ) — $name"
}

# SWAP (2026-07-24, user-approved): the PTY harness suite is the per-gate smoke phase and the
# TerminalEmulator conformance corpus directly specifies its screen oracle in bun test. Retained tmux
# originals run only with INVAR_FULL_TMUX=1 (weekly cron / audits); strict-subset duplicates may be
# parked when their gated harness twin is declared as the replacement in project.coverage-deltas.md.
# Contract: harness.invariants.md "The conformance corpus replaces the tmux ring".
FULL_TMUX_SKIPPED=0

declare -a parallel_smoke_names=()
declare -a parallel_smoke_commands=()
declare -a parallel_smoke_sources=()
declare -a parallel_smoke_blocks=()
declare -a parallel_blocking_smoke_sources=()
declare -a serial_smoke_names=()
declare -a serial_smoke_commands=()
declare -a serial_smoke_sources=()
# TWO POPULATIONS, NOT ONE. A retry has two possible outcomes and they mean opposite things: a retried
# PASS is a masked intermittent (the dangerous one — it is invisible in a green run), while a retried
# FAIL is already visible in the FAIL list and only needs its timeout-class provenance recorded. The
# first version of this tally recorded the retry ATTEMPT, so a job that retried and still failed was
# printed under "PASSED ONLY ON RETRY" — an instrument failing in the direction of reassurance.
declare -a retried_pass_smoke_names=()
declare -a retried_fail_smoke_names=()
declare -a parallel_smoke_duration_records=()
declare -a reported_contention_pass_smoke_names=()
declare -a reported_contention_fail_smoke_names=()

quoted_command() {
  local command_text=""
  local command_argument
  local quoted_argument
  for command_argument in "$@"; do
    printf -v quoted_argument '%q' "$command_argument"
    if [ -n "$command_text" ]; then command_text+=" "; fi
    command_text+="$quoted_argument"
  done
  printf '%s' "$command_text"
}

registered_smoke_source() {
  local command_argument
  local smoke_source=""
  for command_argument in "$@"; do
    if [ -f "$command_argument" ]; then smoke_source="$command_argument"; fi
  done
  printf '%s' "$smoke_source"
}

registered_smoke_name() {
  local requested_smoke_name="$1"; shift
  local smoke_source
  smoke_source="$(registered_smoke_source "$@")"
  if [ -z "$smoke_source" ]; then
    echo "merge-gate: registered smoke has no runnable source: $requested_smoke_name" >&2
    return 1
  fi
  printf '%s — %s' "$requested_smoke_name" "$smoke_source"
}

parallel_safe_smoke() {
  local requested_smoke_name="$1"; shift
  local smoke_name
  smoke_name="$(registered_smoke_name "$requested_smoke_name" "$@")" || exit 2
  parallel_smoke_names+=("$smoke_name")
  parallel_smoke_commands+=("$(quoted_command "$@")")
  parallel_smoke_sources+=("$(registered_smoke_source "$@")")
  parallel_smoke_blocks+=(1)
  parallel_blocking_smoke_sources+=("$(registered_smoke_source "$@")")
}

contention_smoke() {
  local requested_smoke_name="$1"; shift
  local smoke_name
  smoke_name="$(registered_smoke_name "$requested_smoke_name" "$@")" || exit 2
  parallel_smoke_names+=("$smoke_name")
  parallel_smoke_commands+=("$(quoted_command "$@")")
  parallel_smoke_sources+=("$(registered_smoke_source "$@")")
  parallel_smoke_blocks+=(0)
}

serial_smoke() {
  local requested_smoke_name="$1"; shift
  local smoke_name
  smoke_name="$(registered_smoke_name "$requested_smoke_name" "$@")" || exit 2
  serial_smoke_names+=("$smoke_name")
  serial_smoke_commands+=("$(quoted_command "$@")")
  serial_smoke_sources+=("$(registered_smoke_source "$@")")
}

parallel_safe_full_tmux_smoke() {
  if [ "${INVAR_FULL_TMUX:-0}" = "1" ]; then
    parallel_safe_smoke "$@"
  else
    FULL_TMUX_SKIPPED=$((FULL_TMUX_SKIPPED + 1))
  fi
}

serial_full_tmux_smoke() {
  if [ "${INVAR_FULL_TMUX:-0}" = "1" ]; then
    serial_smoke "$@"
  else
    FULL_TMUX_SKIPPED=$((FULL_TMUX_SKIPPED + 1))
  fi
}

execute_registered_smoke_job() {
  local phase_name="$1"
  local job_number="$2"
  local smoke_name="$3"
  local smoke_command="$4"
  local smoke_blocks="$5"
  local duration_file="/tmp/merge-gate-duration.$$.${phase_name}.${job_number}"
  local step_log="/tmp/merge-gate-step.$$.${phase_name}.${job_number}.log"
  local summary_log="/tmp/merge-gate-summary.$$.${phase_name}.${job_number}.log"
  local result_file="/tmp/merge-gate-result.$$.${phase_name}.${job_number}"
  local retry_outcome_file="/tmp/merge-gate-retry-outcome.$$.${phase_name}.${job_number}"
  local failure_slug
  local job_finished_milliseconds
  local job_started_milliseconds
  local smoke_passed=0
  failure_slug="$(echo "$smoke_name" | tr -cs 'a-zA-Z0-9' '-')"
  job_started_milliseconds="$(date +%s%3N)"

  : >"$summary_log"
  echo none >"$retry_outcome_file"
  echo "== merge-gate: $smoke_name ==" >>"$summary_log"
  if bash -c "$smoke_command" >"$step_log" 2>&1; then
    echo "  OK    $smoke_name" >>"$summary_log"
    smoke_passed=1
  else
    if [ "$smoke_blocks" -eq 1 ] && grep -q 'Timed out' "$step_log"; then
      preserve_failure_log "$failure_slug.attempt1.log" "$step_log"
      echo failed >"$retry_outcome_file"
      echo "  RETRY $smoke_name — timeout-class failure; one quiet retry (attempt 1 log preserved)" >>"$summary_log"
      sleep 10
      if bash -c "$smoke_command" >"$step_log" 2>&1; then
        echo "  OK    $smoke_name (clean on retry; first attempt was starvation-class)" >>"$summary_log"
        echo passed >"$retry_outcome_file"
        smoke_passed=1
      fi
    fi
  fi

  if [ "$smoke_passed" -eq 1 ]; then
    echo 0 >"$result_file"
  else
    preserve_failure_log "$failure_slug.log" "$step_log"
    echo "  FAIL  $smoke_name (full log: $failure_log_directory/$failure_slug.log)" >>"$summary_log"
    tail -25 "$step_log" | sed 's/^/    | /' >>"$summary_log"
    echo 1 >"$result_file"
  fi
  rm -f "$step_log"
  job_finished_milliseconds="$(date +%s%3N)"
  echo "$((job_finished_milliseconds - job_started_milliseconds))" >"$duration_file"
}

collect_registered_smoke_job() {
  local phase_name="$1"
  local job_number="$2"
  local smoke_name="$3"
  local smoke_blocks="$4"
  local duration_file="/tmp/merge-gate-duration.$$.${phase_name}.${job_number}"
  local summary_log="/tmp/merge-gate-summary.$$.${phase_name}.${job_number}.log"
  local result_file="/tmp/merge-gate-result.$$.${phase_name}.${job_number}"
  local retry_outcome_file="/tmp/merge-gate-retry-outcome.$$.${phase_name}.${job_number}"
  local job_duration_milliseconds=0
  local job_result=1
  local retry_outcome=none

  if [ -f "$summary_log" ]; then
    sed -n '1,$p' "$summary_log"
  else
    echo "== merge-gate: $smoke_name =="
    echo "  FAIL  $smoke_name (worker produced no summary)"
  fi
  if [ -f "$result_file" ]; then job_result="$(cat "$result_file")"; fi
  if [ -f "$retry_outcome_file" ]; then retry_outcome="$(cat "$retry_outcome_file")"; fi
  if [ -f "$duration_file" ]; then
    job_duration_milliseconds="$(cat "$duration_file")"
  fi
  if [ "$job_result" -ne 0 ] && [ "$smoke_blocks" -eq 1 ]; then
    fail=1
    failed_step_names+=("$smoke_name")
  fi
  if [ "$smoke_blocks" -eq 0 ]; then
    if [ "$job_result" -eq 0 ]; then
      reported_contention_pass_smoke_names+=("$smoke_name")
    else
      reported_contention_fail_smoke_names+=("$smoke_name")
      echo "  REPORT-ONLY  $smoke_name failed under contention; blocking verdict unchanged"
    fi
  fi
  if [ "$retry_outcome" = passed ]; then retried_pass_smoke_names+=("$smoke_name"); fi
  if [ "$retry_outcome" = failed ]; then retried_fail_smoke_names+=("$smoke_name"); fi
  if [ "$phase_name" = "serial" ]; then
    echo "merge-gate timing: serial step $(format_duration_milliseconds "$job_duration_milliseconds") — $smoke_name"
  else
    parallel_smoke_duration_records+=(
      "$job_duration_milliseconds"$'\t'"$smoke_name"
    )
  fi
  rm -f \
    "$duration_file" \
    "$summary_log" \
    "$result_file" \
    "$retry_outcome_file"
}

run_parallel_smoke_pool() {
  local job_number
  local running_job_count
  declare -a worker_process_ids=()

  for job_number in "${!parallel_smoke_names[@]}"; do
    while true; do
      running_job_count="$(jobs -pr | wc -l | tr -d ' ')"
      if [ "$running_job_count" -lt "$gate_worker_count" ]; then break; fi
      wait -n || true
    done
    execute_registered_smoke_job \
      "parallel" \
      "$job_number" \
      "${parallel_smoke_names[$job_number]}" \
      "${parallel_smoke_commands[$job_number]}" \
      "${parallel_smoke_blocks[$job_number]}" &
    worker_process_ids+=("$!")
  done
  for worker_process_id in "${worker_process_ids[@]}"; do
    wait "$worker_process_id" || true
  done
  for job_number in "${!parallel_smoke_names[@]}"; do
    collect_registered_smoke_job \
      "parallel" \
      "$job_number" \
      "${parallel_smoke_names[$job_number]}" \
      "${parallel_smoke_blocks[$job_number]}"
  done
}

run_serial_smokes() {
  local job_number
  for job_number in "${!serial_smoke_names[@]}"; do
    execute_registered_smoke_job \
      "serial" \
      "$job_number" \
      "${serial_smoke_names[$job_number]}" \
      "${serial_smoke_commands[$job_number]}" \
      1
    collect_registered_smoke_job "serial" "$job_number" "${serial_smoke_names[$job_number]}" 1
  done
}

format_duration() {
  local duration_seconds="$1"
  printf '%dm%02ds' "$((duration_seconds / 60))" "$((duration_seconds % 60))"
}

format_duration_milliseconds() {
  local duration_milliseconds="$1"
  local remaining_milliseconds="$((duration_milliseconds % 60000))"
  printf '%dm%02d.%03ds' \
    "$((duration_milliseconds / 60000))" \
    "$((remaining_milliseconds / 1000))" \
    "$((remaining_milliseconds % 1000))"
}

report_slowest_parallel_smoke_jobs() {
  local displayed_job_count=0
  local job_duration_milliseconds
  local smoke_name
  local slowest_job_count=10

  if [ "${#parallel_smoke_duration_records[@]}" -lt "$slowest_job_count" ]; then
    slowest_job_count="${#parallel_smoke_duration_records[@]}"
  fi
  echo "merge-gate timing: slowest parallel-safe jobs (top $slowest_job_count of ${#parallel_smoke_duration_records[@]})"
  while IFS=$'\t' read -r job_duration_milliseconds smoke_name; do
    displayed_job_count=$((displayed_job_count + 1))
    printf 'merge-gate timing:   %2d. %s — %s\n' \
      "$displayed_job_count" \
      "$(format_duration_milliseconds "$job_duration_milliseconds")" \
      "$smoke_name"
    if [ "$displayed_job_count" -ge "$slowest_job_count" ]; then break; fi
  done < <(
    printf '%s\n' "${parallel_smoke_duration_records[@]}" |
      sort -t $'\t' -k1,1nr
  )
}

validate_smoke_registration_labels() {
  local registration_number
  local registered_name
  local registered_source
  local registration_failure_count=0
  local all_smoke_sources=(
    "${parallel_smoke_sources[@]}"
    "${serial_smoke_sources[@]}"
  )
  local all_smoke_names=(
    "${parallel_smoke_names[@]}"
    "${serial_smoke_names[@]}"
  )
  if [ "${#all_smoke_names[@]}" -eq 0 ]; then
    echo "  FAIL  smoke registration label census found no registered jobs"
    return 1
  fi
  for registration_number in "${!all_smoke_names[@]}"; do
    registered_name="${all_smoke_names[$registration_number]}"
    registered_source="${all_smoke_sources[$registration_number]}"
    case "$registered_name" in
      *" — $registered_source")
        if [ -n "$registered_source" ]; then continue; fi
        ;;
    esac
    echo "  FAIL  smoke registration label does not resolve: $registered_name"
    registration_failure_count=$((registration_failure_count + 1))
  done

  # POSITIVE CONTROL. A deliberately wrong friendly name cannot hide the
  # runnable script because registered_smoke_name appends the command-derived
  # source path. This is the mismatch that used to print a nonexistent media
  # harness name.
  local mismatched_label_control
  mismatched_label_control="$(
    registered_smoke_name \
      "smoke: deliberately wrong harness" \
      bun scripts/harness/smoke-media-harness.ts
  )" || return 1
  if [ "$mismatched_label_control" != \
    "smoke: deliberately wrong harness — scripts/harness/smoke-media-harness.ts" ]
  then
    echo "  FAIL  smoke registration label positive control lost its command-derived source path"
    return 1
  fi
  if [ "$registration_failure_count" -ne 0 ]; then return 1; fi
  echo "  OK    all ${#all_smoke_names[@]} registered job labels include their runnable source path (mismatched friendly-name control still resolves)"
}

validate_smoke_classification() {
  local all_smoke_sources=(
    "${parallel_blocking_smoke_sources[@]}"
    "${serial_smoke_sources[@]}"
  )
  bun scripts/check-smoke-timing-classification.ts "${all_smoke_sources[@]}"
}

# 0) FAILURE-LOG PROVENANCE. Two fake reds prove that the stable path replaces
# a planted stale directory, resolves to the second run, and leaves the first
# run's PID-qualified evidence reachable.
# invariant: Completion is proven not declared (project.invariants.md)
step \
  "failure-log provenance self-test" \
  bash scripts/merge-gate.sh --failure-log-provenance-self-test
# Two concurrent path probes use distinct worktree roots and plant distinct
# binary and failure markers. A third probe proves the stable single-worktree
# discovery path.
# invariant: Completion is proven not declared (project.invariants.md)
step \
  "scratch-path namespace self-test" \
  bash scripts/merge-gate.sh --scratch-path-namespace-self-test
# 0b) BOOT CAPABILITY. Assert the runtime property, not the ivue version:
#     flexible ranges and linked builds are valid, but Static() must cache
#     get-only $ accessors. Clear the product escape hatch so CI checks its
#     installed resolution.
step \
  "ivue Static getter capability" \
  env -u INVAR_SKIP_CAPABILITY_CHECK \
  bun scripts/check-ivue-static-getter-capability.ts
# 1) Fast inner gate: tsc + conventions + unwired-capability.
step "conventions-gate (tsc + conventions + unwired)" bash scripts/conventions-gate.sh
# 1a) WHOLE-REPOSITORY FORMAT. Prettier owns presentation inside the scope declared by
#     .prettierignore; a format drift is a blocking source-shape failure beside typechecking.
step "prettier format check" bunx prettier --check .
# 1b) The INVARIANT CONTRACT LAYER — the lattice itself. --all: every *.invariants.md is structurally
#     valid (both headings, required fields, non-empty Evidence). --refs: every `// invariant:` code
#     annotation resolves to a real record (no dangling references) + coverage report. This was RED and
#     unenforced (the checker existed but rode no gate), so the layer that IS the lattice was
#     measured-but-not-enforced — my own commits added annotations to records that did not exist. Both
#     hard-blocking now: a broken/misnamed invariant reference fails the gate.
step "invariant contracts --all (structure)" node .claude/skills/invariants/scripts/check_invariants.mjs --all
step "invariant contracts --refs (annotations resolve)" node .claude/skills/invariants/scripts/check_invariants.mjs --all --refs
# 1c) The COVERAGE RATCHET. Every other check above answers "does the suite pass?" — none answers
#     "is the suite still as strong as it was?". An agent pushed toward a green gate has one cheap move
#     available (delete the failing assertion) and until now nothing detected it: the invariant checker
#     only catches a deleted smoke that some Verify line cites, so an UNCITED assertion inside a kept
#     file could be removed with every gate step still green. That is not hypothetical — it happened
#     here on 2026-07-25, and only a sentence in a commit message distinguished it from cheating.
#     This step does not forbid removal; it forbids SILENT removal. Any drop in assertion or wait
#     counts against the merge base must be declared in project.coverage-deltas.md, which turns a deletion into
#     a reviewable diff instead of an invisible one.
step "coverage ratchet (no undeclared assertion loss)" bun scripts/check-coverage-ratchet.ts
# 1d) DROPPED REACTIVE OBSERVATIONS. Report-only for repository code — the findings are candidates a
#     reviewer must trace along the observation path, and a checker that cried wolf here would be
#     ignored inside a day. What this step DOES block is a broken instrument: it fails if its
#     positive-control fixture stops being flagged, or if it inspects zero files. Both failure modes
#     really happened in this repo (a gate guard called a missing binary and printed OK for 14 runs).
step "dropped reactive observations (report-only findings, gated instrument)" bun scripts/check-reactive-observation.ts
# 2) Unit tests.
step "unit tests (bun test)" bun test
# USER DIRECTIVE 2026-07-29 ("bun run build must be run"): #312's compiler-sfc
# import broke `bun build --compile` while every gate stayed green — tests and
# tsc do not trace what the binary bundler traces. The shipped artifact must
# compile on every gate. Output goes to a scratch path so the gate never
# clobbers a developer's dist/iv or another worktree's concurrent build.
if ! mkdir "$binary_build_directory"; then
  echo "merge-gate: cannot create this run's binary build directory:" >&2
  echo "  $binary_build_directory" >&2
  exit 2
fi
step "binary build (bun run build compiles)" bun build --compile --minify --external web-tree-sitter src/main.ts --outfile "$binary_build_path"
# 3) Behavioral CONTRACTS — the felt-invariants (momentum-glide, wrap-scroll, idle-quiescence).
# They remain serial within one gate because they launch a long sequence of
# applications; their blocking verdicts use state, ordering, and counts.
serial_smoke \
  "behavioral-contracts (felt invariants)" \
  env INVAR_SKIP_PLUGIN_MANIFEST_CONTRACT=1 bash scripts/behavioral-contracts.sh

if [ "${FAST:-0}" != "1" ]; then
  echo "smoke phase: PTY harness suite (INVAR_FULL_TMUX=${INVAR_FULL_TMUX:-0}; tmux audit steps skipped when 0 are reported below)"
  # 4) Driving SMOKES — the real user paths.
  parallel_safe_full_tmux_smoke "smoke: editor"      bash scripts/smoke-editor.sh
  parallel_safe_smoke "smoke: editor harness" bun scripts/harness/smoke-editor-harness.ts
  # Pool-safe: its verdict is content and state based, and ten six-worker
  # pool runs completed without a retry or failure.
  parallel_safe_smoke \
    "smoke: inline rewrite harness" \
    bun scripts/harness/smoke-inline-rewrite-harness.ts
  # The dirty marker is content-derived: typing then BACKSPACING (no undo) must clear the marker, a
  # deleted-and-retyped line must read clean, and a mid-session save must move the baseline.
  parallel_safe_smoke "smoke: dirty-marker harness" bun scripts/harness/smoke-dirty-marker-harness.ts
  parallel_safe_smoke "smoke: horizontal extent harness" bun scripts/harness/smoke-horizontal-extent-harness.ts
  # Move-line / duplicate-line (pure model op): drive the palette commands, assert the document reordered
  # + cursor followed + one undo restored (via the probe, not the frame).
  parallel_safe_full_tmux_smoke "smoke: move-line"   bash scripts/smoke-move-line.sh
  parallel_safe_smoke "smoke: move-line harness" bun scripts/harness/smoke-move-line-harness.ts
  parallel_safe_full_tmux_smoke "smoke: indent-guides" bash scripts/smoke-indent-guides.sh
  parallel_safe_smoke "smoke: indent-guides harness" bun scripts/harness/smoke-indent-guides-harness.ts
  # Bracket matching: cursor on a `{` highlights it + its balanced `}` (match background via FrameProbe);
  # moving off clears it. Pure finder + real-tokenizer string/comment gate.
  parallel_safe_full_tmux_smoke "smoke: bracket-match" bash scripts/smoke-bracket-match.sh
  parallel_safe_smoke "smoke: bracket-match harness" bun scripts/harness/smoke-bracket-match-harness.ts
  parallel_safe_full_tmux_smoke "smoke: tabs"        bash scripts/smoke-tabs.sh
  parallel_safe_smoke "smoke: tabs harness" bun scripts/harness/smoke-tabs-harness.ts
  parallel_safe_smoke "smoke: bounded list popup harness" bun scripts/harness/smoke-bounded-list-popup-harness.ts
  parallel_safe_smoke "smoke: field caret harness" bun scripts/harness/smoke-field-caret-harness.ts
  parallel_safe_smoke "smoke: completion harness" bun scripts/harness/smoke-completion-harness.ts
  parallel_safe_full_tmux_smoke "smoke: workspace tabs" bash scripts/smoke-workspace-tabs.sh
  parallel_safe_smoke "smoke: workspace tabs harness" bun scripts/harness/smoke-workspace-tabs-harness.ts
  parallel_safe_smoke "smoke: workspace layout isolation harness" bun scripts/harness/smoke-workspace-layout-isolation-harness.ts
  parallel_safe_full_tmux_smoke "smoke: tree-scroll" bash scripts/smoke-tree-scroll.sh
  parallel_safe_full_tmux_smoke "smoke: selection"   bash scripts/smoke-selection.sh
  # invariant: The conformance corpus replaces the tmux ring (scripts/harness/harness.invariants.md)
  parallel_safe_smoke "smoke: selection harness" bun scripts/harness/smoke-selection-harness.ts
  parallel_safe_full_tmux_smoke "smoke: scrollbars"  bash scripts/smoke-scrollbars.sh
  # Deep wheel travel changed from pass, to retry-pass, to retry-fail on the
  # unchanged task commit. Preserve the loaded product finding without making
  # ambient scheduling part of the blocking verdict.
  contention_smoke "contention: scrollbars harness" bun scripts/harness/smoke-scrollbars-harness.ts
  parallel_safe_full_tmux_smoke "smoke: wrap"        bash scripts/smoke-wrap.sh
  parallel_safe_smoke "smoke: wrap harness" bun scripts/harness/smoke-wrap-harness.ts
  parallel_safe_smoke "smoke: code folding harness" bun scripts/harness/smoke-code-folding-harness.ts
  parallel_safe_full_tmux_smoke "smoke: comment-styling" bash scripts/smoke-comment-styling.sh
  parallel_safe_smoke "smoke: comment-styling harness" bun scripts/harness/smoke-comment-styling-harness.ts
  parallel_safe_full_tmux_smoke "smoke: git-watch"   bash scripts/smoke-git-watch.sh
  # Commit-log freshness (external commits appear via the tip-SHA reconcile) + the read-only
  # branch VIEWER (cycle/menu/Esc, by-SHA drill-down, worktree/HEAD byte-identical after).
  parallel_safe_full_tmux_smoke "smoke: git-log"     bash scripts/smoke-git-log.sh
  # Current-line git blame (GitLens parity): a committed line shows its author in the status bar; a
  # non-git document shows none. Scratch repo + non-git dir; async blame is cached per file.
  parallel_safe_full_tmux_smoke "smoke: git-blame"   bash scripts/smoke-git-blame.sh
  parallel_safe_full_tmux_smoke "smoke: find"        bash scripts/smoke-find.sh
  parallel_safe_smoke "smoke: find harness" bun scripts/harness/smoke-find-harness.ts
  parallel_safe_full_tmux_smoke "smoke: mode coherence" bash scripts/smoke-mode-coherence.sh
  parallel_safe_smoke "smoke: mode coherence harness" bun scripts/harness/smoke-mode-coherence-harness.ts
  parallel_safe_full_tmux_smoke "smoke: shortcut-help" bash scripts/smoke-shortcut-help.sh
  # The keystroke-ownership contract (#91/#93/#101): Tab/Shift+Tab indentation, the arrival of
  # every chord that replaced an F-key, the terminal pass-through sent-vs-received sweep, and the
  # reserved set still overriding a focused terminal. An instrument nobody runs is not a gate — and
  # the full_tmux bucket IS the bucket nobody runs (#105: a stale glyph rotted there for a day while
  # every gate stayed green). This smoke is the only proof that the chords replacing the F-keys
  # actually arrive, so it runs by DEFAULT rather than behind INVAR_FULL_TMUX.
  parallel_safe_smoke "smoke: keyboard invariant" bash scripts/smoke-keyboard-invariant.sh
  parallel_safe_smoke \
    "smoke: reserved chord harness" \
    bun scripts/harness/smoke-reserved-chord-harness.ts
  parallel_safe_full_tmux_smoke "smoke: word-delete" bash scripts/smoke-word-delete.sh
  parallel_safe_smoke "smoke: word-delete harness" bun scripts/harness/smoke-word-delete-harness.ts
  parallel_safe_smoke "smoke: shared text-input harness" bun scripts/harness/smoke-text-input-harness.ts
  parallel_safe_smoke "smoke: database harness" bun scripts/harness/smoke-database-harness.ts
  parallel_safe_full_tmux_smoke "smoke: quick-open"  bash scripts/smoke-quickopen.sh
  parallel_safe_full_tmux_smoke "smoke: open-project" bash scripts/smoke-openproject.sh
  parallel_safe_full_tmux_smoke "smoke: search-mouse" bash scripts/smoke-search-mouse.sh
  parallel_safe_full_tmux_smoke "smoke: gutter-diff" bash scripts/smoke-gutter-diff.sh
  parallel_safe_full_tmux_smoke "smoke: markdown"     bash scripts/smoke-markdown.sh
  # Guarded inside the script: SKIPs cleanly (exit 0) when typescript-language-server is absent.
  parallel_safe_full_tmux_smoke "smoke: goto-definition" bash scripts/smoke-goto-definition.sh
  parallel_safe_full_tmux_smoke "smoke: navigation-history" bash scripts/smoke-navigation-history.sh
  parallel_safe_full_tmux_smoke "smoke: hover" bash scripts/smoke-hover.sh
  parallel_safe_full_tmux_smoke "smoke: diagnostics" bash scripts/smoke-diagnostics.sh
  parallel_safe_full_tmux_smoke "smoke: image-preview" bash scripts/smoke-image-preview.sh
  parallel_safe_full_tmux_smoke "smoke: pixel-preview" bash scripts/smoke-pixel-preview.sh
  parallel_safe_full_tmux_smoke "smoke: agent"       bash scripts/smoke-agent.sh
  parallel_safe_full_tmux_smoke "smoke: agent-search" bash scripts/smoke-agent-search.sh
  # Bracketed paste (clipboard / Hex dictation): a framed \e[200~…\e[201~ burst lands in the editor
  # (single + multi-line), the terminal PTY, and the agent composer — the paste-event routing fix.
  parallel_safe_full_tmux_smoke "smoke: paste"       bash scripts/smoke-paste.sh
  # The 65,536-byte payload is deliberate chunked-paste coverage. OpenPty's non-blocking
  # event-loop queue makes the backpressure path pool-safe without shrinking it.
  parallel_safe_smoke "smoke: paste harness" bun scripts/harness/smoke-paste-harness.ts
  # Now POOL-SAFE: its frame-silence claims became content invariance and exact
  # at-rest/active status conditions, so it no longer measures the machine.
  parallel_safe_smoke "smoke: clipboard frame boundary harness" bun scripts/harness/smoke-clipboard-frame-boundary-harness.ts
  # Audio narration (third projection): drives an agent turn with narration OFF (silent) then ON (speaks
  # the completed turn through the mock TTS backend), plus barge-in. No audio in CI (INVAR_TTS_BACKEND=mock).
  parallel_safe_full_tmux_smoke "smoke: audio-narration" bash scripts/smoke-audio-narration.sh
  # Voice picker + mouse-editable settings: seeded voices dir → dynamic-enum picker (keyboard + mouse),
  # rate stepper, boolean toggle, Test-Voice command. No audio (mock TTS).
  parallel_safe_full_tmux_smoke "smoke: voice-picker" bash scripts/smoke-voice-picker.sh
  # Bottom-panel SPLIT (experiment-panel-split): drives Ctrl+Shift+S to split the panel into two side-by-side
  # cells and asserts independent sub-region render, per-cell focus routing, divider re-flow, un-split.
  parallel_safe_full_tmux_smoke "smoke: activitybar" bash scripts/smoke-activitybar.sh
  parallel_safe_full_tmux_smoke "smoke: panel-split" bash scripts/smoke-panel-split.sh
  # invariant: Shared seam changes verify every consumer (scripts/harness/harness.invariants.md)
  # PTY byte-harness wave 2 ports. Distinct tmux originals above remain registered as the independent
  # terminal-emulator verification ring; proven strict-subset duplicates are parked and declared in
  # project.coverage-deltas.md.
  # Moved to the POOL: this smoke's only reason to be in the serial tail was a 600 ms
  # frame-silence window, and that window was proven UNSOUND earlier tonight (GitWatcher's
  # 5 s reconcile floor legitimately repaints after the fixture creates an untracked file,
  # so ~12% of windows contained a CORRECT repaint). It was replaced by a STATE assertion —
  # a document outside version control keeps publishing no blame author however often git
  # reconciles underneath it — which is immune to load and to timer phase. The structural
  # guard now confirms it carries no timing-sensitive assertion, so the tail has no claim
  # on it. This is the first tail reduction earned by converting absence into state.
  parallel_safe_smoke "smoke: git-blame harness" bun scripts/harness/smoke-git-blame-harness.ts
  parallel_safe_smoke "smoke: git-log harness" bun scripts/harness/smoke-git-log-harness.ts
  # The state claim remains useful, but its product watcher timed out once and
  # passed only on retry under the acceptance load. Record that rate in the
  # loaded tier instead of laundering it through a blocking retry.
  contention_smoke "contention: git-watch harness" bun scripts/harness/smoke-git-watch-harness.ts
  parallel_safe_smoke "smoke: gutter-diff harness" bun scripts/harness/smoke-gutter-diff-harness.ts
  parallel_safe_smoke "smoke: diff-overview harness" bun scripts/harness/smoke-diff-overview-harness.ts
  parallel_safe_smoke "smoke: tree-scroll harness" bun scripts/harness/smoke-tree-scroll-harness.ts
  parallel_safe_smoke "smoke: quick-open harness" bun scripts/harness/smoke-quickopen-harness.ts
  parallel_safe_smoke "smoke: navigation-history harness" bun scripts/harness/smoke-navigation-history-harness.ts
  parallel_safe_smoke "smoke: open-project harness" bun scripts/harness/smoke-openproject-harness.ts
  parallel_safe_smoke "smoke: activitybar harness" bun scripts/harness/smoke-activitybar-harness.ts
  parallel_safe_smoke "smoke: panel-split harness" bun scripts/harness/smoke-panel-split-harness.ts
  # Panel geometry is active product work in #459. Under ambient load this
  # smoke passed only on retry in two acceptance runs, then failed both
  # attempts in a third. Keep the loaded observation and its recorded rate,
  # but do not let machine pressure choose the merge verdict.
  contention_smoke "contention: panel-chrome harness" bun scripts/harness/smoke-panel-chrome-harness.ts
  # This is the one load-dependent panel subcheck formerly embedded in the
  # otherwise deterministic behavioral-contracts suite.
  contention_smoke "contention: plugin-manifest lifecycle" bash scripts/smoke-plugin-manifest.sh
  # Shared splitter paint/drag states plus live slot configuration and the right-dock command/mouse
  # affordance. Kept additive to the pane-specific smokes above.
  parallel_safe_smoke "smoke: layout harness" bun scripts/harness/smoke-layout-harness.ts
  # wave 3
  parallel_safe_smoke "smoke: SDK extraction harness" bun scripts/harness/smoke-sdk-extraction-harness.ts
  parallel_safe_smoke "smoke: agent harness" bun scripts/harness/smoke-agent-harness.ts
  parallel_safe_smoke "smoke: agent skill popup harness" bun scripts/harness/smoke-agent-skill-popup-harness.ts
  parallel_safe_smoke "smoke: agent-pane-ux harness" bun scripts/harness/smoke-agent-pane-ux-harness.ts
  parallel_safe_smoke "smoke: agent-cancel harness" bun scripts/harness/smoke-agent-cancel-harness.ts
  parallel_safe_smoke "smoke: agent-engine-switch harness" bun scripts/harness/smoke-agent-engine-switch-harness.ts
  # Kept in the serial tail: the two repeat offenders in the retry tally (agent-permissions
  # passed-only-on-retry twice today, overlay-dialog retried-and-still-failed twice) both pass 3/3
  # isolated — the load-flake signature. Their blocking predicates must now
  # survive contention; serial placement limits per-gate application pressure
  # without taking a machine-wide lock.
  serial_smoke "smoke: agent-permissions harness" bun scripts/harness/smoke-agent-permissions-harness.ts
  parallel_safe_smoke "smoke: agent-search harness" bun scripts/harness/smoke-agent-search-harness.ts
  parallel_safe_smoke "smoke: audio-narration harness" bun scripts/harness/smoke-audio-narration-harness.ts
  parallel_safe_smoke "smoke: voice-picker harness" bun scripts/harness/smoke-voice-picker-harness.ts
  parallel_safe_smoke "smoke: diagnostics harness" bun scripts/harness/smoke-diagnostics-harness.ts
  parallel_safe_smoke "smoke: goto-definition harness" bun scripts/harness/smoke-goto-definition-harness.ts
  parallel_safe_smoke "smoke: hover harness" bun scripts/harness/smoke-hover-harness.ts
  # wave 4
  parallel_safe_smoke "smoke: terminal harness" bun scripts/harness/smoke-terminal-harness.ts
  parallel_safe_smoke "smoke: tasks harness" bun scripts/harness/smoke-tasks-harness.ts
  parallel_safe_smoke "smoke: terminal backpressure harness" bun scripts/harness/smoke-terminal-backpressure-harness.ts
  # Pool-safe: its blocking verdict is ordering/count based. Reduced motion
  # paints the complete command in its first typing frame, slow typing produces
  # more partial frames, and ten six-worker pool runs completed cleanly.
  parallel_safe_smoke \
    "smoke: terminal stage harness" \
    bun scripts/harness/smoke-terminal-stage-harness.ts
  parallel_safe_smoke "smoke: terminal follow harness" bun scripts/harness/smoke-terminal-follow-harness.ts
  parallel_safe_full_tmux_smoke "smoke: terminal"    bash scripts/smoke-terminal.sh
  parallel_safe_smoke "smoke: image-preview harness" bun scripts/harness/smoke-image-preview-harness.ts
  parallel_safe_smoke "smoke: pixel-preview harness" bun scripts/harness/smoke-pixel-preview-harness.ts
  parallel_safe_smoke "smoke: media harness" bun scripts/harness/smoke-media-harness.ts
  parallel_safe_smoke "smoke: markdown harness" bun scripts/harness/smoke-markdown-harness.ts
  parallel_safe_smoke "smoke: markdown view-mode harness" bun scripts/harness/smoke-markdown-view-mode-harness.ts
  parallel_safe_smoke "smoke: settings-applied harness" bun scripts/harness/smoke-settings-applied-harness.ts
  parallel_safe_smoke "smoke: shortcut-help harness" bun scripts/harness/smoke-shortcut-help-harness.ts
  serial_smoke "smoke: overlay-dialog harness" bun scripts/harness/smoke-overlay-dialog-harness.ts
  parallel_safe_smoke "smoke: quit-confirmation harness" bun scripts/harness/smoke-quit-confirmation-harness.ts
  parallel_safe_smoke "smoke: renderable disposal harness" bun scripts/harness/smoke-renderable-disposal-harness.ts
  parallel_safe_smoke "smoke: search-mouse harness" bun scripts/harness/smoke-search-mouse-harness.ts
else
  echo "== merge-gate: (FAST) skipped the multi-launch smokes + real settings drives =="
fi

echo "== merge-gate: smoke registration labels =="
if ! validate_smoke_registration_labels; then
  fail=1
  failed_step_names+=("smoke registration labels")
fi

echo "== merge-gate: smoke timing classification =="
if ! validate_smoke_classification; then
  fail=1
  failed_step_names+=("smoke timing classification")
fi

parallel_phase_started_seconds="$(date +%s)"
echo "== merge-gate: parallel-safe smoke pool (${#parallel_smoke_names[@]} jobs, $gate_worker_count workers) =="
run_parallel_smoke_pool
parallel_phase_elapsed_seconds="$(( $(date +%s) - parallel_phase_started_seconds ))"
echo "merge-gate timing: parallel-safe phase $(format_duration "$parallel_phase_elapsed_seconds") (${#parallel_smoke_names[@]} jobs, $gate_worker_count workers)"
report_slowest_parallel_smoke_jobs

# invariant: Blocking gate verdicts use ordering and counts (scripts/harness/harness.invariants.md)
serial_phase_started_seconds="$(date +%s)"
echo "== merge-gate: serial tail (${#serial_smoke_names[@]} registered jobs) =="
run_serial_tail() {
  run_serial_smokes
  # This check remains outside SKIP_PERF and FAST. Frame ordering blocks;
  # millisecond samples and their trailing trend remain report-only.
  # invariant: Input byte latency uses a reviewed gate baseline (scripts/harness/harness.invariants.md)
  reporting_step \
    "input byte first-frame ordering + timing trend (5 sessions)" \
    bun scripts/harness/input-byte-flush-gate.ts
}
run_serial_tail
serial_phase_elapsed_seconds="$(( $(date +%s) - serial_phase_started_seconds ))"
echo "merge-gate timing: serial phase $(format_duration "$serial_phase_elapsed_seconds")"

if [ "${FULL_TMUX_SKIPPED:-0}" -gt 0 ]; then
  echo "== merge-gate: $FULL_TMUX_SKIPPED tmux audit smokes not run (INVAR_FULL_TMUX=1 runs them) =="
fi

echo ""
if [ "${#retried_fail_smoke_names[@]}" -gt 0 ]; then
  echo "RETRY TALLY: ${#retried_fail_smoke_names[@]} step(s) RETRIED AND STILL FAILED — the retry did"
  echo "RETRY TALLY: not rescue them, so these are timeout-class REDS, not hidden flakes. Both"
  echo "RETRY TALLY: attempts' logs are in $failure_log_directory (attempt1 + final)."
  for retry_number in "${!retried_fail_smoke_names[@]}"; do
    echo "RETRY TALLY:   ${retried_fail_smoke_names[$retry_number]}"
  done
fi
if [ "${#retried_pass_smoke_names[@]}" -eq 0 ]; then
  # Only claim a clean GREEN when the run actually passed. Printing "this run's green
  # is a clean green" under FAILURES (as it did on the first failing run after the
  # tally landed) is a false reassurance in the exact place a reader looks for the
  # verdict — the tally reports RETRIES, so when the gate is red it must say only that.
  if [ "$fail" = 0 ]; then
    echo "RETRY TALLY: no step passed only on retry — this run's green is a clean green"
  else
    echo "RETRY TALLY: no step passed only on retry — nothing green here was propped up by a rerun"
  fi
else
  echo "RETRY TALLY: ${#retried_pass_smoke_names[@]} step(s) PASSED ONLY ON RETRY — a retried"
  echo "RETRY TALLY: pass is a FLAKE, not a green. Each line below is an intermittent"
  echo "RETRY TALLY: failure the retry hid; fix or reclassify it, do not skim past it."
  for retry_number in "${!retried_pass_smoke_names[@]}"; do
    echo "RETRY TALLY:   ${retried_pass_smoke_names[$retry_number]}"
  done
fi
if [ "${#reported_contention_fail_smoke_names[@]}" -eq 0 ]; then
  echo "CONTENTION TALLY: ${#reported_contention_pass_smoke_names[@]} report-only check(s) passed"
else
  echo "CONTENTION TALLY: ${#reported_contention_fail_smoke_names[@]} report-only check(s) failed; blocking verdict unchanged"
  for contention_smoke_name in "${reported_contention_fail_smoke_names[@]}"; do
    echo "CONTENTION TALLY:   $contention_smoke_name"
  done
fi
gate_elapsed_seconds="$(( $(date +%s) - gate_started_seconds ))"

# PERSIST THE TALLY, because a printed number is not a monitored number. The tally above has been
# correct for days and the retry TREND was still invisible: it lived only in per-run /tmp logs, so
# establishing "~27% of 121 runs were retry-clean" and later "1 of 11" both required hand-run censuses
# reconstructed from logs that /tmp eventually reclaims. That is the same shape as the input-byte
# history that accumulated twelve elevated samples while nothing read it — except worse, because there
# was no file to read at all.
#
# One line per gate, append-only, beside the latency history. This is also the PREREQUISITE for
# ratcheting retries down to a proven floor: a ratchet needs a recorded floor, not a remembered one.
# Deliberately NOT a blocking check yet — the floor must be earned from several consecutive runs
# before a rule is set on it, or the first ambient-load blip reds the gate and the rule gets unwound.
retry_history_path="$ROOT/.perf-history/gate-retries.ndjson"
mkdir -p "$(dirname "$retry_history_path")"
retry_history_pass_list="$(printf '%s\n' "${retried_pass_smoke_names[@]+"${retried_pass_smoke_names[@]}"}" \
  | sed '/^$/d' | sed 's/"/\\"/g' | sed 's/^/"/; s/$/"/' | paste -sd, -)"
retry_history_fail_list="$(printf '%s\n' "${retried_fail_smoke_names[@]+"${retried_fail_smoke_names[@]}"}" \
  | sed '/^$/d' | sed 's/"/\\"/g' | sed 's/^/"/; s/$/"/' | paste -sd, -)"
failed_step_list="$(printf '%s\n' "${failed_step_names[@]+"${failed_step_names[@]}"}" \
  | sed '/^$/d' | sed 's/"/\\"/g' | sed 's/^/"/; s/$/"/' | paste -sd, -)"
contention_pass_list="$(printf '%s\n' "${reported_contention_pass_smoke_names[@]+"${reported_contention_pass_smoke_names[@]}"}" \
  | sed '/^$/d' | sed 's/"/\\"/g' | sed 's/^/"/; s/$/"/' | paste -sd, -)"
contention_fail_list="$(printf '%s\n' "${reported_contention_fail_smoke_names[@]+"${reported_contention_fail_smoke_names[@]}"}" \
  | sed '/^$/d' | sed 's/"/\\"/g' | sed 's/^/"/; s/$/"/' | paste -sd, -)"
printf '{"timestamp":"%s","commit":"%s","workerCount":%s,"gateOutcome":"%s","failingSteps":[%s],"retriedPassCount":%s,"retriedFailCount":%s,"retriedPassSmokes":[%s],"retriedFailSmokes":[%s],"contentionPasses":[%s],"contentionFailures":[%s],"totalSeconds":%s,"loadAverage":"%s"}\n' \
  "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  "$(git -C "$ROOT" rev-parse --short HEAD 2>/dev/null || echo unknown)" \
  "$gate_worker_count" \
  "$([ "$fail" = 0 ] && echo all-pass || echo failures)" \
  "$failed_step_list" \
  "${#retried_pass_smoke_names[@]}" \
  "${#retried_fail_smoke_names[@]}" \
  "$retry_history_pass_list" \
  "$retry_history_fail_list" \
  "$contention_pass_list" \
  "$contention_fail_list" \
  "$gate_elapsed_seconds" \
  "$(cut -d' ' -f1-3 /proc/loadavg 2>/dev/null || echo unknown)" \
  >>"$retry_history_path"
echo "RETRY TALLY: appended to .perf-history/gate-retries.ndjson ($(wc -l <"$retry_history_path" | tr -d ' ') runs recorded)"

echo "merge-gate timing: total $(format_duration "$gate_elapsed_seconds")"
echo ""
if [ "$fail" = 0 ]; then
  echo "merge-gate: ALL-PASS"
  # Mechanical checks passed — the commit is legit. Now the one thing no checker can do: encode the
  # invariants you LEARNED. A soft reminder, never a gate — encoding, and especially RETIRING, an
  # invariant is a HOLISTIC judgment, not a falsifiable check.
  echo ""
  echo "  +-- invariant bookkeeping (reminder, not a gate) -------------------------------------"
  echo "  | ESTABLISHED or revealed an invariant not yet written down? Annotate its load-bearing"
  echo "  |   line in the same form the existing annotations use, and add/refine its"
  echo "  |   *.invariants.md entry (Invariant / Mechanism / Generates / Impossible-if-true / Verify)."
  echo "  | Suspect a change RETIRED one? Do NOT retire it here — mid-feature you may be wrong, and"
  echo "  |   the call is holistic (other witnesses in the repo? a pervasive APPROACH with no single"
  echo "  |   annotation? a REALITY truth merely de-scoped?). Just flag a POSSIBLE RETIREMENT"
  echo "  |   CANDIDATE; a scheduled retirement sweep decides live-or-die with full attention."
  echo "  | The checker proves annotations resolve and flags dangling ones; the meaning is yours."
  echo "  |   Re-run: node .claude/skills/invariants/scripts/check_invariants.mjs --all --refs"
  echo "  +------------------------------------------------------------------------------------"
else
  echo "merge-gate: FAILURES — commit/merge BLOCKED"
  report_failure_log_provenance
fi
# The verdict is BORN WITH THE LOG. land.sh refuses to act without reading
# GATE_EXIT= from the log itself; wrappers used to append it, so a gate run
# by anyone else produced a log land.sh could not accept (2026-07-29: a
# builder's genuine ALL-PASS log lacked the sentinel). The gate now stamps
# its own exit — every log is a self-contained verdict.
echo "GATE_EXIT=${fail}"
exit "$fail"

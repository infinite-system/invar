#!/usr/bin/env bash
# THE merge gate — every HARD-BLOCKING check a feature commit/merge must pass. This exists because
# conventions-gate.sh alone ran only tsc + the mechanical/meta checks, so the behavioral CONTRACTS
# (momentum-glide, wrap-scroll, idle-quiescence), the driving SMOKES, and the REAL per-field settings
# applied-effect drives DID NOT BLOCK A COMMIT — build-but-don't-wire applied to the gates themselves,
# violating project.requirements.md "MEASURED != ENFORCED". This wrapper runs them all; ANY non-zero
# exit fails the gate. Slow (many app launches) — it is the MERGE gate, not the every-keystroke check;
# conventions-gate.sh stays the fast inner loop (and is step 1 here).
#
# Usage: bash scripts/merge-gate.sh          (run everything)
#        FAST=1 bash scripts/merge-gate.sh   (skip the multi-launch smokes; conventions + contracts + meta only)
set -uo pipefail
DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$DIR/.." && pwd)"
cd "$ROOT"
source "$DIR/quiet-lock.sh"
export PATH="$HOME/.bun/bin:$PATH"
gate_started_seconds="$(date +%s)"
# THE GATE PUBLISHES ITS OWN PID, so stopping it never requires a process SEARCH. This exists because a
# `pkill -f merge-gate.sh` killed two BUILDER agents on 2026-07-26: every builder brief contains the
# string "do NOT run scripts/merge-gate.sh", so the builders' command lines matched a pattern meant for
# the gate, and one lost ~25 minutes of uncommitted work. A search over command lines matches ARGUMENTS,
# not programs. With a pid file, `scripts/stop-merge-gate.sh` kills exactly one known process and can
# refuse anything it cannot positively identify.
gate_pid_file="/tmp/merge-gate.$(echo "$ROOT" | tr -c 'a-zA-Z0-9' '-').pid"
echo "$$" > "$gate_pid_file"
trap 'rm -f "$gate_pid_file"' EXIT
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
# Failing steps keep their FULL output here — tail-25 destroyed the failing condition three times
# on 2026-07-25 (the evidence a red exists to provide). Wiped per gate run, never mid-run.
# PER-RUN failure directory: two concurrent gates sharing one path would wipe each other's evidence
# at start (the rm -rf below), which is the one thing this directory exists to prevent. The stable
# symlink /tmp/merge-gate-failures always points at the most recent run, so the habit of reading that
# path still works for a single-gate workflow.
failure_log_directory="/tmp/merge-gate-failures.$$"
rm -rf "$failure_log_directory"
mkdir -p "$failure_log_directory"
ln -sfn "$failure_log_directory" /tmp/merge-gate-failures
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
    cp "$step_log" "$failure_log_directory/$failure_slug.attempt1.log"
    echo "  RETRY $name — timeout-class failure; one quiet retry (attempt 1 log preserved)"
    serial_step_retried=1
    sleep 10
    if "$@" >"$step_log" 2>&1; then
      echo "  OK    $name (clean on retry; first attempt was starvation-class)"
      # Feed the SAME tally the pool jobs feed. Until now only pool retries were
      # counted, so a serial or quiet-tail step that passed only on its retry left no
      # trace but a line buried mid-log — which is how smoke-workspace-tabs stayed
      # 1-in-3 to 2-in-3 flaky for a whole day while every gate reported green.
      retried_pass_smoke_names+=("$name")
      rm -f "$step_log"
      return
    fi
  fi
  if [ "$serial_step_retried" -eq 1 ]; then retried_fail_smoke_names+=("$name"); fi
  cp "$step_log" "$failure_log_directory/$failure_slug.log"
  echo "  FAIL  $name (full log: $failure_log_directory/$failure_slug.log)"
  tail -25 "$step_log" | sed 's/^/    | /'
  fail=1
  rm -f "$step_log"
}
# A SOFT step: it RUNS and REPORTS (so a regression surfaces in the gate), but a non-zero exit does
# NOT block the commit. Use only where the numbers are informational and the load-bearing invariant is
# hard-gated elsewhere (perf's idle-quiescence is enforced by behavioral-contracts).
soft_step() {
  local name="$1"; shift
  echo "== merge-gate: $name (SOFT — reports, does not block) =="
  if "$@" >/tmp/merge-gate-soft.$$.log 2>&1; then
    echo "  OK    $name"
  else
    echo "  WARN  $name — target miss or measurement gap (soft, not blocking)"; tail -20 /tmp/merge-gate-soft.$$.log | sed 's/^/    | /'
  fi
  rm -f /tmp/merge-gate-soft.$$.log
}
# A reporting hard step: unlike step(), successful measurement output is part of the gate log.
reporting_step() {
  local name="$1"; shift
  echo "== merge-gate: $name =="
  if "$@" >/tmp/merge-gate-reporting.$$.log 2>&1; then
    sed 's/^/    | /' /tmp/merge-gate-reporting.$$.log
    echo "  OK    $name"
  else
    echo "  FAIL  $name"
    tail -40 /tmp/merge-gate-reporting.$$.log | sed 's/^/    | /'
    fail=1
  fi
  rm -f /tmp/merge-gate-reporting.$$.log
}

# SWAP (2026-07-24, user-approved): the PTY harness suite is the per-gate smoke phase and the
# TerminalEmulator conformance corpus directly specifies its screen oracle in bun test. Retained tmux
# originals run only with INVAR_FULL_TMUX=1 (weekly cron / audits); strict-subset duplicates may be
# parked when their gated harness twin is declared as the replacement in project.coverage-deltas.md.
# Contract: harness.invariants.md "The conformance corpus replaces the tmux ring".
FULL_TMUX_SKIPPED=0
gate_worker_count="${INVAR_GATE_WORKERS:-6}"
case "$gate_worker_count" in
  ''|*[!0-9]*|0)
    echo "merge-gate: INVAR_GATE_WORKERS must be a positive integer (received '$gate_worker_count')" >&2
    exit 2
    ;;
esac

declare -a parallel_smoke_names=()
declare -a parallel_smoke_commands=()
declare -a parallel_smoke_sources=()
declare -a quiet_smoke_names=()
declare -a quiet_smoke_commands=()
declare -a quiet_smoke_sources=()
# TWO POPULATIONS, NOT ONE. A retry has two possible outcomes and they mean opposite things: a retried
# PASS is a masked intermittent (the dangerous one — it is invisible in a green run), while a retried
# FAIL is already visible in the FAIL list and only needs its timeout-class provenance recorded. The
# first version of this tally recorded the retry ATTEMPT, so a job that retried and still failed was
# printed under "PASSED ONLY ON RETRY" — an instrument failing in the direction of reassurance.
declare -a retried_pass_smoke_names=()
declare -a retried_fail_smoke_names=()

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

parallel_safe_smoke() {
  local smoke_name="$1"; shift
  parallel_smoke_names+=("$smoke_name")
  parallel_smoke_commands+=("$(quoted_command "$@")")
  parallel_smoke_sources+=("$(registered_smoke_source "$@")")
}

quiet_serial_smoke() {
  local smoke_name="$1"; shift
  quiet_smoke_names+=("$smoke_name")
  quiet_smoke_commands+=("$(quoted_command "$@")")
  quiet_smoke_sources+=("$(registered_smoke_source "$@")")
}

parallel_safe_full_tmux_smoke() {
  if [ "${INVAR_FULL_TMUX:-0}" = "1" ]; then
    parallel_safe_smoke "$@"
  else
    FULL_TMUX_SKIPPED=$((FULL_TMUX_SKIPPED + 1))
  fi
}

quiet_serial_full_tmux_smoke() {
  if [ "${INVAR_FULL_TMUX:-0}" = "1" ]; then
    quiet_serial_smoke "$@"
  else
    FULL_TMUX_SKIPPED=$((FULL_TMUX_SKIPPED + 1))
  fi
}

execute_registered_smoke_job() {
  local phase_name="$1"
  local job_number="$2"
  local smoke_name="$3"
  local smoke_command="$4"
  local step_log="/tmp/merge-gate-step.$$.${phase_name}.${job_number}.log"
  local summary_log="/tmp/merge-gate-summary.$$.${phase_name}.${job_number}.log"
  local result_file="/tmp/merge-gate-result.$$.${phase_name}.${job_number}"
  local retry_outcome_file="/tmp/merge-gate-retry-outcome.$$.${phase_name}.${job_number}"
  local failure_slug
  failure_slug="$(echo "$smoke_name" | tr -cs 'a-zA-Z0-9' '-')"

  : >"$summary_log"
  echo none >"$retry_outcome_file"
  echo "== merge-gate: $smoke_name ==" >>"$summary_log"
  if bash -c "$smoke_command" >"$step_log" 2>&1; then
    echo "  OK    $smoke_name" >>"$summary_log"
    echo 0 >"$result_file"
    rm -f "$step_log"
    return
  fi

  if grep -q 'Timed out' "$step_log"; then
    cp "$step_log" "$failure_log_directory/$failure_slug.attempt1.log"
    echo failed >"$retry_outcome_file"
    echo "  RETRY $smoke_name — timeout-class failure; one quiet retry (attempt 1 log preserved)" >>"$summary_log"
    sleep 10
    if bash -c "$smoke_command" >"$step_log" 2>&1; then
      echo "  OK    $smoke_name (clean on retry; first attempt was starvation-class)" >>"$summary_log"
      echo passed >"$retry_outcome_file"
      echo 0 >"$result_file"
      rm -f "$step_log"
      return
    fi
  fi

  cp "$step_log" "$failure_log_directory/$failure_slug.log"
  echo "  FAIL  $smoke_name (full log: $failure_log_directory/$failure_slug.log)" >>"$summary_log"
  tail -25 "$step_log" | sed 's/^/    | /' >>"$summary_log"
  echo 1 >"$result_file"
  rm -f "$step_log"
}

collect_registered_smoke_job() {
  local phase_name="$1"
  local job_number="$2"
  local smoke_name="$3"
  local summary_log="/tmp/merge-gate-summary.$$.${phase_name}.${job_number}.log"
  local result_file="/tmp/merge-gate-result.$$.${phase_name}.${job_number}"
  local retry_outcome_file="/tmp/merge-gate-retry-outcome.$$.${phase_name}.${job_number}"
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
  if [ "$job_result" -ne 0 ]; then fail=1; fi
  if [ "$retry_outcome" = passed ]; then retried_pass_smoke_names+=("$smoke_name"); fi
  if [ "$retry_outcome" = failed ]; then retried_fail_smoke_names+=("$smoke_name"); fi
  rm -f "$summary_log" "$result_file" "$retry_outcome_file"
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
      "${parallel_smoke_commands[$job_number]}" &
    worker_process_ids+=("$!")
  done
  for worker_process_id in "${worker_process_ids[@]}"; do
    wait "$worker_process_id" || true
  done
  for job_number in "${!parallel_smoke_names[@]}"; do
    collect_registered_smoke_job "parallel" "$job_number" "${parallel_smoke_names[$job_number]}"
  done
}

run_quiet_serial_smokes() {
  local job_number
  for job_number in "${!quiet_smoke_names[@]}"; do
    execute_registered_smoke_job \
      "quiet" \
      "$job_number" \
      "${quiet_smoke_names[$job_number]}" \
      "${quiet_smoke_commands[$job_number]}"
    collect_registered_smoke_job "quiet" "$job_number" "${quiet_smoke_names[$job_number]}"
  done
}

format_duration() {
  local duration_seconds="$1"
  printf '%dm%02ds' "$((duration_seconds / 60))" "$((duration_seconds % 60))"
}

validate_smoke_classification() {
  local source_number
  local smoke_source
  local classification_failure_count=0
  local inspected_source_count=0
  for source_number in "${!parallel_smoke_sources[@]}"; do
    smoke_source="${parallel_smoke_sources[$source_number]}"
    [ -n "$smoke_source" ] || continue
    # Two structural tells, deliberately NOT domain vocabulary. Naming the
    # feature ("momentum", "glide") misses any smoke that measures time while
    # talking about something else — smoke-terminal-stage-harness said
    # "animation" and "reducedMotion" and slipped through the vocabulary form of
    # this check, which is the harmful direction: a false negative loses
    # coverage under load while still reporting green.
    #
    #   1. A frame-silence assertion is an absence claim, and a loaded machine
    #      changes what it observes in BOTH directions — it passes when nothing
    #      was rendering, and fails when an awaited repaint lands late.
    #   2. Deriving an ELAPSED DURATION means subtracting two clock readings. A
    #      wait deadline only ever ADDS to a clock reading and compares against
    #      it, and is load-robust because it simply waits longer. Subtraction is
    #      therefore the discriminator between measuring and waiting.
    if grep -Eq \
      'assertNoCompleteFrameEmittedFor|awaitFrameSilence|performance\.now\(\)[[:space:]]*-|Date\.now\(\)[[:space:]]*-' \
      "$smoke_source"; then
      echo "  FAIL  parallel-safe classification: ${parallel_smoke_names[$source_number]} contains a timing-sensitive assertion in $smoke_source"
      classification_failure_count=$((classification_failure_count + 1))
    fi
    inspected_source_count=$((inspected_source_count + 1))
  done
  # POSITIVE CONTROL. This guard can only fail toward "pass": if its matcher does not
  # work, it finds no violations and reports OK. That is not hypothetical — it used
  # `rg`, which is NOT INSTALLED on this machine, so for 14 gate runs it printed
  # "every registered timing-sensitive smoke is tagged quiet-serial" while inspecting
  # nothing, and the error text sat two lines above the OK in every one of those logs.
  #
  # The quiet-serial bucket is the KNOWN-POSITIVE set: those smokes are in the tail
  # precisely because they contain the patterns above. So the guard proves its own
  # instrument on them before trusting its silence about the parallel bucket. It also
  # refuses to pass having inspected nothing.
  if [ "$inspected_source_count" -eq 0 ]; then
    echo "  FAIL  classification guard inspected NO parallel-safe sources — the registry is empty or unreadable"
    return 1
  fi
  local quiet_bucket_match_count=0
  local quiet_source
  for quiet_source in "${quiet_smoke_sources[@]}"; do
    [ -n "$quiet_source" ] || continue
    [ -f "$quiet_source" ] || continue
    if grep -Eq \
      'assertNoCompleteFrameEmittedFor|awaitFrameSilence|performance\.now\(\)[[:space:]]*-|Date\.now\(\)[[:space:]]*-' \
      "$quiet_source"; then
      quiet_bucket_match_count=$((quiet_bucket_match_count + 1))
    fi
  done
  if [ "$quiet_bucket_match_count" -eq 0 ]; then
    echo "  FAIL  classification guard SELF-TEST failed: the timing-sensitivity pattern matched none of the ${#quiet_smoke_sources[@]} quiet-serial sources, so its silence about the $inspected_source_count parallel sources proves nothing (a broken or missing matcher looks exactly like a clean bill of health)"
    return 1
  fi
  if [ "$classification_failure_count" -eq 0 ]; then
    echo "  OK    every registered timing-sensitive smoke is tagged quiet-serial ($inspected_source_count parallel sources inspected; matcher self-tested against $quiet_bucket_match_count of ${#quiet_smoke_sources[@]} quiet sources)"
    return 0
  fi
  return 1
}

# 1) Fast inner gate: tsc + conventions + unwired-capability.
step "conventions-gate (tsc + conventions + unwired)" bash scripts/conventions-gate.sh
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
# invariant: Timing-sensitive smokes run on a machine-wide quiet lock (scripts/harness/harness.invariants.md)
step \
  "unit tests (bun test)" \
  quiet_lock_run \
  "loud-shared" \
  "merge-gate unit tests" \
  bun test
# 3) Behavioral CONTRACTS — the felt-invariants (momentum-glide, wrap-scroll, idle-quiescence).
# They register in the quiet tail because their momentum and absence windows are timing-sensitive.
quiet_serial_smoke "behavioral-contracts (felt invariants)" bash scripts/behavioral-contracts.sh

if [ "${FAST:-0}" != "1" ]; then
  echo "smoke phase: PTY harness suite (INVAR_FULL_TMUX=${INVAR_FULL_TMUX:-0}; tmux audit steps skipped when 0 are reported below)"
  # 4) Driving SMOKES — the real user paths.
  parallel_safe_full_tmux_smoke "smoke: editor"      bash scripts/smoke-editor.sh
  parallel_safe_smoke "smoke: editor harness" bun scripts/harness/smoke-editor-harness.ts
  quiet_serial_smoke "smoke: inline rewrite harness" bun scripts/harness/smoke-inline-rewrite-harness.ts
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
  parallel_safe_full_tmux_smoke "smoke: tree-scroll" bash scripts/smoke-tree-scroll.sh
  parallel_safe_full_tmux_smoke "smoke: selection"   bash scripts/smoke-selection.sh
  # invariant: The conformance corpus replaces the tmux ring (scripts/harness/harness.invariants.md)
  parallel_safe_smoke "smoke: selection harness" bun scripts/harness/smoke-selection-harness.ts
  parallel_safe_full_tmux_smoke "smoke: scrollbars"  bash scripts/smoke-scrollbars.sh
  parallel_safe_smoke "smoke: scrollbars harness" bun scripts/harness/smoke-scrollbars-harness.ts
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
  parallel_safe_full_tmux_smoke "smoke: word-delete" bash scripts/smoke-word-delete.sh
  parallel_safe_smoke "smoke: word-delete harness" bun scripts/harness/smoke-word-delete-harness.ts
  parallel_safe_smoke "smoke: shared text-input harness" bun scripts/harness/smoke-text-input-harness.ts
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
  # Moved to the POOL: this smoke's only reason to be in the quiet tail was a 600 ms
  # frame-silence window, and that window was proven UNSOUND earlier tonight (GitWatcher's
  # 5 s reconcile floor legitimately repaints after the fixture creates an untracked file,
  # so ~12% of windows contained a CORRECT repaint). It was replaced by a STATE assertion —
  # a document outside version control keeps publishing no blame author however often git
  # reconciles underneath it — which is immune to load and to timer phase. The structural
  # guard now confirms it carries no timing-sensitive assertion, so the tail has no claim
  # on it. This is the first tail reduction earned by converting absence into state.
  parallel_safe_smoke "smoke: git-blame harness" bun scripts/harness/smoke-git-blame-harness.ts
  parallel_safe_smoke "smoke: git-log harness" bun scripts/harness/smoke-git-log-harness.ts
  parallel_safe_smoke "smoke: git-watch harness" bun scripts/harness/smoke-git-watch-harness.ts
  parallel_safe_smoke "smoke: gutter-diff harness" bun scripts/harness/smoke-gutter-diff-harness.ts
  parallel_safe_smoke "smoke: diff-overview harness" bun scripts/harness/smoke-diff-overview-harness.ts
  parallel_safe_smoke "smoke: tree-scroll harness" bun scripts/harness/smoke-tree-scroll-harness.ts
  parallel_safe_smoke "smoke: quick-open harness" bun scripts/harness/smoke-quickopen-harness.ts
  parallel_safe_smoke "smoke: navigation-history harness" bun scripts/harness/smoke-navigation-history-harness.ts
  parallel_safe_smoke "smoke: open-project harness" bun scripts/harness/smoke-openproject-harness.ts
  parallel_safe_smoke "smoke: activitybar harness" bun scripts/harness/smoke-activitybar-harness.ts
  parallel_safe_smoke "smoke: panel-split harness" bun scripts/harness/smoke-panel-split-harness.ts
  parallel_safe_smoke "smoke: panel-chrome harness" bun scripts/harness/smoke-panel-chrome-harness.ts
  # Shared splitter paint/drag states plus live slot configuration and the right-dock command/mouse
  # affordance. Kept additive to the pane-specific smokes above.
  parallel_safe_smoke "smoke: layout harness" bun scripts/harness/smoke-layout-harness.ts
  # wave 3
  parallel_safe_smoke "smoke: agent harness" bun scripts/harness/smoke-agent-harness.ts
  parallel_safe_smoke "smoke: agent skill popup harness" bun scripts/harness/smoke-agent-skill-popup-harness.ts
  parallel_safe_smoke "smoke: agent-pane-ux harness" bun scripts/harness/smoke-agent-pane-ux-harness.ts
  parallel_safe_smoke "smoke: agent-cancel harness" bun scripts/harness/smoke-agent-cancel-harness.ts
  parallel_safe_smoke "smoke: agent-engine-switch harness" bun scripts/harness/smoke-agent-engine-switch-harness.ts
  # Moved to the quiet tail 2026-07-26: the two repeat offenders in the retry tally (agent-permissions
  # passed-only-on-retry twice today, overlay-dialog retried-and-still-failed twice) both pass 3/3
  # isolated — the load-flake signature. They cannot take quiet-exclusive INSIDE the pool (the gate
  # holds loud-shared around the pool, so a pool job wanting exclusive would only hit the 120 s
  # degrade); the tail is where timing-sensitive work belongs, and the classification guard agrees.
  quiet_serial_smoke "smoke: agent-permissions harness" bun scripts/harness/smoke-agent-permissions-harness.ts
  parallel_safe_smoke "smoke: agent-search harness" bun scripts/harness/smoke-agent-search-harness.ts
  parallel_safe_smoke "smoke: audio-narration harness" bun scripts/harness/smoke-audio-narration-harness.ts
  parallel_safe_smoke "smoke: voice-picker harness" bun scripts/harness/smoke-voice-picker-harness.ts
  parallel_safe_smoke "smoke: diagnostics harness" bun scripts/harness/smoke-diagnostics-harness.ts
  parallel_safe_smoke "smoke: goto-definition harness" bun scripts/harness/smoke-goto-definition-harness.ts
  parallel_safe_smoke "smoke: hover harness" bun scripts/harness/smoke-hover-harness.ts
  # wave 4
  parallel_safe_smoke "smoke: terminal harness" bun scripts/harness/smoke-terminal-harness.ts
  parallel_safe_smoke "smoke: terminal backpressure harness" bun scripts/harness/smoke-terminal-backpressure-harness.ts
  # Quiet-serial: this smoke asserts on DURATIONS, not just on rendered content.
  # It requires the reducedMotion path to finish under 1000 ms, and requires a
  # slow typing speed to take at least 400 ms longer than a fast one, measured
  # across two separately launched applications. Both are measurements of the
  # machine, so pool load can invert the margin or blow the ceiling.
  quiet_serial_smoke "smoke: terminal stage harness" bun scripts/harness/smoke-terminal-stage-harness.ts
  parallel_safe_smoke "smoke: terminal follow harness" bun scripts/harness/smoke-terminal-follow-harness.ts
  parallel_safe_full_tmux_smoke "smoke: terminal"    bash scripts/smoke-terminal.sh
  parallel_safe_smoke "smoke: image-preview harness" bun scripts/harness/smoke-image-preview-harness.ts
  parallel_safe_smoke "smoke: pixel-preview harness" bun scripts/harness/smoke-pixel-preview-harness.ts
  parallel_safe_smoke "smoke: markdown harness" bun scripts/harness/smoke-markdown-harness.ts
  parallel_safe_smoke "smoke: settings-applied harness" bun scripts/harness/smoke-settings-applied-harness.ts
  parallel_safe_smoke "smoke: shortcut-help harness" bun scripts/harness/smoke-shortcut-help-harness.ts
  quiet_serial_smoke "smoke: overlay-dialog harness" bun scripts/harness/smoke-overlay-dialog-harness.ts
  parallel_safe_smoke "smoke: search-mouse harness" bun scripts/harness/smoke-search-mouse-harness.ts
else
  echo "== merge-gate: (FAST) skipped the multi-launch smokes + real settings drives =="
fi

echo "== merge-gate: smoke timing classification =="
if ! validate_smoke_classification; then fail=1; fi

parallel_phase_started_seconds="$(date +%s)"
echo "== merge-gate: parallel-safe smoke pool (${#parallel_smoke_names[@]} jobs, $gate_worker_count workers) =="
# invariant: Timing-sensitive smokes run on a machine-wide quiet lock (scripts/harness/harness.invariants.md)
quiet_lock_run \
  "loud-shared" \
  "merge-gate parallel smoke pool" \
  run_parallel_smoke_pool
parallel_phase_elapsed_seconds="$(( $(date +%s) - parallel_phase_started_seconds ))"
echo "merge-gate timing: parallel-safe phase $(format_duration "$parallel_phase_elapsed_seconds") (${#parallel_smoke_names[@]} jobs, $gate_worker_count workers)"

# invariant: Duration measurements run in a quiet serial tail (scripts/harness/harness.invariants.md)
quiet_phase_started_seconds="$(date +%s)"
echo "== merge-gate: quiet-serial tail (${#quiet_smoke_names[@]} registered jobs) =="
run_machine_quiet_tail() {
  run_quiet_serial_smokes
  # This latency check is deliberately outside SKIP_PERF and FAST. It names
  # the raw-byte boundary, records every result, and blocks only at the
  # reviewed baseline's failure multiplier.
  # invariant: Input byte latency uses a reviewed gate baseline (scripts/harness/harness.invariants.md)
  reporting_step \
    "input byte flush latency (5-session median)" \
    bun scripts/harness/input-byte-flush-gate.ts
  # 6) Perf baselines are soft: the load-bearing idle-quiescence invariant is
  # hard-gated above.
  if [ "${FAST:-0}" != "1" ] && [ "${SKIP_PERF:-0}" != "1" ]; then
    soft_step \
      "perf-baselines (memory/CPU/latency)" \
      bash scripts/perf-baselines.sh
  elif [ "${FAST:-0}" != "1" ]; then
    echo "== merge-gate: (SKIP_PERF=1) skipped perf-baselines =="
  fi
}
# invariant: Timing-sensitive smokes run on a machine-wide quiet lock (scripts/harness/harness.invariants.md)
quiet_lock_run \
  "quiet-exclusive" \
  "merge-gate quiet serial tail" \
  run_machine_quiet_tail
quiet_phase_elapsed_seconds="$(( $(date +%s) - quiet_phase_started_seconds ))"
echo "merge-gate timing: quiet-serial phase $(format_duration "$quiet_phase_elapsed_seconds")"

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
gate_elapsed_seconds="$(( $(date +%s) - gate_started_seconds ))"
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
fi
exit "$fail"

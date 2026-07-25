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
export PATH="$HOME/.bun/bin:$PATH"
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
reaped_orphan_instances=0
for orphan_pid in $(pgrep -f 'src/main\.ts /tmp/tui-' 2>/dev/null || true); do
  orphan_cmdline="$(tr '\0' ' ' < "/proc/$orphan_pid/cmdline" 2>/dev/null || true)"
  case "$orphan_cmdline" in
    *"/tmp/tui-demo"*) continue ;;                         # never touch the user's live demo
    *) kill -9 "$orphan_pid" 2>/dev/null && reaped_orphan_instances=$((reaped_orphan_instances + 1)) ;;
  esac
done
if [ "$reaped_orphan_instances" -gt 0 ]; then
  echo "merge-gate: reaped $reaped_orphan_instances orphaned app instance(s) before start (inotify hygiene)"
  sleep 0.5  # let the kernel release their inotify instances before the gate launches fresh ones
fi
echo "merge-gate: starting with $(pgrep -cf 'src/main\.ts /tmp/tui-' 2>/dev/null || echo 0) test app instance(s) live"
fail=0
step() {
  local name="$1"; shift
  echo "== merge-gate: $name =="
  if "$@" >/tmp/merge-gate-step.$$.log 2>&1; then
    echo "  OK    $name"
  else
    echo "  FAIL  $name"; tail -25 /tmp/merge-gate-step.$$.log | sed 's/^/    | /'
    fail=1
  fi
  rm -f /tmp/merge-gate-step.$$.log
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
# TerminalEmulator conformance corpus directly specifies its screen oracle in bun test. All tmux
# originals run only with INVAR_FULL_TMUX=1 (weekly cron / audits).
# Contract: harness.invariants.md "The conformance corpus replaces the tmux ring".
full_tmux_step() {
  if [ "${INVAR_FULL_TMUX:-0}" = "1" ]; then
    step "$@"
  else
    FULL_TMUX_SKIPPED=$((FULL_TMUX_SKIPPED + 1))
  fi
}
FULL_TMUX_SKIPPED=0

# 1) Fast inner gate: tsc + conventions + unwired-capability + settings-applied META.
step "conventions-gate (tsc + conventions + unwired + settings-meta)" bash scripts/conventions-gate.sh
# 1b) The INVARIANT CONTRACT LAYER — the lattice itself. --all: every *.invariants.md is structurally
#     valid (both headings, required fields, non-empty Evidence). --refs: every `// invariant:` code
#     annotation resolves to a real record (no dangling references) + coverage report. This was RED and
#     unenforced (the checker existed but rode no gate), so the layer that IS the lattice was
#     measured-but-not-enforced — my own commits added annotations to records that did not exist. Both
#     hard-blocking now: a broken/misnamed invariant reference fails the gate.
step "invariant contracts --all (structure)" node .claude/skills/invariants/scripts/check_invariants.mjs --all
step "invariant contracts --refs (annotations resolve)" node .claude/skills/invariants/scripts/check_invariants.mjs --all --refs
# 2) Unit tests.
step "unit tests (bun test)" bun test
# 3) Behavioral CONTRACTS — the felt-invariants (momentum-glide, wrap-scroll, idle-quiescence).
step "behavioral-contracts (felt invariants)" bash scripts/behavioral-contracts.sh
# This latency check is deliberately outside SKIP_PERF and FAST. It names the raw-byte boundary,
# records every result, and blocks only at the reviewed baseline's failure multiplier.
# invariant: Input byte latency uses a reviewed gate baseline (scripts/harness/harness.invariants.md)
reporting_step "input byte flush latency (5-session median)" bun scripts/harness/input-byte-flush-gate.ts

if [ "${FAST:-0}" != "1" ]; then
  echo "smoke phase: PTY harness suite (INVAR_FULL_TMUX=${INVAR_FULL_TMUX:-0}; tmux audit steps skipped when 0 are reported below)"
  # 4) Driving SMOKES — the real user paths.
  full_tmux_step "smoke: editor"      bash scripts/smoke-editor.sh
  step "smoke: editor harness" bun scripts/harness/smoke-editor-harness.ts
  step "smoke: horizontal extent harness" bun scripts/harness/smoke-horizontal-extent-harness.ts
  # Move-line / duplicate-line (pure model op): drive the palette commands, assert the document reordered
  # + cursor followed + one undo restored (via the probe, not the frame).
  full_tmux_step "smoke: move-line"   bash scripts/smoke-move-line.sh
  step "smoke: move-line harness" bun scripts/harness/smoke-move-line-harness.ts
  full_tmux_step "smoke: indent-guides" bash scripts/smoke-indent-guides.sh
  step "smoke: indent-guides harness" bun scripts/harness/smoke-indent-guides-harness.ts
  # Bracket matching: cursor on a `{` highlights it + its balanced `}` (match background via FrameProbe);
  # moving off clears it. Pure finder + real-tokenizer string/comment gate.
  full_tmux_step "smoke: bracket-match" bash scripts/smoke-bracket-match.sh
  step "smoke: bracket-match harness" bun scripts/harness/smoke-bracket-match-harness.ts
  full_tmux_step "smoke: tabs"        bash scripts/smoke-tabs.sh
  step "smoke: tabs harness" bun scripts/harness/smoke-tabs-harness.ts
  step "smoke: bounded list popup harness" bun scripts/harness/smoke-bounded-list-popup-harness.ts
  full_tmux_step "smoke: workspace tabs" bash scripts/smoke-workspace-tabs.sh
  step "smoke: workspace tabs harness" bun scripts/harness/smoke-workspace-tabs-harness.ts
  full_tmux_step "smoke: tree-scroll" bash scripts/smoke-tree-scroll.sh
  full_tmux_step "smoke: selection"   bash scripts/smoke-selection.sh
  # invariant: The conformance corpus replaces the tmux ring (scripts/harness/harness.invariants.md)
  step "smoke: selection harness" bun scripts/harness/smoke-selection-harness.ts
  full_tmux_step "smoke: scrollbars"  bash scripts/smoke-scrollbars.sh
  step "smoke: scrollbars harness" bun scripts/harness/smoke-scrollbars-harness.ts
  full_tmux_step "smoke: wrap"        bash scripts/smoke-wrap.sh
  step "smoke: wrap harness" bun scripts/harness/smoke-wrap-harness.ts
  full_tmux_step "smoke: comment-styling" bash scripts/smoke-comment-styling.sh
  step "smoke: comment-styling harness" bun scripts/harness/smoke-comment-styling-harness.ts
  full_tmux_step "smoke: git-watch"   bash scripts/smoke-git-watch.sh
  # Commit-log freshness (external commits appear via the tip-SHA reconcile) + the read-only
  # branch VIEWER (cycle/menu/Esc, by-SHA drill-down, worktree/HEAD byte-identical after).
  full_tmux_step "smoke: git-log"     bash scripts/smoke-git-log.sh
  # Current-line git blame (GitLens parity): a committed line shows its author in the status bar; a
  # non-git document shows none. Scratch repo + non-git dir; async blame is cached per file.
  full_tmux_step "smoke: git-blame"   bash scripts/smoke-git-blame.sh
  full_tmux_step "smoke: find"        bash scripts/smoke-find.sh
  step "smoke: find harness" bun scripts/harness/smoke-find-harness.ts
  full_tmux_step "smoke: mode coherence" bash scripts/smoke-mode-coherence.sh
  step "smoke: mode coherence harness" bun scripts/harness/smoke-mode-coherence-harness.ts
  full_tmux_step "smoke: shortcut-help" bash scripts/smoke-shortcut-help.sh
  full_tmux_step "smoke: word-delete" bash scripts/smoke-word-delete.sh
  step "smoke: word-delete harness" bun scripts/harness/smoke-word-delete-harness.ts
  full_tmux_step "smoke: quick-open"  bash scripts/smoke-quickopen.sh
  full_tmux_step "smoke: open-project" bash scripts/smoke-openproject.sh
  full_tmux_step "smoke: search-mouse" bash scripts/smoke-search-mouse.sh
  full_tmux_step "smoke: gutter-diff" bash scripts/smoke-gutter-diff.sh
  full_tmux_step "smoke: diff-overview" bash scripts/smoke-diff-overview.sh
  full_tmux_step "smoke: markdown"     bash scripts/smoke-markdown.sh
  # Guarded inside the script: SKIPs cleanly (exit 0) when typescript-language-server is absent.
  full_tmux_step "smoke: goto-definition" bash scripts/smoke-goto-definition.sh
  full_tmux_step "smoke: navigation-history" bash scripts/smoke-navigation-history.sh
  full_tmux_step "smoke: hover" bash scripts/smoke-hover.sh
  full_tmux_step "smoke: diagnostics" bash scripts/smoke-diagnostics.sh
  full_tmux_step "smoke: image-preview" bash scripts/smoke-image-preview.sh
  full_tmux_step "smoke: pixel-preview" bash scripts/smoke-pixel-preview.sh
  full_tmux_step "smoke: agent"       bash scripts/smoke-agent.sh
  full_tmux_step "smoke: agent-pane-ux" bash scripts/smoke-agent-pane-ux.sh
  full_tmux_step "smoke: agent-permissions" bash scripts/smoke-agent-permissions.sh
  full_tmux_step "smoke: agent-engine-switch" bash scripts/smoke-agent-engine-switch.sh
  full_tmux_step "smoke: agent-search" bash scripts/smoke-agent-search.sh
  # Bracketed paste (clipboard / Hex dictation): a framed \e[200~…\e[201~ burst lands in the editor
  # (single + multi-line), the terminal PTY, and the agent composer — the paste-event routing fix.
  full_tmux_step "smoke: paste"       bash scripts/smoke-paste.sh
  step "smoke: paste harness" bun scripts/harness/smoke-paste-harness.ts
  # Audio narration (third projection): drives an agent turn with narration OFF (silent) then ON (speaks
  # the completed turn through the mock TTS backend), plus barge-in. No audio in CI (INVAR_TTS_BACKEND=mock).
  full_tmux_step "smoke: audio-narration" bash scripts/smoke-audio-narration.sh
  # Voice picker + mouse-editable settings: seeded voices dir → dynamic-enum picker (keyboard + mouse),
  # rate stepper, boolean toggle, Test-Voice command. No audio (mock TTS).
  full_tmux_step "smoke: voice-picker" bash scripts/smoke-voice-picker.sh
  # Bottom-panel SPLIT (experiment-panel-split): drives F9 to split the panel into two side-by-side
  # cells and asserts independent sub-region render, per-cell focus routing, divider re-flow, un-split.
  full_tmux_step "smoke: activitybar" bash scripts/smoke-activitybar.sh
  full_tmux_step "smoke: panel-split" bash scripts/smoke-panel-split.sh
  # invariant: Shared seam changes verify every consumer (scripts/harness/harness.invariants.md)
  # PTY byte-harness wave 2 ports. These are additive: every tmux original above remains registered as
  # the independent terminal-emulator verification ring.
  step "smoke: git-blame harness" bun scripts/harness/smoke-git-blame-harness.ts
  step "smoke: git-log harness" bun scripts/harness/smoke-git-log-harness.ts
  step "smoke: git-watch harness" bun scripts/harness/smoke-git-watch-harness.ts
  step "smoke: gutter-diff harness" bun scripts/harness/smoke-gutter-diff-harness.ts
  step "smoke: diff-overview harness" bun scripts/harness/smoke-diff-overview-harness.ts
  step "smoke: tree-scroll harness" bun scripts/harness/smoke-tree-scroll-harness.ts
  step "smoke: quick-open harness" bun scripts/harness/smoke-quickopen-harness.ts
  step "smoke: navigation-history harness" bun scripts/harness/smoke-navigation-history-harness.ts
  step "smoke: open-project harness" bun scripts/harness/smoke-openproject-harness.ts
  step "smoke: activitybar harness" bun scripts/harness/smoke-activitybar-harness.ts
  step "smoke: panel-split harness" bun scripts/harness/smoke-panel-split-harness.ts
  # wave 3
  step "smoke: agent harness" bun scripts/harness/smoke-agent-harness.ts
  step "smoke: agent-pane-ux harness" bun scripts/harness/smoke-agent-pane-ux-harness.ts
  step "smoke: agent-engine-switch harness" bun scripts/harness/smoke-agent-engine-switch-harness.ts
  step "smoke: agent-permissions harness" bun scripts/harness/smoke-agent-permissions-harness.ts
  step "smoke: agent-search harness" bun scripts/harness/smoke-agent-search-harness.ts
  step "smoke: audio-narration harness" bun scripts/harness/smoke-audio-narration-harness.ts
  step "smoke: voice-picker harness" bun scripts/harness/smoke-voice-picker-harness.ts
  step "smoke: diagnostics harness" bun scripts/harness/smoke-diagnostics-harness.ts
  step "smoke: goto-definition harness" bun scripts/harness/smoke-goto-definition-harness.ts
  step "smoke: hover harness" bun scripts/harness/smoke-hover-harness.ts
  # 5) The REAL settings applied-effect drives (every schema field, not just the --meta enumeration).
  # diffSplitRatio is driven in smoke-diff-overview above through a real divider drag + second open.
  full_tmux_step "settings applied-effect (all schema fields driven)" bash scripts/smoke-settings-applied.sh
  # wave 4
  step "smoke: terminal harness" bun scripts/harness/smoke-terminal-harness.ts
  step "smoke: terminal stage harness" bun scripts/harness/smoke-terminal-stage-harness.ts
  full_tmux_step "smoke: terminal"    bash scripts/smoke-terminal.sh
  step "smoke: image-preview harness" bun scripts/harness/smoke-image-preview-harness.ts
  step "smoke: pixel-preview harness" bun scripts/harness/smoke-pixel-preview-harness.ts
  step "smoke: markdown harness" bun scripts/harness/smoke-markdown-harness.ts
  step "smoke: settings-applied harness" bun scripts/harness/smoke-settings-applied-harness.ts
  step "smoke: shortcut-help harness" bun scripts/harness/smoke-shortcut-help-harness.ts
  step "smoke: search-mouse harness" bun scripts/harness/smoke-search-mouse-harness.ts
  # 6) Perf baselines — SOFT: memory/CPU/latency are measured + REPORTED so a regression surfaces in
  #    the gate (it was previously unwired = a perf regression could ship). Non-blocking: the numbers
  #    are informational and the load-bearing idle-quiescence invariant is hard-gated above. Slow
  #    (idle-hold + lifecycle) — SKIP_PERF=1 to skip for fast local iteration.
  if [ "${SKIP_PERF:-0}" != "1" ]; then
    soft_step "perf-baselines (memory/CPU/latency)" bash scripts/perf-baselines.sh
  else
    echo "== merge-gate: (SKIP_PERF=1) skipped perf-baselines =="
  fi
else
  echo "== merge-gate: (FAST) skipped the multi-launch smokes + real settings drives =="
fi

if [ "${FULL_TMUX_SKIPPED:-0}" -gt 0 ]; then
  echo "== merge-gate: $FULL_TMUX_SKIPPED tmux audit smokes not run (INVAR_FULL_TMUX=1 runs them) =="
fi

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

# READY — 553 iv-harness semantic graph (M1)

## In plain words

The system that builds the app now has its own queryable map. One
command answers "how many tasks, which gates, which worktrees are
dirty, is the watcher alive" from the real files, so the answer cannot
be stale. It works on any repo via --root.

## Delivered

- iv-harness/ as its own app: src/modules/{tasks,gates,lanes,fleet,graph},
  ivue grammar (Static capabilities, Reactive HarnessGraph root,
  namespace exports). 858 insertions, zero app imports.
- CLI: get <path> / ls [<path>] / --self-test; misses print addressable
  keys (GraphChannel semantics). Overrides: --root, --gates, --heartbeat.
- iv-harness/iv-harness.invariants.md: 1 reality + 3 chosen records,
  checker PASS, annotations placed, coverage exemption recorded.
- Both-arms self-test: 14 checks green (planted fixture seen; wrong
  path loud; empty root reads empty, not error).
- Instrument row in project.tools.md.

## Invariants in scope (answered)

- project.invariants.md greenfield floor: upheld — new leaf directory,
  no forbidden capability, file grammar clean (check-file-grammar PASS,
  0 module-level variables), tsc strict 0 errors.
- NEW iv-harness.invariants.md: written; all four records verified
  against the code they govern.

## Verification

- bun iv-harness/cli.ts --self-test → SELF-TEST GREEN (14/14).
- Driven against the live repo: tasks.counts, tasks.byNumber.553,
  gates.last, lanes.fleet, fleet.heartbeat, miss path, ls — all correct.
- First real catch: fleet.heartbeat.exists=false after the Aug 14
  reboot (fleet-watch Monitor dead, /tmp wiped) — true reading;
  Monitor re-armed.
- Gate r1: red on markdown CJK assertion — solo-green at base AND on
  branch; filed #554 (first sighting). Gate r2: red on diff-overview —
  pre-existing flake #549 (filed 2026-08-11, before this branch),
  third sighting appended; solo-green in this worktree. Both reds
  classified pre-existing/load-class with both-arms evidence; diff
  touches no app or smoke code.

## Bycatch

- fleet-watch Monitor + gates registry die on reboot with no
  detection: the sweep read "fresh" from memory until the graph read
  disk. Mitigation shipped in-task (graph reads truth); consider a
  boot-time re-arm note in the conductor skill (deferred, small).

## Instrument feedback

EASY: ivue Static classes as capability wrappers fit exactly.
MISSING: nothing for M1; M2 wants fs-watch (keyed version signals),
M3 wants dispatch/land wrapping per the ladder.

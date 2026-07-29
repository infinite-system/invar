# 297 — the dispatch-copied TASK.md breaks every relative link (recurring checker red)

State: ACTIVE
Created: 2026-07-29
Engine: codex
Environment: linux
Model: 5.6-sol
Effort: low
Priority: fleet-toil (recurred 4x on 2026-07-29: #280, #284, #293, #281)

## Outline

dispatch.sh copies the brief to the worktree root as TASK.md. The
brief's links are task-folder-relative, so from the root every one is
dead; the invariant checker (--refs) reds on entry and each builder
burns a round-trip correcting the ignored local copy — four times
today.

Fix at the generator, pick the smaller honest shape:

(a) TASK.md becomes a POINTER file: two lines naming the in-worktree
    task folder path + brief filename; links live in their home and
    resolve. Kills the class outright.
(b) Or rewrite links at copy time (lint-task-links knows the bases).

Self-test both polarities: a fresh dispatch's worktree passes the
checker with 0 problems on entry; a deliberately broken brief link
still refuses at the dispatch lint (the existing guard must not be
weakened).

## Invariants in scope

- The dispatch guard chain (brief lint, record-first cut); the
  lint-task-links self-test contract.

## Bycatch expected

Per AGENTS.md's taxonomy. The READY report carries `## Bycatch` even if
it reads `None observed`.

## Sources

- #280/#281/#284/#293 reports' bycatch sections (the same item four
  times).

## Evidence from #295 (2026-07-29)

The worktree-root TASK.md dispatched for #295 carried a contract link
relative to the external task folder; the invariant checker rejected it and
the builder hand-corrected the local copy. Third confirmed instance of the
dispatch TASK.md pointer defect this record owns.
- 2026-07-29 #296: worktree task-record copy carried a task-folder-relative
  contract path resolving outside the repo + missing anchor; builder fixed
  the local copy. 4th instance.

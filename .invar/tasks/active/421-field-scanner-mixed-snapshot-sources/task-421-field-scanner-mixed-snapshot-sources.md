# Task 421 — Field scanner: current snapshot mixes working tree and HEAD

Priority: architecture-hygiene
State: ACTIVE
Engine: codex
Environment: linux
Model: 5.6-sol
Effort: high

## Evidence (#419 bycatch, builder-observed live)

Contract TEXT for the current snapshot reads the working tree
(currentTrackedFiles) while annotations/file-tree/evidence resolve
against HEAD (git grep/ls-tree <commit>) — RepositoryHistory.ts
buildSnapshot. With uncommitted contract edits the sources disagree:
the builder's new contract showed in the field with zero annotations
and unresolved evidence until committed. Fix: one source per snapshot
(both from HEAD, or both from the tree, stated explicitly).

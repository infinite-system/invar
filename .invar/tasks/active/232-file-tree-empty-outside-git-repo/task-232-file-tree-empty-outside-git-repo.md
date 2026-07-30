# 232 — the file tree shows nothing for a folder that is not a git repository

State: ACTIVE
Created: 2026-07-29
Engine: codex
Environment: linux
Model: 5.6-sol
Effort: medium
Priority: verification-integrity

## Outline

Bycatch of #220, reproduced every time:
`mkdir /tmp/x && touch /tmp/x/a.ts && bun run drive --open /tmp/x` — the Files
pane shows NOTHING while the app publishes
`gitError="fatal: not a git repository"`. `git init` in the same directory
makes the tree populate immediately.

Two defects, same shape as #216's empty-complete enumeration:

1. A directory listing has no reason to need a repository. The tree should
   list the directory; git status decorates it, it does not gate it.
2. The failure is invisible: an empty pane reads as an empty folder. Whatever
   degrades must SAY so, per *File enumeration failures stay visible*.

Related history: #201 fixed Quick Open's silent emptiness for non-git folders
(the user's own 500k workspace was one). This is the same user scenario hitting
the TREE — check whether #201's fix has a generator the tree should share
instead of a second implementation (distillation question, convention 2).

## Invariants in scope

- *File enumeration failures stay visible* — `src/modules/search/` records
  (the #216 fix cites it; find the exact record and reuse its vocabulary).
- [src/modules/filetree/filetree.invariants.md](../../../../src/modules/filetree/filetree.invariants.md) — the tree's own contract;
  expect to add the impossibility "a readable directory never renders as
  empty without a stated reason".

## Bycatch expected

Per [AGENTS.md](../../../../AGENTS.md)'s taxonomy, all seven categories. The READY report carries
`## Bycatch` even if it reads `None observed`.

## Sources

- `report-220-...md` in #220's folder, Bycatch item 3 (exact reproduction).

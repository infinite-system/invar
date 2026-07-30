# Brief #408 round 2 — merge main forward and re-gate

Main landed #404 (panel chrome v2: two-row chrome, window groups —
the panel host, tab bar, and panel workspace state rebuilt, workspace records
updated) and #381 (LSP discovery) after your base. Six files overlap,
and the workspace contract file has a REAL textual conflict.

Merge main into your branch; resolve so BOTH intents hold: #404's
per-workspace panel persistence records AND your six-leak isolation
records in the workspace contract; your geometry scoping must cover the
NEW panel model too (drive an A-B-A on the v2 panel: container tabs,
pinned list width, group selection — if the new model leaks any of it,
that is now YOUR scope since the files are no longer #404's).
Full gate on the combined tree; GATE_EXIT read from the hook; new
report with the merge hash. Worktree clean; no push, no land.

## Invariants in scope

Round-1 set plus the #404-refined panel/workspace records.

## Bycatch expected

Per [AGENTS.md](../../../../AGENTS.md)'s taxonomy; carry the section even when it reads None
observed.

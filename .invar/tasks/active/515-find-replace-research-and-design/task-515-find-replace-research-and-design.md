# Task 515 — RESEARCH: workspace Find/Replace with flyweight undo

Priority: user-directed
Engine: codex
Environment: any
Model: 5.6-sol
Effort: high
State: ACTIVE

## In plain words (user, 2026-08-05)

A Find/Replace module: activity bar slot right after File Tree,
search icon; find across the whole workspace; replace and UNDO
replace; warn before mass operations ("your undo is about to undo 20
items"); surgical — never store whole prior file state; flyweight
undo history across many files; warn when a file changed mid-flight
so a replacement or undo might be wrong.

## The design directions to research (conductor's priors; verify or refute)

1. Reverse-patch transactions: per match (file, span, inserted,
   removed); undo/redo = patch application; extends the established
   "Undo records deltas not whole-document snapshots" record.
2. Verification at every stage: context hash per match at find time;
   re-verify at replace; verify inserted text at undo; mismatches
   become per-item DRIFTED (skipped + reported) — the mid-flight
   warning is this mechanism, not a bolt-on.
3. Consent with counts both directions (replace AND undo), naming
   drifted items before proceeding.
4. Open-buffer matches route through the document model (coherence
   with per-editor undo is THE design corner — study how VS Code and
   JetBrains split this, and what our buffers/undo seams allow);
   closed files patch on disk under the transaction log.
5. Engine: ripgrep through Processes (launch policy); enumerate the
   existing search/QuickOpen machinery for reuse.

## Deliverables

A design doc (repo root, project-find-replace-design named file) +
integration census (which existing seams serve: activity bar
contribution, pane registration, buffers, undo, Processes) + the
proposed invariant records (flyweight-undo, verification, consent)
as PROPOSALS + a milestone split for implementation. No
implementation beyond throwaway probes.

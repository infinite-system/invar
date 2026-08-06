# Task 515 — RESEARCH: workspace Find/Replace with flyweight undo

Priority: user-directed
Engine: codex
Environment: any
Model: 5.6-sol
Effort: high
State: IN-PROGRESS

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

## VS Code parity study (user addition, same session)

Research how VS Code implements workspace search/replace — from its
docs (code.visualstudio.com codebase-wide search pages, which carry
screenshots) and its architecture notes: it also drives ripgrep. The
design doc must enumerate its surface and judge each element for
Invar:
- Query toggles: match case (Aa), whole word (ab), regex (.*) — all
  three wanted here.
- files-to-include / files-to-exclude glob fields + the "use default
  excludes" toggle (our equivalent: workspace ignores + .gitignore).
- Results tree grouped by file, match counts, inline replace PREVIEW
  (old -> new shown per match before committing), dismiss-per-match.
- Replace-all confirmation modal with counts (ours adds the undo-side
  consent + drift reporting).
Screenshot-derived layout notes are welcome in the doc (describe;
do not embed binaries in the repo).

## Dialog discipline (user addition, same session)

All consent surfaces (replace-all, undo-with-counts, drift warnings)
use the PROPER overlay dialog family — the same component and styling
as the existing close/quit confirmation dialog — never inline y/N
text prompts. Buttons carry the established 1-key padding. The design
doc names the shared dialog component it reuses (overlay-dialog seam;
Input overlays share one modal slot) and shows the consent copy for
each dialog.

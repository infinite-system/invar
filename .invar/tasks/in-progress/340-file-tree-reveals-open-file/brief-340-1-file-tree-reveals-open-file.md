# Brief #340 round 1 — file tree reveals the open file

Read [AGENTS.md](../../../../AGENTS.md) fully before any work. Load
[.claude/skills/ibr/IBR.md](../../../../.claude/skills/ibr/IBR.md) and the
ivue skill before touching src/modules/**. The task file in this folder is
part of this brief — its numbered requests and boundaries bind.

Approach:

1. Reproduce the current behavior by DRIVING first: open files via quick
   open, goto-definition, and tree click; observe what the tree does today.
2. Find the one seam where "a document became active" is published (the
   workspace/editor active-document change) and subscribe the tree reveal
   there — not per-opener call sites. Reveal = expand ancestors, scroll the
   row into view through the tree's existing scroll authority
   (adopt-and-stop, one writer per regime), select the row, never steal
   editor focus.
3. Setting `fileTreeRevealOpenFile` (default true) through the settings
   descriptor family like its siblings; the settings panel shows it.
4. Header-button row under the Files line: the circled-dot reveal-now
   button, laid out as a ROW so #341 adds siblings without rework. Mouse
   hit-testing through the existing geometry model.
5. Verify by driving small and large (use the shared scale fixtures for a
   deep tree). Extend the tree or layout smoke with assertions: open via
   quick-open reveals + selects; setting off suppresses; button reveals on
   demand. Positive control per new assertion: plant, quote the red, remove.
6. Final pass: relevant smokes + `bunx tsc --noEmit; echo TSC=$?` +
   `node .claude/skills/invariants/scripts/check_invariants.mjs --all --refs`.

Do not run scripts/merge-gate.sh. Commit in your worktree; no push, merge,
tag. Write your READY report as `report-340-<slug>.md` (this task's slug) in
this folder. END STATE: that report exists here.

## Invariants in scope

- [filetree.invariants.md](../../../../src/modules/filetree/filetree.invariants.md)
  — read all records; report each implicated one.
- Scroll contract [scroll.invariants.md](../../../../src/modules/ui/scroll.invariants.md):
  "One generator owns each scroll position" — reveal scrolls through the
  existing authority, halting any live regime first.
- Settings family records if any govern descriptor registration.
- Report record by record: upheld, violated, or needs refinement. Name any
  record this list MISSED.

## Bycatch expected

Report per [AGENTS.md](../../../../AGENTS.md)'s bycatch taxonomy. Include
the section even when it reads "None observed".

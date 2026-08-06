# 526 — consent dialog name drift

Priority: architecture-hygiene
State: ACTIVE
Engine: claude
Environment: linux
Model: fable-5
Effort: low

## In plain words

The shared confirmation dialog is still named after its first job,
quitting. It now also serves Replace All, undo, and redo. Rename it so
the name says what it is.

## Evidence (from #521 bycatch, 2026-08-06)

- `quitConfirmation` names the shared dialog model and overlay slot in
  Bootstrap.ts, RootView.ts, and OverlayLayer.ts, which now serve quit,
  Replace All, undo, and redo consent.

## Outline

One rename sweep (grep both the identifier and any doc/annotation
references; ship atomically with all references per the rename-ripple
rule). Candidate name: consentDialog / confirmationDialog — builder
proposes, conductor confirms before applying.

# READY — #526 (consent-dialog-name-drift)

Branch `fleet/526-consent-dialog-name-drift`, commit `e2142582`.

## In plain words

The app has one shared question box. It asks before quit, before Replace
All, and before undo or redo of a Replace All. Its name in the code was
still "quitConfirmation", from when quit was its only job. I renamed it to
"consentDialog" everywhere in one commit: the code, the published status
words, the tests, and the smokes. The box looks and behaves exactly the
same. I drove it live to confirm.

## What changed

One atomic rename, commit `e2142582`, 11 files:

- `quitConfirmation` -> `consentDialog` for the Dialog port in
  `src/modules/app/Bootstrap.ts`, `src/modules/ui/RootView.ts`,
  `src/modules/ui/OverlayLayer.ts`, `src/modules/ui/OverlayCoordinator.ts`.
- The overlay slot KEY in `OverlayCoordinator.ts` (the union member and the
  registered slot) and the openExclusiveOverlay call in `Bootstrap.ts`.
- The published status STRINGS and field prefixes in
  `src/modules/app/AppStatusProjection.ts`: `inputOverlay` /
  `openInputOverlays` now emit `'consentDialog'`, and the snapshot fields
  are `consentDialogOpen`, `consentDialogFocusedChoice`,
  `consentDialogIdentifier`, `consentDialogTitle`, `consentDialogMessage`.
- Compound identifiers followed: `ConsentDialogButtonZone`,
  `previousConsentDialogOpen`, `paintConsentDialogSelection`, and the
  published bounds / scroll / content-metrics keys.
- The kebab renderable ids in `OverlayLayer.ts`: `'quit-confirmation'` ->
  `'consent-dialog'`, `'quit-confirmation-text'` -> `'consent-dialog-text'`
  (same dialog, one name, coherence).
- Tests: `AppStatusProjection.test.ts`, `OverlayCoordinator.test.ts`.
- Smokes: `smoke-quit-confirmation-harness.ts` (FILENAME kept per the
  brief, internal keys renamed), `smoke-workspace-search-harness.ts`
  (graph path `consentDialog.open`), `smoke-search-mouse-harness.ts`,
  `smoke-panel-split-harness.ts`.

## The bar, checked

- `grep -rn quitConfirmation` (and `QuitConfirmation`) over `src/`,
  `scripts/`, `.claude/`, and root `*.md`: ZERO live matches. One
  deliberate exception, reported below under Bycatch: a historical entry
  in [project.coverage-deltas.md](../../../../project.coverage-deltas.md)
  names the long-deleted file
  `src/modules/ui/QuitConfirmation.test.ts`. That ledger records what a
  past change did. Rewriting it would falsify history, so I left it. Flag
  severity, conductor's call.
- No external consumer waits on the old string: the checkout-wide grep is
  the proof, and the workspace-search smoke (the one graph consumer)
  passed on the new path.
- `bunx tsc --noEmit`: clean.
- `bun test`: 2522 pass, 0 fail (re-run after the pre-commit prettier
  pass).
- Smokes, all ALL-PASS: smoke-quit-confirmation, smoke-workspace-search,
  smoke-panel-split, smoke-search-mouse.
- Invariants checker `--all --refs`: 1440 annotations resolved, 287
  lattice links resolved, 0 problems. Coverage notes are pre-existing.

## Driven verification

The four smokes are the deep adversarial pass for this surface. They
drive, at small and 100,000-line scale: quit chord opens the dialog with
No focused, No / Escape / outside click / second chord dismiss, Yes exits,
dirty-buffer survival, Replace All consent (identifier
`replace-all-in-file`), its dismissal leaving the file intact, Yes
replacing, and undo / redo consent (`undo-replace-all-in-file`,
`redo-replace-all-in-file`) — every step asserting the renamed status
fields, so the rename itself is what they exercise.

I also drove it live through the warm drive server with my own hand:
opened a scratch file, Ctrl+F, typed the needle, Ctrl+Shift+Enter. Saw
`inputOverlay = "consentDialog"`, `openInputOverlays = ["consentDialog"]`,
`consentDialogIdentifier = "replace-all-in-file"`, No focused. Escape
dismissed it (file intact). Re-triggered, Left to Yes, Enter: both matches
replaced, the third line untouched, dialog closed. Same dialog, same
behavior, new name end to end.

One live-drive note so the conductor does not chase it: Ctrl+Q under the
drive server exits instantly WITHOUT the dialog. That is the declared
harness bypass (`INVAR_HARNESS_DIRECT_QUIT=1` in
`scripts/harness/PtyTestDriver.ts`, annotated with "Harness teardown
bypasses product quit confirmation only when declared"), not a regression.
The quit-confirmation smoke overrides the bypass and proves the dialog
path.

## Invariants in scope

- "Input overlays share one modal slot"
  ([ui.invariants.md](../../../../src/modules/ui/ui.invariants.md)):
  HOLDS. The renamed slot is the same slot in the same coordinator; only
  its key string changed. No record names the `quitConfirmation` slot
  key, so no record refinement was needed (checked
  [ui.invariants.md](../../../../src/modules/ui/ui.invariants.md) and
  [app.invariants.md](../../../../src/modules/app/app.invariants.md);
  "Quit requires explicit confirmation" describes
  the behavior and cites the smoke by its kept filename).

## Bycatch

- Historical ledger match:
  [project.coverage-deltas.md](../../../../project.coverage-deltas.md) line 154 names
  `src/modules/ui/QuitConfirmation.test.ts`, a file replaced by
  `Dialog.test.ts` long before this task. It is the only
  `quitConfirmation`-family match left in the checkout. I did not edit it:
  the ledger records a past state, and rewriting it would falsify the
  record. If the conductor wants the zero-bar literal, the edit is one
  line. Flag severity.
- Drive-server ergonomics (instrument feedback, MISSING-shaped): a bare
  `--serve` with no `--open` boots to a blank, never-quiescent screen
  (frame stuck at 3-4, `renderQuiescent` never true), and my first probes
  burned time against it. Reproduced twice. Serving with `--open DIR`
  behaves normally. Suspect the no-workspace boot path, pre-existing, not
  touched by this task.
- None observed for: invariant violated in function, comment drift,
  distillation, generator drift, plain nonsense, contract-layer gaps.

## Tree state

Clean except the dispatch-provided untracked builder-fundamentals and
task-brief companion files in the worktree root, which I did not create
and did not remove.
Scratch workspaces under `/tmp/consent-drive*` remain (my `rm` was
denied by the sandbox); they are three tiny directories under
recognizable names.

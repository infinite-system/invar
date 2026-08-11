# Brief 526-1 — rename quitConfirmation to consentDialog

## In plain words

The shared confirmation dialog is named quitConfirmation everywhere,
but it now serves quit, Replace All, undo, and redo consent. The user
chose the name: consentDialog. Rename the identifier and its overlay
key and status value atomically across every reference.

## The name (user-confirmed)

`quitConfirmation` -> `consentDialog`. This is decided — do not propose
alternatives. Apply it to:
- the dialog model / port identifier (Bootstrap, RootView, OverlayLayer,
  OverlayCoordinator);
- the overlay slot KEY and the published status value (AppStatusProjection
  emits `'quitConfirmation'` as inputOverlay / openInputOverlays — those
  STRING values become `'consentDialog'`);
- every test that asserts the old string;
- the smokes that open it by key (smoke-workspace-search, smoke-quit-
  confirmation, smoke-panel-split, and any other).

## The bar (rename-ripple rule)

- GREP the whole checkout for `quitConfirmation` (identifier AND string
  literal AND any doc/annotation) and change every reference in ONE
  commit — a half-applied rename leaves detectable orphans.
- After applying, `grep -rn quitConfirmation` over src/ scripts/ .claude/
  and *.md must return ZERO.
- The published status STRING changes: `inputOverlay: 'quitConfirmation'`
  -> `'consentDialog'`. Confirm no external consumer (a smoke, the graph)
  still waits on the old string.
- `bun test` + the overlay/quit/search smokes green.
- Keep smoke-quit-confirmation-harness.ts's FILENAME (it is the quit
  behavior's smoke, still valid) — only its internal `quitConfirmation`
  key references change.

## The deliverable, twice

CODE: the atomic rename above.
VISUAL: none (identifier + status-string rename; dialog behaves
identically — conductor drives quit + Replace All consent to confirm no
regression).

## Invariants in scope

- "Input overlays share one modal slot"
  ([ui.invariants.md](../../../../src/modules/ui/ui.invariants.md)) — the
  renamed slot is the same slot; answer that it holds. If any record
  NAMES the quitConfirmation slot, refine the name in the same change.

## Bycatch expected

Report per the taxonomy in [AGENTS.md](../../../../AGENTS.md), even when
None observed.

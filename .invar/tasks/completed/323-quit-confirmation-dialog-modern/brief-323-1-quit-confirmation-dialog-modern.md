# Brief — #323: quit confirmation dialog (Ctrl+Q/Cmd+Q, modern, Invar-titled)

USER-DIRECTED. Read first:
[task-323-quit-confirmation-dialog-modern.md](task-323-quit-confirmation-dialog-modern.md)
— his verbatim words GOVERN; the record's design section is the work.

## Work discipline

- ONE COMMIT (`ui: <summary> (#323)`), full gate through the enforcing
  hook, NO SKIP_GATE product commits.
- Build ON the shared overlay-dialog machinery (#303 landed
  content-based width + margins — one dialog generator, no bespoke
  popup) and the #316 shared close glyph token (never a literal x).
  #318's rounded-corner vocabulary applies if the dialog chrome uses
  the code-frame generator — derive, don't copy.
- Record the decided semantics for: Ctrl+Q while open (recommend
  dismiss — double-tap never quits), outside click (recommend
  dismiss), Esc = No. Each decision stated in the contract.
- Both polarities everywhere: dialog present after Ctrl+Q AND absent
  after each dismiss path; quit actually exits (PTY session ends
  cleanly) on Yes; focus state visible and driven by keyboard
  Left/Right/Tab + Enter; mouse click each target; both glyph tiers;
  both themes; both scales.
- The quit path must remain intact for machine drives that need
  clean exit — check how existing smokes quit the app and keep their
  path working (a confirmation that breaks 60 smokes' teardown is a
  regression; the harness may need a bypass setting — decide, record,
  positive-control it).

## Invariants in scope

overlay-dialog records (#303), glyph vocabulary (#316), app lifecycle/
quit records, harness teardown conventions.

## Bycatch expected

Per [AGENTS.md](../../../../AGENTS.md)'s taxonomy; `## Bycatch` even if
`None observed`.

## End state (mechanical)

READY report: per-path evidence (frames quoted), teardown decision +
control, commit hash, GATE_EXIT=0 through the hook. Conductor lands.

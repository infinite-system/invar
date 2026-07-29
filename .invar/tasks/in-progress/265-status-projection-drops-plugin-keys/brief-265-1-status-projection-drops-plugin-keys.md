# Brief — #265: decide and document — plugin status keys on uninstall: absent or false?

Read first: [task-265-uninstalling-plugin-status-keys.md](task-265-status-projection-drops-plugin-keys.md)
— the record governs. Small decide-and-document task, verification-
integrity class, bycatch of #237 observed twice.

The tension: after disabling the markdown plugin, `markdownPreviewOpen`
reads `undefined` though `MarkdownPreview.close()` publishes `false`.
#220's uninstall-symmetry law says ABSENT-not-stale is correct — but two
smokes have now had to learn `!== true` by surprise.

Arms:

1. **Decide from the invariants, not preference**: reconcile the
   StatusChannel/status-projection records with #220's absent-not-stale
   record. If absent-on-uninstall is the contract, STATE it in the
   StatusChannel record (one line). If not intended, fix the projection
   rebuild instead.
2. **Sweep the smokes** for plugin-key assertions, BOTH polarities:
   `=== false` asserts that silently pass when the key vanishes AND
   `!== true` habits that would wrongly pass on a stale `true`. Fix the
   ones that lie; list the census in the report.
3. **Positive control**: a planted stale key (or planted dropped key,
   per your decision) must turn the relevant contract red.

Real defaults, driven evidence, no timeout changes.

## Invariants in scope

The StatusChannel/status-projection records and #220's
uninstall-symmetry record in
[ui.invariants.md](../../../../src/modules/ui/ui.invariants.md) (or the
records' actual home — locate, don't assume).

## Bycatch expected

Per [AGENTS.md](../../../../AGENTS.md)'s taxonomy. The READY report
carries `## Bycatch` even if it reads `None observed`.

## End state (mechanical)

READY report: the decision with its invariant reconciliation, the
recorded contract line, the smoke census (both polarities) with fixes,
positive control quoted, green `bun test` + affected smokes. The
conductor gates at landing.

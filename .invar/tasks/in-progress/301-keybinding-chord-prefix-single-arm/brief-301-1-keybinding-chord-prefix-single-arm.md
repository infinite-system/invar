# Brief — #301: chord prefix arms EVERY registered continuation

Read first:
[task-301-keybinding-chord-prefix-single-arm.md](task-301-keybinding-chord-prefix-single-arm.md)
— correctness-latent, unit-reproduced bycatch of #267. The record's
outline GOVERNS.

## Work discipline

- ONE COMMIT (`keybindings: <summary> (#301)`), full gate through the
  enforcing hook, NO SKIP_GATE product commits.
- Fix at the RESOLVER seam: a chord prefix opens a PENDING state that
  accepts every registered continuation, not just the first
  registrant's. Do not fix per-binding or per-registration order.
- Reproduce FIRST: restore the #267 experiment (Ctrl+K Ctrl+G alongside
  Ctrl+K [) as a failing test, quote the red, then fix, then that test
  becomes the PERMANENT regression case.
- Both polarities: two bindings sharing a prefix BOTH fire (each
  continuation individually driven); an unmatched continuation cancels
  cleanly — locate the current cancel/type-through contract and follow
  it (quote where it lives; if none exists, that is a seam finding for
  the report).
- Check the reserved-chord records (#194) — the reserved-chord smoke
  must stay green; if the resolver change touches its seam, extend the
  contract, do not weaken it.
- Real PTY evidence: drive both continuations of a shared prefix in a
  live session; both scales.

## Invariants in scope

keybinding/chord records, reserved-chord records (#194),
KeybindingDefaults.test.ts.

## Bycatch expected

Per [AGENTS.md](../../../../AGENTS.md)'s taxonomy. The READY report
carries `## Bycatch` even if it reads `None observed`.

## End state (mechanical)

READY report: red-then-green regression quoted, both-polarity evidence,
commit hash, GATE_EXIT=0 through the enforcing hook. The conductor
gates at landing and completes the record.

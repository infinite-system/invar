# 301 — KeybindingRegistry arms only the first binding sharing a chord prefix

State: COMPLETED — 2eab05ae — chord resolver arms every shared-prefix continuation; #267 experiment is the permanent regression
Created: 2026-07-29
Engine: codex
Environment: linux
Model: 5.6-sol
Effort: high
Priority: correctness-latent (bycatch of #267, unit-reproduced)

## Outline

#267 discovered: KeybindingRegistry.resolve can arm only the FIRST
binding with a shared chord prefix — adding a temporary `Ctrl+K Ctrl+G`
made the existing `Ctrl+K [` fold binding fail its test. Reproduced in
KeybindingDefaults.test.ts once; the experiment was removed (go-to-line
ships as Alt+G), so the defect is latent until the next chord family
grows.

Fix at the resolver: a chord prefix opens a PENDING state that accepts
EVERY registered continuation, not just the first registrant. Both
polarities: two bindings sharing a prefix both fire; an unmatched
continuation cancels cleanly (and types through if that is the current
contract — locate it). Regression: the #267 experiment (Ctrl+K Ctrl+G
alongside Ctrl+K [) becomes the permanent test case.

## Invariants in scope

- The keybinding/chord records; the reserved-chord records (#194).

## Bycatch expected

Per AGENTS.md's taxonomy. The READY report carries `## Bycatch` even if
it reads `None observed`.

## Sources

- #267 report bycatch; KeybindingDefaults.test.ts reproduction.

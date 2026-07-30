# 283 — upgrade Vue to 3.6 RC-2 (alien signals)

State: ACTIVE
Created: 2026-07-29
Engine: codex
Environment: linux
Model: 5.6-sol
Effort: high
Priority: USER-DIRECTED (2026-07-29 10:5x — "keep up with latest alien
signals"; expectation: marginal difference)

## Outline

Upgrade the vendored/declared Vue reactivity to 3.6 RC-2 (the
alien-signals-based core). ivue rides @vue/reactivity — the app's entire
derivation graph runs on it, so this is a substrate swap: expected
marginal, verified exhaustively.

Method:
1. Record the CURRENT version and the exact packages that move
   (@vue/reactivity and friends; check how ivue pins them).
2. Upgrade to 3.6 RC-2 in the worktree; note every API/behavior change
   the changelog names for the reactivity core (effect scheduling,
   computed invalidation timing — alien signals changed propagation
   internals; ANY timing-sensitive test is the risk surface).
3. Full verification is the point of the task: bun test, tsc, ALL
   smokes via the full merge-gate, plus a DRIVEN pass of the heavy
   reactive surfaces (editor typing at 100k lines, structure pane
   depth/filter, tasks pane cycling, markdown split editing) comparing
   settled frames against pre-upgrade baselines.
4. Perf snapshot before/after (the gate's timing lines + the drive's
   settle times) — alien signals should be equal-or-faster; a regression
   is a finding, not a fail, but must be QUOTED.
5. If RC-2 breaks something structurally (ivue integration seam), report
   the exact breakage and STOP rather than patching around the RC —
   pinning back is acceptable; the report then names what blocks the
   upgrade for the stable release.

## Invariants in scope

- The ivue conventions ([project.ivue-reference.md](../../../../project.ivue-reference.md)); no contract changes
  expected — this is substrate; any record that names reactivity timing
  gets re-verified.

## Bycatch expected

Per [AGENTS.md](../../../../AGENTS.md)'s taxonomy. The READY report carries `## Bycatch` even if it
reads `None observed`.

## Sources

- User message 2026-07-29 10:5x.

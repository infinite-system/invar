# 250 — the isolated HOME/XDG directory shape lives in two languages with no shared generator

State: ACTIVE
Created: 2026-07-29
Engine: codex
Environment: linux
Model: 5.6-sol
Effort: medium
Priority: distillation

## Outline

Bycatch of #233. `scripts/behavioral-contracts.sh` and
`scripts/harness/PtyTestDriver.childEnvironment` both enumerate the same
HOME/XDG directory shape (config, data, state, cache) — one policy, two
hand-kept copies across shell and TypeScript. No cross-language generator
exists today.

ANALYSIS FIRST: is a shared generator worth its cost across the language
boundary? Honest options: (a) one small script/module that PRINTS the
directory set and both sides consume it; (b) a conformance test that fails
when the two enumerations diverge (cheaper, keeps both copies but makes
drift loud); (c) recorded shape only, if the copies are two and stable.
Pick the smallest structure that makes silent divergence impossible — the
defect class is a leak that only shows when one side gains a directory the
other lacks.

Done-test: plant a new directory in one side's enumeration; the chosen
mechanism names the divergence before any behavioral run can leak.

## Invariants in scope

- [scripts/harness/harness.invariants.md](../../../../scripts/harness/harness.invariants.md) — the isolated-home record #233
  added; extend rather than duplicate.

## Bycatch expected

Per [AGENTS.md](../../../../AGENTS.md)'s taxonomy, all seven categories. The READY report carries
`## Bycatch` even if it reads `None observed`.

## Sources

- [report-233-wrap-contract-red-settings-leak.md](../../completed/233-wrap-contract-red-settings-leak/report-233-wrap-contract-red-settings-leak.md), Bycatch, distillation
  item.

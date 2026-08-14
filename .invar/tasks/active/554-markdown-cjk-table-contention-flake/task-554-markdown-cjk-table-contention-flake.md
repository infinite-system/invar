# 554 — markdown cjk table contention flake

Priority: flake-evidence
State: ACTIVE
Engine: codex
Environment: linux
Model: 5.6-sol
Effort: high

## In plain words

One markdown check (wide characters lining up in table cells) fails
under a full gate run but passes every time alone. A check that only
fails when the machine is busy is hiding either a timing bug in the
check or a real bug that needs load to appear. Find which.

## Evidence (2026-08-14)

- gate-553 (serial, no other gate, branch = main + new iv-harness/
  directory only — no shared code with markdown): FAIL "ASCII CJK
  emoji and combining-mark rows share table cell boundaries"
  (scripts/harness/smoke-markdown-harness.ts). Log:
  /tmp/merge-gate-failures.6c717759369dd38e.520161.
- Solo at merge base 37b873b9 (user checkout): PASS.
- Solo in the branch worktree: PASS, 0 FAILs in the whole smoke.
- No prior task references this assertion (first recorded sighting).

## The bar

The wait-discipline census questions apply: is the assertion's wait a
condition that can be false-then-true, or a pre-satisfied/absolute-row
read that load perturbs? Drive it under deliberate contention
(the robustness-probe doctrine), find the mechanism, fix the wait or
the product — never widen a timeout.

## Invariants in scope

none known — the builder refutes or confirms.

## Bycatch expected

Report per AGENTS.md taxonomy, even when None observed.

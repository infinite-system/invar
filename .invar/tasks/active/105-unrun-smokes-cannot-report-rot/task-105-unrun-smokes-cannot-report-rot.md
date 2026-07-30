# 105 — about twenty full-tmux smokes the gate skips by default

State: ACTIVE
Created: 2026-07-28
Engine: claude
Environment: linux
Model: fable-5
Effort: medium
Priority: verification-integrity
Assignment note: Class-level: ~20 unrun smokes, three mechanisms in cost order.

## Outline

`scripts/smoke-gutter-diff.sh` sat in the tree asserting the PRESENCE of `▁` as the deleted-line
hint — the exact glyph that both [diff.invariants.md](../../../../src/modules/diff/diff.invariants.md) and [workspace.invariants.md](../../../../src/modules/workspace/workspace.invariants.md) name in their
Impossible-if-true clauses. A sweep updated the harness twin and both records but not this file, and
nothing noticed for a day because the smoke is registered `parallel_safe_full_tmux_smoke`, which the
gate skips unless `INVAR_FULL_TMUX=1`.

The instance was fixed (verified by driving: ALL-PASS on `▎`, and it failed on `▁` beforehand, so the
assertion can still fail). The CLASS is open — about twenty more `*_full_tmux_smoke` registrations sit
in the same position.

**The reduction:** a smoke that never runs is not a contract. It is a file that LOOKS like a contract,
which is worse than no smoke at all, because the coverage count and the invariant's Verification line
both cite it. Three mechanisms in cost order:

1. **Retire the ported duplicates.** The PTY-harness port was completed and user-adopted. Where the
   harness version is a superset — the gutter-diff harness even carries a NEGATIVE assertion that `▁`
   is absent, which the shell one lacks — the shell smoke is dead weight. Retiring needs a
   coverage-ratchet declaration, and per repo rule the file is parked, not deleted.
2. **Make the skip consequential, not just counted.** The gate prints "$FULL_TMUX_SKIPPED tmux audit
   smokes not run". A count is not a consequence. Require every registered smoke either to run in the
   default configuration or to appear in an explicit retired-pending-port list with a reason, so an
   unrun smoke is a declared debt rather than an invisible default.
3. **Cheap mechanical tell** (report-only first). No smoke may assert the PRESENCE of a token that an
   invariant record names in an Impossible-if-true clause. Extract quoted single-glyph literals from
   Impossible-if-true text, extract asserted-present literals from smokes, report the intersection.
   Needs a positive control — plant `▁` back and require the report to name it.

Separate and smaller: `scripts/smoke-agent-search.sh:66` hardcodes `⌕`. That glyph is current so it
passes today, but it is an appearance dependency of the class that re-broke twice during icon work.

## Sources

None. Only the subject line above survives — no brief was written for this task.

## Evidence fold (2026-07-29, #267 + #290)

Legacy scripts/smoke-editor.sh observed red twice today on trees where
the modern editor PTY harness was ALL-PASS (stale wrap/gutter, drag,
wheel, click, gear checks). The gate skips it without INVAR_FULL_TMUX=1
— exactly this task's class: an unrun smoke rots silently and then
reads as signal when someone does run it.

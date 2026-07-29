# 77 — vague records, padding within a file, semantic weakening

State: COMPLETED — holes 1 and 2 landed at 4ab250f; hole 3 carved out to #210
Created: 2026-07-28
Engine: claude
Environment: linux
Model: fable-5
Effort: high

## Outline

The landed ratchet (`scripts/check-coverage-ratchet.ts`) gates DISCLOSURE of assertion loss, not
justification. Three known holes, in cost order.

1. **VAGUE RECORDS** (cheap, do first). An entry in `coverage-deltas.md` satisfies the check by naming
   the file path alone. Require it to state the new counts — `path/to.test.ts — assertions: 6, waits: 10
   (was 7/10) — reason` — and verify the declared numbers against the actual ones. The record then
   cannot be a shrug, it names the magnitude, and a stale record stops passing once the file changes.
2. **PADDING WITHIN A FILE** (cheapest exploit remaining). Delete one real assertion, add one trivial
   one, count unchanged, gate green. A pure count ratchet cannot see this. Partial mitigation: compare
   per-file assertion TEXT sets, not just counts, and REPORT replacements rather than failing —
   legitimate rewrites replace assertions constantly. Report-only first.
3. **SEMANTIC WEAKENING** (expensive, different instrument). `expect(actual).toBe(1)` becomes
   `expect(true).toBe(true)` and the count holds. Only mutation testing catches it: break a source
   invariant deliberately and require some assertion to fail. Scope narrowly — a handful of load-bearing
   modules, run OUTSIDE the merge gate, because a full mutation run is far too slow for a commit gate.
   The valuable form is targeted: for each invariant claiming an impossibility, mutate the line its
   annotation sits on and require a red.

Ordering: 1 is a small edit to an existing checker. 2 is report-only instrumentation. 3 is a genuine
project and should not start while user-requested UI work is unmerged.

## Sources

- [brief-77-1-coverage-ratchet-remaining-holes.md](brief-77-1-coverage-ratchet-remaining-holes.md)

# 210 — mutation probes for semantic weakening

State: TODO
Created: 2026-07-28 (carved out of #77 when its first two holes landed)
Engine: claude
Environment: linux
Model: opus-5
Effort: high
Priority: verification-integrity
Assignment note: Targeted mutation testing — choosing what to mutate is the whole task.

## Outline

The third and last hole in the coverage ratchet. **Split out rather than closed with the others**,
because closing #77 whole would have marked as done a piece of work nobody did.

### What the ratchet catches now, and what it still cannot

`scripts/check-coverage-ratchet.ts` after `4ab250f`:

- **Hole 1, VAGUE RECORDS — CLOSED.** An entry must state its new counts and the checker verifies the
  declared numbers against the actual ones (`check-coverage-ratchet.ts:367,371`). A record can no longer
  be a shrug, it names the magnitude, and a stale record stops passing once the file changes again.
- **Hole 2, PADDING WITHIN A FILE — CLOSED, report-only.** Per-file assertion TEXT sets are compared,
  not just counts, and replacements are reported rather than failed (line 20: *"replacement reporting is
  informational: it makes count-neutral padding visible"*). Legitimate rewrites replace assertions
  constantly, so failing on it would be wrong.

**Hole 3, SEMANTIC WEAKENING — OPEN, and no instrument exists.**

`expect(actual).toBe(1)` → `expect(true).toBe(true)` keeps the count AND keeps a distinct assertion
text, so both closed holes pass it. Only mutation testing catches this: **deliberately break a source
invariant and require that some assertion fails.**

### The shape that makes it affordable

A full mutation run is far too slow for a commit gate. The valuable form is **targeted**:

> For each invariant in `project.invariants.md` that claims an IMPOSSIBILITY, mutate the line its
> annotation sits on and require a red.

Scope it to a handful of load-bearing modules and run it **outside** the merge gate — nightly or on
demand.

### Why it is worth doing at all

The whole ratchet gates DISCLOSURE of assertion loss, not justification. Holes 1 and 2 make loss
visible. Hole 3 is the only one where an assertion can be **kept, counted, and rendered meaningless** —
the state in which every instrument reports health and nothing is being checked. It is the ratchet's own
version of the defect the repo keeps finding elsewhere: a check that can only fail toward "pass."

### Ordering note carried over from #77

This is a genuine project, not an edit. It should not be started while user-requested UI work is
unmerged.

## Sources

- `.invar/tasks/done/77-coverage-ratchet-remaining-holes/` — the original three-hole spec and its brief.
- `4ab250f` — "Close coverage ratchet declaration and padding holes," which landed holes 1 and 2.

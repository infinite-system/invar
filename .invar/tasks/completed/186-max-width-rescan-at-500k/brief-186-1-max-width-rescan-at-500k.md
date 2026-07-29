# TASK — #186: every edit that lengthens the widest line rescans the whole document

Work ONLY in this worktree. Do NOT run `scripts/merge-gate.sh`; do NOT push, merge, tag or delete.
Report to [/tmp/186-max-width-rescan-READY.md](../../../../../../../../../../../tmp/186-max-width-rescan-READY.md). `export PATH=$HOME/.bun/bin:$PATH`, then
`bun install` FIRST — a fresh worktree has no `node_modules` and every preflight reds on unresolved
imports until you do.

**MAIN IS CURRENTLY RED** on an unrelated defect (#168, a deterministic frame-ordinal wait in
behavioral-contracts, being fixed in parallel). Your branch inherits that red, so do NOT run the
merge gate and do NOT try to diagnose it. `tsc`, `bun test`, conventions and invariants are all green
and are your verification.

**ANOTHER BUILDER IS LIVE.** Read #183 before timing anything: the machine-wide quiet lock
(`/tmp/invar-quiet.lock`) **gives up after 120 seconds and runs anyway**, stamping the journal
`degraded`. #147 made that visible, not impossible — and it already happened to #169. Check
`/tmp/invar-quiet-lock.journal` for your own entries and **discard any sample whose entry says
`degraded`.** A number taken degraded looks exactly like a valid one.

## The defect — this is the real reason a 500k file is not imperceptible to edit

`TextDocument.replaceLineRange` marks the current maximum-width line as deleted whenever that line is
replaced, then **immediately calls `rebuildMaximumLineWidth()` before comparing the replacement.**

So successive insertions that make the same line longer rescan ALL lines on EVERY keystroke. Typing
at the end of the widest line — exactly what someone editing a long line does — is O(n) per
character.

## Measured by #169, 10/10 samples per scale, ordered, quiet lock held

    100k  wrap off   16.237, 15.717, 17.970, 18.829, 16.434 ms
    100k  wrap on    18.000, 15.742, 16.020, 18.471, 17.406 ms
    500k  wrap off   79.540, 75.922, 77.895, 73.664, 78.070 ms
    500k  wrap on    65.709, 72.840, 71.634, 70.380, 71.780 ms

Against the user's bar — **< 16 ms imperceptible, >= 33 ms drops a frame** — 500k is **65-87 ms, two
to three dropped frames per keystroke**, and 100k sits right on the threshold.

**The instrument already exists**: `bun scripts/harness/measure-editor-edit-path.ts`, landed by #169.
It reports `mutationMilliseconds` separately from `syncMilliseconds`, and its positive control is
proven (forcing the full-rebuild branch moved 20k sync from 0.342-0.685 ms to 51.284-53.824 ms). **Do
not build a second instrument.**

## Why #169 did NOT fix this, and what that tells you

#169 was dispatched to investigate a different suspect: an outside review found that every edit
allocates four arrays of length n in `EditorWrap`. All true. Measured, that sync costs 1.327-3.763 ms
at 100k and under 9.124 ms at 500k — **already inside the goal.** In #169's words: *"Removing the sync
entirely would leave the actual bottleneck."*

So the lesson to carry in: **the cost is where the measurement says it is, not where the structure
looks worst.** Confirm the split yourself with `mutationMilliseconds` vs `syncMilliseconds` before
changing anything.

## Step 1 — establish WHY maximum line width is tracked at all

This is the step most likely to make the fix trivial, so do it before optimising.

Maximum line width presumably feeds the horizontal scroll extent. Find every consumer and ask, for
each: **does it need the EXACT maximum, or would a monotonic upper bound serve?**

- If a bound suffices, the rescan may be **deletable rather than optimisable** — the champion only
  ever needs to grow while the document is being edited, and a stale-but-not-smaller bound produces a
  scrollbar that is slightly too generous rather than wrong.
- If an exact maximum is genuinely required, say which consumer requires it and why.

Report the consumer list either way. Enumerating a shared seam's consumers before calling a defect
local is what changed the fix in #163 and #172.

## Step 2 — the fix that looks like a reduction

Compare the replacement against the champion BEFORE deciding a rescan is needed:

- replacement width >= outgoing champion width -> the replacement IS the new champion. O(1), no scan.
- replacement is narrower AND the outgoing line was the sole champion -> only then is a scan needed,
  and even then a cached second-place candidate may avoid it.

That removes a rule rather than adding one, which is the signature worth aiming for. Apply the same
acceptance test #169 was held to:

- does the width contract in its invariant record get **SHORTER**?
- does any consumer have to know whether a rescan happened? **It must not.**
- is an exception rule required for some case? **If yes, stop and report.**

## Step 3 — re-measure and report the curve

2k / 20k / 100k / 500k, wrap on and off, ordered samples, load average beside each, quiet lock held
and **verified not degraded**. Report `mutationMilliseconds` and `syncMilliseconds` separately so the
split stays visible.

Target: **500k mutation under 16 ms.** If you land between 16 and 33 ms, report it as the honest rung
with the remaining ladder — #178 did exactly that for the gate and it was the right call.

## Constraints

- **The horizontal scroll extent must remain correct at every scale.** A wrong maximum width is a
  VISIBLE defect — the scrollbar lies about how far right the content goes — and that is worse than a
  slow correct one. If you adopt an upper bound, prove the scrollbar still behaves by DRIVING it, not
  by unit test alone.
- Never widen a threshold to make a number acceptable.
- Positive control mandatory: after the fix, force the rescan path and require the number to move.
- Do not touch `EditorWrap`'s incremental sync. #169 measured it as already inside the goal, and
  changing it here would confound your own measurement.
- Watch for a large PASTE or a multi-line replacement: those legitimately change many lines at once
  and may still need a scan. If so, that is a bounded case and not an exception rule — but say which
  it is.

## Repo law

`export let Class = $Class`; the `Static()` wrapper lives at the `$Class` anchor
(`$Class = Static($Raw); Class = $Class`), never `Class = Static($Class)`; `Reactive()` is exempt
because it mutates in place. Invariant records live at
`src/modules/<domain>/<domain>.invariants.md` and are cited by ROOT-RELATIVE path. Full descriptive
identifier names — `increment` not `inc`, `index` not `i`. 80 columns.

## BYCATCH

Report every defect you SEE; fix only the one you were SENT for, under a `## Bycatch` heading with
exact reproduction, repetition count, and commit. #169's bycatch is what created THIS task, so the
section is load-bearing.

## Verification — quote exact exit codes, never read `$?` after a pipeline

`bunx tsc --noEmit`, `bun test`, `bash scripts/conventions-gate.sh`,
`node .claude/skills/invariants/scripts/check_invariants.mjs --all --refs` (at or above 916
annotations / 67 lattice links / 0 problems), `bun scripts/check-coverage-ratchet.ts`, plus the
before/after measurement tables and the driven horizontal-scroll evidence.

Commit with `SKIP_GATE=1 git -c commit.gpgsign=false commit -F <file>`; leave the tree clean.

# TASK — overlay-dialog is now a HARD RED blocking every gate. Fix it by driving.

Builder on Invar. Work ONLY in `/tmp/conductor-overlayfix` (branch `fix-overlay-dialog-red`,
forked from latest LOCAL main — the remote may be unreachable; fork from the local main ref). No
merge-gate, no push/tag/delete. Report to `/tmp/overlay-dialog-READY.md`.
`export PATH=$HOME/.bun/bin:$PATH; bun install --frozen-lockfile`.

## History you need (do not re-derive)

`smoke: overlay-dialog harness` (scripts/harness/smoke-overlay-dialog-harness.ts) has been
intermittent for ~2 days: it was "passes on retry" (~1/3 red in isolation, PROVEN pre-existing on
commit 4ad3287, before all recent landings). In gate runs 702000 and 787893 it graduated to
RETRIED-AND-STILL-FAILED — a hard red that now blocks every commit through the pre-commit gate.
The failing step involves the context-menu + wheel condition. Nothing that landed recently touches
overlay/dialog code paths; the smoke degraded on its own timeline, which smells like a RACE whose
window widened, not a regression.

## Method — Rule Zero, and this repo's wait doctrine

1. REPRODUCE BY DRIVING first: run the smoke in a loop (it is ~1/3 red — 10 runs will show it).
   Capture the failing frame and the exact wait that times out.
2. The likely class, given tonight's finds: a wait whose predicate is ALREADY TRUE before the work
   (grid text matched from the wrong surface), or a wait observing an unstable intermediate rather
   than the settled condition, or a real publication race in the overlay/context-menu wheel path.
   Two of those are harness defects, one is an app defect — the DRIVE tells you which. If it is an
   app defect, FIX THE APP, not the smoke.
3. PREFER A COUNT: if the failing assertion is time-based, convert the verdict to a load-invariant
   count/condition (per AGENTS.md law 7 and the #133 direction). Never widen a timeout.
4. Positive control: whatever you fix, show the assertion can still go red (plant the defect or
   revert the fix once).
5. Acceptance: 20 consecutive green runs of the smoke on the final tree (it was 1/3 red — 20
   greens bounds the residual rate meaningfully), then the full checker suite ONCE, exact exit
   codes. Report the mechanism you found, not just the fix.

Bycatch rules apply (AGENTS.md). Full descriptive names, 80 cols, ivue conventions. Commit
`SKIP_GATE=1 git -c commit.gpgsign=false commit -F <file>`; clean tree.

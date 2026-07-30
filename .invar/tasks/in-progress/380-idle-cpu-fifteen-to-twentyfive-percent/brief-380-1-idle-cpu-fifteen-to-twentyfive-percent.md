# Brief #380 round 1 — find and fix the 15-25 percent idle CPU

codex auto-reads [AGENTS.md](../../../../AGENTS.md). Reason with IBR. USER-PRIORITIZED.

## The task

Read the task file in this folder: the user's instance idles at 15-25%
CPU (memory fine). Four ranked candidates (LIVE-row animation gated on
existence instead of visibility; a surviving timer; hot polling of the
ledger; unconditional 60fps render loop). Measure first — the toggle
matrix in the task file IS the measurement (close pane / no LIVE rows /
pane hidden): each toggle separates one candidate.

## Method

1. Reproduce with FIXTURE tasks only (never this repo's real tasks.json —
   safety rail). Measure idle CPU by cwd-selected pid sampling.
2. Run the toggle matrix; profile the surviving candidate.
3. Fix the generator: animation gated on visibility AND liveness;
   row-diff repaints; event-driven ledger watch. Re-measure: sustained
   idle CPU at or under ~2% with no visible animation.
4. Contract is timeless: "no timer runs when nothing animates" (count/
   gating assertion in the dashboard smoke). CPU% goes in the report as
   evidence, never as a gate threshold.

## Rules

No merge-gate.sh by hand; no SKIP_GATE; commit through the hook; commit
BEFORE writing READY; real hash + GATE_EXIT in the report header; report
to the main-checkout task folder (absolute path). Known flaky classes:
#214, #359, #362, #364, #371 — name, do not chase. Builders never push.

## Invariants in scope

- Dashboard motion exists only while observed (src/modules/tasks-dashboard
  contract): this task may refine it — if "observed" means row existence
  rather than pane visibility, propose the sharper wording. Answer record
  by record; list records this list missed.

## Bycatch expected

Report per [AGENTS.md](../../../../AGENTS.md)'s bycatch taxonomy; include a ## Bycatch section
even when it reads: None observed.

## Definition of done

READY report in this folder, standard naming (report prefix, number 380,
the task slug, md extension): toggle-matrix measurements, the profiled
generator, the fix with before/after idle CPU, the timeless smoke
assertion, gate chain, invariants answered, bycatch.

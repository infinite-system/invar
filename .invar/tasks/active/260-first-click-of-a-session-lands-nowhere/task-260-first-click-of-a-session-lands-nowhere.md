# 260 — the first pointer click of a drive session lands nowhere

State: ACTIVE
Created: 2026-07-29
Engine: codex
Environment: linux
Model: 5.6-sol
Effort: medium
Priority: flake-evidence

## Outline

Bycatch of #238, reproduced twice, unverified against main: the FIRST
pointer click of a drive session is recorded by the global mouse status but
no renderable handler fires; the second and later clicks work. Seen on a
file-tree/tab click and on a right-dock row click. Possibly a harness or
mouse-mode warm-up; possibly kin to #86 (wheel-first-frame fixed latency).

Diagnose before fixing: reproduce on plain main (both polarities — a build
where it happens, and identify any state in which it does not), then find
where the first click dies (mouse-mode enable timing? hit-region
registration racing the first paint?). If it is the harness, the fix is an
instrument fix; if it is the app, real users lose their first click too —
say which with evidence. Coordinate with #86 rather than duplicating its
diagnosis if the mechanism converges.

## Invariants in scope

- The mouse/hit-testing records; harness records if the defect is the
  driver's.

## Bycatch expected

Per [AGENTS.md](../../../../AGENTS.md)'s taxonomy. The READY report carries `## Bycatch` even if it
reads `None observed`.

## Sources

- `report-238-...md`, Bycatch item 4.

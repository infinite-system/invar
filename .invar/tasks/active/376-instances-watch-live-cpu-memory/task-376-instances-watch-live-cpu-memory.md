# #376 — instances:watch shows live CPU and memory for every Invar instance

State: ACTIVE
Priority: user-directed
Engine: codex
Environment: linux
Model: 5.6-sol
Effort: medium

## The request (user, 2026-07-30)

A tool like tasks:watch that shows all ACTIVE Invar instances live —
memory in MB and CPU% — excluding the smoke/harness-driven ones. Wanted
while comparing an older --smol build against current.

## The shape

1. `bun run instances:watch` (script + package.json entry), same direct-
   ANSI renderer discipline as tasks:watch (DEC 2026 synchronized
   brackets, row diff, 1s refresh; reuse the shared renderer generator if
   the seam allows — never copy frames/tables).
2. One row per instance: pid, CPU%, RSS in MB, uptime, and provenance —
   the binary (dist/iv vs bun dev) and the WORKSPACE it has open (from
   cwd or argument) so two instances are tellable apart.
3. Exclusion: instances whose cwd sits under .invar/worktrees/ or whose
   env/argv marks them harness-driven (PtyTestDriver spawns) are hidden
   by default; a --all flag shows them tagged.
4. Optional trend: a small sparkline or delta since last sample per row
   (nice, not required for round 1).
5. Conductor's stopgap one-liner (ps+awk over dist/iv|src/main.ts,
   excluding worktrees) is in the task history — the tool replaces it.

## Boundaries

- Read-only observer: /proc sampling, no signals, never touches the
  instances. Idle cost near zero (it is a monitor, not a load).
- Identification by cwd/argv (structure), never by grepping command lines
  for vocabulary that briefs could contain (the never-search-to-kill
  class applies to WATCHING too).

## Addendum (user follow-up): the default filter is CWD-based
Instances are selected by /proc/<pid>/cwd (main checkout + explicitly
named paths), never by command-line text — worktree/temp cwds are the
exclusion mechanism.

## Conductor addition (2026-07-30)

Use DELTA sampling (jiffies over a window, like top), never ps %cpu —
ps reports the lifetime average, which decays slowly and reads as a
phantom idle burn (measured: ps 8% vs real 0.6% on the user instance).
Support --whoami TAG filtering via /proc/<pid>/environ IV_WHOAMI.

# Brief — #276 round 2: the combined gate is RED on your change — two defects

The conductor's combined gate (main + your 8b3fa8a1) ran GATE_EXIT=1.
Failure logs: /tmp/merge-gate-failures.3696794/. Controls run:

1. **Conventions gate, HARD FAIL, unambiguous:** "src/modules/app/
   Bootstrap.ts names the markdown plugin (2 line(s)) and is not …" —
   your OpenTUI zero-width-selection guard leaked a module boundary
   (Bootstrap referencing the markdown plugin by name). Fix at the seam:
   whatever the guard needs must come through a contribution or a
   host-neutral hook, not a hard-coded plugin name in the host. Read the
   conventions-gate log for the exact two lines.

2. **smoke-workspace-tabs-harness: RED on BOTH attempts on your tree;
   the conductor's control on unmodified main is GREEN (exit 0,
   /tmp/wt-main-control.log)** — the red is your change's. "Timed out
   waiting for the tiny workspace watcher activation completes."
   Suspects: your Bootstrap guard consuming events the watcher path
   needs, or the link work altering activation order. Diagnose by
   driving, name the mechanism, fix at the generator.

3. smoke-scrollbars retry-passed once (starvation class, known) — no
   action, but confirm your final gate shows it clean or retry-quiet.

Your round ends with your OWN full merge-gate green (non-skipped), then
the refreshed report quotes its exit and both fixed mechanisms.

## Invariants in scope

- Round 1's set; the module-boundary conventions (host names no plugin);
  the workspace watcher records if touched.

## Bycatch expected

Per [AGENTS.md](../../../../AGENTS.md)'s taxonomy. The refreshed READY report carries `## Bycatch`
even if it reads `None observed`.

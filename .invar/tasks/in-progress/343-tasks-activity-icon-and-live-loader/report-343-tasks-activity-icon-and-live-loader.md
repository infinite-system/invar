# READY — tasks activity icon and live loader

Task:
[tasks activity icon and live loader](task-343-tasks-activity-icon-and-live-loader.md)

Briefs:
[tasks activity icon and live loader, round 1](brief-343-1-tasks-activity-icon-and-live-loader.md)
and [gate unblock, round 3](brief-343-3-unblock.md)

Status: READY

Implementation commit: `c795ba010db5ddd72b146010a4e21add12b7a7f3`

Main was merged at `e95f0c22d1b809f7669616d9a0b441c65cbf550e`.
The normal commit hook passed with `GATE_EXIT=0`.
No gate bypass was used.

## Result

The Tasks activity item now uses a semantic theme slot.
The slot resolves to the Nerd Font play mark `U+F04B`, the Unicode play mark `▶`, and the ASCII
play fallback `P`.
`P` stays distinct from the existing ASCII panel-expand mark `>`.

The LIVE detail row now puts the motion glyph beside `building` or `exploring`.
The renderer indexes the exported
`TASKS_BUILDING_BREATH_FRAMES`, `TASKS_EXPLORING_GLYPHS`, and `TASKS_EXPLORING_RAMP` tables from
[the task status generator](../../../../scripts/tasks/tasks-status.ts).
It does not copy those frames.

The motion timer now starts only while an observed LIVE row or a running gate needs motion.
It stops when neither source needs motion.
The status projection publishes this rest state for the PTY harness.

The implementation changes:

- [ThemeIcons.ts](../../../../src/modules/theme/ThemeIcons.ts) owns the new semantic task glyph.
- [TasksDashboardPaneContent.ts](../../../../src/modules/tasks-dashboard/TasksDashboardPaneContent.ts)
  consumes that theme slot.
- [TasksDashboardPaneRenderer.ts](../../../../src/modules/tasks-dashboard/TasksDashboardPaneRenderer.ts)
  paints the shared motion frame beside the phase word.
- [TasksDashboardOverview.ts](../../../../src/modules/tasks-dashboard/TasksDashboardOverview.ts)
  prices the timer against live motion.
- [TasksDashboardPlugin.ts](../../../../src/modules/tasks-dashboard/TasksDashboardPlugin.ts)
  publishes the timer rest probe.

## Driven evidence

I first drove the default app at `120x36`.
The original Tasks activity item painted `⛭`.
The LIVE title row carried the motion mark, while its detail row painted bare `building` or
`exploring`.

After the change, the same drive painted:

```text
▶
#350 nicer-generated-…
· building
#326 vendor-modularit…
↑ exploring
```

The probe reported `tasksAnimationAtRest=false` while the LIVE rows were visible.

The ASCII drive used `LANG=C`.
It painted `P` in the Tasks activity row.
The activity-bar PTY smoke also found the same semantic slot on both left and mirrored surfaces.

The task-dashboard PTY smoke passed with its small fixture and its 500-task fixture.
Both scales kept the same compact visible projection.
The smoke observed the motion counter advance while a building row was visible.
The absent-tree arm reported `tasksAnimationAtRest=true` and `tasksAnimationPaint=0`.

## Positive controls

I removed the new detail-row motion chunk.
The focused renderer check failed because it expected `· building` and received bare `building`.
I restored the chunk, and the check passed.

I then restored the old unconditional timer.
The no-live check failed with:

```text
Expected: true
Received: false
```

I removed the plant, and the check passed.

## Verification

- Focused unit tests: 55 pass, 0 fail, 479 expectations.
- [activity-bar PTY smoke](../../../../scripts/harness/smoke-activitybar-harness.ts): pass.
- [task-dashboard PTY smoke](../../../../scripts/harness/smoke-tasks-dashboard-harness.ts): pass,
  including the 500-task scale arm.
- `bunx tsc --noEmit`: exit `0`.
- `node .claude/skills/invariants/scripts/check_invariants.mjs --all --refs`: exit `0`;
  1,218 annotations and 223 lattice links resolved with 0 problems.
- `bash scripts/conventions-gate.sh`: exit `0`.

The normal hook for implementation commit
`c795ba010db5ddd72b146010a4e21add12b7a7f3` passed this chain:

- failure-log provenance self-test;
- ivue Static getter capability;
- conventions and TypeScript;
- formatting;
- invariant structure and references;
- the coverage ratchet;
- the reactive observation audit;
- all unit tests;
- the binary build;
- smoke timing classification, including its positive control;
- all 65 parallel PTY smokes;
- behavioral contracts;
- agent-permissions smoke;
- overlay-dialog smoke;
- input-byte first-frame ordering and timing trend.

The final line was `GATE_EXIT=0`.
Git-watch had one starvation-class timeout and passed its automatic clean retry.
The retry remained visible in the gate tally.

## Invariant review

- [tasks dashboard invariants](../../../../src/modules/tasks-dashboard/tasks-dashboard.invariants.md):
  upheld. The pane still uses the CLI lens generator, stable LIVE title/detail rows, and the exact
  exported watch motion tables.
- [theme invariants](../../../../src/modules/theme/theme.invariants.md): upheld. The task icon now comes
  from theme data, follows the capability ladder, has one-cell fallbacks, and has one declared
  activity owner.
- [UI invariants](../../../../src/modules/ui/ui.invariants.md): upheld. The pane still projects through
  the shared pane host and one surface.
- [root invariants](../../../../project.invariants.md): upheld. The change reuses the task-status
  generator and adds no parallel motion table.

## Bycatch

- RESOLVED ON MAIN: the plugin-manifest smoke assumed that `Changes/log split` immediately followed
  `Show hidden files`.
  [plugin manifest structure scrollbar intermittent (#337)](../../completed/337-plugin-manifest-structure-scrollbar-intermittent/report-337-plugin-manifest-structure-scrollbar-intermittent.md)
  replaced that ordinal drive before this branch re-gated.
- TRANSIENT: the behavioral-contract wrapper's task-dashboard arm hit `SyntaxError: Failed to parse
  JSON` after its main task checks passed.
  The dedicated task-dashboard smoke passed before and after that run, so a second run did not
  reproduce it.
- TRANSIENT: the panel-chrome smoke timed out once under the parallel gate pool and passed its
  automatic retry.
- TRANSIENT: the git-watch smoke timed out once under the final parallel gate pool and passed its
  automatic retry.
- RECORDED BREACH: [theme invariants](../../../../src/modules/theme/theme.invariants.md) already name
  the hard-coded `●` marks in
  [TabBarRenderer.ts](../../../../src/modules/ui/TabBarRenderer.ts).
  I confirmed the literals by inspection.
  I did not change them.

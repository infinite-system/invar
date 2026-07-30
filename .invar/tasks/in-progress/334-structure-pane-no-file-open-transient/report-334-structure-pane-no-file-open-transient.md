READY

# #334 (structure pane no-file-open transient)

Commit: `c6c9dc8bc055b2c1904e3198fb95a4e86c558d61`

The worktree is clean.

## Result

[Drive.ts](../../../../scripts/harness/Drive.ts) now waits for both structure
status and the emulator grid.

The 3,352-line Markdown drive no longer settles while the dock still paints
`No file is open.`. The timeout stays at 15 seconds.

[Drive.test.ts](../../../../scripts/harness/Drive.test.ts) now locks the
status-and-screen condition. The test count increased from 12 to 13.

[harness.invariants.md](../../../../scripts/harness/harness.invariants.md)
now records that status-file writes and PTY bytes cross separate boundaries.

## Cause

The defect was in the Drive wait condition.

`StructurePlugin.statusSnapshot` and `StructurePaneContent.render` read the
same `StructureOutline`. No second model or unattached document source exists.

The status file could publish `structureStatus="ready"` before the matching
PTY frame reached `TerminalEmulator`. The large outline made that ordering
visible.

A later preview action painted all 110 rows without another structure
request. This ruled out a product binding race.

## Driven evidence

Before the change:

- [README.md](../../../../README.md) settled with four painted structure rows and
  `structureStatus="ready"`.
- [project.conductor.archive.md](../../../../project.conductor.archive.md)
  settled with `No file is open.`,
  `structureStatus="ready"`, `structureRows=110`, and
  `structureRequests=1`.
- A later `Control+Shift+V` action painted the 110 rows. The request count
  stayed at one.

After the change:

- [README.md](../../../../README.md) settled with the same four rows.
- [project.conductor.archive.md](../../../../project.conductor.archive.md)
  settled with visible outline rows.
- Both drives used default settings at 120x40.

## Positive control

I disabled the new screen condition and ran the focused regression test.

The test failed with:

```text
Expected:
["structure pane has not painted the active file"]
Received:
[]
```

I restored the condition. The focused test then passed with two assertions.

## Contract review

Scope came from the changed harness path, the structure status terms, and the
screen-oracle rule in the [filed brief](brief-334-2-structure-pane-no-file-open-transient.md).

### Harness records

- [Drive settled observations include declared debounced work](../../../../scripts/harness/harness.invariants.md#drive-settled-observations-include-declared-debounced-work):
  strengthened and refined. Settlement now observes the stale headline.
- [Harness waits observe conditions not frame ordinals](../../../../scripts/harness/harness.invariants.md#harness-waits-observe-conditions-not-frame-ordinals):
  strengthened. The fix adds a grid condition and no time delay.
- [The terminal emulator is the harness screen oracle](../../../../scripts/harness/harness.invariants.md#the-terminal-emulator-is-the-harness-screen-oracle):
  upheld. The final visual verdict comes from the emulator grid.
- [Async-published state is always awaited](../../../../scripts/harness/harness.invariants.md#async-published-state-is-always-awaited):
  upheld. The combined condition stays independently re-evaluable.
- [Every wait names itself](../../../../scripts/harness/harness.invariants.md#every-wait-names-itself):
  upheld. The new pending state has a stable name.
- [Synchronized end markers bound complete frames](../../../../scripts/harness/harness.invariants.md#synchronized-end-markers-bound-complete-frames):
  upheld. Each captured frame stays complete. Status publication remains a
  separate boundary.

### Structure records

- [Symbol structure is analyzer knowledge](../../../../src/modules/structure/structure.invariants.md#symbol-structure-is-analyzer-knowledge):
  upheld. The source answered once with 110 rows.
- [A structure source answers or declines, never blanks](../../../../src/modules/structure/structure.invariants.md#a-structure-source-answers-or-declines-never-blanks):
  upheld. The stale message came from an earlier valid state.
- [The structure pane shows itself for a supported document](../../../../src/modules/structure/structure.invariants.md#the-structure-pane-shows-itself-for-a-supported-document):
  upheld. Both supported Markdown files revealed the dock.
- [Outline cost tracks the observed document](../../../../src/modules/structure/structure.invariants.md#outline-cost-tracks-the-observed-document):
  upheld. The large drive used one request before and after the later paint.
- [The structure navigator is a pane content citizen](../../../../src/modules/structure/structure.invariants.md#the-structure-navigator-is-a-pane-content-citizen):
  upheld. No host or structure product code changed.

The outline-label, depth-and-filter, and symbol-selection records were not
implicated.

## Verification

- `bun test scripts/harness/Drive.test.ts` passed: 13 tests and 36
  assertions.
- `bun scripts/harness/smoke-markdown-harness.ts` passed at 500 and 100,000
  lines.
- `bun scripts/harness/smoke-markdown-view-mode-harness.ts` passed at 10 and
  100,000 lines.
- `bunx tsc --noEmit` passed with `TSC=0`.
- `node .claude/skills/invariants/scripts/check_invariants.mjs --all --refs`
  passed with 0 problems and 1,210 resolved annotations.
- The task brief forbids `scripts/merge-gate.sh`. The commit used the
  documented `SKIP_GATE=1` hook bypass after the focused checks.
- The structure arm of
  `bun scripts/harness/smoke-plugin-manifest-harness.ts` found the bycatch
  below. Its earlier structure outline assertion passed.

## Bycatch

- The structure smoke painted 42 overflowing outline rows, but
  `right-dock-scrollbar-v` stayed at `laidH=1`. The wait for dock-height
  geometry timed out after the outline assertion passed. Observed once in
  the final pass. Not fixed.
- Contract gap: no app record says status fields describe the painted
  surface. The completed
  [#322 (status editor-column content stale in preview) report](../../completed/322-status-editor-column-content-stale-in-preview/report-322-status-editor-column-content-stale-in-preview.md)
  identified the same missing record. This task added the narrow Drive
  condition but did not author the app record.

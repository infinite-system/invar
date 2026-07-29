# READY - #266 (drive settle includes debounced work)

State: READY for review. The work is committed on
`fleet/266-drive-settle-ignores-debounced-parse` at
`5624035ec35e20735be3d8d80116778a3372c1ca`. The worktree is clean.
The full pre-commit gate is green.

## What changed

`Drive` now uses a small settled-status registry after it opens a file. The
registry declares three pending states:

1. `markdownParsing=true`.
2. `markdownRevision` differs from `bufferRevision` for active Markdown.
3. `structureStatus` is `no-document` or `loading` for an active file.

Missing plugin keys do not hold the drive open. The existing 15,000 ms
deadline did not change. The wait observes named state through
`awaitGridCondition`. It does not sleep or wait for a frame ordinal.

The initial app-ready wait now uses the same helper. File drives run the
helper again after Quick Open finishes.

Round two also fixes the terminal-stage smoke exposed during round one. Its
frame collector stopped when the shell created a proof file. The shell could
create that file before the next completed terminal frame. The collector then
judged an empty frame history and reported `observed=false, complete=false`.

The smoke now observes every completed frame while it waits. Its endpoint
requires both the proof file and an observed command frame. This keeps the
external side effect from ending a visual measurement before its subject
frame exists.

The round-two hypothesis about `Drive` delaying app readiness did not hold.
The terminal-stage smoke does not import or call `Drive`. It waits on
`status.ready` through `HarnessSmoke` and uses `PtyTestDriver` directly.

## Driven evidence

Before the fix, `bun run drive --open README.md` printed:

- `Parsing Markdown…`
- `markdownParsing=true`
- `No file is open.`
- `structureRequests=0`
- `structureStatus="no-document"`

The 3,352-line [project.conductor.archive.md](../../../../project.conductor.archive.md) showed the same stale state.

After the fix, the 59-line README drive printed rendered preview text and four
structure rows. It published:

- `markdownParsing=false`
- `markdownRevision=1`
- `bufferRevision=1`
- `structureRequests=1`
- `structureStatus="ready"`

The 3,352-line drive printed rendered preview text and 130 structure rows. It
published the same current revision pair, one structure request, and
`structureStatus="ready"`.

This gives small and large parity for the settled observation.

## Follow-up coverage

#238 (structure boot headline) is covered. The settled registry rejects
`structureStatus="no-document"` while an active file exists. The final README
grid showed the document headings instead of `No file is open.`.

#270 (settled preview one revision behind) is covered for the Drive
instrument. Active Markdown cannot pass the registry until
`markdownRevision === bufferRevision`. The large drive published `1 === 1`.
This does not claim that stale Markdown application is impossible outside a
Drive settled observation. I did not edit the Markdown contract.

## Regression contract and positive control

`scripts/harness/Drive.test.ts` now launches the real app through `Drive` with
the 3,352-line Markdown file. It rejects both stale headlines and checks the
published Markdown revision and structure request.

I planted the original defect by bypassing the post-open registry wait. The
focused test returned exit 1. It reported:

`Expected to not contain: "Parsing Markdown…"`

The captured output also contained `No file is open.`,
`markdownParsing=true`, `structureRequests=0`, and
`structureStatus="no-document"`. I removed the plant. The focused test then
passed with 10 tests and 26 expectations.

The new chosen record is *Drive settled observations include declared
debounced work* in [scripts/harness/harness.invariants.md](../../../../scripts/harness/harness.invariants.md).
[scripts/harness/drive.md](../../../../scripts/harness/drive.md) now explains the registry.

Round two adds a missing-frame positive control. It calls the existing
first-frame verdict with `observed=false, complete=false` and requires a red
result. The smoke prints:

`reduced-motion missing-frame positive control RED (expected):
reducedMotion first-frame ordering failed: observed=false, complete=false`

Removing the new visual endpoint restored the old file-only wait. That plant
passed once, while the same old code failed twice in round one. This result
confirms the endpoint was timing-dependent. The combined endpoint removes
that timing polarity.

## Files changed

- `scripts/harness/Drive.ts`
- `scripts/harness/Drive.test.ts`
- [scripts/harness/drive.md](../../../../scripts/harness/drive.md)
- [scripts/harness/harness.invariants.md](../../../../scripts/harness/harness.invariants.md)
- `scripts/harness/smoke-terminal-stage-harness.ts`

No scratch tooling was needed.

## Verification

- `bun test` → exit 0. 1,856 pass, 0 fail, 288 files.
- `bun scripts/harness/smoke-markdown-harness.ts` → exit 0, ALL-PASS.
- `bun scripts/harness/smoke-plugin-manifest-harness.ts` → exit 0.
- `bun scripts/check-harness-wait-observation.ts` → exit 0. It reported 62
  existing review candidates and no new candidate in `Drive.ts`.
- `node .claude/skills/invariants/scripts/check_invariants.mjs --all --refs`
  → exit 0. 1,063 annotations resolved, 0 problems.
- `bash scripts/conventions-gate.sh` → exit 0.
- `bunx tsc --noEmit` → exit 0.
- `git diff --check` → exit 0.
- `bun scripts/harness/smoke-terminal-stage-harness.ts` → exit 0, ALL-PASS,
  twice consecutively after the wait fix.
- The same terminal-stage smoke passed again with the permanent missing-frame
  positive control.
- The normal pre-commit hook ran the complete merge gate → ALL-PASS.
- The gate's terminal-stage job passed in 10.126 seconds.
- `bun scripts/harness/smoke-panel-chrome-harness.ts` on this branch → exit 0,
  ALL-PASS. Log: `/tmp/panel-chrome-266-branch.log`.
- The same panel-chrome command on main → exit 0, ALL-PASS. Log:
  `/tmp/panel-chrome-266-main.log`.

## Invariants

Scope was [scripts/harness/harness.invariants.md](../../../../scripts/harness/harness.invariants.md), derived from the changed
Drive path and its annotations.

- *Harness waits observe conditions not frame ordinals*: strengthened.
- *Async-published state is always awaited*: strengthened.
- *Every wait names itself*: upheld.
- *Drive settled observations include declared debounced work*: added after
  the driven symptom was gone.
- *Harness waits observe conditions not frame ordinals*: refined in round
  two. A frame-history verdict now keeps collecting until its external and
  visual conditions have both occurred.

The invariant checker reports 0 problems.

## Bycatch

1. **Panel-chrome needed a quiet retry in the full gate.** Its first pooled
   attempt timed out. The gate's quiet retry passed. Isolated branch and main
   controls both returned exit 0 and ALL-PASS. The available evidence
   classifies this as a pool-only flake, not a #266 polarity.

No other bycatch was observed.

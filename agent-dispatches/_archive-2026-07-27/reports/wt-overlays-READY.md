# READY — fix-overlay-geometry

Commit: `16cff522d41dba5b6a08702588091cdb71835ae4`

## Repair

The workspace-tabs regression was a Quick Open projection-measurement bug, not a tab-strip bug.
In workspace-path mode with no listed match, `QuickOpenRenderer` painted two guidance rows while
`OverlayLayer` reserved only one list row. The undersized Yoga interior compressed the list into
the input row, interleaving `Type an existing folder path` with the correctly stored query and
preventing the driven screen oracle from observing the typed path.

`QuickOpenRenderer.contentRowCount()` now derives geometry from the same message generator used by
paint. `OverlayLayer` consumes that measurement. The unit test fixes the two-row empty workspace
state, and the workspace-tabs harness now requires the complete typed path on the input row before
checking the fuzzy result list.

## Verification

- workspace-tabs harness: 5/5 solo on a quiet dedicated temporary root
- completion harness: 3/3 solo
- overlay-dialog harness: ALL-PASS
- `bunx tsc --noEmit`: exit 0
- `bun test`: 1,305 pass, 0 fail, exit 0
- full hard `scripts/merge-gate.sh` with `SKIP_PERF=1`, `INVAR_FULL_TMUX=0`: ALL-PASS, exit 0
  - conventions, invariant structure/references, behavioral contracts, byte-arrival latency, and
    all PTY harnesses passed
  - non-blocking soft perf baselines and the opt-in tmux audit ring were not requested/run
- committed pre-commit hard merge gate on the exact formatted bytes: ALL-PASS, exit 0
- `git diff HEAD^ HEAD --check`: exit 0
- `git ls-files | grep '^TASK'`: no matches
- worktree: clean

Invariant review scope: UI overlay geometry, Search Quick Open projection, Workspace outer-tab
round trip, and harness condition waits. The repair strengthens the existing contracts; no contract
wording or annotation change was required.

COMPACTION: none

conventions @ `c997d269147658d175aa8b0506d266302c333a61`

# READY — #386 theme glyphs merge-forward gate

Commit: `c325587b477ff4c40543316764fc5cfb45ebcd4f`

GATE_EXIT: `0`

State: READY

## Outcome

Main is merged into the theme glyph fix. The merge commit has these parents:

- Task branch: `940a46082ce37811136aa61d3677e19c23773496`.
- Main: `a0d6b4483aeee38d328eeffbf86c4cfe5f7dd842`.

The combined
[tasks dashboard smoke](../../../../scripts/harness/smoke-tasks-dashboard-harness.ts)
keeps both changes. It checks each theme glyph cell at default, narrow, and
large scale. It also closes and reopens the task pane. At large scale, it
scrolls the only building row out of view and checks that dashboard motion
rests.

The full commit hook passed on the combined tree. The worktree is clean.
Nothing was pushed or landed.

## Merge classification

The merge base was `17381df812c206cf472faa42edaad84f4ac6afd5`.

Our side added exact glyph-cell checks to the dashboard smoke. Main added the
task-pane lifecycle check and changed the large fixture so only one building
row owns motion. Main then added a scroll check that waits for that row to
leave the visible window.

Git found no textual conflicts. The automatic merge kept the glyph check
before the large-fixture scroll. This order proves the glyphs while the
building row is visible. It then proves that motion rests after the row leaves
the viewport.

Conflict resolutions: none.

The merge also brought in the
[workspace panel tab-bar redesign](../../completed/346-panel-tab-bar-workspace-content-spaces/summary-346-panel-tab-bar-workspace-content-spaces.md).
The task dashboard checks do not read the removed pane-title chrome. No
adaptation was needed.

## Verification

The commit hook reported:

- All invariant structure and reference checks passed.
- The coverage and reactive-observation checks passed.
- Unit tests and the binary build passed.
- All 65 parallel PTY smoke jobs passed directly.
- The tasks dashboard and panel chrome smokes passed.
- Behavioral contracts passed.
- The agent-permissions and overlay-dialog serial smokes passed.
- The five-session input-byte ordering check passed.
- The retry tally was empty.
- `merge-gate: ALL-PASS`.
- `GATE_EXIT=0`.

No new invariant record appeared in the merged scope. The theme, terminal,
dashboard, and harness records from the
[first READY report](report-386-theme-glyphs-vanish-at-narrow-geometry.md)
remain the applicable set.

## Bycatch

None observed during the merge and combined-tree gate.

# READY — dock-agnostic activity surface and pane side setting

Task: #278 (dock-agnostic activity surface; a pane's side is the user's setting)

Status: READY

Commit: `64b80a2d Make the activity surface dock agnostic`

## Result

- One `ActivitySurface` now owns the ordered union of all content in both dock hosts.
  Each registered pane has one activity entry. A click shows, focuses, or toggles the
  pane in its current host.
- The left activity bar stays available when the primary dock is hidden.
- Each contributed pane can publish a `<pane>.dockSide` setting. Structure publishes
  `structure.dockSide`. Tasks publishes `tasks.dockSide`. Both default to the plugin's
  suggested right side.
- A live side change transfers the same `PaneContent` instance through `PanelHost`. It
  keeps the visible pane and the single focus owner. It does not reveal a fallback pane
  in the source host.
- The optional `showRightActivityBar` setting adds a right activity bar. It defaults to
  off. Both bars render the same `ActivitySurface`.
- Shared activity ordering remains one setting and one reorder path across both hosts.
- Plugin uninstall removes its activity membership for content that currently lives on
  either side. Reinstall restores it once.
- Contributed dotted setting keys survive an unknown-key boot and save round trip.
- The activity, host-transfer, and focus records in [ui.invariants.md](../../../../src/modules/ui/ui.invariants.md) now describe this
  shared generator. [ui.lattice.md](../../../../src/modules/ui/ui.lattice.md) links the records.

## Driven evidence

- The first default small drive reproduced the defect. The activity identifiers were
  `files`, `git`, `database`, and `extensions`. Structure and Tasks were registered in
  the right dock but had no activity entries.
- The fixed default small drive showed `files`, `git`, `structure`, `tasks`, `database`,
  and `extensions`. The right dock and the mirrored bar stayed hidden by default.
- Clicking Structure opened the right dock and gave it focus. Clicking Structure again
  hid that dock.
- Enabling `Mirror activity bar on right` changed
  `showRightActivityBar` to `true`. At 120 by 40, the new slot was
  `{ left: 116, width: 4, height: 36 }`. It painted the same registered glyphs as the
  left bar. Disabling the setting removed the slot live.
- A drive with `structure.dockSide: left` booted Structure in the primary host. The
  Settings UI then moved the visible instance left to right, right to left, and back to
  its suggested right side. Each move preserved focus and removed the identifier from
  the old host.
- `bun run drive --size 100000` painted the 100,000-line editor and all six registered
  activity glyphs. This matched the small fixture's membership. The settled-frame wait
  did not complete; that observation is in Bycatch.
- `smoke-activitybar-harness.ts` drives default-off mirror state, exact mirrored glyphs,
  a right-host click, focus, toggle, and the live Structure move in both directions.
- `smoke-plugin-manifest-harness.ts` drives uninstall and reinstall. Structure leaves and
  returns to the activity surface with the plugin membership.

## Positive controls

Each plant was removed before the green run.

1. Activity membership: I changed `ActivitySurface` to read only the first host.
   `bun test src/modules/ui/ActivitySurface.test.ts` went red. It reported
   `expected [ "files", "structure", "tasks" ], received [ "files" ]`. Its cross-dock
   reorder case also failed.
2. Live side transfer: I suppressed the setting's move callback.
   `bun test src/modules/app/ApplicationContributions.test.ts` went red at
   `expect(rightDockHost.has("outline")).toBe(false)`. It received `true`.
3. Mirrored rendering: I forced the right activity slot width to zero.
   `bun test src/modules/layout/LayoutModel.test.ts` went red. It expected
   `{ left: 116, width: 4, height: 39 }` and received
   `{ left: 120, width: 0, height: 0 }`.

## #262 disposition

#262 (structure activity action orphaned) is moot and can close. Structure and Tasks now
appear through the same registered-content surface as every other pane. The PTY smoke
clicks Structure from that surface, opens its current host, gives that host focus, and
toggles it closed.

## Verification

- `bun test`: 1,903 passed, 0 failed, 68,525 expectations in 294 files.
- `bun run typecheck`: passed.
- `node .claude/skills/invariants/scripts/check_invariants.mjs --all --refs`: 0
  problems, 1,104 annotations, and 220 lattice links.
- `bun scripts/harness/smoke-activitybar-harness.ts`: `ALL-PASS`.
- `bun scripts/harness/smoke-plugin-manifest-harness.ts`: `ALL-PASS`.
- `bun scripts/harness/smoke-layout-harness.ts`: `ALL-PASS`.
- `bun scripts/harness/smoke-settings-applied-harness.ts`: `ALL-PASS`; all 35 host
  schema fields have an applied-effect drive.
- The pre-commit merge gate passed. It ran the unit suite, invariant checks, 62 parallel
  PTY smokes, behavioral contracts, three serial checks, and the input-byte gate.
- `git diff --check`: passed.
- The worktree is clean after commit.

## Bycatch

- `bun run drive --size 100000` painted the complete 100,000-line frame and all six
  activity glyphs, then timed out after 15 seconds while it waited for quiescence. The
  same result occurred on a second run. I did not widen the timeout.
- On the first manual Settings drive, status published `settingsOpen=true` before the
  `Mirror activity bar on right` label painted. A text click missed. A later keyboard
  drive waited for both state and paint and did not reproduce the miss.
- The first commit gate saw starvation-class first attempts in the bounded-list popup
  and panel-chrome smokes. The final gate saw the same class in the bracket-match and
  panel-split smokes. Each smoke passed its automatic clean retry. No failure reproduced
  in its paired retry.

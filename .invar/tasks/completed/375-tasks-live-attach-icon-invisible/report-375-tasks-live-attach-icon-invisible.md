# READY — #375 tasks live attach icon and target freshness

Commit: `8f92c0a58eda4d23a0b8435adf380523d233a112`

GATE_EXIT: `0`

State: READY

## Outcome

The LIVE task view now paints a visible tmux attach control. The control has
readable Nerd Font, Unicode, and ASCII forms. A missing session marks the row
as `DEGRADED` and leaves no dead link.

Activation now reads the task's current `meta.json` and the current tmux
session list. It does this at click time. A metadata repair can therefore take
effect without a dashboard refresh.

The implementation is in
[TasksDashboardOverview.ts](../../../../src/modules/tasks-dashboard/TasksDashboardOverview.ts),
[TasksDashboardPaneRenderer.ts](../../../../src/modules/tasks-dashboard/TasksDashboardPaneRenderer.ts),
[TasksDashboardPlugin.ts](../../../../src/modules/tasks-dashboard/TasksDashboardPlugin.ts),
[tasks-status.ts](../../../../scripts/tasks/tasks-status.ts), and
[ThemeIcons.ts](../../../../src/modules/theme/ThemeIcons.ts).

## Cell-level diagnosis

The first real PTY drive painted this LIVE-row suffix:

```text
│ ◉ READY roun… ▰  ▤  ◫  ✓ │
```

The `READY` cells used foreground `4302517` on background `2830145`. The four
artifact icons used foreground `8037111` on the same background. No cell
contained a tmux attach icon.

The cause was zero painted width. The renderer registered the whole
`READY …` detail prefix as a session hit target, but it only painted the four
artifact controls. The defect was not equal foreground and background colors.
It was not a missing terminal glyph.

The renderer now gives the attach action its own painted segment and its own
hit span. The glyph comes from the theme's existing terminal-icon generator.
Its Unicode fallback is `❯`. Its ASCII fallback is `>`.

## Driven proof

The extended
[tasks dashboard PTY smoke](../../../../scripts/harness/smoke-tasks-dashboard-harness.ts)
uses an isolated task tree and a harmless fake `tmux` command.

The small drive proved these results:

- The dark-theme Unicode attach cell was nonblank and had different foreground
  and background colors.
- The light-theme attach cell stayed nonblank and readable.
- A separate ASCII-tier app painted `>` in a readable cell.
- Initial metadata named `planted-dead-session`. The fake session list omitted
  that name. The detail row painted `! DEGRADED`, and its tooltip named the
  missing target.
- The smoke changed `meta.json` to `planted-new-session` while the app stayed
  open. It clicked before the cached row refreshed. The opened terminal showed
  `FAKE TMUX ATTACH planted-new-session`.

The large drive used the shared 500-task fixture at 120 by 36 cells. It kept
the existing bounded visible-window projection and task count correct. The
narrow-terminal paint issue seen in that arm is recorded under Bycatch.

## Positive controls

The icon control was planted as one space in
[ThemeIcons.ts](../../../../src/modules/theme/ThemeIcons.ts). The smoke went red
with:

```text
FAIL the Unicode attach icon occupies a readable terminal cell
```

The click-time control was then planted to use the cached row target. The
smoke timed out while it waited for the new target. Its final grid showed:

```text
FAKE TMUX ATTACH planted-dead-session
```

Both plants were removed. The unchanged final smoke passed.

## Verification

The focused verification passed:

- TypeScript check: exit `0`.
- 65 focused tests: 65 passed, 528 expectations, 0 failed.
- Tasks dashboard PTY smoke: all arms passed.

The final local verification passed:

- `bunx tsc --noEmit`: exit `0`.
- `bun test`: 2,063 passed, 70,195 expectations, 0 failed across 317 files.
- Tasks dashboard PTY smoke: all arms passed.
- Invariant structure check: exit `0`.
- Invariant reference check: 1,229 annotations and 231 lattice links resolved,
  with 0 problems.
- Conventions gate: passed.

The first commit hook returned `GATE_EXIT=1`. It reproduced the filed
[panel chrome Agent-close flake (#214)](../../active/214-panel-chrome-agent-close-intermittent/task-214-panel-chrome-agent-close-intermittent.md)
and
[panel split order flake (#359)](../../active/359-panel-split-agent-terminal-order-intermittent/task-359-panel-split-agent-terminal-order-intermittent.md)
twice. It also saw the filed scrollbar deep-line wait pass on retry. The
[task brief](brief-375-2-tasks-live-attach-icon-invisible.md) names these
classes and says not to chase them.

The unchanged tree then passed the full commit hook. The hook reported
`merge-gate: ALL-PASS` and `GATE_EXIT=0`. The bounded-list popup and panel
split smokes passed only on their built-in retries. The hook recorded both as
flakes. The commit completed only after the green sentinel.

The worktree is clean.

## Invariant audit

The change checked every implicated record in
[tasks-dashboard.invariants.md](../../../../src/modules/tasks-dashboard/tasks-dashboard.invariants.md):

- **Task truth lives in the task tree:** strengthened. The task record now
  carries the session name read from its `meta.json`.
- **Dashboard motion stays off the main-checkout critical path:** upheld. One
  tmux session sample serves all visible task rows during a data probe.
- **Fleet extras stay separate from task-tree truth:** strengthened. Session
  identity no longer lives in the main-checkout fleet facts.
- **Tasks stay hidden until the task tree exists:** upheld.
- **CLI lenses and dashboard rows share one task-tree projection:**
  strengthened. Both use the metadata session name.
- **The dashboard pane is a native pane citizen:** upheld.
- **An absent task tree is a valid state:** upheld.
- **Rows keep one stable shape:** upheld. The degraded marker and attach
  action use the established detail row.
- **Dashboard controls are theme-owned:** upheld. The attach glyph comes from
  the theme action set.
- **Task actions enter through runtime seams:** strengthened. Click-time
  resolution happens before the terminal runtime opens.

The change also checked the implicated records in
[project.invariants.md](../../../../project.invariants.md):

- **Terminal color and glyph support varies:** upheld by dark, light,
  Unicode, and ASCII drives.
- **Cost tracks the actively observed set:** upheld. The dashboard samples
  sessions only while observed and only when in-progress rows exist.
- **Seams are drawn at the shared generator:** strengthened. The attach glyph
  derives from the existing terminal icon generator.
- **Appearance data has a complete fallback:** strengthened by the ASCII
  action glyph.
- **Plugin boundaries are explicit:** upheld. The dashboard still opens the
  terminal through the host runtime seam.
- **Coverage may fall, never silently:** strengthened by focused tests and the
  real PTY contract.

The theme behavior checked
[theme.invariants.md](../../../../src/modules/theme/theme.invariants.md):

- **Appearance comes only from theme data:** strengthened.
- **The glyph ladder degrades icons to single-cell and legible forms:**
  upheld by the Unicode and ASCII drives.
- **The palette ladder preserves contrast:** upheld by the dark and light
  drives.
- **One symbol-mark table owns source semantics:** not changed. The new mark
  is a control, not source semantics.
- **Capability detection and graphics tiers stay separate:** not changed.

The PTY proof checked
[harness.invariants.md](../../../../scripts/harness/harness.invariants.md):
isolated app homes, real PTY input and output, terminal-emulator cells as the
paint oracle, named condition waits, and awaited asynchronous state were all
upheld.

Missed records: none among the records implicated by this change.
Unimplicated records were not claimed as reverified.

## Bycatch

- At 120 by 36 cells in the 500-task drive, all theme-owned glyphs vanished.
  This included the pre-existing cycle, file-tree, and status glyphs as well
  as the task action glyphs. The task count and visible-window projection
  remained correct. The issue reproduced on a second run. The same Unicode
  and ASCII glyphs painted correctly at 150 by 40 cells. This task did not
  change the shared narrow-terminal paint path.
- The **glyph ladder degrades icons to single-cell and legible forms** record
  in
  [theme.invariants.md](../../../../src/modules/theme/theme.invariants.md)
  omits the pre-existing `TaskActionIconSet` and `taskActionIconsFor` from its
  scope, mechanism, and evidence lists. The implementation already existed
  before this task. This is a contract refinement gap, not a behavior change,
  so this task did not alter the record.

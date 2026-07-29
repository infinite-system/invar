# READY — #235 (the tasks dashboard pane: LIVE / ACTIVE / DONE, linked to the records)

State: READY — branch `fleet/235-tasks-dashboard-pane-live-active-done`. Feature commit
`a9633a04` (the full pre-commit merge gate ran GREEN on it, 61-smoke pool included), plus
bycatch commit `1757fe9f` (see Bycatch). Builder: claude · fable-5.

## What landed

The task system is now visible inside Invar as an ordinary dock contributor:

- **New module `src/modules/tasks-dashboard/`** — four production files, four test files, one
  invariants contract:
  - `TasksDashboardOverview.ts` — the reactive model. Three lenses (live / active / done) as
    row lists, selection, scroll, the cycling overview, and the absent-tree state.
  - `TasksDashboardPaneContent.ts` — the right-dock pane citizen (`id: 'tasks'`). StyledText
    cells surface only. Wheel, hover, click, tab-line hit-testing, scrollbar projection.
  - `TasksDashboardPaneRenderer.ts` — stateless Static renderer. Tab line + windowed rows.
  - `TasksDashboardPlugin.ts` — the manifest row (`tasks-dashboard`, "Tasks Dashboard").
    Registers the pane, `Ctrl+Shift+T` (`view.showTasks`), the `tasksDashboard` key context
    (arrows, Enter/Space open, Left/Right lens, `p` play/pause), the
    `tasksDashboardCycleSeconds` setting (default 10 s), and the `tasks*` status projection.
  - Registered in `DefaultPlugins` after the structure navigator.

- **The seam, honored as filed.** `scripts/tasks/tasks-status.ts` is now importable: the CLI
  entry point sits behind `import.meta.main`, and the readers are exported —
  `readTaskRecords`, `startedAtMilliseconds`, `formatDuration`, `agentIdentity`,
  `roundStamp`, `tasksTreeStamp`, `PRIORITY_ORDER`, plus three distillations extracted from
  lens-internal code so the pane cannot drift from the terminal:
  - `builderStanding` — the READY-versus-building round-anchor rule, pulled out of `live()`,
    which now calls it.
  - `landingStamp` — the meta.json landing facts; `landedTodayStats` now calls it.
  - `completedStateAttachment` — the landing-commit remainder; `completedLine` now calls it.
  - `TaskRecord` gains `taskFileName`, so consumers open the record without guessing names.
  The pane defines NO folder parser, no readiness rule, no duration formula. `--self-test`
  still passes; all CLI lenses behave as before; an import executes nothing (probed).

- **What only a pane can do.** ivue reactivity: one heartbeat (1 s) that returns immediately
  while the pane is unobserved; while observed it probes the CLI's directory stamp every 2 s
  and re-reads only on change; durations re-derive once a minute. Paints happen only when a
  ref changes — no redraw polling, no spinner clock. The motion vocabulary maps to still
  glyphs: READY `◉` green and still, building `●` teal, done `✔` green, round badge amber.
  Selection opens `task-<n>-<slug>.md` through `workspace.openFileInTab` + `focusEditor`.

- **Degrade.** A workspace without `.invar/tasks/` states "No task system in this workspace."
  plus a hint; empty lenses state the CLI's own wording (`IN-PROGRESS: none.` etc.).

- **Contract.** [src/modules/tasks-dashboard/tasks-dashboard.invariants.md](../../../../src/modules/tasks-dashboard/tasks-dashboard.invariants.md): one reality
  record (*Task truth lives in the folders the CLI reads*) and three chosen records (*The CLI
  lenses are the dashboard's one generator*, *The tasks dashboard is a pane content citizen*,
  *An absent task tree is stated, never blank*, *Selection opens the record through the
  workspace open seam*). A NEW record rather than extending [tasks.invariants.md](../../../../src/modules/tasks/tasks.invariants.md), and the
  contract says why: `src/modules/tasks` governs process launching; this module consumes the
  task-record folders — different generators, so the seam rule separates the contracts.
  Checker: `--all --refs` → 0 problems (1076 annotations resolved).

- **Smoke + gate.** New `scripts/harness/smoke-tasks-dashboard-harness.ts` behind
  `scripts/smoke-tasks-dashboard.sh`, wired into `behavioral-contracts.sh` beside the
  plugin-manifest contract. Seven arms: the three lenses over a planted real-shape tree
  (READY + building with round 2, duration, and agent identity; priority grouping; landing
  commit + 1h 15m duration), cycling play/pause with an observed lens advance, Enter opening
  the record into the editor (`findEditorText` proves the paint), Extensions uninstall
  (projection withdrawn, chord inert) / reinstall (pane and rows back), and a second driver
  proving the absent-tree degrade at the DEFAULT dock width.

- **File grammar.** The module is grammar-clean and ratcheted into `CONVERTED_MODULES`
  (repo-wide legacy violations now 0).

## The defect the first gate run caught (fixed before READY)

The first pre-commit merge gate went RED: 14 smokes timed out, and
`smoke-layout-harness` named the cause exactly — "FAIL right dock starts empty and hidden."
`PanelHost` reveals a dock-style slot on every registration
(`showWhenContentRegistered: true` in Bootstrap). The structure navigator's default-visibility
policy takes back the reveal its OWN registration causes; my second registration revealed the
dock again at boot, nothing took it back, and the 28-column dock shifted every full-width grid
expectation in 13 other smokes.

Fix: `TasksDashboardPlugin.activateApplication` captures dock visibility before registering and
takes back exactly the reveal the registration caused; an already-visible dock is left alone.
Two unit tests lock it (`registration does not reveal a hidden dock…`,
`activation leaves an already-visible dock alone`), the plugin test's host now uses the REAL
`showWhenContentRegistered: true` option, and re-driven boot shows `rightDockVisible=false`
while `Ctrl+Shift+T` still shows and focuses the pane. `smoke-layout` boot arm,
`smoke-mode-coherence` (20 PASS), and the tasks smoke (7/7) were re-run green before the second
gate run.

## Positive controls (convention 6)

- Planted `standing: ready && false ? …` in `buildLiveRows` → the live-lens smoke arm went
  RED ("Timed out … the live lens paints the READY and building rows"). Removed.
- Planted a blank headline in the absent-tree renderer → the degrade arm went RED ("Timed
  out … the absent tree is stated, never a blank pane"). Removed. Green after both reverts.

## Driven evidence (the primary loop)

- `bun run drive --open . --key Control+Shift+t` — the pane shows in the right dock, tab line
  `LIVE ACTIVE DONE ▷`, row `● #259 right-dock-click-…` (the real in-progress task).
- Left/Right walk the lenses; `tasksSelectedFile` follows (`#263` active, `#264` done).
- Enter and `--click 'text=#259'` both open the record: `activeBuffer` ends with
  `task-259-….md`, focus `editor`.
- Tab clicks switch lens (`text=DONE`, `text=ACTIVE`); wheel over the pane scrolls the done
  lens (probed with the PTY driver).
- Degrade driven on a bare workspace: `tasksAvailable=false`, stated affordance painted.
- **Scale parity** (probe committed as
  `.invar/tasks/in-progress/235-…/probe-235-tasks-pane-scale.ts`): 438 planted tasks —
  boot 193 ms, show 42 ms, done-lens switch over 400 rows 13 ms, ten wheel notches 32 ms.
  Small (5-task fixture) and large behave the same; the windowed renderer holds (also unit-
  tested at 5,000 rows).

## Verification (one pass at the end)

- `bun test` — 1878 pass, 0 fail (291 files).
- `bunx tsc --noEmit` — clean. `scripts/conventions-gate.sh` — PASS.
- `node .claude/skills/invariants/scripts/check_invariants.mjs --all --refs` — 0 problems.
- `bun scripts/tasks/tasks-status.ts --self-test` — all signals fire, clean control silent.
- Smokes: `smoke-tasks-dashboard.sh` 7/7 PASS; `smoke-plugin-manifest.sh` all PASS (one arm
  updated, see below); `smoke-activitybar.sh` 32 PASS (its Extensions walk tolerates the new
  row).

## Deliberate decisions (and one smoke expectation change)

- **The plugin-manifest structure-uninstall arm changed.** It asserted
  `rightDockVisible === false` after uninstalling the structure navigator. `PanelHost` hides
  a dock only when its content set empties; with the tasks pane as a second right-dock
  citizen, the dock now falls back to `tasks` and stays visible. The arm now asserts exactly
  that fallback. This is host behavior meeting a second citizen, not a regression.
- **Gate glance, line deltas, and the exploring/building split stay CLI-only for now.** The
  gate glance reads a `/tmp/fleet-watch-gates` registry and the line deltas spawn git against
  worktrees anchored to the Invar repo, not to the opened workspace — repo-fleet facts, not
  workspace facts. The pane states standing (READY / building), round, duration, identity.
  Porting the fleet-anchored extras is a clean follow-up at the same seam.
- **No PTY-widget interim.** The native pane landed, so the interim the user named
  unnecessary was skipped.
- **No default-visibility policy.** The pane shows on gesture (`Ctrl+Shift+T`, activity
  action, palette). A wall-display auto-show like `structureShowByDefault` is a follow-up if
  wanted.

## Bycatch (all seven categories considered)

- **Pre-existing, reproduced (matches open #259, right-dock-click-leaves-double-focus):**
  clicking a task row opens the record and the pane blurs itself, yet `rightDockFocused`
  stays `true` after the click (drive: `--key Control+Shift+t --click 'text=#259'` →
  `activeBuffer` set, `rightDockFocused=true`). The keyboard path (Enter) ends with
  `rightDockFocused=false` correctly. Same family as #259's subject; host-level pointer focus
  lands after the content's handler. Not touched here.
- **Plain nonsense (pre-existing, FIXED, own commit `1757fe9f`):**
  `scripts/tasks/tasks-status.ts` imported `basename` from `node:path` and never used it.
  One-token removal in its own commit (SKIP_GATE, since the full gate had just run green on
  `a9633a04` and the change is behavior-free); `--self-test` re-run green.
- **Contract-layer gap:** the task-record system itself (`.invar/tasks/` layout, meta.json
  stamps, the drift signals) has no `*.invariants.md` domain record — its law lives in the
  script's header comment and the manage-tasks skill. Now that the readers feed a production
  UI, a [scripts/tasks/tasks.invariants.md](../../../../src/modules/tasks/tasks.invariants.md) (or extension of the manage-tasks contract) is
  owed. Not authored inside this task per [AGENTS.md](../../../../AGENTS.md).
- **Smoke-assumption drift (fixed in-task, own hunk):** the manifest smoke's
  `rightDockVisible === false` assumption encoded "structure is the only right-dock citizen";
  updated with a comment naming the surviving-citizen rule.
- Invariant-violated-in-function, distillation candidates beyond the three extracted at the
  seam, generator drift: none observed.

## Follow-ups the conductor may want to file

1. Fleet extras in the pane (gate glance, ±line deltas, exploring/building) once those
   readers grow workspace-anchored forms.
2. `tasksDashboardShowByDefault` for the wall-display case.
3. The task-system contract record (bycatch above).
4. Remove the unused `basename` import (bycatch above).

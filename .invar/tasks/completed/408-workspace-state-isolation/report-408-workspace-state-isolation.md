# READY — #408 Workspace state isolation (round 2: merged forward, now covering the v2 panel)

- Branch: `fleet/408-workspace-state-isolation`
- **Merge commit: `692d2541`** — `merge main into #408: workspace isolation now covers the v2 panel model`
- Earlier commits on the branch: `c539d523` (the isolation fix), `9f152742` (bycatch)
- Merged in: `main` at `df0b092b`, carrying **#404** (panel chrome v2 — containers, window groups,
  the pinned contents list) and **#381** (LSP discovery)
- Gate: `GATE_EXIT=0` on the combined tree, read from the pre-commit hook's own log
  (`/tmp/408-merge-commit2.log:223`). `merge-gate: ALL-PASS`, 82 smokes OK, no `FAIL` lines.
  **Two steps passed only on retry** — see *Gate honesty* below.
- Worktree: clean. Nothing pushed, merged into main, tagged, or deleted.

---

## 1. The merge

Six files overlapped. Five auto-merged; one conflicted.

| File | Outcome |
|---|---|
| `src/modules/app/AppStatusProjection.ts` + its test | auto-merged |
| `src/modules/app/Bootstrap.ts` | auto-merged |
| [src/modules/layout/layout.invariants.md](../../../../src/modules/layout/layout.invariants.md) | auto-merged |
| `src/modules/ui/RootView.ts` | auto-merged |
| [src/modules/workspace/workspace.invariants.md](../../../../src/modules/workspace/workspace.invariants.md) | **conflict — resolved by hand** |

The conflict was narrow and both sides were additive: the record's **Evidence** line. #404 had added
`PanelWorkspaceState.test.ts`; round 1 had added the isolation smoke. The resolution keeps both, so
both intents hold:

```
`src/modules/ui/PaneRuntimes.test.ts`; `src/modules/ui/PanelWorkspaceState.test.ts`;
`scripts/harness/smoke-workspace-tabs-harness.ts`;
`scripts/harness/smoke-workspace-layout-isolation-harness.ts` (the geometry rows of the table).
```

A clean textual merge is not a clean semantic one, so the auto-merged files were checked rather than
trusted. The one that mattered was `RootView.ts`: round 1 moved the bottom-panel height out of a
local `let` and into `LayoutSlots.bottomPanelRows`, and #404 rebuilt the panel chrome around it.
All six of round 1's slot reads and writes survived intact, and the layout resolve still consumes
`layoutSlots.rightDockColumns` rather than the settings field — the exact line that broke the layout
smoke in round 1. `tsc --noEmit` is clean, the invariants checker resolves 1284 annotations and 231
lattice links with 0 problems, and the isolation smoke passes on the combined tree.

---

## 2. Does the NEW panel model leak?

**No.** Driven, not reasoned about.

A second census probe — [`census-408-panel-v2-leak-probe.ts`](census-408-panel-v2-leak-probe.ts) —
shapes workspace A across the state classes that did not exist when round 1 ran, opens a brand new
workspace B, and reports every field B inherited:

```
bun .invar/tasks/in-progress/408-workspace-state-isolation/census-408-panel-v2-leak-probe.ts
```

A gets a second container (agent beside terminal), a window group inside the selected container, and
a contents list pinned open and dragged from 20 to 27 columns. Then B opens **and opens its own
panel** — a closed panel answers every v2 question with a blank, so comparing against it would score
B's emptiness as isolation.

```
== A-SHAPED (v2 panel state established in workspace A) ==
  panelActiveSpacePaneIds: ["terminal"] -> ["terminal","agent"]
  panelActiveGroup: "terminal-space-1-group-2" -> "terminal-space-1-group-4"
  panelGroups: [["terminal"]] -> [["agent","terminal"]]
  panelCellIds: ["terminal"] -> ["agent","terminal"]
  panelListExpanded: false -> true
  panelListWidth: 0 -> 27

== LEAKED INTO B (B carries A-shaped value instead of the boot default) ==
  (none)

== NOT RESTORED IN A (A -> B -> A lost the value A had) ==
  (none)

== PINNED CONTENTS LIST WIDTH ==
  workspace A dragged width: 27
  workspace B own width: 0
  VERDICT: isolated — B did not inherit A dragged width
```

The `CHANGED IN B BUT MATCHING NEITHER` list is not empty, and that is the correct answer rather
than a finding: B shows `["terminal@2"]` and `terminal-space-1-group-5` — its own pane instance and
its own group identity. Different from A, different from A's boot value, because they are B's.

**No production change was needed.** `PanelHost` already snapshots and restores containers, the
selected container, groups, the list pin and the list width per `PanelContentSet`
(`PanelHost.ts:260-261` and `:275-276`), and a new content set starts at `panelListExpanded: false`
and `panelListWidth: 20`. #404 built it scoped. What was missing was not behaviour — it was the
contract saying so, and an arm that would notice if it stopped being true.

**The probe was proved capable of finding a leak before its silence was believed.** With the
per-content-set restore of the list state removed from `PanelHost`, the same probe reported:

```
== LEAKED INTO B (B carries A-shaped value instead of the boot default) ==
  panelListExpanded: false -> true
```

and the extended smoke went red on exactly that arm (`CONTROL_SMOKE_EXIT=1`,
`FAIL a new workspace opens with its contents list unpinned (expanded=true, ...)`). `PanelHost.ts`
was restored from a backup and `git diff` on it is empty.

---

## 3. Contract

**Smoke extended** — [`smoke-workspace-layout-isolation-harness.ts`](../../../../scripts/harness/smoke-workspace-layout-isolation-harness.ts)
now shapes the v2 panel in workspace A and carries four more arms:

| Arm | What it caught in the run |
|---|---|
| pinned contents list state does not leak | B `expanded=false, painted width 0`; A holds 27 |
| window grouping does not leak | B has ONE pane; A holds `["agent","terminal"]` |
| container pane identifiers do not leak | B shows `["terminal@2"]`, not A's identifiers |
| A→B→A restores the container, its group, and the pinned list | list painted 27 of 27, cells and container both A's |

The list width arm reads the **painted** region (`panelListGeometry`), not the model cell the drag
writes — the same rule round 1 arrived at the hard way, when a smoke that asserted only published
numbers passed while the layout resolve was stale.

**Workspace record refined** — [`workspace.invariants.md`](../../../../src/modules/workspace/workspace.invariants.md):
the scoped-set table's panel row now names *containers, selected container, window groups, pane-list
pin, pane-list width* explicitly; Impossible-if-true gains *"a brand new workspace opening with A's
contents list already pinned, at A's dragged width, or with A's window group already assembled"*;
Verification runs the isolation smoke.

---

## 4. Round 1 still holds

Unchanged by the merge, restated for one place to read:

Six leaks were found by driving and closed — primary dock visibility and width, right dock
visibility, content and width, and bottom panel height. They now flow through the layout module's
own `WorkspaceContribution` (`WorkspaceLayoutContributor` → `WorkspaceLayout` → `LayoutSlots`),
not a central flag bag. A drag writes two things with two meanings: the live slot this workspace
owns, and the settings field a *new* workspace starts from. New-workspace defaults are captured once
at first attachment; reading them live would reinstate the leak one level up.

---

## 5. Verification

| Check | Result |
|---|---|
| `bunx tsc --noEmit` (combined tree) | 0 errors |
| conventions gate | PASS (770 files, 295 live harness files) |
| invariants `--all --refs` | 1284 annotations, 231 lattice links, **0 problems** |
| full merge gate (pre-commit hook) | `GATE_EXIT=0`, `ALL-PASS`, 82 smokes OK, 6m44s |
| isolation smoke standalone | ALL PASS, including all four new v2 arms |
| v2 census probe | no leaks, nothing lost on return |
| positive control (list restore removed) | probe reports the leak; smoke arm fails |

### Gate honesty

The gate went green, but its own retry tally says two steps **passed only on retry** —
`smoke: panel-chrome harness` and `behavioral-contracts (felt invariants)`. The gate is explicit
that a retried pass is a flake, not a green, so this is reported rather than skimmed.

What I established about them:

- `smoke: panel-chrome harness` passes **3 of 3** standalone runs on this tree.
- An earlier attempt at this same commit failed on `smoke: markdown harness` (a code-fence
  background colour assertion). That smoke also passes standalone on this tree, and the failing
  assertion is a truecolor-dependent colour check in a file this branch does not touch.
- `.perf-history/gate-retries.ndjson` records the same flake class at the **base** commit
  `87087627`, before any of this work: `smoke: layout harness` and `smoke: git-watch harness`,
  both correlated with load average above 5.

So this is a pre-existing, load-correlated flake population in the gate, not something the merge
introduced. It is not fixed here, and it should not be treated as fixed.

---

## Bycatch

**Observed, not fixed — gate flake population.** Recorded above under *Gate honesty*: at least five
distinct smokes (`panel-chrome`, `markdown`, `layout`, `git-watch`, `behavioral-contracts`) have
passed only on retry across six gate runs today, including at the base commit before this branch
changed anything. The common factor is gate load, not any one smoke. This is a real defect in the
verification machinery — a retried green is exactly the thing the repo has been burned by — but it
belongs to whoever owns the flake work, and I did not want to widen this task into it without a
decision. Flagging it with the evidence: `.perf-history/gate-retries.ndjson`, six runs recorded.

**Fixed in round 1 — `9f152742`.** `src/modules/ui/RootView.ts` described the activity bar as
switching `Workspace.sidebarView` through `Workspace.showSidebarView`. Neither member exists; the
real ones are `Workspace.primaryPaneContentIdentifier` and `Workspace.focusPrimaryPane`. Comment
only, its own commit.

Nothing else observed.

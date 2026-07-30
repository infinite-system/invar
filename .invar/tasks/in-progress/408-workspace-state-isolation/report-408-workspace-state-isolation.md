# READY — #408 Workspace state isolation: dock and panel geometry becomes workspace owned

- Branch: `fleet/408-workspace-state-isolation`
- Commit: `c539d523` — `#408 workspace state isolation: dock and panel geometry becomes workspace owned`
- Bycatch commit: `9f152742` — `fix(ui): correct stale member names in the activity-bar comment`
- Base: `87087627`
- Gate: `GATE_EXIT=0`, read from the pre-commit hook's own log for **both** commits
  (`/tmp/408-commit.log:221` and `/tmp/408-bycatch.log:221`). No `FAIL` lines; 66 of 66 smokes OK,
  including the new `smoke: workspace layout isolation harness`.
- Worktree: clean. Nothing pushed, merged, tagged, or deleted.

The user's words: *"opening different panels in different workspace should remain open in that
workspace only not leak to other workspaces, positioning of things should remain to that workspace
only."* Six pieces of state leaked. All six are closed. The panel-model files #404 is rebuilding
were not touched, and nothing in that area leaked.

---

## 1. Census — every piece of UI state, classified

Built by enumeration, not memory: every field the application publishes through
`AppStatusProjection`, walked one at a time and traced to the object that owns it. The
non-leaking rows are here on purpose — the negative space is the finding.

### Workspace-scoped, and was already correct

| State | Owner | Why it was already isolated |
|---|---|---|
| Primary dock content (`sidebarView`: files/git/structure/…) | `Workspace.primaryPaneContentIdentifier` | Lives on the workspace object itself |
| Primary dock focus | `Workspace.focusPrimaryPane` / workspace focus model | Same |
| Bottom panel visibility, expanded, active content, cell set | `PanelHost` content sets (`createContentSet` / `selectContentSet`) | The panel already switches a whole content set per workspace |
| Terminal + agent pane sessions | `PaneRuntimes` | Keyed by workspace |
| Editor tabs, active buffer, cursor line, scroll top, folds | `OpenBufferSet` / `DocumentHandle` | Per workspace by construction |
| File tree expansion + selection | `FileTreeWorkspace` (a `WorkspaceContribution`) | Attached per workspace |
| Source control state | `GitWorkspace` (a `WorkspaceContribution`) | Attached per workspace |
| Language / diagnostics state | `LspWorkspaceProvider` | Attached per workspace |

### Application preferences — global on purpose, must NOT be scoped

| State | Owner |
|---|---|
| `showActivityBar`, `showRightActivityBar` | `Settings` |
| `sidebarPosition` (left/right) | `Settings` |
| `panelAlignment` | `Settings` |
| `leftDockVerticalSpan`, `rightDockVerticalSpan` | `Settings` |
| `workspaceTabPosition` | `Settings` |
| `wordWrap`, theme, keybindings, font | `Settings` |

These are answers to "how do I like my editor", not "what was I doing in this project". A user who
moves the sidebar to the right means it for the editor, not for one folder. Scoping them would have
been a regression dressed as a fix.

### Leaked — the six this task fixes

| State | Published as | Owner before | Owner now |
|---|---|---|---|
| Primary dock visibility | `primaryDockVisible` | `primaryDockHost` (one app-wide instance) | `LayoutSlots` + `WorkspaceLayout` |
| Primary dock width | `sidebarWidth` | `settings.sidebarWidth` (a preference, read live) | `LayoutSlots.primaryDockColumns` |
| Right dock visibility | `rightDockVisible` | `rightDockHost` | `LayoutSlots` + `WorkspaceLayout` |
| Right dock content | `rightDockActiveContent` | `rightDockHost.activeId` | `LayoutSlots` + `WorkspaceLayout` |
| Right dock width | `rightDockWidth` / `rightDockColumns` | `settings.rightDockWidth`, read live | `LayoutSlots.rightDockColumns` |
| Bottom panel height | `panelRows` | a `let panelHeightRows` closure variable in `RootView` | `LayoutSlots.bottomPanelRows` |

The last row is the shape of the whole defect in miniature: the height of the bottom panel was a
local variable in a function that runs once, for the application, for all time.

---

## 2. Reproduced by driving

The probe is committed at
[`census-408-workspace-state-leak-probe.ts`](census-408-workspace-state-leak-probe.ts). It drives
the real application in a pseudo terminal against two throwaway fixture workspaces, shapes workspace
A across every drivable state class (hide the primary dock, drag it to 36, open the right dock on
`tasks` and drag it to 34, open a terminal in the bottom panel and drag it to 21 rows), opens a
brand new workspace B, and prints every field where B carries A's value instead of the boot default.
Then it returns to A and prints what A lost.

```
bun .invar/tasks/in-progress/408-workspace-state-isolation/census-408-workspace-state-leak-probe.ts
```

**Before (`87087627`, base sources restored in place and re-run for this report):**

```
== LEAKED INTO B (B carries A-shaped value instead of the boot default) ==
  primaryDockVisible: true -> false
  sidebarWidth: 32 -> 36
  rightDockVisible: false -> true
  rightDockActiveContent: "structure" -> "tasks"
  rightDockWidth: 28 -> 34
  rightDockColumns: 0 -> 32

== BOTTOM PANEL HEIGHT ==
  workspace A default rows: 16
  workspace A dragged rows: 21
  workspace B own-open rows: 21
  VERDICT: LEAK — B inherited the height A dragged
```

**After (`c539d523`):**

```
== LEAKED INTO B (B carries A-shaped value instead of the boot default) ==
  (none)

== CHANGED IN B BUT MATCHING NEITHER (inspect by hand) ==
  (none)

== BOTTOM PANEL HEIGHT ==
  workspace A default rows: 16
  workspace A dragged rows: 21
  workspace B own-open rows: 16
  VERDICT: isolated — B opened at its own height

== NOT RESTORED IN A (A -> B -> A lost the value A had) ==
  (none)
```

One honest note on the `NOT RESTORED IN A` list: it read `(none)` **before** the fix too, and that
was not a pass. Before the fix nothing was scoped, so returning to A trivially "restored" A's values
because B had never stopped showing them. That heading only becomes evidence once `LEAKED INTO B` is
empty — which is why the probe prints both and the smoke asserts both.

---

## 3. The fix, and why it is shaped this way

The task addendum: *"yes modular architecture should be preserved and better strengthened by this
change."* So the fix does not add a workspace-switch handler that reaches across modules and
restores a bag of flags. It goes through the seam the codebase already has.

`WorkspaceContributor` / `WorkspaceContribution` (`attachWorkspace` → `opened` / `suspended` /
`resumed` / `disposed`) **is** the workspace cold-state seam. `GitWorkspace`, `FileTreeWorkspace`,
`LspPlugin` and Tasks already ride it. The layout module now does too, and it is the layout module's
own contribution — no other module learned anything about workspaces.

Four new files, all in `src/modules/layout/`:

| File | Role |
|---|---|
| [`WorkspaceLayoutSlotPorts.interface.ts`](../../../../src/modules/layout/WorkspaceLayoutSlotPorts.interface.ts) | The port pair: `readSlots()` / `applySlots()`, plus the `WorkspaceLayoutSlotValues` record of what one workspace owns |
| [`LayoutSlots.ts`](../../../../src/modules/layout/LayoutSlots.ts) | The owner the three sizes never had — dock columns and panel rows as reactive refs |
| [`WorkspaceLayout.ts`](../../../../src/modules/layout/WorkspaceLayout.ts) | The per-workspace contribution: `opened` seeds from the new-workspace defaults, `suspended` captures, `resumed` re-applies |
| [`WorkspaceLayoutContributor.ts`](../../../../src/modules/layout/WorkspaceLayoutContributor.ts) | Attaches one contribution per workspace; captures the application defaults **once**, at the first attachment |

`Bootstrap` supplies the adapter — the only place that knows both the layout slots and the dock
hosts — and registers the contributor. That is the whole wiring.

Three decisions worth naming:

**A drag writes two things with two meanings.** Dragging the sidebar splitter writes
`LayoutSlots.primaryDockColumns` (this workspace's live geometry) *and* `settings.sidebarWidth` (the
width the next new workspace, and the next session, starts at). Before, there was one number doing
both jobs, which is exactly why it leaked.

**Defaults are captured once.** `WorkspaceLayoutContributor` reads the ports for the new-workspace
defaults at the first attachment and caches. Reading them live would mean a new workspace inherits
whatever the *current* workspace happens to look like — the same leak, one level up. A positive
control confirmed this: made the getter read live, the test went red with `expected 32, received
64`.

**Restoring geometry never moves the keyboard.** `applySlots` writes `visible.value` directly and
calls `blur()` on hide, rather than `show()`/`hide()`, because those also claim and release keyboard
focus. Focus belongs to the workspace focus model, not the geometry restore. This was found by
driving: `rightDockFocused` failed to restore after A→B→A on the first attempt.

Rejected: a central `workspaceState` flag bag in `Bootstrap` or `WorkspaceSet` — it would have been
fewer lines and would have made every future scoped state a change to a shared file owned by nobody.
Also rejected: scoping the `Settings` fields themselves, which would have turned preferences into
per-project state.

---

## 4. Contract

**New invariant record** — *"Layout slot sizes are workspace scoped"* in
[`layout.invariants.md`](../../../../src/modules/layout/layout.invariants.md), with five components:
one owner per size; scoping is a contribution, not a special case; defaults are captured once; a
drag writes two things with two meanings; restoring geometry never moves the keyboard. Status
provisional.

**Workspace records refined** — [`workspace.invariants.md`](../../../../src/modules/workspace/workspace.invariants.md)
now carries **"The complete workspace-scoped set"**: an eight-row table naming every scoped state
class and its owning module, plus an explicit paragraph on what is *not* workspace state
(application preferences) and a note on transient overlays. "Each workspace owns one panel world"
now points its dock-geometry clause at the new layout record instead of describing it inline.

**New gated smoke** —
[`smoke-workspace-layout-isolation-harness.ts`](../../../../scripts/harness/smoke-workspace-layout-isolation-harness.ts),
registered in [`merge-gate.sh`](../../../../scripts/merge-gate.sh). One arm per state class: dock
visibility, dock widths, right-dock content, panel height, and A→B→A restoration.

The smoke asserts painted geometry, not just published numbers. My first version asserted only the
status fields — which are written from the same cells the code writes, so they would have agreed
with each other while the screen showed something else. It passed while the layout resolve was
stale. `paintedSlotWidth()` now reads the *resolved* `layoutSlots` geometry the renderer actually
used.

Positive controls, each made red on purpose and then green:

| Control | Result |
|---|---|
| Contributor reads defaults live instead of capturing once | test red — `expected 32, received 64` |
| `resumed()` body removed | 2 tests red |
| Contributor registration removed from `Bootstrap` | smoke `PLANTED_EXIT=1`, `RESTORED_EXIT=0` |

---

## 5. Verification

| Check | Result |
|---|---|
| `bunx tsc --noEmit` | 0 errors |
| `bun test` | 2172 pass, 0 fail |
| conventions gate | PASS |
| invariants `--all --refs` | 1280 annotations, 231 lattice links, **0 problems** |
| full merge gate (pre-commit hook, both commits) | `GATE_EXIT=0`, 66/66 smokes OK |
| layout module tests | 58 pass (9 new) |

---

## 6. Left for #404

None. This is a real result, not an omission: the panel-model files #404 is rebuilding
(`PanelHost`, `PanelTabBar`, panel persistence) were not edited, and the probe found **no leak** in
anything they own. Bottom-panel visibility, expanded state, active content and cell set were all
already isolated by `PanelHost`'s content sets and appear in the `ISOLATED` list in both probe runs.
The one panel-adjacent leak — the panel's *height* — was never panel-model state at all; it was a
`let` in `RootView`, and it now lives in `LayoutSlots` alongside the dock widths.

What #404 should know: `LayoutSlots.bottomPanelRows` is now the single owner of the unexpanded
panel height, and the layout contribution carries it across switches. A rebuilt panel model should
read and write that ref rather than reintroducing a local.

---

## Bycatch

**FIXED — `9f152742`.** `src/modules/ui/RootView.ts:373` described the activity bar as switching
`Workspace.sidebarView` through `Workspace.showSidebarView`. Neither member exists; the real ones
are `Workspace.primaryPaneContentIdentifier` and `Workspace.focusPrimaryPane`. Found while tracing
the primary dock's content state for the census — a stale comment is exactly the thing that makes an
enumeration census misclassify a row. Comment only, no behaviour change, its own commit as required.

Nothing else observed.

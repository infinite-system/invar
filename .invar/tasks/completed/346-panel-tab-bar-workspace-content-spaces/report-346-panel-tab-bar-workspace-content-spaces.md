# READY — #346 panel tab bar with workspace content spaces

Commit: `9ac75e4b16d540425b258888934e13d14c948112`

Gate: `GATE_EXIT=0`

The worktree is clean. I did not push or land the branch.

## Result

The bottom panel now has one flat workspace-scoped tab row. A tab owns a
multi-pane content space. The panel no longer paints pane titles, pane close
buttons, or rounded pane frames.

The implementation replaces the old heading and separator components with
[PanelTabBar.ts](../../../../src/modules/ui/PanelTabBar.ts). The existing
[PanelHost.ts](../../../../src/modules/ui/PanelHost.ts) now owns each workspace's
space order, active space, pane order, layout, and focus. It does not create a
second content registry.

The Database consumer registers through the existing application contribution
and provider registry. It appears as the `Database` content space beside
`Terminal`.

## Driven evidence

1. The baseline drive showed the former terminal title row and rounded blue
   frame. The final 120 by 40 Unicode and 88 by 24 ASCII drives showed no
   pane-local title or frame.
2. The tab row painted `Terminal  Database`. `Alt+PageDown` selected Database.
   A mouse click on the published Terminal tab geometry selected Terminal
   again.
3. Automatic cycling was off by default. With `panelTabCycleSeconds: 1` and
   `panelTabCycling: true`, the visible panel moved from Terminal to Database
   after one interval. The Settings projection puts the interval and its
   play/pause companion on one row.
4. The Add control opened the generic content picker. It listed Media,
   Terminal, Agent, and Database. Selecting Terminal created `Terminal 2`.
   The same generator assigns `Database 2`.
5. Two panes kept the management list hidden. The real four-pane task drive
   painted the icon-and-count chip only above two panes. Unit drives cover chip
   toggle, click-away collapse, row activation, reorder, and close.
6. The task drive loaded two declared `folderOpen` tasks as separate live panes
   in declaration order. Claude stayed on the left and Terminal stayed on the
   right.
7. The stack glyph is one cell in Nerd Font, Unicode, and ASCII tiers. The
   count chip and tabs use the same hover background and accent treatment.
8. Tabs and pane bodies contain no close controls. Close and reorder live in
   the expanded management list. The remaining `×` on the row closes the whole
   panel.
9. The split drive kept Agent and Terminal side by side inside one active
   space. It proved focused input routing, child PTY width, and direct divider
   reflow.
10. The active tab uses the selection background. Focus adds the accent
    foreground. Each pane still receives its focused projection, so terminal
    caret and agent composer focus remain visible without a frame.

Workspace isolation was driven in both directions. Each workspace retained its
own content identifiers, processes, scrollback, tab set, active space, and pane
layout across workspace switches.

Scale drives used the shared 10-line and 100,000-line fixtures at 100 by 30.
Both produced the same 63 by 12 panel geometry and the same tab behavior.

## Verification

- Positive control: changing the count-chip threshold from more than two panes
  to more than three made
  [PanelTabBar.test.ts](../../../../src/modules/ui/PanelTabBar.test.ts) fail its
  exact chip-boundary assertion. Restoring the threshold returned it to green.
- Focused unit layer: 83 tests passed with 632 expectations.
- Full unit layer: 2,047 tests passed with 69,746 expectations.
- Conventions and TypeScript checks passed.
- The invariant checker resolved 1,215 annotations and 223 lattice links with
  zero problems.
- The 65-job PTY pool passed. This included panel chrome, panel split, tasks,
  Database, workspace tabs, keyboard routing, terminal, agent, scrollbar,
  settings, layout, and media drives.
- The behavioral contract passed.
- The input-byte gate passed across five sessions. Its median was 4.960 ms and
  its p95 was 6.599 ms.
- The merge gate reported a clean green with no retry-only pass.

The known #214 panel-chrome and #359 panel-split classes did not bite. Both
targeted drives passed before commit, and both passed on the first attempt in
the commit gate.

## Invariant verdicts

The records are in
[layout.invariants.md](../../../../src/modules/layout/layout.invariants.md),
[ui.invariants.md](../../../../src/modules/ui/ui.invariants.md),
[plugins.invariants.md](../../../../src/modules/plugins/plugins.invariants.md),
[workspace.invariants.md](../../../../src/modules/workspace/workspace.invariants.md),
[settings.invariants.md](../../../../src/modules/settings/settings.invariants.md),
and
[database.invariants.md](../../../../src/modules/database/database.invariants.md).

- `A split ratio stays within zero and one`: upheld.
- `Split arrangement follows panel content order`: upheld inside each active
  space.
- `Layout slots derive from one configuration`: upheld.
- `Default panel height scales with the viewport`: upheld at both scale
  endpoints.
- `Expanded panel overrides only the editor center rows`: upheld.
- `Only a drag in progress moves the size`: upheld.
- `Size changes flow through the onSizeChange seam`: upheld.
- `Panel controls share paint and hit geometry`: upheld by the tab-row
  projection.
- `Tab bars share paint and hit geometry`: upheld for mouse selection and all
  controls.
- `The panel renders exactly the visible pane content cells each frame`:
  upheld.
- `A split panel renders every visible cell into its own sub-region`: upheld.
- `One panel host owns keyboard focus`: upheld.
- `A focused panel routes keystrokes to its active pane content`: upheld.
- `A focused split panel routes keystrokes to the focused cell`: upheld.
- `Plugin panes use the shared pane and popup hosts`: upheld. Database uses the
  same panel host and bounded picker.
- `Provider rendezvous is host carried`: upheld. Database still meets its
  provider through the host registry.
- `Database providers meet through the host registry`: upheld.
- `Database files are user selected`: upheld.
- `Plugin settings live in contributed schema`: upheld.
- `Every setting is a reactive cell read through its value ref`: upheld for the
  interval and play toggle.
- `Each workspace owns one panel world`: upheld. This record was not named in
  the brief, but it directly governs the new workspace-scoped tab set.
- `The panel contents list mirrors open content`: needs refinement. Proposed
  wording: “When expanded, the panel management list mirrors the active
  space's open panes. It stays collapsed by default, and its count chip appears
  only above two panes.”
- `Panel content order is one persisted sequence`: needs refinement. Proposed
  wording: “Each workspace persists one ordered content-space sequence. Each
  space persists one ordered pane sequence. The settings order seeds new
  workspace defaults.”
- `Visible panel contents own separate headed regions`: needs refinement.
  Proposed wording: “Visible panel contents own separate pane regions inside
  the active content space. The workspace tab row is the panel's only
  persistent chrome.”

I did not edit invariant records because the task asked for proposed
refinements.

## Bycatch

- Contract drift: `Visible panel contents own separate headed regions` still
  requires a heading that the requested design removes. The proposed
  replacement is above.
- Contract gap: the UI records do not yet state that a space is a multi-pane
  container or distinguish space order from pane order.
- Database focus bug, reproduced three times: after a failed connection,
  `Database: Connect` can make the path input active while another content
  space remains visible. Keystrokes then do not edit the hidden field. The
  drive now selects the Database tab before editing. I did not change this
  separate behavior.
- One pre-commit manual behavioral run reported 995 fold-dense rows against
  its 1,000-row floor while maintaining 30 fps. It did not reproduce in the
  commit gate; the behavioral contract passed there.
- No #361 panel-teardown or terminal-buffer-write crash appeared.

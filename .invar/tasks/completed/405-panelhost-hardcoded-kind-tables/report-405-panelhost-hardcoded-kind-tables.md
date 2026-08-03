# READY report — panel kind declarations replace host tables

## In plain words

The panel host treated every new pane as Terminal unless it was Database. I moved the space name
and label into each pane registration, so Media now opens in a Media space and future pane kinds do
not need a new host branch. Terminal and Database still open in their original spaces.

## Result

READY at commit `5e40c8037f2bbd297ce973b07baa812aec96c273` (`fix panel spaces from pane
kind declarations`). The worktree is clean.

The panel now keeps one pane-kind map in
[PanelHost.ts](../../../../src/modules/ui/PanelHost.ts). Runtime and factory contributors feed that
map through [ApplicationContributions.ts](../../../../src/modules/app/ApplicationContributions.ts).
Each declaration contains the pane kind, the target space kind, and the base space label.

- [TerminalPlugin.ts](../../../../src/modules/terminal/TerminalPlugin.ts) declares the Terminal
  space.
- [DatabaseConsumerPlugin.ts](../../../../src/modules/database/DatabaseConsumerPlugin.ts) declares
  the Database space.
- [MediaPlugin.ts](../../../../src/modules/media/MediaPlugin.ts) declares the Media space.
- [AgentPaneContent.ts](../../../../src/modules/agent/AgentPaneContent.ts) declares that agent panes
  share the Terminal space.

[PanelWorkspaceState.ts](../../../../src/modules/ui/PanelWorkspaceState.ts) now asks the map before
it restores a pane. [PanelContentsList.ts](../../../../src/modules/ui/PanelContentsList.ts) reads its
button label from the same map. The old database-or-terminal branches and the special insertion
order are gone.

## Reproduction and driving

Before the change:

- `bun run drive -- --key Control+j` opened `terminal-space-1` with label `Terminal`.
- Opening the Add panel popup, selecting Database with Down, and pressing Enter opened
  `database-space-1` with label `Database`.
- A direct third-kind probe registered an `output` pane. The host returned
  `[{"kind":"terminal","label":"Terminal","contentIds":["output"]}]`. This reproduced the
  defect.

After the change:

- `bun run drive -- --key F1 --type 'Media: Open 3D' --key Enter` opened `media-demo` in
  `media-space-1`. The painted tab and published `panelSpaceLabels` both said `Media`.
- The same gesture on `bun run drive -- --size 100000 ...` produced the same Media space and label
  over the shared 100,000-line fixture.
- Terminal and Database retained their original kind and label in the focused tests and app drive.

## Contract and positive control

The existing Media PTY contract in
[smoke-media-harness.ts](../../../../scripts/harness/smoke-media-harness.ts) now requires the live
Media space label. The normal animation arm passed with `MEDIA_SMOKE_EXIT=0` and ended with
`harness media: ALL PASS`.

The check has a red control. I temporarily declared Media as `{ kind: 'terminal', label:
'Terminal' }`. [MediaPlugin.test.ts](../../../../src/modules/media/MediaPlugin.test.ts) failed with
the received Terminal declaration instead of the expected Media declaration and exited 1. I then
restored the correct declaration.

## Census

I reran
[census-488-vocabulary.ts](../../completed/488-core-to-plugin-coupling-census/census-488-vocabulary.ts). It
reported 116 core vocabulary sites across 19 files, down from the 129 raw sites in
[the core-to-plugin coupling census report](../../completed/488-core-to-plugin-coupling-census/report-488-core-to-plugin-coupling-census.md).
The row 4 files now have zero database or terminal vocabulary hits:

- [PanelHost.ts](../../../../src/modules/ui/PanelHost.ts)
- [PanelWorkspaceState.ts](../../../../src/modules/ui/PanelWorkspaceState.ts)
- [PanelContentsList.ts](../../../../src/modules/ui/PanelContentsList.ts)

The census controls passed: both positive seeds were found, and the negative Media term had zero
core hits.

## Invariants

[project.invariants.md](../../../../project.invariants.md):

- *Seams are drawn at the shared generator*: holds. One registration-fed map now generates space
  membership and labels for registration, restore, and list chrome.
- *Plugin boundaries grant one authority*: holds. Runtime and factory contributors add projection
  metadata through their existing contribution authority. They gain no provider or process
  authority.

[ui.invariants.md](../../../../src/modules/ui/ui.invariants.md):

- *Plugin panes use the shared pane and popup hosts*: holds and is stronger. Media uses the same
  host without a Media branch in the host.
- *Panel content order is one persisted sequence*: holds. Space insertion now follows registration
  order. Content order still has one persisted owner.
- *The panel contents list mirrors open content*: holds. Only the header label source changed.
- *The add control keeps one button appearance*: holds. The button keeps one paint form and reads
  the active space label.
- *An emptied space survives its last instance*: holds. Space metadata stays available after the
  last pane closes.
- *Every registered panel content is reachable*: holds. The new third-kind tests reach the Output
  space and content.
- *A pane runtime owns its processes*: holds. The declaration changes host grouping only.
- *Pane identity is separate from presentation*: holds. Instance identity remains opaque; the new
  declaration carries presentation and grouping data separately.

[terminal.invariants.md](../../../../src/modules/terminal/terminal.invariants.md):

- *Pane chrome and child cells keep separate authority*: holds. Terminal declares host chrome
  metadata, while terminal cell paint and ANSI authority are unchanged.
- *The terminal is a runtime plugin*: holds. The runtime now declares its space through the runtime
  seam, and the host does not name Terminal.

No implicated record was violated, stressed, refined, stale, or missing from these two module
contracts.

## Verification

- `bunx tsc --noEmit`: exit 0 before commit and again after hook formatting.
- `bun test`: 2,358 pass, 0 fail, 72,126 expectations across 353 files.
- Focused post-format tests: 71 pass, 0 fail, 336 expectations across 8 files.
- `node .claude/skills/invariants/scripts/check_invariants.mjs --all --refs`: 0 problems; 1,374
  annotations and 266 lattice links resolved.
- `bash scripts/conventions-gate.sh`: exit 0, `conventions-gate: PASS`.
- `INVAR_MEDIA_SMOKE_ARM=animation bun scripts/harness/smoke-media-harness.ts`: exit 0, all pass.
- `bash scripts/behavioral-contracts.sh`: one pass completed. The captured stream showed green
  momentum, glide, scale, and accumulation contracts before the runner detached. The process later
  exited, but the detached wrapper did not preserve its final exit line. I did not run a second pass.
- `git diff --check`: clean.

## Bycatch

- **Visible text drift, not fixed:** the welcome screen says `Ctrl+P command palette`, but one real
  `Ctrl+P` drive opened Quick Open. The stale label appeared again on later boots. F1 opened the
  command palette correctly. This is outside the panel-kind task.
- **Contract-layer gap, not fixed:** the census still measures “core carries no plugin vocabulary,”
  but no invariant record claims that property. The earlier
  [core-to-plugin coupling census report](../../completed/488-core-to-plugin-coupling-census/report-488-core-to-plugin-coupling-census.md)
  reported the same gap.

## Instrument feedback

- **EASY:** `bun run drive`, F1, and the published panel fields made the wrong and corrected space
  labels visible without internal state mutation. The shared 100,000-line fixture made scale parity
  one extra command.
- **CONFUSING:** the welcome text advertises Ctrl+P as the command palette, while the key opens Quick
  Open. F1 was the working command-palette path.
- **MISSING:** none for this task.

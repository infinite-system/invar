## In plain words

Invar made a Database pane before the user asked for one, then left it behind with no row to close. I changed Database to make panes only after an Add gesture, kept an emptied panel open with an Add Terminal message, and made each instance close at once. A container still asks before it closes all of its instances.

## READY

#459 (empty right pane has no add affordance) is complete in commit `b428610e8446e6848eee1130c174e73529fc11b5`. The worktree is clean.

I implemented the [round 1 brief](brief-459-1-empty-right-pane-has-no-add-affordance.md), [round 2 brief](brief-459-2-2-confirm-scales-with-blast-radius.md), and [round 3 brief](brief-459-3-3-no-confirm-at-all.md).

## Cause and repair

The initial [probe](probe-459-empty-dock.ts) reproduced three registered contents before any close: two terminal instances and one content with the bare identifier `database`. Only the two terminals belonged to the restored space. The Database plugin created and registered a live pane during application boot, while restore replaced the visible panel spaces. The suggested `detachContent` promotion path was not the cause. The divergence existed before the first close gesture.

The repair separates a plugin factory from a live pane:

- [ApplicationContributions](../../../../src/modules/app/ApplicationContributions.ts) registers a contributed factory, not a shared live panel content.
- [PanelContentFactories](../../../../src/modules/ui/PanelContentFactories.ts) owns one factory per pane kind. The Database plugin creates an opaque `pane-instance-N` only after a user Add gesture or saved-pane restore.
- [PanelHost](../../../../src/modules/ui/PanelHost.ts) no longer has shared content copied into every workspace. Restore throws when any registered identifier has no space row. Closing the last instance removes every registry, cell, and row entry, but leaves the panel visible.
- [PanelContentsList](../../../../src/modules/ui/PanelContentsList.ts) paints `Add Terminal` only when its row set is empty. It keeps `+ Terminal` while any terminal remains.

The final probe reported two terminal identifiers and no Database identifier before close. After both row closes, `panelContentIds` and `panelCellIds` were empty, `panelVisible` and `panelListVisible` were true, and `Add Terminal` was present.

## Close behavior

One instance always closes without a dialog. This includes a terminal running `sleep 30`. There is no foreground-process exception, setting, pause, toast, undo, or recovery path.

A panel container still uses the generic dialog because that gesture closes every instance inside it. The driven two-instance case painted `Close Terminal and its 2 instances?` and `Close Database and its 2 instances?`. Enter selected the default No choice and kept both instances. Left then Enter selected Yes and removed the Database container and both of its instances.

The shared [HarnessSmoke](../../../../scripts/harness/HarnessSmoke.ts) gesture now travels to the painted container close mark before it clicks. Its instance-row helper now uses the published list region. The old helper derived a close cell one column past the region after the first row disappeared.

## Scale and driven evidence

The existing [panel chrome smoke](../../../../scripts/harness/smoke-panel-chrome-harness.ts) passed at 120 by 40 and 88 by 24. Both sizes proved all of these states:

- A restored nonempty panel had two reachable terminals and no unrequested Database pane.
- A two-instance container asked with the exact count and defaulted to No.
- A live foreground terminal closed from its hovered instance-row mark with no dialog.
- `Add Terminal` stayed absent with one cell and painted after the last cell closed.
- The empty panel and its list stayed visible.

The same smoke also created Database through the real Add control, closed individual Database instances without dialogs, and confirmed the two-instance Database container close.

## Positive controls

- I disabled the empty header. [PanelContentsList.test.ts](../../../../src/modules/ui/PanelContentsList.test.ts) failed because it received `+ Terminal ▾` instead of `Add Terminal`. I restored the condition.
- I removed the restore reachability check. [PanelHost.test.ts](../../../../src/modules/ui/PanelHost.test.ts) failed because the unreachable `terminal` registration did not throw. I restored the check.
- I changed the container count from 2 to 3. The same host test failed with expected 2 and received 3. I restored the count.
- I made instance close leave the selected instance open. The PTY smoke failed at `Timed out waiting for Terminal One has 0 rows after one row close`. I restored direct removal, and the complete smoke passed.

## Invariant result and proposals

- [The panel contents list mirrors open content](../../../../src/modules/ui/ui.invariants.md#the-panel-contents-list-mirrors-open-content) was violated before the repair. A registered Database content had no space, cell, or row. The factory seam removes that state, and restore now rejects it. Refine the record to say that an empty visible panel keeps one Add row visible, while a nonempty active space projects one row per owned instance when the pin is open.
- [A pane runtime owns its processes](../../../../src/modules/ui/ui.invariants.md#a-pane-runtime-owns-its-processes) remains true. A terminal instance close removes that runtime-owned pane and its process with no application-level confirmation branch. A container close counts live pane identifiers, confirms once, and then removes each owned pane through the host.
- [Pane identity is separate from presentation](../../../../src/modules/ui/ui.invariants.md#pane-identity-is-separate-from-presentation) remains true. `database` is now only a factory kind. Every live Database pane receives an opaque instance identifier and a separate label.
- [One dialog component serves confirms and prompts](../../../../design.invariants.md#one-dialog-component-serves-confirms-and-prompts) still governs the surviving container confirmation. Refine its Scope from `terminal-instance close` to `panel-container close`. Instance close no longer needs a modal interaction.
- Add a record named `Every registered panel content is reachable`. Its invariant should require each workspace-local registered content identifier to belong to exactly one panel space group that can project a selectable and closable row or cell. Its `Impossible if true` should name a registered identifier absent from every space and group, because no user gesture can select or close that content.

## Verification

- `bun test`: 2,314 passed, 0 failed, and 71,941 expectations across 350 files.
- `bunx tsc --noEmit`: passed.
- `bash scripts/conventions-gate.sh`: passed.
- Invariant checker with `--all --refs`: 1,344 annotations and 266 lattice links resolved, with 0 problems.
- `bun scripts/harness/smoke-panel-chrome-harness.ts`: `ALL-PASS` at 120 by 40 and 88 by 24.
- `git diff --check`: passed before commit. The committed tree is clean.
- I did not run `scripts/merge-gate.sh`, as required. I committed with `SKIP_GATE=1`.

## Bycatch

- Contract drift: [One dialog component serves confirms and prompts](../../../../design.invariants.md#one-dialog-component-serves-confirms-and-prompts) still names terminal-instance close in its Scope. That dialog no longer exists. The surviving generator is panel-container close through the same generic `Dialog` component. I did not edit the record because the briefs require a proposal first.
- Contract-layer gap: the panel domain has no record that requires every registered content to be reachable through one space, group, row, or cell. The existing list record describes projection after membership exists, but it does not reject a registry entry outside every space. The proposed `Every registered panel content is reachable` record fills this gap.

## In plain words

The app kept some terminal keys and plugin names in core files. I moved those facts to the live plugin and dock records. The same keys and labels now work in small and 100,000-line files, and core no longer contains any of the 9 assigned sites.

## Result

READY on branch `fleet/490-chord-and-command-relocation-sweep` at commit `cfc4de60d8672971b62112cd4866db378d317378` (`Relocate plugin shortcuts and labels`). The worktree is clean.

- [TerminalPlugin](../../../../src/modules/terminal/TerminalPlugin.ts) now owns the macOS copy chord and the four terminal command records. Disable removes the chords, commands, panes, and status projection together.
- [TerminalPaneContent](../../../../src/modules/terminal/TerminalPaneContent.ts) owns the word-left, word-right, and delete-previous-word byte operations used by palette commands.
- [KeybindingRegistry](../../../../src/modules/keybindings/KeybindingRegistry.ts) derives its context list from live layers. [ShortcutHelp](../../../../src/modules/ui/ShortcutHelp.ts) uses that list and registered command titles and categories. It has no Git, Diff, Markdown, or Files plugin fallback.
- [CommandDefaults](../../../../src/modules/commands/CommandDefaults.ts) supplies the shared `focus.toggle` title. [RootView](../../../../src/modules/ui/RootView.ts) takes the sidebar title from the active dock contribution.
- [The shortcut-help PTY smoke](../../../../scripts/harness/smoke-shortcut-help-harness.ts) now requires the Git plugin title and chord from the painted sheet. Existing terminal word-chord coverage remains in [the paste PTY smoke](../../../../scripts/harness/smoke-paste-harness.ts).
- I updated [the vocabulary census](../../completed/488-core-to-plugin-coupling-census/census-488-vocabulary.ts) so its positive control uses an out-of-scope settings label. Its old control required one of the sites this task had to remove.

No agent identifier changed. The four Markdown language-icon sites stayed in [ThemeIcons](../../../../src/modules/theme/ThemeIcons.ts) and [HoverCard](../../../../src/modules/ui/HoverCard.ts), as required.

## Drive evidence

I drove defaults before editing. Shortcut Help painted 150 rows with the existing core labels. In the real shell, `echo one two`, `Alt+Left`, then `X` produced `one Xtwo`. A `terminal` palette query showed only the existing panel and agent results.

After the change, the default fixture kept the existing visible chords and labels. Shortcut Help painted 210 rows because it now includes every live contributed context. It showed the Git title `Source Control: Toggle` with `Ctrl+G`. The same shell gesture with `echo red blue` produced `red Xblue`. The command palette showed `Terminal: Delete Previous Word`, `Terminal: Word Left`, and `Terminal: Word Right`.

I repeated the drive with the shared 100,000-line fixture. The sidebar still painted `Files`, now from the dock contribution. Shortcut Help painted the same 210 registered rows. `echo large scale`, `Alt+Left`, then `X` produced `large Xscale`. The command palette showed the same three terminal commands. Small and large behavior matched.

Two palette attempts from the focused terminal timed out. I did not widen the timeout. The terminal correctly owned those non-reserved keystrokes and sent them to its child. I clicked the editor, then the documented palette chord opened the palette at once.

## Census

I ran both scripts from [#488 (core-to-plugin coupling census)](../../completed/488-core-to-plugin-coupling-census/report-488-core-to-plugin-coupling-census.md) before and after the edit.

| Assigned census area | Before | After |
|---|---:|---:|
| Row 2: terminal platform chord | 1 | 0 |
| Row 6: Shortcut Help plugin contexts, titles, and fallbacks | 7 | 0 |
| Row 11: RootView `Files` title | 1 | 0 |
| Assigned total | 9 | 0 |

The full vocabulary census changed from 42 sites in 17 files to 34 sites in 14 files. The arithmetic differs from the assigned reduction because core gained one sanctioned shared `focus.toggle` command record. Core-to-plugin imports stayed at 0. Both census control arms passed before and after the change.

## Invariants

- **Bindings are intent addressed — upheld and strengthened.** The terminal plugin registers action identifiers and chords as data. [KeybindingPlatform](../../../../src/modules/keybindings/KeybindingPlatform.ts) no longer names `terminal.copy`. Registry and plugin tests cover the platform alias, live context discovery, and withdrawal.
- **Focus owns the keystroke — upheld.** Every terminal binding stays in the `terminal` context. Copy claims the chord only when the pane has a selection. The PTY shell drive proved word keys still reach readline. The focused-terminal palette attempts also proved that non-reserved keys still pass to the child.
- **The terminal is a runtime plugin — upheld and strengthened.** [The terminal record](../../../../src/modules/terminal/terminal.invariants.md) now states that terminal keybindings and commands install and withdraw with the runtime. The plugin-lifecycle PTY smoke removed and restored the runtime without leaving a usable terminal chord or pane.
- **The composition graph reaches every installed contributor — upheld.** Shortcut Help asks the live keybinding layers for contexts. It does not keep a second plugin list. The default and scale drives showed the installed contributors on the sheet and in the command palette.

No in-scope record missed its promised behavior.

## Verification

- `bun .invar/tasks/completed/488-core-to-plugin-coupling-census/census-488-imports.ts` — 0 offending imports; both controls passed.
- `bun .invar/tasks/completed/488-core-to-plugin-coupling-census/census-488-vocabulary.ts` — 34 sites in 14 files; both controls passed; assigned count 0.
- `bunx tsc --noEmit` — passed.
- `bun test` — 2,386 passed, 0 failed, 72,193 expectations in 359 files.
- `bun scripts/harness/smoke-shortcut-help-harness.ts` — all passed, including the contributed Git title and `Ctrl+G` row.
- `bun scripts/harness/smoke-paste-harness.ts` — all passed, including word-left, word-right, and delete-previous-word in the real child PTY.
- `bun scripts/harness/smoke-plugin-manifest-harness.ts` — all passed, including terminal disable and reinstall.
- `node .claude/skills/invariants/scripts/check_invariants.mjs --all --refs` — 1,382 annotations and 266 lattice links resolved; 0 problems.
- `bash scripts/conventions-gate.sh` — passed. It reported only the existing 20 legacy file-grammar findings.
- `git diff --check` — passed.

I proved both new instruments red before trusting green. A temporary registry defect that skipped plugin layers made the context test receive only `global` and `editor`, not `sample-surface`. A temporary bad Git title made the PTY smoke reach the final shortcut row without finding `Source Control: Toggle`. I removed both defects before the final runs.

I did not run `scripts/merge-gate.sh` or `behavioral-contracts.sh`.

## Bycatch

- **Invariant violated in function, pre-existing:** [the commands record](../../../../src/modules/commands/commands.invariants.md#every-action-dispatches-through-the-one-registry) says every action uses one registry. [Bootstrap](../../../../src/modules/app/Bootstrap.ts#L2007) still dispatches through a separate `actionHandlers` table, including terminal actions at line 2303. This task did not move the row 1 handler family.
- **Comment drift, pre-existing:** [TerminalPlugin](../../../../src/modules/terminal/TerminalPlugin.ts#L2) says its file contains all terminal knowledge the host used to know. The after census still finds terminal vocabulary in [Bootstrap](../../../../src/modules/app/Bootstrap.ts#L2303) and [AppStatusProjection](../../../../src/modules/app/AppStatusProjection.ts#L261). Those sites are outside the assigned rows.
- **Contract-layer gap, pre-existing:** no invariant record directly forbids plugin vocabulary in core source. The terminal and host-canvas records cover parts of the boundary, but they do not state the census rule as one contract.
- **Runtime defects:** none observed in either default or 100,000-line drives.

## Instrument feedback

- **EASY:** the warm PTY server kept app state across shortcut, terminal, and palette probes. The shared scale fixture made the small versus 100,000-line comparison direct.
- **CONFUSING:** `scrollUntilVisible` moves only forward. A check that starts after the alphabetical category can report a missing row. The final smoke follows the painted category order.
- **MISSING:** the vocabulary census reports sites but not the numbered report rows. A row filter or stable row tag would let a follow-up task prove `9 -> 0` without a manual target classification.

## Handoff

The branch is committed and clean. The conductor can gate and land commit `cfc4de60d8672971b62112cd4866db378d317378`.

## In plain words

The app used to build the Agent pane by hand, so its Extensions switch could not remove all of it. Invar Agent now owns its pane, settings, keys, status data, button, narration, and processes as one plugin. Turning it off removes those parts, and turning it on restores them.

## Outcome

READY. The worktree is clean. The warm drive server is stopped.

The task has five commits:

- `34e0641d` — Make Invar Agent a runtime plugin.
- `4d842a00` — Fix plugin smoke editor focus step.
- `cb26b682` — Lock agent plugin lifecycle smoke.
- `81c9b2ab` — Correct agent smoke coverage count.
- `a16806e1` — Prove agent and terminal runtime independence.

The main change is [AgentPlugin.ts](../../../worktrees/356-agent-pane-is-a-decoupled-module/src/modules/agent/AgentPlugin.ts). It is an `ApplicationContributor` and a `PaneRuntime`. [DefaultPlugins.ts](../../../worktrees/356-agent-pane-is-a-decoupled-module/src/modules/plugins/DefaultPlugins.ts) installs it. [Bootstrap.ts](../../../worktrees/356-agent-pane-is-a-decoupled-module/src/modules/app/Bootstrap.ts) and [RootView.ts](../../../worktrees/356-agent-pane-is-a-decoupled-module/src/modules/ui/RootView.ts) now use the generic pane seams.

Disabling Invar Agent now withdraws its pane, status-bar control, commands, keybindings, settings, status projection, narration objects, terminal followers, popup, and owned processes. Enabling it registers the same parts again. Agent asks for Terminal's optional observation capability. It does not construct or import the Terminal runtime.

## Driven evidence

I drove defaults before changing code. The `✦` control opened the Agent pane, but Extensions did not list Invar Agent. That showed the reported split ownership.

After the change, the default drive showed these results:

- Extensions listed `[x] Invar Agent`.
- Clicking `✦` opened an Agent pane with 83 content columns.
- The published active pane kind was `agent`.
- Agent and Narration settings were present.
- Agent status fields were present.
- Render attribution reported `{"agent":1}`.

I disabled the plugin through Extensions. The row changed to `[ ] Invar Agent`. The pane, `✦` control, Agent and Narration settings, agent status fields, and agent chord all disappeared. The published status object fell from 352 keys to 326 keys. Re-enable restored the complete registration set in the locking smoke.

I repeated the enabled pane drive with the shared 100,000-line scale fixture. The pane still had 83 content columns and published `agent` as its active kind. The small and large fixtures used the same generic pane path.

The locking [plugin manifest smoke](../../../worktrees/356-agent-pane-is-a-decoupled-module/scripts/harness/smoke-plugin-manifest-harness.ts) now proves both lifecycle directions. It also proves that Agent opens while Terminal is disabled and that Terminal opens while Agent is disabled.

For the positive control, I removed the Agent entry from DefaultPlugins for one drive. Clicking `✦` then failed with `Click target text is not visible: ✦` and exit code 1. I restored the entry before the final runs.

## Census

I reran both tools from [#488 (core-to-plugin coupling census)](../../completed/488-core-to-plugin-coupling-census/report-488-core-to-plugin-coupling-census.md).

- The [import census](../../completed/488-core-to-plugin-coupling-census/census-488-imports.ts) reports one sanctioned Agent import in DefaultPlugins and zero Agent imports in core. It still reports 4 unrelated editor imports in core.
- The [vocabulary census](../../completed/488-core-to-plugin-coupling-census/census-488-vocabulary.ts) reports zero Agent-owned vocabulary sites in core. It reports 60 unrelated sites across 22 files and 141 dictionary terms.
- Both census positive and negative controls pass.

The map did not name every owned lifetime. The move also placed `AgentSkillPopup`, narration instances, terminal-follow subscriptions, stale SDK sibling cleanup, and backend disposal under AgentPlugin. The generic pane repair also moved Agent pointer, wheel, selection, text input, find, scroll, popup, and visibility behavior behind [PaneContent.interface.ts](../../../worktrees/356-agent-pane-is-a-decoupled-module/src/modules/ui/PaneContent.interface.ts) and [AgentPaneContent.ts](../../../worktrees/356-agent-pane-is-a-decoupled-module/src/modules/agent/AgentPaneContent.ts).

## Invariants

- [The agent pane is a PaneContent citizen, not a special case](../../../worktrees/356-agent-pane-is-a-decoupled-module/src/modules/agent/agent.invariants.md): repaired. Bootstrap and RootView no longer branch on `AgentPaneContent.Class`. Agent supplies the same generic paint, input, pointer, scroll, find, and visibility capabilities as other pane content.
- [A focused panel routes keystrokes to its active pane content](../../../worktrees/356-agent-pane-is-a-decoupled-module/src/modules/ui/ui.invariants.md): repaired. The host resolves the focused pane's declared keybinding context and then calls its generic `handleKey` route. Agent owns its context actions.
- [The composition graph reaches every installed contributor](../../../worktrees/356-agent-pane-is-a-decoupled-module/src/modules/system/system.invariants.md): satisfied. DefaultPlugins reaches AgentPlugin. The Extensions lifecycle activates and disposes the same contributor.
- [Render load is attributed at the contribution boundary](../../../worktrees/356-agent-pane-is-a-decoupled-module/src/modules/app/app.invariants.md): satisfied. The driven attribution map reports `agent: 1` when the contributed pane renders.
- [The terminal is a runtime plugin](../../../worktrees/356-agent-pane-is-a-decoupled-module/src/modules/terminal/terminal.invariants.md): unchanged and preserved. The smoke proves each runtime works while the other is absent.

I propose no new invariant record. [Peer plugins can have different lifetimes](../../../worktrees/356-agent-pane-is-a-decoupled-module/src/modules/plugins/plugins.invariants.md) already states the new Agent and Terminal independence guarantee. A second Agent-specific record would duplicate that generator.

## Verification

- `bun scripts/harness/smoke-plugin-manifest-harness.ts`: pass, including all later Source Text Editor, Structure Navigator, Database, and Markdown sections.
- `bunx tsc --noEmit`: pass.
- `bun test`: 2,353 pass, 0 fail, 72,102 expectations across 353 files.
- `node .claude/skills/invariants/scripts/check_invariants.mjs --all --refs`: 1,375 annotations, 266 lattice links, 0 problems.
- `bun scripts/check-coverage-ratchet.ts`: 392 files inspected, no undeclared decrease against `a9700d9`.
- Both #488 census scripts: pass with the Agent core counts at zero.

I did not run `scripts/merge-gate.sh`. The first commit attempt invoked the repository pre-commit gate automatically. It stopped at the namespace and coverage checks. I corrected both findings and used the documented `SKIP_GATE=1` commit path for all commits after that accidental run.

## Bycatch

- FIXED in `4d842a00`. The plugin smoke sent Enter to open `manifest.ts`, then sent `Ctrl+Shift+J`, which moved focus away before it waited for editor focus. The same wait failed twice. The separate commit removes the contradictory second key.
- NOT FIXED. With the Agent pane focused, `Ctrl+Shift+X` does not open Extensions. The panel keeps the key because non-reserved global chords do not pass through a focused panel. I reproduced it three times while building the lifecycle smoke. The smoke uses the visible `✦` control to close the pane before it opens Extensions. This matches the existing nearby note that `Ctrl+P` also does not reach Quick Open while a panel owns input.

## Instrument feedback

- EASY: visible-text clicks, status conditions, per-cell snapshots, and the shared 100,000-line fixture made the enabled and disabled states direct to compare.
- CONFUSING: a hidden panel keeps its active content kind, so `panelActiveContentKind` does not mean the panel is visible. The correct close condition is `panelVisible === false`.
- MISSING: the drive command needs a direct negative screen condition for text or controls that must disappear. I used the final snapshot and missing status keys for those checks.

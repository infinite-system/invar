## In plain words

The smoke reused old pane names, while my earlier check used an empty home. Those old names made Terminal appear before Agent and hid Agent's follow shortcut. I now reserve every saved pane name before a plugin creates a pane, so the bare smoke keeps Agent first and all restored panel actions work.

## Outcome

Round 4 is READY at branch tip `8c97e44a`. Commit `8c97e44a` contains the repair. The worktree is clean.

The bare keyboard smoke now paints `agent | terminal`, changes Agent follow mode, and closes Agent. The panel-split smoke passes its nerd and Unicode icon arms, contextual Add menus, copy routes, divider drag, and exact-slot `/exit` replacement.

## Environment difference

The Round 3 green did not use the smoke's environment. I set `INVAR_HARNESS_HOME` to a new empty directory. A bare run of [the keyboard smoke](../../../../scripts/smoke-keyboard-invariant.sh) instead uses the tracked and reused `artifacts/home` through [tui-harness.sh](../../../../scripts/tui-harness.sh).

That home held a mixed saved `panelContentOrder`, including `agent` and old names such as `pane-instance-1`, `pane-instance-2`, and `pane-instance-3`. Terminal registers before Agent at runtime. The allocator gave Agent `pane-instance-1` and Terminal `pane-instance-2`, even though those names already existed in the saved order. Registration then treated both names as known and did not replace the legacy `agent` entry. Filtering the saved sequence produced `Terminal,Agent`.

An empty home had no collision. It therefore produced the false Round 3 green. The difference was saved pane identity, not timing or key delivery.

## Repair

- [Bootstrap.ts](../../../../src/modules/app/Bootstrap.ts) collects every pane identity in the saved panel order and every saved workspace panel state before plugin registration.
- [PaneRuntimes.ts](../../../../src/modules/ui/PaneRuntimes.ts) reserves those identities before allocation. Reservation prevents reuse but still lets workspace restoration claim the exact saved identity later.
- [PanelWorkspaceState.ts](../../../../src/modules/ui/PanelWorkspaceState.ts) supplies the saved pane identities through one generic traversal.
- [AgentPlugin.ts](../../../../src/modules/agent/AgentPlugin.ts) uses the semantic theme Agent icon. The nerd arm no longer waits for a Unicode-only `✦`.
- Runtime and factory contributions now declare contextual pane Add entries through [PaneRuntime.interface.ts](../../../../src/modules/ui/PaneRuntime.interface.ts) and [PanelContentFactory.interface.ts](../../../../src/modules/ui/PanelContentFactory.interface.ts). Terminal, Agent, and Database provide their own profiles. The application core only reads the shared entry shape.
- [ApplicationContributor.interface.ts](../../../../src/modules/app/ApplicationContributor.interface.ts) exposes generic copy-selection and replace-pane operations. Agent copy telemetry and `/exit` use these pane operations. No application-core branch names Agent.

The panel-split smoke exposed the menu, copy, and `/exit` losses only after its icon arm became green. I drove each newly exposed failure before changing its seam.

## Driven evidence

- Bare [keyboard smoke](../../../../scripts/smoke-keyboard-invariant.sh): pass. `Ctrl+Shift+S` paints `agent | terminal`; `Ctrl+Shift+M` changes `follow-all` to `on-error`; `Ctrl+Shift+A` leaves one Terminal pane.
- [Panel-split smoke](../../../../scripts/harness/smoke-panel-split-harness.ts): `smoke-panel-split-harness: ALL-PASS`.
- [Activity bar smoke](../../../../scripts/harness/smoke-activitybar-harness.ts): `smoke-activitybar-harness: ALL-PASS`. Its fresh profile paints Agent before Terminal, and its planted terminal-first profile keeps that order.
- [Clipboard frame-boundary smoke](../../../../scripts/harness/smoke-clipboard-frame-boundary-harness.ts): `smoke-clipboard-frame-boundary-harness: ALL-PASS`.
- [Workspace tabs smoke](../../../../scripts/harness/smoke-workspace-tabs-harness.ts): `smoke-workspace-tabs-harness: ALL-PASS`.
- [Workspace layout isolation smoke](../../../../scripts/harness/smoke-workspace-layout-isolation-harness.ts): `ALL PASS: workspace layout isolation`.

The exact bare keyboard failure and the panel-split icon timeout were the positive controls. The panel-split run then supplied red controls for contextual Add, selection telemetry, forwarded selection telemetry, and exact-slot replacement before it reached `ALL-PASS`.

## Invariant verdicts

- [Focus owns the keystroke](../../../../src/modules/keybindings/keybindings.invariants.md): the Round 2 refinement is still needed. Proposed wording remains: “If a pane holds keyboard focus, it owns every keystroke except a reserved chord or one modified, single-chord, effective binding marked `applicationGlobal`. An application-global binding must name a frame-scoped action, runs only when no modal overlay owns the screen, and remains subject to layer shadowing.” I did not edit the record.
- [A focused panel routes keystrokes to its active pane content](../../../../src/modules/ui/ui.invariants.md): satisfied. Agent receives its follow chord. Terminal receives the non-reserved byte sweep.
- [Bindings are intent addressed](../../../../src/modules/keybindings/keybindings.invariants.md): satisfied. The repair uses existing action identifiers. It does not compare raw Agent chords.
- [The agent pane is a PaneContent citizen, not a special case](../../../../src/modules/agent/agent.invariants.md): satisfied. Agent contributes menu, icon, copy, exit, and runtime behavior through generic contracts.
- [Panel content order is one persisted sequence](../../../../src/modules/ui/ui.invariants.md): satisfied. The saved sequence remains the order generator. The allocator can no longer counterfeit one of its identities.
- [Pane identity is separate from presentation](../../../../src/modules/ui/ui.invariants.md): satisfied. Saved opaque identities are reserved independently of labels and plugin registration order.
- [Status text is assembled from ordered contributions](../../../../src/modules/ui/ui.invariants.md): satisfied. Agent asks the theme contribution for its semantic icon instead of hard-coding one tier's glyph.
- [Seams are drawn at the shared generator](../../../../project.invariants.md): satisfied. Contextual menu entries, selection proof, and pane replacement each have one generic seam used by their consumers.

The identity record does not say that an identity found in any loaded persisted panel state must not be reissued before restoration. I propose adding that guarantee in a later contract task. I did not edit an invariant record in this repair.

## Verification

- Targeted runtime, workspace-state, factory, Terminal, Agent, Media, and Database tests: 21 pass, 0 fail, 111 expectations.
- `bunx tsc --noEmit`: pass.
- `bash scripts/conventions-gate.sh`: pass. File grammar inspected 656 source files and found 0 enforced violations. It reported 20 legacy violations outside enforced modules.
- `node .claude/skills/invariants/scripts/check_invariants.mjs --all --refs`: 0 problems.
- `bun scripts/check-coverage-ratchet.ts`: 392 files inspected, with no undeclared decrease against `a9700d9`.
- `bun test`: 2,372 pass, 0 fail, 72,151 expectations across 356 files.
- `git diff --check`: pass.

I did not run [the merge gate](../../../../scripts/merge-gate.sh). I used `SKIP_GATE=1` for commit `8c97e44a`, as the [Round 4 brief](brief-356-4-4.md) requires.

## Bycatch

- The gate's [panel-chrome contention log](/tmp/merge-gate-failures.8bee3f81d3ec34aa.1050976/contention-panel-chrome-harness-scripts-harness-smoke-panel-chrome-harness-ts-.log) failed while waiting for the container Add menu. After the generic menu repair, that condition passed in a standalone run. The same run then timed out when clicking Database Add for `Database 2`. A temporary condition showed that `boundedListPopupOpen` never became true, so the click did not open a popup. This is a pointer-hit problem, not a menu-label or wait-vocabulary problem. It reproduced twice. I removed the temporary probe and did not change the unrelated pointer path.

## Instrument feedback

- EASY: the bare keyboard smoke publishes its panel labels and follow mode. Those values exposed the saved-identity collision without a visual guess.
- CONFUSING: the smoke silently reuses `artifacts/home`, while an explicit `INVAR_HARNESS_HOME` changes the starting state. The two runs look equivalent until saved pane identities affect allocation.
- MISSING: print the resolved harness home and starting `panelContentOrder` at the top of the keyboard smoke. That would make profile-dependent failures self-describing.

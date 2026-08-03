## In plain words

Moving Agent into a plugin made its shortcut behave like terminal input. A focused Terminal pane swallowed `Ctrl+Shift+A`, so no Agent pane opened. The shortcut now carries a generic app-level flag through the keybinding registry, while all other panel keys still go to the focused pane.

## Outcome

Round 2 is READY on merged tip `b307c839`. Commit `153c582b` contains the repair. The worktree is clean.

The main Round 1 plugin change remains in commits `34e0641d`, `cb26b682`, and `a16806e1`. Round 2 does not restore any Agent branch in core.

## Regression and repair

I reproduced the gate regression before editing:

- `bun scripts/harness/smoke-workspace-tabs-harness.ts` timed out at `a new agent belongs only to the second workspace`.
- `bun scripts/harness/smoke-workspace-layout-isolation-harness.ts` timed out at `workspace A adds an agent pane to its terminal container`.
- A direct default drive opened Terminal, kept Terminal focused, and sent `Ctrl+Shift+A`. The final state still had `panelActiveContentKind="terminal"`, `panelFocused=true`, and no Agent pane.

[AgentPlugin.ts](../../../../src/modules/agent/AgentPlugin.ts) now marks `panel.toggleAgent` as `applicationGlobal`. [KeybindingRegistry.ts](../../../../src/modules/keybindings/KeybindingRegistry.ts) carries that generic binding property. The registry accepts it only on one modified, context-free plugin chord. Its stateless lookup respects guards, plugin withdrawal, and layer shadowing. A higher user binding on the same chord blocks the plugin pass-through.

[Bootstrap.ts](../../../../src/modules/app/Bootstrap.ts) asks for one application-global action after modal ownership is known and before any focused pane receives the key. The route names no Agent type or action. Modal overlays still own their keys. A focused pane receives every key that is not reserved or application-global.

This tier differs from `reserved`. Reserved chords run before every mode and remain host-only. Application-global chords run only outside modal overlays and can belong to a plugin.

I added a pointer to this seam in [#498 (global chords blocked by a focused panel)](../../active/498-global-chords-blocked-by-focused-panel/task-498-global-chords-blocked-by-focused-panel.md). That task still owns the wider policy for existing app chords and pane consumption.

## File grammar

The conventions gate reported six enforced findings. All six are fixed.

- `AgentPlugin.ts` now has a colocated test. It proves Agent declares the shared Terminal panel space added on merged tip `b307c839`.
- `SettingSpecs.ts` now has a colocated test. It proves a dynamic enum reads current options when the view asks, instead of freezing its first result.
- [AgentProviderRegistry.ts](../../../../src/modules/agent/AgentProviderRegistry.ts) now places its eponymous class first after imports. Exported types follow the namespace manifest.
- [NarrationProjection.ts](../../../../src/modules/narration/NarrationProjection.ts) now places its namespace manifest directly after the class. Its exported transcript interface follows the manifest.

The full conventions gate passes. It reports 0 enforced violations. Its 20 reported legacy violations are outside the enforced modules and were present on the merged tip.

## Driven evidence

The repaired default drive opens Terminal, keeps it focused, sends `Ctrl+Shift+A`, and reaches `panelActiveContentKind="agent"`. I repeated the same gesture with the shared 100,000-line fixture. It reaches the same Agent state.

Both gate-reported smokes now run to completion:

- Workspace tabs: `smoke-workspace-tabs-harness: ALL-PASS`.
- Workspace layout isolation: `ALL PASS: workspace layout isolation`.

The red runs on `b307c839` are the positive control. The same commands failed at the exact Agent waits before `applicationGlobal` existed and passed after the flag and route were present.

## Invariant verdicts

- [Focus owns the keystroke](../../../../src/modules/keybindings/keybindings.invariants.md): needs a refinement. The present record permits only reserved pass-through. Proposed wording: “If a pane holds keyboard focus, it owns every keystroke except a reserved chord or one modified, single-chord, effective binding marked `applicationGlobal`. An application-global binding must name a frame-scoped action, runs only when no modal overlay owns the screen, and remains subject to layer shadowing.” I did not edit the record.
- [A focused panel routes keystrokes to its active pane content](../../../../src/modules/ui/ui.invariants.md): preserved. The generic application tier gets one bounded chance first. Every other key continues through the pane context and `handleKey` route. The two workspace smokes prove Terminal stays live while the Agent toggle reaches the app.
- [Bindings are intent addressed](../../../../src/modules/keybindings/keybindings.invariants.md): satisfied. The chord remains binding data that resolves to `panel.toggleAgent`. Bootstrap contains no inline chord or Agent action check.
- [The agent pane is a PaneContent citizen, not a special case](../../../../src/modules/agent/agent.invariants.md): satisfied. Agent declares the generic flag in its plugin binding. Core routing knows only the keybinding capability and focused pane state.

The brief did not name the existing “Plugin bindings cannot reserve chords” record. It remains true because `applicationGlobal` is not reservation and cannot outrank a modal overlay. The new tier does create a contract gap. The proposed Focus wording above should own it. A separate record would split one focus-ownership policy across two places.

## Verification

- `bash scripts/conventions-gate.sh`: pass. The file grammar inspected 656 source files and found 0 enforced violations.
- `bun scripts/harness/smoke-workspace-tabs-harness.ts`: all pass.
- `bun scripts/harness/smoke-workspace-layout-isolation-harness.ts`: all pass.
- Targeted keybinding, AgentPlugin, and SettingSpecs tests: 29 pass, 0 fail, 120 expectations.
- `bun test`: 2,367 pass, 0 fail, 72,134 expectations across 356 files.
- `bunx tsc --noEmit`: pass.
- `node .claude/skills/invariants/scripts/check_invariants.mjs --all --refs`: 1,379 annotations, 266 lattice links, 0 problems.
- `bun scripts/check-coverage-ratchet.ts`: 392 files inspected, no undeclared decrease against `a9700d9`.

I did not run `scripts/merge-gate.sh`. I used `SKIP_GATE=1` for the commit, as the [Round 2 brief](brief-356-2-2.md) requires.

## Bycatch

None observed in Round 2.

## Instrument feedback

- EASY: the two smokes stopped at the same semantic Agent condition. The direct `--key` and `--wait-for-status` drive reproduced the same route without a custom probe.
- CONFUSING: the CLI status value uses JSON quoting. My first command asked for the literal value `'agent'` with embedded apostrophes and timed out even though the syntax looked quoted. The corrected value was `panelActiveContentKind="agent"`.
- MISSING: the one-shot drive CLI needs an output filter for selected status fields. A successful two-key probe currently prints hundreds of unrelated status lines. The fluent drive has `show`, but the direct CLI has no matching narrow-output option.

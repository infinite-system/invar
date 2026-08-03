## In plain words

The Agent transcript could keep moving after PageDown because an older wheel push was still running. Narration also ignored its saved switch because the plugin renamed the setting, and Escape no longer reached its speech controller. Keyboard scrolling now stops the wheel first, the plugin reads the durable setting names again, and Escape reaches narration through a generic application-contributor key observer.

## Outcome

Round 6 is READY at commit `edc316c9bbd42f35f49922610e0d6a0e33754eb9`. The worktree is clean.

Fourteen of the 15 bare inventory commands exit 0 on this tip. The remaining [plugin-manifest smoke](../../../../scripts/harness/smoke-plugin-manifest-harness.ts) is independently red at merge base `6d0a78eb5411531364c4d14eb8919da404966b3b`, as the [Round 6 brief](brief-356-6-6.md) asks me to prove instead of repairing an outside failure.

## Reproduction and causes

The filed [Agent pane UX smoke](../../../../scripts/harness/smoke-agent-pane-ux-harness.ts) timed out while it waited for `agentStuckToBottom === true`. A wheel impulse remained active after PageDown. Its next animation step could move the transcript away from the bottom after the keyboard had reached it.

The filed [audio narration smoke](../../../../scripts/harness/smoke-audio-narration-harness.ts) timed out during enabled boot. [AgentPlugin.ts](../../../../src/modules/agent/AgentPlugin.ts) had shortened seven persisted setting identifiers when Agent became a plugin. Existing settings files still used `agentAudioNarration` and the other durable Agent names, so the plugin read defaults instead. Restoring the narration switch then exposed a second red: the former Bootstrap Escape-to-barge-in call had disappeared during extraction.

The completed Agent pane drive exposed two more lost copy behaviors. Agent contributed Ctrl+C but not Super+C, so Kitty Cmd+C had no Agent action. Agent also declined its copy action when no text was selected, so its zero-character copy proof never completed. The smoke sent three clipboard encodings back to back; it now waits for a work-count completion signal between them instead of starting one asynchronous copy while the prior copy still finishes.

## Repair

- [AgentPaneContent.ts](../../../../src/modules/agent/AgentPaneContent.ts) halts transcript momentum before PageUp, PageDown, Up, or Down applies a keyboard scroll. The rule also applies while a permission prompt owns the composer.
- Agent now claims its copy action with or without a selection. The shared pane-selection seam publishes zero characters for an empty selection.
- [AgentPlugin.ts](../../../../src/modules/agent/AgentPlugin.ts) restores all seven durable Agent setting identifiers and contributes both Ctrl+C and Super+C.
- [ApplicationContributor.interface.ts](../../../../src/modules/app/ApplicationContributor.interface.ts) and [ApplicationContributions.ts](../../../../src/modules/app/ApplicationContributions.ts) add one decoded-key observer seam. Registration follows the contributor lifecycle and is removed on disable.
- [Bootstrap.ts](../../../../src/modules/app/Bootstrap.ts) publishes each decoded key to that generic seam. Agent uses it to barge in only on Escape.
- The shared copy publication path exposes `clipboardCopyCompletionCount`. The Agent pane smoke waits for this load-invariant work count between legacy, Kitty Control, and Kitty Super copy gestures.

## Full bare smoke inventory

| Bare command | Result | Round 6 mechanism |
| --- | --- | --- |
| `bun scripts/harness/smoke-agent-harness.ts` | GREEN | No Round 6 repair was needed. |
| `bun scripts/harness/smoke-agent-pane-ux-harness.ts` | FIXED, THEN GREEN | Keyboard scroll stops old wheel momentum. Agent owns empty copy, contributes Super+C, and the smoke sequences copy completion by work count. |
| `bun scripts/harness/smoke-agent-cancel-harness.ts` | GREEN | No Round 6 repair was needed. |
| `bun scripts/harness/smoke-agent-search-harness.ts` | GREEN | No Round 6 repair was needed. |
| `bun scripts/harness/smoke-agent-engine-switch-harness.ts` | GREEN | No Round 6 repair was needed. |
| `bun scripts/harness/smoke-agent-permissions-harness.ts` | GREEN | No Round 6 repair was needed. |
| `bun scripts/harness/smoke-agent-skill-popup-harness.ts` | GREEN | No Round 6 repair was needed. |
| `bun scripts/harness/smoke-audio-narration-harness.ts` | FIXED, THEN GREEN | Durable settings restore enabled boot. The contributor key observer restores Escape barge-in. |
| `bash scripts/smoke-keyboard-invariant.sh` | GREEN | No Round 6 repair was needed. |
| `bun scripts/harness/smoke-panel-split-harness.ts` | GREEN | No Round 6 repair was needed. |
| `bun scripts/harness/smoke-activitybar-harness.ts` | GREEN | No Round 6 repair was needed. |
| `bun scripts/harness/smoke-clipboard-frame-boundary-harness.ts` | GREEN | No Round 6 repair was needed. It also proves repeated active and idle Agent copies cross the PTY. |
| `bun scripts/harness/smoke-workspace-tabs-harness.ts` | GREEN | No Round 6 repair was needed. |
| `bun scripts/harness/smoke-workspace-layout-isolation-harness.ts` | GREEN | No Round 6 repair was needed. |
| `bun scripts/harness/smoke-plugin-manifest-harness.ts` | RED OUTSIDE DIFF | Tip times out while Structure Navigator uninstall should withdraw its pane. The bare merge-base run is also red and times out earlier while the dirty manifest should regain editor focus. |

## Positive controls

- Removing the keyboard momentum halt made `a keyboard page gesture halts an earlier wheel impulse` fail with `Expected: false, Received: true`. Restoring it made the unit test and the full pane smoke green.
- Removing key-observer registration made `key observers receive decoded keys only while their contribution is active` fail with an empty observed-key list. Restoring it made the test and narration smoke green.
- The filed narration enabled-boot timeout is the persisted-setting positive control.
- After enabled boot was restored, the audio smoke timed out on Escape barge-in until the contributor observer was connected.
- The pane smoke timed out on Kitty Super+C before the Super+C contribution was restored.
- The pane smoke stopped after composer copy while empty copy escaped Agent ownership. Claiming the action produced the required zero-character completion and let the remaining drive finish.

## Invariant verdicts

- [The agent pane is a PaneContent citizen, not a special case](../../../../src/modules/agent/agent.invariants.md): satisfied. Scroll, copy ownership, narration, settings, and keybindings remain in Agent code. Bootstrap sees only a contributor observer and generic pane-selection work.
- [One generator owns each scroll position](../../../../src/modules/ui/scroll.invariants.md): satisfied. The Agent pane keeps one transcript position and one momentum value. A keyboard writer first halts the competing wheel writer.
- [A focused panel routes keystrokes to its active pane content](../../../../src/modules/ui/ui.invariants.md): satisfied. Agent claims its own copy action, including the empty-selection proof. Terminal panes retain their separate raw Ctrl+C fallthrough.
- [Bindings are intent addressed](../../../../src/modules/keybindings/keybindings.invariants.md): satisfied. Ctrl+C and Super+C are data in Agent's contributed keybinding layer and resolve to one `agent.copy` command.
- [Plugin settings live in contributed schema](../../../../src/modules/settings/settings.invariants.md): satisfied. The setting descriptors remain contributed, while their persisted identifiers stay compatible with existing files.
- [Seams are drawn at the shared generator](../../../../project.invariants.md): satisfied. Decoded-key observation is one contributor lifecycle seam. Agent does not add another Bootstrap narration branch.

## Verification

- Required bare inventory: 14 green; one independently red at merge base, as shown in the table.
- Targeted ApplicationContributions and AgentPaneContent tests: 44 pass, 0 fail, 140 expectations.
- `bunx tsc --noEmit`: pass.
- `bash scripts/conventions-gate.sh`: pass. It inspected 656 TypeScript files, found 0 enforced violations, and reported 20 legacy violations outside enforced modules.
- `node .claude/skills/invariants/scripts/check_invariants.mjs --all --refs`: 0 problems. It resolved 1,379 annotations and 266 lattice links.
- `bun scripts/check-coverage-ratchet.ts`: 392 files inspected, with no undeclared decrease against `a9700d9`.
- `bun test`: 2,375 pass, 0 fail, 72,158 expectations across 356 files.
- `git diff --check`: pass.

I did not run [the merge gate](../../../../scripts/merge-gate.sh). I used `SKIP_GATE=1` for commit `edc316c9`, as the [Round 6 brief](brief-356-6-6.md) requires.

## Bycatch

- CONTRACT DRIFT: [narration.invariants.md](../../../../src/modules/narration/narration.invariants.md) says any keystroke calls `bargeIn` and names a direct Bootstrap call. The live behavior and audio smoke require ordinary typing to keep narration playing and only Escape to stop it. This reproduced in the full audio drive.
- PRE-EXISTING RED: the plugin-manifest inventory smoke fails at merge base `6d0a78eb` as well as this tip. The exact timeout moves between dirty-manifest editor focus and Structure Navigator uninstall. I did not change plugin lifecycle behavior outside Agent.

## Instrument feedback

- EASY: the 15-command inventory found later pane behaviors in the same drive instead of waiting for another gate round.
- CONFUSING: the pane smoke reported the same expected clipboard text for legacy, Kitty Control, and Kitty Super copy. The raw OSC bytes were present for the first two, but the log did not name which encoding had timed out.
- MISSING: include the encoding name and `clipboardCopyCompletionCount` in each repeated-copy timeout. The work count separates completed clipboard operations from bytes that arrived while another operation still finishes.

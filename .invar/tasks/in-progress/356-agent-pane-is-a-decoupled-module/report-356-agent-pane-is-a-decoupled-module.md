## In plain words

The Agent lost terminal notes because nobody carried them from the terminal to the Agent, and terminal follow missed commands when Agent opened before Terminal. The voice test also stopped walking before it reached the voice row, while the Agent skill popup could close a different popup. Generic note, pane-lifecycle, and popup-ownership seams now keep those behaviors working, and the widened inventory is green except for one independently red merge-base smoke.

## Outcome

Round 7 is READY at commit `b744969ba3cd95b880a5b0b17ad2bf076f3e9164`. The worktree is clean.

Twenty-two of the 23 bare inventory commands exit 0 on this tip. The remaining [plugin-manifest smoke](../../../../scripts/harness/smoke-plugin-manifest-harness.ts) is red outside this diff: the tip times out during Structure Navigator uninstall, and merge base `c6f7c09032cae85616401f56446fac055a3b630e` independently times out earlier while the dirty manifest should regain editor focus.

## Reproduction and causes

The filed [voice-picker smoke](../../../../scripts/harness/smoke-voice-picker-harness.ts) stopped after 30 Down keys. The contributed Settings schema now places Narration voice at row 42. The setting already published the empty automatic value correctly, but the fixed walk bound never reached it.

The filed [terminal-stage smoke](../../../../scripts/harness/smoke-terminal-stage-harness.ts) executed the replacement command and created its proof file, but the Agent transcript never showed `terminal command user-executed`. The plugin extraction had removed the host subscription that carried a runtime pane's generic `onSystemNote` output to a contributed display surface.

The widened [settings-applied smoke](../../../../scripts/harness/smoke-settings-applied-harness.ts) found `terminalTypingSpeed` uncovered. The terminal-stage fixture still wrote the removed `agentTypingSpeed` key. Its slow and fast drives therefore used the same default and could pass from incidental frame-count variance.

The widened [terminal-follow smoke](../../../../scripts/harness/smoke-terminal-follow-harness.ts) opened Agent first and Terminal second. Agent tried to bind only during its own creation, saw no terminal capability, and never retried after Terminal registered.

The solo [panel-chrome smoke](../../../../scripts/harness/smoke-panel-chrome-harness.ts) reached the Database Add control and opened the correct one-item popup, but the inactive Agent pane closed it on the next projection update. `AgentSkillPopup` shared `BoundedListPopup` and called unconditional `close()`, so it could revoke another adapter's live popup.

## Repair

- [SystemNoteContributions.ts](../../../../src/modules/app/SystemNoteContributions.ts) is the generic source-to-display registry. [Bootstrap.ts](../../../../src/modules/app/Bootstrap.ts) subscribes every runtime pane's `onSystemNote` stream, releases that subscription with the pane, and Agent registers its current transcript as a listener.
- [PanelContentLifecycle.ts](../../../../src/modules/app/PanelContentLifecycle.ts) publishes content only after `PanelHost` can resolve it. [AgentPlugin.ts](../../../../src/modules/agent/AgentPlugin.ts) reconnects its terminal-follow controller when a terminal pane becomes available, independent of creation order.
- [BoundedListPopup.ts](../../../../src/modules/ui/BoundedListPopup.ts) accepts an optional owner identifier and supports owner-checked close. [AgentSkillPopup.ts](../../../../src/modules/agent/AgentSkillPopup.ts) now closes only its own popup session.
- The voice-picker walk uses the published Settings row count instead of 30.
- Terminal-stage and settings coverage use the real `terminalTypingSpeed` name. The matching [terminal invariant](../../../../src/modules/terminal/terminal.invariants.md) now names the same setting.
- Panel-chrome mouse gestures retain their hover move and use the driver's one real-click helper for the press and release bytes.

## Full bare smoke inventory

| Bare command | Result | Round 7 mechanism |
| --- | --- | --- |
| `bun scripts/harness/smoke-agent-harness.ts` | GREEN | No Round 7 repair was needed. |
| `bun scripts/harness/smoke-agent-pane-ux-harness.ts` | GREEN | The Round 6 tail-anchor and copy repairs remain green. |
| `bun scripts/harness/smoke-agent-cancel-harness.ts` | GREEN | No Round 7 repair was needed. |
| `bun scripts/harness/smoke-agent-search-harness.ts` | GREEN | No Round 7 repair was needed. |
| `bun scripts/harness/smoke-agent-engine-switch-harness.ts` | GREEN | No Round 7 repair was needed. |
| `bun scripts/harness/smoke-agent-permissions-harness.ts` | GREEN | No Round 7 repair was needed. |
| `bun scripts/harness/smoke-agent-skill-popup-harness.ts` | FIXED, THEN GREEN | Owner-checked close preserves other bounded-popup consumers while the skill popup still filters and accepts normally. |
| `bun scripts/harness/smoke-audio-narration-harness.ts` | GREEN | The Round 6 durable setting and Escape repairs remain green. |
| `bash scripts/smoke-keyboard-invariant.sh` | GREEN | The bare run preserves Agent-first split ordering and all reserved chords. |
| `bun scripts/harness/smoke-panel-split-harness.ts` | GREEN | No Round 7 repair was needed. |
| `bun scripts/harness/smoke-activitybar-harness.ts` | GREEN | No Round 7 repair was needed. |
| `bun scripts/harness/smoke-clipboard-frame-boundary-harness.ts` | GREEN | No Round 7 repair was needed. |
| `bun scripts/harness/smoke-workspace-tabs-harness.ts` | GREEN | No Round 7 repair was needed. |
| `bun scripts/harness/smoke-workspace-layout-isolation-harness.ts` | GREEN | No Round 7 repair was needed. |
| `bun scripts/harness/smoke-plugin-manifest-harness.ts` | RED OUTSIDE DIFF | Tip: Structure Navigator uninstall timeout. Merge base `c6f7c090`: dirty-manifest editor-focus timeout. |
| `bun scripts/harness/smoke-voice-picker-harness.ts` | FIXED, THEN GREEN | Navigation is bounded by the published Settings row count, so it reaches row 42 and sees `auto (first found)`. |
| `bun scripts/harness/smoke-terminal-stage-harness.ts` | FIXED, THEN GREEN | Runtime system notes reach Agent, and the speed drive uses `terminalTypingSpeed`. |
| `bun scripts/harness/smoke-bounded-list-popup-harness.ts` | GREEN | Owner tracking preserves filtering, hierarchy, pointer activation, and dismissal. |
| `bun scripts/harness/smoke-settings-applied-harness.ts` | FIXED, THEN GREEN | The schema meta-gate names the driven `terminalTypingSpeed` setting. |
| `bun scripts/harness/smoke-terminal-harness.ts` | GREEN | No Round 7 repair was needed. |
| `bun scripts/harness/smoke-terminal-follow-harness.ts` | FIXED, THEN GREEN | A generic post-registration lifecycle event binds Agent to a later-created Terminal. |
| `bun scripts/harness/smoke-terminal-backpressure-harness.ts` | GREEN | No Round 7 repair was needed. |
| `bun scripts/harness/smoke-panel-chrome-harness.ts` | FIXED, THEN GREEN | Agent can no longer close the Database adapter's owned popup; the solo two-scale drive passes. |

## Positive controls

- The filed voice-picker run timed out at the automatic initial value while status stopped at Settings row 30. The row-count walk reached Narration voice at row 42 and completed every keyboard and mouse edit.
- The filed terminal-stage run created `replacement-proof.txt` but timed out on `terminal command user-executed`. The generic note relay made the stamp visible and the full smoke green.
- Replacing `SystemNoteContributions.publish` with a no-op made its new unit test fail with an empty received-note list.
- Replacing `PanelContentLifecycle.publishRegistered` with a no-op made its new unit test fail with an empty registered-content list. Before the live connection, terminal-follow also timed out on its first Bash boundary; after it, every follow mode and secondary scenario passed.
- Restoring unconditional Agent popup close made `closing an inactive skill adapter preserves another bounded popup owner` fail with `Expected: true, Received: false`. Owner-checked close made that test and panel chrome green.
- Settings-applied itself was the positive control for the corrected key: it reported `terminalTypingSpeed` as uncovered before the coverage name changed.

## Invariant verdicts

- [A pane runtime owns its processes](../../../../src/modules/ui/ui.invariants.md): satisfied. The host still sees opaque pane content. It now performs the record's promised generic `onSystemNote` subscription and releases it with runtime content.
- [Terminal follow obeys the live user mode](../../../../src/modules/agent/agent.invariants.md): satisfied. Mode delivery is unchanged, while the generic lifecycle event makes capability binding independent of Agent-first or Terminal-first creation.
- [Bounded list interactions live in one popup](../../../../src/modules/ui/ui.invariants.md): satisfied. Popup ownership is part of the shared generator, so an adapter can release its state without closing another consumer.
- [Terminal replacement preserves human execution](../../../../src/modules/terminal/terminal.invariants.md): satisfied. Human Enter still executes the staged replacement once, and its generic system note reaches Agent.
- [Plugin settings live in contributed schema](../../../../src/modules/settings/settings.invariants.md): satisfied. The voice and terminal settings retain their durable identifiers and are driven through the contributed Settings surface.
- [Seams are drawn at the shared generator](../../../../project.invariants.md): satisfied. Note relay, pane availability, and popup ownership each live at the shared source instead of adding terminal, Agent, or Database branches to Bootstrap.

## Verification

- Widened bare inventory: 22 green; one independently red at merge base, as shown in the table.
- Targeted tests: 24 pass, 0 fail, 91 expectations across six files.
- `bunx tsc --noEmit`: pass.
- `bash scripts/conventions-gate.sh`: pass. It inspected 660 TypeScript files, found 0 violations in the 16 changed files, and reported 20 legacy violations outside enforced modules.
- `node .claude/skills/invariants/scripts/check_invariants.mjs --all --refs`: 0 problems. It resolved 1,379 annotations and 266 lattice links.
- `bun scripts/check-coverage-ratchet.ts`: 392 files inspected, with no undeclared decrease against `a9700d9`.
- `bun test`: 2,378 pass, 0 fail, 72,162 expectations across 358 files.
- `git diff --check` and committed patch check: pass.

I did not run [the merge gate](../../../../scripts/merge-gate.sh). I used `SKIP_GATE=1` for commit `b744969b`, as the [Round 7 brief](brief-356-7-7.md) requires.

## Bycatch

- CONTRACT DRIFT: [narration.invariants.md](../../../../src/modules/narration/narration.invariants.md) still says any keystroke calls `bargeIn` and names a direct Bootstrap call. The live behavior and audio smoke require ordinary typing to keep narration playing and only Escape to stop it. This remains outside the Round 7 repairs.
- PRE-EXISTING RED: the plugin-manifest inventory smoke is red at merge base `c6f7c090` and at this tip. The failure sites differ, so I did not change Structure Navigator or manifest lifecycle behavior.

## Instrument feedback

- EASY: the name-primary inventory found the ignored terminal speed key, the Agent-first terminal-follow loss, and the cross-consumer popup close in one round.
- CONFUSING: panel chrome looked like a swallowed pointer press. A temporary bounded trace showed the correct Database item set opened and then an inactive Agent adapter closed it.
- LOAD SENSITIVITY: one parallel terminal-stage probe reported slow and fast frame counts of 100 and 102. The required solo bare runs passed after the real `terminalTypingSpeed` key was restored. No timeout or threshold was widened.

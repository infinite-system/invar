## In plain words

Invar already copied a selected Claude reply when Ctrl+C or Cmd+C reached the app. The old smoke selected the user's prompt and sent only an older Ctrl+C byte form. I made the shared drag move to the text before pressing, then added checks that select Claude's reply and copy it with Kitty Ctrl+C and Cmd+C.

The harness cannot prove that cmux forwards Cmd+C through SSH. The user must confirm that last hop in their real terminal.

## Outcome

Commit `6f45f645d8a15bf8891b21b51dae9aa03d5802b8` contains the change.

- [HarnessSmokeSupport.ts](../../../../scripts/harness/HarnessSmokeSupport.ts) now moves the pointer to the first selected cell before it presses and drags.
- [smoke-agent-pane-ux-harness.ts](../../../../scripts/harness/smoke-agent-pane-ux-harness.ts) now selects the newest assistant reply. It sends Kitty Ctrl+C (`CSI 99;5u`) and Kitty Cmd+C (`CSI 99;9u`). Both must emit the selected reply through OSC 52.
- [project.coverage-deltas.md](../../../../project.coverage-deltas.md) now records the stronger actual count: assertions 39 → 38, waits 34 → 34.
- No production source changed. The agent pane already used the shared clipboard seam and selection-active copy routing from the earlier copy unification.

## Driven evidence

I drove the default echo backend at 110×50 through one warm real-PTY server.

- One assistant reply: a pointer drag selected `You said: “copy-marker...`. Legacy Ctrl+C, xterm modified Ctrl+C, xterm modified Cmd+C, Kitty Ctrl+C, and Kitty Cmd+C each emitted selected text through OSC 52.
- A three-row selection copied the exact visible reply as three newline-separated rows.
- Large transcript: I added 40 more turns and waited on `agentAssistantEntryCount` after each turn. At 41 assistant replies, Kitty Ctrl+C and Kitty Cmd+C both copied `You said: “scale-co` from the newest reply.
- The shared drag's old cold-pointer form produced no selection repaint in the first probe. Moving to the start cell before pressing made the same drag select and copy. The shared helper now includes that real hover step.

These drives uphold [Copy reaches the host terminal](../../../../src/modules/system/system.invariants.md#copy-reaches-the-host-terminal), [Clipboard emissions flush at frame boundaries](../../../../src/modules/system/system.invariants.md#clipboard-emissions-flush-at-frame-boundaries), and [Harness input and output use the real PTY](../../../../scripts/harness/harness.invariants.md#harness-input-and-output-use-the-real-pty).

## Positive control

I temporarily removed `agent.copy` from `KeybindingPlatform.$primaryModifierActions`. The targeted smoke exited 1 at the new assistant-reply check:

```text
Timed out waiting for an OSC 52 clipboard emission containing You said:; received []
```

I restored the alias. The same smoke then printed `assistant reply selection copies through Kitty Ctrl+C and Cmd+C` and `ALL-PASS`.

## Cmd+C over cmux and SSH

The harness proves the app's Kitty-super input and OSC 52 output. It cannot reproduce cmux's local key handling or its SSH forwarding.

The user must run this commit in their normal cmux SSH session:

1. Select part of a Claude reply in the agent pane.
2. Press Ctrl+C, then paste into a local macOS text field.
3. Select the reply again, press Cmd+C, then paste into the same local field.

For a sharper split, launch Invar with `TUI_STATUS_PATH=/tmp/invar-copy-status.json`. After Cmd+C, inspect `lastCopyChars` in that file. A positive count with an unchanged Mac clipboard means the key reached Invar but cmux filtered OSC 52. An unchanged count means the Cmd+C event or the selection did not reach the app.

## Invariant review

The task brief omitted the [keybinding contract](../../../../src/modules/keybindings/keybindings.invariants.md). This work also implicates these records:

- [A terminal delivers encoded sequences not keys](../../../../src/modules/keybindings/keybindings.invariants.md#a-terminal-delivers-encoded-sequences-not-keys): upheld by driving distinct byte forms for the same copy intent.
- [Modifier fidelity varies by protocol](../../../../src/modules/keybindings/keybindings.invariants.md#modifier-fidelity-varies-by-protocol): upheld. Ctrl remains the floor, and Kitty super remains an alias.
- [Focus owns the keystroke](../../../../src/modules/keybindings/keybindings.invariants.md#focus-owns-the-keystroke): upheld. The focused agent pane copied only while it held a selection.
- [The canonical layer is the floor](../../../../src/modules/keybindings/keybindings.invariants.md#the-canonical-layer-is-the-floor): upheld. Cmd+C does not replace Ctrl+C.

## Verification

- Six live smokes that use `dragBetweenCells`: all passed. No downstream smoke flipped.
- `bun test`: 2,352 passed, 0 failed, 72,105 assertions across 353 files.
- `bunx tsc --noEmit`: exit 0.
- `bash scripts/conventions-gate.sh`: PASS.
- `node .claude/skills/invariants/scripts/check_invariants.mjs --all`: PASS.
- `node .claude/skills/invariants/scripts/check_invariants.mjs --refs`: 1,363 annotations and 266 lattice links resolved, 0 problems.
- `bun scripts/check-coverage-ratchet.ts`: PASS, 392 files inspected.
- The commit hook accidentally started `merge-gate` before I supplied the brief's required `SKIP_GATE=1`. I stopped it with exit 130. No merge-gate run completed. The final commit used `SKIP_GATE=1`.

## PTY usability

The warm drive server worked well. One boot supported the small drive, protocol probes, and the 41-reply scale drive without rebuilding app state.

The named key driver cannot encode `Super+C`, so the smoke must send Kitty CSI-u bytes directly. A future harness change should add `Super` to `HarnessInput.key` and keep the same real-PTY byte path.

## Bycatch

- Contract violation: [The agent pane is a PaneContent citizen, not a special case](../../../../src/modules/agent/agent.invariants.md#the-agent-pane-is-a-panecontent-citizen-not-a-special-case) says the host cannot special-case the agent and cannot render agent content under the terminal heading. `Bootstrap.ts` uses `instanceof AgentPaneContent.Class` branches for copy and input. The 110×50 drive also showed the Claude body under a `Terminal` tab while `panelActiveContentKind` was `agent`. This reproduced on later frames. I did not change it.
- Contract map gap: the filed brief named the system and harness records, but omitted the four keybinding records listed above. I reported the gap and did not edit the brief.

## In plain words

The reported copy failure did not happen in the real echo drive. A selected Claude reply copied after an explicit click and a live composer draft. I did not change production code. I added this exact sequence to the PTY smoke so a later focus-dependent failure cannot pass unseen.

## Outcome

Commit `a668986517a7c1f432ede6c55dbc148caf746bd6` contains the change.

The conductor later merged current `main` into this worktree at `56dd66d1552ec5f3c3bf2e11b9d4b5d39e6f789c`. That merge includes the task commit. The worktree is clean.

- [smoke-agent-pane-ux-harness.ts](../../../../scripts/harness/smoke-agent-pane-ux-harness.ts) now clicks the visible composer and types a live draft. It selects the newest assistant reply and copies it with legacy Ctrl+C, Kitty Ctrl+C, and Kitty Cmd+C.
- [project.coverage-deltas.md](../../../../project.coverage-deltas.md) now records the stronger smoke at assertions 39 → 38 and waits 34 → 36.
- No production source changed because the reported defect did not reproduce.

## Driven evidence

I drove the default echo backend at 110×50 through a warm real PTY.

- Transcript arm: dragging the assistant reply and sending legacy Ctrl+C emitted `You said: “composer` through OSC 52.
- Composer arm: I clicked the composer, typed a prompt, waited for the reply, clicked the composer again, typed `COMPOSERFOCUS`, dragged the assistant reply, and sent legacy Ctrl+C. The driver emitted `You said: “explicit` through OSC 52. The turn state was `idle` before and after the chord.
- No-selection arm: legacy Ctrl+C emitted no clipboard text. The delayed echo turn stayed `running`, `agentBusy` stayed true, and `lastCopyChars` stayed 0. The echo child did not show the interrupt behavior assumed by the task.
- Scale parity: the same composer draft, reply drag, and legacy Ctrl+C path emitted `You said: “scale-co` with `lastCopyChars=19` in the shared 10-line and 100,000-line fixtures.

The existing selection model explains the result. [AgentPaneContent.ts](../../../../src/modules/agent/AgentPaneContent.ts) has no separate transcript and composer keyboard focus. Its selection query checks both surfaces. Its copy path uses an active composer selection first and an active transcript selection second.

## Positive control

I temporarily made [AgentPaneContent.ts](../../../../src/modules/agent/AgentPaneContent.ts) return the composer copy result whenever the composer contained a draft. This plants the suspected defect: a live composer draft hides an active transcript selection.

The new targeted smoke exited 1 at the composer-focus arm:

```text
Timed out waiting for an OSC 52 clipboard emission containing You said:; received []
```

I removed the plant. The same smoke then printed `composer-focused assistant reply copies through legacy and Kitty Ctrl+C and Cmd+C` and `ALL-PASS`.

## Invariant review

The driven behavior upholds these records:

- [Copy reaches the host terminal](../../../../src/modules/system/system.invariants.md#copy-reaches-the-host-terminal): the selected reply reached OSC 52 in both focus arms and at both fixture sizes.
- [Clipboard emissions flush at frame boundaries](../../../../src/modules/system/system.invariants.md#clipboard-emissions-flush-at-frame-boundaries): the driver observed the completed OSC 52 emission after the copy action.
- [Harness input and output use the real PTY](../../../../scripts/harness/harness.invariants.md#harness-input-and-output-use-the-real-pty): every click, drag, key, and clipboard observation used terminal bytes.
- [Focus owns the keystroke](../../../../src/modules/keybindings/keybindings.invariants.md#focus-owns-the-keystroke): the agent pane owned Ctrl+C and copied its active transcript selection.
- [Composer editing uses the input model](../../../../src/modules/agent/agent.invariants.md#composer-editing-uses-the-input-model): the smoke reached and edited the composer through its visible prompt and real input path.

The filed brief omitted the keybinding and agent records above. That omission is a contract-map finding.

## Verification

- Both focus arms and the no-selection arm were driven with clipboard and turn-state observations.
- `bun scripts/harness/smoke-agent-pane-ux-harness.ts`: `ALL-PASS`, including a run after the concurrent `main` merge.
- `bun test`: 2,353 passed, 0 failed, 72,111 assertions across 353 files.
- `bunx tsc --noEmit`: exit 0.
- `bash scripts/conventions-gate.sh`: PASS.
- `node .claude/skills/invariants/scripts/check_invariants.mjs --all`: PASS.
- `node .claude/skills/invariants/scripts/check_invariants.mjs --refs`: 1,374 annotations and 266 lattice links resolved, 0 problems.
- `bun scripts/check-coverage-ratchet.ts`: PASS, 392 files inspected against `a9700d9`.
- `git show --check`: clean.
- The commit used `SKIP_GATE=1`. I did not run merge-gate, as required by the brief.

## PTY usability

The warm server kept the exact focus arms in one app session. The scale drives used the shared generated fixtures and removed them when each one-shot session ended.

The zero-delay echo backend can enter and leave `agentBusy=true` between status polls. Waiting for the visible reply was the honest completion condition for the scale drives. On the 100,000-line fixture, `panelActiveContentKind=agent` arrived before the composer painted, so the drive also needed a screen condition before it chose the composer cell.

A first coordinate probe chose a status-bar `❯` instead of the composer prompt. Restricting the visible-text search to the published active-panel rectangle fixed the probe. A panel-scoped text target is safer than an unscoped last-match choice.

## Bycatch

- Existing contract violation: [The agent pane is a PaneContent citizen, not a special case](../../../../src/modules/agent/agent.invariants.md#the-agent-pane-is-a-panecontent-citizen-not-a-special-case) says agent content must not render under a terminal heading. The 110×50 drive showed the Claude body under a `Terminal` tab while `panelActiveContentKind` was `agent`. It reproduced on later frames. This is the same finding as #477 (copy from the agent pane). I did not change it.
- Contract-layer gap: the task requires Ctrl+C to interrupt an agent child when no selection exists, but no current agent or keybinding record claims that behavior. The no-selection echo drive emitted no copy and also did not stop the running turn. I did not add an unrequested interrupt policy.
- Contract-map gap: the filed brief named system and harness records but omitted the keybinding and agent records listed in the invariant review. I did not edit the brief.

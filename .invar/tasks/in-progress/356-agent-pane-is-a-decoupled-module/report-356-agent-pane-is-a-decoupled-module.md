## In plain words

The shared popup took every key after `/` opened the Agent skill list. The letters `i` and `v` therefore never reached the Agent composer, so the list could not narrow to `ivue`. The popup now says whether it owns typing, and the Agent suggestion list leaves typing with its composer while keeping arrows, Enter, and Escape.

## Outcome

Round 5 is READY at branch tip `86b0dcb7`. Commit `86b0dcb7` contains the repair. The worktree is clean.

The [Agent skill-popup smoke](../../../../scripts/harness/smoke-agent-skill-popup-harness.ts) now reaches `smoke-agent-skill-popup-harness: ALL-PASS`. The complete Round 2–4 smoke set remains green.

## Reproduction and cause

I ran the exact command from the [Round 5 brief](brief-356-5-5.md) before editing. Typing `/` opened both skill rows. Typing `i` and `v` then timed out at `the /iv prefix filters to ivue`.

[AgentSkillPopup.ts](../../../../src/modules/agent/AgentSkillPopup.ts) now uses the shared [BoundedListPopup.ts](../../../../src/modules/ui/BoundedListPopup.ts). That list defaults to modal keyboard ownership. [OverlayLayer.ts](../../../../src/modules/ui/OverlayLayer.ts) therefore told the application that a modal overlay owned the screen. The shared list route consumed `i` and `v`, but its own search input was disabled because Agent supplies an already-filtered list. The focused Agent PaneContent never received the letters and never recomputed the slash prefix.

After ordinary typing returned to the pane, the drive exposed a second red at Escape. The Agent context binding resolved Escape to `agent.cancelTurn` before raw pane input. It cancelled an idle turn and left the skill list open.

## Repair

- [BoundedListPopup.ts](../../../../src/modules/ui/BoundedListPopup.ts) adds a generic `capturesKeyboard` open option. Existing list callers keep the modal default.
- [OverlayLayer.ts](../../../../src/modules/ui/OverlayLayer.ts) treats an open bounded list as modal only when that list declares keyboard ownership.
- [AgentSkillPopup.ts](../../../../src/modules/agent/AgentSkillPopup.ts) sets `capturesKeyboard: false`. It still uses the one shared list for paint, geometry, selection, movement, and acceptance.
- [AgentPaneContent.ts](../../../../src/modules/agent/AgentPaneContent.ts) consumes only the popup's Escape, Up, Down, and Enter keys. Other keys continue through its normal composer input path, whose existing synchronization recalculates the skill prefix.
- While the list is open, Agent declines its `agent.cancelTurn` context action. The generic focused-pane route then forwards Escape to `handleKey`, which dismisses the popup without deleting `/iv`.

No application-core condition names Agent or Agent skills.

## Driven evidence

- [Agent skill-popup smoke](../../../../scripts/harness/smoke-agent-skill-popup-harness.ts): `ALL-PASS`. `/iv` leaves only `ivue`; the list opens upward; Down and Enter insert `/ivue`; Escape preserves `/iv`; a mid-word slash stays closed; a slash after whitespace opens the list.
- Bare [keyboard invariant smoke](../../../../scripts/smoke-keyboard-invariant.sh): pass. The saved-home run keeps `agent | terminal`, follow-mode cycling, toggle-close, and terminal pass-through.
- [Panel-split smoke](../../../../scripts/harness/smoke-panel-split-harness.ts): `ALL-PASS`.
- [Activity bar smoke](../../../../scripts/harness/smoke-activitybar-harness.ts): `ALL-PASS`.
- [Clipboard frame-boundary smoke](../../../../scripts/harness/smoke-clipboard-frame-boundary-harness.ts): `ALL-PASS`.
- [Workspace tabs smoke](../../../../scripts/harness/smoke-workspace-tabs-harness.ts): `ALL-PASS`.
- [Workspace layout isolation smoke](../../../../scripts/harness/smoke-workspace-layout-isolation-harness.ts): `ALL PASS: workspace layout isolation`.

The filed `/iv` timeout was the first positive control. The later Escape timeout was a second positive control. Both conditions turned green in the same real app drive.

## Invariant verdicts

- [The agent pane is a PaneContent citizen, not a special case](../../../../src/modules/agent/agent.invariants.md): satisfied. Composer typing, action decline, and popup navigation remain inside Agent PaneContent. The application host reads only generic popup and pane contracts.
- [A focused panel routes keystrokes to its active pane content](../../../../src/modules/ui/ui.invariants.md): satisfied. A non-capturing suggestion popup leaves ordinary characters with the focused Agent pane.
- [Input overlays share one modal slot](../../../../src/modules/ui/ui.invariants.md): satisfied. Bounded lists still use one overlay host. Each opening now declares whether it captures the keyboard; all existing modal callers retain the default.
- [Bounded list interactions live in one popup](../../../../src/modules/ui/ui.invariants.md): satisfied. Agent does not implement a second list, geometry engine, selection model, or pointer route.
- [Agent skill invocations use the composer popup](../../../../src/modules/agent/agent.invariants.md): satisfied. The composer produces each prefix, and AgentSkillPopup adapts its matches into the shared bounded list.
- [Seams are drawn at the shared generator](../../../../project.invariants.md): satisfied. Keyboard capture is one bounded-list property used by overlay ownership. Focused-pane action decline remains the existing generic input seam.
- [Focus owns the keystroke](../../../../src/modules/keybindings/keybindings.invariants.md): the Round 2 refinement remains proposed and unchanged. This repair does not add another exception. It makes the popup's ownership explicit and returns unclaimed keys to the already-focused pane.

I did not find a missing invariant for this repair. The Agent skill record already names live prefix filtering, the focused Agent input route, and the shared popup.

## Verification

- Targeted Agent pane, Agent skill-popup, and bounded-list tests: 50 pass, 0 fail, 156 expectations.
- `bunx tsc --noEmit`: pass.
- `bash scripts/conventions-gate.sh`: pass. File grammar inspected 656 source files and found 0 enforced violations. It reported 20 legacy violations outside enforced modules.
- `node .claude/skills/invariants/scripts/check_invariants.mjs --all --refs`: 0 problems.
- `bun scripts/check-coverage-ratchet.ts`: 392 files inspected, with no undeclared decrease against `a9700d9`.
- `bun test`: 2,373 pass, 0 fail, 72,155 expectations across 356 files.
- `git diff --check`: pass.

I did not run [the merge gate](../../../../scripts/merge-gate.sh). I used `SKIP_GATE=1` for commit `86b0dcb7`, as the [Round 5 brief](brief-356-5-5.md) requires.

## Bycatch

None observed during the skill-popup drive or the six Round 2–4 regression drives.

## Instrument feedback

- EASY: the skill smoke separates opening, filtering, placement, acceptance, dismissal, and token boundaries. The next red became visible as soon as the previous stage turned green.
- CONFUSING: the status timeout named only the expected filtered item set. It did not show the composer text or the popup's keyboard-capture state, so a dead text listener and host-level key capture looked identical at first.
- MISSING: include the current composer text, popup item identifiers, and popup keyboard-capture state in the filtering timeout. Those three values would locate this routing failure in one sighting.

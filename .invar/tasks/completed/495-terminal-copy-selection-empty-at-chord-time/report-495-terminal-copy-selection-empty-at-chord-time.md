## In plain words

A mouse-aware child took the drag, so Invar had no terminal selection to copy. Shift now gives that drag to Invar. Ctrl+C copies the selected text, while a plain mouse gesture still reaches the child.

## Status

READY

Commit: `71cb5eb36b2786d23220cfebe713e34909bb0a84` (`Shift drag copies mouse-aware terminal text`)

The worktree is clean. I did not push, merge, or edit the task contract.

## Result

Shift+drag is now the proposed host-selection gesture when child mouse tracking is active. The Shift state chooses the owner at pointer down. That owner stays fixed through pointer move and release.

An unmodified pointer gesture remains child-owned when child mouse tracking is active. Wheel routing is unchanged.

This UX choice needs user confirmation, as requested by the [brief](brief-495-1-terminal-copy-selection-empty-at-chord-time.md). The candidate is implemented and verified, but the invariant record is not yet changed.

## Cause and evidence

I reproduced the failure through the real PTY path before changing code.

- A controlled child enabled DECSET 1000, 1002, and 1006 mouse modes. It received the exact press, drag, and release bytes `1b5b3c303b39313b344d1b5b3c33323b39363b344d1b5b3c303b39363b346d`.
- The child painted `CHILD2-HIGHLIGHT`. Invar still reported null selection endpoints.
- Ctrl+C reached the child as byte `03`. No OSC52 copy was emitted.
- Closing telemetry reported `focusedSurface:"terminal"`, `selectionOwner:"none"`, `selectionLength:0`, `routeTaken:"forwarded-to-child-pty"`, and `osc52Emitted:false`.

This confirmed the mouse-mode rival. The visible highlight belonged to the child. Invar never owned a selection at chord time.

I rejected the repaint rival. A busy child repainted from `BUSY-0010` through `BUSY-0199`. Invar's selection endpoints stayed at line 3, columns 45 and 51.

I also rejected a telemetry blind spot. A plain terminal selection copied `TELEMETRY`, which is 9 characters. Closing telemetry saw the selection and OSC52 copy. Its generic owner name led to the telemetry refinement described below.

## Changes

- [TerminalPaneContent.ts](../../../../src/modules/terminal/TerminalPaneContent.ts) keeps a Shift-started drag on the host selection path. It sends no pointer bytes to a mouse-aware child for that gesture.
- [Bootstrap.ts](../../../../src/modules/app/Bootstrap.ts) reports the focused content kind as the copy-selection owner. Terminal selections now report `terminal` instead of `focused-pane-selection`.
- [TerminalPaneContent.test.ts](../../../../src/modules/terminal/TerminalPaneContent.test.ts) locks the ownership choice with child mouse tracking active.
- [smoke-terminal-harness.ts](../../../../scripts/harness/smoke-terminal-harness.ts) drives the real Shift gesture. It checks selection paint, copied text, OSC52, telemetry, and the unchanged plain child gesture.

## Driven result

The default small fixture copied `SHIFT-`, which is 6 characters. Telemetry reported `selectionOwner:"terminal"`, `selectionLength:6`, `routeTaken:"copy-handler"`, `osc52Emitted:true`, and `osc52ByteLength:6`.

The gated child-mode smoke copied exact text `MOUSE`, which is 5 characters. A later plain click and wheel gesture still reached the child.

The shared 100,000-line fixture reported `lineCount:100000`. Shift+drag copied exact text `LARGE`, which is 5 characters. Small and large inputs therefore used the same ownership and copy path.

## Positive controls

- I temporarily removed the Shift bypass at pointer down. The unit check failed because the child received 3 pointer writes instead of 0. I restored the change.
- I temporarily restored the generic telemetry owner. The terminal smoke failed while waiting for terminal-owned copy telemetry. I restored the terminal owner.

Both controls went red for the defect they claim to catch.

## Invariant review

An independent verifier passed the change with one `refines` downgrade at scoping severity.

- `Pane chrome and child cells keep separate authority` in [terminal.invariants.md](../../../../src/modules/terminal/terminal.invariants.md) needs refinement. Its pointer clause is broader than its host-selection scope.
- `Child terminal modes own wheel input` is upheld. The wheel path did not change.
- `Copy reaches the host terminal` is strengthened. The smoke observes exact OSC52 output after a real host-owned selection.
- `Focus owns the keystroke` in [system.invariants.md](../../../../src/modules/system/system.invariants.md) is upheld. Ctrl+C follows the focused terminal binding.
- `A focused pane consumes only its own scoped bindings` in [ui.invariants.md](../../../../src/modules/ui/ui.invariants.md) is upheld.
- The terminal remains a runtime plugin. Copy still crosses the clipboard capability instead of adding a host dependency on the concrete terminal type.

Proposed pointer wording for user confirmation:

> If a pointer gesture begins on a child cell while child mouse tracking is enabled, the child owns it unless Shift is held at pointer down. A Shift-started gesture stays host-owned for terminal selection and writes no pointer bytes to the child. With tracking off, Invar keeps terminal selection behavior and writes no pointer bytes to the child.

The record should also say that this exception does not apply to wheel input.

## Verification

- `bunx tsc --noEmit`: exit 0.
- `bun test src/modules/terminal/TerminalPaneContent.test.ts`: 7 passed, 0 failed, and 16 assertions.
- `bun scripts/harness/smoke-terminal-harness.ts`: `ALL-PASS`.
- `node .claude/skills/invariants/scripts/check_invariants.mjs --all --refs`: 1,374 annotations, 266 lattice links, and 0 problems.
- `bash scripts/conventions-gate.sh`: passed across 649 TypeScript files and 16 script files.
- The required commit hook completed the full merge gate. It reported `ALL-PASS` with no retry-only greens.

The commit gate also reported two unrelated contention-tier failures. The scrollbar and plugin-manifest probes remained report-only, so the blocking verdict stayed green.

## Instrument feedback

- EASY: The warm drive server, graph waits, raw pointer primitives, screen color probes, and copy telemetry exposed the full path.
- CONFUSING: A text wait matched the shell's echoed command before the child enabled mouse mode. Waiting for graph state `mouseTrackingMode:"drag"` removed that false match.
- MISSING: The raw pointer sequence still needs a reusable drag primitive. This is already filed as #489 (DriveSession drag primitive), so I did not duplicate it.

## Bycatch

- Contract-layer gap: `Pane chrome and child cells keep separate authority` combines independently failing color and pointer rules without a `Components` field. A later contract cleanup should add delete-testable components or split generators.
- No unrelated runtime defect reproduced twice during this task.

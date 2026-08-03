## In plain words

Ctrl+C could copy an Agent selection or go to a terminal child, but the log did not say which path was dying. The app now flashes the copied character count and writes one exact record for the focused surface, the selection, the route, and the OSC 52 result. A real split-panel drive proves that a terminal-focused Ctrl+C still goes to the child while an Agent selection remains active.

## Result

Task #487 (copy-path telemetry names the dying stage) is READY in commit `850242cd` (`copy telemetry names the routed stage`). The worktree is clean. I did not push, merge, or run the requested merge gate.

The implementation does four things:

- [Clipboard.ts](../../../../src/modules/system/Clipboard.ts) records whether the current copy emitted OSC 52 and its UTF-8 byte length.
- [AgentPaneContent.ts](../../../../src/modules/agent/AgentPaneContent.ts) reports the owner and exact character length of an Agent composer or transcript selection. Transcript copy and telemetry use the same text reconstruction.
- [Bootstrap.ts](../../../../src/modules/app/Bootstrap.ts) writes one `COPY_PATH_TELEMETRY` JSON record for each instrumented copy attempt when `INVAR_COPY_PATH_TELEMETRY=1`. Its fields are `focusedSurface`, `selectionOwner`, `selectionLength`, `routeTaken`, `osc52Emitted`, and `osc52ByteLength`.
- [smoke-panel-split-harness.ts](../../../../scripts/harness/smoke-panel-split-harness.ts) locks the success flash, handler route, and explicit terminal-child forwarding route through real PTY input.

The routing behavior did not change.

## Drive evidence

I started with a warm PTY server and the default app settings. I drove workspace focus, Agent transcript selection, Agent composer selection, and a terminal-focused split. I inspected the screen, app graph, raw OSC 52 emissions, and diagnostic log.

Before the change, a selected transcript emitted `copy-path` as 9 OSC 52 characters and flashed `Copied 9 chars (osc52)`. A selected composer emitted `composer` as 8 characters. The app exposed the successful copy, but it did not name the focused surface, selection owner, route, or OSC 52 byte result in one record.

After the change, the same real paths produced these fingerprints:

```text
{"focusedSurface":"agent","selectionOwner":"agent-transcript","selectionLength":10,"routeTaken":"copy-handler","osc52Emitted":true,"osc52ByteLength":10}
{"focusedSurface":"agent","selectionOwner":"agent-composer","selectionLength":7,"routeTaken":"copy-handler","osc52Emitted":true,"osc52ByteLength":7}
{"focusedSurface":"terminal","selectionOwner":"agent-composer","selectionLength":2,"routeTaken":"forwarded-to-child-pty","osc52Emitted":false,"osc52ByteLength":0}
```

The screen flashed `Copied 10 chars (osc52)` and `Copied 7 chars (osc52)` for the successful Agent copies. In the split case, I left a two-character Agent composer selection active, clicked the terminal, and pressed Ctrl+C. The record names the terminal as focused, preserves the Agent selection facts, reports `forwarded-to-child-pty`, and reports no OSC 52 emission. This is the requested dying-stage evidence.

Scale parity does not apply. This change performs bounded work once per copy chord. It adds no per-row, per-item, or per-frame path.

## Positive control

I temporarily planted a wrong production route label. The terminal-forward branch reported `copy-handler` instead of `forwarded-to-child-pty`. The locking smoke went red after 17.7 seconds with:

```text
Timed out waiting for output condition: an active agent selection forwarded to the terminal child writes explicit telemetry
```

I removed the plant. The same smoke then passed both new telemetry checks and all existing panel-split checks.

## Verification

- `bun test src/modules/system/Clipboard.test.ts src/modules/agent/AgentPaneContent.test.ts`: 32 passed, 0 failed.
- `bun test`: 2,354 passed, 0 failed, 72,117 expectations.
- `bunx tsc --noEmit`: passed.
- `bun scripts/harness/smoke-panel-split-harness.ts`: `ALL-PASS`.
- `node .claude/skills/invariants/scripts/check_invariants.mjs --all --refs`: 1,374 annotations, 266 lattice links, 0 problems.
- `bash scripts/conventions-gate.sh`: passed.
- `bun scripts/check-coverage-ratchet.ts`: inspected 392 files; no undeclared decrease against `a9700d9`.
- `git show --check 850242cd`: passed.
- `git status --short`: empty.

The copy smoke changed [the declared panel-split coverage](../../../../project.coverage-deltas.md) from 29 to 31 branch-side assertions and from 31 to 33 branch-side waits. The base census stays at 35 assertions and 33 waits.

## Invariant review

| Record | State and evidence |
|---|---|
| [Project: Seams are drawn at the shared generator](../../../../project.invariants.md) | Upheld. OSC 52 facts come from the Clipboard seam. Agent transcript text comes from one shared reconstruction used by copy and telemetry. |
| [Project: Editable text fields share one input model](../../../../project.invariants.md) | Upheld. Composer selection still comes from the existing Agent composer and text-input path. Telemetry only reads its selected text. |
| [System: Clipboard emissions flush at frame boundaries](../../../../src/modules/system/system.invariants.md) | Upheld. The existing clipboard emitter and terminal writer remain unchanged. The new fields record the emitter result after it returns. |
| [System: Copy reaches the host terminal](../../../../src/modules/system/system.invariants.md) | Strengthened. The screen, decoded OSC 52 content, emission boolean, and UTF-8 byte length now agree in unit and PTY drives. |
| [System: Observability never crashes the app](../../../../src/modules/system/system.invariants.md) | Upheld. Telemetry uses the existing logging seam and stays behind `INVAR_COPY_PATH_TELEMETRY=1`. Logging failures retain the existing non-fatal behavior. |
| [Agent: Composer editing uses the input model](../../../../src/modules/agent/agent.invariants.md) | Upheld. No composer editing or selection mutation changed. |
| [Agent: The agent pane is a PaneContent citizen, not a special case](../../../../src/modules/agent/agent.invariants.md) | The task does not add a new routing special case. A pre-existing disagreement with the current host route is recorded under Bycatch. |
| [Keybindings: Focus owns the keystroke](../../../../src/modules/keybindings/keybindings.invariants.md) | Upheld. The terminal-focused fingerprint proves Ctrl+C goes to the terminal child even while an Agent selection remains active. |
| [Keybindings: Bindings are intent addressed](../../../../src/modules/keybindings/keybindings.invariants.md) | Upheld. The copy action identifiers and dispatch path did not change. |
| [UI: A focused panel routes keystrokes to its active pane content](../../../../src/modules/ui/ui.invariants.md) | Runtime behavior is upheld. The existing mechanism conflicts with the record's stronger no-pane-type clause; see Bycatch. |
| [UI: A focused split panel routes keystrokes to the focused cell](../../../../src/modules/ui/ui.invariants.md) | Upheld. The real click and Ctrl+C drive reaches only the focused terminal child. |
| [Harness: Harness input and output use a real PTY](../../../../scripts/harness/harness.invariants.md) | Upheld. The smoke uses real clicks, keys, screen output, and the child PTY. |
| [Harness: The terminal emulator is the screen oracle](../../../../scripts/harness/harness.invariants.md) | Upheld. The smoke observes `Copied 2 chars` on the rendered screen. |
| [Harness: Harness waits observe conditions, not frame ordinals](../../../../scripts/harness/harness.invariants.md) | Upheld. New waits name the copy status and exact log content. They use no sleep or frame ordinal. |
| [Harness: Async-published state is always awaited](../../../../scripts/harness/harness.invariants.md) | Upheld. The smoke awaits `lastCopyChars` before it reads the result. |
| [Harness: Every wait names itself](../../../../scripts/harness/harness.invariants.md) | Upheld. Both telemetry waits state the route and selection condition they observe. |

## Bycatch

- Pre-existing contract disagreement, reproduced by inspection: [ui.invariants.md](../../../../src/modules/ui/ui.invariants.md) says the panel host must not name a pane class or action prefix, and [agent.invariants.md](../../../../src/modules/agent/agent.invariants.md) says the Agent pane is not a special case. [Bootstrap.ts](../../../../src/modules/app/Bootstrap.ts) already branches on `AgentPaneContent.Class` and `agent.*` before the generic PaneContent route. I did not change or repair this routing.
- Tooling issue, seen once: the normal commit hook automatically started the full merge gate even though [the task brief](brief-487-1-copy-path-telemetry-names-the-dying-stage.md) forbids builders from running it. I stopped only the owned hook process after its coverage check exposed stale panel-split counts. I corrected [the coverage declaration](../../../../project.coverage-deltas.md), ran the coverage ratchet directly, and committed with the documented `SKIP_GATE=1` bypass. I did not repeat the full gate.

## Instrument feedback

Easy:

- One warm drive server preserved the Agent and split state across probes.
- `app.key`, condition waits, graph reads, screen reads, and decoded `clipboardEmissions` made the route comparison direct.
- Screen-derived click coordinates kept the split and focus drive on visible controls.

Confusing:

- The warm driver replaces an inherited `TUI_LOG_PATH` with its own diagnostic path. The requested path therefore did not exist. I had to inspect the raw driver to find `diagnosticLogPath`.
- A broad search for `  ❯ ` matched the editor navigation row before the Agent composer. The narrower visible composer text worked, but this was not obvious from the first result.

Missing:

- A primitive `DriveSession` drag operation would keep transcript selection out of raw-driver calls.
- A direct diagnostic-log path or tail method on `DriveSession` would make structured-log probes first-class and would expose the warm driver's path replacement.

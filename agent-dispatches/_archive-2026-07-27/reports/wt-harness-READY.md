# PTY test harness READY

## Tip

`63c24b27d8c51851beec9c5b0a9d65102e3be4f5`

Branch `feat-pty-test-harness`, rebased onto current `origin/main`
`626a66b` immediately before final verification.

## Seam extraction

`src/modules/terminal/OpenPty.ts` is now the single plain-stateful owner of the `openpty`,
`TIOCSWINSZ`, master-read, master-write, and descriptor-close generator.

- `OpenPtyBackend` keeps its prior role and behavior: it chooses and spawns the interactive shell,
  gives the child the slave descriptor, and implements `TerminalBackend`.
- `PtyTestDriver` role-inverts the same allocator: it gives the real Invar entry
  (`bun run src/main.ts <workspace>`) the slave descriptor and acts as the terminal on the master.
- No FFI code is copied into the harness. `rg "openpty:" src/modules scripts/harness -g "*.ts"`
  finds the symbol declaration only in `OpenPty.ts`.
- `smoke-terminal.sh` passed after extraction, including real tty detection, `stty` sizing,
  interactive bytes, resize/SIGWINCH behavior, and focused-terminal quit.

## Harness

`PtyTestDriver`:

- spawns the unmodified real entry on a sized PTY with `TERM=xterm-256color` and
  `COLORTERM=truecolor`;
- sends named keys (including Shift/Alt/Control modifiers), SGR mouse events, and bracketed paste;
- feeds every application-output byte unchanged into the production `TerminalEmulator`;
- returns immutable snapshots with text-row helpers, cursor coordinates, foreground/background
  mode and value, width, and bold/dim/italic/underline/blink/inverse/invisible/strikethrough/overline
  attributes;
- does not enable `TUI_STATUS_PATH`, `TUI_FRAME_PATH`, `TUI_FRAME_DUMP`, or another app-side test
  hook.

The harness and PTY seam have colocated contracts. The originals remain registered because tmux is
the independent-emulator ring that can expose a common-mode defect in the production
`TerminalEmulator` used as the harness oracle.

## Quiescence mechanism

OpenTUI emits DEC private mode 2026 synchronized-output frames. A raw output capture contained three
matched `ESC[?2026h` / `ESC[?2026l` pairs. The harness therefore uses markers, not stream silence:

1. `SynchronizedOutputQuiescence` scans raw bytes and carries partial markers across PTY chunks.
2. A frame completes only when a matched outer end marker arrives.
3. `awaitQuiescence()` then flushes xterm's asynchronous write queue before allowing a snapshot.
4. Timeouts only fail a missing boundary; no fixed sleep declares the screen settled.

Recorded-stream unit tests cover unmatched ends, every-byte chunk splitting, and nested markers.

## Proof-of-concept ports

- `smoke-wrap-harness.ts`: palette wrap enable, multi-row line, native cursor alignment after a
  continuation-row click/type, and Alt+Z wrap-off round trip.
- `smoke-selection-harness.ts`: item-anchored click/hover/wheel/blur/keyboard behavior across file
  tree, changes, and commit-log lists, asserted from exact truecolor cell backgrounds.
- `smoke-scrollbars-harness.ts`: vertical and horizontal behavior, independent changes/log offsets,
  fitting-pane absence, and the byte-only solid-thumb assertion.

The merge gate registers each harness smoke additively beside its unchanged tmux original.

## Per-cell scrollbar assertion

On the overflowing 54×28 fixture, the harness found the tree bar at column 26. Rows 3 through 11
were a contiguous nine-cell thumb within a 22-cell track. Every thumb cell reported:

```text
characters = " "
isBackgroundRgb = true
background = 0x9a9ea3
```

There was no glyph proxy. After eight real SGR wheel-down inputs, the same contiguous background run
moved from start row 3 to start row 6.

## Runtime and determinism

Times are wall-clock on this machine. Harness values are the mean of the final five consecutive
runs; tmux values are the final original-smoke run.

| Smoke | Harness mean | Harness outcomes | tmux original | Speedup |
|---|---:|---:|---:|---:|
| wrap | 0.473 s | 5/5 ALL-PASS | 7.355 s ALL-PASS | 15.5× |
| selection | 0.885 s | 5/5 ALL-PASS | 15.227 s ALL-PASS | 17.2× |
| scrollbars | 2.646 s | 5/5 ALL-PASS | 9.717 s ALL-PASS | 3.7× |

Outcome variance was zero across all 15 final harness runs. The harness run-time ranges were
0.453–0.502 s, 0.835–0.915 s, and 2.622–2.667 s respectively.

## Files changed

- Harness core and tests:
  `HarnessInput.ts`, `HarnessSnapshot.ts`, `PtyTestDriver.ts`,
  `SynchronizedOutputQuiescence.ts`, and their two test files.
- Harness contracts and ports:
  `scripts/harness/harness.invariants.md`, the three `smoke-*-harness.ts` files.
- Shared terminal seam:
  `OpenPty.ts`, `OpenPtyBackend.ts`, `terminal.invariants.md`.
- Emulator snapshot surface:
  `TerminalEmulator.ts`, `TerminalPaneRenderer.ts`.
- Additive gate wiring:
  `scripts/merge-gate.sh`.

## Verification transcript

```text
git fetch origin main && git rebase origin/main
  Current branch feat-pty-test-harness is up to date.

bunx tsc --noEmit
  PASS

bun test
  806 pass, 0 fail, 12770 expect() calls, 104 files

bash scripts/conventions-gate.sh
  conventions-gate: PASS

node .claude/skills/invariants/scripts/check_invariants.mjs --all --refs
  418 annotations resolved, 38 lattice links resolved, 0 problems

bash scripts/smoke-terminal.sh
  RESULT: ALL-PASS

bun scripts/harness/smoke-wrap-harness.ts
bun scripts/harness/smoke-selection-harness.ts
bun scripts/harness/smoke-scrollbars-harness.ts
  five consecutive runs each: 15/15 ALL-PASS

bash scripts/smoke-wrap.sh
bash scripts/smoke-selection.sh
bash scripts/smoke-scrollbars.sh
  all three originals: ALL-PASS
```

`scripts/merge-gate.sh` itself was not run, as required by the task.

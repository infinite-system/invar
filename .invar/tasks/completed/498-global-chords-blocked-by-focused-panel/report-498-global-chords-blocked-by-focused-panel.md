# READY report — global chords survive a focused panel

## In plain words

A focused terminal or agent swallowed the Extensions chord before the app could use it. I marked the chosen frame chords as application-global data. Extensions now opens from both panes, while raw terminal chords still reach the child.

## Result

Commit: `7ddc685e` (`Keep frame chords live inside focused panels`)

The change marks these bindings as `applicationGlobal`:

- `Ctrl+Shift+E` opens Files.
- `Ctrl+Shift+G` opens Source Control.
- `Ctrl+Shift+X` opens Extensions.
- `Ctrl+Shift+PageUp` selects the previous workspace.
- `Ctrl+Shift+PageDown` selects the next workspace.

The router did not change. The bindings use the existing `applicationGlobal` seam.

The contract text now names the application-global exception in [the UI invariants](../../../../src/modules/ui/ui.invariants.md). [The keybindings invariants](../../../../src/modules/keybindings/keybindings.invariants.md) now name the selected chord families.

## Decisions for the user

- Files, Source Control, and Extensions are frame view openers. They now win over focused pane content.
- The primary PageUp and PageDown workspace chords change the outer app frame. They now win over focused pane content.
- `Ctrl+P` stays with the pane. The terminal byte sweep proves that it reaches the child as byte `10` hexadecimal.
- `Ctrl+Shift+P` also stays with the pane. Its legacy form collapses to the same `Ctrl+P` byte.
- `F1` stays with the pane. It has no modifier, so the application-global contract rejects it.
- `Ctrl+,`, `Ctrl+Shift+H`, and `Ctrl+Shift+B` stay with the pane. Their terminal forms can carry child input.
- `Ctrl+Shift+[` and `Ctrl+Shift+]` stay with the pane. The primary workspace PageUp and PageDown chords carry the outer navigation claim.
- Panel toggles keep their existing reserved status. This task did not widen the reserved set.

## Driven evidence

Before the change, I focused a real terminal and sent `Ctrl+Shift+X`. `primaryDockHost.activeId` stayed `files`. The same drive failed with a focused agent pane.

After the change, the same terminal drive changed `primaryDockHost.activeId` to `extensions`. The same chord also opened Extensions from a focused agent pane.

I also drove Files and Source Control from the focused agent pane. Both selected their primary dock content. The final contract arm lives in [the reserved-chord PTY smoke](../../../../scripts/harness/smoke-reserved-chord-harness.ts).

The 10-row and 100,000-row fixtures both opened Extensions from a focused terminal. The input route showed no scale-dependent difference.

## Positive control

I removed the Extensions `applicationGlobal` flag after writing the smoke arm. The smoke stopped at the focused-terminal Extensions check and exited nonzero. I restored the flag, and the same smoke reported `ALL-PASS`.

## Verification

- `bunx tsc --noEmit` passed.
- The focused unit pass reported 99 tests passed and 0 failed.
- The final keybinding test pass reported 21 tests passed and 0 failed.
- `bun scripts/harness/smoke-reserved-chord-harness.ts` reported `ALL-PASS`.
- `bash scripts/smoke-keyboard-invariant.sh` reported `PASS`.
- The terminal sweep passed every through, collapsed, and unencodable case.
- `bash scripts/conventions-gate.sh` reported `PASS`.
- `node .claude/skills/invariants/scripts/check_invariants.mjs --all --refs` reported 0 problems and 1,379 resolved annotations.
- `git show --check 7ddc685e` reported no whitespace errors.

## Invariants in scope

- Focus owns the keystroke: upheld. Only selected modified frame chords use `applicationGlobal`. The terminal byte sweep stayed green.
- Bindings are intent addressed: upheld. The change edits binding data and adds no router special case.
- A focused panel routes keystrokes to its active pane content: refined and upheld. Reserved and application-global chords run first. All other input still reaches the pane.
- Record misses: none.

## Bycatch

- Suspect, not fixed: `Ctrl+Shift+O` did not open the folder picker while Files held focus. I saw this once in `/tmp/invar-498-workspaces-WsCTqU/first`. I stopped the drive and removed that owned temporary fixture.

## Instrument feedback

EASY. DriveSession exposed pane focus and dock selection through graph paths. Its text click restored real pane focus without fixed coordinates.

## Scope

This report completes [the filed brief](brief-498-1-global-chords-blocked-by-focused-panel.md). I did not run `scripts/merge-gate.sh`, push, merge, or alter [the existing untracked builder fundamentals file](../../../worktrees/498-global-chords-blocked-by-focused-panel/BUILDER-FUNDAMENTALS.md).

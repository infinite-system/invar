# READY — quit confirmation dialog (#323)

## Result

Invar now asks for explicit confirmation before it quits. Ctrl+Q, Cmd+Q, F10, and the Quit command
use one action and one modal model. The dialog uses the shared overlay geometry, dismissal, theme,
and close-glyph seams.

The implementation is in [Bootstrap.ts](../../../../src/modules/app/Bootstrap.ts),
[QuitConfirmation.ts](../../../../src/modules/ui/QuitConfirmation.ts), and
[OverlayLayer.ts](../../../../src/modules/ui/OverlayLayer.ts).

## Decided behavior

- The dialog opens with No focused.
- Left, Right, and Tab move the visible focus. Enter activates the focused button.
- No, Escape, the close control, an outside press, and a second quit chord dismiss the dialog.
- Yes is the only product path from the dialog to shutdown.
- A negative answer keeps the active buffer, cursor, and dirty state.
- The old quit path had no dirty-file guard. It exited at once. This dialog is now the quit guard.
  An explicit Yes authorizes exit without saving. Opening the quit dialog cancels a pending
  close-tab question, but it does not close or clean that buffer.
- The shared PTY driver sets `INVAR_HARNESS_DIRECT_QUIT=1` for teardown-only Ctrl+Q calls. Drive and
  the quit contract override it to `0`, so they use the product dialog. The legacy keyboard
  invariant smoke declares the bypass on its direct tmux launch.

These decisions are recorded in [app.invariants.md](../../../../src/modules/app/app.invariants.md)
and [harness.invariants.md](../../../../scripts/harness/harness.invariants.md).

## Driven evidence

The baseline command `bun run drive --key Control+q` exited with code 0 before Drive could observe a
new frame. No dialog appeared.

After the change, the same command published:

```text
inputOverlay="quitConfirmation"
inputOverlayCount=1
quitConfirmationOpen=true
quitConfirmationFocusedChoice="no"
overlayDialogBounds.quitConfirmation={"left":44,"top":16,"width":32,"height":8}
```

The new [quit confirmation PTY contract](../../../../scripts/harness/smoke-quit-confirmation-harness.ts)
drove every keyboard and pointer path. It also edited the active file first and required
`dirty=true` after every negative answer.

Dark theme, Nerd glyph tier, 10-line file:

```text
╭─Invar────────────────────── 
│                              │
│Are you sure you want to quit?│
│                              │
│      [ Yes ]    [ No ]       │
│                              │
│Left/Right or Tab, then Enter │
╰──────────────────────────────╯
```

Light theme, plain glyph tier, 100,000-line file:

```text
╭─Invar────────────────────── x
│                              │
│Are you sure you want to quit?│
│                              │
│      [ Yes ]    [ No ]       │
│                              │
│Left/Right or Tab, then Enter │
╰──────────────────────────────╯
```

The contract proved these paths:

- Left, Right, and Tab changed both the selected model value and the painted theme selection tone.
- Keyboard No and mouse No dismissed the dialog.
- Escape, close, outside press, and a second Ctrl+Q dismissed it.
- The outside press was consumed. It did not move the dirty cursor.
- Keyboard Yes exited with code 0 at 10 lines.
- Mouse Yes exited with code 0 at 100,000 lines.
- Neither frame contained a terminal `[y/N]` prompt.

The Cmd+Q platform layer still maps to the common `app.quit` action. The focused keybinding tests
passed 41 tests and 224 expectations.

## Positive control

I changed the quit contract override from `INVAR_HARNESS_DIRECT_QUIT=0` to `1` and ran it. The
process took the teardown path, so the first dialog wait failed:

```text
error: Timed out waiting for scale 10: Ctrl+Q opens one modal confirmation
exit 1
```

I restored the override to `0`. The contract then ended with
`smoke-quit-confirmation-harness: ALL-PASS`.

## Verification

- Focused model, coordinator, status, close-control, and popup tests: 20 passed, 200 expectations.
- Focused platform, default-binding, and PTY-driver tests: 41 passed, 224 expectations.
- Shared overlay dialog smoke: `ALL-PASS`.
- Quit confirmation smoke: `ALL-PASS` at 10 and 100,000 lines.
- Invariant checker: 1,209 annotations resolved, 223 lattice links resolved, 0 problems.
- Enforcing pre-commit hook: `merge-gate: ALL-PASS`, `GATE_EXIT=0`.
- Worktree after commit: clean.

The final gate used its built-in retry for the git-watch smoke and the behavioral contracts. Both
passed on retry. The gate reported these as flakes. See Bycatch.

## Commit

`afcaef70665c40c342ac8f090b87fc821202a8f7`

`ui: add quit confirmation dialog (#323)`

The branch is `fleet/323-quit-confirmation-dialog-modern`. I did not push or merge it.

## Bycatch

- [ui.lattice.md](../../../../src/modules/ui/ui.lattice.md) says that
  [ui.invariants.md](../../../../src/modules/ui/ui.invariants.md) holds 61 records. The checker
  reported 63 chosen UI records. This is existing lattice comment drift. I did not edit the lattice.
- [smoke-tabs.sh](../../../../scripts/smoke-tabs.sh) still hard-codes the old `✕` close mark. The
  active `panelClose` token now supplies Nerd, Unicode, or plain glyphs. The legacy full-tmux tier
  did not run, so I did not change this unrelated smoke.
- One gate run overlapped the tasks watch animation tick work (#329). Its plugin-manifest contract
  could not reach the Markdown extension row. The failure did not recur without that root-gate
  overlap.
- In the final hook run, the git-watch smoke and behavioral contracts each had one timeout-class
  first attempt and passed the gate's quiet retry. The gate named both as flakes. I made no unrelated
  timing change.

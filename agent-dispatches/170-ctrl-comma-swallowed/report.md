# READY — #170 (`Ctrl+,` swallowed while an automatic task claimed focus)

Status: READY

Commit: `e239880a9ec3ce884a856509e38ccd223768d5d9`
(`fix(tasks): preserve focus for automatic presentation`)

## Result

Automatic folder-open tasks still start and remain visible, but no longer take
keyboard focus from the workspace surface. Manually invoked Tasks commands
continue to reveal and focus their terminals.

`Ctrl+,` was not missing from the key table and is not a reserved chord. It is
an intentionally surface-scoped global binding. The regression was that
automatic task presentation called `PanelHost.show()`, which focused the task
panel. After a file opened, status consequently published
`focus="editor"` together with `terminalFocused=true`.

An input trace captured the resulting route:

```text
workspaceFocus:editor
panelVisible:true
panelFocused:true
focusedPanelBranch
panelHandled:false
```

The focused-panel branch returned even when `handleKey` returned false, so the
event never reached ordinary keybinding resolution. The blast radius was every
non-reserved editor/global chord in that stale dual-focus state, not only
`Ctrl+,`. Reserved chords were resolved before that branch and remained host
escape hatches.

The fix extends the existing task-presentation seam with explicit
`transferFocus` intent:

- folder-open tasks and their issue reports present with `false`;
- manually invoked task commands present with `true`;
- Bootstrap shows automatic task output by setting panel visibility without
  claiming focus.

No chord-specific routing exception was added.

## Driven evidence

Dependencies were installed first with `bun install` (exit `0`).

Before the fix:

- Generated 10-line file at 80x24: editor focus, `terminalFocused=true`;
  `Ctrl+,` left `settingsOpen=false` (exit `0`).
- Generated 10-line file at 120x40: same result (exit `0`).
- Generated 100,000-line file at 80x24: same result (exit `0`).
- Normal repository file at 80x24: same result (exit `0`).
- With no file/editor focus, the chord opened Settings. This isolated editor
  focus as relevant; geometry and the generated-file path were incidental.
- Clicking the visible gear at 80x24 changed `settingsOpen=false` to `true`
  immediately (exit `0`), confirming the defect was upstream in input routing.

The same gesture and settings were compared across history:

- `bf57bcf` (before workspace tasks): `terminalFocused=false`; Settings opened.
- `e459267` (workspace tasks introduced): `terminalFocused=true`; Settings did
  not open.

The relevant `e459267` change introduced automatic
`panelHost.split(...); panelHost.show()`, identifying the regression.

After the fix:

- Generated 10-line file at 80x24: `terminalFocused=false`; `Ctrl+,` opened
  Settings (exit `0`).
- Generated 100,000-line file at 80x24: identical result (exit `0`).
- Normal repository file at 120x40: identical result (exit `0`).

This establishes small/large scale parity.

The new real-PTY smoke
`scripts/harness/smoke-reserved-chord-harness.ts` passed (exit `0`). It:

1. starts a real folder-open shell task and opens `small.txt`;
2. proves the task remains visible without claiming the editor keyboard;
3. drives `Ctrl+,` and observes Settings open;
4. deliberately focuses the task terminal;
5. proves surface-scoped `Ctrl+,` stays with that task while reserved
   `Ctrl+Alt+B` reaches the host.

## Positive control

I replanted the original defect by replacing the automatic visibility-only
path with `panelHost.show()`.

The new smoke failed (exit `1`) at:

```text
FAIL automatic task presentation stays visible without claiming the editor keyboard
```

After restoring the fix, the same smoke passed with `ALL-PASS` (exit `0`).

## Reserved-chord enumeration

The canonical table contains seven reserved single-chord bindings:

| Chord | Action | Check |
| --- | --- | --- |
| `F10` | `app.quit` | Reserved-warrant audit |
| `Ctrl+Q` | `app.quit` | Driven from a focused terminal |
| `Ctrl+Alt+B` | `view.toggleRightDock` | Driven from the focused task by the new smoke |
| `Ctrl+\`` | `panel.toggleTerminal` | Enumerated alias; see Bycatch |
| `Ctrl+J` | `panel.toggleTerminal` | Driven from a focused terminal |
| `Ctrl+Shift+A` | `panel.toggleAgent` | Reserved-warrant and binding-arrival audits |
| `Ctrl+Shift+S` | `panel.toggleSplit` | Driven split and unsplit |

`bash scripts/smoke-keyboard-invariant.sh` passed (exit `0`), including the
reserved-warrant audit, replacement-chord arrival checks, focused-terminal
`Ctrl+J` and `Ctrl+Q`, and the non-reserved byte-through sweep.

`Ctrl+,` maps to `settings.toggle` without `reserved: true`; the strengthened
contract therefore records and drives it as surface-scoped.

## Contract verdict

Two existing contracts were implicated and strengthened:

- `Focus owns the keystroke` remains correct: a genuinely focused terminal
  owns non-reserved keys, while reserved host chords resolve first. Its evidence
  now includes the new PTY boundary smoke.
- `Folder open starts declared tasks` had the reachable-state hole. It now
  requires automatic task terminals to be presented without taking focus from
  the surface opened by the workspace, while manual task presentation may
  transfer focus.

The mechanical checker resolved 923 annotations and 67 lattice links with
0 problems.

## Final verification

- `bunx tsc --noEmit` — exit `0`
- `bun test` — exit `0`; 1,695 pass, 0 fail across 258 files
- `bash scripts/conventions-gate.sh` — exit `0`
- `node .claude/skills/invariants/scripts/check_invariants.mjs --all --refs`
  — exit `0`; 923 annotations, 67 lattice links, 0 problems
- `bun scripts/check-coverage-ratchet.ts` — exit `0`; no undeclared decrease
- `bun scripts/harness/smoke-reserved-chord-harness.ts` — exit `0`;
  `ALL-PASS`

The worktree is clean. Per the task, `scripts/merge-gate.sh` was not run, and
nothing was pushed, merged, or tagged. No branch or repository content was
deleted; the two temporary detached history-comparison worktrees were removed
after the comparison.

## Bycatch

- Known terminal-capability limitation, not fixed: from the focused task pane,
  one `Ctrl+\`` probe produced no visible panel change. The canonical binding
  already documents that some legacy terminal paths encode this alias as NUL.
  The universally encodable primary `Ctrl+J` passed from focused-terminal
  state. Reproduced once; no bycatch commit.

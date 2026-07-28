# READY — copyable Settings panel

Branch: `feat-copyable-panels`

Commit: `2c16f73c2a4a485bfd25e7fa2ff8fed976392a57`
(`Make Settings content selectable and copyable`)

Worktree: clean

Conventions: `project.conventions.md` at
`cde304b365b635b62843ed6373b190132514bac1`

## Result

Settings is now mouse-selectable and keyboard-copyable without taking focus
from the panel or changing its existing keyboard navigation.

- Settings consumes the existing `TextSelectionModel` and
  `ScrollableTextViewport` drag-selection generator.
- Selected cells use the existing `palette.selection` theme color.
- Text reconstruction is grapheme- and display-cell-aware through the existing
  `WrapText` seam.
- `Ctrl+C` is registered as `settings.copy` in the keybinding registry. The
  registry's existing primary-modifier aliasing supplies the macOS equivalent.
- Settings copy calls the sole `Clipboard.Class.copy` OSC-52 authority.
- Copy-result status publication is shared by editor, agent, terminal, and
  Settings instead of being repeated at each action.
- Closing or reopening Settings clears its selection.

No additional panel fell out for free. The remaining surfaces do not expose the
same rendered-line projection as Settings, so each needs a small,
surface-specific text reconstruction adapter. The selection model, viewport
drag behavior, theme, binding registry, and clipboard authority remain the
shared generator for that follow-up work.

## Driven evidence

Before editing, I drove the real PTY path at both scales:

- Small fixture workspace (3 files): opened Settings, dragged over `Vertical`,
  pressed `Ctrl+C`; clipboard emissions remained `0 -> 0`.
- Repository workspace (515 files): repeated the same gesture; clipboard
  emissions again remained `0 -> 0`.

After editing, I drove the same path at both scales:

- Small fixture workspace: dragging the known label emitted exactly
  `Scrolling`; every selected cell used background `0x2b2f41`. Settings stayed
  open, retained its underlying host focus, and Down moved the active setting
  from `Vertical fling ceiling (rows/s)` to
  `Scroll accel gain (per notch)`.
- Repository workspace (515 files): emitted exactly `Scrolling`, painted the
  same uniform selection background, retained Settings and focus, and preserved
  the same keyboard-navigation transition.

The committed PTY smoke opens Settings, discovers the text from painted cells,
drag-selects `Scrolling`, copies through the real input path, and checks:

- decoded OSC-52 payload is exactly `Scrolling`;
- payload uses canonical base64;
- OSC-52 is at parser depth zero and not nested in another control sequence;
- target cells show a uniform selection background distinct from the following
  cell;
- the modal remains open, host focus is unchanged, and Down advances the
  selected setting.

It then continues through the pre-existing agent and terminal clipboard cases.

## Positive control

I temporarily replaced only the `settings.copy` action wiring with a no-op and
ran the same PTY clipboard smoke. It failed as intended:

```text
Timed out waiting for OSC 52 payload Scrolling
POSITIVE_CONTROL_EXIT=1
```

I restored the one-line wiring before the final verification. No
positive-control mutation remains.

## Verification

- Initial invariant/reference checker:
  `node .claude/skills/invariants/scripts/check_invariants.mjs --all --refs`
  — exit `0`, zero problems.
- Keybinding test:
  `bun test src/modules/keybindings/KeybindingDefaults.test.ts`
  — exit `0`, 17 passed, 0 failed.
- Clipboard frame-boundary PTY smoke:
  `bun scripts/harness/smoke-clipboard-frame-boundary-harness.ts`
  — exit `0`.
- Final full checker:
  `bash scripts/merge-gate.sh`
  — top-level exit `0`, `merge-gate: ALL-PASS`.
- `git diff --check` — exit `0`.
- `git show --check --oneline HEAD` — exit `0`.

The full checker passed conventions/TypeScript, invariant contracts and
references, coverage ratchet, reactive-observation audit, unit tests, all 56
parallel-safe smoke jobs after the gate's retries, all five quiet serial jobs,
and the enforced input-byte-flush check. Input-byte-flush measured median
p50 `5.182 ms`, p95 `7.611 ms`, and passed.

The gate's explicitly soft performance-baseline tier returned its internal
exit `2` for two measurement gaps and one target miss, including an orphan PID
reported as `1084205`. The top-level gate remained exit `0` by design. An
immediate `ps` check found that PID had already exited. No performance result
was used to support the copyability claim.

The normal gate reported 42 legacy tmux audit smokes as not run because
`INVAR_FULL_TMUX` was not enabled; this is the gate's documented default.

## Invariant review

Reviewed the changed behavior against the project seam invariant, UI
scrollable-selection contract, keybinding intent/focus contracts, system
clipboard frame-boundary contract, terminal host-copy contract, and real-PTY
harness oracle. The change upholds or strengthens each contract; no downgrade
was needed.

The refined contracts now record Settings as a consumer of:

- scrollable drag selection;
- the single OSC-52 clipboard emission boundary;
- host-terminal copy behavior.

Invariant checker result: zero problems. No delegated invariant sub-review was
used because this task's active agent instructions prohibited spawning
sub-agents.

## Surface census and follow-up

Already copy-enabled after this commit:

- Settings;
- editor;
- diff view;
- Markdown preview;
- Git comparison;
- hover card;
- agent transcript/composer;
- terminal.

Remaining `PaneContent` implementations:

- `FileTreePaneContent`;
- `GitPaneContent`;
- `ExtensionsPaneContent`.

If “panel” also includes modal/list surfaces, the remaining follow-up includes:

- Shortcut Help;
- Command Palette;
- Quick Open;
- Find/Replace;
- context menu;
- confirmation dialog.

Each should reuse `TextSelectionModel`, `ScrollableTextViewport` where its
interaction shape fits, the existing selection theme, registry-based copy
intent, and `Clipboard.Class.copy`. Each still needs its own honest text
projection and a focus-preservation drive.

## Bycatch

- The move-line smoke timed out on its first parallel-pool attempt and passed
  the gate's quiet retry. It did not reproduce on retry.
- The audio-narration smoke timed out on its first parallel-pool attempt and
  passed the gate's quiet retry. It did not reproduce on retry.
- The soft performance-baseline tier reported two measurement gaps, one target
  miss, and orphan PID `1084205`; the PID was already gone on immediate
  inspection. The enforced byte-flush measurement passed.

No bycatch was fixed.

COMPACTION: occurred during READY/report assembly; work continued from the
preserved task state.

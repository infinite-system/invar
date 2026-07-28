# READY — click-outside mode-coherence repair

Status: READY

Commit: `ed6a407 test(ui): preserve modal dismissal in mode coherence`

## Diagnosis

The failure was not a second published overlay. The real status transition after clicking the
buffer-count badge behind the open command palette was:

`["commandPalette"]` → `[]`

The new modal backdrop correctly dismissed the command palette and consumed the outside press, so
the underlying badge never received that first press and `boundedListPopup` never opened. Both
mode-coherence drivers still assumed the old click-through behavior.

## Repair

- Updated the PTY mode-coherence harness to assert that the first outside press leaves
  `inputOverlay === null`, `inputOverlayCount === 0`, `paletteOpen === false`, and
  `boundedListPopupOpen === false`.
- The harness then sends a second real click to the uncovered badge and asserts
  `inputOverlay === "boundedListPopup"` with `inputOverlayCount === 1`.
- Updated the tmux/FrameProbe mode-coherence driver with the same two-press contract.
- Kept the modal outside-dismissal implementation unchanged: dismissal remains consumed and cannot
  activate the pane or control beneath it.

## Verification

- `bun scripts/harness/smoke-mode-coherence-harness.ts`: 5/5 consecutive quiet repetitions passed,
  exit 0 each.
- Final standalone mode-coherence harness run: exit 0.
- `bash scripts/smoke-mode-coherence.sh`: `mode-coherence: ALL-PASS`, exit 0.
- `bun scripts/harness/smoke-overlay-dialog-harness.ts`:
  `smoke-overlay-dialog-harness: ALL-PASS`, exit 0.
- `bash scripts/behavioral-contracts.sh`: `behavioral-contracts: ALL-PASS`, exit 0.
- `bun scripts/harness/smoke-editor-harness.ts`: `smoke-editor-harness: ALL-PASS`, exit 0.
- `bash scripts/conventions-gate.sh`: exit 0.
- `node .claude/skills/invariants/scripts/check_invariants.mjs --all --refs`: exit 0.
- `bun test`: exit 0.
- `git diff --check`: exit 0.
- Pre-commit `bash scripts/merge-gate.sh` hard gate:
  `merge-gate: ALL-PASS`, exit 0. The default PTY suite included mode-coherence and
  overlay-dialog; both passed. The hook skipped only the gate's explicitly soft perf-baseline phase
  and the opt-in tmux audit ring.

## Repository state

- `git status --porcelain=v1`: empty.
- `git ls-files '*TASK*.md'`: empty.
- `TASK2.md` was not committed.

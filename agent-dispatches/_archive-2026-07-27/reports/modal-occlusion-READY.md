# Modal occlusion — READY

Branch: `fix-modal-occlusion`

Commit: `078e28b55882e50acf99e0507583ea8d2d07df2c`

Base supplied by the task: `3efee3dd46f4fe9813250bb90c2888f3e6ab04a7`.
`origin/main` advanced during the work, so the branch currently reports ahead 1 / behind 3.
No rebase, merge, push, tag, or branch deletion was performed.

## Culprit

`RootView.update()` owned both host-terminal projection paths but reconciled them independently
of modal focus:

- Retained terminal/editor focus could call `renderer.setCursorPosition(..., true)` after
  Settings or Keyboard Shortcuts had painted.
- An active pixel preview continued to retain its `PixelImageMount` placement because neither
  its image nor placement geometry had changed.

The two symptoms therefore had one generator: host-terminal projections outside the cell grid
did not participate in the overlay layer's modal-focus state.

## Mechanism

`OverlayLayer.modalOverlayOwnsScreen` is now the single late-read derivation over the existing
modal model refs. It includes the input overlays, destructive confirmations, and the shared
bounded-list popup; it excludes the display-only tooltip and non-modal completion popup.

Each `RootView` frame reads that derivation once:

- A pixel tier clears `PixelImageMount` instead of synchronizing while modal focus owns the
  screen. `clear()` invalidates pending emission and resets the placement key. The first frame
  after close therefore restores the image without scroll/file-switch input and uses current
  post-resize geometry.
- Hardware-cursor projection exits through `setCursorPosition(0, 0, false)` before retained
  right-dock, bottom-panel, or editor focus can show a cursor. Overlay text carets remain painted
  cell glyphs.
- `Bootstrap.keyTick` reads the same `RootView` port rather than maintaining a second modal
  predicate.

The invariant `Modal focus withdraws host terminal projections` records the cross-projection
rule. The existing image-placement and terminal-routing records were refined to name the shared
mechanism.

## Files

- `src/modules/ui/OverlayLayer.ts`
- `src/modules/ui/RootView.ts`
- `src/modules/app/Bootstrap.ts`
- `src/modules/ui/ui.invariants.md`
- `src/modules/image/image.invariants.md`
- `src/modules/terminal/terminal.invariants.md`
- `scripts/harness/smoke-overlay-dialog-harness.ts`
- `scripts/harness/smoke-pixel-preview-harness.ts`

## Driven reproduction and evidence

Before the implementation:

- Cursor smoke exit 1: the raw-byte liveness control first observed the focused terminal cursor
  shown with no overlay, then the last `CSI ? 25 h/l` visibility command still left it shown
  after Settings painted.
- Pixel-preview smoke exit 1: a real PNG emitted a Kitty placement with no overlay, then timed
  out after 10 seconds waiting for a Kitty placement deletion when Settings opened.

After the implementation:

- `bun scripts/harness/smoke-overlay-dialog-harness.ts` — exit 0,
  `ALL-PASS`, 36 PASS probes. It drives a real terminal pane and proves from PTY bytes that the
  no-overlay cursor is shown, Settings and Keyboard Shortcuts leave it hidden, and Escape or
  backdrop dismissal restores it.
- `bun scripts/harness/smoke-pixel-preview-harness.ts` — exit 0,
  `ALL-PASS`, 23 PASS probes. It opens the real `/tmp/ivue-cart-dark.png`, proves an initial
  Kitty placement, observes explicit delete with Settings open, observes no replacement while
  open or after a live resize, and observes immediate replacement after Escape, the Settings
  close control, and the Keyboard Shortcuts backdrop. Existing Kitty buffer-switch/quit,
  Sixel, and half-block controls also pass.

The PTY harness does not render a host emulator's Kitty compositor itself; the authoritative
observation is the raw protocol stream requested by the task: placement, explicit delete, no
placement while modal, and replacement after close.

## Required verification

- `bunx tsc --noEmit` — exit 0.
- `bun test` — exit 0; 1,328 passed, 0 failed, 15,718 `expect()` calls across 202 files.
- `bun scripts/check-file-grammar.ts` — exit 0; 383 TypeScript files, 0 legacy violations,
  23 converted modules enforced, 6 structural interface test-pair exemptions.
- `node .claude/skills/invariants/scripts/check_invariants.mjs --all --refs` — exit 0;
  674 annotations resolved, 41 lattice links resolved, 0 problems.
- `bash scripts/conventions-gate.sh` — exit 0; PASS. Its report-only text-input census found
  the existing single `BoundedListPopup` entry.
- `bun scripts/harness/smoke-overlay-dialog-harness.ts` — exit 0; 36 PASS probes.
- `bun scripts/harness/smoke-pixel-preview-harness.ts` — exit 0; 23 PASS probes.
- `git diff --check` / committed-tree check — exit 0.

## Final state

The task packet was not tracked or committed and was removed to satisfy the clean-worktree
requirement. `git ls-files | grep '^TASK'` returns no matches. The worktree is clean.

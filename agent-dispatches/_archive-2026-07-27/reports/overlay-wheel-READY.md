# Overlay wheel scrolling — READY

Branch: `fix-overlay-wheel-scroll`

Commit: `b04b47e` (`fix: start wheel momentum frames at the viewport`)

Base: current `origin/main` (`0 behind, 1 ahead`)

## Generator change

`ScrollableTextViewport.handleWheel` now records whether it actually added a
vertical or horizontal momentum impulse and requests the first render frame
through its injected renderer only in that case. The load-bearing request is
annotated against the new `Wheel impulses start their own frame sequence`
invariant.

`reconcileExtent` now clamps offsets that became invalid without halting a
fresh momentum impulse merely because its valid starting offset is at the top.
This lets the requested first frame reach `tick`; `onScroll` remains reserved
for an offset that actually changed.

## Consumer audit and de-duplication

- All twelve `OverlayLayer` wheel handlers remain thin delegates to the shared
  viewport.
- Removed the now-redundant immediate `renderer.requestRender()` after the
  agent transcript's `handleWheel`.
- Audited `HoverCard`, `BoundedListPopup`, and the `CompletionPopup` adapter:
  none had a duplicate immediate render request to remove.
- Audited the panel and right-dock bodies and Markdown split preview. They use
  separate direct-step or independent momentum generators, so their render
  requests remain outside this invariant.
- Structural census: 20 `handleWheel` identifier occurrences, with no
  `handleWheel(...); requestRender()` sequence remaining.

## Driven evidence

`smoke-overlay-dialog-harness.ts` uses one real wheel event per viewport,
settles by frame silence, and compares observed cells on the original content
row. Before every wheel it proves a painted scrollbar, semantic overflow
(`contentRows > viewportRows`), `scrollTop === 0`, nonblank observed content,
and no idle frames.

- Settings: overflow/top/scrollbar controls passed; the settled comparison row
  changed after one wheel event.
- Keyboard Shortcuts: same controls passed; the settled comparison row
  changed.
- Command Palette: same controls passed; the settled comparison row changed.
- Quick Open: a 30-file fixture supplies real overflow; the same controls
  passed and the settled comparison row changed.
- Context Menu: a separate real PTY drive opens Source Control, right-clicks
  the changed `other.txt` row, constrains the terminal to 54×5, proves
  overflow/top/scrollbar/idle, and observes the comparison row change.
- Idle quiescence contract: untouched app emitted no live-loop frames
  (`frame 2 -> 2` over 3 seconds).

Nothing in the requested scope remained unproved.

## Verification

- `bunx tsc --noEmit`: exit 0.
- `bun test`: exit 0; 1,338 passed, 0 failed, 15,743 expectations across 205
  files.
- `bun scripts/check-file-grammar.ts`: exit 0; 387 TypeScript files, 0 legacy
  violations, 23 enforced converted modules, 6 interface test-pair
  exemptions.
- Invariant checker `--all`: exit 0; UI contract has 39 chosen invariants.
- Invariant checker `--refs`: exit 0; 685 annotations and 42 lattice links
  resolved, 0 problems.
- `bash scripts/conventions-gate.sh`: exit 0; text-input census 0.
- `bash scripts/behavioral-contracts.sh`: exit 0; all contracts passed,
  including `idle-quiescence`.
- `bun scripts/harness/smoke-overlay-dialog-harness.ts`: exit 0;
  `ALL-PASS`.
- Touched-file Prettier check: exit 0.
- `bash -n scripts/merge-gate.sh`: exit 0.
- `git diff --check`: exit 0.

The merge gate was not run, as instructed. No push, merge, tag, branch deletion,
or worktree operation was performed. The worktree is clean, and
`git ls-files | grep '^TASK'` returned no output (exit 1).

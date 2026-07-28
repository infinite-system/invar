# BoundedListPopup — READY

## Component contract

`BoundedListPopup` is the single anchored list-popup seam for Invar:

- One `BoundedListPopupGeometry` controls box placement, the optional search row, the visible item
  window, scrollbar region, rendering, and row hit-testing.
- Placement opens downward when it fits, opens upward when the anchor is low and space above is
  greater, clamps horizontally, and reserves the terminal bottom row.
- The list is vertical-only and bounded independently of item count.
- Search appears when `items.length > searchThreshold` (default 10), renders
  `theme.findIcons.search`, and filters live.
- Keyboard input supports Up, Down, Enter, Escape, Backspace, and printable query input.
- Pointer input supports row activation, hover, selection drag, wheel momentum, scrollbar input, and
  click-outside dismissal.
- The popup participates in `OverlayCoordinator`'s one exclusive input-overlay slot and exposes
  deterministic status geometry for driven verification.

The invariant `Bounded list popups share paint and hit geometry` is recorded in
`src/modules/ui/ui.invariants.md`.

## Reuse notes

| Behavior | Reused generator |
|---|---|
| Fuzzy filtering/ranking | `CommandScoring.Class.fuzzyScore`, the Quick Open scoring seam |
| Vertical wheel momentum and clamping | `ScrollableTextViewport` |
| Scrollbar geometry, input, and solid thumb paint | `ScrollableTextViewport` → `SolidThumbScrollBar` |
| Exclusive modal ownership | `OverlayCoordinator` |
| Search glyph capability fallback | `Theme.findIcons.search` / `FindIconSet` |

No second fuzzy matcher, scroll-physics implementation, scrollbar renderer, or consumer-owned popup
geometry was added.

## Consumer conversions

| Consumer | Before | After | Selection action |
|---|---|---|---|
| Buffer-count badge | `ContextMenu` adapter | `BoundedListPopup` with buffer path search and active/modified text | Existing `activateTab` path |
| Git-log branch header | `ContextMenu` adapter with inline marker glyphs | `BoundedListPopup` with branch search and checked-out/viewed text | Existing read-only `selectLogBranch` path |

The Git changes right-click menu remains on `ContextMenu`; only the two requested list consumers were
converted.

## Verification runs

### Static and unit

| Run | Result |
|---|---|
| `bun run typecheck` | PASS |
| `bun test` | PASS — 1,056 tests, 14,582 expectations, 126 files |
| `bun test src/modules/ui/BoundedListPopup.test.ts` | PASS — 5 tests |
| `node .claude/skills/invariants/scripts/check_invariants.mjs --all` | PASS |
| `node .claude/skills/invariants/scripts/check_invariants.mjs --all --refs` | PASS — 557 annotations resolved, 0 problems |
| `git diff --check` | PASS |

### Driven PTY harnesses

| Run | Result | Coverage |
|---|---|---|
| `bun scripts/harness/smoke-bounded-list-popup-harness.ts` | ALL-PASS | 100 buffers; bottom-row bound; themed search glyph; live fuzzy filter; frame-paced wheel to tail; keyboard and mouse selection at both consumers; upward branch placement; outside-click dismissal; read-only Git branch guarantee |
| `bun scripts/harness/smoke-tabs-harness.ts` | ALL-PASS | Existing tab strip, badge, popup opening, and pan arrows |
| `bun scripts/harness/smoke-git-log-harness.ts` | ALL-PASS | Existing log freshness, branch viewer, mouse selection, and read-only guarantee |
| `bun scripts/harness/smoke-hover-harness.ts` | ALL-PASS | Existing tooltip/hover dwell, selection, copy, and dismissal |
| `bun scripts/harness/smoke-mode-coherence-harness.ts` | ALL-PASS | Exclusive overlay handoff between the bounded popup and existing overlays |

The new harness is registered additively in `scripts/merge-gate.sh`. No merge-gate run was launched
from this worktree.

## Rebase and tip

- Rebased onto `origin/main` at `53ab6a158f12dd82cd967eebf06c68794189c55f` before final
  verification.
- Replaced pre-rebase twins were preserved with annotated `orphaned/` tags.
- Branch: `feat-bounded-list-popup`
- Tip: `baddbbc8fe9a765d8e013a11d04f6d815c6f6dfe`

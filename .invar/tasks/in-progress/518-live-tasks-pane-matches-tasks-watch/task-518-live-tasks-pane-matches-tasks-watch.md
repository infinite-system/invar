# Task 518 — the live tasks pane matches tasks:watch and joins the doctrine

Priority: user-directed
Engine: codex
Environment: any
Model: 5.6-sol
Effort: high
State: IN-PROGRESS

## In plain words (user, 2026-08-06, verbatim intents)

"I keep turning on tasks:watch because the live tasks is inadequate
in the tasks module." Upgrade the in-app live tasks pane to LOOK
IDENTICAL to `bun run tasks:watch` (TasksWatchRenderer is the
reference rendering — same layout, same information density, ideally
the same renderer through a seam, not a copy).

1. Buttons appear ON HOVER; otherwise each item shows its text (no
   permanently-visible button chrome).
2. BUG: one key-width space at the end of the task-name line is not
   colored — the row background must cover the full line.
3. Hover unit: hovering covers the WHOLE task group — the name line
   AND the related row below it are ONE hover target, one highlight,
   one hit region (ui-design chapter 1: one stored geometry).
4. The pane MUST implement scrolling (chapter 5: shared momentum,
   one position generator, thumb) and text selection + copy
   (chapter 6: universal copy — selection through the shared seams,
   OSC 52 out).

## Design constraint

tasks:watch and the pane should share ONE rendering generator
(seam-at-shared-generator): if TasksWatchRenderer can render into
the pane's surface, do that; a fork of its layout is
coherence-negative. Say which you did and why in the report.

## Verification

Adversarial per doctrine: hover every row + the row below; scroll
under momentum at both fixture scales; select + copy row text
(clipboardEmissions); the uncolored-space fix asserted by cell
color; compare pane vs tasks:watch side-by-side (drive both, diff
the layouts) — identical is the bar.

## Item 5 (user, same session): the LIVE/ACTIVE/DONE segment control

The pane's filter buttons currently render with gaps:
`| LIVE |  | ACTIVE |  | DONE |`. Make them one contiguous segmented
control: `| LIVE | ACTIVE | DONE |` — shared borders, no dead cells
between segments, one hover/active grammar across the group
(ui-design chapter 1; the whole group is one geometry generator).

## Item 1 refined (user, same session): hover buttons OVERLAY the text

No cells are ever reserved-empty for buttons. At rest, the row shows
its full text edge to edge. ON HOVER, the button icons appear over
the right end of the row and the text truncates with an ellipsis to
make room: rest = full text, hover = truncated-text… + icons in the
freed cells. On unhover the full text returns. The truncation point
and the icon cells share one geometry generator; the transition must
not shift the row or its siblings.

## Item 6 (user, same session): 60fps motion parity

The pane renders its live motion at 60fps like tasks:watch now does —
same animation heartbeat, same smoothness (the watch-parity motion
records in the tasks contracts are the reference). Constraints: the
render load stays attributed at the contribution boundary and flat
per frame (no per-row timers — one heartbeat driving the visible
rows, the pane's motion stops when unobserved per the monitoring
discipline). Smoke assertions stay COUNT/ORDER-based (timeless gate
law) — fps itself is verified by driving and by the existing
watch-parity contract shapes, never by a wall-clock assertion.

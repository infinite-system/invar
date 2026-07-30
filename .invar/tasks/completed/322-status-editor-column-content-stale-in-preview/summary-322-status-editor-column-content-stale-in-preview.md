# Summary — #322 (status editor-column content stale in preview)

Landed 0f871cbc (56m dispatch-to-landing). Builder: codex sol low.

## What actually happened

- The reported symptom was real. `AppStatusProjection.ts` published a fixed
  `editorColumnContent="source-text-editor"` even in preview-only mode.
- The fix derives surface status from the painted content set. The editor
  column publishes the occupying surface claim. Terminal fields publish
  terminal state only when a terminal cell is painted. Media and agent panels
  stopped masquerading as terminals.
- The builder proved it by driving the real PTY at 100x30, at 10 and 100,000
  Markdown lines, and with two planted defects that each turned the focused
  test red.

## Rounds

Three rounds. Round 2 refined the projection scope. Round 3 was a merge
round: main had moved (e57752cd), the builder merged it in (813bc7f3) and the
combined tree gated GATE_EXIT=0. The verdict was read from the cwd-resolved
codex rollout (hook-chain precedent), extracted to `tmp/gate-verdict-322.log`.

## What the conductor got wrong

- The landing crossed a compaction and a full resurrection (anchor 13). The
  green sat unlanded for the resurrection gap. The anchor protocol carried it.
- Main moved two more non-app commits (740c5d81, 56b4b377) between the gate
  and the landing. Named and accepted, not re-gated. Both were doc, task
  record, and conductor-script only.

## Bycatch

Converted before landing: #334 (structure pane no-file-open transient) and
the #214 census entries (40th-43rd sightings), committed in 56b4b377.

## Left undone

- The family-sibling check named in the anchor queue: verify other status
  consumers read the projection seam, not snapshots. Filed nowhere yet —
  next conductor sweep should pose it or fold it into #326-adjacent work.

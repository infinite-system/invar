# READY — preview scroll sync and scrollbars #289

## Outcome

The Markdown source and preview now follow the pane that receives user input. A follower move keeps
the same leader, so it cannot start a feedback loop. Both directions consume one cached
source-line/rendered-row anchor map. Headings use exact anchors. Positions between anchors use
interpolation.

The Markdown plugin contributes `markdownPreviewScrollSync`. Its default is `true`. Turning it off
leaves both panes independent.

The [round-two addendum](brief-289-2-2.md) is complete. The preview now composes
`ScrollableTextViewport`. Vertical overflow paints a shared background-fill bar. Long physical
fenced-code rows stay intact and create horizontal overflow, which paints the shared lower-half
`▄` bar. Wheel, native thumb drag, and track click use the same viewport offsets. Bar input makes
the preview the scroll leader.

Commits:

- `05777485d2176b5d2690bacfa391c9a590eea491` — bidirectional scroll sync and contributed setting.
- `6bfbdc6fd17063ab9c1c236eb39659d5ba3fa858` — shared preview scrollbars and gated drag arm.

The current-main merge resolution remains staged. The worktree is not clean because the required
normal pre-commit gate blocked the merge commit. I did not bypass the gate.

## Round 3 merge and gate outcome

I read the [round-three brief](brief-289-3-3.md). After the conductor moved `main` again, I aborted
only the uncommitted older merge and merged current `main` at
`24dc254229b1f47c4b6289a7a1ffaf4f61966ce5`. This revision includes
[#286 (TOC click drives preview scroll into view)](../../completed/286-toc-click-drives-preview-scroll-into-view/task-286-toc-click-drives-preview-scroll-into-view.md),
[#287 (preview renders header block as block)](../../completed/287-preview-renders-header-block-as-block/task-287-preview-renders-header-block-as-block.md),
[#291 (task links survive state moves)](../../completed/291-task-links-survive-state-moves/task-291-task-links-survive-state-moves.md),
[#279 (drive settle supports files without structure)](../../completed/279-drive-settle-unsupported-file-structure/task-279-drive-settle-unsupported-file-structure.md),
and
[#292 (drive action status waits for paint)](../../active/292-drive-action-status-waits-for-paint/task-292-drive-action-status-waits-for-paint.md).

Four conflicts were resolved as a union:

- [smoke-markdown-harness.ts](../../../../scripts/harness/smoke-markdown-harness.ts): the conflict
  kept main's task-metadata, heading-style, dead-link paint, moved-state link, and TOC arms. It also
  kept this branch's 500-line and 100,000-line scroll-sync and sync-off arms. The combined watcher
  repair now waits until `Control+Home` publishes source row zero before it judges the synchronized
  preview paint.
- [MarkdownSplitView.ts](../../../../src/modules/markdown/MarkdownSplitView.ts): the resolved
  controller keeps this branch's scroll-leader state and main's dead-link verdict revision cache.
- [MarkdownSplitView.test.ts](../../../../src/modules/markdown/MarkdownSplitView.test.ts): the
  resolved test file keeps the user-input scroll-lead contract and main's link-verdict cache
  contract.
- [markdown.invariants.md](../../../../src/modules/markdown/markdown.invariants.md): the stylesheet
  record keeps main's keyword-colored, bold, non-underlined H1 and dead-link rules and this branch's
  horizontally reachable long physical code rows. Main's `Metadata fields preserve authored
  lines` record and this branch's expanded `A Markdown file offers a live source preview split`
  record both survive. A heading inventory found no chosen record from either merge stage missing
  in the result.

The UI invariant file merged without a conflict. Its scrollbar painter and shared scroll-surface
records retain the preview additions.

Post-resolution checks passed:

- Invariant checker: 1,129 annotations, 221 lattice links, 0 problems.
- Typecheck and 31 targeted Markdown tests passed.
- Markdown harness: ALL-PASS, including metadata fields, dark/light H1 and H2 styling, dead-link
  painting and repair, TOC jumps, bidirectional sync, and disabled-sync independence.
- Scrollbar harness: ALL-PASS, including both preview axes at 500 and 100,000 lines.

I then ran the merge commit through the normal pre-commit hook on the quiet host. The hook ran for
4m03s. Conventions, formatting, invariants, coverage, reactive-observation checks, unit tests, the
Markdown smoke, the scrollbar smoke, the behavioral contracts, and the serial tail passed.
Panel chrome timed out on its first attempt and passed its quiet retry. This is the known
intermittent
[#214 (panel chrome agent close intermittent)](../../active/214-panel-chrome-agent-close-intermittent/task-214-panel-chrome-agent-close-intermittent.md).
The activity-bar smoke reproduced its earlier timeout on the built-in quiet retry:

> error: Timed out waiting for the Structure dock-side setting is selected at its default at
> /tmp/tui-activitybar-harness-home-thzwUh/status.json

The gate ended with:

> RETRY TALLY: 1 step(s) RETRIED AND STILL FAILED — the retry did not rescue it
>
> merge-gate: FAILURES — commit/merge BLOCKED
>
> GATE_EXIT=1

Both activity-bar attempts are preserved in `/tmp/merge-gate-failures.380351`. The hook did not
create the merge commit. The conductor ordered a stop if either earlier red reproduced on the quiet
run, so I left the resolved current-main merge staged.

## Driven evidence

The sync baseline had no continuous follow. Two source Page Down inputs moved the source from `0`
to `4` to `18` while the preview stayed at `0`. Two preview Page Down inputs moved the preview
from `0` to `15` to `30` while the source stayed at `0`.

The final [Markdown PTY contract](../../../../scripts/harness/smoke-markdown-harness.ts) drove the
default setting at small and large scale:

- 500 lines:
  - Depth 1: source `98→106`; preview `102→111`.
  - Depth 2: source `223→231`; preview `230→239`.
  - Depth 3: source `323→331`; preview `333→342`.
  - Reverse preview wheel: preview `342→334`; source `331→324`.
- 100,000 lines:
  - Depth 1: source `19998→20007`; preview `20002→20012`.
  - Depth 2: source `44998→45007`; preview `45005→45015`.
  - Depth 3: source `64998→65007`; preview `65008→65018`.
  - Reverse preview wheel: preview `65018→65009`; source `65007→64999`.

The same contract toggled `markdownPreviewScrollSync` off through Settings. Source wheel input moved
only the source. Preview wheel input moved only the preview. It then toggled the setting on again.
The existing table-of-contents jump kept both targets in the reading position at 500 and 100,000
lines.

The final [scrollbar PTY contract](../../../../scripts/harness/smoke-scrollbars-harness.ts) opened a
Markdown fixture with vertical overflow and one 191-cell fenced-code row. It found both preview
bars and proved that the horizontal row contains only lower-half cells. Every pressed-pointer move
advanced both axes:

- 500 lines: horizontal `0→42→84→127`; vertical `0→49→98→148`.
- 100,000 lines: horizontal `0→42→84→127`; vertical
  `0→10342→20684→31028`.

The vertical drag changed focus from source to preview and moved the synchronized source. A later
preview track click moved the preview again and led another source follow. The contract also kept
the existing editor and structure bar fingerprints green at both scales.

The bordered preview host initially painted the bars but clipped their hit-grid cells. Removing its
redundant overflow scissor armed native drag and track clicks; `MarkdownRenderable` still clips the
content. Large-scale driving then exposed two repeated extent/projection costs.
`MarkdownPreview.totalRows` now caches by parsed revision and viewport width, and
`MarkdownSplitView` no longer refreshes the renderable a second time in the same frame.

## Positive controls

For scroll sync, I temporarily returned before source-to-preview follow. The real PTY contract went
red:

> Timed out waiting for 500-line source wheel moves both panes at Depth 1 500

For the scrollbar arm, I temporarily returned from the preview horizontal bar's native
`onChange`. The gated drag probe exited 1:

> FAIL 500-line markdownPreviewHorizontal drag advances after every pressed-pointer move
> (0→0→0→0)

I removed both planted defects. The final contracts passed.

## Invariant review

I extended
[A Markdown file offers a live source preview split](../../../../src/modules/markdown/markdown.invariants.md#a-markdown-file-offers-a-live-source-preview-split)
with input leadership, one shared position map, bidirectional follow, symmetric disabled behavior,
and the shared preview viewport.

I refined
[Explicit jumps use one reading position](../../../../src/modules/text/text.invariants.md#explicit-jumps-use-one-reading-position)
to state that explicit jumps and continuous follow consume the same anchor map.

The contributed setting follows
[Plugin settings live in contributed schema](../../../../src/modules/settings/settings.invariants.md#plugin-settings-live-in-contributed-schema).
The host settings schema does not name it.

I added the preview to
[A scrollable text surface is drag-selectable with edge auto-scroll](../../../../src/modules/ui/ui.invariants.md#a-scrollable-text-surface-is-drag-selectable-with-edge-auto-scroll),
[A scrollbar track is derived per frame from its region rect](../../../../src/modules/ui/ui.invariants.md#a-scrollbar-track-is-derived-per-frame-from-its-region-rect),
and
[One scrollbar painter gives each axis equal visual weight](../../../../src/modules/ui/ui.invariants.md#one-scrollbar-painter-gives-each-axis-equal-visual-weight).

The main implementation is in
[MarkdownSplitView.ts](../../../../src/modules/markdown/MarkdownSplitView.ts),
[MarkdownPreview.ts](../../../../src/modules/markdown/MarkdownPreview.ts),
[MarkdownRenderable.ts](../../../../src/modules/markdown/MarkdownRenderable.ts), and
[ScrollableTextViewport.ts](../../../../src/modules/ui/ScrollableTextViewport.ts). The shared
gated gesture is in
[ScrollbarThumbDrag.ts](../../../../scripts/harness/ScrollbarThumbDrag.ts).

## Verification

- `node .claude/skills/invariants/scripts/check_invariants.mjs --all --refs` — PASS after the
  current-main merge, 1,129 annotations, 221 lattice links, 0 problems.
- `bun run typecheck` — PASS.
- `bun test src/modules/markdown/MarkdownSplitView.test.ts
  src/modules/markdown/MarkdownPreview.test.ts src/modules/markdown/MarkdownRenderable.test.ts
  src/modules/markdown/MarkdownPlugin.test.ts` — PASS, 31 tests and 105 expectations.
- `bash scripts/smoke-markdown.sh` — ALL-PASS.
- `bun scripts/harness/smoke-markdown-harness.ts` — ALL-PASS.
- `bun scripts/harness/smoke-scrollbars-harness.ts` — ALL-PASS.
- `bash scripts/conventions-gate.sh` — PASS.
- `git diff --check` — PASS.
- Normal pre-commit merge gate — BLOCKED by the reproduced activity-bar timeout quoted in
  [Round 3 merge and gate outcome](#round-3-merge-and-gate-outcome). Panel chrome passed its retry.
  The Markdown and scrollbar gate jobs passed.

## Bycatch

- FIXED in the task commit: the record
  [A scrollable text surface is drag-selectable with edge auto-scroll](../../../../src/modules/ui/ui.invariants.md#a-scrollable-text-surface-is-drag-selectable-with-edge-auto-scroll)
  already governed every scrollable text surface, but `MarkdownSplitView` reassembled preview
  momentum and selection and exposed no shared bars. The addendum put this generator drift in
  scope. Commit `6bfbdc6fd17063ab9c1c236eb39659d5ba3fa858` migrated the preview to the shared
  viewport.
- A default `bun run drive --open` drive of
  [project.invariants.md](../../../../project.invariants.md) with `--geometry 120x40` twice showed
  `Parsing Markdown…` in the settled preview while status already reported
  `markdownParsing=false`. A later input repainted the content. I did not change this unrelated
  status-row paint.
- The ignored worktree dispatch brief linked to the explicit-jump contract with no anchor and with
  a path valid only from the task folder. The invariant checker exposed both faults. I corrected
  the ignored local dispatch copy. It is not part of the branch. The final checker found 0
  problems.
- The round-one pre-commit merge gate saw one starvation-class timeout in the panel-split harness.
  Its one quiet retry passed cleanly, so the fault did not reproduce on the second run. I did not
  change that unrelated harness.
- The current-main normal merge gate saw a reproducible timeout-class red in the activity-bar
  harness. It failed its first attempt and one quiet retry. Panel chrome failed once and passed its
  retry. The exact reproduced failure and preserved log path appear in
  [Round 3 merge and gate outcome](#round-3-merge-and-gate-outcome). I stopped without changing
  either unrelated seam.
